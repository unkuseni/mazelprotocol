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
use crate::events::{QuickPickDrawExecuted, QuickPickRolldownExecuted};
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
    pub fn get_revealed_randomness(&self, current_slot: u64, commit_slot: u64) -> Result<[u8; 32]> {
        // Parse the randomness account data
        let randomness_data =
            RandomnessAccountData::parse(self.randomness_account_data.data.borrow())
                .map_err(|_| QuickPickError::RandomnessParseError)?;

        // SECURITY: Verify the randomness is the exact account we committed to.
        // The seed_slot of a Switchboard randomness account is immutable, so
        // this binds the reveal to the commit (the commit side stored the same
        // seed_slot in `commit_slot`).
        require!(randomness_data.seed_slot == commit_slot, QuickPickError::RandomnessNotFresh);

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
        require!(current_slot > randomness_data.seed_slot, QuickPickError::RandomnessNotFresh);

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
    // Mirror the audited rejection-sampling algorithm used by the main
    // lottery (programs/mazelprotocol/src/instructions/execute_draw.rs).
    // The previous `hash_byte % 35` plus linear-probing approach had both
    // modulo bias and correlations between duplicate candidates. Rejection
    // sampling removes the modulo bias entirely, and hash chaining guarantees
    // enough entropy for all five picks.
    use sha2::{Digest, Sha256};

    let n = QUICK_PICK_RANGE as u32; // 35

    // Reject u32 values in the biased tail: the largest multiple of n that
    // fits in a u32. For n = 35 this is 35 * 122,713,351 = 4,294,967,285.
    let reject_threshold = n.wrapping_mul(u32::MAX / n);

    let mut available = [true; QUICK_PICK_RANGE as usize];
    let mut winning_numbers = [0u8; 5];
    let mut numbers_generated = 0usize;

    // Domain-separate the first hash so number generation is independent of
    // the rolldown decision hash derived from the same randomness.
    let mut current_hash = {
        let mut h = Sha256::new();
        h.update(b"quickpick_winning_numbers");
        h.update(randomness);
        h.finalize()
    };
    let mut byte_offset = 0usize;
    let mut hash_round: u8 = 0;

    const MAX_ATTEMPTS: u32 = 256;
    let mut total_attempts: u32 = 0;

    while numbers_generated < 5 {
        total_attempts += 1;
        if total_attempts > MAX_ATTEMPTS {
            msg!("CRITICAL: generate_quick_pick_winning_numbers exhausted {MAX_ATTEMPTS} attempts");
            return Err(QuickPickError::InvalidRandomnessProof.into());
        }

        if byte_offset + 4 > current_hash.len() {
            hash_round = hash_round.wrapping_add(1);
            let mut h = Sha256::new();
            h.update(randomness);
            h.update(&[hash_round]);
            current_hash = h.finalize();
            byte_offset = 0;
        }

        let value = u32::from_le_bytes(
            current_hash[byte_offset..byte_offset + 4]
                .try_into()
                .expect("4-byte slice from 32-byte hash"),
        );
        byte_offset += 4;

        if value >= reject_threshold {
            continue;
        }

        let candidate = (value % n) as u8 + 1;
        if !available[candidate as usize - 1] {
            continue;
        }

        winning_numbers[numbers_generated] = candidate;
        available[candidate as usize - 1] = false;
        numbers_generated += 1;
    }

    // Sort the numbers ascending (protocol convention).
    winning_numbers.sort();

    // Final validation: ensure all numbers are valid (1-35) and unique
    for &num in &winning_numbers {
        if num < 1 || num > QUICK_PICK_RANGE {
            // FIXED: Return an error instead of a predictable fallback.
            // A fixed [1,2,3,4,5] fallback is exploitable — an attacker who
            // can force this path would know the winning numbers in advance.
            // Failing the draw forces admin recovery, which is far safer.
            msg!("CRITICAL: generate_quick_pick_winning_numbers produced invalid number {}", num);
            return Err(QuickPickError::InvalidRandomnessProof.into());
        }
    }

    // Check for duplicates (shouldn't happen with our algorithm)
    let mut seen = [false; QUICK_PICK_RANGE as usize];
    for &num in &winning_numbers {
        if seen[num as usize - 1] {
            // FIXED: Return an error instead of a predictable fallback.
            msg!("CRITICAL: generate_quick_pick_winning_numbers produced duplicate number {}", num);
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

    // Domain-separated hash keeps this decision independent from the winning
    // numbers derived from the same randomness.
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(b"quickpick_rolldown_decision");
    hasher.update(randomness);
    let hash_bytes = hasher.finalize();

    // Read 4 bytes at `start`, padding with zeros if the offset is somehow
    // past the end of the (always 32-byte) hash output.
    let read_roll = |start: usize| -> u32 {
        let mut bytes = [0u8; 4];
        if start < hash_bytes.len() {
            let n = hash_bytes.len().saturating_sub(start).min(4);
            bytes[..n].copy_from_slice(&hash_bytes[start..start + n]);
        }
        u32::from_le_bytes(bytes)
    };

    // Rejection sampling removes the small modulo bias of `roll % 10000`
    // (2^32 is not evenly divisible by 10000), matching the main program.
    let reject_threshold = 10000u32.wrapping_mul(u32::MAX / 10000);
    let first_roll = read_roll(0);
    let roll = if first_roll >= reject_threshold { read_roll(4) } else { first_roll };

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

    // Prevent drawing with zero tickets — wastes randomness and creates
    // edge cases in prize calculation (M-1 fix).
    require!(current_draw_tickets > 0, QuickPickError::InvalidDrawState);
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
    msg!("  Rolldown probability: {}%", rolldown_probability_bps as f64 / 100.0);

    // Get the revealed randomness
    let randomness = ctx
        .accounts
        .get_revealed_randomness(clock.slot, ctx.accounts.quick_pick_state.commit_slot)?;

    // Additional security check - verify randomness is not all zeros or predictable pattern
    let is_valid_randomness = randomness.iter().any(|&b| b != 0);
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

    // SECURITY: Mark draw as executed to prevent skipping.
    ctx.accounts.quick_pick_state.is_awaiting_finalization = true;

    // Emit event
    let jackpot_distributed = if was_rolldown { jackpot_balance } else { 0 };

    // Emit rolldown event if triggered
    if was_rolldown {
        emit!(QuickPickRolldownExecuted {
            draw_id: current_draw,
            jackpot_distributed: jackpot_balance,
            match_4_prize: 0, // Prizes calculated in finalize_draw
            match_3_prize: 0, // Prizes calculated in finalize_draw
            timestamp: clock.unix_timestamp,
        });
    }

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

        assert_eq!(numbers1, numbers2, "Same randomness should produce same numbers");
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
        assert_eq!(get_quick_pick_rolldown_probability_bps(25_000_000_000, soft_cap, hard_cap), 0);

        // At soft cap
        assert_eq!(get_quick_pick_rolldown_probability_bps(30_000_000_000, soft_cap, hard_cap), 0);

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
            get_quick_pick_rolldown_probability_bps(60_000_000_000, soft_cap, hard_cap),
            10000
        );
    }

    // ML-8: Edge-case tests for number generation robustness

    #[test]
    fn test_generate_quick_pick_numbers_all_zeros_randomness() {
        // All-zero randomness is a pathological input — the function
        // should still produce 5 valid unique sorted numbers.
        let randomness = [0u8; 32];
        let result = generate_quick_pick_winning_numbers(&randomness);
        // All-zeros may or may not be rejected (it's a valid but predictable input).
        // If accepted, numbers must be valid, unique, and sorted.
        if let Ok(numbers) = result {
            for &num in numbers.iter() {
                assert!(num >= 1 && num <= 35, "Number {} out of range", num);
            }
            let mut seen = std::collections::HashSet::new();
            for &num in numbers.iter() {
                assert!(seen.insert(num), "Duplicate number: {}", num);
            }
            for i in 0..4 {
                assert!(numbers[i] < numbers[i + 1], "Numbers not sorted");
            }
        }
    }

    #[test]
    fn test_generate_quick_pick_numbers_all_ff_randomness() {
        // All-0xFF randomness is another pathological edge case.
        let randomness = [0xFFu8; 32];
        let numbers = generate_quick_pick_winning_numbers(&randomness)
            .expect("all-FF randomness should produce valid numbers");

        // Standard validity checks
        for &num in numbers.iter() {
            assert!(num >= 1 && num <= 35);
        }
        let mut seen = std::collections::HashSet::new();
        for &num in numbers.iter() {
            assert!(seen.insert(num));
        }
    }

    #[test]
    fn test_generate_quick_pick_numbers_deterministic_multiple_inputs() {
        // Verify determinism holds for several different inputs (ML-8).
        let test_inputs: Vec<[u8; 32]> = vec![
            [0x01; 32],
            [0x55; 32],
            [0xAA; 32],
            [
                0xDE, 0xAD, 0xBE, 0xEF, 0xCA, 0xFE, 0xBA, 0xBE, 0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC,
                0xDE, 0xF0, 0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xAA, 0xBB,
                0xCC, 0xDD, 0xEE, 0xFF,
            ],
        ];

        for randomness in &test_inputs {
            let numbers1 = generate_quick_pick_winning_numbers(randomness)
                .expect("should produce valid numbers");
            let numbers2 = generate_quick_pick_winning_numbers(randomness)
                .expect("should produce valid numbers");
            assert_eq!(
                numbers1,
                numbers2,
                "Determinism failed for input starting with {:02X?}",
                &randomness[..4]
            );
        }
    }

    #[test]
    fn test_generate_quick_pick_numbers_covers_full_range() {
        // Verify that over many different randomness inputs, all numbers 1-35
        // appear at least once (statistical coverage test, ML-8).
        let mut all_numbers_seen = [false; 36]; // index 0 unused
        let mut input = [0u8; 32];

        for seed in 0u32..1000u32 {
            input[0..4].copy_from_slice(&seed.to_le_bytes());
            if let Ok(numbers) = generate_quick_pick_winning_numbers(&input) {
                for &num in numbers.iter() {
                    all_numbers_seen[num as usize] = true;
                }
            }
            // Early exit if we've seen all numbers
            if all_numbers_seen[1..].iter().all(|&seen| seen) {
                break;
            }
        }

        for num in 1..=35 {
            assert!(all_numbers_seen[num], "Number {} was never generated after 1000 seeds", num);
        }
    }
}
