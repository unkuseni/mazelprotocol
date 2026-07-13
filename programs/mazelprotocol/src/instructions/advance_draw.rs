//! Advance Draw Instruction (Permissionless)
//!
//! Allows ANY user to advance a stuck draw after a timeout period OR accelerate
//! a draw when the sale target ticket count is reached.
//!
//! # Two Modes:
//! 1. **Timeout recovery** (draw in progress): Skip a stuck draw that the bot
//!    failed to finalize. Requires DRAW_ADVANCEMENT_TIMEOUT elapsed.
//! 2. **Sale target acceleration** (draw NOT in progress): When enough tickets
//!    are sold, pull the next draw forward to now so the bot commits immediately.
//!    Requires sale_target_tickets > 0 AND current_draw_tickets >= target
//!    AND MIN_DRAW_INTERVAL elapsed.

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

    // Calculate the start of the current draw cycle
    let cycle_start = lottery_state.next_draw_timestamp.saturating_sub(lottery_state.draw_interval);

    // Check sale target condition (applies to both modes)
    let target_hit = lottery_state.sale_target_tickets > 0
        && lottery_state.current_draw_tickets >= lottery_state.sale_target_tickets;

    // Safety: minimum interval must have passed since cycle start
    let min_interval_elapsed =
        clock.unix_timestamp >= cycle_start.saturating_add(MIN_DRAW_INTERVAL);

    // =========================================================================
    // MODE 1: Draw IS in progress — timeout recovery (existing behavior)
    // =========================================================================
    if draw_in_progress {
        // SECURITY: Cannot advance a draw that has already been executed
        require!(!lottery_state.is_awaiting_finalization, LottoError::DrawNotInProgress);

        // Timeout must have elapsed (sale target alone not enough for stuck draws)
        let timeout_elapsed = clock.unix_timestamp
            >= lottery_state.next_draw_timestamp.saturating_add(DRAW_ADVANCEMENT_TIMEOUT);

        let can_advance = (timeout_elapsed || target_hit) && min_interval_elapsed;

        require!(can_advance, LottoError::DrawAdvancementNotReady);

        if target_hit && !timeout_elapsed {
            msg!(
                "🎯 SALE TARGET HIT during stuck draw: {} tickets >= {} target",
                lottery_state.current_draw_tickets,
                lottery_state.sale_target_tickets
            );
        } else {
            msg!("⚠️  Draw advancement triggered by timeout");
        }

        // Reset draw state to allow the next cycle
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
    // MODE 2: Draw NOT in progress — sale target acceleration
    // =========================================================================
    if target_hit && min_interval_elapsed {
        // Pull the next draw forward to NOW so the bot commits immediately.
        // The draw ID stays the same — we're just accelerating the schedule.
        msg!(
            "🎯 SALE TARGET HIT: {} tickets >= {} target",
            lottery_state.current_draw_tickets,
            lottery_state.sale_target_tickets
        );
        msg!("  Accelerating draw — next draw set to NOW");
        msg!("  Previous scheduled time: {}", lottery_state.next_draw_timestamp);

        lottery_state.next_draw_timestamp = clock.unix_timestamp;

        msg!("  Bot should commit within seconds. Called by: {}", ctx.accounts.caller.key());
        return Ok(());
    }

    // Neither mode satisfied
    Err(LottoError::DrawAdvancementNotReady.into())
}
