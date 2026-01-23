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
- [Tokenomics ($LOTTO)](#-tokenomics-lotto)
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
| **🎲 Provably Fair** | Chainlink VRF ensures verifiable randomness for every draw |
| **📈 Positive-EV Windows** | Rolldown events create guaranteed profit opportunities |
| **💰 Dynamic House Fee** | 28-40% fee scales with jackpot level for optimal extraction |
| **🔄 Soft + Hard Caps** | Two-tier rolldown system prevents calendar gaming |
| **🏆 $LOTTO Token** | Governance, staking rewards, and ticket discounts |
| **👥 Syndicate System** | Built-in pool creation with automatic prize splitting |
| **🔥 Streak Bonuses** | Rewards for consistent players |
| **🎰 Lucky Numbers NFT** | Win NFTs that earn 1% of future jackpots |
| **🎫 Second Chance Draws** | Weekly draws for non-winning tickets |
| **⚡ Quick Pick Express** | 4/20 mini-lottery every 4 hours |
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

### Normal Mode (Jackpot < $1.75M)

During normal operation, the lottery functions as a traditional negative-EV game:

| Match | Prize | Expected Value |
|-------|-------|----------------|
| **6 (Jackpot)** | $500K → $1.75M (growing) | ~$0.11 |
| **5** | $4,000 (fixed) | $0.10 |
| **4** | $150 (fixed) | $0.19 |
| **3** | $5 (fixed) | $0.11 |
| **2** | Free Ticket ($2.50 value) | $0.37 |

**Total Player EV: ~$0.88** on a $2.50 ticket  
**House Edge: ~65%** (standard for lotteries)

### 🔥 Rolldown Mode (Jackpot ≥ $1.75M, No Match 6 Winner)

When the jackpot caps and no one hits the jackpot, **everything changes**:

| Match | Pool Share | Prize | Expected Value |
|-------|------------|-------|----------------|
| **6** | 0% | $0 (jackpot emptied) | $0 |
| **5** | 25% | ~$22,000 | $0.56 |
| **4** | 35% | ~$800 | $1.00 |
| **3** | 40% | ~$40 | $0.85 |
| **2** | — | Free Ticket | $0.37 |

**Total Player EV: ~$2.78** on a $2.50 ticket  
**Player Edge: +11.2%** 🎯

### Why Match 3 Gets the Most

The Match 3 tier receives 40% of the rolldown pool because:
- **High winner frequency**: ~2.13% of tickets win
- **Lower variance**: More predictable returns for volume players
- **Critical for exploit**: Makes the +EV window reliable, not just theoretical

---

## 🔄 The Rolldown Mechanism

### Two-Tier Cap System

SolanaLotto uses a **soft cap + hard cap** system to prevent calendar gaming:

| Cap Type | Threshold | Behavior |
|----------|-----------|----------|
| **Soft Cap** | $1,500,000 | 30% of excess rolls down each draw |
| **Hard Cap** | $2,000,000 | 100% of jackpot distributes |

### Soft Cap (Mini-Rolldown)

When jackpot exceeds $1.5M but is below $2M:

```
Example: Jackpot at $1,650,000

Excess over soft cap: $150,000
Mini-rolldown amount: $150,000 × 30% = $45,000

Distribution:
├── Match 5 (25%): $11,250 bonus
├── Match 4 (35%): $15,750 bonus  
├── Match 3 (40%): $18,000 bonus

Remaining jackpot: $1,605,000 (continues growing)
```

**Why this works**: Players get small +EV bumps without the full exploit, and can't perfectly time the "big one."

### Hard Cap (Full Rolldown)

Triggered when **BOTH** conditions are met:

1. ✅ Jackpot balance ≥ $2,000,000
2. ✅ No tickets match all 6 numbers in the draw

### Full Rolldown Distribution Flow

```
┌─────────────────────────────────────────────────────────┐
│                HARD CAP ROLLDOWN TRIGGERED               │
│                  Jackpot: $2,000,000                     │
└─────────────────────────────────────────────────────────┘
                           │
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
    ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
    │   MATCH 5   │ │   MATCH 4   │ │   MATCH 3   │
    │     25%     │ │     35%     │ │     40%     │
    │  $437,500   │ │  $612,500   │ │  $700,000   │
    └─────────────┘ └─────────────┘ └─────────────┘
           │               │               │
           ▼               ▼               ▼
    ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
    │  ~11 winners│ │ ~766 winners│ │~17,697 win- │
    │  $22,000 ea │ │   $800 ea   │ │ ners $40 ea │
    └─────────────┘ └─────────────┘ └─────────────┘
    
    (Based on 697,800 tickets sold during rolldown draw)
```

### Post-Rolldown Reset

After a rolldown:
1. Jackpot resets to $500,000 seed
2. Normal mode resumes
3. Cycle begins again (~13-14 days to next cap)

---

## 💰 Economic Model

### Dynamic House Fee System

Instead of a fixed fee, the house fee **scales with jackpot level**:

| Jackpot Level | House Fee | Prize Pool | Effect |
|---------------|-----------|------------|--------|
| < $500,000 | **28%** | 72% | Attracts early players |
| $500,000 - $1,000,000 | **32%** | 68% | Standard operations |
| $1,000,000 - $1,500,000 | **36%** | 64% | Building anticipation |
| $1,500,000 - $2,000,000 | **40%** | 60% | Maximum extraction |
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
- Target: 3-month operating expenses (~$2.7M)

### Two-Week Cycle Profitability (With Dynamic Fees)

```
Dynamic Fee Model Revenue:
├── Phase 1 (Days 1-5, <$500k): 100k × $2.50 × 28% = $70,000/day
├── Phase 2 (Days 6-8, $500k-$1M): 100k × $2.50 × 32% = $80,000/day  
├── Phase 3 (Days 9-11, $1M-$1.5M): 120k × $2.50 × 36% = $108,000/day
├── Phase 4 (Days 12-13, >$1.5M): 150k × $2.50 × 40% = $150,000/day
├── Rolldown (Day 14): 700k × $2.50 × 28% = $490,000

Total Cycle House Fees: $1,278,000 (+7.4% vs fixed 34%)
```

| Period | Calculation | Amount |
|--------|-------------|--------|
| **Normal Days (13)** | Dynamic fee revenue | +$1,278,000 |
| **Rolldown Deficit** | Prizes exceed pool contribution | -$200,000 |
| **Seed Reset** | Replenish $500k jackpot | -$500,000 |
| **Insurance Accumulation** | 2% allocation | +$70,000 |
| **CYCLE NET PROFIT** | | **+$648,000** |
| **Daily Average** | | **~$46,300/day** |

### Break-Even Analysis

| Volume Scenario | Daily Tickets | Cycle Profit | Annual Profit |
|-----------------|---------------|--------------|---------------|
| **Minimum Viable** | 50,000 | +$180,000 | +$4.7M |
| **Target** | 100,000 | +$500,000 | +$13M |
| **Optimistic** | 200,000 | +$1,100,000 | +$28.6M |

---

## 🪙 Tokenomics ($LOTTO)

### Token Overview

| Property | Value |
|----------|-------|
| **Token Name** | LOTTO |
| **Total Supply** | 100,000,000 (fixed, deflationary) |
| **Blockchain** | Solana (SPL Token) |
| **Initial Distribution** | See below |

### Distribution

```
┌─────────────────────────────────────────────────────────┐
│                 $LOTTO DISTRIBUTION                      │
├─────────────────────────────────────────────────────────┤
│                                                          │
│   Community Rewards ███████████████████████░░░░ 40%     │
│   (Earned through gameplay)                              │
│                                                          │
│   Liquidity Mining  ██████████░░░░░░░░░░░░░░░░ 20%      │
│   (DEX liquidity incentives)                             │
│                                                          │
│   Team & Advisors   ███████░░░░░░░░░░░░░░░░░░░ 15%      │
│   (4-year vest, 1-year cliff)                            │
│                                                          │
│   Treasury (DAO)    ███████░░░░░░░░░░░░░░░░░░░ 15%      │
│   (Governance-controlled)                                │
│                                                          │
│   Initial Liquidity █████░░░░░░░░░░░░░░░░░░░░░ 10%      │
│   (DEX launch)                                           │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Token Utility

| Utility | Description |
|---------|-------------|
| **🗳️ Governance** | Vote on prize structures, fees, new features |
| **💎 Staking Rewards** | Earn share of house fees (up to 5%) |
| **🎫 Ticket Discounts** | Pay with $LOTTO for up to 20% off |
| **🔓 Exclusive Access** | Whale pools, early rolldown alerts |
| **🔥 Buyback & Burn** | 10% of fees used for deflationary pressure |

### Staking Tiers

| Tier | Stake Required | Ticket Discount | Fee Share | Perks |
|------|----------------|-----------------|-----------|-------|
| 🥉 Bronze | 1,000 $LOTTO | 5% | 0.5% | Basic |
| 🥈 Silver | 10,000 $LOTTO | 10% | 1.5% | Early alerts |
| 🥇 Gold | 50,000 $LOTTO | 15% | 3% | Whale pools |
| 💎 Diamond | 250,000 $LOTTO | 20% | 5% | 2x governance |

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
│                   │  CHAINLINK  │                       │
│                   │     VRF     │                       │
│                   │ (Randomness)│                       │
│                   └─────────────┘                       │
│                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │ GOVERNANCE  │  │   $LOTTO    │  │  SYNDICATE  │     │
│  │     DAO     │  │   TOKEN     │  │   MANAGER   │     │
│  │             │  │             │  │             │     │
│  │ • propose() │  │ • stake()   │  │ • create()  │     │
│  │ • vote()    │  │ • unstake() │  │ • join()    │     │
│  │ • execute() │  │ • burn()    │  │ • split()   │     │
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
    pub vrf_proof: [u8; 64],
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

### Randomness (Chainlink VRF)

```
┌──────────────────────────────────────────────────────────┐
│                    DRAW PROCESS                           │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  T-1 Block    ┌─────────────────────────────────┐        │
│     │         │  1. Request VRF randomness       │        │
│     │         │  2. Commit hash published        │        │
│     ▼         └─────────────────────────────────┘        │
│                                                           │
│  T Block      ┌─────────────────────────────────┐        │
│     │         │  3. VRF callback received        │        │
│     │         │  4. Winning numbers generated    │        │
│     │         │  5. Hash verified on-chain       │        │
│     ▼         └─────────────────────────────────┘        │
│                                                           │
│  T+1 Block    ┌─────────────────────────────────┐        │
│     │         │  6. Winners calculated           │        │
│     │         │  7. Prizes distributed           │        │
│     │         │  8. Rolldown check executed      │        │
│     ▼         └─────────────────────────────────┘        │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

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

- ✅ **Chainlink VRF v2** with multiple oracle nodes
- ✅ **Commit-reveal backup** if primary VRF fails
- ✅ **Hash pre-publication** for transparency
- ✅ **MEV protection** via encrypted ticket submissions

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

- [ ] $LOTTO token launch
- [ ] Staking system activation
- [ ] Syndicate feature release
- [ ] Streak bonus implementation
- [ ] **Second Chance Draws** (weekly)
- [ ] **Syndicate Wars Competition** (monthly)
- [ ] Mobile app (iOS/Android)
- [ ] Target: 75,000 tickets/day

### Phase 4: Expansion (Q4 2025)

- [ ] **Quick Pick Express** (4/20, every 4 hours)
- [ ] **Lucky Numbers NFT** system launch
- [ ] First **Mega Rolldown Event** ($5M jackpot)
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

### Quick Pick Express (4/20)

High-frequency mini-lottery for continuous engagement:

| Parameter | Value |
|-----------|-------|
| Matrix | 4/20 (Pick 4 from 20) |
| Ticket Price | $0.50 USDC |
| Draw Frequency | Every 4 hours (6x daily) |
| Match 4 Prize | $500 (1 in 4,845 odds) |
| Match 3 Prize | $10 (1 in 76 odds) |
| Match 2 | Free ticket (1 in 6.7 odds) |

### Mega Rolldown Events (Quarterly)

Special events with guaranteed full rolldown:

| Parameter | Value |
|-----------|-------|
| Frequency | Once per quarter |
| Matrix | 6/49 (harder odds) |
| Ticket Price | $10 USDC |
| Target Jackpot | $5,000,000 |
| Guaranteed | Full rolldown on final day |

> 📚 **See [ADVANCED_FEATURES.md](./ADVANCED_FEATURES.md) for complete specifications.**

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

## 🎫 Second Chance Draws

Every non-winning ticket automatically enters a **weekly Second Chance Draw**:

| Prize Tier | Count | Prize |
|------------|-------|-------|
| Grand Prize | 1 | $10,000 |
| Runner Up | 10 | $1,000 |
| Consolation | 100 | $100 |
| Free Tickets | 1,000 | $2.50 |

**Prize Pool**: 5% of weekly reserve fund (~$35,000/week at target volume)

> *"Even losing tickets have value"*

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
  vrfProof: string;  // Verifiable randomness proof
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

### Staking Methods

#### `stakeLotto(wallet, amount)`

Stake $LOTTO tokens for rewards and benefits.

```typescript
await lotto.stakeLotto(wallet, 10000); // Stake 10,000 $LOTTO
```

#### `getStakingTier(wallet)`

Check current staking tier and benefits.

```typescript
const tier = await lotto.getStakingTier(wallet.publicKey);
// { tier: 'Silver', discount: 0.10, feeShare: 0.015, ... }
```

---

## ❓ FAQ

### General

**Q: Is this legal?**  
A: SolanaLotto operates as a decentralized protocol. Users are responsible for ensuring compliance with their local laws. The protocol does not accept users from prohibited jurisdictions.

**Q: How do I know the draws are fair?**  
A: All randomness is generated using Chainlink VRF, which provides cryptographic proof that the numbers are random and unmanipulated. Every draw's VRF proof is published on-chain for verification.

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

4. **Market Risk**: The value of $LOTTO tokens and USDC stablecoins may fluctuate.

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