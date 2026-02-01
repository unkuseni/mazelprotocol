//! Initialize Lottery Instruction
//!
//! This instruction initializes the lottery program with the specified configuration.
//! It can only be called once and sets up all the necessary accounts.

use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::constants::*;
use crate::errors::LottoError;
use crate::events::LotteryInitialized;
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
    lottery_state.authority = ctx.accounts.authority.key();
    lottery_state.switchboard_queue = params.switchboard_queue;
    lottery_state.current_randomness_account = Pubkey::default();
    lottery_state.current_draw_id = 1; // First draw
    lottery_state.jackpot_balance = params.seed_amount; // Start with seed
    lottery_state.reserve_balance = 0;
    lottery_state.insurance_balance = 0;
    lottery_state.ticket_price = params.ticket_price;
    lottery_state.house_fee_bps = params.house_fee_bps;
    lottery_state.jackpot_cap = params.jackpot_cap;
    lottery_state.seed_amount = params.seed_amount;
    lottery_state.soft_cap = params.soft_cap;
    lottery_state.hard_cap = params.hard_cap;
    lottery_state.next_draw_timestamp = clock.unix_timestamp + params.draw_interval;
    lottery_state.commit_slot = 0;
    lottery_state.current_draw_tickets = 0;
    lottery_state.total_tickets_sold = 0;
    lottery_state.total_prizes_paid = 0;
    lottery_state.is_draw_in_progress = false;
    lottery_state.is_rolldown_active = false;
    lottery_state.is_paused = false;
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
    msg!("  Seed amount: {} USDC lamports", params.seed_amount);
    msg!("  Soft cap: {} USDC lamports", params.soft_cap);
    msg!("  Hard cap: {} USDC lamports", params.hard_cap);
    msg!("  First draw at: {}", lottery_state.next_draw_timestamp);

    Ok(())
}
