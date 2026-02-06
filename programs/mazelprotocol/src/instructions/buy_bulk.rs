//! Buy Bulk Tickets Instruction
//!
//! This instruction allows players to purchase multiple lottery tickets in a single transaction.
//! It handles:
//! - Number validation for all tickets
//! - Per-user ticket limits enforcement
//! - USDC transfer (player -> prize pool + house fee)
//! - Unified ticket account creation for efficient storage
//! - User stats updates
//! - Fee calculation based on jackpot level
//!
//! Maximum 50 tickets per bulk purchase for individual users.

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::errors::LottoError;
use crate::events::BulkTicketsPurchased;
use crate::state::{LotteryState, UnifiedTicket, UserStats};

/// Parameters for buying multiple tickets
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct BuyBulkParams {
    /// Array of ticket number sets, each containing 6 numbers between 1 and 46
    pub tickets: Vec<[u8; 6]>,
}

/// Accounts required for buying multiple tickets
#[derive(Accounts)]
#[instruction(params: BuyBulkParams)]
pub struct BuyBulk<'info> {
    /// The player purchasing the tickets
    #[account(mut)]
    pub player: Signer<'info>,

    /// The main lottery state account
    /// NOTE: Boxed to reduce stack frame size below SBF's 4096-byte limit.
    /// LotteryState is large (~300+ bytes) and combined with 8 other accounts
    /// in this struct, the unboxed version exceeds the stack offset limit.
    #[account(
        mut,
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump,
        constraint = !lottery_state.is_paused @ LottoError::Paused,
        constraint = lottery_state.is_funded @ LottoError::LotteryNotInitialized,
        constraint = !lottery_state.is_draw_in_progress @ LottoError::DrawInProgress
    )]
    pub lottery_state: Box<Account<'info, LotteryState>>,

    /// The unified ticket account to be created for storing all tickets
    #[account(
        init,
        payer = player,
        space = UnifiedTicket::size_for_count(params.tickets.len()),
        seeds = [
            UNIFIED_TICKET_SEED,
            player.key().as_ref(),
            &lottery_state.current_draw_id.to_le_bytes(),
            &lottery_state.current_draw_tickets.to_le_bytes()
        ],
        bump
    )]
    pub unified_ticket: Account<'info, UnifiedTicket>,

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

    /// Insurance pool USDC token account
    #[account(
        mut,
        seeds = [INSURANCE_POOL_USDC_SEED],
        bump
    )]
    pub insurance_pool_usdc: Account<'info, TokenAccount>,

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

impl<'info> BuyBulk<'info> {
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

    /// Transfer USDC from player to insurance pool account
    pub fn transfer_to_insurance_pool(&self, amount: u64) -> Result<()> {
        let cpi_accounts = Transfer {
            from: self.player_usdc.to_account_info(),
            to: self.insurance_pool_usdc.to_account_info(),
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

/// Buy multiple lottery tickets in one transaction
///
/// This instruction:
/// 1. Validates all selected numbers (1-46, unique, 6 numbers per ticket)
/// 2. Enforces per-user ticket limits for the current draw
/// 3. Enforces bulk purchase limits (max 50 tickets)
/// 4. Calculates the dynamic house fee based on jackpot level
/// 5. Verifies player has sufficient balance for full transaction
/// 6. Transfers USDC from player to prize pool and house fee accounts
/// 7. Creates a unified ticket account with all selected numbers
/// 8. Updates user statistics (tickets, spending, streak)
/// 9. Updates lottery state (jackpot contribution, ticket count)
///
/// # Arguments
/// * `ctx` - The context containing all required accounts
/// * `params` - The bulk ticket purchase parameters (array of number sets)
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler(ctx: Context<BuyBulk>, params: BuyBulkParams) -> Result<()> {
    let clock = Clock::get()?;
    let ticket_count = params.tickets.len();

    // Validate ticket count
    require!(ticket_count > 0, LottoError::EmptyTicketArray);
    require!(
        ticket_count <= MAX_BULK_TICKETS,
        LottoError::BulkPurchaseLimitExceeded
    );

    // Validate all ticket numbers and sort them
    let mut sorted_tickets: Vec<[u8; 6]> = Vec::with_capacity(ticket_count);
    for ticket in &params.tickets {
        validate_numbers(ticket)?;
        let mut sorted = *ticket;
        sorted.sort();
        sorted_tickets.push(sorted);
    }

    // Get values needed for validation and calculation before mutable borrows
    let ticket_price = ctx.accounts.lottery_state.ticket_price;
    let next_draw_timestamp = ctx.accounts.lottery_state.next_draw_timestamp;
    let is_paused = ctx.accounts.lottery_state.is_paused;
    let is_funded = ctx.accounts.lottery_state.is_funded;
    let is_draw_in_progress = ctx.accounts.lottery_state.is_draw_in_progress;
    let current_draw_id = ctx.accounts.lottery_state.current_draw_id;
    let current_draw_tickets = ctx.accounts.lottery_state.current_draw_tickets;
    let soft_cap = ctx.accounts.lottery_state.soft_cap;
    let house_fee_bps = ctx.accounts.lottery_state.get_current_house_fee_bps();

    // Check if ticket sales are open
    let sale_cutoff_time = next_draw_timestamp.checked_sub(TICKET_SALE_CUTOFF);
    let is_sale_open = !is_paused
        && is_funded
        && !is_draw_in_progress
        && sale_cutoff_time.is_some()
        && clock.unix_timestamp < sale_cutoff_time.expect("Sale cutoff time should be valid");
    require!(is_sale_open, LottoError::TicketSaleEnded);

    // Check if jackpot is properly funded (minimum 100% of seed amount)
    let minimum_jackpot = ctx.accounts.lottery_state.seed_amount;
    require!(
        ctx.accounts.lottery_state.jackpot_balance >= minimum_jackpot,
        LottoError::InsufficientJackpotFunding
    );

    // Enforce per-user ticket limit
    let user_tickets_this_draw = ctx.accounts.get_user_tickets_this_draw(current_draw_id);
    let new_total_tickets = user_tickets_this_draw
        .checked_add(ticket_count as u64)
        .ok_or(LottoError::Overflow)?;
    require!(
        new_total_tickets <= MAX_TICKETS_PER_DRAW_PER_USER,
        LottoError::MaxTicketsPerDrawExceeded
    );

    // Calculate total price and fees
    //
    // Fund allocation breakdown (same as single ticket, scaled by count):
    // 1. total_price = ticket_price * ticket_count
    // 2. total_house_fee = total_price * house_fee_bps (dynamic based on jackpot level)
    // 3. after_house_fee = total_price - total_house_fee
    // 4. From after_house_fee:
    //    - total_insurance_contribution = after_house_fee * 2% (goes to insurance_pool_usdc)
    //    - total_prize_pool_transfer = after_house_fee - insurance (goes to prize_pool_usdc)
    //    - Within prize_pool_transfer, we track:
    //      - jackpot_contribution = prize_pool_transfer * 55.6%
    //      - reserve_contribution = prize_pool_transfer * 3%
    //      - fixed_prize_pool = prize_pool_transfer * 39.4% (implicit)
    let total_price = ticket_price
        .checked_mul(ticket_count as u64)
        .ok_or(LottoError::Overflow)?;

    // Calculate dynamic house fee based on current jackpot level
    let total_house_fee =
        (total_price as u128 * house_fee_bps as u128 / BPS_DENOMINATOR as u128) as u64;

    // Calculate what's left after house fee
    let after_house_fee = total_price.saturating_sub(total_house_fee);

    // Insurance gets 2% of after_house_fee (transferred to separate account)
    let total_insurance_contribution = (after_house_fee as u128 * INSURANCE_ALLOCATION_BPS as u128
        / BPS_DENOMINATOR as u128) as u64;

    // Prize pool transfer is after_house_fee MINUS insurance (which goes to separate account)
    let total_prize_pool_transfer = after_house_fee.saturating_sub(total_insurance_contribution);

    // From the prize pool transfer, calculate internal accounting allocations:
    // These are tracked in lottery_state but the USDC all goes to prize_pool_usdc
    let total_jackpot_contribution = (total_prize_pool_transfer as u128
        * JACKPOT_ALLOCATION_BPS as u128
        / BPS_DENOMINATOR as u128) as u64;
    let total_reserve_contribution = (total_prize_pool_transfer as u128
        * RESERVE_ALLOCATION_BPS as u128
        / BPS_DENOMINATOR as u128) as u64;
    // SECURITY FIX (Issue #4): Explicitly track the fixed prize allocation instead
    // of leaving it implicit. This prevents fixed prizes from eroding the jackpot.
    let total_fixed_prize_contribution = (total_prize_pool_transfer as u128
        * FIXED_PRIZE_ALLOCATION_BPS as u128
        / BPS_DENOMINATOR as u128) as u64;

    // Verify player has sufficient balance for TOTAL amount
    // Total = total_house_fee + total_prize_pool_transfer + total_insurance_contribution = total_price
    require!(
        ctx.accounts.player_usdc.amount >= total_price,
        LottoError::InsufficientFunds
    );

    // Transfer to prize pool (excludes insurance - that goes to separate account)
    ctx.accounts
        .transfer_to_prize_pool(total_prize_pool_transfer)?;

    // Transfer to house fee account
    ctx.accounts.transfer_to_house_fee(total_house_fee)?;

    // Transfer insurance contribution to separate insurance pool
    if total_insurance_contribution > 0 {
        ctx.accounts
            .transfer_to_insurance_pool(total_insurance_contribution)?;
    }

    // SECURITY FIX (Issue #8): Replace debug_assert with runtime require!
    // debug_assert is stripped in release builds, leaving this critical
    // invariant unchecked in production. Use require! to enforce it always.
    require!(
        total_house_fee + total_prize_pool_transfer + total_insurance_contribution == total_price,
        LottoError::SafetyCheckFailed
    );

    // Update lottery state with internal accounting
    let lottery_state = &mut ctx.accounts.lottery_state;
    let old_house_fee_bps = lottery_state.house_fee_bps;

    lottery_state.jackpot_balance = lottery_state
        .jackpot_balance
        .checked_add(total_jackpot_contribution)
        .ok_or(LottoError::Overflow)?;
    lottery_state.reserve_balance = lottery_state
        .reserve_balance
        .checked_add(total_reserve_contribution)
        .ok_or(LottoError::Overflow)?;
    lottery_state.insurance_balance = lottery_state
        .insurance_balance
        .checked_add(total_insurance_contribution)
        .ok_or(LottoError::Overflow)?;
    // SECURITY FIX (Issue #4): Track dedicated fixed prize pool balance.
    // This 39.4% allocation is now explicitly tracked instead of being implicit,
    // preventing fixed prize payouts from eroding the advertised jackpot.
    if total_fixed_prize_contribution > 0 {
        lottery_state.fixed_prize_balance = lottery_state
            .fixed_prize_balance
            .checked_add(total_fixed_prize_contribution)
            .ok_or(LottoError::Overflow)?;
    }
    lottery_state.current_draw_tickets = lottery_state
        .current_draw_tickets
        .checked_add(ticket_count as u64)
        .ok_or(LottoError::Overflow)?;
    lottery_state.total_tickets_sold = lottery_state
        .total_tickets_sold
        .checked_add(ticket_count as u64)
        .ok_or(LottoError::Overflow)?;

    // Update house fee based on new jackpot level (dynamic fee system)
    let new_house_fee_bps = lottery_state.get_current_house_fee_bps();
    lottery_state.house_fee_bps = new_house_fee_bps;

    // Log if dynamic fee tier changed
    if old_house_fee_bps != new_house_fee_bps {
        msg!(
            "📈 Dynamic fee tier changed: {}bps -> {}bps",
            old_house_fee_bps,
            new_house_fee_bps
        );
    }

    // Check if rolldown should be pending based on soft cap
    if lottery_state.jackpot_balance >= soft_cap && !lottery_state.is_rolldown_active {
        lottery_state.is_rolldown_active = true;
        msg!(
            "🎰 ROLLDOWN ACTIVATED! Jackpot {} >= Soft Cap {}",
            lottery_state.jackpot_balance,
            soft_cap
        );
    }

    // Check for hard cap (forced rolldown)
    if lottery_state.jackpot_balance >= lottery_state.hard_cap {
        msg!(
            "⚠️  HARD CAP REACHED! Jackpot {} >= Hard Cap {}. Next draw WILL be rolldown.",
            lottery_state.jackpot_balance,
            lottery_state.hard_cap
        );
    }

    let new_jackpot_balance = lottery_state.jackpot_balance;

    // Create unified ticket account
    let unified_ticket = &mut ctx.accounts.unified_ticket;
    unified_ticket.owner = ctx.accounts.player.key();
    unified_ticket.draw_id = current_draw_id;
    unified_ticket.start_ticket_id = current_draw_tickets;
    unified_ticket.ticket_count = ticket_count as u32;
    unified_ticket.numbers = sorted_tickets;
    unified_ticket.purchase_timestamp = clock.unix_timestamp;
    unified_ticket.syndicate = None;
    // Initialize claimed bitmap (1 bit per ticket, rounded up to bytes)
    unified_ticket.claimed_bitmap = vec![0u8; (ticket_count + 7) / 8];
    unified_ticket.bump = ctx.bumps.unified_ticket;

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
        // New draw, reset counter to ticket count
        user_stats.tickets_this_draw = ticket_count as u64;
        user_stats.last_draw_participated = current_draw_id;
    } else {
        // Same draw, increment counter
        user_stats.tickets_this_draw = user_stats
            .tickets_this_draw
            .checked_add(ticket_count as u64)
            .ok_or(LottoError::Overflow)?;
    }

    user_stats.total_tickets = user_stats
        .total_tickets
        .checked_add(ticket_count as u64)
        .ok_or(LottoError::Overflow)?;
    user_stats.total_spent = user_stats
        .total_spent
        .checked_add(total_price)
        .ok_or(LottoError::Overflow)?;
    user_stats.update_streak(current_draw_id);

    // Emit event
    emit!(BulkTicketsPurchased {
        player: ctx.accounts.player.key(),
        draw_id: current_draw_id,
        ticket_count: ticket_count as u32,
        total_price,
        syndicate: None,
        timestamp: clock.unix_timestamp,
    });

    msg!("Bulk tickets purchased successfully!");
    msg!("  Player: {}", ctx.accounts.player.key());
    msg!("  Draw ID: {}", current_draw_id);
    msg!("  Ticket count: {}", ticket_count);
    msg!("  Total price: {} USDC lamports", total_price);
    msg!(
        "  House fee ({}bps): {} USDC lamports",
        house_fee_bps,
        total_house_fee
    );
    msg!(
        "  Prize pool transfer: {} USDC lamports",
        total_prize_pool_transfer
    );
    msg!(
        "  -> Jackpot contribution: {} USDC lamports",
        total_jackpot_contribution
    );
    msg!(
        "  -> Reserve contribution: {} USDC lamports",
        total_reserve_contribution
    );
    msg!(
        "  Insurance contribution: {} USDC lamports",
        total_insurance_contribution
    );
    msg!("  Current jackpot: {} USDC lamports", new_jackpot_balance);
    msg!(
        "  Insurance pool: {} USDC lamports",
        lottery_state.insurance_balance
    );
    msg!("  Rolldown active: {}", lottery_state.is_rolldown_active);
    msg!(
        "  User tickets this draw: {}/{}",
        user_stats.tickets_this_draw,
        MAX_TICKETS_PER_DRAW_PER_USER
    );
    msg!(
        "  Last draw participated: {}",
        user_stats.last_draw_participated
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

    #[test]
    fn test_bulk_params() {
        let params = BuyBulkParams {
            tickets: vec![[1, 2, 3, 4, 5, 6], [7, 8, 9, 10, 11, 12]],
        };
        assert_eq!(params.tickets.len(), 2);
    }
}
