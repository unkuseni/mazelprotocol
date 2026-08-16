//! Phase 1: Commit randomness.
//!
//! The on-chain `commit_randomness` handlers require a REAL Switchboard
//! randomness account that is fresh (seed_slot within the last 10 slots) and
//! not yet revealed. This module implements the full client flow:
//!
//! 1. Fetch the Switchboard queue account and pick the oracle assigned for
//!    this round (queue.oracle_keys[curr_idx % oracle_keys_len]).
//! 2. Create the randomness account (payer = bot authority, owner =
//!    Switchboard on-demand program).
//! 3. Call Switchboard's `randomness_commit` to seed it from the current
//!    slot hash.
//! 4. Call the lottery's `commit_randomness` — all three instructions go in
//!    ONE transaction so the lottery commit observes a fresh, un-revealed
//!    account in the same slot.
//!
//! After this, Switchboard's oracle reveals the value (typically within a few
//! slots); the execute phase then reveals it on-chain via `execute_draw`.
//!
//! NOTE: the switchboard-on-demand crate is used WITHOUT its `client` feature
//! (the client feature pulls full solana-sdk/openssl). The randomness account
//! structs are bytemuck pods in the base crate, and the single
//! `randomness_commit` instruction is built manually from its documented
//! layout (see the vendored crate source
//! `switchboard-on-demand/src/on_demand/instructions/randomness_commit.rs`).

use crate::config::BotConfig;
use crate::error::{BotError, Result};
use solana_client::rpc_client::RpcClient;
use solana_instruction::Instruction;
use solana_keypair::Keypair;
use solana_program::sysvar::slot_hashes;
use solana_pubkey::Pubkey;
use solana_signature::Signature;
use solana_signer::Signer;
use solana_system_interface::program as system_program;
use solana_transaction::Transaction;
use switchboard_on_demand::on_demand::accounts::{QueueAccountData, RandomnessAccountData};
use switchboard_on_demand::program_id::{ON_DEMAND_DEVNET_PID, ON_DEMAND_MAINNET_PID};

pub struct CommitResult {
    pub signature: Signature,
    pub randomness_account: Pubkey,
    pub commit_slot: u64,
}

/// Switchboard on-demand program id for the configured network.
fn sb_program_id(config: &BotConfig) -> Pubkey {
    if config.switchboard_env == "devnet" {
        ON_DEMAND_DEVNET_PID
    } else {
        ON_DEMAND_MAINNET_PID
    }
}

/// Fetch and parse the Switchboard queue account.
fn fetch_queue_data(rpc: &RpcClient, queue: &Pubkey) -> Result<QueueAccountData> {
    let account = rpc
        .get_account(queue)
        .map_err(|e| BotError::Draw(format!("Switchboard queue {queue} not found: {e}")))?;
    let size = std::mem::size_of::<QueueAccountData>();
    if account.data.len() < 8 + size {
        return Err(BotError::Draw(format!(
            "Switchboard queue account too small: {} bytes (expected {})",
            account.data.len(),
            8 + size
        )));
    }
    // pod_read_unaligned: RPC account data is a Vec<u8> with alignment 1, so
    // bytemuck::from_bytes would be UB on misaligned slices.
    Ok(bytemuck::pod_read_unaligned::<QueueAccountData>(&account.data[8..8 + size]))
}

/// Pick the oracle assigned for this round (round-robin via queue.curr_idx).
fn pick_oracle(queue: &QueueAccountData) -> Result<Pubkey> {
    let len = queue.oracle_keys_len as usize;
    if len == 0 {
        return Err(BotError::Draw(
            "Switchboard queue has no oracles (oracle_keys_len == 0)".into(),
        ));
    }
    if len > queue.oracle_keys.len() {
        return Err(BotError::Draw(format!(
            "Switchboard queue oracle_keys_len ({len}) exceeds array capacity ({})",
            queue.oracle_keys.len()
        )));
    }
    let idx = (queue.curr_idx as usize) % len;
    let oracle = queue.oracle_keys[idx];
    if oracle == Pubkey::default() {
        return Err(BotError::Draw(format!(
            "Switchboard queue oracle at index {idx} is the zero pubkey"
        )));
    }
    Ok(oracle)
}

/// Build the Switchboard `randomness_commit` instruction.
///
/// Layout (from the vendored switchboard-on-demand 0.11.3 source):
/// - discriminator: [52, 170, 152, 201, 179, 133, 242, 141] (no params)
/// - accounts: randomness(w), queue(ro), oracle(w), recent_slothashes(ro),
///   authority(ro, signer)
fn build_randomness_commit_ix(
    config: &BotConfig,
    randomness: Pubkey,
    oracle: Pubkey,
) -> Instruction {
    Instruction {
        program_id: sb_program_id(config),
        accounts: vec![
            solana_instruction::AccountMeta::new(randomness, false),
            solana_instruction::AccountMeta::new_readonly(config.switchboard_queue, false),
            solana_instruction::AccountMeta::new(oracle, false),
            solana_instruction::AccountMeta::new_readonly(slot_hashes::ID, false),
            solana_instruction::AccountMeta::new_readonly(config.authority.pubkey(), true),
        ],
        data: vec![52, 170, 152, 201, 179, 133, 242, 141],
    }
}

/// Build the system-program create-account instruction for the randomness
/// account owned by the Switchboard on-demand program.
fn build_create_randomness_account_ix(
    rpc: &RpcClient,
    config: &BotConfig,
    randomness: Pubkey,
) -> Result<Instruction> {
    let size = RandomnessAccountData::size() as u64;
    let lamports = rpc.get_minimum_balance_for_rent_exemption(size as usize)?;
    let owner = sb_program_id(config);

    // system_instruction::create_account layout:
    // [0u32 LE, lamports u64 LE, space u64 LE, owner 32 bytes]
    let mut data = Vec::with_capacity(4 + 8 + 8 + 32);
    data.extend_from_slice(&0u32.to_le_bytes());
    data.extend_from_slice(&lamports.to_le_bytes());
    data.extend_from_slice(&size.to_le_bytes());
    data.extend_from_slice(owner.as_ref());

    Ok(Instruction {
        program_id: system_program::id(),
        accounts: vec![
            solana_instruction::AccountMeta::new(config.authority.pubkey(), true),
            solana_instruction::AccountMeta::new(randomness, true),
        ],
        data,
    })
}

/// Build the lottery commit_randomness instruction.
fn build_lottery_commit_ix(config: &BotConfig, randomness: Pubkey, is_qp: bool) -> Instruction {
    let (lottery_state, _) = config.main_lottery_state_pda();
    let accounts = if is_qp {
        let (qp_state, _) = config.qp_state_pda();
        vec![
            meta(config.authority.pubkey(), true, false),
            meta(lottery_state, false, false),
            meta(qp_state, false, true),
            meta(randomness, false, false),
        ]
    } else {
        vec![
            meta(config.authority.pubkey(), true, true),
            meta(lottery_state, false, true),
            meta(randomness, true, true),
            meta(config.switchboard_queue, false, false),
            meta(system_program::id(), false, false),
        ]
    };

    Instruction {
        program_id: if is_qp { config.qp_program_id } else { config.main_program_id },
        accounts,
        data: discriminator("commit_randomness").to_vec(),
    }
}

/// Read the committed seed_slot from the (already created) randomness account.
fn fetch_committed_seed_slot(rpc: &RpcClient, randomness: Pubkey) -> Result<u64> {
    let account = rpc.get_account(&randomness)?;
    let size = std::mem::size_of::<RandomnessAccountData>();
    if account.data.len() < 8 + size {
        return Err(BotError::Draw(format!(
            "Randomness account too small: {} bytes (expected {})",
            account.data.len(),
            8 + size
        )));
    }
    let data: RandomnessAccountData = bytemuck::pod_read_unaligned(&account.data[8..8 + size]);
    Ok(data.seed_slot)
}

/// Commit randomness for the Main Lottery: create the Switchboard randomness
/// account, seed it via `randomness_commit`, and call the lottery's
/// `commit_randomness` — all in a single transaction.
pub async fn commit_main_randomness(rpc: &RpcClient, config: &BotConfig) -> Result<CommitResult> {
    let randomness_keypair = Keypair::new();
    let ra = randomness_keypair.pubkey();

    let queue_data = fetch_queue_data(rpc, &config.switchboard_queue)?;
    let oracle = pick_oracle(&queue_data)?;

    let create_ix = build_create_randomness_account_ix(rpc, config, ra)?;
    let sb_commit_ix = build_randomness_commit_ix(config, ra, oracle);
    let lottery_ix = build_lottery_commit_ix(config, ra, false);

    let bh = rpc.get_latest_blockhash()?;
    let tx = Transaction::new_signed_with_payer(
        &[create_ix, sb_commit_ix, lottery_ix],
        Some(&config.authority.pubkey()),
        &[config.authority.as_ref(), &randomness_keypair],
        bh,
    );

    let sig = rpc.send_and_confirm_transaction(&tx)?;
    let commit_slot = fetch_committed_seed_slot(rpc, ra).unwrap_or(0);

    tracing::info!(
        oracle = %oracle,
        seed_slot = commit_slot,
        "[main] randomness committed"
    );

    Ok(CommitResult { signature: sig, randomness_account: ra, commit_slot })
}

/// Commit randomness for Quick Pick Express (same Switchboard flow, QP commit).
pub async fn commit_qp_randomness(rpc: &RpcClient, config: &BotConfig) -> Result<CommitResult> {
    let randomness_keypair = Keypair::new();
    let ra = randomness_keypair.pubkey();

    let queue_data = fetch_queue_data(rpc, &config.switchboard_queue)?;
    let oracle = pick_oracle(&queue_data)?;

    let create_ix = build_create_randomness_account_ix(rpc, config, ra)?;
    let sb_commit_ix = build_randomness_commit_ix(config, ra, oracle);
    let lottery_ix = build_lottery_commit_ix(config, ra, true);

    let bh = rpc.get_latest_blockhash()?;
    let tx = Transaction::new_signed_with_payer(
        &[create_ix, sb_commit_ix, lottery_ix],
        Some(&config.authority.pubkey()),
        &[config.authority.as_ref(), &randomness_keypair],
        bh,
    );

    let sig = rpc.send_and_confirm_transaction(&tx)?;
    let commit_slot = fetch_committed_seed_slot(rpc, ra).unwrap_or(0);

    tracing::info!(
        oracle = %oracle,
        seed_slot = commit_slot,
        "[quickpick] randomness committed"
    );

    Ok(CommitResult { signature: sig, randomness_account: ra, commit_slot })
}

fn discriminator(name: &str) -> [u8; 8] {
    use sha2::{Digest, Sha256};
    let mut h = Sha256::new();
    h.update(b"global:");
    h.update(name.as_bytes());
    let mut d = [0u8; 8];
    d.copy_from_slice(&h.finalize()[..8]);
    d
}

fn meta(pubkey: Pubkey, is_signer: bool, is_writable: bool) -> solana_instruction::AccountMeta {
    solana_instruction::AccountMeta { pubkey, is_signer, is_writable }
}
