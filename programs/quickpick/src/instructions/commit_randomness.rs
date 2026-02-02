//! Commit Randomness for Quick Pick Express Instruction
//!
//! This instruction implements the COMMIT phase of the commit-reveal pattern
//! for Quick Pick Express draws. It stores a reference to the Switchboard
//! randomness account that will be used in the reveal phase.
//!
//! Security:
//! - Must be called BEFORE randomness is revealed
//! - Stores seed_slot and timestamp for verification during reveal
//! - Marks Quick Pick draw as in progress
//! - Has timeout mechanism to prevent stuck states

use anchor_lang::prelude::*;
use switchboard_on_demand::accounts::RandomnessAccountData;

use crate::constants::*;
use crate::errors::QuickPickError;
use crate::events::QuickPickRandomnessCommitted;
use crate::state::{LotteryState, QuickPickState};

/// Accounts required for committing randomness for Quick Pick draw
#[derive(Accounts)]
pub struct CommitQuickPickRandomness<'info> {
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
        constraint = !quick_pick_state.is_paused @ QuickPickError::Paused
    )]
    pub quick_pick_state: Account<'info, QuickPickState>,

    /// The Switchboard randomness account
    /// CHECK: Validated manually by parsing RandomnessAccountData
    pub randomness_account_data: AccountInfo<'info>,
}

impl<'info> CommitQuickPickRandomness<'info> {
    /// Parse and validate the randomness account, returning the seed slot
    pub fn validate_randomness(&self, current_slot: u64) -> Result<u64> {
        // Parse the randomness account data
        let randomness_data =
            RandomnessAccountData::parse(self.randomness_account_data.data.borrow())
                .map_err(|_| QuickPickError::RandomnessParseError)?;

        // SECURITY: Verify the randomness was requested recently
        // The seed_slot should be very recent (within ~25 slots / ~10 seconds)
        require!(
            randomness_data.seed_slot >= current_slot.saturating_sub(25),
            QuickPickError::RandomnessExpired
        );

        // SECURITY: Verify the randomness is NOT yet revealed
        // If get_value returns Ok, it means randomness is already revealed
        // We want it to fail here, meaning randomness is still pending
        let is_revealed = randomness_data.get_value(current_slot).is_ok();
        require!(!is_revealed, QuickPickError::RandomnessAlreadyRevealed);

        Ok(randomness_data.seed_slot)
    }
}

/// Commit to randomness for the upcoming Quick Pick draw
///
/// This instruction:
/// 1. Validates the draw is ready (not paused, draw time reached)
/// 2. Validates the randomness account is valid and not yet revealed
/// 3. Stores the randomness account reference for the reveal phase
/// 4. Records the commit slot and timestamp
///
/// # Security Considerations
/// - The randomness MUST NOT be revealed at commit time
/// - The seed_slot must be recent to prevent using stale randomness
/// - Stores commit_slot for verification during execute_draw
///
/// # Timeout
/// - If execute_draw is not called within 1 hour, the draw can be
///   reset via admin functions to prevent stuck states
///
/// # Arguments
/// * `ctx` - The context containing all required accounts
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler(ctx: Context<CommitQuickPickRandomness>) -> Result<()> {
    let clock = Clock::get()?;

    // Validate draw is ready
    let next_draw_timestamp = ctx.accounts.quick_pick_state.next_draw_timestamp;
    require!(
        clock.unix_timestamp >= next_draw_timestamp,
        QuickPickError::DrawNotReady
    );

    // Validate and get the seed slot from randomness account
    let seed_slot = ctx.accounts.validate_randomness(clock.slot)?;

    // Get draw info for logging and event
    let draw_id = ctx.accounts.quick_pick_state.current_draw;
    let total_tickets = ctx.accounts.quick_pick_state.current_draw_tickets;
    let jackpot_balance = ctx.accounts.quick_pick_state.jackpot_balance;
    let randomness_account = ctx.accounts.randomness_account_data.key();

    // Verify no draw is currently in progress
    require!(
        !ctx.accounts.quick_pick_state.is_draw_in_progress,
        QuickPickError::InvalidDrawState
    );

    // Update state to mark draw as in progress
    let quick_pick_state = &mut ctx.accounts.quick_pick_state;
    quick_pick_state.current_randomness_account = randomness_account;
    quick_pick_state.commit_slot = seed_slot;
    quick_pick_state.commit_timestamp = clock.unix_timestamp;
    quick_pick_state.is_draw_in_progress = true;

    // Emit event
    emit!(QuickPickRandomnessCommitted {
        draw_id,
        commit_slot: seed_slot,
        randomness_account,
        timestamp: clock.unix_timestamp,
    });

    msg!("Quick Pick randomness committed!");
    msg!("  Draw ID: {}", draw_id);
    msg!("  Randomness account: {}", randomness_account);
    msg!("  Seed slot: {}", seed_slot);
    msg!("  Current slot: {}", clock.slot);
    msg!("  Commit timestamp: {}", clock.unix_timestamp);
    msg!("  Total tickets: {}", total_tickets);
    msg!("  Jackpot balance: {} USDC lamports", jackpot_balance);

    Ok(())
}

#[cfg(test)]
mod tests {
    // Tests would require mocking Switchboard accounts
    // which is complex for unit tests
}
