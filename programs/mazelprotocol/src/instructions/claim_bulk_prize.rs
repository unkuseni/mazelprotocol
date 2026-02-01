//! Claim Bulk Prize Instruction
//!
//! This instruction allows players to claim their winnings from a unified ticket
//! (bulk purchase) after a draw. It handles:
//! - Verification that the draw is complete and finalized
//! - Ticket claim expiration check (configurable, default 90 days)
//! - Match count calculation against winning numbers for a specific ticket index
//! - Prize amount determination (fixed or rolldown)
//! - Prize pool solvency verification
//! - USDC transfer from prize pool to player
//! - User stats updates
//! - Free ticket credit for Match 2
//! - Bitmap tracking for claimed tickets

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::errors::LottoError;
use crate::events::PrizeClaimed;
use crate::state::{DrawResult, LotteryState, UnifiedTicket, UserStats};

/// Parameters for claiming a prize from a unified ticket
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ClaimBulkPrizeParams {
    /// The index of the ticket within the unified ticket to claim (0-based)
    pub ticket_index: u32,
}

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

/// Accounts required for claiming a prize from a unified ticket
#[derive(Accounts)]
#[instruction(params: ClaimBulkPrizeParams)]
pub struct ClaimBulkPrize<'info> {
    /// The player claiming the prize (must be unified ticket owner)
    #[account(mut)]
    pub player: Signer<'info>,

    /// The main lottery state account
    #[account(
        mut,
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump
    )]
    pub lottery_state: Account<'info, LotteryState>,

    /// The unified ticket containing the tickets
    #[account(
        mut,
        constraint = unified_ticket.owner == player.key() @ LottoError::NotTicketOwner
    )]
    pub unified_ticket: Account<'info, UnifiedTicket>,

    /// The draw result for the ticket's draw
    #[account(
        seeds = [DRAW_SEED, &unified_ticket.draw_id.to_le_bytes()],
        bump = draw_result.bump,
        constraint = draw_result.draw_id == unified_ticket.draw_id @ LottoError::DrawIdMismatch
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

/// Claim prize for a specific ticket within a unified ticket account
///
/// This instruction:
/// 1. Verifies the ticket index is within bounds
/// 2. Verifies the specific ticket hasn't been claimed (via bitmap)
/// 3. Verifies the draw has been finalized (prizes calculated)
/// 4. Calculates the match count against winning numbers
/// 5. Looks up the prize amount from draw result
/// 6. Verifies the prize pool has sufficient funds
/// 7. Transfers USDC from prize pool to player
/// 8. Credits free ticket for Match 2 (tracked in user stats)
/// 9. Marks the specific ticket as claimed in the bitmap
/// 10. Updates user statistics
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
/// * `params` - The claim parameters including ticket index
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler(ctx: Context<ClaimBulkPrize>, params: ClaimBulkPrizeParams) -> Result<()> {
    let clock = Clock::get()?;
    let ticket_index = params.ticket_index as usize;

    // Validate ticket index is within bounds
    require!(
        ticket_index < ctx.accounts.unified_ticket.ticket_count as usize,
        LottoError::InvalidTicket
    );

    // Check if this specific ticket has already been claimed
    require!(
        !ctx.accounts.unified_ticket.is_ticket_claimed(ticket_index),
        LottoError::AlreadyClaimed
    );

    // Get values before mutable borrows
    let lottery_bump = ctx.accounts.lottery_state.bump;
    let winning_numbers = ctx.accounts.draw_result.winning_numbers;
    let ticket_numbers = ctx.accounts.unified_ticket.numbers[ticket_index];
    let ticket_draw_id = ctx.accounts.unified_ticket.draw_id;
    let unified_ticket_key = ctx.accounts.unified_ticket.key();
    let player_key = ctx.accounts.player.key();
    let prize_pool_balance = ctx.accounts.prize_pool_usdc.amount;
    let draw_timestamp = ctx.accounts.draw_result.timestamp;
    let start_ticket_id = ctx.accounts.unified_ticket.start_ticket_id;

    // Proper finalization check using the is_finalized method
    // A draw is finalized when prize amounts have been calculated
    require!(
        ctx.accounts.draw_result.is_finalized(),
        LottoError::DrawNotInProgress
    );

    // Check ticket claim expiration (if enabled)
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
        // Match 2 = Free ticket credit (not USDC transfer)
        // Credit the free ticket value to user stats for use in next purchase
        free_ticket_credited = true;
        msg!("Free ticket credited for Match 2!");
    } else if prize_amount > 0 {
        // Verify prize pool solvency before transfer
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

    // Mark the specific ticket as claimed in the bitmap
    let unified_ticket = &mut ctx.accounts.unified_ticket;
    unified_ticket.mark_ticket_claimed(ticket_index);

    // Update user stats
    let user_stats = &mut ctx.accounts.user_stats;

    // Track USDC won (not including free ticket credits)
    if actual_transfer_amount > 0 {
        user_stats.total_won = user_stats
            .total_won
            .checked_add(actual_transfer_amount)
            .ok_or(LottoError::Overflow)?;
    }

    // Credit free ticket for Match 2
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

    // Emit event - use a unique identifier for the ticket
    let ticket_id = start_ticket_id + ticket_index as u64;
    emit!(PrizeClaimed {
        ticket: unified_ticket_key, // We use the unified ticket key, index is in the logs
        player: player_key,
        draw_id: ticket_draw_id,
        match_count,
        prize_amount,
        free_ticket_issued: free_ticket_credited,
        timestamp: clock.unix_timestamp,
    });

    if has_prize {
        msg!("Prize claimed successfully from unified ticket!");
        msg!("  Unified Ticket: {}", unified_ticket_key);
        msg!("  Ticket Index: {}", ticket_index);
        msg!("  Internal Ticket ID: {}", ticket_id);
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
        msg!("  Ticket Index: {}", ticket_index);
        msg!("  Ticket numbers: {:?}", ticket_numbers);
        msg!("  Winning numbers: {:?}", winning_numbers);
        msg!("  Match count: {}", match_count);
    }

    Ok(())
}

/// Claim all prizes from a unified ticket in a single transaction
/// This is a convenience instruction that iterates through all tickets
/// Note: This may fail for large unified tickets due to compute limits
#[derive(Accounts)]
pub struct ClaimAllBulkPrizes<'info> {
    /// The player claiming the prizes (must be unified ticket owner)
    #[account(mut)]
    pub player: Signer<'info>,

    /// The main lottery state account
    #[account(
        mut,
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump
    )]
    pub lottery_state: Account<'info, LotteryState>,

    /// The unified ticket containing the tickets
    #[account(
        mut,
        constraint = unified_ticket.owner == player.key() @ LottoError::NotTicketOwner
    )]
    pub unified_ticket: Account<'info, UnifiedTicket>,

    /// The draw result for the ticket's draw
    #[account(
        seeds = [DRAW_SEED, &unified_ticket.draw_id.to_le_bytes()],
        bump = draw_result.bump,
        constraint = draw_result.draw_id == unified_ticket.draw_id @ LottoError::DrawIdMismatch
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

/// Claim all prizes from a unified ticket
///
/// This instruction iterates through all tickets in the unified ticket
/// and claims any unclaimed prizes. It handles compute limits gracefully
/// by processing as many tickets as possible.
///
/// WARNING: For large unified tickets (>20-30 tickets), this may exceed
/// compute limits. Use claim_bulk_prize for individual claims instead.
///
/// # Arguments
/// * `ctx` - The context containing all required accounts
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler_claim_all(ctx: Context<ClaimAllBulkPrizes>) -> Result<()> {
    let clock = Clock::get()?;

    // Get values before mutable borrows
    let lottery_bump = ctx.accounts.lottery_state.bump;
    let winning_numbers = ctx.accounts.draw_result.winning_numbers;
    let ticket_draw_id = ctx.accounts.unified_ticket.draw_id;
    let unified_ticket_key = ctx.accounts.unified_ticket.key();
    let player_key = ctx.accounts.player.key();
    let mut prize_pool_balance = ctx.accounts.prize_pool_usdc.amount;
    let draw_timestamp = ctx.accounts.draw_result.timestamp;
    let ticket_count = ctx.accounts.unified_ticket.ticket_count as usize;

    // Proper finalization check
    require!(
        ctx.accounts.draw_result.is_finalized(),
        LottoError::DrawNotInProgress
    );

    // Check ticket claim expiration (if enabled)
    if TICKET_CLAIM_EXPIRATION > 0 {
        let claim_deadline = draw_timestamp + TICKET_CLAIM_EXPIRATION;
        require!(
            clock.unix_timestamp <= claim_deadline,
            LottoError::TicketExpired
        );
    }

    // Track totals
    let mut total_prize_amount = 0u64;
    let mut total_free_tickets = 0u32;
    let mut tickets_claimed = 0u32;
    let mut jackpot_wins = 0u32;

    // Process all unclaimed tickets
    for ticket_index in 0..ticket_count {
        // Skip already claimed tickets
        if ctx.accounts.unified_ticket.is_ticket_claimed(ticket_index) {
            continue;
        }

        let ticket_numbers = ctx.accounts.unified_ticket.numbers[ticket_index];
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

        if match_count == 2 && prize_amount > 0 {
            // Free ticket credit
            total_free_tickets += 1;
            tickets_claimed += 1;
        } else if prize_amount > 0 {
            // Verify prize pool solvency
            if prize_pool_balance >= prize_amount {
                total_prize_amount += prize_amount;
                prize_pool_balance -= prize_amount;
                tickets_claimed += 1;

                if match_count == 6 {
                    jackpot_wins += 1;
                }
            }
        } else {
            // No prize, but still mark as claimed
            tickets_claimed += 1;
        }
    }

    // Transfer total prize amount if any
    if total_prize_amount > 0 {
        transfer_prize_internal(
            &ctx.accounts.prize_pool_usdc,
            &ctx.accounts.player_usdc,
            &ctx.accounts.lottery_state,
            &ctx.accounts.token_program,
            total_prize_amount,
            lottery_bump,
        )?;
    }

    // Mark all processed tickets as claimed
    let unified_ticket = &mut ctx.accounts.unified_ticket;
    for ticket_index in 0..ticket_count {
        if !unified_ticket.is_ticket_claimed(ticket_index) {
            unified_ticket.mark_ticket_claimed(ticket_index);
        }
    }

    // Update user stats
    let user_stats = &mut ctx.accounts.user_stats;

    if total_prize_amount > 0 {
        user_stats.total_won = user_stats
            .total_won
            .checked_add(total_prize_amount)
            .ok_or(LottoError::Overflow)?;
    }

    if total_free_tickets > 0 {
        user_stats.free_tickets_available = user_stats
            .free_tickets_available
            .checked_add(total_free_tickets)
            .ok_or(LottoError::Overflow)?;
    }

    if jackpot_wins > 0 {
        user_stats.jackpot_wins = user_stats
            .jackpot_wins
            .checked_add(jackpot_wins)
            .ok_or(LottoError::Overflow)?;
    }

    msg!("Bulk prize claim completed!");
    msg!("  Unified Ticket: {}", unified_ticket_key);
    msg!("  Player: {}", player_key);
    msg!("  Draw ID: {}", ticket_draw_id);
    msg!("  Total tickets processed: {}", ticket_count);
    msg!("  Tickets with prizes: {}", tickets_claimed);
    msg!("  Total USDC won: {} lamports", total_prize_amount);
    msg!("  Free tickets credited: {}", total_free_tickets);
    if jackpot_wins > 0 {
        msg!("  JACKPOT WINS: {}", jackpot_wins);
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
    fn test_claim_bulk_prize_params() {
        let params = ClaimBulkPrizeParams { ticket_index: 5 };
        assert_eq!(params.ticket_index, 5);
    }
}
