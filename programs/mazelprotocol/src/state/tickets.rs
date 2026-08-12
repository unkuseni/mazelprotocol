//! MazelProtocol - Ticket & User Accounts
//!
//! Contains TicketData, UserStats, and UnifiedTicket account structures.

use anchor_lang::prelude::*;

use crate::constants::*;

/// Ticket account - represents a single lottery ticket
#[account]
#[derive(Default)]
pub struct TicketData {
    /// Ticket owner
    pub owner: Pubkey,

    /// Draw this ticket is for
    pub draw_id: u64,

    /// Selected numbers (sorted ascending)
    pub numbers: [u8; 6],

    /// Purchase timestamp
    pub purchase_timestamp: i64,

    /// Whether prize has been claimed
    pub is_claimed: bool,

    /// Number of matches (set after draw)
    pub match_count: u8,

    /// Prize amount (set after draw)
    pub prize_amount: u64,

    /// Syndicate (if purchased through one)
    pub syndicate: Option<Pubkey>,

    /// PDA bump seed
    pub bump: u8,
}

impl TicketData {
    pub const LEN: usize = TICKET_SIZE;

    /// Calculate matches against winning numbers
    pub fn calculate_matches(&mut self, winning_numbers: &[u8; 6]) {
        self.match_count = calculate_match_count(&self.numbers, winning_numbers);
    }
}

/// User statistics account - tracks player participation and achievements
#[account]
#[derive(Default)]
pub struct UserStats {
    /// User's wallet address
    pub wallet: Pubkey,

    /// Total tickets purchased (lifetime)
    pub total_tickets: u64,

    /// Total USDC spent (lifetime)
    pub total_spent: u64,

    /// Total USDC won (lifetime)
    pub total_won: u64,

    /// Current consecutive draw participation streak
    pub current_streak: u32,

    /// Best streak achieved
    pub best_streak: u32,

    /// Number of jackpot wins
    pub jackpot_wins: u32,

    /// Last draw ID where user participated
    pub last_draw_participated: u64,

    /// Number of tickets purchased in the current draw (for limit enforcement)
    pub tickets_this_draw: u64,

    /// Number of free tickets available (from Match 2 wins)
    pub free_tickets_available: u32,

    /// PDA bump seed
    pub bump: u8,
}

impl UserStats {
    pub const LEN: usize = USER_STATS_SIZE;

    /// Update streak based on current draw
    pub fn update_streak(&mut self, current_draw_id: u64) {
        // Handle edge case where current_draw_id could be 0 or 1
        if current_draw_id > 0
            && self.last_draw_participated == current_draw_id.saturating_sub(1)
            && self.last_draw_participated > 0
        {
            self.current_streak = self.current_streak.saturating_add(1);
            if self.current_streak > self.best_streak {
                self.best_streak = self.current_streak;
            }
        } else if self.last_draw_participated != current_draw_id {
            self.current_streak = 1;
        }
        self.last_draw_participated = current_draw_id;
    }

    /// Calculate the streak bonus for the current player (basis points).
    ///
    /// Returns `STREAK_BONUS_BPS_PER_DRAW` (0.5%) per consecutive draw the
    /// player has participated in, capped at `MAX_STREAK_BONUS_BPS` (5%).
    ///
    /// This bonus is applied to USDC prize payouts at claim time (L-7). It is
    /// funded by the `streak_bonus_pool` pre-computed at draw finalization,
    /// which guarantees the prize pool can cover the worst-case bonus.
    pub fn get_streak_bonus_bps(&self) -> u16 {
        (self.current_streak as u16)
            .saturating_mul(STREAK_BONUS_BPS_PER_DRAW)
            .min(MAX_STREAK_BONUS_BPS)
    }
}

/// Unified ticket account for bulk purchases
#[account]
pub struct UnifiedTicket {
    /// Wallet that owns all tickets in this account
    pub owner: Pubkey,

    /// Draw ID that all tickets are for
    pub draw_id: u64,

    /// Starting ticket ID for this batch
    pub start_ticket_id: u64,

    /// Number of tickets in this account
    pub ticket_count: u32,

    /// Array of lottery numbers (one per ticket, flattened as [u8; 6] arrays)
    pub numbers: Vec<[u8; 6]>,

    /// Unix timestamp when tickets were purchased
    pub purchase_timestamp: i64,

    /// Optional syndicate wallet
    pub syndicate: Option<Pubkey>,

    /// Claimed status for each ticket (bitmap for efficiency)
    pub claimed_bitmap: Vec<u8>,

    /// PDA bump
    pub bump: u8,
}

impl UnifiedTicket {
    /// Calculate account size for initialization
    pub fn size_for_count(ticket_count: usize) -> usize {
        8 + // discriminator
        32 + // owner
        8 +  // draw_id
        8 +  // start_ticket_id
        4 +  // ticket_count
        4 +  // numbers vector length
        (ticket_count * 6) + // numbers data (6 bytes each)
        8 +  // purchase_timestamp
        33 + // syndicate (Option<Pubkey>)
        4 +  // claimed_bitmap vector length
        ((ticket_count + 7) / 8) + // claimed_bitmap data (1 bit per ticket)
        1 // bump
    }

    /// Check if a specific ticket is claimed
    ///
    /// # Returns
    /// - `true` if the ticket is claimed OR if the index is out of bounds
    /// - `false` only if the ticket exists and is unclaimed
    ///
    /// This ensures consistency: any invalid/malformed state is treated as "claimed"
    /// to prevent double-claiming in edge cases.
    pub fn is_ticket_claimed(&self, index: usize) -> bool {
        if index >= self.ticket_count as usize {
            return true; // Out of bounds considered claimed (prevents access)
        }
        let byte_index = index / 8;
        let bit_index = index % 8;
        if byte_index >= self.claimed_bitmap.len() {
            // Bitmap is shorter than expected - treat as claimed for safety
            return true;
        }
        (self.claimed_bitmap[byte_index] & (1 << bit_index)) != 0
    }

    /// Mark a specific ticket as claimed
    pub fn mark_ticket_claimed(&mut self, index: usize) {
        if index >= self.ticket_count as usize {
            return;
        }
        let byte_index = index / 8;
        let bit_index = index % 8;
        if byte_index < self.claimed_bitmap.len() {
            self.claimed_bitmap[byte_index] |= 1 << bit_index;
        }
    }
}

impl Default for UnifiedTicket {
    fn default() -> Self {
        Self {
            owner: Pubkey::default(),
            draw_id: 0,
            start_ticket_id: 0,
            ticket_count: 0,
            numbers: Vec::new(),
            purchase_timestamp: 0,
            syndicate: None,
            claimed_bitmap: Vec::new(),
            bump: 0,
        }
    }
}
