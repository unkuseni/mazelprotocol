//! Buy Quick Pick Ticket Instruction
//!
//! This instruction allows eligible players to purchase Quick Pick Express tickets.
//! It handles:
//! - $50 main lottery spend gate verification
//! - Number validation (5 unique numbers from 1-35)
//! - Dynamic fee calculation based on jackpot level
//! - USDC transfer (player -> prize pool + house fee + insurance)
//! - Ticket account creation
//!
//! Key differences from main lottery:
//! - Requires $50 lifetime spend in main lottery
//! - 5/35 matrix instead of 6/46
//! - $1.50 ticket price instead of $2.50
//! - No free tickets (Match 2 doesn't exist)

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::errors::QuickPickError;
use crate::events::QuickPickTicketPurchased;
use crate::state::{QuickPickState, QuickPickTicket};

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

    /// User statistics account (to verify $50 gate)
    /// This account is owned by the main lottery program, NOT this program.
    /// We use UncheckedAccount + manual validation because Anchor's #[account]
    /// derives PDAs under the current program ID, but this PDA lives under the
    /// main lottery program.
    /// CHECK: Validated manually in handler: owner == main lottery program,
    /// PDA derivation verified, discriminator checked, total_spent >= gate
    pub user_stats: UncheckedAccount<'info>,

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

/// Validate Quick Pick numbers (5 unique numbers from 1-35)
fn validate_quick_pick_numbers_internal(numbers: &[u8; 5]) -> Result<()> {
    // Check each number is in valid range
    for &num in numbers.iter() {
        require!(
            num >= 1 && num <= QUICK_PICK_RANGE,
            QuickPickError::NumbersOutOfRange
        );
    }

    // Check for duplicates
    let mut sorted = *numbers;
    sorted.sort();
    for i in 0..4 {
        require!(sorted[i] != sorted[i + 1], QuickPickError::DuplicateNumbers);
    }

    Ok(())
}

/// Buy a Quick Pick Express ticket
///
/// This instruction:
/// 1. Verifies the $50 main lottery spend gate requirement
/// 2. Validates the selected numbers (1-35, unique, 5 numbers)
/// 3. Checks if ticket sales are open for the current draw
/// 4. Calculates the dynamic house fee based on jackpot level
/// 5. Transfers USDC from player to prize pool, house fee, and insurance accounts
/// 6. Creates the ticket account with the selected numbers
/// 7. Updates Quick Pick state (jackpot contribution, ticket count)
///
/// # Arguments
/// * `ctx` - The context containing all required accounts
/// * `params` - The ticket purchase parameters (numbers)
///
/// # Returns
/// * `Result<()>` - Success or error
/// Manually verify the UserStats account from the main lottery program
/// and extract the total_spent value for the $50 gate check.
fn verify_main_lottery_user_stats(
    user_stats_info: &AccountInfo,
    player_key: &Pubkey,
) -> Result<u64> {
    // 1. Verify the account is owned by the main lottery program
    let main_lottery_id = MAIN_LOTTERY_PROGRAM_ID
        .parse::<Pubkey>()
        .map_err(|_| QuickPickError::InsufficientMainLotterySpend)?;

    require!(
        user_stats_info.owner == &main_lottery_id,
        QuickPickError::InsufficientMainLotterySpend
    );

    // 2. Verify PDA derivation: seeds = [USER_SEED, player.key().as_ref()]
    //    under the main lottery program
    let (expected_pda, _bump) =
        Pubkey::find_program_address(&[USER_SEED, player_key.as_ref()], &main_lottery_id);
    require!(
        user_stats_info.key() == expected_pda,
        QuickPickError::InsufficientMainLotterySpend
    );

    // 3. Read account data and verify discriminator
    let data = user_stats_info.try_borrow_data()?;

    // Minimum size: 8 (discriminator) + 32 (wallet) + 8 (total_tickets) + 8 (total_spent) = 56
    require!(
        data.len() >= 56,
        QuickPickError::InsufficientMainLotterySpend
    );

    // Verify Anchor discriminator for "account:UserStats"
    // sha256("account:UserStats")[..8]
    let expected_discriminator: [u8; 8] = {
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(b"account:UserStats");
        let result = hasher.finalize();
        let mut disc = [0u8; 8];
        disc.copy_from_slice(&result[..8]);
        disc
    };

    require!(
        data[..8] == expected_discriminator,
        QuickPickError::InsufficientMainLotterySpend
    );

    // 4. Extract total_spent (offset: 8 disc + 32 wallet + 8 total_tickets = 48)
    let total_spent = u64::from_le_bytes(
        data[48..56]
            .try_into()
            .map_err(|_| QuickPickError::InsufficientMainLotterySpend)?,
    );

    Ok(total_spent)
}

pub fn handler(ctx: Context<BuyQuickPickTicket>, params: BuyQuickPickTicketParams) -> Result<()> {
    let clock = Clock::get()?;

    // Validate the $50 main lottery spend gate via cross-program PDA verification
    let total_spent =
        verify_main_lottery_user_stats(&ctx.accounts.user_stats, &ctx.accounts.player.key())?;

    require!(
        total_spent >= QUICK_PICK_MIN_SPEND_GATE,
        QuickPickError::InsufficientMainLotterySpend
    );

    // Validate numbers first (before any borrows)
    validate_quick_pick_numbers_internal(&params.numbers)?;

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
        assert!(validate_quick_pick_numbers_internal(&numbers).is_ok());
    }

    #[test]
    fn test_validate_quick_pick_numbers_unsorted() {
        let numbers = [35, 1, 20, 15, 30];
        assert!(validate_quick_pick_numbers_internal(&numbers).is_ok());
    }

    #[test]
    fn test_validate_quick_pick_numbers_out_of_range_zero() {
        let numbers = [0, 15, 20, 30, 35];
        assert!(validate_quick_pick_numbers_internal(&numbers).is_err());
    }

    #[test]
    fn test_validate_quick_pick_numbers_out_of_range_high() {
        let numbers = [1, 15, 20, 30, 36];
        assert!(validate_quick_pick_numbers_internal(&numbers).is_err());
    }

    #[test]
    fn test_validate_quick_pick_numbers_duplicates() {
        let numbers = [1, 15, 15, 30, 35];
        assert!(validate_quick_pick_numbers_internal(&numbers).is_err());
    }

    #[test]
    fn test_validate_quick_pick_numbers_all_same() {
        let numbers = [10, 10, 10, 10, 10];
        assert!(validate_quick_pick_numbers_internal(&numbers).is_err());
    }
}
