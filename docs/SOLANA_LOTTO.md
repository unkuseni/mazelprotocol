# 🎰 SolanaLotto Protocol

### The First Provably Fair Lottery with Intentional Positive-EV Rolldown Mechanics on Solana

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Solana](https://img.shields.io/badge/Solana-Mainnet-purple)](https://solana.com)
[![Audit Status](https://img.shields.io/badge/Audit-Pending-orange)]()

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [How It Works](#-how-it-works)
- [Game Parameters](#-game-parameters)
- [Prize Structure](#-prize-structure)
- [The Rolldown Mechanism](#-the-rolldown-mechanism)
- [Economic Model](#-economic-model)

- [Technical Architecture](#-technical-architecture)
- [Security](#-security)
- [Roadmap](#-roadmap)
- [Getting Started](#-getting-started)
- [API Reference](#-api-reference)
- [FAQ](#-faq)
- [Legal Disclaimer](#-legal-disclaimer)

---

## 🎯 Overview

**SolanaLotto** is a decentralized lottery protocol built on Solana that introduces a revolutionary **rolldown mechanism** inspired by the Massachusetts Cash WinFall lottery. Unlike traditional lotteries where the house always wins, SolanaLotto creates predictable windows of **positive expected value (+EV)** for players while maintaining sustainable operator profitability.

### The Core Innovation

When the jackpot reaches its cap and no one matches all 6 numbers, the entire prize pool **"rolls down"** to lower tiers, creating a mathematically exploitable opportunity where skilled players can achieve 15%+ returns per ticket.

This isn't a bug—**it's the feature**.

---

## ✨ Key Features

| Feature | Description |
|---------|-------------|
| **🎲 Provably Fair** | Switchboard Randomness with TEE ensures verifiable randomness for every draw |
| **📈 Positive-EV Windows** | Rolldown events create guaranteed profit opportunities |
| **💰 Dynamic House Fee** | 28-40% fee scales with jackpot level for optimal extraction |
| **🔄 Soft + Hard Caps** | Two-tier rolldown system prevents calendar gaming |

| **👥 Syndicate System** | Built-in pool creation with automatic prize splitting |
| **🔥 Streak Bonuses** | Rewards for consistent players |
| **🎰 Lucky Numbers NFT** | Win NFTs that earn 1% of future jackpots |
| **⚡ Quick Pick Express** | 5/35 mini-lottery every 4 hours with +67% rolldown exploit (no free ticket) |
| **🛡️ MEV Protection** | Jito integration prevents front-running |
| **📊 Full Transparency** | All balances and draws verifiable on-chain |

> 📚 **See [ADVANCED_FEATURES.md](./ADVANCED_FEATURES.md) for detailed specifications of all enhanced features.**

---

## 🎮 How It Works

### For Players

```
1. Connect your Solana wallet
2. Pick 6 numbers from 1-46 (or use Quick Pick)
3. Purchase tickets ($2.50 each in USDC)
4. Wait for the daily draw
5. Prizes automatically credited to your wallet
```

### For Sophisticated Players (The Exploit)

```
1. Monitor the jackpot level
2. When jackpot approaches $1.75M cap, prepare capital
3. If no Match 6 winner → Rolldown triggers
4. During rolldown: EV = $2.78 per $2.50 ticket (+11.2% edge)
5. Buy in volume, collect profits
```

---

## 📊 Game Parameters

### Core Configuration

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| **Ticket Price** | $2.50 USDC | Accessible price point for mass adoption |
| **Matrix** | 6/46 | Sweet spot: 1 in 9.37M jackpot odds, reasonable lower-tier odds |
| **Jackpot Seed** | $500,000 | Attractive starting point for each cycle |
| **Jackpot Cap** | $1,750,000 | Triggers rolldown, sustainable for operator |
| **Draw Frequency** | Daily (UTC 00:00) | Maintains engagement and jackpot growth |

### Odds Breakdown (6/46 Matrix)

| Match | Odds | Probability |
|-------|------|-------------|
| **6 (Jackpot)** | 1 in 9,366,819 | 0.0000107% |
| **5** | 1 in 39,028 | 0.00256% |
| **4** | 1 in 800 | 0.125% |
| **3** | 1 in 47.4 | 2.11% |
| **2** | 1 in 6.8 | 14.6% |

---

## 🏆 Prize Structure

> **⚠️ PRIZE TRANSITION SYSTEM:** All prizes START as FIXED amounts but TRANSITION to PARI-MUTUEL (shared pool) during high-volume draws and rolldown events. This hybrid system protects the operator from excessive losses while maintaining attractive player value.

### Normal Mode (Jackpot < $1.75M) — Fixed Prizes

During normal operation with moderate ticket sales, prizes are **FIXED amounts** funded by the fixed prize allocation pool:

| Match | Prize Type | Prize Amount | Expected Value |
|-------|------------|--------------|----------------|
| **6 (Jackpot)** | Variable Pool | $500K → $1.75M (growing) | ~$0.11 |
| **5** | **Fixed** | $4,000 | $0.10 |
| **4** | **Fixed** | $150 | $0.19 |
| **3** | **Fixed** | $5 | $0.11 |
| **2** | **Fixed** | Free Ticket ($2.50 value) | $0.37 |

**Total Player EV: ~$0.88** on a $2.50 ticket  
**House Edge: ~65%** (standard for lotteries)

**Pari-Mutuel Transition Trigger:** If winner count × fixed prize > prize pool allocation, prizes automatically convert to pari-mutuel distribution to protect operator solvency.

### 🔥 Rolldown Mode (Jackpot ≥ $1.75M, No Match 6 Winner) — Pari-Mutuel Prizes

> **💡 KEY INSIGHT:** During rolldown events, ALL prizes use **PARI-MUTUEL** (shared pool) distribution. This means actual per-winner prizes depend on total ticket sales and winner count. The estimates below assume ~700,000 tickets sold during rolldown.

When the jackpot caps and no one hits the jackpot, **everything changes**:

| Match | Pool Share | Est. Prize* | Formula | Expected Value |
|-------|------------|-------------|---------|----------------|
| **6** | 0% | $0 (jackpot emptied) | — | $0 |
| **5** | 25% | ~$24,400* | `$437,500 ÷ ~18 winners` | $0.63 |
| **4** | 35% | ~$700* | `$612,500 ÷ ~875 winners` | $0.87 |
| **3** | 40% | ~$47* | `$700,000 ÷ ~14,763 winners` | $1.00 |
| **2** | — | Free Ticket | Fixed $2.50 value | $0.37 |

*\*Estimated prizes based on 700,000 tickets sold. Actual prizes = Pool Share × Jackpot ÷ Winner Count (pari-mutuel).*

**Total Player EV: ~$2.87** on a $2.50 ticket (at 700k volume)  
**Player Edge: +14.8%** 🎯

**Higher Edge at Lower Volume:**
- At soft cap ($1.75M) with ~475k tickets: **Total EV: ~$4.05** → **Player Edge: +62%** 🚀
- At hard cap ($2.25M) with ~475k tickets: **Total EV: ~$5.10** → **Player Edge: +104%** 🚀

### Why Match 3 Gets the Most (40% of Rolldown Pool)

The Match 3 tier receives 40% of the rolldown pool because:
- **High winner frequency**: ~2.13% of tickets win Match 3
- **Lower variance**: More predictable pari-mutuel returns for volume players
- **Critical for exploit**: Makes the +EV window reliable, not just theoretical
- **Pari-mutuel efficiency**: More winners = smaller per-winner prize, but total pool is larger

### Why Pari-Mutuel Limits Operator Loss

The transition from fixed to pari-mutuel prizes during rolldown ensures:
1. **Capped liability**: Total payout = Jackpot (fixed amount), regardless of winners
2. **No unbounded risk**: Even with 2M+ tickets, operator only pays out the jackpot
3. **Player value preserved**: +EV windows still exist, just scaled by volume
4. **Sustainable economics**: Protocol remains profitable across all volume scenarios

---

## 🔄 The Rolldown Mechanism

### Single Random Rolldown System

SolanaLotto uses a **probabilistic rolldown** system that prevents calendar gaming:

| Parameter | Threshold | Behavior |
|-----------|-----------|----------|
| **Soft Cap** | $1,750,000 | Rolldown can trigger randomly each draw |
| **Hard Cap** | $2,250,000 | Rolldown forced (100% of jackpot distributes) |

### Probabilistic Trigger Mechanism

When jackpot exceeds $1.75M but is below $2.25M:

- Each draw, if no jackpot winner, rolldown triggers with probability:
  ```
  P(rolldown) = (jackpot - soft_cap) / (hard_cap - soft_cap)
  ```
- Probability increases linearly as jackpot grows
- At hard cap ($2.25M), probability = 100% (forced rolldown)

```
Example: Jackpot at $2,000,000

Probability calculation:
├── Excess over soft cap: $250,000
├── Total range: $500,000 ($2.25M - $1.75M)
├── Rolldown probability: $250,000 / $500,000 = 50%

If rolldown triggers:
├── 100% of jackpot distributes
├── Distribution follows standard rolldown percentages
├── Jackpot resets to $500,000 seed
```

**Why this works**: Rolldown occurs at a random time between the caps, making timing unpredictable while maintaining +EV opportunities.

### Hard Cap (Forced Rolldown)

Triggered when **BOTH** conditions are met:

1. ✅ Jackpot balance ≥ $2,250,000
2. ✅ No tickets match all 6 numbers in the draw

If jackpot reaches hard cap, rolldown is guaranteed in that draw (assuming no jackpot winner).

> **🔒 Operator Protection:** During forced rolldowns, all prizes are pari-mutuel. The operator's maximum liability is exactly the jackpot amount ($2.25M), regardless of how many tickets are sold or how many winners there are.

### Full Rolldown Distribution Flow — PARI-MUTUEL

```
┌─────────────────────────────────────────────────────────┐
│           HARD CAP ROLLDOWN TRIGGERED (PARI-MUTUEL)      │
│                  Jackpot: $2,250,000                     │
│         Total Operator Liability: EXACTLY $2,250,000     │
└─────────────────────────────────────────────────────────┘
                           │
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
    ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
    │   MATCH 5   │ │   MATCH 4   │ │   MATCH 3   │
    │  POOL: 25%  │ │  POOL: 35%  │ │  POOL: 40%  │
    │  $562,500   │ │  $787,500   │ │  $900,000   │
    └─────────────┘ └─────────────┘ └─────────────┘
           │               │               │
           ▼               ▼               ▼
    ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
    │ PARI-MUTUEL │ │ PARI-MUTUEL │ │ PARI-MUTUEL │
    │  ~11 winners│ │ ~766 winners│ │~17,697 win- │
    │ ~$51,136 ea*│ │ ~$1,028 ea* │ │ ners ~$51ea*│
    └─────────────┘ └─────────────┘ └─────────────┘
    
    * Estimated prizes at ~697,800 tickets. Actual = Pool ÷ Winners
    
    Formula: Prize per Winner = (Pool Share × Jackpot) ÷ Winner Count
```

### Post-Rolldown Reset

After a rolldown:
1. Jackpot resets to $500,000 seed
2. Normal mode resumes
3. Cycle begins again (~15-16 days to next cap)

---

## 💰 Economic Model

> **🔒 OPERATOR PROTECTION PRINCIPLE:** All prizes START as FIXED amounts during normal mode, then TRANSITION to PARI-MUTUEL (shared pool) during high-volume draws and rolldown events. This ensures operator liability is always capped while players still enjoy +EV windows.

### Dynamic House Fee System

Instead of a fixed fee, the house fee **scales with jackpot level**:

| Jackpot Level | House Fee | Prize Pool | Effect |
|---------------|-----------|------------|--------|
| < $500,000 | **28%** | 72% | Attracts early players |
| $500,000 - $1,000,000 | **32%** | 68% | Standard operations |
| $1,000,000 - $1,500,000 | **36%** | 64% | Building anticipation |
| $1,500,000 - $2,250,000 | **40%** | 60% | Maximum extraction |
| During Rolldown | **28%** | 72% | Encourages volume |

**Why this works**: Players accept higher fees during jackpot excitement, while lower fees during rolldown maximize volume (more important than margin).

### Revenue Allocation (Per $2.50 Ticket at 32% Fee)

```
┌───────────────────────────────────────────────────────────────────┐
│                        TICKET: $2.50                              │
├───────────────────────────────────────────────────────────────────┤
│  ┌────────────────┐  ┌─────────────────────────────────────────┐ │
│  │   HOUSE FEE    │  │            PRIZE POOL                   │ │
│  │     $0.80      │  │              $1.70                      │ │
│  │     (32%)      │  │              (68%)                      │ │
│  └────────────────┘  └─────────────────────────────────────────┘ │
│                                    │                              │
│         ┌──────────────┬───────────┼───────────┬──────────┐      │
│         ▼              ▼           ▼           ▼          │      │
│  ┌────────────┐ ┌────────────┐ ┌─────────┐ ┌──────────┐ │      │
│  │  JACKPOT   │ │   FIXED    │ │ RESERVE │ │INSURANCE │ │      │
│  │   55.6%    │ │  PRIZES    │ │   3%    │ │  POOL    │ │      │
│  │   $0.95    │ │   39.4%    │ │  $0.05  │ │   2%     │ │      │
│  │            │ │   $0.67    │ │         │ │  $0.03   │ │      │
│  └────────────┘ └────────────┘ └─────────┘ └──────────┘ │      │
└───────────────────────────────────────────────────────────────────┘
```

### Insurance Pool

2% of the prize pool (~$0.03 per ticket at 32% fee) goes to an insurance pool that:
- Covers unexpected high-variance events
- Tops up weak rolldowns
- Provides emergency reserve
- Target: ~$450k reserve (approximately 90 days of insurance accumulation at target volume)

### Prize Mode Transition System

| Mode | When Active | Prize Type | Operator Liability |
|------|-------------|------------|-------------------|
| **Fixed** | Normal draws, moderate volume | Predetermined amounts | Variable (depends on winners) |
| **Pari-Mutuel** | Rolldown events, high-volume draws | Pool ÷ Winners | **CAPPED at pool size** |

**Transition Triggers:**
1. ✅ Rolldown event → All prizes become pari-mutuel
2. ✅ Winner count × fixed prize > prize pool → Auto-transition to pari-mutuel
3. ✅ High-volume draw (>500k tickets) → Pari-mutuel for Match 3-5

**Why This Matters:** During a rolldown with 1M+ tickets, fixed prizes could bankrupt the protocol. Pari-mutuel ensures total payout = jackpot amount (capped), regardless of volume.

### ~15 Day Cycle Profitability (With Dynamic Fees & Pari-Mutuel Protection)

> **IMPORTANT:** Operator profit = **house fees** minus **seed cost**. Fixed prize payouts and rolldown distributions are funded entirely from the **prize pool** (player funds), not from operator revenue. The prize pool is self-sustaining.

```
Dynamic Fee Model — House Fee Revenue (Operator Revenue):
├── Phase A (Days 1-5, $500k-$1M):  100k × $2.50 × 32% = $80,000/day   [FIXED PRIZES]
├── Phase B (Days 6-11, $1M-$1.5M): 100k × $2.50 × 36% = $90,000/day   [FIXED PRIZES]
├── Phase C (Days 12-14, >$1.5M):   100k × $2.50 × 40% = $100,000/day  [FIXED PRIZES]
├── Rolldown (Day 15):               700k × $2.50 × 28% = $490,000      [PARI-MUTUEL]

Total Cycle House Fees: ~$1,690,000
```

> **🔒 PARI-MUTUEL PROTECTION:** During rolldown (Day 15), prizes transition from fixed to pari-mutuel. This caps operator liability at exactly $1,750,000 (the jackpot), regardless of whether 500k or 2M tickets are sold.

**Operator Profit & Loss (Per Cycle):**

| Component | Source | Amount |
|-----------|--------|--------|
| **Normal Days House Fees (~14 days)** | Operator Revenue | +$1,200,000 |
| **Rolldown House Fees (1 day, 28%)** | Operator Revenue | +$490,000 |
| **Total House Fees** | | **+$1,690,000** |
| **Jackpot Seed (next cycle)** | Operator Cost | -$500,000 |
| **NET OPERATOR PROFIT** | | **+$1,190,000** |
| **Daily Average** | | **~$79,300/day** |

**Prize Pool Flows (Self-Sustaining — Not Operator Cost):**

| Flow | Amount |
|------|--------|
| Prize pool contributions (normal, ~14 days) | +$2,300,000 |
| Prize pool contributions (rolldown day, 72%) | +$1,260,000 |
| Expected fixed prize payouts (14 normal days) | -$1,065,700 |
| Free ticket liability (rolldown Match 2) | -$256,410 |
| Jackpot distribution (pari-mutuel) | -$1,750,000 |
| Reserve accumulation (3%) | +$106,800 |
| Insurance accumulation (2%) | +$71,200 |

**Why Pari-Mutuel Protects the Operator:**
- Fixed prizes at 700k tickets: ~$2.1M potential liability (unbounded)
- Pari-mutuel at 700k tickets: EXACTLY $1,750,000 liability (capped)
- **Risk eliminated regardless of volume**

### Break-Even Analysis

| Volume Scenario | Daily Tickets | Prize Mode | Cycle Profit (Fees − Seed) | Annual Profit |
|-----------------|---------------|------------|---------------------------|---------------|
| **Minimum Viable** | 50,000 | Fixed→PM | +$450,000 | +$5.5M |
| **Target** | 100,000 | Fixed→Pari-Mutuel | +$1,190,000 | +$28.9M |
| **Optimistic** | 200,000 | Fixed→Pari-Mutuel | +$2,670,000 | +$130M |

*Higher volume scenarios benefit MORE from pari-mutuel transition — operator liability stays capped while house fee revenue scales linearly.*

---

## 🔧 Technical Architecture

### Smart Contract Overview

The protocol is implemented as **two separate Anchor programs** on Solana. There is no on-chain governance DAO — the authority is a single signer (intended to be a multi-sig wallet in production). Configuration changes use an inline 24-hour timelock.

```
┌─────────────────────────────────────────────────────────┐
│           MAIN LOTTERY PROGRAM (solana_lotto)            │
│      Program ID: 7WyaHk2u8AgonsryMpnvbtp42CfLJFPQpyY5… │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │   TICKET    │  │    DRAW     │  │    PRIZE    │     │
│  │             │  │             │  │             │     │
│  │ • buy       │  │ • commit   │  │ • claim     │     │
│  │ • buy_bulk  │  │ • execute  │  │ • bulk claim│     │
│  │ • free tkt  │  │ • finalize │  │ • all claim │     │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘     │
│         │                │                │             │
│         └────────────────┼────────────────┘             │
│                          │                              │
│                   ┌──────┴──────┐                       │
│                   │ SWITCHBOARD │                       │
│                   │ RANDOMNESS  │                       │
│                   │(TEE+Commit) │                       │
│                   └─────────────┘                       │
│                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │    ADMIN    │  │  SYNDICATE  │  │  SYNDICATE  │     │
│  │             │  │             │  │    WARS     │     │
│  │ • pause     │  │ • create   │  │ • init      │     │
│  │ • config    │  │ • join     │  │ • register  │     │
│  │ • solvency  │  │ • leave    │  │ • finalize  │     │
│  │ • emergency │  │ • tickets  │  │ • prizes    │     │
│  │ • authority │  │ • prizes   │  │ • claim     │     │
│  └─────────────┘  └─────────────┘  └─────────────┘     │
│                                                          │
├─────────────────────────────────────────────────────────┤
│           QUICK PICK EXPRESS PROGRAM (quickpick)         │
│      Program ID: 7XC1KT5mvsHHXbR2mH6er138fu2tJ4L2fAgm… │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐  │
│  │  ADMIN   │  │  TICKET  │  │   DRAW   │  │ PRIZE  │  │
│  │ • init   │  │ • buy    │  │ • commit │  │ • claim│  │
│  │ • pause  │  │  ($50    │  │ • execute│  │        │  │
│  │ • config │  │   gate)  │  │ • final. │  │        │  │
│  │ • emerg. │  │          │  │          │  │        │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────┘  │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Main Program Instructions (solana_lotto)

All instructions live within a single `solana_lotto` Anchor program module:

```rust
pub mod solana_lotto {
    // --- Initialization ---
    pub fn initialize(ctx, params) -> Result<()>;
    pub fn fund_seed(ctx) -> Result<()>;
    pub fn add_reserve_funds(ctx, amount) -> Result<()>;

    // --- Admin ---
    pub fn pause(ctx, reason) -> Result<()>;
    pub fn unpause(ctx) -> Result<()>;
    pub fn update_config(ctx, params) -> Result<()>;       // immediate (legacy)
    pub fn propose_config(ctx, params) -> Result<()>;      // 24h timelock step 1
    pub fn execute_config(ctx, params) -> Result<()>;      // 24h timelock step 2
    pub fn cancel_config_proposal(ctx) -> Result<()>;
    pub fn check_solvency(ctx) -> Result<()>;              // permissionless
    pub fn withdraw_house_fees(ctx, amount) -> Result<()>;
    pub fn propose_authority(ctx, new_authority) -> Result<()>;
    pub fn accept_authority(ctx) -> Result<()>;
    pub fn cancel_authority_transfer(ctx) -> Result<()>;
    pub fn cancel_draw(ctx) -> Result<()>;                 // stuck draw recovery
    pub fn force_finalize_draw(ctx, reason) -> Result<()>; // emergency
    pub fn emergency_fund_transfer(ctx, source, amount, reason) -> Result<()>;
    pub fn reclaim_expired_prizes(ctx, params) -> Result<()>;

    // --- Tickets ---
    pub fn buy_ticket(ctx, params) -> Result<()>;          // single ticket
    pub fn buy_bulk(ctx, params) -> Result<()>;            // up to 50 tickets

    // --- Draw Lifecycle ---
    pub fn commit_randomness(ctx) -> Result<()>;           // commit phase
    pub fn execute_draw(ctx) -> Result<()>;                // reveal phase
    pub fn finalize_draw(ctx, params) -> Result<()>;       // set winners & prizes

    // --- Prize Claims ---
    pub fn claim_prize(ctx) -> Result<()>;                 // single ticket
    pub fn claim_bulk_prize(ctx, params) -> Result<()>;    // one from bulk
    pub fn claim_all_bulk_prizes(ctx) -> Result<()>;       // all from bulk

    // --- Syndicates ---
    pub fn create_syndicate(ctx, params) -> Result<()>;
    pub fn join_syndicate(ctx, params) -> Result<()>;
    pub fn leave_syndicate(ctx) -> Result<()>;
    pub fn close_syndicate(ctx) -> Result<()>;
    pub fn withdraw_creator_contribution(ctx, amount) -> Result<()>;
    pub fn buy_syndicate_tickets(ctx, params) -> Result<()>;
    pub fn create_syndicate_ticket(ctx, numbers) -> Result<()>;
    pub fn distribute_syndicate_prize(ctx, params) -> Result<()>;
    pub fn claim_syndicate_member_prize(ctx, params) -> Result<()>;
    pub fn update_syndicate_config(ctx, params) -> Result<()>;
    pub fn remove_syndicate_member(ctx, params) -> Result<()>;
    pub fn transfer_syndicate_creator(ctx, params) -> Result<()>;

    // --- Syndicate Wars ---
    pub fn initialize_syndicate_wars(ctx, params) -> Result<()>;
    pub fn register_for_syndicate_wars(ctx) -> Result<()>;
    pub fn update_syndicate_wars_stats(ctx, params) -> Result<()>;
    pub fn finalize_syndicate_wars(ctx) -> Result<()>;
    pub fn distribute_syndicate_wars_prizes(ctx, params) -> Result<()>;
    pub fn claim_syndicate_wars_prize(ctx, params) -> Result<()>;
}
```

### Data Structures

> **Updated v3.0** — Reflects actual on-chain account fields.

```rust
#[account]
pub struct LotteryState {
    pub authority: Pubkey,
    pub pending_authority: Option<Pubkey>,   // two-step transfer
    pub switchboard_queue: Pubkey,
    pub current_randomness_account: Pubkey,
    pub current_draw_id: u64,
    pub jackpot_balance: u64,
    pub reserve_balance: u64,
    pub insurance_balance: u64,
    pub fixed_prize_balance: u64,            // 39.4% allocation
    pub ticket_price: u64,                   // in USDC lamports
    pub house_fee_bps: u16,                  // dynamic: 2800-4000
    pub jackpot_cap: u64,
    pub seed_amount: u64,
    pub soft_cap: u64,
    pub hard_cap: u64,
    pub next_draw_timestamp: i64,
    pub draw_interval: i64,
    pub commit_slot: u64,
    pub commit_timestamp: i64,
    pub current_draw_tickets: u64,
    pub total_tickets_sold: u64,
    pub total_prizes_paid: u64,
    pub total_prizes_committed: u64,
    pub is_draw_in_progress: bool,
    pub is_rolldown_active: bool,
    pub is_paused: bool,
    pub is_funded: bool,
    pub bump: u8,
    pub config_timelock_end: i64,            // inline timelock
    pub pending_config_hash: [u8; 32],
    pub emergency_transfer_total: u64,       // daily cap tracking
    pub emergency_transfer_window_start: i64,
}

#[account]
pub struct TicketData {
    pub owner: Pubkey,
    pub draw_id: u64,
    pub numbers: [u8; 6],
    pub purchase_timestamp: i64,
    pub is_claimed: bool,
    pub match_count: u8,
    pub prize_amount: u64,
    pub syndicate: Option<Pubkey>,
    pub bump: u8,
}

#[account]
pub struct DrawResult {
    pub draw_id: u64,
    pub winning_numbers: [u8; 6],
    pub randomness_proof: [u8; 32],
    pub timestamp: i64,
    pub total_tickets: u64,
    pub was_rolldown: bool,
    pub match_6_winners: u32,
    pub match_5_winners: u32,
    pub match_4_winners: u32,
    pub match_3_winners: u32,
    pub match_2_winners: u32,
    pub match_6_prize_per_winner: u64,
    pub match_5_prize_per_winner: u64,
    pub match_4_prize_per_winner: u64,
    pub match_3_prize_per_winner: u64,
    pub match_2_prize_per_winner: u64,
    pub is_explicitly_finalized: bool,
    pub total_committed: u64,     // for expired prize reclaim accounting
    pub total_reclaimed: u64,
    pub bump: u8,
}
```

### Randomness (Switchboard with TEE)

SolanaLotto uses **Switchboard Randomness** with Trusted Execution Environments (TEEs) and a commit-reveal pattern for provably fair draws.

**Why Switchboard?**
- **TEE Security**: Randomness is generated inside protected hardware that cannot be altered or inspected
- **Commit-Reveal Pattern**: Prevents selective revelation attacks
- **Slashing Mechanism**: Oracle operators that misbehave lose their $SWTCH stake

```
┌──────────────────────────────────────────────────────────┐
│              SWITCHBOARD COMMIT-REVEAL FLOW               │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  COMMIT PHASE ┌─────────────────────────────────┐        │
│     │         │  1. Create randomness account    │        │
│     │         │  2. Commit to current slothash   │        │
│     │         │  3. Store commit slot on-chain   │        │
│     ▼         └─────────────────────────────────┘        │
│                                                           │
│  GENERATE     ┌─────────────────────────────────┐        │
│     │         │  4. Oracle generates randomness  │        │
│     │         │     inside TEE (secure enclave)  │        │
│     │         │  5. Randomness based on commit   │        │
│     ▼         └─────────────────────────────────┘        │
│                                                           │
│  REVEAL PHASE ┌─────────────────────────────────┐        │
│     │         │  6. Reveal randomness on-chain   │        │
│     │         │  7. Verify commit slot matches   │        │
│     │         │  8. Convert to winning numbers   │        │
│     ▼         └─────────────────────────────────┘        │
│                                                           │
│  SETTLEMENT   ┌─────────────────────────────────┐        │
│     │         │  9. Calculate winners            │        │
│     │         │  10. Distribute prizes           │        │
│     │         │  11. Check rolldown conditions   │        │
│     ▼         └─────────────────────────────────┘        │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

**Security Guarantees:**
- Neither the protocol nor oracle operators can predict randomness before commit
- Revealed randomness is cryptographically tied to the committed slot
- All proofs are verifiable on-chain by anyone

---

## 🔐 Security

### Audit Status

| Auditor | Status | Report |
|---------|--------|--------|
| **OtterSec** | 🔄 Scheduled | Q2 2025 |
| **Neodyme** | 🔄 Scheduled | Q2 2025 |
| **Halborn** | 📋 Planned | Q3 2025 |

### Security Measures

#### Smart Contract Security

- ✅ **Reentrancy guards** on all state-changing functions
- ✅ **Overflow protection** via checked/saturating math throughout
- ✅ **Access control** — single-signer authority (multi-sig wallet recommended for production)
- ✅ **Config timelock** (24h propose → execute flow with SHA256 hash verification)
- ✅ **Two-step authority transfer** (propose → accept, prevents accidental loss of control)
- ✅ **Emergency pause** functionality
- ✅ **Permissionless solvency check** — anyone can verify on-chain balances match internal accounting; auto-pauses on mismatch
- ✅ **Emergency fund transfer** with daily cap (50% of source per 24h rolling window)
- ✅ **Expired prize reclaim** — sweep unclaimed prizes after 90-day expiration window

#### Randomness Security

- ✅ **Switchboard Randomness** with Trusted Execution Environments (TEEs)
- ✅ **Commit-reveal pattern** prevents selective revelation attacks
- ✅ **On-chain verification** for full transparency
- ✅ **Economic security** via $SWTCH slashing for misbehaving oracles
- ✅ **MEV protection** via Jito integration and encrypted ticket submissions

#### Operational Security

- ✅ **Multi-sig treasury** (3-of-5 required)
- ✅ **Gradual withdrawal limits** for large prizes
- ✅ **Real-time monitoring** and anomaly detection
- ✅ **Bug bounty program** (up to $100,000)

### Bug Bounty Program

| Severity | Reward |
|----------|--------|
| Critical (funds at risk) | $50,000 - $100,000 |
| High (protocol disruption) | $10,000 - $50,000 |
| Medium (limited impact) | $2,000 - $10,000 |
| Low (informational) | $500 - $2,000 |

Report vulnerabilities to: `security@solanalotto.io`

---

## 🗺️ Roadmap

### ✅ Completed: Core Programs

- [x] Economic model design
- [x] Smart contract architecture
- [x] Main lottery program (solana_lotto) — 6/46, 32 instructions
- [x] Quick Pick Express program (quickpick) — 5/35, 12 instructions
- [x] Ticket purchasing (single + bulk up to 50)
- [x] Draw lifecycle (commit → execute → finalize)
- [x] Prize claiming (single, bulk, claim-all)
- [x] Dynamic house fee system (28–40%)
- [x] Soft/hard cap rolldown (probabilistic + forced)
- [x] Fixed → pari-mutuel prize transition
- [x] Insurance pool (2% allocation, emergency access with daily caps)
- [x] Reserve pool (3% allocation)
- [x] Fixed prize pool (39.4% allocation)
- [x] Switchboard commit-reveal randomness with entropy validation
- [x] Free ticket credits for Match 2
- [x] Per-user ticket limits (5,000/draw)
- [x] Syndicate system (full CRUD: create, join, leave, close, buy tickets, distribute & claim prizes, config, remove members, transfer creator)
- [x] Syndicate Wars competition (initialize, register, update stats, finalize, distribute & claim prizes)
- [x] Config timelock (24h propose → execute with SHA256 hash)
- [x] Two-step authority transfer (propose → accept)
- [x] Permissionless solvency check (auto-pauses on mismatch)
- [x] Emergency fund transfer (with 50% daily cap per rolling window)
- [x] Expired prize reclaim (90-day window)
- [x] Draw recovery (cancel stuck draws, force finalize)
- [x] Verification hash (SHA256 tamper-resistant winner count auditing)
- [x] Statistical plausibility checks on winner counts
- [x] MEV mitigation via tightened slot window (10 slots / ~4s)
- [x] Streak tracking on UserStats
- [x] Internal testing (unit tests + integration tests)

### 🔜 Next Priority

- [ ] Apply streak bonus to prize calculations (logic exists, just not wired in)
- [ ] Lucky Numbers NFT instructions (data structure & constants ready)
- [ ] Jito MEV protection integration
- [ ] Client SDK package (`@solanalotto/sdk`)
- [ ] Security audit #1
- [ ] Devnet deployment & public testnet

### 📋 Future Phases

- [ ] Security audit #2
- [ ] Mainnet deployment
- [ ] UI/UX launch
- [ ] Threshold encryption MEV protection
- [ ] On-chain governance DAO (replace single-signer authority)
- [ ] Mobile app (iOS/Android)
- [ ] White-label partnerships
- [ ] Cross-chain expansion

---

## 🎰 Additional Game Modes

### Quick Pick Express (5/35) — PARI-MUTUEL ROLLDOWN ✅ Implemented (Separate Program)

High-frequency mini-lottery with **full rolldown mechanics and +EV exploit** — exclusive to committed players:

> ⚠️ **$50 Gate Requirement**: Must have spent $50+ lifetime in the main lottery to access Quick Pick Express.

| Parameter | Value |
|-----------|-------|
| Matrix | 5/35 (Pick 5 from 35) |
| Ticket Price | $1.50 USDC |
| Draw Frequency | Every 4 hours (6x daily) |
| Jackpot Seed | $5,000 |
| Soft Cap | $30,000 (probabilistic rolldown) |
| Hard Cap | $50,000 (forced rolldown) |
| Cycle Duration | ~2-3 days |

#### Normal Mode Prizes — FIXED
| Match | Prize Type | Prize | Odds |
|-------|------------|-------|------|
| **5 (Jackpot)** | Variable Pool | $5,000 → $50,000 (growing) | 1 in 324,632 |
| **4** | **Fixed** | $100 | 1 in 2,164 |
| **3** | **Fixed** | $4 | 1 in 74.6 |

*Prizes remain fixed during normal mode. Transition to pari-mutuel occurs during rolldown events.*

#### 🔥 Rolldown Mode (No Match 5 Winner) — PARI-MUTUEL (THE EXPLOIT!)

> **🔒 OPERATOR PROTECTION:** During rolldown, all prizes transition to PARI-MUTUEL. Operator liability is capped at exactly the jackpot amount ($30,000-$40,000), regardless of ticket volume.

| Match | Pool Share | Est. Prize* | Formula | Expected Value |
|-------|------------|-------------|---------|----------------|
| **4** | 60% | ~$3,247* | `$18,000 ÷ ~5.5 winners` | $1.50 |
| **3** | 40% | ~$74.6* | `$12,000 ÷ ~161 winners` | $1.00 |

*\*Estimated prizes at ~12,000 tickets. Actual = Pool ÷ Winners (pari-mutuel).*

**🎯 Rolldown Player Edge: +66.7%** — Comparable to the main lottery's +62%!

- Ticket costs $1.50, expected return is $2.50 (EV = J/N exactly, since there is no Match 2 prize)
- **Profit: +$1.00 per ticket during rolldown**
- Operator still profitable over the full cycle (87-91% house edge in normal mode)
- No free ticket prize — only Match 3+ wins
- **Pari-mutuel ensures operator liability is CAPPED at jackpot amount**


---

## 🏆 Lucky Numbers NFT System ❌ *Not Yet Implemented*

> **Design only** — The `LuckyNumbersNFT` data structure, constants, events, and error codes exist in the main program, but **no instructions** have been written to mint NFTs, claim bonuses, or manage governance controls. The description below is the planned design.

When you win Match 4 or higher, you receive a **Lucky Numbers NFT** containing your winning combination:

- **Tradeable** on secondary markets (Tensor, Magic Eden)
- **Future jackpot bonus**: If those exact numbers ever hit the jackpot, you receive **1% of the jackpot**
- Even if you don't play that draw!

```
Example:
├── You win Match 5 with [4, 12, 23, 31, 38, 45]
├── You receive Lucky Numbers NFT #4521
├── 2 years later, those numbers hit jackpot for $1.8M
├── You automatically receive $18,000
```



---

## 🏅 Syndicate Wars ✅ Implemented

Monthly competition where syndicates compete for the best win rate:

**Prize Pool**: 1% of monthly ticket sales (~$75,000/month)

| Rank | Prize Share |
|------|-------------|
| 🥇 1st Place | 50% ($37,500) |
| 🥈 2nd Place | 25% ($18,750) |
| 🥉 3rd Place | 15% ($11,250) |
| 4th-10th | Split 10% |

**Eligibility**: Minimum 1,000 tickets purchased during month

---

---

## 🛡️ MEV Protection

SolanaLotto implements MEV protection with one measure currently on-chain and two planned for future phases:

### ✅ Implemented: Tightened Reveal Window

- Randomness reveal must occur within **10 slots (~4 seconds)** of commit
- Previously was 50 slots (~20s) — tightened to minimize the window for MEV actors to observe randomness before the reveal transaction lands
- Authority-only execution of `execute_draw` prevents permissionless front-running of the reveal

### ❌ Planned: Jito Integration (Future)

- Ticket purchases routed through Jito bundles for FIFO ordering
- Prevents validator front-running of ticket purchases
- **Not yet implemented** — no Jito tip accounts or bundle logic exists in the on-chain programs

### ❌ Planned: Threshold Encryption (Future)

- Ticket numbers encrypted at purchase time
- Decryption only after winning numbers committed
- Even validators cannot see ticket contents
- **Not yet implemented** — no encrypted ticket structs, key management, or decryption logic exists

> 📚 **See [ADVANCED_FEATURES.md](./ADVANCED_FEATURES.md) for the full design specification of planned MEV features.**

---

## 🚀 Getting Started

### For Players

#### 1. Connect Wallet

```bash
# Supported wallets:
- Phantom
- Solflare
- Backpack
- Ledger (via Phantom)
```

#### 2. Get USDC

```bash
# Deposit USDC to your Solana wallet
# Minimum: $2.50 (1 ticket)
# Recommended: $25+ for meaningful play
```

#### 3. Buy Tickets

```javascript
// Via Web Interface
1. Go to https://solanalotto.io
2. Click "Buy Tickets"
3. Select your numbers or use Quick Pick
4. Confirm transaction in wallet

// Via Anchor client (SDK not yet published)
import { Program, AnchorProvider } from '@coral-xyz/anchor';

const program = new Program(IDL, PROGRAM_ID, provider);
await program.methods
  .buyTicket({ numbers: [4, 12, 23, 31, 38, 45], useFreeTicket: false })
  .accounts({ /* ...required accounts */ })
  .rpc();
```

#### 4. Check Results

```javascript
// Results published daily at 00:05 UTC
const [drawResultPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("draw"), new BN(drawId).toArrayLike(Buffer, "le", 8)],
  program.programId
);
const result = await program.account.drawResult.fetch(drawResultPda);
console.log('Winning numbers:', result.winningNumbers);
```

### For Developers

#### Installation

> ⚠️ **SDK NOT YET PUBLISHED** — The `@solanalotto/sdk` NPM package does not exist yet. For now, interact with the on-chain programs directly via Anchor's generated client.

```bash
# Use Anchor directly:
npm install @coral-xyz/anchor @solana/web3.js @solana/spl-token
```

#### Quick Start

```typescript
import { Connection, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';
import { IDL } from './idl/solana_lotto'; // Generated by `anchor build`

const PROGRAM_ID = new PublicKey('7WyaHk2u8AgonsryMpnvbtp42CfLJFPQpyY5p9ys6FiF');

// Initialize
const connection = new Connection('https://api.devnet.solana.com');
const provider = new AnchorProvider(connection, wallet, {});
const program = new Program(IDL, PROGRAM_ID, provider);

// Get current lottery state
const [lotteryStatePda] = PublicKey.findProgramAddressSync(
  [Buffer.from("lottery")], PROGRAM_ID
);
const state = await program.account.lotteryState.fetch(lotteryStatePda);
console.log('Current jackpot:', state.jackpotBalance.toNumber() / 1e6, 'USDC');
console.log('Current draw ID:', state.currentDrawId.toNumber());

// Buy a ticket (requires wallet and derived PDAs)
const drawId = state.currentDrawId;
const ticketIndex = state.currentDrawTickets; // next ticket index
const [ticketPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("ticket"),
   drawId.toArrayLike(Buffer, "le", 8),
   ticketIndex.toArrayLike(Buffer, "le", 8)],
  PROGRAM_ID
);
const [userStatsPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("user"), wallet.publicKey.toBuffer()], PROGRAM_ID
);

await program.methods
  .buyTicket({ numbers: [7, 14, 21, 28, 35, 42], useFreeTicket: false })
  .accounts({
    player: wallet.publicKey,
    lotteryState: lotteryStatePda,
    ticket: ticketPda,
    playerUsdc: playerUsdcAta,       // player's USDC ATA
    prizePoolUsdc: prizePoolUsdcPda, // PDA token account
    houseFeeUsdc: houseFeeUsdcPda,   // PDA token account
    insurancePoolUsdc: insurancePoolUsdcPda,
    userStats: userStatsPda,
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  })
  .rpc();

// Fetch ticket and check status
const ticket = await program.account.ticketData.fetch(ticketPda);
console.log('Match count:', ticket.matchCount);
console.log('Prize amount:', ticket.prizeAmount.toNumber() / 1e6, 'USDC');

// Claim prize (if winner and not yet claimed)
if (ticket.prizeAmount.toNumber() > 0 && !ticket.isClaimed) {
  await program.methods.claimPrize()
    .accounts({ /* ...required accounts */ })
    .rpc();
}
```

---

## 📚 API Reference

> ⚠️ **SDK NOT YET PUBLISHED** — The `@solanalotto/sdk` NPM package does not exist yet.
> The API interfaces below describe the **planned SDK design**. For now, interact with the
> on-chain programs directly via Anchor's generated client or the IDL.
>
> See the [Quick Start § For Developers](#for-developers) section above for working Anchor examples.

### On-Chain Program Instructions (Main Lottery)

All instructions are called via Anchor's `program.methods.<instruction>()` pattern.

| Category | Instruction | Description |
|----------|------------|-------------|
| **Init** | `initialize(params)` | Create lottery state (once) |
| **Init** | `fund_seed()` | Deposit seed USDC, unpause |
| **Init** | `add_reserve_funds(amount)` | Add funds to reserve |
| **Admin** | `pause(reason)` / `unpause()` | Emergency stop |
| **Admin** | `propose_config(params)` | Start 24h timelock |
| **Admin** | `execute_config(params)` | Apply config after timelock |
| **Admin** | `cancel_config_proposal()` | Cancel pending config |
| **Admin** | `check_solvency()` | Permissionless balance check |
| **Admin** | `withdraw_house_fees(amount)` | Withdraw operator fees |
| **Admin** | `propose_authority(pubkey)` | Step 1 of authority transfer |
| **Admin** | `accept_authority()` | Step 2 of authority transfer |
| **Admin** | `cancel_authority_transfer()` | Cancel pending transfer |
| **Admin** | `cancel_draw()` | Recover stuck draw (timeout) |
| **Admin** | `force_finalize_draw(reason)` | Emergency finalize (no prizes) |
| **Admin** | `emergency_fund_transfer(source, amount, reason)` | Move funds between pools |
| **Admin** | `reclaim_expired_prizes(params)` | Sweep unclaimed prizes (90d) |
| **Ticket** | `buy_ticket(params)` | Buy single ticket (6 numbers) |
| **Ticket** | `buy_bulk(params)` | Buy up to 50 tickets |
| **Draw** | `commit_randomness()` | Commit phase (Switchboard) |
| **Draw** | `execute_draw()` | Reveal phase (winning numbers) |
| **Draw** | `finalize_draw(params)` | Set winner counts & prizes |
| **Prize** | `claim_prize()` | Claim single ticket prize |
| **Prize** | `claim_bulk_prize(params)` | Claim one from bulk ticket |
| **Prize** | `claim_all_bulk_prizes()` | Claim all from bulk ticket |
| **Syndicate** | `create_syndicate(params)` | Create group pool |
| **Syndicate** | `join_syndicate(params)` | Join with USDC contribution |
| **Syndicate** | `leave_syndicate()` | Leave and get refund |
| **Syndicate** | `close_syndicate()` | Close (creator only, empty) |
| **Syndicate** | `buy_syndicate_tickets(params)` | Buy tickets with pool funds |
| **Syndicate** | `distribute_syndicate_prize(params)` | Distribute prize to members |
| **Syndicate** | `claim_syndicate_member_prize(params)` | Member claims their share |
| **Syndicate** | `update_syndicate_config(params)` | Update name/public/fee |
| **Syndicate** | `remove_syndicate_member(params)` | Creator removes member |
| **Syndicate** | `transfer_syndicate_creator(params)` | Transfer creator role |
| **Wars** | `initialize_syndicate_wars(params)` | Start monthly competition |
| **Wars** | `register_for_syndicate_wars()` | Register syndicate |
| **Wars** | `update_syndicate_wars_stats(params)` | Update stats (authority) |
| **Wars** | `finalize_syndicate_wars()` | End competition |
| **Wars** | `distribute_syndicate_wars_prizes(params)` | Set ranks for top 10 |
| **Wars** | `claim_syndicate_wars_prize(params)` | Claim competition prize |

### On-Chain Program Instructions (Quick Pick Express)

| Instruction | Description |
|------------|-------------|
| `initialize(params)` | Create Quick Pick state |
| `fund_seed()` | Deposit seed USDC, unpause |
| `pause(reason)` / `unpause()` | Emergency stop |
| `update_config(params)` | Update configuration |
| `withdraw_house_fees(amount)` | Withdraw operator fees |
| `add_reserve_funds(amount)` | Add reserve funds |
| `cancel_draw(reason)` | Cancel stuck draw |
| `force_finalize_draw(reason)` | Emergency finalize |
| `emergency_fund_transfer(source, amount, reason)` | Move funds between pools |
| `buy_ticket(params)` | Buy ticket (5 numbers, $50 gate) |
| `commit_randomness()` | Commit phase |
| `execute_draw()` | Reveal phase |
| `finalize_draw(params)` | Set winners & prizes |
| `claim_prize()` | Claim winning ticket |

### Planned SDK Methods (Future)

The following methods describe the **planned** `@solanalotto/sdk` API. These do **not exist yet**.

```typescript
// Planned — NOT YET IMPLEMENTED
import { SolanaLotto } from '@solanalotto/sdk';

const lotto = new SolanaLotto(connection);
const state = await lotto.getLotteryState();
await lotto.buyTicket(wallet, [7, 14, 21, 28, 35, 42]);
await lotto.claimPrize(wallet, ticketPubkey);
await lotto.createSyndicate(wallet, { name: "Alpha", isPublic: true, managerFeeBps: 200 });
await lotto.joinSyndicate(wallet, syndicatePubkey, 500_000_000);
```

---

## ❓ FAQ

### General

**Q: Is this legal?**  
A: SolanaLotto operates as a decentralized protocol. Users are responsible for ensuring compliance with their local laws. The protocol does not accept users from prohibited jurisdictions.

**Q: How do I know the draws are fair?**  
A: All randomness is generated using Switchboard Randomness with Trusted Execution Environments (TEEs). The commit-reveal pattern ensures neither the protocol nor oracle operators can predict or manipulate the outcome. All proofs are verifiable on-chain.

**Q: What happens if the smart contract has a bug?**  
A: The protocol undergoes multiple security audits. Additionally, there is an emergency pause function, insurance reserve, and bug bounty program. In extreme cases, the DAO can vote on remediation measures.

### The Rolldown

**Q: How often do rolldowns happen?**  
A: At target volume (100k tickets/day), rolldowns occur approximately every 13-14 days. The exact timing depends on ticket sales velocity and whether anyone hits the jackpot.

**Q: Can I predict when a rolldown will happen?**  
A: You can monitor the jackpot level on-chain. When it approaches $1.75M, a rolldown becomes likely. However, the exact draw depends on whether anyone matches 6 numbers.

**Q: What's the maximum I can profit during rolldown?**  
A: With an 11.2% edge and sufficient volume, sophisticated players historically see 10-15% returns. However, variance exists—individual results may vary.

### Technical

**Q: What wallet do I need?**  
A: Any Solana-compatible wallet works. We recommend Phantom or Solflare for the best experience.

**Q: Are there transaction fees?**  
A: Solana network fees are minimal (~$0.001 per transaction). There are no additional platform fees beyond the built-in 28–40% dynamic house fee (varies by jackpot level).

**Q: Can I use a bot to buy tickets?**  
A: Yes, the SDK supports programmatic ticket purchases. However, there are rate limits (max 100 tickets per wallet per draw) to prevent abuse.

---

## ⚖️ Legal Disclaimer

### Risk Disclosure

SolanaLotto is a decentralized lottery protocol. By participating, you acknowledge and accept the following risks:

1. **Financial Risk**: Lottery participation should be considered entertainment. Most players will lose money over time. Only risk what you can afford to lose.

2. **Smart Contract Risk**: Despite audits, smart contracts may contain undiscovered vulnerabilities that could result in loss of funds.

3. **Regulatory Risk**: Cryptocurrency lottery regulations vary by jurisdiction. Users are solely responsible for ensuring their participation is legal in their location.

4. **Market Risk**: The value of USDC stablecoins may fluctuate.

5. **No Guarantees**: Past performance (including rolldown profitability) does not guarantee future results.

### Prohibited Jurisdictions

Users from the following locations are prohibited from participating:

- United States and its territories
- United Kingdom
- Australia
- France
- Netherlands
- Other jurisdictions where online gambling is prohibited

### Age Requirement

You must be at least 18 years old (or the legal gambling age in your jurisdiction, whichever is higher) to participate.

### Not Financial Advice

Nothing in this documentation constitutes financial, investment, legal, or tax advice. Consult qualified professionals before participating.

---

## 📞 Contact & Community

| Channel | Link |
|---------|------|
| 🌐 Website | [https://solanalotto.io](https://solanalotto.io) |
| 📱 Twitter/X | [@SolanaLotto](https://twitter.com/SolanaLotto) |
| 💬 Discord | [discord.gg/solanalotto](https://discord.gg/solanalotto) |
| 📧 Email | hello@solanalotto.io |
| 🔒 Security | security@solanalotto.io |
| 📄 GitHub | [github.com/solanalotto](https://github.com/solanalotto) |

---

## 📊 Implementation Status Summary

| Category | Feature | Status |
|----------|---------|--------|
| **Core** | 6/46 Lottery (buy, bulk, claim) | ✅ |
| **Core** | Quick Pick Express 5/35 (separate program) | ✅ |
| **Core** | Switchboard commit-reveal randomness | ✅ |
| **Core** | Dynamic house fee (28–40%) | ✅ |
| **Core** | Soft/hard cap rolldown | ✅ |
| **Core** | Fixed → pari-mutuel prize transition | ✅ |
| **Core** | Insurance pool (2%) | ✅ |
| **Syndicate** | Full CRUD + tickets + prizes | ✅ |
| **Syndicate** | Syndicate Wars competition | ✅ |
| **Admin** | Config timelock (24h) | ✅ |
| **Admin** | Two-step authority transfer | ✅ |
| **Admin** | Permissionless solvency check | ✅ |
| **Admin** | Emergency fund transfer (daily cap) | ✅ |
| **Admin** | Expired prize reclaim | ✅ |
| **Admin** | Draw recovery (cancel / force finalize) | ✅ |
| **Security** | Verification hash (SHA256) | ✅ |
| **Security** | Statistical plausibility checks | ✅ |
| **Security** | Entropy validation on randomness | ✅ |
| **Partial** | Streak tracking | ⚠️ Tracked, bonus not applied |
| **Partial** | MEV protection | ⚠️ Slot window only |
| **Future** | Lucky Numbers NFT | ❌ Data struct only |
| **Future** | Jito MEV integration | ❌ |
| **Future** | Threshold encryption | ❌ |
| **Future** | SDK (`@solanalotto/sdk`) | ❌ |
| **Future** | Governance DAO | ❌ |

---

## 📜 License

SolanaLotto Protocol is released under the [MIT License](LICENSE).

```
MIT License

Copyright (c) 2025 SolanaLotto Protocol

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

<div align="center">

**Built with ❤️ on Solana**

*The house always wins... except during rolldowns. 🎰*

</div>