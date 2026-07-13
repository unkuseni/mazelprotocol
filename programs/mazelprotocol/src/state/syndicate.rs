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
