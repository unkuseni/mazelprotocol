//! Claim Quick Pick Prize Instruction
//!
//! This instruction allows players to claim their winnings from Quick Pick Express draws.
//! It handles:
//! - Verification that the draw is complete and finalized
//! - Ticket ownership verification
//! - Match count calculation against winning numbers
//! - Prize amount determination (fixed or rolldown)
//! - Prize pool solvency verification
//! - USDC transfer from prize pool to player
//!
//! Key differences from main lottery:
//! - 5 numbers instead of 6
//! - No Match 2 free ticket prize
//! - Only Match 3, Match 4, and Match 5 (jackpot) tiers

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::errors::QuickPickError;
use crate::events::QuickPickPrizeClaimed;
use crate::state::{QuickPickDrawResult, QuickPickState, QuickPickTicket};

/// Accounts required for claiming a Quick Pick prize
#[derive(Accounts)]
pub struct ClaimQuickPickPrize<'info> {
    /// The player claiming the prize (must be ticket owner)
    #[account(mut)]
    pub player: Signer<'info>,

    /// The Quick Pick state account
    #[account(
        mut,
        seeds = [QUICK_PICK_SEED],
        bump = quick_pick_state.bump
    )]
    pub quick_pick_state: Account<'info, QuickPickState>,

    /// The ticket being claimed
    #[account(
        mut,
        constraint = ticket.owner == player.key() @ QuickPickError::NotTicketOwner,
        constraint = !ticket.is_claimed @ QuickPickError::AlreadyClaimed
    )]
    pub ticket: Account<'info, QuickPickTicket>,

    /// The draw result for the ticket's draw
    #[account(
        seeds = [QUICK_PICK_DRAW_SEED, &ticket.draw_id.to_le_bytes()],
        bump = draw_result.bump,
        constraint = draw_result.draw_id == ticket.draw_id @ QuickPickError::DrawIdMismatch
    )]
    pub draw_result: Account<'info, QuickPickDrawResult>,

    /// Player's USDC token account (to receive prize)
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

    /// USDC mint
    pub usdc_mint: Account<'info, Mint>,

    /// Token program
    pub token_program: Program<'info, Token>,
}

/// Count the number of matching numbers between ticket and winning numbers (5/35)
///
/// Both arrays should be sorted for efficient comparison.
///
/// # Arguments
/// * `ticket_numbers` - The player's selected numbers (sorted)
/// * `winning_numbers` - The draw's winning numbers (sorted)
///
/// # Returns
/// * `u8` - Number of matching numbers (0-5)
fn count_quick_pick_matches(ticket_numbers: &[u8; 5], winning_numbers: &[u8; 5]) -> u8 {
    let mut matches = 0u8;

    // Both arrays are sorted, so we can use a two-pointer approach
    let mut i = 0usize;
    let mut j = 0usize;

    while i < 5 && j < 5 {
        if ticket_numbers[i] == winning_numbers[j] {
            matches += 1;
            i += 1;
            j += 1;
        } else if ticket_numbers[i] < winning_numbers[j] {
            i += 1;
        } else {
            j += 1;
        }
    }

    matches
}

/// Transfer prize from prize pool to player
fn transfer_quick_pick_prize<'info>(
    prize_pool_usdc: &Account<'info, TokenAccount>,
    player_usdc: &Account<'info, TokenAccount>,
    quick_pick_state: &Account<'info, QuickPickState>,
    token_program: &Program<'info, Token>,
    amount: u64,
    quick_pick_bump: u8,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }

    // Verify solvency
    require!(
        prize_pool_usdc.amount >= amount,
        QuickPickError::InsufficientPrizePool
    );

    let seeds = &[QUICK_PICK_SEED, &[quick_pick_bump]];
    let signer_seeds = &[&seeds[..]];

    let cpi_accounts = Transfer {
        from: prize_pool_usdc.to_account_info(),
        to: player_usdc.to_account_info(),
        authority: quick_pick_state.to_account_info(),
    };
    let cpi_program = token_program.to_account_info();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);

    token::transfer(cpi_ctx, amount)
}

/// Claim prize for a winning Quick Pick ticket
///
/// This instruction:
/// 1. Verifies the ticket hasn't been claimed
/// 2. Verifies the draw has been finalized (prizes calculated)
/// 3. Calculates the match count against winning numbers
/// 4. Looks up the prize amount from draw result
/// 5. Verifies the prize pool has sufficient funds
/// 6. Transfers USDC from prize pool to player
/// 7. Updates ticket state with match count and prize
///
/// # Prize Tiers (Normal Mode)
/// - Match 5 (Jackpot): Variable (from draw result)
/// - Match 4: $100
/// - Match 3: $4
/// - Match 0-2: No prize
///
/// # Prize Tiers (Rolldown Mode)
/// - Match 4: 60% of jackpot (pari-mutuel)
/// - Match 3: 40% of jackpot (pari-mutuel)
///
/// # Arguments
/// * `ctx` - The context containing all required accounts
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler(ctx: Context<ClaimQuickPickPrize>) -> Result<()> {
    let clock = Clock::get()?;

    // Get values before mutable borrows
    let quick_pick_bump = ctx.accounts.quick_pick_state.bump;
    let winning_numbers = ctx.accounts.draw_result.winning_numbers;
    let ticket_numbers = ctx.accounts.ticket.numbers;
    let ticket_draw_id = ctx.accounts.ticket.draw_id;
    let ticket_key = ctx.accounts.ticket.key();
    let player_key = ctx.accounts.player.key();
    let prize_pool_balance = ctx.accounts.prize_pool_usdc.amount;
    let draw_timestamp = ctx.accounts.draw_result.timestamp;

    // Verify draw is finalized
    require!(
        ctx.accounts.draw_result.is_finalized(),
        QuickPickError::DrawNotInProgress
    );

    // Check ticket claim expiration (90 days)
    if TICKET_CLAIM_EXPIRATION > 0 {
        let claim_deadline = draw_timestamp
            .checked_add(TICKET_CLAIM_EXPIRATION)
            .ok_or(QuickPickError::ArithmeticError)?;

        if clock.unix_timestamp > claim_deadline {
            msg!("Quick Pick ticket claim expired!");
            msg!("  Draw timestamp: {}", draw_timestamp);
            msg!("  Claim deadline: {}", claim_deadline);
            msg!("  Current time: {}", clock.unix_timestamp);
            return Err(QuickPickError::TicketExpired.into());
        }
    }

    // Calculate match count
    let match_count = count_quick_pick_matches(&ticket_numbers, &winning_numbers);

    // Determine prize amount from draw result
    // Quick Pick only has Match 5, Match 4, Match 3 prizes (no Match 2)
    let prize_amount = match match_count {
        5 => ctx.accounts.draw_result.match_5_prize_per_winner,
        4 => ctx.accounts.draw_result.match_4_prize_per_winner,
        3 => ctx.accounts.draw_result.match_3_prize_per_winner,
        _ => 0,
    };

    // Handle prize payment
    let mut actual_transfer_amount = 0u64;

    if prize_amount > 0 {
        // Verify solvency
        if prize_pool_balance < prize_amount {
            msg!("Quick Pick prize pool insufficient for prize payment!");
            msg!("  Required prize: {} USDC lamports", prize_amount);
            msg!("  Available in pool: {} USDC lamports", prize_pool_balance);
            return Err(QuickPickError::InsufficientPrizePool.into());
        }

        // Transfer USDC prize
        transfer_quick_pick_prize(
            &ctx.accounts.prize_pool_usdc,
            &ctx.accounts.player_usdc,
            &ctx.accounts.quick_pick_state,
            &ctx.accounts.token_program,
            prize_amount,
            quick_pick_bump,
        )?;

        actual_transfer_amount = prize_amount;
    }

    // SECURITY FIX (Issue #1 from audit): Update quick_pick_state internal accounting
    // to stay consistent with the actual prize_pool_usdc token account balance.
    // Previously, claim_prize performed the token transfer but did NOT update
    // quick_pick_state balances, causing internal books to drift and future
    // finalizations/solvency checks to be incorrect.
    //
    // Deduction priority depends on prize tier:
    // - Match 5 (jackpot): deduct from jackpot_balance first, then prize_pool_balance.
    // - Match 3/4 (fixed prizes): deduct from prize_pool_balance first, then jackpot_balance.
    if actual_transfer_amount > 0 {
        let qp_state = &mut ctx.accounts.quick_pick_state;

        if match_count == 5 {
            // Jackpot prize: deduct from jackpot_balance first
            if qp_state.jackpot_balance >= actual_transfer_amount {
                qp_state.jackpot_balance = qp_state
                    .jackpot_balance
                    .saturating_sub(actual_transfer_amount);
            } else {
                let from_jackpot = qp_state.jackpot_balance;
                let remainder = actual_transfer_amount.saturating_sub(from_jackpot);
                qp_state.jackpot_balance = 0;
                qp_state.prize_pool_balance = qp_state.prize_pool_balance.saturating_sub(remainder);
            }
        } else {
            // Fixed prizes (Match 3/4): deduct from prize_pool_balance first
            if qp_state.prize_pool_balance >= actual_transfer_amount {
                qp_state.prize_pool_balance = qp_state
                    .prize_pool_balance
                    .saturating_sub(actual_transfer_amount);
            } else {
                let from_pool = qp_state.prize_pool_balance;
                let remainder = actual_transfer_amount.saturating_sub(from_pool);
                qp_state.prize_pool_balance = 0;
                qp_state.jackpot_balance = qp_state.jackpot_balance.saturating_sub(remainder);
            }
        }

        // Increment total_prizes_paid at actual claim time for accurate tracking
        qp_state.total_prizes_paid = qp_state
            .total_prizes_paid
            .saturating_add(actual_transfer_amount);

        msg!(
            "  QuickPick state updated: jackpot={}, prize_pool={}, total_paid={}",
            qp_state.jackpot_balance,
            qp_state.prize_pool_balance,
            qp_state.total_prizes_paid
        );
    }

    // Update ticket state
    let ticket = &mut ctx.accounts.ticket;
    ticket.match_count = match_count;
    ticket.prize_amount = prize_amount;
    ticket.is_claimed = true;

    // Emit event
    emit!(QuickPickPrizeClaimed {
        ticket: ticket_key,
        player: player_key,
        draw_id: ticket_draw_id,
        match_count,
        prize_amount,
        timestamp: clock.unix_timestamp,
    });

    if prize_amount > 0 {
        msg!("Quick Pick prize claimed successfully!");
        msg!("  Ticket: {}", ticket_key);
        msg!("  Player: {}", player_key);
        msg!("  Draw ID: {}", ticket_draw_id);
        msg!("  Ticket numbers: {:?}", ticket_numbers);
        msg!("  Winning numbers: {:?}", winning_numbers);
        msg!("  Match count: {}", match_count);
        msg!(
            "  Prize amount: {} USDC lamports (${})",
            prize_amount,
            prize_amount as f64 / 1_000_000.0
        );
    } else {
        msg!("No Quick Pick prize for this ticket.");
        msg!("  Ticket numbers: {:?}", ticket_numbers);
        msg!("  Winning numbers: {:?}", winning_numbers);
        msg!("  Match count: {}", match_count);
        msg!("  Minimum for prize: Match 3 ($4)");
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_count_quick_pick_matches_full_match() {
        let ticket = [1, 2, 3, 4, 5];
        let winning = [1, 2, 3, 4, 5];
        assert_eq!(count_quick_pick_matches(&ticket, &winning), 5);
    }

    #[test]
    fn test_count_quick_pick_matches_no_match() {
        let ticket = [1, 2, 3, 4, 5];
        let winning = [6, 7, 8, 9, 10];
        assert_eq!(count_quick_pick_matches(&ticket, &winning), 0);
    }

    #[test]
    fn test_count_quick_pick_matches_partial() {
        let ticket = [1, 2, 3, 4, 5];
        let winning = [1, 2, 3, 6, 7];
        assert_eq!(count_quick_pick_matches(&ticket, &winning), 3);
    }

    #[test]
    fn test_count_quick_pick_matches_four() {
        let ticket = [1, 2, 3, 4, 5];
        let winning = [1, 2, 3, 4, 35];
        assert_eq!(count_quick_pick_matches(&ticket, &winning), 4);
    }

    #[test]
    fn test_count_quick_pick_matches_two() {
        let ticket = [1, 2, 3, 4, 5];
        let winning = [1, 2, 10, 20, 30];
        assert_eq!(count_quick_pick_matches(&ticket, &winning), 2);
    }

    #[test]
    fn test_count_quick_pick_matches_interleaved() {
        // Both sorted, but interleaved
        let ticket = [2, 4, 6, 8, 10];
        let winning = [1, 3, 5, 7, 9];
        assert_eq!(count_quick_pick_matches(&ticket, &winning), 0);
    }

    #[test]
    fn test_count_quick_pick_matches_some_interleaved() {
        let ticket = [1, 3, 5, 7, 9];
        let winning = [2, 3, 6, 7, 10];
        assert_eq!(count_quick_pick_matches(&ticket, &winning), 2);
    }

    #[test]
    fn test_count_quick_pick_matches_edge_numbers() {
        let ticket = [1, 2, 33, 34, 35];
        let winning_sorted = [1, 2, 33, 34, 35];
        assert_eq!(count_quick_pick_matches(&ticket, &winning_sorted), 5);
    }
}
