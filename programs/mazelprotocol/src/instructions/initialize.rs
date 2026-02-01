//! Initialize Lottery Instruction
//!
//! This instruction initializes the lottery program with the specified configuration.
//! It can only be called once and sets up all the necessary accounts.
//!
//! IMPORTANT: After initialization, the `fund_seed` instruction MUST be called
//! to deposit the actual seed USDC into the prize pool before the lottery can operate.

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::errors::LottoError;
use crate::events::{JackpotSeeded, LotteryInitialized};
use crate::state::LotteryState;

/// Parameters for initializing the lottery
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializeParams {
    /// Ticket price in USDC lamports
    pub ticket_price: u64,
    /// Initial house fee in basis points
    pub house_fee_bps: u16,
    /// Jackpot cap (soft cap for rolldown trigger)
    pub jackpot_cap: u64,
    /// Seed amount for new jackpot cycles
    pub seed_amount: u64,
    /// Soft cap for probabilistic rolldown
    pub soft_cap: u64,
    /// Hard cap for forced rolldown
    pub hard_cap: u64,
    /// Draw interval in seconds
    pub draw_interval: i64,
    /// Switchboard queue for randomness
    pub switchboard_queue: Pubkey,
}

/// Accounts required for initializing the lottery
#[derive(Accounts)]
pub struct Initialize<'info> {
    /// The authority that will control the lottery (should be a multi-sig)
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The main lottery state account (PDA)
    #[account(
        init,
        payer = authority,
        space = LOTTERY_STATE_SIZE,
        seeds = [LOTTERY_SEED],
        bump
    )]
    pub lottery_state: Account<'info, LotteryState>,

    /// USDC mint account
    pub usdc_mint: Account<'info, Mint>,

    /// Prize pool USDC token account (PDA-controlled)
    #[account(
        init,
        payer = authority,
        seeds = [PRIZE_POOL_USDC_SEED],
        bump,
        token::mint = usdc_mint,
        token::authority = lottery_state
    )]
    pub prize_pool_usdc: Account<'info, TokenAccount>,

    /// House fee USDC token account (PDA-controlled)
    #[account(
        init,
        payer = authority,
        seeds = [HOUSE_FEE_USDC_SEED],
        bump,
        token::mint = usdc_mint,
        token::authority = lottery_state
    )]
    pub house_fee_usdc: Account<'info, TokenAccount>,

    /// Insurance pool USDC token account (PDA-controlled)
    #[account(
        init,
        payer = authority,
        seeds = [INSURANCE_POOL_USDC_SEED],
        bump,
        token::mint = usdc_mint,
        token::authority = lottery_state
    )]
    pub insurance_pool_usdc: Account<'info, TokenAccount>,

    /// System program
    pub system_program: Program<'info, System>,

    /// Token program
    pub token_program: Program<'info, Token>,

    /// Rent sysvar
    pub rent: Sysvar<'info, Rent>,
}

impl<'info> Initialize<'info> {
    /// Validate the initialization parameters
    pub fn validate(&self, params: &InitializeParams) -> Result<()> {
        // Validate ticket price
        require!(params.ticket_price > 0, LottoError::InvalidTicketPrice);

        // Validate house fee (max 50%)
        require!(params.house_fee_bps <= 5000, LottoError::InvalidHouseFee);

        // Validate caps (soft cap < hard cap)
        require!(
            params.soft_cap < params.hard_cap,
            LottoError::InvalidCapConfig
        );

        // Validate jackpot cap is reasonable
        require!(
            params.jackpot_cap > 0 && params.jackpot_cap <= params.hard_cap,
            LottoError::InvalidJackpotCap
        );

        // Validate seed amount (should be less than soft cap)
        require!(
            params.seed_amount < params.soft_cap,
            LottoError::InvalidSeedAmount
        );

        // Validate draw interval (minimum 1 hour, maximum 7 days)
        require!(
            params.draw_interval >= 3600 && params.draw_interval <= 604800,
            LottoError::InvalidDrawInterval
        );

        // Validate USDC mint has 6 decimals
        require!(self.usdc_mint.decimals == 6, LottoError::InvalidUsdcMint);

        Ok(())
    }
}

/// Initialize the lottery program
///
/// This instruction:
/// 1. Creates and initializes the main lottery state PDA
/// 2. Creates the prize pool USDC token account
/// 3. Creates the house fee USDC token account
/// 4. Creates the insurance pool USDC token account
/// 5. Sets all initial configuration parameters
///
/// NOTE: The jackpot_balance starts at 0. You MUST call `fund_seed` after
/// initialization to deposit the actual seed USDC before starting operations.
///
/// # Arguments
/// * `ctx` - The context containing all required accounts
/// * `params` - The initialization parameters
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
    // Validate parameters
    ctx.accounts.validate(&params)?;

    let lottery_state = &mut ctx.accounts.lottery_state;
    let clock = Clock::get()?;

    // Initialize lottery state
    // CRITICAL FIX: jackpot_balance starts at 0, not seed_amount
    // The fund_seed instruction must be called to deposit actual USDC
    lottery_state.authority = ctx.accounts.authority.key();
    lottery_state.switchboard_queue = params.switchboard_queue;
    lottery_state.current_randomness_account = Pubkey::default();
    lottery_state.current_draw_id = 1; // First draw
    lottery_state.jackpot_balance = 0; // FIXED: Start at 0, fund_seed will set this
    lottery_state.reserve_balance = 0;
    lottery_state.insurance_balance = 0;
    lottery_state.ticket_price = params.ticket_price;
    lottery_state.house_fee_bps = params.house_fee_bps;
    lottery_state.jackpot_cap = params.jackpot_cap;
    lottery_state.seed_amount = params.seed_amount;
    lottery_state.soft_cap = params.soft_cap;
    lottery_state.hard_cap = params.hard_cap;
    lottery_state.next_draw_timestamp = clock.unix_timestamp + params.draw_interval;
    lottery_state.draw_interval = params.draw_interval;
    lottery_state.commit_slot = 0;
    lottery_state.commit_timestamp = 0;
    lottery_state.current_draw_tickets = 0;
    lottery_state.total_tickets_sold = 0;
    lottery_state.total_prizes_paid = 0;
    lottery_state.is_draw_in_progress = false;
    lottery_state.is_rolldown_active = false;
    lottery_state.is_paused = true; // FIXED: Start paused until funded
    lottery_state.is_funded = false; // FIXED: Track funding status
    lottery_state.pending_authority = None; // For two-step authority transfer
    lottery_state.bump = ctx.bumps.lottery_state;

    // Emit initialization event
    emit!(LotteryInitialized {
        authority: ctx.accounts.authority.key(),
        ticket_price: params.ticket_price,
        seed_amount: params.seed_amount,
        jackpot_cap: params.jackpot_cap,
        soft_cap: params.soft_cap,
        hard_cap: params.hard_cap,
        timestamp: clock.unix_timestamp,
    });

    msg!("Lottery initialized successfully!");
    msg!("  Authority: {}", ctx.accounts.authority.key());
    msg!("  Ticket price: {} USDC lamports", params.ticket_price);
    msg!(
        "  Required seed amount: {} USDC lamports",
        params.seed_amount
    );
    msg!("  Soft cap: {} USDC lamports", params.soft_cap);
    msg!("  Hard cap: {} USDC lamports", params.hard_cap);
    msg!("  First draw at: {}", lottery_state.next_draw_timestamp);
    msg!("");
    msg!(
        "IMPORTANT: Lottery is PAUSED. Call fund_seed to deposit {} USDC and activate.",
        params.seed_amount
    );

    Ok(())
}

// ============================================================================
// FUND SEED INSTRUCTION
// ============================================================================

/// Accounts required for funding the initial seed
#[derive(Accounts)]
pub struct FundSeed<'info> {
    /// The authority funding the seed (must be lottery authority)
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The main lottery state account
    #[account(
        mut,
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump,
        constraint = lottery_state.authority == authority.key() @ LottoError::Unauthorized,
        constraint = !lottery_state.is_funded @ LottoError::AlreadyInitialized
    )]
    pub lottery_state: Account<'info, LotteryState>,

    /// Authority's USDC token account (source of seed funds)
    #[account(
        mut,
        constraint = authority_usdc.owner == authority.key() @ LottoError::TokenAccountOwnerMismatch,
        constraint = authority_usdc.mint == usdc_mint.key() @ LottoError::InvalidUsdcMint,
        constraint = authority_usdc.amount >= lottery_state.seed_amount @ LottoError::InsufficientFunds
    )]
    pub authority_usdc: Account<'info, TokenAccount>,

    /// Prize pool USDC token account
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

/// Fund the initial seed for the lottery
///
/// This instruction:
/// 1. Transfers the seed amount from authority to prize pool
/// 2. Sets the jackpot_balance to the seed amount
/// 3. Marks the lottery as funded and unpauses it
///
/// This MUST be called after initialize before the lottery can operate.
///
/// # Arguments
/// * `ctx` - The context containing all required accounts
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler_fund_seed(ctx: Context<FundSeed>) -> Result<()> {
    let clock = Clock::get()?;
    let seed_amount = ctx.accounts.lottery_state.seed_amount;

    // Transfer seed USDC from authority to prize pool
    let cpi_accounts = Transfer {
        from: ctx.accounts.authority_usdc.to_account_info(),
        to: ctx.accounts.prize_pool_usdc.to_account_info(),
        authority: ctx.accounts.authority.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    token::transfer(cpi_ctx, seed_amount)?;

    // Update lottery state
    let lottery_state = &mut ctx.accounts.lottery_state;
    lottery_state.jackpot_balance = seed_amount;
    lottery_state.is_funded = true;
    lottery_state.is_paused = false; // Unpause now that we have funds

    // Emit seed event
    emit!(JackpotSeeded {
        draw_id: lottery_state.current_draw_id,
        seed_amount,
        source: "initial_funding".to_string(),
        timestamp: clock.unix_timestamp,
    });

    msg!("Lottery funded successfully!");
    msg!("  Seed amount deposited: {} USDC lamports", seed_amount);
    msg!(
        "  Jackpot balance: {} USDC lamports",
        lottery_state.jackpot_balance
    );
    msg!("  Lottery is now ACTIVE");

    Ok(())
}

// ============================================================================
// ADD RESERVE FUNDS INSTRUCTION
// ============================================================================

/// Accounts required for adding reserve funds
#[derive(Accounts)]
pub struct AddReserveFunds<'info> {
    /// The authority adding funds
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

    /// Authority's USDC token account (source of funds)
    #[account(
        mut,
        constraint = authority_usdc.owner == authority.key() @ LottoError::TokenAccountOwnerMismatch,
        constraint = authority_usdc.mint == usdc_mint.key() @ LottoError::InvalidUsdcMint
    )]
    pub authority_usdc: Account<'info, TokenAccount>,

    /// Prize pool USDC token account
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

/// Add funds to the reserve pool
///
/// This instruction allows the authority to add additional funds to the reserve,
/// which can be used to seed jackpots after wins or rollovers.
///
/// # Arguments
/// * `ctx` - The context containing all required accounts
/// * `amount` - Amount of USDC lamports to add
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler_add_reserve_funds(ctx: Context<AddReserveFunds>, amount: u64) -> Result<()> {
    require!(amount > 0, LottoError::InvalidSeedAmount);
    require!(
        ctx.accounts.authority_usdc.amount >= amount,
        LottoError::InsufficientFunds
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
    let lottery_state = &mut ctx.accounts.lottery_state;
    lottery_state.reserve_balance = lottery_state
        .reserve_balance
        .checked_add(amount)
        .ok_or(LottoError::Overflow)?;

    msg!("Reserve funds added successfully!");
    msg!("  Amount added: {} USDC lamports", amount);
    msg!(
        "  New reserve balance: {} USDC lamports",
        lottery_state.reserve_balance
    );

    Ok(())
}
