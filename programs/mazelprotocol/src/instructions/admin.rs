//! Admin Instructions
//!
//! This module contains administrative instructions for the lottery protocol:
//! - pause: Emergency pause all lottery operations
//! - unpause: Resume lottery operations after pause
//! - update_config: Update lottery configuration parameters
//! - withdraw_house_fees: Withdraw accumulated house fees

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::errors::LottoError;
use crate::events::{ConfigUpdated, EmergencyPause, EmergencyUnpause, HouseFeesWithdrawn};
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
        constraint = lottery_state.is_paused @ LottoError::InvalidDrawState
    )]
    pub lottery_state: Account<'info, LotteryState>,
}

/// Unpause the lottery
///
/// This instruction resumes all lottery operations after a pause.
/// Only the authority can unpause the lottery.
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
/// For security, this should be behind a timelock in production.
///
/// # Validation Rules
/// - ticket_price: Must be > 0
/// - house_fee_bps: Must be <= 5000 (50%)
/// - soft_cap < hard_cap
/// - seed_amount < soft_cap
/// - jackpot_cap <= hard_cap
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
    msg!("  Remaining balance: {} USDC lamports",
         ctx.accounts.house_fee_usdc.amount.saturating_sub(amount));

    Ok(())
}

// ============================================================================
// TRANSFER AUTHORITY INSTRUCTION
// ============================================================================

/// Accounts required for transferring authority
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

/// Transfer authority to a new address
///
/// This instruction transfers control of the lottery to a new authority.
/// Should be used carefully and ideally with a two-step process (propose/accept).
///
/// # Arguments
/// * `ctx` - The context containing required accounts
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler_transfer_authority(ctx: Context<TransferAuthority>) -> Result<()> {
    let clock = Clock::get()?;
    let lottery_state = &mut ctx.accounts.lottery_state;
    let old_authority = lottery_state.authority;
    let new_authority = ctx.accounts.new_authority.key();

    lottery_state.authority = new_authority;

    emit!(ConfigUpdated {
        parameter: "authority".to_string(),
        old_value: 0, // Can't fit Pubkey in u64, logged separately
        new_value: 0,
        authority: old_authority,
        timestamp: clock.unix_timestamp,
    });

    msg!("Authority transferred!");
    msg!("  Old authority: {}", old_authority);
    msg!("  New authority: {}", new_authority);

    Ok(())
}
