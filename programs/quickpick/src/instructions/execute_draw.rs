//! Execute Quick Pick Draw Instruction
//!
//! This instruction reveals the Switchboard randomness and generates winning numbers
//! for the Quick Pick Express draw. It implements the reveal phase of the commit-reveal pattern.
//!
//! Key differences from main lottery:
//! - 5 winning numbers instead of 6
//! - Number range is 1-35 instead of 1-46
//! - Uses Quick Pick specific caps for rolldown determination
//!
//! Security:
//! - The randomness account MUST match the one committed in commit_randomness
//! - The seed_slot MUST match to prevent using different randomness
//! - The reveal MUST happen after the commit (Switchboard handles this)

use anchor_lang::prelude::*;
use switchboard_on_demand::accounts::RandomnessAccountData;

use crate::constants::*;
use crate::errors::QuickPickError;
use crate::events::QuickPickDrawExecuted;
use crate::state::{LotteryState, QuickPickDrawResult, QuickPickState};

/// Accounts required for executing the Quick Pick draw
#[derive(Accounts)]
pub struct ExecuteQuickPickDraw<'info> {
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
        bump = quick_pick_state.bump,
        constraint = !quick_pick_state.is_paused @ QuickPickError::Paused,
        constraint = quick_pick_state.is_draw_in_progress @ QuickPickError::DrawNotInProgress,
        constraint = quick_pick_state.current_randomness_account == randomness_account_data.key() @ QuickPickError::InvalidRandomnessProof
    )]
    pub quick_pick_state: Account<'info, QuickPickState>,

    /// The Quick Pick draw result account to be created
    #[account(
        init,
        payer = payer,
        space = QuickPickDrawResult::LEN,
        seeds = [QUICK_PICK_DRAW_SEED, &quick_pick_state.current_draw.to_le_bytes()],
        bump
    )]
    pub draw_result: Account<'info, QuickPickDrawResult>,

    /// The Switchboard randomness account
    /// CHECK: Validated manually by parsing RandomnessAccountData
    pub randomness_account_data: AccountInfo<'info>,

    /// The payer for the draw result account creation
    #[account(mut)]
    pub payer: Signer<'info>,

    /// System program
    pub system_program: Program<'info, System>,
}

impl<'info> ExecuteQuickPickDraw<'info> {
    /// Parse and validate the randomness account, returning the revealed value
    pub fn get_revealed_randomness(&self, current_slot: u64) -> Result<[u8; 32]> {
        // Parse the randomness account data
        let randomness_data =
            RandomnessAccountData::parse(self.randomness_account_data.data.borrow())
                .map_err(|_| QuickPickError::RandomnessParseError)?;

        // SECURITY: Verify the seed_slot is recent
        // The reveal should happen shortly after commit
        // FIXED: Tightened from 50 to 10 slots (~4 seconds) to minimize MEV window.
        // The previous 50-slot (~20s) window gave validators and MEV actors
        // too much time to observe randomness before the reveal transaction.
        // 10 slots is sufficient for normal transaction propagation while
        // dramatically reducing the observation window for attackers.
        require!(
            randomness_data.seed_slot >= current_slot.saturating_sub(10),
            QuickPickError::RandomnessExpired
        );
        require!(
            current_slot > randomness_data.seed_slot,
            QuickPickError::RandomnessNotFresh
        );

        // Get the revealed random value
        let revealed_value = randomness_data
            .get_value(current_slot)
            .map_err(|_| QuickPickError::RandomnessNotResolved)?;

        Ok(revealed_value)
    }
}

/// Generate winning numbers from randomness bytes for Quick Pick (5/35)
///
/// Uses a deterministic algorithm to convert 32 bytes of randomness
/// into 5 unique numbers in the range [1, 35].
///
/// # Arguments
/// * `randomness` - 32 bytes of verified randomness
///
/// # Returns
/// * `Result<[u8; 5]>` - Sorted array of 5 unique winning numbers, or error if generation fails
fn generate_quick_pick_winning_numbers(randomness: &[u8; 32]) -> Result<[u8; 5]> {
    // Use SHA256 hash of randomness for better distribution
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(randomness);
    let hash_result = hasher.finalize();
    let hash_bytes = hash_result.as_slice();

    // Create an array of available numbers 1-35
    let mut available_numbers: [bool; QUICK_PICK_RANGE as usize] =
        [true; QUICK_PICK_RANGE as usize];
    let mut winning_numbers = [0u8; 5];

    // Generate 5 unique numbers
    for i in 0..5 {
        // Use different portions of the hash for each number
        let hash_idx = (i * 4) % hash_bytes.len();

        // Ensure we have at least 4 bytes available for the slice
        let rand_val = if hash_idx + 4 <= hash_bytes.len() {
            let hash_slice = &hash_bytes[hash_idx..hash_idx + 4];
            // Safe to unwrap because we know slice length is exactly 4
            u32::from_le_bytes(hash_slice.try_into().expect("Hash slice should be 4 bytes"))
        } else {
            // Fallback: use a deterministic value based on hash_idx
            // Combine remaining bytes with zeros if needed
            let mut bytes = [0u8; 4];
            let remaining = hash_bytes.len() - hash_idx;
            bytes[..remaining.min(4)]
                .copy_from_slice(&hash_bytes[hash_idx..hash_idx + remaining.min(4)]);
            u32::from_le_bytes(bytes)
        };

        // Find an available number
        let mut attempts = 0;
        loop {
            // Calculate candidate number (1-35)
            let candidate =
                ((rand_val.wrapping_add(attempts as u32) % QUICK_PICK_RANGE as u32) + 1) as u8;

            if candidate >= 1
                && candidate <= QUICK_PICK_RANGE
                && available_numbers[candidate as usize - 1]
            {
                winning_numbers[i] = candidate;
                available_numbers[candidate as usize - 1] = false;
                break;
            }

            attempts += 1;
            // Safety check: should never happen since we have 35 numbers and need only 5
            if attempts > QUICK_PICK_RANGE as u32 * 2 {
                // Fallback: use sequential numbers
                for j in 0..QUICK_PICK_RANGE as usize {
                    if available_numbers[j] {
                        winning_numbers[i] = (j + 1) as u8;
                        available_numbers[j] = false;
                        break;
                    }
                }
                break;
            }
        }
    }

    // Sort the numbers and ensure no zeros
    winning_numbers.sort();

    // Final validation: ensure all numbers are valid (1-35) and unique
    for &num in &winning_numbers {
        if num < 1 || num > QUICK_PICK_RANGE {
            // FIXED: Return an error instead of a predictable fallback.
            // A fixed [1,2,3,4,5] fallback is exploitable — an attacker who
            // can force this path would know the winning numbers in advance.
            // Failing the draw forces admin recovery, which is far safer.
            msg!(
                "CRITICAL: generate_quick_pick_winning_numbers produced invalid number {}",
                num
            );
            return Err(QuickPickError::InvalidRandomnessProof.into());
        }
    }

    // Check for duplicates (shouldn't happen with our algorithm)
    let mut seen = [false; QUICK_PICK_RANGE as usize];
    for &num in &winning_numbers {
        if seen[num as usize - 1] {
            // FIXED: Return an error instead of a predictable fallback.
            msg!(
                "CRITICAL: generate_quick_pick_winning_numbers produced duplicate number {}",
                num
            );
            return Err(QuickPickError::InvalidRandomnessProof.into());
        }
        seen[num as usize - 1] = true;
    }

    Ok(winning_numbers)
}

/// Determine if rolldown should trigger based on randomness and probability
///
/// Uses SHA256 hash of randomness for uniform distribution
/// to make a probabilistic decision based on the rolldown probability
/// calculated from jackpot level.
///
/// # Arguments
/// * `randomness` - 32 bytes of verified randomness
/// * `probability_bps` - Rolldown probability in basis points (0-10000)
///
/// # Returns
/// * `bool` - True if rolldown should trigger
fn should_trigger_quick_pick_rolldown(randomness: &[u8; 32], probability_bps: u16) -> bool {
    if probability_bps >= 10000 {
        return true; // 100% probability (hard cap)
    }
    if probability_bps == 0 {
        return false; // 0% probability (below soft cap)
    }

    // FIXED: Use domain-separated SHA256 hash to prevent correlated randomness.
    // Previously, the same raw randomness was hashed for both number generation
    // and rolldown decision, which could create exploitable correlations.
    // By adding a domain separator ("rolldown_decision"), the hash output is
    // completely independent from the one used for winning numbers.
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(b"quickpick_rolldown_decision");
    hasher.update(randomness);
    let hash_result = hasher.finalize();
    let hash_bytes = hash_result.as_slice();

    // Use first 4 bytes of hash for the roll, with bounds checking
    let roll = if hash_bytes.len() >= 4 {
        let roll_bytes: [u8; 4] = hash_bytes[0..4]
            .try_into()
            .expect("Hash slice should be 4 bytes");
        u32::from_le_bytes(roll_bytes)
    } else {
        // Fallback: pad with zeros if hash is too short
        let mut bytes = [0u8; 4];
        bytes[..hash_bytes.len()].copy_from_slice(hash_bytes);
        u32::from_le_bytes(bytes)
    };

    // Calculate threshold (0-9999)
    let threshold = roll % 10000;

    threshold < probability_bps as u32
}

/// Calculate rolldown probability for Quick Pick
///
/// Returns probability in basis points (0-10000 = 0%-100%)
/// - Below soft cap: 0%
/// - At soft cap: starts at 0% and increases linearly
/// - At hard cap: 100%
fn get_quick_pick_rolldown_probability_bps(
    jackpot_balance: u64,
    soft_cap: u64,
    hard_cap: u64,
) -> u16 {
    if jackpot_balance < soft_cap {
        return 0;
    }
    if jackpot_balance >= hard_cap {
        return 10000; // 100%
    }

    // Linear scaling between soft and hard caps
    // Handle edge case where soft_cap == hard_cap
    if soft_cap >= hard_cap {
        return 10000;
    }

    let excess = jackpot_balance.saturating_sub(soft_cap);
    let range = hard_cap.saturating_sub(soft_cap);

    ((excess as u128 * 10000) / range as u128) as u16
}

/// Execute the Quick Pick draw by revealing randomness and generating winning numbers
///
/// This instruction:
/// 1. Validates the draw is ready (draw time reached)
/// 2. Retrieves the revealed random value from Switchboard
/// 3. Generates 5 unique winning numbers from the randomness
/// 4. Determines if rolldown should trigger (probabilistic for soft cap)
/// 5. Creates the draw result account with winning numbers
/// 6. Prepares state for the next draw
///
/// # Arguments
/// * `ctx` - The context containing all required accounts
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler(ctx: Context<ExecuteQuickPickDraw>) -> Result<()> {
    let clock = Clock::get()?;

    // Get values we need before borrowing mutably
    let jackpot_balance = ctx.accounts.quick_pick_state.jackpot_balance;
    let current_draw = ctx.accounts.quick_pick_state.current_draw;
    let current_draw_tickets = ctx.accounts.quick_pick_state.current_draw_tickets;
    let soft_cap = ctx.accounts.quick_pick_state.soft_cap;
    let hard_cap = ctx.accounts.quick_pick_state.hard_cap;
    let is_rolldown_pending = ctx.accounts.quick_pick_state.is_rolldown_pending;

    // Calculate rolldown probability
    let rolldown_probability_bps =
        get_quick_pick_rolldown_probability_bps(jackpot_balance, soft_cap, hard_cap);

    // Log soft/hard cap status
    msg!("📊 Quick Pick Soft/Hard Cap Status:");
    msg!("  Jackpot balance: {} USDC lamports", jackpot_balance);
    msg!("  Soft cap: {} USDC lamports", soft_cap);
    msg!("  Hard cap: {} USDC lamports", hard_cap);
    msg!("  Rolldown pending: {}", is_rolldown_pending);
    msg!(
        "  Rolldown probability: {}%",
        rolldown_probability_bps as f64 / 100.0
    );

    // Get the revealed randomness
    let randomness = ctx.accounts.get_revealed_randomness(clock.slot)?;

    // Additional security check - verify randomness is not all zeros or predictable pattern
    let is_valid_randomness = randomness.iter().any(|&b| b != 0)
        && randomness
            .iter()
            .collect::<std::collections::HashSet<_>>()
            .len()
            > 1;
    require!(is_valid_randomness, QuickPickError::InvalidRandomnessProof);

    // Generate winning numbers (5 numbers from 1-35)
    // FIXED: Now returns Result — propagates error instead of using predictable fallback
    let winning_numbers = generate_quick_pick_winning_numbers(&randomness)?;

    // Determine if this draw triggers a rolldown
    let was_rolldown = if jackpot_balance >= hard_cap {
        // Hard cap reached - FORCED rolldown (100% probability)
        msg!("⚠️  QUICK PICK HARD CAP TRIGGERED: Forced rolldown!");
        true
    } else if is_rolldown_pending && jackpot_balance >= soft_cap {
        // Soft cap reached - probabilistic rolldown
        let triggered = should_trigger_quick_pick_rolldown(&randomness, rolldown_probability_bps);

        if triggered {
            msg!(
                "🎰 QUICK PICK SOFT CAP ROLLDOWN TRIGGERED! (probability was {}%)",
                rolldown_probability_bps as f64 / 100.0
            );
        } else {
            msg!(
                "🎰 Quick Pick soft cap active but rolldown NOT triggered (probability was {}%)",
                rolldown_probability_bps as f64 / 100.0
            );
        }

        triggered
    } else {
        // Below soft cap - no rolldown
        false
    };

    // Create draw result
    let draw_result = &mut ctx.accounts.draw_result;
    draw_result.draw_id = current_draw;
    draw_result.winning_numbers = winning_numbers;
    draw_result.randomness_proof = randomness;
    draw_result.timestamp = clock.unix_timestamp;
    draw_result.total_tickets = current_draw_tickets;
    draw_result.was_rolldown = was_rolldown;

    // Winner counts will be set during finalize_draw
    draw_result.match_5_winners = 0;
    draw_result.match_4_winners = 0;
    draw_result.match_3_winners = 0;

    // Prize amounts will be set during finalize_draw
    draw_result.match_5_prize_per_winner = 0;
    draw_result.match_4_prize_per_winner = 0;
    draw_result.match_3_prize_per_winner = 0;

    // Explicitly mark as not finalized (will be set true in finalize_draw)
    draw_result.is_explicitly_finalized = false;

    draw_result.bump = ctx.bumps.draw_result;

    // Emit event
    let jackpot_distributed = if was_rolldown { jackpot_balance } else { 0 };

    emit!(QuickPickDrawExecuted {
        draw_id: current_draw,
        winning_numbers,
        was_rolldown,
        total_tickets: current_draw_tickets,
        jackpot_distributed,
        timestamp: clock.unix_timestamp,
    });

    msg!("Quick Pick draw executed successfully!");
    msg!("  Draw ID: {}", current_draw);
    msg!("  Winning numbers: {:?}", winning_numbers);
    msg!("  Was rolldown: {}", was_rolldown);
    msg!("  Total tickets: {}", current_draw_tickets);
    msg!("  Jackpot at draw: {} USDC lamports", jackpot_balance);
    if was_rolldown {
        msg!("  🎰 ROLLDOWN ACTIVE: Jackpot will be distributed to lower tiers!");
        msg!("    Match 4: 60% of jackpot (pari-mutuel)");
        msg!("    Match 3: 40% of jackpot (pari-mutuel)");
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_quick_pick_winning_numbers_uniqueness() {
        let randomness = [
            0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xDE, 0xF0, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66,
            0x77, 0x88, 0x99, 0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF, 0x00, 0x01, 0x02, 0x03, 0x04,
            0x05, 0x06, 0x07, 0x08,
        ];

        let numbers = generate_quick_pick_winning_numbers(&randomness)
            .expect("should generate valid numbers");

        // Check all numbers are in valid range (1-35)
        for &num in numbers.iter() {
            assert!(num >= 1 && num <= 35, "Number {} out of range", num);
        }

        // Check all numbers are unique
        let mut seen = std::collections::HashSet::new();
        for &num in numbers.iter() {
            assert!(seen.insert(num), "Duplicate number found: {}", num);
        }

        // Check numbers are sorted
        for i in 0..4 {
            assert!(numbers[i] < numbers[i + 1], "Numbers not sorted");
        }
    }

    #[test]
    fn test_generate_quick_pick_winning_numbers_deterministic() {
        let randomness = [0xAB; 32];

        let numbers1 = generate_quick_pick_winning_numbers(&randomness)
            .expect("should generate valid numbers");
        let numbers2 = generate_quick_pick_winning_numbers(&randomness)
            .expect("should generate valid numbers");

        assert_eq!(
            numbers1, numbers2,
            "Same randomness should produce same numbers"
        );
    }

    #[test]
    fn test_should_trigger_quick_pick_rolldown() {
        let randomness = [0xFF; 32];

        // 100% probability should always trigger
        assert!(should_trigger_quick_pick_rolldown(&randomness, 10000));

        // 0% probability should never trigger
        assert!(!should_trigger_quick_pick_rolldown(&randomness, 0));
    }

    #[test]
    fn test_get_quick_pick_rolldown_probability_bps() {
        let soft_cap = 30_000_000_000u64; // $30,000
        let hard_cap = 50_000_000_000u64; // $50,000

        // Below soft cap
        assert_eq!(
            get_quick_pick_rolldown_probability_bps(25_000_000_000, soft_cap, hard_cap),
            0
        );

        // At soft cap
        assert_eq!(
            get_quick_pick_rolldown_probability_bps(30_000_000_000, soft_cap, hard_cap),
            0
        );

        // Midway between soft and hard cap
        assert_eq!(
            get_quick_pick_rolldown_probability_bps(40_000_000_000, soft_cap, hard_cap),
            5000
        );

        // At hard cap
        assert_eq!(
            get_quick_pick_rolldown_probability_bps(50_000_000_000, soft_cap, hard_cap),
            10000
        );

        // Above hard cap
        assert_eq!(
            get_quick_pick_rolldown_probability_bps(50_000_000_000, soft_cap, hard_cap),
            10000
        );
    }
}
