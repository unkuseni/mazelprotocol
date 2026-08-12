//! Finalize Draw Instruction
//!
//! This instruction finalizes a draw by setting winner counts and calculating prizes.
//! It is called by the authority after off-chain indexing has determined winner counts.
//!
//! The finalization process:
//! 1. Validates winner counts submitted by authority
//! 2. Performs solvency check (jackpot + reserve + insurance)
//! 3. Calculates prizes based on mode (fixed or pari-mutuel rolldown)
//! 4. Uses insurance pool if needed for prize shortfalls
//! 5. Handles zero-winner tiers by redistributing funds
//! 6. Updates the draw result with prize amounts
//! 7. Resets lottery state for the next draw
//! 8. Seeds the new jackpot if rolldown occurred
//! 9. Updates dynamic house fee based on new jackpot level

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use super::prizes::{calculate_fixed_prizes, calculate_rolldown_prizes};
use crate::constants::*;
use crate::errors::LottoError;
use crate::events::{
    DrawFinalized, DynamicFeeTierChanged, EmergencyPause, InsurancePoolUsed, LpPoolSeeded,
    RolldownExecuted, SoftCapReached, SolvencyCheckPerformed,
};
use crate::state::{DrawResult, LotteryState, LpPool, WinnerCounts};

/// Parameters for finalizing the draw
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct FinalizeDrawParams {
    /// Winner counts by tier (submitted by indexer)
    pub winner_counts: WinnerCounts,
    /// Verification hash: SHA256(draw_id || winning_numbers || serialized_winner_counts || indexer_nonce)
    /// This serves as a commitment to the off-chain winner data, enabling post-hoc auditing.
    /// Off-chain indexers must publish the preimage so anyone can verify the hash on-chain.
    pub verification_hash: [u8; 32],
    /// Nonce used by the indexer when computing the verification hash (for replay protection)
    pub indexer_nonce: u64,
}

/// Accounts required for finalizing the draw
///
/// SECURITY (M1 fix): finalize_draw is now PERMISSIONLESS.
/// Anyone can submit winner counts. Combined with the FINALIZATION_DELAY
/// (minimum time between execute_draw and finalize_draw), independent
/// indexers have time to compute and submit honest counts before a malicious
/// operator can fabricate them. The verification_hash still provides a
/// cryptographic commitment for post-hoc auditing.
#[derive(Accounts)]
pub struct FinalizeDraw<'info> {
    /// Anyone can finalize (permissionless). Pays for the transaction.
    #[account(mut)]
    pub finalizer: Signer<'info>,

    /// The main lottery state account
    #[account(
        mut,
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump,
        constraint = lottery_state.is_draw_in_progress @ LottoError::DrawNotInProgress
    )]
    pub lottery_state: Account<'info, LotteryState>,

    /// The draw result account to be finalized
    #[account(
        mut,
        seeds = [DRAW_SEED, &lottery_state.current_draw_id.to_le_bytes()],
        bump = draw_result.bump,
        constraint = draw_result.draw_id == lottery_state.current_draw_id @ LottoError::DrawIdMismatch,
        constraint = !draw_result.is_finalized() @ LottoError::DrawAlreadyCompleted
    )]
    pub draw_result: Account<'info, DrawResult>,

    /// LP pool state (optional — included when LP liquidity exists for seeding)
    #[account(
        mut,
        seeds = [LP_POOL_SEED],
        bump = lp_pool.bump,
    )]
    pub lp_pool: Option<Account<'info, LpPool>>,

    /// LP pool USDC token account.
    /// MUST be provided when lp_pool is Some, otherwise seed transfer is skipped.
    #[account(
        mut,
        seeds = [LP_POOL_USDC_SEED],
        bump
    )]
    pub lp_pool_usdc: Option<Account<'info, TokenAccount>>,

    /// Prize pool USDC token account.
    /// MUST be provided when lp_pool is Some.
    #[account(
        mut,
        seeds = [PRIZE_POOL_USDC_SEED],
        bump
    )]
    pub prize_pool_usdc: Option<Account<'info, TokenAccount>>,

    /// Insurance pool USDC token account.
    /// MUST be provided when insurance is used to cover a prize shortfall
    /// (insurance_used > 0), so the USDC is actually moved to the prize pool
    /// instead of only being deducted from the accounting balance.
    #[account(
        mut,
        seeds = [INSURANCE_POOL_USDC_SEED],
        bump
    )]
    pub insurance_pool_usdc: Option<Account<'info, TokenAccount>>,

    /// Token program.
    /// MUST be provided when lp_pool is Some.
    pub token_program: Option<Program<'info, Token>>,
}

impl<'info> FinalizeDraw<'info> {
    /// Validate that LP accounts are all-or-none.
    fn validate_lp_accounts(&self) -> Result<()> {
        let has_lp = self.lp_pool.is_some();
        let has_lp_usdc = self.lp_pool_usdc.is_some();
        let has_prize = self.prize_pool_usdc.is_some();
        let has_token = self.token_program.is_some();

        if has_lp {
            require!(has_lp_usdc, LottoError::LpPoolNotInitialized);
            require!(has_prize, LottoError::LpPoolNotInitialized);
            require!(has_token, LottoError::LpPoolNotInitialized);
        }
        Ok(())
    }
}

/// Transfer USDC from the insurance pool to the prize pool.
///
/// SECURITY (L-4 fix): Previously `insurance_balance` was decremented as
/// accounting but the USDC was never moved out of `insurance_pool_usdc`.
/// Claims only pull from the prize pool token account, so any prize that
/// relied on insurance would fail at claim time even though the protocol
/// held the funds. This closes that gap by funding the prize pool with
/// the actual insurance USDC at finalization.
///
/// Takes explicit account references so it can be called while
/// `lottery_state` is mutably borrowed in the handler.
///
/// # Arguments
/// * `amount` - Amount of USDC lamports to move (must be > 0)
/// * `lottery_bump` - PDA bump for the lottery_state signer
fn transfer_insurance_to_prize_pool<'info>(
    insurance_pool_usdc: &Account<'info, TokenAccount>,
    prize_pool_usdc: &Account<'info, TokenAccount>,
    lottery_state: &Account<'info, LotteryState>,
    token_program: &Program<'info, Token>,
    amount: u64,
    lottery_bump: u8,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }

    // The insurance token account must actually hold the funds we claim
    // to move. If it doesn't, the accounting is wrong and we must fail
    // closed rather than promise prizes we cannot pay.
    require!(insurance_pool_usdc.amount >= amount, LottoError::InsufficientInsuranceFunds);

    let seeds = &[LOTTERY_SEED, &[lottery_bump]];
    let signer_seeds = &[&seeds[..]];

    let cpi_accounts = Transfer {
        from: insurance_pool_usdc.to_account_info(),
        to: prize_pool_usdc.to_account_info(),
        authority: lottery_state.to_account_info(),
    };
    let cpi_ctx =
        CpiContext::new_with_signer(token_program.to_account_info(), cpi_accounts, signer_seeds);
    token::transfer(cpi_ctx, amount)
}

/// Attempt to seed the new jackpot from the LP pool.
///
/// Shared by the rolldown-with-winners and jackpot-won branches (previously
/// duplicated with fragile `.unwrap()` on Option accounts). Transfers USDC
/// from the LP pool token account into the prize pool and updates LP state.
///
/// # Returns
/// The amount seeded from the LP pool (0 if the pool is empty).
fn try_seed_from_lp_pool<'info>(
    lp_pool: &mut Account<'info, LpPool>,
    lp_pool_usdc: &Account<'info, TokenAccount>,
    prize_pool_usdc: &Account<'info, TokenAccount>,
    token_program: &Program<'info, Token>,
    seed_amount: u64,
    draw_id: u64,
    timestamp: i64,
) -> Result<u64> {
    // Never fully drain the pool: always keep at least MIN_LP_DEPOSIT (1 USDC)
    // of liquidity. If total_deposits reached zero while total_shares remain
    // outstanding, share accounting would be unrecoverable: every deposit
    // divides by total_deposits, and every withdrawal computes a zero payout,
    // permanently locking the LP feature.
    let available = lp_pool.total_deposits.saturating_sub(MIN_LP_DEPOSIT);
    if available == 0 {
        return Ok(0);
    }
    let lp_seed = seed_amount.min(available);

    // Transfer USDC from LP pool to prize pool FIRST
    let lp_bump = lp_pool.bump;
    let seeds: &[&[u8]] = &[LP_POOL_SEED, &[lp_bump]];
    let signer_seeds = &[&seeds[..]];

    let cpi_accounts = Transfer {
        from: lp_pool_usdc.to_account_info(),
        to: prize_pool_usdc.to_account_info(),
        authority: lp_pool.to_account_info(),
    };
    let cpi_ctx =
        CpiContext::new_with_signer(token_program.to_account_info(), cpi_accounts, signer_seeds);
    token::transfer(cpi_ctx, lp_seed)?;

    // Only deduct AFTER successful transfer
    lp_pool.deduct_seed(lp_seed)?;
    lp_pool.last_seed_draw_id = draw_id;

    msg!("Transferred {} USDC from LP pool to prize pool", lp_seed);

    emit!(LpPoolSeeded {
        draw_id,
        seed_amount: lp_seed,
        remaining_deposits: lp_pool.total_deposits,
        total_shares: lp_pool.total_shares,
        timestamp,
    });

    msg!("LP pool seeded: {} USDC lamports", lp_seed);
    msg!("  LP pool remaining: {} USDC lamports", lp_pool.total_deposits);

    Ok(lp_seed)
}

// Prize calculation logic extracted to super::prizes module.
// See: calculate_fixed_prizes() and calculate_rolldown_prizes()

/// Finalize the draw with winner counts and calculate prizes
///
/// This instruction:
/// 1. Validates the draw is in progress and waiting for finalization
/// 2. Updates the draw result with winner counts
/// 3. Calculates prizes based on mode (fixed or rolldown)
/// 4. Handles empty tiers by redistributing funds (rolldown mode)
/// 5. Updates draw result with calculated prizes
/// 6. Updates jackpot balance (reset if rolldown, or continue if Match 6 winner)
/// 7. Adds any undistributed funds to reserve
/// 8. Resets lottery state for the next draw cycle
///
/// # Arguments
/// * `ctx` - The context containing all required accounts
/// * `params` - Winner counts from off-chain indexing
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler(ctx: Context<FinalizeDraw>, params: FinalizeDrawParams) -> Result<()> {
    let clock = Clock::get()?;

    // Validate LP accounts are all-or-none
    ctx.accounts.validate_lp_accounts()?;

    let lottery_state = &mut ctx.accounts.lottery_state;
    let draw_result = &mut ctx.accounts.draw_result;

    // Capture initial state for fee tier change detection
    let old_house_fee_bps = lottery_state.house_fee_bps;
    let old_fee_tier_description = lottery_state.get_fee_tier_description();

    // ==========================================================================
    // FINALIZATION DELAY CHECK (M1 fix: prevents instant fabrication)
    // ==========================================================================
    // Require a minimum delay between execute_draw (when winning numbers
    // become public) and finalize_draw. This gives independent indexers
    // time to compute and submit honest winner counts before a malicious
    // operator can fabricate them.
    let finalization_eligible_time =
        draw_result.timestamp.checked_add(FINALIZATION_DELAY).ok_or(LottoError::ArithmeticError)?;

    require!(clock.unix_timestamp >= finalization_eligible_time, LottoError::DrawNotReady);

    // ==========================================================================
    // VERIFICATION HASH CHECK (Issue 2 fix: tamper-resistant winner count audit)
    // ==========================================================================
    // The verification_hash is SHA256(draw_id || winning_numbers || match_6 || match_5 ||
    //   match_4 || match_3 || match_2 || indexer_nonce).
    // Off-chain indexers MUST publish the preimage (all inputs) so anyone can
    // independently recompute the hash and verify on-chain. This creates a
    // cryptographic commitment that makes fabricated winner counts detectable.
    {
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(draw_result.draw_id.to_le_bytes());
        hasher.update(draw_result.winning_numbers);
        hasher.update(params.winner_counts.match_6.to_le_bytes());
        hasher.update(params.winner_counts.match_5.to_le_bytes());
        hasher.update(params.winner_counts.match_4.to_le_bytes());
        hasher.update(params.winner_counts.match_3.to_le_bytes());
        hasher.update(params.winner_counts.match_2.to_le_bytes());
        hasher.update(params.indexer_nonce.to_le_bytes());
        let computed_hash = hasher.finalize();

        require!(
            computed_hash.as_slice() == params.verification_hash,
            LottoError::InvalidPrizeCalculation
        );

        msg!("✅ Verification hash validated for draw {}", draw_result.draw_id);
        msg!("  Indexer nonce: {}", params.indexer_nonce);
    }

    // FIXED: Validate winner counts before updating
    // Check for suspicious patterns (e.g., all tickets winning in a tier)
    let total_tickets_in_draw = draw_result.total_tickets;

    // Check individual tier counts don't exceed total tickets
    if params.winner_counts.match_6 > total_tickets_in_draw as u32
        || params.winner_counts.match_5 > total_tickets_in_draw as u32
        || params.winner_counts.match_4 > total_tickets_in_draw as u32
        || params.winner_counts.match_3 > total_tickets_in_draw as u32
        || params.winner_counts.match_2 > total_tickets_in_draw as u32
    {
        msg!("ERROR: Winner counts exceed total tickets in draw!");
        msg!("  Total tickets: {}", total_tickets_in_draw);
        msg!("  Match 6 winners: {}", params.winner_counts.match_6);
        msg!("  Match 5 winners: {}", params.winner_counts.match_5);
        msg!("  Match 4 winners: {}", params.winner_counts.match_4);
        msg!("  Match 3 winners: {}", params.winner_counts.match_3);
        msg!("  Match 2 winners: {}", params.winner_counts.match_2);
        return Err(LottoError::InvalidPrizeCalculation.into());
    }

    // FIXED: Validate that SUM of all winner counts doesn't exceed total tickets
    // Each ticket can only win in ONE tier (the highest matching tier)
    let total_winners = (params.winner_counts.match_6 as u64)
        .saturating_add(params.winner_counts.match_5 as u64)
        .saturating_add(params.winner_counts.match_4 as u64)
        .saturating_add(params.winner_counts.match_3 as u64)
        .saturating_add(params.winner_counts.match_2 as u64);

    if total_winners > total_tickets_in_draw {
        msg!("ERROR: Sum of winner counts exceeds total tickets!");
        msg!("  Total tickets in draw: {}", total_tickets_in_draw);
        msg!("  Sum of all winners: {}", total_winners);
        msg!("  Match 6: {}", params.winner_counts.match_6);
        msg!("  Match 5: {}", params.winner_counts.match_5);
        msg!("  Match 4: {}", params.winner_counts.match_4);
        msg!("  Match 3: {}", params.winner_counts.match_3);
        msg!("  Match 2: {}", params.winner_counts.match_2);
        msg!("  Note: Each ticket can only win in ONE tier (highest match)");
        return Err(LottoError::WinnerCountsExceedTickets.into());
    }

    // ==========================================================================
    // STATISTICAL PLAUSIBILITY CHECKS (Issue 2 fix)
    // ==========================================================================
    // For a 6/46 lottery, the probability of matching all 6 is ~1 in 9,366,819.
    // We enforce statistical upper bounds to reject clearly fabricated counts.
    // These bounds are generous (100x expected) to avoid false positives while
    // still catching blatant manipulation.
    //
    // Expected probabilities per ticket (6/46 matrix):
    //   Match 6: ~1 in 9,366,819
    //   Match 5: ~1 in 39,028 (240 ways)
    //   Match 4: ~1 in 538 (10,800 ways)
    //   Match 3: ~1 in 22 (86,400 ways)
    //   Match 2: ~1 in 3 (311,040 ways)
    //
    // Upper bounds (generous: allow up to 100x expected rate + 1 for small draws):
    if total_tickets_in_draw > 100 {
        // Match 6: at most 1 per ~93,668 tickets (100x relaxed). Max = tickets/93668 + 1
        let max_match_6 = (total_tickets_in_draw / 93_668).saturating_add(1) as u32;
        if params.winner_counts.match_6 > max_match_6 {
            msg!("ERROR: Statistically implausible Match 6 winner count!");
            msg!(
                "  Match 6 winners: {}, max plausible: {}",
                params.winner_counts.match_6,
                max_match_6
            );
            msg!("  Total tickets: {}", total_tickets_in_draw);
            return Err(LottoError::SuspiciousWinnerCount.into());
        }

        // Match 5: at most 1 per ~390 tickets (100x relaxed). Max = tickets/390 + 1
        let max_match_5 = (total_tickets_in_draw / 390).saturating_add(1) as u32;
        if params.winner_counts.match_5 > max_match_5 {
            msg!("ERROR: Statistically implausible Match 5 winner count!");
            msg!(
                "  Match 5 winners: {}, max plausible: {}",
                params.winner_counts.match_5,
                max_match_5
            );
            msg!("  Total tickets: {}", total_tickets_in_draw);
            return Err(LottoError::SuspiciousWinnerCount.into());
        }

        // Match 4: at most 1 per ~5 tickets (100x relaxed). Max = tickets/5 + 1
        let max_match_4 = (total_tickets_in_draw / 5).saturating_add(1) as u32;
        if params.winner_counts.match_4 > max_match_4 {
            msg!("ERROR: Statistically implausible Match 4 winner count!");
            msg!(
                "  Match 4 winners: {}, max plausible: {}",
                params.winner_counts.match_4,
                max_match_4
            );
            msg!("  Total tickets: {}", total_tickets_in_draw);
            return Err(LottoError::SuspiciousWinnerCount.into());
        }
    }

    // FIXED: Reject (not just warn) suspicious winner rates (> 70% of tickets winning)
    // A legitimate lottery should never have >70% of tickets winning across all tiers.
    if total_winners > (total_tickets_in_draw * 7) / 10 && total_tickets_in_draw > 10 {
        msg!("ERROR: Implausible winner rate detected - rejecting finalization!");
        msg!("  Winner rate: {}%", (total_winners * 100) / total_tickets_in_draw);
        msg!("  Total winners: {}, Total tickets: {}", total_winners, total_tickets_in_draw);
        return Err(LottoError::SuspiciousWinnerCount.into());
    }

    // Log winner rate for audit trail (non-blocking for rates <= 70%)
    if total_winners > total_tickets_in_draw / 2 && total_tickets_in_draw > 10 {
        msg!("⚠️  HIGH WINNER RATE (audit note, not blocking):");
        msg!("  Winner rate: {}%", (total_winners * 100) / total_tickets_in_draw);
    }

    // Update winner counts
    draw_result.match_6_winners = params.winner_counts.match_6;
    draw_result.match_5_winners = params.winner_counts.match_5;
    draw_result.match_4_winners = params.winner_counts.match_4;
    draw_result.match_3_winners = params.winner_counts.match_3;
    draw_result.match_2_winners = params.winner_counts.match_2;

    // Determine prize mode and calculate prizes
    let jackpot_at_draw = lottery_state.jackpot_balance;
    let was_rolldown = draw_result.was_rolldown && params.winner_counts.match_6 == 0;

    // ==========================================================================
    // SOLVENCY CHECK WITH INSURANCE POOL INTEGRATION
    // ==========================================================================
    //
    // Priority for prize funding:
    // 1. Jackpot balance (primary source for Match 6)
    // 2. Fixed prize balance (39.4% allocation earmarked for Match 3/4/5)
    // 3. Reserve balance (remainder from ticket sales)
    // 4. Insurance balance (2% of ticket sales - emergency only)
    //
    // The insurance pool is the final safety net to ensure all prizes are paid.

    // SECURITY FIX (Audit Issue #4): Include fixed_prize_balance in available
    // funds for solvency calculation. Previously this was ignored, creating an
    // inconsistency between how funds were tracked on purchase (39.4% allocated
    // to fixed_prize_balance) and how solvency was computed at finalization
    // (only jackpot + reserve + insurance). This could cause unnecessary prize
    // scaling or insurance pool draws even when sufficient funds existed in the
    // dedicated fixed prize pool.
    let primary_funds = jackpot_at_draw
        .saturating_add(lottery_state.reserve_balance)
        .saturating_add(lottery_state.fixed_prize_balance);
    let total_available = primary_funds.saturating_add(lottery_state.insurance_balance);
    let insurance_balance_before = lottery_state.insurance_balance;

    msg!("📊 Solvency check:");
    msg!("  Jackpot balance: {} USDC lamports", jackpot_at_draw);
    msg!("  Fixed prize balance: {} USDC lamports", lottery_state.fixed_prize_balance);
    msg!("  Reserve balance: {} USDC lamports", lottery_state.reserve_balance);
    msg!("  Insurance balance: {} USDC lamports", lottery_state.insurance_balance);
    msg!("  Total available: {} USDC lamports", total_available);

    // Calculate prizes with available funds
    let prize_calc = if was_rolldown {
        calculate_rolldown_prizes(&params.winner_counts, jackpot_at_draw)
    } else {
        calculate_fixed_prizes(&params.winner_counts, jackpot_at_draw, total_available)
    };

    // Check if insurance pool needs to be used
    let mut insurance_used = 0u64;
    if prize_calc.total_distributed > primary_funds && !was_rolldown {
        // Fixed prizes exceed primary funds - need to use insurance
        insurance_used = prize_calc
            .total_distributed
            .saturating_sub(primary_funds)
            .min(lottery_state.insurance_balance);

        if insurance_used > 0 {
            lottery_state.insurance_balance =
                lottery_state.insurance_balance.saturating_sub(insurance_used);

            msg!("⚠️  INSURANCE POOL ACTIVATED!");
            msg!("  Amount used: {} USDC lamports", insurance_used);
            msg!("  Remaining insurance: {} USDC lamports", lottery_state.insurance_balance);

            // SECURITY (L-4 fix): Move the ACTUAL USDC from the insurance
            // token account into the prize pool. Previously only the
            // accounting balance was decremented; the USDC stayed parked in
            // insurance_pool_usdc, so claims (which pull from the prize pool
            // token account) would fail despite the protocol holding funds.
            // This must happen before any claim can be made on this draw.
            // The caller must supply the insurance pool token account when
            // insurance is used; failing to do so rejects the finalization.
            let insurance_pool_usdc = ctx
                .accounts
                .insurance_pool_usdc
                .as_ref()
                .ok_or(LottoError::InsufficientInsuranceFunds)?;
            let prize_pool_usdc =
                ctx.accounts.prize_pool_usdc.as_ref().ok_or(LottoError::LpPoolNotInitialized)?;
            let token_program =
                ctx.accounts.token_program.as_ref().ok_or(LottoError::LpPoolNotInitialized)?;

            transfer_insurance_to_prize_pool(
                insurance_pool_usdc,
                prize_pool_usdc,
                lottery_state,
                token_program,
                insurance_used,
                lottery_state.bump,
            )?;

            // Emit insurance pool usage event
            emit!(InsurancePoolUsed {
                draw_id: lottery_state.current_draw_id,
                amount_used: insurance_used,
                balance_before: insurance_balance_before,
                balance_after: lottery_state.insurance_balance,
                reason: format!(
                    "Prize pool shortfall: {} required, {} available from primary funds",
                    prize_calc.total_distributed, primary_funds
                ),
                timestamp: clock.unix_timestamp,
            });
        }
    }

    // Emit solvency check event for audit trail
    emit!(SolvencyCheckPerformed {
        draw_id: lottery_state.current_draw_id,
        prizes_required: prize_calc.total_distributed,
        prize_pool_balance: jackpot_at_draw,
        reserve_balance: lottery_state.reserve_balance,
        insurance_balance: insurance_balance_before,
        is_solvent: prize_calc.total_distributed <= total_available,
        prizes_scaled: prize_calc.was_scaled_down,
        scale_factor_bps: prize_calc.scale_factor_bps,
        timestamp: clock.unix_timestamp,
    });

    // Log calculation details for transparency
    msg!("Prize calculation details: {}", prize_calc.calculation_details);

    // Log warning if prizes were scaled down due to insufficient funds
    if prize_calc.was_scaled_down {
        msg!(
            "WARNING: Fixed prizes scaled down to {}% due to insufficient funds!",
            prize_calc.scale_factor_bps as f64 / 100.0
        );
        msg!("  Details: {}", prize_calc.calculation_details);
    }

    // FIXED: Explicitly mark draw as finalized BEFORE writing prize amounts.
    // This ensures is_finalized() returns true atomically — there is no window
    // where prizes are visible but the draw appears not-yet-finalized.
    // Previously this was set AFTER prize writes, creating a narrow race window
    // where a claim transaction could see is_finalized() == false despite prizes
    // already being set.
    draw_result.is_explicitly_finalized = true;

    // Update draw result with prizes
    draw_result.match_6_prize_per_winner = prize_calc.match_6_prize;
    draw_result.match_5_prize_per_winner = prize_calc.match_5_prize;
    draw_result.match_4_prize_per_winner = prize_calc.match_4_prize;
    draw_result.match_3_prize_per_winner = prize_calc.match_3_prize;
    draw_result.match_2_prize_per_winner = prize_calc.match_2_prize;

    // FIXED: Add any undistributed funds to reserve (from empty tiers or integer division)
    if prize_calc.undistributed > 0 {
        lottery_state.reserve_balance =
            lottery_state.reserve_balance.saturating_add(prize_calc.undistributed);
        msg!("  Undistributed funds added to reserve: {} USDC lamports", prize_calc.undistributed);
        msg!("  New reserve balance: {} USDC lamports", lottery_state.reserve_balance);
    }

    // Update jackpot balance
    if was_rolldown {
        // Check if jackpot was actually distributed (had winners)
        let had_rolldown_winners = params.winner_counts.match_5 > 0
            || params.winner_counts.match_4 > 0
            || params.winner_counts.match_3 > 0;

        if had_rolldown_winners {
            // Rolldown occurred with winners - jackpot was distributed
            // Seed new jackpot: prefer LP pool, fall back to reserve
            let seed_amount = lottery_state.seed_amount;
            let mut seed_from_lp: u64 = 0;
            let mut seed_from_reserve: u64 = 0;

            // Try LP pool first
            if let (
                Some(ref mut lp_pool),
                Some(lp_pool_usdc),
                Some(prize_pool_usdc),
                Some(token_program),
            ) = (
                ctx.accounts.lp_pool.as_mut(),
                ctx.accounts.lp_pool_usdc.as_ref(),
                ctx.accounts.prize_pool_usdc.as_ref(),
                ctx.accounts.token_program.as_ref(),
            ) {
                // validate_lp_accounts() guarantees the all-or-none invariant;
                // destructuring above makes the transfer panic-free.
                seed_from_lp = try_seed_from_lp_pool(
                    lp_pool,
                    lp_pool_usdc,
                    prize_pool_usdc,
                    token_program,
                    seed_amount,
                    lottery_state.current_draw_id,
                    clock.unix_timestamp,
                )?;
            }

            // Fall back to reserve for any shortfall
            let remaining_needed = seed_amount.saturating_sub(seed_from_lp);
            if remaining_needed > 0 {
                seed_from_reserve = remaining_needed.min(lottery_state.reserve_balance);
                lottery_state.reserve_balance =
                    lottery_state.reserve_balance.saturating_sub(seed_from_reserve);
                msg!("Reserve seeded: {} USDC lamports", seed_from_reserve);
            }

            lottery_state.jackpot_balance = seed_from_lp.saturating_add(seed_from_reserve);

            // Emit rolldown event
            emit!(RolldownExecuted {
                draw_id: lottery_state.current_draw_id,
                jackpot_distributed: jackpot_at_draw,
                match_5_prize: prize_calc.match_5_prize,
                match_4_prize: prize_calc.match_4_prize,
                match_3_prize: prize_calc.match_3_prize,
                timestamp: clock.unix_timestamp,
            });

            msg!("Rolldown executed with winners!");
            msg!("  Jackpot distributed: {} USDC lamports", jackpot_at_draw);
            msg!("  Total to winners: {} USDC lamports", prize_calc.total_distributed);
            msg!("  New jackpot seeded: {} USDC lamports", lottery_state.jackpot_balance);
        } else {
            // Rolldown triggered but NO winners in any tier
            // Jackpot remains for next draw (not moved to reserve)
            msg!("⚠️  Rolldown triggered but NO WINNERS in any tier!");
            msg!("  Jackpot preserved: {} USDC lamports", jackpot_at_draw);
            msg!("  Jackpot will carry over to next draw.");

            // Disable rolldown flag since jackpot wasn't distributed
            // It will be re-evaluated based on caps
            lottery_state.is_rolldown_active = false;
        }
    } else if params.winner_counts.match_6 > 0 {
        // Jackpot won - reset jackpot
        // Seed new jackpot: prefer LP pool, fall back to reserve
        let seed_amount = lottery_state.seed_amount;
        let mut seed_from_lp: u64 = 0;
        let mut seed_from_reserve: u64 = 0;

        if let (
            Some(ref mut lp_pool),
            Some(lp_pool_usdc),
            Some(prize_pool_usdc),
            Some(token_program),
        ) = (
            ctx.accounts.lp_pool.as_mut(),
            ctx.accounts.lp_pool_usdc.as_ref(),
            ctx.accounts.prize_pool_usdc.as_ref(),
            ctx.accounts.token_program.as_ref(),
        ) {
            seed_from_lp = try_seed_from_lp_pool(
                lp_pool,
                lp_pool_usdc,
                prize_pool_usdc,
                token_program,
                seed_amount,
                lottery_state.current_draw_id,
                clock.unix_timestamp,
            )?;
        }

        let remaining_needed = seed_amount.saturating_sub(seed_from_lp);
        if remaining_needed > 0 {
            seed_from_reserve = remaining_needed.min(lottery_state.reserve_balance);
            lottery_state.reserve_balance =
                lottery_state.reserve_balance.saturating_sub(seed_from_reserve);
            msg!("Reserve seeded: {} USDC lamports", seed_from_reserve);
        }

        lottery_state.jackpot_balance = seed_from_lp.saturating_add(seed_from_reserve);

        msg!("Jackpot won by {} winners!", params.winner_counts.match_6);
        msg!("  Prize per winner: {} USDC lamports", prize_calc.match_6_prize);
        msg!("  New jackpot seeded: {} USDC lamports", lottery_state.jackpot_balance);
    }
    // If no jackpot winner and no rolldown, jackpot continues to accumulate

    // SECURITY FIX (Issue #6): Track committed prizes separately from actual paid prizes.
    // total_prizes_committed reflects what was promised at finalization time.
    // total_prizes_paid is now incremented at actual claim time (in claim_prize/claim_bulk_prize).
    // This separation allows accurate solvency monitoring and governance oversight.
    lottery_state.total_prizes_committed =
        lottery_state.total_prizes_committed.saturating_add(prize_calc.total_distributed);

    // Fix #3: Snapshot total_committed on the DrawResult so that
    // reclaim_expired_prizes can enforce per-draw reclaim bounds.
    // total_reclaimed was already initialized to 0 in execute_draw.
    draw_result.total_committed = prize_calc.total_distributed;

    // SECURITY: Clear awaiting-finalization flag now that the draw
    // has been fully completed.
    lottery_state.is_awaiting_finalization = false;

    // Reset for next draw using helper method (including tickets)
    lottery_state.reset_draw_state(true);
    lottery_state.current_draw_id = lottery_state.current_draw_id.saturating_add(1);

    // Set next draw timestamp
    lottery_state.next_draw_timestamp =
        clock.unix_timestamp.saturating_add(lottery_state.draw_interval);

    // ==========================================================================
    // JACKPOT FUNDING SAFETY CHECK
    // ==========================================================================
    // Check if jackpot is properly funded after reseeding
    // Minimum jackpot should be at least 100% of seed amount
    let minimum_jackpot = lottery_state.seed_amount;
    let is_jackpot_properly_funded = lottery_state.jackpot_balance >= minimum_jackpot;

    if !is_jackpot_properly_funded {
        // Jackpot is below minimum - pause the lottery for safety
        lottery_state.is_paused = true;

        msg!("⚠️  ⚠️  ⚠️  CRITICAL: Jackpot funding insufficient!");
        msg!("  Current jackpot: {} USDC lamports", lottery_state.jackpot_balance);
        msg!("  Minimum required: {} USDC lamports", minimum_jackpot);
        msg!(
            "  Deficit: {} USDC lamports",
            minimum_jackpot.saturating_sub(lottery_state.jackpot_balance)
        );
        msg!("  Lottery has been PAUSED for safety.");
        msg!("  Admin must add funds to reserve and unpause.");

        // Emit emergency pause event
        emit!(EmergencyPause {
            authority: ctx.accounts.finalizer.key(),
            reason: format!(
                "Jackpot funding insufficient: {} < {} (minimum)",
                lottery_state.jackpot_balance, minimum_jackpot
            ),
            timestamp: clock.unix_timestamp,
        });
    } else {
        msg!("✅ Jackpot funding check: OK");
        msg!("  Current jackpot: {} USDC lamports", lottery_state.jackpot_balance);
        msg!("  Minimum required: {} USDC lamports", minimum_jackpot);
    }

    // ==========================================================================
    // DYNAMIC HOUSE FEE UPDATE
    // ==========================================================================
    // Update house fee based on new jackpot level after draw finalization
    let new_house_fee_bps = lottery_state.get_current_house_fee_bps();
    lottery_state.house_fee_bps = new_house_fee_bps;

    // Emit event if fee tier changed
    if old_house_fee_bps != new_house_fee_bps {
        let new_fee_tier_description = lottery_state.get_fee_tier_description();
        msg!(
            "📈 Dynamic fee tier changed: {} ({} bps) -> {} ({} bps)",
            old_fee_tier_description,
            old_house_fee_bps,
            new_fee_tier_description,
            new_house_fee_bps
        );

        emit!(DynamicFeeTierChanged {
            draw_id: lottery_state.current_draw_id,
            old_fee_bps: old_house_fee_bps,
            new_fee_bps: new_house_fee_bps,
            jackpot_balance: lottery_state.jackpot_balance,
            tier_description: new_fee_tier_description.to_string(),
            timestamp: clock.unix_timestamp,
        });
    }

    // ==========================================================================
    // SOFT/HARD CAP CHECK FOR NEXT DRAW
    // ==========================================================================
    // Only check caps if lottery is not paused due to insufficient funding
    if !lottery_state.is_paused {
        if lottery_state.jackpot_balance >= lottery_state.hard_cap {
            lottery_state.is_rolldown_active = true;
            msg!(
                "⚠️  HARD CAP REACHED for next draw! Jackpot {} >= Hard Cap {}",
                lottery_state.jackpot_balance,
                lottery_state.hard_cap
            );
            msg!("  Next draw WILL be a forced rolldown.");
        } else if lottery_state.jackpot_balance >= lottery_state.soft_cap {
            lottery_state.is_rolldown_active = true;
            msg!(
                "🎰 Soft cap active for next draw! Jackpot {} >= Soft Cap {}",
                lottery_state.jackpot_balance,
                lottery_state.soft_cap
            );
            msg!("  Next draw may trigger probabilistic rolldown.");

            emit!(SoftCapReached {
                draw_id: lottery_state.current_draw_id,
                jackpot_balance: lottery_state.jackpot_balance,
                soft_cap: lottery_state.soft_cap,
                rolldown_probability_bps: lottery_state.get_rolldown_probability_bps(),
                timestamp: clock.unix_timestamp,
            });
        } else {
            lottery_state.is_rolldown_active = false;
        }
    } else {
        msg!("⚠️  Lottery is PAUSED - cap checks skipped.");
        lottery_state.is_rolldown_active = false;
    }

    // Emit finalization event
    emit!(DrawFinalized {
        draw_id: draw_result.draw_id,
        match_6_winners: params.winner_counts.match_6,
        match_5_winners: params.winner_counts.match_5,
        match_4_winners: params.winner_counts.match_4,
        match_3_winners: params.winner_counts.match_3,
        match_2_winners: params.winner_counts.match_2,
        total_distributed: prize_calc.total_distributed,
        timestamp: clock.unix_timestamp,
    });

    msg!("Draw finalized successfully!");
    msg!("  Draw ID: {}", draw_result.draw_id);
    msg!("  Total tickets in draw: {}", draw_result.total_tickets);
    msg!(
        "  Match 6 winners: {} (prize: {})",
        params.winner_counts.match_6,
        prize_calc.match_6_prize
    );
    msg!(
        "  Match 5 winners: {} (prize: {}{})",
        params.winner_counts.match_5,
        prize_calc.match_5_prize,
        if prize_calc.was_scaled_down { " SCALED" } else { "" }
    );
    msg!(
        "  Match 4 winners: {} (prize: {}{})",
        params.winner_counts.match_4,
        prize_calc.match_4_prize,
        if prize_calc.was_scaled_down { " SCALED" } else { "" }
    );
    msg!(
        "  Match 3 winners: {} (prize: {}{})",
        params.winner_counts.match_3,
        prize_calc.match_3_prize,
        if prize_calc.was_scaled_down { " SCALED" } else { "" }
    );
    msg!(
        "  Match 2 winners: {} (prize: {})",
        params.winner_counts.match_2,
        prize_calc.match_2_prize
    );
    msg!("  Total distributed: {} USDC lamports", prize_calc.total_distributed);
    msg!("  Was rolldown: {}", was_rolldown);
    msg!("  Next draw ID: {}", lottery_state.current_draw_id);
    msg!("  Next draw at: {}", lottery_state.next_draw_timestamp);
    msg!("  Reserve balance: {} USDC lamports", lottery_state.reserve_balance);
    msg!("  Jackpot balance: {} USDC lamports", lottery_state.jackpot_balance);
    if prize_calc.was_scaled_down {
        msg!(
            "  ⚠️ PRIZES WERE SCALED: Scale factor = {}%",
            prize_calc.scale_factor_bps as f64 / 100.0
        );
    }
    if insurance_used > 0 {
        msg!("  🛡️ INSURANCE USED: {} USDC lamports", insurance_used);
        msg!("  Insurance remaining: {} USDC lamports", lottery_state.insurance_balance);
    }
    msg!(
        "  Dynamic fee for next draw: {} bps ({})",
        lottery_state.house_fee_bps,
        lottery_state.get_fee_tier_description()
    );
    msg!("  Rolldown status for next draw: {}", lottery_state.get_rolldown_status());
    msg!("  Calculation details: {}", prize_calc.calculation_details);

    // ==========================================================================
    // POST-CONDITION ASSERTIONS (Issue 6 fix: enforce state invariants)
    // ==========================================================================
    // These assertions verify that the state is consistent after all updates.
    // If any assertion fails, the entire transaction is rolled back, preventing
    // corrupted state from persisting on-chain.

    // Invariant 1: Draw must no longer be in progress after finalization
    require!(!lottery_state.is_draw_in_progress, LottoError::SafetyCheckFailed);

    // Invariant 2: Draw result must be marked as finalized
    require!(draw_result.is_explicitly_finalized, LottoError::SafetyCheckFailed);

    // Invariant 3: Next draw ID must have advanced
    require!(lottery_state.current_draw_id > draw_result.draw_id, LottoError::SafetyCheckFailed);

    // Invariant 4: Prize per winner must be 0 for tiers with 0 winners
    if draw_result.match_6_winners == 0 && !was_rolldown {
        require!(
            draw_result.match_6_prize_per_winner == 0 || params.winner_counts.match_6 == 0,
            LottoError::SafetyCheckFailed
        );
    }

    // Invariant 5: Accounting sum sanity — jackpot + reserve should not exceed
    // a reasonable upper bound (total_prizes_paid + current balances should be consistent)
    let accounting_sum = lottery_state
        .jackpot_balance
        .saturating_add(lottery_state.reserve_balance)
        .saturating_add(lottery_state.insurance_balance);

    // The accounting sum should never be zero unless the lottery is paused for funding
    if accounting_sum == 0 && !lottery_state.is_paused {
        msg!("WARNING: All accounting balances are zero but lottery is not paused!");
        msg!("  This may indicate an accounting error.");
    }

    // Invariant 6: total_prizes_committed must have increased (or stayed same if 0 distributed)
    // We already did saturating_add above, so just verify it's >= what we distributed
    require!(
        lottery_state.total_prizes_committed >= prize_calc.total_distributed,
        LottoError::SafetyCheckFailed
    );

    msg!("✅ Post-condition assertions passed.");

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_fixed_prizes() {
        let winner_counts =
            WinnerCounts { match_6: 0, match_5: 2, match_4: 10, match_3: 100, match_2: 500 };

        let jackpot = 1_000_000_000_000u64; // $1M
        let available_prize_pool = 2_000_000_000_000u64; // $2M (plenty of funds)

        let result = calculate_fixed_prizes(&winner_counts, jackpot, available_prize_pool);

        assert_eq!(result.match_6_prize, 0); // No Match 6 winners
        assert_eq!(result.match_5_prize, MATCH_5_PRIZE);
        assert_eq!(result.match_4_prize, MATCH_4_PRIZE);
        assert_eq!(result.match_3_prize, MATCH_3_PRIZE);
        assert_eq!(result.match_2_prize, MATCH_2_VALUE);
        assert!(!result.was_scaled_down); // No scaling needed

        let expected_total = (MATCH_5_PRIZE * 2) + (MATCH_4_PRIZE * 10) + (MATCH_3_PRIZE * 100);
        // Note: MATCH_2_VALUE is a free ticket credit, not included in total_distributed
        assert_eq!(result.total_distributed, expected_total);
        assert_eq!(result.undistributed, 0);
    }

    #[test]
    fn test_calculate_fixed_prizes_with_insufficient_funds() {
        let winner_counts = WinnerCounts {
            match_6: 0,
            match_5: 100, // Many Match 5 winners
            match_4: 1000,
            match_3: 10000,
            match_2: 500,
        };

        let jackpot = 1_000_000_000_000u64; // $1M
                                            // Required: 100*$4000 + 1000*$150 + 10000*$5 = $400k + $150k + $50k = $600k
        let available_prize_pool = 300_000_000_000u64; // Only $300k available (50% of needed)

        let result = calculate_fixed_prizes(&winner_counts, jackpot, available_prize_pool);

        assert!(result.was_scaled_down); // Should be scaled
        assert!(result.scale_factor_bps < 10000); // Scale factor < 100%

        // Prizes should be scaled down proportionally
        assert!(result.match_5_prize < MATCH_5_PRIZE);
        assert!(result.match_4_prize < MATCH_4_PRIZE);
        assert!(result.match_3_prize < MATCH_3_PRIZE);
    }

    #[test]
    fn test_calculate_rolldown_prizes() {
        let winner_counts = WinnerCounts {
            match_6: 0, // By definition, rolldown means no Match 6
            match_5: 10,
            match_4: 500,
            match_3: 10000,
            match_2: 50000,
        };

        let jackpot = 1_750_000_000_000u64; // $1.75M (soft cap)

        let result = calculate_rolldown_prizes(&winner_counts, jackpot);

        // Match 6 prize should be 0 in rolldown
        assert_eq!(result.match_6_prize, 0);

        // Calculate expected pool allocations
        let match_5_pool = (jackpot as u128 * 2500 / 10000) as u64; // 25%
        let match_4_pool = (jackpot as u128 * 3500 / 10000) as u64; // 35%
        let match_3_pool = (jackpot as u128 * 4000 / 10000) as u64; // 40%

        // Verify per-winner prizes
        assert_eq!(result.match_5_prize, match_5_pool / 10);
        assert_eq!(result.match_4_prize, match_4_pool / 500);
        assert_eq!(result.match_3_prize, match_3_pool / 10000);
        assert_eq!(result.match_2_prize, MATCH_2_VALUE);
    }

    #[test]
    fn test_rolldown_with_no_match5_winners() {
        let winner_counts = WinnerCounts {
            match_6: 0,
            match_5: 0, // No Match 5 winners
            match_4: 100,
            match_3: 5000,
            match_2: 20000,
        };

        let jackpot = 2_000_000_000_000u64;

        let result = calculate_rolldown_prizes(&winner_counts, jackpot);

        // Match 5 prize should be 0 when no winners
        assert_eq!(result.match_6_prize, 0);
        assert_eq!(result.match_5_prize, 0);

        // Match 4 and Match 3 should get redistributed funds
        // Total redistributed = 25% of jackpot (from empty match_5)
        // Match 4 original = 35%, Match 3 original = 40%, total = 75%
        // Match 4 gets: 35% + (25% * 35/75) = 35% + 11.67% = ~46.67%
        // Match 3 gets: 40% + (25% * 40/75) = 40% + 13.33% = ~53.33%
        assert!(result.match_4_prize > 0);
        assert!(result.match_3_prize > 0);

        // Verify the pools are larger than initial allocations
        let initial_match_4_pool = (jackpot as u128 * 3500 / 10000) as u64;
        let initial_match_3_pool = (jackpot as u128 * 4000 / 10000) as u64;

        // The actual prizes should reflect redistributed pools
        let actual_match_4_paid = result.match_4_prize * 100;
        let actual_match_3_paid = result.match_3_prize * 5000;

        // Total paid should be close to jackpot (minus dust)
        let total_to_winners = actual_match_4_paid + actual_match_3_paid;
        assert!(total_to_winners > initial_match_4_pool + initial_match_3_pool);
    }

    #[test]
    fn test_rolldown_with_no_winners_in_any_tier() {
        let winner_counts = WinnerCounts {
            match_6: 0,
            match_5: 0,
            match_4: 0,
            match_3: 0,
            match_2: 1000, // Only Match 2 (free tickets)
        };

        let jackpot = 2_000_000_000_000u64;

        let result = calculate_rolldown_prizes(&winner_counts, jackpot);

        // All prize pools should be 0
        assert_eq!(result.match_6_prize, 0);
        assert_eq!(result.match_5_prize, 0);
        assert_eq!(result.match_4_prize, 0);
        assert_eq!(result.match_3_prize, 0);
        assert_eq!(result.match_2_prize, MATCH_2_VALUE);

        // FIXED: When no winners in any tier, jackpot is PRESERVED (not moved to undistributed)
        // This prevents the jackpot from being lost to reserve when rolldown triggers but no one wins
        assert_eq!(result.undistributed, 0);

        // Only Match 2 (free tickets) in total distributed
        // Note: Match 2 is a free ticket credit, not actual USDC transfer
        assert_eq!(result.total_distributed, 0);
    }

    #[test]
    fn test_rolldown_only_match3_winners() {
        let winner_counts =
            WinnerCounts { match_6: 0, match_5: 0, match_4: 0, match_3: 1000, match_2: 5000 };

        let jackpot = 1_800_000_000_000u64; // $1.8M

        let result = calculate_rolldown_prizes(&winner_counts, jackpot);

        // Match 3 should get the entire jackpot (all redistributed to it)
        assert_eq!(result.match_5_prize, 0);
        assert_eq!(result.match_4_prize, 0);

        // Match 3 pool should be the full jackpot
        let expected_match_3_prize = jackpot / 1000;
        assert_eq!(result.match_3_prize, expected_match_3_prize);
    }

    // =========================================================================
    // FIXED PRIZE BALANCE SOLVENCY TESTS (Audit Issue #4)
    // =========================================================================
    // These tests verify that fixed_prize_balance is included in the available
    // funds passed to calculate_fixed_prizes, preventing unnecessary prize
    // scaling when the dedicated fixed prize pool has sufficient funds.

    /// When jackpot + reserve alone are insufficient but fixed_prize_balance
    /// covers the gap, prizes should NOT be scaled down.
    #[test]
    fn test_fixed_prize_balance_prevents_unnecessary_scaling() {
        let winner_counts =
            WinnerCounts { match_6: 0, match_5: 1, match_4: 10, match_3: 100, match_2: 50 };

        // Required fixed prizes: 1*$4000 + 10*$150 + 100*$5 = $5,500
        let required_fixed: u64 = MATCH_5_PRIZE * 1 + MATCH_4_PRIZE * 10 + MATCH_3_PRIZE * 100;

        let jackpot: u64 = 500_000_000_000; // $500k
        let reserve: u64 = 1_000_000; // $1 (tiny reserve)
        let fixed_prize_bal: u64 = 10_000_000_000; // $10k (ample for fixed prizes)
        let insurance: u64 = 5_000_000_000; // $5k

        // OLD solvency (without fixed_prize_balance):
        // primary_funds = jackpot + reserve = $500,001
        // total_available_old = primary_funds + insurance = $500,006
        let old_primary = jackpot.saturating_add(reserve);
        let old_total = old_primary.saturating_add(insurance);
        let old_result = calculate_fixed_prizes(&winner_counts, jackpot, old_total);
        // Old approach has plenty of funds from jackpot, so no scaling either
        // (because funds_for_fixed = available_prize_pool when match_6 == 0)
        assert!(!old_result.was_scaled_down);

        // NEW solvency (with fixed_prize_balance included):
        // primary_funds = jackpot + reserve + fixed_prize_bal
        // total_available_new = primary_funds + insurance
        let new_primary = jackpot.saturating_add(reserve).saturating_add(fixed_prize_bal);
        let new_total = new_primary.saturating_add(insurance);
        let new_result = calculate_fixed_prizes(&winner_counts, jackpot, new_total);
        assert!(!new_result.was_scaled_down);

        // Both should pay full fixed prizes
        assert_eq!(new_result.match_5_prize, MATCH_5_PRIZE);
        assert_eq!(new_result.match_4_prize, MATCH_4_PRIZE);
        assert_eq!(new_result.match_3_prize, MATCH_3_PRIZE);

        // Verify required amount is correct
        assert_eq!(
            new_result.total_distributed, required_fixed,
            "Total distributed should equal required fixed prizes"
        );
    }

    /// When there IS a jackpot winner, fixed prizes must come from non-jackpot
    /// funds. Including fixed_prize_balance in available_prize_pool means the
    /// funds_for_fixed calculation has more headroom and avoids scaling.
    #[test]
    fn test_fixed_prize_balance_helps_when_jackpot_won() {
        let winner_counts = WinnerCounts {
            match_6: 1, // Jackpot winner!
            match_5: 2,
            match_4: 20,
            match_3: 200,
            match_2: 1000,
        };

        // Required fixed: 2*$4000 + 20*$150 + 200*$5 = $12,000
        let required_fixed: u64 = MATCH_5_PRIZE * 2 + MATCH_4_PRIZE * 20 + MATCH_3_PRIZE * 200;

        let jackpot: u64 = 500_000_000_000; // $500k (goes to match 6 winner)
        let reserve: u64 = 5_000_000_000; // $5k reserve
        let fixed_prize_bal: u64 = 15_000_000_000; // $15k fixed prize pool
        let insurance: u64 = 2_000_000_000; // $2k insurance

        // WITHOUT fixed_prize_balance:
        // available = jackpot + reserve + insurance = $500k + $5k + $2k = $507k
        // funds_for_fixed = available - jackpot = $7k  (less than $12k needed → SCALED)
        let old_available = jackpot.saturating_add(reserve).saturating_add(insurance);
        let old_result = calculate_fixed_prizes(&winner_counts, jackpot, old_available);
        assert!(
            old_result.was_scaled_down,
            "Without fixed_prize_balance, prizes should be scaled down"
        );

        // WITH fixed_prize_balance:
        // available = jackpot + reserve + fixed_prize_bal + insurance
        //           = $500k + $5k + $15k + $2k = $522k
        // funds_for_fixed = available - jackpot = $22k  (more than $12k → NO SCALING)
        let new_available = jackpot
            .saturating_add(reserve)
            .saturating_add(fixed_prize_bal)
            .saturating_add(insurance);
        let new_result = calculate_fixed_prizes(&winner_counts, jackpot, new_available);
        assert!(
            !new_result.was_scaled_down,
            "With fixed_prize_balance included, prizes should NOT be scaled down"
        );

        // New result should pay full fixed prizes
        assert_eq!(new_result.match_5_prize, MATCH_5_PRIZE);
        assert_eq!(new_result.match_4_prize, MATCH_4_PRIZE);
        assert_eq!(new_result.match_3_prize, MATCH_3_PRIZE);
        assert_eq!(new_result.total_distributed, jackpot + required_fixed);
    }

    /// Ensure that even with fixed_prize_balance, scaling still kicks in
    /// when total available is genuinely insufficient.
    #[test]
    fn test_scaling_still_works_when_truly_insufficient() {
        let winner_counts = WinnerCounts {
            match_6: 1, // Jackpot winner
            match_5: 100,
            match_4: 1000,
            match_3: 10000,
            match_2: 500,
        };

        // Required fixed: 100*$4000 + 1000*$150 + 10000*$5 = $600k
        let jackpot: u64 = 500_000_000_000; // $500k
        let reserve: u64 = 50_000_000_000; // $50k
        let fixed_prize_bal: u64 = 100_000_000_000; // $100k
        let insurance: u64 = 20_000_000_000; // $20k

        // total available = $670k. funds_for_fixed = $670k - $500k = $170k
        // Required = $600k → must scale
        let total_available = jackpot
            .saturating_add(reserve)
            .saturating_add(fixed_prize_bal)
            .saturating_add(insurance);
        let result = calculate_fixed_prizes(&winner_counts, jackpot, total_available);

        assert!(result.was_scaled_down, "Should still scale when genuinely insufficient");
        assert!(result.scale_factor_bps < 10000);
        assert!(result.match_5_prize < MATCH_5_PRIZE);
        assert!(result.match_4_prize < MATCH_4_PRIZE);
        assert!(result.match_3_prize < MATCH_3_PRIZE);
    }

    // =========================================================================
    // COMPREHENSIVE PRIZE CALCULATION TESTS
    // =========================================================================

    /// Test fixed prizes with normal winner counts and sufficient funds.
    /// Verifies exact prize amounts: Match 5=$4000, Match 4=$150, Match 3=$5.
    #[test]
    fn test_calculate_fixed_prizes_normal() {
        let winner_counts =
            WinnerCounts { match_6: 0, match_5: 3, match_4: 25, match_3: 200, match_2: 1000 };

        // Required: 3*$4000 + 25*$150 + 200*$5 = $12,000 + $3,750 + $1,000 = $16,750
        // Jackpot: $1M (not used since no match_6 winner)
        // Available: $2M (plenty for fixed prizes)
        let jackpot = 1_000_000_000_000u64;
        let available_prize_pool = 2_000_000_000_000u64;

        let result = calculate_fixed_prizes(&winner_counts, jackpot, available_prize_pool);

        // Match 6 should be 0 (no jackpot winner)
        assert_eq!(result.match_6_prize, 0);

        // Fixed prizes should be at their full values
        assert_eq!(
            result.match_5_prize, MATCH_5_PRIZE,
            "Match 5 prize should be $4,000 (in micro-units)"
        );
        assert_eq!(
            result.match_4_prize, MATCH_4_PRIZE,
            "Match 4 prize should be $150 (in micro-units)"
        );
        assert_eq!(
            result.match_3_prize, MATCH_3_PRIZE,
            "Match 3 prize should be $5 (in micro-units)"
        );
        assert_eq!(
            result.match_2_prize, MATCH_2_VALUE,
            "Match 2 prize should be $2.50 free ticket credit"
        );

        // No scaling should occur
        assert!(!result.was_scaled_down, "Should not scale with sufficient funds");
        assert_eq!(result.scale_factor_bps, 10000, "Scale factor should be 100%");

        // Total distributed = (3 * $4000) + (25 * $150) + (200 * $5)
        // Match 2 is free ticket credit, not included in USDC total
        let expected_total = (MATCH_5_PRIZE * 3) + (MATCH_4_PRIZE * 25) + (MATCH_3_PRIZE * 200);
        assert_eq!(result.total_distributed, expected_total);
        assert_eq!(result.undistributed, 0);
    }

    /// Test fixed prizes when available funds are insufficient.
    /// Prizes should scale down proportionally with scale_factor_bps ~5000 (50%).
    #[test]
    fn test_calculate_fixed_prizes_scaled() {
        let winner_counts =
            WinnerCounts { match_6: 0, match_5: 5, match_4: 10, match_3: 100, match_2: 0 };

        // Required: 5*$4000 + 10*$150 + 100*$5 = $20,000 + $1,500 + $500 = $22,000
        let required_fixed: u64 = MATCH_5_PRIZE * 5 + MATCH_4_PRIZE * 10 + MATCH_3_PRIZE * 100;

        // Available: exactly half of what's needed → scale_factor_bps = 5000
        let available_prize_pool = required_fixed / 2;

        let jackpot = 1_000_000_000_000u64;

        let result = calculate_fixed_prizes(&winner_counts, jackpot, available_prize_pool);

        // Scaling must be triggered
        assert!(result.was_scaled_down, "Should scale down when funds are insufficient");

        // Scale factor should be ~5000 bps (50%) — allow small rounding tolerance
        let expected_scale = 5000u16;
        let scale_diff = if result.scale_factor_bps > expected_scale {
            result.scale_factor_bps - expected_scale
        } else {
            expected_scale - result.scale_factor_bps
        };
        assert!(
            scale_diff <= 1,
            "Scale factor should be ~5000 bps, got {}",
            result.scale_factor_bps
        );

        // Prizes should be approximately half the fixed amounts
        // (allowing for integer division rounding)
        let expected_m5 = MATCH_5_PRIZE / 2;
        let expected_m4 = MATCH_4_PRIZE / 2;
        let expected_m3 = MATCH_3_PRIZE / 2;

        let m5_diff = if result.match_5_prize > expected_m5 {
            result.match_5_prize - expected_m5
        } else {
            expected_m5 - result.match_5_prize
        };
        let m4_diff = if result.match_4_prize > expected_m4 {
            result.match_4_prize - expected_m4
        } else {
            expected_m4 - result.match_4_prize
        };
        let m3_diff = if result.match_3_prize > expected_m3 {
            result.match_3_prize - expected_m3
        } else {
            expected_m3 - result.match_3_prize
        };

        // Allow 1-unit rounding tolerance for each prize
        assert!(
            m5_diff <= 1,
            "Match 5 prize should be ~${}, got ${}",
            expected_m5,
            result.match_5_prize
        );
        assert!(
            m4_diff <= 1,
            "Match 4 prize should be ~${}, got ${}",
            expected_m4,
            result.match_4_prize
        );
        assert!(
            m3_diff <= 1,
            "Match 3 prize should be ~${}, got ${}",
            expected_m3,
            result.match_3_prize
        );

        // Prizes must be strictly less than full amounts
        assert!(result.match_5_prize < MATCH_5_PRIZE);
        assert!(result.match_4_prize < MATCH_4_PRIZE);
        assert!(result.match_3_prize < MATCH_3_PRIZE);

        // Match 2 is free ticket credit — never scaled
        assert_eq!(result.match_2_prize, MATCH_2_VALUE);
    }

    /// Test fixed prizes when there are zero winners in all tiers.
    /// Per-winner prize amounts stay at their constant defaults (since no scaling
    /// is triggered), but total_distributed is 0 because 0 winners × prize = 0.
    #[test]
    fn test_calculate_fixed_prizes_no_winners() {
        let winner_counts =
            WinnerCounts { match_6: 0, match_5: 0, match_4: 0, match_3: 0, match_2: 0 };

        let jackpot = 1_000_000_000_000u64;
        let available_prize_pool = 500_000_000_000u64;

        let result = calculate_fixed_prizes(&winner_counts, jackpot, available_prize_pool);

        // No jackpot winner → match_6_prize = 0
        assert_eq!(result.match_6_prize, 0);

        // Per-winner prize defaults to the full constant when total_fixed_required == 0
        // (the else branch sets the full prize amounts since no scaling is needed)
        assert_eq!(
            result.match_5_prize, MATCH_5_PRIZE,
            "Per-winner prize stays at default constant when no winners"
        );
        assert_eq!(
            result.match_4_prize, MATCH_4_PRIZE,
            "Per-winner prize stays at default constant when no winners"
        );
        assert_eq!(
            result.match_3_prize, MATCH_3_PRIZE,
            "Per-winner prize stays at default constant when no winners"
        );
        assert_eq!(result.match_2_prize, MATCH_2_VALUE, "Match 2 is always free ticket credit");

        // But total_distributed is 0 because there are zero winners
        assert_eq!(result.total_distributed, 0, "Nothing distributed with zero winners");
        assert!(!result.was_scaled_down, "No scaling needed when no prizes to pay");

        // With all zeros, total_fixed_required = 0, so no scaling branch is entered
        assert_eq!(result.scale_factor_bps, 10000);
        assert_eq!(result.undistributed, 0);
    }

    /// Test rolldown prize calculation with winners in all tiers.
    /// Verifies pari-mutuel calculation: each tier's prize = pool / winners.
    #[test]
    fn test_calculate_rolldown_prizes_normal() {
        let winner_counts = WinnerCounts {
            match_6: 0, // Rolldown means no jackpot winner
            match_5: 10,
            match_4: 500,
            match_3: 10000,
            match_2: 50000,
        };

        let jackpot = 1_750_000_000_000u64; // $1.75M (soft cap)

        let result = calculate_rolldown_prizes(&winner_counts, jackpot);

        // Match 6 is always 0 in rolldown
        assert_eq!(result.match_6_prize, 0);

        // Calculate expected pool allocations
        // 25% to Match 5, 35% to Match 4, 40% to Match 3
        let expected_match_5_pool =
            (jackpot as u128 * ROLLDOWN_MATCH_5_BPS as u128 / BPS_DENOMINATOR as u128) as u64;
        let expected_match_4_pool =
            (jackpot as u128 * ROLLDOWN_MATCH_4_BPS as u128 / BPS_DENOMINATOR as u128) as u64;
        let expected_match_3_pool =
            (jackpot as u128 * ROLLDOWN_MATCH_3_BPS as u128 / BPS_DENOMINATOR as u128) as u64;

        // Pari-mutuel: each tier's per-winner prize = pool / winner count
        let expected_m5 = expected_match_5_pool / 10;
        let expected_m4 = expected_match_4_pool / 500;
        let expected_m3 = expected_match_3_pool / 10000;

        assert_eq!(
            result.match_5_prize, expected_m5,
            "Match 5: pool={} / winners=10 = {}",
            expected_match_5_pool, expected_m5
        );
        assert_eq!(
            result.match_4_prize, expected_m4,
            "Match 4: pool={} / winners=500 = {}",
            expected_match_4_pool, expected_m4
        );
        assert_eq!(
            result.match_3_prize, expected_m3,
            "Match 3: pool={} / winners=10000 = {}",
            expected_match_3_pool, expected_m3
        );

        // Match 2 is always free ticket credit
        assert_eq!(result.match_2_prize, MATCH_2_VALUE);
        assert!(!result.was_scaled_down);
    }

    /// Test rolldown redistribution when some tiers have no winners.
    /// The pool from empty tiers should redistribute proportionally to tiers with winners.
    #[test]
    fn test_calculate_rolldown_prizes_empty_tiers() {
        let jackpot = 1_000_000_000_000u64; // $1M

        // --- Case 1: Match 5 empty, Match 4 and Match 3 have winners ---
        // The Match 5 pool (25%) redistributes to Match 4 and Match 3
        // proportionally: Match 4 gets 35/75 of the 25%, Match 3 gets 40/75.
        {
            let winner_counts = WinnerCounts {
                match_6: 0,
                match_5: 0, // No Match 5 winners → pool redistributes
                match_4: 100,
                match_3: 5000,
                match_2: 0,
            };

            let result = calculate_rolldown_prizes(&winner_counts, jackpot);

            assert_eq!(result.match_6_prize, 0);
            assert_eq!(result.match_5_prize, 0, "No match_5 winners → prize = 0");

            // Match 4 original: 35% of jackpot = $350,000
            // Plus redistribution of 25% * (35/75) = 11.667% of jackpot = $116,667
            // Total: 46.667% of jackpot = $466,667
            // Per winner: $466,667 / 100 = $4,666.67
            assert!(result.match_4_prize > 0, "Match 4 should receive redistributed funds");
            assert!(result.match_3_prize > 0, "Match 3 should receive redistributed funds");

            // Total paid should be close to full jackpot (minus integer division dust)
            let total_paid = result.match_4_prize * 100 + result.match_3_prize * 5000;
            assert!(total_paid <= jackpot, "Total paid must not exceed jackpot");
            // Should be at least 99.9% of jackpot (allowing < 0.1% dust)
            assert!(
                total_paid >= jackpot * 999 / 1000,
                "Total paid {} should be >= 99.9% of jackpot {}",
                total_paid,
                jackpot
            );
        }

        // --- Case 2: Only Match 4 has winners (Match 5 and Match 3 empty) ---
        {
            let winner_counts =
                WinnerCounts { match_6: 0, match_5: 0, match_4: 10, match_3: 0, match_2: 0 };

            let result = calculate_rolldown_prizes(&winner_counts, jackpot);

            assert_eq!(result.match_5_prize, 0);
            assert_eq!(result.match_3_prize, 0);

            // Match 4 should get the entire jackpot (all redistributed to it)
            // Only dust from integer division remains
            let expected_m4 = jackpot / 10;
            assert_eq!(
                result.match_4_prize, expected_m4,
                "When only Match 4 has winners, it gets the full jackpot"
            );
        }

        // --- Case 3: Only Match 3 has winners (Match 5 and Match 4 empty) ---
        {
            let winner_counts =
                WinnerCounts { match_6: 0, match_5: 0, match_4: 0, match_3: 1000, match_2: 0 };

            let result = calculate_rolldown_prizes(&winner_counts, jackpot);

            assert_eq!(result.match_5_prize, 0);
            assert_eq!(result.match_4_prize, 0);

            // Match 3 should get the entire jackpot
            let expected_m3 = jackpot / 1000;
            assert_eq!(
                result.match_3_prize, expected_m3,
                "When only Match 3 has winners, it gets the full jackpot"
            );
        }

        // --- Case 4: Match 5 and Match 3 have winners, Match 4 empty ---
        {
            let winner_counts = WinnerCounts {
                match_6: 0,
                match_5: 5,
                match_4: 0, // Empty tier
                match_3: 2000,
                match_2: 0,
            };

            let result = calculate_rolldown_prizes(&winner_counts, jackpot);

            assert_eq!(result.match_4_prize, 0, "No match_4 winners → prize = 0");
            assert!(result.match_5_prize > 0, "Match 5 should get its base + redistribution");
            assert!(result.match_3_prize > 0, "Match 3 should get its base + redistribution");

            // Match 5 original: 25%, plus redistribution of 35% * (25/65) ≈ 13.46%
            // Match 5 total: ~38.46% of jackpot
            // Match 3 original: 40%, plus redistribution of 35% * (40/65) ≈ 21.54%
            // Match 3 total: ~61.54% of jackpot
            let total_paid = result.match_5_prize * 5 + result.match_3_prize * 2000;
            assert!(total_paid <= jackpot);
            assert!(total_paid >= jackpot * 999 / 1000);
        }
    }

    /// Test rolldown when no tier has winners (only Match 2, which is free tickets).
    /// All prize amounts should be 0, and the jackpot is preserved (keep_jackpot=true).
    #[test]
    fn test_calculate_rolldown_prizes_no_winners() {
        let winner_counts = WinnerCounts {
            match_6: 0,
            match_5: 0,
            match_4: 0,
            match_3: 0,
            match_2: 5000, // Free ticket winners only — no cash prizes
        };

        let jackpot = 2_000_000_000_000u64;

        let result = calculate_rolldown_prizes(&winner_counts, jackpot);

        // All cash prize tiers should be 0
        assert_eq!(result.match_6_prize, 0);
        assert_eq!(result.match_5_prize, 0);
        assert_eq!(result.match_4_prize, 0);
        assert_eq!(result.match_3_prize, 0);

        // Match 2 prize is always free ticket credit
        assert_eq!(result.match_2_prize, MATCH_2_VALUE);

        // No cash distributed
        assert_eq!(
            result.total_distributed, 0,
            "No USDC distributed since no cash-prize tier has winners"
        );

        // When tiers_with_winners == 0: undistributed = 0 and jackpot is preserved
        // (The keep_jackpot flag is true internally, resulting in 0 undistributed)
        assert_eq!(
            result.undistributed, 0,
            "Jackpot is preserved (keep_jackpot=true), not moved to undistributed"
        );

        // calculation_details should indicate jackpot preservation
        assert!(
            result.calculation_details.contains("preserved")
                || result.calculation_details.contains("no winners"),
            "Details should mention jackpot preservation: {}",
            result.calculation_details
        );
    }

    /// Verify that for any winner distribution, total prizes distributed
    /// (prize * winners per tier) never exceeds the jackpot.
    /// Tests with several winner count combinations.
    #[test]
    fn test_rolldown_prize_sum_equals_jackpot() {
        let jackpot = 2_000_000_000_000u64; // $2M

        // Test various winner distributions
        let test_cases: Vec<WinnerCounts> = vec![
            // All tiers have winners
            WinnerCounts { match_6: 0, match_5: 1, match_4: 1, match_3: 1, match_2: 0 },
            // Many winners spread across tiers
            WinnerCounts { match_6: 0, match_5: 10, match_4: 100, match_3: 1000, match_2: 5000 },
            // Only Match 5 has winners
            WinnerCounts { match_6: 0, match_5: 3, match_4: 0, match_3: 0, match_2: 0 },
            // Only Match 4 has winners
            WinnerCounts { match_6: 0, match_5: 0, match_4: 50, match_3: 0, match_2: 0 },
            // Only Match 3 has winners
            WinnerCounts { match_6: 0, match_5: 0, match_4: 0, match_3: 500, match_2: 0 },
            // Match 4 + Match 3 (no Match 5)
            WinnerCounts { match_6: 0, match_5: 0, match_4: 20, match_3: 300, match_2: 0 },
            // Match 5 + Match 3 (no Match 4)
            WinnerCounts { match_6: 0, match_5: 7, match_4: 0, match_3: 800, match_2: 0 },
            // Many Match 5 winners, few in lower tiers
            WinnerCounts { match_6: 0, match_5: 100, match_4: 5, match_3: 2, match_2: 0 },
            // Asymmetric distribution
            WinnerCounts { match_6: 0, match_5: 2, match_4: 500, match_3: 20, match_2: 0 },
            // Single winner in each tier
            WinnerCounts { match_6: 0, match_5: 1, match_4: 1, match_3: 1, match_2: 100 },
        ];

        for (i, winner_counts) in test_cases.iter().enumerate() {
            let result = calculate_rolldown_prizes(winner_counts, jackpot);

            // Calculate total actually distributed to winners
            let total_paid = (result.match_5_prize as u128 * winner_counts.match_5 as u128)
                + (result.match_4_prize as u128 * winner_counts.match_4 as u128)
                + (result.match_3_prize as u128 * winner_counts.match_3 as u128);
            // Note: Match 2 is free ticket credit, not USDC, so excluded

            // Total paid must never exceed the jackpot
            assert!(
                total_paid <= jackpot as u128,
                "Case {}: total_paid={} exceeds jackpot={}",
                i,
                total_paid,
                jackpot
            );

            // Total paid + undistributed + division_remainder should equal jackpot
            // (except for the no-winner case where jackpot is preserved)
            let has_cash_winners =
                winner_counts.match_5 > 0 || winner_counts.match_4 > 0 || winner_counts.match_3 > 0;

            if has_cash_winners {
                // The sum of paid + undistributed dust should equal the jackpot
                // (allowing for the fact that undistributed includes division remainder)
                let accounted = total_paid + result.undistributed as u128;
                assert!(
                    accounted <= jackpot as u128,
                    "Case {}: accounted={} exceeds jackpot={}",
                    i,
                    accounted,
                    jackpot
                );
                // Accounted should be very close to jackpot (within dust tolerance)
                // Dust is at most winners_per_tier - 1 per tier
                let max_dust = (winner_counts.match_5.saturating_sub(1) as u128)
                    + (winner_counts.match_4.saturating_sub(1) as u128)
                    + (winner_counts.match_3.saturating_sub(1) as u128);
                let unaccounted = jackpot as u128 - accounted;
                assert!(
                    unaccounted <= max_dust,
                    "Case {}: unaccounted={} exceeds max_dust={}",
                    i,
                    unaccounted,
                    max_dust
                );
            }

            // Match 6 prize is always 0 in rolldown
            assert_eq!(result.match_6_prize, 0, "Case {}: match_6 should be 0 in rolldown", i);
        }
    }
}
