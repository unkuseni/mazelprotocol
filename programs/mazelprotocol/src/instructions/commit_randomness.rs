//! Commit Randomness Instruction
//!
//! This instruction commits to Switchboard randomness for the upcoming draw.
//! It implements the commit phase of the commit-reveal pattern:
//! 1. Verifies the randomness account is fresh (not already revealed)
//! 2. Stores the commit slot and timestamp for later verification
//! 3. Associates the randomness account with the current draw
//!
//! SECURITY: The commit must happen in the slot BEFORE the reveal.
//! This prevents manipulation of the randomness outcome.
//!
//! TIMEOUT: If execute_draw is not called within 1 hour of commit,
//! the draw can be cancelled via cancel_draw to prevent stuck states.

use anchor_lang::prelude::*;
use switchboard_on_demand::accounts::RandomnessAccountData;

use crate::constants::*;
use crate::errors::LottoError;
use crate::events::RandomnessCommitted;
use crate::state::LotteryState;

/// Accounts required for committing to randomness
#[derive(Accounts)]
pub struct CommitRandomness<'info> {
    /// The authority initiating the commit (must be lottery authority)
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The main lottery state account
    #[account(
        mut,
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump,
        constraint = lottery_state.authority == authority.key() @ LottoError::Unauthorized,
        constraint = !lottery_state.is_paused @ LottoError::Paused,
        constraint = lottery_state.is_funded @ LottoError::LotteryNotInitialized
    )]
    pub lottery_state: Account<'info, LotteryState>,

    /// The Switchboard randomness account
    /// CHECK: This account is validated manually by parsing RandomnessAccountData
    pub randomness_account_data: AccountInfo<'info>,

    /// The Switchboard queue account
    /// CHECK: Validated against stored queue in lottery state
    #[account(
        constraint = switchboard_queue.key() == lottery_state.switchboard_queue @ LottoError::SwitchboardQueueNotSet
    )]
    pub switchboard_queue: AccountInfo<'info>,

    /// System program
    pub system_program: Program<'info, System>,
}

impl<'info> CommitRandomness<'info> {
    /// Validate the randomness account data and return seed_slot
    pub fn get_randomness_seed_slot(&self, current_slot: u64) -> Result<u64> {
        // Parse the randomness account data
        let randomness_data =
            RandomnessAccountData::parse(self.randomness_account_data.data.borrow())
                .map_err(|_| LottoError::RandomnessParseError)?;

        let seed_slot = randomness_data.seed_slot;

        // SECURITY: Verify randomness is fresh (committed in current or recent slot)
        // Allow up to 10 slots of slack for transaction propagation
        require!(
            seed_slot >= current_slot.saturating_sub(10),
            LottoError::RandomnessExpired
        );

        // SECURITY: Verify randomness has NOT been revealed yet
        // If get_value succeeds, the randomness is already revealed - this is bad!
        if randomness_data.get_value(current_slot).is_ok() {
            return Err(LottoError::RandomnessAlreadyRevealed.into());
        }

        Ok(seed_slot)
    }
}

/// Commit to randomness for the upcoming draw
///
/// This instruction:
/// 1. Validates the lottery is ready for a draw
/// 2. Parses and validates the Switchboard randomness account
/// 3. Ensures the randomness hasn't been revealed yet
/// 4. Stores the commit slot and timestamp for later verification
/// 5. Marks the draw as in progress
///
/// # Security Considerations
/// - The randomness must be committed BEFORE it is revealed
/// - The seed_slot from the randomness account is stored for verification
/// - The commit_timestamp is stored for timeout recovery
/// - During reveal, we verify that seed_slot matches commit_slot
/// - This prevents the authority from choosing favorable randomness
///
/// # Timeout Recovery
/// - If execute_draw is not called within 1 hour (DRAW_COMMIT_TIMEOUT)
/// - The authority can call cancel_draw to reset the state
/// - This prevents the lottery from getting permanently stuck
///
/// # Arguments
/// * `ctx` - The context containing all required accounts
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler(ctx: Context<CommitRandomness>) -> Result<()> {
    let clock = Clock::get()?;

    // Get values needed for validation before mutable borrow
    let next_draw_timestamp = ctx.accounts.lottery_state.next_draw_timestamp;
    let is_draw_in_progress = ctx.accounts.lottery_state.is_draw_in_progress;
    let hard_cap = ctx.accounts.lottery_state.hard_cap;
    let soft_cap = ctx.accounts.lottery_state.soft_cap;
    let jackpot_balance = ctx.accounts.lottery_state.jackpot_balance;
    let current_draw_id = ctx.accounts.lottery_state.current_draw_id;

    // Verify draw time has arrived (within the sale cutoff window)
    require!(
        clock.unix_timestamp >= next_draw_timestamp - TICKET_SALE_CUTOFF,
        LottoError::DrawNotReady
    );

    // Verify no draw is already in progress
    require!(!is_draw_in_progress, LottoError::DrawInProgress);

    // Get and validate the seed slot from randomness account
    let seed_slot = ctx.accounts.get_randomness_seed_slot(clock.slot)?;

    // Store the commit information
    let lottery_state = &mut ctx.accounts.lottery_state;
    lottery_state.commit_slot = seed_slot;
    lottery_state.commit_timestamp = clock.unix_timestamp; // FIXED: Store timestamp for timeout
    lottery_state.current_randomness_account = ctx.accounts.randomness_account_data.key();
    lottery_state.is_draw_in_progress = true;

    // FIXED: Determine rolldown state more precisely
    // is_rolldown_active indicates that rolldown MIGHT happen
    // The actual decision is made in execute_draw based on:
    // - Hard cap: 100% rolldown (forced)
    // - Soft cap: probabilistic rolldown based on randomness
    // - Below soft cap: no rolldown possible
    if jackpot_balance >= hard_cap {
        // Hard cap reached - rolldown is guaranteed
        lottery_state.is_rolldown_active = true;
        msg!("Hard cap reached - rolldown will be forced");
    } else if jackpot_balance >= soft_cap {
        // Soft cap reached - rolldown is possible (probabilistic)
        // The actual decision will be made during execute_draw
        // using the revealed randomness for fairness
        lottery_state.is_rolldown_active = true;
        msg!("Soft cap reached - rolldown may trigger based on randomness");
    } else {
        // Below soft cap - no rolldown
        lottery_state.is_rolldown_active = false;
        msg!("Below soft cap - normal draw mode");
    }

    let is_rolldown_active = lottery_state.is_rolldown_active;
    let randomness_account_key = ctx.accounts.randomness_account_data.key();

    // Emit event
    emit!(RandomnessCommitted {
        draw_id: current_draw_id,
        commit_slot: seed_slot,
        randomness_account: randomness_account_key,
        timestamp: clock.unix_timestamp,
    });

    msg!("Randomness committed successfully!");
    msg!("  Draw ID: {}", current_draw_id);
    msg!("  Commit slot: {}", seed_slot);
    msg!("  Commit timestamp: {}", clock.unix_timestamp);
    msg!("  Current slot: {}", clock.slot);
    msg!("  Randomness account: {}", randomness_account_key);
    msg!("  Rolldown possible: {}", is_rolldown_active);
    msg!("  Jackpot balance: {} USDC lamports", jackpot_balance);
    msg!("");
    msg!(
        "IMPORTANT: execute_draw must be called within {} seconds",
        DRAW_COMMIT_TIMEOUT
    );
    msg!("           or the draw can be cancelled via cancel_draw");

    Ok(())
}
