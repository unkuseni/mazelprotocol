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
//! - **Jackpot Hard Cap ($40k)**: Forced rolldown to lower tiers
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

// Re-export everything needed by the program and clients
pub use constants::*;
pub use errors::*;
pub use events::*;
pub use state::*;

// Re-export all instruction account structs at crate root (required by Anchor)
#[allow(ambiguous_glob_reexports)]
pub use instructions::*;

// Program ID - Update this after deployment
declare_id!("QPickExpressProgram111111111111111111111111");

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
