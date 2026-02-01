//! SolanaLotto Protocol - State Structures
//!
//! This module defines all account structures (state) for the lottery protocol,
//! including the main lottery state, draw results, tickets, user stats, and syndicates.

use anchor_lang::prelude::*;

use crate::constants::*;

// ============================================================================
// CORE STATE STRUCTURES
// ============================================================================

/// Main lottery state account - stores all global lottery configuration and state
#[account]
#[derive(Default)]
pub struct LotteryState {
    /// Admin authority (multi-sig wallet recommended)
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

    /// Slot when current randomness was committed
    pub commit_slot: u64,

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

    /// PDA bump seed
    pub bump: u8,
}

impl LotteryState {
    pub const LEN: usize = LOTTERY_STATE_SIZE;

    /// Check if ticket sales are open for the current draw
    pub fn is_ticket_sale_open(&self, current_timestamp: i64) -> bool {
        !self.is_paused
            && !self.is_draw_in_progress
            && current_timestamp < self.next_draw_timestamp - TICKET_SALE_CUTOFF
    }

    /// Calculate current house fee based on jackpot level
    pub fn get_current_house_fee_bps(&self) -> u16 {
        calculate_house_fee_bps(self.jackpot_balance, self.is_rolldown_active)
    }

    /// Check if rolldown should be triggered
    pub fn should_trigger_rolldown(&self) -> bool {
        self.jackpot_balance >= self.hard_cap
    }

    /// Calculate rolldown probability
    pub fn get_rolldown_probability_bps(&self) -> u16 {
        calculate_rolldown_probability_bps(self.jackpot_balance)
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

    /// PDA bump seed
    pub bump: u8,
}

impl DrawResult {
    pub const LEN: usize = DRAW_RESULT_SIZE;

    /// Get prize amount for a given match count
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

/// User statistics account - tracks player history and achievements
#[account]
#[derive(Default)]
pub struct UserStats {
    /// User wallet address
    pub wallet: Pubkey,

    /// Total tickets purchased (lifetime)
    pub total_tickets: u64,

    /// Total USDC spent
    pub total_spent: u64,

    /// Total USDC won
    pub total_won: u64,

    /// Current consecutive draw streak
    pub current_streak: u32,

    /// Best streak achieved
    pub best_streak: u32,

    /// Number of jackpot wins
    pub jackpot_wins: u32,

    /// Last draw user participated in
    pub last_draw_participated: u64,

    /// PDA bump seed
    pub bump: u8,
}

impl UserStats {
    pub const LEN: usize = USER_STATS_SIZE;

    /// Update streak based on current draw
    pub fn update_streak(&mut self, current_draw_id: u64) {
        if self.last_draw_participated == current_draw_id - 1 {
            self.current_streak += 1;
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
            crate::errors::LottoError::SyndicateFull
        );

        // Check if already a member
        for member in &self.members {
            require!(
                member.wallet != wallet,
                crate::errors::LottoError::AlreadySyndicateMember
            );
        }

        self.members.push(SyndicateMember {
            wallet,
            contribution,
            share_percentage_bps: 0, // Will be calculated
        });
        self.total_contribution += contribution;
        self.member_count += 1;

        // Recalculate shares
        self.recalculate_shares();

        Ok(())
    }

    /// Recalculate member shares based on contributions
    pub fn recalculate_shares(&mut self) {
        if self.total_contribution == 0 {
            return;
        }

        for member in &mut self.members {
            member.share_percentage_bps = ((member.contribution as u128 * BPS_DENOMINATOR as u128)
                / self.total_contribution as u128) as u16;
        }
    }

    /// Find a member by wallet address
    pub fn find_member(&self, wallet: &Pubkey) -> Option<&SyndicateMember> {
        self.members.iter().find(|m| m.wallet == *wallet)
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
