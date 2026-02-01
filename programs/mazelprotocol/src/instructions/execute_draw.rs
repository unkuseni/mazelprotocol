//! Execute Draw Instruction
//!
//! This instruction reveals the Switchboard randomness and generates winning numbers.
//! It implements the reveal phase of the commit-reveal pattern:
//! 1. Verifies the randomness account matches the committed account
//! 2. Verifies the seed_slot matches the commit_slot (freshness check)
//! 3. Retrieves the revealed random value
//! 4. Generates winning numbers from the randomness
//! 5. Creates the draw result account
//!
//! SECURITY: This must be called in the slot AFTER the commit.
//! The randomness is only valid if seed_slot == clock.slot - 1.

use anchor_lang::prelude::*;
use switchboard_on_demand::accounts::RandomnessAccountData;

use crate::constants::*;
use crate::errors::LottoError;
use crate::events::DrawExecuted;
use crate::state::{DrawResult, LotteryState};

/// Accounts required for executing the draw
#[derive(Accounts)]
pub struct ExecuteDraw<'info> {
    /// The main lottery state account
    #[account(
        mut,
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump,
        constraint = lottery_state.is_draw_in_progress @ LottoError::DrawNotInProgress,
        constraint = !lottery_state.is_paused @ LottoError::Paused
    )]
    pub lottery_state: Account<'info, LotteryState>,

    /// The draw result account to be created
    #[account(
        init,
        payer = payer,
        space = DRAW_RESULT_SIZE,
        seeds = [DRAW_SEED, &lottery_state.current_draw_id.to_le_bytes()],
        bump
    )]
    pub draw_result: Account<'info, DrawResult>,

    /// The Switchboard randomness account (must match committed account)
    /// CHECK: Validated manually by parsing RandomnessAccountData and comparing to stored reference
    #[account(
        constraint = randomness_account_data.key() == lottery_state.current_randomness_account @ LottoError::InvalidRandomnessAccount
    )]
    pub randomness_account_data: AccountInfo<'info>,

    /// The payer for the draw result account creation
    #[account(mut)]
    pub payer: Signer<'info>,

    /// System program
    pub system_program: Program<'info, System>,
}

impl<'info> ExecuteDraw<'info> {
    /// Parse and validate the randomness account, returning the revealed value
    pub fn get_revealed_randomness(&self, current_slot: u64, commit_slot: u64) -> Result<[u8; 32]> {
        // Parse the randomness account data
        let randomness_data =
            RandomnessAccountData::parse(self.randomness_account_data.data.borrow())
                .map_err(|_| LottoError::RandomnessParseError)?;

        // SECURITY: Verify the seed_slot matches our commit_slot
        // This ensures we're using the randomness we committed to
        require!(
            randomness_data.seed_slot == commit_slot,
            LottoError::RandomnessNotFresh
        );

        // SECURITY: Verify randomness was committed in a recent slot
        // The reveal should happen shortly after commit
        require!(
            randomness_data.seed_slot >= current_slot.saturating_sub(100),
            LottoError::RandomnessExpired
        );

        // Get the revealed random value
        let revealed_value = randomness_data
            .get_value(current_slot)
            .map_err(|_| LottoError::RandomnessNotResolved)?;

        Ok(revealed_value)
    }
}

/// Generate winning numbers from randomness bytes
///
/// Uses a deterministic algorithm to convert 32 bytes of randomness
/// into 6 unique numbers in the range [1, 46].
///
/// Algorithm:
/// 1. For each of the 6 numbers, use a different portion of the randomness
/// 2. Generate a number in range [1, 46]
/// 3. If the number is a duplicate, increment until unique
/// 4. Sort the final numbers
///
/// # Arguments
/// * `randomness` - 32 bytes of verified randomness
///
/// # Returns
/// * `[u8; 6]` - Sorted array of 6 unique winning numbers
fn generate_winning_numbers(randomness: &[u8; 32]) -> [u8; 6] {
    let mut numbers = [0u8; 6];
    let mut used = [false; 47]; // Index 0 unused, 1-46 for tracking

    for i in 0..6 {
        // Use different bytes for each number
        // Combine multiple bytes for better distribution
        let byte_offset = i * 4;
        let raw_value = u32::from_le_bytes([
            randomness[byte_offset % 32],
            randomness[(byte_offset + 1) % 32],
            randomness[(byte_offset + 2) % 32],
            randomness[(byte_offset + 3) % 32],
        ]);

        // Map to range [1, 46]
        let mut num = ((raw_value as u64 % MAX_NUMBER as u64) + 1) as u8;

        // Handle duplicates by finding next available number
        while used[num as usize] {
            num = if num >= MAX_NUMBER { 1 } else { num + 1 };
        }

        used[num as usize] = true;
        numbers[i] = num;
    }

    // Sort numbers for consistent storage and comparison
    numbers.sort();
    numbers
}

/// Determine if rolldown should trigger based on randomness and probability
///
/// Uses the last byte of randomness to make a probabilistic decision
/// based on the rolldown probability calculated from jackpot level.
///
/// # Arguments
/// * `randomness` - 32 bytes of verified randomness
/// * `probability_bps` - Rolldown probability in basis points (0-10000)
///
/// # Returns
/// * `bool` - True if rolldown should trigger
fn should_trigger_rolldown(randomness: &[u8; 32], probability_bps: u16) -> bool {
    if probability_bps >= 10000 {
        return true; // 100% probability (hard cap)
    }
    if probability_bps == 0 {
        return false; // 0% probability (below soft cap)
    }

    // Use last two bytes of randomness for the roll
    let roll = u16::from_le_bytes([randomness[30], randomness[31]]);
    let threshold = (roll as u32 * 10000 / u16::MAX as u32) as u16;

    threshold < probability_bps
}

/// Execute the draw by revealing randomness and generating winning numbers
///
/// This instruction:
/// 1. Validates the randomness account matches the committed reference
/// 2. Verifies the seed_slot matches for freshness
/// 3. Retrieves the revealed random value from Switchboard
/// 4. Generates 6 unique winning numbers from the randomness
/// 5. Determines if rolldown should trigger (probabilistic for soft cap)
/// 6. Creates the draw result account with winning numbers
/// 7. Resets lottery state for next draw
///
/// # Security Considerations
/// - The randomness account MUST match the one committed in commit_randomness
/// - The seed_slot MUST match to prevent using different randomness
/// - The reveal MUST happen after the commit (Switchboard handles this)
///
/// # Arguments
/// * `ctx` - The context containing all required accounts
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler(ctx: Context<ExecuteDraw>) -> Result<()> {
    let clock = Clock::get()?;

    // Get values we need before borrowing mutably
    let commit_slot = ctx.accounts.lottery_state.commit_slot;
    let jackpot_balance = ctx.accounts.lottery_state.jackpot_balance;
    let is_rolldown_active = ctx.accounts.lottery_state.is_rolldown_active;
    let current_draw_id = ctx.accounts.lottery_state.current_draw_id;
    let current_draw_tickets = ctx.accounts.lottery_state.current_draw_tickets;
    let rolldown_probability_bps = ctx.accounts.lottery_state.get_rolldown_probability_bps();

    // Get the revealed randomness
    let randomness = ctx
        .accounts
        .get_revealed_randomness(clock.slot, commit_slot)?;

    // Generate winning numbers
    let winning_numbers = generate_winning_numbers(&randomness);

    // Determine rolldown status
    let was_rolldown = if is_rolldown_active {
        should_trigger_rolldown(&randomness, rolldown_probability_bps)
    } else {
        false
    };

    // Create draw result
    let draw_result = &mut ctx.accounts.draw_result;
    draw_result.draw_id = current_draw_id;
    draw_result.winning_numbers = winning_numbers;
    draw_result.randomness_proof = randomness;
    draw_result.timestamp = clock.unix_timestamp;
    draw_result.total_tickets = current_draw_tickets;
    draw_result.was_rolldown = was_rolldown;

    // Winner counts will be set during finalize_draw
    draw_result.match_6_winners = 0;
    draw_result.match_5_winners = 0;
    draw_result.match_4_winners = 0;
    draw_result.match_3_winners = 0;
    draw_result.match_2_winners = 0;

    // Prize amounts will be set during finalize_draw
    draw_result.match_6_prize_per_winner = 0;
    draw_result.match_5_prize_per_winner = 0;
    draw_result.match_4_prize_per_winner = 0;
    draw_result.match_3_prize_per_winner = 0;
    draw_result.match_2_prize_per_winner = 0;

    draw_result.bump = ctx.bumps.draw_result;

    // Emit event
    emit!(DrawExecuted {
        draw_id: current_draw_id,
        winning_numbers,
        was_rolldown,
        total_tickets: current_draw_tickets,
        timestamp: clock.unix_timestamp,
    });

    msg!("Draw executed successfully!");
    msg!("  Draw ID: {}", current_draw_id);
    msg!("  Winning numbers: {:?}", winning_numbers);
    msg!("  Was rolldown: {}", was_rolldown);
    msg!("  Total tickets: {}", current_draw_tickets);
    msg!("  Jackpot at draw: {} USDC lamports", jackpot_balance);

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_winning_numbers_uniqueness() {
        let randomness = [
            0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xDE, 0xF0, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66,
            0x77, 0x88, 0x99, 0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF, 0x00, 0x01, 0x02, 0x03, 0x04,
            0x05, 0x06, 0x07, 0x08,
        ];

        let numbers = generate_winning_numbers(&randomness);

        // Check all numbers are in valid range
        for &num in numbers.iter() {
            assert!(num >= 1 && num <= 46, "Number {} out of range", num);
        }

        // Check all numbers are unique
        let mut seen = std::collections::HashSet::new();
        for &num in numbers.iter() {
            assert!(seen.insert(num), "Duplicate number found: {}", num);
        }

        // Check numbers are sorted
        for i in 0..5 {
            assert!(numbers[i] < numbers[i + 1], "Numbers not sorted");
        }
    }

    #[test]
    fn test_generate_winning_numbers_deterministic() {
        let randomness = [0xAB; 32];

        let numbers1 = generate_winning_numbers(&randomness);
        let numbers2 = generate_winning_numbers(&randomness);

        assert_eq!(
            numbers1, numbers2,
            "Same randomness should produce same numbers"
        );
    }

    #[test]
    fn test_should_trigger_rolldown() {
        let randomness = [0xFF; 32]; // High value

        // 100% probability should always trigger
        assert!(should_trigger_rolldown(&randomness, 10000));

        // 0% probability should never trigger
        assert!(!should_trigger_rolldown(&randomness, 0));
    }
}
