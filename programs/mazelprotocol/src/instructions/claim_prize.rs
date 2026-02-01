//! Claim Prize Instruction
//!
//! This instruction allows players to claim their winnings after a draw.
//! It handles:
//! - Verification that the draw is complete and finalized
//! - Ticket claim expiration check (configurable, default 90 days)
//! - Match count calculation against winning numbers
//! - Prize amount determination (fixed or rolldown)
//! - Prize pool solvency verification
//! - USDC transfer from prize pool to player
//! - User stats updates
//! - Free ticket credit for Match 2

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::errors::LottoError;
use crate::events::PrizeClaimed;
use crate::state::{DrawResult, LotteryState, TicketData, UserStats};

/// Transfer prize from prize pool to player (standalone function)
fn transfer_prize_internal<'info>(
    prize_pool_usdc: &Account<'info, TokenAccount>,
    player_usdc: &Account<'info, TokenAccount>,
    lottery_state: &Account<'info, LotteryState>,
    token_program: &Program<'info, Token>,
    amount: u64,
    lottery_bump: u8,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }

    let seeds = &[LOTTERY_SEED, &[lottery_bump]];
    let signer_seeds = &[&seeds[..]];

    let cpi_accounts = Transfer {
        from: prize_pool_usdc.to_account_info(),
        to: player_usdc.to_account_info(),
        authority: lottery_state.to_account_info(),
    };
    let cpi_program = token_program.to_account_info();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);

    token::transfer(cpi_ctx, amount)
}

/// Accounts required for claiming a prize
#[derive(Accounts)]
pub struct ClaimPrize<'info> {
    /// The player claiming the prize (must be ticket owner)
    #[account(mut)]
    pub player: Signer<'info>,

    /// The main lottery state account
    #[account(
        mut,
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump
    )]
    pub lottery_state: Account<'info, LotteryState>,

    /// The ticket being claimed
    #[account(
        mut,
        constraint = ticket.owner == player.key() @ LottoError::NotTicketOwner,
        constraint = !ticket.is_claimed @ LottoError::AlreadyClaimed
    )]
    pub ticket: Account<'info, TicketData>,

    /// The draw result for the ticket's draw
    #[account(
        seeds = [DRAW_SEED, &ticket.draw_id.to_le_bytes()],
        bump = draw_result.bump,
        constraint = draw_result.draw_id == ticket.draw_id @ LottoError::DrawIdMismatch
    )]
    pub draw_result: Account<'info, DrawResult>,

    /// Player's USDC token account (to receive prize)
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

    /// USDC mint
    pub usdc_mint: Account<'info, Mint>,

    /// User statistics account
    #[account(
        mut,
        seeds = [USER_SEED, player.key().as_ref()],
        bump = user_stats.bump
    )]
    pub user_stats: Account<'info, UserStats>,

    /// Token program
    pub token_program: Program<'info, Token>,
}

/// Count the number of matching numbers between ticket and winning numbers
///
/// Both arrays should be sorted for efficient comparison.
///
/// # Arguments
/// * `ticket_numbers` - The player's selected numbers (sorted)
/// * `winning_numbers` - The draw's winning numbers (sorted)
///
/// # Returns
/// * `u8` - Number of matching numbers (0-6)
fn count_matches(ticket_numbers: &[u8; 6], winning_numbers: &[u8; 6]) -> u8 {
    let mut matches = 0u8;

    // Both arrays are sorted, so we can use a two-pointer approach
    let mut i = 0usize;
    let mut j = 0usize;

    while i < 6 && j < 6 {
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

/// Claim prize for a winning ticket
///
/// This instruction:
/// 1. Verifies the ticket hasn't been claimed
/// 2. Verifies the draw has been finalized (prizes calculated)
/// 3. Calculates the match count against winning numbers
/// 4. Looks up the prize amount from draw result
/// 5. Verifies the prize pool has sufficient funds
/// 6. Transfers USDC from prize pool to player
/// 7. Credits free ticket for Match 2 (tracked in user stats)
/// 8. Updates ticket state with match count and prize
/// 9. Updates user statistics
///
/// # Prize Tiers (Normal Mode)
/// - Match 6: Jackpot (variable, from draw result)
/// - Match 5: $4,000
/// - Match 4: $150
/// - Match 3: $5
/// - Match 2: Free ticket ($2.50 credit)
/// - Match 0-1: No prize
///
/// # Prize Tiers (Rolldown Mode)
/// - Match 5: 25% of jackpot (pari-mutuel)
/// - Match 4: 35% of jackpot (pari-mutuel)
/// - Match 3: 40% of jackpot (pari-mutuel)
/// - Match 2: Free ticket ($2.50 credit)
///
/// # Arguments
/// * `ctx` - The context containing all required accounts
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler(ctx: Context<ClaimPrize>) -> Result<()> {
    let clock = Clock::get()?;

    // Get values before mutable borrows
    let lottery_bump = ctx.accounts.lottery_state.bump;
    let winning_numbers = ctx.accounts.draw_result.winning_numbers;
    let ticket_numbers = ctx.accounts.ticket.numbers;
    let ticket_draw_id = ctx.accounts.ticket.draw_id;
    let ticket_key = ctx.accounts.ticket.key();
    let player_key = ctx.accounts.player.key();
    let prize_pool_balance = ctx.accounts.prize_pool_usdc.amount;
    let draw_timestamp = ctx.accounts.draw_result.timestamp;

    // FIXED: Proper finalization check using the is_finalized method
    // A draw is finalized when prize amounts have been calculated
    require!(
        ctx.accounts.draw_result.is_finalized(),
        LottoError::DrawNotInProgress
    );

    // FIXED: Check ticket claim expiration (if enabled)
    // Tickets must be claimed within TICKET_CLAIM_EXPIRATION seconds of draw execution
    if TICKET_CLAIM_EXPIRATION > 0 {
        let claim_deadline = draw_timestamp + TICKET_CLAIM_EXPIRATION;
        require!(
            clock.unix_timestamp <= claim_deadline,
            LottoError::TicketExpired
        );
    }

    // Calculate match count
    let match_count = count_matches(&ticket_numbers, &winning_numbers);

    // Determine prize amount from draw result
    let prize_amount = match match_count {
        6 => ctx.accounts.draw_result.match_6_prize_per_winner,
        5 => ctx.accounts.draw_result.match_5_prize_per_winner,
        4 => ctx.accounts.draw_result.match_4_prize_per_winner,
        3 => ctx.accounts.draw_result.match_3_prize_per_winner,
        2 => ctx.accounts.draw_result.match_2_prize_per_winner,
        _ => 0,
    };

    // Check if there's a prize to claim
    let has_prize = prize_amount > 0;

    // Handle prize payment
    let mut free_ticket_credited = false;
    let mut actual_transfer_amount = 0u64;

    if match_count == 2 && prize_amount > 0 {
        // FIXED: Match 2 = Free ticket credit (not USDC transfer)
        // Credit the free ticket value to user stats for use in next purchase
        free_ticket_credited = true;
        msg!("Free ticket credited for Match 2!");
    } else if prize_amount > 0 {
        // FIXED: Verify prize pool solvency before transfer
        require!(
            prize_pool_balance >= prize_amount,
            LottoError::InsufficientPrizePool
        );

        // Transfer USDC prize
        transfer_prize_internal(
            &ctx.accounts.prize_pool_usdc,
            &ctx.accounts.player_usdc,
            &ctx.accounts.lottery_state,
            &ctx.accounts.token_program,
            prize_amount,
            lottery_bump,
        )?;

        actual_transfer_amount = prize_amount;
    }

    // Update ticket state
    let ticket = &mut ctx.accounts.ticket;
    ticket.match_count = match_count;
    ticket.prize_amount = prize_amount;
    ticket.is_claimed = true;

    // Update user stats
    let user_stats = &mut ctx.accounts.user_stats;

    // Track USDC won (not including free ticket credits)
    if actual_transfer_amount > 0 {
        user_stats.total_won = user_stats
            .total_won
            .checked_add(actual_transfer_amount)
            .ok_or(LottoError::Overflow)?;
    }

    // FIXED: Credit free ticket for Match 2
    if free_ticket_credited {
        user_stats.free_tickets_available = user_stats
            .free_tickets_available
            .checked_add(1)
            .ok_or(LottoError::Overflow)?;
    }

    // Track jackpot wins
    if match_count == 6 {
        user_stats.jackpot_wins = user_stats
            .jackpot_wins
            .checked_add(1)
            .ok_or(LottoError::Overflow)?;
    }

    // Emit event
    emit!(PrizeClaimed {
        ticket: ticket_key,
        player: player_key,
        draw_id: ticket_draw_id,
        match_count,
        prize_amount,
        free_ticket_issued: free_ticket_credited,
        timestamp: clock.unix_timestamp,
    });

    if has_prize {
        msg!("Prize claimed successfully!");
        msg!("  Ticket: {}", ticket_key);
        msg!("  Player: {}", player_key);
        msg!("  Draw ID: {}", ticket_draw_id);
        msg!("  Ticket numbers: {:?}", ticket_numbers);
        msg!("  Winning numbers: {:?}", winning_numbers);
        msg!("  Match count: {}", match_count);
        msg!("  Prize amount: {} USDC lamports", prize_amount);
        if free_ticket_credited {
            msg!("  Free ticket credited: YES");
            msg!(
                "  Total free tickets available: {}",
                user_stats.free_tickets_available
            );
        } else {
            msg!("  USDC transferred: {} lamports", actual_transfer_amount);
        }
    } else {
        msg!("No prize for this ticket.");
        msg!("  Ticket numbers: {:?}", ticket_numbers);
        msg!("  Winning numbers: {:?}", winning_numbers);
        msg!("  Match count: {}", match_count);
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_count_matches_full_match() {
        let ticket = [1, 2, 3, 4, 5, 6];
        let winning = [1, 2, 3, 4, 5, 6];
        assert_eq!(count_matches(&ticket, &winning), 6);
    }

    #[test]
    fn test_count_matches_no_match() {
        let ticket = [1, 2, 3, 4, 5, 6];
        let winning = [7, 8, 9, 10, 11, 12];
        assert_eq!(count_matches(&ticket, &winning), 0);
    }

    #[test]
    fn test_count_matches_partial() {
        let ticket = [1, 2, 3, 4, 5, 6];
        let winning = [1, 2, 3, 7, 8, 9];
        assert_eq!(count_matches(&ticket, &winning), 3);
    }

    #[test]
    fn test_count_matches_two() {
        let ticket = [1, 2, 3, 4, 5, 6];
        let winning = [1, 2, 10, 20, 30, 40];
        assert_eq!(count_matches(&ticket, &winning), 2);
    }

    #[test]
    fn test_count_matches_five() {
        let ticket = [1, 2, 3, 4, 5, 6];
        let winning = [1, 2, 3, 4, 5, 46];
        assert_eq!(count_matches(&ticket, &winning), 5);
    }

    #[test]
    fn test_count_matches_interleaved() {
        // Both sorted, but interleaved
        let ticket = [2, 4, 6, 8, 10, 12];
        let winning = [1, 3, 5, 7, 9, 11];
        assert_eq!(count_matches(&ticket, &winning), 0);
    }

    #[test]
    fn test_count_matches_some_interleaved() {
        let ticket = [1, 3, 5, 7, 9, 11];
        let winning = [2, 3, 6, 7, 10, 11];
        assert_eq!(count_matches(&ticket, &winning), 3);
    }

    #[test]
    fn test_count_matches_edge_numbers() {
        let ticket = [1, 2, 3, 44, 45, 46];
        let _winning = [1, 44, 45, 46, 2, 3];
        // After sorting winning: [1, 2, 3, 44, 45, 46]
        // This would be a full match if winning was sorted
        // But the function assumes inputs are already sorted
        // So we test with properly sorted winning numbers
        let winning_sorted = [1, 2, 3, 44, 45, 46];
        assert_eq!(count_matches(&ticket, &winning_sorted), 6);
    }
}
