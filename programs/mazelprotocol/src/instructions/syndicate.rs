//! Syndicate Instructions
//!
//! This module contains instructions for syndicate (group buying pool) management:
//! - create_syndicate: Create a new syndicate pool
//! - join_syndicate: Join an existing syndicate
//! - leave_syndicate: Leave a syndicate and receive refund
//! - close_syndicate: Close an empty syndicate
//! - buy_syndicate_tickets: Purchase tickets for the entire syndicate
//! - distribute_syndicate_prize: Distribute prize to syndicate members
//! - claim_syndicate_member_prize: Claim individual member's share of prize
//! - update_syndicate_config: Update syndicate configuration
//! - remove_syndicate_member: Remove a member from syndicate (creator only)
//! - transfer_creator: Transfer creator role to another member

use anchor_lang::prelude::*;
use anchor_lang::AccountDeserialize;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::errors::LottoError;
use crate::events::{
    BulkTicketsPurchased, SyndicateCreated, SyndicateMemberJoined, SyndicatePrizeDistributed,
};
use crate::state::{DrawResult, LotteryState, Syndicate, SyndicateMember, TicketData, UserStats};

// ============================================================================
// CREATE SYNDICATE INSTRUCTION
// ============================================================================

/// Parameters for creating a syndicate
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateSyndicateParams {
    /// Unique syndicate identifier (for PDA derivation)
    pub syndicate_id: u64,
    /// Syndicate name (max 32 bytes UTF-8)
    pub name: [u8; 32],
    /// Whether anyone can join
    pub is_public: bool,
    /// Manager fee in basis points (max 500 = 5%)
    pub manager_fee_bps: u16,
}

/// Accounts required for creating a syndicate
#[derive(Accounts)]
#[instruction(params: CreateSyndicateParams)]
pub struct CreateSyndicate<'info> {
    /// The creator of the syndicate (becomes manager)
    #[account(mut)]
    pub creator: Signer<'info>,

    /// The syndicate account to be created
    #[account(
        init,
        payer = creator,
        space = Syndicate::size_for_members(1), // Start with space for creator
        seeds = [
            SYNDICATE_SEED,
            creator.key().as_ref(),
            &params.syndicate_id.to_le_bytes()
        ],
        // NOTE: At creation time, creator.key() == original_creator.
        // All subsequent PDA derivations MUST use syndicate.original_creator.
        bump
    )]
    pub syndicate: Account<'info, Syndicate>,

    /// Syndicate's USDC token account (PDA-controlled)
    /// This holds all member contributions
    #[account(
        init,
        payer = creator,
        seeds = [
            SYNDICATE_SEED,
            b"usdc",
            syndicate.key().as_ref()
        ],
        bump,
        token::mint = usdc_mint,
        token::authority = syndicate
    )]
    pub syndicate_usdc: Account<'info, TokenAccount>,

    /// USDC mint
    pub usdc_mint: Account<'info, anchor_spl::token::Mint>,

    /// Token program
    pub token_program: Program<'info, Token>,

    /// System program
    pub system_program: Program<'info, System>,
}

impl<'info> CreateSyndicate<'info> {
    /// Validate the syndicate parameters
    pub fn validate(&self, params: &CreateSyndicateParams) -> Result<()> {
        // Validate manager fee (max 5%)
        require!(
            params.manager_fee_bps <= MAX_MANAGER_FEE_BPS,
            LottoError::ManagerFeeTooHigh
        );

        // Validate name is not empty (check first byte)
        require!(
            params.name.iter().any(|&b| b != 0),
            LottoError::InvalidSyndicateConfig
        );

        // Validate name length
        require!(
            params.name.len() <= MAX_SYNDICATE_NAME_LENGTH,
            LottoError::SyndicateNameTooLong
        );

        Ok(())
    }
}

/// Create a new syndicate pool
///
/// This instruction:
/// 1. Validates the syndicate parameters
/// 2. Creates the syndicate account PDA
/// 3. Creates the syndicate's USDC token account
/// 4. Adds the creator as the first member
/// 5. Sets up the syndicate configuration
///
/// # Arguments
/// * `ctx` - The context containing required accounts
/// * `params` - Syndicate configuration parameters
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler_create_syndicate(
    ctx: Context<CreateSyndicate>,
    params: CreateSyndicateParams,
) -> Result<()> {
    let clock = Clock::get()?;

    // Validate parameters
    ctx.accounts.validate(&params)?;

    let syndicate = &mut ctx.accounts.syndicate;

    // Initialize syndicate
    syndicate.creator = ctx.accounts.creator.key();
    // SECURITY FIX (Issue #1): Store original creator for stable PDA derivation.
    // This field MUST NEVER be modified after creation.
    syndicate.original_creator = ctx.accounts.creator.key();
    syndicate.syndicate_id = params.syndicate_id;
    syndicate.name = params.name;
    syndicate.is_public = params.is_public;
    syndicate.member_count = 1; // Creator is first member
    syndicate.total_contribution = 0;
    syndicate.manager_fee_bps = params.manager_fee_bps;
    syndicate.usdc_account = ctx.accounts.syndicate_usdc.key();
    syndicate.bump = ctx.bumps.syndicate;

    // Add creator as first member with 0 contribution
    // (They can contribute later via join_syndicate)
    syndicate.members = vec![SyndicateMember {
        wallet: ctx.accounts.creator.key(),
        contribution: 0,
        share_percentage_bps: 10000, // 100% until others join
        unclaimed_prize: 0,
    }];

    // Emit event
    emit!(SyndicateCreated {
        syndicate: ctx.accounts.syndicate.key(),
        creator: ctx.accounts.creator.key(),
        name: params.name,
        is_public: params.is_public,
        manager_fee_bps: params.manager_fee_bps,
        timestamp: clock.unix_timestamp,
    });

    // Log syndicate name as string
    let name_str = String::from_utf8_lossy(&params.name)
        .trim_end_matches('\0')
        .to_string();

    msg!("Syndicate created successfully!");
    msg!("  Syndicate: {}", ctx.accounts.syndicate.key());
    msg!("  Creator: {}", ctx.accounts.creator.key());
    msg!("  Name: {}", name_str);
    msg!("  Is public: {}", params.is_public);
    msg!("  Manager fee: {} bps", params.manager_fee_bps);
    msg!("  USDC account: {}", ctx.accounts.syndicate_usdc.key());

    Ok(())
}

// ============================================================================
// JOIN SYNDICATE INSTRUCTION
// ============================================================================

/// Parameters for joining a syndicate
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct JoinSyndicateParams {
    /// USDC contribution amount
    pub contribution: u64,
}

/// Accounts required for joining a syndicate
#[derive(Accounts)]
#[instruction(params: JoinSyndicateParams)]
pub struct JoinSyndicate<'info> {
    /// The member joining the syndicate
    #[account(mut)]
    pub member: Signer<'info>,

    /// The syndicate to join
    /// Note: realloc is handled conditionally in the handler to avoid
    /// unnecessary space allocation when existing members add contributions
    #[account(
        mut,
        constraint = syndicate.is_public || syndicate.creator == member.key() @ LottoError::SyndicatePrivate,
        constraint = (syndicate.member_count as usize) < MAX_SYNDICATE_MEMBERS @ LottoError::SyndicateFull
    )]
    pub syndicate: Account<'info, Syndicate>,

    /// Member's USDC token account (source of contribution)
    #[account(
        mut,
        constraint = member_usdc.owner == member.key() @ LottoError::TokenAccountOwnerMismatch,
        constraint = member_usdc.amount >= params.contribution @ LottoError::InsufficientFunds
    )]
    pub member_usdc: Account<'info, TokenAccount>,

    /// Syndicate's USDC token account (destination for contribution)
    #[account(
        mut,
        seeds = [
            SYNDICATE_SEED,
            b"usdc",
            syndicate.key().as_ref()
        ],
        bump,
        constraint = syndicate_usdc.key() == syndicate.usdc_account @ LottoError::InvalidTokenAccount
    )]
    pub syndicate_usdc: Account<'info, TokenAccount>,

    /// User stats account (for eligibility checks)
    #[account(
        mut,
        seeds = [USER_SEED, member.key().as_ref()],
        bump = user_stats.bump
    )]
    pub user_stats: Account<'info, UserStats>,

    /// Token program
    pub token_program: Program<'info, Token>,

    /// System program
    pub system_program: Program<'info, System>,
}

impl<'info> JoinSyndicate<'info> {
    /// Transfer USDC from member to syndicate
    pub fn transfer_contribution(&self, amount: u64) -> Result<()> {
        if amount == 0 {
            return Ok(());
        }

        let cpi_accounts = Transfer {
            from: self.member_usdc.to_account_info(),
            to: self.syndicate_usdc.to_account_info(),
            authority: self.member.to_account_info(),
        };
        let cpi_program = self.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

        token::transfer(cpi_ctx, amount)
    }
}

/// Join an existing syndicate
///
/// This instruction:
/// 1. Validates the syndicate is joinable (public or creator)
/// 2. Validates the syndicate has space for new members
/// 3. Transfers USDC contribution from member to syndicate
/// 4. Adds the member to the syndicate (or updates existing contribution)
/// 5. Recalculates all member shares
///
/// FIXED: Account reallocation only happens for new members, not when
/// existing members add more contribution. This saves rent costs.
///
/// # Arguments
/// * `ctx` - The context containing required accounts
/// * `params` - Contribution amount
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler_join_syndicate(
    ctx: Context<JoinSyndicate>,
    params: JoinSyndicateParams,
) -> Result<()> {
    let clock = Clock::get()?;

    // Get keys before mutable borrows
    let member_key = ctx.accounts.member.key();
    let syndicate_key = ctx.accounts.syndicate.key();

    // Check if already a member (before mutable borrow)
    let is_existing_member = ctx
        .accounts
        .syndicate
        .members
        .iter()
        .any(|m| m.wallet == member_key);

    // FIXED: Validate minimum contribution for new members
    // New members must contribute at least 1 USDC (1_000_000 lamports) to prevent
    // zero-share members that dilute existing members' shares without contributing
    if !is_existing_member {
        require!(
            params.contribution >= 1_000_000, // 1 USDC minimum for new members
            LottoError::InsufficientContribution
        );
    }

    // FIXED: Only reallocate if this is a new member
    // Existing members adding contribution don't need more space
    if !is_existing_member {
        let new_size =
            Syndicate::size_for_members(ctx.accounts.syndicate.member_count as usize + 1);
        let current_size = ctx.accounts.syndicate.to_account_info().data_len();

        if new_size > current_size {
            // Calculate additional rent needed
            let rent = Rent::get()?;
            let new_minimum_balance = rent.minimum_balance(new_size);
            let current_balance = ctx.accounts.syndicate.to_account_info().lamports();
            let lamports_diff = new_minimum_balance.saturating_sub(current_balance);

            // Transfer lamports for rent if needed
            if lamports_diff > 0 {
                let cpi_context = CpiContext::new(
                    ctx.accounts.system_program.to_account_info(),
                    anchor_lang::system_program::Transfer {
                        from: ctx.accounts.member.to_account_info(),
                        to: ctx.accounts.syndicate.to_account_info(),
                    },
                );
                anchor_lang::system_program::transfer(cpi_context, lamports_diff)?;
            }

            // Reallocate account data using resize (realloc is deprecated)
            ctx.accounts.syndicate.to_account_info().resize(new_size)?;
            // Note: resize() is the recommended method
        }
    }

    // Transfer contribution first (before mutable borrow of syndicate)
    if params.contribution > 0 {
        ctx.accounts.transfer_contribution(params.contribution)?;
    }

    // Now do all mutable operations on syndicate
    let syndicate = &mut ctx.accounts.syndicate;

    if is_existing_member {
        // If existing member, add to their contribution (no realloc needed)
        for member in syndicate.members.iter_mut() {
            if member.wallet == member_key {
                member.contribution = member
                    .contribution
                    .checked_add(params.contribution)
                    .ok_or(LottoError::Overflow)?;
                break;
            }
        }
    } else {
        // New member (space already reallocated above)
        // Check syndicate member limit
        require!(
            (syndicate.member_count as usize) < MAX_SYNDICATE_MEMBERS,
            LottoError::SyndicateFull
        );
        syndicate.members.push(SyndicateMember {
            wallet: member_key,
            contribution: params.contribution,
            share_percentage_bps: 0, // Will be calculated
            unclaimed_prize: 0,
        });
        syndicate.member_count = syndicate
            .member_count
            .checked_add(1)
            .ok_or(LottoError::Overflow)?;
    }

    // Update total contribution
    if params.contribution > 0 {
        syndicate.total_contribution = syndicate
            .total_contribution
            .checked_add(params.contribution)
            .ok_or(LottoError::Overflow)?;
    }

    // Recalculate shares
    syndicate.recalculate_shares();

    // Get the member's share for the event
    let member_share = syndicate
        .find_member(&member_key)
        .map(|m| m.share_percentage_bps)
        .unwrap_or(0);

    let member_count = syndicate.member_count;
    let total_contribution = syndicate.total_contribution;

    // Emit event
    emit!(SyndicateMemberJoined {
        syndicate: syndicate_key,
        member: member_key,
        contribution: params.contribution,
        share_bps: member_share,
        member_count,
        timestamp: clock.unix_timestamp,
    });

    msg!("Member joined syndicate successfully!");
    msg!("  Syndicate: {}", syndicate_key);
    msg!("  Member: {}", member_key);
    msg!("  Contribution: {} USDC lamports", params.contribution);
    msg!(
        "  Share: {} bps ({}%)",
        member_share,
        member_share as f64 / 100.0
    );
    msg!("  Total members: {}", member_count);
    msg!("  Total contribution: {} USDC lamports", total_contribution);

    Ok(())
}

// ============================================================================
// LEAVE SYNDICATE INSTRUCTION
// ============================================================================

/// Accounts required for leaving a syndicate
#[derive(Accounts)]
pub struct LeaveSyndicate<'info> {
    /// The member leaving the syndicate
    #[account(mut)]
    pub member: Signer<'info>,

    /// The syndicate to leave
    /// Note: Creator CAN leave if they have transferred creator role or have 0 contribution
    /// and there are other members with contributions
    #[account(mut)]
    pub syndicate: Account<'info, Syndicate>,

    /// Member's USDC token account (to receive refund)
    #[account(
        mut,
        constraint = member_usdc.owner == member.key() @ LottoError::TokenAccountOwnerMismatch
    )]
    pub member_usdc: Account<'info, TokenAccount>,

    /// Syndicate's USDC token account (source of refund)
    #[account(
        mut,
        seeds = [
            SYNDICATE_SEED,
            b"usdc",
            syndicate.key().as_ref()
        ],
        bump,
        constraint = syndicate_usdc.key() == syndicate.usdc_account @ LottoError::InvalidTokenAccount
    )]
    pub syndicate_usdc: Account<'info, TokenAccount>,

    /// Token program
    pub token_program: Program<'info, Token>,

    /// System program
    pub system_program: Program<'info, System>,
}

/// Leave a syndicate and receive contribution refund
///
/// This instruction:
/// 1. Validates the member is part of the syndicate
/// 2. Calculates the refund amount based on contribution
/// 3. Transfers USDC refund from syndicate to member
/// 4. Removes the member from the syndicate
/// 5. Recalculates remaining member shares
///
/// Note: The creator cannot leave their own syndicate.
///
/// # Arguments
/// * `ctx` - The context containing required accounts
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler_leave_syndicate(ctx: Context<LeaveSyndicate>) -> Result<()> {
    let member_key = ctx.accounts.member.key();
    let syndicate_key = ctx.accounts.syndicate.key();

    // SECURITY FIX (Issue #1): Use original_creator for PDA signer seeds
    let syndicate_original_creator = ctx.accounts.syndicate.original_creator;
    let syndicate_id = ctx.accounts.syndicate.syndicate_id;
    let syndicate_bump = ctx.accounts.syndicate.bump;

    // Check if this is the creator trying to leave
    let syndicate_creator = ctx.accounts.syndicate.creator;
    if member_key == syndicate_creator {
        // Creator can only leave if:
        // 1. They have 0 contribution, AND
        // 2. There is at least one other member with contribution who can take over
        let creator_member = ctx.accounts.syndicate.find_member(&member_key);
        let creator_contribution = creator_member.map(|m| m.contribution).unwrap_or(0);

        require!(
            creator_contribution == 0,
            LottoError::Unauthorized // Creator with contribution must transfer role first
        );

        // Check there's at least one other member with contribution
        let has_other_contributing_member = ctx
            .accounts
            .syndicate
            .members
            .iter()
            .any(|m| m.wallet != member_key && m.contribution > 0);

        require!(
            has_other_contributing_member,
            LottoError::Unauthorized // Need another member to take over
        );

        // Auto-transfer creator role to the member with highest contribution
        let new_creator = ctx
            .accounts
            .syndicate
            .members
            .iter()
            .filter(|m| m.wallet != member_key)
            .max_by_key(|m| m.contribution)
            .map(|m| m.wallet);

        if let Some(new_creator_key) = new_creator {
            ctx.accounts.syndicate.creator = new_creator_key;
            msg!("Creator role auto-transferred to: {}", new_creator_key);
        }
    }

    // Use the remove_member helper to get contribution and update state
    let contribution = ctx.accounts.syndicate.remove_member(&member_key)?;

    let remaining_members = ctx.accounts.syndicate.member_count;

    // FIXED: Actually transfer the contribution back to the member
    if contribution > 0 {
        // Verify syndicate has enough balance
        require!(
            ctx.accounts.syndicate_usdc.amount >= contribution,
            LottoError::InsufficientTokenBalance
        );

        // SECURITY FIX (Issue #1): Use original_creator for signer seeds
        let seeds = &[
            SYNDICATE_SEED,
            syndicate_original_creator.as_ref(),
            &syndicate_id.to_le_bytes(),
            &[syndicate_bump],
        ];
        let signer_seeds = &[&seeds[..]];

        // Transfer refund from syndicate to member
        let cpi_accounts = Transfer {
            from: ctx.accounts.syndicate_usdc.to_account_info(),
            to: ctx.accounts.member_usdc.to_account_info(),
            authority: ctx.accounts.syndicate.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);

        token::transfer(cpi_ctx, contribution)?;

        msg!("Refund transferred successfully!");
    }

    msg!("Member left syndicate!");
    msg!("  Syndicate: {}", syndicate_key);
    msg!("  Member: {}", member_key);
    msg!("  Refund amount: {} USDC lamports", contribution);
    msg!("  Remaining members: {}", remaining_members);
    msg!(
        "  Remaining contribution pool: {} USDC lamports",
        ctx.accounts.syndicate.total_contribution
    );

    Ok(())
}

// ============================================================================
// CLOSE SYNDICATE INSTRUCTION
// ============================================================================

/// Accounts required for closing a syndicate
#[derive(Accounts)]
pub struct CloseSyndicate<'info> {
    /// The creator closing the syndicate
    #[account(mut)]
    pub creator: Signer<'info>,

    /// The syndicate to close
    #[account(
        mut,
        close = creator,
        constraint = syndicate.creator == creator.key() @ LottoError::Unauthorized,
        constraint = syndicate.member_count <= 1 @ LottoError::SyndicateFull // Only creator left
    )]
    pub syndicate: Account<'info, Syndicate>,

    /// Creator's USDC token account (to receive remaining funds)
    #[account(
        mut,
        constraint = creator_usdc.owner == creator.key() @ LottoError::TokenAccountOwnerMismatch
    )]
    pub creator_usdc: Account<'info, TokenAccount>,

    /// Syndicate's USDC token account (will be closed)
    #[account(
        mut,
        seeds = [
            SYNDICATE_SEED,
            b"usdc",
            syndicate.key().as_ref()
        ],
        bump,
        constraint = syndicate_usdc.key() == syndicate.usdc_account @ LottoError::InvalidTokenAccount
    )]
    pub syndicate_usdc: Account<'info, TokenAccount>,

    /// Token program
    pub token_program: Program<'info, Token>,
}

/// Close a syndicate
///
/// This instruction:
/// 1. Validates the caller is the creator
/// 2. Validates all other members have left
/// 3. Transfers any remaining USDC to creator
/// 4. Closes the syndicate USDC account
/// 5. Closes the syndicate account and returns rent to creator
///
/// # Dust Handling
/// Any remaining USDC in the syndicate account goes to the creator.
/// This should only be the creator's own contribution or small amounts
/// from rounding during ticket purchases. All other members should have
/// received their full refund when leaving.
///
/// If significant funds remain (indicating a bug or failed refunds),
/// consider using withdraw_creator_contribution first to verify amounts.
///
/// # Arguments
/// * `ctx` - The context containing required accounts
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler_close_syndicate(ctx: Context<CloseSyndicate>) -> Result<()> {
    let syndicate_key = ctx.accounts.syndicate.key();
    // SECURITY FIX (Issue #1): Use original_creator for signer seeds
    let syndicate_original_creator = ctx.accounts.syndicate.original_creator;
    let syndicate_id = ctx.accounts.syndicate.syndicate_id;
    let syndicate_bump = ctx.accounts.syndicate.bump;
    let remaining_balance = ctx.accounts.syndicate_usdc.amount;

    // Get creator's recorded contribution for comparison
    let current_creator = ctx.accounts.syndicate.creator;
    let creator_contribution = ctx
        .accounts
        .syndicate
        .find_member(&current_creator)
        .map(|m| m.contribution)
        .unwrap_or(0);

    // FIXED: Warn if remaining balance exceeds creator's contribution (potential unfairness)
    let excess_funds = remaining_balance.saturating_sub(creator_contribution);
    if excess_funds > 0 {
        msg!(
            "⚠️  WARNING: Remaining balance ({}) exceeds creator contribution ({}).",
            remaining_balance,
            creator_contribution
        );
        msg!(
            "    Excess of {} USDC lamports may be from failed refunds or rounding.",
            excess_funds
        );
        msg!("    All funds will be transferred to creator.");
    }

    // Transfer any remaining USDC to creator
    if remaining_balance > 0 {
        let seeds = &[
            SYNDICATE_SEED,
            syndicate_original_creator.as_ref(),
            &syndicate_id.to_le_bytes(),
            &[syndicate_bump],
        ];
        let signer_seeds = &[&seeds[..]];

        let cpi_accounts = Transfer {
            from: ctx.accounts.syndicate_usdc.to_account_info(),
            to: ctx.accounts.creator_usdc.to_account_info(),
            authority: ctx.accounts.syndicate.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);

        token::transfer(cpi_ctx, remaining_balance)?;

        msg!(
            "Transferred remaining {} USDC lamports to creator",
            remaining_balance
        );
        if excess_funds > 0 {
            msg!(
                "  (includes {} excess beyond creator's tracked contribution)",
                excess_funds
            );
        }
    }

    // Close the syndicate USDC token account
    let seeds = &[
        SYNDICATE_SEED,
        syndicate_original_creator.as_ref(),
        &syndicate_id.to_le_bytes(),
        &[syndicate_bump],
    ];
    let signer_seeds = &[&seeds[..]];

    let cpi_accounts = token::CloseAccount {
        account: ctx.accounts.syndicate_usdc.to_account_info(),
        destination: ctx.accounts.creator.to_account_info(),
        authority: ctx.accounts.syndicate.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);

    token::close_account(cpi_ctx)?;

    msg!("Syndicate closed!");
    msg!("  Syndicate: {}", syndicate_key);
    msg!("  Creator: {}", ctx.accounts.creator.key());
    msg!(
        "  Final balance transferred: {} USDC lamports",
        remaining_balance
    );

    // Account closure is handled automatically by the `close` constraint

    Ok(())
}

// ============================================================================
// WITHDRAW CREATOR CONTRIBUTION
// ============================================================================

/// Accounts required for creator to withdraw their contribution
#[derive(Accounts)]
pub struct WithdrawCreatorContribution<'info> {
    /// The creator withdrawing their contribution
    #[account(mut)]
    pub creator: Signer<'info>,

    /// The syndicate
    #[account(
        mut,
        constraint = syndicate.creator == creator.key() @ LottoError::Unauthorized
    )]
    pub syndicate: Account<'info, Syndicate>,

    /// Creator's USDC token account (to receive withdrawal)
    #[account(
        mut,
        constraint = creator_usdc.owner == creator.key() @ LottoError::TokenAccountOwnerMismatch
    )]
    pub creator_usdc: Account<'info, TokenAccount>,

    /// Syndicate's USDC token account
    #[account(
        mut,
        seeds = [
            SYNDICATE_SEED,
            b"usdc",
            syndicate.key().as_ref()
        ],
        bump,
        constraint = syndicate_usdc.key() == syndicate.usdc_account @ LottoError::InvalidTokenAccount
    )]
    pub syndicate_usdc: Account<'info, TokenAccount>,

    /// Token program
    pub token_program: Program<'info, Token>,
}

/// Allow creator to withdraw their own contribution
///
/// The creator cannot leave the syndicate, but they can withdraw their
/// contribution amount. This is useful if the creator wants to reduce
/// their stake without abandoning the syndicate.
///
/// # Arguments
/// * `ctx` - The context containing required accounts
/// * `amount` - Amount to withdraw (must be <= creator's contribution)
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler_withdraw_creator_contribution(
    ctx: Context<WithdrawCreatorContribution>,
    amount: u64,
) -> Result<()> {
    let creator_key = ctx.accounts.creator.key();
    let syndicate_key = ctx.accounts.syndicate.key();

    // Find creator's contribution
    let creator_contribution = ctx
        .accounts
        .syndicate
        .find_member(&creator_key)
        .map(|m| m.contribution)
        .ok_or(LottoError::NotSyndicateMember)?;

    // Validate withdrawal amount
    require!(amount > 0, LottoError::InvalidSeedAmount);
    require!(
        amount <= creator_contribution,
        LottoError::InsufficientFunds
    );
    require!(
        ctx.accounts.syndicate_usdc.amount >= amount,
        LottoError::InsufficientTokenBalance
    );

    // SECURITY FIX (Issue #1): Use original_creator for signer seeds
    let syndicate_original_creator = ctx.accounts.syndicate.original_creator;
    let syndicate_id = ctx.accounts.syndicate.syndicate_id;
    let syndicate_bump = ctx.accounts.syndicate.bump;

    // Update creator's contribution in syndicate
    let syndicate = &mut ctx.accounts.syndicate;
    if let Some(member) = syndicate.find_member_mut(&creator_key) {
        member.contribution = member.contribution.saturating_sub(amount);
    }
    syndicate.total_contribution = syndicate.total_contribution.saturating_sub(amount);
    syndicate.recalculate_shares();

    // Transfer USDC to creator
    let seeds = &[
        SYNDICATE_SEED,
        syndicate_original_creator.as_ref(),
        &syndicate_id.to_le_bytes(),
        &[syndicate_bump],
    ];
    let signer_seeds = &[&seeds[..]];

    let cpi_accounts = Transfer {
        from: ctx.accounts.syndicate_usdc.to_account_info(),
        to: ctx.accounts.creator_usdc.to_account_info(),
        authority: ctx.accounts.syndicate.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);

    token::transfer(cpi_ctx, amount)?;

    msg!("Creator contribution withdrawn!");
    msg!("  Syndicate: {}", syndicate_key);
    msg!("  Amount withdrawn: {} USDC lamports", amount);
    msg!(
        "  Remaining creator contribution: {} USDC lamports",
        creator_contribution - amount
    );
    msg!(
        "  Total syndicate contribution: {} USDC lamports",
        ctx.accounts.syndicate.total_contribution
    );

    Ok(())
}

// ============================================================================
// BUY SYNDICATE TICKETS INSTRUCTION
// ============================================================================

/// Parameters for buying syndicate tickets
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct BuySyndicateTicketsParams {
    /// Array of ticket numbers (each ticket has 6 numbers)
    pub tickets: Vec<[u8; 6]>,
}

/// Accounts required for buying syndicate tickets
#[derive(Accounts)]
#[instruction(params: BuySyndicateTicketsParams)]
pub struct BuySyndicateTickets<'info> {
    /// The syndicate creator initiating the purchase (only creator can buy for syndicate)
    #[account(mut)]
    pub creator: Signer<'info>,

    /// The syndicate account
    /// SECURITY FIX (Issue #1): Use original_creator for PDA seed derivation
    /// to prevent fund-lock after creator transfer.
    #[account(
        mut,
        seeds = [
            SYNDICATE_SEED,
            syndicate.original_creator.as_ref(),
            &syndicate.syndicate_id.to_le_bytes()
        ],
        bump = syndicate.bump,
        constraint = syndicate.creator == creator.key() @ LottoError::Unauthorized
    )]
    pub syndicate: Account<'info, Syndicate>,

    /// The main lottery state account
    #[account(
        mut,
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump,
        constraint = !lottery_state.is_paused @ LottoError::Paused,
        constraint = lottery_state.is_funded @ LottoError::LotteryNotInitialized,
        constraint = !lottery_state.is_draw_in_progress @ LottoError::DrawInProgress
    )]
    pub lottery_state: Account<'info, LotteryState>,

    /// Syndicate's USDC token account (source of funds)
    #[account(
        mut,
        seeds = [
            SYNDICATE_SEED,
            b"usdc",
            syndicate.key().as_ref()
        ],
        bump,
        constraint = syndicate_usdc.key() == syndicate.usdc_account @ LottoError::InvalidTokenAccount
    )]
    pub syndicate_usdc: Account<'info, TokenAccount>,

    /// Prize pool USDC token account
    #[account(
        mut,
        seeds = [PRIZE_POOL_USDC_SEED],
        bump
    )]
    pub prize_pool_usdc: Account<'info, TokenAccount>,

    /// House fee USDC token account
    #[account(
        mut,
        seeds = [HOUSE_FEE_USDC_SEED],
        bump
    )]
    pub house_fee_usdc: Account<'info, TokenAccount>,

    /// Insurance pool USDC token account
    #[account(
        mut,
        seeds = [INSURANCE_POOL_USDC_SEED],
        bump
    )]
    pub insurance_pool_usdc: Account<'info, TokenAccount>,

    /// USDC mint
    pub usdc_mint: Account<'info, Mint>,

    /// Token program
    pub token_program: Program<'info, Token>,

    /// System program
    pub system_program: Program<'info, System>,
}

/// Validate ticket numbers
fn validate_ticket_numbers(numbers: &[u8; 6]) -> Result<()> {
    // Check range for each number
    for &num in numbers.iter() {
        require!(
            num >= MIN_NUMBER && num <= MAX_NUMBER,
            LottoError::NumbersOutOfRange
        );
    }

    // Check for duplicates by sorting and comparing adjacent
    let mut sorted = *numbers;
    sorted.sort();
    for i in 0..5 {
        require!(sorted[i] != sorted[i + 1], LottoError::DuplicateNumbers);
    }

    Ok(())
}

/// Buy tickets for the syndicate using pooled funds
///
/// This instruction:
/// 1. Validates the caller is the syndicate creator
/// 2. Validates all ticket numbers
/// 3. Checks syndicate has sufficient funds
/// 4. Calculates fees and transfers USDC from syndicate to prize pool and house fee
/// 5. Creates ticket accounts for each ticket (owned by syndicate)
/// 6. Updates lottery state
///
/// Note: Ticket accounts need to be created in separate transactions due to
/// account creation limits. This instruction handles the fund transfer only.
///
/// # Arguments
/// * `ctx` - The context containing required accounts
/// * `params` - Ticket numbers to purchase
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler_buy_syndicate_tickets(
    ctx: Context<BuySyndicateTickets>,
    params: BuySyndicateTicketsParams,
) -> Result<()> {
    let clock = Clock::get()?;

    // Validate ticket count
    let ticket_count = params.tickets.len();
    require!(ticket_count > 0, LottoError::EmptyTicketArray);
    require!(
        ticket_count <= MAX_SYNDICATE_BULK_TICKETS,
        LottoError::BulkPurchaseLimitExceeded
    );

    // Validate all ticket numbers
    for ticket in &params.tickets {
        validate_ticket_numbers(ticket)?;
    }

    // Get lottery state values
    let ticket_price = ctx.accounts.lottery_state.ticket_price;
    let next_draw_timestamp = ctx.accounts.lottery_state.next_draw_timestamp;
    let current_draw_id = ctx.accounts.lottery_state.current_draw_id;
    let house_fee_bps = ctx.accounts.lottery_state.get_current_house_fee_bps();

    // Check if ticket sales are open
    require!(
        clock.unix_timestamp
            < next_draw_timestamp
                .checked_sub(TICKET_SALE_CUTOFF)
                .unwrap_or(i64::MIN),
        LottoError::TicketSaleEnded
    );

    // Calculate total cost
    let total_cost = ticket_price
        .checked_mul(ticket_count as u64)
        .ok_or(LottoError::Overflow)?;

    // Verify syndicate has sufficient funds
    require!(
        ctx.accounts.syndicate_usdc.amount >= total_cost,
        LottoError::InsufficientFunds
    );

    // Calculate fees
    let total_house_fee =
        (total_cost as u128 * house_fee_bps as u128 / BPS_DENOMINATOR as u128) as u64;
    let total_prize_pool = total_cost.saturating_sub(total_house_fee);

    // SECURITY FIX (Issue #1): Use original_creator for signer seeds
    // to match the PDA derived at creation time.
    let syndicate_original_creator = ctx.accounts.syndicate.original_creator;
    let syndicate_id = ctx.accounts.syndicate.syndicate_id;
    let syndicate_bump = ctx.accounts.syndicate.bump;

    let seeds = &[
        SYNDICATE_SEED,
        syndicate_original_creator.as_ref(),
        &syndicate_id.to_le_bytes(),
        &[syndicate_bump],
    ];
    let signer_seeds = &[&seeds[..]];

    // Transfer house fee from syndicate to house fee account
    if total_house_fee > 0 {
        let cpi_accounts = Transfer {
            from: ctx.accounts.syndicate_usdc.to_account_info(),
            to: ctx.accounts.house_fee_usdc.to_account_info(),
            authority: ctx.accounts.syndicate.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
        token::transfer(cpi_ctx, total_house_fee)?;
    }

    // Calculate jackpot, reserve, and insurance contributions BEFORE transfers
    // so we can split the prize pool transfer correctly.
    let jackpot_contribution = (total_prize_pool as u128 * JACKPOT_ALLOCATION_BPS as u128
        / BPS_DENOMINATOR as u128) as u64;
    let reserve_contribution = (total_prize_pool as u128 * RESERVE_ALLOCATION_BPS as u128
        / BPS_DENOMINATOR as u128) as u64;
    let insurance_contribution = (total_prize_pool as u128 * INSURANCE_ALLOCATION_BPS as u128
        / BPS_DENOMINATOR as u128) as u64;
    // SECURITY FIX (Issue #4): Explicitly track fixed prize allocation
    let fixed_prize_contribution = (total_prize_pool as u128 * FIXED_PRIZE_ALLOCATION_BPS as u128
        / BPS_DENOMINATOR as u128) as u64;

    // FIXED: Transfer insurance portion to the insurance pool token account.
    // Previously, insurance_contribution was only added to lottery_state.insurance_balance
    // without an actual USDC transfer, creating an accounting mismatch.
    let prize_pool_transfer = total_prize_pool.saturating_sub(insurance_contribution);

    if prize_pool_transfer > 0 {
        let cpi_accounts = Transfer {
            from: ctx.accounts.syndicate_usdc.to_account_info(),
            to: ctx.accounts.prize_pool_usdc.to_account_info(),
            authority: ctx.accounts.syndicate.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
        token::transfer(cpi_ctx, prize_pool_transfer)?;
    }

    if insurance_contribution > 0 {
        let cpi_accounts = Transfer {
            from: ctx.accounts.syndicate_usdc.to_account_info(),
            to: ctx.accounts.insurance_pool_usdc.to_account_info(),
            authority: ctx.accounts.syndicate.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
        token::transfer(cpi_ctx, insurance_contribution)?;
    }

    // Update syndicate total contribution (deduct spent amount)
    let syndicate = &mut ctx.accounts.syndicate;
    syndicate.total_contribution = syndicate.total_contribution.saturating_sub(total_cost);

    // Update lottery state
    let lottery_state = &mut ctx.accounts.lottery_state;
    lottery_state.jackpot_balance = lottery_state
        .jackpot_balance
        .checked_add(jackpot_contribution)
        .ok_or(LottoError::Overflow)?;
    lottery_state.reserve_balance = lottery_state
        .reserve_balance
        .checked_add(reserve_contribution)
        .ok_or(LottoError::Overflow)?;
    lottery_state.insurance_balance = lottery_state
        .insurance_balance
        .checked_add(insurance_contribution)
        .ok_or(LottoError::Overflow)?;
    // SECURITY FIX (Issue #4): Track dedicated fixed prize pool balance.
    if fixed_prize_contribution > 0 {
        lottery_state.fixed_prize_balance = lottery_state
            .fixed_prize_balance
            .checked_add(fixed_prize_contribution)
            .ok_or(LottoError::Overflow)?;
    }
    lottery_state.current_draw_tickets = lottery_state
        .current_draw_tickets
        .checked_add(ticket_count as u64)
        .ok_or(LottoError::Overflow)?;
    lottery_state.total_tickets_sold = lottery_state
        .total_tickets_sold
        .checked_add(ticket_count as u64)
        .ok_or(LottoError::Overflow)?;

    // Update house fee based on new jackpot level
    lottery_state.house_fee_bps = lottery_state.get_current_house_fee_bps();

    // Check if rolldown should be pending
    if lottery_state.jackpot_balance >= lottery_state.soft_cap {
        lottery_state.is_rolldown_active = true;
    }

    let syndicate_key = ctx.accounts.syndicate.key();

    // Emit event
    emit!(BulkTicketsPurchased {
        player: ctx.accounts.creator.key(),
        draw_id: current_draw_id,
        ticket_count: ticket_count as u32,
        total_price: total_cost,
        syndicate: Some(syndicate_key),
        timestamp: clock.unix_timestamp,
    });

    msg!("Syndicate tickets purchased successfully!");
    msg!("  Syndicate: {}", syndicate_key);
    msg!("  Ticket count: {}", ticket_count);
    msg!("  Total cost: {} USDC lamports", total_cost);
    msg!("  House fee: {} USDC lamports", total_house_fee);
    msg!(
        "  Prize pool contribution: {} USDC lamports",
        total_prize_pool
    );
    msg!(
        "  Remaining syndicate funds: {} USDC lamports",
        ctx.accounts.syndicate.total_contribution
    );
    msg!(
        "  NOTE: Individual ticket accounts must be created separately via create_syndicate_ticket"
    );

    Ok(())
}

// ============================================================================
// CREATE SYNDICATE TICKET INSTRUCTION
// ============================================================================

/// Accounts required for creating a single syndicate ticket account
#[derive(Accounts)]
#[instruction(numbers: [u8; 6])]
pub struct CreateSyndicateTicket<'info> {
    /// The payer for the ticket account (typically syndicate creator)
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The syndicate that owns the ticket
    #[account(
        constraint = syndicate.creator == payer.key() @ LottoError::Unauthorized
    )]
    pub syndicate: Account<'info, Syndicate>,

    /// The lottery state account
    #[account(
        mut,
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump
    )]
    pub lottery_state: Account<'info, LotteryState>,

    /// The ticket account to be created
    #[account(
        init,
        payer = payer,
        space = TICKET_SIZE,
        seeds = [
            TICKET_SEED,
            &lottery_state.current_draw_id.to_le_bytes(),
            &lottery_state.current_draw_tickets.to_le_bytes()
        ],
        bump
    )]
    pub ticket: Account<'info, TicketData>,

    /// System program
    pub system_program: Program<'info, System>,
}

/// Create a single ticket account for a syndicate
///
/// This is called after buy_syndicate_tickets to create individual ticket accounts.
/// The funds have already been transferred; this just creates the account records.
///
/// # Arguments
/// * `ctx` - The context containing required accounts
/// * `numbers` - The 6 numbers for this ticket
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler_create_syndicate_ticket(
    ctx: Context<CreateSyndicateTicket>,
    numbers: [u8; 6],
) -> Result<()> {
    let clock = Clock::get()?;

    // Validate numbers
    validate_ticket_numbers(&numbers)?;

    // Sort numbers for consistent storage
    let mut sorted_numbers = numbers;
    sorted_numbers.sort();

    let current_draw_id = ctx.accounts.lottery_state.current_draw_id;
    let syndicate_key = ctx.accounts.syndicate.key();

    // Create ticket
    let ticket = &mut ctx.accounts.ticket;
    ticket.owner = syndicate_key; // Syndicate owns the ticket
    ticket.draw_id = current_draw_id;
    ticket.numbers = sorted_numbers;
    ticket.purchase_timestamp = clock.unix_timestamp;
    ticket.is_claimed = false;
    ticket.match_count = 0;
    ticket.prize_amount = 0;
    ticket.syndicate = Some(syndicate_key);
    ticket.bump = ctx.bumps.ticket;

    // Note: lottery_state.current_draw_tickets is NOT incremented here
    // because it was already incremented in buy_syndicate_tickets
    // This instruction only creates the account record

    msg!("Syndicate ticket created!");
    msg!("  Ticket: {}", ctx.accounts.ticket.key());
    msg!("  Syndicate: {}", syndicate_key);
    msg!("  Numbers: {:?}", sorted_numbers);

    Ok(())
}

// ============================================================================
// DISTRIBUTE SYNDICATE PRIZE INSTRUCTION
// ============================================================================

/// Parameters for distributing a prize to syndicate members
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct DistributeSyndicatePrizeParams {
    /// Draw ID for which the prize is being distributed
    pub draw_id: u64,
}

/// Accounts required for distributing a syndicate prize
///
/// ## Fix #7 — On-chain ticket verification
///
/// Previously this instruction accepted a `total_prize` parameter from the
/// authority and blindly transferred that amount from the prize pool.  A
/// compromised or malicious authority could inflate the amount at will.
///
/// Now the prize is **computed on-chain** from the actual ticket accounts
/// passed as `remaining_accounts`.  For every ticket the instruction:
///
/// 1. Deserializes it as `TicketData`
/// 2. Verifies `ticket.syndicate == Some(syndicate.key())`
/// 3. Verifies `ticket.draw_id == params.draw_id`
/// 4. Verifies `!ticket.is_claimed`
/// 5. Counts matches against `draw_result.winning_numbers`
/// 6. Looks up the per-winner prize via `draw_result.get_prize_for_matches()`
/// 7. Marks the ticket as claimed and writes it back
/// 8. Accumulates the batch prize total
///
/// The accumulated total is then transferred — no authority-supplied amount
/// can exceed what the tickets actually won.
///
/// For large syndicates the instruction can be called in batches (different
/// subsets of ticket accounts in `remaining_accounts` each call).
#[derive(Accounts)]
#[instruction(params: DistributeSyndicatePrizeParams)]
pub struct DistributeSyndicatePrize<'info> {
    /// The syndicate creator/manager (must also be lottery authority)
    #[account(mut)]
    pub manager: Signer<'info>,

    /// Lottery state (authority for prize pool)
    #[account(
        mut,
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump,
        constraint = lottery_state.authority == manager.key() @ LottoError::Unauthorized
    )]
    pub lottery_state: Account<'info, LotteryState>,

    /// The finalized draw result for `params.draw_id`.
    /// Used to look up winning numbers and per-tier prize amounts.
    #[account(
        seeds = [DRAW_SEED, &params.draw_id.to_le_bytes()],
        bump = draw_result.bump,
        constraint = draw_result.draw_id == params.draw_id @ LottoError::DrawIdMismatch,
        constraint = draw_result.is_finalized() @ LottoError::DrawNotFinalized
    )]
    pub draw_result: Account<'info, DrawResult>,

    /// The syndicate account
    #[account(
        mut,
        seeds = [
            SYNDICATE_SEED,
            syndicate.original_creator.as_ref(),
            &syndicate.syndicate_id.to_le_bytes()
        ],
        bump = syndicate.bump
    )]
    pub syndicate: Account<'info, Syndicate>,

    /// Syndicate's USDC token account (receives the prize)
    #[account(
        mut,
        seeds = [
            SYNDICATE_SEED,
            b"usdc",
            syndicate.key().as_ref()
        ],
        bump,
        constraint = syndicate_usdc.key() == syndicate.usdc_account @ LottoError::InvalidTokenAccount
    )]
    pub syndicate_usdc: Account<'info, TokenAccount>,

    /// Prize pool USDC token account (source of prize)
    #[account(
        mut,
        seeds = [b"prize_pool_usdc"],
        bump
    )]
    pub prize_pool_usdc: Account<'info, TokenAccount>,

    /// USDC mint
    pub usdc_mint: Account<'info, Mint>,

    /// Token program
    pub token_program: Program<'info, Token>,
}

/// Distribute prize to syndicate members by verifying ticket wins on-chain.
///
/// ## Fix #7 — On-chain syndicate prize verification
///
/// Syndicate ticket accounts must be passed as **writable** `remaining_accounts`.
/// The instruction iterates over each one, verifies ownership / draw / claim
/// state, counts matches, looks up the prize, marks the ticket claimed, and
/// accumulates the total.  Only the verified total is transferred.
///
/// For syndicates with many tickets, call this instruction in batches (each
/// batch is a different subset of remaining_accounts).
///
/// # Arguments
/// * `ctx`    - The context containing required accounts
/// * `params` - Distribution parameters (draw_id)
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler_distribute_syndicate_prize<'info>(
    ctx: Context<'_, '_, 'info, 'info, DistributeSyndicatePrize<'info>>,
    params: DistributeSyndicatePrizeParams,
) -> Result<()> {
    let syndicate_key = ctx.accounts.syndicate.key();
    let draw_result = &ctx.accounts.draw_result;
    let program_id = ctx.program_id;

    // =========================================================================
    // STEP 1: Iterate over remaining_accounts (syndicate ticket accounts),
    //         verify each ticket, compute prize, mark claimed.
    // =========================================================================
    let remaining = ctx.remaining_accounts;
    require!(!remaining.is_empty(), LottoError::NoWinningTicketsInBatch);

    let mut total_prize: u64 = 0;
    let mut tickets_processed: u32 = 0;
    let mut tickets_won: u32 = 0;

    for ticket_account_info in remaining.iter() {
        // a) Ticket account must be writable so we can mark it claimed
        require!(
            ticket_account_info.is_writable,
            LottoError::InvalidTicketAccount
        );

        // b) Ticket must be owned by this program
        require!(
            ticket_account_info.owner == program_id,
            LottoError::InvalidTicketAccount
        );

        // c) Deserialize the ticket
        let mut ticket_data_raw = ticket_account_info.try_borrow_mut_data()?;
        let mut readable: &[u8] = &ticket_data_raw;
        let mut ticket = TicketData::try_deserialize(&mut readable)
            .map_err(|_| LottoError::InvalidTicketAccount)?;

        // d) Verify the ticket belongs to this syndicate
        require!(
            ticket.syndicate == Some(syndicate_key),
            LottoError::SyndicateTicketNotOwned
        );

        // e) Verify the ticket is for the correct draw
        require!(
            ticket.draw_id == params.draw_id,
            LottoError::SyndicateTicketDrawMismatch
        );

        // f) Verify the ticket has not already been claimed
        require!(
            !ticket.is_claimed,
            LottoError::SyndicateTicketAlreadyClaimed
        );

        // g) Count matches against winning numbers
        let match_count = calculate_match_count(&ticket.numbers, &draw_result.winning_numbers);

        // h) Look up prize for this match tier
        let prize = draw_result.get_prize_for_matches(match_count);

        // i) Mark ticket as claimed and record match/prize info
        ticket.is_claimed = true;
        ticket.match_count = match_count;
        ticket.prize_amount = prize;

        // j) Write updated ticket data back to the account
        let mut writer: &mut [u8] = &mut ticket_data_raw;
        ticket
            .try_serialize(&mut writer)
            .map_err(|_| LottoError::InvalidTicketAccount)?;

        tickets_processed += 1;
        if prize > 0 {
            total_prize = total_prize.checked_add(prize).ok_or(LottoError::Overflow)?;
            tickets_won += 1;
        }
    }

    msg!(
        "  Tickets processed: {}, winning: {}, total_prize: {}",
        tickets_processed,
        tickets_won,
        total_prize
    );

    // If no winnings in this batch, nothing to transfer — still a valid call
    // (allows processing non-winning tickets to mark them claimed).
    if total_prize == 0 {
        msg!("  No prize to distribute in this batch (all tickets non-winning).");
        return Ok(());
    }

    // =========================================================================
    // STEP 2: Verify sufficient prize pool balance
    // =========================================================================
    require!(
        ctx.accounts.prize_pool_usdc.amount >= total_prize,
        LottoError::InsufficientFunds
    );

    // =========================================================================
    // STEP 3: Calculate manager fee and member pool
    // =========================================================================
    let manager_fee_bps = ctx.accounts.syndicate.manager_fee_bps;
    let manager_fee = if manager_fee_bps > 0 {
        (total_prize as u128 * manager_fee_bps as u128 / BPS_DENOMINATOR as u128) as u64
    } else {
        0
    };
    let member_pool = total_prize.saturating_sub(manager_fee);

    // =========================================================================
    // STEP 4: Transfer verified total from prize pool to syndicate USDC
    // =========================================================================
    let lottery_bump = ctx.accounts.lottery_state.bump;
    let seeds = &[LOTTERY_SEED, &[lottery_bump]];
    let signer_seeds = &[&seeds[..]];

    let cpi_accounts = Transfer {
        from: ctx.accounts.prize_pool_usdc.to_account_info(),
        to: ctx.accounts.syndicate_usdc.to_account_info(),
        authority: ctx.accounts.lottery_state.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
    token::transfer(cpi_ctx, total_prize)?;

    // =========================================================================
    // STEP 5: Update lottery_state internal accounting
    // =========================================================================
    // Deduction priority: fixed_prize_balance → reserve → jackpot (last resort)
    {
        let lottery_state = &mut ctx.accounts.lottery_state;
        let mut remaining_deduct = total_prize;

        // 1. Deduct from fixed_prize_balance
        let from_fixed = remaining_deduct.min(lottery_state.fixed_prize_balance);
        lottery_state.fixed_prize_balance =
            lottery_state.fixed_prize_balance.saturating_sub(from_fixed);
        remaining_deduct = remaining_deduct.saturating_sub(from_fixed);

        // 2. Deduct from reserve_balance
        if remaining_deduct > 0 {
            let from_reserve = remaining_deduct.min(lottery_state.reserve_balance);
            lottery_state.reserve_balance =
                lottery_state.reserve_balance.saturating_sub(from_reserve);
            remaining_deduct = remaining_deduct.saturating_sub(from_reserve);
        }

        // 3. Last resort: deduct from jackpot_balance
        if remaining_deduct > 0 {
            lottery_state.jackpot_balance = lottery_state
                .jackpot_balance
                .saturating_sub(remaining_deduct);
            msg!(
                "WARNING: Syndicate prize distribution required {} from jackpot",
                remaining_deduct
            );
        }

        msg!(
            "  Lottery state updated: jackpot={}, reserve={}, fixed_prize={}",
            lottery_state.jackpot_balance,
            lottery_state.reserve_balance,
            lottery_state.fixed_prize_balance
        );
    }

    // =========================================================================
    // STEP 6: Snapshot per-member unclaimed_prize
    // =========================================================================
    let syndicate = &mut ctx.accounts.syndicate;

    let mut total_allocated = 0u64;
    for i in 0..syndicate.members.len() {
        let share_bps = syndicate.members[i].share_percentage_bps;
        let member_share =
            (member_pool as u128 * share_bps as u128 / BPS_DENOMINATOR as u128) as u64;
        syndicate.members[i].unclaimed_prize = syndicate.members[i]
            .unclaimed_prize
            .checked_add(member_share)
            .unwrap_or(u64::MAX);
        total_allocated = total_allocated.saturating_add(member_share);
    }

    // Handle dust from integer division — give remainder to first member
    let dust = member_pool.saturating_sub(total_allocated);
    if dust > 0 && !syndicate.members.is_empty() {
        syndicate.members[0].unclaimed_prize =
            syndicate.members[0].unclaimed_prize.saturating_add(dust);
    }

    msg!(
        "  Per-member unclaimed_prize snapshot set ({} members, {} allocated, {} dust)",
        syndicate.members.len(),
        total_allocated,
        dust
    );

    // =========================================================================
    // STEP 7: Emit event
    // =========================================================================
    emit!(SyndicatePrizeDistributed {
        syndicate: syndicate_key,
        draw_id: params.draw_id,
        total_prize,
        manager_fee,
        members_paid: syndicate.member_count,
        timestamp: Clock::get()?.unix_timestamp,
    });

    msg!("Syndicate prize distributed (on-chain verified)!");
    msg!("  Syndicate: {}", syndicate_key);
    msg!("  Draw ID: {}", params.draw_id);
    msg!("  Tickets processed: {}", tickets_processed);
    msg!("  Tickets won: {}", tickets_won);
    msg!("  Total prize (verified): {} USDC lamports", total_prize);
    msg!("  Manager fee: {} USDC lamports", manager_fee);
    msg!("  Member pool: {} USDC lamports", member_pool);
    msg!("  Members to receive: {}", syndicate.member_count);

    Ok(())
}

// ============================================================================
// CLAIM SYNDICATE MEMBER PRIZE INSTRUCTION
// ============================================================================

/// Parameters for claiming a member's share of syndicate prize
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ClaimSyndicateMemberPrizeParams {
    /// Amount to claim (must be <= member's share)
    pub amount: u64,
}

/// Accounts required for claiming a syndicate member prize
#[derive(Accounts)]
#[instruction(params: ClaimSyndicateMemberPrizeParams)]
pub struct ClaimSyndicateMemberPrize<'info> {
    /// The member claiming their prize
    #[account(mut)]
    pub member: Signer<'info>,

    /// The syndicate account
    /// SECURITY FIX (Issue #1): Use original_creator for PDA seed derivation
    #[account(
        mut,
        seeds = [
            SYNDICATE_SEED,
            syndicate.original_creator.as_ref(),
            &syndicate.syndicate_id.to_le_bytes()
        ],
        bump = syndicate.bump
    )]
    pub syndicate: Account<'info, Syndicate>,

    /// Member's USDC token account (receives the prize)
    #[account(
        mut,
        constraint = member_usdc.owner == member.key(),
        constraint = member_usdc.mint == usdc_mint.key()
    )]
    pub member_usdc: Account<'info, TokenAccount>,

    /// Syndicate's USDC token account (source of prize)
    /// FIXED: PDA seeds must match CreateSyndicate: [SYNDICATE_SEED, b"usdc", syndicate.key()]
    /// Previously used [SYNDICATE_SEED, b"usdc", creator, syndicate_id] which derives a
    /// different address and causes account validation failures.
    #[account(
        mut,
        seeds = [
            SYNDICATE_SEED,
            b"usdc",
            syndicate.key().as_ref()
        ],
        bump,
        constraint = syndicate_usdc.key() == syndicate.usdc_account @ LottoError::InvalidTokenAccount
    )]
    pub syndicate_usdc: Account<'info, TokenAccount>,

    /// USDC mint
    pub usdc_mint: Account<'info, Mint>,

    /// Token program
    pub token_program: Program<'info, Token>,
}

/// Claim a member's share of syndicate prize
///
/// This instruction:
/// 1. Validates the member is part of the syndicate
/// 2. Calculates member's share based on contribution percentage
/// 3. Transfers the claimed amount from syndicate to member
/// 4. Updates member's contribution (reduces it by claimed amount)
///
/// # Arguments
/// * `ctx` - The context containing required accounts
/// * `params` - Claim parameters
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler_claim_syndicate_member_prize(
    ctx: Context<ClaimSyndicateMemberPrize>,
    params: ClaimSyndicateMemberPrizeParams,
) -> Result<()> {
    let member_key = ctx.accounts.member.key();
    let syndicate_key = ctx.accounts.syndicate.key();
    let claim_amount = params.amount;

    // Validate claim amount
    require!(claim_amount > 0, LottoError::InvalidAmount);

    // Find the member in the syndicate
    let member_index = ctx
        .accounts
        .syndicate
        .members
        .iter()
        .position(|m| m.wallet == member_key)
        .ok_or(LottoError::NotSyndicateMember)?;

    let member_share_bps = ctx.accounts.syndicate.members[member_index].share_percentage_bps;
    let member_unclaimed = ctx.accounts.syndicate.members[member_index].unclaimed_prize;

    // SECURITY FIX (Issue #2): Use the snapshot-based unclaimed_prize field instead
    // of computing the claim from the live token account balance. This prevents
    // the race condition where early claimers reduce the balance for later members.
    //
    // The unclaimed_prize was set during distribute_syndicate_prize based on
    // the member's share_percentage_bps at distribution time. Claims simply
    // deduct from this per-member snapshot.
    require!(
        claim_amount <= member_unclaimed,
        LottoError::InsufficientFunds
    );

    // Validate syndicate token account has enough funds for the actual transfer
    require!(
        ctx.accounts.syndicate_usdc.amount >= claim_amount,
        LottoError::InsufficientFunds
    );

    // SECURITY FIX (Issue #1): Use original_creator for signer seeds
    let syndicate = &ctx.accounts.syndicate;
    let original_creator_key = syndicate.original_creator;
    let syndicate_id_bytes = syndicate.syndicate_id.to_le_bytes();
    let syndicate_bump = syndicate.bump;
    let seeds = &[
        SYNDICATE_SEED,
        original_creator_key.as_ref(),
        syndicate_id_bytes.as_ref(),
        &[syndicate_bump],
    ];
    let signer_seeds = &[&seeds[..]];

    let cpi_accounts = Transfer {
        from: ctx.accounts.syndicate_usdc.to_account_info(),
        to: ctx.accounts.member_usdc.to_account_info(),
        authority: ctx.accounts.syndicate.to_account_info(),
    };

    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);

    token::transfer(cpi_ctx, claim_amount)?;

    // SECURITY FIX (Issue #2): Deduct from the member's unclaimed_prize snapshot.
    // This ensures each member can only claim up to their pre-computed share,
    // regardless of when they claim relative to other members.
    let syndicate_mut = &mut ctx.accounts.syndicate;
    syndicate_mut.members[member_index].unclaimed_prize = syndicate_mut.members[member_index]
        .unclaimed_prize
        .saturating_sub(claim_amount);

    msg!("Syndicate member prize claimed!");
    msg!("  Member: {}", member_key);
    msg!("  Syndicate: {}", syndicate_key);
    msg!("  Amount claimed: {} USDC lamports", claim_amount);
    msg!("  Member share: {} BPS", member_share_bps);
    msg!(
        "  Remaining unclaimed: {} USDC lamports",
        syndicate_mut.members[member_index].unclaimed_prize
    );
    msg!(
        "  Remaining syndicate funds: {} USDC lamports",
        ctx.accounts
            .syndicate_usdc
            .amount
            .saturating_sub(claim_amount)
    );

    Ok(())
}

// ============================================================================
// UPDATE SYNDICATE CONFIG INSTRUCTION
// ============================================================================

/// Parameters for updating syndicate configuration
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct UpdateSyndicateConfigParams {
    /// New syndicate name (max 32 bytes UTF-8, empty to keep current)
    pub name: Option<[u8; 32]>,
    /// New public/private status
    pub is_public: Option<bool>,
    /// New manager fee in basis points (max 500 = 5%)
    pub manager_fee_bps: Option<u16>,
}

/// Accounts required for updating syndicate configuration
#[derive(Accounts)]
#[instruction(params: UpdateSyndicateConfigParams)]
pub struct UpdateSyndicateConfig<'info> {
    /// The syndicate creator/manager
    #[account(mut)]
    pub manager: Signer<'info>,

    /// The syndicate account
    /// SECURITY FIX (Issue #1): Use original_creator for PDA seed derivation
    /// to prevent fund-lock after creator transfer.
    #[account(
        mut,
        seeds = [
            SYNDICATE_SEED,
            syndicate.original_creator.as_ref(),
            &syndicate.syndicate_id.to_le_bytes()
        ],
        bump = syndicate.bump,
        constraint = syndicate.creator == manager.key() @ LottoError::Unauthorized
    )]
    pub syndicate: Account<'info, Syndicate>,
}

/// Update syndicate configuration
///
/// This instruction allows the syndicate creator to update:
/// - Syndicate name
/// - Public/private status
/// - Manager fee (within limits)
///
/// # Arguments
/// * `ctx` - The context containing required accounts
/// * `params` - Configuration update parameters
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler_update_syndicate_config(
    ctx: Context<UpdateSyndicateConfig>,
    params: UpdateSyndicateConfigParams,
) -> Result<()> {
    let syndicate_key = ctx.accounts.syndicate.key();
    let mut updated = false;

    // Update name if provided
    if let Some(name) = params.name {
        // Validate name is not empty (all zeros)
        let mut has_content = false;
        for &byte in &name {
            if byte != 0 {
                has_content = true;
                break;
            }
        }
        require!(has_content, LottoError::InvalidSyndicateConfig);

        ctx.accounts.syndicate.name = name;
        updated = true;
        msg!("Updated syndicate name");
    }

    // Update public/private status if provided
    if let Some(is_public) = params.is_public {
        ctx.accounts.syndicate.is_public = is_public;
        updated = true;
        msg!(
            "Updated syndicate visibility: {}",
            if is_public { "public" } else { "private" }
        );
    }

    // Update manager fee if provided
    if let Some(manager_fee_bps) = params.manager_fee_bps {
        require!(
            manager_fee_bps <= MAX_MANAGER_FEE_BPS,
            LottoError::ManagerFeeTooHigh
        );
        ctx.accounts.syndicate.manager_fee_bps = manager_fee_bps;
        updated = true;
        msg!("Updated manager fee: {} BPS", manager_fee_bps);
    }

    require!(updated, LottoError::InvalidSyndicateConfig);

    msg!("Syndicate configuration updated!");
    msg!("  Syndicate: {}", syndicate_key);
    msg!("  Creator: {}", ctx.accounts.manager.key());

    Ok(())
}

// ============================================================================
// REMOVE SYNDICATE MEMBER INSTRUCTION
// ============================================================================

/// Parameters for removing a syndicate member
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct RemoveSyndicateMemberParams {
    /// Member wallet address to remove
    pub member_wallet: Pubkey,
}

/// Accounts required for removing a syndicate member
#[derive(Accounts)]
#[instruction(params: RemoveSyndicateMemberParams)]
pub struct RemoveSyndicateMember<'info> {
    /// The syndicate creator/manager
    #[account(mut)]
    pub manager: Signer<'info>,

    /// The syndicate account
    /// SECURITY FIX (Issue #1): Use original_creator for PDA seed derivation.
    /// After a creator transfer, syndicate.creator differs from the original
    /// creator used during PDA derivation. Using original_creator ensures
    /// the PDA always resolves correctly.
    #[account(
        mut,
        seeds = [
            SYNDICATE_SEED,
            syndicate.original_creator.as_ref(),
            &syndicate.syndicate_id.to_le_bytes()
        ],
        bump = syndicate.bump,
        constraint = syndicate.creator == manager.key() @ LottoError::Unauthorized
    )]
    pub syndicate: Account<'info, Syndicate>,

    /// Member's USDC token account (receives refund)
    #[account(
        mut,
        constraint = member_usdc.owner == params.member_wallet,
        constraint = member_usdc.mint == usdc_mint.key()
    )]
    pub member_usdc: Account<'info, TokenAccount>,

    /// Syndicate's USDC token account (source of refund)
    /// FIXED: PDA seeds must match CreateSyndicate: [SYNDICATE_SEED, b"usdc", syndicate.key()]
    /// Previously used [SYNDICATE_SEED, b"usdc", manager.key(), syndicate_id] which derives
    /// a different address and causes account validation failures.
    #[account(
        mut,
        seeds = [
            SYNDICATE_SEED,
            b"usdc",
            syndicate.key().as_ref()
        ],
        bump,
        constraint = syndicate_usdc.key() == syndicate.usdc_account @ LottoError::InvalidTokenAccount
    )]
    pub syndicate_usdc: Account<'info, TokenAccount>,

    /// USDC mint
    pub usdc_mint: Account<'info, Mint>,

    /// Token program
    pub token_program: Program<'info, Token>,
}

/// Remove a member from syndicate (creator only)
///
/// This instruction:
/// 1. Validates the caller is the syndicate creator
/// 2. Finds the member to remove
/// 3. Calculates refund amount (member's contribution)
/// 4. Transfers refund from syndicate to member
/// 5. Removes member from syndicate
///
/// Note: Members can also leave voluntarily via `leave_syndicate`.
///
/// # Arguments
/// * `ctx` - The context containing required accounts
/// * `params` - Member removal parameters
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler_remove_syndicate_member(
    ctx: Context<RemoveSyndicateMember>,
    params: RemoveSyndicateMemberParams,
) -> Result<()> {
    let syndicate_key = ctx.accounts.syndicate.key();
    let member_wallet = params.member_wallet;

    // Cannot remove the creator
    require!(
        member_wallet != ctx.accounts.syndicate.creator,
        LottoError::Unauthorized
    );

    // SECURITY FIX (Issue #1): Use original_creator for signer seeds
    let syndicate_original_creator = ctx.accounts.syndicate.original_creator;
    let syndicate_id = ctx.accounts.syndicate.syndicate_id;
    let syndicate_bump = ctx.accounts.syndicate.bump;

    // Find and remove the member, getting their contribution
    let refund_amount = ctx
        .accounts
        .syndicate
        .remove_member(&member_wallet)
        .map_err(|_| LottoError::NotSyndicateMember)?;

    // Validate syndicate has enough funds for refund
    require!(
        ctx.accounts.syndicate_usdc.amount >= refund_amount,
        LottoError::InsufficientFunds
    );

    // FIXED: Use syndicate PDA as authority (not syndicate_usdc token account).
    // The syndicate PDA is the owner/authority of the token account, so it must
    // sign the transfer. Previously used syndicate_usdc as authority which cannot
    // sign for itself.
    let seeds = &[
        SYNDICATE_SEED,
        syndicate_original_creator.as_ref(),
        &syndicate_id.to_le_bytes(),
        &[syndicate_bump],
    ];
    let signer_seeds = &[&seeds[..]];

    let transfer_instruction = Transfer {
        from: ctx.accounts.syndicate_usdc.to_account_info(),
        to: ctx.accounts.member_usdc.to_account_info(),
        authority: ctx.accounts.syndicate.to_account_info(),
    };

    let cpi_context = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        transfer_instruction,
        signer_seeds,
    );

    token::transfer(cpi_context, refund_amount)?;

    msg!("Syndicate member removed!");
    msg!("  Syndicate: {}", syndicate_key);
    msg!("  Manager: {}", ctx.accounts.manager.key());
    msg!("  Removed member: {}", member_wallet);
    msg!("  Refund amount: {} USDC lamports", refund_amount);
    msg!(
        "  Remaining members: {}",
        ctx.accounts.syndicate.member_count
    );

    Ok(())
}

// ============================================================================
// TRANSFER CREATOR INSTRUCTION
// ============================================================================

/// Parameters for transferring creator role
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct TransferSyndicateCreatorParams {
    /// New creator's wallet address (must be existing member)
    pub new_creator: Pubkey,
}

/// Accounts required for transferring syndicate creator role
#[derive(Accounts)]
#[instruction(params: TransferSyndicateCreatorParams)]
pub struct TransferSyndicateCreator<'info> {
    /// The current creator transferring the role
    #[account(mut)]
    pub creator: Signer<'info>,

    /// The syndicate account
    /// SECURITY FIX (Issue #1): Use original_creator for PDA seed derivation
    #[account(
        mut,
        seeds = [
            SYNDICATE_SEED,
            syndicate.original_creator.as_ref(),
            &syndicate.syndicate_id.to_le_bytes()
        ],
        bump = syndicate.bump,
        constraint = syndicate.creator == creator.key() @ LottoError::Unauthorized
    )]
    pub syndicate: Account<'info, Syndicate>,
}

/// Transfer creator role to another syndicate member
///
/// This instruction:
/// 1. Validates the caller is the current syndicate creator
/// 2. Validates the new creator is an existing member
/// 3. Transfers the creator role to the new member
///
/// Use this to transfer management responsibility before leaving
/// a syndicate as creator.
///
/// # Arguments
/// * `ctx` - The context containing required accounts
/// * `params` - Transfer parameters including new creator's wallet
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler_transfer_syndicate_creator(
    ctx: Context<TransferSyndicateCreator>,
    params: TransferSyndicateCreatorParams,
) -> Result<()> {
    let clock = Clock::get()?;
    let syndicate_key = ctx.accounts.syndicate.key();
    let old_creator = ctx.accounts.creator.key();
    let new_creator = params.new_creator;

    // Cannot transfer to self
    require!(new_creator != old_creator, LottoError::InvalidAuthority);

    // New creator must be an existing member
    let is_member = ctx
        .accounts
        .syndicate
        .members
        .iter()
        .any(|m| m.wallet == new_creator);

    require!(is_member, LottoError::NotSyndicateMember);

    // Transfer creator role
    ctx.accounts.syndicate.creator = new_creator;

    msg!("Syndicate creator role transferred!");
    msg!("  Syndicate: {}", syndicate_key);
    msg!("  Old creator: {}", old_creator);
    msg!("  New creator: {}", new_creator);
    msg!("  Timestamp: {}", clock.unix_timestamp);

    Ok(())
}
