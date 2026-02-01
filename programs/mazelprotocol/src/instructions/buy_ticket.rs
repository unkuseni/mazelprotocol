//! Buy Ticket Instruction
//!
//! This instruction allows players to purchase lottery tickets.
//! It handles:
//! - Number validation
//! - Per-user ticket limits enforcement
//! - Free ticket redemption (Match 2 credits)
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
    /// Whether to use a free ticket credit (if available)
    pub use_free_ticket: bool,
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
        constraint = lottery_state.is_funded @ LottoError::LotteryNotInitialized,
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

    /// Get the number of tickets this user has purchased in the current draw
    pub fn get_user_tickets_this_draw(&self, current_draw_id: u64) -> u64 {
        if self.user_stats.last_draw_participated == current_draw_id {
            self.user_stats.tickets_this_draw
        } else {
            0
        }
    }
}

/// Buy a single lottery ticket
///
/// This instruction:
/// 1. Validates the selected numbers (1-46, unique, 6 numbers)
/// 2. Enforces per-user ticket limits for the current draw
/// 3. Checks for and optionally uses free ticket credits (Match 2 wins)
/// 4. Calculates the dynamic house fee based on jackpot level
/// 5. Verifies player has sufficient balance for full transaction (if not using free ticket)
/// 6. Transfers USDC from player to prize pool and house fee accounts (if not using free ticket)
/// 7. Creates the ticket account with the selected numbers
/// 8. Updates user statistics (tickets, spending, streak, free tickets)
/// 9. Updates lottery state (jackpot contribution, ticket count)
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
    let is_funded = ctx.accounts.lottery_state.is_funded;
    let is_draw_in_progress = ctx.accounts.lottery_state.is_draw_in_progress;
    let current_draw_id = ctx.accounts.lottery_state.current_draw_id;
    let soft_cap = ctx.accounts.lottery_state.soft_cap;
    let house_fee_bps = ctx.accounts.lottery_state.get_current_house_fee_bps();

    // Check if ticket sales are open
    let sale_cutoff_time = next_draw_timestamp.checked_sub(TICKET_SALE_CUTOFF);
    let is_sale_open = !is_paused
        && is_funded
        && !is_draw_in_progress
        && sale_cutoff_time.is_some()
        && clock.unix_timestamp < sale_cutoff_time.unwrap();
    require!(is_sale_open, LottoError::TicketSaleEnded);

    // FIXED: Enforce per-user ticket limit
    let user_tickets_this_draw = ctx.accounts.get_user_tickets_this_draw(current_draw_id);
    require!(
        user_tickets_this_draw < MAX_TICKETS_PER_DRAW_PER_USER,
        LottoError::MaxTicketsPerDrawExceeded
    );

    // Check if user wants to use a free ticket and has one available
    let free_tickets_available = ctx.accounts.user_stats.free_tickets_available;
    let using_free_ticket = params.use_free_ticket && free_tickets_available > 0;

    // FIXED: Validate free ticket usage with correct error code
    if params.use_free_ticket && free_tickets_available == 0 {
        msg!("Free ticket requested but none available!");
        msg!("  User free tickets: {}", free_tickets_available);
        return Err(LottoError::NoFreeTicketsAvailable.into());
    }

    // Calculate price and fees (0 if using free ticket)
    let (house_fee, prize_pool_amount, jackpot_contribution, reserve_contribution, actual_price) =
        if using_free_ticket {
            // Free ticket - no USDC transfer needed
            (0u64, 0u64, 0u64, 0u64, 0u64)
        } else {
            let house_fee =
                (ticket_price as u128 * house_fee_bps as u128 / BPS_DENOMINATOR as u128) as u64;
            let prize_pool_amount = ticket_price.saturating_sub(house_fee);
            let jackpot_contribution = (prize_pool_amount as u128 * JACKPOT_ALLOCATION_BPS as u128
                / BPS_DENOMINATOR as u128) as u64;
            let reserve_contribution = (prize_pool_amount as u128 * RESERVE_ALLOCATION_BPS as u128
                / BPS_DENOMINATOR as u128) as u64;
            (
                house_fee,
                prize_pool_amount,
                jackpot_contribution,
                reserve_contribution,
                ticket_price,
            )
        };

    // Only perform USDC transfers if not using free ticket
    if !using_free_ticket {
        // FIXED: Check player has sufficient balance for TOTAL amount (both transfers)
        require!(
            ctx.accounts.player_usdc.amount >= ticket_price,
            LottoError::InsufficientFunds
        );

        // FIXED: Transfer prize pool amount first (larger amount), then house fee
        // This ensures if prize pool transfer fails, user doesn't lose house fee
        ctx.accounts.transfer_to_prize_pool(prize_pool_amount)?;
        ctx.accounts.transfer_to_house_fee(house_fee)?;
    }

    // Update lottery state
    let lottery_state = &mut ctx.accounts.lottery_state;
    if jackpot_contribution > 0 {
        lottery_state.jackpot_balance = lottery_state
            .jackpot_balance
            .checked_add(jackpot_contribution)
            .ok_or(LottoError::Overflow)?;
    }
    if reserve_contribution > 0 {
        lottery_state.reserve_balance = lottery_state
            .reserve_balance
            .checked_add(reserve_contribution)
            .ok_or(LottoError::Overflow)?;
    }
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
        user_stats.tickets_this_draw = 0;
        user_stats.last_draw_participated = 0;
    }

    // FIXED: Track tickets per draw for limit enforcement
    // Always update last_draw_participated to current draw
    if user_stats.last_draw_participated != current_draw_id {
        // New draw, reset counter to 1
        user_stats.tickets_this_draw = 1;
        user_stats.last_draw_participated = current_draw_id;
    } else {
        // Same draw, increment counter
        user_stats.tickets_this_draw = user_stats
            .tickets_this_draw
            .checked_add(1)
            .ok_or(LottoError::Overflow)?;
    }

    user_stats.total_tickets = user_stats
        .total_tickets
        .checked_add(1)
        .ok_or(LottoError::Overflow)?;
    user_stats.total_spent = user_stats
        .total_spent
        .checked_add(actual_price)
        .ok_or(LottoError::Overflow)?;
    user_stats.update_streak(current_draw_id);

    // FIXED: Decrement free tickets if one was used
    if using_free_ticket {
        user_stats.free_tickets_available = user_stats.free_tickets_available.saturating_sub(1);
    }

    // Emit event
    emit!(TicketPurchased {
        ticket: ctx.accounts.ticket.key(),
        player: ctx.accounts.player.key(),
        draw_id: current_draw_id,
        numbers: sorted_numbers,
        price: actual_price,
        syndicate: None,
        timestamp: clock.unix_timestamp,
    });

    msg!("Ticket purchased successfully!");
    msg!("  Player: {}", ctx.accounts.player.key());
    msg!("  Draw ID: {}", current_draw_id);
    msg!("  Numbers: {:?}", sorted_numbers);
    if using_free_ticket {
        msg!("  FREE TICKET USED!");
        msg!(
            "  Remaining free tickets: {}",
            user_stats.free_tickets_available
        );
    } else {
        msg!("  Price: {} USDC lamports", ticket_price);
        msg!("  House fee: {} USDC lamports", house_fee);
        msg!(
            "  Jackpot contribution: {} USDC lamports",
            jackpot_contribution
        );
    }
    msg!("  Current jackpot: {} USDC lamports", new_jackpot_balance);
    msg!(
        "  User tickets this draw: {}/{}",
        user_stats.tickets_this_draw,
        MAX_TICKETS_PER_DRAW_PER_USER
    );

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_numbers_valid() {
        let numbers = [1, 10, 20, 30, 40, 46];
        assert!(validate_numbers(&numbers).is_ok());
    }

    #[test]
    fn test_buy_ticket_params_with_free_ticket() {
        let params = BuyTicketParams {
            numbers: [1, 2, 3, 4, 5, 6],
            use_free_ticket: true,
        };
        assert!(params.use_free_ticket);
    }

    #[test]
    fn test_validate_numbers_valid_unsorted() {
        let numbers = [46, 1, 30, 10, 40, 20];
        assert!(validate_numbers(&numbers).is_ok());
    }

    #[test]
    fn test_validate_numbers_out_of_range_zero() {
        let numbers = [0, 10, 20, 30, 40, 46];
        assert!(validate_numbers(&numbers).is_err());
    }

    #[test]
    fn test_validate_numbers_out_of_range_high() {
        let numbers = [1, 10, 20, 30, 40, 47];
        assert!(validate_numbers(&numbers).is_err());
    }

    #[test]
    fn test_validate_numbers_duplicates() {
        let numbers = [1, 10, 10, 30, 40, 46];
        assert!(validate_numbers(&numbers).is_err());
    }

    #[test]
    fn test_validate_numbers_all_same() {
        let numbers = [25, 25, 25, 25, 25, 25];
        assert!(validate_numbers(&numbers).is_err());
    }
}
