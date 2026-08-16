//! Stuck draw recovery.
//!
//! When the bot crashes (or an RPC/Telegram error interrupts a draw between
//! phases), the on-chain draw is left `is_draw_in_progress` with no one to
//! finish it. Previously this module was a non-functional stub that only
//! logged a warning — a stuck draw halted the protocol permanently
//! (security review H1). This implementation closes that gap with two
//! recovery paths:
//!
//! 1. **Executed but not finalized** (`is_awaiting_finalization`): winning
//!    numbers are already public on-chain. Recovery re-fetches the draw
//!    result account, re-indexes tickets, and submits `finalize_draw`.
//!    If the on-chain `FINALIZATION_DELAY` hasn't elapsed yet, the call
//!    fails and is retried on the next poll — early attempts corrupt nothing
//!    (the on-chain delay check is authoritative).
//!
//! 2. **Committed but never executed**: nothing is public yet. Recovery
//!    attempts the permissionless `advance_draw` to skip the stuck cycle.
//!    If the on-chain advancement timeout hasn't elapsed, the call fails
//!    with `DrawNotReady` and is retried on the next poll.

use super::execute;
use super::finalize;
use super::DrawResult;
use crate::config::{BotConfig, MAIN_FINALIZATION_DELAY, QP_FINALIZATION_DELAY};
use crate::error::Result;
use crate::indexer;
use crate::store::{DrawPhase, Store};
use mazelprotocol::state::LotteryState;
use quickpick::state::QuickPickState;
use solana_client::rpc_client::RpcClient;
use solana_instruction::{AccountMeta, Instruction};
use solana_signature::Signature;
use solana_signer::Signer;
use solana_transaction::Transaction;

fn discriminator(name: &str) -> [u8; 8] {
    use sha2::{Digest, Sha256};
    let mut h = Sha256::new();
    h.update(b"global:");
    h.update(name.as_bytes());
    let mut d = [0u8; 8];
    d.copy_from_slice(&h.finalize()[..8]);
    d
}

/// Send a single-instruction transaction signed by the bot authority.
fn send_ix(rpc: &RpcClient, config: &BotConfig, ix: Instruction) -> Result<Signature> {
    let bh = rpc.get_latest_blockhash()?;
    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&config.authority.pubkey()),
        &[config.authority.as_ref()],
        bh,
    );
    Ok(rpc.send_and_confirm_transaction(&tx)?)
}

/// Fetch the winning numbers (and execution timestamp) of an already-executed
/// draw from its on-chain result account. Errors propagate instead of
/// panicking (review M4).
fn fetch_draw_result(
    rpc: &RpcClient,
    config: &BotConfig,
    draw_id: u64,
    is_qp: bool,
) -> Result<(Vec<u8>, i64)> {
    let (draw_result, _) = if is_qp {
        config.qp_draw_result_pda(draw_id)
    } else {
        config.main_draw_result_pda(draw_id)
    };
    let account = rpc.get_account(&draw_result)?;
    if is_qp {
        let dr: quickpick::state::QuickPickDrawResult = execute::deser_checked(&account.data)?;
        Ok((dr.winning_numbers.to_vec(), dr.timestamp))
    } else {
        let dr: mazelprotocol::state::DrawResult = execute::deser_checked(&account.data)?;
        Ok((dr.winning_numbers.to_vec(), dr.timestamp))
    }
}

pub async fn handle_stuck_main_draw(
    rpc: &RpcClient,
    config: &BotConfig,
    lottery_state: &LotteryState,
    store: &Store,
) -> Result<DrawResult> {
    let draw_id = lottery_state.current_draw_id;

    // Path 1: winning numbers already public — complete the lifecycle.
    if lottery_state.is_awaiting_finalization {
        tracing::warn!(draw_id, "[main] Stuck after execute — re-indexing and finalizing");
        return recover_finalize(rpc, config, draw_id, false, store).await;
    }

    // Path 2: committed but never executed — permissionless advance_draw.
    tracing::warn!(draw_id, "[main] Stuck after commit — attempting advance_draw");
    let (lottery_state_pda, _) = config.main_lottery_state_pda();
    let ix = Instruction {
        program_id: config.main_program_id,
        accounts: vec![
            AccountMeta::new(config.authority.pubkey(), true),
            AccountMeta::new(lottery_state_pda, false),
        ],
        data: discriminator("advance_draw").to_vec(),
    };
    match send_ix(rpc, config, ix) {
        Ok(sig) => {
            tracing::info!(%sig, draw_id, "[main] advance_draw OK — stuck draw skipped");
            let _ = store.clear_draw_state("main");
            Ok(DrawResult { phase: DrawPhase::Idle, draw_id, winning_numbers: None })
        }
        Err(e) => {
            // Too early (DrawNotReady) is expected — retry on next poll.
            tracing::warn!(draw_id, err = %e, "[main] advance_draw not yet available (will retry)");
            Ok(DrawResult { phase: DrawPhase::Error, draw_id, winning_numbers: None })
        }
    }
}

pub async fn handle_stuck_qp_draw(
    rpc: &RpcClient,
    config: &BotConfig,
    qp_state: &QuickPickState,
    store: &Store,
) -> Result<DrawResult> {
    let draw_id = qp_state.current_draw;

    // Path 1: winning numbers already public — complete the lifecycle.
    if qp_state.is_awaiting_finalization {
        tracing::warn!(draw_id, "[quickpick] Stuck after execute — re-indexing and finalizing");
        return recover_finalize(rpc, config, draw_id, true, store).await;
    }

    // Path 2: committed but never executed — permissionless advance_draw.
    tracing::warn!(draw_id, "[quickpick] Stuck after commit — attempting advance_draw");
    let (qp_state_pda, _) = config.qp_state_pda();
    let ix = Instruction {
        program_id: config.qp_program_id,
        accounts: vec![
            AccountMeta::new(config.authority.pubkey(), true),
            AccountMeta::new(qp_state_pda, false),
        ],
        data: discriminator("advance_draw").to_vec(),
    };
    match send_ix(rpc, config, ix) {
        Ok(sig) => {
            tracing::info!(%sig, draw_id, "[quickpick] advance_draw OK — stuck draw skipped");
            let _ = store.clear_draw_state("quickpick");
            Ok(DrawResult { phase: DrawPhase::Idle, draw_id, winning_numbers: None })
        }
        Err(e) => {
            tracing::warn!(draw_id, err = %e, "[quickpick] advance_draw not yet available (will retry)");
            Ok(DrawResult { phase: DrawPhase::Error, draw_id, winning_numbers: None })
        }
    }
}

/// Re-fetch an executed draw's numbers, re-index tickets, and finalize.
async fn recover_finalize(
    rpc: &RpcClient,
    config: &BotConfig,
    draw_id: u64,
    is_qp: bool,
    store: &Store,
) -> Result<DrawResult> {
    let (winning_numbers, timestamp) = fetch_draw_result(rpc, config, draw_id, is_qp)?;
    let program = if is_qp { "quickpick" } else { "main" };

    // Respect the on-chain finalization delay before submitting finalize_draw.
    let delay = if is_qp { QP_FINALIZATION_DELAY } else { MAIN_FINALIZATION_DELAY };
    let now = chrono::Utc::now().timestamp();
    let eligible = timestamp.saturating_add(delay);
    if now < eligible {
        let wait_secs = (eligible - now) as u64;
        tracing::info!(draw_id, wait_secs, "[{}] Recovery: waiting finalization delay", program);
        tokio::time::sleep(std::time::Duration::from_secs(wait_secs)).await;
    }

    if is_qp {
        let ir =
            indexer::index_qp_draw(rpc, &config.qp_program_id, draw_id, &winning_numbers).await?;
        finalize::finalize_qp_draw(
            rpc,
            config,
            draw_id,
            &ir.winner_counts,
            &ir.verification_hash,
            ir.nonce,
        )
        .await?;
    } else {
        let ir = indexer::index_main_draw(rpc, &config.main_program_id, draw_id, &winning_numbers)
            .await?;
        finalize::finalize_main_draw(
            rpc,
            config,
            draw_id,
            &ir.winner_counts,
            &ir.verification_hash,
            ir.nonce,
        )
        .await?;
    }

    tracing::info!(draw_id, "[{}] Recovery finalize_draw OK", program);
    let _ = store.clear_draw_state(program);
    Ok(DrawResult { phase: DrawPhase::Finalized, draw_id, winning_numbers: Some(winning_numbers) })
}
