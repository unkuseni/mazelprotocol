//! Advance Draw Instruction (Permissionless)
//!
//! Allows ANY user to advance a stuck draw after a timeout period.
//! This is a fallback mechanism for when the draw lifecycle bot is
//! unavailable or network congestion prevents timely execution.
//!
//! Security: Can only be called after DRAW_ADVANCEMENT_TIMEOUT seconds
//! have elapsed since the scheduled draw time. This gives the bot
//! priority while ensuring the protocol doesn't halt.

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

/// Advance a stuck draw by skipping it and preparing for the next cycle.
///
/// This should only be callable when:
/// 1. The scheduled draw time + timeout has passed
/// 2. The draw is still in an incomplete state
///
/// When called, it resets the draw-in-progress flags and advances
/// to the next draw, effectively skipping the stuck draw.
/// Players with tickets in the skipped draw can contact support
/// for off-chain resolution.
pub fn handler(ctx: Context<AdvanceDraw>) -> Result<()> {
    let clock = Clock::get()?;
    let lottery_state = &mut ctx.accounts.lottery_state;

    // Check if timeout has elapsed since the scheduled draw time
    let timeout_deadline = lottery_state
        .next_draw_timestamp
        .checked_add(DRAW_ADVANCEMENT_TIMEOUT)
        .ok_or(LottoError::Overflow)?;

    require!(
        clock.unix_timestamp >= timeout_deadline,
        LottoError::DrawAdvancementNotReady
    );

    // Only advance if a draw is stuck
    require!(
        lottery_state.is_draw_in_progress,
        LottoError::DrawNotInProgress
    );

    // Log the forced advancement
    msg!("⚠️  Permissionless draw advancement triggered!");
    msg!("  Draw ID: {}", lottery_state.current_draw_id);
    msg!("  Scheduled: {}", lottery_state.next_draw_timestamp);
    msg!("  Current: {}", clock.unix_timestamp);
    msg!("  Called by: {}", ctx.accounts.caller.key());

    // Reset draw state to allow the next cycle (including tickets)
    lottery_state.reset_draw_state(true);
    lottery_state.current_draw_id = lottery_state
        .current_draw_id
        .checked_add(1)
        .ok_or(LottoError::Overflow)?;
    lottery_state.next_draw_timestamp = clock
        .unix_timestamp
        .checked_add(lottery_state.draw_interval)
        .ok_or(LottoError::Overflow)?;

    msg!("  Draw advanced to ID: {}", lottery_state.current_draw_id);

    Ok(())
}
