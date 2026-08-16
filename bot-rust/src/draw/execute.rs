//! Phase 2: Execute draw.
//!
//! Deserializes the draw result using the ON-CHAIN program types
//! (`mazelprotocol::state::DrawResult` / `quickpick::state::QuickPickDrawResult`)
//! so the bot can never read misaligned fields.

use crate::config::BotConfig;
use crate::error::{BotError, Result};
use anchor_lang::AccountDeserialize;
use mazelprotocol::state::DrawResult;
use quickpick::state::QuickPickDrawResult;
use solana_client::rpc_client::RpcClient;
use solana_instruction::Instruction;
use solana_pubkey::Pubkey;
use solana_signature::Signature;
use solana_signer::Signer;
use solana_system_interface::program as system_program;
use solana_transaction::Transaction;

pub struct ExecuteResult {
    pub signature: Signature,
    pub winning_numbers: Vec<u8>,
    pub was_rolldown: bool,
    pub timestamp: i64,
}

/// Deserialize an Anchor account payload using the program crate's types,
/// returning a typed error instead of panicking (review M4).
pub fn deser_checked<T: AccountDeserialize>(data: &[u8]) -> Result<T> {
    let mut slice: &[u8] = data;
    T::try_deserialize(&mut slice)
        .map_err(|e| BotError::Draw(format!("deserialize account data: {e}")))
}

pub async fn execute_main_draw(
    rpc: &RpcClient,
    config: &BotConfig,
    draw_id: u64,
    randomness_account: &Pubkey,
) -> Result<ExecuteResult> {
    let (lottery_state, _) = config.main_lottery_state_pda();
    let (draw_result, _) = config.main_draw_result_pda(draw_id);

    let accounts = vec![
        meta(config.authority.pubkey(), true, false),
        meta(lottery_state, false, true),
        meta(draw_result, false, true),
        meta(*randomness_account, false, false),
        meta(config.authority.pubkey(), true, true),
        meta(system_program::id(), false, false),
    ];

    let ix = Instruction {
        program_id: config.main_program_id,
        accounts,
        data: discriminator("execute_draw").to_vec(),
    };

    let bh = rpc.get_latest_blockhash()?;
    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&config.authority.pubkey()),
        &[config.authority.as_ref()],
        bh,
    );

    let sig = rpc.send_and_confirm_transaction(&tx)?;

    let account = rpc.get_account(&draw_result)?;
    let dr: DrawResult = deser_checked(&account.data)?;
    if dr.draw_id != draw_id {
        return Err(BotError::Draw(format!(
            "DrawResult draw_id mismatch: expected {draw_id}, got {}",
            dr.draw_id
        )));
    }
    Ok(ExecuteResult {
        signature: sig,
        winning_numbers: dr.winning_numbers.to_vec(),
        was_rolldown: dr.was_rolldown,
        timestamp: dr.timestamp,
    })
}

pub async fn execute_qp_draw(
    rpc: &RpcClient,
    config: &BotConfig,
    draw_id: u64,
    randomness_account: &Pubkey,
) -> Result<ExecuteResult> {
    let (qp_state, _) = config.qp_state_pda();
    let (lottery_state, _) = config.main_lottery_state_pda();
    let (draw_result, _) = config.qp_draw_result_pda(draw_id);

    let accounts = vec![
        meta(config.authority.pubkey(), true, false),
        meta(lottery_state, false, false),
        meta(qp_state, false, true),
        meta(draw_result, false, true),
        meta(*randomness_account, false, false),
        meta(config.authority.pubkey(), true, true),
        meta(system_program::id(), false, false),
    ];

    let ix = Instruction {
        program_id: config.qp_program_id,
        accounts,
        data: discriminator("execute_draw").to_vec(),
    };

    let bh = rpc.get_latest_blockhash()?;
    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&config.authority.pubkey()),
        &[config.authority.as_ref()],
        bh,
    );

    let sig = rpc.send_and_confirm_transaction(&tx)?;

    let account = rpc.get_account(&draw_result)?;
    let dr: QuickPickDrawResult = deser_checked(&account.data)?;
    if dr.draw_id != draw_id {
        return Err(BotError::Draw(format!(
            "QuickPickDrawResult draw_id mismatch: expected {draw_id}, got {}",
            dr.draw_id
        )));
    }
    Ok(ExecuteResult {
        signature: sig,
        winning_numbers: dr.winning_numbers.to_vec(),
        was_rolldown: dr.was_rolldown,
        timestamp: dr.timestamp,
    })
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
