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
//!
//! # Security Features
//! - Two-step authority transfer (propose/accept)
//! - Draw timeout recovery mechanism
//! - Prize pool solvency verification
//! - Per-user ticket limits
//! - Mandatory seed funding before operation
//!
//! # Related Programs
//! - Quick Pick Express: Separate high-frequency 5/35 lottery program (quickpick)

use anchor_lang::prelude::*;

// Module declarations
pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

// Re-export everything needed by the program and clients
// Note: Using glob exports as required by Anchor framework
// Warnings about ambiguous re-exports are expected and acceptable
#[allow(ambiguous_glob_reexports)]
pub use constants::*;
pub use errors::*;
pub use events::*;
pub use state::*;

// Re-export all instruction account structs at crate root (required by Anchor)
#[allow(ambiguous_glob_reexports)]
pub use instructions::admin::*;
#[allow(ambiguous_glob_reexports)]
pub use instructions::buy_bulk::*;
#[allow(ambiguous_glob_reexports)]
pub use instructions::buy_ticket::*;
#[allow(ambiguous_glob_reexports)]
pub use instructions::claim_bulk_prize::*;
#[allow(ambiguous_glob_reexports)]
pub use instructions::claim_prize::*;
#[allow(ambiguous_glob_reexports)]
pub use instructions::commit_randomness::*;
#[allow(ambiguous_glob_reexports)]
pub use instructions::execute_draw::*;
#[allow(ambiguous_glob_reexports)]
pub use instructions::finalize_draw::*;
#[allow(ambiguous_glob_reexports)]
pub use instructions::initialize::*;
#[allow(ambiguous_glob_reexports)]
pub use instructions::syndicate::*;
#[allow(ambiguous_glob_reexports)]
pub use instructions::syndicate_wars::*;

// Program ID - Update this after deployment
declare_id!("11111111111111111111111111111111");

/// SolanaLotto Protocol Program
#[program]
pub mod solana_lotto {
    use super::*;

    // =========================================================================
    // INITIALIZATION INSTRUCTIONS
    // =========================================================================

    /// Initialize the lottery program
    ///
    /// This sets up the main lottery state account with initial configuration.
    /// Can only be called once. The caller becomes the authority.
    ///
    /// IMPORTANT: The lottery starts PAUSED and UNFUNDED. You must call
    /// `fund_seed` after initialization to deposit the seed USDC and activate.
    ///
    /// # Arguments
    /// * `ctx` - Initialize accounts context
    /// * `params` - Initial configuration parameters
    pub fn initialize(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
        instructions::initialize::handler(ctx, params)
    }

    /// Fund the initial seed for the lottery
    ///
    /// This instruction transfers the seed amount from authority to prize pool,
    /// sets the jackpot balance, and unpauses the lottery.
    ///
    /// MUST be called after `initialize` before the lottery can operate.
    ///
    /// # Arguments
    /// * `ctx` - FundSeed accounts context
    pub fn fund_seed(ctx: Context<FundSeed>) -> Result<()> {
        instructions::initialize::handler_fund_seed(ctx)
    }

    /// Add funds to the reserve pool
    ///
    /// Allows the authority to add additional funds to the reserve,
    /// which can be used to seed jackpots after wins or rollovers.
    ///
    /// # Arguments
    /// * `ctx` - AddReserveFunds accounts context
    /// * `amount` - Amount of USDC lamports to add
    pub fn add_reserve_funds(ctx: Context<AddReserveFunds>, amount: u64) -> Result<()> {
        instructions::initialize::handler_add_reserve_funds(ctx, amount)
    }

    // =========================================================================
    // ADMIN INSTRUCTIONS
    // =========================================================================

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
    /// The lottery must be funded to unpause.
    ///
    /// # Arguments
    /// * `ctx` - Unpause accounts context
    pub fn unpause(ctx: Context<Unpause>) -> Result<()> {
        instructions::admin::handler_unpause(ctx)
    }

    /// Update lottery configuration
    ///
    /// Updates various configuration parameters.
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

    /// Propose authority transfer (Step 1 of 2)
    ///
    /// Proposes a new authority. The new authority must call `accept_authority`
    /// to complete the transfer. This prevents accidentally transferring
    /// control to an incorrect address.
    ///
    /// # Arguments
    /// * `ctx` - ProposeAuthority accounts context
    /// * `new_authority` - The proposed new authority address
    pub fn propose_authority(ctx: Context<ProposeAuthority>, new_authority: Pubkey) -> Result<()> {
        instructions::admin::handler_propose_authority(ctx, new_authority)
    }

    /// Accept authority transfer (Step 2 of 2)
    ///
    /// Completes the authority transfer. Only the address proposed in
    /// `propose_authority` can call this.
    ///
    /// # Arguments
    /// * `ctx` - AcceptAuthority accounts context
    pub fn accept_authority(ctx: Context<AcceptAuthority>) -> Result<()> {
        instructions::admin::handler_accept_authority(ctx)
    }

    /// Cancel a pending authority transfer
    ///
    /// Cancels a proposed authority transfer before it's accepted.
    /// Only the current authority can cancel.
    ///
    /// # Arguments
    /// * `ctx` - CancelAuthorityTransfer accounts context
    pub fn cancel_authority_transfer(ctx: Context<CancelAuthorityTransfer>) -> Result<()> {
        instructions::admin::handler_cancel_authority_transfer(ctx)
    }

    /// Cancel a stuck draw (timeout recovery)
    ///
    /// Allows the authority to cancel a draw that has timed out
    /// (more than 1 hour since randomness commit). This is a recovery
    /// mechanism for when the oracle fails or network congestion prevents
    /// execute_draw from being called.
    ///
    /// # Arguments
    /// * `ctx` - CancelDraw accounts context
    pub fn cancel_draw(ctx: Context<CancelDraw>) -> Result<()> {
        instructions::admin::handler_cancel_draw(ctx)
    }

    /// Force finalize a draw (emergency only)
    ///
    /// Emergency instruction that forces a draw to complete without
    /// distributing prizes. Only use when critical bugs are discovered
    /// or manual intervention is needed.
    ///
    /// WARNING: Tickets will not receive prizes. Users may need
    /// off-chain compensation.
    ///
    /// # Arguments
    /// * `ctx` - ForceFinalizeDraw accounts context
    /// * `reason` - Reason for the force finalization (logged)
    pub fn force_finalize_draw(ctx: Context<ForceFinalizeDraw>, reason: String) -> Result<()> {
        instructions::admin::handler_force_finalize_draw(ctx, reason)
    }

    /// Transfer authority (DEPRECATED - use propose_authority + accept_authority)
    ///
    /// Legacy single-step authority transfer. Now only sets pending_authority
    /// and requires accept_authority to complete.
    ///
    /// # Arguments
    /// * `ctx` - TransferAuthority accounts context
    pub fn transfer_authority(ctx: Context<TransferAuthority>) -> Result<()> {
        instructions::admin::handler_transfer_authority(ctx)
    }

    /// Emergency transfer funds from reserve or insurance pool to prize pool
    ///
    /// Transfers funds from reserve or insurance pools to the prize pool
    /// during insolvency emergencies. This should only be used when:
    /// - Prize pool is insufficient to pay winners
    /// - Reserve/insurance funds are needed to cover shortfalls
    /// - Emergency intervention is required
    ///
    /// # Security Requirements:
    /// - Only callable by authority
    /// - Requires multi-sig in production
    /// - Should have timelock in production
    /// - Emits detailed audit event
    ///
    /// # Arguments
    /// * `ctx` - EmergencyFundTransfer accounts context
    /// * `source` - Source of funds (Reserve or Insurance)
    /// * `amount` - Amount to transfer in USDC lamports
    /// * `reason` - Reason for emergency transfer (logged)
    pub fn emergency_fund_transfer(
        ctx: Context<EmergencyFundTransfer>,
        source: FundSource,
        amount: u64,
        reason: String,
    ) -> Result<()> {
        instructions::admin::handler_emergency_fund_transfer(ctx, source, amount, reason)
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
    /// Enforces per-user ticket limits (max 5000 per draw).
    ///
    /// # Arguments
    /// * `ctx` - BuyTicket accounts context
    /// * `params` - Selected numbers
    pub fn buy_ticket(ctx: Context<BuyTicket>, params: BuyTicketParams) -> Result<()> {
        instructions::buy_ticket::handler(ctx, params)
    }

    /// Buy multiple lottery tickets in a single transaction
    ///
    /// Purchases up to 50 tickets with selected numbers from 1-46.
    /// All numbers must be unique within each ticket and within valid range.
    /// USDC is transferred from player to prize pool and house fee accounts.
    ///
    /// Tickets are stored in a unified ticket account for efficient storage.
    /// Enforces per-user ticket limits (max 5000 per draw).
    ///
    /// # Arguments
    /// * `ctx` - BuyBulk accounts context
    /// * `params` - Array of ticket number sets (max 50 tickets)
    pub fn buy_bulk(ctx: Context<BuyBulk>, params: BuyBulkParams) -> Result<()> {
        instructions::buy_bulk::handler(ctx, params)
    }

    // =========================================================================
    // DRAW INSTRUCTIONS
    // =========================================================================

    /// Commit to randomness for the upcoming draw
    ///
    /// This is the COMMIT phase of the commit-reveal pattern.
    /// It stores the randomness account reference, commit slot, and timestamp.
    /// The randomness must NOT be revealed yet at this point.
    ///
    /// # Security
    /// - Must be called BEFORE randomness is revealed
    /// - Stores seed_slot and timestamp for verification during reveal
    /// - Marks draw as in progress
    ///
    /// # Timeout
    /// - If execute_draw is not called within 1 hour, the draw can be
    ///   cancelled via cancel_draw to prevent stuck states
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
    /// Handles empty winner tiers by redistributing funds to other tiers
    /// or adding to reserve if no winners in any tier.
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
    /// Verifies prize pool solvency before transfer.
    ///
    /// # Prize Tiers (Normal Mode)
    /// - Match 6: Jackpot (variable)
    /// - Match 5: $4,000
    /// - Match 4: $150
    /// - Match 3: $5
    /// - Match 2: Free ticket (credited to user stats)
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

    /// Claim prize for a specific ticket within a unified ticket (bulk purchase)
    ///
    /// Calculates match count against winning numbers for a specific ticket
    /// in the unified ticket account and transfers the appropriate prize.
    ///
    /// # Arguments
    /// * `ctx` - ClaimBulkPrize accounts context
    /// * `params` - Parameters including ticket index within the unified ticket
    pub fn claim_bulk_prize(
        ctx: Context<ClaimBulkPrize>,
        params: ClaimBulkPrizeParams,
    ) -> Result<()> {
        instructions::claim_bulk_prize::handler(ctx, params)
    }

    /// Claim all prizes from a unified ticket (bulk purchase) in one transaction
    ///
    /// Iterates through all tickets in the unified ticket and claims any
    /// unclaimed prizes. May fail for very large unified tickets due to
    /// compute limits - use claim_bulk_prize for individual claims instead.
    ///
    /// # Arguments
    /// * `ctx` - ClaimAllBulkPrizes accounts context
    pub fn claim_all_bulk_prizes(ctx: Context<ClaimAllBulkPrizes>) -> Result<()> {
        instructions::claim_bulk_prize::handler_claim_all(ctx)
    }

    // =========================================================================
    // SYNDICATE INSTRUCTIONS
    // =========================================================================

    /// Create a new syndicate (group buying pool)
    ///
    /// Creates a syndicate that allows multiple players to pool
    /// funds and share prizes proportionally.
    ///
    /// Also creates the syndicate's USDC token account.
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
    /// Removes the caller from a syndicate and refunds their contribution.
    /// The creator cannot leave (must use close_syndicate instead).
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
    /// Any remaining USDC is transferred to the creator.
    ///
    /// # Arguments
    /// * `ctx` - CloseSyndicate accounts context
    pub fn close_syndicate(ctx: Context<CloseSyndicate>) -> Result<()> {
        instructions::syndicate::handler_close_syndicate(ctx)
    }

    /// Withdraw creator's contribution from syndicate
    ///
    /// Allows the creator to withdraw their contribution without
    /// leaving the syndicate. Useful for reducing stake without
    /// abandoning the syndicate.
    ///
    /// # Arguments
    /// * `ctx` - WithdrawCreatorContribution accounts context
    /// * `amount` - Amount to withdraw (must be <= creator's contribution)
    pub fn withdraw_creator_contribution(
        ctx: Context<WithdrawCreatorContribution>,
        amount: u64,
    ) -> Result<()> {
        instructions::syndicate::handler_withdraw_creator_contribution(ctx, amount)
    }

    /// Buy tickets for a syndicate using pooled funds
    ///
    /// Uses the syndicate's pooled USDC to purchase lottery tickets.
    /// Only the syndicate creator can initiate purchases.
    /// Transfers funds from syndicate account to prize pool and house fee.
    ///
    /// Note: Individual ticket accounts must be created separately via
    /// `create_syndicate_ticket` due to account creation limits.
    ///
    /// # Arguments
    /// * `ctx` - BuySyndicateTickets accounts context
    /// * `params` - Ticket numbers to purchase (max 10 per call)
    pub fn buy_syndicate_tickets(
        ctx: Context<BuySyndicateTickets>,
        params: BuySyndicateTicketsParams,
    ) -> Result<()> {
        instructions::syndicate::handler_buy_syndicate_tickets(ctx, params)
    }

    /// Create a single ticket account for a syndicate
    ///
    /// Called after buy_syndicate_tickets to create individual ticket accounts.
    /// The funds have already been transferred; this creates the account record.
    ///
    /// # Arguments
    /// * `ctx` - CreateSyndicateTicket accounts context
    /// * `numbers` - The 6 numbers for this ticket
    pub fn create_syndicate_ticket(
        ctx: Context<CreateSyndicateTicket>,
        numbers: [u8; 6],
    ) -> Result<()> {
        instructions::syndicate::handler_create_syndicate_ticket(ctx, numbers)
    }

    /// Distribute prize to syndicate members
    ///
    /// Transfers prize from prize pool to syndicate account and calculates
    /// manager fee. Individual members must claim their shares separately.
    ///
    /// # Arguments
    /// * `ctx` - DistributeSyndicatePrize accounts context
    /// * `params` - Prize distribution parameters
    pub fn distribute_syndicate_prize(
        ctx: Context<DistributeSyndicatePrize>,
        params: DistributeSyndicatePrizeParams,
    ) -> Result<()> {
        instructions::syndicate::handler_distribute_syndicate_prize(ctx, params)
    }

    /// Claim a member's share of syndicate prize
    ///
    /// Transfers the claimed amount from syndicate to member's wallet.
    /// Updates member's contribution and recalculates shares.
    ///
    /// # Arguments
    /// * `ctx` - ClaimSyndicateMemberPrize accounts context
    /// * `params` - Claim parameters
    pub fn claim_syndicate_member_prize(
        ctx: Context<ClaimSyndicateMemberPrize>,
        params: ClaimSyndicateMemberPrizeParams,
    ) -> Result<()> {
        instructions::syndicate::handler_claim_syndicate_member_prize(ctx, params)
    }

    /// Update syndicate configuration
    ///
    /// Allows the syndicate creator to update:
    /// - Syndicate name
    /// - Public/private status
    /// - Manager fee (within 5% limit)
    ///
    /// # Arguments
    /// * `ctx` - UpdateSyndicateConfig accounts context
    /// * `params` - Configuration update parameters
    pub fn update_syndicate_config(
        ctx: Context<UpdateSyndicateConfig>,
        params: UpdateSyndicateConfigParams,
    ) -> Result<()> {
        instructions::syndicate::handler_update_syndicate_config(ctx, params)
    }

    /// Remove a member from syndicate (creator only)
    ///
    /// Allows the syndicate creator to remove a member and refund their contribution.
    /// Members can also leave voluntarily via `leave_syndicate`.
    ///
    /// # Arguments
    /// * `ctx` - RemoveSyndicateMember accounts context
    /// * `params` - Member removal parameters
    pub fn remove_syndicate_member(
        ctx: Context<RemoveSyndicateMember>,
        params: RemoveSyndicateMemberParams,
    ) -> Result<()> {
        instructions::syndicate::handler_remove_syndicate_member(ctx, params)
    }

    /// Transfer syndicate creator role to another member
    ///
    /// Allows the current creator to transfer management responsibility
    /// to another existing syndicate member. This enables the creator to
    /// leave the syndicate after transferring the role.
    ///
    /// # Arguments
    /// * `ctx` - TransferSyndicateCreator accounts context
    /// * `params` - Transfer parameters including new creator's wallet
    pub fn transfer_syndicate_creator(
        ctx: Context<TransferSyndicateCreator>,
        params: TransferSyndicateCreatorParams,
    ) -> Result<()> {
        instructions::syndicate::handler_transfer_syndicate_creator(ctx, params)
    }

    // =========================================================================
    // SYNDICATE WARS COMPETITION INSTRUCTIONS
    // =========================================================================

    /// Initialize Syndicate Wars competition for a month
    ///
    /// Creates competition state and transfers 1% of prize pool to competition.
    /// Only lottery authority can initialize.
    ///
    /// # Arguments
    /// * `ctx` - InitializeSyndicateWars accounts context
    /// * `params` - Competition initialization parameters
    pub fn initialize_syndicate_wars(
        ctx: Context<InitializeSyndicateWars>,
        params: InitializeSyndicateWarsParams,
    ) -> Result<()> {
        instructions::syndicate_wars::handler_initialize_syndicate_wars(ctx, params)
    }

    /// Register syndicate for Syndicate Wars competition
    ///
    /// Syndicate must have at least 5 members to register.
    /// Competition must be active and within registration period.
    ///
    /// # Arguments
    /// * `ctx` - RegisterForSyndicateWars accounts context
    pub fn register_for_syndicate_wars(ctx: Context<RegisterForSyndicateWars>) -> Result<()> {
        instructions::syndicate_wars::handler_register_for_syndicate_wars(ctx)
    }

    /// Update syndicate statistics during Syndicate Wars
    ///
    /// Updates tickets purchased, prizes won, and win count for a syndicate.
    /// Calculates win rate automatically.
    /// Only lottery authority can update stats.
    ///
    /// # Arguments
    /// * `ctx` - UpdateSyndicateWarsStats accounts context
    /// * `params` - Statistics update parameters
    pub fn update_syndicate_wars_stats(
        ctx: Context<UpdateSyndicateWarsStats>,
        params: UpdateSyndicateWarsStatsParams,
    ) -> Result<()> {
        instructions::syndicate_wars::handler_update_syndicate_wars_stats(ctx, params)
    }

    /// Finalize Syndicate Wars competition
    ///
    /// Marks competition as inactive after it has ended.
    /// Must be called before prize distribution.
    /// Only lottery authority can finalize.
    ///
    /// # Arguments
    /// * `ctx` - FinalizeSyndicateWars accounts context
    pub fn finalize_syndicate_wars(ctx: Context<FinalizeSyndicateWars>) -> Result<()> {
        instructions::syndicate_wars::handler_finalize_syndicate_wars(ctx)
    }

    /// Distribute Syndicate Wars prizes to top syndicates
    ///
    /// Sets ranks for top 10 syndicates and prepares for prize claims.
    /// Individual syndicates must claim prizes separately.
    /// Only lottery authority can distribute prizes.
    ///
    /// # Arguments
    /// * `ctx` - DistributeSyndicateWarsPrizes accounts context
    /// * `params` - Distribution parameters with ranked syndicates
    pub fn distribute_syndicate_wars_prizes<'info>(
        ctx: Context<'_, '_, 'info, 'info, DistributeSyndicateWarsPrizes<'info>>,
        params: DistributeSyndicateWarsPrizesParams,
    ) -> Result<()> {
        instructions::syndicate_wars::handler_distribute_syndicate_wars_prizes(ctx, params)
    }

    /// Claim Syndicate Wars prize for syndicate
    ///
    /// Transfers prize from competition pool to syndicate account.
    /// Syndicate must have a valid rank (1-10) and prize must not be claimed.
    /// Only syndicate manager can claim.
    ///
    /// # Arguments
    /// * `ctx` - ClaimSyndicateWarsPrize accounts context
    /// * `params` - Claim parameters with rank
    pub fn claim_syndicate_wars_prize(
        ctx: Context<ClaimSyndicateWarsPrize>,
        params: ClaimSyndicateWarsPrizeParams,
    ) -> Result<()> {
        instructions::syndicate_wars::handler_claim_syndicate_wars_prize(ctx, params)
    }
}
