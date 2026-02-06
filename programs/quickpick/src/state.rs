//! Quick Pick Express State
//!
//! This module contains all account structures for the Quick Pick Express lottery program.
//! Quick Pick Express is a high-frequency 5/35 matrix lottery running every 4 hours.

use anchor_lang::prelude::*;

use crate::constants::*;

// ============================================================================
// QUICK PICK STATE
// ============================================================================

/// Quick Pick Express game state (5/35 Matrix with Rolldown Exploit)
///
/// This is the main state account that stores all global configuration
/// and current state for the Quick Pick Express lottery.
#[account]
#[derive(Default)]
pub struct QuickPickState {
    /// Current draw number (increments each draw)
    pub current_draw: u64,

    /// Ticket price in USDC lamports (1,500,000 = $1.50)
    pub ticket_price: u64,

    /// Matrix parameters (5/35)
    /// Number of numbers to pick
    pub pick_count: u8,
    /// Range of numbers (1 to number_range)
    pub number_range: u8,

    /// Current house fee in basis points (dynamic based on jackpot level, 28-38%)
    pub house_fee_bps: u16,

    /// Draw interval in seconds (14400 = 4 hours)
    pub draw_interval: i64,

    /// Next draw timestamp (unix timestamp)
    pub next_draw_timestamp: i64,

    /// Jackpot balance in USDC lamports (accumulates between draws)
    pub jackpot_balance: u64,

    /// Jackpot soft cap in USDC lamports ($30,000 - probabilistic rolldown begins)
    pub soft_cap: u64,

    /// Jackpot hard cap in USDC lamports ($50,000 - forced rolldown)
    pub hard_cap: u64,

    /// Seed amount for jackpot reset after rolldown ($5,000)
    pub seed_amount: u64,

    /// Fixed prize amounts (Normal Mode)
    /// Match 4 prize in USDC lamports ($100)
    pub match_4_prize: u64,
    /// Match 3 prize in USDC lamports ($4)
    pub match_3_prize: u64,

    /// Current draw ticket count
    pub current_draw_tickets: u64,

    /// Prize pool balance for fixed prizes (USDC lamports)
    pub prize_pool_balance: u64,

    /// Insurance pool balance (USDC lamports)
    pub insurance_balance: u64,

    /// Reserve balance for jackpot seeding (USDC lamports)
    pub reserve_balance: u64,

    /// Total tickets sold across all draws
    pub total_tickets_sold: u64,

    /// Total prizes paid out (USDC lamports)
    pub total_prizes_paid: u64,

    /// Current randomness account for commit-reveal pattern
    pub current_randomness_account: Pubkey,

    /// Commit slot for randomness verification
    pub commit_slot: u64,

    /// Commit timestamp for timeout verification
    pub commit_timestamp: i64,

    /// Is a draw currently in progress (between commit and finalize)
    pub is_draw_in_progress: bool,

    /// Rolldown pending flag (set when jackpot >= soft_cap)
    pub is_rolldown_pending: bool,

    /// Is the lottery paused
    pub is_paused: bool,

    /// Is the lottery funded (seed amount deposited)
    pub is_funded: bool,

    /// PDA bump seed
    pub bump: u8,
}

impl QuickPickState {
    /// Account size including discriminator
    pub const LEN: usize = 8 +    // discriminator
        8 +    // current_draw
        8 +    // ticket_price
        1 +    // pick_count
        1 +    // number_range
        2 +    // house_fee_bps
        8 +    // draw_interval
        8 +    // next_draw_timestamp
        8 +    // jackpot_balance
        8 +    // soft_cap
        8 +    // hard_cap
        8 +    // seed_amount
        8 +    // match_4_prize
        8 +    // match_3_prize
        8 +    // current_draw_tickets
        8 +    // prize_pool_balance
        8 +    // insurance_balance
        8 +    // reserve_balance
        8 +    // total_tickets_sold
        8 +    // total_prizes_paid
        32 +   // current_randomness_account
        8 +    // commit_slot
        8 +    // commit_timestamp
        1 +    // is_draw_in_progress
        1 +    // is_rolldown_pending
        1 +    // is_paused
        1 +    // is_funded
        1 +    // bump
        32; // padding for future use

    /// Get current house fee based on jackpot level
    pub fn get_current_house_fee_bps(&self) -> u16 {
        calculate_quick_pick_house_fee_bps(self.jackpot_balance, self.is_rolldown_pending)
    }

    /// Check if ticket sales are open for the current draw
    pub fn is_ticket_sale_open(&self, current_timestamp: i64) -> bool {
        // Must be funded and not paused
        if !self.is_funded || self.is_paused || self.is_draw_in_progress {
            return false;
        }

        // Sales close 5 minutes before draw
        let sale_cutoff = self.next_draw_timestamp.saturating_sub(TICKET_SALE_CUTOFF);
        current_timestamp < sale_cutoff
    }

    /// Check if jackpot is properly funded (meets minimum seed amount)
    /// Returns true if jackpot >= minimum required amount
    /// Minimum is either seed_amount or a reasonable fraction of it
    pub fn is_jackpot_properly_funded(&self) -> bool {
        // Minimum jackpot should be at least 100% of seed amount
        // This prevents the lottery from operating with dangerously low jackpot
        let minimum_jackpot = self.seed_amount; // 100% of seed amount

        self.jackpot_balance >= minimum_jackpot
    }

    /// Check if lottery should be paused due to insufficient jackpot funding
    /// Returns true if jackpot is below minimum and lottery should be paused
    pub fn should_pause_due_to_insufficient_funding(&self) -> bool {
        !self.is_jackpot_properly_funded()
    }

    /// Get the minimum required jackpot amount
    pub fn get_minimum_jackpot_amount(&self) -> u64 {
        self.seed_amount // 100% of seed amount
    }

    /// Get the funding deficit (how much more is needed to reach minimum)
    pub fn get_jackpot_funding_deficit(&self) -> u64 {
        let minimum = self.get_minimum_jackpot_amount();
        if self.jackpot_balance >= minimum {
            0
        } else {
            minimum - self.jackpot_balance
        }
    }

    /// Check if draw is ready to execute
    pub fn is_draw_ready(&self, current_timestamp: i64) -> bool {
        current_timestamp >= self.next_draw_timestamp && !self.is_paused
    }

    /// Get rolldown probability in basis points
    pub fn get_rolldown_probability_bps(&self) -> u16 {
        if self.jackpot_balance < self.soft_cap {
            return 0;
        }
        if self.jackpot_balance >= self.hard_cap {
            return 10000; // 100%
        }

        // Linear scaling between soft and hard caps
        if self.soft_cap >= self.hard_cap {
            return 10000;
        }

        let excess = self.jackpot_balance.saturating_sub(self.soft_cap);
        let range = self.hard_cap.saturating_sub(self.soft_cap);

        ((excess as u128 * 10000) / range as u128) as u16
    }

    /// Reset state for next draw after finalization
    pub fn advance_to_next_draw(&mut self) {
        self.current_draw = self.current_draw.saturating_add(1);
        self.current_draw_tickets = 0;
        self.next_draw_timestamp = self.next_draw_timestamp.saturating_add(self.draw_interval);
        self.is_draw_in_progress = false;
        self.current_randomness_account = Pubkey::default();
        self.commit_slot = 0;
        self.commit_timestamp = 0;
    }

    /// Reset jackpot after rolldown
    pub fn reset_jackpot_after_rolldown(&mut self) {
        self.jackpot_balance = self.seed_amount;
        self.is_rolldown_pending = false;
    }

    /// Check if the commit has timed out (1 hour timeout)
    pub fn is_commit_timed_out(&self, current_timestamp: i64) -> bool {
        if self.commit_timestamp == 0 {
            return false;
        }
        // 1 hour timeout for commit-reveal
        const COMMIT_TIMEOUT: i64 = 3600;
        // Use checked_add to prevent overflow
        match self.commit_timestamp.checked_add(COMMIT_TIMEOUT) {
            Some(timeout_timestamp) => current_timestamp > timeout_timestamp,
            None => {
                // Overflow occurred - treat as timed out for safety
                true
            }
        }
    }

    /// Reset draw state (for cancellation or timeout)
    pub fn reset_draw_state(&mut self) {
        self.is_draw_in_progress = false;
        self.current_randomness_account = Pubkey::default();
        self.commit_slot = 0;
        self.commit_timestamp = 0;
    }

    /// Get available prize pool (prize pool + insurance as backup)
    pub fn get_available_prize_pool(&self) -> u64 {
        self.prize_pool_balance
            .saturating_add(self.insurance_balance)
            .saturating_add(self.reserve_balance)
    }

    /// Check if prizes can be paid with current balances
    pub fn can_pay_prizes(&self, required_amount: u64) -> bool {
        self.get_available_prize_pool() >= required_amount
    }

    /// Get the safety buffer (reserve + insurance)
    pub fn get_safety_buffer(&self) -> u64 {
        self.reserve_balance.saturating_add(self.insurance_balance)
    }
}

// ============================================================================
// QUICK PICK TICKET
// ============================================================================

/// Quick Pick Express ticket (5/35 Matrix)
///
/// Represents a single ticket purchased by a player for a specific draw.
#[account]
#[derive(Default)]
pub struct QuickPickTicket {
    /// Ticket owner's wallet address
    pub owner: Pubkey,

    /// Draw ID this ticket is for
    pub draw_id: u64,

    /// Selected numbers (5 numbers from 1-35, stored sorted ascending)
    pub numbers: [u8; 5],

    /// Purchase timestamp (unix timestamp)
    pub purchase_timestamp: i64,

    /// Whether the ticket has been claimed
    pub is_claimed: bool,

    /// Number of matching numbers (0-5, set after draw)
    pub match_count: u8,

    /// Prize amount in USDC lamports (set after claim)
    pub prize_amount: u64,

    /// PDA bump seed
    pub bump: u8,
}

impl QuickPickTicket {
    /// Account size including discriminator
    pub const LEN: usize = QUICK_PICK_TICKET_SIZE;

    /// Calculate how many numbers match the winning numbers
    ///
    /// Both arrays must be sorted for this to work correctly.
    pub fn calculate_matches(&self, winning_numbers: &[u8; 5]) -> u8 {
        let mut matches = 0u8;
        let mut i = 0usize;
        let mut j = 0usize;

        while i < 5 && j < 5 {
            if self.numbers[i] == winning_numbers[j] {
                matches += 1;
                i += 1;
                j += 1;
            } else if self.numbers[i] < winning_numbers[j] {
                i += 1;
            } else {
                j += 1;
            }
        }

        matches
    }

    /// Check if ticket is eligible for claiming
    pub fn is_claimable(&self, draw_timestamp: i64, current_timestamp: i64) -> bool {
        if self.is_claimed {
            return false;
        }

        // Check expiration (90 days)
        let claim_deadline = draw_timestamp.saturating_add(TICKET_CLAIM_EXPIRATION);
        current_timestamp <= claim_deadline
    }
}

// ============================================================================
// QUICK PICK DRAW RESULT
// ============================================================================

/// Quick Pick Express draw result (5/35 Matrix)
///
/// Stores the results of a completed draw including winning numbers,
/// winner counts, and prize amounts.
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

    /// Winner counts by tier
    /// Match 5 (Jackpot) winners
    pub match_5_winners: u32,
    /// Match 4 winners
    pub match_4_winners: u32,
    /// Match 3 winners
    pub match_3_winners: u32,

    /// Prize amounts per winner by tier (set during finalization)
    /// Match 5 (Jackpot) prize per winner
    pub match_5_prize_per_winner: u64,
    /// Match 4 prize per winner
    pub match_4_prize_per_winner: u64,
    /// Match 3 prize per winner
    pub match_3_prize_per_winner: u64,

    /// Explicit flag set when draw is finalized
    pub is_explicitly_finalized: bool,

    /// PDA bump seed
    pub bump: u8,
}

impl QuickPickDrawResult {
    /// Account size including discriminator
    pub const LEN: usize = QUICK_PICK_DRAW_RESULT_SIZE;

    /// Get the prize amount for a given match count
    pub fn get_prize_for_matches(&self, match_count: u8) -> u64 {
        match match_count {
            5 => self.match_5_prize_per_winner,
            4 => self.match_4_prize_per_winner,
            3 => self.match_3_prize_per_winner,
            _ => 0,
        }
    }

    /// Check if the draw has been finalized (prizes calculated)
    ///
    /// A draw is considered finalized if:
    /// - The explicit finalized flag is set, OR
    /// - Any prize amounts have been set
    pub fn is_finalized(&self) -> bool {
        self.is_explicitly_finalized
            || self.match_5_prize_per_winner > 0
            || self.match_4_prize_per_winner > 0
            || self.match_3_prize_per_winner > 0
    }

    /// Get total prizes to be distributed
    pub fn get_total_prizes(&self) -> u64 {
        let match_5_total =
            (self.match_5_winners as u64).saturating_mul(self.match_5_prize_per_winner);
        let match_4_total =
            (self.match_4_winners as u64).saturating_mul(self.match_4_prize_per_winner);
        let match_3_total =
            (self.match_3_winners as u64).saturating_mul(self.match_3_prize_per_winner);

        match_5_total
            .saturating_add(match_4_total)
            .saturating_add(match_3_total)
    }

    /// Get total number of winners across all tiers
    pub fn get_total_winners(&self) -> u32 {
        self.match_5_winners
            .saturating_add(self.match_4_winners)
            .saturating_add(self.match_3_winners)
    }
}

// ============================================================================
// HELPER TYPES
// ============================================================================

/// Winner counts for finalization
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct QuickPickWinnerCounts {
    /// Match 5 (Jackpot) winners
    pub match_5: u32,
    /// Match 4 winners
    pub match_4: u32,
    /// Match 3 winners
    pub match_3: u32,
}

impl QuickPickWinnerCounts {
    /// Get total winner count
    pub fn total(&self) -> u32 {
        self.match_5
            .saturating_add(self.match_4)
            .saturating_add(self.match_3)
    }

    /// Validate winner counts don't exceed total tickets
    pub fn validate(&self, total_tickets: u64) -> bool {
        (self.total() as u64) <= total_tickets
    }
}

// ============================================================================
// USER STATS (Reference structure for gate verification)
// ============================================================================

/// User statistics structure (for reference - actual account lives in main lottery)
///
/// This structure is used to verify the $50 spend gate for Quick Pick access.
/// The actual UserStats account is owned by the main lottery program.
#[account]
#[derive(Default)]
pub struct UserStats {
    /// User's wallet address
    pub wallet: Pubkey,

    /// Total tickets purchased (lifetime)
    pub total_tickets: u64,

    /// Total USDC spent on tickets (lifetime)
    pub total_spent: u64,

    /// Total USDC won (lifetime)
    pub total_won: u64,

    /// Current participation streak
    pub current_streak: u32,

    /// Best participation streak
    pub best_streak: u32,

    /// Number of jackpot wins
    pub jackpot_wins: u32,

    /// Last draw participated in
    pub last_draw_participated: u64,

    /// Tickets purchased in current draw
    pub tickets_this_draw: u64,

    /// Free tickets available (u32 to match main lottery layout)
    pub free_tickets_available: u32,

    /// PDA bump seed
    pub bump: u8,
}

impl UserStats {
    /// Account size including discriminator
    /// FIXED: free_tickets_available is u32 (4 bytes), matching main lottery
    pub const LEN: usize = 8 +  // discriminator
        32 +    // wallet
        8 +     // total_tickets
        8 +     // total_spent
        8 +     // total_won
        4 +     // current_streak
        4 +     // best_streak
        4 +     // jackpot_wins
        8 +     // last_draw_participated
        8 +     // tickets_this_draw
        4 +     // free_tickets_available (u32)
        1 +     // bump
        16; // padding

    /// Check if user meets the Quick Pick spend gate
    pub fn meets_quick_pick_gate(&self) -> bool {
        self.total_spent >= QUICK_PICK_MIN_SPEND_GATE
    }
}

/// Main lottery state structure (for reference - actual account lives in main lottery)
///
/// This structure is used to verify authority for Quick Pick operations.
/// The actual LotteryState account is owned by the main lottery program.
#[account]
pub struct LotteryState {
    /// Authority (owner) of the lottery
    pub authority: Pubkey,

    /// Pending authority for two-step transfer
    pub pending_authority: Option<Pubkey>,

    /// Switchboard oracle queue
    pub switchboard_queue: Pubkey,

    /// Current randomness account reference
    pub current_randomness_account: Option<Pubkey>,

    /// Current draw ID
    pub current_draw_id: u64,

    /// Jackpot balance
    pub jackpot_balance: u64,

    /// Reserve balance
    pub reserve_balance: u64,

    /// Insurance balance
    pub insurance_balance: u64,

    /// Ticket price
    pub ticket_price: u64,

    /// House fee in basis points
    pub house_fee_bps: u16,

    /// Jackpot cap
    pub jackpot_cap: u64,

    /// Seed amount
    pub seed_amount: u64,

    /// Soft cap
    pub soft_cap: u64,

    /// Hard cap
    pub hard_cap: u64,

    /// Next draw timestamp
    pub next_draw_timestamp: i64,

    /// Draw interval
    pub draw_interval: i64,

    /// Commit slot
    pub commit_slot: u64,

    /// Commit timestamp
    pub commit_timestamp: i64,

    /// Current draw ticket count
    pub current_draw_tickets: u64,

    /// Total tickets sold
    pub total_tickets_sold: u64,

    /// Total prizes paid
    pub total_prizes_paid: u64,

    /// Is draw in progress
    pub is_draw_in_progress: bool,

    /// Is rolldown active
    pub is_rolldown_active: bool,

    /// Is paused
    pub is_paused: bool,

    /// Is funded
    pub is_funded: bool,

    /// PDA bump
    pub bump: u8,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_quick_pick_ticket_calculate_matches_full() {
        let ticket = QuickPickTicket {
            numbers: [1, 2, 3, 4, 5],
            ..Default::default()
        };
        let winning = [1, 2, 3, 4, 5];
        assert_eq!(ticket.calculate_matches(&winning), 5);
    }

    #[test]
    fn test_quick_pick_ticket_calculate_matches_none() {
        let ticket = QuickPickTicket {
            numbers: [1, 2, 3, 4, 5],
            ..Default::default()
        };
        let winning = [6, 7, 8, 9, 10];
        assert_eq!(ticket.calculate_matches(&winning), 0);
    }

    #[test]
    fn test_quick_pick_ticket_calculate_matches_partial() {
        let ticket = QuickPickTicket {
            numbers: [1, 2, 3, 4, 5],
            ..Default::default()
        };
        let winning = [1, 2, 3, 10, 20];
        assert_eq!(ticket.calculate_matches(&winning), 3);
    }

    #[test]
    fn test_quick_pick_state_rolldown_probability() {
        let mut state = QuickPickState {
            soft_cap: 30_000_000_000,
            hard_cap: 50_000_000_000,
            ..Default::default()
        };

        // Below soft cap
        state.jackpot_balance = 25_000_000_000;
        assert_eq!(state.get_rolldown_probability_bps(), 0);

        // At soft cap
        state.jackpot_balance = 30_000_000_000;
        assert_eq!(state.get_rolldown_probability_bps(), 0);

        // Midway
        state.jackpot_balance = 40_000_000_000;
        assert_eq!(state.get_rolldown_probability_bps(), 5000);

        // At hard cap
        state.jackpot_balance = 50_000_000_000;
        assert_eq!(state.get_rolldown_probability_bps(), 10000);
    }

    #[test]
    fn test_winner_counts_validate() {
        let counts = QuickPickWinnerCounts {
            match_5: 1,
            match_4: 10,
            match_3: 100,
        };

        assert!(counts.validate(1000));
        assert!(counts.validate(111));
        assert!(!counts.validate(100));
    }

    #[test]
    fn test_draw_result_get_total_prizes() {
        let result = QuickPickDrawResult {
            match_5_winners: 1,
            match_5_prize_per_winner: 10_000_000_000,
            match_4_winners: 10,
            match_4_prize_per_winner: 100_000_000,
            match_3_winners: 100,
            match_3_prize_per_winner: 4_000_000,
            ..Default::default()
        };

        let total = result.get_total_prizes();
        // 1 * $10,000 + 10 * $100 + 100 * $4 = $10,000 + $1,000 + $400 = $11,400
        assert_eq!(total, 11_400_000_000);
    }
}
