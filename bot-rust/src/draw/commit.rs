//! Phase 1: Commit randomness.

use crate::config::BotConfig;
use crate::error::Result;
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    instruction::Instruction,
    pubkey::Pubkey,
    signature::{Keypair, Signature},
    signer::Signer,
    system_program,
    transaction::Transaction,
};

pub struct CommitResult {
    pub signature: Signature,
    pub randomness_account: Pubkey,
    pub commit_slot: u64,
}

pub async fn commit_main_randomness(rpc: &RpcClient, config: &BotConfig) -> Result<CommitResult> {
    let randomness_keypair = Keypair::new();
    let ra = randomness_keypair.pubkey();
    let (lottery_state, _) = config.main_lottery_state_pda();

    let accounts = vec![
        meta(config.authority.pubkey(), true, true),
        meta(lottery_state, false, true),
        meta(ra, true, true),
        meta(config.switchboard_queue, false, false),
        meta(system_program::id(), false, false),
    ];

    let ix = Instruction {
        program_id: config.main_program_id,
        accounts,
        data: discriminator("commit_randomness").to_vec(),
    };

    let bh = rpc.get_latest_blockhash()?;
    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&config.authority.pubkey()),
        &[&config.authority, &randomness_keypair],
        bh,
    );

    let sig = rpc.send_and_confirm_transaction(&tx)?;
    Ok(CommitResult { signature: sig, randomness_account: ra, commit_slot: 0 })
}

pub async fn commit_qp_randomness(rpc: &RpcClient, config: &BotConfig) -> Result<CommitResult> {
    let randomness_keypair = Keypair::new();
    let ra = randomness_keypair.pubkey();
    let (qp_state, _) = config.qp_state_pda();
    let (lottery_state, _) = config.main_lottery_state_pda();

    let accounts = vec![
        meta(config.authority.pubkey(), true, true),
        meta(lottery_state, false, true),
        meta(qp_state, false, true),
        meta(ra, true, true),
        meta(config.switchboard_queue, false, false),
        meta(system_program::id(), false, false),
    ];

    let ix = Instruction {
        program_id: config.qp_program_id,
        accounts,
        data: discriminator("commit_randomness").to_vec(),
    };

    let bh = rpc.get_latest_blockhash()?;
    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&config.authority.pubkey()),
        &[&config.authority, &randomness_keypair],
        bh,
    );

    let sig = rpc.send_and_confirm_transaction(&tx)?;
    Ok(CommitResult { signature: sig, randomness_account: ra, commit_slot: 0 })
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

fn meta(
    pubkey: Pubkey,
    is_signer: bool,
    is_writable: bool,
) -> solana_sdk::instruction::AccountMeta {
    solana_sdk::instruction::AccountMeta { pubkey, is_signer, is_writable }
}
