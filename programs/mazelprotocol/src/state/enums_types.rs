//! MazelProtocol - Enums and Helper Types
//!
//! Contains enums (RolldownType, MatchTier, PrizeMode), WinnerCounts,
//! and parameter structs for ticket purchases.

use anchor_lang::prelude::*;

/// Rolldown type enumeration
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Default)]
#[non_exhaustive]
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
#[non_exhaustive]
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
#[non_exhaustive]
pub enum PrizeMode {
    /// Fixed prizes (normal mode)
    #[default]
    Fixed,
    /// Pari-mutuel prizes (rolldown mode or high volume)
    PariMutuel,
}

/// Syndicate statistics for display
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default)]
pub struct SyndicateStats {
    /// Number of members
    pub member_count: u32,
    /// Total USDC contributed
    pub total_contribution: u64,
    /// Manager fee in basis points
    pub manager_fee_bps: u16,
    /// Whether syndicate is public
    pub is_public: bool,
}

/// Member statistics for display
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default)]
pub struct MemberStats {
    /// USDC contributed
    pub contribution: u64,
    /// Share percentage in basis points
    pub share_percentage_bps: u16,
    /// Estimated current share value
    pub estimated_share: u64,
    /// Join timestamp
    pub join_timestamp: i64,
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
