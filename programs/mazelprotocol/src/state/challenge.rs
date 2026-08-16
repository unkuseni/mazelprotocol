//! MazelProtocol - Challenge Record Account
//!
//! Stores an on-chain dispute of a finalized draw's winner counts.
//!
//! # Challenge lifecycle
//! 1. `challenge_draw` (permissionless, bonded): any observer posts a
//!    `CHALLENGE_BOND` in USDC (escrowed in the insurance pool's token
//!    account) and records their alternative winner counts + evidence hash.
//!    Prize claims for the challenged draw are frozen (scoped block — the
//!    rest of the lottery keeps running).
//! 2. `resolve_challenge` (authority): upholds the challenge (bond refunded +
//!    `CHALLENGE_REWARD` paid from the insurance pool) or dismisses it (bond
//!    slashed to the insurance pool). Either way the draw's claims unfreeze.
//! 3. `release_challenge` (permissionless, after `CHALLENGE_RESOLUTION_TIMEOUT`):
//!    if the authority never resolves, anyone can release the draw with a
//!    neutral outcome (bond refunded, no reward, claims unfreeze).

use anchor_lang::prelude::*;

use super::enums_types::WinnerCounts;
use crate::constants::CHALLENGE_RECORD_SIZE;

/// A bonded dispute of a finalized draw's winner counts.
///
/// PDA seeds: `["challenge", draw_id.to_le_bytes(), challenger.key().as_ref()]`
#[account]
#[derive(Default)]
pub struct ChallengeRecord {
    /// The challenger (bond provider)
    pub challenger: Pubkey,

    /// The draw being disputed
    pub draw_id: u64,

    /// Bond amount posted (USDC lamports, held in the insurance pool)
    pub bond_amount: u64,

    /// The challenger's alternative (corrected) winner counts
    pub alternative_winner_counts: WinnerCounts,

    /// SHA256 hash of supporting off-chain evidence
    pub evidence_hash: [u8; 32],

    /// Unix timestamp when the challenge was filed
    pub timestamp: i64,

    /// Whether the challenge has been resolved (or released)
    pub resolved: bool,

    /// Resolution outcome: true = upheld (challenger was right),
    /// false = dismissed/neutral
    pub upheld: bool,

    /// PDA bump seed
    pub bump: u8,
}

impl ChallengeRecord {
    pub const LEN: usize = CHALLENGE_RECORD_SIZE;
}

#[cfg(test)]
mod tests {
    use super::*;
    use anchor_lang::AnchorSerialize;

    /// The hand-computed `CHALLENGE_RECORD_SIZE` must fit the actual Borsh
    /// layout (discriminator + serialized body), so account init can never
    /// fail due to a size mismatch when fields are added later.
    #[test]
    fn test_challenge_record_len_matches_serialized_size() {
        let record = ChallengeRecord {
            challenger: Pubkey::new_from_array([7u8; 32]),
            draw_id: 42,
            bond_amount: 100_000_000,
            alternative_winner_counts: WinnerCounts {
                match_6: 0,
                match_5: 2,
                match_4: 11,
                match_3: 120,
                match_2: 900,
            },
            evidence_hash: [9u8; 32],
            timestamp: 1_700_000_000,
            resolved: false,
            upheld: false,
            bump: 255,
        };

        let mut buf = Vec::new();
        record.serialize(&mut buf).unwrap();

        // 8-byte account discriminator + body.
        let required = 8 + buf.len();
        assert!(
            required <= CHALLENGE_RECORD_SIZE,
            "CHALLENGE_RECORD_SIZE ({}) too small for serialized size ({})",
            CHALLENGE_RECORD_SIZE,
            required
        );
    }
}
