//! Initialize Quick Pick Express Instruction
//!
//! This instruction initializes the Quick Pick Express mini-lottery state.
//! It sets up the game parameters for the 5/35 matrix lottery that runs
//! every 4 hours.
//!
//! Only the lottery authority can initialize Quick Pick Express.

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::errors::QuickPickError;
use crate::events::{QuickPickInitialized, QuickPickPaused, QuickPickSeeded, QuickPickUnpaused};
use crate::state::{LotteryState, QuickPickState};

/// Parameters for initializing Quick Pick Express
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializeQuickPickParams {
    /// First draw timestamp (optional, defaults to now + draw_interval)
    pub first_draw_timestamp: Option<i64>,
}

/// Accounts required for initializing Quick Pick Express
#[derive(Accounts)]
pub struct InitializeQuickPick<'info> {
    /// The authority (must be lottery authority)
    #[account(
        mut,
        constraint = authority.key() == lottery_state.authority @ QuickPickError::Unauthorized
    )]
    pub authority: Signer<'info>,

    /// The main lottery state (to verify authority)
    #[account(
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump
    )]
    pub lottery_state: Account<'info, LotteryState>,

    /// The Quick Pick state account to be created
    #[account(
        init,
        payer = authority,
        space = QuickPickState::LEN,
        seeds = [QUICK_PICK_SEED],
        bump
    )]
    pub quick_pick_state: Account<'info, QuickPickState>,

    /// System program
    pub system_program: Program<'info, System>,
}

/// Initialize Quick Pick Express
///
/// This instruction:
/// 1. Verifies the caller is the lottery authority
/// 2. Creates the Quick Pick state account
/// 3. Sets up game parameters (5/35 matrix, $1.50 price, 4-hour intervals)
/// 4. Initializes jackpot caps and seed amount
/// 5. Sets the first draw timestamp
///
/// # Arguments
/// * `ctx` - The context containing all required accounts
/// * `params` - Initialization parameters
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler(ctx: Context<InitializeQuickPick>, params: InitializeQuickPickParams) -> Result<()> {
    let clock = Clock::get()?;

    let quick_pick_state = &mut ctx.accounts.quick_pick_state;

    // Set game parameters (5/35 matrix)
    quick_pick_state.current_draw = 1;
    quick_pick_state.ticket_price = QUICK_PICK_TICKET_PRICE;
    quick_pick_state.pick_count = QUICK_PICK_NUMBERS;
    quick_pick_state.number_range = QUICK_PICK_RANGE;
    quick_pick_state.draw_interval = QUICK_PICK_INTERVAL;

    // Set first draw timestamp
    quick_pick_state.next_draw_timestamp = params
        .first_draw_timestamp
        .unwrap_or(clock.unix_timestamp + QUICK_PICK_INTERVAL);

    // Set jackpot parameters
    quick_pick_state.jackpot_balance = 0; // Will be funded separately
    quick_pick_state.soft_cap = QUICK_PICK_SOFT_CAP;
    quick_pick_state.hard_cap = QUICK_PICK_HARD_CAP;
    quick_pick_state.seed_amount = QUICK_PICK_SEED_AMOUNT;

    // Set fixed prize amounts (Normal Mode)
    quick_pick_state.match_4_prize = QUICK_PICK_MATCH_4_PRIZE;
    quick_pick_state.match_3_prize = QUICK_PICK_MATCH_3_PRIZE;

    // Initialize counters and balances
    quick_pick_state.current_draw_tickets = 0;
    quick_pick_state.prize_pool_balance = 0;
    quick_pick_state.insurance_balance = 0;

    // Set initial house fee (will be dynamic based on jackpot)
    quick_pick_state.house_fee_bps = QUICK_PICK_FEE_TIER_1_BPS;

    // Set flags
    quick_pick_state.is_rolldown_pending = false;
    quick_pick_state.is_paused = true; // Start paused, must be funded and unpaused

    // Store bump
    quick_pick_state.bump = ctx.bumps.quick_pick_state;

    // Emit event
    emit!(QuickPickInitialized {
        authority: ctx.accounts.authority.key(),
        ticket_price: QUICK_PICK_TICKET_PRICE,
        seed_amount: QUICK_PICK_SEED_AMOUNT,
        soft_cap: QUICK_PICK_SOFT_CAP,
        hard_cap: QUICK_PICK_HARD_CAP,
        first_draw_timestamp: quick_pick_state.next_draw_timestamp,
        timestamp: clock.unix_timestamp,
    });

    msg!("Quick Pick Express initialized!");
    msg!("  Matrix: {}/{}", QUICK_PICK_NUMBERS, QUICK_PICK_RANGE);
    msg!(
        "  Ticket price: {} USDC lamports (${:.2})",
        QUICK_PICK_TICKET_PRICE,
        QUICK_PICK_TICKET_PRICE as f64 / 1_000_000.0
    );
    msg!("  Draw interval: {} seconds (4 hours)", QUICK_PICK_INTERVAL);
    msg!("  First draw: {}", quick_pick_state.next_draw_timestamp);
    msg!(
        "  Soft cap: {} USDC lamports (${:.0})",
        QUICK_PICK_SOFT_CAP,
        QUICK_PICK_SOFT_CAP as f64 / 1_000_000.0
    );
    msg!(
        "  Hard cap: {} USDC lamports (${:.0})",
        QUICK_PICK_HARD_CAP,
        QUICK_PICK_HARD_CAP as f64 / 1_000_000.0
    );
    msg!("  Status: PAUSED (must fund seed and unpause)");

    Ok(())
}

// ============================================================================
// FUND SEED INSTRUCTION
// ============================================================================

/// Fund the Quick Pick Express seed amount
///
/// This instruction transfers the seed amount to the Quick Pick prize pool
/// and sets the initial jackpot balance.
#[derive(Accounts)]
pub struct FundQuickPickSeed<'info> {
    /// The authority (must be lottery authority)
    #[account(
        mut,
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
        constraint = quick_pick_state.is_paused @ QuickPickError::InvalidDrawState
    )]
    pub quick_pick_state: Account<'info, QuickPickState>,

    /// Authority's USDC token account
    #[account(
        mut,
        constraint = authority_usdc.owner == authority.key() @ QuickPickError::TokenAccountOwnerMismatch
    )]
    pub authority_usdc: Account<'info, TokenAccount>,

    /// Quick Pick prize pool USDC token account
    #[account(
        mut,
        seeds = [PRIZE_POOL_USDC_SEED],
        bump
    )]
    pub prize_pool_usdc: Account<'info, TokenAccount>,

    /// Token program
    pub token_program: Program<'info, Token>,
}

/// Fund Quick Pick seed and unpause
pub fn handler_fund_seed(ctx: Context<FundQuickPickSeed>) -> Result<()> {
    let clock = Clock::get()?;
    let quick_pick_state = &mut ctx.accounts.quick_pick_state;
    let seed_amount = quick_pick_state.seed_amount;

    // Transfer seed amount from authority to prize pool
    let cpi_accounts = Transfer {
        from: ctx.accounts.authority_usdc.to_account_info(),
        to: ctx.accounts.prize_pool_usdc.to_account_info(),
        authority: ctx.accounts.authority.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    token::transfer(cpi_ctx, seed_amount)?;

    // Set jackpot balance
    quick_pick_state.jackpot_balance = seed_amount;

    // Unpause
    quick_pick_state.is_paused = false;

    // Emit event
    emit!(QuickPickSeeded {
        authority: ctx.accounts.authority.key(),
        seed_amount,
        jackpot_balance: seed_amount,
        timestamp: clock.unix_timestamp,
    });

    msg!("Quick Pick Express funded and unpaused!");
    msg!(
        "  Seed amount: {} USDC lamports (${:.0})",
        seed_amount,
        seed_amount as f64 / 1_000_000.0
    );
    msg!("  Status: ACTIVE");

    Ok(())
}

// ============================================================================
// PAUSE/UNPAUSE INSTRUCTIONS
// ============================================================================

/// Pause Quick Pick Express
#[derive(Accounts)]
pub struct PauseQuickPick<'info> {
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

/// Pause Quick Pick Express
pub fn handler_pause(ctx: Context<PauseQuickPick>, reason: String) -> Result<()> {
    let clock = Clock::get()?;
    ctx.accounts.quick_pick_state.is_paused = true;

    emit!(QuickPickPaused {
        authority: ctx.accounts.authority.key(),
        reason: reason.clone(),
        timestamp: clock.unix_timestamp,
    });

    msg!("Quick Pick Express paused!");
    msg!("  Reason: {}", reason);

    Ok(())
}

/// Unpause Quick Pick Express
pub fn handler_unpause(ctx: Context<PauseQuickPick>) -> Result<()> {
    let clock = Clock::get()?;

    require!(
        ctx.accounts.quick_pick_state.jackpot_balance > 0,
        QuickPickError::NotInitialized
    );

    ctx.accounts.quick_pick_state.is_paused = false;

    emit!(QuickPickUnpaused {
        authority: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });

    msg!("Quick Pick Express unpaused!");

    Ok(())
}
