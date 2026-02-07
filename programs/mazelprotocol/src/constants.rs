//! SolanaLotto Protocol - Constants
//!
//! This module contains all the configuration constants for the lottery protocol,
//! including game parameters, fee tiers, prize structures, and system limits.

// ============================================================================
// PROGRAM SEEDS
// ============================================================================

/// PDA seed for the lottery state account
pub const LOTTERY_SEED: &[u8] = b"lottery";
/// PDA seed for individual tickets
pub const TICKET_SEED: &[u8] = b"ticket";
/// PDA seed for draw results
pub const DRAW_SEED: &[u8] = b"draw";
/// PDA seed for user statistics
pub const USER_SEED: &[u8] = b"user";
/// PDA seed for staking accounts (future feature)
pub const STAKE_SEED: &[u8] = b"stake";
/// PDA seed for syndicates
pub const SYNDICATE_SEED: &[u8] = b"syndicate";
/// PDA seed for lucky numbers NFTs
pub const LUCKY_NUMBERS_SEED: &[u8] = b"lucky_numbers";
/// PDA seed for quick pick express
pub const QUICK_PICK_SEED: &[u8] = b"quick_pick";
/// PDA seed for syndicate wars
pub const SYNDICATE_WARS_SEED: &[u8] = b"syndicate_wars";
/// PDA seed for unified ticket accounts (bulk purchases)
pub const UNIFIED_TICKET_SEED: &[u8] = b"unified_ticket";
/// PDA seed for prize pool USDC token account
pub const PRIZE_POOL_USDC_SEED: &[u8] = b"prize_pool_usdc";
/// PDA seed for house fee USDC token account
pub const HOUSE_FEE_USDC_SEED: &[u8] = b"house_fee_usdc";
/// PDA seed for insurance pool USDC token account
pub const INSURANCE_POOL_USDC_SEED: &[u8] = b"insurance_pool_usdc";

// ============================================================================
// GAME PARAMETERS (Main 6/46 Lottery)
// ============================================================================

/// Ticket price in USDC lamports ($2.50 = 2,500,000 lamports with 6 decimals)
pub const TICKET_PRICE: u64 = 2_500_000;

/// Number of numbers to pick per ticket
pub const NUMBERS_PER_TICKET: usize = 6;

/// Minimum valid lottery number
pub const MIN_NUMBER: u8 = 1;

/// Maximum valid lottery number (6/46 matrix)
pub const MAX_NUMBER: u8 = 46;

/// Draw interval in seconds (24 hours)
pub const DRAW_INTERVAL: i64 = 86400;

/// Time before draw when ticket sales close (1 hour before draw)
pub const TICKET_SALE_CUTOFF: i64 = 3600;

/// Timeout for draw commit (1 hour) - if reveal doesn't happen, draw can be cancelled
pub const DRAW_COMMIT_TIMEOUT: i64 = 3600;

/// Ticket claim expiration period (90 days in seconds)
/// After this period from draw execution, tickets can no longer be claimed
/// Set to 0 to disable expiration (tickets can be claimed forever)
pub const TICKET_CLAIM_EXPIRATION: i64 = 90 * 24 * 60 * 60; // 90 days

// ============================================================================
// DYNAMIC FEE TIERS
// ============================================================================

/// Fee tier 1 threshold: $500,000
pub const FEE_TIER_1_THRESHOLD: u64 = 500_000_000_000;
/// Fee tier 2 threshold: $1,000,000
pub const FEE_TIER_2_THRESHOLD: u64 = 1_000_000_000_000;
/// Fee tier 3 threshold: $1,500,000
pub const FEE_TIER_3_THRESHOLD: u64 = 1_500_000_000_000;

/// Fee tier 1: 28% (jackpot < $500k)
pub const FEE_TIER_1_BPS: u16 = 2800;
/// Fee tier 2: 32% ($500k - $1M)
pub const FEE_TIER_2_BPS: u16 = 3200;
/// Fee tier 3: 36% ($1M - $1.5M)
pub const FEE_TIER_3_BPS: u16 = 3600;
/// Fee tier 4: 40% (> $1.5M)
pub const FEE_TIER_4_BPS: u16 = 4000;
/// Fee during rolldown: 28%
pub const FEE_ROLLDOWN_BPS: u16 = 2800;

// ============================================================================
// JACKPOT CAPS (Rolldown System)
// ============================================================================

/// Soft cap: $1,750,000 - Probabilistic rolldown begins
pub const SOFT_CAP: u64 = 1_750_000_000_000;
/// Hard cap: $2,250,000 - Forced rolldown
pub const HARD_CAP: u64 = 2_250_000_000_000;
/// Jackpot cap (same as soft cap for display purposes)
pub const JACKPOT_CAP: u64 = 1_750_000_000_000;
/// Initial seed amount: $500,000
pub const SEED_AMOUNT: u64 = 500_000_000_000;

// ============================================================================
// PRIZE ALLOCATION (Basis Points - 10000 = 100%)
// ============================================================================

/// Jackpot allocation: 55.6%
pub const JACKPOT_ALLOCATION_BPS: u16 = 5560;
/// Fixed prize allocation: 39.4%
pub const FIXED_PRIZE_ALLOCATION_BPS: u16 = 3940;
/// Reserve allocation: 3%
pub const RESERVE_ALLOCATION_BPS: u16 = 300;
/// Insurance pool allocation: 2%
pub const INSURANCE_ALLOCATION_BPS: u16 = 200;

// ============================================================================
// FIXED PRIZES (Normal Mode)
// ============================================================================

/// Match 5 prize: $4,000
pub const MATCH_5_PRIZE: u64 = 4_000_000_000;
/// Match 4 prize: $150
pub const MATCH_4_PRIZE: u64 = 150_000_000;
/// Match 3 prize: $5
pub const MATCH_3_PRIZE: u64 = 5_000_000;
/// Match 2 value: $2.50 (free ticket)
pub const MATCH_2_VALUE: u64 = 2_500_000;

// ============================================================================
// ROLLDOWN ALLOCATION (Basis Points - Percentage of Jackpot)
// ============================================================================

/// Match 5 rolldown allocation: 25%
pub const ROLLDOWN_MATCH_5_BPS: u16 = 2500;
/// Match 4 rolldown allocation: 35%
pub const ROLLDOWN_MATCH_4_BPS: u16 = 3500;
/// Match 3 rolldown allocation: 40%
pub const ROLLDOWN_MATCH_3_BPS: u16 = 4000;

// ============================================================================
// QUICK PICK EXPRESS PARAMETERS (5/35 Matrix)
// ============================================================================

/// Quick Pick ticket price: $1.50
pub const QUICK_PICK_TICKET_PRICE: u64 = 1_500_000;
/// Quick Pick: Pick 5 numbers
pub const QUICK_PICK_NUMBERS: u8 = 5;
/// Quick Pick: Range 1-35
pub const QUICK_PICK_RANGE: u8 = 35;
/// Quick Pick draw interval: 4 hours (14400 seconds)
pub const QUICK_PICK_INTERVAL: i64 = 14400;

/// Quick Pick minimum spend gate: $50 lifetime main lottery spend required
pub const QUICK_PICK_MIN_SPEND_GATE: u64 = 50_000_000;

/// Quick Pick seed amount: $5,000
pub const QUICK_PICK_SEED_AMOUNT: u64 = 5_000_000_000;
/// Quick Pick soft cap: $30,000
pub const QUICK_PICK_SOFT_CAP: u64 = 30_000_000_000;
/// Quick Pick hard cap: $50,000
pub const QUICK_PICK_HARD_CAP: u64 = 50_000_000_000;

// Quick Pick Fee Tiers
pub const QUICK_PICK_FEE_TIER_1_THRESHOLD: u64 = 10_000_000_000; // $10,000
pub const QUICK_PICK_FEE_TIER_2_THRESHOLD: u64 = 20_000_000_000; // $20,000
pub const QUICK_PICK_FEE_TIER_3_THRESHOLD: u64 = 30_000_000_000; // $30,000
pub const QUICK_PICK_FEE_TIER_1_BPS: u16 = 3000; // 30%
pub const QUICK_PICK_FEE_TIER_2_BPS: u16 = 3300; // 33%
pub const QUICK_PICK_FEE_TIER_3_BPS: u16 = 3600; // 36%
pub const QUICK_PICK_FEE_TIER_4_BPS: u16 = 3800; // 38%
pub const QUICK_PICK_FEE_ROLLDOWN_BPS: u16 = 2800; // 28%

// Quick Pick Fixed Prizes (Normal Mode)
pub const QUICK_PICK_MATCH_4_PRIZE: u64 = 100_000_000; // $100
pub const QUICK_PICK_MATCH_3_PRIZE: u64 = 4_000_000; // $4

// Quick Pick Rolldown Allocation
pub const QUICK_PICK_ROLLDOWN_MATCH_4_BPS: u16 = 6000; // 60%
pub const QUICK_PICK_ROLLDOWN_MATCH_3_BPS: u16 = 4000; // 40%

// Quick Pick Prize Pool Allocation
pub const QUICK_PICK_JACKPOT_ALLOCATION_BPS: u16 = 6000; // 60%
pub const QUICK_PICK_FIXED_PRIZE_ALLOCATION_BPS: u16 = 3700; // 37%
pub const QUICK_PICK_INSURANCE_ALLOCATION_BPS: u16 = 300; // 3%

// ============================================================================
// ADVANCED FEATURES
// ============================================================================

/// Lucky Numbers NFT bonus: 1% of jackpot
pub const LUCKY_NUMBERS_BONUS_BPS: u16 = 100;
/// Minimum match tier to receive Lucky Numbers NFT
pub const LUCKY_NUMBERS_MIN_MATCH: u8 = 4;

/// Syndicate Wars prize pool allocation: 1% of monthly sales
pub const SYNDICATE_WARS_POOL_BPS: u16 = 100;
/// Minimum tickets to qualify for Syndicate Wars
pub const SYNDICATE_WARS_MIN_TICKETS: u64 = 1000;

// ============================================================================
// SYSTEM LIMITS
// ============================================================================

/// Maximum tickets per bulk purchase for individual users
pub const MAX_BULK_TICKETS: usize = 50;
/// Maximum tickets per bulk purchase for syndicates
pub const MAX_SYNDICATE_BULK_TICKETS: usize = 150;
/// Maximum members per syndicate
pub const MAX_SYNDICATE_MEMBERS: usize = 100;
/// Maximum syndicate name length (UTF-8 bytes)
pub const MAX_SYNDICATE_NAME_LENGTH: usize = 32;
/// Maximum manager fee for syndicates: 5%
pub const MAX_MANAGER_FEE_BPS: u16 = 500;
/// Maximum tickets per draw per user
pub const MAX_TICKETS_PER_DRAW_PER_USER: u64 = 5000;
/// Maximum free tickets a user can accumulate
pub const MAX_FREE_TICKETS: u64 = 1000;
/// Basis points denominator
pub const BPS_DENOMINATOR: u64 = 10000;

// ============================================================================
// ACCOUNT SIZES
// ============================================================================

/// LotteryState account size
pub const LOTTERY_STATE_SIZE: usize = 8 + // discriminator
    32 + // authority
    33 + // pending_authority (Option<Pubkey>)
    32 + // switchboard_queue
    32 + // current_randomness_account
    8 +  // current_draw_id
    8 +  // jackpot_balance
    8 +  // reserve_balance
    8 +  // insurance_balance
    8 +  // fixed_prize_balance (dedicated tracked fixed prize pool)
    8 +  // ticket_price
    2 +  // house_fee_bps
    8 +  // jackpot_cap
    8 +  // seed_amount
    8 +  // soft_cap
    8 +  // hard_cap
    8 +  // next_draw_timestamp
    8 +  // draw_interval
    8 +  // commit_slot
    8 +  // commit_timestamp
    8 +  // current_draw_tickets
    8 +  // total_tickets_sold
    8 +  // total_prizes_paid (actual USDC transfers at claim time)
    8 +  // total_prizes_committed (committed at finalization time)
    1 +  // is_draw_in_progress
    1 +  // is_rolldown_active
    1 +  // is_paused
    1 +  // is_funded
    1 +  // bump
    8 +  // config_timelock_end (Issue 5 fix: timelock for config changes)
    32 + // pending_config_hash (Issue 5 fix: hash of pending config)
    8 +  // emergency_transfer_total (rolling window aggregate)
    8 +  // emergency_transfer_window_start (window start timestamp)
    0; // no padding remaining (was 24, consumed by new fields: 8+8+8=24)

/// Minimum timelock delay for config changes: 24 hours (in seconds)
pub const CONFIG_TIMELOCK_DELAY: i64 = 86400;

/// DrawResult account size
pub const DRAW_RESULT_SIZE: usize = 8 + // discriminator
    8 +  // draw_id
    6 +  // winning_numbers
    32 + // randomness_proof (32 bytes for signature)
    8 +  // timestamp
    8 +  // total_tickets
    1 +  // was_rolldown
    4 +  // match_6_winners
    4 +  // match_5_winners
    4 +  // match_4_winners
    4 +  // match_3_winners
    4 +  // match_2_winners
    8 +  // match_6_prize_per_winner
    8 +  // match_5_prize_per_winner
    8 +  // match_4_prize_per_winner
    8 +  // match_3_prize_per_winner
    8 +  // match_2_prize_per_winner
    1 +  // is_explicitly_finalized
    8 +  // total_committed (Fix #3: per-draw reclaim accounting)
    8 +  // total_reclaimed (Fix #3: per-draw reclaim accounting)
    1 +  // bump
    16; // padding (reduced from 32 to accommodate new fields)

/// Ticket account size
pub const TICKET_SIZE: usize = 8 + // discriminator
    32 + // owner
    8 +  // draw_id
    6 +  // numbers
    8 +  // purchase_timestamp
    1 +  // is_claimed
    1 +  // match_count
    8 +  // prize_amount
    33 + // syndicate (Option<Pubkey>)
    1 +  // bump
    8; // padding

/// UserStats account size
pub const USER_STATS_SIZE: usize = 8 + // discriminator
    32 + // wallet
    8 +  // total_tickets
    8 +  // total_spent
    8 +  // total_won
    4 +  // current_streak
    4 +  // best_streak
    4 +  // jackpot_wins
    8 +  // last_draw_participated
    8 +  // tickets_this_draw
    4 +  // free_tickets_available
    1 +  // bump
    16; // padding

/// Syndicate base account size (without members)
pub const SYNDICATE_BASE_SIZE: usize = 8 + // discriminator
    32 + // creator
    32 + // original_creator (immutable, used for PDA seed derivation)
    8 +  // syndicate_id
    32 + // name
    1 +  // is_public
    4 +  // member_count
    8 +  // total_contribution
    2 +  // manager_fee_bps
    32 + // usdc_account
    4 +  // members vec length
    1 +  // bump
    16; // padding

/// Size per syndicate member
pub const SYNDICATE_MEMBER_SIZE: usize = 32 + // wallet
    8 +  // contribution
    2 +  // share_percentage_bps
    8; // unclaimed_prize (snapshot-based distribution to prevent race condition)

/// Maximum aggregate emergency transfer amount per 24-hour rolling window.
/// Set to 20% of hard cap. This prevents a compromised authority from
/// draining the prize pool through repeated small emergency transfers.
pub const EMERGENCY_TRANSFER_DAILY_CAP_BPS: u64 = 2000; // 20% of hard cap per 24h window

/// Duration of the emergency transfer rolling window in seconds (24 hours).
pub const EMERGENCY_TRANSFER_WINDOW_DURATION: i64 = 86400;

/// Quick Pick state account size
pub const QUICK_PICK_STATE_SIZE: usize = 8 + // discriminator
    8 +  // current_draw
    8 +  // ticket_price
    1 +  // pick_count
    1 +  // number_range
    2 +  // house_fee_bps
    8 +  // draw_interval
    8 +  // next_draw_timestamp
    8 +  // jackpot_balance
    8 +  // soft_cap
    8 +  // hard_cap
    8 +  // seed_amount
    8 +  // match_4_prize
    8 +  // match_3_prize
    8 +  // current_draw_tickets
    8 +  // prize_pool_balance
    8 +  // insurance_balance
    1 +  // is_rolldown_pending
    1 +  // is_paused
    1 +  // bump
    32; // padding

/// Quick Pick ticket size
pub const QUICK_PICK_TICKET_SIZE: usize = 8 + // discriminator
    32 + // owner
    8 +  // draw_id
    5 +  // numbers (5 numbers for 5/35)
    8 +  // purchase_timestamp
    1 +  // is_claimed
    1 +  // match_count
    8 +  // prize_amount
    1 +  // bump
    8; // padding

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/// Calculate dynamic house fee based on jackpot level
pub fn calculate_house_fee_bps(jackpot_balance: u64, is_rolldown: bool) -> u16 {
    if is_rolldown {
        return FEE_ROLLDOWN_BPS;
    }

    if jackpot_balance < FEE_TIER_1_THRESHOLD {
        FEE_TIER_1_BPS
    } else if jackpot_balance < FEE_TIER_2_THRESHOLD {
        FEE_TIER_2_BPS
    } else if jackpot_balance < FEE_TIER_3_THRESHOLD {
        FEE_TIER_3_BPS
    } else {
        FEE_TIER_4_BPS
    }
}

/// Calculate Quick Pick dynamic house fee based on jackpot level
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

/// Calculate rolldown probability (basis points) based on jackpot level
/// Returns value between 0 and 10000 (0% to 100%)
///
/// # Edge Cases Handled:
/// - SOFT_CAP == HARD_CAP: Returns 100% probability
/// - range == 0: Returns 100% probability
/// - jackpot_balance between SOFT_CAP and HARD_CAP: Linear interpolation
/// - Overflow protection with u128 arithmetic
pub fn calculate_rolldown_probability_bps(jackpot_balance: u64) -> u16 {
    // Safety check: validate caps configuration
    if SOFT_CAP > HARD_CAP {
        // Invalid configuration: soft cap exceeds hard cap
        return 0;
    }

    if jackpot_balance < SOFT_CAP {
        return 0;
    }

    if jackpot_balance >= HARD_CAP || SOFT_CAP == HARD_CAP {
        return BPS_DENOMINATOR as u16; // 100%
    }

    // Linear interpolation between soft cap and hard cap
    let excess = jackpot_balance.saturating_sub(SOFT_CAP);
    let range = HARD_CAP.saturating_sub(SOFT_CAP);

    if range == 0 {
        // No range between caps, use 100% probability
        return BPS_DENOMINATOR as u16;
    }

    // Use u128 arithmetic to prevent overflow with detailed calculation
    let numerator = excess as u128 * BPS_DENOMINATOR as u128;
    let denominator = range as u128;

    // Safety check: denominator should never be 0 here due to earlier checks
    if denominator == 0 {
        // Denominator should never be zero due to earlier checks
        return BPS_DENOMINATOR as u16;
    }

    let probability = (numerator / denominator) as u16;

    // Clamp to valid range [0, 10000]
    probability.min(BPS_DENOMINATOR as u16)
}

/// Validate lottery numbers (6/46 matrix)
pub fn validate_lottery_numbers(numbers: &[u8; 6]) -> bool {
    // Check range for each number
    for &num in numbers.iter() {
        if num < MIN_NUMBER || num > MAX_NUMBER {
            return false;
        }
    }

    // Check uniqueness by sorting and comparing adjacent elements
    let mut sorted = *numbers;
    sorted.sort();

    // Verify all numbers are unique and sorted
    for i in 0..5 {
        if sorted[i] >= sorted[i + 1] {
            return false; // Duplicate or not properly sorted
        }
    }

    true
}

/// Validate Quick Pick numbers (5/35 matrix)
pub fn validate_quick_pick_numbers(numbers: &[u8; 5]) -> bool {
    // Check range for each number
    for &num in numbers.iter() {
        if num < MIN_NUMBER || num > QUICK_PICK_RANGE {
            return false;
        }
    }

    // Check uniqueness by sorting and comparing adjacent elements
    let mut sorted = *numbers;
    sorted.sort();

    // Verify all numbers are unique and sorted
    for i in 0..4 {
        if sorted[i] >= sorted[i + 1] {
            return false; // Duplicate or not properly sorted
        }
    }

    true
}

/// Calculate match count between ticket numbers and winning numbers
///
/// # Assumptions:
/// - Both arrays are sorted in ascending order
/// - Both arrays contain unique numbers
/// - Arrays are of valid length (6 for lottery, 5 for quick pick)
///
/// # Returns:
/// - Number of matching numbers (0-6 for lottery, 0-5 for quick pick)
pub fn calculate_match_count(ticket_numbers: &[u8], winning_numbers: &[u8]) -> u8 {
    // Safety check: ensure arrays are not empty
    if ticket_numbers.is_empty() || winning_numbers.is_empty() {
        return 0;
    }

    // Use two-pointer technique for O(n) complexity since arrays are sorted
    let mut matches = 0u8;
    let mut i = 0usize;
    let mut j = 0usize;

    while i < ticket_numbers.len() && j < winning_numbers.len() {
        match ticket_numbers[i].cmp(&winning_numbers[j]) {
            std::cmp::Ordering::Less => i += 1,
            std::cmp::Ordering::Greater => j += 1,
            std::cmp::Ordering::Equal => {
                matches += 1;
                i += 1;
                j += 1;
            }
        }
    }

    matches
}

/// Calculate fixed prize amount based on match count (Normal Mode)
pub fn calculate_fixed_prize(match_count: u8) -> u64 {
    match match_count {
        5 => MATCH_5_PRIZE,
        4 => MATCH_4_PRIZE,
        3 => MATCH_3_PRIZE,
        2 => MATCH_2_VALUE, // Free ticket
        _ => 0,
    }
}

/// Calculate Quick Pick fixed prize based on match count
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
    fn test_validate_lottery_numbers_valid() {
        let valid_numbers = [1, 10, 20, 30, 40, 46];
        assert!(validate_lottery_numbers(&valid_numbers));
    }

    #[test]
    fn test_validate_lottery_numbers_out_of_range() {
        let invalid_numbers = [0, 10, 20, 30, 40, 46]; // 0 is invalid
        assert!(!validate_lottery_numbers(&invalid_numbers));

        let invalid_numbers = [1, 10, 20, 30, 40, 47]; // 47 is invalid
        assert!(!validate_lottery_numbers(&invalid_numbers));
    }

    #[test]
    fn test_validate_lottery_numbers_duplicates() {
        let duplicate_numbers = [1, 10, 10, 30, 40, 46];
        assert!(!validate_lottery_numbers(&duplicate_numbers));
    }

    #[test]
    fn test_calculate_match_count() {
        let ticket = [1, 2, 3, 4, 5, 6];
        let winning = [1, 2, 3, 7, 8, 9];
        assert_eq!(calculate_match_count(&ticket, &winning), 3);

        let winning_all = [1, 2, 3, 4, 5, 6];
        assert_eq!(calculate_match_count(&ticket, &winning_all), 6);

        let winning_none = [7, 8, 9, 10, 11, 12];
        assert_eq!(calculate_match_count(&ticket, &winning_none), 0);
    }

    #[test]
    fn test_calculate_house_fee_bps() {
        assert_eq!(calculate_house_fee_bps(0, false), FEE_TIER_1_BPS);
        assert_eq!(
            calculate_house_fee_bps(500_000_000_000, false),
            FEE_TIER_2_BPS
        );
        assert_eq!(
            calculate_house_fee_bps(1_000_000_000_000, false),
            FEE_TIER_3_BPS
        );
        assert_eq!(
            calculate_house_fee_bps(2_000_000_000_000, false),
            FEE_TIER_4_BPS
        );
        assert_eq!(
            calculate_house_fee_bps(2_000_000_000_000, true),
            FEE_ROLLDOWN_BPS
        );
    }

    #[test]
    fn test_calculate_rolldown_probability_bps() {
        assert_eq!(calculate_rolldown_probability_bps(0), 0);
        assert_eq!(calculate_rolldown_probability_bps(SOFT_CAP), 0);
        assert_eq!(calculate_rolldown_probability_bps(HARD_CAP), 10000);

        // At midpoint between soft and hard cap, probability should be 50%
        let midpoint = SOFT_CAP + (HARD_CAP - SOFT_CAP) / 2;
        assert_eq!(calculate_rolldown_probability_bps(midpoint), 5000);
    }
}
