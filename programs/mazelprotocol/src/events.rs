//! MazelProtocol - Events
//!
//! This module defines all events emitted by the lottery protocol.
//! Events are used for off-chain indexing, analytics, and UI updates.

use anchor_lang::prelude::*;

// ============================================================================
// TICKET EVENTS
// ============================================================================

/// Emitted when a ticket is purchased
#[event]
pub struct TicketPurchased {
    /// Ticket account public key
    pub ticket: Pubkey,
    /// Player wallet address
    pub player: Pubkey,
    /// Draw ID the ticket is for
    pub draw_id: u64,
    /// Selected numbers (sorted)
    pub numbers: [u8; 6],
    /// Price paid (including any discounts)
    pub price: u64,
    /// Syndicate (if purchased through one)
    pub syndicate: Option<Pubkey>,
    /// Purchase timestamp
    pub timestamp: i64,
}

/// Emitted when multiple tickets are purchased in bulk
#[event]
pub struct BulkTicketsPurchased {
    /// Player wallet address
    pub player: Pubkey,
    /// Draw ID the tickets are for
    pub draw_id: u64,
    /// Number of tickets purchased
    pub ticket_count: u32,
    /// Total price paid
    pub total_price: u64,
    /// Syndicate (if purchased through one)
    pub syndicate: Option<Pubkey>,
    /// Purchase timestamp
    pub timestamp: i64,
}

// ============================================================================
// DRAW EVENTS
// ============================================================================

/// Emitted when a new draw is initialized
#[event]
pub struct DrawInitialized {
    /// Draw ID
    pub draw_id: u64,
    /// Scheduled draw time
    pub scheduled_time: i64,
    /// Current jackpot balance
    pub jackpot_balance: u64,
    /// Whether rolldown is pending
    pub is_rolldown_pending: bool,
}

/// Emitted when randomness is committed for a draw
#[event]
pub struct RandomnessCommitted {
    /// Draw ID
    pub draw_id: u64,
    /// Slot when committed
    pub commit_slot: u64,
    /// Randomness account public key
    pub randomness_account: Pubkey,
    /// Timestamp
    pub timestamp: i64,
}

/// Emitted when a draw is executed (winning numbers revealed)
#[event]
pub struct DrawExecuted {
    /// Draw ID
    pub draw_id: u64,
    /// Winning numbers (sorted)
    pub winning_numbers: [u8; 6],
    /// Whether this was a rolldown draw
    pub was_rolldown: bool,
    /// Total tickets in this draw
    pub total_tickets: u64,
    /// Execution timestamp
    pub timestamp: i64,
}

/// Emitted when a draw is finalized with winner counts
#[event]
pub struct DrawFinalized {
    /// Draw ID
    pub draw_id: u64,
    /// Match 6 winners count
    pub match_6_winners: u32,
    /// Match 5 winners count
    pub match_5_winners: u32,
    /// Match 4 winners count
    pub match_4_winners: u32,
    /// Match 3 winners count
    pub match_3_winners: u32,
    /// Match 2 winners count
    pub match_2_winners: u32,
    /// Total USDC distributed
    pub total_distributed: u64,
    /// Timestamp
    pub timestamp: i64,
}

/// Emitted when a rolldown is executed
#[event]
pub struct RolldownExecuted {
    /// Draw ID
    pub draw_id: u64,
    /// Total jackpot distributed
    pub jackpot_distributed: u64,
    /// Match 5 prize per winner
    pub match_5_prize: u64,
    /// Match 4 prize per winner
    pub match_4_prize: u64,
    /// Match 3 prize per winner
    pub match_3_prize: u64,
    /// Timestamp
    pub timestamp: i64,
}

// ============================================================================
// PRIZE EVENTS
// ============================================================================

/// Emitted when a prize is claimed
#[event]
pub struct PrizeClaimed {
    /// Ticket account public key
    pub ticket: Pubkey,
    /// Player wallet address
    pub player: Pubkey,
    /// Draw ID
    pub draw_id: u64,
    /// Number of matches
    pub match_count: u8,
    /// Prize amount in USDC lamports
    pub prize_amount: u64,
    /// Whether a free ticket was issued (Match 2)
    pub free_ticket_issued: bool,
    /// Timestamp
    pub timestamp: i64,
}

/// Emitted when the jackpot is won
#[event]
pub struct JackpotWon {
    /// Ticket account public key
    pub ticket: Pubkey,
    /// Winner wallet address
    pub winner: Pubkey,
    /// Draw ID
    pub draw_id: u64,
    /// Winning numbers
    pub winning_numbers: [u8; 6],
    /// Jackpot amount won
    pub jackpot_amount: u64,
    /// Timestamp
    pub timestamp: i64,
}

// ============================================================================
// SYNDICATE EVENTS
// ============================================================================

/// Emitted when a new syndicate is created
#[event]
pub struct SyndicateCreated {
    /// Syndicate account public key
    pub syndicate: Pubkey,
    /// Creator wallet address
    pub creator: Pubkey,
    /// Syndicate name (UTF-8)
    pub name: [u8; 32],
    /// Whether the syndicate is public
    pub is_public: bool,
    /// Manager fee in basis points
    pub manager_fee_bps: u16,
    /// Timestamp
    pub timestamp: i64,
}

/// Emitted when a member joins a syndicate
#[event]
pub struct SyndicateMemberJoined {
    /// Syndicate account public key
    pub syndicate: Pubkey,
    /// Member wallet address
    pub member: Pubkey,
    /// USDC contribution amount
    pub contribution: u64,
    /// Share of the syndicate in basis points
    pub share_bps: u16,
    /// Current member count after joining
    pub member_count: u32,
    /// Timestamp
    pub timestamp: i64,
}

/// Emitted when a syndicate prize is distributed
#[event]
pub struct SyndicatePrizeDistributed {
    /// Syndicate account public key
    pub syndicate: Pubkey,
    /// Draw ID
    pub draw_id: u64,
    /// Total prize amount
    pub total_prize: u64,
    /// Manager fee taken
    pub manager_fee: u64,
    /// Number of members receiving shares
    pub members_paid: u32,
    /// Timestamp
    pub timestamp: i64,
}

// ============================================================================
// ADMIN EVENTS
// ============================================================================

/// Emitted when the lottery is initialized
#[event]
pub struct LotteryInitialized {
    /// Authority wallet address
    pub authority: Pubkey,
    /// Ticket price
    pub ticket_price: u64,
    /// Initial jackpot seed amount
    pub seed_amount: u64,
    /// Jackpot cap
    pub jackpot_cap: u64,
    /// Soft cap
    pub soft_cap: u64,
    /// Hard cap
    pub hard_cap: u64,
    /// Timestamp
    pub timestamp: i64,
}

/// Emitted when configuration is updated
#[event]
pub struct ConfigUpdated {
    /// Parameter name that was updated
    pub parameter: String,
    /// Old value
    pub old_value: u64,
    /// New value
    pub new_value: u64,
    /// Authority who made the change
    pub authority: Pubkey,
    /// Timestamp
    pub timestamp: i64,
}

/// Emitted when the lottery is paused
#[event]
pub struct EmergencyPause {
    /// Authority who paused
    pub authority: Pubkey,
    /// Reason for pause (optional message)
    pub reason: String,
    /// Timestamp
    pub timestamp: i64,
}

/// Emitted when the lottery is unpaused
#[event]
pub struct EmergencyUnpause {
    /// Authority who unpaused
    pub authority: Pubkey,
    /// Timestamp
    pub timestamp: i64,
}

// ============================================================================
// USER STATS EVENTS
// ============================================================================

/// Emitted when user stats are updated
#[event]
pub struct UserStatsUpdated {
    /// User wallet address
    pub wallet: Pubkey,
    /// New total tickets count
    pub total_tickets: u64,
    /// New total spent
    pub total_spent: u64,
    /// New total won
    pub total_won: u64,
    /// Current streak
    pub current_streak: u32,
    /// Timestamp
    pub timestamp: i64,
}

/// Emitted when a user achieves a new streak record
#[event]
pub struct NewStreakRecord {
    /// User wallet address
    pub wallet: Pubkey,
    /// New best streak
    pub new_streak: u32,
    /// Previous best streak
    pub previous_streak: u32,
    /// Timestamp
    pub timestamp: i64,
}

// ============================================================================
// QUICK PICK EXPRESS EVENTS
// ============================================================================

/// Emitted when a Quick Pick ticket is purchased
#[event]
pub struct QuickPickTicketPurchased {
    /// Ticket account public key
    pub ticket: Pubkey,
    /// Player wallet address
    pub player: Pubkey,
    /// Draw ID
    pub draw_id: u64,
    /// Selected numbers (5/35)
    pub numbers: [u8; 5],
    /// Price paid
    pub price: u64,
    /// Timestamp
    pub timestamp: i64,
}

/// Emitted when a Quick Pick draw is executed
#[event]
pub struct QuickPickDrawExecuted {
    /// Draw ID
    pub draw_id: u64,
    /// Winning numbers
    pub winning_numbers: [u8; 5],
    /// Whether this was a rolldown
    pub was_rolldown: bool,
    /// Total tickets
    pub total_tickets: u64,
    /// Jackpot distributed (if rolldown)
    pub jackpot_distributed: u64,
    /// Timestamp
    pub timestamp: i64,
}

/// Emitted when Quick Pick prize is claimed
#[event]
pub struct QuickPickPrizeClaimed {
    /// Ticket account public key
    pub ticket: Pubkey,
    /// Player wallet address
    pub player: Pubkey,
    /// Draw ID
    pub draw_id: u64,
    /// Match count
    pub match_count: u8,
    /// Prize amount
    pub prize_amount: u64,
    /// Timestamp
    pub timestamp: i64,
}

// ============================================================================
// ADVANCED FEATURE EVENTS
// ============================================================================

/// Emitted when a Lucky Numbers NFT is minted
#[event]
pub struct LuckyNumbersNFTMinted {
    /// NFT mint address
    pub mint: Pubkey,
    /// Owner wallet address
    pub owner: Pubkey,
    /// The winning numbers
    pub numbers: [u8; 6],
    /// Draw ID where numbers won
    pub draw_id: u64,
    /// Match tier (4, 5, or 6)
    pub match_tier: u8,
    /// Timestamp
    pub timestamp: i64,
}

/// Emitted when a Lucky Numbers NFT bonus is claimed
#[event]
pub struct LuckyNumbersBonusClaimed {
    /// NFT mint address
    pub mint: Pubkey,
    /// Owner wallet address
    pub owner: Pubkey,
    /// Draw ID
    pub draw_id: u64,
    /// Bonus amount
    pub bonus_amount: u64,
    /// Timestamp
    pub timestamp: i64,
}

/// Emitted when a Syndicate Wars competition starts
#[event]
pub struct SyndicateWarsStarted {
    /// Competition month
    pub month: u64,
    /// Start timestamp
    pub start_timestamp: i64,
    /// End timestamp
    pub end_timestamp: i64,
    /// Prize pool
    pub prize_pool: u64,
}

/// Emitted when Syndicate Wars results are finalized
#[event]
pub struct SyndicateWarsFinalized {
    /// Competition month
    pub month: u64,
    /// Winner syndicate (1st place)
    pub winner: Pubkey,
    /// Total prize distributed
    pub total_prize: u64,
    /// Number of participating syndicates
    pub participants: u32,
    /// Timestamp
    pub timestamp: i64,
}

/// Emitted when Syndicate Wars competition concludes with prize distribution
#[event]
pub struct SyndicateWarsConcluded {
    /// Competition month
    pub month: u64,
    /// Total prize distributed
    pub total_distributed: u64,
    /// Winner syndicate (1st place)
    pub winner: Pubkey,
    /// Winner's win rate (fixed-point × 1,000,000)
    pub winner_win_rate: u64,
    /// Timestamp
    pub timestamp: i64,
}

// ============================================================================
// FUND MANAGEMENT EVENTS
// ============================================================================

/// Emitted when the jackpot is seeded
#[event]
pub struct JackpotSeeded {
    /// Draw ID
    pub draw_id: u64,
    /// Seed amount
    pub seed_amount: u64,
    /// Source (reserve, insurance, or external)
    pub source: String,
    /// Timestamp
    pub timestamp: i64,
}

/// Emitted when house fees are withdrawn
#[event]
pub struct HouseFeesWithdrawn {
    /// Amount withdrawn
    pub amount: u64,
    /// Destination wallet
    pub destination: Pubkey,
    /// Authority who withdrew
    pub authority: Pubkey,
    /// Timestamp
    pub timestamp: i64,
}

/// Emitted when insurance pool is funded
#[event]
pub struct InsurancePoolFunded {
    /// Amount added
    pub amount: u64,
    /// New total balance
    pub new_balance: u64,
    /// Source
    pub source: String,
    /// Timestamp
    pub timestamp: i64,
}

// ============================================================================
// DYNAMIC FEE & CAP EVENTS
// ============================================================================

/// Emitted when dynamic house fee tier changes
#[event]
pub struct DynamicFeeTierChanged {
    /// Draw ID when change occurred
    pub draw_id: u64,
    /// Previous fee in basis points
    pub old_fee_bps: u16,
    /// New fee in basis points
    pub new_fee_bps: u16,
    /// Current jackpot balance that triggered the change
    pub jackpot_balance: u64,
    /// Fee tier description
    pub tier_description: String,
    /// Timestamp
    pub timestamp: i64,
}

/// Emitted when soft cap is reached and rolldown becomes possible
#[event]
pub struct SoftCapReached {
    /// Draw ID
    pub draw_id: u64,
    /// Current jackpot balance
    pub jackpot_balance: u64,
    /// Soft cap threshold
    pub soft_cap: u64,
    /// Rolldown probability in basis points (0-10000)
    pub rolldown_probability_bps: u16,
    /// Timestamp
    pub timestamp: i64,
}

/// Emitted when hard cap is reached and rolldown is forced
#[event]
pub struct HardCapReached {
    /// Draw ID
    pub draw_id: u64,
    /// Current jackpot balance
    pub jackpot_balance: u64,
    /// Hard cap threshold
    pub hard_cap: u64,
    /// Timestamp
    pub timestamp: i64,
}

/// Emitted when insurance pool is used for prize pool shortfall
#[event]
pub struct InsurancePoolUsed {
    /// Draw ID
    pub draw_id: u64,
    /// Amount transferred from insurance to prize pool
    pub amount_used: u64,
    /// Insurance pool balance before transfer
    pub balance_before: u64,
    /// Insurance pool balance after transfer
    pub balance_after: u64,
    /// Reason for using insurance
    pub reason: String,
    /// Timestamp
    pub timestamp: i64,
}

/// Emitted when emergency fund transfer occurs
#[event]
pub struct EmergencyFundTransferred {
    /// Draw ID (if applicable)
    pub draw_id: u64,
    /// Source of funds (reserve or insurance)
    pub source: String,
    /// Amount transferred
    pub amount: u64,
    /// Destination (usually prize pool)
    pub destination: String,
    /// Reason for transfer
    pub reason: String,
    /// Authority who initiated
    pub authority: Pubkey,
    /// Timestamp
    pub timestamp: i64,
}

/// Emitted when prize pool solvency check is performed
#[event]
pub struct SolvencyCheckPerformed {
    /// Draw ID
    pub draw_id: u64,
    /// Total prizes required
    pub prizes_required: u64,
    /// Prize pool balance
    pub prize_pool_balance: u64,
    /// Reserve balance available
    pub reserve_balance: u64,
    /// Insurance balance available
    pub insurance_balance: u64,
    /// Whether solvency check passed
    pub is_solvent: bool,
    /// Whether prizes were scaled down
    pub prizes_scaled: bool,
    /// Scale factor if scaled (10000 = 100%)
    pub scale_factor_bps: u16,
    /// Timestamp
    pub timestamp: i64,
}

// ============================================================================
// DRAW RECOVERY EVENTS
// ============================================================================

/// Emitted when a draw is cancelled due to timeout
#[event]
pub struct DrawCancelled {
    /// Draw ID that was cancelled
    pub draw_id: u64,
    /// Number of tickets affected (remain valid for rescheduled draw)
    pub tickets_affected: u64,
    /// Timestamp when cancelled
    pub timestamp: i64,
    /// Reason for cancellation
    pub reason: String,
}

/// Emitted when a draw is force finalized (emergency)
#[event]
pub struct DrawForceFinalized {
    /// Draw ID that was force finalized
    pub draw_id: u64,
    /// Number of tickets affected (will NOT receive prizes)
    pub tickets_affected: u64,
    /// Authority who force finalized
    pub authority: Pubkey,
    /// Reason for force finalization
    pub reason: String,
    /// Timestamp when force finalized
    pub timestamp: i64,
}

/// SECURITY FIX (Audit Issue #5): Emitted when expired/unclaimed prize funds
/// are reclaimed from a past draw back into the reserve pool.
/// Without periodic reclamation, `total_prizes_committed` accumulates "zombie"
/// committed amounts for draws whose claim window has long expired, leading to
/// an ever-growing gap between committed and paid totals.
#[event]
pub struct ExpiredPrizesReclaimed {
    /// Draw ID whose unclaimed prizes were reclaimed
    pub draw_id: u64,
    /// Amount reclaimed back to reserve
    pub amount_reclaimed: u64,
    /// New reserve balance after reclamation
    pub new_reserve_balance: u64,
    /// Updated total_prizes_committed after decrement
    pub new_total_prizes_committed: u64,
    /// Authority who initiated the reclamation
    pub authority: Pubkey,
    /// Timestamp of reclamation
    pub timestamp: i64,
}
