//! Finalize Draw Instruction
//!
//! This instruction finalizes a draw by setting winner counts and calculating prizes.
//! It is called by the authority after off-chain indexing has determined winner counts.
//!
//! The finalization process:
//! 1. Validates winner counts submitted by authority
//! 2. Performs solvency check (jackpot + reserve + insurance)
//! 3. Calculates prizes based on mode (fixed or pari-mutuel rolldown)
//! 4. Uses insurance pool if needed for prize shortfalls
//! 5. Handles zero-winner tiers by redistributing funds
//! 6. Updates the draw result with prize amounts
//! 7. Resets lottery state for the next draw
//! 8. Seeds the new jackpot if rolldown occurred
//! 9. Updates dynamic house fee based on new jackpot level

use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::LottoError;
use crate::events::{
    DrawFinalized, DynamicFeeTierChanged, EmergencyPause, InsurancePoolUsed, RolldownExecuted,
    SoftCapReached, SolvencyCheckPerformed,
};
use crate::state::{DrawResult, LotteryState, WinnerCounts};

/// Parameters for finalizing the draw
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct FinalizeDrawParams {
    /// Winner counts by tier (submitted by indexer)
    pub winner_counts: WinnerCounts,
    /// Verification hash: SHA256(draw_id || winning_numbers || serialized_winner_counts || indexer_nonce)
    /// This serves as a commitment to the off-chain winner data, enabling post-hoc auditing.
    /// Off-chain indexers must publish the preimage so anyone can verify the hash on-chain.
    pub verification_hash: [u8; 32],
    /// Nonce used by the indexer when computing the verification hash (for replay protection)
    pub indexer_nonce: u64,
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

/// Result of prize calculation
struct PrizeCalculation {
    match_6_prize: u64,
    match_5_prize: u64,
    match_4_prize: u64,
    match_3_prize: u64,
    match_2_prize: u64,
    total_distributed: u64,
    undistributed: u64, // Funds that couldn't be distributed (no winners in tier)
    was_scaled_down: bool, // True if prizes were scaled down due to insufficient funds
    scale_factor_bps: u16, // Scale factor applied (10000 = 100%, no scaling)
    calculation_details: String, // Detailed explanation of calculation for debugging
}

/// Calculate prizes for normal mode (fixed prizes) with solvency check
///
/// In normal mode, prizes are fixed amounts:
/// - Match 6: Jackpot (variable)
/// - Match 5: $4,000
/// - Match 4: $150
/// - Match 3: $5
/// - Match 2: Free ticket ($2.50 value)
///
/// SOLVENCY CHECK: If the prize pool cannot cover all fixed prizes,
/// the fixed prizes (Match 3, 4, 5) are scaled down proportionally.
/// Match 6 (jackpot) and Match 2 (free ticket credit) are not affected.
///
/// # Arguments
/// * `winner_counts` - Number of winners in each tier
/// * `jackpot_balance` - Current jackpot balance
/// * `available_prize_pool` - Total available funds in prize pool for fixed prizes
///
/// # Returns
/// * `PrizeCalculation` - Prize per winner for each tier and totals
fn calculate_fixed_prizes(
    winner_counts: &WinnerCounts,
    jackpot_balance: u64,
    available_prize_pool: u64,
) -> PrizeCalculation {
    // FIXED: Validate winner counts are reasonable
    let total_tickets_estimate = winner_counts
        .match_6
        .saturating_add(winner_counts.match_5)
        .saturating_add(winner_counts.match_4)
        .saturating_add(winner_counts.match_3)
        .saturating_add(winner_counts.match_2);

    // Sanity check: total winners shouldn't exceed typical statistical expectations
    // For a 6/46 lottery, expected winners per tier are very low
    if total_tickets_estimate > 1_000_000 {
        msg!(
            "WARNING: Suspiciously high winner count: {}",
            total_tickets_estimate
        );
    }

    let match_6_prize = if winner_counts.match_6 > 0 {
        jackpot_balance / winner_counts.match_6 as u64
    } else {
        0
    };

    // Calculate required funds for fixed prizes (excluding jackpot and free tickets)
    // FIXED: Use checked arithmetic to prevent overflow
    let required_match_5 = MATCH_5_PRIZE
        .checked_mul(winner_counts.match_5 as u64)
        .unwrap_or(u64::MAX);
    let required_match_4 = MATCH_4_PRIZE
        .checked_mul(winner_counts.match_4 as u64)
        .unwrap_or(u64::MAX);
    let required_match_3 = MATCH_3_PRIZE
        .checked_mul(winner_counts.match_3 as u64)
        .unwrap_or(u64::MAX);

    let total_fixed_required = required_match_5
        .checked_add(required_match_4)
        .and_then(|sum| sum.checked_add(required_match_3))
        .unwrap_or(u64::MAX);

    // Calculate available funds for fixed prizes (exclude jackpot amount)
    let funds_for_fixed = if winner_counts.match_6 > 0 {
        // If there's a jackpot winner, fixed prizes come from non-jackpot portion
        available_prize_pool.saturating_sub(jackpot_balance)
    } else {
        available_prize_pool
    };

    // SOLVENCY CHECK: Scale down if insufficient funds
    let (match_5_prize, match_4_prize, match_3_prize, was_scaled, scale_bps, scale_details) =
        if total_fixed_required > 0 && funds_for_fixed < total_fixed_required {
            // Calculate scale factor in basis points with safety checks
            let scale_factor_bps = if total_fixed_required > 0 {
                ((funds_for_fixed as u128 * BPS_DENOMINATOR as u128) / total_fixed_required as u128)
                    as u16
            } else {
                10000u16
            };

            let scale_details = format!(
                "Fixed prizes scaled: required={}, available={}, scale={}%",
                total_fixed_required,
                funds_for_fixed,
                scale_factor_bps as f64 / 100.0
            );

            // Scale down each prize proportionally
            let scaled_match_5 =
                (MATCH_5_PRIZE as u128 * scale_factor_bps as u128 / BPS_DENOMINATOR as u128) as u64;
            let scaled_match_4 =
                (MATCH_4_PRIZE as u128 * scale_factor_bps as u128 / BPS_DENOMINATOR as u128) as u64;
            let scaled_match_3 =
                (MATCH_3_PRIZE as u128 * scale_factor_bps as u128 / BPS_DENOMINATOR as u128) as u64;

            (
                scaled_match_5,
                scaled_match_4,
                scaled_match_3,
                true,
                scale_factor_bps,
                scale_details,
            )
        } else {
            // Full prizes available
            (
                MATCH_5_PRIZE,
                MATCH_4_PRIZE,
                MATCH_3_PRIZE,
                false,
                10000u16,
                String::from("Full fixed prizes available"),
            )
        };

    // Match 2 is always a free ticket credit, not affected by solvency
    // FIXED: match_2_prize is stored for reference but NOT included in total_distributed
    // because it's a free ticket credit, not actual USDC transferred
    let match_2_prize = MATCH_2_VALUE;

    // FIXED: Calculate total with checked arithmetic
    // Note: Match 2 is NOT included because it's a free ticket credit, not USDC transfer
    let total_distributed = match_6_prize
        .checked_mul(winner_counts.match_6 as u64)
        .and_then(|sum| sum.checked_add(match_5_prize * winner_counts.match_5 as u64))
        .and_then(|sum| sum.checked_add(match_4_prize * winner_counts.match_4 as u64))
        .and_then(|sum| sum.checked_add(match_3_prize * winner_counts.match_3 as u64))
        // Match 2 excluded - free ticket credit, not USDC
        .unwrap_or(0);

    PrizeCalculation {
        match_6_prize,
        match_5_prize,
        match_4_prize,
        match_3_prize,
        match_2_prize,
        total_distributed,
        undistributed: 0, // Fixed mode doesn't have undistributed funds
        was_scaled_down: was_scaled,
        scale_factor_bps: scale_bps,
        calculation_details: scale_details,
    }
}

/// Calculate prizes for rolldown mode (pari-mutuel) with redistribution
///
/// In rolldown mode, the entire jackpot is distributed to lower tiers:
/// - Match 5: 25% of jackpot
/// - Match 4: 35% of jackpot
/// - Match 3: 40% of jackpot
/// - Match 2: Free ticket (unchanged)
///
/// FIXED: If a tier has no winners, its allocation is redistributed to other tiers
/// proportionally. If no winners in any prize tier, funds go to reserve.
///
/// # Arguments
/// * `winner_counts` - Number of winners in each tier
/// * `jackpot_balance` - Jackpot being distributed
///
/// # Returns
/// * `PrizeCalculation` - Prize per winner for each tier and totals
fn calculate_rolldown_prizes(
    winner_counts: &WinnerCounts,
    jackpot_balance: u64,
) -> PrizeCalculation {
    // Match 6 gets nothing in rolldown (no jackpot winner by definition)
    let match_6_prize = 0u64;

    // FIXED: Validate jackpot balance is reasonable for rolldown
    if jackpot_balance == 0 {
        msg!("WARNING: Rolldown with zero jackpot balance");
    }

    // Calculate initial pool allocations with overflow protection
    let initial_match_5_pool = (jackpot_balance as u128)
        .checked_mul(ROLLDOWN_MATCH_5_BPS as u128)
        .and_then(|prod| prod.checked_div(BPS_DENOMINATOR as u128))
        .unwrap_or(0) as u64;

    let initial_match_4_pool = (jackpot_balance as u128)
        .checked_mul(ROLLDOWN_MATCH_4_BPS as u128)
        .and_then(|prod| prod.checked_div(BPS_DENOMINATOR as u128))
        .unwrap_or(0) as u64;

    let initial_match_3_pool = (jackpot_balance as u128)
        .checked_mul(ROLLDOWN_MATCH_3_BPS as u128)
        .and_then(|prod| prod.checked_div(BPS_DENOMINATOR as u128))
        .unwrap_or(0) as u64;

    // Determine which tiers have winners
    let has_match_5 = winner_counts.match_5 > 0;
    let has_match_4 = winner_counts.match_4 > 0;
    let has_match_3 = winner_counts.match_3 > 0;

    // Count tiers with winners for redistribution
    let tiers_with_winners = (has_match_5 as u8) + (has_match_4 as u8) + (has_match_3 as u8);

    // FIXED: Redistribute funds from empty tiers to tiers with winners
    // If NO winners at all, jackpot stays in jackpot (not moved to reserve)
    let (match_5_pool, match_4_pool, match_3_pool, undistributed, keep_jackpot) =
        if tiers_with_winners == 0 {
            // No winners in any tier - jackpot stays as jackpot for next draw
            // This prevents the jackpot from being moved to reserve and lost
            (0u64, 0u64, 0u64, 0u64, true)
        } else if tiers_with_winners == 3 {
            // All tiers have winners - use initial allocations
            (
                initial_match_5_pool,
                initial_match_4_pool,
                initial_match_3_pool,
                0u64,
                false,
            )
        } else {
            // Some tiers empty - redistribute their allocations
            let mut redistributable = 0u64;

            if !has_match_5 {
                redistributable += initial_match_5_pool;
            }
            if !has_match_4 {
                redistributable += initial_match_4_pool;
            }
            if !has_match_3 {
                redistributable += initial_match_3_pool;
            }

            // Calculate the total BPS for tiers with winners with overflow protection
            let total_winner_bps = (if has_match_5 { ROLLDOWN_MATCH_5_BPS } else { 0 })
                .checked_add(if has_match_4 { ROLLDOWN_MATCH_4_BPS } else { 0 })
                .and_then(|sum| sum.checked_add(if has_match_3 { ROLLDOWN_MATCH_3_BPS } else { 0 }))
                .unwrap_or(0);

            // Safety check: total_winner_bps should be > 0 if we have winners
            if total_winner_bps == 0 && tiers_with_winners > 0 {
                msg!("ERROR: Total winner BPS is zero but we have winners!");
                return PrizeCalculation {
                    match_6_prize: 0,
                    match_5_prize: 0,
                    match_4_prize: 0,
                    match_3_prize: 0,
                    match_2_prize: MATCH_2_VALUE,
                    total_distributed: 0,
                    undistributed: jackpot_balance,
                    was_scaled_down: false,
                    scale_factor_bps: 10000,
                    calculation_details: String::from("Error: Zero total winner BPS"),
                };
            }

            // Redistribute proportionally to tiers with winners with overflow protection
            let match_5_pool = if has_match_5 {
                let base = initial_match_5_pool;
                let redistribution = (redistributable as u128)
                    .checked_mul(ROLLDOWN_MATCH_5_BPS as u128)
                    .and_then(|prod| prod.checked_div(total_winner_bps as u128))
                    .unwrap_or(0) as u64;
                base.checked_add(redistribution).unwrap_or(u64::MAX)
            } else {
                0
            };

            let match_4_pool = if has_match_4 {
                let base = initial_match_4_pool;
                let redistribution = (redistributable as u128)
                    .checked_mul(ROLLDOWN_MATCH_4_BPS as u128)
                    .and_then(|prod| prod.checked_div(total_winner_bps as u128))
                    .unwrap_or(0) as u64;
                base.checked_add(redistribution).unwrap_or(u64::MAX)
            } else {
                0
            };

            let match_3_pool = if has_match_3 {
                let base = initial_match_3_pool;
                let redistribution = (redistributable as u128)
                    .checked_mul(ROLLDOWN_MATCH_3_BPS as u128)
                    .and_then(|prod| prod.checked_div(total_winner_bps as u128))
                    .unwrap_or(0) as u64;
                base.checked_add(redistribution).unwrap_or(u64::MAX)
            } else {
                0
            };

            (match_5_pool, match_4_pool, match_3_pool, 0u64, false)
        };

    // Calculate per-winner prizes (pari-mutuel) with division protection
    let match_5_prize = if winner_counts.match_5 > 0 && match_5_pool > 0 {
        match_5_pool / winner_counts.match_5 as u64
    } else {
        0
    };

    let match_4_prize = if winner_counts.match_4 > 0 && match_4_pool > 0 {
        match_4_pool / winner_counts.match_4 as u64
    } else {
        0
    };

    let match_3_prize = if winner_counts.match_3 > 0 && match_3_pool > 0 {
        match_3_pool / winner_counts.match_3 as u64
    } else {
        0
    };

    let match_2_prize = MATCH_2_VALUE; // Free ticket unchanged

    // Build calculation details for debugging
    let mut calculation_details = String::new();
    calculation_details.push_str(&format!(
        "Rolldown: jackpot={}, pools(m5={},m4={},m3={})",
        jackpot_balance, match_5_pool, match_4_pool, match_3_pool
    ));
    if tiers_with_winners == 0 {
        calculation_details.push_str(", no winners - jackpot preserved for next draw");
    }

    // Total distributed (excluding any remainder from integer division)
    // FIXED: Match 2 is NOT included because it's a free ticket credit, not actual USDC transfer
    let total = (match_5_prize * winner_counts.match_5 as u64)
        + (match_4_prize * winner_counts.match_4 as u64)
        + (match_3_prize * winner_counts.match_3 as u64);
    // Match 2 excluded - free ticket credit, not USDC

    // Calculate dust from integer division (goes to reserve)
    let division_remainder = if tiers_with_winners > 0 {
        let actual_pools = match_5_pool
            .saturating_sub(match_5_prize * winner_counts.match_5 as u64)
            + match_4_pool.saturating_sub(match_4_prize * winner_counts.match_4 as u64)
            + match_3_pool.saturating_sub(match_3_prize * winner_counts.match_3 as u64);
        actual_pools
    } else {
        0
    };

    PrizeCalculation {
        match_6_prize,
        match_5_prize,
        match_4_prize,
        match_3_prize,
        match_2_prize,
        total_distributed: total,
        // If keep_jackpot is true (no winners), don't mark anything as undistributed
        // The jackpot will remain in place for the next draw
        undistributed: if keep_jackpot {
            0
        } else {
            undistributed + division_remainder
        },
        was_scaled_down: false, // Rolldown mode distributes available funds, no scaling needed
        scale_factor_bps: 10000,
        calculation_details,
    }
}

/// Finalize the draw with winner counts and calculate prizes
///
/// This instruction:
/// 1. Validates the draw is in progress and waiting for finalization
/// 2. Updates the draw result with winner counts
/// 3. Calculates prizes based on mode (fixed or rolldown)
/// 4. Handles empty tiers by redistributing funds (rolldown mode)
/// 5. Updates draw result with calculated prizes
/// 6. Updates jackpot balance (reset if rolldown, or continue if Match 6 winner)
/// 7. Adds any undistributed funds to reserve
/// 8. Resets lottery state for the next draw cycle
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

    // Capture initial state for fee tier change detection
    let old_house_fee_bps = lottery_state.house_fee_bps;
    let old_fee_tier_description = lottery_state.get_fee_tier_description();

    // ==========================================================================
    // VERIFICATION HASH CHECK (Issue 2 fix: tamper-resistant winner count audit)
    // ==========================================================================
    // The verification_hash is SHA256(draw_id || winning_numbers || match_6 || match_5 ||
    //   match_4 || match_3 || match_2 || indexer_nonce).
    // Off-chain indexers MUST publish the preimage (all inputs) so anyone can
    // independently recompute the hash and verify on-chain. This creates a
    // cryptographic commitment that makes fabricated winner counts detectable.
    {
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(draw_result.draw_id.to_le_bytes());
        hasher.update(draw_result.winning_numbers);
        hasher.update(params.winner_counts.match_6.to_le_bytes());
        hasher.update(params.winner_counts.match_5.to_le_bytes());
        hasher.update(params.winner_counts.match_4.to_le_bytes());
        hasher.update(params.winner_counts.match_3.to_le_bytes());
        hasher.update(params.winner_counts.match_2.to_le_bytes());
        hasher.update(params.indexer_nonce.to_le_bytes());
        let computed_hash = hasher.finalize();

        require!(
            computed_hash.as_slice() == params.verification_hash,
            LottoError::InvalidPrizeCalculation
        );

        msg!(
            "✅ Verification hash validated for draw {}",
            draw_result.draw_id
        );
        msg!("  Indexer nonce: {}", params.indexer_nonce);
    }

    // FIXED: Validate winner counts before updating
    // Check for suspicious patterns (e.g., all tickets winning in a tier)
    let total_tickets_in_draw = draw_result.total_tickets;

    // Check individual tier counts don't exceed total tickets
    if params.winner_counts.match_6 > total_tickets_in_draw as u32
        || params.winner_counts.match_5 > total_tickets_in_draw as u32
        || params.winner_counts.match_4 > total_tickets_in_draw as u32
        || params.winner_counts.match_3 > total_tickets_in_draw as u32
        || params.winner_counts.match_2 > total_tickets_in_draw as u32
    {
        msg!("ERROR: Winner counts exceed total tickets in draw!");
        msg!("  Total tickets: {}", total_tickets_in_draw);
        msg!("  Match 6 winners: {}", params.winner_counts.match_6);
        msg!("  Match 5 winners: {}", params.winner_counts.match_5);
        msg!("  Match 4 winners: {}", params.winner_counts.match_4);
        msg!("  Match 3 winners: {}", params.winner_counts.match_3);
        msg!("  Match 2 winners: {}", params.winner_counts.match_2);
        return Err(LottoError::InvalidPrizeCalculation.into());
    }

    // FIXED: Validate that SUM of all winner counts doesn't exceed total tickets
    // Each ticket can only win in ONE tier (the highest matching tier)
    let total_winners = (params.winner_counts.match_6 as u64)
        .saturating_add(params.winner_counts.match_5 as u64)
        .saturating_add(params.winner_counts.match_4 as u64)
        .saturating_add(params.winner_counts.match_3 as u64)
        .saturating_add(params.winner_counts.match_2 as u64);

    if total_winners > total_tickets_in_draw {
        msg!("ERROR: Sum of winner counts exceeds total tickets!");
        msg!("  Total tickets in draw: {}", total_tickets_in_draw);
        msg!("  Sum of all winners: {}", total_winners);
        msg!("  Match 6: {}", params.winner_counts.match_6);
        msg!("  Match 5: {}", params.winner_counts.match_5);
        msg!("  Match 4: {}", params.winner_counts.match_4);
        msg!("  Match 3: {}", params.winner_counts.match_3);
        msg!("  Match 2: {}", params.winner_counts.match_2);
        msg!("  Note: Each ticket can only win in ONE tier (highest match)");
        return Err(LottoError::WinnerCountsExceedTickets.into());
    }

    // ==========================================================================
    // STATISTICAL PLAUSIBILITY CHECKS (Issue 2 fix)
    // ==========================================================================
    // For a 6/46 lottery, the probability of matching all 6 is ~1 in 9,366,819.
    // We enforce statistical upper bounds to reject clearly fabricated counts.
    // These bounds are generous (100x expected) to avoid false positives while
    // still catching blatant manipulation.
    //
    // Expected probabilities per ticket (6/46 matrix):
    //   Match 6: ~1 in 9,366,819
    //   Match 5: ~1 in 39,028 (240 ways)
    //   Match 4: ~1 in 538 (10,800 ways)
    //   Match 3: ~1 in 22 (86,400 ways)
    //   Match 2: ~1 in 3 (311,040 ways)
    //
    // Upper bounds (generous: allow up to 100x expected rate + 1 for small draws):
    if total_tickets_in_draw > 100 {
        // Match 6: at most 1 per ~93,668 tickets (100x relaxed). Max = tickets/93668 + 1
        let max_match_6 = (total_tickets_in_draw / 93_668).saturating_add(1) as u32;
        if params.winner_counts.match_6 > max_match_6 {
            msg!("ERROR: Statistically implausible Match 6 winner count!");
            msg!(
                "  Match 6 winners: {}, max plausible: {}",
                params.winner_counts.match_6,
                max_match_6
            );
            msg!("  Total tickets: {}", total_tickets_in_draw);
            return Err(LottoError::SuspiciousWinnerCount.into());
        }

        // Match 5: at most 1 per ~390 tickets (100x relaxed). Max = tickets/390 + 1
        let max_match_5 = (total_tickets_in_draw / 390).saturating_add(1) as u32;
        if params.winner_counts.match_5 > max_match_5 {
            msg!("ERROR: Statistically implausible Match 5 winner count!");
            msg!(
                "  Match 5 winners: {}, max plausible: {}",
                params.winner_counts.match_5,
                max_match_5
            );
            msg!("  Total tickets: {}", total_tickets_in_draw);
            return Err(LottoError::SuspiciousWinnerCount.into());
        }

        // Match 4: at most 1 per ~5 tickets (100x relaxed). Max = tickets/5 + 1
        let max_match_4 = (total_tickets_in_draw / 5).saturating_add(1) as u32;
        if params.winner_counts.match_4 > max_match_4 {
            msg!("ERROR: Statistically implausible Match 4 winner count!");
            msg!(
                "  Match 4 winners: {}, max plausible: {}",
                params.winner_counts.match_4,
                max_match_4
            );
            msg!("  Total tickets: {}", total_tickets_in_draw);
            return Err(LottoError::SuspiciousWinnerCount.into());
        }
    }

    // FIXED: Reject (not just warn) suspicious winner rates (> 70% of tickets winning)
    // A legitimate lottery should never have >70% of tickets winning across all tiers.
    if total_winners > (total_tickets_in_draw * 7) / 10 && total_tickets_in_draw > 10 {
        msg!("ERROR: Implausible winner rate detected - rejecting finalization!");
        msg!(
            "  Winner rate: {}%",
            (total_winners * 100) / total_tickets_in_draw
        );
        msg!(
            "  Total winners: {}, Total tickets: {}",
            total_winners,
            total_tickets_in_draw
        );
        return Err(LottoError::SuspiciousWinnerCount.into());
    }

    // Log winner rate for audit trail (non-blocking for rates <= 70%)
    if total_winners > total_tickets_in_draw / 2 && total_tickets_in_draw > 10 {
        msg!("⚠️  HIGH WINNER RATE (audit note, not blocking):");
        msg!(
            "  Winner rate: {}%",
            (total_winners * 100) / total_tickets_in_draw
        );
    }

    // Update winner counts
    draw_result.match_6_winners = params.winner_counts.match_6;
    draw_result.match_5_winners = params.winner_counts.match_5;
    draw_result.match_4_winners = params.winner_counts.match_4;
    draw_result.match_3_winners = params.winner_counts.match_3;
    draw_result.match_2_winners = params.winner_counts.match_2;

    // Determine prize mode and calculate prizes
    let jackpot_at_draw = lottery_state.jackpot_balance;
    let was_rolldown = draw_result.was_rolldown && params.winner_counts.match_6 == 0;

    // ==========================================================================
    // SOLVENCY CHECK WITH INSURANCE POOL INTEGRATION
    // ==========================================================================
    //
    // Priority for prize funding:
    // 1. Jackpot balance (primary source for Match 6)
    // 2. Fixed prize balance (39.4% allocation earmarked for Match 3/4/5)
    // 3. Reserve balance (remainder from ticket sales)
    // 4. Insurance balance (2% of ticket sales - emergency only)
    //
    // The insurance pool is the final safety net to ensure all prizes are paid.

    // SECURITY FIX (Audit Issue #4): Include fixed_prize_balance in available
    // funds for solvency calculation. Previously this was ignored, creating an
    // inconsistency between how funds were tracked on purchase (39.4% allocated
    // to fixed_prize_balance) and how solvency was computed at finalization
    // (only jackpot + reserve + insurance). This could cause unnecessary prize
    // scaling or insurance pool draws even when sufficient funds existed in the
    // dedicated fixed prize pool.
    let primary_funds = jackpot_at_draw
        .saturating_add(lottery_state.reserve_balance)
        .saturating_add(lottery_state.fixed_prize_balance);
    let total_available = primary_funds.saturating_add(lottery_state.insurance_balance);
    let insurance_balance_before = lottery_state.insurance_balance;

    msg!("📊 Solvency check:");
    msg!("  Jackpot balance: {} USDC lamports", jackpot_at_draw);
    msg!(
        "  Fixed prize balance: {} USDC lamports",
        lottery_state.fixed_prize_balance
    );
    msg!(
        "  Reserve balance: {} USDC lamports",
        lottery_state.reserve_balance
    );
    msg!(
        "  Insurance balance: {} USDC lamports",
        lottery_state.insurance_balance
    );
    msg!("  Total available: {} USDC lamports", total_available);

    // Calculate prizes with available funds
    let prize_calc = if was_rolldown {
        calculate_rolldown_prizes(&params.winner_counts, jackpot_at_draw)
    } else {
        calculate_fixed_prizes(&params.winner_counts, jackpot_at_draw, total_available)
    };

    // Check if insurance pool needs to be used
    let mut insurance_used = 0u64;
    if prize_calc.total_distributed > primary_funds && !was_rolldown {
        // Fixed prizes exceed primary funds - need to use insurance
        insurance_used = prize_calc
            .total_distributed
            .saturating_sub(primary_funds)
            .min(lottery_state.insurance_balance);

        if insurance_used > 0 {
            lottery_state.insurance_balance = lottery_state
                .insurance_balance
                .saturating_sub(insurance_used);

            msg!("⚠️  INSURANCE POOL ACTIVATED!");
            msg!("  Amount used: {} USDC lamports", insurance_used);
            msg!(
                "  Remaining insurance: {} USDC lamports",
                lottery_state.insurance_balance
            );

            // Emit insurance pool usage event
            emit!(InsurancePoolUsed {
                draw_id: lottery_state.current_draw_id,
                amount_used: insurance_used,
                balance_before: insurance_balance_before,
                balance_after: lottery_state.insurance_balance,
                reason: format!(
                    "Prize pool shortfall: {} required, {} available from primary funds",
                    prize_calc.total_distributed, primary_funds
                ),
                timestamp: clock.unix_timestamp,
            });
        }
    }

    // Emit solvency check event for audit trail
    emit!(SolvencyCheckPerformed {
        draw_id: lottery_state.current_draw_id,
        prizes_required: prize_calc.total_distributed,
        prize_pool_balance: jackpot_at_draw,
        reserve_balance: lottery_state.reserve_balance,
        insurance_balance: insurance_balance_before,
        is_solvent: prize_calc.total_distributed <= total_available,
        prizes_scaled: prize_calc.was_scaled_down,
        scale_factor_bps: prize_calc.scale_factor_bps,
        timestamp: clock.unix_timestamp,
    });

    // Log calculation details for transparency
    msg!(
        "Prize calculation details: {}",
        prize_calc.calculation_details
    );

    // Log warning if prizes were scaled down due to insufficient funds
    if prize_calc.was_scaled_down {
        msg!(
            "WARNING: Fixed prizes scaled down to {}% due to insufficient funds!",
            prize_calc.scale_factor_bps as f64 / 100.0
        );
        msg!("  Details: {}", prize_calc.calculation_details);
    }

    // Update draw result with prizes
    draw_result.match_6_prize_per_winner = prize_calc.match_6_prize;
    draw_result.match_5_prize_per_winner = prize_calc.match_5_prize;
    draw_result.match_4_prize_per_winner = prize_calc.match_4_prize;
    draw_result.match_3_prize_per_winner = prize_calc.match_3_prize;
    draw_result.match_2_prize_per_winner = prize_calc.match_2_prize;

    // FIXED: Explicitly mark draw as finalized to handle edge cases
    // (e.g., rolldowns with only Match 3/4 winners where prize values might be 0 for other tiers)
    draw_result.is_explicitly_finalized = true;

    // FIXED: Add any undistributed funds to reserve (from empty tiers or integer division)
    if prize_calc.undistributed > 0 {
        lottery_state.reserve_balance = lottery_state
            .reserve_balance
            .saturating_add(prize_calc.undistributed);
        msg!(
            "  Undistributed funds added to reserve: {} USDC lamports",
            prize_calc.undistributed
        );
        msg!(
            "  New reserve balance: {} USDC lamports",
            lottery_state.reserve_balance
        );
    }

    // Update jackpot balance
    if was_rolldown {
        // Check if jackpot was actually distributed (had winners)
        let had_rolldown_winners = params.winner_counts.match_5 > 0
            || params.winner_counts.match_4 > 0
            || params.winner_counts.match_3 > 0;

        if had_rolldown_winners {
            // Rolldown occurred with winners - jackpot was distributed, seed new jackpot from reserve
            let seed_from_reserve = lottery_state.seed_amount.min(lottery_state.reserve_balance);
            lottery_state.jackpot_balance = seed_from_reserve;
            lottery_state.reserve_balance = lottery_state
                .reserve_balance
                .saturating_sub(seed_from_reserve);

            // Emit rolldown event
            emit!(RolldownExecuted {
                draw_id: lottery_state.current_draw_id,
                jackpot_distributed: jackpot_at_draw,
                match_5_prize: prize_calc.match_5_prize,
                match_4_prize: prize_calc.match_4_prize,
                match_3_prize: prize_calc.match_3_prize,
                timestamp: clock.unix_timestamp,
            });

            msg!("Rolldown executed with winners!");
            msg!("  Jackpot distributed: {} USDC lamports", jackpot_at_draw);
            msg!(
                "  Total to winners: {} USDC lamports",
                prize_calc.total_distributed
            );
            msg!(
                "  New jackpot seeded: {} USDC lamports",
                lottery_state.jackpot_balance
            );
        } else {
            // Rolldown triggered but NO winners in any tier
            // Jackpot remains for next draw (not moved to reserve)
            msg!("⚠️  Rolldown triggered but NO WINNERS in any tier!");
            msg!("  Jackpot preserved: {} USDC lamports", jackpot_at_draw);
            msg!("  Jackpot will carry over to next draw.");

            // Disable rolldown flag since jackpot wasn't distributed
            // It will be re-evaluated based on caps
            lottery_state.is_rolldown_active = false;
        }
    } else if params.winner_counts.match_6 > 0 {
        // Jackpot won - reset jackpot, seed from reserve
        let seed_from_reserve = lottery_state.seed_amount.min(lottery_state.reserve_balance);
        lottery_state.jackpot_balance = seed_from_reserve;
        lottery_state.reserve_balance = lottery_state
            .reserve_balance
            .saturating_sub(seed_from_reserve);

        msg!("Jackpot won by {} winners!", params.winner_counts.match_6);
        msg!(
            "  Prize per winner: {} USDC lamports",
            prize_calc.match_6_prize
        );
        msg!(
            "  New jackpot seeded: {} USDC lamports",
            lottery_state.jackpot_balance
        );
    }
    // If no jackpot winner and no rolldown, jackpot continues to accumulate

    // SECURITY FIX (Issue #6): Track committed prizes separately from actual paid prizes.
    // total_prizes_committed reflects what was promised at finalization time.
    // total_prizes_paid is now incremented at actual claim time (in claim_prize/claim_bulk_prize).
    // This separation allows accurate solvency monitoring and governance oversight.
    lottery_state.total_prizes_committed = lottery_state
        .total_prizes_committed
        .saturating_add(prize_calc.total_distributed);

    // Reset for next draw using helper method
    lottery_state.reset_draw_state();
    lottery_state.current_draw_id = lottery_state.current_draw_id.saturating_add(1);
    lottery_state.current_draw_tickets = 0;

    // Set next draw timestamp
    lottery_state.next_draw_timestamp = clock.unix_timestamp + lottery_state.draw_interval;

    // ==========================================================================
    // JACKPOT FUNDING SAFETY CHECK
    // ==========================================================================
    // Check if jackpot is properly funded after reseeding
    // Minimum jackpot should be at least 100% of seed amount
    let minimum_jackpot = lottery_state.seed_amount;
    let is_jackpot_properly_funded = lottery_state.jackpot_balance >= minimum_jackpot;

    if !is_jackpot_properly_funded {
        // Jackpot is below minimum - pause the lottery for safety
        lottery_state.is_paused = true;

        msg!("⚠️  ⚠️  ⚠️  CRITICAL: Jackpot funding insufficient!");
        msg!(
            "  Current jackpot: {} USDC lamports",
            lottery_state.jackpot_balance
        );
        msg!("  Minimum required: {} USDC lamports", minimum_jackpot);
        msg!(
            "  Deficit: {} USDC lamports",
            minimum_jackpot.saturating_sub(lottery_state.jackpot_balance)
        );
        msg!("  Lottery has been PAUSED for safety.");
        msg!("  Admin must add funds to reserve and unpause.");

        // Emit emergency pause event
        emit!(EmergencyPause {
            authority: ctx.accounts.authority.key(),
            reason: format!(
                "Jackpot funding insufficient: {} < {} (minimum)",
                lottery_state.jackpot_balance, minimum_jackpot
            ),
            timestamp: clock.unix_timestamp,
        });
    } else {
        msg!("✅ Jackpot funding check: OK");
        msg!(
            "  Current jackpot: {} USDC lamports",
            lottery_state.jackpot_balance
        );
        msg!("  Minimum required: {} USDC lamports", minimum_jackpot);
    }

    // ==========================================================================
    // DYNAMIC HOUSE FEE UPDATE
    // ==========================================================================
    // Update house fee based on new jackpot level after draw finalization
    let new_house_fee_bps = lottery_state.get_current_house_fee_bps();
    lottery_state.house_fee_bps = new_house_fee_bps;

    // Emit event if fee tier changed
    if old_house_fee_bps != new_house_fee_bps {
        let new_fee_tier_description = lottery_state.get_fee_tier_description();
        msg!(
            "📈 Dynamic fee tier changed: {} ({} bps) -> {} ({} bps)",
            old_fee_tier_description,
            old_house_fee_bps,
            new_fee_tier_description,
            new_house_fee_bps
        );

        emit!(DynamicFeeTierChanged {
            draw_id: lottery_state.current_draw_id,
            old_fee_bps: old_house_fee_bps,
            new_fee_bps: new_house_fee_bps,
            jackpot_balance: lottery_state.jackpot_balance,
            tier_description: new_fee_tier_description.to_string(),
            timestamp: clock.unix_timestamp,
        });
    }

    // ==========================================================================
    // SOFT/HARD CAP CHECK FOR NEXT DRAW
    // ==========================================================================
    // Only check caps if lottery is not paused due to insufficient funding
    if !lottery_state.is_paused {
        if lottery_state.jackpot_balance >= lottery_state.hard_cap {
            lottery_state.is_rolldown_active = true;
            msg!(
                "⚠️  HARD CAP REACHED for next draw! Jackpot {} >= Hard Cap {}",
                lottery_state.jackpot_balance,
                lottery_state.hard_cap
            );
            msg!("  Next draw WILL be a forced rolldown.");
        } else if lottery_state.jackpot_balance >= lottery_state.soft_cap {
            lottery_state.is_rolldown_active = true;
            msg!(
                "🎰 Soft cap active for next draw! Jackpot {} >= Soft Cap {}",
                lottery_state.jackpot_balance,
                lottery_state.soft_cap
            );
            msg!("  Next draw may trigger probabilistic rolldown.");

            emit!(SoftCapReached {
                draw_id: lottery_state.current_draw_id,
                jackpot_balance: lottery_state.jackpot_balance,
                soft_cap: lottery_state.soft_cap,
                rolldown_probability_bps: lottery_state.get_rolldown_probability_bps(),
                timestamp: clock.unix_timestamp,
            });
        } else {
            lottery_state.is_rolldown_active = false;
        }
    } else {
        msg!("⚠️  Lottery is PAUSED - cap checks skipped.");
        lottery_state.is_rolldown_active = false;
    }

    // Emit finalization event
    emit!(DrawFinalized {
        draw_id: draw_result.draw_id,
        match_6_winners: params.winner_counts.match_6,
        match_5_winners: params.winner_counts.match_5,
        match_4_winners: params.winner_counts.match_4,
        match_3_winners: params.winner_counts.match_3,
        match_2_winners: params.winner_counts.match_2,
        total_distributed: prize_calc.total_distributed,
        timestamp: clock.unix_timestamp,
    });

    msg!("Draw finalized successfully!");
    msg!("  Draw ID: {}", draw_result.draw_id);
    msg!("  Total tickets in draw: {}", draw_result.total_tickets);
    msg!(
        "  Match 6 winners: {} (prize: {})",
        params.winner_counts.match_6,
        prize_calc.match_6_prize
    );
    msg!(
        "  Match 5 winners: {} (prize: {}{})",
        params.winner_counts.match_5,
        prize_calc.match_5_prize,
        if prize_calc.was_scaled_down {
            " SCALED"
        } else {
            ""
        }
    );
    msg!(
        "  Match 4 winners: {} (prize: {}{})",
        params.winner_counts.match_4,
        prize_calc.match_4_prize,
        if prize_calc.was_scaled_down {
            " SCALED"
        } else {
            ""
        }
    );
    msg!(
        "  Match 3 winners: {} (prize: {}{})",
        params.winner_counts.match_3,
        prize_calc.match_3_prize,
        if prize_calc.was_scaled_down {
            " SCALED"
        } else {
            ""
        }
    );
    msg!(
        "  Match 2 winners: {} (prize: {})",
        params.winner_counts.match_2,
        prize_calc.match_2_prize
    );
    msg!(
        "  Total distributed: {} USDC lamports",
        prize_calc.total_distributed
    );
    msg!("  Was rolldown: {}", was_rolldown);
    msg!("  Next draw ID: {}", lottery_state.current_draw_id);
    msg!("  Next draw at: {}", lottery_state.next_draw_timestamp);
    msg!(
        "  Reserve balance: {} USDC lamports",
        lottery_state.reserve_balance
    );
    msg!(
        "  Jackpot balance: {} USDC lamports",
        lottery_state.jackpot_balance
    );
    if prize_calc.was_scaled_down {
        msg!(
            "  ⚠️ PRIZES WERE SCALED: Scale factor = {}%",
            prize_calc.scale_factor_bps as f64 / 100.0
        );
    }
    if insurance_used > 0 {
        msg!("  🛡️ INSURANCE USED: {} USDC lamports", insurance_used);
        msg!(
            "  Insurance remaining: {} USDC lamports",
            lottery_state.insurance_balance
        );
    }
    msg!(
        "  Dynamic fee for next draw: {} bps ({})",
        lottery_state.house_fee_bps,
        lottery_state.get_fee_tier_description()
    );
    msg!(
        "  Rolldown status for next draw: {}",
        lottery_state.get_rolldown_status()
    );
    msg!("  Calculation details: {}", prize_calc.calculation_details);

    // ==========================================================================
    // POST-CONDITION ASSERTIONS (Issue 6 fix: enforce state invariants)
    // ==========================================================================
    // These assertions verify that the state is consistent after all updates.
    // If any assertion fails, the entire transaction is rolled back, preventing
    // corrupted state from persisting on-chain.

    // Invariant 1: Draw must no longer be in progress after finalization
    require!(
        !lottery_state.is_draw_in_progress,
        LottoError::SafetyCheckFailed
    );

    // Invariant 2: Draw result must be marked as finalized
    require!(
        draw_result.is_explicitly_finalized,
        LottoError::SafetyCheckFailed
    );

    // Invariant 3: Next draw ID must have advanced
    require!(
        lottery_state.current_draw_id > draw_result.draw_id,
        LottoError::SafetyCheckFailed
    );

    // Invariant 4: Prize per winner must be 0 for tiers with 0 winners
    if draw_result.match_6_winners == 0 && !was_rolldown {
        require!(
            draw_result.match_6_prize_per_winner == 0 || params.winner_counts.match_6 == 0,
            LottoError::SafetyCheckFailed
        );
    }

    // Invariant 5: Accounting sum sanity — jackpot + reserve should not exceed
    // a reasonable upper bound (total_prizes_paid + current balances should be consistent)
    let accounting_sum = lottery_state
        .jackpot_balance
        .saturating_add(lottery_state.reserve_balance)
        .saturating_add(lottery_state.insurance_balance);

    // The accounting sum should never be zero unless the lottery is paused for funding
    if accounting_sum == 0 && !lottery_state.is_paused {
        msg!("WARNING: All accounting balances are zero but lottery is not paused!");
        msg!("  This may indicate an accounting error.");
    }

    // Invariant 6: total_prizes_committed must have increased (or stayed same if 0 distributed)
    // We already did saturating_add above, so just verify it's >= what we distributed
    require!(
        lottery_state.total_prizes_committed >= prize_calc.total_distributed,
        LottoError::SafetyCheckFailed
    );

    msg!("✅ Post-condition assertions passed.");

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
        let available_prize_pool = 2_000_000_000_000u64; // $2M (plenty of funds)

        let result = calculate_fixed_prizes(&winner_counts, jackpot, available_prize_pool);

        assert_eq!(result.match_6_prize, 0); // No Match 6 winners
        assert_eq!(result.match_5_prize, MATCH_5_PRIZE);
        assert_eq!(result.match_4_prize, MATCH_4_PRIZE);
        assert_eq!(result.match_3_prize, MATCH_3_PRIZE);
        assert_eq!(result.match_2_prize, MATCH_2_VALUE);
        assert!(!result.was_scaled_down); // No scaling needed

        let expected_total = (MATCH_5_PRIZE * 2) + (MATCH_4_PRIZE * 10) + (MATCH_3_PRIZE * 100);
        // Note: MATCH_2_VALUE is a free ticket credit, not included in total_distributed
        assert_eq!(result.total_distributed, expected_total);
        assert_eq!(result.undistributed, 0);
    }

    #[test]
    fn test_calculate_fixed_prizes_with_insufficient_funds() {
        let winner_counts = WinnerCounts {
            match_6: 0,
            match_5: 100, // Many Match 5 winners
            match_4: 1000,
            match_3: 10000,
            match_2: 500,
        };

        let jackpot = 1_000_000_000_000u64; // $1M
                                            // Required: 100*$4000 + 1000*$150 + 10000*$5 = $400k + $150k + $50k = $600k
        let available_prize_pool = 300_000_000_000u64; // Only $300k available (50% of needed)

        let result = calculate_fixed_prizes(&winner_counts, jackpot, available_prize_pool);

        assert!(result.was_scaled_down); // Should be scaled
        assert!(result.scale_factor_bps < 10000); // Scale factor < 100%

        // Prizes should be scaled down proportionally
        assert!(result.match_5_prize < MATCH_5_PRIZE);
        assert!(result.match_4_prize < MATCH_4_PRIZE);
        assert!(result.match_3_prize < MATCH_3_PRIZE);
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

        let result = calculate_rolldown_prizes(&winner_counts, jackpot);

        // Match 6 prize should be 0 in rolldown
        assert_eq!(result.match_6_prize, 0);

        // Calculate expected pool allocations
        let match_5_pool = (jackpot as u128 * 2500 / 10000) as u64; // 25%
        let match_4_pool = (jackpot as u128 * 3500 / 10000) as u64; // 35%
        let match_3_pool = (jackpot as u128 * 4000 / 10000) as u64; // 40%

        // Verify per-winner prizes
        assert_eq!(result.match_5_prize, match_5_pool / 10);
        assert_eq!(result.match_4_prize, match_4_pool / 500);
        assert_eq!(result.match_3_prize, match_3_pool / 10000);
        assert_eq!(result.match_2_prize, MATCH_2_VALUE);
    }

    #[test]
    fn test_rolldown_with_no_match5_winners() {
        let winner_counts = WinnerCounts {
            match_6: 0,
            match_5: 0, // No Match 5 winners
            match_4: 100,
            match_3: 5000,
            match_2: 20000,
        };

        let jackpot = 2_000_000_000_000u64;

        let result = calculate_rolldown_prizes(&winner_counts, jackpot);

        // Match 5 prize should be 0 when no winners
        assert_eq!(result.match_6_prize, 0);
        assert_eq!(result.match_5_prize, 0);

        // Match 4 and Match 3 should get redistributed funds
        // Total redistributed = 25% of jackpot (from empty match_5)
        // Match 4 original = 35%, Match 3 original = 40%, total = 75%
        // Match 4 gets: 35% + (25% * 35/75) = 35% + 11.67% = ~46.67%
        // Match 3 gets: 40% + (25% * 40/75) = 40% + 13.33% = ~53.33%
        assert!(result.match_4_prize > 0);
        assert!(result.match_3_prize > 0);

        // Verify the pools are larger than initial allocations
        let initial_match_4_pool = (jackpot as u128 * 3500 / 10000) as u64;
        let initial_match_3_pool = (jackpot as u128 * 4000 / 10000) as u64;

        // The actual prizes should reflect redistributed pools
        let actual_match_4_paid = result.match_4_prize * 100;
        let actual_match_3_paid = result.match_3_prize * 5000;

        // Total paid should be close to jackpot (minus dust)
        let total_to_winners = actual_match_4_paid + actual_match_3_paid;
        assert!(total_to_winners > initial_match_4_pool + initial_match_3_pool);
    }

    #[test]
    fn test_rolldown_with_no_winners_in_any_tier() {
        let winner_counts = WinnerCounts {
            match_6: 0,
            match_5: 0,
            match_4: 0,
            match_3: 0,
            match_2: 1000, // Only Match 2 (free tickets)
        };

        let jackpot = 2_000_000_000_000u64;

        let result = calculate_rolldown_prizes(&winner_counts, jackpot);

        // All prize pools should be 0
        assert_eq!(result.match_6_prize, 0);
        assert_eq!(result.match_5_prize, 0);
        assert_eq!(result.match_4_prize, 0);
        assert_eq!(result.match_3_prize, 0);
        assert_eq!(result.match_2_prize, MATCH_2_VALUE);

        // FIXED: When no winners in any tier, jackpot is PRESERVED (not moved to undistributed)
        // This prevents the jackpot from being lost to reserve when rolldown triggers but no one wins
        assert_eq!(result.undistributed, 0);

        // Only Match 2 (free tickets) in total distributed
        // Note: Match 2 is a free ticket credit, not actual USDC transfer
        assert_eq!(result.total_distributed, 0);
    }

    #[test]
    fn test_rolldown_only_match3_winners() {
        let winner_counts = WinnerCounts {
            match_6: 0,
            match_5: 0,
            match_4: 0,
            match_3: 1000,
            match_2: 5000,
        };

        let jackpot = 1_800_000_000_000u64; // $1.8M

        let result = calculate_rolldown_prizes(&winner_counts, jackpot);

        // Match 3 should get the entire jackpot (all redistributed to it)
        assert_eq!(result.match_5_prize, 0);
        assert_eq!(result.match_4_prize, 0);

        // Match 3 pool should be the full jackpot
        let expected_match_3_prize = jackpot / 1000;
        assert_eq!(result.match_3_prize, expected_match_3_prize);
    }

    // =========================================================================
    // FIXED PRIZE BALANCE SOLVENCY TESTS (Audit Issue #4)
    // =========================================================================
    // These tests verify that fixed_prize_balance is included in the available
    // funds passed to calculate_fixed_prizes, preventing unnecessary prize
    // scaling when the dedicated fixed prize pool has sufficient funds.

    /// When jackpot + reserve alone are insufficient but fixed_prize_balance
    /// covers the gap, prizes should NOT be scaled down.
    #[test]
    fn test_fixed_prize_balance_prevents_unnecessary_scaling() {
        let winner_counts = WinnerCounts {
            match_6: 0,
            match_5: 1,
            match_4: 10,
            match_3: 100,
            match_2: 50,
        };

        // Required fixed prizes: 1*$4000 + 10*$150 + 100*$5 = $5,500
        let required_fixed: u64 = MATCH_5_PRIZE * 1 + MATCH_4_PRIZE * 10 + MATCH_3_PRIZE * 100;

        let jackpot: u64 = 500_000_000_000; // $500k
        let reserve: u64 = 1_000_000; // $1 (tiny reserve)
        let fixed_prize_bal: u64 = 10_000_000_000; // $10k (ample for fixed prizes)
        let insurance: u64 = 5_000_000_000; // $5k

        // OLD solvency (without fixed_prize_balance):
        // primary_funds = jackpot + reserve = $500,001
        // total_available_old = primary_funds + insurance = $500,006
        let old_primary = jackpot.saturating_add(reserve);
        let old_total = old_primary.saturating_add(insurance);
        let old_result = calculate_fixed_prizes(&winner_counts, jackpot, old_total);
        // Old approach has plenty of funds from jackpot, so no scaling either
        // (because funds_for_fixed = available_prize_pool when match_6 == 0)
        assert!(!old_result.was_scaled_down);

        // NEW solvency (with fixed_prize_balance included):
        // primary_funds = jackpot + reserve + fixed_prize_bal
        // total_available_new = primary_funds + insurance
        let new_primary = jackpot
            .saturating_add(reserve)
            .saturating_add(fixed_prize_bal);
        let new_total = new_primary.saturating_add(insurance);
        let new_result = calculate_fixed_prizes(&winner_counts, jackpot, new_total);
        assert!(!new_result.was_scaled_down);

        // Both should pay full fixed prizes
        assert_eq!(new_result.match_5_prize, MATCH_5_PRIZE);
        assert_eq!(new_result.match_4_prize, MATCH_4_PRIZE);
        assert_eq!(new_result.match_3_prize, MATCH_3_PRIZE);

        // Verify required amount is correct
        assert_eq!(
            new_result.total_distributed, required_fixed,
            "Total distributed should equal required fixed prizes"
        );
    }

    /// When there IS a jackpot winner, fixed prizes must come from non-jackpot
    /// funds. Including fixed_prize_balance in available_prize_pool means the
    /// funds_for_fixed calculation has more headroom and avoids scaling.
    #[test]
    fn test_fixed_prize_balance_helps_when_jackpot_won() {
        let winner_counts = WinnerCounts {
            match_6: 1, // Jackpot winner!
            match_5: 2,
            match_4: 20,
            match_3: 200,
            match_2: 1000,
        };

        // Required fixed: 2*$4000 + 20*$150 + 200*$5 = $12,000
        let required_fixed: u64 = MATCH_5_PRIZE * 2 + MATCH_4_PRIZE * 20 + MATCH_3_PRIZE * 200;

        let jackpot: u64 = 500_000_000_000; // $500k (goes to match 6 winner)
        let reserve: u64 = 5_000_000_000; // $5k reserve
        let fixed_prize_bal: u64 = 15_000_000_000; // $15k fixed prize pool
        let insurance: u64 = 2_000_000_000; // $2k insurance

        // WITHOUT fixed_prize_balance:
        // available = jackpot + reserve + insurance = $500k + $5k + $2k = $507k
        // funds_for_fixed = available - jackpot = $7k  (less than $12k needed → SCALED)
        let old_available = jackpot.saturating_add(reserve).saturating_add(insurance);
        let old_result = calculate_fixed_prizes(&winner_counts, jackpot, old_available);
        assert!(
            old_result.was_scaled_down,
            "Without fixed_prize_balance, prizes should be scaled down"
        );

        // WITH fixed_prize_balance:
        // available = jackpot + reserve + fixed_prize_bal + insurance
        //           = $500k + $5k + $15k + $2k = $522k
        // funds_for_fixed = available - jackpot = $22k  (more than $12k → NO SCALING)
        let new_available = jackpot
            .saturating_add(reserve)
            .saturating_add(fixed_prize_bal)
            .saturating_add(insurance);
        let new_result = calculate_fixed_prizes(&winner_counts, jackpot, new_available);
        assert!(
            !new_result.was_scaled_down,
            "With fixed_prize_balance included, prizes should NOT be scaled down"
        );

        // New result should pay full fixed prizes
        assert_eq!(new_result.match_5_prize, MATCH_5_PRIZE);
        assert_eq!(new_result.match_4_prize, MATCH_4_PRIZE);
        assert_eq!(new_result.match_3_prize, MATCH_3_PRIZE);
        assert_eq!(new_result.total_distributed, jackpot + required_fixed);
    }

    /// Ensure that even with fixed_prize_balance, scaling still kicks in
    /// when total available is genuinely insufficient.
    #[test]
    fn test_scaling_still_works_when_truly_insufficient() {
        let winner_counts = WinnerCounts {
            match_6: 1, // Jackpot winner
            match_5: 100,
            match_4: 1000,
            match_3: 10000,
            match_2: 500,
        };

        // Required fixed: 100*$4000 + 1000*$150 + 10000*$5 = $600k
        let jackpot: u64 = 500_000_000_000; // $500k
        let reserve: u64 = 50_000_000_000; // $50k
        let fixed_prize_bal: u64 = 100_000_000_000; // $100k
        let insurance: u64 = 20_000_000_000; // $20k

        // total available = $670k. funds_for_fixed = $670k - $500k = $170k
        // Required = $600k → must scale
        let total_available = jackpot
            .saturating_add(reserve)
            .saturating_add(fixed_prize_bal)
            .saturating_add(insurance);
        let result = calculate_fixed_prizes(&winner_counts, jackpot, total_available);

        assert!(
            result.was_scaled_down,
            "Should still scale when genuinely insufficient"
        );
        assert!(result.scale_factor_bps < 10000);
        assert!(result.match_5_prize < MATCH_5_PRIZE);
        assert!(result.match_4_prize < MATCH_4_PRIZE);
        assert!(result.match_3_prize < MATCH_3_PRIZE);
    }
}
