//! MazelProtocol - DrawResult Account
//!
//! Stores results of a completed draw including winning numbers and prize amounts.

use crate::constants::*;
use anchor_lang::prelude::*;

/// Draw result account - stores results of a completed draw
#[account]
#[derive(Default)]
pub struct DrawResult {
    /// Draw identifier
    pub draw_id: u64,

    /// Winning numbers (sorted ascending)
    pub winning_numbers: [u8; 6],

    /// Switchboard randomness proof for verification
    pub randomness_proof: [u8; 32],

    /// Draw execution timestamp
    pub timestamp: i64,

    /// Total tickets sold for this draw
    pub total_tickets: u64,

    /// Whether this was a rolldown draw
    pub was_rolldown: bool,

    /// Winner counts by tier
    pub match_6_winners: u32,
    pub match_5_winners: u32,
    pub match_4_winners: u32,
    pub match_3_winners: u32,
    pub match_2_winners: u32,

    /// Prize amounts per winner by tier (set during finalization)
    pub match_6_prize_per_winner: u64,
    pub match_5_prize_per_winner: u64,
    pub match_4_prize_per_winner: u64,
    pub match_3_prize_per_winner: u64,
    pub match_2_prize_per_winner: u64,

    /// Explicit flag set when draw is finalized (handles edge cases)
    pub is_explicitly_finalized: bool,

    /// Total prizes committed for this draw at finalization time (in USDC lamports).
    /// Set to `total_distributed` during `finalize_draw`. Used by `reclaim_expired_prizes`
    /// to enforce per-draw reclaim bounds and prevent cross-draw theft.
    pub total_committed: u64,

    /// Total prizes reclaimed from this draw so far (in USDC lamports).
    /// Incremented by `reclaim_expired_prizes`. The invariant
    /// `total_reclaimed <= total_committed` is enforced on every reclaim.
    pub total_reclaimed: u64,

    /// Pre-funded streak bonus pool for this draw (in USDC lamports).
    /// Computed at finalization as a fraction of the committed prizes, capped
    /// by the available prize-pool buffer. Guarantees the pool can cover the
    /// worst-case streak bonus on every USDC prize tier (L-7).
    pub streak_bonus_pool: u64,

    /// Total streak bonus actually paid out so far for this draw (L-7).
    /// The invariant `total_streak_bonus_paid <= streak_bonus_pool` is
    /// enforced on every claim via `get_remaining_streak_bonus`.
    pub total_streak_bonus_paid: u64,

    /// PDA bump seed
    pub bump: u8,
}

impl DrawResult {
    pub const LEN: usize = DRAW_RESULT_SIZE;

    pub fn get_prize_for_matches(&self, match_count: u8) -> u64 {
        match match_count {
            6 => self.match_6_prize_per_winner,
            5 => self.match_5_prize_per_winner,
            4 => self.match_4_prize_per_winner,
            3 => self.match_3_prize_per_winner,
            2 => self.match_2_prize_per_winner,
            _ => 0,
        }
    }

    /// Check if the draw has been finalized (prizes calculated)
    pub fn is_finalized(&self) -> bool {
        // A draw is finalized if explicitly marked OR if any prize tier has prizes set
        // This handles edge cases like rolldowns where only Match 3/4 have winners
        self.is_explicitly_finalized
            || self.match_6_prize_per_winner > 0
            || self.match_5_prize_per_winner > 0
            || self.match_4_prize_per_winner > 0
            || self.match_3_prize_per_winner > 0
    }

    /// Returns the maximum amount that can still be reclaimed from this draw.
    /// This is `total_committed - total_reclaimed`, i.e. whatever was promised
    /// at finalization minus what has already been swept back into reserve.
    pub fn get_reclaimable_amount(&self) -> u64 {
        self.total_committed.saturating_sub(self.total_reclaimed)
    }

    /// Returns the streak bonus still available to be paid for this draw (L-7).
    /// This is `streak_bonus_pool - total_streak_bonus_paid` (never negative),
    /// enforcing the invariant that no claim can pay out more streak bonus than
    /// was pre-funded at finalization.
    pub fn get_remaining_streak_bonus(&self) -> u64 {
        self.streak_bonus_pool.saturating_sub(self.total_streak_bonus_paid)
    }

    /// Total prize liability for this draw (Σ winners × prize per tier).
    /// Used for auditing and for reclaim-bounds verification.
    pub fn get_total_prizes(&self) -> u64 {
        (self.match_6_winners as u64)
            .saturating_mul(self.match_6_prize_per_winner)
            .saturating_add(
                (self.match_5_winners as u64).saturating_mul(self.match_5_prize_per_winner),
            )
            .saturating_add(
                (self.match_4_winners as u64).saturating_mul(self.match_4_prize_per_winner),
            )
            .saturating_add(
                (self.match_3_winners as u64).saturating_mul(self.match_3_prize_per_winner),
            )
            .saturating_add(
                (self.match_2_winners as u64).saturating_mul(self.match_2_prize_per_winner),
            )
    }
}
