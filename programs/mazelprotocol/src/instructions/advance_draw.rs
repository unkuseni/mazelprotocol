//! Advance Draw Instruction (Permissionless)
//!
//! Allows ANY user to advance a stuck draw after a timeout period OR accelerate
//! a draw when the sale target ticket count is reached.
//!
//! # Three Scenarios:
//! 1. **Timeout recovery** (draw in progress): Skip a stuck draw that the bot
//!    committed but failed to finalize. Requires DRAW_ADVANCEMENT_TIMEOUT.
//! 2. **Sale target acceleration** (draw NOT in progress): When enough tickets
//!    are sold, pull the next draw forward to now so the bot commits immediately.
//! 3. **Acceleration timeout** (Mode 2 failed): If sale target was hit and the
//!    draw was accelerated but the bot never committed, skip this draw after
//!    the timeout elapses (prevents infinite stall when bot is offline).

use crate::constants::*;
use crate::errors::LottoError;
use crate::state::LotteryState;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct AdvanceDraw<'info> {
    /// Anyone can call this (permissionless)
    #[account(mut)]
    pub caller: Signer<'info>,

    #[account(
        mut,
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump,
        constraint = !lottery_state.is_paused @ LottoError::Paused,
    )]
    pub lottery_state: Account<'info, LotteryState>,
}

pub fn handler(ctx: Context<AdvanceDraw>) -> Result<()> {
    let clock = Clock::get()?;
    let lottery_state = &mut ctx.accounts.lottery_state;

    let draw_in_progress = lottery_state.is_draw_in_progress;

    // Original scheduled time for this draw cycle
    let next_draw = lottery_state.next_draw_timestamp;
    let cycle_start = next_draw.saturating_sub(lottery_state.draw_interval);

    // Check sale target condition
    let target_hit = lottery_state.sale_target_tickets > 0
        && lottery_state.current_draw_tickets >= lottery_state.sale_target_tickets;

    // Minimum interval since cycle start
    let min_interval_elapsed =
        clock.unix_timestamp >= cycle_start.saturating_add(MIN_DRAW_INTERVAL);

    // Timeout since original scheduled draw time
    let timeout_elapsed =
        clock.unix_timestamp >= next_draw.saturating_add(DRAW_ADVANCEMENT_TIMEOUT);

    // =========================================================================
    // MODE 1: Draw IS in progress — timeout recovery
    // =========================================================================
    if draw_in_progress {
        require!(!lottery_state.is_awaiting_finalization, LottoError::DrawNotInProgress);

        // SECURITY (post-audit fix): a draw in progress can ONLY be skipped on
        // timeout. Previously `target_hit` also allowed advancement here, which
        // let anyone void a committed-but-not-yet-executed draw during the
        // ~4-second commit→execute window when the sale target was enabled.
        let can_advance = timeout_elapsed && min_interval_elapsed;
        require!(can_advance, LottoError::DrawAdvancementNotReady);

        msg!("⚠️  Draw advancement triggered by timeout");

        lottery_state.reset_draw_state(true);
        lottery_state.current_draw_id =
            lottery_state.current_draw_id.checked_add(1).ok_or(LottoError::Overflow)?;
        lottery_state.next_draw_timestamp = clock
            .unix_timestamp
            .checked_add(lottery_state.draw_interval)
            .ok_or(LottoError::Overflow)?;

        msg!("  Draw advanced to ID: {}", lottery_state.current_draw_id);
        return Ok(());
    }

    // =========================================================================
    // MODE 2: Draw NOT in progress
    // =========================================================================
    // Two sub-cases:
    //   a) Target hit, schedule not yet expired → accelerate
    //   b) Target hit, schedule expired + timeout → bot is dead, skip this draw

    if target_hit && min_interval_elapsed {
        // Sub-case b: The scheduled draw time has passed AND the timeout has
        // elapsed. This means a previous acceleration also failed (bot offline).
        // Skip this draw entirely rather than stalling forever.
        if timeout_elapsed {
            msg!("🎯 SALE TARGET HIT but bot never committed after timeout");
            msg!("  Skipping draw {} — advancing to next cycle", lottery_state.current_draw_id);

            // SECURITY (post-audit fix): reset the ticket counter when the
            // draw is skipped. Tickets sold for the skipped draw can never
            // claim (no draw result will exist for its draw_id), so counting
            // them toward the next draw would inflate total_tickets in the
            // winner-plausibility checks and distort draw statistics.
            lottery_state.reset_draw_state(true);
            lottery_state.current_draw_id =
                lottery_state.current_draw_id.checked_add(1).ok_or(LottoError::Overflow)?;
            lottery_state.next_draw_timestamp = clock
                .unix_timestamp
                .checked_add(lottery_state.draw_interval)
                .ok_or(LottoError::Overflow)?;

            msg!("  Draw advanced to ID: {}", lottery_state.current_draw_id);
            return Ok(());
        }

        // Sub-case a: First-time acceleration — pull the draw forward to NOW.
        // The bot will see next_draw_timestamp <= now and commit immediately.
        msg!(
            "🎯 SALE TARGET HIT: {} >= {}",
            lottery_state.current_draw_tickets,
            lottery_state.sale_target_tickets
        );
        msg!("  Accelerating draw — next draw set to NOW");
        msg!("  Previous scheduled time: {}", next_draw);

        lottery_state.next_draw_timestamp = clock.unix_timestamp;

        msg!("  Bot should commit within seconds. Called by: {}", ctx.accounts.caller.key());
        return Ok(());
    }

    Err(LottoError::DrawAdvancementNotReady.into())
}
