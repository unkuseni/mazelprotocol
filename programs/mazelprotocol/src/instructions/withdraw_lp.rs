//! Withdraw LP Instruction
//!
//! Allows LPs to withdraw their USDC from the LP pool by burning LP shares.
//! Uses instant proportional withdrawal — no cooldown, no two-step.
//! Unclaimed rewards are automatically claimed as part of the withdrawal.

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::errors::LottoError;
use crate::events::LpRewardsClaimed;
use crate::events::LpWithdrawn;
use crate::state::{LotteryState, LpPool, LpPosition};

/// Accounts required for withdrawing from the LP pool
#[derive(Accounts)]
pub struct WithdrawLp<'info> {
    /// The LP withdrawing funds
    #[account(mut)]
    pub withdrawer: Signer<'info>,

    /// The global LP pool state account
    #[account(
        mut,
        seeds = [LP_POOL_SEED],
        bump = lp_pool.bump,
    )]
    pub lp_pool: Account<'info, LpPool>,

    /// The withdrawer's LP position account
    #[account(
        mut,
        seeds = [LP_POSITION_SEED, withdrawer.key().as_ref()],
        bump = lp_position.bump,
        constraint = lp_position.owner == withdrawer.key() @ LottoError::NotTicketOwner,
        constraint = lp_position.shares > 0 @ LottoError::LpPositionNotFound,
    )]
    pub lp_position: Account<'info, LpPosition>,

    /// The lottery state (read-only, for cycle gating)
    ///
    /// Withdrawals are blocked while a draw is in progress or awaiting
    /// finalization. This prevents LPs from pulling liquidity right before
    /// the jackpot is distributed and the pool is needed for re-seeding.
    #[account(
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump,
        constraint = !lottery_state.is_draw_in_progress @ LottoError::DrawInProgress,
        constraint = !lottery_state.is_awaiting_finalization @ LottoError::DrawInProgress,
    )]
    pub lottery_state: Account<'info, LotteryState>,

    /// LP pool USDC token account (source for withdrawals)
    #[account(
        mut,
        seeds = [LP_POOL_USDC_SEED],
        bump
    )]
    pub lp_pool_usdc: Account<'info, TokenAccount>,

    /// Destination USDC token account for withdrawn funds
    #[account(
        mut,
        constraint = destination_usdc.owner == withdrawer.key() @ LottoError::InvalidTokenAccount
    )]
    pub destination_usdc: Account<'info, TokenAccount>,

    /// Token program
    pub token_program: Program<'info, Token>,
}

/// Withdraw USDC from the LP pool by burning shares.
///
/// Can withdraw a partial amount (up to your full position minus a small
/// buffer that prevents complete pool drainage). Unclaimed rewards are
/// automatically claimed in the same transaction.
///
/// # Withdrawal Gate
/// Withdrawals are **blocked** during an active draw cycle (from
/// `commit_randomness` through `finalize_draw`). This ensures LP funds
/// remain available for jackpot re-seeding at finalization time.
/// Once finalize_draw completes, withdrawals open again.
///
/// # Arguments
/// * `ctx` - The context containing all required accounts
/// * `shares` - Number of LP shares to burn
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler(ctx: Context<WithdrawLp>, shares: u64) -> Result<()> {
    let clock = Clock::get()?;
    let lp_pool = &mut ctx.accounts.lp_pool;
    let lp_position = &mut ctx.accounts.lp_position;

    // Validate shares
    require!(shares > 0, LottoError::LpInvalidDepositAmount);
    require!(shares <= lp_position.shares, LottoError::LpInsufficientShares);

    // Prevent draining the entire pool if there are pending seed obligations.
    // The protocol needs some liquidity buffer. Allow up to 99% withdrawal.
    let is_full_withdrawal = shares == lp_position.shares && shares == lp_pool.total_shares;
    require!(!is_full_withdrawal, LottoError::LpCannotDrainPool);

    // Calculate USDC amount for the shares being withdrawn
    let withdraw_amount = lp_pool.amount_for_shares(shares).ok_or(LottoError::LpShareOverflow)?;
    require!(withdraw_amount > 0, LottoError::LpInsufficientLiquidity);

    // --- Auto-claim pending rewards before updating shares ---
    // The user's rewards are calculated based on their CURRENT shares.
    // We must claim them before reducing share count.
    let pending = lp_position.pending_rewards(lp_pool.reward_per_share).unwrap_or(0);

    if pending > 0 {
        lp_pool.deduct_rewards(pending)?;
        lp_position.total_rewards_claimed = lp_position
            .total_rewards_claimed
            .checked_add(pending)
            .ok_or(LottoError::LpRewardOverflow)?;

        emit!(LpRewardsClaimed {
            claimer: ctx.accounts.withdrawer.key(),
            amount: pending,
            total_claimed_by_user: lp_position.total_rewards_claimed,
            timestamp: clock.unix_timestamp,
        });

        msg!("Auto-claimed {} USDC lamports in pending rewards", pending);
    }

    // SECURITY FIX (post-audit): the transfer MUST include the auto-claimed
    // rewards. Previously only `withdraw_amount` was transferred while the
    // pending rewards were deducted from bookkeeping, silently forfeiting the
    // user's accrued rewards (they became orphaned USDC in the pool).
    let total_to_transfer = withdraw_amount.saturating_add(pending);
    require!(
        ctx.accounts.lp_pool_usdc.amount >= total_to_transfer,
        LottoError::LpInsufficientLiquidity
    );

    // --- Update pool state ---
    lp_pool.total_shares =
        lp_pool.total_shares.checked_sub(shares).ok_or(LottoError::LpShareOverflow)?;
    lp_pool.total_deposits =
        lp_pool.total_deposits.checked_sub(withdraw_amount).ok_or(LottoError::LpShareOverflow)?;

    // --- Update position state ---
    lp_position.shares =
        lp_position.shares.checked_sub(shares).ok_or(LottoError::LpShareOverflow)?;
    lp_position.deposit_amount = lp_position
        .deposit_amount
        .checked_sub(withdraw_amount)
        .ok_or(LottoError::LpShareOverflow)?;

    // Update reward_debt AFTER share change
    lp_position.update_reward_debt(lp_pool.reward_per_share)?;

    // --- Transfer USDC from LP pool to withdrawer (deposit share + rewards) ---
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
    token::transfer(cpi_ctx, total_to_transfer)?;

    emit!(LpWithdrawn {
        withdrawer: ctx.accounts.withdrawer.key(),
        amount: total_to_transfer,
        shares_burned: shares,
        total_shares: lp_pool.total_shares,
        total_deposits: lp_pool.total_deposits,
        timestamp: clock.unix_timestamp,
    });

    msg!("LP withdrawal successful!");
    msg!("  Withdrawer: {}", ctx.accounts.withdrawer.key());
    msg!("  Shares burned: {}", shares);
    msg!("  USDC withdrawn: {} lamports", withdraw_amount);
    msg!("  Pending rewards auto-claimed: {} lamports", pending);
    msg!("  Total transferred (deposit + rewards): {} lamports", total_to_transfer);
    msg!(
        "  Pool remaining: {} shares, {} USDC lamports",
        lp_pool.total_shares,
        lp_pool.total_deposits
    );
    msg!(
        "  Position remaining: {} shares, {} USDC lamports",
        lp_position.shares,
        lp_position.deposit_amount
    );

    Ok(())
}
