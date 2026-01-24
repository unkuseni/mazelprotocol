//! Context definitions for SolanaLotto Protocol instructions

use crate::constants::*;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};

// ============================================================================
// Initialize Lottery Context
// ============================================================================

/// Context for initializing the lottery system
#[derive(Accounts)]
pub struct InitializeLottery<'info> {
    /// Admin authority (will control the lottery)
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Global lottery state (singleton PDA)
    #[account(
        init,
        payer = authority,
        space = LOTTERY_STATE_SIZE,
        seeds = [LOTTERY_SEED],
        bump
    )]
    pub lottery_state: Account<'info, LotteryState>,

    /// Switchboard queue for randomness requests
    /// CHECK: Validated manually in handler
    pub switchboard_queue: AccountInfo<'info>,

    /// Prize pool USDC token account (PDA)
    #[account(
        init,
        payer = authority,
        token::mint = usdc_mint,
        token::authority = prize_pool_usdc,
        seeds = [PRIZE_POOL_USDC_SEED],
        bump
    )]
    pub prize_pool_usdc: Account<'info, TokenAccount>,

    /// House fee USDC token account (PDA)
    #[account(
        init,
        payer = authority,
        token::mint = usdc_mint,
        token::authority = house_fee_usdc,
        seeds = [HOUSE_FEE_USDC_SEED],
        bump
    )]
    pub house_fee_usdc: Account<'info, TokenAccount>,

    /// Authority's USDC token account (funds initial seed)
    #[account(
        mut,
        constraint = authority_usdc.mint == usdc_mint.key(),
        constraint = authority_usdc.owner == authority.key()
    )]
    pub authority_usdc: Account<'info, TokenAccount>,

    /// USDC mint
    pub usdc_mint: Account<'info, anchor_spl::token::Mint>,

    /// System program
    pub system_program: Program<'info, System>,

    /// Token program
    pub token_program: Program<'info, Token>,

    /// Rent sysvar
    pub rent: Sysvar<'info, Rent>,
}

// ============================================================================
// Buy Ticket Context
// ============================================================================

/// Context for purchasing a lottery ticket
#[derive(Accounts)]
#[instruction(numbers: [u8; NUMBERS_PER_TICKET])]
pub struct BuyTicket<'info> {
    /// Player purchasing the ticket
    #[account(mut)]
    pub player: Signer<'info>,

    /// Global lottery state
    #[account(
        mut,
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump,
        constraint = !lottery_state.is_paused @ crate::errors::ErrorCode::Paused,
        constraint = !lottery_state.is_draw_in_progress @ crate::errors::ErrorCode::DrawInProgress
    )]
    pub lottery_state: Account<'info, LotteryState>,

    /// New ticket account
    #[account(
        init,
        payer = player,
        space = TICKET_SIZE,
        seeds = [
            TICKET_SEED,
            player.key().as_ref(),
            &lottery_state.current_draw_id.to_le_bytes()
        ],
        bump
    )]
    pub ticket: Account<'info, TicketData>,

    /// Player's USDC token account
    #[account(
        mut,
        constraint = player_usdc.mint == usdc_mint.key(),
        constraint = player_usdc.owner == player.key()
    )]
    pub player_usdc: Account<'info, TokenAccount>,

    /// Prize pool USDC token account
    #[account(
        mut,
        seeds = [PRIZE_POOL_USDC_SEED],
        bump,
        token::mint = usdc_mint
    )]
    pub prize_pool_usdc: Account<'info, TokenAccount>,

    /// House fee USDC token account
    #[account(
        mut,
        seeds = [HOUSE_FEE_USDC_SEED],
        bump,
        token::mint = usdc_mint
    )]
    pub house_fee_usdc: Account<'info, TokenAccount>,

    /// USDC mint
    pub usdc_mint: Account<'info, anchor_spl::token::Mint>,

    /// Player statistics (optional - created on first purchase)
    #[account(
        init,
        payer = player,
        space = USER_STATS_SIZE,
        seeds = [USER_SEED, player.key().as_ref()],
        bump
    )]
    pub user_stats: Account<'info, UserStats>,

    /// System program
    pub system_program: Program<'info, System>,

    /// Token program
    pub token_program: Program<'info, Token>,

    /// Rent sysvar
    pub rent: Sysvar<'info, Rent>,
}

// ============================================================================
// Start Draw Context
// ============================================================================

/// Context for starting a new draw (commit phase)
#[derive(Accounts)]
pub struct StartDraw<'info> {
    /// Admin authority
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Global lottery state
    #[account(
        mut,
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump,
        constraint = lottery_state.authority == authority.key() @ crate::errors::ErrorCode::AdminAuthorityRequired
    )]
    pub lottery_state: Account<'info, LotteryState>,

    /// Switchboard randomness account
    /// CHECK: Validated manually in handler for freshness and correctness
    pub randomness_account_data: AccountInfo<'info>,

    /// Clock sysvar for time checks
    pub clock: Sysvar<'info, Clock>,
}

// ============================================================================
// Execute Draw Context
// ============================================================================

/// Context for executing a draw with revealed randomness (reveal phase)
#[derive(Accounts)]
pub struct ExecuteDraw<'info> {
    /// Admin authority
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Global lottery state
    #[account(
        mut,
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump,
        constraint = lottery_state.authority == authority.key() @ crate::errors::ErrorCode::AdminAuthorityRequired
    )]
    pub lottery_state: Account<'info, LotteryState>,

    /// Switchboard randomness account
    /// CHECK: Validated manually in handler for freshness and correctness
    pub randomness_account_data: AccountInfo<'info>,

    /// New draw result account
    #[account(
        init,
        payer = authority,
        space = DRAW_RESULT_SIZE,
        seeds = [DRAW_SEED, &lottery_state.current_draw_id.to_le_bytes()],
        bump
    )]
    pub draw_result: Account<'info, DrawResult>,

    /// System program
    pub system_program: Program<'info, System>,

    /// Clock sysvar for time checks
    pub clock: Sysvar<'info, Clock>,
}

// ============================================================================
// Claim Prize Context
// ============================================================================

/// Context for claiming a prize from a winning ticket
#[derive(Accounts)]
pub struct ClaimPrize<'info> {
    /// Player claiming the prize
    pub player: Signer<'info>,

    /// Ticket account containing winning numbers
    #[account(
        mut,
        constraint = ticket.owner == player.key() @ crate::errors::ErrorCode::NotOwner,
        constraint = !ticket.is_claimed @ crate::errors::ErrorCode::AlreadyClaimed
    )]
    pub ticket: Account<'info, TicketData>,

    /// Draw result for the ticket's draw
    #[account(
        seeds = [DRAW_SEED, &ticket.draw_id.to_le_bytes()],
        bump,
        constraint = draw_result.draw_id == ticket.draw_id
    )]
    pub draw_result: Account<'info, DrawResult>,

    /// Global lottery state
    #[account(mut)]
    pub lottery_state: Account<'info, LotteryState>,

    /// Player's USDC token account (receives prize)
    #[account(
        mut,
        constraint = player_usdc.mint == usdc_mint.key(),
        constraint = player_usdc.owner == player.key()
    )]
    pub player_usdc: Account<'info, TokenAccount>,

    /// Prize pool USDC token account (pays prize)
    #[account(
        mut,
        seeds = [PRIZE_POOL_USDC_SEED],
        bump,
        token::mint = usdc_mint
    )]
    pub prize_pool_usdc: Account<'info, TokenAccount>,

    /// Prize pool authority PDA (signs token transfer)
    #[account(
        seeds = [PRIZE_POOL_USDC_SEED],
        bump
    )]
    pub prize_pool_authority: AccountInfo<'info>,

    /// USDC mint
    pub usdc_mint: Account<'info, anchor_spl::token::Mint>,

    /// Token program
    pub token_program: Program<'info, Token>,

    /// Player statistics (updated with win)
    #[account(
        mut,
        seeds = [USER_SEED, player.key().as_ref()],
        bump,
        constraint = user_stats.wallet == player.key()
    )]
    pub user_stats: Account<'info, UserStats>,
}

// ============================================================================
// Set Paused Context
// ============================================================================

/// Context for pausing or unpausing the lottery
#[derive(Accounts)]
pub struct SetPaused<'info> {
    /// Admin authority
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Global lottery state
    #[account(
        mut,
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump,
        constraint = lottery_state.authority == authority.key() @ crate::errors::ErrorCode::AdminAuthorityRequired
    )]
    pub lottery_state: Account<'info, LotteryState>,
}

// ============================================================================
// Bulk Ticket Purchase Context (Advanced Feature)
// ============================================================================

/// Context for purchasing multiple tickets in bulk
#[derive(Accounts)]
#[instruction(ticket_count: u32)]
pub struct BuyBulkTickets<'info> {
    /// Player purchasing the tickets
    #[account(mut)]
    pub player: Signer<'info>,

    /// Global lottery state
    #[account(
        mut,
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump,
        constraint = !lottery_state.is_paused @ crate::errors::ErrorCode::Paused,
        constraint = !lottery_state.is_draw_in_progress @ crate::errors::ErrorCode::DrawInProgress
    )]
    pub lottery_state: Account<'info, LotteryState>,

    /// Unified ticket account for bulk storage
    #[account(
        init,
        payer = player,
        space = UnifiedTicket::size_for_count(ticket_count as usize),
        seeds = [
            TICKET_SEED,
            b"bulk",
            player.key().as_ref(),
            &lottery_state.current_draw_id.to_le_bytes()
        ],
        bump
    )]
    pub unified_ticket: Account<'info, UnifiedTicket>,

    /// Player's USDC token account
    #[account(
        mut,
        constraint = player_usdc.mint == usdc_mint.key(),
        constraint = player_usdc.owner == player.key()
    )]
    pub player_usdc: Account<'info, TokenAccount>,

    /// Prize pool USDC token account
    #[account(
        mut,
        seeds = [PRIZE_POOL_USDC_SEED],
        bump,
        token::mint = usdc_mint
    )]
    pub prize_pool_usdc: Account<'info, TokenAccount>,

    /// House fee USDC token account
    #[account(
        mut,
        seeds = [HOUSE_FEE_USDC_SEED],
        bump,
        token::mint = usdc_mint
    )]
    pub house_fee_usdc: Account<'info, TokenAccount>,

    /// USDC mint
    pub usdc_mint: Account<'info, anchor_spl::token::Mint>,

    /// Player statistics
    #[account(
        mut,
        seeds = [USER_SEED, player.key().as_ref()],
        bump,
        constraint = user_stats.wallet == player.key()
    )]
    pub user_stats: Account<'info, UserStats>,

    /// System program
    pub system_program: Program<'info, System>,

    /// Token program
    pub token_program: Program<'info, Token>,

    /// Rent sysvar
    pub rent: Sysvar<'info, Rent>,
}
