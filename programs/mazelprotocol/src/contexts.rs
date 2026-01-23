use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::state::{DrawResult, LotteryState, Ticket, TicketBatch};

#[derive(Accounts)]
pub struct BuyTicket<'info> {
    #[account(mut)]
    pub player: Signer<'info>,

    #[account(
        mut,
        constraint = player_usdc.owner == player.key(),
        constraint = player_usdc.mint == usdc_mint.key()
    )]
    pub player_usdc: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = prize_pool_usdc.mint == usdc_mint.key()
    )]
    pub prize_pool_usdc: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [b"lottery"],
        bump = lottery_state.bump
    )]
    pub lottery_state: Account<'info, LotteryState>,

    #[account(
        init,
        payer = player,
        space = 8 + Ticket::LEN,
        seeds = [b"ticket", &lottery_state.current_draw_id.to_le_bytes()[..], &lottery_state.total_tickets_sold.to_le_bytes()[..]],
        bump
    )]
    pub ticket: Account<'info, Ticket>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BuyTicketBatch<'info> {
    #[account(mut)]
    pub player: Signer<'info>,

    #[account(
        mut,
        constraint = player_usdc.owner == player.key(),
        constraint = player_usdc.mint == usdc_mint.key()
    )]
    pub player_usdc: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = prize_pool_usdc.mint == usdc_mint.key()
    )]
    pub prize_pool_usdc: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [b"lottery"],
        bump = lottery_state.bump
    )]
    pub lottery_state: Account<'info, LotteryState>,

    /// Ticket batch account - uses player key and draw_id in seeds
    /// This allows each player to have one batch per draw that can hold up to 100 tickets
    #[account(
        init,
        payer = player,
        space = 8 + TicketBatch::LEN,
        seeds = [b"ticket_batch", player.key().as_ref(), &lottery_state.current_draw_id.to_le_bytes()[..]],
        bump
    )]
    pub ticket_batch: Account<'info, TicketBatch>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

/// Context for adding more tickets to an existing batch
#[derive(Accounts)]
pub struct AddToTicketBatch<'info> {
    #[account(mut)]
    pub player: Signer<'info>,

    #[account(
        mut,
        constraint = player_usdc.owner == player.key(),
        constraint = player_usdc.mint == usdc_mint.key()
    )]
    pub player_usdc: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = prize_pool_usdc.mint == usdc_mint.key()
    )]
    pub prize_pool_usdc: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [b"lottery"],
        bump = lottery_state.bump
    )]
    pub lottery_state: Account<'info, LotteryState>,

    /// Existing ticket batch to add tickets to
    #[account(
        mut,
        constraint = ticket_batch.owner == player.key(),
        constraint = ticket_batch.draw_id == lottery_state.current_draw_id,
        seeds = [b"ticket_batch", player.key().as_ref(), &lottery_state.current_draw_id.to_le_bytes()[..]],
        bump = ticket_batch.bump
    )]
    pub ticket_batch: Account<'info, TicketBatch>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct InitializeDraw<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        has_one = authority,
        seeds = [b"lottery"],
        bump = lottery_state.bump
    )]
    pub lottery_state: Account<'info, LotteryState>,

    #[account(
        init,
        payer = authority,
        space = 8 + DrawResult::LEN,
        seeds = [b"draw", &(lottery_state.current_draw_id + 1).to_le_bytes()[..]],
        bump
    )]
    pub draw_result: Account<'info, DrawResult>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExecuteDraw<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        has_one = authority,
        seeds = [b"lottery"],
        bump = lottery_state.bump
    )]
    pub lottery_state: Account<'info, LotteryState>,

    #[account(
        mut,
        seeds = [b"draw", &lottery_state.current_draw_id.to_le_bytes()[..]],
        bump
    )]
    pub draw_result: Account<'info, DrawResult>,
}

#[derive(Accounts)]
pub struct CalculateWinners<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        has_one = authority,
        seeds = [b"lottery"],
        bump = lottery_state.bump
    )]
    pub lottery_state: Account<'info, LotteryState>,

    #[account(
        mut,
        seeds = [b"draw", &lottery_state.current_draw_id.to_le_bytes()[..]],
        bump
    )]
    pub draw_result: Account<'info, DrawResult>,
}

#[derive(Accounts)]
pub struct ClaimPrize<'info> {
    #[account(mut)]
    pub player: Signer<'info>,

    #[account(
        mut,
        constraint = player_usdc.owner == player.key(),
        constraint = player_usdc.mint == usdc_mint.key()
    )]
    pub player_usdc: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = prize_pool_usdc.mint == usdc_mint.key()
    )]
    pub prize_pool_usdc: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [b"prize_pool_auth"],
        bump
    )]
    /// CHECK: This is the PDA authority for the prize pool token account
    pub prize_pool_authority: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [b"lottery"],
        bump = lottery_state.bump
    )]
    pub lottery_state: Account<'info, LotteryState>,

    #[account(
        mut,
        constraint = ticket.owner == player.key()
    )]
    pub ticket: Account<'info, Ticket>,

    #[account(
        seeds = [b"draw", &ticket.draw_id.to_le_bytes()[..]],
        bump
    )]
    pub draw_result: Account<'info, DrawResult>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ClaimBatchPrize<'info> {
    #[account(mut)]
    pub player: Signer<'info>,

    #[account(
        mut,
        constraint = player_usdc.owner == player.key(),
        constraint = player_usdc.mint == usdc_mint.key()
    )]
    pub player_usdc: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = prize_pool_usdc.mint == usdc_mint.key()
    )]
    pub prize_pool_usdc: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [b"prize_pool_auth"],
        bump
    )]
    /// CHECK: This is the PDA authority for the prize pool token account
    pub prize_pool_authority: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [b"lottery"],
        bump = lottery_state.bump
    )]
    pub lottery_state: Account<'info, LotteryState>,

    #[account(
        mut,
        constraint = ticket_batch.owner == player.key(),
        seeds = [b"ticket_batch", player.key().as_ref(), &ticket_batch.draw_id.to_le_bytes()[..]],
        bump = ticket_batch.bump
    )]
    pub ticket_batch: Account<'info, TicketBatch>,

    #[account(
        seeds = [b"draw", &ticket_batch.draw_id.to_le_bytes()[..]],
        bump
    )]
    pub draw_result: Account<'info, DrawResult>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct InitializeLottery<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + LotteryState::LEN,
        seeds = [b"lottery"],
        bump
    )]
    pub lottery_state: Account<'info, LotteryState>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RedeemFreeTicket<'info> {
    #[account(mut)]
    pub player: Signer<'info>,

    #[account(
        mut,
        seeds = [b"lottery"],
        bump = lottery_state.bump
    )]
    pub lottery_state: Account<'info, LotteryState>,

    #[account(
        init,
        payer = player,
        space = 8 + Ticket::LEN,
        seeds = [b"free_ticket", player.key().as_ref(), &lottery_state.current_draw_id.to_le_bytes()[..]],
        bump
    )]
    pub ticket: Account<'info, Ticket>,

    /// CHECK: NFT mint address - in production, verify ownership via token account
    pub nft_mint: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositToJackpot<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,

    #[account(
        mut,
        constraint = depositor_usdc.owner == depositor.key(),
        constraint = depositor_usdc.mint == usdc_mint.key()
    )]
    pub depositor_usdc: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = prize_pool_usdc.mint == usdc_mint.key()
    )]
    pub prize_pool_usdc: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [b"lottery"],
        bump = lottery_state.bump
    )]
    pub lottery_state: Account<'info, LotteryState>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct DistributeRolldown<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        has_one = authority,
        seeds = [b"lottery"],
        bump = lottery_state.bump
    )]
    pub lottery_state: Account<'info, LotteryState>,

    #[account(
        mut,
        seeds = [b"draw", &lottery_state.current_draw_id.to_le_bytes()[..]],
        bump
    )]
    pub draw_result: Account<'info, DrawResult>,
}

#[derive(Accounts)]
pub struct AdminAction<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        has_one = authority,
        seeds = [b"lottery"],
        bump = lottery_state.bump
    )]
    pub lottery_state: Account<'info, LotteryState>,
}
