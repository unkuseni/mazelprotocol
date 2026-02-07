# MazelProtocol Technical Specification

## Version 3.0.0

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

This document provides the complete technical specification for implementing, integrating with, and deploying MazelProtocol. It is intended for:

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
| **Randomness Oracle** | Verifiable randomness (TEE + Commit-Reveal) | Switchboard |
| **Price Feed** | USDC/USD verification | Pyth Network |
| **Indexer** | Historical data queries | Custom (Geyser plugin) |

---

## 3. Architecture

### 3.1 Program Overview

The protocol consists of **two on-chain Anchor programs**:

1. **Main Lottery Program (`solana_lotto`)** — 6/46 matrix lottery with syndicates, syndicate wars, and full admin suite
2. **Quick Pick Express Program (`quickpick`)** — Standalone 5/35 high-frequency lottery

```
┌─────────────────────────────────────────────────────────────────────┐
│                  MAIN LOTTERY PROGRAM (solana_lotto)                  │
│                Program ID: 7WyaHk2u8AgonsryMpnvbtp42CfLJFPQpyY5p9ys6FiF │
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
│  │ • buy    │         │ • commit │         │ • claim  │            │
│  │ • bulk   │         │ • execute│         │ • bulk   │            │
│  │ • free   │         │ • final. │         │ • all    │            │
│  └──────────┘         └──────────┘         └──────────┘            │
│                                                                      │
│  ┌──────────┐         ┌──────────┐         ┌──────────┐            │
│  │  ADMIN   │         │ SYNDICATE│         │ SYND.    │            │
│  │  MODULE  │         │  MODULE  │         │  WARS    │            │
│  │          │         │          │         │          │            │
│  │ • pause  │         │ • create │         │ • init   │            │
│  │ • config │         │ • join   │         │ • register│           │
│  │ • solvncy│         │ • leave  │         │ • finalize│           │
│  │ • emerg. │         │ • tickets│         │ • prizes │            │
│  └──────────┘         └──────────┘         └──────────┘            │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                  QUICK PICK EXPRESS PROGRAM (quickpick)               │
│                Program ID: 7XC1KT5mvsHHXbR2mH6er138fu2tJ4L2fAgmpjLnnZK2 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │  ADMIN   │  │  TICKET  │  │   DRAW   │  │  PRIZE   │           │
│  │          │  │          │  │          │  │          │           │
│  │ • init   │  │ • buy    │  │ • commit │  │ • claim  │           │
│  │ • pause  │  │  ($50    │  │ • execute│  │          │           │
│  │ • config │  │   gate)  │  │ • final. │  │          │           │
│  │ • emerg. │  │          │  │          │  │          │           │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘           │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

> **Note:** There is no separate TOKEN, GOV, or DAO module. Authority is a single signer
> (intended to be a multi-sig wallet in production). Configuration changes use an inline
> 24-hour timelock (propose → execute) stored in `LotteryState`.

### 3.2 Account Hierarchy

> **Updated v3.0** — Reflects actual on-chain account structures. Removed `SecondChanceEntry`
> (feature was removed in v2.2). `LuckyNumbersNFT` data structure exists but has no
> instructions yet (design only).

```
LotteryState (PDA: ["lottery"])
├── Authority
│   ├── authority: Pubkey
│   └── pending_authority: Option<Pubkey>
│
├── Randomness
│   ├── switchboard_queue: Pubkey
│   ├── current_randomness_account: Pubkey
│   ├── commit_slot: u64
│   └── commit_timestamp: i64
│
├── Config
│   ├── ticket_price: u64
│   ├── house_fee_bps: u16
│   ├── jackpot_cap: u64
│   ├── seed_amount: u64
│   ├── soft_cap: u64
│   ├── hard_cap: u64
│   └── draw_interval: i64
│
├── Balances
│   ├── jackpot_balance: u64
│   ├── reserve_balance: u64
│   ├── insurance_balance: u64
│   └── fixed_prize_balance: u64
│
├── Counters
│   ├── current_draw_id: u64
│   ├── current_draw_tickets: u64
│   ├── total_tickets_sold: u64
│   ├── total_prizes_paid: u64
│   └── total_prizes_committed: u64
│
├── State Flags
│   ├── is_draw_in_progress: bool
│   ├── is_rolldown_active: bool
│   ├── is_paused: bool
│   └── is_funded: bool
│
├── Timelock
│   ├── config_timelock_end: i64
│   └── pending_config_hash: [u8; 32]
│
├── Emergency
│   ├── emergency_transfer_total: u64
│   └── emergency_transfer_window_start: i64
│
├── Timestamps
│   └── next_draw_timestamp: i64
│
└── bump: u8

DrawResult (PDA: ["draw", draw_id.to_le_bytes()])
├── draw_id: u64
├── winning_numbers: [u8; 6]
├── randomness_proof: [u8; 32]
├── timestamp: i64
├── total_tickets: u64
├── was_rolldown: bool
├── match_6_winners: u32
├── match_5_winners: u32
├── match_4_winners: u32
├── match_3_winners: u32
├── match_2_winners: u32
├── match_6_prize_per_winner: u64
├── match_5_prize_per_winner: u64
├── match_4_prize_per_winner: u64
├── match_3_prize_per_winner: u64
├── match_2_prize_per_winner: u64
├── is_explicitly_finalized: bool
├── total_committed: u64
├── total_reclaimed: u64
└── bump: u8

TicketData (PDA: ["ticket", draw_id.to_le_bytes(), ticket_index.to_le_bytes()])
├── owner: Pubkey
├── draw_id: u64
├── numbers: [u8; 6]
├── purchase_timestamp: i64
├── is_claimed: bool
├── match_count: u8
├── prize_amount: u64
├── syndicate: Option<Pubkey>
└── bump: u8

UnifiedTicket (PDA: ["ticket", draw_id.to_le_bytes(), start_ticket_id.to_le_bytes()])
├── owner: Pubkey
├── draw_id: u64
├── start_ticket_id: u64
├── ticket_count: u32
├── numbers: Vec<[u8; 6]>    (one set per ticket)
├── purchase_timestamp: i64
├── syndicate: Option<Pubkey>
├── claimed_bitmap: Vec<u8>  (bitfield tracking claimed tickets)
└── bump: u8

UserStats (PDA: ["user", wallet])
├── wallet: Pubkey
├── total_tickets: u64
├── total_spent: u64
├── total_won: u64
├── current_streak: u32
├── best_streak: u32
├── jackpot_wins: u32
├── last_draw_participated: u64
├── tickets_this_draw: u64
├── free_tickets_available: u32
└── bump: u8

Syndicate (PDA: ["syndicate", creator, syndicate_id.to_le_bytes()])
├── creator: Pubkey
├── original_creator: Pubkey
├── syndicate_id: u64
├── name: String (max 32 bytes)
├── is_public: bool
├── member_count: u32
├── total_contribution: u64
├── manager_fee_bps: u16
├── usdc_account: Pubkey
├── members: Vec<SyndicateMember>
└── bump: u8

SyndicateWarsState (PDA: ["syndicate_wars", month.to_le_bytes()])
├── month: u64
├── start_timestamp: i64
├── end_timestamp: i64
├── prize_pool: u64
├── registered_count: u32
├── min_tickets: u64
├── is_active: bool
├── is_distributed: bool
└── bump: u8

SyndicateWarsEntry (PDA: ["syndicate_wars", month.to_le_bytes(), syndicate])
├── syndicate: Pubkey
├── month: u64
├── tickets_purchased: u64
├── prizes_won: u64
├── win_count: u32
├── win_rate: u64
├── final_rank: u32
├── prize_claimed: bool
└── bump: u8

LuckyNumbersNFT (PDA: ["lucky_numbers", mint])  ❌ DATA STRUCTURE ONLY — no instructions
├── mint: Pubkey
├── owner: Pubkey
├── numbers: [u8; 6]
├── original_draw_id: u64
├── original_match_tier: u8
├── original_winner: Pubkey
├── created_at: i64
├── total_bonuses_claimed: u64
├── jackpot_hits: u32
├── is_active: bool
└── bump: u8
```

**Quick Pick Express accounts** (separate program):

```
QuickPickState (PDA: ["quick_pick"], quickpick program)
├── current_draw: u64
├── ticket_price: u64
├── pick_count: u8
├── number_range: u8
├── house_fee_bps: u16
├── draw_interval: i64
├── next_draw_timestamp: i64
├── jackpot_balance: u64
├── soft_cap: u64
├── hard_cap: u64
├── seed_amount: u64
├── match_4_prize: u64
├── match_3_prize: u64
├── current_draw_tickets: u64
├── prize_pool_balance: u64
├── insurance_balance: u64
├── reserve_balance: u64
├── total_tickets_sold: u64
├── total_prizes_paid: u64
├── current_randomness_account: Pubkey
├── commit_slot: u64
├── commit_timestamp: i64
├── is_draw_in_progress: bool
├── is_rolldown_pending: bool
├── is_paused: bool
├── is_funded: bool
└── bump: u8

QuickPickTicket (PDA: ["quick_pick_ticket", draw_id, ticket_index])
├── owner: Pubkey
├── draw_id: u64
├── numbers: [u8; 5]
├── purchase_timestamp: i64
├── is_claimed: bool
├── match_count: u8
├── prize_amount: u64
└── bump: u8

QuickPickDrawResult (PDA: ["quick_pick_draw", draw_id])
├── draw_id: u64
├── winning_numbers: [u8; 5]
├── randomness_proof: [u8; 32]
├── timestamp: i64
├── total_tickets: u64
├── was_rolldown: bool
├── match_5_winners: u32
├── match_4_winners: u32
├── match_3_winners: u32
├── match_5_prize_per_winner: u64
├── match_4_prize_per_winner: u64
├── match_3_prize_per_winner: u64
├── is_explicitly_finalized: bool
└── bump: u8
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

// Prize Pool USDC
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
pub const JACKPOT_ALLOCATION_BPS: u16 = 5560;      // 55.6%
pub const FIXED_PRIZE_ALLOCATION_BPS: u16 = 3940;  // 39.4%
pub const RESERVE_ALLOCATION_BPS: u16 = 300;       // 3%
pub const INSURANCE_ALLOCATION_BPS: u16 = 200;     // 2%

// Fixed Prizes (Normal Mode)
pub const MATCH_5_PRIZE: u64 = 4_000_000_000;      // $4,000
pub const MATCH_4_PRIZE: u64 = 150_000_000;        // $150
pub const MATCH_3_PRIZE: u64 = 5_000_000;          // $5
pub const MATCH_2_VALUE: u64 = 2_500_000;          // $2.50 (free ticket)

// Rolldown Allocation (basis points of jackpot)
pub const ROLLDOWN_MATCH_5_BPS: u16 = 2500;        // 25%
pub const ROLLDOWN_MATCH_4_BPS: u16 = 3500;        // 35%
pub const ROLLDOWN_MATCH_3_BPS: u16 = 4000;        // 40%

// Quick Pick Express Parameters (5/35) - With Rolldown Exploit (+67% Player Edge!)
pub const QUICK_PICK_TICKET_PRICE: u64 = 1_500_000;  // $1.50
pub const QUICK_PICK_NUMBERS: u8 = 5;                 // Pick 5 numbers
pub const QUICK_PICK_RANGE: u8 = 35;                  // From 1-35
pub const QUICK_PICK_INTERVAL: i64 = 14400;          // 4 hours

// Quick Pick $50 Gate Requirement
pub const QUICK_PICK_MIN_SPEND_GATE: u64 = 50_000_000;  // $50 lifetime main lottery spend required

// Quick Pick Jackpot System (scaled for 2-3 day cycles)
pub const QUICK_PICK_SEED_AMOUNT: u64 = 5_000_000_000;    // $5,000 seed
pub const QUICK_PICK_SOFT_CAP: u64 = 30_000_000_000;      // $30,000 (probabilistic rolldown)
pub const QUICK_PICK_HARD_CAP: u64 = 50_000_000_000;      // $50,000 (forced rolldown)

// Quick Pick Dynamic Fee Tiers
pub const QUICK_PICK_FEE_TIER_1_THRESHOLD: u64 = 10_000_000_000;  // $10,000
pub const QUICK_PICK_FEE_TIER_2_THRESHOLD: u64 = 20_000_000_000;  // $20,000
pub const QUICK_PICK_FEE_TIER_3_THRESHOLD: u64 = 30_000_000_000;  // $30,000
pub const QUICK_PICK_FEE_TIER_1_BPS: u16 = 3000;         // 30% (< $10,000)
pub const QUICK_PICK_FEE_TIER_2_BPS: u16 = 3300;         // 33% ($10,000 - $20,000)
pub const QUICK_PICK_FEE_TIER_3_BPS: u16 = 3600;         // 36% ($20,000 - $30,000)
pub const QUICK_PICK_FEE_TIER_4_BPS: u16 = 3800;         // 38% (> $30,000)
pub const QUICK_PICK_FEE_ROLLDOWN_BPS: u16 = 2800;       // 28% (during rolldown - encourages volume)

// Quick Pick Fixed Prizes (Normal Mode) — NO FREE TICKET
pub const QUICK_PICK_MATCH_4_PRIZE: u64 = 100_000_000;   // $100
pub const QUICK_PICK_MATCH_3_PRIZE: u64 = 4_000_000;     // $4
// No Match 2 prize in Quick Pick Express

// Quick Pick Rolldown Allocation (THE EXPLOIT: +67% Player Edge)
pub const QUICK_PICK_ROLLDOWN_MATCH_4_BPS: u16 = 6000;   // 60% to Match 4
pub const QUICK_PICK_ROLLDOWN_MATCH_3_BPS: u16 = 4000;   // 40% to Match 3

// Quick Pick Prize Pool Allocation (no free tickets = more to jackpot)
pub const QUICK_PICK_JACKPOT_ALLOCATION_BPS: u16 = 6000;       // 60%
pub const QUICK_PICK_FIXED_PRIZE_ALLOCATION_BPS: u16 = 3700;   // 37%
pub const QUICK_PICK_INSURANCE_ALLOCATION_BPS: u16 = 300;      // 3%

// Lucky Numbers NFT
pub const LUCKY_NUMBERS_BONUS_BPS: u16 = 100;      // 1% of jackpot
pub const LUCKY_NUMBERS_MIN_MATCH: u8 = 4;         // Match 4+ to receive

// Syndicate Wars
pub const SYNDICATE_WARS_POOL_BPS: u16 = 100;      // 1% of monthly sales
pub const SYNDICATE_WARS_MIN_TICKETS: u64 = 1000;  // Minimum to qualify

// Limits
pub const MAX_BULK_TICKETS: usize = 50;            // Max tickets per bulk purchase (individual)
pub const MAX_SYNDICATE_BULK_TICKETS: usize = 150; // Max tickets per bulk purchase (syndicates)
pub const MAX_TICKETS_PER_DRAW_PER_USER: u64 = 5000; // Max tickets per draw per user
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
pub const USER_STATS_SIZE: usize = 8 + 32 + 8*6 + 1 = 89;

// Syndicate (base): 8 + 32 + 8 + 32 + 1 + 4 + 8 + 2 + 4 (vec length)
// + members: N * (32 + 8 + 8) = N * 48
pub const SYNDICATE_BASE_SIZE: usize = 99;
pub const SYNDICATE_MEMBER_SIZE: usize = 48;
```

---

## 5. Data Structures

### 5.1 Core Structures

> **Updated v3.0** — All structs below match the actual on-chain implementation.

```rust
#[account]
pub struct LotteryState {
    /// Admin authority (multi-sig wallet recommended for production)
    pub authority: Pubkey,

    /// Pending authority for two-step transfer (propose → accept)
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

    /// Insurance fund for guaranteed payouts
    pub insurance_balance: u64,

    /// Fixed prize balance (39.4% of ticket revenue, earmarked for Match 3/4/5)
    pub fixed_prize_balance: u64,

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

    /// Timestamp when randomness was committed (for timeout detection)
    pub commit_timestamp: i64,

    /// Number of tickets sold for the current draw
    pub current_draw_tickets: u64,

    /// Lifetime total tickets sold
    pub total_tickets_sold: u64,

    /// Lifetime total prizes paid out
    pub total_prizes_paid: u64,

    /// Total prizes committed but not yet claimed (for solvency accounting)
    pub total_prizes_committed: u64,

    /// Whether a draw is currently in progress
    pub is_draw_in_progress: bool,

    /// Whether rolldown is active for the next draw
    pub is_rolldown_active: bool,

    /// Whether the lottery is paused
    pub is_paused: bool,

    /// Whether the lottery has been funded (seed deposited)
    pub is_funded: bool,

    /// PDA bump seed
    pub bump: u8,

    // -- Timelock fields (for propose_config / execute_config) --

    /// Unix timestamp when config proposal timelock expires (0 = no active proposal)
    pub config_timelock_end: i64,

    /// SHA256 hash of the pending config change (zeroed = no active proposal)
    pub pending_config_hash: [u8; 32],

    // -- Emergency fund transfer accounting --

    /// Cumulative emergency transfer amount in current window
    pub emergency_transfer_total: u64,

    /// Start of the current emergency transfer window
    pub emergency_transfer_window_start: i64,
}

/// Lottery numbers wrapper with validation
pub struct LotteryNumbers([u8; 6]);

impl LotteryNumbers {
    /// Create new validated lottery numbers
    pub fn new(numbers: [u8; 6]) -> Result<Self> {
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
    pub fn numbers(&self) -> [u8; 6] {
        self.0
    }

    /// Calculate match count with winning numbers
    pub fn calculate_match_count(&self, winning_numbers: &[u8; 6]) -> u8 {
        calculate_match_count(&self.0, winning_numbers)
    }

    /// Check if numbers are valid
    pub fn is_valid(&self) -> bool {
        validate_lottery_numbers(&self.0)
    }
}

#[account]
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
    
    /// Prize amounts per winner by tier
    pub match_6_prize_per_winner: u64,
    pub match_5_prize_per_winner: u64,
    pub match_4_prize_per_winner: u64,
    pub match_3_prize_per_winner: u64,
    
    /// PDA bump seed
    pub bump: u8,
}

#[account]
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
    
    /// Best streak achieved
    pub best_streak: u32,
    
    /// Number of jackpot wins
    pub jackpot_wins: u32,
    
    /// Last draw user participated in
    pub last_draw_participated: u64,
    
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

> **Note on `UnifiedTicket`:** Bulk purchases create a single `UnifiedTicket` account
> instead of individual `TicketData` accounts. This is more storage-efficient and
> uses a claimed bitmap to track which tickets in the batch have been claimed.

### 5.2 Supporting Structures

```rust
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum RolldownType {
    None,
    Soft,   // Mini rolldown (30% of excess over soft cap)
    Hard,   // Full rolldown (100% of jackpot)
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
/// Winner counts structure for draw results
#[derive(Default)]
pub struct WinnerCounts {
    pub match_6: u32,
    pub match_5: u32,
    pub match_4: u32,
    pub match_3: u32,
    pub match_2: u32,
}

/// Syndicate member information
pub struct SyndicateMember {
    /// Member wallet
    pub wallet: Pubkey,
    
    /// USDC contributed
    pub contribution: u64,
    
    /// Share of prizes (basis points)
    pub share_percentage_bps: u16,
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

// NOTE: SecondChanceEntry was removed in v2.2. This struct no longer exists in the on-chain program.

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

    /// Array of lottery numbers (one per ticket)
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

/// Quick Pick Express game state (5/35 Matrix with Rolldown Exploit)
/// Odds: Match 5 = 1/324,632, Match 4 = 1/2,164, Match 3 = 1/74.6, Match 2 = 1/8
/// Rolldown EV: +67% player edge when jackpot distributes!
#[account]
pub struct QuickPickStateLegacy {
    /// Current draw number
    pub current_draw: u64,
    
    /// Ticket price (1,500,000 = $1.50)
    pub ticket_price: u64,
    
    /// Next draw timestamp
    pub next_draw_timestamp: i64,
    
    /// Prize pool balance
    pub prize_pool_balance: u64,
    
    /// Is paused
    pub is_paused: bool,
    
    /// PDA bump
    pub bump: u8,
}

/// Syndicate Wars competition entry
#[account]
pub struct SyndicateWarsEntry {
    /// Syndicate reference
    pub syndicate: Pubkey,
    
    /// Competition month
    pub month: u64,
    
    /// Total tickets purchased
    pub tickets_purchased: u64,
    
    /// Total prizes won
    pub prizes_won: u64,
    
    /// Win rate (fixed-point)
    pub win_rate: u64,
    
    /// Final rank
    pub final_rank: Option<u32>,
    
    /// PDA bump
    pub bump: u8,
}

/// Match tier enumeration
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum MatchTier {
    NoMatch,
    Match2,
    Match3,
    Match4,
    Match5,
    Match6,
}

/// Quick Pick Express game state with rolldown mechanics (5/35 Matrix)
/// THE EXPLOIT: During rolldown, players enjoy +67% positive expected value!
#[account]
pub struct QuickPickState {
    /// Current draw number
    pub current_draw: u64,
    
    /// Ticket price (1,500,000 = $1.50)
    pub ticket_price: u64,
    
    /// Matrix parameters (5/35)
    pub pick_count: u8,      // 5
    pub number_range: u8,    // 35
    
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
    
    /// Jackpot hard cap ($50,000 - forced rolldown)
    pub hard_cap: u64,
    
    /// Seed amount for jackpot reset after rolldown ($5,000)
    pub seed_amount: u64,
    
    /// Fixed prize amounts (Normal Mode) — NO FREE TICKET
    pub match_4_prize: u64,  // $100
    pub match_3_prize: u64,  // $4
    // No match_2 prize in Quick Pick Express
    
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

/// Quick Pick Express ticket (5/35 Matrix)
#[account]
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

#### `fund_seed`

Transfers the seed amount from authority to prize pool, sets jackpot balance, and unpauses the lottery. Must be called after `initialize` before the lottery can operate.

```rust
#[derive(Accounts)]
pub struct FundSeed<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(mut, seeds = [LOTTERY_SEED], bump = lottery_state.bump,
        constraint = lottery_state.authority == authority.key())]
    pub lottery_state: Account<'info, LotteryState>,
    
    #[account(mut)]
    pub authority_usdc: Account<'info, TokenAccount>,
    
    #[account(mut, seeds = [b"prize_pool_usdc"], bump)]
    pub prize_pool_usdc: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
}
```

#### `add_reserve_funds`

Adds additional funds to the reserve pool.

```rust
#[derive(Accounts)]
pub struct AddReserveFunds<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(mut, seeds = [LOTTERY_SEED], bump = lottery_state.bump,
        constraint = lottery_state.authority == authority.key())]
    pub lottery_state: Account<'info, LotteryState>,
    
    #[account(mut)]
    pub authority_usdc: Account<'info, TokenAccount>,
    
    #[account(mut, seeds = [b"prize_pool_usdc"], bump)]
    pub prize_pool_usdc: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
}
```

#### `update_config` (legacy immediate mode)

Updates configuration parameters immediately. Refuses to run if a timelock proposal is active. For production use, prefer the `propose_config` → `execute_config` flow.

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
    // Note: No separate Timelock account — timelock is inline on LotteryState
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct UpdateConfigParams {
    pub ticket_price: Option<u64>,
    pub house_fee_bps: Option<u16>,
    pub jackpot_cap: Option<u64>,
    pub seed_amount: Option<u64>,
    pub soft_cap: Option<u64>,
    pub hard_cap: Option<u64>,
    pub switchboard_queue: Option<Pubkey>,
    pub draw_interval: Option<i64>,
}
```

#### `propose_config` → `execute_config` → `cancel_config_proposal` (Timelock Flow)

Three-step configuration change with a 24-hour delay:

1. **`propose_config(params)`** — Computes `SHA256(params)` and stores it in `lottery_state.pending_config_hash`. Sets `config_timelock_end` to `now + 24 hours`. Does NOT apply changes.
2. **`execute_config(params)`** — After the timelock expires, verifies that `SHA256(params)` matches the stored hash. If it matches and the timelock has elapsed, applies the changes and clears the proposal.
3. **`cancel_config_proposal()`** — Clears `pending_config_hash` and `config_timelock_end`, cancelling the pending proposal.

All three use the same `UpdateConfig` accounts context and `UpdateConfigParams` struct shown above.

#### `check_solvency` (permissionless)

Allows **anyone** to verify that on-chain token balances match internal accounting. If a mismatch is detected, the lottery is automatically paused.

```rust
#[derive(Accounts)]
pub struct CheckSolvency<'info> {
    pub caller: Signer<'info>,
    
    #[account(mut, seeds = [LOTTERY_SEED], bump = lottery_state.bump)]
    pub lottery_state: Account<'info, LotteryState>,
    
    #[account(seeds = [b"prize_pool_usdc"], bump)]
    pub prize_pool_usdc: Account<'info, TokenAccount>,
    
    #[account(seeds = [b"insurance_pool_usdc"], bump)]
    pub insurance_pool_usdc: Account<'info, TokenAccount>,
}
```

#### `pause` / `unpause`

Emergency pause controls. Only the authority can pause/unpause.

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
// Unpause uses a separate struct with the same shape
```

#### `withdraw_house_fees`

Transfers accumulated house fees to a destination USDC account. Authority only.

```rust
#[derive(Accounts)]
pub struct WithdrawHouseFees<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(mut, seeds = [LOTTERY_SEED], bump = lottery_state.bump,
        constraint = lottery_state.authority == authority.key())]
    pub lottery_state: Account<'info, LotteryState>,
    
    #[account(mut, seeds = [b"house_fee_usdc"], bump)]
    pub house_fee_usdc: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub destination_usdc: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
}
```

#### `propose_authority` → `accept_authority` → `cancel_authority_transfer`

Two-step authority transfer preventing accidental loss of control:

1. **`propose_authority(new_authority)`** — Current authority proposes a new authority. Stores `new_authority` in `lottery_state.pending_authority`.
2. **`accept_authority()`** — The proposed authority signs to accept. Sets `lottery_state.authority = pending_authority` and clears pending.
3. **`cancel_authority_transfer()`** — Current authority cancels the proposal.

#### `cancel_draw`

Cancels a draw that has timed out (>1 hour since commit). Recovery mechanism for oracle failures.

#### `force_finalize_draw`

Emergency instruction that forces a draw to complete with zero prizes. Tickets affected will not receive prizes (may need off-chain compensation).

#### `emergency_fund_transfer`

Transfers funds between reserve/insurance/prize pools during emergencies. Enforces a daily cap (50% of source per 24-hour window) with rolling window tracking.

```rust
pub enum FundSource {
    Reserve,
    Insurance,
    PrizePool,
}
```

#### `reclaim_expired_prizes`

Sweeps unclaimed committed prizes back into `reserve_balance` after the 90-day claim expiration window. Prevents "zombie" committed funds from distorting solvency metrics.

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
    
    // 2. Calculate price
    let price = lottery_state.ticket_price;
    
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

Purchases multiple tickets in one transaction. Individual users can purchase up to 50 tickets per transaction, while syndicates can purchase up to 150 tickets per transaction. Tickets are stored in a unified ticket account for efficient storage and claiming.

```rust
#[derive(Accounts)]
pub struct BuyBulk<'info> {
    #[account(mut)]
    pub player: Signer<'info>,
    
    #[account(mut, seeds = [LOTTERY_SEED], bump = lottery_state.bump)]
    pub lottery_state: Account<'info, LotteryState>,
    
    #[account(
        init,
        payer = player,
        space = UnifiedTicket::size_for_count(params.tickets.len()),
        seeds = [
            UNIFIED_TICKET_SEED,
            player.key().as_ref(),
            &lottery_state.current_draw_id.to_le_bytes(),
            &lottery_state.current_draw_tickets.to_le_bytes()
        ],
        bump
    )]
    pub unified_ticket: Account<'info, UnifiedTicket>,
    
    #[account(mut)]
    pub player_usdc: Account<'info, TokenAccount>,
    
    #[account(mut, seeds = [b"prize_pool_usdc"], bump)]
    pub prize_pool_usdc: Account<'info, TokenAccount>,
    
    #[account(mut, seeds = [b"house_fee_usdc"], bump)]
    pub house_fee_usdc: Account<'info, TokenAccount>,
    
    pub usdc_mint: Account<'info, Mint>,
    
    #[account(mut, seeds = [USER_SEED, player.key().as_ref()], bump)]
    pub user_stats: Account<'info, UserStats>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct BuyBulkParams {
    /// Vector of ticket number sets (max 50 for individuals, 150 for syndicates)
    pub tickets: Vec<[u8; 6]>,
}
```

#### `claim_bulk_prize`

Claims prize for a specific ticket within a unified ticket account.

```rust
#[derive(Accounts)]
pub struct ClaimBulkPrize<'info> {
    #[account(mut)]
    pub player: Signer<'info>,
    
    #[account(mut, seeds = [LOTTERY_SEED], bump = lottery_state.bump)]
    pub lottery_state: Account<'info, LotteryState>,
    
    #[account(
        mut,
        constraint = unified_ticket.owner == player.key()
    )]
    pub unified_ticket: Account<'info, UnifiedTicket>,
    
    #[account(seeds = [DRAW_SEED, &unified_ticket.draw_id.to_le_bytes()], bump)]
    pub draw_result: Account<'info, DrawResult>,
    
    #[account(mut)]
    pub player_usdc: Account<'info, TokenAccount>,
    
    #[account(mut, seeds = [b"prize_pool_usdc"], bump)]
    pub prize_pool_usdc: Account<'info, TokenAccount>,
    
    pub usdc_mint: Account<'info, Mint>,
    
    #[account(mut, seeds = [USER_SEED, player.key().as_ref()], bump)]
    pub user_stats: Account<'info, UserStats>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct ClaimBulkPrizeParams {
    /// The index of the ticket within the unified ticket to claim (0-based)
    pub ticket_index: u32,
}
```

#### `claim_all_bulk_prizes`

Claims all prizes from a unified ticket in one transaction. May fail for large unified tickets due to compute limits.

```rust
#[derive(Accounts)]
pub struct ClaimAllBulkPrizes<'info> {
    // Same accounts as ClaimBulkPrize, but no params needed
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

#### `commit_randomness`

Commits to Switchboard randomness for the upcoming draw (commit-reveal pattern).

```rust
#[derive(Accounts)]
pub struct CommitRandomness<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        seeds = [LOTTERY_SEED],
        bump = lottery_state.bump
    )]
    pub lottery_state: Account<'info, LotteryState>,
    
    /// Switchboard randomness account (must be created beforehand)
    /// CHECK: Validated manually by parsing RandomnessAccountData
    pub randomness_account_data: AccountInfo<'info>,
    
    /// Switchboard queue for the randomness request
    pub switchboard_queue: AccountInfo<'info>,
    
    /// Switchboard on-demand program
    pub switchboard_program: AccountInfo<'info>,
    
    pub system_program: Program<'info, System>,
}
```

**Commit Phase Flow:**
1. Create randomness account via Switchboard SDK
2. Bundle commit instruction with lottery's commit_randomness
3. Store commit slot in lottery state for later verification
4. Randomness is not yet revealed at this point

#### `execute_draw`

Reveals Switchboard randomness and executes the draw.

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
    
    /// Switchboard randomness account with revealed result
    pub randomness_account_data: AccountInfo<'info>,
    
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

### 6.5 Syndicate Instructions

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
pub struct RandomnessCommitted {
    pub draw_id: u64,
    pub commit_slot: u64,
    pub randomness_account: Pubkey,
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
pub enum ErrorCode {
    // ============================================================================
    // Authorization & Permissions (4 errors)
    // ============================================================================
    /// Attempted to perform an operation without proper authorization
    #[msg("Unauthorized access attempt.")]
    Unauthorized,

    /// Operation requires admin-level authority but caller doesn't have it
    #[msg("Admin authority required.")]
    AdminAuthorityRequired,

    /// Caller is not the owner of the account they're trying to modify
    #[msg("Caller is not the owner of this account.")]
    NotOwner,

    /// Provided authority signature is invalid or doesn't match expected authority
    #[msg("Invalid authority signature.")]
    InvalidAuthority,

    // ============================================================================
    // Lottery State & Configuration (8 errors)
    // ============================================================================
    /// Lottery operations are temporarily suspended
    #[msg("Lottery is currently paused.")]
    Paused,

    /// Attempted to start a new draw while one is already running
    #[msg("Draw is already in progress.")]
    DrawInProgress,

    /// Attempted to perform draw-specific operation when no draw is active
    #[msg("Draw is not in progress.")]
    DrawNotInProgress,

    /// Draw cannot be started yet (e.g., insufficient time has passed)
    #[msg("Draw not ready yet.")]
    DrawNotReady,

    /// Attempted to complete a draw that has already been finalized
    #[msg("Draw has already been completed.")]
    DrawAlreadyCompleted,

    /// Invalid state transition in the draw lifecycle
    #[msg("Invalid draw state transition.")]
    InvalidDrawState,

    /// Lottery state account has not been properly initialized
    #[msg("Lottery state is not initialized.")]
    LotteryNotInitialized,

    /// Lottery configuration parameters are invalid or inconsistent
    #[msg("Invalid lottery configuration.")]
    InvalidConfig,

    // ============================================================================
    // Ticket Purchase & Validation (13 errors)
    // ============================================================================
    /// Ticket numbers fail basic validation (wrong count, format, etc.)
    #[msg("Invalid ticket numbers.")]
    InvalidNumbers,

    /// Ticket contains duplicate numbers (must be unique)
    #[msg("Duplicate numbers detected.")]
    DuplicateNumbers,

    /// Ticket numbers are outside the valid range (1-45)
    #[msg("Numbers out of valid range.")]
    NumbersOutOfRange,

    /// User doesn't have enough funds to purchase the requested tickets
    #[msg("Not enough funds to purchase ticket.")]
    InsufficientFunds,

    /// User exceeded their personal ticket purchase limit
    #[msg("Exceeded maximum ticket purchase limit.")]
    MaxTicketsExceeded,

    /// User exceeded per-draw ticket purchase limit
    #[msg("Exceeded maximum tickets per draw.")]
    MaxTicketsPerDrawExceeded,

    /// Ticket price doesn't match the current lottery configuration
    #[msg("Invalid ticket price.")]
    InvalidTicketPrice,

    /// Bulk ticket purchase exceeds the allowed batch size
    #[msg("Bulk purchase size exceeds limit.")]
    BulkPurchaseLimitExceeded,

    /// Attempted to purchase tickets after the sale period has ended
    #[msg("Ticket sale has ended for this draw.")]
    TicketSaleEnded,

    /// Ticket has already been claimed for its prize
    #[msg("Ticket has already been claimed.")]
    AlreadyClaimed,

    /// Ticket is no longer valid for claiming (claim period expired)
    #[msg("Ticket has expired.")]
    TicketExpired,

    /// Ticket reference is invalid or doesn't exist
    #[msg("Ticket not found or invalid.")]
    InvalidTicket,

    // ============================================================================
    // Draw Execution & Randomness (13 errors)
    // ============================================================================
    /// Attempted to reveal randomness that has already been revealed
    #[msg("Randomness already revealed.")]
    RandomnessAlreadyRevealed,

    /// Randomness result is not yet available from the oracle
    #[msg("Randomness not yet resolved.")]
    RandomnessNotResolved,

    /// Randomness value is too old and cannot be used
    #[msg("Randomness has expired.")]
    RandomnessExpired,

    /// Randomness account is malformed or invalid
    #[msg("Invalid randomness account.")]
    InvalidRandomnessAccount,

    /// Randomness value doesn't meet freshness requirements
    #[msg("Randomness freshness check failed.")]
    RandomnessNotFresh,

    /// Randomness proof verification failed
    #[msg("Invalid randomness proof.")]
    InvalidRandomnessProof,

    /// Switchboard queue is not configured for randomness generation
    #[msg("Switchboard queue not configured.")]
    SwitchboardQueueNotSet,

    /// Failed to request randomness from the oracle
    #[msg("Randomness request failed.")]
    RandomnessRequestFailed,

    /// Randomness commitment is missing or invalid
    #[msg("Randomness commitment missing.")]
    RandomnessNotCommitted,

    // ============================================================================
    // Prize Distribution & Claims (8 errors)
    // ============================================================================
    /// No prize is available for the user to claim
    #[msg("No prize to claim.")]
    NoPrizeToClaim,

    /// Prize has already been claimed by the user
    #[msg("Prize already claimed.")]
    PrizeAlreadyClaimed,

    /// Prize calculation produced invalid or inconsistent results
    #[msg("Invalid prize calculation.")]
    InvalidPrizeCalculation,

    /// Failed to distribute prize to winner(s)
    #[msg("Prize distribution failed.")]
    PrizeDistributionFailed,

    /// Jackpot has already been won in the current draw
    #[msg("Jackpot already won this draw.")]
    JackpotAlreadyWon,

    /// Match count doesn't correspond to a valid prize tier
    #[msg("Invalid match count for prize.")]
    InvalidMatchCount,

    /// Prize pool doesn't have enough funds to pay out prizes
    #[msg("Prize pool insufficient for distribution.")]
    InsufficientPrizePool,

    /// Error calculating rolldown prize distribution
    #[msg("Rolldown calculation error.")]
    RolldownCalculationError,

    // ============================================================================
    // Syndicate System (9 errors)
    // ============================================================================
    /// Syndicate has reached its maximum member capacity
    #[msg("Syndicate is full.")]
    SyndicateFull,

    /// User is not a member of the specified syndicate
    #[msg("Not a member of this syndicate.")]
    NotSyndicateMember,

    /// Syndicate with the given ID does not exist
    #[msg("Syndicate not found.")]
    SyndicateNotFound,

    /// Syndicate configuration parameters are invalid
    #[msg("Invalid syndicate configuration.")]
    InvalidSyndicateConfig,

    /// Syndicate manager fee exceeds the maximum allowed percentage
    #[msg("Syndicate manager fee too high.")]
    ManagerFeeTooHigh,

    /// Attempted to join a private syndicate without invitation
    #[msg("Syndicate is private.")]
    SyndicatePrivate,

    /// Member share calculation produced invalid results
    #[msg("Invalid member share calculation.")]
    InvalidMemberShare,

    /// User's contribution to the syndicate is below the minimum required
    #[msg("Syndicate contribution insufficient.")]
    InsufficientContribution,

    // ============================================================================
    // Financial & Token Operations (8 errors)
    // ============================================================================
    /// Operation requires a USDC token account but none was provided
    #[msg("USDC token account required.")]
    UsdcAccountRequired,

    /// Provided USDC mint doesn't match the expected USDC mint
    #[msg("Invalid USDC mint.")]
    InvalidUsdcMint,

    /// Token transfer operation failed (insufficient balance, approval, etc.)
    #[msg("Token transfer failed.")]
    TokenTransferFailed,

    /// Account doesn't have sufficient token balance for the operation
    #[msg("Insufficient token balance.")]
    InsufficientTokenBalance,

    /// Token account is malformed or invalid
    #[msg("Invalid token account.")]
    InvalidTokenAccount,

    /// Associated Token Account (ATA) is required but not provided
    #[msg("ATA (Associated Token Account) required.")]
    AtaRequired,

    // ============================================================================
    // Mathematical & Parameter Validation (7 errors)
    // ============================================================================
    /// House fee percentage is outside valid bounds (0-100%)
    #[msg("Invalid house fee percentage.")]
    InvalidHouseFee,

    /// Jackpot cap is invalid (e.g., less than seed amount)
    #[msg("Invalid jackpot cap.")]
    InvalidJackpotCap,

    /// Seed amount is invalid (e.g., negative or too large)
    #[msg("Invalid seed amount.")]
    InvalidSeedAmount,

    /// Soft/hard cap configuration is inconsistent
    #[msg("Invalid soft/hard cap configuration.")]
    InvalidCapConfig,

    /// Arithmetic operation overflowed or underflowed
    #[msg("Arithmetic overflow/underflow.")]
    ArithmeticError,

    /// Attempted division by zero
    #[msg("Division by zero.")]
    DivisionByZero,

    /// Basis points calculation is invalid (e.g., >10,000 bps)
    #[msg("Invalid basis points calculation.")]
    InvalidBasisPoints,

    // ============================================================================
    // Account & PDA Validation (7 errors)
    // ============================================================================
    /// Program Derived Address derivation failed or produced invalid result
    #[msg("Invalid PDA derivation.")]
    InvalidPdaDerivation,

    /// Account doesn't have enough lamports to be rent-exempt
    #[msg("Account not rent exempt.")]
    NotRentExempt,

    /// Account owner doesn't match the expected program ID
    #[msg("Invalid account owner.")]
    InvalidAccountOwner,

    /// Account data size is insufficient for the required operation
    #[msg("Account data too small.")]
    AccountDataTooSmall,

    /// Account discriminator doesn't match expected value
    #[msg("Invalid account discriminator.")]
    InvalidDiscriminator,

    /// Account has already been initialized
    #[msg("Account already initialized.")]
    AlreadyInitialized,

    /// Account has not been initialized
    #[msg("Account not initialized.")]
    NotInitialized,

    // ============================================================================
    // System & Operational Errors (6 errors)
    // ============================================================================
    /// System program is required but not provided
    #[msg("System program required.")]
    SystemProgramRequired,

    /// System clock is unavailable for timestamp operations
    #[msg("Clock unavailable.")]
    ClockUnavailable,

    /// Timestamp is invalid or outside acceptable range
    #[msg("Invalid timestamp.")]
    InvalidTimestamp,

    /// Operation exceeded its time limit
    #[msg("Operation timed out.")]
    Timeout,

    /// Operation retry limit has been exceeded
    #[msg("Retry limit exceeded.")]
    RetryLimitExceeded,

    /// Operation is not supported in the current context
    #[msg("Operation not supported.")]
    NotSupported,

    // ============================================================================
    // Game-Specific Errors (7 errors)
    // ============================================================================
    /// Rolldown feature is not currently active
    #[msg("Rolldown not active.")]
    RolldownNotActive,

    /// Rolldown has already been triggered for this draw
    #[msg("Rolldown already triggered.")]
    RolldownAlreadyTriggered,

    /// Quick pick game feature is not active
    #[msg("Quick pick game not active.")]
    QuickPickNotActive,

    /// Player has not spent enough in main lottery for Quick Pick Express access
    #[msg("Insufficient main lottery spend. $50 minimum required for Quick Pick Express.")]
    InsufficientMainLotterySpend,

    /// Maximum Lucky Numbers NFT limit has been reached
    #[msg("Lucky Numbers NFT limit reached.")]
    LuckyNumbersLimitReached,

    /// Match count is insufficient for Lucky Numbers NFT eligibility
    #[msg("Insufficient match for Lucky Numbers NFT.")]
    InsufficientMatchForNft,

    /// Syndicate Wars feature is not currently active
    #[msg("Syndicate Wars not active.")]
    SyndicateWarsNotActive,

    /// Error calculating streak bonus rewards
    #[msg("Streak bonus calculation error.")]
    StreakBonusError,

    // ============================================================================
    // Compatibility & Version Errors (3 errors)
    // ============================================================================
    /// Program version doesn't match expected version
    #[msg("Program version mismatch.")]
    VersionMismatch,

    /// Attempted to use a deprecated feature
    #[msg("Deprecated feature.")]
    DeprecatedFeature,

    /// Operation is not supported in the current program version
    #[msg("Unsupported operation in current version.")]
    UnsupportedInVersion,

    // ============================================================================
    // Generic & Catch-All Errors (3 errors)
    // ============================================================================
    /// Unknown or unclassified error occurred
    #[msg("Unknown error occurred.")]
    UnknownError,

    /// General validation check failed
    #[msg("Validation failed.")]
    ValidationFailed,

    /// Program constraint was violated
    #[msg("Constraint violation.")]
    ConstraintViolation,

    /// Internal program error (should not occur in normal operation)
    #[msg("Internal program error.")]
    InternalError,
}
```

### 8.1 Error Categories Summary

| Category | Error Count | Description |
|----------|-------------|-------------|
| **Authorization & Permissions** | 4 | Access control and permission errors |
| **Lottery State & Configuration** | 8 | Lottery lifecycle and configuration errors |
| **Ticket Purchase & Validation** | 13 | Ticket buying and validation errors |
| **Draw Execution & Randomness** | 13 | Draw process and randomness generation errors |
| **Prize Distribution & Claims** | 8 | Prize calculation and claiming errors |
| **Syndicate System** | 9 | Syndicate management and sharing errors |
| **Financial & Token Operations** | 8 | Token transfer and financial operation errors |
| **Mathematical & Parameter Validation** | 7 | Calculation and parameter validation errors |
| **Account & PDA Validation** | 7 | Account derivation and validation errors |
| **System & Operational Errors** | 6 | System-level and operational errors |
| **Game-Specific Errors** | 9 | Special game feature errors |
| **Compatibility & Version Errors** | 3 | Version compatibility errors |
| **Generic & Catch-All Errors** | 3 | General purpose errors |
| **TOTAL** | **91** | All error codes in the protocol |

### 8.2 Error Code Ranges

Each error category occupies a specific range for easier debugging and monitoring:

| Category | Error Code Range | Example Use Cases |
|----------|-----------------|-------------------|
| Authorization & Permissions | 0-99 | Unauthorized access, admin requirements |
| Lottery State & Configuration | 100-199 | Paused state, draw lifecycle issues |
| Ticket Purchase & Validation | 200-299 | Number validation, purchase limits |
| Draw Execution & Randomness | 300-399 | VRF proof validation, randomness timing |
| Prize Distribution & Claims | 400-499 | Claim validation, prize calculations |
| Syndicate System | 500-599 | Member management, share calculations |
| Financial & Token Operations | 600-699 | Token transfers, USDC validation |
| Mathematical & Parameter Validation | 700-799 | Arithmetic errors, basis points |
| Account & PDA Validation | 800-899 | Account derivation, initialization |
| System & Operational Errors | 900-999 | Clock access, timeouts, retries |
| Game-Specific Errors | 1000-1099 | Rolldown, quick pick |
| Compatibility & Version Errors | 1100-1199 | Version mismatches, deprecated features |
| Generic & Catch-All Errors | 1200-1299 | Unknown errors, validation failures |

### 8.3 Common Error Scenarios

#### Ticket Purchase Failures
```rust
// User tries to buy ticket with invalid numbers
ErrorCode::InvalidNumbers
ErrorCode::DuplicateNumbers
ErrorCode::NumbersOutOfRange

// User doesn't have enough funds
ErrorCode::InsufficientFunds

// Purchase limits exceeded
ErrorCode::MaxTicketsExceeded
ErrorCode::MaxTicketsPerDrawExceeded
ErrorCode::BulkPurchaseLimitExceeded
```

#### Draw Execution Failures
```rust
// Randomness issues
ErrorCode::RandomnessNotResolved
ErrorCode::RandomnessExpired
ErrorCode::InvalidRandomnessProof

// Draw state issues
ErrorCode::DrawInProgress
ErrorCode::DrawNotReady
ErrorCode::DrawAlreadyCompleted
```

#### Prize Claiming Failures
```rust
// Already claimed
ErrorCode::AlreadyClaimed
ErrorCode::PrizeAlreadyClaimed

// No prize available
ErrorCode::NoPrizeToClaim
ErrorCode::TicketExpired
ErrorCode::InvalidTicket
```

#### Advanced Feature Errors
```rust
// Rolldown features
ErrorCode::RolldownNotActive
ErrorCode::RolldownAlreadyTriggered
ErrorCode::RolldownCalculationError

// Quick pick game
ErrorCode::QuickPickNotActive

// Lucky Numbers NFT
ErrorCode::LuckyNumbersLimitReached
ErrorCode::InsufficientMatchForNft

// Syndicate Wars
ErrorCode::SyndicateWarsNotActive
```

### 8.4 Error Handling Best Practices

#### Client-Side Error Handling
```typescript
// Example error handling in TypeScript
try {
    await buyTicket(wallet, numbers);
} catch (error) {
    if (error.message.includes("Unauthorized access attempt")) {
        console.error("Please connect your wallet");
    } else if (error.message.includes("Not enough funds")) {
        console.error("Insufficient USDC balance");
    } else if (error.message.includes("Duplicate numbers")) {
        console.error("Numbers must be unique");
    } else if (error.message.includes("Numbers out of valid range")) {
        console.error("Numbers must be between 1 and 45");
    } else if (error.message.includes("Ticket sale has ended")) {
        console.error("Draw is closed for purchases");
    } else if (error.message.includes("Lottery is currently paused")) {
        console.error("Lottery is temporarily paused");
    } else {
        console.error("Unknown error:", error.message);
    }
}
```

#### Server-Side Error Handling
```rust
// Example error handling in Rust
match result {
    Ok(_) => { /* Success */ }
    Err(error) => {
        match error {
            ErrorCode::Unauthorized => {
                msg!("Unauthorized access attempt");
                return Err(error.into());
            }
            ErrorCode::InsufficientFunds => {
                msg!("User has insufficient funds");
                return Err(error.into());
            }
            ErrorCode::InvalidNumbers => {
                msg!("Invalid ticket numbers provided");
                return Err(error.into());
            }
            // Handle other errors...
            _ => {
                msg!("Unexpected error: {:?}", error);
                return Err(error.into());
            }
        }
    }
}
```

#### Error Recovery Strategies
1. **Validation Errors** (InvalidNumbers, DuplicateNumbers, NumbersOutOfRange):
   - Prompt user to correct input
   - Provide clear validation messages
   - Suggest valid number ranges

2. **Authorization Errors** (Unauthorized, AdminAuthorityRequired):
   - Check wallet connection
   - Verify signature permissions
   - Request re-authentication

3. **Financial Errors** (InsufficientFunds, InsufficientTokenBalance):
   - Check token balances
   - Suggest minimum required amounts
   - Provide deposit instructions

4. **State Errors** (Paused, DrawInProgress, DrawNotReady):
   - Display current lottery state
   - Show next available draw time
   - Provide status updates

5. **Randomness Errors** (RandomnessNotResolved, RandomnessExpired):
   - Retry with exponential backoff
   - Monitor VRF oracle status
   - Provide fallback mechanisms

### 8.5 Testing Error Conditions

```rust
#[test]
fn test_ticket_validation_errors() {
    // Test invalid numbers
    let invalid_numbers = [0, 1, 2, 3, 4, 5]; // 0 is out of range
    assert_eq!(
        validate_numbers(&invalid_numbers),
        Err(ErrorCode::NumbersOutOfRange.into())
    );

    // Test duplicate numbers
    let duplicate_numbers = [1, 1, 2, 3, 4, 5];
    assert_eq!(
        validate_numbers(&duplicate_numbers),
        Err(ErrorCode::DuplicateNumbers.into())
    );

    // Test valid numbers
    let valid_numbers = [1, 2, 3, 4, 5, 45];
    assert!(validate_numbers(&valid_numbers).is_ok());
}

#[test]
fn test_financial_errors() {
    // Test insufficient funds
    let user_balance = 1_000_000; // $1.00
    let ticket_price = 2_500_000; // $2.50
    assert!(
        user_balance < ticket_price,
        "Should trigger InsufficientFunds error"
    );
}

#[test]
fn test_draw_state_errors() {
    // Test draw in progress
    let lottery_state = LotteryState {
        is_draw_in_progress: true,
        ..Default::default()
    };
    assert!(
        lottery_state.is_draw_in_progress,
        "Should trigger DrawInProgress error"
    );

    // Test paused lottery
    let lottery_state = LotteryState {
        is_paused: true,
        ..Default::default()
    };
    assert!(lottery_state.is_paused, "Should trigger Paused error");
}
```

### 8.6 Monitoring and Alerting

#### Key Error Metrics to Monitor
1. **Error Rate by Category**: Track error frequency across categories
2. **Top Errors**: Identify most common errors for optimization
3. **Error Trends**: Monitor error patterns over time
4. **Recovery Success Rate**: Track successful error recovery attempts

#### Alert Thresholds
- **Critical**: Authorization failures, financial errors
- **High**: Validation errors, state errors
- **Medium**: Randomness errors, system errors
- **Low**: Game-specific errors, compatibility errors

#### Error Logging Format
```json
{
  "timestamp": "2024-01-01T00:00:00Z",
  "error_code": "InvalidNumbers",
  "error_message": "Invalid ticket numbers.",
  "category": "Ticket Purchase & Validation",
  "user_id": "user_123",
  "transaction_id": "tx_456",
  "context": {
    "numbers": [0, 1, 2, 3, 4, 5],
    "expected_range": [1, 45]
  },
  "stack_trace": "..."
}
```

---

### 9.1 SDK Installation

```bash
# NPM
npm install @mazelprotocol/sdk

# Yarn
yarn add @mazelprotocol/sdk

# PNPM
pnpm add @mazelprotocol/sdk
```

### 9.2 Basic Usage

```typescript
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { MazelProtocol } from '@mazelprotocol/sdk';

// Initialize connection
const connection = new Connection('https://api.mainnet-beta.solana.com');

// Initialize SDK
const lotto = new MazelProtocol(connection, {
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
import { LottoError } from '@mazelprotocol/sdk';

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
            "mazelprotocol",
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
import { MazelProtocol } from '@mazelprotocol/sdk';

describe('MazelProtocol Integration', () => {
    let lotto: MazelProtocol;
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
solana-keygen new -o target/deploy/mazelprotocol-keypair.json

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
    vrfProgramId: new PublicKey('SW1TCH...xxxx'),
    oracleQueue: new PublicKey('QUEUE...xxxx'),
    
    // PDAs (derived)
    lotteryState: lottery_state_pda()[0],
    prizePoolUsdc: prize_pool_usdc_pda()[0],
    houseFeeUsdc: house_fee_usdc_pda()[0],
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
| **TEE** | Trusted Execution Environment - secure hardware enclave for randomness |
| **Commit-Reveal** | Pattern where user commits before randomness is known, preventing manipulation |
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
| 3 | 197,600 | 0.02110 | 1 : 47.4 |
| 2 | 1,370,850 | 0.146 | 1 : 6.8 |
| 1 | 3,948,048 | 0.4215 | 1 : 2.37 |
| 0 | 3,838,380 | 0.4098 | 1 : 2.44 |
| **Total** | **9,366,819** | **1.000** | |

### 12.3 Economic Parameters

| Parameter | Value | Notes |
|-----------|-------|-------|
| Ticket Price | $2.50 | Fixed in USDC |
| House Fee | 28–40% (dynamic) | Varies by jackpot level |
| Prize Pool | 60–72% | Remainder after house fee |
| Jackpot Allocation | 55.6% | Of prize pool (5560 BPS) |
| Fixed Prize Allocation | 39.4% | Of prize pool (3940 BPS) |
| Reserve Allocation | 3% | Of prize pool (300 BPS) |
| Insurance Allocation | 2% | Of prize pool (200 BPS) |
| Soft Cap | $1,750,000 | Probabilistic rolldown trigger |
| Hard Cap | $2,250,000 | Forced rolldown |
| Seed Amount | $500,000 | Post-rolldown reset |

### 12.4 Prize Transition System — FIXED → PARI-MUTUEL

> **🔒 CRITICAL OPERATOR PROTECTION:** All prizes START as FIXED amounts during normal operation, then TRANSITION to PARI-MUTUEL (shared pool) during rolldown events and high-volume draws. This hybrid system ensures **operator liability is ALWAYS CAPPED** while maintaining attractive +EV windows for players.

To ensure protocol sustainability while maintaining player value, MazelProtocol implements a hybrid prize system where prizes transition from fixed amounts to pari-mutuel (shared pool) distribution based on draw volume and conditions.

#### Fixed Prize Mode (Default) — NORMAL OPERATION

During normal operation with moderate ticket sales, prizes are **FIXED predetermined amounts**:

| Match Tier | Fixed Prize | Prize Mode | Operator Liability |
|------------|-------------|------------|-------------------|
| Match 5 | $4,000 | **FIXED** | Variable (depends on winners) |
| Match 4 | $150 | **FIXED** | Variable (depends on winners) |
| Match 3 | $5 | **FIXED** | Variable (depends on winners) |
| Match 2 | $2.50 free ticket | **FIXED** | Variable (depends on winners) |

Fixed prizes provide predictable player value and are funded by the fixed prize allocation (39.4% of prize pool).

**⚠️ Risk:** With fixed prizes, high winner count = high liability. Example: 10,000 Match 4 winners × $150 = $1,500,000 liability.

#### Pari-Mutuel Transition Triggers

Prizes **automatically transition** to pari-mutuel distribution when:

| Trigger | Condition | Effect |
|---------|-----------|--------|
| **Rolldown Event** | Jackpot ≥ $1.75M soft cap, no Match 6 winner | ALL prizes become pari-mutuel |
| **High-Volume Draw** | (Winners × Fixed Prize) > Prize Pool Allocation | Affected tiers become pari-mutuel |
| **Multiple Winners** | Winner count would exhaust fixed prize pool | Automatic pool sharing |

#### Pari-Mutuel Prize Calculation — ROLLDOWN MODE

For match tier $k$ with total pool $P_k$ and $W_k$ winners:

$$PrizePerWinner_k = \frac{P_k}{W_k} = \frac{PoolShare_k \times Jackpot}{WinnerCount_k}$$

**Rolldown Pool Allocation:**

| Tier | Pool Share | Pool at $1.75M | Pool at $2.25M |
|------|------------|----------------|----------------|
| Match 5 | 25% | $437,500 | $562,500 |
| Match 4 | 35% | $612,500 | $787,500 |
| Match 3 | 40% | $700,000 | $900,000 |
| **TOTAL** | **100%** | **$1,750,000** | **$2,250,000** |

**🔒 OPERATOR PROTECTION:** Total payout = EXACTLY the jackpot amount. Operator liability is mathematically CAPPED regardless of ticket volume or winner count.

#### Example: Why Pari-Mutuel Protects the Operator

**Scenario: 700,000 tickets sold during rolldown**

| Calculation | Fixed Prizes (Hypothetical) | Pari-Mutuel (Actual) |
|-------------|----------------------------|---------------------|
| Match 5 (~18 winners) | 18 × $4,000 = $72,000 | $437,500 ÷ 18 = ~$24,306/winner |
| Match 4 (~875 winners) | 875 × $150 = $131,250 | $612,500 ÷ 875 = ~$700/winner |
| Match 3 (~14,763 winners) | 14,763 × $5 = $73,815 | $700,000 ÷ 14,763 = ~$47/winner |
| **TOTAL LIABILITY** | **$277,065 + jackpot** | **$1,750,000 (CAPPED)** |

**Scenario: 2,000,000 tickets sold during rolldown (extreme volume)**

| Calculation | Fixed Prizes (Hypothetical) | Pari-Mutuel (Actual) |
|-------------|----------------------------|---------------------|
| Match 5 (~51 winners) | 51 × $4,000 = $204,000 | $437,500 ÷ 51 = ~$8,578/winner |
| Match 4 (~2,498 winners) | 2,498 × $150 = $374,700 | $612,500 ÷ 2,498 = ~$245/winner |
| Match 3 (~42,180 winners) | 42,180 × $5 = $210,900 | $700,000 ÷ 42,180 = ~$17/winner |
| **TOTAL LIABILITY** | **$789,600 + jackpot = UNBOUNDED** | **$1,750,000 (CAPPED)** |

**🔒 KEY INSIGHT:** With pari-mutuel, higher volume = lower per-winner prizes, but operator liability STAYS CAPPED. This is the fundamental protection that makes the protocol sustainable at any scale.

#### Implementation Benefits

1. **🔒 Operator Loss Limitation**: Maximum liability = jackpot amount (CAPPED)
2. **📈 Player Value Preservation**: +EV windows maintained during rolldown exploits
3. **🏛️ Protocol Sustainability**: Viable regardless of volume spikes
4. **⚖️ Fair Distribution**: All winners share pool proportionally
5. **📊 Predictable Economics**: Operator can model worst-case scenarios precisely

#### Smart Contract Implementation

```rust
/// Prize calculation mode
pub enum PrizeMode {
    Fixed,      // Fixed amount prizes (normal mode)
    PariMutuel, // Shared pool distribution (rolldown mode)
}

/// Determine prize mode based on conditions
pub fn determine_prize_mode(
    is_rolldown: bool,
    winner_count: u64,
    fixed_prize: u64,
    available_pool: u64,
) -> PrizeMode {
    // Rolldown always uses pari-mutuel
    if is_rolldown {
        return PrizeMode::PariMutuel;
    }
    
    // Transition to pari-mutuel if fixed prizes exceed pool
    if winner_count * fixed_prize > available_pool {
        return PrizeMode::PariMutuel;
    }
    
    PrizeMode::Fixed
}

/// Calculate prize based on mode
pub fn calculate_prize(
    match_tier: u8,
    winner_count: u64,
    total_pool: u64,
    mode: PrizeMode
) -> Result<u64> {
    match mode {
        PrizeMode::Fixed => match match_tier {
            5 => Ok(MATCH_5_PRIZE),      // $4,000
            4 => Ok(MATCH_4_PRIZE),      // $150
            3 => Ok(MATCH_3_PRIZE),      // $5
            2 => Ok(TICKET_PRICE),       // $2.50 free ticket
            _ => Err(ErrorCode::InvalidMatchTier.into()),
        },
        PrizeMode::PariMutuel => {
            if winner_count == 0 {
                return Ok(0);
            }
            // 🔒 CAPPED LIABILITY: Prize = Pool ÷ Winners
            Ok(total_pool / winner_count)
        }
    }
}

/// Calculate rolldown distribution (always pari-mutuel)
pub fn calculate_rolldown_prizes(
    jackpot: u64,
    match_5_winners: u64,
    match_4_winners: u64,
    match_3_winners: u64,
) -> RolldownPrizes {
    let match_5_pool = jackpot * ROLLDOWN_MATCH_5_BPS as u64 / 10000; // 25%
    let match_4_pool = jackpot * ROLLDOWN_MATCH_4_BPS as u64 / 10000; // 35%
    let match_3_pool = jackpot * ROLLDOWN_MATCH_3_BPS as u64 / 10000; // 40%
    
    RolldownPrizes {
        match_5_per_winner: if match_5_winners > 0 { match_5_pool / match_5_winners } else { 0 },
        match_4_per_winner: if match_4_winners > 0 { match_4_pool / match_4_winners } else { 0 },
        match_3_per_winner: if match_3_winners > 0 { match_3_pool / match_3_winners } else { 0 },
        // 🔒 TOTAL = match_5_pool + match_4_pool + match_3_pool = jackpot (CAPPED)
    }
}
```

#### Quick Pick Express — Same Transition System

Quick Pick Express (5/35) uses the identical Fixed → Pari-Mutuel transition:

| Mode | Match 4 Prize | Match 3 Prize | Operator Liability |
|------|---------------|---------------|-------------------|
| **Normal (FIXED)** | $100 | $4 | Variable |
| **Rolldown (PARI-MUTUEL)** | Pool ÷ Winners (~$3,247*) | Pool ÷ Winners (~$74.6*) | **CAPPED at $30k-$50k** |

*Estimated at ~12,000 tickets. Actual = 60% or 40% of jackpot ÷ winner count.

### 12.5 Contact & Resources

| Resource | Link |
|----------|------|
| Documentation | https://docs.mazelprotocol.io |
| GitHub | https://github.com/mazelprotocol |
| Discord | https://discord.gg/mazelprotocol |
| Twitter | https://twitter.com/MazelProtocol |
| Bug Bounty | https://mazelprotocol.io/security |

---

*Technical Specification v1.0.0*
*Last Updated: 2025*
*MazelProtocol Team*