//! SolanaLotto Protocol - Main Program Entry Point
//!
//! SolanaLotto is a decentralized lottery protocol built on Solana featuring:
//! - Provably fair randomness via Switchboard's commit-reveal pattern
//! - Positive-EV rolldown mechanics when jackpot reaches caps
//! - Dynamic house fee based on jackpot level
//! - Syndicate (group buying) support
//! - 6/46 matrix (pick 6 numbers from 1-46)
//!
//! # Key Features
//! - **Jackpot Soft Cap ($1.75M)**: Probabilistic rolldown begins
//! - **Jackpot Hard Cap ($2.25M)**: Forced rolldown to lower tiers
//! - **Pari-mutuel Rolldown**: 25% to Match 5, 35% to Match 4, 40% to Match 3
//! - **Fixed Prizes (Normal Mode)**: Match 5 = $4k, Match 4 = $150, Match 3 = $5
//! - **Dynamic Fees**: 28-40% based on jackpot level
//!
//! # Architecture
//! The program uses Anchor framework with the following key accounts:
//! - `LotteryState`: Global lottery configuration and state
//! - `DrawResult`: Results of each draw including winning numbers and prizes
//! - `TicketData`: Individual ticket with selected numbers
//! - `UserStats`: Player statistics and streak tracking
//! - `Syndicate`: Group buying pool with automatic prize splitting

use anchor_lang::prelude::*;

// Module declarations
pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

// Re-export everything needed by the program and clients
pub use constants::*;
pub use errors::*;
pub use events::*;
pub use state::*;

// Re-export all instruction account structs at crate root (required by Anchor)
pub use instructions::admin::*;
pub use instructions::buy_ticket::*;
pub use instructions::claim_prize::*;
pub use instructions::commit_randomness::*;
pub use instructions::execute_draw::*;
pub use instructions::finalize_draw::*;
pub use instructions::initialize::*;
pub use instructions::syndicate::*;

// Program ID - Update this after deployment
declare_id!("11111111111111111111111111111111");

/// SolanaLotto Protocol Program
#[program]
pub mod solana_lotto {
    use super::*;

    // =========================================================================
    // ADMIN INSTRUCTIONS
    // =========================================================================

    /// Initialize the lottery program
    ///
    /// This sets up the main lottery state account with initial configuration.
    /// Can only be called once. The caller becomes the authority.
    ///
    /// # Arguments
    /// * `ctx` - Initialize accounts context
    /// * `params` - Initial configuration parameters
    pub fn initialize(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
        instructions::initialize::handler(ctx, params)
    }

    /// Pause the lottery (emergency stop)
    ///
    /// Stops all lottery operations including ticket purchases and draws.
    /// Only the authority can pause.
    ///
    /// # Arguments
    /// * `ctx` - Pause accounts context
    /// * `reason` - Reason for pausing (logged)
    pub fn pause(ctx: Context<Pause>, reason: String) -> Result<()> {
        instructions::admin::handler_pause(ctx, reason)
    }

    /// Unpause the lottery
    ///
    /// Resumes lottery operations after a pause.
    /// Only the authority can unpause.
    ///
    /// # Arguments
    /// * `ctx` - Unpause accounts context
    pub fn unpause(ctx: Context<Unpause>) -> Result<()> {
        instructions::admin::handler_unpause(ctx)
    }

    /// Update lottery configuration
    ///
    /// Updates various configuration parameters. In production,
    /// this should be behind a timelock.
    ///
    /// # Arguments
    /// * `ctx` - UpdateConfig accounts context
    /// * `params` - New configuration parameters
    pub fn update_config(ctx: Context<UpdateConfig>, params: UpdateConfigParams) -> Result<()> {
        instructions::admin::handler_update_config(ctx, params)
    }

    /// Withdraw accumulated house fees
    ///
    /// Transfers house fees to a treasury or operator account.
    /// Only the authority can withdraw.
    ///
    /// # Arguments
    /// * `ctx` - WithdrawHouseFees accounts context
    /// * `amount` - Amount to withdraw in USDC lamports
    pub fn withdraw_house_fees(ctx: Context<WithdrawHouseFees>, amount: u64) -> Result<()> {
        instructions::admin::handler_withdraw_house_fees(ctx, amount)
    }

    /// Transfer authority to a new address
    ///
    /// Transfers control of the lottery to a new authority.
    /// Only current authority can transfer.
    ///
    /// # Arguments
    /// * `ctx` - TransferAuthority accounts context
    pub fn transfer_authority(ctx: Context<TransferAuthority>) -> Result<()> {
        instructions::admin::handler_transfer_authority(ctx)
    }

    // =========================================================================
    // TICKET INSTRUCTIONS
    // =========================================================================

    /// Buy a single lottery ticket
    ///
    /// Purchases a ticket with 6 selected numbers from 1-46.
    /// Numbers must be unique and within valid range.
    /// USDC is transferred from player to prize pool and house fee accounts.
    ///
    /// # Arguments
    /// * `ctx` - BuyTicket accounts context
    /// * `params` - Selected numbers
    pub fn buy_ticket(ctx: Context<BuyTicket>, params: BuyTicketParams) -> Result<()> {
        instructions::buy_ticket::handler(ctx, params)
    }

    // =========================================================================
    // DRAW INSTRUCTIONS
    // =========================================================================

    /// Commit to randomness for the upcoming draw
    ///
    /// This is the COMMIT phase of the commit-reveal pattern.
    /// It stores the randomness account reference and commit slot.
    /// The randomness must NOT be revealed yet at this point.
    ///
    /// # Security
    /// - Must be called BEFORE randomness is revealed
    /// - Stores seed_slot for verification during reveal
    /// - Marks draw as in progress
    ///
    /// # Arguments
    /// * `ctx` - CommitRandomness accounts context
    pub fn commit_randomness(ctx: Context<CommitRandomness>) -> Result<()> {
        instructions::commit_randomness::handler(ctx)
    }

    /// Execute the draw by revealing randomness
    ///
    /// This is the REVEAL phase of the commit-reveal pattern.
    /// It retrieves the revealed randomness from Switchboard,
    /// verifies it matches the commit, and generates winning numbers.
    ///
    /// # Security
    /// - Randomness account must match the committed reference
    /// - seed_slot must match commit_slot
    /// - Creates draw result with winning numbers
    ///
    /// # Arguments
    /// * `ctx` - ExecuteDraw accounts context
    pub fn execute_draw(ctx: Context<ExecuteDraw>) -> Result<()> {
        instructions::execute_draw::handler(ctx)
    }

    /// Finalize the draw with winner counts
    ///
    /// Called after off-chain indexing determines winner counts.
    /// Calculates prizes (fixed or pari-mutuel rolldown),
    /// updates jackpot balance, and prepares for next draw.
    ///
    /// # Arguments
    /// * `ctx` - FinalizeDraw accounts context
    /// * `params` - Winner counts by tier
    pub fn finalize_draw(ctx: Context<FinalizeDraw>, params: FinalizeDrawParams) -> Result<()> {
        instructions::finalize_draw::handler(ctx, params)
    }

    // =========================================================================
    // PRIZE INSTRUCTIONS
    // =========================================================================

    /// Claim prize for a winning ticket
    ///
    /// Calculates match count against winning numbers and
    /// transfers the appropriate prize from the prize pool.
    ///
    /// # Prize Tiers (Normal Mode)
    /// - Match 6: Jackpot (variable)
    /// - Match 5: $4,000
    /// - Match 4: $150
    /// - Match 3: $5
    /// - Match 2: Free ticket ($2.50)
    ///
    /// # Prize Tiers (Rolldown Mode)
    /// - Match 5: 25% of jackpot (pari-mutuel)
    /// - Match 4: 35% of jackpot (pari-mutuel)
    /// - Match 3: 40% of jackpot (pari-mutuel)
    ///
    /// # Arguments
    /// * `ctx` - ClaimPrize accounts context
    pub fn claim_prize(ctx: Context<ClaimPrize>) -> Result<()> {
        instructions::claim_prize::handler(ctx)
    }

    // =========================================================================
    // SYNDICATE INSTRUCTIONS
    // =========================================================================

    /// Create a new syndicate (group buying pool)
    ///
    /// Creates a syndicate that allows multiple players to pool
    /// funds and share prizes proportionally.
    ///
    /// # Arguments
    /// * `ctx` - CreateSyndicate accounts context
    /// * `params` - Syndicate configuration
    pub fn create_syndicate(
        ctx: Context<CreateSyndicate>,
        params: CreateSyndicateParams,
    ) -> Result<()> {
        instructions::syndicate::handler_create_syndicate(ctx, params)
    }

    /// Join an existing syndicate
    ///
    /// Adds the caller to a syndicate with a USDC contribution.
    /// Member shares are calculated proportionally to contributions.
    ///
    /// # Arguments
    /// * `ctx` - JoinSyndicate accounts context
    /// * `params` - Contribution amount
    pub fn join_syndicate(ctx: Context<JoinSyndicate>, params: JoinSyndicateParams) -> Result<()> {
        instructions::syndicate::handler_join_syndicate(ctx, params)
    }

    /// Leave a syndicate
    ///
    /// Removes the caller from a syndicate. The creator cannot leave.
    /// Contribution is refunded proportionally.
    ///
    /// # Arguments
    /// * `ctx` - LeaveSyndicate accounts context
    pub fn leave_syndicate(ctx: Context<LeaveSyndicate>) -> Result<()> {
        instructions::syndicate::handler_leave_syndicate(ctx)
    }

    /// Close a syndicate
    ///
    /// Closes the syndicate and returns rent to creator.
    /// Only the creator can close, and only when all other members have left.
    ///
    /// # Arguments
    /// * `ctx` - CloseSyndicate accounts context
    pub fn close_syndicate(ctx: Context<CloseSyndicate>) -> Result<()> {
        instructions::syndicate::handler_close_syndicate(ctx)
    }
}
