//! MazelProtocol - Syndicate Wars Structures
//!
//! Contains SyndicateWarsState and SyndicateWarsEntry for monthly competitions.

use anchor_lang::prelude::*;

/// Syndicate Wars competition state
#[account]
#[derive(Default)]
pub struct SyndicateWarsState {
    /// Current competition month
    pub month: u64,

    /// Competition start timestamp
    pub start_timestamp: i64,

    /// Competition end timestamp
    pub end_timestamp: i64,

    /// Prize pool amount
    pub prize_pool: u64,

    /// Registered syndicates count
    pub registered_count: u32,

    /// Minimum tickets to qualify
    pub min_tickets: u64,

    /// Is competition active
    pub is_active: bool,

    /// SECURITY FIX (Audit Issue #2): Guard flag to prevent prizes from being
    /// distributed more than once. Without this, the authority could call
    /// `distribute_syndicate_wars_prizes` multiple times, overwriting rankings
    /// and potentially causing double-spend or ranking manipulation.
    pub is_distributed: bool,

    /// PDA bump
    pub bump: u8,
}

impl SyndicateWarsState {
    /// Account size including discriminator
    /// NOTE: is_distributed field added in audit fix — if migrating existing
    /// accounts, ensure reallocation covers the extra byte.
    pub const LEN: usize = 8 + std::mem::size_of::<SyndicateWarsState>();

    /// Check if competition is open for registration
    pub fn is_registration_open(&self, current_timestamp: i64) -> bool {
        self.is_active
            && current_timestamp >= self.start_timestamp
            && current_timestamp <= self.end_timestamp
    }

    /// Check if competition has ended
    pub fn has_ended(&self, current_timestamp: i64) -> bool {
        current_timestamp > self.end_timestamp
    }

    /// Calculate competition duration in seconds with overflow protection
    pub fn duration(&self) -> i64 {
        self.end_timestamp.saturating_sub(self.start_timestamp)
    }
}

/// Syndicate Wars entry for a syndicate
#[account]
#[derive(Default)]
pub struct SyndicateWarsEntry {
    /// Syndicate reference
    pub syndicate: Pubkey,

    /// Competition month
    pub month: u64,

    /// Total tickets purchased
    pub tickets_purchased: u64,

    /// Total prizes won (in USDC lamports)
    pub prizes_won: u64,

    /// Win count (Match 3+)
    pub win_count: u32,

    /// Win rate (fixed-point × 1,000,000)
    pub win_rate: u64,

    /// Final rank
    pub final_rank: Option<u32>,

    /// Prize claimed
    pub prize_claimed: bool,

    /// PDA bump
    pub bump: u8,
}

impl SyndicateWarsEntry {
    /// Account size including discriminator
    pub const LEN: usize = 8 + std::mem::size_of::<SyndicateWarsEntry>();

    /// Calculate win rate (fixed-point × 1,000,000)
    pub fn calculate_win_rate(&self) -> u64 {
        if self.tickets_purchased == 0 {
            return 0;
        }
        (self.win_count as u128 * 1_000_000 / self.tickets_purchased as u128) as u64
    }

    /// Update win rate based on current stats
    pub fn update_win_rate(&mut self) {
        self.win_rate = self.calculate_win_rate();
    }

    /// Check if entry meets minimum qualification requirements
    pub fn meets_qualification(&self, min_tickets: u64) -> bool {
        self.tickets_purchased >= min_tickets
    }

    /// Add stats from a draw
    pub fn add_draw_stats(&mut self, tickets: u64, prizes: u64, wins: u32) {
        self.tickets_purchased = self.tickets_purchased.saturating_add(tickets);
        self.prizes_won = self.prizes_won.saturating_add(prizes);
        self.win_count = self.win_count.saturating_add(wins);
        self.update_win_rate();
    }
}
