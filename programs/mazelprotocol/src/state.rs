//! SolanaLotto Protocol - State Structures
//!
//! This module defines all account structures (state) for the lottery protocol,
//! including the main lottery state, draw results, tickets, user stats, and syndicates.

use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::LottoError;

// ============================================================================
// CORE STATE STRUCTURES
// ============================================================================

/// Main lottery state account - stores all global lottery configuration and state
#[account]
#[derive(Default)]
pub struct LotteryState {
    /// Admin authority (multi-sig wallet recommended)
    pub authority: Pubkey,

    /// Pending authority for two-step transfer (None if no transfer pending)
    pub pending_authority: Option<Pubkey>,

    /// Switchboard queue for randomness requests
    pub switchboard_queue: Pubkey,

    /// Current active randomness account
    pub current_randomness_account: Pubkey,

    /// Current draw identifier (increments each draw)
    pub current_draw_id: u64,

    /// Current jackpot balance in USDC lamports
    pub jackpot_balance: u64,

    /// Reserve fund balance for future draws
    pub reserve_balance: u64,

    /// Insurance fund balance for guaranteed payouts
    pub insurance_balance: u64,

    /// Ticket price in USDC lamports
    pub ticket_price: u64,

    /// Current house fee in basis points (10000 = 100%)
    pub house_fee_bps: u16,

    /// Maximum jackpot before forced rolldown
    pub jackpot_cap: u64,

    /// Initial seed amount for new jackpot cycles
    pub seed_amount: u64,

    /// Soft cap threshold for probabilistic rolldown
    pub soft_cap: u64,

    /// Hard cap threshold for forced rolldown
    pub hard_cap: u64,

    /// Unix timestamp of next scheduled draw
    pub next_draw_timestamp: i64,

    /// Draw interval in seconds
    pub draw_interval: i64,

    /// Slot when current randomness was committed
    pub commit_slot: u64,

    /// Unix timestamp when randomness was committed (for timeout)
    pub commit_timestamp: i64,

    /// Current draw ticket count
    pub current_draw_tickets: u64,

    /// Total tickets sold (lifetime)
    pub total_tickets_sold: u64,

    /// Total prizes paid out (lifetime)
    pub total_prizes_paid: u64,

    /// Whether a draw is currently in progress
    pub is_draw_in_progress: bool,

    /// Whether rolldown is active for the next draw
    pub is_rolldown_active: bool,

    /// Whether the lottery is paused
    pub is_paused: bool,

    /// Whether the lottery has been funded with initial seed
    pub is_funded: bool,

    /// PDA bump seed
    pub bump: u8,
}

impl LotteryState {
    pub const LEN: usize = LOTTERY_STATE_SIZE;

    /// Check if ticket sales are open for the current draw with safety checks
    pub fn is_ticket_sale_open(&self, current_timestamp: i64) -> bool {
        // Check basic state conditions
        if self.is_paused || !self.is_funded || self.is_draw_in_progress {
            return false;
        }

        // Check if next draw timestamp is valid
        if self.next_draw_timestamp <= 0 {
            return false;
        }

        // Calculate sale cutoff time with overflow protection
        match self.next_draw_timestamp.checked_sub(TICKET_SALE_CUTOFF) {
            Some(cutoff_time) => current_timestamp < cutoff_time,
            None => {
                // Underflow occurred - sale cutoff would be in the past
                // This means we're too close to draw time
                false
            }
        }
    }

    /// Calculate current house fee based on jackpot level with validation
    pub fn get_current_house_fee_bps(&self) -> u16 {
        // Validate state before calculation
        if !self.is_funded {
            return 0;
        }

        calculate_house_fee_bps(self.jackpot_balance, self.is_rolldown_active)
    }

    /// Check if rolldown should be triggered with validation
    pub fn should_trigger_rolldown(&self) -> bool {
        // Validate caps configuration
        if self.soft_cap > self.hard_cap {
            return false; // Invalid configuration
        }

        self.jackpot_balance >= self.hard_cap
    }

    /// Calculate rolldown probability with state validation
    pub fn get_rolldown_probability_bps(&self) -> u16 {
        // Validate state before calculation
        if !self.is_funded || self.is_paused {
            return 0;
        }

        // Validate caps configuration
        if self.soft_cap > self.hard_cap {
            return 0; // Invalid configuration
        }

        calculate_rolldown_probability_bps(self.jackpot_balance)
    }

    /// Check if the draw commit has timed out with safety checks
    /// Timeout is 1 hour (3600 seconds) after commit
    pub fn is_commit_timed_out(&self, current_timestamp: i64) -> bool {
        if !self.is_draw_in_progress || self.commit_timestamp <= 0 {
            return false;
        }

        // Calculate timeout with overflow protection
        match self.commit_timestamp.checked_add(DRAW_COMMIT_TIMEOUT) {
            Some(timeout_timestamp) => current_timestamp > timeout_timestamp,
            None => {
                // Overflow occurred - treat as timed out for safety
                true
            }
        }
    }

    /// Reset draw state (used for timeout recovery or after finalization)
    /// Includes comprehensive state cleanup
    ///
    /// FIXED: Does NOT reset pending_authority - authority transfer is independent
    /// of draw state and should persist across draw resets.
    pub fn reset_draw_state(&mut self) {
        self.is_draw_in_progress = false;
        self.is_rolldown_active = false;
        self.commit_slot = 0;
        self.commit_timestamp = 0;
        self.current_randomness_account = Pubkey::default();
        // Note: current_draw_tickets is reset separately in finalize_draw
        // to allow cancel_draw to preserve tickets for rescheduled draws
    }

    /// Validate lottery state configuration
    pub fn validate_configuration(&self) -> bool {
        // Check caps configuration
        if self.soft_cap > self.hard_cap {
            return false;
        }

        // Check ticket price is reasonable
        if self.ticket_price == 0 || self.ticket_price > 100_000_000 {
            // Max 100 USDC
            return false;
        }

        // Check house fee is reasonable (0-50%)
        if self.house_fee_bps > 5000 {
            return false;
        }

        // Check draw interval is reasonable (1 hour to 1 week)
        if self.draw_interval < 3600 || self.draw_interval > 604800 {
            return false;
        }

        // Check seed amount is reasonable
        if self.seed_amount > self.hard_cap {
            return false;
        }

        true
    }

    /// Get available prize pool balance (jackpot + reserve + insurance)
    pub fn get_available_prize_pool(&self) -> u64 {
        self.jackpot_balance
            .saturating_add(self.reserve_balance)
            .saturating_add(self.insurance_balance)
    }

    /// Get the total safety buffer (reserve + insurance)
    /// This is the 5% buffer mentioned in documentation (3% reserve + 2% insurance)
    pub fn get_safety_buffer(&self) -> u64 {
        self.reserve_balance.saturating_add(self.insurance_balance)
    }

    /// Check if lottery can pay out prizes for given winner counts
    pub fn can_pay_prizes(&self, winner_counts: &WinnerCounts) -> bool {
        // Simple check: ensure we have at least some funds
        let total_winners = winner_counts.match_6 as u64
            + winner_counts.match_5 as u64
            + winner_counts.match_4 as u64
            + winner_counts.match_3 as u64
            + winner_counts.match_2 as u64;

        if total_winners == 0 {
            return true; // No winners to pay
        }

        // Check if we have at least minimum funds per winner
        let min_funds_needed = total_winners * 1000; // 0.001 USDC per winner minimum

        self.get_available_prize_pool() >= min_funds_needed
    }

    /// Detailed solvency check for fixed prizes
    /// Returns (is_solvent, shortfall_amount, can_use_insurance)
    ///
    /// # Arguments
    /// * `required_fixed_prizes` - Total fixed prizes needed (Match 3/4/5)
    /// * `jackpot_to_distribute` - Jackpot amount if Match 6 winner exists
    ///
    /// # Returns
    /// * `(bool, u64, bool)` - (is_solvent, shortfall_if_any, can_cover_with_insurance)
    pub fn check_solvency_detailed(
        &self,
        required_fixed_prizes: u64,
        jackpot_to_distribute: u64,
    ) -> (bool, u64, bool) {
        let total_required = required_fixed_prizes.saturating_add(jackpot_to_distribute);

        // First check: can we pay from jackpot + reserve alone?
        let primary_funds = self.jackpot_balance.saturating_add(self.reserve_balance);

        if primary_funds >= total_required {
            return (true, 0, false); // Fully solvent without insurance
        }

        // Calculate shortfall
        let shortfall = total_required.saturating_sub(primary_funds);

        // Check if insurance can cover the shortfall
        let can_cover_with_insurance = self.insurance_balance >= shortfall;

        if can_cover_with_insurance {
            return (true, shortfall, true); // Solvent with insurance
        }

        // Not fully solvent even with insurance
        let remaining_shortfall = shortfall.saturating_sub(self.insurance_balance);
        (false, remaining_shortfall, true) // Insurance will be used but still short
    }

    /// Calculate how much can be paid from each fund source
    /// Returns (from_jackpot, from_reserve, from_insurance, remaining_shortfall)
    ///
    /// This follows the priority order:
    /// 1. Use jackpot balance first
    /// 2. Use reserve balance second
    /// 3. Use insurance balance last (emergency only)
    pub fn calculate_fund_usage(&self, total_required: u64) -> (u64, u64, u64, u64) {
        let mut remaining = total_required;

        // Use jackpot first
        let from_jackpot = remaining.min(self.jackpot_balance);
        remaining = remaining.saturating_sub(from_jackpot);

        // Use reserve second
        let from_reserve = remaining.min(self.reserve_balance);
        remaining = remaining.saturating_sub(from_reserve);

        // Use insurance last (emergency)
        let from_insurance = remaining.min(self.insurance_balance);
        remaining = remaining.saturating_sub(from_insurance);

        (from_jackpot, from_reserve, from_insurance, remaining)
    }

    /// Calculate the insurance coverage ratio
    /// Returns the percentage of potential shortfall that insurance can cover (in BPS)
    pub fn get_insurance_coverage_ratio(&self, potential_liability: u64) -> u16 {
        if potential_liability == 0 {
            return 10000; // 100% coverage if no liability
        }

        let coverage = (self.insurance_balance as u128 * 10000u128) / potential_liability as u128;
        coverage.min(10000) as u16
    }

    /// Check if we should trigger emergency insurance usage
    /// Returns true if reserve is depleted and insurance is needed
    pub fn needs_emergency_insurance(&self, required_amount: u64) -> bool {
        let available_without_insurance = self.jackpot_balance.saturating_add(self.reserve_balance);
        required_amount > available_without_insurance && self.insurance_balance > 0
    }

    /// Get the current fee tier description based on jackpot balance
    pub fn get_fee_tier_description(&self) -> &'static str {
        if self.is_rolldown_active {
            "Rolldown (28%)"
        } else if self.jackpot_balance < FEE_TIER_1_THRESHOLD {
            "Tier 1: < $500k (28%)"
        } else if self.jackpot_balance < FEE_TIER_2_THRESHOLD {
            "Tier 2: $500k-$1M (32%)"
        } else if self.jackpot_balance < FEE_TIER_3_THRESHOLD {
            "Tier 3: $1M-$1.5M (36%)"
        } else {
            "Tier 4: > $1.5M (40%)"
        }
    }

    /// Get the rolldown status description
    pub fn get_rolldown_status(&self) -> &'static str {
        if self.jackpot_balance >= self.hard_cap {
            "FORCED (Hard Cap Reached)"
        } else if self.jackpot_balance >= self.soft_cap {
            "ACTIVE (Probabilistic)"
        } else {
            "INACTIVE"
        }
    }
}

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
}

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
        // FIXED: Handle edge case where current_draw_id could be 0 or 1
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

    /// Calculate streak bonus (basis points)
    pub fn get_streak_bonus_bps(&self) -> u16 {
        // 0.5% bonus per consecutive draw, max 5%
        let bonus = (self.current_streak as u16) * 50;
        if bonus > 500 {
            500
        } else {
            bonus
        }
    }
}

// ============================================================================
// SYNDICATE STRUCTURES
// ============================================================================

/// Syndicate member information
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct SyndicateMember {
    /// Member wallet
    pub wallet: Pubkey,

    /// USDC contributed
    pub contribution: u64,

    /// Share of prizes (basis points)
    pub share_percentage_bps: u16,
}

impl SyndicateMember {
    pub const LEN: usize = SYNDICATE_MEMBER_SIZE;
}

/// Syndicate account - represents a group buying pool
#[account]
#[derive(Default)]
pub struct Syndicate {
    /// Syndicate creator
    pub creator: Pubkey,

    /// Unique identifier
    pub syndicate_id: u64,

    /// Name (UTF-8, max 32 bytes)
    pub name: [u8; 32],

    /// Whether anyone can join
    pub is_public: bool,

    /// Current member count
    pub member_count: u32,

    /// Total USDC contributed
    pub total_contribution: u64,

    /// Manager fee (basis points, max 500 = 5%)
    pub manager_fee_bps: u16,

    /// Syndicate's USDC token account (PDA-controlled)
    pub usdc_account: Pubkey,

    /// List of members
    pub members: Vec<SyndicateMember>,

    /// PDA bump seed
    pub bump: u8,
}

impl Syndicate {
    /// Calculate size for a given number of members
    pub fn size_for_members(member_count: usize) -> usize {
        SYNDICATE_BASE_SIZE + (member_count * SYNDICATE_MEMBER_SIZE)
    }

    /// Add a new member to the syndicate
    pub fn add_member(&mut self, wallet: Pubkey, contribution: u64) -> Result<()> {
        require!(
            (self.member_count as usize) < MAX_SYNDICATE_MEMBERS,
            LottoError::SyndicateFull
        );

        // Check if already a member
        for member in &self.members {
            require!(member.wallet != wallet, LottoError::AlreadySyndicateMember);
        }

        self.members.push(SyndicateMember {
            wallet,
            contribution,
            share_percentage_bps: 0, // Will be calculated
        });
        self.total_contribution = self.total_contribution.saturating_add(contribution);
        self.member_count = self.member_count.saturating_add(1);

        // Recalculate shares
        self.recalculate_shares();

        Ok(())
    }

    /// Remove a member from the syndicate
    /// Returns the member's contribution amount for refund
    pub fn remove_member(&mut self, wallet: &Pubkey) -> Result<u64> {
        let member_index = self
            .members
            .iter()
            .position(|m| m.wallet == *wallet)
            .ok_or(LottoError::NotSyndicateMember)?;

        let contribution = self.members[member_index].contribution;

        // Remove the member
        self.members.remove(member_index);
        self.member_count = self.member_count.saturating_sub(1);
        self.total_contribution = self.total_contribution.saturating_sub(contribution);

        // Recalculate shares
        self.recalculate_shares();

        Ok(contribution)
    }

    /// Recalculate member shares based on contributions
    /// FIXED: Ensures total shares always sum to exactly 10000 BPS
    pub fn recalculate_shares(&mut self) {
        if self.members.is_empty() {
            return;
        }

        if self.total_contribution == 0 {
            // If no contributions, distribute equally
            // Use largest remainder method to ensure sum = 10000
            let base_share = BPS_DENOMINATOR as u16 / self.member_count as u16;
            let remainder = BPS_DENOMINATOR as u16 % self.member_count as u16;

            for (i, member) in self.members.iter_mut().enumerate() {
                // Give 1 extra BPS to the first 'remainder' members
                member.share_percentage_bps = if (i as u16) < remainder {
                    base_share + 1
                } else {
                    base_share
                };
            }
            return;
        }

        // Calculate initial shares using integer division
        let mut total_assigned: u16 = 0;
        let mut shares: Vec<(usize, u16, u64)> = Vec::with_capacity(self.members.len());

        for (i, member) in self.members.iter().enumerate() {
            let share = ((member.contribution as u128 * BPS_DENOMINATOR as u128)
                / self.total_contribution as u128) as u16;
            shares.push((i, share, member.contribution));
            total_assigned += share;
        }

        // Distribute remaining BPS to members with highest contributions
        // This ensures the total always sums to exactly 10000
        let mut remainder = BPS_DENOMINATOR as u16 - total_assigned;

        if remainder > 0 {
            // Sort by contribution descending to give remainder to largest contributors
            shares.sort_by(|a, b| b.2.cmp(&a.2));

            for (idx, share, _) in shares.iter_mut() {
                if remainder == 0 {
                    break;
                }
                *share += 1;
                remainder -= 1;
                // Update the actual member
                self.members[*idx].share_percentage_bps = *share;
            }

            // For members not getting extra, set their calculated share
            for (idx, share, _) in &shares {
                if self.members[*idx].share_percentage_bps != *share {
                    self.members[*idx].share_percentage_bps = *share;
                }
            }
        } else {
            // No remainder, just set the shares directly
            for (idx, share, _) in &shares {
                self.members[*idx].share_percentage_bps = *share;
            }
        }
    }

    /// Find a member by wallet address
    pub fn find_member(&self, wallet: &Pubkey) -> Option<&SyndicateMember> {
        self.members.iter().find(|m| m.wallet == *wallet)
    }

    /// Find a member mutably by wallet address
    pub fn find_member_mut(&mut self, wallet: &Pubkey) -> Option<&mut SyndicateMember> {
        self.members.iter_mut().find(|m| m.wallet == *wallet)
    }
}

// ============================================================================
// QUICK PICK EXPRESS STRUCTURES
// ============================================================================

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

    /// Jackpot hard cap ($40,000 - forced rolldown)
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

// ============================================================================
// ADVANCED FEATURE STRUCTURES
// ============================================================================

/// Lucky Numbers NFT - awarded to Match 4+ winners
#[account]
#[derive(Default)]
pub struct LuckyNumbersNFT {
    /// NFT mint address
    pub mint: Pubkey,

    /// Current owner
    pub owner: Pubkey,

    /// The winning numbers stored in this NFT
    pub numbers: [u8; 6],

    /// Draw where these numbers won
    pub original_draw_id: u64,

    /// Match tier when won (4, 5, or 6)
    pub original_match_tier: u8,

    /// Original winner who received this NFT
    pub original_winner: Pubkey,

    /// Timestamp of creation
    pub created_at: i64,

    /// Total jackpot bonuses claimed through this NFT
    pub total_bonuses_claimed: u64,

    /// Number of times these numbers hit jackpot
    pub jackpot_hits: u32,

    /// Is this NFT active
    pub is_active: bool,

    /// PDA bump
    pub bump: u8,
}

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

    /// PDA bump
    pub bump: u8,
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

// ============================================================================
// ENUMS & HELPER STRUCTURES
// ============================================================================

/// Rolldown type enumeration
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Default)]
pub enum RolldownType {
    #[default]
    None,
    /// Probabilistic rolldown (jackpot between soft and hard cap)
    Soft,
    /// Forced rolldown (jackpot >= hard cap)
    Hard,
}

/// Match tier enumeration
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Default)]
pub enum MatchTier {
    #[default]
    NoMatch,
    Match2,
    Match3,
    Match4,
    Match5,
    Match6,
}

impl From<u8> for MatchTier {
    fn from(count: u8) -> Self {
        match count {
            6 => MatchTier::Match6,
            5 => MatchTier::Match5,
            4 => MatchTier::Match4,
            3 => MatchTier::Match3,
            2 => MatchTier::Match2,
            _ => MatchTier::NoMatch,
        }
    }
}

impl From<MatchTier> for u8 {
    fn from(tier: MatchTier) -> Self {
        match tier {
            MatchTier::Match6 => 6,
            MatchTier::Match5 => 5,
            MatchTier::Match4 => 4,
            MatchTier::Match3 => 3,
            MatchTier::Match2 => 2,
            MatchTier::NoMatch => 0,
        }
    }
}

/// Winner counts structure for draw results
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct WinnerCounts {
    pub match_6: u32,
    pub match_5: u32,
    pub match_4: u32,
    pub match_3: u32,
    pub match_2: u32,
}

/// Prize mode - determines how prizes are calculated
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Default)]
pub enum PrizeMode {
    /// Fixed prizes (normal mode)
    #[default]
    Fixed,
    /// Pari-mutuel prizes (rolldown mode or high volume)
    PariMutuel,
}

/// Parameters for ticket purchases
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct TicketPurchaseParams {
    pub numbers: [u8; 6],
    pub syndicate: Option<Pubkey>,
}

/// Parameters for bulk ticket purchases
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct BulkTicketPurchaseParams {
    pub tickets: Vec<[u8; 6]>,
    pub syndicate: Option<Pubkey>,
}

// ============================================================================
// UNIFIED TICKET (for bulk purchases)
// ============================================================================

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
    pub fn is_ticket_claimed(&self, index: usize) -> bool {
        if index >= self.ticket_count as usize {
            return true; // Out of bounds considered claimed
        }
        let byte_index = index / 8;
        let bit_index = index % 8;
        if byte_index >= self.claimed_bitmap.len() {
            return false;
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
