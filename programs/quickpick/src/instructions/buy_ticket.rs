//! Buy Quick Pick Ticket Instruction
//!
//! This instruction allows any player to purchase Quick Pick Express tickets.
//! It handles:
//! - Number validation (5 unique numbers from 1-35)
//! - Dynamic fee calculation based on jackpot level
//! - USDC transfer (player -> prize pool + house fee + insurance)
//! - Ticket account creation
//!
//! NOTE: The $50 main-lottery spend gate is enforced FRONTEND-ONLY. The
//! program no longer reads the main lottery's `UserStats` account; anyone
//! can buy tickets on-chain. The frontend is responsible for showing the
//! gate UI (locked overlay) before allowing checkout.
//!
//! Key differences from main lottery:
//! - 5/35 matrix instead of 6/46
//! - $1.50 ticket price instead of $2.50
//! - No free tickets (Match 2 doesn't exist)

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::errors::QuickPickError;
use crate::events::QuickPickTicketPurchased;
use crate::state::{QuickPickState, QuickPickTicket, QuickPickUserStats};

/// Parameters for buying a Quick Pick ticket
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct BuyQuickPickTicketParams {
    /// 5 numbers, each between 1 and 35
    pub numbers: [u8; 5],
}

/// Accounts required for buying a Quick Pick ticket
#[derive(Accounts)]
#[instruction(params: BuyQuickPickTicketParams)]
pub struct BuyQuickPickTicket<'info> {
    /// The player purchasing the ticket
    #[account(mut)]
    pub player: Signer<'info>,

    /// The Quick Pick state account
    #[account(
        mut,
        seeds = [QUICK_PICK_SEED],
        bump = quick_pick_state.bump,
        constraint = !quick_pick_state.is_paused @ QuickPickError::Paused,
        constraint = !quick_pick_state.is_draw_in_progress @ QuickPickError::InvalidDrawState
    )]
    pub quick_pick_state: Account<'info, QuickPickState>,

    /// The ticket account to be created
    #[account(
        init,
        payer = player,
        space = QuickPickTicket::LEN,
        seeds = [
            QUICK_PICK_TICKET_SEED,
            &quick_pick_state.current_draw.to_le_bytes(),
            &quick_pick_state.current_draw_tickets.to_le_bytes()
        ],
        bump
    )]
    pub ticket: Account<'info, QuickPickTicket>,

    /// Player's USDC token account
    #[account(
        mut,
        constraint = player_usdc.owner == player.key() @ QuickPickError::TokenAccountOwnerMismatch,
        constraint = player_usdc.mint == usdc_mint.key() @ QuickPickError::InvalidUsdcMint
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

    /// Per-wallet Quick Pick stats (M2: enforces per-draw ticket cap).
    /// Auto-initialized on the wallet's first purchase (payer = player).
    #[account(
        init_if_needed,
        payer = player,
        space = QuickPickUserStats::LEN,
        seeds = [QUICK_PICK_USER_SEED, player.key().as_ref()],
        bump
    )]
    pub user_stats: Account<'info, QuickPickUserStats>,

    /// Token program
    pub token_program: Program<'info, Token>,

    /// System program
    pub system_program: Program<'info, System>,
}

impl<'info> BuyQuickPickTicket<'info> {
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
}

/// Buy a Quick Pick Express ticket
///
/// This instruction:
/// 1. Validates the selected numbers (1-35, unique, 5 numbers)
/// 2. Checks if ticket sales are open for the current draw
/// 3. Calculates the dynamic house fee based on jackpot level
/// 4. Transfers USDC from player to prize pool, house fee, and insurance accounts
/// 5. Creates the ticket account with the selected numbers
/// 6. Updates Quick Pick state (jackpot contribution, ticket count)
///
/// NOTE: The $50 main-lottery spend gate is enforced frontend-only. There is
/// no on-chain gate check in this instruction.
///
/// # Arguments
/// * `ctx` - The context containing all required accounts
/// * `params` - The ticket purchase parameters (numbers)
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler(ctx: Context<BuyQuickPickTicket>, params: BuyQuickPickTicketParams) -> Result<()> {
    let clock = Clock::get()?;

    // Validate numbers first (before any borrows) - uses the consolidated
    // validate_quick_pick_numbers from constants.rs (H-1 fix).
    validate_quick_pick_numbers(&params.numbers)?;

    // Sort numbers for consistent storage
    let mut sorted_numbers = params.numbers;
    sorted_numbers.sort();

    // Get values needed for validation and calculation
    let ticket_price = ctx.accounts.quick_pick_state.ticket_price;
    let next_draw_timestamp = ctx.accounts.quick_pick_state.next_draw_timestamp;
    let current_draw = ctx.accounts.quick_pick_state.current_draw;
    let jackpot_balance = ctx.accounts.quick_pick_state.jackpot_balance;
    let is_rolldown_pending = ctx.accounts.quick_pick_state.is_rolldown_pending;
    let seed_amount = ctx.accounts.quick_pick_state.seed_amount;

    // Check if ticket sales are open (4-hour window with 5-minute cutoff)
    let sale_cutoff_time = next_draw_timestamp.saturating_sub(TICKET_SALE_CUTOFF);
    require!(
        clock.unix_timestamp < sale_cutoff_time,
        QuickPickError::TicketSaleEnded
    );

    // Check if jackpot is properly funded (minimum 100% of seed amount)
    let minimum_jackpot = seed_amount;
    require!(
        jackpot_balance >= minimum_jackpot,
        QuickPickError::InsufficientJackpotFunding
    );

    // Verify player has sufficient USDC balance
    require!(
        ctx.accounts.player_usdc.amount >= ticket_price,
        QuickPickError::InsufficientFunds
    );

    // M2: per-wallet ticket cap — enforce BEFORE any transfers so an
    // over-limit purchase fails cleanly without needing refunds.
    // Borrow is scoped so it is dropped before the transfer CPIs below.
    {
        let user_stats = &mut ctx.accounts.user_stats;
        user_stats.reset_for_draw(current_draw);
        require!(
            user_stats.tickets_this_draw < QUICK_PICK_MAX_TICKETS_PER_WALLET,
            QuickPickError::PerWalletTicketLimitExceeded
        );
    }

    // Calculate dynamic house fee based on current jackpot level
    let house_fee_bps = calculate_quick_pick_house_fee_bps(jackpot_balance, is_rolldown_pending);
    let house_fee = (ticket_price as u128 * house_fee_bps as u128 / BPS_DENOMINATOR as u128) as u64;

    // Calculate what's left after house fee
    let after_house_fee = ticket_price.saturating_sub(house_fee);

    // Insurance gets 3% of after_house_fee
    let insurance_contribution = (after_house_fee as u128
        * QUICK_PICK_INSURANCE_ALLOCATION_BPS as u128
        / BPS_DENOMINATOR as u128) as u64;

    // Prize pool transfer is after_house_fee MINUS insurance
    let prize_pool_transfer = after_house_fee.saturating_sub(insurance_contribution);

    // From the prize pool transfer, calculate internal accounting allocations:
    let jackpot_contribution = (prize_pool_transfer as u128
        * QUICK_PICK_JACKPOT_ALLOCATION_BPS as u128
        / BPS_DENOMINATOR as u128) as u64;
    let fixed_prize_contribution = (prize_pool_transfer as u128
        * QUICK_PICK_FIXED_PRIZE_ALLOCATION_BPS as u128
        / BPS_DENOMINATOR as u128) as u64;
    // SECURITY FIX: Track the integer division remainder as reserve_balance.
    // Without this, dust from rounding (prize_pool_transfer - jackpot - fixed)
    // is never accounted for, and rolldown reseeding can't draw on it.
    let reserve_contribution = prize_pool_transfer
        .saturating_sub(jackpot_contribution)
        .saturating_sub(fixed_prize_contribution);

    // Perform USDC transfers
    ctx.accounts.transfer_to_prize_pool(prize_pool_transfer)?;
    ctx.accounts.transfer_to_house_fee(house_fee)?;
    if insurance_contribution > 0 {
        ctx.accounts
            .transfer_to_insurance_pool(insurance_contribution)?;
    }

    // SECURITY FIX (Issue #8): Replace debug_assert with runtime require!
    // debug_assert is stripped in release builds, leaving this critical
    // invariant unchecked in production. Use require! to enforce it always.
    require!(
        house_fee + prize_pool_transfer + insurance_contribution == ticket_price,
        QuickPickError::InternalError
    );

    // Update Quick Pick state
    let quick_pick_state = &mut ctx.accounts.quick_pick_state;
    quick_pick_state.jackpot_balance = quick_pick_state
        .jackpot_balance
        .checked_add(jackpot_contribution)
        .ok_or(QuickPickError::Overflow)?;
    quick_pick_state.prize_pool_balance = quick_pick_state
        .prize_pool_balance
        .checked_add(fixed_prize_contribution)
        .ok_or(QuickPickError::Overflow)?;
    quick_pick_state.insurance_balance = quick_pick_state
        .insurance_balance
        .checked_add(insurance_contribution)
        .ok_or(QuickPickError::Overflow)?;
    // Track remainder (dust) as reserve — used for jackpot reseeding after rolldown/win
    if reserve_contribution > 0 {
        quick_pick_state.reserve_balance = quick_pick_state
            .reserve_balance
            .checked_add(reserve_contribution)
            .ok_or(QuickPickError::Overflow)?;
    }
    quick_pick_state.current_draw_tickets = quick_pick_state
        .current_draw_tickets
        .checked_add(1)
        .ok_or(QuickPickError::Overflow)?;
    quick_pick_state.total_tickets_sold = quick_pick_state
        .total_tickets_sold
        .checked_add(1)
        .ok_or(QuickPickError::Overflow)?;

    // Update house fee (dynamic)
    quick_pick_state.house_fee_bps = house_fee_bps;

    // Check if rolldown is now pending (jackpot >= soft_cap)
    if quick_pick_state.jackpot_balance >= quick_pick_state.soft_cap {
        quick_pick_state.is_rolldown_pending = true;
    }

    // Increment per-wallet counters (M2). Borrow is scoped so it does not
    // conflict with `quick_pick_state` above / `ticket` below (disjoint fields).
    {
        let user_stats = &mut ctx.accounts.user_stats;
        user_stats.wallet = ctx.accounts.player.key();
        user_stats.tickets_this_draw = user_stats
            .tickets_this_draw
            .checked_add(1)
            .ok_or(QuickPickError::Overflow)?;
        user_stats.total_tickets = user_stats
            .total_tickets
            .checked_add(1)
            .ok_or(QuickPickError::Overflow)?;
    }

    // Create ticket
    let ticket = &mut ctx.accounts.ticket;
    ticket.owner = ctx.accounts.player.key();
    ticket.draw_id = current_draw;
    ticket.numbers = sorted_numbers;
    ticket.purchase_timestamp = clock.unix_timestamp;
    ticket.is_claimed = false;
    ticket.match_count = 0;
    ticket.prize_amount = 0;
    ticket.bump = ctx.bumps.ticket;

    // Emit event
    emit!(QuickPickTicketPurchased {
        ticket: ticket.key(),
        player: ctx.accounts.player.key(),
        draw_id: current_draw,
        numbers: sorted_numbers,
        price: ticket_price,
        timestamp: clock.unix_timestamp,
    });

    msg!("Quick Pick Express ticket purchased!");
    msg!("  Draw: #{}", current_draw);
    msg!("  Numbers: {:?}", sorted_numbers);
    msg!("  Price: {} USDC lamports", ticket_price);

    // Log jackpot funding status
    let minimum_jackpot = seed_amount;
    msg!(
        "  Minimum jackpot required: {} USDC lamports",
        minimum_jackpot
    );
    msg!(
        "  Current jackpot: {} USDC lamports",
        quick_pick_state.jackpot_balance
    );
    msg!(
        "  House fee: {} bps ({}%)",
        house_fee_bps,
        house_fee_bps as f64 / 100.0
    );
    msg!(
        "  Jackpot contribution: {} USDC lamports",
        jackpot_contribution
    );
    msg!(
        "  Current jackpot: {} USDC lamports",
        quick_pick_state.jackpot_balance
    );
    if quick_pick_state.is_rolldown_pending {
        msg!("  ⚠️ ROLLDOWN PENDING: Jackpot exceeds soft cap!");
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_quick_pick_numbers_valid() {
        let numbers = [1, 15, 20, 30, 35];
        assert!(validate_quick_pick_numbers(&numbers).is_ok());
    }

    #[test]
    fn test_validate_quick_pick_numbers_unsorted() {
        let numbers = [35, 1, 20, 15, 30];
        assert!(validate_quick_pick_numbers(&numbers).is_ok());
    }

    #[test]
    fn test_validate_quick_pick_numbers_out_of_range_zero() {
        let numbers = [0, 15, 20, 30, 35];
        assert!(validate_quick_pick_numbers(&numbers).is_err());
    }

    #[test]
    fn test_validate_quick_pick_numbers_out_of_range_high() {
        let numbers = [1, 15, 20, 30, 36];
        assert!(validate_quick_pick_numbers(&numbers).is_err());
    }

    #[test]
    fn test_validate_quick_pick_numbers_duplicates() {
        let numbers = [1, 15, 15, 30, 35];
        assert!(validate_quick_pick_numbers(&numbers).is_err());
    }

    #[test]
    fn test_validate_quick_pick_numbers_all_same() {
        let numbers = [7, 7, 7, 7, 7];
        assert!(validate_quick_pick_numbers(&numbers).is_err());
    }
}
