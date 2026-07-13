//! MazelProtocol - LP Pool State
//!
//! Defines the Jackpot Liquidity Provider pool and per-user position accounts.
//! LPs deposit USDC to seed the jackpot and earn a share of house fees in return.
//!
//! # Architecture
//! - `LpPool`: Global singleton tracking total deposits and accumulated rewards.
//! - `LpPosition`: Per-user PDA tracking shares, deposits, and reward debt.
//!
//! # Reward Tracking (Masterchef Pattern)
//! Rewards accumulate in `LpPool.reward_per_share` as ticket purchases route
//! a portion of house fees to the LP pool. Users claim the delta between
//! the current `reward_per_share` and their `reward_debt`.

use anchor_lang::prelude::*;

use crate::errors::LottoError;

/// Global LP pool account — one per lottery program.
/// PDA seeds: `[LP_POOL_SEED]`
#[account]
#[derive(Default)]
pub struct LpPool {
    /// PDA bump seed
    pub bump: u8,

    /// Total LP shares outstanding. Tracks proportional ownership of the pool.
    pub total_shares: u64,

    /// Total USDC currently deposited (liquidity available for jackpot seeding).
    /// Decreases when seed is drawn for a new jackpot cycle.
    pub total_deposits: u64,

    /// Accumulated LP rewards in USDC lamports awaiting distribution.
    /// Incremented atomically with ticket purchases.
    pub accumulated_rewards: u64,

    /// Accumulated reward per share (fixed-point, 1e12 scale).
    /// Updated each time rewards are added. Used for the masterchef pattern.
    pub reward_per_share: u128,

    /// Portion of house fee allocated to LP rewards, in basis points.
    /// e.g., 6000 = 60% of house fees go to LPs.
    pub lp_reward_bps: u16,

    /// Whether LP deposits are currently accepted.
    pub is_paused: bool,

    /// Total lifetime rewards paid to LPs (for analytics / audit trail).
    pub total_rewards_paid: u64,

    /// Last draw ID where LP seed was drawn for the jackpot (0 = never).
    pub last_seed_draw_id: u64,

    /// Unix timestamp when a pending lp_reward_bps change becomes effective.
    /// 0 means no pending change. Enforces CONFIG_TIMELOCK_DELAY.
    pub lp_config_timelock_end: i64,

    /// Pending lp_reward_bps value awaiting timelock expiry.
    pub pending_lp_reward_bps: u16,
}

impl LpPool {
    /// Compute the account space needed for this struct.
    pub const LEN: usize = 8  // discriminator
        + 1   // bump: u8
        + 8   // total_shares: u64
        + 8   // total_deposits: u64
        + 8   // accumulated_rewards: u64
        + 16  // reward_per_share: u128
        + 2   // lp_reward_bps: u16
        + 1   // is_paused: bool
        + 8   // total_rewards_paid: u64
        + 8   // last_seed_draw_id: u64
        + 8   // lp_config_timelock_end: i64
        + 2; // pending_lp_reward_bps: u16

    /// Calculate the number of shares a deposit of `amount` USDC lamports
    /// would receive given the current pool state.
    ///
    /// If the pool is empty (total_shares == 0), the depositor receives
    /// shares equal to the deposit amount (1:1 ratio to start).
    pub fn shares_for_deposit(&self, amount: u64) -> Option<u64> {
        if amount == 0 {
            return Some(0);
        }
        if self.total_shares == 0 {
            Some(amount)
        } else {
            (amount as u128)
                .checked_mul(self.total_shares as u128)?
                .checked_div(self.total_deposits as u128)
                .and_then(|s| u64::try_from(s).ok())
        }
    }

    /// Calculate the USDC amount a holder of `shares` would receive on withdrawal
    /// given the current pool state.
    pub fn amount_for_shares(&self, shares: u64) -> Option<u64> {
        if shares == 0 || self.total_shares == 0 {
            return Some(0);
        }
        (shares as u128)
            .checked_mul(self.total_deposits as u128)?
            .checked_div(self.total_shares as u128)
            .and_then(|a| u64::try_from(a).ok())
    }

    /// Add rewards to the pool. Called during ticket purchases when a portion
    /// of the house fee is routed to LPs.
    pub fn add_rewards(&mut self, amount: u64) -> Result<()> {
        if amount == 0 {
            return Ok(());
        }

        self.accumulated_rewards =
            self.accumulated_rewards.checked_add(amount).ok_or(LottoError::Overflow)?;

        if self.total_shares > 0 {
            let reward_increment = (amount as u128)
                .checked_mul(1_000_000_000_000u128)
                .ok_or(LottoError::Overflow)?
                .checked_div(self.total_shares as u128)
                .ok_or(LottoError::Overflow)?;

            self.reward_per_share =
                self.reward_per_share.checked_add(reward_increment).ok_or(LottoError::Overflow)?;
        }

        Ok(())
    }

    /// Deduct rewards from accumulated_rewards (called when a user claims).
    pub fn deduct_rewards(&mut self, amount: u64) -> Result<()> {
        self.accumulated_rewards =
            self.accumulated_rewards.checked_sub(amount).ok_or(LottoError::Overflow)?;
        self.total_rewards_paid =
            self.total_rewards_paid.checked_add(amount).ok_or(LottoError::Overflow)?;
        Ok(())
    }

    /// Deduct seed amount from total_deposits.
    pub fn deduct_seed(&mut self, amount: u64) -> Result<()> {
        self.total_deposits =
            self.total_deposits.checked_sub(amount).ok_or(LottoError::Overflow)?;
        Ok(())
    }
}

/// Per-user LP position — tracks shares and reward debt.
/// PDA seeds: `[LP_POSITION_SEED, owner.key().as_ref()]`
#[account]
#[derive(Default)]
pub struct LpPosition {
    /// Owner of this position
    pub owner: Pubkey,

    /// Number of LP shares held by this user
    pub shares: u64,

    /// Total USDC deposited by this user.
    pub deposit_amount: u64,

    /// Reward debt (masterchef pattern).
    pub reward_debt: u128,

    /// Cumulative rewards claimed by this user (lifetime).
    pub total_rewards_claimed: u64,

    /// PDA bump seed
    pub bump: u8,
}

impl LpPosition {
    /// Compute the account space needed for this struct.
    pub const LEN: usize = 8 // discriminator
        + 32  // owner: Pubkey
        + 8   // shares: u64
        + 8   // deposit_amount: u64
        + 16  // reward_debt: u128
        + 8   // total_rewards_claimed: u64
        + 1; // bump: u8

    /// Calculate pending (unclaimed) rewards for this position.
    pub fn pending_rewards(&self, current_reward_per_share: u128) -> Option<u64> {
        if self.shares == 0 {
            return Some(0);
        }

        let accumulated = (self.shares as u128)
            .checked_mul(current_reward_per_share)?
            .checked_div(1_000_000_000_000u128)?;

        let pending = accumulated.checked_sub(self.reward_debt)?;

        u64::try_from(pending).ok()
    }

    /// Update reward_debt after a deposit, withdrawal, or claim.
    pub fn update_reward_debt(&mut self, current_reward_per_share: u128) -> Result<()> {
        if self.shares == 0 {
            self.reward_debt = 0;
            return Ok(());
        }

        self.reward_debt = (self.shares as u128)
            .checked_mul(current_reward_per_share)
            .ok_or(LottoError::Overflow)?
            .checked_div(1_000_000_000_000u128)
            .ok_or(LottoError::Overflow)?;

        Ok(())
    }
}
