//! MazelProtocol - Quick Pick Express Structures
//!
//! Contains QuickPickState, QuickPickTicket, and QuickPickDrawResult.
//!
//! ⚠️  IMPORTANT (M-4): These structs are DUPLICATES of the canonical definitions
//! in `programs/quickpick/src/state.rs`. They exist here for reference and for
//! any potential cross-program CPI in the future. Currently NO CPI exists
//! between the programs, so these are unused. If cross-program communication is
//! added, these structs MUST be kept in sync with the QuickPick program's
//! definitions, or deserialization will fail with silent data corruption.
//!
//! **CURRENTLY MISSING FIELDS (v3.1):**
//!   - reserve_balance, total_tickets_sold, total_prizes_paid
//!   - current_randomness_account, commit_slot, commit_timestamp
//!   - is_draw_in_progress, is_awaiting_finalization, is_funded
//!   - config_timelock_end, pending_config_hash
//!   - emergency_transfer_total, emergency_transfer_window_start
//!   - sale_target_tickets
//!
//! Sync checklist when modifying QuickPick state:
//!   1. Update the canonical struct in programs/quickpick/src/state.rs
//!   2. Update this duplicate below
//!   3. Update programs/quickpick/src/constants.rs QUICK_PICK_STATE_SIZE
//!   4. Run all tests to catch mismatches

use crate::constants::*;
use anchor_lang::prelude::*;

/// Quick Pick Express game state (5/35 Matrix with Rolldown Exploit)
#[account]
#[derive(Default)]
pub struct QuickPickState {
    /// Current draw number
    pub current_draw: u64,

    /// Ticket price (1,500,000 = $1.50)
    pub ticket_price: u64,

    /// Matrix parameters (5/35)
    pub pick_count: u8,
    pub number_range: u8,

    /// Current house fee (dynamic based on jackpot level, 28-38%)
    pub house_fee_bps: u16,

    /// Draw interval in seconds (14400 = 4 hours)
    pub draw_interval: i64,

    /// Next draw timestamp
    pub next_draw_timestamp: i64,

    /// Jackpot balance (accumulates between draws)
    pub jackpot_balance: u64,

    /// Jackpot soft cap ($30,000 - probabilistic rolldown begins)
    pub soft_cap: u64,

    /// Jackpot hard cap ($50,000 - forced rolldown)
    pub hard_cap: u64,

    /// Seed amount for jackpot reset after rolldown ($5,000)
    pub seed_amount: u64,

    /// Fixed prize amounts (Normal Mode)
    pub match_4_prize: u64,
    pub match_3_prize: u64,

    /// Current draw ticket count
    pub current_draw_tickets: u64,

    /// Prize pool balance (for fixed prizes)
    pub prize_pool_balance: u64,

    /// Insurance pool balance
    pub insurance_balance: u64,

    /// Rolldown pending flag (jackpot >= soft_cap)
    pub is_rolldown_pending: bool,

    /// Is paused
    pub is_paused: bool,

    /// PDA bump
    pub bump: u8,
}

impl QuickPickState {
    pub const LEN: usize = QUICK_PICK_STATE_SIZE;

    /// Get current house fee based on jackpot level
    pub fn get_current_house_fee_bps(&self) -> u16 {
        calculate_quick_pick_house_fee_bps(self.jackpot_balance, self.is_rolldown_pending)
    }
}

/// Quick Pick Express ticket (5/35 Matrix)
#[account]
#[derive(Default)]
pub struct QuickPickTicket {
    /// Ticket owner
    pub owner: Pubkey,

    /// Draw this ticket is for
    pub draw_id: u64,

    /// Selected numbers (5 numbers from 1-35, sorted)
    pub numbers: [u8; 5],

    /// Purchase timestamp
    pub purchase_timestamp: i64,

    /// Claim status
    pub is_claimed: bool,

    /// Match count
    pub match_count: u8,

    /// Prize amount
    pub prize_amount: u64,

    /// PDA bump
    pub bump: u8,
}

impl QuickPickTicket {
    pub const LEN: usize = QUICK_PICK_TICKET_SIZE;
}

/// Quick Pick Express draw result (5/35 Matrix)
#[account]
#[derive(Default)]
pub struct QuickPickDrawResult {
    /// Draw identifier
    pub draw_id: u64,

    /// Winning numbers (5 numbers, sorted ascending)
    pub winning_numbers: [u8; 5],

    /// Switchboard randomness proof for verification
    pub randomness_proof: [u8; 32],

    /// Draw execution timestamp
    pub timestamp: i64,

    /// Total tickets sold for this draw
    pub total_tickets: u64,

    /// Whether this was a rolldown draw
    pub was_rolldown: bool,

    /// Winner counts by tier (no Match 2 in Quick Pick)
    pub match_5_winners: u32, // Jackpot winners
    pub match_4_winners: u32,
    pub match_3_winners: u32,

    /// Prize amounts per winner by tier (set during finalization)
    pub match_5_prize_per_winner: u64, // Jackpot
    pub match_4_prize_per_winner: u64,
    pub match_3_prize_per_winner: u64,

    /// Explicit flag set when draw is finalized
    pub is_explicitly_finalized: bool,

    /// PDA bump seed
    pub bump: u8,
}

impl QuickPickDrawResult {
    /// Account size including the 8-byte Anchor discriminator
    pub const LEN: usize = 8 + std::mem::size_of::<Self>();

    pub fn get_prize_for_matches(&self, match_count: u8) -> u64 {
        match match_count {
            5 => self.match_5_prize_per_winner,
            4 => self.match_4_prize_per_winner,
            3 => self.match_3_prize_per_winner,
            _ => 0,
        }
    }

    /// Check if the draw has been finalized (prizes calculated)
    pub fn is_finalized(&self) -> bool {
        self.is_explicitly_finalized
            || self.match_5_prize_per_winner > 0
            || self.match_4_prize_per_winner > 0
            || self.match_3_prize_per_winner > 0
    }
}
