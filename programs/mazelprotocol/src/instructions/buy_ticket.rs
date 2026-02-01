//! Buy Ticket Instruction
//!
//! This instruction allows players to purchase lottery tickets.
//! It handles:
//! - Number validation
//! - USDC transfer (player -> prize pool + house fee)
//! - Ticket account creation
//! - User stats updates
//! - Fee calculation based on jackpot level

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::errors::LottoError;
use crate::events::TicketPurchased;
use crate::state::{LotteryState, TicketData, UserStats};

/// Parameters for buying a ticket
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct BuyTicketParams {
    /// 6 numbers, each between 1 and 46
    pub numbers: [u8; 6],
}

/// Accounts required for buying a ticket
#[derive(Accounts)]
#[instruction(params: BuyTicketParams)]
pub struct BuyTicket<'info> {
    /// The player purchasing the ticket
    #[account(mut)]
    pub player: Signer<'info>,

    /// The main lottery state account
    #[account(
        mut,
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump,
        constraint = !lottery_state.is_paused @ LottoError::Paused,
        constraint = !lottery_state.is_draw_in_progress @ LottoError::DrawInProgress
    )]
    pub lottery_state: Account<'info, LotteryState>,

    /// The ticket account to be created
    #[account(
        init,
        payer = player,
        space = TICKET_SIZE,
        seeds = [
            TICKET_SEED,
            &lottery_state.current_draw_id.to_le_bytes(),
            &lottery_state.current_draw_tickets.to_le_bytes()
        ],
        bump
    )]
    pub ticket: Account<'info, TicketData>,

    /// Player's USDC token account
    #[account(
        mut,
        constraint = player_usdc.owner == player.key() @ LottoError::TokenAccountOwnerMismatch,
        constraint = player_usdc.mint == usdc_mint.key() @ LottoError::InvalidUsdcMint
    )]
    pub player_usdc: Account<'info, TokenAccount>,

    /// Prize pool USDC token account
    #[account(
        mut,
        seeds = [PRIZE_POOL_USDC_SEED],
        bump
    )]
    pub prize_pool_usdc: Account<'info, TokenAccount>,

    /// House fee USDC token account
    #[account(
        mut,
        seeds = [HOUSE_FEE_USDC_SEED],
        bump
    )]
    pub house_fee_usdc: Account<'info, TokenAccount>,

    /// USDC mint
    pub usdc_mint: Account<'info, Mint>,

    /// User statistics account
    #[account(
        init_if_needed,
        payer = player,
        space = USER_STATS_SIZE,
        seeds = [USER_SEED, player.key().as_ref()],
        bump
    )]
    pub user_stats: Account<'info, UserStats>,

    /// Token program
    pub token_program: Program<'info, Token>,

    /// System program
    pub system_program: Program<'info, System>,
}

impl<'info> BuyTicket<'info> {
    /// Transfer USDC from player to prize pool
    pub fn transfer_to_prize_pool(&self, amount: u64) -> Result<()> {
        let cpi_accounts = Transfer {
            from: self.player_usdc.to_account_info(),
            to: self.prize_pool_usdc.to_account_info(),
            authority: self.player.to_account_info(),
        };
        let cpi_program = self.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, amount)
    }

    /// Transfer USDC from player to house fee account
    pub fn transfer_to_house_fee(&self, amount: u64) -> Result<()> {
        let cpi_accounts = Transfer {
            from: self.player_usdc.to_account_info(),
            to: self.house_fee_usdc.to_account_info(),
            authority: self.player.to_account_info(),
        };
        let cpi_program = self.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, amount)
    }
}

/// Buy a single lottery ticket
///
/// This instruction:
/// 1. Validates the selected numbers (1-46, unique, 6 numbers)
/// 2. Calculates the dynamic house fee based on jackpot level
/// 3. Transfers USDC from player to prize pool and house fee accounts
/// 4. Creates the ticket account with the selected numbers
/// 5. Updates user statistics (tickets, spending, streak)
/// 6. Updates lottery state (jackpot contribution, ticket count)
///
/// # Arguments
/// * `ctx` - The context containing all required accounts
/// * `params` - The ticket purchase parameters (numbers)
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler(ctx: Context<BuyTicket>, params: BuyTicketParams) -> Result<()> {
    let clock = Clock::get()?;

    // Validate numbers first (before any borrows)
    validate_numbers(&params.numbers)?;

    // Sort numbers for consistent storage
    let mut sorted_numbers = params.numbers;
    sorted_numbers.sort();

    // Get values needed for validation and calculation before mutable borrows
    let ticket_price = ctx.accounts.lottery_state.ticket_price;
    let next_draw_timestamp = ctx.accounts.lottery_state.next_draw_timestamp;
    let is_paused = ctx.accounts.lottery_state.is_paused;
    let is_draw_in_progress = ctx.accounts.lottery_state.is_draw_in_progress;
    let current_draw_id = ctx.accounts.lottery_state.current_draw_id;
    let soft_cap = ctx.accounts.lottery_state.soft_cap;
    let house_fee_bps = ctx.accounts.lottery_state.get_current_house_fee_bps();

    // Check if ticket sales are open
    let is_sale_open = !is_paused
        && !is_draw_in_progress
        && clock.unix_timestamp < next_draw_timestamp - TICKET_SALE_CUTOFF;
    require!(is_sale_open, LottoError::TicketSaleEnded);

    // Calculate price and fees
    let house_fee = (ticket_price as u128 * house_fee_bps as u128 / BPS_DENOMINATOR as u128) as u64;
    let prize_pool_amount = ticket_price.saturating_sub(house_fee);

    // Check player has sufficient balance
    require!(
        ctx.accounts.player_usdc.amount >= ticket_price,
        LottoError::InsufficientFunds
    );

    // Transfer USDC
    ctx.accounts.transfer_to_house_fee(house_fee)?;
    ctx.accounts.transfer_to_prize_pool(prize_pool_amount)?;

    // Calculate prize pool allocations
    let jackpot_contribution = (prize_pool_amount as u128 * JACKPOT_ALLOCATION_BPS as u128
        / BPS_DENOMINATOR as u128) as u64;
    let reserve_contribution = (prize_pool_amount as u128 * RESERVE_ALLOCATION_BPS as u128
        / BPS_DENOMINATOR as u128) as u64;

    // Update lottery state
    let lottery_state = &mut ctx.accounts.lottery_state;
    lottery_state.jackpot_balance = lottery_state
        .jackpot_balance
        .checked_add(jackpot_contribution)
        .ok_or(LottoError::Overflow)?;
    lottery_state.reserve_balance = lottery_state
        .reserve_balance
        .checked_add(reserve_contribution)
        .ok_or(LottoError::Overflow)?;
    lottery_state.current_draw_tickets = lottery_state
        .current_draw_tickets
        .checked_add(1)
        .ok_or(LottoError::Overflow)?;
    lottery_state.total_tickets_sold = lottery_state
        .total_tickets_sold
        .checked_add(1)
        .ok_or(LottoError::Overflow)?;

    // Update house fee based on new jackpot level
    lottery_state.house_fee_bps = lottery_state.get_current_house_fee_bps();

    // Check if rolldown should be pending
    if lottery_state.jackpot_balance >= soft_cap {
        lottery_state.is_rolldown_active = true;
    }

    let new_jackpot_balance = lottery_state.jackpot_balance;

    // Create ticket
    let ticket = &mut ctx.accounts.ticket;
    ticket.owner = ctx.accounts.player.key();
    ticket.draw_id = current_draw_id;
    ticket.numbers = sorted_numbers;
    ticket.purchase_timestamp = clock.unix_timestamp;
    ticket.is_claimed = false;
    ticket.match_count = 0;
    ticket.prize_amount = 0;
    ticket.syndicate = None;
    ticket.bump = ctx.bumps.ticket;

    // Update user stats
    let user_stats = &mut ctx.accounts.user_stats;

    // Initialize if new
    if user_stats.wallet == Pubkey::default() {
        user_stats.wallet = ctx.accounts.player.key();
        user_stats.bump = ctx.bumps.user_stats;
    }

    user_stats.total_tickets = user_stats
        .total_tickets
        .checked_add(1)
        .ok_or(LottoError::Overflow)?;
    user_stats.total_spent = user_stats
        .total_spent
        .checked_add(ticket_price)
        .ok_or(LottoError::Overflow)?;
    user_stats.update_streak(current_draw_id);

    // Emit event
    emit!(TicketPurchased {
        ticket: ctx.accounts.ticket.key(),
        player: ctx.accounts.player.key(),
        draw_id: current_draw_id,
        numbers: sorted_numbers,
        price: ticket_price,
        syndicate: None,
        timestamp: clock.unix_timestamp,
    });

    msg!("Ticket purchased successfully!");
    msg!("  Player: {}", ctx.accounts.player.key());
    msg!("  Draw ID: {}", current_draw_id);
    msg!("  Numbers: {:?}", sorted_numbers);
    msg!("  Price: {} USDC lamports", ticket_price);
    msg!("  House fee: {} USDC lamports", house_fee);
    msg!(
        "  Jackpot contribution: {} USDC lamports",
        jackpot_contribution
    );
    msg!("  Current jackpot: {} USDC lamports", new_jackpot_balance);

    Ok(())
}

/// Validate ticket numbers
fn validate_numbers(numbers: &[u8; 6]) -> Result<()> {
    // Check range for each number
    for &num in numbers.iter() {
        require!(
            num >= MIN_NUMBER && num <= MAX_NUMBER,
            LottoError::NumbersOutOfRange
        );
    }

    // Check for duplicates by sorting and comparing adjacent
    let mut sorted = *numbers;
    sorted.sort();
    for i in 0..5 {
        require!(sorted[i] != sorted[i + 1], LottoError::DuplicateNumbers);
    }

    Ok(())
}
