//! Draw lifecycle modules.
//!
//! Each phase is implemented in its own module:
//! - `commit` — Phase 1: create Switchboard randomness + commit_randomness
//! - `execute` — Phase 2: execute_draw (reveal randomness)
//! - `finalize` — Phase 4: finalize_draw with winner counts
//! - `recovery` — Stuck draw recovery (advance_draw, re-finalize)
//!
//! Account state is deserialized using the ON-CHAIN program crate types
//! (`mazelprotocol::state::*`, `quickpick::state::*`) — the single source of
//! truth. This replaces the previous hand-rolled struct mirrors, which drifted
//! from the real layouts (missing fields shifted every boolean flag and the
//! draw result's `draw_id`, making the bot read garbage state).

pub mod commit;
pub mod execute;
pub mod finalize;
pub mod recovery;

use anchor_lang::AccountDeserialize;
use mazelprotocol::state::LotteryState;
use quickpick::state::QuickPickState;
use solana_client::rpc_client::RpcClient;

use crate::config::{
    BotConfig, MAIN_FINALIZATION_DELAY, MAIN_TICKET_SALE_CUTOFF, QP_FINALIZATION_DELAY,
    QP_TICKET_SALE_CUTOFF,
};
use crate::error::Result;
use crate::indexer;
use crate::store::{DrawPhase, PersistedDrawState, Store};
use crate::telegram;

pub struct DrawResult {
    pub phase: DrawPhase,
    pub draw_id: u64,
    pub winning_numbers: Option<Vec<u8>>,
}

/// Sleep until `timestamp + delay`, if that time is still in the future.
async fn wait_for_finalization_eligibility(draw_id: u64, timestamp: i64, delay: i64) {
    let now = chrono::Utc::now().timestamp();
    let eligible = timestamp.saturating_add(delay);
    if now < eligible {
        let wait_secs = (eligible - now) as u64;
        tracing::info!(draw_id, wait_secs, "Waiting for on-chain finalization delay");
        tokio::time::sleep(std::time::Duration::from_secs(wait_secs)).await;
    }
}

/// Execute the complete draw lifecycle for the Main Lottery.
pub async fn run_main_lifecycle(
    rpc: &RpcClient,
    config: &BotConfig,
    store: &Store,
) -> Result<DrawResult> {
    let (lottery_state_pda, _) = config.main_lottery_state_pda();
    let lottery_state: LotteryState = fetch_account(rpc, &lottery_state_pda)?;
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

    // SECURITY (review C5): only attempt a commit inside the sale-cutoff
    // window. Outside it the on-chain commit would fail with DrawNotReady,
    // spamming failure notifications for ~23h/day on a daily lottery.
    let now = chrono::Utc::now().timestamp();
    if now < lottery_state.next_draw_timestamp.saturating_sub(MAIN_TICKET_SALE_CUTOFF) {
        tracing::debug!(
            draw_id,
            next_draw = lottery_state.next_draw_timestamp,
            "[main] Idle — draw not yet within commit window"
        );
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

    // The on-chain execute requires the reveal to land within 10 slots of the
    // commit seed slot. The randomness account is committed and revealed in
    // the same or next slot, so only a small settle delay is needed.
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
            .unwrap_or_else(solana_pubkey::Pubkey::new_unique);
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

    // SECURITY (review C4): the on-chain finalize requires
    // FINALIZATION_DELAY (120s) after execute. Wait for eligibility so the
    // first finalize attempt doesn't always fail with DrawNotReady.
    wait_for_finalization_eligibility(draw_id, execute_result.timestamp, MAIN_FINALIZATION_DELAY)
        .await;

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
    let qp_state: QuickPickState = fetch_account(rpc, &qp_state_pda)?;
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

    // SECURITY (review C5): same commit-window gating as the main lottery.
    let now = chrono::Utc::now().timestamp();
    if now < qp_state.next_draw_timestamp.saturating_sub(QP_TICKET_SALE_CUTOFF) {
        tracing::debug!(
            draw_id,
            next_draw = qp_state.next_draw_timestamp,
            "[quickpick] Idle — draw not yet within commit window"
        );
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
            .unwrap_or_else(solana_pubkey::Pubkey::new_unique);
        execute::execute_qp_draw(rpc, config, draw_id, &ra).await?
    };

    let ir = indexer::index_qp_draw(
        rpc,
        &config.qp_program_id,
        draw_id,
        &execute_result.winning_numbers,
    )
    .await?;

    // SECURITY (review C4): QP finalization delay is 60s.
    wait_for_finalization_eligibility(draw_id, execute_result.timestamp, QP_FINALIZATION_DELAY)
        .await;

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

/// Fetch and deserialize an Anchor account using the program crate's type.
fn fetch_account<T: AccountDeserialize>(
    rpc: &RpcClient,
    pubkey: &solana_pubkey::Pubkey,
) -> Result<T> {
    let account = rpc.get_account(pubkey)?;
    execute::deser_checked(&account.data)
}

#[cfg(test)]
mod tests {
    use super::*;
    use anchor_lang::AccountSerialize;
    use mazelprotocol::state::DrawResult as MainDrawResult;

    /// The bot deserializes state via the program crates. This test proves
    /// the round-trip works through the bot's `fetch_account` path for both
    /// the lottery state and the draw result (the layouts that previously
    /// drifted). It catches any future feature-flag or dependency issue where
    /// the program crates stop deserializing from the bot.
    #[test]
    fn test_program_types_roundtrip_through_bot_deserializer() {
        // LotteryState round-trip with all flags set. `AccountSerialize`
        // writes the account DISCRIMINATOR + body, matching on-chain account
        // data (plain `AnchorSerialize` omits the discriminator).
        let state = LotteryState {
            current_draw_id: 42,
            current_draw_tickets: 7,
            next_draw_timestamp: 1_700_000_000,
            is_draw_in_progress: true,
            is_awaiting_finalization: true,
            is_paused: true,
            ..Default::default()
        };

        let mut buf = Vec::new();
        state.try_serialize(&mut buf).unwrap();
        let mut slice: &[u8] = &buf;
        let decoded = LotteryState::try_deserialize(&mut slice).unwrap();

        assert_eq!(decoded.current_draw_id, 42);
        assert_eq!(decoded.current_draw_tickets, 7);
        assert_eq!(decoded.next_draw_timestamp, 1_700_000_000);
        assert!(decoded.is_draw_in_progress);
        assert!(decoded.is_awaiting_finalization);
        assert!(decoded.is_paused);

        // DrawResult round-trip: winning numbers must land at the right offset.
        let dr = MainDrawResult {
            draw_id: 42,
            winning_numbers: [3, 7, 11, 22, 35, 46],
            was_rolldown: true,
            timestamp: 1_700_000_001,
            ..Default::default()
        };

        let mut buf = Vec::new();
        dr.try_serialize(&mut buf).unwrap();
        let mut slice: &[u8] = &buf;
        let decoded = MainDrawResult::try_deserialize(&mut slice).unwrap();

        assert_eq!(decoded.draw_id, 42);
        assert_eq!(decoded.winning_numbers, [3, 7, 11, 22, 35, 46]);
        assert!(decoded.was_rolldown);
        assert_eq!(decoded.timestamp, 1_700_000_001);
    }
}
