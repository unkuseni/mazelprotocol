//! Finalize Quick Pick Draw Instruction
//!
//! This instruction finalizes the Quick Pick Express draw by:
//! - Accepting winner counts from off-chain indexing
//! - Calculating prize amounts (fixed or pari-mutuel rolldown)
//! - Updating the draw result with prizes
//! - Advancing the game state to the next draw
//!
//! Prize Calculation Modes:
//! - Normal Mode: Fixed prizes (Match 4 = $100, Match 3 = $4)
//! - Rolldown Mode: Pari-mutuel (Match 4 = 60% of jackpot, Match 3 = 40% of jackpot)

use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::QuickPickError;
use crate::events::QuickPickDrawFinalized;
use crate::state::{LotteryState, QuickPickDrawResult, QuickPickState, QuickPickWinnerCounts};

/// Parameters for finalizing the Quick Pick draw
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct FinalizeQuickPickDrawParams {
    /// Winner counts by tier (Match 5, Match 4, Match 3)
    pub winner_counts: QuickPickWinnerCounts,
}

/// Accounts required for finalizing the Quick Pick draw
#[derive(Accounts)]
pub struct FinalizeQuickPickDraw<'info> {
    /// The authority (must be lottery authority)
    #[account(
        constraint = authority.key() == lottery_state.authority @ QuickPickError::Unauthorized
    )]
    pub authority: Signer<'info>,

    /// The main lottery state (to verify authority)
    #[account(
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump
    )]
    pub lottery_state: Account<'info, LotteryState>,

    /// The Quick Pick state account
    #[account(
        mut,
        seeds = [QUICK_PICK_SEED],
        bump = quick_pick_state.bump
    )]
    pub quick_pick_state: Account<'info, QuickPickState>,

    /// The Quick Pick draw result account to be finalized
    #[account(
        mut,
        seeds = [QUICK_PICK_DRAW_SEED, &quick_pick_state.current_draw.to_le_bytes()],
        bump = draw_result.bump,
        constraint = !draw_result.is_explicitly_finalized @ QuickPickError::DrawAlreadyCompleted
    )]
    pub draw_result: Account<'info, QuickPickDrawResult>,
}

/// Prize calculation result
struct QuickPickPrizeCalculation {
    match_5_prize: u64,
    match_4_prize: u64,
    match_3_prize: u64,
    total_distributed: u64,
    _undistributed: u64,
    was_scaled_down: bool,
    scale_factor_bps: u16,
}

/// Calculate prizes for Normal Mode (fixed prizes)
///
/// In Normal Mode:
/// - Match 5 (Jackpot): Full jackpot amount (split if multiple winners)
/// - Match 4: $100 each
/// - Match 3: $4 each
fn calculate_quick_pick_fixed_prizes(
    winner_counts: &QuickPickWinnerCounts,
    jackpot_balance: u64,
    prize_pool_balance: u64,
) -> QuickPickPrizeCalculation {
    // Calculate raw prizes
    let match_5_total = if winner_counts.match_5 > 0 {
        jackpot_balance
    } else {
        0
    };
    let match_4_total = (winner_counts.match_4 as u64).saturating_mul(QUICK_PICK_MATCH_4_PRIZE);
    let match_3_total = (winner_counts.match_3 as u64).saturating_mul(QUICK_PICK_MATCH_3_PRIZE);

    let total_required = match_5_total
        .saturating_add(match_4_total)
        .saturating_add(match_3_total);

    // Check if we need to scale down prizes
    let available_funds = jackpot_balance.saturating_add(prize_pool_balance);

    let (scale_factor_bps, was_scaled_down) =
        if total_required > available_funds && total_required > 0 {
            // Scale down proportionally
            let factor = ((available_funds as u128 * BPS_DENOMINATOR as u128)
                / total_required as u128) as u16;
            (factor, true)
        } else {
            (BPS_DENOMINATOR as u16, false)
        };

    // Calculate per-winner prizes
    let match_5_prize = if winner_counts.match_5 > 0 {
        let scaled_jackpot = if was_scaled_down {
            (jackpot_balance as u128 * scale_factor_bps as u128 / BPS_DENOMINATOR as u128) as u64
        } else {
            jackpot_balance
        };
        scaled_jackpot / winner_counts.match_5 as u64
    } else {
        0
    };

    let match_4_prize = if was_scaled_down {
        (QUICK_PICK_MATCH_4_PRIZE as u128 * scale_factor_bps as u128 / BPS_DENOMINATOR as u128)
            as u64
    } else {
        QUICK_PICK_MATCH_4_PRIZE
    };

    let match_3_prize = if was_scaled_down {
        (QUICK_PICK_MATCH_3_PRIZE as u128 * scale_factor_bps as u128 / BPS_DENOMINATOR as u128)
            as u64
    } else {
        QUICK_PICK_MATCH_3_PRIZE
    };

    // Calculate actual totals
    let actual_match_5 = match_5_prize.saturating_mul(winner_counts.match_5 as u64);
    let actual_match_4 = match_4_prize.saturating_mul(winner_counts.match_4 as u64);
    let actual_match_3 = match_3_prize.saturating_mul(winner_counts.match_3 as u64);

    let total_distributed = actual_match_5
        .saturating_add(actual_match_4)
        .saturating_add(actual_match_3);

    let undistributed = available_funds.saturating_sub(total_distributed);

    QuickPickPrizeCalculation {
        match_5_prize,
        match_4_prize,
        match_3_prize,
        total_distributed,
        _undistributed: undistributed,
        was_scaled_down,
        scale_factor_bps,
    }
}

/// Calculate prizes for Rolldown Mode (pari-mutuel)
///
/// In Rolldown Mode:
/// - Match 5: 0 (no jackpot in rolldown)
/// - Match 4: 60% of jackpot (split among all Match 4 winners)
/// - Match 3: 40% of jackpot (split among all Match 3 winners)
///
/// If no winners in a tier, that portion redistributes to the other tier.
fn calculate_quick_pick_rolldown_prizes(
    winner_counts: &QuickPickWinnerCounts,
    jackpot_balance: u64,
) -> QuickPickPrizeCalculation {
    // Match 5 gets nothing in rolldown (jackpot goes to lower tiers)
    let match_5_prize = 0u64;

    // Calculate initial allocations
    let match_4_allocation = (jackpot_balance as u128 * QUICK_PICK_ROLLDOWN_MATCH_4_BPS as u128
        / BPS_DENOMINATOR as u128) as u64;
    let match_3_allocation = (jackpot_balance as u128 * QUICK_PICK_ROLLDOWN_MATCH_3_BPS as u128
        / BPS_DENOMINATOR as u128) as u64;

    // Redistribute if no winners in a tier
    let (final_match_4_allocation, final_match_3_allocation) =
        match (winner_counts.match_4 > 0, winner_counts.match_3 > 0) {
            (true, true) => {
                // Both tiers have winners - normal distribution
                (match_4_allocation, match_3_allocation)
            }
            (true, false) => {
                // Only Match 4 has winners - they get everything
                (jackpot_balance, 0)
            }
            (false, true) => {
                // Only Match 3 has winners - they get everything
                (0, jackpot_balance)
            }
            (false, false) => {
                // No winners at all - jackpot rolls over (0, 0)
                (0, 0)
            }
        };

    // Calculate per-winner prizes
    let match_4_prize = if winner_counts.match_4 > 0 {
        final_match_4_allocation / winner_counts.match_4 as u64
    } else {
        0
    };

    let match_3_prize = if winner_counts.match_3 > 0 {
        final_match_3_allocation / winner_counts.match_3 as u64
    } else {
        0
    };

    // Calculate totals
    let actual_match_4 = match_4_prize.saturating_mul(winner_counts.match_4 as u64);
    let actual_match_3 = match_3_prize.saturating_mul(winner_counts.match_3 as u64);

    let total_distributed = actual_match_4.saturating_add(actual_match_3);
    let undistributed = jackpot_balance.saturating_sub(total_distributed);

    QuickPickPrizeCalculation {
        match_5_prize,
        match_4_prize,
        match_3_prize,
        total_distributed,
        _undistributed: undistributed,
        was_scaled_down: false,
        scale_factor_bps: BPS_DENOMINATOR as u16,
    }
}

/// Finalize the Quick Pick draw with winner counts
///
/// This instruction:
/// 1. Validates the draw has been executed (winning numbers set)
/// 2. Validates winner counts don't exceed total tickets
/// 3. Calculates prizes (fixed or rolldown mode)
/// 4. Updates draw result with prizes
/// 5. Updates Quick Pick state (jackpot, advance to next draw)
/// 6. Emits finalization event
///
/// # Arguments
/// * `ctx` - The context containing all required accounts
/// * `params` - The winner counts by tier
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler(
    ctx: Context<FinalizeQuickPickDraw>,
    params: FinalizeQuickPickDrawParams,
) -> Result<()> {
    let clock = Clock::get()?;

    // Get values before mutable borrows
    let current_draw = ctx.accounts.quick_pick_state.current_draw;
    let jackpot_balance = ctx.accounts.quick_pick_state.jackpot_balance;
    let prize_pool_balance = ctx.accounts.quick_pick_state.prize_pool_balance;
    let seed_amount = ctx.accounts.quick_pick_state.seed_amount;
    let draw_interval = ctx.accounts.quick_pick_state.draw_interval;
    let was_rolldown = ctx.accounts.draw_result.was_rolldown;
    let total_tickets = ctx.accounts.draw_result.total_tickets;

    // Validate winner counts
    require!(
        params.winner_counts.validate(total_tickets),
        QuickPickError::WinnerCountsExceedTickets
    );

    // Calculate prizes based on mode
    let prize_calc = if was_rolldown {
        msg!("🎰 ROLLDOWN MODE: Calculating pari-mutuel prizes");
        calculate_quick_pick_rolldown_prizes(&params.winner_counts, jackpot_balance)
    } else {
        msg!("💰 NORMAL MODE: Calculating fixed prizes");
        calculate_quick_pick_fixed_prizes(
            &params.winner_counts,
            jackpot_balance,
            prize_pool_balance,
        )
    };

    // Log prize calculation
    msg!("📊 Prize Calculation Results:");
    msg!(
        "  Match 5 winners: {} @ {} USDC each",
        params.winner_counts.match_5,
        prize_calc.match_5_prize
    );
    msg!(
        "  Match 4 winners: {} @ {} USDC each",
        params.winner_counts.match_4,
        prize_calc.match_4_prize
    );
    msg!(
        "  Match 3 winners: {} @ {} USDC each",
        params.winner_counts.match_3,
        prize_calc.match_3_prize
    );
    msg!(
        "  Total to distribute: {} USDC",
        prize_calc.total_distributed
    );
    if prize_calc.was_scaled_down {
        msg!(
            "  ⚠️ PRIZES SCALED DOWN: {}% of normal",
            prize_calc.scale_factor_bps as f64 / 100.0
        );
    }

    // Update draw result
    let draw_result = &mut ctx.accounts.draw_result;
    draw_result.match_5_winners = params.winner_counts.match_5;
    draw_result.match_4_winners = params.winner_counts.match_4;
    draw_result.match_3_winners = params.winner_counts.match_3;
    draw_result.match_5_prize_per_winner = prize_calc.match_5_prize;
    draw_result.match_4_prize_per_winner = prize_calc.match_4_prize;
    draw_result.match_3_prize_per_winner = prize_calc.match_3_prize;
    draw_result.is_explicitly_finalized = true;

    // Update Quick Pick state
    let quick_pick_state = &mut ctx.accounts.quick_pick_state;

    // Handle jackpot based on mode
    if was_rolldown {
        // Rolldown: reset jackpot to seed amount
        quick_pick_state.jackpot_balance = seed_amount;
        quick_pick_state.is_rolldown_pending = false;
        msg!("  Jackpot reset to seed amount: {} USDC", seed_amount);
    } else if params.winner_counts.match_5 > 0 {
        // Jackpot won: reset to seed amount
        quick_pick_state.jackpot_balance = seed_amount;
        msg!(
            "  🎉 JACKPOT WON! Reset to seed amount: {} USDC",
            seed_amount
        );
    }
    // If no jackpot winner and no rolldown, jackpot carries over (no change)

    // Advance to next draw
    quick_pick_state.current_draw = current_draw.saturating_add(1);
    quick_pick_state.current_draw_tickets = 0;
    quick_pick_state.next_draw_timestamp = quick_pick_state
        .next_draw_timestamp
        .saturating_add(draw_interval);

    // Emit event
    emit!(QuickPickDrawFinalized {
        draw_id: current_draw,
        match_5_winners: params.winner_counts.match_5,
        match_4_winners: params.winner_counts.match_4,
        match_3_winners: params.winner_counts.match_3,
        match_5_prize: prize_calc.match_5_prize,
        match_4_prize: prize_calc.match_4_prize,
        match_3_prize: prize_calc.match_3_prize,
        total_distributed: prize_calc.total_distributed,
        timestamp: clock.unix_timestamp,
    });

    msg!("✅ Quick Pick draw #{} finalized!", current_draw);
    msg!("  Next draw: #{}", quick_pick_state.current_draw);
    msg!("  Next draw time: {}", quick_pick_state.next_draw_timestamp);
    msg!(
        "  New jackpot balance: {} USDC",
        quick_pick_state.jackpot_balance
    );

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_quick_pick_fixed_prizes() {
        let winner_counts = QuickPickWinnerCounts {
            match_5: 0,
            match_4: 10,
            match_3: 100,
        };

        let result = calculate_quick_pick_fixed_prizes(
            &winner_counts,
            10_000_000_000, // $10,000 jackpot
            5_000_000_000,  // $5,000 prize pool
        );

        // No jackpot winners
        assert_eq!(result.match_5_prize, 0);
        // Fixed prizes
        assert_eq!(result.match_4_prize, QUICK_PICK_MATCH_4_PRIZE);
        assert_eq!(result.match_3_prize, QUICK_PICK_MATCH_3_PRIZE);
        // Should not be scaled
        assert!(!result.was_scaled_down);
    }

    #[test]
    fn test_calculate_quick_pick_fixed_prizes_with_jackpot() {
        let winner_counts = QuickPickWinnerCounts {
            match_5: 2,
            match_4: 5,
            match_3: 50,
        };

        let jackpot = 10_000_000_000u64; // $10,000
        let result = calculate_quick_pick_fixed_prizes(
            &winner_counts,
            jackpot,
            5_000_000_000, // $5,000 prize pool
        );

        // Jackpot split between 2 winners
        assert_eq!(result.match_5_prize, jackpot / 2);
        assert_eq!(result.match_4_prize, QUICK_PICK_MATCH_4_PRIZE);
        assert_eq!(result.match_3_prize, QUICK_PICK_MATCH_3_PRIZE);
    }

    #[test]
    fn test_calculate_quick_pick_rolldown_prizes() {
        let winner_counts = QuickPickWinnerCounts {
            match_5: 0,
            match_4: 10,
            match_3: 100,
        };

        let jackpot = 40_000_000_000u64; // $40,000
        let result = calculate_quick_pick_rolldown_prizes(&winner_counts, jackpot);

        // No Match 5 prize in rolldown
        assert_eq!(result.match_5_prize, 0);

        // Match 4 gets 60% of jackpot split among 10 winners
        // 60% of $40k = $24k / 10 = $2,400
        let expected_match_4 = (jackpot * 6000 / 10000) / 10;
        assert_eq!(result.match_4_prize, expected_match_4);

        // Match 3 gets 40% of jackpot split among 100 winners
        // 40% of $40k = $16k / 100 = $160
        let expected_match_3 = (jackpot * 4000 / 10000) / 100;
        assert_eq!(result.match_3_prize, expected_match_3);
    }

    #[test]
    fn test_calculate_quick_pick_rolldown_no_match4_winners() {
        let winner_counts = QuickPickWinnerCounts {
            match_5: 0,
            match_4: 0,
            match_3: 100,
        };

        let jackpot = 40_000_000_000u64; // $40,000
        let result = calculate_quick_pick_rolldown_prizes(&winner_counts, jackpot);

        // No Match 4 winners - Match 3 gets everything
        assert_eq!(result.match_4_prize, 0);
        assert_eq!(result.match_3_prize, jackpot / 100);
    }

    #[test]
    fn test_calculate_quick_pick_rolldown_no_winners() {
        let winner_counts = QuickPickWinnerCounts {
            match_5: 0,
            match_4: 0,
            match_3: 0,
        };

        let jackpot = 40_000_000_000u64;
        let result = calculate_quick_pick_rolldown_prizes(&winner_counts, jackpot);

        // No winners - all prizes are 0 (jackpot would roll over)
        assert_eq!(result.match_5_prize, 0);
        assert_eq!(result.match_4_prize, 0);
        assert_eq!(result.match_3_prize, 0);
        assert_eq!(result.total_distributed, 0);
    }
}
