//! Quick Pick Express Admin Instructions
//!
//! This module contains administrative instructions for managing Quick Pick Express:
//! - update_config: Update Quick Pick configuration parameters
//! - withdraw_house_fees: Withdraw accumulated house fees
//! - cancel_draw: Cancel a stuck/problematic draw
//! - force_finalize_draw: Force finalize a stuck draw
//! - emergency_fund_transfer: Transfer funds between pools in emergencies
//! - add_reserve_funds: Add reserve funds for jackpot seeding

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::errors::QuickPickError;
use crate::events::{
    QuickPickDrawCancelled, QuickPickDrawForceFinalized, QuickPickFeeTierChanged,
    QuickPickHouseFeesWithdrawn,
};
use crate::state::{LotteryState, QuickPickDrawResult, QuickPickState};

// ============================================================================
// UPDATE CONFIG INSTRUCTION
// ============================================================================

/// Parameters for updating Quick Pick configuration
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct UpdateQuickPickConfigParams {
    /// New ticket price (optional)
    pub ticket_price: Option<u64>,
    /// New soft cap (optional)
    pub soft_cap: Option<u64>,
    /// New hard cap (optional)
    pub hard_cap: Option<u64>,
    /// New seed amount (optional)
    pub seed_amount: Option<u64>,
    /// New draw interval (optional)
    pub draw_interval: Option<i64>,
    /// New Match 4 prize (optional)
    pub match_4_prize: Option<u64>,
    /// New Match 3 prize (optional)
    pub match_3_prize: Option<u64>,
}

/// Accounts required for updating Quick Pick configuration
#[derive(Accounts)]
pub struct UpdateQuickPickConfig<'info> {
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
        // Can only update config when paused or no draw in progress
        constraint = quick_pick_state.is_paused || !quick_pick_state.is_draw_in_progress @ QuickPickError::InvalidDrawState
    )]
    pub quick_pick_state: Account<'info, QuickPickState>,
}

/// Update Quick Pick configuration
///
/// This instruction allows the authority to update various configuration
/// parameters. Can only be called when paused or no draw is in progress.
///
/// # Arguments
/// * `ctx` - The context containing all required accounts
/// * `params` - The configuration parameters to update (None = no change)
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler_update_config(
    ctx: Context<UpdateQuickPickConfig>,
    params: UpdateQuickPickConfigParams,
) -> Result<()> {
    let clock = Clock::get()?;
    let quick_pick_state = &mut ctx.accounts.quick_pick_state;

    // Track old house fee for event
    let old_fee_bps = quick_pick_state.house_fee_bps;

    // Update ticket price
    if let Some(ticket_price) = params.ticket_price {
        require!(ticket_price > 0, QuickPickError::InvalidConfig);
        msg!(
            "  Ticket price: {} -> {} USDC lamports",
            quick_pick_state.ticket_price,
            ticket_price
        );
        quick_pick_state.ticket_price = ticket_price;
    }

    // Update soft cap
    if let Some(soft_cap) = params.soft_cap {
        require!(soft_cap > 0, QuickPickError::InvalidConfig);
        msg!(
            "  Soft cap: {} -> {} USDC lamports",
            quick_pick_state.soft_cap,
            soft_cap
        );
        quick_pick_state.soft_cap = soft_cap;
    }

    // Update hard cap
    if let Some(hard_cap) = params.hard_cap {
        require!(hard_cap > 0, QuickPickError::InvalidConfig);
        require!(
            hard_cap > quick_pick_state.soft_cap,
            QuickPickError::InvalidConfig
        );
        msg!(
            "  Hard cap: {} -> {} USDC lamports",
            quick_pick_state.hard_cap,
            hard_cap
        );
        quick_pick_state.hard_cap = hard_cap;
    }

    // Update seed amount
    if let Some(seed_amount) = params.seed_amount {
        require!(seed_amount > 0, QuickPickError::InvalidConfig);
        require!(
            seed_amount < quick_pick_state.soft_cap,
            QuickPickError::InvalidConfig
        );
        msg!(
            "  Seed amount: {} -> {} USDC lamports",
            quick_pick_state.seed_amount,
            seed_amount
        );
        quick_pick_state.seed_amount = seed_amount;
    }

    // Update draw interval
    if let Some(draw_interval) = params.draw_interval {
        // Minimum 1 hour, maximum 24 hours
        require!(
            draw_interval >= 3600 && draw_interval <= 86400,
            QuickPickError::InvalidConfig
        );
        msg!(
            "  Draw interval: {} -> {} seconds",
            quick_pick_state.draw_interval,
            draw_interval
        );
        quick_pick_state.draw_interval = draw_interval;
    }

    // Update Match 4 prize
    if let Some(match_4_prize) = params.match_4_prize {
        require!(match_4_prize > 0, QuickPickError::InvalidConfig);
        msg!(
            "  Match 4 prize: {} -> {} USDC lamports",
            quick_pick_state.match_4_prize,
            match_4_prize
        );
        quick_pick_state.match_4_prize = match_4_prize;
    }

    // Update Match 3 prize
    if let Some(match_3_prize) = params.match_3_prize {
        require!(match_3_prize > 0, QuickPickError::InvalidConfig);
        msg!(
            "  Match 3 prize: {} -> {} USDC lamports",
            quick_pick_state.match_3_prize,
            match_3_prize
        );
        quick_pick_state.match_3_prize = match_3_prize;
    }

    // Recalculate house fee if jackpot-related params changed
    let new_fee_bps = quick_pick_state.get_current_house_fee_bps();
    if new_fee_bps != old_fee_bps {
        quick_pick_state.house_fee_bps = new_fee_bps;

        emit!(QuickPickFeeTierChanged {
            draw_id: quick_pick_state.current_draw,
            old_fee_bps,
            new_fee_bps,
            jackpot_balance: quick_pick_state.jackpot_balance,
            timestamp: clock.unix_timestamp,
        });
    }

    msg!("Quick Pick config updated successfully!");

    Ok(())
}

// ============================================================================
// WITHDRAW HOUSE FEES INSTRUCTION
// ============================================================================

/// Accounts required for withdrawing house fees
#[derive(Accounts)]
pub struct WithdrawQuickPickHouseFees<'info> {
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

    /// The Quick Pick state account (for PDA signing)
    #[account(
        seeds = [QUICK_PICK_SEED],
        bump = quick_pick_state.bump
    )]
    pub quick_pick_state: Account<'info, QuickPickState>,

    /// House fee USDC token account
    #[account(
        mut,
        seeds = [HOUSE_FEE_USDC_SEED],
        bump
    )]
    pub house_fee_usdc: Account<'info, TokenAccount>,

    /// Destination USDC token account
    #[account(mut)]
    pub destination_usdc: Account<'info, TokenAccount>,

    /// Token program
    pub token_program: Program<'info, Token>,
}

/// Withdraw house fees from Quick Pick
///
/// This instruction transfers accumulated house fees to a destination account.
///
/// # Arguments
/// * `ctx` - The context containing all required accounts
/// * `amount` - Amount to withdraw (0 = withdraw all)
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler_withdraw_house_fees(
    ctx: Context<WithdrawQuickPickHouseFees>,
    amount: u64,
) -> Result<()> {
    let clock = Clock::get()?;

    let available_balance = ctx.accounts.house_fee_usdc.amount;
    let withdraw_amount = if amount == 0 || amount > available_balance {
        available_balance
    } else {
        amount
    };

    require!(withdraw_amount > 0, QuickPickError::InsufficientFunds);

    // Transfer house fees using Quick Pick state as signer
    let seeds = &[QUICK_PICK_SEED, &[ctx.accounts.quick_pick_state.bump]];
    let signer_seeds = &[&seeds[..]];

    let cpi_accounts = Transfer {
        from: ctx.accounts.house_fee_usdc.to_account_info(),
        to: ctx.accounts.destination_usdc.to_account_info(),
        authority: ctx.accounts.quick_pick_state.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);

    token::transfer(cpi_ctx, withdraw_amount)?;

    // Emit event
    emit!(QuickPickHouseFeesWithdrawn {
        amount: withdraw_amount,
        destination: ctx.accounts.destination_usdc.key(),
        authority: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });

    msg!("Quick Pick house fees withdrawn!");
    msg!("  Amount: {} USDC lamports", withdraw_amount);
    msg!("  Destination: {}", ctx.accounts.destination_usdc.key());
    msg!(
        "  Remaining balance: {} USDC lamports",
        available_balance.saturating_sub(withdraw_amount)
    );

    Ok(())
}

// ============================================================================
// CANCEL DRAW INSTRUCTION
// ============================================================================

/// Accounts required for cancelling a Quick Pick draw
#[derive(Accounts)]
pub struct CancelQuickPickDraw<'info> {
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
        bump = quick_pick_state.bump
    )]
    pub quick_pick_state: Account<'info, QuickPickState>,
}

/// Cancel a Quick Pick draw
///
/// This instruction cancels the current draw in progress, resetting the state
/// so a new draw can be initiated. Should be used when:
/// - Randomness commit has timed out
/// - There's an issue with the draw execution
/// - Admin needs to reset the draw state
///
/// # Arguments
/// * `ctx` - The context containing all required accounts
/// * `reason` - Reason for cancellation
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler_cancel_draw(ctx: Context<CancelQuickPickDraw>, reason: String) -> Result<()> {
    let clock = Clock::get()?;
    let quick_pick_state = &mut ctx.accounts.quick_pick_state;

    // Get current draw info
    let draw_id = quick_pick_state.current_draw;
    let tickets_affected = quick_pick_state.current_draw_tickets;

    // Reset draw state
    quick_pick_state.is_draw_in_progress = false;
    quick_pick_state.current_randomness_account = Pubkey::default();
    quick_pick_state.commit_slot = 0;
    quick_pick_state.commit_timestamp = 0;

    // Reschedule next draw (advance by draw interval from now)
    quick_pick_state.next_draw_timestamp = clock.unix_timestamp + quick_pick_state.draw_interval;

    // Emit event
    emit!(QuickPickDrawCancelled {
        draw_id,
        tickets_affected,
        reason: reason.clone(),
        timestamp: clock.unix_timestamp,
    });

    msg!("Quick Pick draw #{} cancelled!", draw_id);
    msg!("  Reason: {}", reason);
    msg!("  Tickets affected: {}", tickets_affected);
    msg!("  Next draw time: {}", quick_pick_state.next_draw_timestamp);
    msg!("  Note: Ticket holders should be able to claim refunds or tickets carry over");

    Ok(())
}

// ============================================================================
// FORCE FINALIZE DRAW INSTRUCTION
// ============================================================================

/// Accounts required for force finalizing a Quick Pick draw
#[derive(Accounts)]
pub struct ForceFinalizequickPickDraw<'info> {
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
        bump = quick_pick_state.bump
    )]
    pub quick_pick_state: Account<'info, QuickPickState>,

    /// The Quick Pick draw result account (if exists)
    #[account(
        mut,
        seeds = [QUICK_PICK_DRAW_SEED, &quick_pick_state.current_draw.to_le_bytes()],
        bump = draw_result.bump
    )]
    pub draw_result: Option<Account<'info, QuickPickDrawResult>>,
}

/// Force finalize a Quick Pick draw
///
/// This instruction force finalizes a stuck draw with zero winners,
/// allowing the system to proceed to the next draw. The jackpot carries over.
///
/// # Arguments
/// * `ctx` - The context containing all required accounts
/// * `reason` - Reason for force finalization
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler_force_finalize_draw(
    ctx: Context<ForceFinalizequickPickDraw>,
    reason: String,
) -> Result<()> {
    let clock = Clock::get()?;
    let quick_pick_state = &mut ctx.accounts.quick_pick_state;

    // Get current draw info
    let draw_id = quick_pick_state.current_draw;
    let tickets_affected = quick_pick_state.current_draw_tickets;

    // If draw result exists, mark it as finalized with zero winners
    if let Some(draw_result) = &mut ctx.accounts.draw_result {
        if !draw_result.is_explicitly_finalized {
            draw_result.match_5_winners = 0;
            draw_result.match_4_winners = 0;
            draw_result.match_3_winners = 0;
            draw_result.match_5_prize_per_winner = 0;
            draw_result.match_4_prize_per_winner = 0;
            draw_result.match_3_prize_per_winner = 0;
            draw_result.is_explicitly_finalized = true;
        }
    }

    // Reset draw state and advance to next draw
    quick_pick_state.is_draw_in_progress = false;
    quick_pick_state.current_randomness_account = Pubkey::default();
    quick_pick_state.commit_slot = 0;
    quick_pick_state.commit_timestamp = 0;

    // Advance to next draw
    quick_pick_state.current_draw = draw_id.saturating_add(1);
    quick_pick_state.current_draw_tickets = 0;
    quick_pick_state.next_draw_timestamp = clock.unix_timestamp + quick_pick_state.draw_interval;

    // Jackpot carries over (no winners in force finalization)

    // Emit event
    emit!(QuickPickDrawForceFinalized {
        draw_id,
        tickets_affected,
        authority: ctx.accounts.authority.key(),
        reason: reason.clone(),
        timestamp: clock.unix_timestamp,
    });

    msg!("Quick Pick draw #{} force finalized!", draw_id);
    msg!("  Reason: {}", reason);
    msg!("  Tickets affected: {}", tickets_affected);
    msg!(
        "  Jackpot carries over: {} USDC",
        quick_pick_state.jackpot_balance
    );
    msg!("  Next draw: #{}", quick_pick_state.current_draw);

    Ok(())
}

// ============================================================================
// EMERGENCY FUND TRANSFER INSTRUCTION
// ============================================================================

/// Source of funds for emergency transfer
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub enum QuickPickFundSource {
    /// Reserve fund
    Reserve,
    /// Insurance pool
    Insurance,
    /// Prize pool
    PrizePool,
}

/// Accounts required for emergency fund transfer
#[derive(Accounts)]
pub struct EmergencyQuickPickFundTransfer<'info> {
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
        // Must be paused for emergency transfers
        constraint = quick_pick_state.is_paused @ QuickPickError::InvalidDrawState
    )]
    pub quick_pick_state: Account<'info, QuickPickState>,

    /// Source USDC token account
    #[account(mut)]
    pub source_usdc: Account<'info, TokenAccount>,

    /// Destination USDC token account
    #[account(mut)]
    pub destination_usdc: Account<'info, TokenAccount>,

    /// USDC mint (for validation)
    pub usdc_mint: Account<'info, Mint>,

    /// Token program
    pub token_program: Program<'info, Token>,
}

/// Emergency fund transfer event
#[event]
pub struct QuickPickEmergencyFundTransferred {
    /// Draw ID at time of transfer
    pub draw_id: u64,
    /// Source of funds
    pub source: String,
    /// Amount transferred
    pub amount: u64,
    /// Destination account
    pub destination: Pubkey,
    /// Reason for transfer
    pub reason: String,
    /// Authority who initiated
    pub authority: Pubkey,
    /// Timestamp
    pub timestamp: i64,
}

/// Emergency fund transfer for Quick Pick
///
/// This instruction allows emergency transfer of funds between pools.
/// Should only be used in emergency situations. Quick Pick must be paused.
///
/// # Arguments
/// * `ctx` - The context containing all required accounts
/// * `source` - Source of funds (Reserve, Insurance, or PrizePool)
/// * `amount` - Amount to transfer
/// * `reason` - Reason for the emergency transfer
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler_emergency_fund_transfer(
    ctx: Context<EmergencyQuickPickFundTransfer>,
    source: QuickPickFundSource,
    amount: u64,
    reason: String,
) -> Result<()> {
    let clock = Clock::get()?;

    require!(amount > 0, QuickPickError::InvalidConfig);
    require!(
        ctx.accounts.source_usdc.amount >= amount,
        QuickPickError::InsufficientFunds
    );

    // Validate USDC mint
    require!(
        ctx.accounts.source_usdc.mint == ctx.accounts.usdc_mint.key(),
        QuickPickError::InvalidUsdcMint
    );
    require!(
        ctx.accounts.destination_usdc.mint == ctx.accounts.usdc_mint.key(),
        QuickPickError::InvalidUsdcMint
    );

    let source_name = match source {
        QuickPickFundSource::Reserve => "reserve",
        QuickPickFundSource::Insurance => "insurance",
        QuickPickFundSource::PrizePool => "prize_pool",
    };

    // Transfer funds using Quick Pick state as signer
    let seeds = &[QUICK_PICK_SEED, &[ctx.accounts.quick_pick_state.bump]];
    let signer_seeds = &[&seeds[..]];

    let cpi_accounts = Transfer {
        from: ctx.accounts.source_usdc.to_account_info(),
        to: ctx.accounts.destination_usdc.to_account_info(),
        authority: ctx.accounts.quick_pick_state.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);

    token::transfer(cpi_ctx, amount)?;

    // Update internal balance tracking
    let quick_pick_state = &mut ctx.accounts.quick_pick_state;
    match source {
        QuickPickFundSource::Reserve => {
            quick_pick_state.reserve_balance =
                quick_pick_state.reserve_balance.saturating_sub(amount);
        }
        QuickPickFundSource::Insurance => {
            quick_pick_state.insurance_balance =
                quick_pick_state.insurance_balance.saturating_sub(amount);
        }
        QuickPickFundSource::PrizePool => {
            quick_pick_state.prize_pool_balance =
                quick_pick_state.prize_pool_balance.saturating_sub(amount);
        }
    }

    // Emit event
    emit!(QuickPickEmergencyFundTransferred {
        draw_id: quick_pick_state.current_draw,
        source: source_name.to_string(),
        amount,
        destination: ctx.accounts.destination_usdc.key(),
        reason: reason.clone(),
        authority: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });

    msg!("⚠️ EMERGENCY Quick Pick fund transfer executed!");
    msg!("  Source: {}", source_name);
    msg!("  Amount: {} USDC lamports", amount);
    msg!("  Destination: {}", ctx.accounts.destination_usdc.key());
    msg!("  Reason: {}", reason);
    msg!("  Authority: {}", ctx.accounts.authority.key());

    Ok(())
}

// ============================================================================
// ADD RESERVE FUNDS INSTRUCTION
// ============================================================================

/// Accounts required for adding reserve funds
#[derive(Accounts)]
pub struct AddQuickPickReserveFunds<'info> {
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
        bump = quick_pick_state.bump
    )]
    pub quick_pick_state: Account<'info, QuickPickState>,

    /// Authority's USDC token account (source of funds)
    #[account(
        mut,
        constraint = authority_usdc.owner == authority.key() @ QuickPickError::TokenAccountOwnerMismatch,
        constraint = authority_usdc.mint == usdc_mint.key() @ QuickPickError::InvalidUsdcMint
    )]
    pub authority_usdc: Account<'info, TokenAccount>,

    /// Prize pool USDC token account (destination)
    #[account(
        mut,
        seeds = [PRIZE_POOL_USDC_SEED],
        bump
    )]
    pub prize_pool_usdc: Account<'info, TokenAccount>,

    /// USDC mint
    pub usdc_mint: Account<'info, Mint>,

    /// Token program
    pub token_program: Program<'info, Token>,
}

/// Add reserve funds to Quick Pick
///
/// This instruction allows the authority to add additional reserve funds
/// which can be used for jackpot seeding or emergency situations.
///
/// # Arguments
/// * `ctx` - The context containing all required accounts
/// * `amount` - Amount of USDC lamports to add
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler_add_reserve_funds(
    ctx: Context<AddQuickPickReserveFunds>,
    amount: u64,
) -> Result<()> {
    require!(amount > 0, QuickPickError::InvalidConfig);
    require!(
        ctx.accounts.authority_usdc.amount >= amount,
        QuickPickError::InsufficientFunds
    );

    // Transfer USDC from authority to prize pool
    let cpi_accounts = Transfer {
        from: ctx.accounts.authority_usdc.to_account_info(),
        to: ctx.accounts.prize_pool_usdc.to_account_info(),
        authority: ctx.accounts.authority.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    token::transfer(cpi_ctx, amount)?;

    // Update reserve balance
    let quick_pick_state = &mut ctx.accounts.quick_pick_state;
    quick_pick_state.reserve_balance = quick_pick_state
        .reserve_balance
        .checked_add(amount)
        .ok_or(QuickPickError::Overflow)?;

    msg!("Quick Pick reserve funds added!");
    msg!("  Amount added: {} USDC lamports", amount);
    msg!(
        "  New reserve balance: {} USDC lamports",
        quick_pick_state.reserve_balance
    );

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_update_config_params_default() {
        let params = UpdateQuickPickConfigParams::default();
        assert!(params.ticket_price.is_none());
        assert!(params.soft_cap.is_none());
        assert!(params.hard_cap.is_none());
        assert!(params.seed_amount.is_none());
        assert!(params.draw_interval.is_none());
        assert!(params.match_4_prize.is_none());
        assert!(params.match_3_prize.is_none());
    }

    #[test]
    fn test_fund_source_variants() {
        assert_ne!(QuickPickFundSource::Reserve, QuickPickFundSource::Insurance);
        assert_ne!(
            QuickPickFundSource::Insurance,
            QuickPickFundSource::PrizePool
        );
        assert_ne!(QuickPickFundSource::Reserve, QuickPickFundSource::PrizePool);
    }
}
