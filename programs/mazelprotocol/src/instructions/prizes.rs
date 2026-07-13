//! Prize Calculation Module
//!
//! Extracted from finalize_draw.rs to keep the file manageable.
//! Contains prize calculation logic for both fixed (normal) mode and
//! pari-mutuel (rolldown) mode.
//!
//! # Prize Modes
//! - **Fixed Mode**: Match 5 = $4k, Match 4 = $150, Match 3 = $5
//!   Prizes are scaled down proportionally if the prize pool is insufficient.
//! - **Rolldown Mode**: 25% to Match 5, 35% to Match 4, 40% to Match 3
//!   Empty tiers have their allocations redistributed to tiers with winners.

use crate::constants::*;
use crate::state::WinnerCounts;
use anchor_lang::prelude::*;

/// Result of prize calculation
pub struct PrizeCalculation {
    pub match_6_prize: u64,
    pub match_5_prize: u64,
    pub match_4_prize: u64,
    pub match_3_prize: u64,
    pub match_2_prize: u64,
    pub total_distributed: u64,
    /// Funds that couldn't be distributed (no winners in tier)
    pub undistributed: u64,
    /// True if prizes were scaled down due to insufficient funds
    pub was_scaled_down: bool,
    /// Scale factor applied (10000 = 100%, no scaling)
    pub scale_factor_bps: u16,
    /// Detailed explanation of calculation for debugging
    pub calculation_details: String,
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
pub fn calculate_fixed_prizes(
    winner_counts: &WinnerCounts,
    jackpot_balance: u64,
    available_prize_pool: u64,
) -> PrizeCalculation {
    // Validate winner counts are reasonable
    let total_tickets_estimate = winner_counts
        .match_6
        .saturating_add(winner_counts.match_5)
        .saturating_add(winner_counts.match_4)
        .saturating_add(winner_counts.match_3)
        .saturating_add(winner_counts.match_2);

    // Sanity check: total winners shouldn't exceed typical statistical expectations
    // For a 6/46 lottery, expected winners per tier are very low
    if total_tickets_estimate > 1_000_000 {
        msg!("WARNING: Suspiciously high winner count: {}", total_tickets_estimate);
    }

    let match_6_prize =
        if winner_counts.match_6 > 0 { jackpot_balance / winner_counts.match_6 as u64 } else { 0 };

    // Calculate required funds for fixed prizes (excluding jackpot and free tickets)
    // Use checked arithmetic to prevent overflow
    let required_match_5 =
        MATCH_5_PRIZE.checked_mul(winner_counts.match_5 as u64).unwrap_or(u64::MAX);
    let required_match_4 =
        MATCH_4_PRIZE.checked_mul(winner_counts.match_4 as u64).unwrap_or(u64::MAX);
    let required_match_3 =
        MATCH_3_PRIZE.checked_mul(winner_counts.match_3 as u64).unwrap_or(u64::MAX);

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

            (scaled_match_5, scaled_match_4, scaled_match_3, true, scale_factor_bps, scale_details)
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
    let match_2_prize = MATCH_2_VALUE;

    // Calculate total with checked arithmetic
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
/// If a tier has no winners, its allocation is redistributed to other tiers
/// proportionally. If no winners in any prize tier, funds stay in jackpot.
///
/// # Arguments
/// * `winner_counts` - Number of winners in each tier
/// * `jackpot_balance` - Jackpot being distributed
///
/// # Returns
/// * `PrizeCalculation` - Prize per winner for each tier and totals
pub fn calculate_rolldown_prizes(
    winner_counts: &WinnerCounts,
    jackpot_balance: u64,
) -> PrizeCalculation {
    // Match 6 gets nothing in rolldown (no jackpot winner by definition)
    let match_6_prize = 0u64;

    // Validate jackpot balance is reasonable for rolldown
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

    // Redistribute funds from empty tiers to tiers with winners
    // If NO winners at all, jackpot stays in jackpot (not moved to reserve)
    let (match_5_pool, match_4_pool, match_3_pool, undistributed, keep_jackpot) =
        if tiers_with_winners == 0 {
            // No winners in any tier - jackpot stays as jackpot for next draw
            // This prevents the jackpot from being moved to reserve and lost
            (0u64, 0u64, 0u64, 0u64, true)
        } else if tiers_with_winners == 3 {
            // All tiers have winners - use initial allocations
            (initial_match_5_pool, initial_match_4_pool, initial_match_3_pool, 0u64, false)
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
    // Match 2 is NOT included because it's a free ticket credit, not actual USDC transfer
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
        undistributed: if keep_jackpot { 0 } else { undistributed + division_remainder },
        was_scaled_down: false, // Rolldown mode distributes available funds, no scaling needed
        scale_factor_bps: 10000,
        calculation_details,
    }
}
