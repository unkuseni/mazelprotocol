//! Syndicate Wars Competition Instructions
//!
//! This module contains instructions for the Syndicate Wars monthly competition:
//! - initialize_syndicate_wars: Initialize competition for a month
//! - register_for_syndicate_wars: Register syndicate for competition
//! - update_syndicate_wars_stats: Update syndicate stats during competition
//! - finalize_syndicate_wars: Finalize competition and calculate rankings
//! - claim_syndicate_wars_prize: Claim competition prize for syndicate
//! - distribute_syndicate_wars_prizes: Distribute prizes to top syndicates

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::errors::LottoError;
use crate::events::{SyndicateWarsConcluded, SyndicateWarsFinalized};
use crate::state::{LotteryState, Syndicate, SyndicateWarsEntry, SyndicateWarsState};

// ============================================================================
// INITIALIZE SYNDICATE WARS INSTRUCTION
// ============================================================================

/// Parameters for initializing Syndicate Wars competition
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializeSyndicateWarsParams {
    /// Competition month (e.g., 202501 for January 2025)
    pub month: u64,
    /// Start timestamp (unix)
    pub start_timestamp: i64,
    /// End timestamp (unix)
    pub end_timestamp: i64,
    /// Minimum tickets to qualify
    pub min_tickets: u64,
}

/// Accounts required for initializing Syndicate Wars
#[derive(Accounts)]
#[instruction(params: InitializeSyndicateWarsParams)]
pub struct InitializeSyndicateWars<'info> {
    /// Lottery authority (admin)
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

    /// Syndicate Wars state account
    #[account(
        init,
        payer = authority,
        space = 8 + std::mem::size_of::<SyndicateWarsState>(),
        seeds = [
            SYNDICATE_WARS_SEED,
            &params.month.to_le_bytes()
        ],
        bump
    )]
    pub syndicate_wars_state: Account<'info, SyndicateWarsState>,

    /// Prize pool USDC token account
    #[account(
        mut,
        seeds = [b"prize_pool_usdc"],
        bump
    )]
    pub prize_pool_usdc: Account<'info, TokenAccount>,

    /// Syndicate Wars prize pool USDC token account
    #[account(
        init,
        payer = authority,
        seeds = [
            SYNDICATE_WARS_SEED,
            b"prize_pool",
            &params.month.to_le_bytes()
        ],
        bump,
        token::mint = usdc_mint,
        token::authority = syndicate_wars_state
    )]
    pub wars_prize_pool_usdc: Account<'info, TokenAccount>,

    /// USDC mint
    pub usdc_mint: Account<'info, Mint>,

    /// Token program
    pub token_program: Program<'info, Token>,

    /// System program
    pub system_program: Program<'info, System>,
}

/// Initialize Syndicate Wars competition for a month
///
/// This instruction:
/// 1. Creates SyndicateWarsState account
/// 2. Transfers 1% of current prize pool to competition prize pool
/// 3. Sets competition parameters
///
/// # Arguments
/// * `ctx` - The context containing required accounts
/// * `params` - Competition initialization parameters
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler_initialize_syndicate_wars(
    ctx: Context<InitializeSyndicateWars>,
    params: InitializeSyndicateWarsParams,
) -> Result<()> {
    // Validate competition dates
    let current_time = Clock::get()?.unix_timestamp;
    require!(
        params.start_timestamp > current_time,
        LottoError::InvalidTimestamp
    );
    require!(
        params.end_timestamp > params.start_timestamp,
        LottoError::InvalidTimestamp
    );

    // Calculate competition duration (max 31 days)
    let duration = params.end_timestamp - params.start_timestamp;
    require!(duration <= 31 * 24 * 60 * 60, LottoError::InvalidDuration);

    // Calculate prize pool (1% of current prize pool)
    let total_prize_pool = ctx.accounts.lottery_state.get_available_prize_pool();
    let wars_prize_pool = (total_prize_pool as u128 * SYNDICATE_WARS_POOL_BPS as u128
        / BPS_DENOMINATOR as u128) as u64;

    require!(wars_prize_pool > 0, LottoError::InsufficientFunds);
    require!(
        ctx.accounts.prize_pool_usdc.amount >= wars_prize_pool,
        LottoError::InsufficientFunds
    );

    // Transfer prize pool to competition account using lottery_state as authority
    let lottery_bump = ctx.accounts.lottery_state.bump;
    let seeds = &[LOTTERY_SEED, &[lottery_bump]];
    let signer_seeds = &[&seeds[..]];

    let cpi_accounts = Transfer {
        from: ctx.accounts.prize_pool_usdc.to_account_info(),
        to: ctx.accounts.wars_prize_pool_usdc.to_account_info(),
        authority: ctx.accounts.lottery_state.to_account_info(),
    };

    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);

    token::transfer(cpi_ctx, wars_prize_pool)?;

    // Initialize Syndicate Wars state
    let state = &mut ctx.accounts.syndicate_wars_state;
    state.month = params.month;
    state.start_timestamp = params.start_timestamp;
    state.end_timestamp = params.end_timestamp;
    state.prize_pool = wars_prize_pool;
    state.registered_count = 0;
    state.min_tickets = params.min_tickets;
    state.is_active = true;
    state.bump = ctx.bumps.syndicate_wars_state;

    msg!("Syndicate Wars competition initialized!");
    msg!("  Month: {}", params.month);
    msg!("  Start: {}", params.start_timestamp);
    msg!("  End: {}", params.end_timestamp);
    msg!("  Prize pool: {} USDC lamports", wars_prize_pool);
    msg!("  Min tickets: {}", params.min_tickets);

    Ok(())
}

// ============================================================================
// REGISTER FOR SYNDICATE WARS INSTRUCTION
// ============================================================================

/// Accounts required for registering for Syndicate Wars
#[derive(Accounts)]
pub struct RegisterForSyndicateWars<'info> {
    /// Syndicate creator/manager
    #[account(mut)]
    pub manager: Signer<'info>,

    /// Syndicate account
    #[account(
        mut,
        seeds = [
            SYNDICATE_SEED,
            manager.key().as_ref(),
            &syndicate.syndicate_id.to_le_bytes()
        ],
        bump = syndicate.bump,
        constraint = syndicate.creator == manager.key() @ LottoError::Unauthorized
    )]
    pub syndicate: Account<'info, Syndicate>,

    /// Syndicate Wars state
    #[account(
        mut,
        seeds = [
            SYNDICATE_WARS_SEED,
            &syndicate_wars_state.month.to_le_bytes()
        ],
        bump = syndicate_wars_state.bump,
        constraint = syndicate_wars_state.is_active @ LottoError::SyndicateWarsNotActive
    )]
    pub syndicate_wars_state: Account<'info, SyndicateWarsState>,

    /// Syndicate Wars entry for this syndicate
    #[account(
        init,
        payer = manager,
        space = 8 + std::mem::size_of::<SyndicateWarsEntry>(),
        seeds = [
            SYNDICATE_WARS_SEED,
            b"entry",
            &syndicate_wars_state.month.to_le_bytes(),
            syndicate.key().as_ref()
        ],
        bump
    )]
    pub wars_entry: Account<'info, SyndicateWarsEntry>,

    /// System program
    pub system_program: Program<'info, System>,
}

/// Register syndicate for Syndicate Wars competition
///
/// This instruction:
/// 1. Validates competition is active
/// 2. Validates syndicate meets minimum requirements
/// 3. Creates SyndicateWarsEntry for tracking
///
/// # Arguments
/// * `ctx` - The context containing required accounts
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler_register_for_syndicate_wars(ctx: Context<RegisterForSyndicateWars>) -> Result<()> {
    let current_time = Clock::get()?.unix_timestamp;
    let state = &ctx.accounts.syndicate_wars_state;

    // Validate competition is open for registration
    require!(
        current_time >= state.start_timestamp && current_time <= state.end_timestamp,
        LottoError::SyndicateWarsNotActive
    );

    // Validate syndicate meets minimum requirements
    require!(
        ctx.accounts.syndicate.member_count >= 5,
        LottoError::InvalidSyndicateConfig
    );

    // Initialize entry
    let entry = &mut ctx.accounts.wars_entry;
    entry.syndicate = ctx.accounts.syndicate.key();
    entry.month = state.month;
    entry.tickets_purchased = 0;
    entry.prizes_won = 0;
    entry.win_count = 0;
    entry.win_rate = 0;
    entry.final_rank = None;
    entry.prize_claimed = false;
    entry.bump = ctx.bumps.wars_entry;

    // Update state
    let state = &mut ctx.accounts.syndicate_wars_state;
    state.registered_count = state.registered_count.saturating_add(1);

    msg!("Syndicate registered for Syndicate Wars!");
    msg!("  Syndicate: {}", ctx.accounts.syndicate.key());
    msg!("  Month: {}", state.month);
    msg!("  Registered count: {}", state.registered_count);

    Ok(())
}

// ============================================================================
// UPDATE SYNDICATE WARS STATS INSTRUCTION
// ============================================================================

/// Parameters for updating syndicate wars stats
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct UpdateSyndicateWarsStatsParams {
    /// Additional tickets purchased
    pub tickets_purchased: u64,
    /// Additional prizes won (USDC lamports)
    pub prizes_won: u64,
    /// Additional win count (Match 3+)
    pub win_count: u32,
}

/// Accounts required for updating syndicate wars stats
#[derive(Accounts)]
#[instruction(params: UpdateSyndicateWarsStatsParams)]
pub struct UpdateSyndicateWarsStats<'info> {
    /// Lottery authority (or automated oracle)
    pub updater: Signer<'info>,

    /// Lottery state
    #[account(
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump,
        constraint = lottery_state.authority == updater.key() @ LottoError::Unauthorized
    )]
    pub lottery_state: Account<'info, LotteryState>,

    /// Syndicate Wars state
    #[account(
        mut,
        seeds = [
            SYNDICATE_WARS_SEED,
            &syndicate_wars_state.month.to_le_bytes()
        ],
        bump = syndicate_wars_state.bump,
        constraint = syndicate_wars_state.is_active @ LottoError::SyndicateWarsNotActive
    )]
    pub syndicate_wars_state: Account<'info, SyndicateWarsState>,

    /// Syndicate Wars entry
    #[account(
        mut,
        seeds = [
            SYNDICATE_WARS_SEED,
            b"entry",
            &syndicate_wars_state.month.to_le_bytes(),
            syndicate.key().as_ref()
        ],
        bump = wars_entry.bump
    )]
    pub wars_entry: Account<'info, SyndicateWarsEntry>,

    /// Syndicate account (for validation)
    #[account(
        seeds = [
            SYNDICATE_SEED,
            syndicate.creator.as_ref(),
            &syndicate.syndicate_id.to_le_bytes()
        ],
        bump = syndicate.bump
    )]
    pub syndicate: Account<'info, Syndicate>,
}

/// Update syndicate statistics during competition
///
/// This instruction updates:
/// - Tickets purchased
/// - Prizes won
/// - Win count
/// - Calculates win rate
///
/// # Arguments
/// * `ctx` - The context containing required accounts
/// * `params` - Statistics update parameters
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler_update_syndicate_wars_stats(
    ctx: Context<UpdateSyndicateWarsStats>,
    params: UpdateSyndicateWarsStatsParams,
) -> Result<()> {
    let current_time = Clock::get()?.unix_timestamp;
    let state = &ctx.accounts.syndicate_wars_state;

    // Validate competition is still active
    require!(
        current_time <= state.end_timestamp,
        LottoError::SyndicateWarsNotActive
    );

    // Update entry
    let entry = &mut ctx.accounts.wars_entry;
    entry.tickets_purchased = entry
        .tickets_purchased
        .saturating_add(params.tickets_purchased);
    entry.prizes_won = entry.prizes_won.saturating_add(params.prizes_won);
    entry.win_count = entry.win_count.saturating_add(params.win_count);

    // Calculate win rate (fixed-point × 1,000,000)
    if entry.tickets_purchased > 0 {
        entry.win_rate =
            (entry.win_count as u128 * 1_000_000 / entry.tickets_purchased as u128) as u64;
    } else {
        entry.win_rate = 0;
    }

    msg!("Syndicate Wars stats updated!");
    msg!("  Syndicate: {}", entry.syndicate);
    msg!("  Tickets purchased: {}", entry.tickets_purchased);
    msg!("  Prizes won: {} USDC lamports", entry.prizes_won);
    msg!("  Win count: {}", entry.win_count);
    msg!("  Win rate: {:.6}", entry.win_rate as f64 / 1_000_000.0);

    Ok(())
}

// ============================================================================
// FINALIZE SYNDICATE WARS INSTRUCTION
// ============================================================================

/// Accounts required for finalizing Syndicate Wars
#[derive(Accounts)]
pub struct FinalizeSyndicateWars<'info> {
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

    /// Syndicate Wars state
    #[account(
        mut,
        seeds = [
            SYNDICATE_WARS_SEED,
            &syndicate_wars_state.month.to_le_bytes()
        ],
        bump = syndicate_wars_state.bump,
        constraint = syndicate_wars_state.is_active @ LottoError::SyndicateWarsNotActive
    )]
    pub syndicate_wars_state: Account<'info, SyndicateWarsState>,
}

/// Finalize Syndicate Wars competition
///
/// This instruction:
/// 1. Validates competition has ended
/// 2. Marks competition as inactive
/// 3. Emits finalization event
///
/// Note: Prize distribution happens separately via `distribute_syndicate_wars_prizes`
///
/// # Arguments
/// * `ctx` - The context containing required accounts
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler_finalize_syndicate_wars(ctx: Context<FinalizeSyndicateWars>) -> Result<()> {
    let current_time = Clock::get()?.unix_timestamp;
    let state = &mut ctx.accounts.syndicate_wars_state;

    // Validate competition has ended
    require!(
        current_time > state.end_timestamp,
        LottoError::SyndicateWarsNotActive
    );

    // Mark competition as inactive
    state.is_active = false;

    // Emit event
    emit!(SyndicateWarsFinalized {
        month: state.month,
        winner: Pubkey::default(), // Will be set during prize distribution
        total_prize: state.prize_pool,
        participants: state.registered_count,
        timestamp: current_time,
    });

    msg!("Syndicate Wars competition finalized!");
    msg!("  Month: {}", state.month);
    msg!("  Prize pool: {} USDC lamports", state.prize_pool);
    msg!("  Participants: {}", state.registered_count);

    Ok(())
}

// ============================================================================
// CLAIM SYNDICATE WARS PRIZE INSTRUCTION
// ============================================================================

/// Parameters for claiming syndicate wars prize
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ClaimSyndicateWarsPrizeParams {
    /// Rank of the syndicate (1-10)
    pub rank: u32,
}

/// Claim Syndicate Wars prize for syndicate
///
/// This instruction:
/// 1. Validates competition has ended and syndicate has a valid rank
/// 2. Calculates prize amount based on rank
/// 3. Transfers prize from competition pool to syndicate
/// 4. Marks prize as claimed
///
/// # Arguments
/// * `ctx` - The context containing required accounts
/// * `params` - Claim parameters
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler_claim_syndicate_wars_prize(
    ctx: Context<ClaimSyndicateWarsPrize>,
    params: ClaimSyndicateWarsPrizeParams,
) -> Result<()> {
    // Validate rank is 1-10
    require!(
        params.rank >= 1 && params.rank <= 10,
        LottoError::InvalidRank
    );

    // Calculate prize amount based on rank
    let prize_pool = ctx.accounts.syndicate_wars_state.prize_pool;
    let prize_amount = match params.rank {
        1 => prize_pool * 50 / 100,     // 50% for 1st place
        2 => prize_pool * 25 / 100,     // 25% for 2nd place
        3 => prize_pool * 15 / 100,     // 15% for 3rd place
        _ => prize_pool * 10 / 100 / 7, // 10% split among 4th-10th (7 places)
    };

    // Validate prize pool has enough funds
    require!(
        ctx.accounts.wars_prize_pool_usdc.amount >= prize_amount,
        LottoError::InsufficientFunds
    );

    // Transfer prize from competition pool to syndicate using syndicate_wars_state as authority
    let state = &ctx.accounts.syndicate_wars_state;
    let month_bytes = state.month.to_le_bytes();
    let state_bump = state.bump;
    let seeds = &[SYNDICATE_WARS_SEED, month_bytes.as_ref(), &[state_bump]];
    let signer_seeds = &[&seeds[..]];

    let cpi_accounts = Transfer {
        from: ctx.accounts.wars_prize_pool_usdc.to_account_info(),
        to: ctx.accounts.syndicate_usdc.to_account_info(),
        authority: ctx.accounts.syndicate_wars_state.to_account_info(),
    };

    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);

    token::transfer(cpi_ctx, prize_amount)?;

    // Mark prize as claimed
    let entry = &mut ctx.accounts.wars_entry;
    entry.prize_claimed = true;

    msg!("Syndicate Wars prize claimed!");
    msg!("  Syndicate: {}", ctx.accounts.syndicate.key());
    msg!("  Month: {}", ctx.accounts.syndicate_wars_state.month);
    msg!("  Rank: {}", params.rank);
    msg!("  Prize amount: {} USDC lamports", prize_amount);

    Ok(())
}

// ============================================================================
// DISTRIBUTE SYNDICATE WARS PRIZES INSTRUCTION
// ============================================================================

/// Parameters for distributing Syndicate Wars prizes
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct DistributeSyndicateWarsPrizesParams {
    /// Array of syndicate public keys in rank order (1st to 10th)
    pub ranked_syndicates: [Pubkey; 10],
}

/// Accounts required for distributing Syndicate Wars prizes
#[derive(Accounts)]
#[instruction(params: DistributeSyndicateWarsPrizesParams)]
pub struct DistributeSyndicateWarsPrizes<'info> {
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

    /// Syndicate Wars state
    #[account(
        mut,
        seeds = [
            SYNDICATE_WARS_SEED,
            &syndicate_wars_state.month.to_le_bytes()
        ],
        bump = syndicate_wars_state.bump,
        constraint = !syndicate_wars_state.is_active @ LottoError::SyndicateWarsNotActive
    )]
    pub syndicate_wars_state: Account<'info, SyndicateWarsState>,

    /// Syndicate Wars prize pool USDC token account
    #[account(
        mut,
        seeds = [
            SYNDICATE_WARS_SEED,
            b"prize_pool",
            &syndicate_wars_state.month.to_le_bytes()
        ],
        bump,
        token::mint = usdc_mint,
        token::authority = syndicate_wars_state
    )]
    pub wars_prize_pool_usdc: Account<'info, TokenAccount>,

    /// USDC mint
    pub usdc_mint: Account<'info, Mint>,

    /// Token program
    pub token_program: Program<'info, Token>,
}

/// Distribute Syndicate Wars prizes to top syndicates
///
/// This instruction:
/// 1. Validates competition has ended
/// 2. Calculates prize amounts for each rank
/// 3. Updates SyndicateWarsEntry for each syndicate with their rank
/// 4. Emits conclusion event
///
/// Note: Individual syndicates must claim their prizes separately via
/// `claim_syndicate_wars_prize` instruction.
///
/// Remaining accounts should be the SyndicateWarsEntry accounts for each
/// ranked syndicate in order (1st to 10th place). Pass fewer accounts if
/// fewer than 10 syndicates participated.
///
/// # Arguments
/// * `ctx` - The context containing required accounts
/// * `params` - Distribution parameters
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler_distribute_syndicate_wars_prizes<'info>(
    ctx: Context<'_, '_, 'info, 'info, DistributeSyndicateWarsPrizes<'info>>,
    params: DistributeSyndicateWarsPrizesParams,
) -> Result<()> {
    let state = &mut ctx.accounts.syndicate_wars_state;
    let prize_pool = state.prize_pool;
    let month = state.month;

    // Calculate prize amounts
    let first_prize = prize_pool * 50 / 100; // 50%
    let second_prize = prize_pool * 25 / 100; // 25%
    let third_prize = prize_pool * 15 / 100; // 15%
    let runner_up_prize = prize_pool * 10 / 100 / 7; // 10% split among 7 runners-up

    // Update ranks on remaining accounts (SyndicateWarsEntry accounts)
    let remaining_accounts = ctx.remaining_accounts;
    for (i, account_info) in remaining_accounts.iter().enumerate() {
        if i >= 10 {
            break; // Only process up to 10 entries
        }

        // Verify the account matches the expected syndicate
        let expected_syndicate = params.ranked_syndicates[i];
        if expected_syndicate == Pubkey::default() {
            continue; // Skip empty slots
        }

        // Deserialize the entry account
        let mut entry_data = account_info.try_borrow_mut_data()?;

        // Skip discriminator (8 bytes) and read/write final_rank
        // SyndicateWarsEntry layout: syndicate (32) + month (8) + tickets_purchased (8) +
        // prizes_won (8) + win_count (4) + win_rate (8) + final_rank (Option<u32> = 5 bytes) +
        // prize_claimed (1) + bump (1)
        // Offset to final_rank: 8 (disc) + 32 + 8 + 8 + 8 + 4 + 8 = 76
        let rank_offset = 8 + 32 + 8 + 8 + 8 + 4 + 8;

        // Write Some(rank) - Option<u32> is 1 byte discriminant + 4 bytes value
        // 1 = Some variant
        entry_data[rank_offset] = 1; // Some discriminant
        let rank = (i + 1) as u32;
        entry_data[rank_offset + 1..rank_offset + 5].copy_from_slice(&rank.to_le_bytes());

        msg!("Set rank {} for syndicate {}", rank, expected_syndicate);
    }

    // Emit conclusion event with winner
    emit!(SyndicateWarsConcluded {
        month,
        total_distributed: prize_pool,
        winner: params.ranked_syndicates[0],
        winner_win_rate: 0, // Would need to be calculated from entries
        timestamp: Clock::get()?.unix_timestamp,
    });

    msg!("Syndicate Wars prizes distributed!");
    msg!("  Month: {}", month);
    msg!("  Total prize pool: {} USDC lamports", prize_pool);
    msg!("  1st place: {} USDC lamports", first_prize);
    msg!("  2nd place: {} USDC lamports", second_prize);
    msg!("  3rd place: {} USDC lamports", third_prize);
    msg!("  4th-10th place: {} USDC lamports each", runner_up_prize);
    msg!("  Winner: {}", params.ranked_syndicates[0]);

    Ok(())
}

/// Accounts required for claiming syndicate wars prize
#[derive(Accounts)]
#[instruction(params: ClaimSyndicateWarsPrizeParams)]
pub struct ClaimSyndicateWarsPrize<'info> {
    /// Syndicate creator/manager
    #[account(mut)]
    pub manager: Signer<'info>,

    /// Syndicate account
    #[account(
        mut,
        seeds = [
            SYNDICATE_SEED,
            manager.key().as_ref(),
            &syndicate.syndicate_id.to_le_bytes()
        ],
        bump = syndicate.bump,
        constraint = syndicate.creator == manager.key() @ LottoError::Unauthorized
    )]
    pub syndicate: Account<'info, Syndicate>,

    /// Syndicate Wars state
    #[account(
        mut,
        seeds = [
            SYNDICATE_WARS_SEED,
            &syndicate_wars_state.month.to_le_bytes()
        ],
        bump = syndicate_wars_state.bump,
        constraint = !syndicate_wars_state.is_active @ LottoError::SyndicateWarsNotActive
    )]
    pub syndicate_wars_state: Account<'info, SyndicateWarsState>,

    /// Syndicate Wars entry
    #[account(
        mut,
        seeds = [
            SYNDICATE_WARS_SEED,
            b"entry",
            &syndicate_wars_state.month.to_le_bytes(),
            syndicate.key().as_ref()
        ],
        bump = wars_entry.bump,
        constraint = wars_entry.syndicate == syndicate.key() @ LottoError::InvalidSyndicateConfig,
        constraint = !wars_entry.prize_claimed @ LottoError::AlreadyClaimed,
        constraint = wars_entry.final_rank == Some(params.rank) @ LottoError::InvalidRank
    )]
    pub wars_entry: Account<'info, SyndicateWarsEntry>,

    /// Syndicate's USDC token account (receives prize)
    #[account(
        mut,
        constraint = syndicate_usdc.owner == syndicate.key(),
        constraint = syndicate_usdc.mint == usdc_mint.key()
    )]
    pub syndicate_usdc: Account<'info, TokenAccount>,

    /// Syndicate Wars prize pool USDC token account
    #[account(
        mut,
        seeds = [
            SYNDICATE_WARS_SEED,
            b"prize_pool",
            &syndicate_wars_state.month.to_le_bytes()
        ],
        bump,
        token::mint = usdc_mint,
        token::authority = syndicate_wars_state
    )]
    pub wars_prize_pool_usdc: Account<'info, TokenAccount>,

    /// USDC mint
    pub usdc_mint: Account<'info, Mint>,

    /// Token program
    pub token_program: Program<'info, Token>,
}
