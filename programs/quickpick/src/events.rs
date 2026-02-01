//! Quick Pick Express Events
//!
//! This module contains all events emitted by the Quick Pick Express lottery program.
//! Events are used for off-chain indexing, analytics, and UI updates.

use anchor_lang::prelude::*;

// ============================================================================
// TICKET EVENTS
// ============================================================================

/// Emitted when a Quick Pick ticket is purchased
#[event]
pub struct QuickPickTicketPurchased {
    /// Ticket account public key
    pub ticket: Pubkey,
    /// Player wallet address
    pub player: Pubkey,
    /// Draw ID the ticket is for
    pub draw_id: u64,
    /// Selected numbers (5/35, sorted)
    pub numbers: [u8; 5],
    /// Price paid in USDC lamports
    pub price: u64,
    /// Purchase timestamp
    pub timestamp: i64,
}

// ============================================================================
// DRAW EVENTS
// ============================================================================

/// Emitted when Quick Pick randomness is committed
#[event]
pub struct QuickPickRandomnessCommitted {
    /// Draw ID
    pub draw_id: u64,
    /// Slot when committed
    pub commit_slot: u64,
    /// Randomness account public key
    pub randomness_account: Pubkey,
    /// Timestamp
    pub timestamp: i64,
}

/// Emitted when a Quick Pick draw is executed (winning numbers revealed)
#[event]
pub struct QuickPickDrawExecuted {
    /// Draw ID
    pub draw_id: u64,
    /// Winning numbers (5/35, sorted)
    pub winning_numbers: [u8; 5],
    /// Whether this was a rolldown draw
    pub was_rolldown: bool,
    /// Total tickets in this draw
    pub total_tickets: u64,
    /// Jackpot distributed (if rolldown, else 0)
    pub jackpot_distributed: u64,
    /// Execution timestamp
    pub timestamp: i64,
}

/// Emitted when a Quick Pick draw is finalized with winner counts
#[event]
pub struct QuickPickDrawFinalized {
    /// Draw ID
    pub draw_id: u64,
    /// Match 5 (jackpot) winners count
    pub match_5_winners: u32,
    /// Match 4 winners count
    pub match_4_winners: u32,
    /// Match 3 winners count
    pub match_3_winners: u32,
    /// Prize per Match 5 winner
    pub match_5_prize: u64,
    /// Prize per Match 4 winner
    pub match_4_prize: u64,
    /// Prize per Match 3 winner
    pub match_3_prize: u64,
    /// Total USDC to be distributed
    pub total_distributed: u64,
    /// Timestamp
    pub timestamp: i64,
}

/// Emitted when a rolldown is executed
#[event]
pub struct QuickPickRolldownExecuted {
    /// Draw ID
    pub draw_id: u64,
    /// Total jackpot distributed
    pub jackpot_distributed: u64,
    /// Match 4 prize per winner (pari-mutuel)
    pub match_4_prize: u64,
    /// Match 3 prize per winner (pari-mutuel)
    pub match_3_prize: u64,
    /// Timestamp
    pub timestamp: i64,
}

// ============================================================================
// PRIZE EVENTS
// ============================================================================

/// Emitted when a Quick Pick prize is claimed
#[event]
pub struct QuickPickPrizeClaimed {
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
    /// Timestamp
    pub timestamp: i64,
}

/// Emitted when the Quick Pick jackpot is won
#[event]
pub struct QuickPickJackpotWon {
    /// Ticket account public key
    pub ticket: Pubkey,
    /// Winner wallet address
    pub winner: Pubkey,
    /// Draw ID
    pub draw_id: u64,
    /// Winning numbers
    pub winning_numbers: [u8; 5],
    /// Jackpot amount won
    pub jackpot_amount: u64,
    /// Timestamp
    pub timestamp: i64,
}

// ============================================================================
// ADMIN EVENTS
// ============================================================================

/// Emitted when Quick Pick Express is initialized
#[event]
pub struct QuickPickInitialized {
    /// Authority wallet address
    pub authority: Pubkey,
    /// Ticket price
    pub ticket_price: u64,
    /// Seed amount
    pub seed_amount: u64,
    /// Soft cap
    pub soft_cap: u64,
    /// Hard cap
    pub hard_cap: u64,
    /// First draw timestamp
    pub first_draw_timestamp: i64,
    /// Timestamp
    pub timestamp: i64,
}

/// Emitted when Quick Pick is paused
#[event]
pub struct QuickPickPaused {
    /// Authority who paused
    pub authority: Pubkey,
    /// Reason for pause
    pub reason: String,
    /// Timestamp
    pub timestamp: i64,
}

/// Emitted when Quick Pick is unpaused
#[event]
pub struct QuickPickUnpaused {
    /// Authority who unpaused
    pub authority: Pubkey,
    /// Timestamp
    pub timestamp: i64,
}

/// Emitted when Quick Pick seed is funded
#[event]
pub struct QuickPickSeeded {
    /// Authority who funded
    pub authority: Pubkey,
    /// Seed amount
    pub seed_amount: u64,
    /// New jackpot balance
    pub jackpot_balance: u64,
    /// Timestamp
    pub timestamp: i64,
}

// ============================================================================
// CAP EVENTS
// ============================================================================

/// Emitted when Quick Pick soft cap is reached
#[event]
pub struct QuickPickSoftCapReached {
    /// Draw ID
    pub draw_id: u64,
    /// Current jackpot balance
    pub jackpot_balance: u64,
    /// Soft cap threshold
    pub soft_cap: u64,
    /// Rolldown probability in basis points
    pub rolldown_probability_bps: u16,
    /// Timestamp
    pub timestamp: i64,
}

/// Emitted when Quick Pick hard cap is reached (forced rolldown)
#[event]
pub struct QuickPickHardCapReached {
    /// Draw ID
    pub draw_id: u64,
    /// Current jackpot balance
    pub jackpot_balance: u64,
    /// Hard cap threshold
    pub hard_cap: u64,
    /// Timestamp
    pub timestamp: i64,
}

// ============================================================================
// FEE EVENTS
// ============================================================================

/// Emitted when Quick Pick house fee tier changes
#[event]
pub struct QuickPickFeeTierChanged {
    /// Draw ID when change occurred
    pub draw_id: u64,
    /// Previous fee in basis points
    pub old_fee_bps: u16,
    /// New fee in basis points
    pub new_fee_bps: u16,
    /// Current jackpot balance that triggered the change
    pub jackpot_balance: u64,
    /// Timestamp
    pub timestamp: i64,
}

/// Emitted when house fees are withdrawn
#[event]
pub struct QuickPickHouseFeesWithdrawn {
    /// Amount withdrawn
    pub amount: u64,
    /// Destination wallet
    pub destination: Pubkey,
    /// Authority who withdrew
    pub authority: Pubkey,
    /// Timestamp
    pub timestamp: i64,
}

// ============================================================================
// DRAW RECOVERY EVENTS
// ============================================================================

/// Emitted when a Quick Pick draw is cancelled
#[event]
pub struct QuickPickDrawCancelled {
    /// Draw ID that was cancelled
    pub draw_id: u64,
    /// Number of tickets affected
    pub tickets_affected: u64,
    /// Reason for cancellation
    pub reason: String,
    /// Timestamp
    pub timestamp: i64,
}

/// Emitted when a Quick Pick draw is force finalized (emergency)
#[event]
pub struct QuickPickDrawForceFinalized {
    /// Draw ID that was force finalized
    pub draw_id: u64,
    /// Number of tickets affected
    pub tickets_affected: u64,
    /// Authority who force finalized
    pub authority: Pubkey,
    /// Reason for force finalization
    pub reason: String,
    /// Timestamp
    pub timestamp: i64,
}
