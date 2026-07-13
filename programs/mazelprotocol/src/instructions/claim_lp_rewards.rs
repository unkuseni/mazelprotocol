//! Claim LP Rewards Instruction
//!
//! Allows LPs to claim their accumulated share of house fee rewards.
//! Uses the masterchef pattern — rewards accrue passively with every
//! ticket purchase and can be claimed at any time without affecting
//! the user's underlying LP position.

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::errors::LottoError;
use crate::events::LpRewardsClaimed;
use crate::state::{LpPool, LpPosition};

/// Accounts required for claiming LP rewards
#[derive(Accounts)]
pub struct ClaimLpRewards<'info> {
    /// The LP claiming rewards
    #[account(mut)]
    pub claimer: Signer<'info>,

    /// The global LP pool state account
    #[account(
        mut,
        seeds = [LP_POOL_SEED],
        bump = lp_pool.bump,
    )]
    pub lp_pool: Account<'info, LpPool>,

    /// The claimer's LP position account
    #[account(
        mut,
        seeds = [LP_POSITION_SEED, claimer.key().as_ref()],
        bump = lp_position.bump,
        constraint = lp_position.owner == claimer.key() @ LottoError::NotTicketOwner,
        constraint = lp_position.shares > 0 @ LottoError::LpPositionNotFound,
    )]
    pub lp_position: Account<'info, LpPosition>,

    /// LP rewards USDC token account — funds are taken from the accumulated
    /// rewards tracked in lp_pool.accumulated_rewards. The rewards are held
    /// in the same lp_pool_usdc account as deposits.
    #[account(
        mut,
        seeds = [LP_POOL_USDC_SEED],
        bump
    )]
    pub lp_pool_usdc: Account<'info, TokenAccount>,

    /// Destination USDC token account for claimed rewards
    #[account(
        mut,
        constraint = destination_usdc.owner == claimer.key() @ LottoError::InvalidTokenAccount
    )]
    pub destination_usdc: Account<'info, TokenAccount>,

    /// Token program
    pub token_program: Program<'info, Token>,
}

/// Claim accumulated LP rewards.
///
/// Rewards accumulate passively from house fees on every ticket purchase.
/// This instruction transfers the user's pending rewards to their wallet.
/// The underlying LP position (shares/deposit) is NOT affected.
///
/// # Arguments
/// * `ctx` - The context containing all required accounts
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler(ctx: Context<ClaimLpRewards>) -> Result<()> {
    let clock = Clock::get()?;
    let lp_pool = &mut ctx.accounts.lp_pool;
    let lp_position = &mut ctx.accounts.lp_position;

    // Calculate pending rewards
    let pending = lp_position
        .pending_rewards(lp_pool.reward_per_share)
        .ok_or(LottoError::LpRewardOverflow)?;
    require!(pending > 0, LottoError::LpNoRewardsToClaim);

    // Verify pool has sufficient USDC to pay rewards.
    // The lp_pool_usdc holds both total_deposits and accumulated_rewards.
    // We must ensure the reward payment doesn't eat into deposit backing.
    require!(ctx.accounts.lp_pool_usdc.amount >= pending, LottoError::LpInsufficientLiquidity);
    require!(
        ctx.accounts.lp_pool_usdc.amount.saturating_sub(pending) >= lp_pool.total_deposits,
        LottoError::LpInsufficientLiquidity
    );

    // Deduct from accumulated rewards
    lp_pool.deduct_rewards(pending)?;

    // Update user's total claimed rewards
    lp_position.total_rewards_claimed = lp_position
        .total_rewards_claimed
        .checked_add(pending)
        .ok_or(LottoError::LpRewardOverflow)?;

    // Update reward_debt to current reward_per_share
    lp_position.update_reward_debt(lp_pool.reward_per_share)?;

    // Transfer rewards from LP pool USDC to claimer
    let lp_pool_bump = lp_pool.bump;
    let seeds: &[&[u8]] = &[LP_POOL_SEED, &[lp_pool_bump]];
    let signer_seeds = &[&seeds[..]];

    let cpi_accounts = Transfer {
        from: ctx.accounts.lp_pool_usdc.to_account_info(),
        to: ctx.accounts.destination_usdc.to_account_info(),
        authority: lp_pool.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
    token::transfer(cpi_ctx, pending)?;

    emit!(LpRewardsClaimed {
        claimer: ctx.accounts.claimer.key(),
        amount: pending,
        total_claimed_by_user: lp_position.total_rewards_claimed,
        timestamp: clock.unix_timestamp,
    });

    msg!("LP rewards claimed!");
    msg!("  Claimer: {}", ctx.accounts.claimer.key());
    msg!("  Amount: {} USDC lamports", pending);
    msg!("  Lifetime claimed: {} USDC lamports", lp_position.total_rewards_claimed);
    msg!("  Remaining accumulated rewards in pool: {} USDC lamports", lp_pool.accumulated_rewards);

    Ok(())
}
