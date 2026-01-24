# SolanaLotto Technical Specification

## Version 1.0.0

---

## Table of Contents

1. [Overview](#1-overview)
2. [System Requirements](#2-system-requirements)
3. [Architecture](#3-architecture)
4. [Smart Contract Specifications](#4-smart-contract-specifications)
5. [Data Structures](#5-data-structures)
6. [Instructions Reference](#6-instructions-reference)
7. [Events](#7-events)
8. [Error Codes](#8-error-codes)
9. [Integration Guide](#9-integration-guide)
10. [Testing](#10-testing)
11. [Deployment](#11-deployment)
12. [Appendix](#12-appendix)

---

## 1. Overview

### 1.1 Purpose

This document provides the complete technical specification for implementing, integrating with, and deploying the SolanaLotto protocol. It is intended for:

- Smart contract developers
- Frontend/backend engineers
- Third-party integrators
- Security auditors

### 1.2 Scope

The specification covers:

- Solana program architecture
- Account structures and PDAs
- Instruction definitions
- Client SDK interfaces
- Integration patterns
- Security requirements

### 1.3 Conventions

```
Types:
- u8, u16, u32, u64, u128: Unsigned integers
- i64: Signed 64-bit integer (timestamps)
- Pubkey: 32-byte public key
- [T; N]: Fixed-size array of N elements of type T
- Vec<T>: Variable-length vector
- Option<T>: Optional value (None or Some(T))
- bool: Boolean (true/false)

Amounts:
- All USDC amounts in lamports (6 decimals): $1.00 = 1,000,000
- All SOL amounts in lamports (9 decimals): 1 SOL = 1,000,000,000
- All $LOTTO amounts in lamports (9 decimals): 1 LOTTO = 1,000,000,000
```

---

## 2. System Requirements

### 2.1 Runtime Environment

| Component | Requirement |
|-----------|-------------|
| **Solana Runtime** | v1.17+ |
| **BPF Loader** | Upgradeable Loader v3 |
| **Compute Budget** | 400,000 CU per instruction (max) |
| **Account Size** | Variable (see individual accounts) |

### 2.2 Dependencies

```toml
[dependencies]
anchor-lang = "0.29.0"
anchor-spl = "0.29.0"
solana-program = "1.17.0"
spl-token = "4.0.0"
spl-associated-token-account = "2.2.0"

[dev-dependencies]
solana-program-test = "1.17.0"
solana-sdk = "1.17.0"
```

### 2.3 External Services

| Service | Purpose | Provider |
|---------|---------|----------|
| **VRF Oracle** | Verifiable randomness | Switchboard / Chainlink |
| **Price Feed** | USDC/USD verification | Pyth Network |
| **Indexer** | Historical data queries | Custom (Geyser plugin) |

---

## 3. Architecture

### 3.1 Program Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        SOLANALOTTO PROGRAM                           │
│                      Program ID: LOTTO...xxxx                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                      INSTRUCTION ROUTER                      │   │
│  └───────────────────────────┬─────────────────────────────────┘   │
│                              │                                       │
│     ┌────────────────────────┼────────────────────────┐             │
│     │                        │                        │             │
│     ▼                        ▼                        ▼             │
│  ┌──────────┐         ┌──────────┐         ┌──────────┐            │
│  │  TICKET  │         │   DRAW   │         │  PRIZE   │            │
│  │  MODULE  │         │  MODULE  │         │  MODULE  │            │
│  │          │         │          │         │          │            │
│  │ • buy    │         │ • init   │         │ • claim  │            │
│  │ • bulk   │         │ • request│         │ • redeem │            │
│  │ • cancel │         │ • execute│         │ • auto   │            │
│  └──────────┘         └──────────┘         └──────────┘            │
│                                                                      │
│  ┌──────────┐         ┌──────────┐         ┌──────────┐            │
│  │  TOKEN   │         │   GOV    │         │ SYNDICATE│            │
│  │  MODULE  │         │  MODULE  │         │  MODULE  │            │
│  │          │         │          │         │          │            │
│  │ • stake  │         │ • propose│         │ • create │            │
│  │ • unstake│         │ • vote   │         │ • join   │            │
│  │ • claim  │         │ • execute│         │ • leave  │            │
│  └──────────┘         └──────────┘         └──────────┘            │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 Account Hierarchy

```
LotteryState (PDA: ["lottery"])
├── Config
│   ├── ticket_price: u64
│   ├── house_fee_bps: u16
│   ├── jackpot_cap: u64
│   ├── seed_amount: u64
│   └── draw_interval: i64
│
├── Balances
│   ├── jackpot_balance: u64
│   ├── reserve_balance: u64
│   └── insurance_balance: u64
│
├── Counters
│   ├── current_draw_id: u64
│   ├── total_tickets_sold: u64
│   └── total_prizes_paid: u64
│
└── Timestamps
    ├── last_draw_timestamp: i64
    └── next_draw_timestamp: i64

DrawResult (PDA: ["draw", draw_id])
├── draw_id: u64
├── winning_numbers: [u8; 6]
├── vrf_proof: [u8; 64]
├── timestamp: i64
├── was_rolldown: bool
├── winner_counts: WinnerCounts
└── prize_amounts: PrizeAmounts

Ticket (PDA: ["ticket", draw_id, ticket_index])
├── owner: Pubkey
├── draw_id: u64
├── numbers: [u8; 6]
├── purchase_timestamp: i64
├── is_claimed: bool
├── match_count: u8
└── prize_amount: u64

UserStats (PDA: ["user", wallet])
├── wallet: Pubkey
├── total_tickets: u64
├── total_spent: u64
├── total_won: u64
├── current_streak: u32
├── longest_streak: u32
└── last_draw_participated: u64

LuckyNumbersNFT (PDA: ["lucky_numbers", mint])
├── mint: Pubkey
├── owner: Pubkey
├── numbers: [u8; 6]
├── original_draw_id: u64
├── original_match_tier: u8
├── total_bonuses_claimed: u64
├── jackpot_hits: u32
└── is_active: bool

SecondChanceEntry (PDA: ["second_chance", week_id, ticket])
├── ticket: Pubkey
├── player: Pubkey
├── week_id: u64
└── entry_count: u32

QuickPickState (PDA: ["quick_pick"])
├── current_draw: u64
├── ticket_price: u64
├── next_draw_timestamp: i64
├── prize_pool_balance: u64
└── is_paused: bool

SyndicateWarsEntry (PDA: ["syndicate_wars", month, syndicate])
├── syndicate: Pubkey
├── month: u64
├── tickets_purchased: u64
├── prizes_won: u64
├── win_rate: u64
└── final_rank: Option<u32>

Syndicate (PDA: ["syndicate", creator, syndicate_id])
├── creator: Pubkey
├── syndicate_id: u64
├── name: [u8; 32]
├── is_public: bool
├── member_count: u32
├── total_contribution: u64
├── manager_fee_bps: u16
└── members: Vec<SyndicateMember>

StakeAccount (PDA: ["stake", wallet])
├── owner: Pubkey
├── staked_amount: u64
├── stake_timestamp: i64
├── tier: StakeTier
├── pending_rewards: u64
└── last_claim_timestamp: i64
```

### 3.3 PDA Derivation

```rust
// Lottery State (singleton)
pub fn lottery_state_pda() -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[b"lottery"],
        &PROGRAM_ID
    )
}

// Draw Result
pub fn draw_result_pda(draw_id: u64) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[b"draw", &draw_id.to_le_bytes()],
        &PROGRAM_ID
    )
}

// Ticket
pub fn ticket_pda(draw_id: u64, ticket_index: u64) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[
            b"ticket",
            &draw_id.to_le_bytes(),
            &ticket_index.to_le_bytes()
        ],
        &PROGRAM_ID
    )
}

// User Stats
pub fn user_stats_pda(wallet: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[b"user", wallet.as_ref()],
        &PROGRAM_ID
    )
}

// Syndicate
pub fn syndicate_pda(creator: &Pubkey, syndicate_id: u64) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[
            b"syndicate",
            creator.as_ref(),
            &syndicate_id.to_le_bytes()
        ],
        &PROGRAM_ID
    )
}

// Stake Account
pub fn stake_account_pda(wallet: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[b"stake", wallet.as_ref()],
        &PROGRAM_ID
    )
}

// Prize Pool USDC ATA
pub fn prize_pool_usdc_pda() -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[b"prize_pool_usdc"],
        &PROGRAM_ID
    )
}

// House Fee USDC ATA
pub fn house_fee_usdc_pda() -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[b"house_fee_usdc"],
        &PROGRAM_ID
    )
}
```

---

## 4. Smart Contract Specifications

### 4.1 Constants

```rust
// Program Constants
pub const LOTTERY_SEED: &[u8] = b"lottery";
pub const TICKET_SEED: &[u8] = b"ticket";
pub const DRAW_SEED: &[u8] = b"draw";
pub const USER_SEED: &[u8] = b"user";
pub const STAKE_SEED: &[u8] = b"stake";
pub const SYNDICATE_SEED: &[u8] = b"syndicate";
pub const LUCKY_NUMBERS_SEED: &[u8] = b"lucky_numbers";
pub const SECOND_CHANCE_SEED: &[u8] = b"second_chance";
pub const QUICK_PICK_SEED: &[u8] = b"quick_pick";
pub const SYNDICATE_WARS_SEED: &[u8] = b"syndicate_wars";

// Game Parameters
pub const TICKET_PRICE: u64 = 2_500_000;           // $2.50 in USDC lamports

// Dynamic Fee Tiers (replaces fixed HOUSE_FEE_BPS)
pub const FEE_TIER_1_THRESHOLD: u64 = 500_000_000_000;   // $500k
pub const FEE_TIER_2_THRESHOLD: u64 = 1_000_000_000_000; // $1M
pub const FEE_TIER_3_THRESHOLD: u64 = 1_500_000_000_000; // $1.5M

pub const FEE_TIER_1_BPS: u16 = 2800;  // 28% (< $500k)
pub const FEE_TIER_2_BPS: u16 = 3200;  // 32% ($500k - $1M)
pub const FEE_TIER_3_BPS: u16 = 3600;  // 36% ($1M - $1.5M)
pub const FEE_TIER_4_BPS: u16 = 4000;  // 40% (> $1.5M)
pub const FEE_ROLLDOWN_BPS: u16 = 2800; // 28% (during rolldown)

// Soft/Hard Cap System
pub const SOFT_CAP: u64 = 1_750_000_000_000;    // $1.75M (probabilistic rolldown begins)
pub const HARD_CAP: u64 = 2_250_000_000_000;    // $2.25M (forced rolldown)
pub const SOFT_CAP_ROLLDOWN_RATE_BPS: u16 = 3000; // DEPRECATED: Was 30% of excess (replaced with probabilistic rolldown)
pub const JACKPOT_CAP: u64 = 1_750_000_000_000;    // $1,750,000
pub const SEED_AMOUNT: u64 = 500_000_000_000;      // $500,000
pub const DRAW_INTERVAL: i64 = 86400;              // 24 hours in seconds

// Prize Allocation (basis points of prize pool)
pub const JACKPOT_ALLOCATION_BPS: u16 = 5760;      // 57.6%
pub const FIXED_PRIZE_ALLOCATION_BPS: u16 = 3940;  // 39.4%
pub const RESERVE_ALLOCATION_BPS: u16 = 300;       // 3%

// Fixed Prizes (Normal Mode)
pub const MATCH_5_PRIZE: u64 = 4_000_000_000;      // $4,000
pub const MATCH_4_PRIZE: u64 = 150_000_000;        // $150
pub const MATCH_3_PRIZE: u64 = 5_000_000;          // $5
pub const MATCH_2_VALUE: u64 = 2_500_000;          // $2.50 (free ticket)

// Rolldown Allocation (basis points of jackpot)
pub const ROLLDOWN_MATCH_5_BPS: u16 = 2500;        // 25%
pub const ROLLDOWN_MATCH_4_BPS: u16 = 3500;        // 35%
pub const ROLLDOWN_MATCH_3_BPS: u16 = 4000;        // 40%

// Staking Tiers (LOTTO tokens in lamports)
pub const BRONZE_THRESHOLD: u64 = 1_000_000_000_000;     // 1,000 LOTTO
pub const SILVER_THRESHOLD: u64 = 10_000_000_000_000;    // 10,000 LOTTO
pub const GOLD_THRESHOLD: u64 = 50_000_000_000_000;      // 50,000 LOTTO
pub const DIAMOND_THRESHOLD: u64 = 250_000_000_000_000;  // 250,000 LOTTO

// Quick Pick Express Parameters (4/20)
pub const QUICK_PICK_TICKET_PRICE: u64 = 500_000;  // $0.50
pub const QUICK_PICK_NUMBERS: u8 = 4;
pub const QUICK_PICK_RANGE: u8 = 20;
pub const QUICK_PICK_HOUSE_FEE_BPS: u16 = 3000;    // 30%
pub const QUICK_PICK_INTERVAL: i64 = 14400;        // 4 hours

// Lucky Numbers NFT
pub const LUCKY_NUMBERS_BONUS_BPS: u16 = 100;      // 1% of jackpot
pub const LUCKY_NUMBERS_MIN_MATCH: u8 = 4;         // Match 4+ to receive

// Second Chance Draws
pub const SECOND_CHANCE_PRIZE_POOL_BPS: u16 = 500; // 5% of reserve

// Syndicate Wars
pub const SYNDICATE_WARS_POOL_BPS: u16 = 100;      // 1% of monthly sales
pub const SYNDICATE_WARS_MIN_TICKETS: u64 = 1000;  // Minimum to qualify

// Limits
pub const MAX_BULK_TICKETS: usize = 10;
pub const MAX_SYNDICATE_MEMBERS: usize = 100;
pub const MAX_NUMBER: u8 = 46;
pub const MIN_NUMBER: u8 = 1;
pub const NUMBERS_PER_TICKET: usize = 6;
```

### 4.2 Account Sizes

```rust
// LotteryState: 8 (discriminator) + 32 + 8 + 8 + 8 + 8 + 8 + 8 + 16 + 8 + 8 + 8 + 8 + 8 + 8 + 1 + 1
pub const LOTTERY_STATE_SIZE: usize = 8 + 32 + 8*13 + 2 + 1 + 1 = 148;

// DrawResult: 8 + 8 + 6 + 64 + 8 + 1 + (5*4) + (5*8) + 8
pub const DRAW_RESULT_SIZE: usize = 8 + 8 + 6 + 64 + 8 + 1 + 20 + 40 + 8 = 163;

// Ticket: 8 + 32 + 8 + 6 + 8 + 1 + 1 + 8 + 32 (optional syndicate)
pub const TICKET_SIZE: usize = 8 + 32 + 8 + 6 + 8 + 1 + 1 + 8 + 33 = 105;

// UserStats: 8 + 32 + 8*4 + 4*2 + 8
pub const USER_STATS_SIZE: usize = 8 + 32 + 32 + 8 + 8 = 88;

// StakeAccount: 8 + 32 + 8 + 8 + 1 + 8 + 8
pub const STAKE_ACCOUNT_SIZE: usize = 8 + 32 + 8 + 8 + 1 + 8 + 8 = 73;

// Syndicate (base): 8 + 32 + 8 + 32 + 1 + 4 + 8 + 2 + 4 (vec length)
// + members: N * (32 + 8 + 8) = N * 48
pub const SYNDICATE_BASE_SIZE: usize = 99;
pub const SYNDICATE_MEMBER_SIZE: usize = 48;
```

---

## 5. Data Structures

### 5.1 Core Structures

```rust
#[account]
pub struct LotteryState {
    /// Admin authority (multi-sig)
    pub authority: Pubkey,
    
    /// Current draw identifier
    pub current_draw_id: u64,
    
    /// Jackpot balance in USDC lamports
    pub jackpot_balance: u64,
    
    /// Reserve fund balance
    pub reserve_balance: u64,
    
    /// Insurance pool balance
    pub insurance_balance: u64,
    
    /// Ticket price in USDC lamports
    pub ticket_price: u64,
    
    // ═══════════════════════════════════════════════════════════
    // DYNAMIC FEE SYSTEM (replaces fixed house_fee_bps)
    // ═══════════════════════════════════════════════════════════
    
    /// Fee tier 1: Jackpot < $500k (2800 = 28%)
    pub fee_tier_1_bps: u16,
    
    /// Fee tier 2: Jackpot $500k-$1M (3200 = 32%)
    pub fee_tier_2_bps: u16,
    
    /// Fee tier 3: Jackpot $1M-$1.5M (3600 = 36%)
    pub fee_tier_3_bps: u16,
    
    /// Fee tier 4: Jackpot $1.5M+ (4000 = 40%)
    pub fee_tier_4_bps: u16,
    
    /// Fee during rolldown events (2800 = 28%)
    pub fee_rolldown_bps: u16,
    
    /// Current applied fee (calculated dynamically)
    pub current_fee_bps: u16,
    
    // ═══════════════════════════════════════════════════════════
    // SOFT/HARD CAP SYSTEM
    // ═══════════════════════════════════════════════════════════
    
    /// Soft cap threshold (probabilistic rolldown possible)
    pub soft_cap: u64,
    
    /// Hard cap threshold (full rolldown trigger)
    pub hard_cap: u64,
    
    /// Soft cap rolldown rate (3000 = 30% of excess) - DEPRECATED: Replaced with probabilistic rolldown
    pub soft_cap_rolldown_rate_bps: u16,
    
    /// Total distributed via probabilistic rolldowns (soft cap triggers)
    pub total_soft_rolldowns: u64,
    
    /// Is rolldown pending for next draw
    pub is_rolldown_pending: bool,
    
    /// Seed amount after rolldown
    pub seed_amount: u64,
    
    /// Seconds between draws
    pub draw_interval: i64,
    
    /// Total tickets sold (lifetime)
    pub total_tickets_sold: u64,
    
    /// Total prizes paid (lifetime)
    pub total_prizes_paid: u64,
    
    /// Timestamp of last draw
    pub last_draw_timestamp: i64,
    
    /// Timestamp of next scheduled draw
    pub next_draw_timestamp: i64,
    
    /// Total tickets for current draw
    pub current_draw_tickets: u64,
    
    /// Emergency pause flag
    pub is_paused: bool,
    
    /// PDA bump seed
    pub bump: u8,
}

#[account]
pub struct DrawResult {
    /// Draw identifier
    pub draw_id: u64,
    
    /// Winning numbers (sorted ascending)
    pub winning_numbers: [u8; 6],
    
    /// VRF proof for verification
    pub vrf_proof: [u8; 64],
    
    /// Draw execution timestamp
    pub timestamp: i64,
    
    /// Whether this was a rolldown draw
    pub was_rolldown: bool,
    
    /// Type of rolldown (None, Soft, Hard)
    pub rolldown_type: RolldownType,
    
    /// Amount distributed in this rolldown
    pub rolldown_amount: u64,
    
    /// Winner counts by tier
    pub match_6_winners: u32,
    pub match_5_winners: u32,
    pub match_4_winners: u32,
    pub match_3_winners: u32,
    pub match_2_winners: u32,
    
    /// Prize amounts by tier (calculated after draw)
    pub match_6_prize: u64,
    pub match_5_prize: u64,
    
    /// Prize amounts during probabilistic rolldown
    pub match_5_bonus: u64,
    pub match_4_bonus: u64,
    pub match_3_bonus: u64,
    pub match_4_prize: u64,
    pub match_3_prize: u64,
    pub match_2_prize: u64,
    
    /// Total distributed in this draw
    pub total_distributed: u64,
    
    /// PDA bump seed
    pub bump: u8,
}

#[account]
pub struct Ticket {
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

#[account]
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
    
    /// Longest streak achieved
    pub longest_streak: u32,
    
    /// Last draw user participated in
    pub last_draw_participated: u64,
    
    /// Streak bonus multiplier (basis points, e.g., 1100 = 10% bonus)
    pub streak_bonus_bps: u16,
    
    /// PDA bump seed
    pub bump: u8,
}

#[account]
pub struct StakeAccount {
    /// Staker wallet
    pub owner: Pubkey,
    
    /// Amount of $LOTTO staked
    pub staked_amount: u64,
    
    /// When stake was initiated
    pub stake_timestamp: i64,
    
    /// Current staking tier
    pub tier: StakeTier,
    
    /// Unclaimed rewards in USDC
    pub pending_rewards: u64,
    
    /// Last time rewards were claimed
    pub last_claim_timestamp: i64,
    
    /// PDA bump seed
    pub bump: u8,
}

#[account]
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
```

### 5.2 Supporting Structures

```rust
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum StakeTier {
    None,
    Bronze,
    Silver,
    Gold,
    Diamond,
}

impl StakeTier {
    pub fn from_amount(amount: u64) -> Self {
        if amount >= DIAMOND_THRESHOLD {
            StakeTier::Diamond
        } else if amount >= GOLD_THRESHOLD {
            StakeTier::Gold
        } else if amount >= SILVER_THRESHOLD {
            StakeTier::Silver
        } else if amount >= BRONZE_THRESHOLD {
            StakeTier::Bronze
        } else {
            StakeTier::None
        }
    }
    
    pub fn discount_bps(&self) -> u16 {
        match self {
            StakeTier::None => 0,
            StakeTier::Bronze => 500,   // 5%
            StakeTier::Silver => 1000,  // 10%
            StakeTier::Gold => 1500,    // 15%
            StakeTier::Diamond => 2000, // 20%
        }
    }
    
    pub fn fee_share_bps(&self) -> u16 {
        match self {
            StakeTier::None => 0,
            StakeTier::Bronze => 50,    // 0.5%
            StakeTier::Silver => 150,   // 1.5%
            StakeTier::Gold => 300,     // 3%
            StakeTier::Diamond => 500,  // 5%
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum RolldownType {
    None,
    Soft,   // Mini rolldown (30% of excess over soft cap)
    Hard,   // Full rolldown (100% of jackpot)
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct SyndicateMember {
    /// Member wallet
    pub wallet: Pubkey,
    
    /// USDC contributed
    pub contribution: u64,
    
    /// Share of prizes (basis points)
    pub share_bps: u16,
    
    /// Join timestamp
    pub joined_at: i64,
}

// ═══════════════════════════════════════════════════════════════════
// ADVANCED FEATURE DATA STRUCTURES
// ═══════════════════════════════════════════════════════════════════

/// Lucky Numbers NFT - awarded to Match 4+ winners
#[account]
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

/// Second Chance Draw entry
#[account]
pub struct SecondChanceEntry {
    /// Original ticket reference
    pub ticket: Pubkey,
    
    /// Player wallet
    pub player: Pubkey,
    
    /// Week number for this entry
    pub week_id: u64,
    
    /// Number of entries
    pub entry_count: u32,
    
    /// PDA bump
    pub bump: u8,
}

/// Second Chance Draw result
#[account]
pub struct SecondChanceResult {
    /// Week identifier
    pub week_id: u64,
    
    /// Total entries
    pub total_entries: u64,
    
    /// Prize pool distributed
    pub prize_pool: u64,
    
    /// Grand prize winner
    pub grand_prize_winner: Pubkey,
    
    /// Runner up winners
    pub runner_up_winners: Vec<Pubkey>,
    
    /// Consolation winners
    pub consolation_winners: Vec<Pubkey>,
    
    /// Free ticket winners
    pub free_ticket_winners: Vec<Pubkey>,
    
    /// Execution timestamp
    pub timestamp: i64,
    
    /// VRF proof
    pub vrf_proof: [u8; 64],
    
    /// PDA bump
    pub bump: u8,
}

/// Quick Pick Express game state
#[account]
pub struct QuickPickState {
    /// Current draw number
    pub current_draw: u64,
    
    /// Ticket price (500,000 = $0.50)
    pub ticket_price: u64,
    
    /// Matrix parameters
    pub pick_count: u8,      // 4
    pub number_range: u8,    // 20
    
    /// House fee (3000 = 30%)
    pub house_fee_bps: u16,
    
    /// Draw interval in seconds (14400 = 4 hours)
    pub draw_interval: i64,
    
    /// Next draw timestamp
    pub next_draw_timestamp: i64,
    
    /// Prize amounts
    pub match_4_prize: u64,
    pub match_3_prize: u64,
    pub match_2_value: u64,
    
    /// Current draw ticket count
    pub current_draw_tickets: u64,
    
    /// Prize pool balance
    pub prize_pool_balance: u64,
    
    /// Is paused
    pub is_paused: bool,
    
    /// PDA bump
    pub bump: u8,
}

/// Quick Pick Express ticket
#[account]
pub struct QuickPickTicket {
    /// Ticket owner
    pub owner: Pubkey,
    
    /// Draw this ticket is for
    pub draw_id: u64,
    
    /// Selected numbers (sorted)
    pub numbers: [u8; 4],
    
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

/// Syndicate Wars competition state
#[account]
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

/// Syndicate Wars entry
#[account]
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

/// Mega Event state
#[account]
pub struct MegaEventState {
    /// Event identifier
    pub event_id: u64,
    
    /// Matrix (e.g., 6 for 6/49)
    pub pick_count: u8,
    
    /// Number range (e.g., 49)
    pub number_range: u8,
    
    /// Ticket price ($10)
    pub ticket_price: u64,
    
    /// Target jackpot
    pub target_jackpot: u64,
    
    /// Current jackpot
    pub current_jackpot: u64,
    
    /// Event start timestamp
    pub start_timestamp: i64,
    
    /// Event end timestamp (guaranteed rolldown)
    pub end_timestamp: i64,
    
    /// Current draw within event
    pub current_draw: u64,
    
    /// Total tickets sold
    pub total_tickets: u64,
    
    /// Is event active
    pub is_active: bool,
    
    /// PDA bump
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct WinnerCounts {
    pub match_6: u32,
    pub match_5: u32,
    pub match_4: u32,
    pub match_3: u32,
    pub match_2: u32,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct TicketPurchaseParams {
    pub numbers: [u8; 6],
    pub syndicate: Option<Pubkey>,
}
```

---

## 6. Instructions Reference

### 6.1 Admin Instructions

#### `initialize`

Initializes the lottery program. Can only be called once.

```rust
#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        init,
        payer = authority,
        space = LOTTERY_STATE_SIZE,
        seeds = [LOTTERY_SEED],
        bump
    )]
    pub lottery_state: Account<'info, LotteryState>,
    
    /// USDC mint
    pub usdc_mint: Account<'info, Mint>,
    
    /// Prize pool USDC account
    #[account(
        init,
        payer = authority,
        seeds = [b"prize_pool_usdc"],
        bump,
        token::mint = usdc_mint,
        token::authority = lottery_state
    )]
    pub prize_pool_usdc: Account<'info, TokenAccount>,
    
    /// House fee USDC account
    #[account(
        init,
        payer = authority,
        seeds = [b"house_fee_usdc"],
        bump,
        token::mint = usdc_mint,
        token::authority = lottery_state
    )]
    pub house_fee_usdc: Account<'info, TokenAccount>,
    
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitializeParams {
    pub ticket_price: u64,
    pub house_fee_bps: u16,
    pub jackpot_cap: u64,
    pub seed_amount: u64,
    pub draw_interval: i64,
}
```

#### `update_config`

Updates lottery configuration parameters. Requires timelock.

```rust
#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump,
        constraint = lottery_state.authority == authority.key()
    )]
    pub lottery_state: Account<'info, LotteryState>,
    
    /// Timelock account proving delay has passed
    pub timelock: Account<'info, Timelock>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct UpdateConfigParams {
    pub ticket_price: Option<u64>,
    pub house_fee_bps: Option<u16>,
    pub jackpot_cap: Option<u64>,
    pub seed_amount: Option<u64>,
    pub draw_interval: Option<i64>,
}
```

#### `pause` / `unpause`

Emergency pause controls.

```rust
#[derive(Accounts)]
pub struct Pause<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump,
        constraint = lottery_state.authority == authority.key()
    )]
    pub lottery_state: Account<'info, LotteryState>,
}
```

### 6.2 Ticket Instructions

#### `buy_ticket`

Purchases a single ticket.

```rust
#[derive(Accounts)]
pub struct BuyTicket<'info> {
    #[account(mut)]
    pub player: Signer<'info>,
    
    #[account(
        mut,
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump,
        constraint = !lottery_state.is_paused @ LottoError::Paused
    )]
    pub lottery_state: Account<'info, LotteryState>,
    
    #[account(
        init,
        payer = player,
        space = TICKET_SIZE,
        seeds = [
            TICKET_SEED,
            &lottery_state.current_draw_id.to_le_bytes(),
            &lottery_state.current_draw_tickets.to_le_bytes()
        ],
        bump
    )]
    pub ticket: Account<'info, Ticket>,
    
    #[account(
        mut,
        constraint = player_usdc.owner == player.key(),
        constraint = player_usdc.mint == usdc_mint.key()
    )]
    pub player_usdc: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        seeds = [b"prize_pool_usdc"],
        bump
    )]
    pub prize_pool_usdc: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        seeds = [b"house_fee_usdc"],
        bump
    )]
    pub house_fee_usdc: Account<'info, TokenAccount>,
    
    pub usdc_mint: Account<'info, Mint>,
    
    #[account(
        mut,
        seeds = [USER_SEED, player.key().as_ref()],
        bump = user_stats.bump
    )]
    pub user_stats: Account<'info, UserStats>,
    
    /// Optional: Stake account for discount calculation
    #[account(
        seeds = [STAKE_SEED, player.key().as_ref()],
        bump = stake_account.bump
    )]
    pub stake_account: Option<Account<'info, StakeAccount>>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct BuyTicketParams {
    /// 6 numbers, each between 1 and 46
    pub numbers: [u8; 6],
}
```

**Validation Requirements:**

1. Numbers must be in range [1, 46]
2. Numbers must be unique (no duplicates)
3. Lottery must not be paused
4. Draw must be open for purchases
5. Player must have sufficient USDC balance

**Processing Logic:**

```rust
pub fn buy_ticket(ctx: Context<BuyTicket>, params: BuyTicketParams) -> Result<()> {
    let lottery_state = &mut ctx.accounts.lottery_state;
    let ticket = &mut ctx.accounts.ticket;
    let user_stats = &mut ctx.accounts.user_stats;
    
    // 1. Validate numbers
    validate_numbers(&params.numbers)?;
    
    // 2. Calculate price (with staking discount)
    let base_price = lottery_state.ticket_price;
    let discount = if let Some(stake) = &ctx.accounts.stake_account {
        stake.tier.discount_bps()
    } else {
        0
    };
    let price = base_price * (10000 - discount as u64) / 10000;
    
    // 3. Calculate allocations
    let house_fee = price * lottery_state.house_fee_bps as u64 / 10000;
    let prize_pool = price - house_fee;
    let jackpot_contribution = prize_pool * JACKPOT_ALLOCATION_BPS as u64 / 10000;
    let reserve_contribution = prize_pool * RESERVE_ALLOCATION_BPS as u64 / 10000;
    
    // 4. Transfer USDC
    transfer_to_house_fee(ctx, house_fee)?;
    transfer_to_prize_pool(ctx, prize_pool)?;
    
    // 5. Update lottery state
    lottery_state.jackpot_balance += jackpot_contribution;
    lottery_state.reserve_balance += reserve_contribution;
    lottery_state.total_tickets_sold += 1;
    lottery_state.current_draw_tickets += 1;
    
    // 6. Create ticket
    ticket.owner = ctx.accounts.player.key();
    ticket.draw_id = lottery_state.current_draw_id;
    ticket.numbers = sort_numbers(params.numbers);
    ticket.purchase_timestamp = Clock::get()?.unix_timestamp;
    ticket.is_claimed = false;
    ticket.match_count = 0;
    ticket.prize_amount = 0;
    ticket.syndicate = None;
    ticket.bump = ctx.bumps.ticket;
    
    // 7. Update user stats
    update_user_stats(user_stats, lottery_state.current_draw_id)?;
    
    // 8. Emit event
    emit!(TicketPurchased {
        ticket: ticket.key(),
        player: ctx.accounts.player.key(),
        draw_id: ticket.draw_id,
        numbers: ticket.numbers,
        price,
    });
    
    Ok(())
}

fn validate_numbers(numbers: &[u8; 6]) -> Result<()> {
    // Check range
    for &num in numbers.iter() {
        require!(
            num >= MIN_NUMBER && num <= MAX_NUMBER,
            LottoError::NumberOutOfRange
        );
    }
    
    // Check uniqueness
    let mut sorted = *numbers;
    sorted.sort();
    for i in 0..5 {
        require!(
            sorted[i] != sorted[i + 1],
            LottoError::DuplicateNumber
        );
    }
    
    Ok(())
}
```

#### `buy_bulk`

Purchases multiple tickets in one transaction.

```rust
#[derive(Accounts)]
pub struct BuyBulk<'info> {
    // Same as BuyTicket, but ticket is remaining_accounts
    #[account(mut)]
    pub player: Signer<'info>,
    
    #[account(mut, seeds = [LOTTERY_SEED], bump = lottery_state.bump)]
    pub lottery_state: Account<'info, LotteryState>,
    
    #[account(mut)]
    pub player_usdc: Account<'info, TokenAccount>,
    
    #[account(mut, seeds = [b"prize_pool_usdc"], bump)]
    pub prize_pool_usdc: Account<'info, TokenAccount>,
    
    #[account(mut, seeds = [b"house_fee_usdc"], bump)]
    pub house_fee_usdc: Account<'info, TokenAccount>,
    
    pub usdc_mint: Account<'info, Mint>,
    
    #[account(mut, seeds = [USER_SEED, player.key().as_ref()], bump)]
    pub user_stats: Account<'info, UserStats>,
    
    pub stake_account: Option<Account<'info, StakeAccount>>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    // Ticket accounts passed as remaining_accounts
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct BuyBulkParams {
    /// Vector of ticket number sets (max 10)
    pub tickets: Vec<[u8; 6]>,
}
```

### 6.3 Draw Instructions

#### `initialize_draw`

Initializes a new draw period.

```rust
#[derive(Accounts)]
pub struct InitializeDraw<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump,
        constraint = lottery_state.authority == authority.key()
    )]
    pub lottery_state: Account<'info, LotteryState>,
}
```

#### `request_randomness`

Requests randomness from VRF oracle.

```rust
#[derive(Accounts)]
pub struct RequestRandomness<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump
    )]
    pub lottery_state: Account<'info, LotteryState>,
    
    /// Switchboard VRF account
    pub vrf: AccountLoader<'info, VrfAccountData>,
    
    /// VRF authority
    pub vrf_authority: AccountInfo<'info>,
    
    /// Oracle queue
    pub oracle_queue: AccountLoader<'info, OracleQueueAccountData>,
    
    /// Queue authority
    pub queue_authority: AccountInfo<'info>,
    
    /// Data buffer
    pub data_buffer: AccountInfo<'info>,
    
    /// VRF program
    pub switchboard_program: AccountInfo<'info>,
    
    /// Escrow account
    #[account(mut)]
    pub escrow: AccountInfo<'info>,
    
    /// Payer for VRF request
    #[account(mut)]
    pub payer_wallet: AccountInfo<'info>,
    
    /// Payer token account
    #[account(mut)]
    pub payer_authority: Signer<'info>,
    
    /// Recent blockhashes
    pub recent_blockhashes: AccountInfo<'info>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}
```

#### `execute_draw`

VRF callback that executes the draw.

```rust
#[derive(Accounts)]
pub struct ExecuteDraw<'info> {
    #[account(
        mut,
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump
    )]
    pub lottery_state: Account<'info, LotteryState>,
    
    #[account(
        init,
        payer = payer,
        space = DRAW_RESULT_SIZE,
        seeds = [DRAW_SEED, &lottery_state.current_draw_id.to_le_bytes()],
        bump
    )]
    pub draw_result: Account<'info, DrawResult>,
    
    /// VRF account with randomness result
    pub vrf: AccountLoader<'info, VrfAccountData>,
    
    #[account(mut)]
    pub payer: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}
```

#### `finalize_draw`

Called after winner counts are submitted by indexer.

```rust
#[derive(Accounts)]
pub struct FinalizeDraw<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump
    )]
    pub lottery_state: Account<'info, LotteryState>,
    
    #[account(
        mut,
        seeds = [DRAW_SEED, &draw_result.draw_id.to_le_bytes()],
        bump = draw_result.bump
    )]
    pub draw_result: Account<'info, DrawResult>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct FinalizeDrawParams {
    pub winner_counts: WinnerCounts,
}
```

### 6.4 Prize Instructions

#### `claim_prize`

Claims winnings for a ticket.

```rust
#[derive(Accounts)]
pub struct ClaimPrize<'info> {
    #[account(mut)]
    pub player: Signer<'info>,
    
    #[account(
        mut,
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump
    )]
    pub lottery_state: Account<'info, LotteryState>,
    
    #[account(
        mut,
        seeds = [
            TICKET_SEED,
            &ticket.draw_id.to_le_bytes(),
            // ticket_index derived from seed
        ],
        bump = ticket.bump,
        constraint = ticket.owner == player.key() @ LottoError::NotTicketOwner,
        constraint = !ticket.is_claimed @ LottoError::AlreadyClaimed
    )]
    pub ticket: Account<'info, Ticket>,
    
    #[account(
        seeds = [DRAW_SEED, &ticket.draw_id.to_le_bytes()],
        bump = draw_result.bump
    )]
    pub draw_result: Account<'info, DrawResult>,
    
    #[account(
        mut,
        constraint = player_usdc.owner == player.key()
    )]
    pub player_usdc: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        seeds = [b"prize_pool_usdc"],
        bump
    )]
    pub prize_pool_usdc: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        seeds = [USER_SEED, player.key().as_ref()],
        bump = user_stats.bump
    )]
    pub user_stats: Account<'info, UserStats>,
    
    pub token_program: Program<'info, Token>,
}
```

**Processing Logic:**

```rust
pub fn claim_prize(ctx: Context<ClaimPrize>) -> Result<()> {
    let ticket = &mut ctx.accounts.ticket;
    let draw_result = &ctx.accounts.draw_result;
    let lottery_state = &mut ctx.accounts.lottery_state;
    let user_stats = &mut ctx.accounts.user_stats;
    
    // 1. Calculate matches
    let matches = count_matches(&ticket.numbers, &draw_result.winning_numbers);
    ticket.match_count = matches;
    
    // 2. Determine prize
    let prize = match matches {
        6 => draw_result.match_6_prize,
        5 => draw_result.match_5_prize,
        4 => draw_result.match_4_prize,
        3 => draw_result.match_3_prize,
        2 => draw_result.match_2_prize,
        _ => 0,
    };
    
    // 3. Apply streak bonus (for Match 3, 4, 5)
    let bonus = if matches >= 3 && matches <= 5 {
        prize * user_stats.streak_bonus_bps as u64 / 10000
    } else {
        0
    };
    let total_prize = prize + bonus;
    
    ticket.prize_amount = total_prize;
    ticket.is_claimed = true;
    
    // 4. Transfer prize
    if total_prize > 0 {
        if matches == 2 {
            // Issue free ticket NFT
            mint_free_ticket_nft(ctx)?;
        } else {
            // Transfer USDC
            transfer_prize(ctx, total_prize)?;
        }
        
        // Update stats
        lottery_state.total_prizes_paid += total_prize;
        user_stats.total_won += total_prize;
    }
    
    // 5. Emit event
    emit!(PrizeClaimed {
        ticket: ticket.key(),
        player: ctx.accounts.player.key(),
        draw_id: ticket.draw_id,
        match_count: matches,
        prize_amount: total_prize,
    });
    
    Ok(())
}

fn count_matches(ticket_numbers: &[u8; 6], winning_numbers: &[u8; 6]) -> u8 {
    let mut matches = 0;
    for &num in ticket_numbers.iter() {
        if winning_numbers.contains(&num) {
            matches += 1;
        }
    }
    matches
}
```

### 6.5 Staking Instructions

#### `stake_lotto`

Stakes $LOTTO tokens.

```rust
#[derive(Accounts)]
pub struct StakeLotto<'info> {
    #[account(mut)]
    pub staker: Signer<'info>,
    
    #[account(
        init_if_needed,
        payer = staker,
        space = STAKE_ACCOUNT_SIZE,
        seeds = [STAKE_SEED, staker.key().as_ref()],
        bump
    )]
    pub stake_account: Account<'info, StakeAccount>,
    
    #[account(
        mut,
        constraint = staker_lotto.owner == staker.key()
    )]
    pub staker_lotto: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        seeds = [b"staking_vault"],
        bump
    )]
    pub staking_vault: Account<'info, TokenAccount>,
    
    pub lotto_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct StakeLottoParams {
    pub amount: u64,
}
```

#### `unstake_lotto`

Unstakes $LOTTO tokens.

```rust
#[derive(Accounts)]
pub struct UnstakeLotto<'info> {
    #[account(mut)]
    pub staker: Signer<'info>,
    
    #[account(
        mut,
        seeds = [STAKE_SEED, staker.key().as_ref()],
        bump = stake_account.bump,
        constraint = stake_account.owner == staker.key()
    )]
    pub stake_account: Account<'info, StakeAccount>,
    
    #[account(mut, constraint = staker_lotto.owner == staker.key())]
    pub staker_lotto: Account<'info, TokenAccount>,
    
    #[account(mut, seeds = [b"staking_vault"], bump)]
    pub staking_vault: Account<'info, TokenAccount>,
    
    #[account(seeds = [LOTTERY_SEED], bump)]
    pub lottery_state: Account<'info, LotteryState>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct UnstakeLottoParams {
    pub amount: u64,
}
```

#### `claim_staking_rewards`

Claims accumulated staking rewards.

```rust
#[derive(Accounts)]
pub struct ClaimStakingRewards<'info> {
    #[account(mut)]
    pub staker: Signer<'info>,
    
    #[account(
        mut,
        seeds = [STAKE_SEED, staker.key().as_ref()],
        bump = stake_account.bump,
        constraint = stake_account.owner == staker.key()
    )]
    pub stake_account: Account<'info, StakeAccount>,
    
    #[account(mut, constraint = staker_usdc.owner == staker.key())]
    pub staker_usdc: Account<'info, TokenAccount>,
    
    #[account(mut, seeds = [b"staking_rewards_usdc"], bump)]
    pub rewards_vault: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
}
```

### 6.6 Syndicate Instructions

#### `create_syndicate`

Creates a new syndicate pool.

```rust
#[derive(Accounts)]
pub struct CreateSyndicate<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    
    #[account(
        init,
        payer = creator,
        space = SYNDICATE_BASE_SIZE + SYNDICATE_MEMBER_SIZE,
        seeds = [
            SYNDICATE_SEED,
            creator.key().as_ref(),
            &syndicate_id.to_le_bytes()
        ],
        bump
    )]
    pub syndicate: Account<'info, Syndicate>,
    
    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreateSyndicateParams {
    pub syndicate_id: u64,
    pub name: [u8; 32],
    pub is_public: bool,
    pub manager_fee_bps: u16,
}
```

#### `join_syndicate`

Joins an existing syndicate.

```rust
#[derive(Accounts)]
pub struct JoinSyndicate<'info> {
    #[account(mut)]
    pub member: Signer<'info>,
    
    #[account(
        mut,
        seeds = [
            SYNDICATE_SEED,
            syndicate.creator.as_ref(),
            &syndicate.syndicate_id.to_le_bytes()
        ],
        bump = syndicate.bump,
        realloc = SYNDICATE_BASE_SIZE + (syndicate.member_count as usize + 1) * SYNDICATE_MEMBER_SIZE,
        realloc::payer = member,
        realloc::zero = false
    )]
    pub syndicate: Account<'info, Syndicate>,
    
    #[account(mut, constraint = member_usdc.owner == member.key())]
    pub member_usdc: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub syndicate_usdc: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct JoinSyndicateParams {
    pub contribution: u64,
}
```

---

## 7. Events

### 7.1 Event Definitions

```rust
#[event]
pub struct TicketPurchased {
    pub ticket: Pubkey,
    pub player: Pubkey,
    pub draw_id: u64,
    pub numbers: [u8; 6],
    pub price: u64,
    pub timestamp: i64,
}

#[event]
pub struct DrawInitialized {
    pub draw_id: u64,
    pub scheduled_time: i64,
    pub jackpot_balance: u64,
}

#[event]
pub struct RandomnessRequested {
    pub draw_id: u64,
    pub vrf_request_id: [u8; 32],
    pub timestamp: i64,
}

#[event]
pub struct DrawExecuted {
    pub draw_id: u64,
    pub winning_numbers: [u8; 6],
    pub was_rolldown: bool,
    pub total_tickets: u64,
    pub timestamp: i64,
}

#[event]
pub struct DrawFinalized {
    pub draw_id: u64,
    pub match_6_winners: u32,
    pub match_5_winners: u32,
    pub match_4_winners: u32,
    pub match_3_winners: u32,
    pub match_2_winners: u32,
    pub total_distributed: u64,
}

#[event]
pub struct RolldownExecuted {
    pub draw_id: u64,
    pub jackpot_distributed: u64,
    pub match_5_prize: u64,
    pub match_4_prize: u64,
    pub match_3_prize: u64,
}

#[event]
pub struct PrizeClaimed {
    pub ticket: Pubkey,
    pub player: Pubkey,
    pub draw_id: u64,
    pub match_count: u8,
    pub prize_amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct LottoStaked {
    pub staker: Pubkey,
    pub amount: u64,
    pub total_staked: u64,
    pub tier: StakeTier,
    pub timestamp: i64,
}

#[event]
pub struct LottoUnstaked {
    pub staker: Pubkey,
    pub amount: u64,
    pub remaining_staked: u64,
    pub timestamp: i64,
}

#[event]
pub struct StakingRewardsClaimed {
    pub staker: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct SyndicateCreated {
    pub syndicate: Pubkey,
    pub creator: Pubkey,
    pub name: [u8; 32],
    pub is_public: bool,
    pub timestamp: i64,
}

#[event]
pub struct SyndicateMemberJoined {
    pub syndicate: Pubkey,
    pub member: Pubkey,
    pub contribution: u64,
    pub share_bps: u16,
    pub timestamp: i64,
}

#[event]
pub struct ConfigUpdated {
    pub parameter: String,
    pub old_value: u64,
    pub new_value: u64,
    pub timestamp: i64,
}

#[event]
pub struct EmergencyPause {
    pub authority: Pubkey,
    pub reason: String,
    pub timestamp: i64,
}

#[event]
pub struct EmergencyUnpause {
    pub authority: Pubkey,
    pub timestamp: i64,
}
```

---

## 8. Error Codes

```rust
#[error_code]
pub enum LottoError {
    // Validation Errors (6000-6099)
    #[msg("Number must be between 1 and 46")]
    NumberOutOfRange = 6000,
    
    #[msg("Ticket contains duplicate numbers")]
    DuplicateNumber = 6001,
    
    #[msg("Too many tickets in bulk purchase (max 10)")]
    TooManyTickets = 6002,
    
    #[msg("No tickets provided")]
    NoTickets = 6003,
    
    #[msg("Invalid syndicate name")]
    InvalidSyndicateName = 6004,
    
    #[msg("Manager fee too high (max 5%)")]
    ManagerFeeTooHigh = 6005,
    
    // Authorization Errors (6100-6199)
    #[msg("Not authorized to perform this action")]
    Unauthorized = 6100,
    
    #[msg("Not the ticket owner")]
    NotTicketOwner = 6101,
    
    #[msg("Not the syndicate creator")]
    NotSyndicateCreator = 6102,
    
    #[msg("Not a syndicate member")]
    NotSyndicateMember = 6103,
    
    // State Errors (6200-6299)
    #[msg("Lottery is paused")]
    Paused = 6200,
    
    #[msg("Draw is not open for purchases")]
    DrawNotOpen = 6201,
    
    #[msg("Draw has not been executed yet")]
    DrawNotExecuted = 6202,
    
    #[msg("Prize already claimed")]
    AlreadyClaimed = 6203,
    
    #[msg("Syndicate is full")]
    SyndicateFull = 6204,
    
    #[msg("Syndicate is not public")]
    SyndicateNotPublic = 6205,
    
    #[msg("Already a syndicate member")]
    AlreadyMember = 6206,
    
    // Timing Errors (6300-6399)
    #[msg("Too early to execute draw")]
    TooEarly = 6300,
    
    #[msg("Draw deadline passed")]
    DeadlinePassed = 6301,
    
    #[msg("Cooldown period not elapsed")]
    CooldownNotElapsed = 6302,
    
    #[msg("Timelock not expired")]
    TimelockNotExpired = 6303,
    
    // Financial Errors (6400-6499)
    #[msg("Insufficient USDC balance")]
    InsufficientBalance = 6400,
    
    #[msg("Insufficient staked amount")]
    InsufficientStake = 6401,
    
    #[msg("No rewards to claim")]
    NoRewards = 6402,
    
    #[msg("Contribution below minimum")]
    ContributionTooLow = 6403,
    
    // VRF Errors (6500-6599)
    #[msg("Invalid VRF proof")]
    InvalidVrfProof = 6500,
    
    #[msg("VRF request not found")]
    VrfRequestNotFound = 6501,
    
    #[msg("VRF callback unauthorized")]
    VrfCallbackUnauthorized = 6502,
    
    // Math Errors (6600-6699)
    #[msg("Arithmetic overflow")]
    Overflow = 6600,
    
    #[msg("Arithmetic underflow")]
    Underflow = 6601,
    
    #[msg("Division by zero")]
    DivisionByZero = 6602,
}
```

---

## 9. Integration Guide

### 9.1 SDK Installation

```bash
# NPM
npm install @solanalotto/sdk

# Yarn
yarn add @solanalotto/sdk

# PNPM
pnpm add @solanalotto/sdk
```

### 9.2 Basic Usage

```typescript
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { SolanaLotto } from '@solanalotto/sdk';

// Initialize connection
const connection = new Connection('https://api.mainnet-beta.solana.com');

// Initialize SDK
const lotto = new SolanaLotto(connection, {
    programId: new PublicKey('LOTTO...xxxx'),
    usdcMint: new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
});

// Connect wallet (browser)
const wallet = window.solana; // Phantom, Solflare, etc.
await wallet.connect();

// Get lottery state
const state = await lotto.getLotteryState();
console.log('Current jackpot:', state.jackpotBalance / 1e6, 'USDC');
console.log('Next draw:', new Date(state.nextDrawTimestamp * 1000));

// Buy a ticket
const numbers = [7, 14, 21, 28, 35, 42];
const tx = await lotto.buyTicket(wallet, numbers);
console.log('Ticket purchased:', tx.signature);

// Check ticket status
const tickets = await lotto.getUserTickets(wallet.publicKey);
for (const ticket of tickets) {
    console.log('Ticket:', ticket.numbers);
    console.log('Matches:', ticket.matchCount);
    console.log('Prize:', ticket.prizeAmount / 1e6, 'USDC');
}

// Claim prize
const unclaimedTickets = tickets.filter(t => !t.isClaimed && t.prizeAmount > 0);
for (const ticket of unclaimedTickets) {
    const claimTx = await lotto.claimPrize(wallet, ticket.publicKey);
    console.log('Prize claimed:', claimTx.signature);
}
```

### 9.3 Advanced Usage

#### Quick Pick (Random Numbers)

```typescript
// Generate random numbers
const quickPick = lotto.generateQuickPick();
console.log('Quick pick numbers:', quickPick);

// Buy quick pick ticket
const tx = await lotto.buyTicket(wallet, quickPick);
```

#### Bulk Purchase

```typescript
// Buy 10 tickets at once
const tickets = [
    [1, 2, 3, 4, 5, 6],
    [7, 8, 9, 10, 11, 12],
    // ... up to 10
];

const tx = await lotto.buyBulk(wallet, tickets);
console.log('Bulk purchase complete:', tx.signature);
```

#### Syndicate Operations

```typescript
// Create syndicate
const syndicate = await lotto.createSyndicate(wallet, {
    name: 'Diamond Hands Pool',
    isPublic: true,
    managerFeeBps: 200, // 2%
});

// Join syndicate
await lotto.joinSyndicate(wallet, syndicate.publicKey, 100_000_000); // $100

// Buy tickets for syndicate
await lotto.buyTicketForSyndicate(wallet, syndicate.publicKey, [1, 2, 3, 4, 5, 6]);
```

#### Staking

```typescript
// Stake LOTTO tokens
await lotto.stakeLotto(wallet, 10_000_000_000_000); // 10,000 LOTTO

// Check staking tier
const stakeAccount = await lotto.getStakeAccount(wallet.publicKey);
console.log('Tier:', stakeAccount.tier);
console.log('Discount:', stakeAccount.tier.discountBps / 100, '%');

// Claim rewards
await lotto.claimStakingRewards(wallet);
```

### 9.4 Event Listening

```typescript
// Subscribe to ticket purchases
const subscriptionId = lotto.onTicketPurchased((event) => {
    console.log('New ticket:', event.ticket.toBase58());
    console.log('Player:', event.player.toBase58());
    console.log('Numbers:', event.numbers);
});

// Subscribe to draw execution
lotto.onDrawExecuted((event) => {
    console.log('Draw completed:', event.drawId);
    console.log('Winning numbers:', event.winningNumbers);
    console.log('Rolldown:', event.wasRolldown);
});

// Subscribe to prize claims
lotto.onPrizeClaimed((event) => {
    console.log('Prize claimed!');
    console.log('Player:', event.player.toBase58());
    console.log('Matches:', event.matchCount);
    console.log('Amount:', event.prizeAmount / 1e6, 'USDC');
});

// Unsubscribe
lotto.removeListener(subscriptionId);
```

### 9.5 Error Handling

```typescript
import { LottoError } from '@solanalotto/sdk';

try {
    await lotto.buyTicket(wallet, [1, 1, 2, 3, 4, 5]); // Duplicate!
} catch (error) {
    if (error instanceof LottoError) {
        switch (error.code) {
            case 6001: // DuplicateNumber
                console.error('Numbers must be unique');
                break;
            case 6000: // NumberOutOfRange
                console.error('Numbers must be between 1 and 46');
                break;
            case 6400: // InsufficientBalance
                console.error('Not enough USDC');
                break;
            default:
                console.error('Lotto error:', error.message);
        }
    } else {
        throw error;
    }
}
```

---

## 10. Testing

### 10.1 Local Validator Setup

```bash
# Install Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/v1.17.0/install)"

# Start local validator
solana-test-validator --reset

# In another terminal, deploy program
anchor build
anchor deploy

# Run tests
anchor test
```

### 10.2 Test Suite

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use anchor_lang::prelude::*;
    use solana_program_test::*;
    use solana_sdk::signature::Signer;

    #[tokio::test]
    async fn test_buy_ticket() {
        let mut test = ProgramTest::new(
            "solanalotto",
            PROGRAM_ID,
            processor!(process_instruction),
        );
        
        let (mut banks_client, payer, recent_blockhash) = test.start().await;
        
        // Initialize lottery
        // ... setup code ...
        
        // Buy ticket
        let numbers = [1, 2, 3, 4, 5, 6];
        let ix = buy_ticket_instruction(&payer.pubkey(), numbers);
        
        let tx = Transaction::new_signed_with_payer(
            &[ix],
            Some(&payer.pubkey()),
            &[&payer],
            recent_blockhash,
        );
        
        banks_client.process_transaction(tx).await.unwrap();
        
        // Verify ticket created
        let ticket_account = banks_client
            .get_account(ticket_pda(1, 0).0)
            .await
            .unwrap()
            .unwrap();
        
        let ticket: Ticket = Ticket::try_deserialize(&mut ticket_account.data.as_ref()).unwrap();
        assert_eq!(ticket.numbers, [1, 2, 3, 4, 5, 6]);
        assert_eq!(ticket.owner, payer.pubkey());
    }

    #[tokio::test]
    async fn test_number_validation() {
        // Test out of range
        let result = validate_numbers(&[0, 1, 2, 3, 4, 5]);
        assert!(result.is_err());
        
        // Test duplicates
        let result = validate_numbers(&[1, 1, 2, 3, 4, 5]);
        assert!(result.is_err());
        
        // Test valid
        let result = validate_numbers(&[1, 2, 3, 4, 5, 46]);
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_match_counting() {
        let ticket = [1, 2, 3, 4, 5, 6];
        let winning = [1, 2, 3, 7, 8, 9];
        
        let matches = count_matches(&ticket, &winning);
        assert_eq!(matches, 3);
    }

    #[tokio::test]
    async fn test_rolldown_calculation() {
        let jackpot = 1_750_000_000_000u64; // $1.75M
        let match_5_winners = 20u32;
        let match_4_winners = 1200u32;
        let match_3_winners = 20000u32;
        
        let match_5_prize = jackpot * 2500 / 10000 / match_5_winners as u64;
        let match_4_prize = jackpot * 3500 / 10000 / match_4_winners as u64;
        let match_3_prize = jackpot * 4000 / 10000 / match_3_winners as u64;
        
        assert_eq!(match_5_prize, 21_875_000_000); // ~$21,875
        assert_eq!(match_4_prize, 510_416_666);     // ~$510
        assert_eq!(match_3_prize, 35_000_000);      // ~$35
    }
}
```

### 10.3 Integration Tests

```typescript
import { expect } from 'chai';
import { SolanaLotto } from '@solanalotto/sdk';

describe('SolanaLotto Integration', () => {
    let lotto: SolanaLotto;
    let wallet: Keypair;

    before(async () => {
        // Setup
    });

    describe('Ticket Purchase', () => {
        it('should purchase a ticket with valid numbers', async () => {
            const numbers = [7, 14, 21, 28, 35, 42];
            const tx = await lotto.buyTicket(wallet, numbers);
            
            expect(tx.signature).to.be.a('string');
            
            const ticket = await lotto.getTicket(tx.ticketPubkey);
            expect(ticket.numbers).to.deep.equal(numbers.sort((a, b) => a - b));
        });

        it('should reject duplicate numbers', async () => {
            const numbers = [7, 7, 21, 28, 35, 42];
            
            await expect(lotto.buyTicket(wallet, numbers))
                .to.be.rejectedWith('DuplicateNumber');
        });

        it('should apply staking discount', async () => {
            // Stake enough for Silver tier
            await lotto.stakeLotto(wallet, 10_000_000_000_000);
            
            const state = await lotto.getLotteryState();
            const stakeAccount = await lotto.getStakeAccount(wallet.publicKey);
            
            const basePrice = state.ticketPrice;
            const discount = stakeAccount.tier.discountBps;
            const expectedPrice = basePrice * (10000 - discount) / 10000;
            
            // Verify price in transaction
            // ...
        });
    });

    describe('Draw Execution', () => {
        it('should execute draw with VRF randomness', async () => {
            // Fast forward time
            // Request randomness
            // Execute draw
            // Verify winning numbers
        });

        it('should trigger rolldown when jackpot >= cap', async () => {
            // Build up jackpot to cap
            // Execute draw with no Match 6
            // Verify rolldown prizes
        });
    });

    describe('Prize Claiming', () => {
        it('should correctly calculate matches', async () => {
            // Create ticket with known numbers
            // Execute draw with known winning numbers
            // Verify match count
        });

        it('should distribute correct prize amounts', async () => {
            // Test each prize tier
        });
    });
});
```

---

## 11. Deployment

### 11.1 Devnet Deployment

```bash
# Configure for devnet
solana config set --url devnet

# Create keypair for program
solana-keygen new -o target/deploy/solanalotto-keypair.json

# Build program
anchor build

# Deploy to devnet
anchor deploy --provider.cluster devnet

# Initialize lottery
npx ts-node scripts/initialize.ts --network devnet
```

### 11.2 Mainnet Deployment Checklist

```markdown
## Pre-Deployment

- [ ] All tests passing
- [ ] Security audit completed
- [ ] Audit findings addressed
- [ ] Multi-sig wallets created
- [ ] Initial USDC seed funded
- [ ] VRF subscription funded
- [ ] Monitoring infrastructure ready
- [ ] Incident response plan documented

## Deployment

- [ ] Deploy program with upgradeable loader
- [ ] Set upgrade authority to multi-sig
- [ ] Initialize lottery state
- [ ] Verify all PDAs
- [ ] Fund prize pool with seed
- [ ] Configure VRF
- [ ] Test first draw on mainnet (small scale)

## Post-Deployment

- [ ] Verify program on Solscan
- [ ] Publish IDL
- [ ] Update SDK with mainnet addresses
- [ ] Enable monitoring alerts
- [ ] Announce launch
```

### 11.3 Environment Configuration

```typescript
// config/mainnet.ts
export const MAINNET_CONFIG = {
    programId: new PublicKey('LOTTO...xxxx'),
    usdcMint: new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
    lottoMint: new PublicKey('LOTTO...yyyy'),
    vrfProgramId: new PublicKey('SW1TCH...xxxx'),
    oracleQueue: new PublicKey('QUEUE...xxxx'),
    
    // PDAs (derived)
    lotteryState: lottery_state_pda()[0],
    prizePoolUsdc: prize_pool_usdc_pda()[0],
    houseFeeUsdc: house_fee_usdc_pda()[0],
    stakingVault: staking_vault_pda()[0],
};

// config/devnet.ts
export const DEVNET_CONFIG = {
    programId: new PublicKey('LOTTO...devnet'),
    usdcMint: new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'), // Devnet USDC
    // ... etc
};
```

---

## 12. Appendix

### 12.1 Glossary

| Term | Definition |
|------|------------|
| **PDA** | Program Derived Address - deterministic address derived from seeds |
| **VRF** | Verifiable Random Function - cryptographic randomness with proof |
| **BPS** | Basis Points - 1/100th of a percent (100 bps = 1%) |
| **Lamports** | Smallest unit of SOL (1 SOL = 1 billion lamports) |
| **ATA** | Associated Token Account - standard token account for a wallet |
| **CU** | Compute Units - measure of computational resources |

### 12.2 Probability Reference

| Match | Combinations | Probability | Odds |
|-------|--------------|-------------|------|
| 6 | 1 | 0.000000107 | 1 : 9,366,819 |
| 5 | 240 | 0.0000256 | 1 : 39,028 |
| 4 | 11,700 | 0.00125 | 1 : 800 |
| 3 | 198,400 | 0.0212 | 1 : 47 |
| 2 | 1,370,850 | 0.146 | 1 : 6.8 |
| 1 | 3,956,880 | 0.422 | 1 : 2.4 |
| 0 | 3,829,749 | 0.409 | 1 : 2.4 |
| **Total** | **9,366,819** | **1.000** | |

### 12.3 Economic Parameters

| Parameter | Value | Notes |
|-----------|-------|-------|
| Ticket Price | $2.50 | Fixed in USDC |
| House Fee | 34% | $0.85 per ticket |
| Prize Pool | 66% | $1.65 per ticket |
| Jackpot Allocation | 57.6% | Of prize pool |
| Fixed Prize Allocation | 39.4% | Of prize pool |
| Reserve Allocation | 3% | Of prize pool |
| Jackpot Cap | $1,750,000 | Rolldown trigger |
| Seed Amount | $500,000 | Post-rolldown reset |

### 12.4 Contact & Resources

| Resource | Link |
|----------|------|
| Documentation | https://docs.solanalotto.io |
| GitHub | https://github.com/solanalotto |
| Discord | https://discord.gg/solanalotto |
| Twitter | https://twitter.com/SolanaLotto |
| Bug Bounty | https://solanalotto.io/security |

---

*Technical Specification v1.0.0*
*Last Updated: 2025*
*SolanaLotto Protocol Team*