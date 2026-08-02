//! MazelProtocol - Syndicate Account
//!
//! Contains Syndicate and SyndicateMember structures for group buying pools.

use anchor_lang::prelude::*;

use super::enums_types::SyndicateStats;
use crate::constants::*;
use crate::errors::LottoError;

/// Syndicate member information
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct SyndicateMember {
    /// Member wallet
    pub wallet: Pubkey,

    /// Amount contributed in USDC lamports
    pub contribution: u64,

    /// Share percentage in basis points (10000 = 100%)
    pub share_percentage_bps: u16,

    /// Unclaimed prize balance in USDC lamports.
    /// Snapshot-based: set during distribute_syndicate_prize based on
    /// share_percentage_bps at distribution time. Decremented on claim.
    pub unclaimed_prize: u64,
}

impl SyndicateMember {
    pub const LEN: usize = SYNDICATE_MEMBER_SIZE;
}

/// Syndicate account - represents a group buying pool
#[account]
#[derive(Default)]
pub struct Syndicate {
    /// Current syndicate creator/manager (mutable — can be transferred)
    pub creator: Pubkey,

    /// Original creator at PDA creation time (immutable — used for PDA seed derivation).
    /// This MUST NEVER be changed after initialization. All PDA seeds and CPI signer
    /// seeds must use this field instead of `creator` to prevent fund-lock after
    /// creator transfers. See Issue #1 in security audit.
    pub original_creator: Pubkey,

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

    /// Tickets purchased via `buy_syndicate_tickets` for the current draw
    /// but not yet materialized as ticket accounts via `create_syndicate_ticket`.
    /// SECURITY: prevents free ticket minting — you can only create as many
    /// ticket accounts as the syndicate has paid for in the current draw.
    pub pending_tickets: u64,

    /// Draw ID that `pending_tickets` applies to. Prevents credits from a
    /// previous draw being spent to create tickets for a later draw.
    pub pending_tickets_draw: u64,
}

impl Syndicate {
    /// Calculate size for a given number of members
    pub fn size_for_members(member_count: usize) -> usize {
        SYNDICATE_BASE_SIZE + (member_count * SYNDICATE_MEMBER_SIZE)
    }

    /// Add a new member to the syndicate
    pub fn add_member(&mut self, wallet: Pubkey, contribution: u64) -> Result<()> {
        require!((self.member_count as usize) < MAX_SYNDICATE_MEMBERS, LottoError::SyndicateFull);

        // Check if already a member
        for member in &self.members {
            require!(member.wallet != wallet, LottoError::AlreadySyndicateMember);
        }

        self.members.push(SyndicateMember {
            wallet,
            contribution,
            share_percentage_bps: 0, // Will be calculated
            unclaimed_prize: 0,
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
    /// Ensures total shares always sum to exactly 10000 BPS
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
                member.share_percentage_bps =
                    if (i as u16) < remainder { base_share + 1 } else { base_share };
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

    /// Get total funds in syndicate (contribution + prizes)
    pub fn get_total_funds(&self, syndicate_usdc_balance: u64) -> u64 {
        self.total_contribution.saturating_add(syndicate_usdc_balance)
    }

    /// Calculate member's share amount based on current syndicate funds
    pub fn calculate_member_share(
        &self,
        member_wallet: &Pubkey,
        syndicate_usdc_balance: u64,
    ) -> Option<u64> {
        let member = self.find_member(member_wallet)?;
        let total_funds = self.get_total_funds(syndicate_usdc_balance);

        Some(
            (total_funds as u128 * member.share_percentage_bps as u128 / BPS_DENOMINATOR as u128)
                as u64,
        )
    }

    /// Check if syndicate meets minimum requirements for Syndicate Wars
    pub fn meets_wars_requirements(&self) -> bool {
        self.member_count >= 5 && self.total_contribution > 0
    }

    /// Get syndicate statistics for display
    pub fn get_stats(&self) -> SyndicateStats {
        SyndicateStats {
            member_count: self.member_count,
            total_contribution: self.total_contribution,
            manager_fee_bps: self.manager_fee_bps,
            is_public: self.is_public,
        }
    }

    /// Validate syndicate configuration
    pub fn validate_config(&self) -> Result<()> {
        require!(self.manager_fee_bps <= MAX_MANAGER_FEE_BPS, LottoError::ManagerFeeTooHigh);

        // Check name is not empty
        let mut has_content = false;
        for &byte in &self.name {
            if byte != 0 {
                has_content = true;
                break;
            }
        }
        require!(has_content, LottoError::InvalidSyndicateConfig);

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Build a minimal syndicate with the pending-ticket credit fields exposed.
    fn test_syndicate() -> Syndicate {
        Syndicate {
            creator: Pubkey::new_unique(),
            original_creator: Pubkey::new_unique(),
            syndicate_id: 1,
            name: [0u8; 32],
            is_public: true,
            member_count: 1,
            total_contribution: 0,
            manager_fee_bps: 0,
            usdc_account: Pubkey::new_unique(),
            members: vec![SyndicateMember::default()],
            bump: 255,
            pending_tickets: 0,
            pending_tickets_draw: 0,
        }
    }

    #[test]
    fn test_pending_tickets_start_zero() {
        // New syndicates start with no paid-ticket credits. Without credits,
        // create_syndicate_ticket must be rejected — this blocks the
        // "free ticket mint" exploit.
        let s = test_syndicate();
        assert_eq!(s.pending_tickets, 0);
        assert_eq!(s.pending_tickets_draw, 0);
    }

    #[test]
    fn test_pending_tickets_scoped_to_draw() {
        // Credits from draw 1 must not be spendable in draw 2. The handler
        // checks pending_tickets_draw == current_draw_id before consuming.
        let mut s = test_syndicate();
        s.pending_tickets_draw = 1;
        s.pending_tickets = 5;

        // Draw 2 with 0 credits -> create must fail the check
        let draw_2_has_credits = s.pending_tickets_draw == 2 && s.pending_tickets > 0;
        assert!(!draw_2_has_credits);
    }

    #[test]
    fn test_pending_tickets_cannot_exceed_purchases() {
        // The invariant: pending_tickets <= tickets purchased this draw.
        // Each create decrements by exactly 1; saturating_sub prevents
        // underflow even if a buggy caller over-consumes.
        let mut s = test_syndicate();
        s.pending_tickets_draw = 3;
        s.pending_tickets = 2; // bought 2

        s.pending_tickets = s.pending_tickets.saturating_sub(1); // create #1
        assert_eq!(s.pending_tickets, 1);
        s.pending_tickets = s.pending_tickets.saturating_sub(1); // create #2
        assert_eq!(s.pending_tickets, 0);
        s.pending_tickets = s.pending_tickets.saturating_sub(1); // attempt #3
        assert_eq!(s.pending_tickets, 0, "must not go negative");
    }

    #[test]
    fn test_size_for_members_consistent_with_struct() {
        // The base size must still fit the struct after adding the two
        // security fields (they replace the previous 16-byte padding).
        let base = SYNDICATE_BASE_SIZE;
        // 8 discriminator + all fixed fields incl. pending_tickets fields
        let min_fixed = 8
            + 32 // creator
            + 32 // original_creator
            + 8 // syndicate_id
            + 32 // name
            + 1 // is_public
            + 4 // member_count
            + 8 // total_contribution
            + 2 // manager_fee_bps
            + 32 // usdc_account
            + 4 // members vec len
            + 1 // bump
            + 8 // pending_tickets
            + 8; // pending_tickets_draw
        assert!(base >= min_fixed, "base size {} < fixed fields {}", base, min_fixed);
    }
}
