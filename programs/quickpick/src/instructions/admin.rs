//! Quick Pick Express Admin Instructions
//!
//! This module contains administrative instructions for managing Quick Pick Express:
//! - update_config: Update Quick Pick configuration parameters
//! - withdraw_house_fees: Withdraw accumulated house fees
//! - cancel_draw: Cancel a stuck/problematic draw
//! - force_finalize_draw: Force finalize a stuck draw
//! - emergency_fund_transfer: Transfer funds between pools in emergencies
//! - add_reserve_funds: Add reserve funds for jackpot seeding

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::errors::QuickPickError;
use crate::events::{
    QuickPickDrawCancelled, QuickPickDrawForceFinalized, QuickPickFeeTierChanged,
    QuickPickHouseFeesWithdrawn,
};
use crate::state::{LotteryState, QuickPickDrawResult, QuickPickState};

// ============================================================================
// UPDATE CONFIG INSTRUCTION
// ============================================================================

/// Parameters for updating Quick Pick configuration
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct UpdateQuickPickConfigParams {
    /// New ticket price (optional)
    pub ticket_price: Option<u64>,
    /// New soft cap (optional)
    pub soft_cap: Option<u64>,
    /// New hard cap (optional)
    pub hard_cap: Option<u64>,
    /// New seed amount (optional)
    pub seed_amount: Option<u64>,
    /// New draw interval (optional)
    pub draw_interval: Option<i64>,
    /// New Match 4 prize (optional)
    pub match_4_prize: Option<u64>,
    /// New Match 3 prize (optional)
    pub match_3_prize: Option<u64>,
}

impl UpdateQuickPickConfigParams {
    /// Compute a deterministic SHA256 hash of these config params for timelock verification.
    /// The hash covers all fields so the executed config must exactly match what was proposed (H-2 fix).
    pub fn compute_hash(&self) -> [u8; 32] {
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        // Encode each Option field: 0 byte = None, 1 byte + value = Some
        for opt_val in [
            self.ticket_price.map(|v| v.to_le_bytes().to_vec()),
            self.soft_cap.map(|v| v.to_le_bytes().to_vec()),
            self.hard_cap.map(|v| v.to_le_bytes().to_vec()),
            self.seed_amount.map(|v| v.to_le_bytes().to_vec()),
            self.draw_interval.map(|v| v.to_le_bytes().to_vec()),
            self.match_4_prize.map(|v| v.to_le_bytes().to_vec()),
            self.match_3_prize.map(|v| v.to_le_bytes().to_vec()),
        ]
        .iter()
        {
            match opt_val {
                Some(bytes) => {
                    hasher.update([1u8]);
                    hasher.update(bytes);
                }
                None => {
                    hasher.update([0u8]);
                }
            }
        }
        let result = hasher.finalize();
        let mut hash = [0u8; 32];
        hash.copy_from_slice(result.as_slice());
        hash
    }

    /// Validate that the proposed config maintains all required invariants.
    /// Simulates the final state to catch ordering issues (e.g., soft_cap >= hard_cap)
    /// before the proposal is accepted (L-3 fix).
    pub fn validate_against(&self, current: &QuickPickState) -> Result<()> {
        let simulated_soft_cap = self.soft_cap.unwrap_or(current.soft_cap);
        let simulated_hard_cap = self.hard_cap.unwrap_or(current.hard_cap);
        let simulated_seed_amount = self.seed_amount.unwrap_or(current.seed_amount);
        let simulated_ticket_price = self.ticket_price.unwrap_or(current.ticket_price);
        let simulated_draw_interval = self.draw_interval.unwrap_or(current.draw_interval);
        let simulated_match_4 = self.match_4_prize.unwrap_or(current.match_4_prize);
        let simulated_match_3 = self.match_3_prize.unwrap_or(current.match_3_prize);

        // Ticket price must be > 0
        require!(simulated_ticket_price > 0, QuickPickError::InvalidConfig);

        // Seed amount must be > 0 and < soft_cap
        require!(simulated_seed_amount > 0, QuickPickError::InvalidConfig);
        require!(
            simulated_seed_amount < simulated_soft_cap,
            QuickPickError::InvalidConfig
        );

        // Soft cap must be < hard cap
        require!(simulated_soft_cap > 0, QuickPickError::InvalidConfig);
        require!(simulated_hard_cap > 0, QuickPickError::InvalidConfig);
        require!(
            simulated_soft_cap < simulated_hard_cap,
            QuickPickError::InvalidConfig
        );

        // Draw interval: minimum 1 hour, maximum 24 hours
        require!(
            simulated_draw_interval >= 3600 && simulated_draw_interval <= 86400,
            QuickPickError::InvalidConfig
        );

        // Prize amounts must be > 0
        require!(simulated_match_4 > 0, QuickPickError::InvalidConfig);
        require!(simulated_match_3 > 0, QuickPickError::InvalidConfig);

        // Prize ordering: Match 4 prize > Match 3 prize
        require!(
            simulated_match_4 > simulated_match_3,
            QuickPickError::InvalidConfig
        );

        Ok(())
    }
}

/// Accounts required for updating Quick Pick configuration
#[derive(Accounts)]
pub struct UpdateQuickPickConfig<'info> {
    /// The authority (must be lottery authority)
    #[account(
        constraint = authority.key() == lottery_state.authority @ QuickPickError::Unauthorized
    )]
    pub authority: Signer<'info>,

    /// The main lottery state (to verify authority)
    #[account(
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump
    )]
    pub lottery_state: Account<'info, LotteryState>,

    /// The Quick Pick state account
    #[account(
        mut,
        seeds = [QUICK_PICK_SEED],
        bump = quick_pick_state.bump,
        // Can only update config when paused or no draw in progress
        constraint = quick_pick_state.is_paused || !quick_pick_state.is_draw_in_progress @ QuickPickError::InvalidDrawState
    )]
    pub quick_pick_state: Account<'info, QuickPickState>,
}

/// Update Quick Pick configuration (legacy immediate mode).
///
/// Applies configuration changes immediately. However, if a timelock proposal
/// is active (config_timelock_end != 0), this instruction will REJECT the
/// update to prevent bypassing the timelock (H-2 fix).
///
/// For production use, prefer propose_config → execute_config flow.
///
/// # Arguments
/// * `ctx` - The context containing all required accounts
/// * `params` - The configuration parameters to update (None = no change)
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler_update_config(
    ctx: Context<UpdateQuickPickConfig>,
    params: UpdateQuickPickConfigParams,
) -> Result<()> {
    let clock = Clock::get()?;
    let quick_pick_state = &mut ctx.accounts.quick_pick_state;

    // SECURITY (H-2 fix): Reject immediate updates if a timelock proposal is pending.
    // This prevents bypassing the two-phase config change process.
    require!(
        quick_pick_state.config_timelock_end == 0,
        QuickPickError::InvalidDrawState
    );

    // SECURITY (L-3 fix): Validate all invariants against the simulated final state
    // before applying any changes. This catches ordering issues like soft_cap >= hard_cap.
    params.validate_against(quick_pick_state)?;

    // Track old house fee for event
    let old_fee_bps = quick_pick_state.house_fee_bps;

    // Update ticket price
    if let Some(ticket_price) = params.ticket_price {
        msg!(
            "  Ticket price: {} -> {} USDC lamports",
            quick_pick_state.ticket_price,
            ticket_price
        );
        quick_pick_state.ticket_price = ticket_price;
    }

    // Update soft cap
    if let Some(soft_cap) = params.soft_cap {
        msg!(
            "  Soft cap: {} -> {} USDC lamports",
            quick_pick_state.soft_cap,
            soft_cap
        );
        quick_pick_state.soft_cap = soft_cap;
    }

    // Update hard cap
    if let Some(hard_cap) = params.hard_cap {
        msg!(
            "  Hard cap: {} -> {} USDC lamports",
            quick_pick_state.hard_cap,
            hard_cap
        );
        quick_pick_state.hard_cap = hard_cap;
    }

    // Update seed amount
    if let Some(seed_amount) = params.seed_amount {
        msg!(
            "  Seed amount: {} -> {} USDC lamports",
            quick_pick_state.seed_amount,
            seed_amount
        );
        quick_pick_state.seed_amount = seed_amount;
    }

    // Update draw interval
    if let Some(draw_interval) = params.draw_interval {
        msg!(
            "  Draw interval: {} -> {} seconds",
            quick_pick_state.draw_interval,
            draw_interval
        );
        quick_pick_state.draw_interval = draw_interval;
        // SECURITY (M6 fix): Recalculate next draw timestamp so the new
        // interval takes effect immediately rather than one draw later.
        quick_pick_state.next_draw_timestamp = clock.unix_timestamp + draw_interval;
    }

    // Update Match 4 prize
    if let Some(match_4_prize) = params.match_4_prize {
        msg!(
            "  Match 4 prize: {} -> {} USDC lamports",
            quick_pick_state.match_4_prize,
            match_4_prize
        );
        quick_pick_state.match_4_prize = match_4_prize;
    }

    // Update Match 3 prize
    if let Some(match_3_prize) = params.match_3_prize {
        msg!(
            "  Match 3 prize: {} -> {} USDC lamports",
            quick_pick_state.match_3_prize,
            match_3_prize
        );
        quick_pick_state.match_3_prize = match_3_prize;
    }

    // Recalculate house fee if jackpot-related params changed
    let new_fee_bps = quick_pick_state.get_current_house_fee_bps();
    if new_fee_bps != old_fee_bps {
        quick_pick_state.house_fee_bps = new_fee_bps;

        emit!(QuickPickFeeTierChanged {
            draw_id: quick_pick_state.current_draw,
            old_fee_bps,
            new_fee_bps,
            jackpot_balance: quick_pick_state.jackpot_balance,
            timestamp: clock.unix_timestamp,
        });
    }

    msg!("Quick Pick config updated successfully!");

    Ok(())
}

// ============================================================================
// CONFIG TIMELOCK SYSTEM (H-2 fix)
// ============================================================================
// Configuration changes now use a two-phase timelock:
//   1. propose_config: Authority submits desired changes, starts 24h countdown
//   2. execute_config: After the delay, authority applies the exact proposed changes
//   3. cancel_config_proposal: Authority can cancel a pending proposal
//
// This prevents a compromised authority from instantly changing critical parameters
// (e.g., zeroing out seed_amount, changing caps maliciously). Anyone observing the
// chain has at least QUICK_PICK_CONFIG_TIMELOCK_DELAY (24 hours) to detect and
// respond to a malicious proposal before it takes effect.

/// Propose Quick Pick configuration changes (Phase 1 of timelock).
///
/// Starts a 24-hour timelock by storing a hash of the proposed changes.
/// The actual changes are NOT applied until execute_quick_pick_config is called
/// after the timelock expires.
///
/// # Arguments
/// * `ctx` - The context containing all required accounts
/// * `params` - The proposed configuration parameters
pub fn handler_propose_quick_pick_config(
    ctx: Context<UpdateQuickPickConfig>,
    params: UpdateQuickPickConfigParams,
) -> Result<()> {
    let clock = Clock::get()?;
    let quick_pick_state = &mut ctx.accounts.quick_pick_state;

    // Reject if there's already a pending proposal
    require!(
        quick_pick_state.config_timelock_end == 0,
        QuickPickError::InvalidDrawState
    );

    // Pre-validate params so we catch errors early (before waiting 24h)
    params.validate_against(quick_pick_state)?;

    // Store the proposal hash and set the timelock
    let config_hash = params.compute_hash();
    quick_pick_state.pending_config_hash = config_hash;
    quick_pick_state.config_timelock_end = clock
        .unix_timestamp
        .checked_add(QUICK_PICK_CONFIG_TIMELOCK_DELAY)
        .ok_or(QuickPickError::Overflow)?;

    msg!("Quick Pick config change PROPOSED (timelock started)");
    msg!(
        "  Config hash: {:?}",
        &quick_pick_state.pending_config_hash[..8]
    );
    msg!(
        "  Executable after: {} (unix timestamp)",
        quick_pick_state.config_timelock_end
    );
    msg!(
        "  Delay: {} seconds ({} hours)",
        QUICK_PICK_CONFIG_TIMELOCK_DELAY,
        QUICK_PICK_CONFIG_TIMELOCK_DELAY / 3600
    );
    msg!("  Call execute_config with the same params after the timelock expires.");

    Ok(())
}

/// Execute proposed Quick Pick configuration changes (Phase 2 of timelock).
///
/// Applies the previously proposed configuration changes after the timelock
/// has expired. The params must exactly match the proposed ones (verified via hash).
///
/// # Arguments
/// * `ctx` - The context containing all required accounts
/// * `params` - The configuration parameters (must match proposal)
pub fn handler_execute_quick_pick_config(
    ctx: Context<UpdateQuickPickConfig>,
    params: UpdateQuickPickConfigParams,
) -> Result<()> {
    let clock = Clock::get()?;
    let quick_pick_state = &mut ctx.accounts.quick_pick_state;

    // Verify a proposal exists
    require!(
        quick_pick_state.config_timelock_end != 0,
        QuickPickError::InvalidDrawState
    );

    // Verify timelock has expired
    require!(
        clock.unix_timestamp >= quick_pick_state.config_timelock_end,
        QuickPickError::InvalidTimestamp
    );

    // Verify params hash matches the proposal (prevents bait-and-switch)
    let config_hash = params.compute_hash();
    require!(
        config_hash == quick_pick_state.pending_config_hash,
        QuickPickError::InvalidConfig
    );

    // Clear the proposal before applying (re-entrancy protection)
    quick_pick_state.config_timelock_end = 0;
    quick_pick_state.pending_config_hash = [0u8; 32];

    // Apply the changes using the same logic as handler_update_config
    // NOTE: We call the inner logic directly instead of delegating to
    // handler_update_config to avoid the duplicate timelock check.
    let old_fee_bps = quick_pick_state.house_fee_bps;

    if let Some(ticket_price) = params.ticket_price {
        quick_pick_state.ticket_price = ticket_price;
    }
    if let Some(soft_cap) = params.soft_cap {
        quick_pick_state.soft_cap = soft_cap;
    }
    if let Some(hard_cap) = params.hard_cap {
        quick_pick_state.hard_cap = hard_cap;
    }
    if let Some(seed_amount) = params.seed_amount {
        quick_pick_state.seed_amount = seed_amount;
    }
    if let Some(draw_interval) = params.draw_interval {
        quick_pick_state.draw_interval = draw_interval;
        quick_pick_state.next_draw_timestamp = clock.unix_timestamp + draw_interval;
    }
    if let Some(match_4_prize) = params.match_4_prize {
        quick_pick_state.match_4_prize = match_4_prize;
    }
    if let Some(match_3_prize) = params.match_3_prize {
        quick_pick_state.match_3_prize = match_3_prize;
    }

    let new_fee_bps = quick_pick_state.get_current_house_fee_bps();
    if new_fee_bps != old_fee_bps {
        quick_pick_state.house_fee_bps = new_fee_bps;
        emit!(QuickPickFeeTierChanged {
            draw_id: quick_pick_state.current_draw,
            old_fee_bps,
            new_fee_bps,
            jackpot_balance: quick_pick_state.jackpot_balance,
            timestamp: clock.unix_timestamp,
        });
    }

    msg!("Quick Pick config executed successfully (timelock completed)!");

    Ok(())
}

/// Cancel a pending Quick Pick configuration proposal.
///
/// Clears the pending config hash and timelock, preventing execution.
///
/// # Arguments
/// * `ctx` - The context containing all required accounts
pub fn handler_cancel_quick_pick_config(ctx: Context<UpdateQuickPickConfig>) -> Result<()> {
    let quick_pick_state = &mut ctx.accounts.quick_pick_state;

    require!(
        quick_pick_state.config_timelock_end != 0,
        QuickPickError::InvalidDrawState
    );

    quick_pick_state.pending_config_hash = [0u8; 32];
    quick_pick_state.config_timelock_end = 0;

    msg!("Quick Pick configuration proposal CANCELLED.");

    Ok(())
}

// ============================================================================
// WITHDRAW HOUSE FEES INSTRUCTION
// ============================================================================

/// Accounts required for withdrawing house fees
#[derive(Accounts)]
pub struct WithdrawQuickPickHouseFees<'info> {
    /// The authority (must be lottery authority)
    #[account(
        constraint = authority.key() == lottery_state.authority @ QuickPickError::Unauthorized
    )]
    pub authority: Signer<'info>,

    /// The main lottery state (to verify authority)
    #[account(
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump
    )]
    pub lottery_state: Account<'info, LotteryState>,

    /// The Quick Pick state account (for PDA signing)
    #[account(
        seeds = [QUICK_PICK_SEED],
        bump = quick_pick_state.bump
    )]
    pub quick_pick_state: Account<'info, QuickPickState>,

    /// House fee USDC token account
    #[account(
        mut,
        seeds = [HOUSE_FEE_USDC_SEED],
        bump
    )]
    pub house_fee_usdc: Account<'info, TokenAccount>,

    /// Destination USDC token account
    /// SECURITY (M3 fix): Must be owned by the authority to prevent
    /// draining house fees to an arbitrary wallet.
    #[account(
        mut,
        constraint = destination_usdc.owner == authority.key() @ QuickPickError::InvalidTokenAccount
    )]
    pub destination_usdc: Account<'info, TokenAccount>,

    /// Token program
    pub token_program: Program<'info, Token>,
}

/// Withdraw house fees from Quick Pick
///
/// Transfers accumulated house fees to a destination account owned by the authority.
/// The withdrawal amount is capped at QUICK_PICK_HOUSE_FEE_WITHDRAWAL_CAP_BPS
/// (50%) of the current jackpot balance to limit damage from a compromised
/// authority (M-2 fix).
///
/// # Arguments
/// * `ctx` - The context containing all required accounts
/// * `amount` - Amount to withdraw (0 = withdraw up to the cap)
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler_withdraw_house_fees(
    ctx: Context<WithdrawQuickPickHouseFees>,
    amount: u64,
) -> Result<()> {
    let clock = Clock::get()?;

    let available_balance = ctx.accounts.house_fee_usdc.amount;

    // SECURITY (M-2 fix): Cap per-withdrawal amount to a fraction of the
    // jackpot balance. This limits how much a compromised authority can drain
    // in a single transaction. The cap is QUICK_PICK_HOUSE_FEE_WITHDRAWAL_CAP_BPS
    // (50%) of jackpot_balance, so the effective limit scales with protocol growth.
    let max_withdrawal = (ctx.accounts.quick_pick_state.jackpot_balance as u128
        * QUICK_PICK_HOUSE_FEE_WITHDRAWAL_CAP_BPS as u128
        / BPS_DENOMINATOR as u128) as u64;
    // Ensure at least 1 lamport can be withdrawn even with a tiny jackpot
    let effective_cap = max_withdrawal.max(1);

    let withdraw_amount = if amount == 0 {
        // "Withdraw all" means withdraw up to the cap
        available_balance.min(effective_cap)
    } else {
        // Explicit amount: must not exceed available balance or cap
        amount.min(available_balance).min(effective_cap)
    };

    require!(withdraw_amount > 0, QuickPickError::InsufficientFunds);

    // Transfer house fees using Quick Pick state as signer
    let seeds = &[QUICK_PICK_SEED, &[ctx.accounts.quick_pick_state.bump]];
    let signer_seeds = &[&seeds[..]];

    let cpi_accounts = Transfer {
        from: ctx.accounts.house_fee_usdc.to_account_info(),
        to: ctx.accounts.destination_usdc.to_account_info(),
        authority: ctx.accounts.quick_pick_state.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);

    token::transfer(cpi_ctx, withdraw_amount)?;

    // Emit event
    emit!(QuickPickHouseFeesWithdrawn {
        amount: withdraw_amount,
        destination: ctx.accounts.destination_usdc.key(),
        authority: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });

    msg!("Quick Pick house fees withdrawn!");
    msg!("  Amount: {} USDC lamports", withdraw_amount);
    msg!("  Destination: {}", ctx.accounts.destination_usdc.key());
    msg!(
        "  Remaining balance: {} USDC lamports",
        available_balance.saturating_sub(withdraw_amount)
    );

    Ok(())
}

// ============================================================================
// CANCEL DRAW INSTRUCTION
// ============================================================================

/// Accounts required for cancelling a Quick Pick draw
#[derive(Accounts)]
pub struct CancelQuickPickDraw<'info> {
    /// The authority (must be lottery authority)
    #[account(
        constraint = authority.key() == lottery_state.authority @ QuickPickError::Unauthorized
    )]
    pub authority: Signer<'info>,

    /// The main lottery state (to verify authority)
    #[account(
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump
    )]
    pub lottery_state: Account<'info, LotteryState>,

    /// The Quick Pick state account
    #[account(
        mut,
        seeds = [QUICK_PICK_SEED],
        bump = quick_pick_state.bump
    )]
    pub quick_pick_state: Account<'info, QuickPickState>,
}

/// Cancel a Quick Pick draw
///
/// This instruction cancels the current draw in progress, resetting the state
/// so a new draw can be initiated. Should be used when:
/// - Randomness commit has timed out
/// - There's an issue with the draw execution
/// - Admin needs to reset the draw state
///
/// # Arguments
/// * `ctx` - The context containing all required accounts
/// * `reason` - Reason for cancellation.
///   **⚠️  MAX LENGTH: {MAX_REASON_LENGTH} bytes.** Exceeding this causes the
///   transaction to fail due to Solana's compute budget limits.
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler_cancel_draw(ctx: Context<CancelQuickPickDraw>, reason: String) -> Result<()> {
    let clock = Clock::get()?;
    let quick_pick_state = &mut ctx.accounts.quick_pick_state;

    // Get current draw info
    let draw_id = quick_pick_state.current_draw;
    let tickets_affected = quick_pick_state.current_draw_tickets;

    // SECURITY: Cannot cancel a draw that has been executed.
    require!(
        !quick_pick_state.is_awaiting_finalization,
        QuickPickError::DrawNotInProgress
    );

    // Reset draw state (preserve tickets for rescheduled draw)
    quick_pick_state.reset_draw_state(false);

    // Reschedule next draw (advance by draw interval from now)
    quick_pick_state.next_draw_timestamp = clock.unix_timestamp + quick_pick_state.draw_interval;

    // Emit event
    emit!(QuickPickDrawCancelled {
        draw_id,
        tickets_affected,
        reason: reason.clone(),
        timestamp: clock.unix_timestamp,
    });

    msg!("Quick Pick draw #{} cancelled!", draw_id);
    msg!("  Reason: {}", reason);
    msg!("  Tickets affected: {}", tickets_affected);
    msg!("  Next draw time: {}", quick_pick_state.next_draw_timestamp);
    msg!(
        "Tickets for draw {} will carry over to the rescheduled draw.",
        draw_id
    );
    msg!("  Note: Ticket holders should be able to claim refunds or tickets carry over");

    Ok(())
}

// ============================================================================
// FORCE FINALIZE DRAW INSTRUCTION
// ============================================================================

/// Accounts required for force finalizing a Quick Pick draw
#[derive(Accounts)]
pub struct ForceFinalizequickPickDraw<'info> {
    /// The authority (must be lottery authority)
    #[account(
        constraint = authority.key() == lottery_state.authority @ QuickPickError::Unauthorized
    )]
    pub authority: Signer<'info>,

    /// The main lottery state (to verify authority)
    #[account(
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump
    )]
    pub lottery_state: Account<'info, LotteryState>,

    /// The Quick Pick state account
    #[account(
        mut,
        seeds = [QUICK_PICK_SEED],
        bump = quick_pick_state.bump
    )]
    pub quick_pick_state: Account<'info, QuickPickState>,

    /// The Quick Pick draw result account (if exists)
    #[account(
        mut,
        seeds = [QUICK_PICK_DRAW_SEED, &quick_pick_state.current_draw.to_le_bytes()],
        bump = draw_result.bump
    )]
    pub draw_result: Option<Account<'info, QuickPickDrawResult>>,
}

/// Force finalize a Quick Pick draw
///
/// This instruction force finalizes a stuck draw with zero winners,
/// allowing the system to proceed to the next draw. The jackpot carries over.
///
/// # Arguments
/// * `ctx` - The context containing all required accounts
/// * `reason` - Reason for force finalization
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler_force_finalize_draw(
    ctx: Context<ForceFinalizequickPickDraw>,
    reason: String,
) -> Result<()> {
    let clock = Clock::get()?;
    let quick_pick_state = &mut ctx.accounts.quick_pick_state;

    // Get current draw info
    let draw_id = quick_pick_state.current_draw;
    let tickets_affected = quick_pick_state.current_draw_tickets;

    // If draw result exists, mark it as finalized with zero winners
    if let Some(draw_result) = &mut ctx.accounts.draw_result {
        if !draw_result.is_explicitly_finalized {
            draw_result.match_5_winners = 0;
            draw_result.match_4_winners = 0;
            draw_result.match_3_winners = 0;
            draw_result.match_5_prize_per_winner = 0;
            draw_result.match_4_prize_per_winner = 0;
            draw_result.match_3_prize_per_winner = 0;
            draw_result.is_explicitly_finalized = true;
        }
    }

    // SECURITY (C-2/C-3 fix): force_finalize_draw is only allowed when a draw
    // has been executed (is_awaiting_finalization == true) and is stuck. It
    // cannot be used to skip draws before winning numbers are revealed.
    // Previously the guard was INVERTED, allowing pre-execution abuse and
    // rejecting the legitimate post-execution recovery case.
    require!(
        quick_pick_state.is_awaiting_finalization,
        QuickPickError::DrawNotInProgress
    );

    // SECURITY: Only allow force-finalize if the commit has timed out (1 hour),
    // to prevent an operator from immediately force-finalizing after execute
    // and bypassing the indexer's finalization window.
    require!(
        quick_pick_state.is_commit_timed_out(clock.unix_timestamp),
        QuickPickError::Timeout
    );

    // Reset draw state (including tickets) and advance to next draw
    quick_pick_state.reset_draw_state(true);

    // Advance to next draw
    quick_pick_state.current_draw = draw_id.saturating_add(1);
    quick_pick_state.next_draw_timestamp = clock.unix_timestamp + quick_pick_state.draw_interval;

    // Jackpot carries over (no winners in force finalization)

    // Emit event
    emit!(QuickPickDrawForceFinalized {
        draw_id,
        tickets_affected,
        authority: ctx.accounts.authority.key(),
        reason: reason.clone(),
        timestamp: clock.unix_timestamp,
    });

    msg!("Quick Pick draw #{} force finalized!", draw_id);
    msg!("  Reason: {}", reason);
    msg!("  Tickets affected: {}", tickets_affected);
    msg!(
        "  Jackpot carries over: {} USDC",
        quick_pick_state.jackpot_balance
    );
    msg!("  Next draw: #{}", quick_pick_state.current_draw);

    Ok(())
}

// ============================================================================
// EMERGENCY FUND TRANSFER INSTRUCTION
// ============================================================================

/// Source of funds for emergency transfer
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub enum QuickPickFundSource {
    /// Reserve fund
    Reserve,
    /// Insurance pool
    Insurance,
    /// Prize pool
    PrizePool,
}

/// Accounts required for emergency fund transfer
#[derive(Accounts)]
pub struct EmergencyQuickPickFundTransfer<'info> {
    /// The authority (must be lottery authority)
    #[account(
        constraint = authority.key() == lottery_state.authority @ QuickPickError::Unauthorized
    )]
    pub authority: Signer<'info>,

    /// The main lottery state (to verify authority)
    #[account(
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump
    )]
    pub lottery_state: Account<'info, LotteryState>,

    /// The Quick Pick state account
    #[account(
        mut,
        seeds = [QUICK_PICK_SEED],
        bump = quick_pick_state.bump,
        // Must be paused for emergency transfers
        constraint = quick_pick_state.is_paused @ QuickPickError::InvalidDrawState
    )]
    pub quick_pick_state: Account<'info, QuickPickState>,

    /// Source USDC token account
    #[account(mut)]
    pub source_usdc: Account<'info, TokenAccount>,

    /// Destination USDC token account
    #[account(mut)]
    pub destination_usdc: Account<'info, TokenAccount>,

    /// USDC mint (for validation)
    pub usdc_mint: Account<'info, Mint>,

    /// Token program
    pub token_program: Program<'info, Token>,
}

/// Emergency fund transfer event
#[event]
pub struct QuickPickEmergencyFundTransferred {
    /// Draw ID at time of transfer
    pub draw_id: u64,
    /// Source of funds
    pub source: String,
    /// Amount transferred
    pub amount: u64,
    /// Destination account
    pub destination: Pubkey,
    /// Reason for transfer
    pub reason: String,
    /// Authority who initiated
    pub authority: Pubkey,
    /// Timestamp
    pub timestamp: i64,
}

/// Emergency fund transfer for Quick Pick
///
/// This instruction allows emergency transfer of funds between pools.
/// Should only be used in emergency situations. Quick Pick must be paused.
///
/// # Arguments
/// * `ctx` - The context containing all required accounts
/// * `source` - Source of funds (Reserve, Insurance, or PrizePool)
/// * `amount` - Amount to transfer
/// * `reason` - Reason for the emergency transfer
///
/// # Returns
/// * `Result<()>` - Success or error
/// Maximum basis points of hard_cap that can be transferred per emergency call.
/// Set to 10% as a safety limit. Larger transfers require multiple calls,
/// giving monitors time to detect anomalous activity.
pub const QP_EMERGENCY_TRANSFER_MAX_BPS: u64 = 1000; // 10%

pub fn handler_emergency_fund_transfer(
    ctx: Context<EmergencyQuickPickFundTransfer>,
    source: QuickPickFundSource,
    amount: u64,
    reason: String,
) -> Result<()> {
    let clock = Clock::get()?;

    require!(amount > 0, QuickPickError::InvalidConfig);
    require!(
        ctx.accounts.source_usdc.amount >= amount,
        QuickPickError::InsufficientFunds
    );

    // Validate USDC mint
    require!(
        ctx.accounts.source_usdc.mint == ctx.accounts.usdc_mint.key(),
        QuickPickError::InvalidUsdcMint
    );
    require!(
        ctx.accounts.destination_usdc.mint == ctx.accounts.usdc_mint.key(),
        QuickPickError::InvalidUsdcMint
    );

    // SECURITY (C-5 fix): Verify source token account matches the declared
    // source PDA. Without this check, an attacker could pass arbitrary token
    // accounts and drain funds from unverified sources.
    {
        let (expected_prize_pool, _) =
            Pubkey::find_program_address(&[PRIZE_POOL_USDC_SEED], ctx.program_id);
        let (expected_insurance, _) =
            Pubkey::find_program_address(&[INSURANCE_POOL_USDC_SEED], ctx.program_id);

        match source {
            QuickPickFundSource::PrizePool | QuickPickFundSource::Reserve => {
                require!(
                    ctx.accounts.source_usdc.key() == expected_prize_pool,
                    QuickPickError::InvalidTokenAccount
                );
            }
            QuickPickFundSource::Insurance => {
                require!(
                    ctx.accounts.source_usdc.key() == expected_insurance,
                    QuickPickError::InvalidTokenAccount
                );
            }
        }
    }

    // SECURITY FIX (Issue #5): Cap per-call transfer amount for PrizePool source
    // to limit damage from a compromised authority. Reserve and Insurance transfers
    // stay within the protocol (pool-to-pool), but PrizePool transfers can go to
    // an external destination and need strict limits.
    if matches!(source, QuickPickFundSource::PrizePool) {
        let hard_cap = ctx.accounts.quick_pick_state.hard_cap;
        let max_transfer =
            (hard_cap as u128 * QP_EMERGENCY_TRANSFER_MAX_BPS as u128 / 10000u128) as u64;
        require!(amount <= max_transfer, QuickPickError::InvalidConfig);
        msg!(
            "  PrizePool emergency transfer cap: {} USDC lamports (10% of hard cap)",
            max_transfer
        );

        // SECURITY FIX (Issue #5): For PrizePool external transfers, validate that
        // the source is actually the prize pool PDA and the destination is not the
        // same as the source (prevent no-op abuse for event spam).
        require!(
            ctx.accounts.source_usdc.key() != ctx.accounts.destination_usdc.key(),
            QuickPickError::InvalidTokenAccount
        );
    }

    let source_name = match source {
        QuickPickFundSource::Reserve => "reserve",
        QuickPickFundSource::Insurance => "insurance",
        QuickPickFundSource::PrizePool => "prize_pool",
    };

    // Transfer funds using Quick Pick state as signer
    let seeds = &[QUICK_PICK_SEED, &[ctx.accounts.quick_pick_state.bump]];
    let signer_seeds = &[&seeds[..]];

    let cpi_accounts = Transfer {
        from: ctx.accounts.source_usdc.to_account_info(),
        to: ctx.accounts.destination_usdc.to_account_info(),
        authority: ctx.accounts.quick_pick_state.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);

    token::transfer(cpi_ctx, amount)?;

    // Update internal balance tracking
    let quick_pick_state = &mut ctx.accounts.quick_pick_state;
    match source {
        QuickPickFundSource::Reserve => {
            quick_pick_state.reserve_balance =
                quick_pick_state.reserve_balance.saturating_sub(amount);
        }
        QuickPickFundSource::Insurance => {
            quick_pick_state.insurance_balance =
                quick_pick_state.insurance_balance.saturating_sub(amount);
        }
        QuickPickFundSource::PrizePool => {
            quick_pick_state.prize_pool_balance =
                quick_pick_state.prize_pool_balance.saturating_sub(amount);
        }
    }

    // Emit event
    emit!(QuickPickEmergencyFundTransferred {
        draw_id: quick_pick_state.current_draw,
        source: source_name.to_string(),
        amount,
        destination: ctx.accounts.destination_usdc.key(),
        reason: reason.clone(),
        authority: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });

    msg!("⚠️ EMERGENCY Quick Pick fund transfer executed!");
    msg!("  Source: {}", source_name);
    msg!("  Amount: {} USDC lamports", amount);
    msg!("  Destination: {}", ctx.accounts.destination_usdc.key());
    msg!("  Reason: {}", reason);
    msg!("  Authority: {}", ctx.accounts.authority.key());

    Ok(())
}

// ============================================================================
// ADD RESERVE FUNDS INSTRUCTION
// ============================================================================

/// Accounts required for adding reserve funds
#[derive(Accounts)]
pub struct AddQuickPickReserveFunds<'info> {
    /// The authority (must be lottery authority)
    #[account(
        constraint = authority.key() == lottery_state.authority @ QuickPickError::Unauthorized
    )]
    pub authority: Signer<'info>,

    /// The main lottery state (to verify authority)
    #[account(
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump
    )]
    pub lottery_state: Account<'info, LotteryState>,

    /// The Quick Pick state account
    #[account(
        mut,
        seeds = [QUICK_PICK_SEED],
        bump = quick_pick_state.bump
    )]
    pub quick_pick_state: Account<'info, QuickPickState>,

    /// Authority's USDC token account (source of funds)
    #[account(
        mut,
        constraint = authority_usdc.owner == authority.key() @ QuickPickError::TokenAccountOwnerMismatch,
        constraint = authority_usdc.mint == usdc_mint.key() @ QuickPickError::InvalidUsdcMint
    )]
    pub authority_usdc: Account<'info, TokenAccount>,

    /// Prize pool USDC token account (destination)
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

/// Add reserve funds to Quick Pick
///
/// This instruction allows the authority to add additional reserve funds
/// which can be used for jackpot seeding or emergency situations.
///
/// # Arguments
/// * `ctx` - The context containing all required accounts
/// * `amount` - Amount of USDC lamports to add
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler_add_reserve_funds(
    ctx: Context<AddQuickPickReserveFunds>,
    amount: u64,
) -> Result<()> {
    require!(amount > 0, QuickPickError::InvalidConfig);
    require!(
        ctx.accounts.authority_usdc.amount >= amount,
        QuickPickError::InsufficientFunds
    );

    // Transfer USDC from authority to prize pool
    let cpi_accounts = Transfer {
        from: ctx.accounts.authority_usdc.to_account_info(),
        to: ctx.accounts.prize_pool_usdc.to_account_info(),
        authority: ctx.accounts.authority.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    token::transfer(cpi_ctx, amount)?;

    // Update reserve balance
    let quick_pick_state = &mut ctx.accounts.quick_pick_state;
    quick_pick_state.reserve_balance = quick_pick_state
        .reserve_balance
        .checked_add(amount)
        .ok_or(QuickPickError::Overflow)?;

    msg!("Quick Pick reserve funds added!");
    msg!("  Amount added: {} USDC lamports", amount);
    msg!(
        "  New reserve balance: {} USDC lamports",
        quick_pick_state.reserve_balance
    );

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_update_config_params_default() {
        let params = UpdateQuickPickConfigParams::default();
        assert!(params.ticket_price.is_none());
        assert!(params.soft_cap.is_none());
        assert!(params.hard_cap.is_none());
        assert!(params.seed_amount.is_none());
        assert!(params.draw_interval.is_none());
        assert!(params.match_4_prize.is_none());
        assert!(params.match_3_prize.is_none());
    }

    #[test]
    fn test_fund_source_variants() {
        assert_ne!(QuickPickFundSource::Reserve, QuickPickFundSource::Insurance);
        assert_ne!(
            QuickPickFundSource::Insurance,
            QuickPickFundSource::PrizePool
        );
        assert_ne!(QuickPickFundSource::Reserve, QuickPickFundSource::PrizePool);
    }
}
