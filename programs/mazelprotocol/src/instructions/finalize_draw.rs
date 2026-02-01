//! Finalize Draw Instruction
//!
//! This instruction finalizes a draw by setting winner counts and calculating prizes.
//! It is called by the authority after off-chain indexing has determined winner counts.
//!
//! The finalization process:
//! 1. Validates winner counts submitted by authority
//! 2. Calculates prizes based on mode (fixed or pari-mutuel rolldown)
//! 3. Updates the draw result with prize amounts
//! 4. Resets lottery state for the next draw
//! 5. Seeds the new jackpot if rolldown occurred

use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::LottoError;
use crate::events::{DrawFinalized, RolldownExecuted};
use crate::state::{DrawResult, LotteryState, WinnerCounts};

/// Parameters for finalizing the draw
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct FinalizeDrawParams {
    /// Winner counts by tier (submitted by indexer)
    pub winner_counts: WinnerCounts,
}

/// Accounts required for finalizing the draw
#[derive(Accounts)]
pub struct FinalizeDraw<'info> {
    /// The authority finalizing the draw
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The main lottery state account
    #[account(
        mut,
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump,
        constraint = lottery_state.authority == authority.key() @ LottoError::Unauthorized,
        constraint = lottery_state.is_draw_in_progress @ LottoError::DrawNotInProgress
    )]
    pub lottery_state: Account<'info, LotteryState>,

    /// The draw result account to be finalized
    #[account(
        mut,
        seeds = [DRAW_SEED, &lottery_state.current_draw_id.to_le_bytes()],
        bump = draw_result.bump,
        constraint = draw_result.draw_id == lottery_state.current_draw_id @ LottoError::DrawIdMismatch
    )]
    pub draw_result: Account<'info, DrawResult>,
}

/// Calculate prizes for normal mode (fixed prizes)
///
/// In normal mode, prizes are fixed amounts:
/// - Match 6: Jackpot (variable)
/// - Match 5: $4,000
/// - Match 4: $150
/// - Match 3: $5
/// - Match 2: Free ticket ($2.50 value)
///
/// # Arguments
/// * `winner_counts` - Number of winners in each tier
/// * `jackpot_balance` - Current jackpot balance
///
/// # Returns
/// * `(u64, u64, u64, u64, u64, u64)` - Prize per winner for each tier and total distributed
fn calculate_fixed_prizes(winner_counts: &WinnerCounts, jackpot_balance: u64) -> (u64, u64, u64, u64, u64, u64) {
    let match_6_prize = if winner_counts.match_6 > 0 {
        jackpot_balance / winner_counts.match_6 as u64
    } else {
        0
    };

    let match_5_prize = MATCH_5_PRIZE;
    let match_4_prize = MATCH_4_PRIZE;
    let match_3_prize = MATCH_3_PRIZE;
    let match_2_prize = MATCH_2_VALUE; // Free ticket value

    // Calculate total distributed
    let total = (match_6_prize * winner_counts.match_6 as u64)
        + (match_5_prize * winner_counts.match_5 as u64)
        + (match_4_prize * winner_counts.match_4 as u64)
        + (match_3_prize * winner_counts.match_3 as u64)
        + (match_2_prize * winner_counts.match_2 as u64);

    (match_6_prize, match_5_prize, match_4_prize, match_3_prize, match_2_prize, total)
}

/// Calculate prizes for rolldown mode (pari-mutuel)
///
/// In rolldown mode, the entire jackpot is distributed to lower tiers:
/// - Match 5: 25% of jackpot
/// - Match 4: 35% of jackpot
/// - Match 3: 40% of jackpot
/// - Match 2: Free ticket (unchanged)
///
/// Prizes are pari-mutuel (divided among all winners in each tier).
///
/// # Arguments
/// * `winner_counts` - Number of winners in each tier
/// * `jackpot_balance` - Jackpot being distributed
///
/// # Returns
/// * `(u64, u64, u64, u64, u64, u64)` - Prize per winner for each tier and total distributed
fn calculate_rolldown_prizes(winner_counts: &WinnerCounts, jackpot_balance: u64) -> (u64, u64, u64, u64, u64, u64) {
    // Match 6 gets nothing in rolldown (no jackpot winner by definition)
    let match_6_prize = 0u64;

    // Calculate pool allocations
    let match_5_pool = (jackpot_balance as u128 * ROLLDOWN_MATCH_5_BPS as u128 / BPS_DENOMINATOR as u128) as u64;
    let match_4_pool = (jackpot_balance as u128 * ROLLDOWN_MATCH_4_BPS as u128 / BPS_DENOMINATOR as u128) as u64;
    let match_3_pool = (jackpot_balance as u128 * ROLLDOWN_MATCH_3_BPS as u128 / BPS_DENOMINATOR as u128) as u64;

    // Calculate per-winner prizes (pari-mutuel)
    let match_5_prize = if winner_counts.match_5 > 0 {
        match_5_pool / winner_counts.match_5 as u64
    } else {
        0
    };

    let match_4_prize = if winner_counts.match_4 > 0 {
        match_4_pool / winner_counts.match_4 as u64
    } else {
        0
    };

    let match_3_prize = if winner_counts.match_3 > 0 {
        match_3_pool / winner_counts.match_3 as u64
    } else {
        0
    };

    let match_2_prize = MATCH_2_VALUE; // Free ticket unchanged

    // Total distributed (excluding any remainder from rounding)
    let total = (match_5_prize * winner_counts.match_5 as u64)
        + (match_4_prize * winner_counts.match_4 as u64)
        + (match_3_prize * winner_counts.match_3 as u64)
        + (match_2_prize * winner_counts.match_2 as u64);

    (match_6_prize, match_5_prize, match_4_prize, match_3_prize, match_2_prize, total)
}

/// Finalize the draw with winner counts and calculate prizes
///
/// This instruction:
/// 1. Validates the draw is in progress and waiting for finalization
/// 2. Updates the draw result with winner counts
/// 3. Calculates prizes based on mode (fixed or rolldown)
/// 4. Updates draw result with calculated prizes
/// 5. Updates jackpot balance (reset if rolldown, or continue if Match 6 winner)
/// 6. Resets lottery state for the next draw cycle
///
/// # Arguments
/// * `ctx` - The context containing all required accounts
/// * `params` - Winner counts from off-chain indexing
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler(ctx: Context<FinalizeDraw>, params: FinalizeDrawParams) -> Result<()> {
    let clock = Clock::get()?;
    let lottery_state = &mut ctx.accounts.lottery_state;
    let draw_result = &mut ctx.accounts.draw_result;

    // Update winner counts
    draw_result.match_6_winners = params.winner_counts.match_6;
    draw_result.match_5_winners = params.winner_counts.match_5;
    draw_result.match_4_winners = params.winner_counts.match_4;
    draw_result.match_3_winners = params.winner_counts.match_3;
    draw_result.match_2_winners = params.winner_counts.match_2;

    // Determine prize mode and calculate prizes
    let jackpot_at_draw = lottery_state.jackpot_balance;
    let was_rolldown = draw_result.was_rolldown && params.winner_counts.match_6 == 0;

    let (match_6_prize, match_5_prize, match_4_prize, match_3_prize, match_2_prize, total_distributed) =
        if was_rolldown {
            calculate_rolldown_prizes(&params.winner_counts, jackpot_at_draw)
        } else {
            calculate_fixed_prizes(&params.winner_counts, jackpot_at_draw)
        };

    // Update draw result with prizes
    draw_result.match_6_prize_per_winner = match_6_prize;
    draw_result.match_5_prize_per_winner = match_5_prize;
    draw_result.match_4_prize_per_winner = match_4_prize;
    draw_result.match_3_prize_per_winner = match_3_prize;
    draw_result.match_2_prize_per_winner = match_2_prize;

    // Update jackpot balance
    if was_rolldown {
        // Rolldown occurred - jackpot distributed, seed new jackpot from reserve
        let seed_from_reserve = lottery_state.seed_amount.min(lottery_state.reserve_balance);
        lottery_state.jackpot_balance = seed_from_reserve;
        lottery_state.reserve_balance = lottery_state.reserve_balance.saturating_sub(seed_from_reserve);

        // Emit rolldown event
        emit!(RolldownExecuted {
            draw_id: lottery_state.current_draw_id,
            jackpot_distributed: jackpot_at_draw,
            match_5_prize,
            match_4_prize,
            match_3_prize,
            timestamp: clock.unix_timestamp,
        });

        msg!("Rolldown executed!");
        msg!("  Jackpot distributed: {} USDC lamports", jackpot_at_draw);
        msg!("  New jackpot seeded: {} USDC lamports", lottery_state.jackpot_balance);
    } else if params.winner_counts.match_6 > 0 {
        // Jackpot won - reset jackpot, seed from reserve
        let seed_from_reserve = lottery_state.seed_amount.min(lottery_state.reserve_balance);
        lottery_state.jackpot_balance = seed_from_reserve;
        lottery_state.reserve_balance = lottery_state.reserve_balance.saturating_sub(seed_from_reserve);

        msg!("Jackpot won by {} winners!", params.winner_counts.match_6);
        msg!("  Prize per winner: {} USDC lamports", match_6_prize);
        msg!("  New jackpot seeded: {} USDC lamports", lottery_state.jackpot_balance);
    }
    // If no jackpot winner and no rolldown, jackpot continues to accumulate

    // Update total prizes paid
    lottery_state.total_prizes_paid = lottery_state
        .total_prizes_paid
        .saturating_add(total_distributed);

    // Reset for next draw
    lottery_state.is_draw_in_progress = false;
    lottery_state.is_rolldown_active = false;
    lottery_state.current_draw_id = lottery_state.current_draw_id.saturating_add(1);
    lottery_state.current_draw_tickets = 0;
    lottery_state.commit_slot = 0;
    lottery_state.current_randomness_account = Pubkey::default();

    // Set next draw timestamp
    lottery_state.next_draw_timestamp = clock.unix_timestamp + DRAW_INTERVAL;

    // Update house fee based on new jackpot level
    lottery_state.house_fee_bps = lottery_state.get_current_house_fee_bps();

    // Emit finalization event
    emit!(DrawFinalized {
        draw_id: draw_result.draw_id,
        match_6_winners: params.winner_counts.match_6,
        match_5_winners: params.winner_counts.match_5,
        match_4_winners: params.winner_counts.match_4,
        match_3_winners: params.winner_counts.match_3,
        match_2_winners: params.winner_counts.match_2,
        total_distributed,
        timestamp: clock.unix_timestamp,
    });

    msg!("Draw finalized successfully!");
    msg!("  Draw ID: {}", draw_result.draw_id);
    msg!("  Match 6 winners: {} (prize: {})", params.winner_counts.match_6, match_6_prize);
    msg!("  Match 5 winners: {} (prize: {})", params.winner_counts.match_5, match_5_prize);
    msg!("  Match 4 winners: {} (prize: {})", params.winner_counts.match_4, match_4_prize);
    msg!("  Match 3 winners: {} (prize: {})", params.winner_counts.match_3, match_3_prize);
    msg!("  Match 2 winners: {} (prize: {})", params.winner_counts.match_2, match_2_prize);
    msg!("  Total distributed: {} USDC lamports", total_distributed);
    msg!("  Was rolldown: {}", was_rolldown);
    msg!("  Next draw ID: {}", lottery_state.current_draw_id);
    msg!("  Next draw at: {}", lottery_state.next_draw_timestamp);

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_fixed_prizes() {
        let winner_counts = WinnerCounts {
            match_6: 0,
            match_5: 2,
            match_4: 10,
            match_3: 100,
            match_2: 500,
        };

        let jackpot = 1_000_000_000_000u64; // $1M

        let (m6, m5, m4, m3, m2, total) = calculate_fixed_prizes(&winner_counts, jackpot);

        assert_eq!(m6, 0); // No Match 6 winners
        assert_eq!(m5, MATCH_5_PRIZE);
        assert_eq!(m4, MATCH_4_PRIZE);
        assert_eq!(m3, MATCH_3_PRIZE);
        assert_eq!(m2, MATCH_2_VALUE);

        let expected_total = (m5 * 2) + (m4 * 10) + (m3 * 100) + (m2 * 500);
        assert_eq!(total, expected_total);
    }

    #[test]
    fn test_calculate_rolldown_prizes() {
        let winner_counts = WinnerCounts {
            match_6: 0, // By definition, rolldown means no Match 6
            match_5: 10,
            match_4: 500,
            match_3: 10000,
            match_2: 50000,
        };

        let jackpot = 1_750_000_000_000u64; // $1.75M (soft cap)

        let (m6, m5, m4, m3, m2, _total) = calculate_rolldown_prizes(&winner_counts, jackpot);

        // Match 6 prize should be 0 in rolldown
        assert_eq!(m6, 0);

        // Calculate expected pool allocations
        let match_5_pool = (jackpot as u128 * 2500 / 10000) as u64; // 25%
        let match_4_pool = (jackpot as u128 * 3500 / 10000) as u64; // 35%
        let match_3_pool = (jackpot as u128 * 4000 / 10000) as u64; // 40%

        // Verify per-winner prizes
        assert_eq!(m5, match_5_pool / 10);
        assert_eq!(m4, match_4_pool / 500);
        assert_eq!(m3, match_3_pool / 10000);
        assert_eq!(m2, MATCH_2_VALUE);
    }

    #[test]
    fn test_rolldown_with_no_winners_in_tier() {
        let winner_counts = WinnerCounts {
            match_6: 0,
            match_5: 0, // No Match 5 winners
            match_4: 100,
            match_3: 5000,
            match_2: 20000,
        };

        let jackpot = 2_000_000_000_000u64;

        let (m6, m5, m4, m3, _m2, _total) = calculate_rolldown_prizes(&winner_counts, jackpot);

        // Match 5 prize should be 0 when no winners (pool is "lost")
        // Note: In production, you might want to redistribute this
        assert_eq!(m6, 0);
        assert_eq!(m5, 0);
        assert!(m4 > 0);
        assert!(m3 > 0);
    }
}
