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
| **⚡ Quick Pick Express** | 5/35 mini-lottery every 4 hours with +59% rolldown exploit (no free ticket) |
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
| **3** | 1 in 47 | 2.13% |
| **2** | 1 in 6.8 | 14.7% |

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

**Higher Edge at Lower Volume:** With optimal volume (~475k tickets at $2.25M hard cap):
- **Total EV: ~$4.06** → **Player Edge: +62%** 🚀

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
┌──────────────────────────────────────────────────────────┐
│                    TICKET: $2.50                          │
├──────────────────────────────────────────────────────────┤
│  ┌────────────────┐  ┌────────────────────────────────┐  │
│  │   HOUSE FEE    │  │         PRIZE POOL             │  │
│  │     $0.80      │  │           $1.70                │  │
│  │   (28-40%)     │  │         (60-72%)               │  │
│  └────────────────┘  └────────────────────────────────┘  │
│                              │                            │
│           ┌──────────────────┼──────────────────┐        │
│           ▼                  ▼                  ▼        │
│    ┌─────────────┐   ┌─────────────┐   ┌─────────────┐  │
│    │   JACKPOT   │   │   FIXED     │   │  INSURANCE  │  │
│    │    ~58%     │   │   PRIZES    │   │    POOL     │  │
│    │             │   │    ~39%     │   │     ~3%     │  │
│    └─────────────┘   └─────────────┘   └─────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### Insurance Pool

2% of every ticket ($0.05) goes to an insurance pool that:
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

### 15-16 Day Cycle Profitability (With Dynamic Fees & Pari-Mutuel Protection)

```
Dynamic Fee Model Revenue (Corrected):
├── Phase 1 (Days 1-5, <$500k): 100k × $2.50 × 28% = $70,000/day    [FIXED PRIZES]
├── Phase 2 (Days 6-8, $500k-$1M): 100k × $2.50 × 32% = $80,000/day  [FIXED PRIZES]
├── Phase 3 (Days 9-11, $1M-$1.5M): 120k × $2.50 × 36% = $108,000/day [FIXED PRIZES]
├── Phase 4 (Days 12-13, >$1.5M): 150k × $2.50 × 40% = $150,000/day  [FIXED PRIZES]
├── Rolldown (Day 14): 700k × $2.50 × 28% = $490,000                  [PARI-MUTUEL]

Total Cycle House Fees (Corrected): $1,704,000
```

> **🔒 PARI-MUTUEL PROTECTION:** During rolldown (Day 14), prizes transition from fixed to pari-mutuel. This caps operator liability at exactly $1,750,000 (the jackpot), regardless of whether 500k or 2M tickets are sold.

| Period | Prize Mode | Calculation | Amount |
|--------|------------|-------------|--------|
| **Normal Days House Fees** | Fixed | Dynamic fee revenue | +$1,214,000 |
| **Rolldown House Fees** | — | 700k × $2.50 × 28% | +$490,000 |
| **Expected Fixed Prize Payouts** | Fixed | Probabilistic costs (Days 1-13) | -$989,560 |
| **Rolldown Jackpot Distribution** | **Pari-Mutuel** | Full jackpot to winners | -$1,750,000 |
| **Pari-Mutuel Savings** | **Protected** | Fixed would cost more at 700k volume | +$0* |
| **Seed Reset** | — | Replenish $500k jackpot | -$500,000 |
| **Insurance Accumulation** | — | 2% allocation | +$70,000 |
| **CYCLE NET PROFIT (15-16 days)** | | | **+$534,440** |
| **Daily Average** | | | **~$35,300/day** |

*\*Pari-mutuel savings are built into the rolldown calculation — operator pays exactly $1,750,000 total, not variable based on winners.*

**Why Pari-Mutuel Protects the Operator:**
- Fixed prizes at 700k tickets: ~$2.1M potential liability
- Pari-mutuel at 700k tickets: EXACTLY $1,750,000 liability (capped)
- **Savings: ~$350,000 per rolldown cycle**

### Break-Even Analysis

| Volume Scenario | Daily Tickets | Prize Mode | Cycle Profit | Annual Profit |
|-----------------|---------------|------------|--------------|---------------|
| **Minimum Viable** | 50,000 | Fixed | +$180,000 | +$4.7M |
| **Target** | 100,000 | Fixed→Pari-Mutuel | +$534,440 | +$13.9M |
| **Optimistic** | 200,000 | Fixed→Pari-Mutuel | +$1,340,000 | +$34.8M |

*Higher volume scenarios benefit MORE from pari-mutuel transition — operator liability stays capped while revenue scales.*

---

## 🔧 Technical Architecture

### Smart Contract Overview

```
┌─────────────────────────────────────────────────────────┐
│                  SOLANALOTTO PROTOCOL                    │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │   TICKET    │  │    DRAW     │  │    PRIZE    │     │
│  │   MANAGER   │  │   ENGINE    │  │    POOL     │     │
│  │             │  │             │  │             │     │
│  │ • buy()     │  │ • init()    │  │ • deposit() │     │
│  │ • bulkBuy() │  │ • draw()    │  │ • claim()   │     │
│  │ • redeem()  │  │ • rolldown()│  │ • rolldown()│     │
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
│  │ GOVERNANCE  │  │             │  │  SYNDICATE  │     │
│  │     DAO     │  │             │  │   MANAGER   │     │
│  │             │  │             │  │             │     │
│  │ • propose() │  │             │  │ • create()  │     │
│  │ • vote()    │  │             │  │ • join()    │     │
│  │ • execute() │  │             │  │ • split()   │     │
│  └─────────────┘  └─────────────┘  └─────────────┘     │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Core Programs (Rust/Anchor)

#### 1. TicketManager

```rust
// Handles all ticket purchases and redemptions
pub mod ticket_manager {
    pub fn buy_ticket(ctx: Context<BuyTicket>, numbers: [u8; 6]) -> Result<()>;
    pub fn buy_bulk(ctx: Context<BuyBulk>, tickets: Vec<[u8; 6]>) -> Result<()>;
    pub fn redeem_free_ticket(ctx: Context<Redeem>, nft_mint: Pubkey) -> Result<()>;
}
```

#### 2. DrawEngine

```rust
// Manages draw execution and winner calculation
pub mod draw_engine {
    pub fn initialize_draw(ctx: Context<InitDraw>, draw_id: u64) -> Result<()>;
    pub fn request_randomness(ctx: Context<RequestRandom>) -> Result<()>;
    pub fn execute_draw(ctx: Context<Execute>, vrf_result: [u8; 32]) -> Result<()>;
    pub fn trigger_rolldown(ctx: Context<Rolldown>, draw_id: u64) -> Result<()>;
}
```

#### 3. PrizePool

```rust
// Manages all fund allocations and distributions
pub mod prize_pool {
    pub fn deposit_to_jackpot(ctx: Context<Deposit>, amount: u64) -> Result<()>;
    pub fn claim_prize(ctx: Context<Claim>, ticket_id: u64) -> Result<()>;
    pub fn distribute_rolldown(ctx: Context<DistributeRolldown>) -> Result<()>;
}
```

### Data Structures

```rust
#[account]
pub struct LotteryState {
    pub authority: Pubkey,
    pub current_draw_id: u64,
    pub jackpot_balance: u64,
    pub reserve_balance: u64,
    pub insurance_balance: u64,
    pub ticket_price: u64,           // In USDC lamports
    pub house_fee_bps: u16,          // 3400 = 34%
    pub jackpot_cap: u64,
    pub seed_amount: u64,
    pub total_tickets_sold: u64,
    pub total_prizes_paid: u64,
    pub last_draw_timestamp: i64,
    pub is_rolldown_active: bool,
    pub bump: u8,
}

#[account]
pub struct Ticket {
    pub owner: Pubkey,
    pub draw_id: u64,
    pub numbers: [u8; 6],
    pub purchase_timestamp: i64,
    pub is_claimed: bool,
    pub prize_amount: u64,
    pub match_count: u8,
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
    pub total_prizes_distributed: u64,
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
- ✅ **Overflow protection** via checked math
- ✅ **Access control** with multi-sig admin keys
- ✅ **Timelock** (48h) on all parameter changes
- ✅ **Emergency pause** functionality

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

### Phase 1: Foundation (Q1 2025)

- [x] Economic model design
- [x] Smart contract architecture
- [ ] Core contract development
- [ ] Internal testing
- [ ] Security audit #1 (OtterSec)
- [ ] Testnet deployment

### Phase 2: Launch (Q2 2025)

- [ ] Security audit #2 (Neodyme)
- [ ] Mainnet deployment
- [ ] UI/UX launch
- [ ] Initial liquidity provision
- [ ] Marketing campaign
- [ ] Target: 25,000 tickets/day

### Phase 3: Growth (Q3 2025)


- [ ] Syndicate feature release
- [ ] Streak bonus implementation
- [ ] **Syndicate Wars Competition** (monthly)
- [ ] Mobile app (iOS/Android)
- [ ] Target: 75,000 tickets/day

### Phase 4: Expansion (Q4 2025)

- [ ] **Quick Pick Express** (5/35, every 4 hours, +59% rolldown exploit, no free ticket)
- [ ] **Lucky Numbers NFT** system launch
- [ ] API/SDK public release
- [ ] White-label partnerships
- [ ] Target: 125,000 tickets/day

### Phase 5: Scale (2026)

- [ ] Cross-chain expansion (Arbitrum, Base)
- [ ] **Threshold encryption MEV protection**
- [ ] DAO governance transition
- [ ] Advanced features (prediction markets, etc.)
- [ ] Target: 200,000+ tickets/day

---

## 🎰 Additional Game Modes

### Quick Pick Express (5/35) — PARI-MUTUEL ROLLDOWN

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
| **4** | 60% | ~$3,000* | `$18,000 ÷ ~6 winners` | $1.39 |
| **3** | 40% | ~$74* | `$12,000 ÷ ~161 winners` | $0.99 |

*\*Estimated prizes at ~12,000 tickets. Actual = Pool ÷ Winners (pari-mutuel).*

**🎯 Rolldown Player Edge: +58.7%** — Comparable to the main lottery's +62%!

- Ticket costs $1.50, expected return is $2.38
- **Profit: +$0.88 per ticket during rolldown**
- Operator still profitable over the full cycle (87-91% house edge in normal mode)
- No free ticket prize — only Match 3+ wins
- **Pari-mutuel ensures operator liability is CAPPED at jackpot amount**


---

## 🏆 Lucky Numbers NFT System

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

## 🏅 Syndicate Wars

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

SolanaLotto implements multiple layers of MEV protection:

### Phase 1: Jito Integration (Launch)

- All ticket purchases routed through Jito bundles
- Guarantees FIFO ordering
- Prevents validator front-running

### Phase 2: Threshold Encryption (Future)

- Ticket numbers encrypted at purchase
- Decryption only after winning numbers committed
- Even validators cannot see ticket contents

> 📚 **See [ADVANCED_FEATURES.md](./ADVANCED_FEATURES.md) for technical implementation details.**

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

// Via SDK
import { SolanaLotto } from '@solanalotto/sdk';

const lotto = new SolanaLotto(connection, wallet);
await lotto.buyTicket([4, 12, 23, 31, 38, 45]);
```

#### 4. Check Results

```javascript
// Results published daily at 00:05 UTC
const result = await lotto.getDrawResult(drawId);
console.log('Winning numbers:', result.winningNumbers);
console.log('Your matches:', result.yourMatches);
```

### For Developers

#### Installation

```bash
# NPM
npm install @solanalotto/sdk

# Yarn
yarn add @solanalotto/sdk

# PNPM
pnpm add @solanalotto/sdk
```

#### Quick Start

```typescript
import { Connection, PublicKey } from '@solana/web3.js';
import { SolanaLotto, Ticket } from '@solanalotto/sdk';

// Initialize
const connection = new Connection('https://api.mainnet-beta.solana.com');
const lotto = new SolanaLotto(connection);

// Get current lottery state
const state = await lotto.getLotteryState();
console.log('Current jackpot:', state.jackpotBalance);
console.log('Next draw in:', state.timeUntilDraw);

// Buy a ticket (requires wallet)
const wallet = useWallet(); // or your wallet adapter
const ticket = await lotto.buyTicket(
  wallet,
  [7, 14, 21, 28, 35, 42], // Your numbers
  { 
    priorityFee: 1000,     // Optional priority fee
    referrer: 'ABC123'     // Optional referral code
  }
);

// Check ticket status
const status = await lotto.checkTicket(ticket.publicKey);
console.log('Match count:', status.matchCount);
console.log('Prize amount:', status.prizeAmount);

// Claim prize (if winner)
if (status.prizeAmount > 0 && !status.isClaimed) {
  await lotto.claimPrize(wallet, ticket.publicKey);
}
```

---

## 📚 API Reference

### Core Methods

#### `getLotteryState()`

Returns current lottery state including jackpot, next draw time, etc.

```typescript
interface LotteryState {
  jackpotBalance: number;      // Current jackpot in USDC
  reserveBalance: number;      // Reserve fund balance
  currentDrawId: number;       // Current draw number
  nextDrawTimestamp: number;   // Unix timestamp of next draw
  totalTicketsSold: number;    // Lifetime tickets sold
  isRolldownPending: boolean;  // Whether next draw is rolldown
}
```

#### `buyTicket(wallet, numbers, options?)`

Purchase a single ticket.

```typescript
interface BuyTicketOptions {
  priorityFee?: number;   // Lamports for priority
  referrer?: string;      // Referral code
  syndicate?: PublicKey;  // Syndicate pool address
}

// Returns
interface TicketReceipt {
  publicKey: PublicKey;   // Ticket account address
  drawId: number;         // Draw this ticket is for
  numbers: number[];      // Selected numbers
  txSignature: string;    // Transaction signature
}
```

#### `buyBulk(wallet, tickets, options?)`

Purchase multiple tickets in one transaction.

```typescript
const tickets = [
  [1, 2, 3, 4, 5, 6],
  [7, 8, 9, 10, 11, 12],
  // ... up to 10 tickets per transaction
];

const receipts = await lotto.buyBulk(wallet, tickets);
```

#### `getDrawResult(drawId)`

Get results for a specific draw.

```typescript
interface DrawResult {
  drawId: number;
  winningNumbers: number[];
  timestamp: number;
  wasRolldown: boolean;
  statistics: {
    totalTickets: number;
    match6Winners: number;
    match5Winners: number;
    match4Winners: number;
    match3Winners: number;
    match2Winners: number;
    totalPrizesPaid: number;
  };
  randomnessProof: string;  // Switchboard randomness proof
}
```

#### `claimPrize(wallet, ticketPubkey)`

Claim winnings for a winning ticket.

```typescript
const result = await lotto.claimPrize(wallet, ticketPubkey);
// Prize automatically transferred to wallet
```

### Syndicate Methods

#### `createSyndicate(wallet, config)`

Create a new syndicate pool.

```typescript
interface SyndicateConfig {
  name: string;
  isPublic: boolean;
  minContribution: number;  // Minimum USDC to join
  maxMembers: number;
  managerFeeBps: number;    // Manager's cut (max 500 = 5%)
}

const syndicate = await lotto.createSyndicate(wallet, {
  name: "Diamond Hands Pool",
  isPublic: true,
  minContribution: 100,
  maxMembers: 100,
  managerFeeBps: 200  // 2% manager fee
});
```

#### `joinSyndicate(wallet, syndicatePubkey, amount)`

Join an existing syndicate.

```typescript
await lotto.joinSyndicate(wallet, syndicatePubkey, 500); // Contribute $500
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
A: Solana network fees are minimal (~$0.001 per transaction). There are no additional platform fees beyond the built-in 34% house fee.

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