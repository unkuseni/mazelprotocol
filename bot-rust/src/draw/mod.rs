//! Draw lifecycle modules.
//!
//! Each phase is implemented in its own module:
//! - `commit` — Phase 1: create randomness account + commit_randomness
//! - `execute` — Phase 2: execute_draw (reveal randomness)
//! - `finalize` — Phase 4: finalize_draw with winner counts
//! - `recovery` — Stuck draw recovery (advance_draw, force_finalize)

pub mod commit;
pub mod execute;
pub mod finalize;
pub mod recovery;

use solana_client::rpc_client::RpcClient;

use crate::config::BotConfig;
use crate::error::Result;
use crate::indexer;
use crate::store::{DrawPhase, PersistedDrawState, Store};
use crate::telegram;

pub struct DrawResult {
    pub phase: DrawPhase,
    pub draw_id: u64,
    pub winning_numbers: Option<Vec<u8>>,
}

/// Execute the complete draw lifecycle for the Main Lottery.
pub async fn run_main_lifecycle(
    rpc: &RpcClient,
    config: &BotConfig,
    store: &Store,
) -> Result<DrawResult> {
    let (lottery_state_pda, _) = config.main_lottery_state_pda();
    let lottery_state: LotteryStateData = fetch_account(rpc, &lottery_state_pda)?;
    let draw_id = lottery_state.current_draw_id;

    tracing::info!(
        draw_id,
        tickets = lottery_state.current_draw_tickets,
        "[main] Starting draw lifecycle"
    );

    if lottery_state.is_draw_in_progress {
        return recovery::handle_stuck_main_draw(rpc, config, &lottery_state, store).await;
    }
    if lottery_state.is_paused {
        tracing::info!(draw_id, "[main] Paused — skipping");
        return Ok(DrawResult { phase: DrawPhase::Idle, draw_id, winning_numbers: None });
    }

    // ---- Phase 1: COMMIT ----
    let commit_result = if config.dry_run {
        tracing::info!("[main] DRY RUN: commit_randomness");
        None
    } else {
        let r = commit::commit_main_randomness(rpc, config).await?;
        tracing::info!(sig = %r.signature, rand = %r.randomness_account, "[main] commit_randomness OK");
        Some(r)
    };

    if let Some(ref cr) = commit_result {
        store.save_draw_state(&PersistedDrawState {
            program: "main".into(),
            draw_id,
            phase: DrawPhase::Committed,
            commit_slot: Some(cr.commit_slot),
            commit_timestamp: Some(chrono::Utc::now().timestamp()),
            randomness_account: Some(cr.randomness_account.to_string()),
            winning_numbers: None,
            indexer_result: None,
            error_count: 0,
            last_error: None,
            last_attempt_timestamp: None,
        })?;
    }

    tokio::time::sleep(std::time::Duration::from_millis(config.commit_execute_delay_ms)).await;

    // ---- Phase 2: EXECUTE ----
    let execute_result = if config.dry_run {
        return Ok(DrawResult {
            phase: DrawPhase::Executed,
            draw_id,
            winning_numbers: Some(vec![1, 2, 3, 4, 5, 6]),
        });
    } else {
        let ra = commit_result
            .as_ref()
            .map(|cr| cr.randomness_account)
            .unwrap_or_else(solana_sdk::pubkey::Pubkey::new_unique);
        let r = execute::execute_main_draw(rpc, config, draw_id, &ra).await?;
        tracing::info!(sig = %r.signature, nums = ?r.winning_numbers, "[main] execute_draw OK");
        r
    };

    store.save_draw_state(&PersistedDrawState {
        program: "main".into(),
        draw_id,
        phase: DrawPhase::Executed,
        commit_slot: commit_result.as_ref().map(|c| c.commit_slot),
        commit_timestamp: None,
        randomness_account: commit_result.as_ref().map(|c| c.randomness_account.to_string()),
        winning_numbers: Some(execute_result.winning_numbers.clone()),
        indexer_result: None,
        error_count: 0,
        last_error: None,
        last_attempt_timestamp: None,
    })?;

    // ---- Phase 3: INDEX ----
    let ir = indexer::index_main_draw(
        rpc,
        &config.main_program_id,
        draw_id,
        &execute_result.winning_numbers,
    )
    .await?;
    tracing::info!(draw_id, total = ir.total_tickets_scanned, ?ir.winner_counts, "[main] Indexed");

    // ---- Phase 4: FINALIZE ----
    if !config.dry_run {
        let fr = finalize::finalize_main_draw(
            rpc,
            config,
            draw_id,
            &ir.winner_counts,
            &ir.verification_hash,
            ir.nonce,
        )
        .await?;
        tracing::info!(sig = %fr.signature, "[main] finalize_draw OK");
    }

    store.clear_draw_state("main")?;
    let _ = telegram::notify_draw_complete(
        &config.telegram_bot_token,
        &config.telegram_chat_id,
        "main",
        draw_id,
        &execute_result.winning_numbers,
    )
    .await;

    Ok(DrawResult {
        phase: DrawPhase::Finalized,
        draw_id,
        winning_numbers: Some(execute_result.winning_numbers),
    })
}

/// Execute the complete draw lifecycle for Quick Pick Express.
pub async fn run_qp_lifecycle(
    rpc: &RpcClient,
    config: &BotConfig,
    store: &Store,
) -> Result<DrawResult> {
    let (qp_state_pda, _) = config.qp_state_pda();
    let qp_state: QpStateData = fetch_account(rpc, &qp_state_pda)?;
    let draw_id = qp_state.current_draw;

    tracing::info!(
        draw_id,
        tickets = qp_state.current_draw_tickets,
        "[quickpick] Starting draw lifecycle"
    );

    if qp_state.is_draw_in_progress {
        return recovery::handle_stuck_qp_draw(rpc, config, &qp_state, store).await;
    }
    if qp_state.is_paused {
        return Ok(DrawResult { phase: DrawPhase::Idle, draw_id, winning_numbers: None });
    }

    let commit_result = if config.dry_run {
        None
    } else {
        let r = commit::commit_qp_randomness(rpc, config).await?;
        tracing::info!(sig = %r.signature, "[quickpick] commit_randomness OK");
        Some(r)
    };

    if let Some(ref cr) = commit_result {
        store.save_draw_state(&PersistedDrawState {
            program: "quickpick".into(),
            draw_id,
            phase: DrawPhase::Committed,
            commit_slot: Some(cr.commit_slot),
            commit_timestamp: Some(chrono::Utc::now().timestamp()),
            randomness_account: Some(cr.randomness_account.to_string()),
            winning_numbers: None,
            indexer_result: None,
            error_count: 0,
            last_error: None,
            last_attempt_timestamp: None,
        })?;
    }

    tokio::time::sleep(std::time::Duration::from_millis(config.commit_execute_delay_ms)).await;

    let execute_result = if config.dry_run {
        return Ok(DrawResult {
            phase: DrawPhase::Executed,
            draw_id,
            winning_numbers: Some(vec![1, 2, 3, 4, 5]),
        });
    } else {
        let ra = commit_result
            .as_ref()
            .map(|cr| cr.randomness_account)
            .unwrap_or_else(solana_sdk::pubkey::Pubkey::new_unique);
        execute::execute_qp_draw(rpc, config, draw_id, &ra).await?
    };

    let ir = indexer::index_qp_draw(
        rpc,
        &config.qp_program_id,
        draw_id,
        &execute_result.winning_numbers,
    )
    .await?;

    if !config.dry_run {
        finalize::finalize_qp_draw(
            rpc,
            config,
            draw_id,
            &ir.winner_counts,
            &ir.verification_hash,
            ir.nonce,
        )
        .await?;
    }

    store.clear_draw_state("quickpick")?;
    let _ = telegram::notify_draw_complete(
        &config.telegram_bot_token,
        &config.telegram_chat_id,
        "quickpick",
        draw_id,
        &execute_result.winning_numbers,
    )
    .await;

    Ok(DrawResult {
        phase: DrawPhase::Finalized,
        draw_id,
        winning_numbers: Some(execute_result.winning_numbers),
    })
}

// ---------------------------------------------------------------------------
// Account data structs
// ---------------------------------------------------------------------------

#[derive(anchor_lang::AnchorDeserialize, Debug)]
pub struct LotteryStateData {
    // 8-byte Anchor account discriminator (must be skipped — account data
    // starts with sha256("account:LotteryState")[..8]).
    _discriminator: [u8; 8],
    pub authority: solana_sdk::pubkey::Pubkey,
    // pending_authority: Option<Pubkey> = 1-byte tag + 32-byte pubkey (33 bytes)
    _pending_authority: [u8; 33],
    _switchboard_queue: anchor_lang::prelude::Pubkey,
    _current_randomness_account: anchor_lang::prelude::Pubkey,
    pub current_draw_id: u64,
    _pad1: u64,
    _pad2: u64,
    _pad3: u64,
    _pad4: u64,
    _pad5: u64,
    _pad6: u16,
    _pad7: u64,
    _pad8: u64,
    _pad9: u64,
    _pad10: u64,
    _pad11: i64,
    _pad12: i64,
    _pad13: u64,
    _pad14: i64,
    pub current_draw_tickets: u64,
    _pad15: u64,
    pub is_draw_in_progress: bool,
    // SECURITY (review H1): expose this flag so recovery can distinguish
    // "committed but never executed" (numbers not public → advance_draw)
    // from "executed but not finalized" (numbers public → re-index + finalize).
    pub is_awaiting_finalization: bool,
    _pad17: bool,
    pub is_paused: bool,
    _pad18: bool,
    _pad19: u8,
    _pad20: u8,
}

#[derive(anchor_lang::AnchorDeserialize, Debug)]
pub struct QpStateData {
    // 8-byte Anchor account discriminator (must be skipped).
    _discriminator: [u8; 8],
    pub current_draw: u64,
    _pad0: u64,
    _pad1: u8,
    _pad2: u8,
    _pad3: u16,
    _pad4: i64,
    _pad5: i64,
    _pad6: u64,
    _pad7: u64,
    _pad8: u64,
    _pad9: u64,
    _pad10: u64,
    _pad11: u64,
    pub current_draw_tickets: u64,
    _pad12: u64,
    _pad13: u64,
    _pad14: u64,
    _pad15: u64,
    _pad16: u64,
    _pad17: anchor_lang::prelude::Pubkey,
    _pad18: u64,
    _pad19: i64,
    pub is_draw_in_progress: bool,
    // SECURITY (review H1): same as LotteryStateData — distinguishes
    // "committed but never executed" from "executed but not finalized".
    pub is_awaiting_finalization: bool,
    _pad21: bool,
    pub is_paused: bool,
    _pad22: bool,
    _pad23: u8,
}

/// Fetch and deserialize an Anchor account.
fn fetch_account<T: anchor_lang::AnchorDeserialize>(
    rpc: &RpcClient,
    pubkey: &solana_sdk::pubkey::Pubkey,
) -> Result<T> {
    let account = rpc.get_account(pubkey)?;
    let mut data: &[u8] = &account.data;
    T::deserialize(&mut data).map_err(|e| crate::error::BotError::AnchorLang(e))
}
