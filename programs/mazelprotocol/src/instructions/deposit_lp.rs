//! Deposit LP Instruction
//!
//! Allows any user to deposit USDC into the LP pool and receive LP shares.
//! Shares represent proportional ownership of the pool and entitle the holder
//! to a share of house fee rewards.
//!
//! # Share Calculation
//! - First deposit: shares = deposit_amount (1:1 ratio)
//! - Subsequent deposits: shares = (deposit * total_shares) / total_deposits

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::errors::LottoError;
use crate::events::LpDeposited;
use crate::state::{LotteryState, LpPool, LpPosition};

/// Accounts required for depositing into the LP pool
#[derive(Accounts)]
pub struct DepositLp<'info> {
    /// The depositor
    #[account(mut)]
    pub depositor: Signer<'info>,

    /// The global LP pool state account
    #[account(
        init_if_needed,
        payer = depositor,
        space = LpPool::LEN,
        seeds = [LP_POOL_SEED],
        bump
    )]
    pub lp_pool: Account<'info, LpPool>,

    /// The depositor's LP position account
    #[account(
        init_if_needed,
        payer = depositor,
        space = LpPosition::LEN,
        seeds = [LP_POSITION_SEED, depositor.key().as_ref()],
        bump
    )]
    pub lp_position: Account<'info, LpPosition>,

    /// The lottery state (read-only, for cycle gating)
    ///
    /// Deposits are blocked during active draw cycles to prevent LPs from
    /// depositing right before finalization to capture seeding value.
    #[account(
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump,
        constraint = !lottery_state.is_draw_in_progress @ LottoError::DrawInProgress,
        constraint = !lottery_state.is_awaiting_finalization @ LottoError::DrawInProgress,
    )]
    pub lottery_state: Account<'info, LotteryState>,

    /// Depositor's USDC token account (source of funds)
    #[account(
        mut,
        constraint = depositor_usdc.owner == depositor.key() @ LottoError::TokenAccountOwnerMismatch,
        constraint = depositor_usdc.mint == usdc_mint.key() @ LottoError::InvalidUsdcMint
    )]
    pub depositor_usdc: Account<'info, TokenAccount>,

    /// LP pool USDC token account (destination for deposits)
    #[account(
        init_if_needed,
        payer = depositor,
        token::mint = usdc_mint,
        token::authority = lp_pool,
        seeds = [LP_POOL_USDC_SEED],
        bump
    )]
    pub lp_pool_usdc: Account<'info, TokenAccount>,

    /// USDC mint (must be 6 decimals)
    #[account(
        constraint = usdc_mint.decimals == 6 @ LottoError::InvalidUsdcMint
    )]
    pub usdc_mint: Account<'info, Mint>,

    /// Token program
    pub token_program: Program<'info, Token>,

    /// System program (for PDA creation)
    pub system_program: Program<'info, System>,
}

/// Deposit USDC into the LP pool to earn a share of house fee rewards.
///
/// # Arguments
/// * `ctx` - The context containing all required accounts
/// * `amount` - Amount of USDC lamports to deposit
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler(ctx: Context<DepositLp>, amount: u64) -> Result<()> {
    let clock = Clock::get()?;

    // Validate deposit amount
    require!(amount > 0, LottoError::LpInvalidDepositAmount);
    require!(amount >= MIN_LP_DEPOSIT, LottoError::LpInvalidDepositAmount);
    require!(ctx.accounts.depositor_usdc.amount >= amount, LottoError::InsufficientFunds);

    let lp_pool = &mut ctx.accounts.lp_pool;
    let lp_position = &mut ctx.accounts.lp_position;

    // Cannot deposit while pool is paused
    require!(!lp_pool.is_paused, LottoError::LpPoolPaused);

    // Set pool bump on first initialization
    if lp_pool.bump == 0 {
        lp_pool.bump = ctx.bumps.lp_pool;
        lp_pool.lp_reward_bps = DEFAULT_LP_REWARD_BPS;
    }

    // Calculate shares for this deposit BEFORE updating state
    let shares = lp_pool.shares_for_deposit(amount).ok_or(LottoError::LpShareOverflow)?;
    require!(shares > 0, LottoError::LpShareOverflow);

    // Transfer USDC from depositor to LP pool
    let cpi_accounts = Transfer {
        from: ctx.accounts.depositor_usdc.to_account_info(),
        to: ctx.accounts.lp_pool_usdc.to_account_info(),
        authority: ctx.accounts.depositor.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    token::transfer(cpi_ctx, amount)?;

    // Update position reward_debt BEFORE changing shares (masterchef pattern).
    // This locks in any pending rewards at their current value without
    // transferring USDC. The user can claim them later via claim_lp_rewards.
    if lp_position.shares > 0 {
        lp_position.update_reward_debt(lp_pool.reward_per_share)?;
    }

    // Update pool state
    lp_pool.total_shares =
        lp_pool.total_shares.checked_add(shares).ok_or(LottoError::LpShareOverflow)?;
    lp_pool.total_deposits =
        lp_pool.total_deposits.checked_add(amount).ok_or(LottoError::LpShareOverflow)?;

    // Update position state
    lp_position.owner = ctx.accounts.depositor.key();
    lp_position.shares =
        lp_position.shares.checked_add(shares).ok_or(LottoError::LpShareOverflow)?;
    lp_position.deposit_amount =
        lp_position.deposit_amount.checked_add(amount).ok_or(LottoError::LpShareOverflow)?;
    lp_position.bump = ctx.bumps.lp_position;

    // Update reward_debt AFTER share change
    lp_position.update_reward_debt(lp_pool.reward_per_share)?;

    emit!(LpDeposited {
        depositor: ctx.accounts.depositor.key(),
        amount,
        shares_received: shares,
        total_shares: lp_pool.total_shares,
        total_deposits: lp_pool.total_deposits,
        timestamp: clock.unix_timestamp,
    });

    msg!("LP deposit successful!");
    msg!("  Depositor: {}", ctx.accounts.depositor.key());
    msg!("  Amount: {} USDC lamports", amount);
    msg!("  Shares received: {}", shares);
    msg!("  Pool total shares: {}", lp_pool.total_shares);
    msg!("  Pool total deposits: {} USDC lamports", lp_pool.total_deposits);

    Ok(())
}
