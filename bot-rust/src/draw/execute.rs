//! Phase 2: Execute draw.

use crate::config::BotConfig;
use crate::error::Result;
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    instruction::Instruction, pubkey::Pubkey, signature::Signature, signer::Signer, system_program,
    transaction::Transaction,
};

pub struct ExecuteResult {
    pub signature: Signature,
    pub winning_numbers: Vec<u8>,
    pub was_rolldown: bool,
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
        &[&config.authority],
        bh,
    );

    let sig = rpc.send_and_confirm_transaction(&tx)?;

    let account = rpc.get_account(&draw_result)?;
    let dr: DrawResultData = deser_checked(&account.data)?;
    Ok(ExecuteResult {
        signature: sig,
        winning_numbers: dr.winning_numbers[..6].to_vec(),
        was_rolldown: dr.was_rolldown,
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
        &[&config.authority],
        bh,
    );

    let sig = rpc.send_and_confirm_transaction(&tx)?;

    let account = rpc.get_account(&draw_result)?;
    let dr: QpDrawResultData = deser_checked(&account.data)?;
    Ok(ExecuteResult {
        signature: sig,
        winning_numbers: dr.winning_numbers[..5].to_vec(),
        was_rolldown: dr.was_rolldown,
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

fn meta(
    pubkey: Pubkey,
    is_signer: bool,
    is_writable: bool,
) -> solana_sdk::instruction::AccountMeta {
    solana_sdk::instruction::AccountMeta { pubkey, is_signer, is_writable }
}

/// Deserialize an Anchor account payload, returning a typed error instead of
/// panicking. SECURITY (review M4): the previous version called `.unwrap()` on
/// RPC-derived account data; a missing/short/malformed account (RPC error,
/// bad node) panicked inside the cron task and killed the entire bot.
pub fn deser_checked<T: anchor_lang::AnchorDeserialize>(data: &[u8]) -> Result<T> {
    let mut slice: &[u8] = data;
    T::deserialize(&mut slice)
        .map_err(|e| crate::error::BotError::Draw(format!("deserialize account data: {e}")))
}

#[derive(anchor_lang::AnchorDeserialize)]
pub struct DrawResultData {
    // 8-byte Anchor account discriminator
    _pad0: u64,
    pub winning_numbers: [u8; 6],
    _pad1: [u8; 32],
    _pad2: i64,
    _pad3: u64,
    pub was_rolldown: bool,
}

#[derive(anchor_lang::AnchorDeserialize)]
pub struct QpDrawResultData {
    // 8-byte Anchor account discriminator
    _pad0: u64,
    pub winning_numbers: [u8; 5],
    _pad1: [u8; 32],
    _pad2: i64,
    _pad3: u64,
    pub was_rolldown: bool,
}
