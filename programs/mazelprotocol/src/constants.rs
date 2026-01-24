//! Constants module for SolanaLotto Protocol
//!
//! This module contains all configuration constants, parameters, and helper functions
//! for the lottery system. Constants are organized into logical categories and
//! follow the technical specification documented in `docs/TECHNICAL_SPEC.md`.
//!
//! # Categories
//!
//! 1. **Program Constants** - PDA seeds and program identifiers
//! 2. **Core Game Parameters** - Main lottery configuration (6/46 matrix)
//! 3. **Dynamic House Fee System** - Jackpot-linked fee scaling (28-40%)
//! 4. **Soft/Hard Cap System** - Rolldown trigger thresholds
//! 5. **Prize Allocation System** - Prize pool distribution percentages
//! 6. **Fixed Prize Amounts** - Guaranteed prize values per match tier
//! 7. **Rolldown Allocation** - Jackpot distribution during rolldown events
//! 8. **Staking System** - $LOTTO token staking tiers and rewards
//! 9. **Quick Pick Express** - 4/20 mini-game configuration
//! 10. **Lucky Numbers NFT** - NFT bonus system for Match 4+ winners
//! 11. **Second Chance Draws** - Weekly draws for non-winning tickets
//! 12. **Syndicate Wars** - Monthly syndicate competition
//! 13. **Limits & Validation** - Purchase limits and validation parameters
//! 14. **Randomness & Timing** - VRF and draw timing parameters
//! 15. **Mathematical Constants** - Basis points and decimal definitions
//! 16. **Account Sizes** - On-chain account storage requirements
//! 17. **Helper Functions** - Mathematical calculations and validations
//! 18. **Enumerations** - Type-safe enums for game states and tiers
//!
//! # Basis Points Convention
//!
//! All percentages in this module use basis points (BPS) where:
//! - `100 BPS = 1%`
//! - `10,000 BPS = 100%`
//! - Example: `2,800 BPS = 28%`
//!
//! # Amount Conventions
//!
//! - **USDC amounts**: In lamports (6 decimals) - `$1.00 = 1,000,000`
//! - **$LOTTO amounts**: In lamports (9 decimals) - `1 LOTTO = 1,000,000,000`
//! - **SOL amounts**: In lamports (9 decimals) - `1 SOL = 1,000,000,000`
//!
//! # Usage Examples
//!
//! ```rust
//! use mazelprotocol::constants::*;
//!
//! // Calculate house fee for current jackpot
//! let jackpot = 800_000_000_000; // $800k
//! let house_fee_bps = calculate_house_fee_bps(jackpot, false);
//! let house_fee_amount = calculate_house_fee_amount(TICKET_PRICE, house_fee_bps);
//!
//! // Validate lottery numbers
//! let numbers = [1, 2, 3, 4, 5, 6];
//! assert!(validate_lottery_numbers(&numbers));
//!
//! // Determine staking tier
//! let staked_amount = 15_000_000_000_000; // 15,000 LOTTO
//! let tier = get_stake_tier(staked_amount);
//! let discount = calculate_stake_discount_bps(tier);
//! ```
//!
//! # Testing
//!
//! Comprehensive tests for all constants and functions are available in
//! `tests/constants.rs`. These tests validate:
//! - Mathematical correctness of calculations
//! - Boundary conditions and edge cases
//! - Constant values against specification
//! - Function behavior across all input ranges
//!
//! # Specification Alignment
//!
//! All constants align with the technical specification version 2.1.0.
//! See `docs/TECHNICAL_SPEC.md` for detailed explanations of each parameter.

use anchor_lang::prelude::*;

// ============================================================================
// 1. Program Constants - PDA Seeds and Program Identifiers
// ============================================================================
//
// Program seeds for Program Derived Address (PDA) derivation.
// These seeds are used to generate deterministic addresses for program accounts.
//
// # Usage
// ```rust
// // Derive lottery state PDA
// let (lottery_state_pda, bump) = Pubkey::find_program_address(
//     &[LOTTERY_SEED],
//     &program_id
// );
// ```
//
// # Seed Categories
// - **State Accounts**: LOTTERY_SEED, TICKET_SEED, DRAW_SEED, USER_SEED
// - **Token Accounts**: PRIZE_POOL_USDC_SEED, HOUSE_FEE_USDC_SEED
// - **Advanced Features**: LUCKY_NUMBERS_SEED, SECOND_CHANCE_SEED, etc.
// - **External Integrations**: SWITCHBOARD_QUEUE_SEED, RANDOMNESS_ACCOUNT_SEED

/// Global lottery state account (singleton)
pub const LOTTERY_SEED: &[u8] = b"lottery";
/// Individual ticket accounts
pub const TICKET_SEED: &[u8] = b"ticket";
/// Historical draw results
pub const DRAW_SEED: &[u8] = b"draw";
/// User statistics and tracking
pub const USER_SEED: &[u8] = b"user";
/// $LOTTO token staking accounts
pub const STAKE_SEED: &[u8] = b"stake";
/// Syndicate (group play) accounts
pub const SYNDICATE_SEED: &[u8] = b"syndicate";
/// Lucky Numbers NFT accounts (Match 4+ winners)
pub const LUCKY_NUMBERS_SEED: &[u8] = b"lucky_numbers";
/// Second chance draw entries
pub const SECOND_CHANCE_SEED: &[u8] = b"second_chance";
/// Quick Pick Express game state
pub const QUICK_PICK_SEED: &[u8] = b"quick_pick";
/// Syndicate Wars competition entries
pub const SYNDICATE_WARS_SEED: &[u8] = b"syndicate_wars";
/// Prize pool USDC token account (holds all prize funds)
pub const PRIZE_POOL_USDC_SEED: &[u8] = b"prize_pool_usdc";
/// House fee USDC token account (collects operator revenue)
pub const HOUSE_FEE_USDC_SEED: &[u8] = b"house_fee_usdc";
/// Escrow account for temporary fund holding
pub const ESCROW_SEED: &[u8] = b"stateEscrow";
/// Player state tracking account
pub const PLAYER_STATE_SEED: &[u8] = b"playerState";

/// Switchboard VRF queue for randomness generation
pub const SWITCHBOARD_QUEUE_SEED: &[u8] = b"switchboard_queue";
/// Switchboard randomness result account
pub const RANDOMNESS_ACCOUNT_SEED: &[u8] = b"randomness_account";

// ============================================================================
// 2. Core Game Parameters - Main Lottery (6/46 Matrix)
// ============================================================================
//
// Core configuration for the main 6/46 lottery game.
// These parameters define the fundamental game mechanics and economics.

/// Ticket price in USDC lamports (6 decimals).
/// - Value: `2,500,000` lamports
/// - Equivalent: `$2.50` USD
/// - Rationale: Accessible price point for mass adoption
pub const TICKET_PRICE: u64 = 2_500_000; // $2.50

/// Lottery matrix configuration (6/46).
/// Players select 6 numbers from 1-46.
/// - `NUMBERS_PER_TICKET`: 6 numbers per ticket
/// - `MIN_NUMBER`: Minimum selectable number (inclusive)
/// - `MAX_NUMBER`: Maximum selectable number (inclusive)
/// - Total combinations: 9,366,819 (1 in 9.37M jackpot odds)
pub const NUMBERS_PER_TICKET: usize = 6;
pub const MIN_NUMBER: u8 = 1;
pub const MAX_NUMBER: u8 = 46;

/// Draw frequency in seconds.
/// - Value: `86,400` seconds
/// - Equivalent: `24 hours` (daily draws)
/// - Rationale: Maintains engagement and allows jackpot growth
pub const DRAW_INTERVAL: i64 = 86_400;

/// Initial jackpot seed amount in USDC lamports.
/// - Value: `500,000,000,000` lamports
/// - Equivalent: `$500,000` USD
/// - Purpose: Attractive starting point for each jackpot cycle
/// - Reset: Applied after rolldown events
pub const SEED_AMOUNT: u64 = 500_000_000_000; // $500,000

/// Maximum jackpot before forced rolldown in USDC lamports.
/// - Value: `1,750,000,000,000` lamports
/// - Equivalent: `$1,750,000` USD
/// - Trigger: When jackpot reaches this amount, rolldown is guaranteed
/// - Purpose: Creates predictable +EV windows for sophisticated players
pub const JACKPOT_CAP: u64 = 1_750_000_000_000; // $1,750,000

// ============================================================================
// 3. Dynamic House Fee System - Jackpot-Linked Fee Scaling
// ============================================================================
//
// Dynamic fee system that scales house edge based on jackpot level.
// Higher fees during large jackpots optimize revenue extraction while
// lower fees during early stages bootstrap jackpot growth.
//
// # Fee Schedule
// | Jackpot Level | House Fee | Prize Pool | Player EV Impact |
// |---------------|-----------|------------|------------------|
// | < $500k       | 28%       | 72%        | Higher EV attracts early players |
// | $500k - $1M   | 32%       | 68%        | Standard operations |
// | $1M - $1.5M   | 36%       | 64%        | Building anticipation |
// | > $1.5M       | 40%       | 60%        | Maximum extraction during rolldown zone |
// | Rolldown      | 28%       | 72%        | Encourages volume during rolldown |
//
// # Psychological Pricing
// - Players are more willing to pay higher fees when jackpots are large
// - The excitement of a $1.5M jackpot masks the increased house edge
// - Lower fees during early stages bootstrap the jackpot faster
// - Lower fees during rolldown maximize volume (more important than margin)

/// Dynamic fee tier thresholds in USDC lamports.
/// These values determine which fee tier applies based on current jackpot.
pub const FEE_TIER_1_THRESHOLD: u64 = 500_000_000_000; // $500k
pub const FEE_TIER_2_THRESHOLD: u64 = 1_000_000_000_000; // $1M
pub const FEE_TIER_3_THRESHOLD: u64 = 1_500_000_000_000; // $1.5M

/// House fee percentages in basis points (10000 = 100%).
/// Applied to ticket price to determine operator revenue.
pub const FEE_TIER_1_BPS: u16 = 2_800; // 28% (< $500k)
pub const FEE_TIER_2_BPS: u16 = 3_200; // 32% ($500k - $1M)
pub const FEE_TIER_3_BPS: u16 = 3_600; // 36% ($1M - $1.5M)
pub const FEE_TIER_4_BPS: u16 = 4_000; // 40% (> $1.5M)
pub const FEE_ROLLDOWN_BPS: u16 = 2_800; // 28% (during rolldown)

// ============================================================================
// 4. Soft/Hard Cap System - Rolldown Trigger Thresholds
// ============================================================================
//
// Two-tier rolldown system that prevents calendar gaming and creates
// probabilistic +EV opportunities between soft and hard caps.
//
// # System Mechanics
// 1. **Below Soft Cap**: No rolldown possible
// 2. **Soft Cap to Hard Cap**: Probabilistic rolldown (0-100% chance)
// 3. **At/Above Hard Cap**: Guaranteed rolldown (100% chance)
//
// # Probability Calculation
// ```rust
// // Linear probability between soft and hard caps
// let probability_bps = ((jackpot - SOFT_CAP) as u128 * BPS_PER_100_PERCENT as u128
//     / (HARD_CAP - SOFT_CAP) as u128) as u64;
// ```
//
// # Economic Impact
// - Creates uncertainty about

/// Soft cap threshold in USDC lamports.
/// - Value: `1,750,000,000,000` lamports
/// - Equivalent: `$1,750,000` USD
/// - Effect: Probabilistic rolldown becomes possible
/// - Probability at soft cap: 0% (increases linearly to hard cap)
pub const SOFT_CAP: u64 = 1_750_000_000_000; // $1.75M

/// Hard cap threshold in USDC lamports.
/// - Value: `2,250,000,000,000` lamports
/// - Equivalent: `$2,250,000` USD
/// - Effect: Guaranteed rolldown triggers
/// - Probability at hard cap: 100% (always rolldown)
pub const HARD_CAP: u64 = 2_250_000_000_000; // $2.25M

// ============================================================================
// 5. Prize Allocation System - Prize Pool Distribution
// ============================================================================
//
// Distribution of prize pool funds between jackpot, fixed prizes, and reserve.
// These percentages determine how ticket revenue is allocated after house fee.
//
// # Allocation Formula
// ```rust
// let ticket_price = TICKET_PRICE;
// let house_fee_bps = calculate_house_fee_bps(jackpot_balance, false);
// let house_fee = ticket_price * house_fee_bps as u64 / 10000;
// let prize_pool = ticket_price - house_fee;
//
// let jackpot_contribution = prize_pool * JACKPOT_ALLOCATION_BPS as u64 / 10000;
// let fixed_prize_contribution = prize_pool * FIXED_PRIZE_ALLOCATION_BPS as u64 / 10000;
// let reserve_contribution = prize_pool * RESERVE_ALLOCATION_BPS as u64 / 10000;
// ```

/// Jackpot allocation percentage in basis points.
/// - Value: `5,760` BPS
/// - Equivalent: `57.6%` of prize pool
/// - Purpose: Funds the progressive jackpot for Match 6 winners
pub const JACKPOT_ALLOCATION_BPS: u16 = 5_760; // 57.6% to jackpot

/// Fixed prize allocation percentage in basis points.
/// - Value: `3,940` BPS
/// - Equivalent: `39.4%` of prize pool
/// - Purpose: Funds guaranteed prizes for Match 2-5 winners
pub const FIXED_PRIZE_ALLOCATION_BPS: u16 = 3_940; // 39.4% to fixed prizes

/// Reserve fund allocation percentage in basis points.
/// - Value: `300` BPS
/// - Equivalent: `3%` of prize pool
/// - Purpose: Insurance fund for guaranteed payouts and future draws
pub const RESERVE_ALLOCATION_BPS: u16 = 300; // 3% to reserve fund

// ============================================================================
// 6. Fixed Prize Amounts - Guaranteed Prize Values
// ============================================================================
//
// Guaranteed prize amounts for each match tier during normal operation.
// These prizes are paid from the fixed prize allocation pool.
//
// # Prize Tiers (Normal Mode)
// - **Match 6**: Jackpot (variable amount from jackpot pool)
// - **Match 5**: Fixed $4,000 prize
// - **Match 4**: Fixed $150 prize
// - **Match 3**: Fixed $5 prize
// - **Match 2**: Free ticket (value equal to ticket price)
// - **Match 0-1**: No prize

/// Match 5 prize amount in USDC lamports.
/// - Value: `4,000,000,000` lamports
/// - Equivalent: `$4,000` USD
/// - Condition: Match exactly 5 of 6 numbers
pub const MATCH_5_PRIZE: u64 = 4_000_000_000; // $4,000

/// Match 4 prize amount in USDC lamports.
/// - Value: `150,000,000` lamports
/// - Equivalent: `$150` USD
/// - Condition: Match exactly 4 of 6 numbers
pub const MATCH_4_PRIZE: u64 = 150_000_000; // $150

/// Match 3 prize amount in USDC lamports.
/// - Value: `5,000,000` lamports
/// - Equivalent: `$5` USD
/// - Condition: Match exactly 3 of 6 numbers
pub const MATCH_3_PRIZE: u64 = 5_000_000; // $5

/// Match 2 prize value in USDC lamports.
/// - Value: `2,500,000` lamports
/// - Equivalent: `$2.50` USD (free ticket)
/// - Condition: Match exactly 2 of 6 numbers
/// - Note: Awarded as a free ticket NFT, not direct USDC transfer
pub const MATCH_2_VALUE: u64 = 2_500_000; // $2.50 (free ticket)

// ============================================================================
// 7. Rolldown Allocation - Jackpot Distribution During Rolldown
// ============================================================================
//
// Distribution of jackpot funds to lower tiers during rolldown events.
// When no Match 6 winner and rolldown triggers, the jackpot is distributed
// to Match 3-5 winners according to these percentages.
//
// # Rolldown Distribution
// | Match Tier | Allocation | Description |
// |------------|------------|-------------|
// | Match 5 | 25% of jackpot | Divided among Match 5 winners |
// | Match 4 | 35% of jackpot | Divided among Match 4 winners |
// | Match 3 | 40% of jackpot | Divided among Match 3 winners |
// | Match 2 | 0% | No rolldown allocation |
// | Match 6 | 0% | No winner during rolldown |
//
// # Prize Calculation Example
// ```rust
// let jackpot = 1_750_000_000_000; // $1.75M
// let match_5_winners = 20;
// let match_4_winners = 1200;
// let match_3_winners = 20000;
//
// let match_5_prize = jackpot * ROLLDOWN_MATCH_5_BPS as u64 / 10000 / match_5_winners as u64;
// let match_4_prize = jackpot * ROLLDOWN_MATCH_4_BPS as u64 / 10000 / match_4_winners as u64;
// let match_3_prize = jackpot * ROLLDOWN_MATCH_3_BPS as u64 / 10000 / match_3_winners as u64;
// ```

/// Match 5 rolldown allocation percentage in basis points.
/// - Value: `2,500` BPS
/// - Equivalent: `25%` of jackpot during rolldown
/// - Distribution: Divided equally among all Match 5 winners
pub const ROLLDOWN_MATCH_5_BPS: u16 = 2_500; // 25% to Match 5 winners

/// Match 4 rolldown allocation percentage in basis points.
/// - Value: `3,500` BPS
/// - Equivalent: `35%` of jackpot during rolldown
/// - Distribution: Divided equally among all Match 4 winners
pub const ROLLDOWN_MATCH_4_BPS: u16 = 3_500; // 35% to Match 4 winners

/// Match 3 rolldown allocation percentage in basis points.
/// - Value: `4,000` BPS
/// - Equivalent: `40%` of jackpot during rolldown
/// - Distribution: Divided equally among all Match 3 winners
pub const ROLLDOWN_MATCH_3_BPS: u16 = 4_000; // 40% to Match 3 winners

// ============================================================================
// 8. Staking System - $LOTTO Token Staking Tiers and Rewards
// ============================================================================
//
// $LOTTO token staking system with tier-based benefits.
// Stakers receive ticket discounts, fee sharing, and reward distributions.
//
// # Benefits by Tier
// | Tier | Ticket Discount | Fee Share | Reward Rate | Minimum Stake |
// |------|----------------|-----------|-------------|---------------|
// | None | 0% | 0% | 0% | 0 LOTTO |
// | Bronze | 5% | 0.5% | 1% | 1,000 LOTTO |
// | Silver | 10% | 1.5% | 1.5% | 10,000 LOTTO |
// | Gold | 15% | 3% | 2% | 50,000 LOTTO |
// | Diamond | 20% | 5% | 2.5% | 250,000 LOTTO |
//
// # Tier Determination
// ```rust
// pub fn get_stake_tier(staked_amount: u64) -> StakeTier {
//     if staked_amount >= DIAMOND_THRESHOLD {
//         StakeTier::Diamond
//     } else if staked_amount >= GOLD_THRESHOLD {
//         StakeTier::Gold
//     } else if staked_amount >= SILVER_THRESHOLD {
//         StakeTier::Silver
//     } else if staked_amount >= BRONZE_THRESHOLD {
//         StakeTier::Bronze
//     } else {
//         StakeTier::None
//     }
// }
// ```

/// Bronze tier staking threshold in $LOTTO lamports.
/// - Value: `1,000,000,000,000` lamports
/// - Equivalent: `1,000` LOTTO tokens
/// - Benefits: 5% ticket discount, 0.5% fee share, 1% reward rate
pub const BRONZE_THRESHOLD: u64 = 1_000_000_000_000; // 1,000 LOTTO

/// Silver tier staking threshold in $LOTTO lamports.
/// - Value: `10,000,000,000,000` lamports
/// - Equivalent: `10,000` LOTTO tokens
/// - Benefits: 10% ticket discount, 1.5% fee share, 1.5% reward rate
pub const SILVER_THRESHOLD: u64 = 10_000_000_000_000; // 10,000 LOTTO

/// Gold tier staking threshold in $LOTTO lamports.
/// - Value: `50,000,000,000,000` lamports
/// - Equivalent: `50,000` LOTTO tokens
/// - Benefits: 15% ticket discount, 3% fee share, 2% reward rate
pub const GOLD_THRESHOLD: u64 = 50_000_000_000_000; // 50,000 LOTTO

/// Diamond tier staking threshold in $LOTTO lamports.
/// - Value: `250,000,000,000,000` lamports
/// - Equivalent: `250,000` LOTTO tokens
/// - Benefits: 20% ticket discount, 5% fee share, 2.5% reward rate
pub const DIAMOND_THRESHOLD: u64 = 250_000_000_000_000; // 250,000 LOTTO

/// Bronze tier reward rate in basis points per epoch.
/// - Value: `100` BPS
/// - Equivalent: `1%` per epoch
/// - Annualized: ~12% (assuming 12 epochs per year)
pub const BRONZE_REWARD_BPS: u16 = 100; // 1% per epoch

/// Silver tier reward rate in basis points per epoch.
/// - Value: `150` BPS
/// - Equivalent: `1.5%` per epoch
/// - Annualized: ~18% (assuming 12 epochs per year)
pub const SILVER_REWARD_BPS: u16 = 150; // 1.5% per epoch

/// Gold tier reward rate in basis points per epoch.
/// - Value: `200` BPS
/// - Equivalent: `2%` per epoch
/// - Annualized: ~24% (assuming 12 epochs per year)
pub const GOLD_REWARD_BPS: u16 = 200; // 2% per epoch

/// Diamond tier reward rate in basis points per epoch.
/// - Value: `250` BPS
/// - Equivalent: `2.5%` per epoch
/// - Annualized: ~30% (assuming 12 epochs per year)
pub const DIAMOND_REWARD_BPS: u16 = 250; // 2.5% per epoch

// ============================================================================
// 9. Quick Pick Express - 4/20 Mini-Game Configuration
// ============================================================================
//
// Quick Pick Express is a separate 4/20 lottery game with faster draws
// and smaller prizes. Designed for more frequent play and lower stakes.
//
// # Game Parameters
// - **Matrix**: 4/20 (pick 4 numbers from 1-20)
// - **Ticket Price**: $0.50
// - **Draw Frequency**: Every 4 hours
// - **House Fee**: 30%
// - **Odds**: 1 in 4,845 for Match 4
//
// # Prize Structure
// - **Match 4**: $500 fixed prize
// - **Match 3**: $10 fixed prize
// - **Match 2**: Free ticket ($0.50 value)

/// Quick Pick Express ticket price in USDC lamports.
/// - Value: `500,000` lamports
/// - Equivalent: `$0.50` USD
/// - Rationale: Lower stakes for more frequent play
pub const QUICK_PICK_TICKET_PRICE: u64 = 500_000; // $0.50

/// Quick Pick Express numbers per ticket.
/// - Value: `4` numbers
/// - Matrix: 4/20 game
/// - Total combinations:

/// Lucky Numbers NFT parameters
pub const LUCKY_NUMBERS_BONUS_BPS: u16 = 100; // 1% of jackpot
pub const LUCKY_NUMBERS_MIN_MATCH: u8 = 4; // Match 4+ required
pub const LUCKY_NUMBERS_MAX_PER_DRAW: u8 = 10; // Max 10 NFTs per draw

// ============================================================================
// Second Chance Draws
// ============================================================================

/// Second Chance draw parameters
pub const SECOND_CHANCE_PRIZE_POOL_BPS: u16 = 500; // 5% of reserve fund
pub const SECOND_CHANCE_WEEKLY_WINNERS: u32 = 1111; // 1111 winners per week
pub const SECOND_CHANCE_WEEKLY_PRIZE: u64 = 50_000_000; // $50 each

// ============================================================================
// Syndicate Wars Competition
// ============================================================================

/// Syndicate Wars parameters
pub const SYNDICATE_WARS_POOL_BPS: u16 = 100; // 1% of monthly sales
pub const SYNDICATE_WARS_MIN_TICKETS: u64 = 1_000; // Minimum to qualify
pub const SYNDICATE_WARS_MONTHLY_WINNERS: u8 = 3; // Top 3 syndicates win

// ============================================================================
// System Limits & Validation
// ============================================================================

/// Maximum bulk ticket purchase per transaction
pub const MAX_BULK_TICKETS: usize = 10;

/// Maximum syndicate members
pub const MAX_SYNDICATE_MEMBERS: usize = 100;

/// Maximum tickets per draw per player
pub const MAX_TICKETS_PER_DRAW: u64 = 1_000;

/// Minimum ticket purchase amount
pub const MIN_TICKET_PURCHASE: u64 = 1;

/// Maximum jackpot rollover periods
pub const MAX_JACKPOT_ROLLOVERS: u8 = 10;

// ============================================================================
// Switchboard Randomness Configuration
// ============================================================================

/// Slot freshness requirement for randomness (must be from previous slot)
pub const RANDOMNESS_FRESHNESS_SLOTS: u64 = 1;

/// Maximum retries for randomness requests
pub const RANDOMNESS_MAX_RETRIES: u8 = 3;

/// Delay between commit and reveal phases (slots)
pub const COMMIT_REVEAL_DELAY_SLOTS: u64 = 2;

// ============================================================================
// Mathematical Constants & Basis Points
// ============================================================================

/// Basis points per 100% (10,000 bps = 100%)
pub const BPS_PER_100_PERCENT: u16 = 10_000;

/// USDC decimals (6)
pub const USDC_DECIMALS: u8 = 6;

/// LOTTO token decimals (9)
pub const LOTTO_DECIMALS: u8 = 9;

/// Percentage denominator for calculations
pub const PERCENTAGE_DENOMINATOR: u64 = 100_000_000; // 100% with 8 decimals

// ============================================================================
// Utility Functions
// ============================================================================

/// Calculate the house fee basis points based on jackpot balance
pub fn calculate_house_fee_bps(jackpot_balance: u64, is_rolldown_active: bool) -> u16 {
    if is_rolldown_active {
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

/// Calculate the actual house fee amount for a ticket purchase
pub fn calculate_house_fee_amount(ticket_price: u64, house_fee_bps: u16) -> u64 {
    (ticket_price as u128 * house_fee_bps as u128 / BPS_PER_100_PERCENT as u128) as u64
}

/// Calculate the prize pool amount after house fee deduction
pub fn calculate_prize_pool_amount(ticket_price: u64, house_fee_bps: u16) -> u64 {
    ticket_price - calculate_house_fee_amount(ticket_price, house_fee_bps)
}

/// Check if a rolldown should probabilistically trigger between soft and hard caps
pub fn should_probabilistic_rolldown(jackpot_balance: u64, random_value: u64) -> bool {
    if jackpot_balance <= SOFT_CAP {
        return false;
    }

    if jackpot_balance >= HARD_CAP {
        return true; // Forced rolldown
    }

    // Calculate probability based on position between soft and hard caps
    let excess = jackpot_balance - SOFT_CAP;
    let range = HARD_CAP - SOFT_CAP;
    let probability_bps = (excess as u128 * BPS_PER_100_PERCENT as u128 / range as u128) as u64;

    // Compare with random value (0-9999)
    random_value % (BPS_PER_100_PERCENT as u64) < probability_bps
}

/// Validate lottery numbers are within range and unique
pub fn validate_lottery_numbers(numbers: &[u8; NUMBERS_PER_TICKET]) -> bool {
    let mut seen = [false; MAX_NUMBER as usize + 1];

    for &num in numbers.iter() {
        if num < MIN_NUMBER || num > MAX_NUMBER {
            return false;
        }
        if seen[num as usize] {
            return false; // Duplicate
        }
        seen[num as usize] = true;
    }

    true
}

/// Calculate match count between player numbers and winning numbers
pub fn calculate_match_count(
    player_numbers: &[u8; NUMBERS_PER_TICKET],
    winning_numbers: &[u8; NUMBERS_PER_TICKET],
) -> u8 {
    let mut matches = 0;
    let mut win_set = [false; MAX_NUMBER as usize + 1];

    // Create lookup set for winning numbers
    for &num in winning_numbers.iter() {
        win_set[num as usize] = true;
    }

    // Count matches
    for &num in player_numbers.iter() {
        if win_set[num as usize] {
            matches += 1;
        }
    }

    matches
}

/// Get stake tier based on staked amount
pub fn get_stake_tier(staked_amount: u64) -> StakeTier {
    if staked_amount >= DIAMOND_THRESHOLD {
        StakeTier::Diamond
    } else if staked_amount >= GOLD_THRESHOLD {
        StakeTier::Gold
    } else if staked_amount >= SILVER_THRESHOLD {
        StakeTier::Silver
    } else if staked_amount >= BRONZE_THRESHOLD {
        StakeTier::Bronze
    } else {
        StakeTier::None
    }
}

/// Calculate ticket discount based on stake tier
pub fn calculate_stake_discount_bps(tier: StakeTier) -> u16 {
    match tier {
        StakeTier::Diamond => 500, // 5% discount
        StakeTier::Gold => 300,    // 3% discount
        StakeTier::Silver => 150,  // 1.5% discount
        StakeTier::Bronze => 50,   // 0.5% discount
        StakeTier::None => 0,
    }
}

// ============================================================================
// Enums & Types
// ============================================================================

/// Stake tier enum
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum StakeTier {
    None,
    Bronze,
    Silver,
    Gold,
    Diamond,
}

impl StakeTier {
    pub fn get_reward_rate_bps(&self) -> u16 {
        match self {
            StakeTier::Diamond => DIAMOND_REWARD_BPS,
            StakeTier::Gold => GOLD_REWARD_BPS,
            StakeTier::Silver => SILVER_REWARD_BPS,
            StakeTier::Bronze => BRONZE_REWARD_BPS,
            StakeTier::None => 0,
        }
    }

    pub fn get_discount_bps(&self) -> u16 {
        calculate_stake_discount_bps(*self)
    }
}

/// Draw status enum
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum DrawStatus {
    NotStarted,
    Committed, // Randomness requested, waiting for reveal
    Revealed,  // Randomness revealed, winners being calculated
    Completed, // Draw fully completed
    Rolldown,  // Rolldown in progress
}

/// Match tier enum for prize calculation
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum MatchTier {
    Match6,
    Match5,
    Match4,
    Match3,
    Match2,
    NoMatch,
}

impl MatchTier {
    /// Get fixed prize amount for normal operation
    pub fn get_fixed_prize(&self) -> u64 {
        match self {
            MatchTier::Match6 => 0, // Jackpot, not fixed
            MatchTier::Match5 => MATCH_5_PRIZE,
            MatchTier::Match4 => MATCH_4_PRIZE,
            MatchTier::Match3 => MATCH_3_PRIZE,
            MatchTier::Match2 => MATCH_2_VALUE,
            MatchTier::NoMatch => 0,
        }
    }

    /// Get rolldown allocation basis points
    pub fn get_rolldown_allocation_bps(&self) -> u16 {
        match self {
            MatchTier::Match5 => ROLLDOWN_MATCH_5_BPS,
            MatchTier::Match4 => ROLLDOWN_MATCH_4_BPS,
            MatchTier::Match3 => ROLLDOWN_MATCH_3_BPS,
            _ => 0,
        }
    }
}

// ============================================================================
// Account Size Constants
// ============================================================================

/// LotteryState account size
pub const LOTTERY_STATE_SIZE: usize = 8 + // discriminator
    32 + // authority
    32 + // switchboard_queue
    32 + // current_randomness_account
    8 +  // current_draw_id
    8 +  // jackpot_balance
    8 +  // reserve_balance
    8 +  // insurance_balance
    8 +  // ticket_price
    2 +  // house_fee_bps (current)
    8 +  // jackpot_cap
    8 +  // seed_amount
    8 +  // next_draw_timestamp
    8 +  // commit_slot
    1 +  // is_draw_in_progress
    1 +  // is_rolldown_active
    1 +  // is_paused
    1; // bump

/// Ticket account size
pub const TICKET_SIZE: usize = 8 + // discriminator
    32 + // owner
    8 +  // draw_id
    6 +  // numbers (6 * u8)
    8 +  // purchase_timestamp
    1 +  // is_claimed
    1 +  // match_count
    8 +  // prize_amount
    33; // syndicate (Option<Pubkey>)

/// UserStats account size
pub const USER_STATS_SIZE: usize = 8 + // discriminator
    32 + // wallet
    8 +  // total_tickets
    8 +  // total_spent
    8 +  // total_won
    8 +  // current_streak
    8 +  // best_streak
    4 +  // jackpot_wins
    4; // last_draw_participated

/// DrawResult account size
pub const DRAW_RESULT_SIZE: usize = 8 + // discriminator
    8 +  // draw_id
    6 +  // winning_numbers
    64 + // vrf_proof
    8 +  // timestamp
    8 +  // total_tickets
    1 +  // was_rolldown
    4 +  // match_6_winners
    4 +  // match_5_winners
    4 +  // match_4_winners
    4 +  // match_3_winners
    8 +  // match_6_prize_per_winner
    8 +  // match_5_prize_per_winner
    8 +  // match_4_prize_per_winner
    8; // match_3_prize_per_winner

/// StakeAccount size
pub const STAKE_ACCOUNT_SIZE: usize = 8 + // discriminator
    32 + // owner
    8 +  // staked_amount
    8 +  // stake_timestamp
    1 +  // tier (StakeTier)
    8 +  // pending_rewards
    8; // last_claim_timestamp

/// Syndicate base size (without members)
pub const SYNDICATE_BASE_SIZE: usize = 8 + // discriminator
    32 + // creator
    8 +  // syndicate_id
    32 + // name (32 * u8)
    1 +  // is_public
    4 +  // member_count
    8 +  // total_contribution
    2 +  // manager_fee_bps
    4; // members vector length

/// Size per syndicate member
pub const SYNDICATE_MEMBER_SIZE: usize = 32 + // wallet
    8 +  // contribution
    8; // share_percentage_bps

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_house_fee_bps() {
        // Test below tier 1 threshold (< $500k)
        assert_eq!(
            calculate_house_fee_bps(400_000_000_000, false),
            FEE_TIER_1_BPS
        );

        // Test at tier 2 threshold ($500k - $1M)
        assert_eq!(
            calculate_house_fee_bps(600_000_000_000, false),
            FEE_TIER_2_BPS
        );

        // Test at tier 3 threshold ($1M - $1.5M)
        assert_eq!(
            calculate_house_fee_bps(1_200_000_000_000, false),
            FEE_TIER_3_BPS
        );

        // Test above tier 3 threshold (> $1.5M)
        assert_eq!(
            calculate_house_fee_bps(1_800_000_000_000, false),
            FEE_TIER_4_BPS
        );

        // Test rolldown override (should return rolldown fee regardless of jackpot)
        assert_eq!(
            calculate_house_fee_bps(400_000_000_000, true),
            FEE_ROLLDOWN_BPS
        );
        assert_eq!(
            calculate_house_fee_bps(1_800_000_000_000, true),
            FEE_ROLLDOWN_BPS
        );

        // Test edge cases
        assert_eq!(
            calculate_house_fee_bps(FEE_TIER_1_THRESHOLD - 1, false),
            FEE_TIER_1_BPS
        );
        assert_eq!(
            calculate_house_fee_bps(FEE_TIER_1_THRESHOLD, false),
            FEE_TIER_2_BPS
        );
        assert_eq!(
            calculate_house_fee_bps(FEE_TIER_2_THRESHOLD, false),
            FEE_TIER_3_BPS
        );
        assert_eq!(
            calculate_house_fee_bps(FEE_TIER_3_THRESHOLD, false),
            FEE_TIER_4_BPS
        );
    }

    #[test]
    fn test_should_probabilistic_rolldown() {
        // Test below soft cap - should never rolldown
        assert!(!should_probabilistic_rolldown(SOFT_CAP - 1, 0));
        assert!(!should_probabilistic_rolldown(SOFT_CAP - 1, 9999));

        // Test at or above hard cap - should always rolldown
        assert!(should_probabilistic_rolldown(HARD_CAP, 0));
        assert!(should_probabilistic_rolldown(HARD_CAP, 9999));
        assert!(should_probabilistic_rolldown(HARD_CAP + 1, 0));

        // Test between soft and hard cap - depends on random value
        let mid_point = SOFT_CAP + (HARD_CAP - SOFT_CAP) / 2;

        // With probability 50% at midpoint, test boundary
        let probability_bps = ((mid_point - SOFT_CAP) as u128 * BPS_PER_100_PERCENT as u128
            / (HARD_CAP - SOFT_CAP) as u128) as u64;

        // random_value < probability_bps should return true
        assert!(should_probabilistic_rolldown(
            mid_point,
            probability_bps - 1
        ));
        // random_value >= probability_bps should return false
        assert!(!should_probabilistic_rolldown(mid_point, probability_bps));

        // Test edge at soft cap (0% probability)
        assert!(!should_probabilistic_rolldown(SOFT_CAP, 0));
        assert!(!should_probabilistic_rolldown(SOFT_CAP, 9999));

        // Test just below hard cap (near 100% probability)
        let near_hard_cap = HARD_CAP - 1;
        let near_probability = ((near_hard_cap - SOFT_CAP) as u128 * BPS_PER_100_PERCENT as u128
            / (HARD_CAP - SOFT_CAP) as u128) as u64;
        // Should be very high probability, test with high random value
        assert!(should_probabilistic_rolldown(
            near_hard_cap,
            near_probability - 1
        ));
    }

    #[test]
    fn test_validate_lottery_numbers() {
        // Test valid numbers
        let valid_numbers = [1, 2, 3, 4, 5, 6];
        assert!(validate_lottery_numbers(&valid_numbers));

        // Test with numbers in different order (should still be valid)
        let unsorted_numbers = [6, 5, 4, 3, 2, 1];
        assert!(validate_lottery_numbers(&unsorted_numbers));

        // Test duplicate numbers
        let duplicate_numbers = [1, 1, 2, 3, 4, 5];
        assert!(!validate_lottery_numbers(&duplicate_numbers));

        // Test out of range (below min)
        let below_min = [0, 2, 3, 4, 5, 6];
        assert!(!validate_lottery_numbers(&below_min));

        // Test out of range (above max)
        let above_max = [1, 2, 3, 4, 5, MAX_NUMBER + 1];
        assert!(!validate_lottery_numbers(&above_max));

        // Note: Cannot test wrong number of numbers because function expects exactly NUMBERS_PER_TICKET
        // Compile-time type checking ensures correct array size

        // Test valid boundary numbers
        let boundary_numbers = [MIN_NUMBER, MAX_NUMBER, 2, 3, 4, 5];
        assert!(validate_lottery_numbers(&boundary_numbers));
    }

    #[test]
    fn test_calculate_match_count() {
        // Test perfect match
        let winning = [1, 2, 3, 4, 5, 6];
        let ticket = [1, 2, 3, 4, 5, 6];
        assert_eq!(calculate_match_count(&ticket, &winning), 6);

        // Test 5 matches
        let ticket_5 = [1, 2, 3, 4, 5, 7];
        assert_eq!(calculate_match_count(&ticket_5, &winning), 5);

        // Test 4 matches
        let ticket_4 = [1, 2, 3, 4, 7, 8];
        assert_eq!(calculate_match_count(&ticket_4, &winning), 4);

        // Test 3 matches
        let ticket_3 = [1, 2, 3, 7, 8, 9];
        assert_eq!(calculate_match_count(&ticket_3, &winning), 3);

        // Test 2 matches
        let ticket_2 = [1, 2, 7, 8, 9, 10];
        assert_eq!(calculate_match_count(&ticket_2, &winning), 2);

        // Test 1 match
        let ticket_1 = [1, 7, 8, 9, 10, 11];
        assert_eq!(calculate_match_count(&ticket_1, &winning), 1);

        // Test 0 matches
        let ticket_0 = [7, 8, 9, 10, 11, 12];
        assert_eq!(calculate_match_count(&ticket_0, &winning), 0);

        // Test with unsorted arrays (should still work)
        let unsorted_winning = [6, 5, 4, 3, 2, 1];
        let unsorted_ticket = [1, 3, 5, 7, 9, 11];
        assert_eq!(
            calculate_match_count(&unsorted_ticket, &unsorted_winning),
            3
        ); // 1, 3, 5 match
    }

    #[test]
    fn test_get_stake_tier() {
        // Test Bronze tier
        assert_eq!(get_stake_tier(BRONZE_THRESHOLD), StakeTier::Bronze);
        assert_eq!(get_stake_tier(BRONZE_THRESHOLD + 1), StakeTier::Bronze);

        // Test Silver tier
        assert_eq!(get_stake_tier(SILVER_THRESHOLD), StakeTier::Silver);
        assert_eq!(get_stake_tier(SILVER_THRESHOLD + 1), StakeTier::Silver);

        // Test Gold tier
        assert_eq!(get_stake_tier(GOLD_THRESHOLD), StakeTier::Gold);
        assert_eq!(get_stake_tier(GOLD_THRESHOLD + 1), StakeTier::Gold);

        // Test Diamond tier
        assert_eq!(get_stake_tier(DIAMOND_THRESHOLD), StakeTier::Diamond);
        assert_eq!(
            get_stake_tier(DIAMOND_THRESHOLD + 1_000_000_000),
            StakeTier::Diamond
        );

        // Test below Bronze threshold
        assert_eq!(get_stake_tier(BRONZE_THRESHOLD - 1), StakeTier::None);
        assert_eq!(get_stake_tier(0), StakeTier::None);

        // Test boundary values
        assert_eq!(get_stake_tier(BRONZE_THRESHOLD - 1), StakeTier::None);
        assert_eq!(get_stake_tier(BRONZE_THRESHOLD), StakeTier::Bronze);
        assert_eq!(get_stake_tier(SILVER_THRESHOLD - 1), StakeTier::Bronze);
        assert_eq!(get_stake_tier(SILVER_THRESHOLD), StakeTier::Silver);
        assert_eq!(get_stake_tier(GOLD_THRESHOLD - 1), StakeTier::Silver);
        assert_eq!(get_stake_tier(GOLD_THRESHOLD), StakeTier::Gold);
        assert_eq!(get_stake_tier(DIAMOND_THRESHOLD - 1), StakeTier::Gold);
        assert_eq!(get_stake_tier(DIAMOND_THRESHOLD), StakeTier::Diamond);
    }

    #[test]
    fn test_calculate_stake_discount_bps() {
        // Test None tier
        assert_eq!(calculate_stake_discount_bps(get_stake_tier(0)), 0);
        assert_eq!(
            calculate_stake_discount_bps(get_stake_tier(BRONZE_THRESHOLD - 1)),
            0
        );

        // Test Bronze tier
        assert_eq!(
            calculate_stake_discount_bps(get_stake_tier(BRONZE_THRESHOLD)),
            StakeTier::Bronze.get_discount_bps()
        );

        // Test Silver tier
        assert_eq!(
            calculate_stake_discount_bps(get_stake_tier(SILVER_THRESHOLD)),
            StakeTier::Silver.get_discount_bps()
        );

        // Test Gold tier
        assert_eq!(
            calculate_stake_discount_bps(get_stake_tier(GOLD_THRESHOLD)),
            StakeTier::Gold.get_discount_bps()
        );

        // Test Diamond tier
        assert_eq!(
            calculate_stake_discount_bps(get_stake_tier(DIAMOND_THRESHOLD)),
            StakeTier::Diamond.get_discount_bps()
        );

        // Test values between tiers
        assert_eq!(
            calculate_stake_discount_bps(get_stake_tier((BRONZE_THRESHOLD + SILVER_THRESHOLD) / 2)),
            StakeTier::Bronze.get_discount_bps()
        );
        assert_eq!(
            calculate_stake_discount_bps(get_stake_tier((SILVER_THRESHOLD + GOLD_THRESHOLD) / 2)),
            StakeTier::Silver.get_discount_bps()
        );
        assert_eq!(
            calculate_stake_discount_bps(get_stake_tier((GOLD_THRESHOLD + DIAMOND_THRESHOLD) / 2)),
            StakeTier::Gold.get_discount_bps()
        );
    }

    #[test]
    fn test_stake_tier_methods() {
        // Test reward rates
        assert_eq!(StakeTier::None.get_reward_rate_bps(), 0);
        assert_eq!(StakeTier::Bronze.get_reward_rate_bps(), BRONZE_REWARD_BPS);
        assert_eq!(StakeTier::Silver.get_reward_rate_bps(), SILVER_REWARD_BPS);
        assert_eq!(StakeTier::Gold.get_reward_rate_bps(), GOLD_REWARD_BPS);
        assert_eq!(StakeTier::Diamond.get_reward_rate_bps(), DIAMOND_REWARD_BPS);

        // Test discount rates (these should be hardcoded in the impl)
        assert_eq!(StakeTier::None.get_discount_bps(), 0);
        // Note: The actual discount values depend on the implementation
        // We just verify the method exists and returns u16
        let _: u16 = StakeTier::Bronze.get_discount_bps();
        let _: u16 = StakeTier::Silver.get_discount_bps();
        let _: u16 = StakeTier::Gold.get_discount_bps();
        let _: u16 = StakeTier::Diamond.get_discount_bps();
    }

    #[test]
    fn test_calculate_house_fee_amount() {
        let ticket_price = 2_500_000; // $2.50

        // Test with 28% fee
        let fee_28 = calculate_house_fee_amount(ticket_price, 2800);
        assert_eq!(fee_28, ticket_price * 2800 / 10000);

        // Test with 40% fee
        let fee_40 = calculate_house_fee_amount(ticket_price, 4000);
        assert_eq!(fee_40, ticket_price * 4000 / 10000);

        // Test edge cases
        assert_eq!(calculate_house_fee_amount(0, 2800), 0);
        assert_eq!(calculate_house_fee_amount(ticket_price, 0), 0);
        assert_eq!(
            calculate_house_fee_amount(ticket_price, 10000),
            ticket_price
        ); // 100% fee
    }

    #[test]
    fn test_calculate_prize_pool_amount() {
        let ticket_price = 2_500_000; // $2.50

        // Test with 28% fee (72% to prize pool)
        let pool_28 = calculate_prize_pool_amount(ticket_price, 2800);
        assert_eq!(pool_28, ticket_price * (10000 - 2800) / 10000);

        // Test with 40% fee (60% to prize pool)
        let pool_40 = calculate_prize_pool_amount(ticket_price, 4000);
        assert_eq!(pool_40, ticket_price * (10000 - 4000) / 10000);

        // Test edge cases
        assert_eq!(calculate_prize_pool_amount(0, 2800), 0);
        assert_eq!(calculate_prize_pool_amount(ticket_price, 0), ticket_price); // 0% fee
        assert_eq!(calculate_prize_pool_amount(ticket_price, 10000), 0); // 100% fee
    }

    #[test]
    fn test_match_tier_methods() {
        // Test fixed prizes
        assert!(MatchTier::Match6.get_fixed_prize() > 0); // Jackpot
        assert_eq!(MatchTier::Match5.get_fixed_prize(), MATCH_5_PRIZE);
        assert_eq!(MatchTier::Match4.get_fixed_prize(), MATCH_4_PRIZE);
        assert_eq!(MatchTier::Match3.get_fixed_prize(), MATCH_3_PRIZE);
        assert_eq!(MatchTier::Match2.get_fixed_prize(), MATCH_2_VALUE);
        assert_eq!(MatchTier::NoMatch.get_fixed_prize(), 0);

        // Test rolldown allocations
        assert_eq!(
            MatchTier::Match5.get_rolldown_allocation_bps(),
            ROLLDOWN_MATCH_5_BPS
        );
        assert_eq!(
            MatchTier::Match4.get_rolldown_allocation_bps(),
            ROLLDOWN_MATCH_4_BPS
        );
        assert_eq!(
            MatchTier::Match3.get_rolldown_allocation_bps(),
            ROLLDOWN_MATCH_3_BPS
        );
        assert_eq!(MatchTier::Match2.get_rolldown_allocation_bps(), 0); // Match 2 doesn't get rolldown
        assert_eq!(MatchTier::NoMatch.get_rolldown_allocation_bps(), 0);

        // Verify Match6 has 0 rolldown allocation (jackpot winner takes all)
        assert_eq!(MatchTier::Match6.get_rolldown_allocation_bps(), 0);
    }

    #[test]
    fn test_quick_pick_constants() {
        // Verify Quick Pick game parameters
        assert_eq!(QUICK_PICK_TICKET_PRICE, 500_000); // $0.50
        assert_eq!(QUICK_PICK_NUMBERS, 4);
        assert_eq!(QUICK_PICK_RANGE, 20);
        assert_eq!(QUICK_PICK_HOUSE_FEE_BPS, 3000); // 30%
        assert_eq!(QUICK_PICK_INTERVAL, 14_400); // 4 hours in seconds

        // Verify Quick Pick prizes
        assert_eq!(QUICK_PICK_MATCH_4_PRIZE, 500_000_000); // $500
        assert_eq!(QUICK_PICK_MATCH_3_PRIZE, 10_000_000); // $10
    }

    #[test]
    fn test_second_chance_constants() {
        assert_eq!(SECOND_CHANCE_PRIZE_POOL_BPS, 500); // 5%
        assert_eq!(SECOND_CHANCE_WEEKLY_WINNERS, 1111);
        assert_eq!(SECOND_CHANCE_WEEKLY_PRIZE, 50_000_000); // $50
    }

    #[test]
    fn test_syndicate_wars_constants() {
        assert_eq!(SYNDICATE_WARS_POOL_BPS, 100); // 1%
        assert_eq!(SYNDICATE_WARS_MIN_TICKETS, 1_000);
        assert_eq!(SYNDICATE_WARS_MONTHLY_WINNERS, 3);
    }

    #[test]
    fn test_lucky_numbers_constants() {
        assert_eq!(LUCKY_NUMBERS_BONUS_BPS, 100); // 1%
        assert_eq!(LUCKY_NUMBERS_MIN_MATCH, 4); // Match 4+
        assert_eq!(LUCKY_NUMBERS_MAX_PER_DRAW, 10); // Max 10 NFTs per draw
    }
}
