//! MazelProtocol - LotteryState Account
//!
//! The main lottery state account stores all global lottery configuration and state.
//! This is the central account for the entire protocol.

use anchor_lang::prelude::*;

use super::enums_types::WinnerCounts;
use crate::constants::*;

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

    /// Dedicated fixed prize pool balance in USDC lamports.
    /// Tracks the 39.4% allocation from ticket sales earmarked for fixed prizes
    /// (Match 3/4/5). Previously this was implicit and prizes were paid from
    /// jackpot_balance, eroding the advertised jackpot.
    pub fixed_prize_balance: u64,

    /// Ticket price in USDC lamports
    pub ticket_price: u64,

    /// Current house fee in basis points (10000 = 100%)
    pub house_fee_bps: u16,

    /// Configurable jackpot display cap (UI only, NOT the rolldown trigger).
    /// The actual rolldown mechanics use `soft_cap` (probabilistic) and
    /// `hard_cap` (forced). Defaults to SOFT_CAP ($1.75M).
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

    /// Total prizes actually paid out via USDC transfers at claim time (lifetime).
    /// Incremented when real USDC leaves the prize pool, NOT at finalization time.
    pub total_prizes_paid: u64,

    /// Total prizes committed at finalization time (lifetime).
    /// Incremented during finalize_draw when prize amounts are calculated.
    /// May differ from total_prizes_paid due to unclaimed/expired tickets.
    pub total_prizes_committed: u64,

    /// Whether a draw is currently in progress (commit_randomness called)
    pub is_draw_in_progress: bool,

    /// Whether execute_draw has completed and the system is awaiting
    /// finalize_draw. Set true in execute_draw, cleared in finalize_draw.
    /// Prevents advance_draw/cancel_draw from skipping draws whose
    /// winning numbers are already publicly visible on-chain.
    pub is_awaiting_finalization: bool,

    /// Whether rolldown is active for the next draw
    pub is_rolldown_active: bool,

    /// Whether the lottery is paused
    pub is_paused: bool,

    /// Set to true once on initial seed funding. Never cleared afterward.
    /// New-cycle solvency is checked via `jackpot_balance >= seed_amount`,
    /// NOT via this flag. This flag gates initial ticket sales only.
    pub is_funded: bool,

    /// Protocol version. Incremented on breaking changes. Clients should
    /// check this to detect incompatible state layouts.
    pub version: u8,

    /// PDA bump seed
    pub bump: u8,

    // ==========================================================================
    // TIMELOCK FIELDS (Issue 5 fix: governance delay for config changes)
    // ==========================================================================
    /// Unix timestamp when a pending config change becomes effective.
    /// 0 means no pending config change. Config updates are proposed first,
    /// then can only be executed after this timestamp (minimum 24-hour delay).
    pub config_timelock_end: i64,

    /// SHA256 hash of the pending config change parameters.
    /// Used to verify that the executed config matches what was proposed.
    /// Zero hash means no pending config change.
    pub pending_config_hash: [u8; 32],

    // ==========================================================================
    // EMERGENCY TRANSFER AGGREGATE TRACKING (Issue 5 fix)
    // ==========================================================================
    /// Cumulative amount transferred via emergency_fund_transfer (PrizePool source)
    /// within the current rolling window. Reset when a new window starts.
    pub emergency_transfer_total: u64,

    /// Unix timestamp marking the start of the current emergency transfer rolling window.
    /// Window duration is 24 hours. When a new transfer exceeds the window,
    /// the total resets. Prevents unlimited repeated small drains.
    pub emergency_transfer_window_start: i64,

    /// Maximum tickets allowed during a rolldown draw (0 = unlimited).
    /// Prevents per-winner prizes from becoming microscopic during extreme
    /// volume events. Default 0 (no limit) preserves backward compatibility.
    pub max_rolldown_tickets: u64,

    /// Sale target: advance_draw triggers when current_draw_tickets >= this value
    /// AND MIN_DRAW_INTERVAL has elapsed. 0 = disabled (time-only mode).
    pub sale_target_tickets: u64,
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
    /// # Arguments
    /// * `reset_tickets` - If true, also resets `current_draw_tickets` to 0.
    ///   Set to `true` when finalizing or advancing a draw.
    ///   Set to `false` when cancelling a draw (preserves tickets for reschedule).
    ///
    /// FIXED: Does NOT reset pending_authority - authority transfer is independent
    /// of draw state and should persist across draw resets.
    pub fn reset_draw_state(&mut self, reset_tickets: bool) {
        self.is_draw_in_progress = false;
        self.is_awaiting_finalization = false;
        self.is_rolldown_active = false;
        self.commit_slot = 0;
        self.commit_timestamp = 0;
        self.current_randomness_account = Pubkey::default();
        if reset_tickets {
            self.current_draw_tickets = 0;
        }
    }

    /// Check if jackpot is properly funded (meets minimum seed amount)
    /// Returns true if jackpot >= minimum required amount
    /// Minimum is either seed_amount or a reasonable fraction of it
    pub fn is_jackpot_properly_funded(&self) -> bool {
        // Minimum jackpot should be at least 100% of seed amount
        let minimum_jackpot = self.seed_amount;

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

    /// Get available prize pool balance (jackpot + reserve + fixed_prize + insurance)
    pub fn get_available_prize_pool(&self) -> u64 {
        self.jackpot_balance
            .saturating_add(self.reserve_balance)
            .saturating_add(self.fixed_prize_balance)
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

        // First check: can we pay from jackpot + reserve + fixed_prize_balance alone?
        let primary_funds = self
            .jackpot_balance
            .saturating_add(self.reserve_balance)
            .saturating_add(self.fixed_prize_balance);

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
    /// 1. Use fixed_prize_balance first (dedicated fixed prize pool)
    /// 2. Use jackpot balance second
    /// 3. Use reserve balance third
    /// 4. Use insurance balance last (emergency only)
    pub fn calculate_fund_usage(&self, total_required: u64) -> (u64, u64, u64, u64) {
        let mut remaining = total_required;

        // Use fixed_prize_balance first (dedicated 39.4% allocation)
        let from_fixed = remaining.min(self.fixed_prize_balance);
        remaining = remaining.saturating_sub(from_fixed);

        // Use jackpot second
        let from_jackpot = remaining.min(self.jackpot_balance);
        remaining = remaining.saturating_sub(from_jackpot);

        // Use reserve third
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
