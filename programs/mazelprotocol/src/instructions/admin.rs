//! Admin Instructions
//!
//! This module contains administrative instructions for the lottery protocol:
//! - pause: Emergency pause all lottery operations
//! - unpause: Resume lottery operations after pause
//! - propose_config: Propose configuration changes (starts 24hr timelock)
//! - execute_config: Execute proposed config changes (after timelock expires)
//! - cancel_config_proposal: Cancel a pending config proposal
//! - update_config: (Legacy) Immediate config update — now requires no pending timelock
//! - withdraw_house_fees: Withdraw accumulated house fees
//! - transfer_authority: Two-step authority transfer (propose)
//! - accept_authority: Two-step authority transfer (accept)
//! - cancel_draw: Recovery mechanism for stuck draws
//! - check_solvency: On-chain solvency verification instruction

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::errors::LottoError;
use crate::events::{
    ConfigUpdated, DrawCancelled, DrawForceFinalized, EmergencyFundTransferred, EmergencyPause,
    EmergencyUnpause, ExpiredPrizesReclaimed, HouseFeesWithdrawn, InsurancePoolFunded,
    LpPoolPaused, LpPoolUnpaused, LpRewardBpsProposed, LpRewardBpsUpdated, LpRewardsClaimed,
    SolvencyCheckPerformed,
};
use crate::state::{DrawResult, LotteryState, LpPool, LpPosition, WinnerCounts};

// ============================================================================
// PAUSE INSTRUCTION
// ============================================================================

/// Accounts required for pausing the lottery
#[derive(Accounts)]
pub struct Pause<'info> {
    /// The authority pausing the lottery
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The main lottery state account
    #[account(
        mut,
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump,
        constraint = lottery_state.authority == authority.key() @ LottoError::Unauthorized,
        constraint = !lottery_state.is_paused @ LottoError::Paused
    )]
    pub lottery_state: Account<'info, LotteryState>,
}

/// Emergency pause the lottery
///
/// This instruction pauses all lottery operations including:
/// - Ticket purchases
/// - Draw execution
/// - Prize claims (depending on implementation)
///
/// Only the authority can pause the lottery.
/// Use this for emergency situations like discovered vulnerabilities.
///
/// # Arguments
/// * `ctx` - The context containing required accounts
/// * `reason` - Optional reason for the pause (for logging/events)
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler_pause(ctx: Context<Pause>, reason: String) -> Result<()> {
    let clock = Clock::get()?;
    let lottery_state = &mut ctx.accounts.lottery_state;

    lottery_state.is_paused = true;

    emit!(EmergencyPause {
        authority: ctx.accounts.authority.key(),
        reason: reason.clone(),
        timestamp: clock.unix_timestamp,
    });

    msg!("Lottery PAUSED by authority!");
    msg!("  Authority: {}", ctx.accounts.authority.key());
    msg!("  Reason: {}", reason);
    msg!("  Timestamp: {}", clock.unix_timestamp);

    Ok(())
}

// ============================================================================
// UNPAUSE INSTRUCTION
// ============================================================================

/// Accounts required for unpausing the lottery
#[derive(Accounts)]
pub struct Unpause<'info> {
    /// The authority unpausing the lottery
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The main lottery state account
    #[account(
        mut,
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump,
        constraint = lottery_state.authority == authority.key() @ LottoError::Unauthorized,
        constraint = lottery_state.is_paused @ LottoError::InvalidDrawState,
        // Cannot unpause if not funded
        constraint = lottery_state.is_funded @ LottoError::LotteryNotInitialized
    )]
    pub lottery_state: Account<'info, LotteryState>,
}

/// Unpause the lottery
///
/// This instruction resumes all lottery operations after a pause.
/// Only the authority can unpause the lottery.
/// The lottery must be funded before it can be unpaused.
///
/// # Arguments
/// * `ctx` - The context containing required accounts
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler_unpause(ctx: Context<Unpause>) -> Result<()> {
    let clock = Clock::get()?;
    let lottery_state = &mut ctx.accounts.lottery_state;

    // SECURITY: Re-verify solvency before allowing the lottery to resume.
    // Prevents the authority from unpausing an insolvent lottery where
    // the prize pool cannot cover committed prizes (C3 fix).
    require!(lottery_state.check_solvency_detailed(0, 0).0, LottoError::PrizePoolSolvencyFailed);

    lottery_state.is_paused = false;

    emit!(EmergencyUnpause {
        authority: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });

    msg!("Lottery UNPAUSED by authority!");
    msg!("  Authority: {}", ctx.accounts.authority.key());
    msg!("  Timestamp: {}", clock.unix_timestamp);

    Ok(())
}

// ============================================================================
// CONFIG TIMELOCK SYSTEM (Issue 5 fix)
// ============================================================================
// Configuration changes now use a two-phase timelock:
//   1. propose_config: Authority submits desired changes, starts CONFIG_TIMELOCK_DELAY countdown
//   2. execute_config: After the delay, authority applies the exact proposed changes
//   3. cancel_config_proposal: Authority can cancel a pending proposal
//
// This prevents a compromised authority from instantly changing critical parameters
// (e.g., zeroing out seed_amount, setting fees to 50%, changing caps maliciously).
// Anyone observing the chain has at least CONFIG_TIMELOCK_DELAY (24 hours) to
// detect and respond to a malicious proposal before it takes effect.

/// Parameters for updating configuration
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct UpdateConfigParams {
    /// New ticket price (None to keep current)
    pub ticket_price: Option<u64>,
    /// New house fee in basis points (None to keep current)
    pub house_fee_bps: Option<u16>,
    /// New jackpot cap (None to keep current)
    pub jackpot_cap: Option<u64>,
    /// New seed amount (None to keep current)
    pub seed_amount: Option<u64>,
    /// New soft cap (None to keep current)
    pub soft_cap: Option<u64>,
    /// New hard cap (None to keep current)
    pub hard_cap: Option<u64>,
    /// New Switchboard queue (None to keep current)
    pub switchboard_queue: Option<Pubkey>,
    /// New draw interval (None to keep current)
    pub draw_interval: Option<i64>,
    /// New LP reward bps as % of house fee (None to keep current)
    pub lp_reward_bps: Option<u16>,
    /// New sale target tickets (None to keep current, 0 = disabled)
    pub sale_target_tickets: Option<u64>,
}

impl UpdateConfigParams {
    /// Compute a deterministic SHA256 hash of these config params for timelock verification.
    /// The hash covers all fields so the executed config must exactly match what was proposed.
    pub fn compute_hash(&self) -> [u8; 32] {
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        // Encode each Option field: 0 byte = None, 1 byte + value = Some
        match self.ticket_price {
            Some(v) => {
                hasher.update([1u8]);
                hasher.update(v.to_le_bytes());
            }
            None => {
                hasher.update([0u8]);
            }
        }
        match self.house_fee_bps {
            Some(v) => {
                hasher.update([1u8]);
                hasher.update(v.to_le_bytes());
            }
            None => {
                hasher.update([0u8]);
            }
        }
        match self.jackpot_cap {
            Some(v) => {
                hasher.update([1u8]);
                hasher.update(v.to_le_bytes());
            }
            None => {
                hasher.update([0u8]);
            }
        }
        match self.seed_amount {
            Some(v) => {
                hasher.update([1u8]);
                hasher.update(v.to_le_bytes());
            }
            None => {
                hasher.update([0u8]);
            }
        }
        match self.soft_cap {
            Some(v) => {
                hasher.update([1u8]);
                hasher.update(v.to_le_bytes());
            }
            None => {
                hasher.update([0u8]);
            }
        }
        match self.hard_cap {
            Some(v) => {
                hasher.update([1u8]);
                hasher.update(v.to_le_bytes());
            }
            None => {
                hasher.update([0u8]);
            }
        }
        match self.switchboard_queue {
            Some(v) => {
                hasher.update([1u8]);
                hasher.update(v.to_bytes());
            }
            None => {
                hasher.update([0u8]);
            }
        }
        match self.draw_interval {
            Some(v) => {
                hasher.update([1u8]);
                hasher.update(v.to_le_bytes());
            }
            None => {
                hasher.update([0u8]);
            }
        }
        match self.lp_reward_bps {
            Some(v) => {
                hasher.update([1u8]);
                hasher.update(v.to_le_bytes());
            }
            None => {
                hasher.update([0u8]);
            }
        }
        match self.sale_target_tickets {
            Some(v) => {
                hasher.update([1u8]);
                hasher.update(v.to_le_bytes());
            }
            None => {
                hasher.update([0u8]);
            }
        }
        let result = hasher.finalize();
        let mut hash = [0u8; 32];
        hash.copy_from_slice(result.as_slice());
        hash
    }
}

/// Accounts required for proposing/updating/executing configuration
#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    /// The authority updating the configuration
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The main lottery state account
    #[account(
        mut,
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump,
        constraint = lottery_state.authority == authority.key() @ LottoError::Unauthorized,
        // Cannot update config during an active draw
        constraint = !lottery_state.is_draw_in_progress @ LottoError::DrawInProgress
    )]
    pub lottery_state: Account<'info, LotteryState>,
}

/// Propose configuration changes (Phase 1 of timelock)
///
/// This instruction starts the timelock by storing a hash of the proposed
/// changes and setting `config_timelock_end` to now + CONFIG_TIMELOCK_DELAY.
/// The actual changes are NOT applied yet — they must be executed via
/// `execute_config` after the timelock expires.
///
/// # Security
/// - Anyone monitoring the chain can see this proposal event and the hash
/// - The 24-hour delay gives the community time to detect malicious proposals
/// - The authority can cancel a proposal via `cancel_config_proposal`
///
/// # Validation Rules (pre-validated before accepting proposal)
/// - ticket_price: Must be > 0
/// - house_fee_bps: Must be <= 5000 (50%)
/// - draw_interval: minimum 1 hour, maximum 7 days
///
/// # Arguments
/// * `ctx` - The context containing required accounts
/// * `params` - The configuration parameters being proposed
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler_propose_config(
    ctx: Context<UpdateConfig>,
    params: UpdateConfigParams,
) -> Result<()> {
    let clock = Clock::get()?;
    let lottery_state = &mut ctx.accounts.lottery_state;

    // Reject if there's already a pending proposal
    require!(lottery_state.config_timelock_end == 0, LottoError::InvalidDrawState);

    // Pre-validate params so we catch errors early (before waiting 24h)
    if let Some(ticket_price) = params.ticket_price {
        require!(ticket_price > 0, LottoError::InvalidTicketPrice);
        // ML-3 fix: Enforce a reasonable max ticket price to prevent
        // economic model breakage from misconfigured parameters.
        require!(
            ticket_price <= 100_000_000, // Max 100 USDC (100 million lamports)
            LottoError::InvalidTicketPrice
        );
    }
    if let Some(house_fee_bps) = params.house_fee_bps {
        require!(house_fee_bps <= 5000, LottoError::InvalidHouseFee);
    }
    if let Some(draw_interval) = params.draw_interval {
        require!(draw_interval >= 3600 && draw_interval <= 604800, LottoError::InvalidDrawInterval);
    }
    if let Some(lp_reward_bps) = params.lp_reward_bps {
        require!(lp_reward_bps <= MAX_LP_REWARD_BPS, LottoError::LpInvalidRewardBps);
    }

    // Simulate the final state to validate relationships
    let simulated_soft_cap = params.soft_cap.unwrap_or(lottery_state.soft_cap);
    let simulated_hard_cap = params.hard_cap.unwrap_or(lottery_state.hard_cap);
    let simulated_seed_amount = params.seed_amount.unwrap_or(lottery_state.seed_amount);
    let simulated_jackpot_cap = params.jackpot_cap.unwrap_or(lottery_state.jackpot_cap);

    require!(simulated_soft_cap > 0, LottoError::InvalidCapConfig);
    require!(simulated_hard_cap > 0, LottoError::InvalidCapConfig);
    require!(simulated_soft_cap < simulated_hard_cap, LottoError::InvalidCapConfig);
    require!(simulated_seed_amount > 0, LottoError::InvalidSeedAmount);
    require!(simulated_seed_amount < simulated_soft_cap, LottoError::InvalidSeedAmount);
    require!(simulated_jackpot_cap > 0, LottoError::InvalidJackpotCap);
    require!(simulated_jackpot_cap <= simulated_hard_cap, LottoError::InvalidJackpotCap);

    // Store the proposal hash and set the timelock
    let config_hash = params.compute_hash();
    lottery_state.pending_config_hash = config_hash;
    lottery_state.config_timelock_end =
        clock.unix_timestamp.checked_add(CONFIG_TIMELOCK_DELAY).ok_or(LottoError::Overflow)?;

    emit!(ConfigUpdated {
        parameter: "config_proposed".to_string(),
        old_value: 0,
        new_value: lottery_state.config_timelock_end as u64,
        authority: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });

    msg!("⏳ Configuration change PROPOSED (timelock started)");
    msg!("  Config hash: {:?}", &lottery_state.pending_config_hash[..8]);
    msg!("  Executable after: {} (unix timestamp)", lottery_state.config_timelock_end);
    msg!("  Delay: {} seconds ({} hours)", CONFIG_TIMELOCK_DELAY, CONFIG_TIMELOCK_DELAY / 3600);
    msg!("  Call execute_config with the same params after the timelock expires.");

    Ok(())
}

/// Cancel a pending configuration proposal
///
/// Clears the pending config hash and timelock, preventing execution.
///
/// # Arguments
/// * `ctx` - The context containing required accounts
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler_cancel_config_proposal(ctx: Context<UpdateConfig>) -> Result<()> {
    let clock = Clock::get()?;
    let lottery_state = &mut ctx.accounts.lottery_state;

    require!(lottery_state.config_timelock_end != 0, LottoError::InvalidDrawState);

    lottery_state.pending_config_hash = [0u8; 32];
    lottery_state.config_timelock_end = 0;

    emit!(ConfigUpdated {
        parameter: "config_proposal_cancelled".to_string(),
        old_value: 0,
        new_value: 0,
        authority: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });

    msg!("❌ Configuration proposal CANCELLED.");

    Ok(())
}

/// Execute a proposed configuration change (Phase 2 of timelock)
///
/// Applies the previously proposed configuration changes after the timelock
/// has expired. The params must exactly match the proposed ones (verified via hash).
///
/// # Security
/// - Timelock must have expired (current time >= config_timelock_end)
/// - Params must hash to the same value as the proposal (prevents bait-and-switch)
/// - All relationship validations are re-checked
///
/// # Arguments
/// * `ctx` - The context containing required accounts
/// * `params` - The configuration parameters (must match proposal)
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler_execute_config(
    ctx: Context<UpdateConfig>,
    params: UpdateConfigParams,
) -> Result<()> {
    let clock = Clock::get()?;
    let lottery_state = &mut ctx.accounts.lottery_state;

    // Verify there is a pending proposal
    require!(lottery_state.config_timelock_end != 0, LottoError::InvalidDrawState);

    // Verify the timelock has expired
    require!(
        clock.unix_timestamp >= lottery_state.config_timelock_end,
        LottoError::InvalidTimestamp
    );

    // Verify the params hash matches the proposal (prevents bait-and-switch)
    let config_hash = params.compute_hash();
    require!(config_hash == lottery_state.pending_config_hash, LottoError::ConfigValidationFailed);

    // Clear the timelock state
    lottery_state.pending_config_hash = [0u8; 32];
    lottery_state.config_timelock_end = 0;

    // Now apply the configuration changes (same logic as the old handler_update_config)
    if let Some(ticket_price) = params.ticket_price {
        require!(ticket_price > 0, LottoError::InvalidTicketPrice);

        emit!(ConfigUpdated {
            parameter: "ticket_price".to_string(),
            old_value: lottery_state.ticket_price,
            new_value: ticket_price,
            authority: ctx.accounts.authority.key(),
            timestamp: clock.unix_timestamp,
        });

        lottery_state.ticket_price = ticket_price;
        msg!("Updated ticket_price: {}", ticket_price);
    }

    if let Some(house_fee_bps) = params.house_fee_bps {
        require!(house_fee_bps <= 5000, LottoError::InvalidHouseFee);

        emit!(ConfigUpdated {
            parameter: "house_fee_bps".to_string(),
            old_value: lottery_state.house_fee_bps as u64,
            new_value: house_fee_bps as u64,
            authority: ctx.accounts.authority.key(),
            timestamp: clock.unix_timestamp,
        });

        lottery_state.house_fee_bps = house_fee_bps;
        msg!("Updated house_fee_bps: {}", house_fee_bps);
    }

    if let Some(jackpot_cap) = params.jackpot_cap {
        emit!(ConfigUpdated {
            parameter: "jackpot_cap".to_string(),
            old_value: lottery_state.jackpot_cap,
            new_value: jackpot_cap,
            authority: ctx.accounts.authority.key(),
            timestamp: clock.unix_timestamp,
        });

        lottery_state.jackpot_cap = jackpot_cap;
        msg!("Updated jackpot_cap: {}", jackpot_cap);
    }

    if let Some(seed_amount) = params.seed_amount {
        emit!(ConfigUpdated {
            parameter: "seed_amount".to_string(),
            old_value: lottery_state.seed_amount,
            new_value: seed_amount,
            authority: ctx.accounts.authority.key(),
            timestamp: clock.unix_timestamp,
        });

        lottery_state.seed_amount = seed_amount;
        msg!("Updated seed_amount: {}", seed_amount);
    }

    if let Some(soft_cap) = params.soft_cap {
        emit!(ConfigUpdated {
            parameter: "soft_cap".to_string(),
            old_value: lottery_state.soft_cap,
            new_value: soft_cap,
            authority: ctx.accounts.authority.key(),
            timestamp: clock.unix_timestamp,
        });

        lottery_state.soft_cap = soft_cap;
        msg!("Updated soft_cap: {}", soft_cap);
    }

    if let Some(hard_cap) = params.hard_cap {
        emit!(ConfigUpdated {
            parameter: "hard_cap".to_string(),
            old_value: lottery_state.hard_cap,
            new_value: hard_cap,
            authority: ctx.accounts.authority.key(),
            timestamp: clock.unix_timestamp,
        });

        lottery_state.hard_cap = hard_cap;
        msg!("Updated hard_cap: {}", hard_cap);
    }

    if let Some(ref queue) = params.switchboard_queue {
        require!(*queue != Pubkey::default(), LottoError::InvalidConfig);
        require!(queue.is_on_curve(), LottoError::InvalidConfig); // Valid pubkey check
        lottery_state.switchboard_queue = *queue;
        msg!("Updated switchboard_queue: {}", queue);
    }

    if let Some(draw_interval) = params.draw_interval {
        require!(draw_interval >= 3600 && draw_interval <= 604800, LottoError::InvalidDrawInterval);

        emit!(ConfigUpdated {
            parameter: "draw_interval".to_string(),
            old_value: lottery_state.draw_interval as u64,
            new_value: draw_interval as u64,
            authority: ctx.accounts.authority.key(),
            timestamp: clock.unix_timestamp,
        });

        lottery_state.draw_interval = draw_interval;
        // M6 FIX: Recalculate next_draw_timestamp when draw_interval changes.
        // Without this, the old timestamp persists, potentially causing draws
        // to fire at the wrong time.
        lottery_state.next_draw_timestamp =
            clock.unix_timestamp.checked_add(draw_interval).ok_or(LottoError::Overflow)?;
        msg!(
            "Updated draw_interval: {} (next draw: {})",
            draw_interval,
            lottery_state.next_draw_timestamp
        );
    }

    if let Some(lp_reward_bps) = params.lp_reward_bps {
        require!(lp_reward_bps <= MAX_LP_REWARD_BPS, LottoError::LpInvalidRewardBps);

        emit!(LpRewardBpsUpdated {
            old_bps: lottery_state.house_fee_bps,
            new_bps: lp_reward_bps,
            authority: ctx.accounts.authority.key(),
            timestamp: clock.unix_timestamp,
        });

        // NOTE: The actual lp_reward_bps lives on the LpPool account, not LotteryState.
        // The authority must call a separate admin instruction to apply this to the LP pool.
        msg!("LP reward bps change approved. Apply to LP pool separately.");
    }

    if let Some(sale_target) = params.sale_target_tickets {
        emit!(ConfigUpdated {
            parameter: "sale_target_tickets".to_string(),
            old_value: lottery_state.sale_target_tickets,
            new_value: sale_target,
            authority: ctx.accounts.authority.key(),
            timestamp: clock.unix_timestamp,
        });

        lottery_state.sale_target_tickets = sale_target;
        msg!("Updated sale_target_tickets: {}", sale_target);
        if sale_target == 0 {
            msg!("  Sale target DISABLED (time-only mode)");
        } else {
            msg!("  Sale target ENABLED: draw triggers at {} tickets OR time", sale_target);
        }
    }

    // Validate relationships after updates
    require!(lottery_state.soft_cap > 0, LottoError::InvalidCapConfig);
    require!(lottery_state.hard_cap > 0, LottoError::InvalidCapConfig);
    require!(lottery_state.soft_cap < lottery_state.hard_cap, LottoError::InvalidCapConfig);
    require!(lottery_state.seed_amount > 0, LottoError::InvalidSeedAmount);
    require!(lottery_state.seed_amount < lottery_state.soft_cap, LottoError::InvalidSeedAmount);
    require!(lottery_state.jackpot_cap > 0, LottoError::InvalidJackpotCap);
    require!(lottery_state.jackpot_cap <= lottery_state.hard_cap, LottoError::InvalidJackpotCap);

    msg!("✅ Configuration EXECUTED after timelock!");

    Ok(())
}

/// Legacy immediate config update — kept for backwards compatibility.
///
/// IMPORTANT: This now enforces that there must NOT be a pending timelock proposal.
/// For production use, prefer the propose_config → execute_config flow.
/// This handler is retained so that non-sensitive operational updates
/// (e.g., switchboard_queue rotation) can still be done without delay,
/// but it will refuse to run if a timelock proposal is active.
///
/// # Arguments
/// * `ctx` - The context containing required accounts
/// * `params` - The configuration parameters to update
///
/// # Returns
/// * `Result<()>` - Success or error
/// SECURITY FIX (Issue #2): Legacy immediate config update now ONLY allows
/// non-sensitive operational parameters (switchboard_queue rotation).
///
/// ALL financial parameters (ticket_price, house_fee_bps, jackpot_cap,
/// seed_amount, soft_cap, hard_cap, draw_interval) MUST go through the
/// propose_config → execute_config timelock flow. This prevents a
/// compromised authority from instantly changing critical financial params.
///
/// If any sensitive parameter is provided, this handler will reject the call
/// with an error directing the caller to use the timelock flow instead.
pub fn handler_update_config(ctx: Context<UpdateConfig>, params: UpdateConfigParams) -> Result<()> {
    let clock = Clock::get()?;
    let lottery_state = &mut ctx.accounts.lottery_state;

    // SECURITY: Reject if there's a pending timelock proposal to prevent bypass
    require!(lottery_state.config_timelock_end == 0, LottoError::InvalidDrawState);

    // SECURITY FIX (Issue #2): Block ALL sensitive financial parameter updates
    // via this legacy immediate path. They MUST use the timelock flow.
    require!(params.ticket_price.is_none(), LottoError::ConfigValidationFailed);
    require!(params.house_fee_bps.is_none(), LottoError::ConfigValidationFailed);
    require!(params.jackpot_cap.is_none(), LottoError::ConfigValidationFailed);

    // SECURITY: switchboard_queue changes must go through the timelock
    // flow (propose_config/execute_config). An instant change could point
    // the lottery to a malicious randomness oracle (H4 fix).
    require!(params.switchboard_queue.is_none(), LottoError::ConfigValidationFailed);
    require!(params.seed_amount.is_none(), LottoError::ConfigValidationFailed);
    require!(params.soft_cap.is_none(), LottoError::ConfigValidationFailed);
    require!(params.hard_cap.is_none(), LottoError::ConfigValidationFailed);
    require!(params.draw_interval.is_none(), LottoError::ConfigValidationFailed);
    require!(params.sale_target_tickets.is_none(), LottoError::ConfigValidationFailed);

    // Only switchboard_queue can be updated immediately (operational, non-financial)
    if let Some(switchboard_queue) = params.switchboard_queue {
        emit!(ConfigUpdated {
            parameter: "switchboard_queue".to_string(),
            old_value: 0, // Pubkey doesn't fit in u64, use 0 as placeholder
            new_value: 0,
            authority: ctx.accounts.authority.key(),
            timestamp: clock.unix_timestamp,
        });

        lottery_state.switchboard_queue = switchboard_queue;
        msg!("Updated switchboard_queue: {}", switchboard_queue);
    }

    msg!("Configuration updated (immediate mode — switchboard_queue only).");
    msg!("NOTE: All financial parameter changes require the propose_config → execute_config timelock flow.");

    Ok(())
}

// ============================================================================
// WITHDRAW HOUSE FEES INSTRUCTION
// ============================================================================

/// Accounts required for withdrawing house fees
#[derive(Accounts)]
pub struct WithdrawHouseFees<'info> {
    /// The authority withdrawing fees
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The main lottery state account
    #[account(
        mut,
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump,
        constraint = lottery_state.authority == authority.key() @ LottoError::Unauthorized
    )]
    pub lottery_state: Account<'info, LotteryState>,

    /// House fee USDC token account
    #[account(
        mut,
        seeds = [HOUSE_FEE_USDC_SEED],
        bump
    )]
    pub house_fee_usdc: Account<'info, TokenAccount>,

    /// Destination USDC token account for withdrawn fees
    /// M3 FIX: Constrain destination to be owned by the authority to prevent
    /// a compromised authority from draining house fees to an arbitrary wallet.
    #[account(
        mut,
        constraint = destination_usdc.owner == authority.key() @ LottoError::InvalidTokenAccount
    )]
    pub destination_usdc: Account<'info, TokenAccount>,

    /// Token program
    pub token_program: Program<'info, Token>,
}

// ============================================================================
// SOLVENCY CHECK INSTRUCTION (Issue 5 fix: on-chain balance reconciliation)
// ============================================================================

/// Accounts required for the solvency check
#[derive(Accounts)]
pub struct CheckSolvency<'info> {
    /// Anyone can call solvency check (permissionless for transparency)
    pub caller: Signer<'info>,

    /// The main lottery state account
    #[account(
        mut,
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump,
    )]
    pub lottery_state: Account<'info, LotteryState>,

    /// Prize pool USDC token account (holds jackpot + reserve funds)
    #[account(
        seeds = [PRIZE_POOL_USDC_SEED],
        bump
    )]
    pub prize_pool_usdc: Account<'info, TokenAccount>,

    /// Insurance pool USDC token account
    #[account(
        seeds = [INSURANCE_POOL_USDC_SEED],
        bump
    )]
    pub insurance_pool_usdc: Account<'info, TokenAccount>,
}

/// On-chain solvency verification instruction
///
/// This instruction allows ANYONE to verify that the on-chain token account
/// balances are consistent with the internal accounting state. If a mismatch
/// is detected that exceeds the allowed tolerance, the lottery is automatically
/// paused for safety.
///
/// This is a permissionless instruction — any user or monitor can call it
/// at any time to verify the lottery's financial integrity.
///
/// # Checks performed:
/// 1. Prize pool USDC balance >= jackpot_balance + reserve_balance
/// 2. Insurance pool USDC balance >= insurance_balance
/// 3. All accounting values are non-negative (sanity)
///
/// # Arguments
/// * `ctx` - The context containing required accounts
///
/// # Returns
/// * `Result<()>` - Success (even if mismatch found — the lottery is paused instead)
pub fn handler_check_solvency(ctx: Context<CheckSolvency>) -> Result<()> {
    let clock = Clock::get()?;
    let lottery_state = &mut ctx.accounts.lottery_state;

    let prize_pool_actual = ctx.accounts.prize_pool_usdc.amount;
    let insurance_actual = ctx.accounts.insurance_pool_usdc.amount;

    let expected_prize_pool = lottery_state
        .jackpot_balance
        .saturating_add(lottery_state.reserve_balance)
        .saturating_add(lottery_state.fixed_prize_balance);
    let expected_insurance = lottery_state.insurance_balance;

    // Allow a small tolerance for rounding dust (100 lamports = $0.0001)
    let tolerance: u64 = 100;

    let prize_pool_solvent = prize_pool_actual.saturating_add(tolerance) >= expected_prize_pool;
    let insurance_solvent = insurance_actual.saturating_add(tolerance) >= expected_insurance;
    let is_solvent = prize_pool_solvent && insurance_solvent;

    emit!(SolvencyCheckPerformed {
        draw_id: lottery_state.current_draw_id,
        prizes_required: expected_prize_pool,
        prize_pool_balance: prize_pool_actual,
        reserve_balance: lottery_state.reserve_balance,
        insurance_balance: insurance_actual,
        is_solvent,
        prizes_scaled: false,
        scale_factor_bps: 10000,
        timestamp: clock.unix_timestamp,
    });

    msg!("🔍 SOLVENCY CHECK:");
    msg!(
        "  Prize pool: actual={}, expected(jackpot+reserve)={}",
        prize_pool_actual,
        expected_prize_pool
    );
    msg!("  Insurance:  actual={}, expected={}", insurance_actual, expected_insurance);

    if !is_solvent {
        // Auto-pause the lottery on mismatch
        lottery_state.is_paused = true;

        msg!("❌ SOLVENCY CHECK FAILED — LOTTERY AUTO-PAUSED!");
        if !prize_pool_solvent {
            msg!(
                "  Prize pool deficit: {} USDC lamports",
                expected_prize_pool.saturating_sub(prize_pool_actual)
            );
        }
        if !insurance_solvent {
            msg!(
                "  Insurance deficit: {} USDC lamports",
                expected_insurance.saturating_sub(insurance_actual)
            );
        }
        msg!("  Admin must investigate and restore funds before unpausing.");

        emit!(EmergencyPause {
            authority: ctx.accounts.caller.key(),
            reason: format!(
                "Solvency check failed: prize_pool(actual={},expected={}), insurance(actual={},expected={})",
                prize_pool_actual, expected_prize_pool, insurance_actual, expected_insurance
            ),
            timestamp: clock.unix_timestamp,
        });
    } else {
        msg!("✅ SOLVENCY CHECK PASSED");
    }

    Ok(())
}

/// Withdraw accumulated house fees
///
/// This instruction allows the authority to withdraw house fees to a treasury account.
///
/// # Arguments
/// * `ctx` - The context containing required accounts
/// * `amount` - Amount to withdraw (must be <= balance)
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler_withdraw_house_fees(ctx: Context<WithdrawHouseFees>, amount: u64) -> Result<()> {
    let clock = Clock::get()?;

    // Validate amount
    require!(
        amount > 0 && amount <= ctx.accounts.house_fee_usdc.amount,
        LottoError::InsufficientFunds
    );

    // Transfer from house fee account to destination
    let seeds = &[LOTTERY_SEED, &[ctx.accounts.lottery_state.bump]];
    let signer_seeds = &[&seeds[..]];

    let cpi_accounts = Transfer {
        from: ctx.accounts.house_fee_usdc.to_account_info(),
        to: ctx.accounts.destination_usdc.to_account_info(),
        authority: ctx.accounts.lottery_state.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);

    token::transfer(cpi_ctx, amount)?;

    emit!(HouseFeesWithdrawn {
        amount,
        destination: ctx.accounts.destination_usdc.key(),
        authority: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });

    msg!("House fees withdrawn successfully!");
    msg!("  Amount: {} USDC lamports", amount);
    msg!("  Destination: {}", ctx.accounts.destination_usdc.key());
    msg!(
        "  Remaining balance: {} USDC lamports",
        ctx.accounts.house_fee_usdc.amount.saturating_sub(amount)
    );

    Ok(())
}

// ============================================================================
// TWO-STEP AUTHORITY TRANSFER - PROPOSE
// ============================================================================

/// Accounts required for proposing authority transfer
#[derive(Accounts)]
pub struct ProposeAuthority<'info> {
    /// The current authority
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The main lottery state account
    #[account(
        mut,
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump,
        constraint = lottery_state.authority == authority.key() @ LottoError::Unauthorized
    )]
    pub lottery_state: Account<'info, LotteryState>,
}

/// Propose authority transfer to a new address (Step 1 of 2)
///
/// This instruction proposes a new authority. The new authority must call
/// `accept_authority` to complete the transfer. This prevents accidentally
/// transferring control to an incorrect address.
///
/// # Arguments
/// * `ctx` - The context containing required accounts
/// * `new_authority` - The proposed new authority address
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler_propose_authority(
    ctx: Context<ProposeAuthority>,
    new_authority: Pubkey,
) -> Result<()> {
    let clock = Clock::get()?;
    let lottery_state = &mut ctx.accounts.lottery_state;

    // Cannot propose self
    require!(new_authority != lottery_state.authority, LottoError::InvalidAuthority);

    // Cannot propose zero address
    require!(new_authority != Pubkey::default(), LottoError::InvalidAuthority);

    lottery_state.pending_authority = Some(new_authority);

    emit!(ConfigUpdated {
        parameter: "pending_authority".to_string(),
        old_value: 0,
        new_value: 0, // Can't fit Pubkey in u64
        authority: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });

    msg!("Authority transfer proposed!");
    msg!("  Current authority: {}", lottery_state.authority);
    msg!("  Proposed authority: {}", new_authority);
    msg!("  The proposed authority must call accept_authority to complete the transfer.");

    Ok(())
}

// ============================================================================
// TWO-STEP AUTHORITY TRANSFER - ACCEPT
// ============================================================================

/// Accounts required for accepting authority transfer
#[derive(Accounts)]
pub struct AcceptAuthority<'info> {
    /// The new authority accepting the transfer
    #[account(mut)]
    pub new_authority: Signer<'info>,

    /// The main lottery state account
    #[account(
        mut,
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump,
        constraint = lottery_state.pending_authority == Some(new_authority.key()) @ LottoError::Unauthorized
    )]
    pub lottery_state: Account<'info, LotteryState>,
}

/// Accept authority transfer (Step 2 of 2)
///
/// This instruction completes the authority transfer. Only the address that
/// was proposed in `propose_authority` can call this.
///
/// # Arguments
/// * `ctx` - The context containing required accounts
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler_accept_authority(ctx: Context<AcceptAuthority>) -> Result<()> {
    let clock = Clock::get()?;
    let lottery_state = &mut ctx.accounts.lottery_state;

    let old_authority = lottery_state.authority;
    let new_authority = ctx.accounts.new_authority.key();

    lottery_state.authority = new_authority;
    lottery_state.pending_authority = None;

    emit!(ConfigUpdated {
        parameter: "authority".to_string(),
        old_value: 0, // Can't fit Pubkey in u64, logged separately
        new_value: 0,
        authority: new_authority,
        timestamp: clock.unix_timestamp,
    });

    msg!("Authority transfer completed!");
    msg!("  Old authority: {}", old_authority);
    msg!("  New authority: {}", new_authority);

    Ok(())
}

// ============================================================================
// CANCEL AUTHORITY TRANSFER
// ============================================================================

/// Accounts required for canceling authority transfer
#[derive(Accounts)]
pub struct CancelAuthorityTransfer<'info> {
    /// The current authority
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The main lottery state account
    #[account(
        mut,
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump,
        constraint = lottery_state.authority == authority.key() @ LottoError::Unauthorized,
        constraint = lottery_state.pending_authority.is_some() @ LottoError::InvalidDrawState
    )]
    pub lottery_state: Account<'info, LotteryState>,
}

/// Cancel a pending authority transfer
///
/// This instruction cancels a proposed authority transfer before it's accepted.
///
/// # Arguments
/// * `ctx` - The context containing required accounts
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler_cancel_authority_transfer(ctx: Context<CancelAuthorityTransfer>) -> Result<()> {
    let lottery_state = &mut ctx.accounts.lottery_state;

    let cancelled_authority = lottery_state.pending_authority;
    lottery_state.pending_authority = None;

    msg!("Authority transfer cancelled!");
    msg!("  Cancelled proposed authority: {:?}", cancelled_authority);

    Ok(())
}

// ============================================================================
// CANCEL DRAW (TIMEOUT RECOVERY)
// ============================================================================

/// Accounts required for canceling a stuck draw
#[derive(Accounts)]
pub struct CancelDraw<'info> {
    /// The authority canceling the draw
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The main lottery state account
    #[account(
        mut,
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump,
        constraint = lottery_state.authority == authority.key() @ LottoError::Unauthorized,
        constraint = lottery_state.is_draw_in_progress @ LottoError::DrawNotInProgress
    )]
    pub lottery_state: Account<'info, LotteryState>,
}

/// Cancel a stuck draw (timeout recovery)
///
/// This instruction allows the authority to cancel a draw that has timed out.
/// A draw is considered timed out if more than 1 hour has passed since the
/// randomness was committed.
///
/// This is a recovery mechanism for when:
/// - The Switchboard oracle fails to reveal randomness
/// - Network congestion prevents execute_draw from being called
/// - Any other issue causes the draw to get stuck
///
/// # Ticket Handling
/// When a draw is cancelled:
/// - If execute_draw was NOT called yet: The draw_id is NOT incremented,
///   so tickets remain valid for the rescheduled draw with the same draw_id.
/// - If execute_draw WAS called but finalize failed: This should use
///   force_finalize_draw instead, as a DrawResult account already exists.
///
/// # Security
/// - Only the authority can cancel draws
/// - The draw must have timed out (1 hour since commit)
/// - Tickets with matching draw_id remain valid
///
/// # Arguments
/// * `ctx` - The context containing required accounts
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler_cancel_draw(ctx: Context<CancelDraw>) -> Result<()> {
    let clock = Clock::get()?;
    let lottery_state = &mut ctx.accounts.lottery_state;

    // SECURITY: Cannot cancel a draw whose winning numbers are on-chain.
    // The is_awaiting_finalization flag is set by execute_draw.
    require!(!lottery_state.is_awaiting_finalization, LottoError::DrawNotInProgress);

    // Verify the draw has timed out
    require!(lottery_state.is_commit_timed_out(clock.unix_timestamp), LottoError::DrawNotReady);

    let draw_id = lottery_state.current_draw_id;
    let commit_timestamp = lottery_state.commit_timestamp;
    let tickets_affected = lottery_state.current_draw_tickets;

    // Reset draw state using the helper method
    // IMPORTANT: We do NOT increment draw_id here so tickets remain valid
    lottery_state.reset_draw_state(false);

    // current_draw_tickets preserved for the rescheduled draw
    // Do NOT increment current_draw_id - tickets are for this draw_id

    // Schedule next draw attempt (same draw_id, just new timing)
    lottery_state.next_draw_timestamp = clock.unix_timestamp.saturating_add(lottery_state.draw_interval);

    // Emit cancellation event
    emit!(DrawCancelled {
        draw_id,
        tickets_affected,
        timestamp: clock.unix_timestamp,
        reason: "Timeout - randomness reveal failed".to_string(),
    });

    msg!("Draw cancelled due to timeout!");
    msg!("  Draw ID: {} (unchanged - tickets remain valid)", draw_id);
    msg!("  Tickets in draw: {} (preserved)", tickets_affected);
    msg!("  Commit timestamp: {}", commit_timestamp);
    msg!("  Current timestamp: {}", clock.unix_timestamp);
    msg!("  Time elapsed: {} seconds", clock.unix_timestamp - commit_timestamp);
    msg!("  Next draw attempt scheduled for: {}", lottery_state.next_draw_timestamp);
    msg!("  ✓ Tickets for draw {} remain valid for the rescheduled draw.", draw_id);
    msg!("  ✓ No refunds needed - same draw will be attempted again.");

    Ok(())
}

// ============================================================================
// FORCE FINALIZE DRAW (EMERGENCY)
// ============================================================================

/// Accounts required for force finalizing a draw
#[derive(Accounts)]
pub struct ForceFinalizeDraw<'info> {
    /// The authority force finalizing
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The main lottery state account
    #[account(
        mut,
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump,
        constraint = lottery_state.authority == authority.key() @ LottoError::Unauthorized,
        constraint = lottery_state.is_draw_in_progress @ LottoError::DrawNotInProgress
    )]
    pub lottery_state: Account<'info, LotteryState>,

    /// SECURITY FIX (Audit Issue #3): The DrawResult account for this draw.
    /// If `execute_draw` was called before the emergency, a DrawResult already
    /// exists on-chain. We mark it as explicitly finalized with zero prizes so
    /// that `claim_prize` can find the account, see zero prize amounts, and
    /// handle the force-finalized draw gracefully (no prize, no error).
    /// Without this, tickets for force-finalized draws were permanently
    /// unclaimable because no DrawResult existed or it remained un-finalized.
    #[account(
        mut,
        seeds = [DRAW_SEED, &lottery_state.current_draw_id.to_le_bytes()],
        bump = draw_result.bump,
        constraint = draw_result.draw_id == lottery_state.current_draw_id @ LottoError::DrawIdMismatch
    )]
    pub draw_result: Account<'info, DrawResult>,
}

/// Force finalize a draw without winner distribution (emergency only)
///
/// This is an emergency instruction that allows the authority to force a draw
/// to complete without distributing prizes. This should ONLY be used when:
/// - A critical bug is discovered
/// - The draw result account couldn't be created
/// - Manual intervention is needed
///
/// After force finalization:
/// - The jackpot remains intact
/// - Tickets are NOT refunded (users must be compensated off-chain if needed)
/// - The draw ID increments
/// - A new draw cycle begins
///
/// # Warning
/// This is a last-resort emergency function. Improper use can result in
/// users losing their tickets without prize eligibility.
///
/// # Arguments
/// * `ctx` - The context containing required accounts
/// * `reason` - Reason for the force finalization (logged)
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler_force_finalize_draw(ctx: Context<ForceFinalizeDraw>, reason: String) -> Result<()> {
    let clock = Clock::get()?;

    // =========================================================================
    // SECURITY FIX (Audit Issue #3): Mark DrawResult as explicitly finalized
    // with zero prizes. This ensures claim_prize can find the DrawResult,
    // see that all prize amounts are 0, and handle the ticket gracefully
    // (returning "no prize" instead of failing with a missing-account error).
    // Previously, force_finalize_draw did NOT touch the DrawResult at all,
    // making tickets from force-finalized draws permanently unclaimable.
    // =========================================================================
    let draw_result = &mut ctx.accounts.draw_result;
    draw_result.match_6_prize_per_winner = 0;
    draw_result.match_5_prize_per_winner = 0;
    draw_result.match_4_prize_per_winner = 0;
    draw_result.match_3_prize_per_winner = 0;
    draw_result.match_2_prize_per_winner = 0;
    draw_result.is_explicitly_finalized = true;

    // Fix #3: Force-finalized draws have zero committed prizes and zero reclaimed.
    // This ensures reclaim_expired_prizes cannot extract anything from a
    // force-finalized draw (total_committed = 0 → reclaimable = 0).
    draw_result.total_committed = 0;
    draw_result.total_reclaimed = 0;

    let lottery_state = &mut ctx.accounts.lottery_state;

    let draw_id = lottery_state.current_draw_id;
    let tickets_affected = lottery_state.current_draw_tickets;

    // Reset draw state (including tickets, since we're finalizing)
    lottery_state.reset_draw_state(true);
    lottery_state.current_draw_id = lottery_state.current_draw_id.saturating_add(1);
    lottery_state.next_draw_timestamp = clock.unix_timestamp.saturating_add(lottery_state.draw_interval);

    // Update house fee based on new jackpot level
    lottery_state.house_fee_bps = lottery_state.get_current_house_fee_bps();

    // FIXED: Emit proper event type for force finalization (not EmergencyPause)
    emit!(DrawForceFinalized {
        draw_id,
        tickets_affected,
        authority: ctx.accounts.authority.key(),
        reason: reason.clone(),
        timestamp: clock.unix_timestamp,
    });

    msg!("⚠️  Draw FORCE FINALIZED by authority!");
    msg!("  Draw ID: {}", draw_id);
    msg!("  Tickets affected: {}", tickets_affected);
    msg!("  Reason: {}", reason);
    msg!("  New draw ID: {}", lottery_state.current_draw_id);
    msg!("  ✅ DrawResult marked as finalized with zero prizes.");
    msg!("  Tickets can still call claim_prize and will see 0 prize (no error).");
    msg!("  Next draw scheduled for: {}", lottery_state.next_draw_timestamp);

    Ok(())
}

// ============================================================================
// LEGACY TRANSFER AUTHORITY (Deprecated - kept for backwards compatibility)
// ============================================================================

/// Accounts required for transferring authority (deprecated)
#[derive(Accounts)]
pub struct TransferAuthority<'info> {
    /// The current authority
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The new authority
    /// CHECK: This is the new authority public key, no validation needed
    pub new_authority: AccountInfo<'info>,

    /// The main lottery state account
    #[account(
        mut,
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump,
        constraint = lottery_state.authority == authority.key() @ LottoError::Unauthorized
    )]
    pub lottery_state: Account<'info, LotteryState>,
}

/// Transfer authority to a new address (DEPRECATED)
///
/// This instruction is deprecated. Use `propose_authority` and `accept_authority`
/// for a safer two-step transfer process.
///
/// This legacy function now only sets the pending_authority. The new authority
/// must still call `accept_authority` to complete the transfer.
///
/// # Arguments
/// * `ctx` - The context containing required accounts
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler_transfer_authority(ctx: Context<TransferAuthority>) -> Result<()> {
    let clock = Clock::get()?;
    let lottery_state = &mut ctx.accounts.lottery_state;
    let new_authority = ctx.accounts.new_authority.key();

    // Cannot propose self
    require!(new_authority != lottery_state.authority, LottoError::InvalidAuthority);

    // Cannot propose zero address
    require!(new_authority != Pubkey::default(), LottoError::InvalidAuthority);

    // Set pending authority (requires accept_authority to complete)
    lottery_state.pending_authority = Some(new_authority);

    emit!(ConfigUpdated {
        parameter: "pending_authority_legacy".to_string(),
        old_value: 0,
        new_value: 0,
        authority: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });

    msg!("Authority transfer initiated (legacy method)!");
    msg!("  Current authority: {}", lottery_state.authority);
    msg!("  Pending authority: {}", new_authority);
    msg!("  IMPORTANT: The new authority must call accept_authority to complete transfer.");

    Ok(())
}

// ============================================================================
// EMERGENCY FUND TRANSFER INSTRUCTION
// ============================================================================

/// Source of funds for emergency transfer
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub enum FundSource {
    /// Transfer from reserve pool (accounting adjustment only - reserve funds are in prize pool)
    Reserve,
    /// Transfer from insurance pool (actual USDC transfer from insurance account)
    Insurance,
    /// Transfer from prize pool directly
    PrizePool,
}

/// Accounts required for emergency fund transfer
#[derive(Accounts)]
pub struct EmergencyFundTransfer<'info> {
    /// The authority initiating the transfer
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The main lottery state account
    #[account(
        mut,
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump,
        constraint = lottery_state.authority == authority.key() @ LottoError::Unauthorized,
        constraint = lottery_state.is_paused @ LottoError::InvalidDrawState
    )]
    pub lottery_state: Account<'info, LotteryState>,

    /// Insurance pool USDC token account (source for Insurance transfers)
    #[account(
        mut,
        seeds = [INSURANCE_POOL_USDC_SEED],
        bump
    )]
    pub insurance_pool_usdc: Account<'info, TokenAccount>,

    /// Prize pool USDC token account (source for PrizePool transfers, destination for Insurance)
    #[account(
        mut,
        seeds = [PRIZE_POOL_USDC_SEED],
        bump
    )]
    pub prize_pool_usdc: Account<'info, TokenAccount>,

    /// External destination USDC token account (for emergency withdrawals)
    #[account(mut)]
    pub destination_usdc: Account<'info, TokenAccount>,

    /// Token program
    pub token_program: Program<'info, Token>,
}

/// Emergency transfer funds between pools or to external destination
///
/// This instruction allows the authority to transfer funds during emergencies:
/// - Reserve: Accounting adjustment only (reserve funds are tracked in lottery_state
///   but the actual USDC is in the prize pool). Moves funds from reserve accounting
///   to jackpot accounting within the prize pool.
/// - Insurance: Transfers actual USDC from insurance pool to prize pool.
/// - PrizePool: Transfers USDC from prize pool to external destination (emergency withdrawal).
///
/// # Security Requirements:
/// - Only callable by authority
/// - Lottery must be paused
/// - Requires multi-sig in production (not enforced in code)
/// - Should have timelock in production (not enforced in code)
/// - Emits detailed audit event
///
/// # Arguments
/// * `ctx` - The context containing required accounts
/// * `source` - Source of funds (Reserve, Insurance, or PrizePool)
/// * `amount` - Amount to transfer in USDC lamports
/// * `reason` - Reason for emergency transfer (logged)
///
/// # Returns
/// * `Result<()>` - Success or error
/// Maximum amount that can be transferred from prize pool in a single emergency call.
/// Set to 10% of hard cap as a safety limit. Larger transfers require multiple calls
/// with separate authorization, giving monitors time to detect anomalous activity.
pub const EMERGENCY_TRANSFER_MAX_BPS: u64 = 1000; // 10% of hard cap

pub fn handler_emergency_fund_transfer(
    ctx: Context<EmergencyFundTransfer>,
    source: FundSource,
    amount: u64,
    reason: String,
) -> Result<()> {
    let clock = Clock::get()?;

    // Validate lottery is paused for emergency operations
    require!(ctx.accounts.lottery_state.is_paused, LottoError::InvalidDrawState);

    // Validate amount
    require!(amount > 0, LottoError::InsufficientFunds);

    // SECURITY FIX (Issue #5): Cap the maximum per-call transfer amount for
    // PrizePool source to limit damage from a compromised authority.
    // Reserve and Insurance transfers stay within the protocol (pool-to-pool),
    // but PrizePool transfers go to an external destination and need strict limits.
    if matches!(source, FundSource::PrizePool) {
        let max_transfer = (ctx.accounts.lottery_state.hard_cap as u128
            * EMERGENCY_TRANSFER_MAX_BPS as u128
            / BPS_DENOMINATOR as u128) as u64;
        require!(amount <= max_transfer, LottoError::InvalidAmount);
        msg!(
            "  PrizePool emergency transfer cap: {} USDC lamports (10% of hard cap)",
            max_transfer
        );

        // SECURITY FIX (Issue #5 continued): Enforce aggregate daily rolling window cap.
        // Even though each individual call is capped at 10% of hard cap, a compromised
        // authority could repeatedly call this to drain the pool. This rolling window
        // limits the total amount that can be transferred within a 24-hour period.
        //
        // NOTE: We capture hard_cap before the mutable borrow to avoid conflicting borrows.
        let hard_cap_snapshot = ctx.accounts.lottery_state.hard_cap;
        let window_duration = EMERGENCY_TRANSFER_WINDOW_DURATION;
        let daily_max = (hard_cap_snapshot as u128 * EMERGENCY_TRANSFER_DAILY_CAP_BPS as u128
            / BPS_DENOMINATOR as u128) as u64;

        // Scope the mutable borrow so it's dropped before the next one below.
        {
            let lottery_state = &mut ctx.accounts.lottery_state;
            let window_start = lottery_state.emergency_transfer_window_start;

            // Check if we're still within the current window
            if window_start > 0
                && clock.unix_timestamp < window_start.saturating_add(window_duration)
            {
                // Same window — check aggregate
                let new_total = lottery_state
                    .emergency_transfer_total
                    .checked_add(amount)
                    .ok_or(LottoError::Overflow)?;
                require!(new_total <= daily_max, LottoError::InvalidAmount);
                lottery_state.emergency_transfer_total = new_total;
            } else {
                // New window — reset and start fresh
                require!(amount <= daily_max, LottoError::InvalidAmount);
                lottery_state.emergency_transfer_window_start = clock.unix_timestamp;
                lottery_state.emergency_transfer_total = amount;
            }

            msg!(
                "  Aggregate daily cap: {} / {} USDC lamports (20% of hard cap per 24h)",
                lottery_state.emergency_transfer_total,
                daily_max
            );
        }
    }

    // SECURITY FIX (Issue #5): For PrizePool external transfers, restrict destination
    // to the house_fee_usdc PDA (the protocol treasury). This prevents rug-pull vectors
    // where funds are sent to arbitrary external accounts.
    if matches!(source, FundSource::PrizePool) {
        let (expected_house_fee_pda, _) =
            Pubkey::find_program_address(&[HOUSE_FEE_USDC_SEED], &crate::ID);
        require!(
            ctx.accounts.destination_usdc.key() == expected_house_fee_pda,
            LottoError::InvalidTokenAccount
        );
        msg!("  Destination verified: house fee treasury PDA");
    }

    let lottery_state = &mut ctx.accounts.lottery_state;
    let seeds = &[LOTTERY_SEED, &[lottery_state.bump]];
    let signer_seeds = &[&seeds[..]];

    let (balance_before, balance_after, transfer_description) = match source {
        FundSource::Reserve => {
            // Reserve is just accounting - the USDC is already in the prize pool
            // This moves funds from reserve accounting to jackpot accounting
            let before = lottery_state.reserve_balance;
            require!(amount <= lottery_state.reserve_balance, LottoError::InsufficientFunds);

            // Move from reserve accounting to jackpot accounting
            lottery_state.reserve_balance = lottery_state.reserve_balance.saturating_sub(amount);
            lottery_state.jackpot_balance =
                lottery_state.jackpot_balance.checked_add(amount).ok_or(LottoError::Overflow)?;

            let after = lottery_state.reserve_balance;
            (before, after, "reserve_to_jackpot_accounting".to_string())
        }
        FundSource::Insurance => {
            // Insurance has its own token account - transfer actual USDC to prize pool
            let before = lottery_state.insurance_balance;
            require!(
                amount <= ctx.accounts.insurance_pool_usdc.amount,
                LottoError::InsufficientFunds
            );
            require!(amount <= lottery_state.insurance_balance, LottoError::InsufficientFunds);

            // Transfer USDC from insurance to prize pool
            let cpi_accounts = Transfer {
                from: ctx.accounts.insurance_pool_usdc.to_account_info(),
                to: ctx.accounts.prize_pool_usdc.to_account_info(),
                authority: lottery_state.to_account_info(),
            };
            let cpi_program = ctx.accounts.token_program.to_account_info();
            let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
            token::transfer(cpi_ctx, amount)?;

            // Update accounting
            lottery_state.insurance_balance =
                lottery_state.insurance_balance.saturating_sub(amount);
            // Add to jackpot to make it available for prizes
            lottery_state.jackpot_balance =
                lottery_state.jackpot_balance.checked_add(amount).ok_or(LottoError::Overflow)?;

            let after = lottery_state.insurance_balance;
            (before, after, "insurance_to_prize_pool".to_string())
        }
        FundSource::PrizePool => {
            // Emergency withdrawal from prize pool to treasury destination
            // SECURITY FIX (Issue #5): Destination is already validated above to be
            // the house_fee_usdc PDA. Amount is capped to 10% of hard_cap per call.
            let before = ctx.accounts.prize_pool_usdc.amount;
            require!(amount <= ctx.accounts.prize_pool_usdc.amount, LottoError::InsufficientFunds);

            // Transfer USDC from prize pool to treasury destination
            let cpi_accounts = Transfer {
                from: ctx.accounts.prize_pool_usdc.to_account_info(),
                to: ctx.accounts.destination_usdc.to_account_info(),
                authority: lottery_state.to_account_info(),
            };
            let cpi_program = ctx.accounts.token_program.to_account_info();
            let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
            token::transfer(cpi_ctx, amount)?;

            // Reduce jackpot balance (or reserve if jackpot insufficient)
            if lottery_state.jackpot_balance >= amount {
                lottery_state.jackpot_balance =
                    lottery_state.jackpot_balance.saturating_sub(amount);
            } else {
                let from_jackpot = lottery_state.jackpot_balance;
                let from_reserve = amount.saturating_sub(from_jackpot);
                lottery_state.jackpot_balance = 0;
                lottery_state.reserve_balance =
                    lottery_state.reserve_balance.saturating_sub(from_reserve);
            }

            let after = ctx.accounts.prize_pool_usdc.amount.saturating_sub(amount);
            (before, after, "prize_pool_to_treasury".to_string())
        }
    };

    // Emit dedicated emergency fund transfer event for comprehensive audit trail
    emit!(EmergencyFundTransferred {
        draw_id: lottery_state.current_draw_id,
        source: format!("{:?}", source),
        amount,
        destination: transfer_description.clone(),
        reason: reason.clone(),
        authority: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });

    // Also emit insurance pool funded event for backward compatibility (when applicable)
    if matches!(source, FundSource::Insurance) {
        emit!(InsurancePoolFunded {
            amount,
            new_balance: balance_after,
            source: format!("emergency_transfer_{:?}", source),
            timestamp: clock.unix_timestamp,
        });
    }

    msg!("⚠️  EMERGENCY FUND TRANSFER executed!");
    msg!("  Authority: {}", ctx.accounts.authority.key());
    msg!("  Draw ID: {}", lottery_state.current_draw_id);
    msg!("  Source: {:?}", source);
    msg!("  Transfer type: {}", transfer_description);
    msg!("  Amount: {} USDC lamports", amount);
    msg!("  Reason: {}", reason);
    msg!("  Balance before: {} USDC lamports", balance_before);
    msg!("  Balance after: {} USDC lamports", balance_after);
    msg!("");
    msg!("  📊 Current Fund Status:");
    msg!("    Jackpot balance: {} USDC lamports", lottery_state.jackpot_balance);
    msg!("    Reserve balance: {} USDC lamports", lottery_state.reserve_balance);
    msg!("    Insurance balance: {} USDC lamports", lottery_state.insurance_balance);
    msg!(
        "    Safety buffer (reserve + insurance): {} USDC lamports",
        lottery_state.get_safety_buffer()
    );

    Ok(())
}

// ============================================================================
// RECLAIM EXPIRED PRIZES (Audit Issue #5)
// ============================================================================

/// Parameters for reclaiming expired prizes
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ReclaimExpiredPrizesParams {
    /// The draw ID whose expired prizes should be reclaimed
    pub draw_id: u64,
    /// Amount to reclaim (must be <= committed - paid for this draw).
    /// The authority computes this off-chain by checking unclaimed tickets
    /// whose claim window has expired.
    pub amount: u64,
}

/// Accounts required for reclaiming expired prizes
#[derive(Accounts)]
#[instruction(params: ReclaimExpiredPrizesParams)]
pub struct ReclaimExpiredPrizes<'info> {
    /// Lottery authority
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Lottery state
    #[account(
        mut,
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump,
        constraint = lottery_state.authority == authority.key() @ LottoError::Unauthorized
    )]
    pub lottery_state: Account<'info, LotteryState>,

    /// The DrawResult for the expired draw.
    /// Used to verify the draw exists, is finalized, and its claim window
    /// has expired based on TICKET_CLAIM_EXPIRATION.
    /// Fix #3: Made mutable so we can increment `total_reclaimed` to enforce
    /// per-draw reclaim bounds and prevent cross-draw theft / double-reclaiming.
    #[account(
        mut,
        seeds = [DRAW_SEED, &params.draw_id.to_le_bytes()],
        bump = draw_result.bump,
        constraint = draw_result.draw_id == params.draw_id @ LottoError::DrawIdMismatch
    )]
    pub draw_result: Account<'info, DrawResult>,
}

/// Reclaim expired/unclaimed prize funds from a past draw back into reserve.
///
/// Over time, `total_prizes_committed` accumulates amounts for draws whose
/// claim window has expired but whose unclaimed portions are never recovered.
/// This creates "zombie" committed funds that make solvency metrics inaccurate.
///
/// This instruction allows the authority to sweep those expired commitments
/// back into `reserve_balance` and decrement `total_prizes_committed`.
///
/// # Security
/// - Only the authority can call this
/// - The draw must be finalized (`is_explicitly_finalized` or has prize values)
/// - The claim window must have fully expired (TICKET_CLAIM_EXPIRATION elapsed)
/// - The reclaim amount must not exceed `total_prizes_committed`
/// - Events are emitted for full audit trail
///
/// # Arguments
/// * `ctx`    - Context with authority, lottery_state, and draw_result
/// * `params` - Draw ID and amount to reclaim
///
/// # Returns
/// * `Result<()>`
pub fn handler_reclaim_expired_prizes(
    ctx: Context<ReclaimExpiredPrizes>,
    params: ReclaimExpiredPrizesParams,
) -> Result<()> {
    let clock = Clock::get()?;
    let draw_result = &ctx.accounts.draw_result;

    // 1. Verify the draw has been finalized
    require!(draw_result.is_finalized(), LottoError::InvalidDrawState);

    // 2. Verify the claim window has fully expired WITH safety buffer.
    // Tickets can be claimed up to TICKET_CLAIM_EXPIRATION seconds after
    // draw execution. After that, an additional RECLAIM_BUFFER must elapse
    // before the authority can sweep unclaimed funds. This prevents race
    // conditions where a legitimate claim submitted just before the deadline
    // could fail because the authority reclaimed first.
    require!(TICKET_CLAIM_EXPIRATION > 0, LottoError::InvalidConfig);
    let claim_deadline = draw_result
        .timestamp
        .checked_add(TICKET_CLAIM_EXPIRATION)
        .ok_or(LottoError::ArithmeticError)?;
    let reclaim_eligible_at =
        claim_deadline.checked_add(RECLAIM_BUFFER).ok_or(LottoError::ArithmeticError)?;
    require!(clock.unix_timestamp > reclaim_eligible_at, LottoError::ClaimWindowNotExpired);

    // 3. Validate amount
    require!(params.amount > 0, LottoError::InvalidAmount);

    // =========================================================================
    // Fix #3: Per-draw reclaim safety — enforce per-draw bounds BEFORE the
    // global check. This prevents cross-draw theft where the authority could
    // reclaim more than what was committed for THIS specific draw by exploiting
    // the global total_prizes_committed across multiple draws.
    // =========================================================================

    // 4a. Per-draw bound: reclaim cannot exceed what remains for this draw
    let reclaimable = draw_result.get_reclaimable_amount();
    require!(params.amount <= reclaimable, LottoError::ReclaimAmountExceedsCommitted);

    // 4b. Defense-in-depth: also enforce the global bound
    let lottery_state = &mut ctx.accounts.lottery_state;
    require!(
        params.amount <= lottery_state.total_prizes_committed,
        LottoError::ReclaimAmountExceedsCommitted
    );

    // 5. Increment per-draw total_reclaimed (must happen before global update)
    let draw_result = &mut ctx.accounts.draw_result;
    draw_result.total_reclaimed =
        draw_result.total_reclaimed.checked_add(params.amount).ok_or(LottoError::Overflow)?;

    msg!(
        "  Per-draw accounting: committed={}, reclaimed={} (reclaimable_before={})",
        draw_result.total_committed,
        draw_result.total_reclaimed,
        reclaimable
    );

    // 6. Decrement global total_prizes_committed and credit reserve_balance
    lottery_state.total_prizes_committed =
        lottery_state.total_prizes_committed.saturating_sub(params.amount);
    lottery_state.reserve_balance =
        lottery_state.reserve_balance.checked_add(params.amount).ok_or(LottoError::Overflow)?;

    // 7. Emit audit event
    emit!(ExpiredPrizesReclaimed {
        draw_id: params.draw_id,
        amount_reclaimed: params.amount,
        new_reserve_balance: lottery_state.reserve_balance,
        new_total_prizes_committed: lottery_state.total_prizes_committed,
        authority: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });

    msg!("✅ Expired prizes reclaimed successfully!");
    msg!("  Draw ID: {}", params.draw_id);
    msg!("  Draw timestamp: {}", draw_result.timestamp);
    msg!("  Claim deadline was: {}", claim_deadline);
    msg!("  Time since expiry: {} seconds", clock.unix_timestamp.saturating_sub(claim_deadline));
    msg!("  Amount reclaimed: {} USDC lamports", params.amount);
    msg!("  New reserve balance: {} USDC lamports", lottery_state.reserve_balance);
    msg!("  New total_prizes_committed: {} USDC lamports", lottery_state.total_prizes_committed);

    Ok(())
}
// ============================================================================
// CHALLENGE DRAW INSTRUCTION (M1 fix: permissionless dispute mechanism)
// ============================================================================
// Allows ANYONE to challenge the winner counts submitted in finalize_draw.
// If a challenge is raised, the draw is paused for admin review and the
// challenger's alternative winner counts are recorded on-chain. This creates
// accountability: a malicious operator who fabricates counts can be caught
// and the draw can be corrected before prizes are claimed.
//
// The challenger does NOT need to stake funds — the mere existence of an
// on-chain challenge with alternative counts is sufficient to alert the
// community and trigger manual review.

/// Accounts required for challenging a draw finalization
#[derive(Accounts)]
pub struct ChallengeDraw<'info> {
    /// Anyone can challenge (permissionless)
    #[account(mut)]
    pub challenger: Signer<'info>,

    /// The main lottery state account
    #[account(
        mut,
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump,
        constraint = lottery_state.is_awaiting_finalization @ LottoError::DrawNotInProgress
    )]
    pub lottery_state: Account<'info, LotteryState>,

    /// The draw result being challenged
    #[account(
        mut,
        seeds = [DRAW_SEED, &lottery_state.current_draw_id.to_le_bytes()],
        bump = draw_result.bump,
        constraint = !draw_result.is_explicitly_finalized @ LottoError::DrawAlreadyCompleted
    )]
    pub draw_result: Account<'info, DrawResult>,
}

/// Challenge a draw finalization with alternative winner counts.
///
/// This is the primary defense against operator-fabricated winner counts (M1).
/// Anyone who detects incorrect counts can call this instruction to:
/// 1. Pause the lottery (prevents prize claims on fabricated counts)
/// 2. Record their alternative counts on-chain for audit
/// 3. Trigger admin review
///
/// After a challenge, the lottery remains paused until the authority:
/// - Accepts the challenger's counts (calls finalize_draw with corrected data)
/// - Or overrides via force_finalize_draw with a public explanation
///
/// # Arguments
/// * `ctx` - ChallengeDraw accounts context
/// * `alternative_winner_counts` - The challenger's corrected winner counts
/// * `evidence_hash` - SHA256 hash of supporting evidence (off-chain data)
pub fn handler_challenge_draw(
    ctx: Context<ChallengeDraw>,
    alternative_winner_counts: WinnerCounts,
    evidence_hash: [u8; 32],
) -> Result<()> {
    let clock = Clock::get()?;
    let lottery_state = &mut ctx.accounts.lottery_state;

    // Pause the lottery to prevent prize claims on potentially fabricated counts
    lottery_state.is_paused = true;

    // Emit emergency pause event with challenge details
    emit!(EmergencyPause {
        authority: ctx.accounts.challenger.key(),
        reason: format!(
            "DRAW_CHALLENGE: draw_id={}, alt_match6={}, alt_match5={}, alt_match4={}, alt_match3={}, alt_match2={}, evidence_hash={:?}",
            lottery_state.current_draw_id,
            alternative_winner_counts.match_6,
            alternative_winner_counts.match_5,
            alternative_winner_counts.match_4,
            alternative_winner_counts.match_3,
            alternative_winner_counts.match_2,
            evidence_hash,
        ),
        timestamp: clock.unix_timestamp,
    });

    msg!("DRAW CHALLENGED!");
    msg!("  Draw ID: {}", lottery_state.current_draw_id);
    msg!("  Challenger: {}", ctx.accounts.challenger.key());
    msg!(
        "  Alternative counts: 6={}, 5={}, 4={}, 3={}, 2={}",
        alternative_winner_counts.match_6,
        alternative_winner_counts.match_5,
        alternative_winner_counts.match_4,
        alternative_winner_counts.match_3,
        alternative_winner_counts.match_2,
    );
    msg!("  Lottery PAUSED for admin review.");

    Ok(())
}

// ============================================================================
// LP CONFIG INSTRUCTION
// ============================================================================

/// Accounts required for setting LP pool configuration
#[derive(Accounts)]
pub struct SetLpConfig<'info> {
    /// The authority
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The lottery state (for authority check)
    #[account(
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump,
        constraint = lottery_state.authority == authority.key() @ LottoError::Unauthorized
    )]
    pub lottery_state: Account<'info, LotteryState>,

    /// The LP pool state account
    #[account(
        mut,
        seeds = [LP_POOL_SEED],
        bump = lp_pool.bump,
    )]
    pub lp_pool: Account<'info, LpPool>,
}

/// Propose a new LP reward bps (starts timelock).
///
/// The change will only take effect after CONFIG_TIMELOCK_DELAY seconds.
/// During the delay, anyone can observe the pending change on-chain.
/// To apply the change, call `execute_lp_config` after the timelock expires.
pub fn handler_set_lp_config(ctx: Context<SetLpConfig>, lp_reward_bps: u16) -> Result<()> {
    let clock = Clock::get()?;

    require!(lp_reward_bps <= MAX_LP_REWARD_BPS, LottoError::LpInvalidRewardBps);
    require!(ctx.accounts.lp_pool.lp_config_timelock_end == 0, LottoError::InvalidDrawState);

    let old_bps = ctx.accounts.lp_pool.lp_reward_bps;
    ctx.accounts.lp_pool.pending_lp_reward_bps = lp_reward_bps;
    let timelock_end =
        clock.unix_timestamp.checked_add(CONFIG_TIMELOCK_DELAY).ok_or(LottoError::Overflow)?;
    ctx.accounts.lp_pool.lp_config_timelock_end = timelock_end;

    emit!(LpRewardBpsProposed {
        old_bps,
        proposed_bps: lp_reward_bps,
        executable_at: timelock_end,
        authority: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });

    msg!(
        "LP reward bps PROPOSED: {} -> {} (executable after {})",
        old_bps,
        lp_reward_bps,
        ctx.accounts.lp_pool.lp_config_timelock_end
    );
    Ok(())
}

/// Execute a pending LP reward bps change (after timelock).
pub fn handler_execute_lp_config(ctx: Context<SetLpConfig>) -> Result<()> {
    let clock = Clock::get()?;

    require!(ctx.accounts.lp_pool.lp_config_timelock_end != 0, LottoError::InvalidDrawState);
    require!(
        clock.unix_timestamp >= ctx.accounts.lp_pool.lp_config_timelock_end,
        LottoError::InvalidTimestamp
    );

    let new_bps = ctx.accounts.lp_pool.pending_lp_reward_bps;
    require!(new_bps <= MAX_LP_REWARD_BPS, LottoError::LpInvalidRewardBps);

    let old_bps = ctx.accounts.lp_pool.lp_reward_bps;
    ctx.accounts.lp_pool.lp_reward_bps = new_bps;
    ctx.accounts.lp_pool.pending_lp_reward_bps = 0;
    ctx.accounts.lp_pool.lp_config_timelock_end = 0;

    emit!(LpRewardBpsUpdated {
        old_bps,
        new_bps,
        authority: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });

    msg!("LP reward bps EXECUTED: {} -> {}", old_bps, new_bps);
    Ok(())
}

/// Cancel a pending LP reward bps change.
pub fn handler_cancel_lp_config(ctx: Context<SetLpConfig>) -> Result<()> {
    require!(ctx.accounts.lp_pool.lp_config_timelock_end != 0, LottoError::InvalidDrawState);

    ctx.accounts.lp_pool.pending_lp_reward_bps = 0;
    ctx.accounts.lp_pool.lp_config_timelock_end = 0;

    msg!("LP reward bps proposal CANCELLED");
    Ok(())
}

// ============================================================================
// LP POOL PAUSE / UNPAUSE
// ============================================================================

/// Pause LP pool operations (emergency stop for deposits)
pub fn handler_pause_lp_pool(ctx: Context<SetLpConfig>) -> Result<()> {
    let clock = Clock::get()?;
    ctx.accounts.lp_pool.is_paused = true;

    emit!(LpPoolPaused {
        authority: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });

    msg!("LP pool PAUSED. Deposits are now blocked.");
    Ok(())
}

/// Unpause LP pool operations
pub fn handler_unpause_lp_pool(ctx: Context<SetLpConfig>) -> Result<()> {
    let clock = Clock::get()?;
    ctx.accounts.lp_pool.is_paused = false;

    emit!(LpPoolUnpaused {
        authority: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });

    msg!("LP pool UNPAUSED. Deposits are now accepted.");
    Ok(())
}

// ============================================================================
// LP POSITION CLOSE
// ============================================================================

/// Accounts required for closing an LP position
#[derive(Accounts)]
pub struct CloseLpPosition<'info> {
    /// The LP closing their position (must be the last LP)
    #[account(mut)]
    pub owner: Signer<'info>,

    /// The lottery state (for cycle gating)
    #[account(
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump,
        constraint = !lottery_state.is_draw_in_progress @ LottoError::DrawInProgress,
        constraint = !lottery_state.is_awaiting_finalization @ LottoError::DrawInProgress,
    )]
    pub lottery_state: Account<'info, LotteryState>,

    /// The global LP pool state account
    #[account(
        mut,
        seeds = [LP_POOL_SEED],
        bump = lp_pool.bump,
    )]
    pub lp_pool: Account<'info, LpPool>,

    /// The LP's position account (will be closed)
    #[account(
        mut,
        close = owner,
        seeds = [LP_POSITION_SEED, owner.key().as_ref()],
        bump = lp_position.bump,
        constraint = lp_position.owner == owner.key() @ LottoError::NotTicketOwner,
        constraint = lp_position.shares == lp_pool.total_shares @ LottoError::LpCannotDrainPool,
    )]
    pub lp_position: Account<'info, LpPosition>,

    /// LP pool USDC token account
    #[account(
        mut,
        seeds = [LP_POOL_USDC_SEED],
        bump
    )]
    pub lp_pool_usdc: Account<'info, TokenAccount>,

    /// Destination USDC token account for remaining funds
    #[account(
        mut,
        constraint = destination_usdc.owner == owner.key() @ LottoError::InvalidTokenAccount
    )]
    pub destination_usdc: Account<'info, TokenAccount>,

    /// Token program
    pub token_program: Program<'info, Token>,
}

/// Close LP position — only allowed when the caller is the LAST remaining LP.
/// Transfers all remaining deposits and accumulated rewards to the owner,
/// then closes the position account (reclaiming rent).
pub fn handler_close_lp_position(ctx: Context<CloseLpPosition>) -> Result<()> {
    let clock = Clock::get()?;
    let lp_pool = &mut ctx.accounts.lp_pool;
    let lp_position = &ctx.accounts.lp_position;

    // Calculate pending rewards and total to transfer
    let pending = lp_position.pending_rewards(lp_pool.reward_per_share).unwrap_or(0);
    let total_to_transfer = lp_position.deposit_amount.saturating_add(pending);

    require!(total_to_transfer > 0, LottoError::LpInsufficientLiquidity);
    require!(
        ctx.accounts.lp_pool_usdc.amount >= total_to_transfer,
        LottoError::LpInsufficientLiquidity
    );

    // Deduct rewards and deposits from accounting BEFORE transfer
    if pending > 0 {
        lp_pool.deduct_rewards(pending)?;
    }
    if lp_position.deposit_amount > 0 {
        lp_pool.deduct_seed(lp_position.deposit_amount)?;
    }

    // Transfer all remaining funds to owner
    let lp_bump = lp_pool.bump;
    let seeds: &[&[u8]] = &[LP_POOL_SEED, &[lp_bump]];
    let signer_seeds = &[&seeds[..]];

    let cpi_accounts = Transfer {
        from: ctx.accounts.lp_pool_usdc.to_account_info(),
        to: ctx.accounts.destination_usdc.to_account_info(),
        authority: lp_pool.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
    token::transfer(cpi_ctx, total_to_transfer)?;

    // Full reset of pool state (position account closed by Anchor's `close = owner`)
    lp_pool.total_shares = 0;
    lp_pool.total_deposits = 0;
    lp_pool.accumulated_rewards = 0;
    lp_pool.reward_per_share = 0;
    lp_pool.lp_config_timelock_end = 0;
    lp_pool.pending_lp_reward_bps = 0;

    emit!(LpRewardsClaimed {
        claimer: ctx.accounts.owner.key(),
        amount: pending,
        total_claimed_by_user: lp_position.total_rewards_claimed.saturating_add(pending),
        timestamp: clock.unix_timestamp,
    });

    msg!("LP position closed. Transferred {} USDC lamports to owner.", total_to_transfer);
    msg!("LP pool fully reset and can be safely re-initialized.");

    Ok(())
}
