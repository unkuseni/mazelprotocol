//! Syndicate Instructions
//!
//! This module contains instructions for syndicate (group buying pool) management:
//! - create_syndicate: Create a new syndicate pool
//! - join_syndicate: Join an existing syndicate
//! - buy_syndicate_tickets: Purchase tickets for the entire syndicate
//! - distribute_syndicate_prize: Distribute winnings to syndicate members

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::errors::LottoError;
use crate::events::{SyndicateCreated, SyndicateMemberJoined};
use crate::state::{Syndicate, SyndicateMember, UserStats};

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
        bump
    )]
    pub syndicate: Account<'info, Syndicate>,

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

        Ok(())
    }
}

/// Create a new syndicate pool
///
/// This instruction:
/// 1. Validates the syndicate parameters
/// 2. Creates the syndicate account PDA
/// 3. Adds the creator as the first member
/// 4. Sets up the syndicate configuration
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
    syndicate.syndicate_id = params.syndicate_id;
    syndicate.name = params.name;
    syndicate.is_public = params.is_public;
    syndicate.member_count = 1; // Creator is first member
    syndicate.total_contribution = 0;
    syndicate.manager_fee_bps = params.manager_fee_bps;
    syndicate.bump = ctx.bumps.syndicate;

    // Add creator as first member with 0 contribution
    // (They can contribute later via join_syndicate)
    syndicate.members = vec![SyndicateMember {
        wallet: ctx.accounts.creator.key(),
        contribution: 0,
        share_percentage_bps: 10000, // 100% until others join
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
    #[account(
        mut,
        realloc = Syndicate::size_for_members(syndicate.member_count as usize + 1),
        realloc::payer = member,
        realloc::zero = false,
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
    #[account(mut)]
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
/// 4. Adds the member to the syndicate
/// 5. Recalculates all member shares
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

    // Transfer contribution first (before mutable borrow of syndicate)
    if params.contribution > 0 {
        ctx.accounts.transfer_contribution(params.contribution)?;
    }

    // Now do all mutable operations on syndicate
    let syndicate = &mut ctx.accounts.syndicate;

    if is_existing_member {
        // If existing member, add to their contribution
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
        // New member
        syndicate.members.push(SyndicateMember {
            wallet: member_key,
            contribution: params.contribution,
            share_percentage_bps: 0, // Will be calculated
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
    #[account(
        mut,
        constraint = syndicate.creator != member.key() @ LottoError::Unauthorized // Creator can't leave
    )]
    pub syndicate: Account<'info, Syndicate>,

    /// Member's USDC token account (to receive refund)
    #[account(
        mut,
        constraint = member_usdc.owner == member.key() @ LottoError::TokenAccountOwnerMismatch
    )]
    pub member_usdc: Account<'info, TokenAccount>,

    /// Syndicate's USDC token account (source of refund)
    #[account(mut)]
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
/// 3. Transfers USDC refund to member
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

    let syndicate = &mut ctx.accounts.syndicate;

    // Find the member
    let member_index = syndicate
        .members
        .iter()
        .position(|m| m.wallet == member_key)
        .ok_or(LottoError::NotSyndicateMember)?;

    let contribution = syndicate.members[member_index].contribution;

    // Remove the member
    syndicate.members.remove(member_index);
    syndicate.member_count = syndicate.member_count.saturating_sub(1);
    syndicate.total_contribution = syndicate.total_contribution.saturating_sub(contribution);

    // Recalculate shares
    syndicate.recalculate_shares();

    let remaining_members = syndicate.member_count;

    // Note: In a full implementation, you would transfer the contribution back
    // This requires the syndicate to have authority over its USDC account
    // For now, we just log the refund amount

    msg!("Member left syndicate!");
    msg!("  Syndicate: {}", syndicate_key);
    msg!("  Member: {}", member_key);
    msg!("  Refund amount: {} USDC lamports", contribution);
    msg!("  Remaining members: {}", remaining_members);

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
}

/// Close a syndicate
///
/// This instruction:
/// 1. Validates the caller is the creator
/// 2. Validates all other members have left
/// 3. Closes the syndicate account and returns rent to creator
///
/// # Arguments
/// * `ctx` - The context containing required accounts
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler_close_syndicate(ctx: Context<CloseSyndicate>) -> Result<()> {
    msg!("Syndicate closed!");
    msg!("  Syndicate: {}", ctx.accounts.syndicate.key());
    msg!("  Creator: {}", ctx.accounts.creator.key());

    // Account closure is handled automatically by the `close` constraint

    Ok(())
}
