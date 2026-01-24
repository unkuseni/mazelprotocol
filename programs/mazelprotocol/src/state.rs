//! State structures for SolanaLotto Protocol
//!
//! This module defines the core data structures used by the lottery protocol:
//! - `LotteryState`: Global lottery configuration and statistics
//! - `TicketData`: Individual ticket information
//! - `DrawResult`: Historical draw results
//! - `UserStats`: Player statistics and streaks
//! - `Syndicate`: Group playing structure
//! - `StakeAccount`: $LOTTO token staking information

use crate::constants::*;
use anchor_lang::prelude::*;

// ============================================================================
// Core State Structures
// ============================================================================

/// Global lottery state and configuration (singleton)
#[account]
pub struct LotteryState {
    /// Admin authority (multi-sig wallet)
    pub authority: Pubkey,

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

    /// Insurance fund for guaranteed payouts
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

    /// Slot when current randomness was committed
    pub commit_slot: u64,

    /// Whether a draw is currently in progress
    pub is_draw_in_progress: bool,

    /// Whether rolldown is active for the next draw
    pub is_rolldown_active: bool,

    /// Whether the lottery is paused
    pub is_paused: bool,

    /// PDA bump seed
    pub bump: u8,
}

impl LotteryState {
    /// Calculate account size for initialization
    pub const LEN: usize = LOTTERY_STATE_SIZE;

    /// Initialize a new lottery state with default values
    pub fn new(
        authority: Pubkey,
        switchboard_queue: Pubkey,
        ticket_price: u64,
        jackpot_cap: u64,
        seed_amount: u64,
        soft_cap: u64,
        hard_cap: u64,
        bump: u8,
    ) -> Self {
        let now = Clock::get().unwrap().unix_timestamp;

        Self {
            authority,
            switchboard_queue,
            current_randomness_account: Pubkey::default(),
            current_draw_id: 0,
            jackpot_balance: seed_amount,
            reserve_balance: 0,
            insurance_balance: 0,
            ticket_price,
            house_fee_bps: FEE_TIER_1_BPS, // Start with lowest fee
            jackpot_cap,
            seed_amount,
            soft_cap,
            hard_cap,
            next_draw_timestamp: now + DRAW_INTERVAL,
            commit_slot: 0,
            is_draw_in_progress: false,
            is_rolldown_active: false,
            is_paused: false,
            bump,
        }
    }

    /// Update house fee based on current jackpot balance
    pub fn update_house_fee(&mut self) {
        self.house_fee_bps = calculate_house_fee_bps(self.jackpot_balance, self.is_rolldown_active);
    }

    /// Check if it's time for the next draw
    pub fn is_draw_time(&self) -> bool {
        let now = Clock::get().unwrap().unix_timestamp;
        now >= self.next_draw_timestamp && !self.is_draw_in_progress && !self.is_paused
    }

    /// Start a new draw cycle
    pub fn start_draw(&mut self) {
        self.current_draw_id += 1;
        self.is_draw_in_progress = true;
        self.commit_slot = Clock::get().unwrap().slot;
    }

    /// Complete a draw cycle
    pub fn complete_draw(&mut self) {
        self.is_draw_in_progress = false;
        self.next_draw_timestamp += DRAW_INTERVAL;
    }

    /// Calculate if rolldown should trigger
    pub fn should_trigger_rolldown(&self, random_value: u64) -> bool {
        should_probabilistic_rolldown(self.jackpot_balance, random_value)
    }
}

// ============================================================================
// Ticket Data Structures
// ============================================================================

/// Wrapper for lottery numbers with validation
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct LotteryNumbers([u8; NUMBERS_PER_TICKET]);

impl LotteryNumbers {
    /// Create new validated lottery numbers
    pub fn new(numbers: [u8; NUMBERS_PER_TICKET]) -> Result<Self> {
        require!(
            validate_lottery_numbers(&numbers),
            crate::errors::ErrorCode::InvalidNumbers
        );

        // Sort numbers for consistency
        let mut sorted_numbers = numbers;
        sorted_numbers.sort();

        Ok(Self(sorted_numbers))
    }

    /// Get the underlying numbers array
    pub fn numbers(&self) -> [u8; NUMBERS_PER_TICKET] {
        self.0
    }

    /// Calculate match count with winning numbers
    pub fn calculate_match_count(&self, winning_numbers: &[u8; NUMBERS_PER_TICKET]) -> u8 {
        calculate_match_count(&self.0, winning_numbers)
    }

    /// Check if numbers are valid (helper method)
    pub fn is_valid(&self) -> bool {
        validate_lottery_numbers(&self.0)
    }
}

/// Individual ticket data
#[account]
pub struct TicketData {
    /// Wallet that owns this ticket
    pub owner: Pubkey,

    /// Draw ID this ticket is for
    pub draw_id: u64,

    /// Selected lottery numbers
    pub numbers: LotteryNumbers,

    /// Unix timestamp when ticket was purchased
    pub purchase_timestamp: i64,

    /// Whether prize has been claimed
    pub is_claimed: bool,

    /// Number of matching numbers (calculated after draw)
    pub match_count: u8,

    /// Prize amount in USDC lamports
    pub prize_amount: u64,

    /// Optional syndicate wallet (if playing as part of a group)
    pub syndicate: Option<Pubkey>,
}

impl TicketData {
    /// Calculate account size for initialization
    pub const LEN: usize = TICKET_SIZE;

    /// Create a new ticket
    pub fn new(
        owner: Pubkey,
        draw_id: u64,
        numbers: LotteryNumbers,
        syndicate: Option<Pubkey>,
    ) -> Self {
        let now = Clock::get().unwrap().unix_timestamp;

        Self {
            owner,
            draw_id,
            numbers,
            purchase_timestamp: now,
            is_claimed: false,
            match_count: 0,
            prize_amount: 0,
            syndicate,
        }
    }

    /// Calculate match tier for this ticket
    pub fn match_tier(&self) -> MatchTier {
        match self.match_count {
            6 => MatchTier::Match6,
            5 => MatchTier::Match5,
            4 => MatchTier::Match4,
            3 => MatchTier::Match3,
            2 => MatchTier::Match2,
            _ => MatchTier::NoMatch,
        }
    }

    /// Check if ticket is a winner
    pub fn is_winner(&self) -> bool {
        self.match_count >= 2
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
    /// For single tickets, this is the actual ticket ID
    /// For multiple tickets, tickets are numbered sequentially from this ID
    pub start_ticket_id: u64,

    /// Number of tickets in this account
    pub ticket_count: u32,

    /// Array of lottery numbers (one per ticket)
    /// Length must equal ticket_count
    pub numbers: Vec<LotteryNumbers>,

    /// Unix timestamp when tickets were purchased
    pub purchase_timestamp: i64,

    /// Optional syndicate wallet
    pub syndicate: Option<Pubkey>,
}

impl UnifiedTicket {
    /// Calculate account size for initialization
    pub fn size_for_count(ticket_count: usize) -> usize {
        8 + // discriminator
        32 + // owner
        8 + // draw_id
        8 + // start_ticket_id
        4 + // ticket_count
        4 + // numbers vector length
        (ticket_count * 6) + // numbers data (6 bytes each)
        8 + // purchase_timestamp
        33 // syndicate (Option<Pubkey>)
    }
}

// ============================================================================
// Draw Result Structures
// ============================================================================

/// Results of a completed draw
#[account]
pub struct DrawResult {
    /// Draw identifier
    pub draw_id: u64,

    /// Winning numbers for this draw
    pub winning_numbers: [u8; NUMBERS_PER_TICKET],

    /// Switchboard VRF proof for randomness verification
    pub vrf_proof: [u8; 64],

    /// Unix timestamp when draw was completed
    pub timestamp: i64,

    /// Total tickets sold for this draw
    pub total_tickets: u64,

    /// Whether this was a rolldown draw
    pub was_rolldown: bool,

    /// Number of Match 6 winners (Jackpot)
    pub match_6_winners: u32,

    /// Number of Match 5 winners
    pub match_5_winners: u32,

    /// Number of Match 4 winners
    pub match_4_winners: u32,

    /// Number of Match 3 winners
    pub match_3_winners: u32,

    /// Prize per Match 6 winner (if any)
    pub match_6_prize_per_winner: u64,

    /// Prize per Match 5 winner
    pub match_5_prize_per_winner: u64,

    /// Prize per Match 4 winner
    pub match_4_prize_per_winner: u64,

    /// Prize per Match 3 winner
    pub match_3_prize_per_winner: u64,
}

impl DrawResult {
    /// Calculate account size for initialization
    pub const LEN: usize = DRAW_RESULT_SIZE;

    /// Create a new draw result
    pub fn new(
        draw_id: u64,
        winning_numbers: [u8; NUMBERS_PER_TICKET],
        vrf_proof: [u8; 64],
        total_tickets: u64,
        was_rolldown: bool,
    ) -> Self {
        let now = Clock::get().unwrap().unix_timestamp;

        Self {
            draw_id,
            winning_numbers,
            vrf_proof,
            timestamp: now,
            total_tickets,
            was_rolldown,
            match_6_winners: 0,
            match_5_winners: 0,
            match_4_winners: 0,
            match_3_winners: 0,
            match_6_prize_per_winner: 0,
            match_5_prize_per_winner: 0,
            match_4_prize_per_winner: 0,
            match_3_prize_per_winner: 0,
        }
    }

    /// Calculate prize for a given match count
    pub fn calculate_prize(&self, match_count: u8) -> u64 {
        match match_count {
            6 => self.match_6_prize_per_winner,
            5 => self.match_5_prize_per_winner,
            4 => self.match_4_prize_per_winner,
            3 => self.match_3_prize_per_winner,
            _ => 0,
        }
    }

    /// Check if there were any jackpot winners
    pub fn has_jackpot_winner(&self) -> bool {
        self.match_6_winners > 0
    }
}

/// Winner counts for a draw (used during processing)
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct WinnerCounts {
    pub match_6: u32,
    pub match_5: u32,
    pub match_4: u32,
    pub match_3: u32,
    pub match_2: u32,
}

impl Default for WinnerCounts {
    fn default() -> Self {
        Self {
            match_6: 0,
            match_5: 0,
            match_4: 0,
            match_3: 0,
            match_2: 0,
        }
    }
}

// ============================================================================
// Player Statistics
// ============================================================================

/// Player statistics and streak tracking
#[account]
pub struct UserStats {
    /// Player's wallet address
    pub wallet: Pubkey,

    /// Total tickets purchased (lifetime)
    pub total_tickets: u64,

    /// Total USDC spent (lifetime)
    pub total_spent: u64,

    /// Total USDC won (lifetime)
    pub total_won: u64,

    /// Current streak of consecutive draws played
    pub current_streak: u64,

    /// Best streak of consecutive draws played
    pub best_streak: u64,

    /// Number of jackpot wins (Match 6)
    pub jackpot_wins: u32,

    /// Last draw ID this player participated in
    pub last_draw_participated: u64,
}

impl UserStats {
    /// Calculate account size for initialization
    pub const LEN: usize = USER_STATS_SIZE;

    /// Create new user stats
    pub fn new(wallet: Pubkey) -> Self {
        Self {
            wallet,
            total_tickets: 0,
            total_spent: 0,
            total_won: 0,
            current_streak: 0,
            best_streak: 0,
            jackpot_wins: 0,
            last_draw_participated: 0,
        }
    }

    /// Update stats after ticket purchase
    pub fn update_purchase(&mut self, draw_id: u64, ticket_count: u64, amount_spent: u64) {
        self.total_tickets += ticket_count;
        self.total_spent += amount_spent;

        // Update streak
        if draw_id > self.last_draw_participated + 1 {
            // Streak broken
            self.current_streak = 1;
        } else {
            self.current_streak += 1;
        }

        // Update best streak
        if self.current_streak > self.best_streak {
            self.best_streak = self.current_streak;
        }

        self.last_draw_participated = draw_id;
    }

    /// Update stats after prize win
    pub fn update_win(&mut self, amount_won: u64, is_jackpot: bool) {
        self.total_won += amount_won;
        if is_jackpot {
            self.jackpot_wins += 1;
        }
    }

    /// Calculate player's net profit/loss
    pub fn net_profit(&self) -> i128 {
        self.total_won as i128 - self.total_spent as i128
    }

    /// Calculate player's ROI (Return on Investment)
    pub fn roi(&self) -> f64 {
        if self.total_spent == 0 {
            0.0
        } else {
            (self.total_won as f64 - self.total_spent as f64) / self.total_spent as f64
        }
    }
}

// ============================================================================
// Syndicate System
// ============================================================================

/// Syndicate member information
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct SyndicateMember {
    /// Member's wallet address
    pub wallet: Pubkey,

    /// Total contribution in USDC
    pub contribution: u64,

    /// Share percentage in basis points (10000 = 100%)
    pub share_percentage_bps: u64,
}

/// Group playing structure (syndicate)
#[account]
pub struct Syndicate {
    /// Creator's wallet address
    pub creator: Pubkey,

    /// Unique syndicate identifier
    pub syndicate_id: u64,

    /// Syndicate name (32 bytes max)
    pub name: [u8; 32],

    /// Whether syndicate is public (joinable)
    pub is_public: bool,

    /// Number of members
    pub member_count: u32,

    /// Total contribution from all members
    pub total_contribution: u64,

    /// Manager fee in basis points (10000 = 100%)
    pub manager_fee_bps: u16,

    /// List of syndicate members
    pub members: Vec<SyndicateMember>,
}

impl Syndicate {
    /// Calculate account size for initialization
    pub fn size_for_member_count(member_count: usize) -> usize {
        SYNDICATE_BASE_SIZE + (member_count * SYNDICATE_MEMBER_SIZE)
    }

    /// Add a new member to the syndicate
    pub fn add_member(&mut self, wallet: Pubkey, contribution: u64) -> Result<()> {
        require!(
            self.member_count < MAX_SYNDICATE_MEMBERS as u32,
            crate::errors::ErrorCode::SyndicateFull
        );

        // Calculate share percentage based on contribution
        let share_percentage_bps = if self.total_contribution == 0 {
            10_000 // First member gets 100%
        } else {
            (contribution as u128 * 10_000u128 / self.total_contribution as u128) as u64
        };

        self.members.push(SyndicateMember {
            wallet,
            contribution,
            share_percentage_bps,
        });

        self.member_count += 1;
        self.total_contribution += contribution;

        Ok(())
    }

    /// Calculate member's share of a prize
    pub fn calculate_member_share(&self, wallet: &Pubkey, total_prize: u64) -> Option<u64> {
        for member in &self.members {
            if &member.wallet == wallet {
                // Apply manager fee
                let after_fee = total_prize
                    - (total_prize as u128 * self.manager_fee_bps as u128 / 10_000) as u64;

                // Calculate member's share
                let share =
                    (after_fee as u128 * member.share_percentage_bps as u128 / 10_000) as u64;
                return Some(share);
            }
        }
        None
    }
}

// ============================================================================
// Staking System
// ============================================================================

/// $LOTTO token staking account
#[account]
pub struct StakeAccount {
    /// Owner's wallet address
    pub owner: Pubkey,

    /// Amount of $LOTTO tokens staked
    pub staked_amount: u64,

    /// Unix timestamp when staking began
    pub stake_timestamp: i64,

    /// Current stake tier
    pub tier: StakeTier,

    /// Pending rewards to be claimed
    pub pending_rewards: u64,

    /// Unix timestamp of last reward claim
    pub last_claim_timestamp: i64,
}

impl StakeAccount {
    /// Calculate account size for initialization
    pub const LEN: usize = STAKE_ACCOUNT_SIZE;

    /// Create new stake account
    pub fn new(owner: Pubkey) -> Self {
        let now = Clock::get().unwrap().unix_timestamp;

        Self {
            owner,
            staked_amount: 0,
            stake_timestamp: now,
            tier: StakeTier::None,
            pending_rewards: 0,
            last_claim_timestamp: now,
        }
    }

    /// Update stake amount and recalculate tier
    pub fn update_stake(&mut self, new_amount: u64) {
        self.staked_amount = new_amount;
        self.tier = get_stake_tier(new_amount);

        if new_amount > 0 && self.stake_timestamp == 0 {
            self.stake_timestamp = Clock::get().unwrap().unix_timestamp;
        }
    }

    /// Calculate rewards since last claim
    pub fn calculate_rewards(&self) -> u64 {
        if self.staked_amount == 0 || self.tier == StakeTier::None {
            return 0;
        }

        let now = Clock::get().unwrap().unix_timestamp;
        let seconds_elapsed = (now - self.last_claim_timestamp).max(0);

        // Convert reward rate from basis points per epoch to per second
        // Assuming 1 epoch = 1 day = 86400 seconds
        let reward_rate_bps = self.tier.get_reward_rate_bps();
        let reward_per_second_bps = reward_rate_bps as u128 / 86_400;

        (self.staked_amount as u128 * reward_per_second_bps as u128 * seconds_elapsed as u128
            / 10_000) as u64
    }

    /// Claim pending rewards
    pub fn claim_rewards(&mut self) -> u64 {
        let rewards = self.calculate_rewards();
        self.pending_rewards += rewards;
        let claimable = self.pending_rewards;

        self.pending_rewards = 0;
        self.last_claim_timestamp = Clock::get().unwrap().unix_timestamp;

        claimable
    }

    /// Get ticket discount percentage for this stake tier
    pub fn get_discount_bps(&self) -> u16 {
        self.tier.get_discount_bps()
    }
}
