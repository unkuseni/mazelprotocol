//! Execute Draw Instruction
//!
//! This instruction reveals the Switchboard randomness and generates winning numbers.
//! It implements the reveal phase of the commit-reveal pattern:
//! 1. Verifies the randomness account matches the committed account
//! 2. Verifies the seed_slot matches the commit_slot (freshness check)
//! 3. Retrieves the revealed random value
//! 4. Generates winning numbers from the randomness
//! 5. Determines rolldown status based on soft/hard caps (probabilistic)
//! 6. Creates the draw result account
//!
//! SOFT/HARD CAP ROLLDOWN SYSTEM:
//! - Below soft cap: No rolldown possible (probability = 0%)
//! - At soft cap: Probabilistic rolldown begins (linear scaling)
//! - At hard cap: Forced rolldown (probability = 100%)
//!
//! SECURITY: This must be called in the slot AFTER the commit.
//! The randomness is only valid if seed_slot == clock.slot - 1.

use anchor_lang::prelude::*;
use switchboard_on_demand::accounts::RandomnessAccountData;

use crate::constants::*;
use crate::errors::LottoError;
use crate::events::{DrawExecuted, HardCapReached, SoftCapReached};
use crate::state::{DrawResult, LotteryState};

/// Accounts required for executing the draw
#[derive(Accounts)]
pub struct ExecuteDraw<'info> {
    /// The authority executing the draw (SECURITY FIX: was previously permissionless)
    /// Without this, anyone could call execute_draw once randomness was committed,
    /// enabling MEV actors to observe randomness and frontrun the reveal.
    #[account(
        constraint = authority.key() == lottery_state.authority @ LottoError::Unauthorized
    )]
    pub authority: Signer<'info>,

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
        // FIXED: Tightened from 50 to 10 slots (~4 seconds) to minimize MEV window.
        // The previous 50-slot (~20s) window gave validators and MEV actors
        // too much time to observe randomness before the reveal transaction.
        // 10 slots is sufficient for normal transaction propagation while
        // dramatically reducing the observation window for attackers.
        // Also enforces minimum delay of 1 slot to ensure commit is settled.
        require!(
            randomness_data.seed_slot >= current_slot.saturating_sub(10),
            LottoError::RandomnessExpired
        );
        require!(
            current_slot > randomness_data.seed_slot,
            LottoError::RandomnessNotFresh
        );

        // Get the revealed random value
        let revealed_value = randomness_data
            .get_value(current_slot)
            .map_err(|_| LottoError::RandomnessNotResolved)?;

        Ok(revealed_value)
    }
}

/// Generate winning numbers from randomness bytes using rejection sampling.
///
/// Uses a cryptographically sound algorithm to convert 32 bytes of randomness
/// into 6 unique numbers in the range [1, 46] with **zero modulo bias**.
///
/// Algorithm (Fix #8 — rejection sampling):
/// 1. Domain-separate randomness via SHA256("winning_numbers" || randomness)
/// 2. Extract u32 values from the hash output
/// 3. For each u32, reject values in the biased tail of the u32 range
///    (i.e. values >= largest multiple of MAX_NUMBER that fits in u32)
/// 4. Accepted values are mapped to [0, MAX_NUMBER-1] via `val % MAX_NUMBER`, then +1
/// 5. If a candidate is a duplicate, request next u32 from the hash stream
/// 6. If hash bytes are exhausted, chain another round: SHA256(randomness || counter)
/// 7. Sort the final 6 numbers
///
/// Why rejection sampling matters:
/// Plain `rand % 46` has bias because 2^32 is not evenly divisible by 46.
/// The bias is tiny (~0.0000011%) but in a high-value lottery it is a
/// correctness issue that auditors flag. Rejection sampling eliminates it
/// entirely by discarding values that would cause uneven mapping.
///
/// # Arguments
/// * `randomness` - 32 bytes of verified Switchboard randomness
///
/// # Returns
/// * `Result<[u8; 6]>` - Sorted array of 6 unique winning numbers, or error
fn generate_winning_numbers(randomness: &[u8; 32]) -> Result<[u8; 6]> {
    use sha2::{Digest, Sha256};

    let n = MAX_NUMBER as u32; // 46

    // Rejection threshold: largest multiple of n that fits in u32.
    // Values at or above this threshold are rejected to eliminate modulo bias.
    // For n=46: 46 * (2^32 / 46) = 46 * 93_368_854 = 4_294_967_284
    // So values 4_294_967_284 ..= 4_294_967_295 (12 values) are rejected.
    let reject_threshold: u32 = n.wrapping_mul(u32::MAX / n);
    // NOTE: u32::MAX / 46 = 93_368_854 (integer division), 46 * 93_368_854 = 4_294_927_284
    // Anything >= 4_294_927_284 maps unevenly and must be rejected.

    let mut available = [true; MAX_NUMBER as usize]; // tracks which numbers are taken
    let mut winning_numbers = [0u8; 6];
    let mut numbers_generated = 0usize;

    // We produce hash bytes in 32-byte chunks. Each chunk yields up to 8 u32 values.
    // Counter for chaining additional hash rounds if we exhaust a chunk.
    let mut hash_round: u8 = 0;

    // Produce first hash: domain-separated to avoid correlation with rolldown_decision hash
    let mut current_hash = {
        let mut h = Sha256::new();
        h.update(b"winning_numbers");
        h.update(randomness);
        h.finalize()
    };
    let mut byte_offset = 0usize; // offset into current_hash

    // Safety: we need 6 numbers from 46 choices. Even with rejection and
    // duplicate retries, we will almost certainly finish within a few rounds.
    // Hard limit prevents infinite loops in pathological cases.
    let mut total_attempts: u32 = 0;
    const MAX_ATTEMPTS: u32 = 256;

    while numbers_generated < 6 {
        total_attempts += 1;
        if total_attempts > MAX_ATTEMPTS {
            msg!(
                "CRITICAL: generate_winning_numbers exhausted {} attempts",
                MAX_ATTEMPTS
            );
            return Err(LottoError::InvalidRandomnessProof.into());
        }

        // If we've consumed all bytes in current hash, chain a new round
        if byte_offset + 4 > current_hash.len() {
            hash_round = hash_round.wrapping_add(1);
            let mut h = Sha256::new();
            h.update(randomness);
            h.update(&[hash_round]);
            current_hash = h.finalize();
            byte_offset = 0;
        }

        // Extract a u32 from the hash
        let val = u32::from_le_bytes(
            current_hash[byte_offset..byte_offset + 4]
                .try_into()
                .expect("4-byte slice from hash"),
        );
        byte_offset += 4;

        // Rejection sampling: discard biased tail values
        if val >= reject_threshold {
            continue;
        }

        // Uniform mapping into [1, MAX_NUMBER]
        let candidate = (val % n) as u8 + 1;

        // Skip duplicates
        if !available[candidate as usize - 1] {
            continue;
        }

        // Accept this number
        winning_numbers[numbers_generated] = candidate;
        available[candidate as usize - 1] = false;
        numbers_generated += 1;
    }

    // Sort ascending (protocol convention)
    winning_numbers.sort();

    // Final validation: all numbers valid and unique
    let mut seen = [false; MAX_NUMBER as usize];
    for &num in &winning_numbers {
        if num < 1 || num > MAX_NUMBER {
            msg!(
                "CRITICAL: generate_winning_numbers produced invalid number {}",
                num
            );
            return Err(LottoError::InvalidRandomnessProof.into());
        }
        if seen[num as usize - 1] {
            msg!(
                "CRITICAL: generate_winning_numbers produced duplicate number {}",
                num
            );
            return Err(LottoError::InvalidRandomnessProof.into());
        }
        seen[num as usize - 1] = true;
    }

    Ok(winning_numbers)
}

/// Determine if rolldown should trigger based on randomness and probability
///
/// Uses SHA256 hash of randomness for more uniform distribution
/// to make a probabilistic decision based on the rolldown probability
/// calculated from jackpot level.
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

    // FIXED: Use domain-separated SHA256 hash to prevent correlated randomness.
    // Previously, the same raw randomness was hashed for both number generation
    // and rolldown decision, which could create exploitable correlations.
    // By adding a domain separator ("rolldown_decision"), the hash output is
    // completely independent from the one used for winning numbers.
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(b"rolldown_decision");
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
    let soft_cap = ctx.accounts.lottery_state.soft_cap;
    let hard_cap = ctx.accounts.lottery_state.hard_cap;
    let rolldown_probability_bps = ctx.accounts.lottery_state.get_rolldown_probability_bps();

    // Log soft/hard cap status
    msg!("📊 Soft/Hard Cap Status:");
    msg!("  Jackpot balance: {} USDC lamports", jackpot_balance);
    msg!("  Soft cap: {} USDC lamports", soft_cap);
    msg!("  Hard cap: {} USDC lamports", hard_cap);
    msg!("  Rolldown active: {}", is_rolldown_active);
    msg!(
        "  Rolldown probability: {}%",
        rolldown_probability_bps as f64 / 100.0
    );

    // Get the revealed randomness
    let randomness = ctx
        .accounts
        .get_revealed_randomness(clock.slot, commit_slot)?;

    // FIXED: Stronger security check - verify randomness has sufficient entropy
    // Require at least 8 unique bytes out of 32 (25% uniqueness minimum)
    // This protects against:
    // 1. All zeros pattern
    // 2. Repeating single byte patterns
    // 3. Low entropy patterns that could be predictable
    let unique_bytes: std::collections::HashSet<_> = randomness.iter().collect();
    let unique_count = unique_bytes.len();

    // Also check that randomness is not mostly zeros (at least 4 non-zero bytes)
    let non_zero_count = randomness.iter().filter(|&&b| b != 0).count();

    let is_valid_randomness = unique_count >= 8 && non_zero_count >= 4;

    if !is_valid_randomness {
        msg!("Invalid randomness detected!");
        msg!("  Unique bytes: {} (minimum 8 required)", unique_count);
        msg!("  Non-zero bytes: {} (minimum 4 required)", non_zero_count);
        return Err(LottoError::InvalidRandomnessProof.into());
    }

    // Generate winning numbers
    // FIXED: Now returns Result — propagates error instead of using predictable fallback
    let winning_numbers = generate_winning_numbers(&randomness)?;

    // ==========================================================================
    // SOFT/HARD CAP ROLLDOWN DETERMINATION
    // ==========================================================================
    // Determine if this draw triggers a rolldown based on:
    // - Hard cap: 100% probability (forced rolldown)
    // - Soft cap to hard cap: Linear probability scaling
    // - Below soft cap: 0% probability (no rolldown)

    let was_rolldown = if jackpot_balance >= hard_cap {
        // Hard cap reached - FORCED rolldown (100% probability)
        msg!("⚠️  HARD CAP TRIGGERED: Forced rolldown!");

        emit!(HardCapReached {
            draw_id: current_draw_id,
            jackpot_balance,
            hard_cap,
            timestamp: clock.unix_timestamp,
        });

        true
    } else if is_rolldown_active && jackpot_balance >= soft_cap {
        // Soft cap reached - probabilistic rolldown
        let triggered = should_trigger_rolldown(&randomness, rolldown_probability_bps);

        if triggered {
            msg!(
                "🎰 SOFT CAP ROLLDOWN TRIGGERED! (probability was {}%)",
                rolldown_probability_bps as f64 / 100.0
            );

            emit!(SoftCapReached {
                draw_id: current_draw_id,
                jackpot_balance,
                soft_cap,
                rolldown_probability_bps,
                timestamp: clock.unix_timestamp,
            });
        } else {
            msg!(
                "🎰 Soft cap active but rolldown NOT triggered (probability was {}%)",
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

    // Explicitly mark as not finalized (will be set true in finalize_draw)
    draw_result.is_explicitly_finalized = false;

    // Fix #3: Initialize per-draw reclaim accounting fields to zero.
    // total_committed will be set to total_distributed during finalize_draw.
    // total_reclaimed will be incremented by reclaim_expired_prizes.
    draw_result.total_committed = 0;
    draw_result.total_reclaimed = 0;

    // Store hash of randomness for additional verification
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(&randomness);
    let randomness_hash = hasher.finalize();
    // Note: We would need to add a field to DrawResult for this
    // For now, we'll log it for verification
    msg!("Randomness hash: {:?}", randomness_hash);

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
    if was_rolldown {
        msg!("  🎰 ROLLDOWN ACTIVE: Jackpot will be distributed to lower tiers!");
        msg!("    Match 5: 25% of jackpot (pari-mutuel)");
        msg!("    Match 4: 35% of jackpot (pari-mutuel)");
        msg!("    Match 3: 40% of jackpot (pari-mutuel)");
    }

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

        let numbers = generate_winning_numbers(&randomness).expect("should generate valid numbers");

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

        let numbers1 =
            generate_winning_numbers(&randomness).expect("should generate valid numbers");
        let numbers2 =
            generate_winning_numbers(&randomness).expect("should generate valid numbers");

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
