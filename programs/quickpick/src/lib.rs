//! Quick Pick Express - High-Frequency 5/35 Lottery on Solana
//!
//! Quick Pick Express is a standalone mini-lottery program built on Solana featuring:
//! - 5/35 matrix (pick 5 numbers from 1-35)
//! - 4-hour draw intervals
//! - Provably fair randomness via Switchboard's commit-reveal pattern
//! - Positive-EV rolldown mechanics when jackpot reaches caps
//! - Dynamic house fee based on jackpot level
//! - $50 main lottery spend gate requirement
//!
//! # Key Features
//! - **Ticket Price**: $1.50
//! - **Jackpot Soft Cap ($30k)**: Probabilistic rolldown begins
//! - **Jackpot Hard Cap ($50k)**: Forced rolldown to lower tiers
//! - **Pari-mutuel Rolldown**: 60% to Match 4, 40% to Match 3
//! - **Fixed Prizes (Normal Mode)**: Match 4 = $100, Match 3 = $4
//! - **Dynamic Fees**: 28-38% based on jackpot level
//!
//! # Architecture
//! The program uses Anchor framework with the following key accounts:
//! - `QuickPickState`: Global Quick Pick configuration and state
//! - `QuickPickDrawResult`: Results of each draw including winning numbers and prizes
//! - `QuickPickTicket`: Individual ticket with selected numbers
//!
//! # Security Features
//! - Verifiable randomness via Switchboard
//! - Prize pool solvency verification
//! - Ticket claim expiration (90 days)
//! - Authority verification via main lottery state

use anchor_lang::prelude::*;

// Module declarations
pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

// Re-export everything needed by the program and clients.
// Using glob exports as required by the Anchor framework.
// The ambiguous_glob_reexports warning is expected and harmless here.
#[allow(ambiguous_glob_reexports)]
pub use {constants::*, errors::*, events::*, state::*};

// Re-export all instruction account structs at crate root (required by Anchor).
// Grouped to avoid repetitive allow attributes.
#[allow(ambiguous_glob_reexports)]
pub use instructions::{
    admin::*, buy_ticket::*, claim_prize::*, commit_randomness::*, execute_draw::*,
    finalize_draw::*, initialize::*,
};

// Program ID - Update this after deployment
declare_id!("7XC1KT5mvsHHXbR2mH6er138fu2tJ4L2fAgmpjLnnZK2");

/// Quick Pick Express Program
#[program]
pub mod quickpick {
    use super::*;

    // =========================================================================
    // INITIALIZATION INSTRUCTIONS
    // =========================================================================

    /// Initialize the Quick Pick Express lottery
    ///
    /// Creates the QuickPickState account with game parameters.
    /// Only the main lottery authority can initialize.
    /// The game starts PAUSED and must be funded separately.
    ///
    /// # Arguments
    /// * `ctx` - InitializeQuickPick accounts context
    /// * `params` - Initial configuration parameters (first draw timestamp)
    pub fn initialize(
        ctx: Context<InitializeQuickPick>,
        params: InitializeQuickPickParams,
    ) -> Result<()> {
        instructions::initialize::handler(ctx, params)
    }

    /// Fund the Quick Pick Express seed amount
    ///
    /// Transfers the seed amount ($5,000) to the prize pool and unpauses the game.
    /// Only the lottery authority can fund.
    ///
    /// # Arguments
    /// * `ctx` - FundQuickPickSeed accounts context
    pub fn fund_seed(ctx: Context<FundQuickPickSeed>) -> Result<()> {
        instructions::initialize::handler_fund_seed(ctx)
    }

    /// Pause Quick Pick Express
    ///
    /// Stops ticket sales and draw execution.
    /// Only the lottery authority can pause.
    ///
    /// # Arguments
    /// * `ctx` - PauseQuickPick accounts context
    /// * `reason` - Reason for pausing
    pub fn pause(ctx: Context<PauseQuickPick>, reason: String) -> Result<()> {
        instructions::initialize::handler_pause(ctx, reason)
    }

    /// Unpause Quick Pick Express
    ///
    /// Resumes ticket sales and draw execution.
    /// Only the lottery authority can unpause.
    /// Requires the jackpot to be funded.
    ///
    /// # Arguments
    /// * `ctx` - PauseQuickPick accounts context
    pub fn unpause(ctx: Context<PauseQuickPick>) -> Result<()> {
        instructions::initialize::handler_unpause(ctx)
    }

    // =========================================================================
    // ADMIN INSTRUCTIONS
    // =========================================================================

    /// Update Quick Pick Express configuration (legacy immediate mode).
    ///
    /// Updates various configuration parameters such as ticket price,
    /// caps, prizes, and draw interval. Can only be called when paused
    /// or no draw is in progress. Rejected if a timelock proposal is pending.
    ///
    /// # Arguments
    /// * `ctx` - UpdateQuickPickConfig accounts context
    /// * `params` - Configuration parameters to update (None = no change)
    pub fn update_config(
        ctx: Context<UpdateQuickPickConfig>,
        params: UpdateQuickPickConfigParams,
    ) -> Result<()> {
        instructions::admin::handler_update_config(ctx, params)
    }

    /// Propose Quick Pick configuration changes (Phase 1 of timelock).
    ///
    /// Starts a 24-hour timelock. Changes are NOT applied until
    /// execute_config is called after the timelock expires (H-2 fix).
    ///
    /// # Arguments
    /// * `ctx` - UpdateQuickPickConfig accounts context
    /// * `params` - Proposed configuration parameters
    pub fn propose_config(
        ctx: Context<UpdateQuickPickConfig>,
        params: UpdateQuickPickConfigParams,
    ) -> Result<()> {
        instructions::admin::handler_propose_quick_pick_config(ctx, params)
    }

    /// Execute proposed Quick Pick configuration changes (Phase 2 of timelock).
    ///
    /// Applies the previously proposed changes after the timelock expires.
    /// Params must exactly match the proposal (verified via SHA256 hash) (H-2 fix).
    ///
    /// # Arguments
    /// * `ctx` - UpdateQuickPickConfig accounts context
    /// * `params` - Configuration parameters (must match proposal)
    pub fn execute_config(
        ctx: Context<UpdateQuickPickConfig>,
        params: UpdateQuickPickConfigParams,
    ) -> Result<()> {
        instructions::admin::handler_execute_quick_pick_config(ctx, params)
    }

    /// Cancel a pending Quick Pick configuration proposal (H-2 fix).
    ///
    /// Clears the pending config hash and timelock, preventing execution.
    ///
    /// # Arguments
    /// * `ctx` - UpdateQuickPickConfig accounts context
    pub fn cancel_config_proposal(ctx: Context<UpdateQuickPickConfig>) -> Result<()> {
        instructions::admin::handler_cancel_quick_pick_config(ctx)
    }

    /// Withdraw accumulated house fees
    ///
    /// Transfers house fees to a destination account.
    /// Only the lottery authority can withdraw.
    ///
    /// # Arguments
    /// * `ctx` - WithdrawQuickPickHouseFees accounts context
    /// * `amount` - Amount to withdraw (0 = withdraw all)
    pub fn withdraw_house_fees(
        ctx: Context<WithdrawQuickPickHouseFees>,
        amount: u64,
    ) -> Result<()> {
        instructions::admin::handler_withdraw_house_fees(ctx, amount)
    }

    /// Add reserve funds
    ///
    /// Adds additional reserve funds for jackpot seeding or emergencies.
    /// Only the lottery authority can add funds.
    ///
    /// # Arguments
    /// * `ctx` - AddQuickPickReserveFunds accounts context
    /// * `amount` - Amount of USDC lamports to add
    pub fn add_reserve_funds(ctx: Context<AddQuickPickReserveFunds>, amount: u64) -> Result<()> {
        instructions::admin::handler_add_reserve_funds(ctx, amount)
    }

    /// Permissionless draw advancement (timeout fallback) (QP-4 fix).
    ///
    /// Anyone can call this after QUICK_PICK_DRAW_ADVANCEMENT_TIMEOUT seconds
    /// have passed since the scheduled draw time without a commit. Ensures
    /// liveness even if the bot/operator is offline.
    ///
    /// # Arguments
    /// * `ctx` - AdvanceQuickPickDraw accounts context
    pub fn advance_draw(ctx: Context<AdvanceQuickPickDraw>) -> Result<()> {
        instructions::admin::handler_advance_draw(ctx)
    }

    /// Cancel a Quick Pick draw
    ///
    /// Cancels the current draw in progress, resetting the state
    /// so a new draw can be initiated. Used for stuck draws or issues.
    /// Only the lottery authority can cancel.
    ///
    /// # Arguments
    /// * `ctx` - CancelQuickPickDraw accounts context
    /// * `reason` - Reason for cancellation
    pub fn cancel_draw(ctx: Context<CancelQuickPickDraw>, reason: String) -> Result<()> {
        instructions::admin::handler_cancel_draw(ctx, reason)
    }

    /// Force finalize a Quick Pick draw
    ///
    /// Force finalizes a stuck draw with zero winners, allowing the
    /// system to proceed to the next draw. The jackpot carries over.
    /// Only the lottery authority can force finalize.
    ///
    /// # Arguments
    /// * `ctx` - ForceFinalizequickPickDraw accounts context
    /// * `reason` - Reason for force finalization
    pub fn force_finalize_draw(
        ctx: Context<ForceFinalizequickPickDraw>,
        reason: String,
    ) -> Result<()> {
        instructions::admin::handler_force_finalize_draw(ctx, reason)
    }

    /// Emergency fund transfer
    ///
    /// Allows emergency transfer of funds between pools.
    /// Quick Pick must be paused. Only for emergencies.
    /// Only the lottery authority can execute.
    ///
    /// # Arguments
    /// * `ctx` - EmergencyQuickPickFundTransfer accounts context
    /// * `source` - Source of funds (Reserve, Insurance, or PrizePool)
    /// * `amount` - Amount to transfer
    /// * `reason` - Reason for the emergency transfer
    pub fn emergency_fund_transfer(
        ctx: Context<EmergencyQuickPickFundTransfer>,
        source: QuickPickFundSource,
        amount: u64,
        reason: String,
    ) -> Result<()> {
        instructions::admin::handler_emergency_fund_transfer(ctx, source, amount, reason)
    }

    // =========================================================================
    // TICKET PURCHASE INSTRUCTIONS
    // =========================================================================

    /// Buy a Quick Pick Express ticket
    ///
    /// Purchases a ticket with 5 selected numbers from 1-35.
    /// Requires $50 lifetime spend in the main lottery ($50 gate).
    /// USDC is transferred from player to prize pool, house fee, and insurance accounts.
    ///
    /// # Arguments
    /// * `ctx` - BuyQuickPickTicket accounts context
    /// * `params` - Selected numbers (5 unique numbers from 1-35)
    pub fn buy_ticket(
        ctx: Context<BuyQuickPickTicket>,
        params: BuyQuickPickTicketParams,
    ) -> Result<()> {
        instructions::buy_ticket::handler(ctx, params)
    }

    // =========================================================================
    // DRAW EXECUTION INSTRUCTIONS
    // =========================================================================

    /// Commit to randomness for the upcoming Quick Pick draw
    ///
    /// This is the COMMIT phase of the commit-reveal pattern.
    /// Stores the randomness account reference for the reveal phase.
    /// Only the lottery authority can commit.
    ///
    /// # Arguments
    /// * `ctx` - CommitQuickPickRandomness accounts context
    pub fn commit_randomness(ctx: Context<CommitQuickPickRandomness>) -> Result<()> {
        instructions::commit_randomness::handler(ctx)
    }

    /// Execute the Quick Pick draw by revealing randomness
    ///
    /// This is the REVEAL phase of the commit-reveal pattern.
    /// Retrieves randomness from Switchboard and generates 5 winning numbers.
    /// Determines if rolldown triggers (probabilistic between soft/hard caps).
    /// Only the lottery authority can execute.
    ///
    /// # Arguments
    /// * `ctx` - ExecuteQuickPickDraw accounts context
    pub fn execute_draw(ctx: Context<ExecuteQuickPickDraw>) -> Result<()> {
        instructions::execute_draw::handler(ctx)
    }

    /// Finalize the Quick Pick draw with winner counts
    ///
    /// Called after off-chain indexing determines winner counts.
    /// Calculates prizes (fixed or pari-mutuel rolldown).
    /// Handles rolldown distribution: 60% to Match 4, 40% to Match 3.
    /// Advances game state to next draw.
    /// Only the lottery authority can finalize.
    ///
    /// # Arguments
    /// * `ctx` - FinalizeQuickPickDraw accounts context
    /// * `params` - Winner counts by tier (Match 5, Match 4, Match 3)
    pub fn finalize_draw(
        ctx: Context<FinalizeQuickPickDraw>,
        params: FinalizeQuickPickDrawParams,
    ) -> Result<()> {
        instructions::finalize_draw::handler(ctx, params)
    }

    // =========================================================================
    // PRIZE CLAIM INSTRUCTIONS
    // =========================================================================

    /// Claim prize for a winning Quick Pick ticket
    ///
    /// Calculates match count against winning numbers and
    /// transfers the appropriate prize from the prize pool.
    /// Anyone can claim their own winning ticket.
    ///
    /// # Prize Tiers (Normal Mode)
    /// - Match 5 (Jackpot): Variable (split among winners)
    /// - Match 4: $100
    /// - Match 3: $4
    /// - Match 0-2: No prize
    ///
    /// # Prize Tiers (Rolldown Mode)
    /// - Match 4: 60% of jackpot (pari-mutuel)
    /// - Match 3: 40% of jackpot (pari-mutuel)
    ///
    /// # Arguments
    /// * `ctx` - ClaimQuickPickPrize accounts context
    pub fn claim_prize(ctx: Context<ClaimQuickPickPrize>) -> Result<()> {
        instructions::claim_prize::handler(ctx)
    }
}
