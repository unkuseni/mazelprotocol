//! Admin Instructions
//!
//! This module contains administrative instructions for the lottery protocol:
//! - pause: Emergency pause all lottery operations
//! - unpause: Resume lottery operations after pause
//! - update_config: Update lottery configuration parameters
//! - withdraw_house_fees: Withdraw accumulated house fees
//! - transfer_authority: Two-step authority transfer (propose)
//! - accept_authority: Two-step authority transfer (accept)
//! - cancel_draw: Recovery mechanism for stuck draws

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::errors::LottoError;
use crate::events::{
    ConfigUpdated, DrawCancelled, DrawForceFinalized, EmergencyPause, EmergencyUnpause,
    HouseFeesWithdrawn,
};
use crate::state::LotteryState;

// ============================================================================
// PAUSE INSTRUCTION
// ============================================================================

/// Accounts required for pausing the lottery
#[derive(Accounts)]
pub struct Pause<'info> {
    /// The authority pausing the lottery
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The main lottery state account
    #[account(
        mut,
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump,
        constraint = lottery_state.authority == authority.key() @ LottoError::Unauthorized,
        constraint = !lottery_state.is_paused @ LottoError::Paused
    )]
    pub lottery_state: Account<'info, LotteryState>,
}

/// Emergency pause the lottery
///
/// This instruction pauses all lottery operations including:
/// - Ticket purchases
/// - Draw execution
/// - Prize claims (depending on implementation)
///
/// Only the authority can pause the lottery.
/// Use this for emergency situations like discovered vulnerabilities.
///
/// # Arguments
/// * `ctx` - The context containing required accounts
/// * `reason` - Optional reason for the pause (for logging/events)
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler_pause(ctx: Context<Pause>, reason: String) -> Result<()> {
    let clock = Clock::get()?;
    let lottery_state = &mut ctx.accounts.lottery_state;

    lottery_state.is_paused = true;

    emit!(EmergencyPause {
        authority: ctx.accounts.authority.key(),
        reason: reason.clone(),
        timestamp: clock.unix_timestamp,
    });

    msg!("Lottery PAUSED by authority!");
    msg!("  Authority: {}", ctx.accounts.authority.key());
    msg!("  Reason: {}", reason);
    msg!("  Timestamp: {}", clock.unix_timestamp);

    Ok(())
}

// ============================================================================
// UNPAUSE INSTRUCTION
// ============================================================================

/// Accounts required for unpausing the lottery
#[derive(Accounts)]
pub struct Unpause<'info> {
    /// The authority unpausing the lottery
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The main lottery state account
    #[account(
        mut,
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump,
        constraint = lottery_state.authority == authority.key() @ LottoError::Unauthorized,
        constraint = lottery_state.is_paused @ LottoError::InvalidDrawState,
        // Cannot unpause if not funded
        constraint = lottery_state.is_funded @ LottoError::LotteryNotInitialized
    )]
    pub lottery_state: Account<'info, LotteryState>,
}

/// Unpause the lottery
///
/// This instruction resumes all lottery operations after a pause.
/// Only the authority can unpause the lottery.
/// The lottery must be funded before it can be unpaused.
///
/// # Arguments
/// * `ctx` - The context containing required accounts
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler_unpause(ctx: Context<Unpause>) -> Result<()> {
    let clock = Clock::get()?;
    let lottery_state = &mut ctx.accounts.lottery_state;

    lottery_state.is_paused = false;

    emit!(EmergencyUnpause {
        authority: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });

    msg!("Lottery UNPAUSED by authority!");
    msg!("  Authority: {}", ctx.accounts.authority.key());
    msg!("  Timestamp: {}", clock.unix_timestamp);

    Ok(())
}

// ============================================================================
// UPDATE CONFIG INSTRUCTION
// ============================================================================

/// Parameters for updating configuration
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct UpdateConfigParams {
    /// New ticket price (None to keep current)
    pub ticket_price: Option<u64>,
    /// New house fee in basis points (None to keep current)
    pub house_fee_bps: Option<u16>,
    /// New jackpot cap (None to keep current)
    pub jackpot_cap: Option<u64>,
    /// New seed amount (None to keep current)
    pub seed_amount: Option<u64>,
    /// New soft cap (None to keep current)
    pub soft_cap: Option<u64>,
    /// New hard cap (None to keep current)
    pub hard_cap: Option<u64>,
    /// New Switchboard queue (None to keep current)
    pub switchboard_queue: Option<Pubkey>,
    /// New draw interval (None to keep current)
    pub draw_interval: Option<i64>,
}

/// Accounts required for updating configuration
#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    /// The authority updating the configuration
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The main lottery state account
    #[account(
        mut,
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump,
        constraint = lottery_state.authority == authority.key() @ LottoError::Unauthorized,
        // Cannot update config during an active draw
        constraint = !lottery_state.is_draw_in_progress @ LottoError::DrawInProgress
    )]
    pub lottery_state: Account<'info, LotteryState>,
}

/// Update lottery configuration parameters
///
/// This instruction allows the authority to update various configuration parameters.
///
/// # Security Note
/// In a production environment, consider implementing a timelock for sensitive
/// parameter changes. This implementation logs all changes for transparency.
///
/// # Validation Rules
/// - ticket_price: Must be > 0
/// - house_fee_bps: Must be <= 5000 (50%)
/// - soft_cap < hard_cap
/// - seed_amount < soft_cap
/// - jackpot_cap <= hard_cap
/// - draw_interval: minimum 1 hour, maximum 7 days
///
/// # Arguments
/// * `ctx` - The context containing required accounts
/// * `params` - The configuration parameters to update
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler_update_config(ctx: Context<UpdateConfig>, params: UpdateConfigParams) -> Result<()> {
    let clock = Clock::get()?;
    let lottery_state = &mut ctx.accounts.lottery_state;

    // Update ticket price
    if let Some(ticket_price) = params.ticket_price {
        require!(ticket_price > 0, LottoError::InvalidTicketPrice);

        emit!(ConfigUpdated {
            parameter: "ticket_price".to_string(),
            old_value: lottery_state.ticket_price,
            new_value: ticket_price,
            authority: ctx.accounts.authority.key(),
            timestamp: clock.unix_timestamp,
        });

        lottery_state.ticket_price = ticket_price;
        msg!("Updated ticket_price: {}", ticket_price);
    }

    // Update house fee
    if let Some(house_fee_bps) = params.house_fee_bps {
        require!(house_fee_bps <= 5000, LottoError::InvalidHouseFee);

        emit!(ConfigUpdated {
            parameter: "house_fee_bps".to_string(),
            old_value: lottery_state.house_fee_bps as u64,
            new_value: house_fee_bps as u64,
            authority: ctx.accounts.authority.key(),
            timestamp: clock.unix_timestamp,
        });

        lottery_state.house_fee_bps = house_fee_bps;
        msg!("Updated house_fee_bps: {}", house_fee_bps);
    }

    // Update jackpot cap
    if let Some(jackpot_cap) = params.jackpot_cap {
        emit!(ConfigUpdated {
            parameter: "jackpot_cap".to_string(),
            old_value: lottery_state.jackpot_cap,
            new_value: jackpot_cap,
            authority: ctx.accounts.authority.key(),
            timestamp: clock.unix_timestamp,
        });

        lottery_state.jackpot_cap = jackpot_cap;
        msg!("Updated jackpot_cap: {}", jackpot_cap);
    }

    // Update seed amount
    if let Some(seed_amount) = params.seed_amount {
        emit!(ConfigUpdated {
            parameter: "seed_amount".to_string(),
            old_value: lottery_state.seed_amount,
            new_value: seed_amount,
            authority: ctx.accounts.authority.key(),
            timestamp: clock.unix_timestamp,
        });

        lottery_state.seed_amount = seed_amount;
        msg!("Updated seed_amount: {}", seed_amount);
    }

    // Update soft cap
    if let Some(soft_cap) = params.soft_cap {
        emit!(ConfigUpdated {
            parameter: "soft_cap".to_string(),
            old_value: lottery_state.soft_cap,
            new_value: soft_cap,
            authority: ctx.accounts.authority.key(),
            timestamp: clock.unix_timestamp,
        });

        lottery_state.soft_cap = soft_cap;
        msg!("Updated soft_cap: {}", soft_cap);
    }

    // Update hard cap
    if let Some(hard_cap) = params.hard_cap {
        emit!(ConfigUpdated {
            parameter: "hard_cap".to_string(),
            old_value: lottery_state.hard_cap,
            new_value: hard_cap,
            authority: ctx.accounts.authority.key(),
            timestamp: clock.unix_timestamp,
        });

        lottery_state.hard_cap = hard_cap;
        msg!("Updated hard_cap: {}", hard_cap);
    }

    // Update Switchboard queue
    if let Some(switchboard_queue) = params.switchboard_queue {
        lottery_state.switchboard_queue = switchboard_queue;
        msg!("Updated switchboard_queue: {}", switchboard_queue);
    }

    // Update draw interval
    if let Some(draw_interval) = params.draw_interval {
        require!(
            draw_interval >= 3600 && draw_interval <= 604800,
            LottoError::InvalidDrawInterval
        );

        emit!(ConfigUpdated {
            parameter: "draw_interval".to_string(),
            old_value: lottery_state.draw_interval as u64,
            new_value: draw_interval as u64,
            authority: ctx.accounts.authority.key(),
            timestamp: clock.unix_timestamp,
        });

        lottery_state.draw_interval = draw_interval;
        msg!("Updated draw_interval: {}", draw_interval);
    }

    // Validate relationships after updates
    require!(
        lottery_state.soft_cap < lottery_state.hard_cap,
        LottoError::InvalidCapConfig
    );
    require!(
        lottery_state.seed_amount < lottery_state.soft_cap,
        LottoError::InvalidSeedAmount
    );
    require!(
        lottery_state.jackpot_cap <= lottery_state.hard_cap,
        LottoError::InvalidJackpotCap
    );

    msg!("Configuration updated successfully!");

    Ok(())
}

// ============================================================================
// WITHDRAW HOUSE FEES INSTRUCTION
// ============================================================================

/// Accounts required for withdrawing house fees
#[derive(Accounts)]
pub struct WithdrawHouseFees<'info> {
    /// The authority withdrawing fees
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The main lottery state account
    #[account(
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump,
        constraint = lottery_state.authority == authority.key() @ LottoError::Unauthorized
    )]
    pub lottery_state: Account<'info, LotteryState>,

    /// House fee USDC token account (source)
    #[account(
        mut,
        seeds = [HOUSE_FEE_USDC_SEED],
        bump
    )]
    pub house_fee_usdc: Account<'info, TokenAccount>,

    /// Destination USDC token account (owned by authority or treasury)
    #[account(mut)]
    pub destination_usdc: Account<'info, TokenAccount>,

    /// Token program
    pub token_program: Program<'info, Token>,
}

/// Withdraw accumulated house fees
///
/// This instruction allows the authority to withdraw house fees to a treasury account.
///
/// # Arguments
/// * `ctx` - The context containing required accounts
/// * `amount` - Amount to withdraw (must be <= balance)
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler_withdraw_house_fees(ctx: Context<WithdrawHouseFees>, amount: u64) -> Result<()> {
    let clock = Clock::get()?;

    // Validate amount
    require!(
        amount > 0 && amount <= ctx.accounts.house_fee_usdc.amount,
        LottoError::InsufficientFunds
    );

    // Transfer from house fee account to destination
    let seeds = &[LOTTERY_SEED, &[ctx.accounts.lottery_state.bump]];
    let signer_seeds = &[&seeds[..]];

    let cpi_accounts = Transfer {
        from: ctx.accounts.house_fee_usdc.to_account_info(),
        to: ctx.accounts.destination_usdc.to_account_info(),
        authority: ctx.accounts.lottery_state.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);

    token::transfer(cpi_ctx, amount)?;

    emit!(HouseFeesWithdrawn {
        amount,
        destination: ctx.accounts.destination_usdc.key(),
        authority: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });

    msg!("House fees withdrawn successfully!");
    msg!("  Amount: {} USDC lamports", amount);
    msg!("  Destination: {}", ctx.accounts.destination_usdc.key());
    msg!(
        "  Remaining balance: {} USDC lamports",
        ctx.accounts.house_fee_usdc.amount.saturating_sub(amount)
    );

    Ok(())
}

// ============================================================================
// TWO-STEP AUTHORITY TRANSFER - PROPOSE
// ============================================================================

/// Accounts required for proposing authority transfer
#[derive(Accounts)]
pub struct ProposeAuthority<'info> {
    /// The current authority
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The main lottery state account
    #[account(
        mut,
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump,
        constraint = lottery_state.authority == authority.key() @ LottoError::Unauthorized
    )]
    pub lottery_state: Account<'info, LotteryState>,
}

/// Propose authority transfer to a new address (Step 1 of 2)
///
/// This instruction proposes a new authority. The new authority must call
/// `accept_authority` to complete the transfer. This prevents accidentally
/// transferring control to an incorrect address.
///
/// # Arguments
/// * `ctx` - The context containing required accounts
/// * `new_authority` - The proposed new authority address
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler_propose_authority(
    ctx: Context<ProposeAuthority>,
    new_authority: Pubkey,
) -> Result<()> {
    let clock = Clock::get()?;
    let lottery_state = &mut ctx.accounts.lottery_state;

    // Cannot propose self
    require!(
        new_authority != lottery_state.authority,
        LottoError::InvalidAuthority
    );

    // Cannot propose zero address
    require!(
        new_authority != Pubkey::default(),
        LottoError::InvalidAuthority
    );

    lottery_state.pending_authority = Some(new_authority);

    emit!(ConfigUpdated {
        parameter: "pending_authority".to_string(),
        old_value: 0,
        new_value: 0, // Can't fit Pubkey in u64
        authority: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });

    msg!("Authority transfer proposed!");
    msg!("  Current authority: {}", lottery_state.authority);
    msg!("  Proposed authority: {}", new_authority);
    msg!("  The proposed authority must call accept_authority to complete the transfer.");

    Ok(())
}

// ============================================================================
// TWO-STEP AUTHORITY TRANSFER - ACCEPT
// ============================================================================

/// Accounts required for accepting authority transfer
#[derive(Accounts)]
pub struct AcceptAuthority<'info> {
    /// The new authority accepting the transfer
    #[account(mut)]
    pub new_authority: Signer<'info>,

    /// The main lottery state account
    #[account(
        mut,
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump,
        constraint = lottery_state.pending_authority == Some(new_authority.key()) @ LottoError::Unauthorized
    )]
    pub lottery_state: Account<'info, LotteryState>,
}

/// Accept authority transfer (Step 2 of 2)
///
/// This instruction completes the authority transfer. Only the address that
/// was proposed in `propose_authority` can call this.
///
/// # Arguments
/// * `ctx` - The context containing required accounts
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler_accept_authority(ctx: Context<AcceptAuthority>) -> Result<()> {
    let clock = Clock::get()?;
    let lottery_state = &mut ctx.accounts.lottery_state;

    let old_authority = lottery_state.authority;
    let new_authority = ctx.accounts.new_authority.key();

    lottery_state.authority = new_authority;
    lottery_state.pending_authority = None;

    emit!(ConfigUpdated {
        parameter: "authority".to_string(),
        old_value: 0, // Can't fit Pubkey in u64, logged separately
        new_value: 0,
        authority: new_authority,
        timestamp: clock.unix_timestamp,
    });

    msg!("Authority transfer completed!");
    msg!("  Old authority: {}", old_authority);
    msg!("  New authority: {}", new_authority);

    Ok(())
}

// ============================================================================
// CANCEL AUTHORITY TRANSFER
// ============================================================================

/// Accounts required for canceling authority transfer
#[derive(Accounts)]
pub struct CancelAuthorityTransfer<'info> {
    /// The current authority
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The main lottery state account
    #[account(
        mut,
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump,
        constraint = lottery_state.authority == authority.key() @ LottoError::Unauthorized,
        constraint = lottery_state.pending_authority.is_some() @ LottoError::InvalidDrawState
    )]
    pub lottery_state: Account<'info, LotteryState>,
}

/// Cancel a pending authority transfer
///
/// This instruction cancels a proposed authority transfer before it's accepted.
///
/// # Arguments
/// * `ctx` - The context containing required accounts
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler_cancel_authority_transfer(ctx: Context<CancelAuthorityTransfer>) -> Result<()> {
    let lottery_state = &mut ctx.accounts.lottery_state;

    let cancelled_authority = lottery_state.pending_authority;
    lottery_state.pending_authority = None;

    msg!("Authority transfer cancelled!");
    msg!("  Cancelled proposed authority: {:?}", cancelled_authority);

    Ok(())
}

// ============================================================================
// CANCEL DRAW (TIMEOUT RECOVERY)
// ============================================================================

/// Accounts required for canceling a stuck draw
#[derive(Accounts)]
pub struct CancelDraw<'info> {
    /// The authority canceling the draw
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The main lottery state account
    #[account(
        mut,
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump,
        constraint = lottery_state.authority == authority.key() @ LottoError::Unauthorized,
        constraint = lottery_state.is_draw_in_progress @ LottoError::DrawNotInProgress
    )]
    pub lottery_state: Account<'info, LotteryState>,
}

/// Cancel a stuck draw (timeout recovery)
///
/// This instruction allows the authority to cancel a draw that has timed out.
/// A draw is considered timed out if more than 1 hour has passed since the
/// randomness was committed.
///
/// This is a recovery mechanism for when:
/// - The Switchboard oracle fails to reveal randomness
/// - Network congestion prevents execute_draw from being called
/// - Any other issue causes the draw to get stuck
///
/// # Ticket Handling
/// When a draw is cancelled:
/// - If execute_draw was NOT called yet: The draw_id is NOT incremented,
///   so tickets remain valid for the rescheduled draw with the same draw_id.
/// - If execute_draw WAS called but finalize failed: This should use
///   force_finalize_draw instead, as a DrawResult account already exists.
///
/// # Security
/// - Only the authority can cancel draws
/// - The draw must have timed out (1 hour since commit)
/// - Tickets with matching draw_id remain valid
///
/// # Arguments
/// * `ctx` - The context containing required accounts
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler_cancel_draw(ctx: Context<CancelDraw>) -> Result<()> {
    let clock = Clock::get()?;
    let lottery_state = &mut ctx.accounts.lottery_state;

    // Verify the draw has timed out
    require!(
        lottery_state.is_commit_timed_out(clock.unix_timestamp),
        LottoError::DrawNotReady
    );

    let draw_id = lottery_state.current_draw_id;
    let commit_timestamp = lottery_state.commit_timestamp;
    let tickets_affected = lottery_state.current_draw_tickets;

    // Reset draw state using the helper method
    // IMPORTANT: We do NOT increment draw_id here so tickets remain valid
    lottery_state.reset_draw_state();

    // Do NOT reset current_draw_tickets - they remain for the rescheduled draw
    // Do NOT increment current_draw_id - tickets are for this draw_id

    // Schedule next draw attempt (same draw_id, just new timing)
    lottery_state.next_draw_timestamp = clock.unix_timestamp + lottery_state.draw_interval;

    // Emit cancellation event
    emit!(DrawCancelled {
        draw_id,
        tickets_affected,
        timestamp: clock.unix_timestamp,
        reason: "Timeout - randomness reveal failed".to_string(),
    });

    msg!("Draw cancelled due to timeout!");
    msg!("  Draw ID: {} (unchanged - tickets remain valid)", draw_id);
    msg!("  Tickets in draw: {} (preserved)", tickets_affected);
    msg!("  Commit timestamp: {}", commit_timestamp);
    msg!("  Current timestamp: {}", clock.unix_timestamp);
    msg!(
        "  Time elapsed: {} seconds",
        clock.unix_timestamp - commit_timestamp
    );
    msg!(
        "  Next draw attempt scheduled for: {}",
        lottery_state.next_draw_timestamp
    );
    msg!(
        "  ✓ Tickets for draw {} remain valid for the rescheduled draw.",
        draw_id
    );
    msg!("  ✓ No refunds needed - same draw will be attempted again.");

    Ok(())
}

// ============================================================================
// FORCE FINALIZE DRAW (EMERGENCY)
// ============================================================================

/// Accounts required for force finalizing a draw
#[derive(Accounts)]
pub struct ForceFinalizeDraw<'info> {
    /// The authority force finalizing
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The main lottery state account
    #[account(
        mut,
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump,
        constraint = lottery_state.authority == authority.key() @ LottoError::Unauthorized,
        constraint = lottery_state.is_draw_in_progress @ LottoError::DrawNotInProgress
    )]
    pub lottery_state: Account<'info, LotteryState>,
}

/// Force finalize a draw without winner distribution (emergency only)
///
/// This is an emergency instruction that allows the authority to force a draw
/// to complete without distributing prizes. This should ONLY be used when:
/// - A critical bug is discovered
/// - The draw result account couldn't be created
/// - Manual intervention is needed
///
/// After force finalization:
/// - The jackpot remains intact
/// - Tickets are NOT refunded (users must be compensated off-chain if needed)
/// - The draw ID increments
/// - A new draw cycle begins
///
/// # Warning
/// This is a last-resort emergency function. Improper use can result in
/// users losing their tickets without prize eligibility.
///
/// # Arguments
/// * `ctx` - The context containing required accounts
/// * `reason` - Reason for the force finalization (logged)
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler_force_finalize_draw(ctx: Context<ForceFinalizeDraw>, reason: String) -> Result<()> {
    let clock = Clock::get()?;
    let lottery_state = &mut ctx.accounts.lottery_state;

    let draw_id = lottery_state.current_draw_id;
    let tickets_affected = lottery_state.current_draw_tickets;

    // Reset draw state
    lottery_state.reset_draw_state();
    lottery_state.current_draw_id = lottery_state.current_draw_id.saturating_add(1);
    lottery_state.current_draw_tickets = 0;
    lottery_state.next_draw_timestamp = clock.unix_timestamp + lottery_state.draw_interval;

    // Update house fee based on new jackpot level
    lottery_state.house_fee_bps = lottery_state.get_current_house_fee_bps();

    // FIXED: Emit proper event type for force finalization (not EmergencyPause)
    emit!(DrawForceFinalized {
        draw_id,
        tickets_affected,
        authority: ctx.accounts.authority.key(),
        reason: reason.clone(),
        timestamp: clock.unix_timestamp,
    });

    msg!("⚠️  Draw FORCE FINALIZED by authority!");
    msg!("  Draw ID: {}", draw_id);
    msg!("  Tickets affected: {}", tickets_affected);
    msg!("  Reason: {}", reason);
    msg!("  New draw ID: {}", lottery_state.current_draw_id);
    msg!(
        "  ⚠️  WARNING: {} tickets will NOT receive prizes!",
        tickets_affected
    );
    msg!("  Users may need off-chain compensation.");
    msg!(
        "  Next draw scheduled for: {}",
        lottery_state.next_draw_timestamp
    );

    Ok(())
}

// ============================================================================
// LEGACY TRANSFER AUTHORITY (Deprecated - kept for backwards compatibility)
// ============================================================================

/// Accounts required for transferring authority (deprecated)
#[derive(Accounts)]
pub struct TransferAuthority<'info> {
    /// The current authority
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The new authority
    /// CHECK: This is the new authority public key, no validation needed
    pub new_authority: AccountInfo<'info>,

    /// The main lottery state account
    #[account(
        mut,
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump,
        constraint = lottery_state.authority == authority.key() @ LottoError::Unauthorized
    )]
    pub lottery_state: Account<'info, LotteryState>,
}

/// Transfer authority to a new address (DEPRECATED)
///
/// This instruction is deprecated. Use `propose_authority` and `accept_authority`
/// for a safer two-step transfer process.
///
/// This legacy function now only sets the pending_authority. The new authority
/// must still call `accept_authority` to complete the transfer.
///
/// # Arguments
/// * `ctx` - The context containing required accounts
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler_transfer_authority(ctx: Context<TransferAuthority>) -> Result<()> {
    let clock = Clock::get()?;
    let lottery_state = &mut ctx.accounts.lottery_state;
    let new_authority = ctx.accounts.new_authority.key();

    // Cannot propose self
    require!(
        new_authority != lottery_state.authority,
        LottoError::InvalidAuthority
    );

    // Cannot propose zero address
    require!(
        new_authority != Pubkey::default(),
        LottoError::InvalidAuthority
    );

    // Set pending authority (requires accept_authority to complete)
    lottery_state.pending_authority = Some(new_authority);

    emit!(ConfigUpdated {
        parameter: "pending_authority_legacy".to_string(),
        old_value: 0,
        new_value: 0,
        authority: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });

    msg!("Authority transfer initiated (legacy method)!");
    msg!("  Current authority: {}", lottery_state.authority);
    msg!("  Pending authority: {}", new_authority);
    msg!("  IMPORTANT: The new authority must call accept_authority to complete transfer.");

    Ok(())
}
