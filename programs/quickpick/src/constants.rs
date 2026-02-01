//! Quick Pick Express Constants
//!
//! This module contains all constants specific to the Quick Pick Express lottery,
//! a high-frequency 5/35 matrix lottery running every 4 hours.

// ============================================================================
// PDA SEEDS
// ============================================================================

/// Seed for Quick Pick state PDA
pub const QUICK_PICK_SEED: &[u8] = b"quick_pick";
/// Seed for Quick Pick ticket PDA
pub const QUICK_PICK_TICKET_SEED: &[u8] = b"quick_pick_ticket";
/// Seed for Quick Pick draw result PDA
pub const QUICK_PICK_DRAW_SEED: &[u8] = b"quick_pick_draw";
/// Seed for Quick Pick prize pool USDC account
pub const PRIZE_POOL_USDC_SEED: &[u8] = b"prize_pool_usdc";
/// Seed for Quick Pick house fee USDC account
pub const HOUSE_FEE_USDC_SEED: &[u8] = b"house_fee_usdc";
/// Seed for Quick Pick insurance pool USDC account
pub const INSURANCE_POOL_USDC_SEED: &[u8] = b"insurance_pool_usdc";
/// Seed for user stats PDA (shared with main lottery for gate verification)
pub const USER_SEED: &[u8] = b"user";
/// Seed for main lottery state (used for authority verification)
pub const LOTTERY_SEED: &[u8] = b"lottery";

// ============================================================================
// GAME PARAMETERS (5/35 Matrix)
// ============================================================================

/// Quick Pick ticket price: $1.50 (in USDC lamports, 6 decimals)
pub const QUICK_PICK_TICKET_PRICE: u64 = 1_500_000;
/// Quick Pick: Pick 5 numbers
pub const QUICK_PICK_NUMBERS: u8 = 5;
/// Quick Pick: Range 1-35
pub const QUICK_PICK_RANGE: u8 = 35;
/// Quick Pick draw interval: 4 hours (14400 seconds)
pub const QUICK_PICK_INTERVAL: i64 = 14400;
/// Ticket sale cutoff before draw (5 minutes)
pub const TICKET_SALE_CUTOFF: i64 = 300;

// ============================================================================
// ACCESS GATE
// ============================================================================

/// Quick Pick minimum spend gate: $50 lifetime main lottery spend required
pub const QUICK_PICK_MIN_SPEND_GATE: u64 = 50_000_000;

// ============================================================================
// JACKPOT PARAMETERS
// ============================================================================

/// Quick Pick seed amount: $5,000 (in USDC lamports)
pub const QUICK_PICK_SEED_AMOUNT: u64 = 5_000_000_000;
/// Quick Pick soft cap: $30,000 (probabilistic rolldown begins)
pub const QUICK_PICK_SOFT_CAP: u64 = 30_000_000_000;
/// Quick Pick hard cap: $40,000 (forced rolldown)
pub const QUICK_PICK_HARD_CAP: u64 = 40_000_000_000;

// ============================================================================
// DYNAMIC FEE TIERS
// ============================================================================

/// Fee tier 1 threshold: $10,000
pub const QUICK_PICK_FEE_TIER_1_THRESHOLD: u64 = 10_000_000_000;
/// Fee tier 2 threshold: $20,000
pub const QUICK_PICK_FEE_TIER_2_THRESHOLD: u64 = 20_000_000_000;
/// Fee tier 3 threshold: $30,000 (soft cap)
pub const QUICK_PICK_FEE_TIER_3_THRESHOLD: u64 = 30_000_000_000;

/// Fee tier 1: 30% (jackpot < $10k)
pub const QUICK_PICK_FEE_TIER_1_BPS: u16 = 3000;
/// Fee tier 2: 33% ($10k <= jackpot < $20k)
pub const QUICK_PICK_FEE_TIER_2_BPS: u16 = 3300;
/// Fee tier 3: 36% ($20k <= jackpot < $30k)
pub const QUICK_PICK_FEE_TIER_3_BPS: u16 = 3600;
/// Fee tier 4: 38% (jackpot >= $30k)
pub const QUICK_PICK_FEE_TIER_4_BPS: u16 = 3800;
/// Fee during rolldown: 28%
pub const QUICK_PICK_FEE_ROLLDOWN_BPS: u16 = 2800;

// ============================================================================
// FIXED PRIZES (Normal Mode)
// ============================================================================

/// Match 5 (Jackpot): Variable (accumulated jackpot)
/// Match 4 prize: $100
pub const QUICK_PICK_MATCH_4_PRIZE: u64 = 100_000_000;
/// Match 3 prize: $4
pub const QUICK_PICK_MATCH_3_PRIZE: u64 = 4_000_000;

// ============================================================================
// ROLLDOWN ALLOCATION (Pari-Mutuel Mode)
// ============================================================================

/// Rolldown allocation to Match 4 winners: 60%
pub const QUICK_PICK_ROLLDOWN_MATCH_4_BPS: u16 = 6000;
/// Rolldown allocation to Match 3 winners: 40%
pub const QUICK_PICK_ROLLDOWN_MATCH_3_BPS: u16 = 4000;

// ============================================================================
// TICKET REVENUE ALLOCATION
// ============================================================================

/// Allocation to jackpot pool: 60%
pub const QUICK_PICK_JACKPOT_ALLOCATION_BPS: u16 = 6000;
/// Allocation to fixed prize pool: 37%
pub const QUICK_PICK_FIXED_PRIZE_ALLOCATION_BPS: u16 = 3700;
/// Allocation to insurance pool: 3%
pub const QUICK_PICK_INSURANCE_ALLOCATION_BPS: u16 = 300;

// ============================================================================
// SYSTEM LIMITS
// ============================================================================

/// Basis points denominator (10000 = 100%)
pub const BPS_DENOMINATOR: u64 = 10000;
/// Ticket claim expiration: 90 days (in seconds)
pub const TICKET_CLAIM_EXPIRATION: i64 = 90 * 24 * 60 * 60;

// ============================================================================
// ACCOUNT SIZES
// ============================================================================

/// Quick Pick State account size
pub const QUICK_PICK_STATE_SIZE: usize = 8 +   // discriminator
    8 +    // current_draw
    8 +    // ticket_price
    1 +    // pick_count
    1 +    // number_range
    2 +    // house_fee_bps
    8 +    // draw_interval
    8 +    // next_draw_timestamp
    8 +    // jackpot_balance
    8 +    // soft_cap
    8 +    // hard_cap
    8 +    // seed_amount
    8 +    // match_4_prize
    8 +    // match_3_prize
    8 +    // current_draw_tickets
    8 +    // prize_pool_balance
    8 +    // insurance_balance
    1 +    // is_rolldown_pending
    1 +    // is_paused
    1 +    // bump
    32; // padding

/// Quick Pick Ticket account size
pub const QUICK_PICK_TICKET_SIZE: usize = 8 +  // discriminator
    32 +   // owner
    8 +    // draw_id
    5 +    // numbers (5 bytes for 5/35)
    8 +    // purchase_timestamp
    1 +    // is_claimed
    1 +    // match_count
    8 +    // prize_amount
    1 +    // bump
    8; // padding

/// Quick Pick Draw Result account size
pub const QUICK_PICK_DRAW_RESULT_SIZE: usize = 8 +  // discriminator
    8 +    // draw_id
    5 +    // winning_numbers (5 numbers for 5/35)
    32 +   // randomness_proof
    8 +    // timestamp
    8 +    // total_tickets
    1 +    // was_rolldown
    4 +    // match_5_winners
    4 +    // match_4_winners
    4 +    // match_3_winners
    8 +    // match_5_prize_per_winner (jackpot)
    8 +    // match_4_prize_per_winner
    8 +    // match_3_prize_per_winner
    1 +    // is_explicitly_finalized
    1 +    // bump
    16; // padding

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/// Calculate Quick Pick dynamic house fee based on jackpot level
///
/// Fee tiers:
/// - Rolldown active: 28%
/// - Jackpot < $10k: 30%
/// - $10k <= Jackpot < $20k: 33%
/// - $20k <= Jackpot < $30k: 36%
/// - Jackpot >= $30k: 38%
///
/// # Arguments
/// * `jackpot_balance` - Current jackpot balance in USDC lamports
/// * `is_rolldown` - Whether rolldown is currently active
///
/// # Returns
/// * House fee in basis points (100 bps = 1%)
pub fn calculate_quick_pick_house_fee_bps(jackpot_balance: u64, is_rolldown: bool) -> u16 {
    if is_rolldown {
        return QUICK_PICK_FEE_ROLLDOWN_BPS;
    }

    if jackpot_balance < QUICK_PICK_FEE_TIER_1_THRESHOLD {
        QUICK_PICK_FEE_TIER_1_BPS
    } else if jackpot_balance < QUICK_PICK_FEE_TIER_2_THRESHOLD {
        QUICK_PICK_FEE_TIER_2_BPS
    } else if jackpot_balance < QUICK_PICK_FEE_TIER_3_THRESHOLD {
        QUICK_PICK_FEE_TIER_3_BPS
    } else {
        QUICK_PICK_FEE_TIER_4_BPS
    }
}

/// Validate Quick Pick numbers (5 unique numbers from 1-35)
///
/// # Arguments
/// * `numbers` - Array of 5 numbers to validate
///
/// # Returns
/// * `bool` - True if numbers are valid
pub fn validate_quick_pick_numbers(numbers: &[u8; 5]) -> bool {
    // Check each number is in valid range
    for &num in numbers.iter() {
        if num < 1 || num > QUICK_PICK_RANGE {
            return false;
        }
    }

    // Check for duplicates
    let mut sorted = *numbers;
    sorted.sort();
    for i in 0..4 {
        if sorted[i] == sorted[i + 1] {
            return false;
        }
    }

    true
}

/// Calculate fixed prize for a given match count (Normal Mode)
///
/// # Arguments
/// * `match_count` - Number of matching numbers (0-5)
///
/// # Returns
/// * Prize amount in USDC lamports (0 if no prize)
pub fn calculate_quick_pick_fixed_prize(match_count: u8) -> u64 {
    match match_count {
        4 => QUICK_PICK_MATCH_4_PRIZE,
        3 => QUICK_PICK_MATCH_3_PRIZE,
        _ => 0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_quick_pick_numbers_valid() {
        let numbers = [1, 15, 20, 30, 35];
        assert!(validate_quick_pick_numbers(&numbers));
    }

    #[test]
    fn test_validate_quick_pick_numbers_unsorted() {
        let numbers = [35, 1, 20, 15, 30];
        assert!(validate_quick_pick_numbers(&numbers));
    }

    #[test]
    fn test_validate_quick_pick_numbers_out_of_range_zero() {
        let numbers = [0, 15, 20, 30, 35];
        assert!(!validate_quick_pick_numbers(&numbers));
    }

    #[test]
    fn test_validate_quick_pick_numbers_out_of_range_high() {
        let numbers = [1, 15, 20, 30, 36];
        assert!(!validate_quick_pick_numbers(&numbers));
    }

    #[test]
    fn test_validate_quick_pick_numbers_duplicates() {
        let numbers = [1, 15, 15, 30, 35];
        assert!(!validate_quick_pick_numbers(&numbers));
    }

    #[test]
    fn test_calculate_quick_pick_house_fee_bps() {
        // Rolldown should always return 28%
        assert_eq!(calculate_quick_pick_house_fee_bps(0, true), 2800);
        assert_eq!(
            calculate_quick_pick_house_fee_bps(50_000_000_000, true),
            2800
        );

        // Tier 1: < $10k = 30%
        assert_eq!(calculate_quick_pick_house_fee_bps(0, false), 3000);
        assert_eq!(
            calculate_quick_pick_house_fee_bps(9_999_999_999, false),
            3000
        );

        // Tier 2: $10k-$20k = 33%
        assert_eq!(
            calculate_quick_pick_house_fee_bps(10_000_000_000, false),
            3300
        );
        assert_eq!(
            calculate_quick_pick_house_fee_bps(19_999_999_999, false),
            3300
        );

        // Tier 3: $20k-$30k = 36%
        assert_eq!(
            calculate_quick_pick_house_fee_bps(20_000_000_000, false),
            3600
        );
        assert_eq!(
            calculate_quick_pick_house_fee_bps(29_999_999_999, false),
            3600
        );

        // Tier 4: >= $30k = 38%
        assert_eq!(
            calculate_quick_pick_house_fee_bps(30_000_000_000, false),
            3800
        );
        assert_eq!(
            calculate_quick_pick_house_fee_bps(50_000_000_000, false),
            3800
        );
    }

    #[test]
    fn test_calculate_quick_pick_fixed_prize() {
        assert_eq!(calculate_quick_pick_fixed_prize(5), 0); // Jackpot is variable
        assert_eq!(calculate_quick_pick_fixed_prize(4), 100_000_000); // $100
        assert_eq!(calculate_quick_pick_fixed_prize(3), 4_000_000); // $4
        assert_eq!(calculate_quick_pick_fixed_prize(2), 0);
        assert_eq!(calculate_quick_pick_fixed_prize(1), 0);
        assert_eq!(calculate_quick_pick_fixed_prize(0), 0);
    }
}
