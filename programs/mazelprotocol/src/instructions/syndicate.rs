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

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::errors::LottoError;
use crate::events::{
    BulkTicketsPurchased, SyndicateCreated, SyndicateMemberJoined, SyndicatePrizeDistributed,
};
use crate::state::{LotteryState, Syndicate, SyndicateMember, TicketData, UserStats};

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

    // Get the syndicate info needed for PDA signer seeds
    let syndicate_creator = ctx.accounts.syndicate.creator;
    let syndicate_id = ctx.accounts.syndicate.syndicate_id;
    let syndicate_bump = ctx.accounts.syndicate.bump;

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

        // Create signer seeds for the syndicate PDA
        let seeds = &[
            SYNDICATE_SEED,
            syndicate_creator.as_ref(),
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
    let syndicate_creator = ctx.accounts.syndicate.creator;
    let syndicate_id = ctx.accounts.syndicate.syndicate_id;
    let syndicate_bump = ctx.accounts.syndicate.bump;
    let remaining_balance = ctx.accounts.syndicate_usdc.amount;

    // Get creator's recorded contribution for comparison
    let creator_contribution = ctx
        .accounts
        .syndicate
        .find_member(&syndicate_creator)
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
            syndicate_creator.as_ref(),
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
        syndicate_creator.as_ref(),
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

    // Get syndicate info for signer seeds
    let syndicate_creator = ctx.accounts.syndicate.creator;
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
        syndicate_creator.as_ref(),
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
    #[account(
        mut,
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

    // Get syndicate signer seeds
    let syndicate_creator = ctx.accounts.syndicate.creator;
    let syndicate_id = ctx.accounts.syndicate.syndicate_id;
    let syndicate_bump = ctx.accounts.syndicate.bump;

    let seeds = &[
        SYNDICATE_SEED,
        syndicate_creator.as_ref(),
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

    // Transfer prize pool amount from syndicate to prize pool
    if total_prize_pool > 0 {
        let cpi_accounts = Transfer {
            from: ctx.accounts.syndicate_usdc.to_account_info(),
            to: ctx.accounts.prize_pool_usdc.to_account_info(),
            authority: ctx.accounts.syndicate.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
        token::transfer(cpi_ctx, total_prize_pool)?;
    }

    // Update syndicate total contribution (deduct spent amount)
    let syndicate = &mut ctx.accounts.syndicate;
    syndicate.total_contribution = syndicate.total_contribution.saturating_sub(total_cost);

    // Calculate jackpot, reserve, and insurance contributions
    let jackpot_contribution = (total_prize_pool as u128 * JACKPOT_ALLOCATION_BPS as u128
        / BPS_DENOMINATOR as u128) as u64;
    let reserve_contribution = (total_prize_pool as u128 * RESERVE_ALLOCATION_BPS as u128
        / BPS_DENOMINATOR as u128) as u64;
    let insurance_contribution = (total_prize_pool as u128 * INSURANCE_ALLOCATION_BPS as u128
        / BPS_DENOMINATOR as u128) as u64;

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
    /// Total prize amount to distribute (in USDC lamports)
    pub total_prize: u64,
}

/// Accounts required for distributing a syndicate prize
#[derive(Accounts)]
#[instruction(params: DistributeSyndicatePrizeParams)]
pub struct DistributeSyndicatePrize<'info> {
    /// The syndicate creator/manager
    #[account(mut)]
    pub manager: Signer<'info>,

    /// Lottery state (authority for prize pool)
    #[account(
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump
    )]
    pub lottery_state: Account<'info, LotteryState>,

    /// The syndicate account
    #[account(
        mut,
        seeds = [
            SYNDICATE_SEED,
            syndicate.creator.as_ref(),
            &syndicate.syndicate_id.to_le_bytes()
        ],
        bump = syndicate.bump,
        constraint = syndicate.creator == manager.key() @ LottoError::Unauthorized
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

/// Distribute prize to syndicate members
///
/// This instruction:
/// 1. Transfers prize from prize pool to syndicate USDC account
/// 2. Calculates manager fee (if any)
/// 3. Updates syndicate statistics
/// 4. Emits event for tracking
///
/// Note: Individual members must claim their shares separately via
/// `claim_syndicate_member_prize` instruction.
///
/// # Arguments
/// * `ctx` - The context containing required accounts
/// * `params` - Prize distribution parameters
///
/// # Returns
/// * `Result<()>` - Success or error
pub fn handler_distribute_syndicate_prize(
    ctx: Context<DistributeSyndicatePrize>,
    params: DistributeSyndicatePrizeParams,
) -> Result<()> {
    let syndicate_key = ctx.accounts.syndicate.key();
    let total_prize = params.total_prize;
    let manager_fee_bps = ctx.accounts.syndicate.manager_fee_bps;

    // Validate prize amount
    require!(total_prize > 0, LottoError::InvalidAmount);
    require!(
        ctx.accounts.prize_pool_usdc.amount >= total_prize,
        LottoError::InsufficientFunds
    );

    // Calculate manager fee
    let manager_fee = if manager_fee_bps > 0 {
        (total_prize as u128 * manager_fee_bps as u128 / BPS_DENOMINATOR as u128) as u64
    } else {
        0
    };

    // Amount to distribute to members (after manager fee)
    let member_pool = total_prize.saturating_sub(manager_fee);

    // Transfer prize from prize pool to syndicate using lottery_state as authority
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

    // Update syndicate statistics
    let syndicate = &mut ctx.accounts.syndicate;
    syndicate.total_contribution = syndicate.total_contribution.saturating_add(member_pool);

    // Emit event
    emit!(SyndicatePrizeDistributed {
        syndicate: syndicate_key,
        draw_id: params.draw_id,
        total_prize,
        manager_fee,
        members_paid: syndicate.member_count,
        timestamp: Clock::get()?.unix_timestamp,
    });

    msg!("Syndicate prize distributed!");
    msg!("  Syndicate: {}", syndicate_key);
    msg!("  Draw ID: {}", params.draw_id);
    msg!("  Total prize: {} USDC lamports", total_prize);
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
    #[account(
        mut,
        seeds = [
            SYNDICATE_SEED,
            syndicate.creator.as_ref(),
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
    #[account(
        mut,
        seeds = [
            SYNDICATE_SEED,
            b"usdc",
            syndicate.creator.as_ref(),
            &syndicate.syndicate_id.to_le_bytes()
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
    let _member_contribution = ctx.accounts.syndicate.members[member_index].contribution;

    // Calculate member's maximum claimable amount
    // This is based on their share of the total syndicate funds
    let total_syndicate_funds = ctx.accounts.syndicate_usdc.amount;
    let member_max_claim =
        (total_syndicate_funds as u128 * member_share_bps as u128 / BPS_DENOMINATOR as u128) as u64;

    // Validate claim amount doesn't exceed member's share
    require!(
        claim_amount <= member_max_claim,
        LottoError::InsufficientFunds
    );

    // Validate syndicate has enough funds
    require!(
        ctx.accounts.syndicate_usdc.amount >= claim_amount,
        LottoError::InsufficientFunds
    );

    // Transfer prize from syndicate to member using syndicate as authority
    let syndicate = &ctx.accounts.syndicate;
    let creator_key = syndicate.creator;
    let syndicate_id_bytes = syndicate.syndicate_id.to_le_bytes();
    let syndicate_bump = syndicate.bump;
    let seeds = &[
        SYNDICATE_SEED,
        creator_key.as_ref(),
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

    // Update member's contribution (reduce it by claimed amount)
    // This ensures future share calculations are accurate
    let syndicate = &mut ctx.accounts.syndicate;
    let member = &mut syndicate.members[member_index];

    // Reduce contribution by claimed amount (but not below zero)
    member.contribution = member.contribution.saturating_sub(claim_amount);

    // Reduce total syndicate contribution
    syndicate.total_contribution = syndicate.total_contribution.saturating_sub(claim_amount);

    // Recalculate shares since contributions have changed
    syndicate.recalculate_shares();

    msg!("Syndicate member prize claimed!");
    msg!("  Member: {}", member_key);
    msg!("  Syndicate: {}", syndicate_key);
    msg!("  Amount claimed: {} USDC lamports", claim_amount);
    msg!("  Member share: {} BPS", member_share_bps);
    msg!("  Member max claim: {} USDC lamports", member_max_claim);
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

    /// Member's USDC token account (receives refund)
    #[account(
        mut,
        constraint = member_usdc.owner == params.member_wallet,
        constraint = member_usdc.mint == usdc_mint.key()
    )]
    pub member_usdc: Account<'info, TokenAccount>,

    /// Syndicate's USDC token account (source of refund)
    #[account(
        mut,
        seeds = [
            SYNDICATE_SEED,
            b"usdc",
            manager.key().as_ref(),
            &syndicate.syndicate_id.to_le_bytes()
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

    // Transfer refund from syndicate to member
    let transfer_instruction = Transfer {
        from: ctx.accounts.syndicate_usdc.to_account_info(),
        to: ctx.accounts.member_usdc.to_account_info(),
        authority: ctx.accounts.syndicate_usdc.to_account_info(),
    };

    let cpi_context = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        transfer_instruction,
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
