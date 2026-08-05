# MazelProtocol

## Technical Whitepaper v3.0

### A Provably Fair Decentralized Lottery with Intentional Positive Expected Value Windows

---

**Abstract**

MazelProtocol introduces a novel lottery mechanism that intentionally creates windows of positive expected value (+EV) for players while maintaining sustainable operator profitability. By implementing a rolldown mechanism inspired by the Massachusetts Cash WinFall lottery (2004-2012), the protocol creates a two-phase economic cycle: negative-EV normal operation that builds the prize pool, followed by positive-EV rolldown events that distribute accumulated value to lower-tier winners. This paper presents the mathematical foundations, economic sustainability proofs, and technical implementation details of MazelProtocol.

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Background & Prior Art](#2-background--prior-art)
3. [Mathematical Foundations](#3-mathematical-foundations)
4. [Economic Model](#4-economic-model)
5. [Game Theory Analysis](#5-game-theory-analysis)
6. [Technical Implementation](#6-technical-implementation)
7. [Insurance & Fund Protection System](#7-insurance--fund-protection-system)
8. [Security Considerations](#8-security-considerations)
9. [Conclusion](#9-conclusion)
10. [References](#10-references)
11. [Appendices](#11-appendices)

---

## 1. Introduction

### 1.1 The Problem with Traditional Lotteries

Traditional lotteries operate on a simple principle: the house always wins. With typical house edges ranging from 40-60%, players face overwhelming negative expected value on every ticket purchased. While jackpot dreams attract players, the mathematical reality ensures consistent losses over time.

This creates a paradox: lotteries depend on player participation, yet rational economic actors should avoid negative-EV propositions. Traditional lotteries resolve this through:

- Psychological manipulation (jackpot marketing)
- Regulatory monopolies (no competition)
- Information asymmetry (hidden odds)

### 1.2 The MazelProtocol Solution

MazelProtocol proposes an alternative model that aligns incentives between operators and sophisticated players while maintaining profitability:

1. **Transparent negative-EV normal operation** builds the prize pool
2. **Intentional positive-EV rolldown events** reward engagement
3. **Predictable cycles** enable strategic participation
4. **On-chain verification** ensures fairness

This creates a "game within a game" where casual players enjoy entertainment value during normal operation, while sophisticated players can profitably participate in rolldown windows.

### 1.3 Design Principles

| Principle | Implementation |
|-----------|----------------|
| **Transparency** | All parameters, odds, and balances on-chain |
| **Fairness** | Switchboard Randomness with TEE for verifiable randomness |
| **Sustainability** | 28–40% dynamic house fee guarantees operator profitability |
| **Accessibility** | $2.50 ticket price on low-fee Solana |
| **Favorable Distribution Events** | Rolldown mechanism creates +EV windows |

| **Operator Protection** | Fixed→Pari-Mutuel prize transition limits liability |

> **⚠️ CRITICAL DESIGN FEATURE: PRIZE TRANSITION SYSTEM**
>
> All prizes START as FIXED amounts during normal operation, then TRANSITION to PARI-MUTUEL (shared pool) distribution during:
> 1. Rolldown events (all prizes become pari-mutuel)
> 2. High-volume draws (when fixed prizes would exceed pool)
> 3. Multiple winner scenarios (automatic transition)
>
> This hybrid system ensures **operator liability is always capped** while maintaining attractive +EV windows for players. During rolldown, the operator pays out exactly the jackpot amount—no more, no less—regardless of how many tickets are sold or how many winners there are.

---

## 2. Background & Prior Art

### 2.1 The Massachusetts Cash WinFall Case Study

From 2004 to 2012, the Massachusetts State Lottery operated Cash WinFall, a 6/46 lottery with a unique rolldown provision. When the jackpot exceeded $2 million and no one matched all six numbers, the prize money "rolled down" to lower tiers.

**Key Observations:**

- Sophisticated players (including MIT students and retired engineer Gerald Selbee) identified the positive-EV opportunity
- During rolldown events, expected value exceeded ticket cost by 15-20%
- Players purchased tickets in bulk (100,000+ tickets per rolldown)
- The lottery commission was aware but continued operation because:
  - Total ticket sales increased dramatically during rolldowns
  - House fees on increased volume offset reduced margins
  - Media attention provided free marketing

**Outcome:** Cash WinFall was profitable for both the state and sophisticated players until discontinued in 2012 due to media controversy, not economic failure.

### 2.2 Lessons for Protocol Design

MazelProtocol incorporates Cash WinFall's successful mechanics while addressing its weaknesses:

| Cash WinFall Issue | MazelProtocol Solution |
|--------------------|----------------------|
| Opaque odds calculation | All math published in smart contracts |
| Manual prize claiming | Automatic on-chain distribution |
| Geographic restriction | Global access via Solana |
| No player governance | Timelocked config changes (24h delay) with permissionless solvency checks |
| Single operator risk | Multi-sig authority recommended; all state verifiable on-chain |

### 2.3 Existing Crypto Lottery Protocols

| Protocol | Mechanism | Limitation |
|----------|-----------|------------|
| PoolTogether | No-loss savings game | Low yields, no jackpot excitement |
| Standard VRF Lotteries | Standard negative-EV | No differentiation from traditional |
| Various NFT lotteries | Random NFT distribution | Illiquid prizes, opaque odds |

MazelProtocol is the first protocol to implement intentional +EV windows in a decentralized lottery.

---

## 3. Mathematical Foundations

### 3.1 Combinatorial Basis

MazelProtocol uses a 6/46 matrix: players select 6 numbers from a pool of 46.

**Total possible combinations:**

$$C(46, 6) = \frac{46!}{6!(46-6)!} = \frac{46!}{6! \cdot 40!} = 9,366,819$$

**Match probability formulas:**

For matching exactly $k$ numbers out of 6 drawn:

$$P(k) = \frac{C(6, k) \cdot C(40, 6-k)}{C(46, 6)}$$

### 3.2 Probability Calculations

| Match | Formula | Exact Probability | Odds (1 in X) |
|-------|---------|-------------------|---------------|
| 6 | $\frac{C(6,6) \cdot C(40,0)}{9,366,819}$ | 0.00000010676 | 9,366,819 |
| 5 | $\frac{C(6,5) \cdot C(40,1)}{9,366,819}$ | 0.00002562 | 39,028.4 |
| 4 | $\frac{C(6,4) \cdot C(40,2)}{9,366,819}$ | 0.001249 | 800.6 |
| 3 | $\frac{C(6,3) \cdot C(40,3)}{9,366,819}$ | 0.02109 | 47.42 |
| 2 | $\frac{C(6,2) \cdot C(40,4)}{9,366,819}$ | 0.14635 | 6.833 |
| 1 | $\frac{C(6,1) \cdot C(40,5)}{9,366,819}$ | 0.42153 | 2.372 |
| 0 | $\frac{C(6,0) \cdot C(40,6)}{9,366,819}$ | 0.40982 | 2.440 |

**Verification:** $\sum_{k=0}^{6} P(k) = 1.0$ ✓

### 3.3 Expected Value Calculations

#### Normal Mode — FIXED PRIZES

Let $EV_{normal}$ be the expected value of a ticket during normal operation:

$$EV_{normal} = \sum_{k=2}^{6} P(k) \cdot Prize_{fixed}(k)$$

> **⚠️ PRIZE MODE: FIXED** — During normal operation, prizes are predetermined fixed amounts. This provides predictable player value but creates variable operator liability based on winner count.

**Fixed Prize Schedule:**
- Match 6: Variable ($J$ = current jackpot)
- Match 5: $4,000 (FIXED)
- Match 4: $150 (FIXED)
- Match 3: $5 (FIXED)
- Match 2: $2.50 (FIXED free ticket)

$$EV_{normal} = \frac{J}{9,366,819} + \frac{4000}{39,028} + \frac{150}{800.6} + \frac{5}{47.42} + \frac{2.50}{6.833}$$

$$EV_{normal} = \frac{J}{9,366,819} + 0.1025 + 0.1874 + 0.1054 + 0.3659$$

For $J = 1,000,000$:
$$EV_{normal} = 0.1068 + 0.7612 = \$0.868$$

**House edge during normal operation:**
$$HouseEdge_{normal} = 1 - \frac{0.868}{2.50} = 65.3\%$$

**Pari-Mutuel Transition Trigger:** If (Winner Count × Fixed Prize) > Prize Pool Allocation, prizes automatically convert to pari-mutuel to cap operator liability.

#### Rolldown Mode — PARI-MUTUEL PRIZES

> **⚠️ PRIZE MODE TRANSITION: FIXED → PARI-MUTUEL**
>
> During rolldown events, ALL prizes transition from fixed amounts to **PARI-MUTUEL** (shared pool) distribution. This critical design feature ensures:
> 1. **Operator liability is CAPPED** at exactly the jackpot amount $J$
> 2. **No unbounded risk** regardless of ticket volume or winner count
> 3. **Player +EV is preserved** through proportional distribution

During rolldown, a jackpot $J$ (where $1,750,000 \le J \le 2,250,000$) distributes to lower tiers using pari-mutuel prize pools. The rolldown triggers probabilistically once jackpot exceeds $1,750,000, with probability $P = (J - 1,750,000) / (2,250,000 - 1,750,000)$.

**Pari-Mutuel Pool Allocation:**

| Tier | Pool Share | Total Pool | Formula | Est. Prize* |
|------|------------|------------|---------|-------------|
| Match 5 | 25% | $0.25J$ | `Pool ÷ Winners` | ~$0.25J / (N × 0.00002562)$ |
| Match 4 | 35% | $0.35J$ | `Pool ÷ Winners` | ~$0.35J / (N × 0.001249)$ |
| Match 3 | 40% | $0.40J$ | `Pool ÷ Winners` | ~$0.40J / (N × 0.02109)$ |

*\*Estimated prizes depend on total tickets $N$ sold during rolldown. This is the pari-mutuel mechanism in action.*

**Pari-Mutuel Prize Formulas:**

For a rolldown with $N$ tickets sold and jackpot $J$:

$$Prize_{k} = \frac{PoolShare_k \cdot J}{N \cdot P(k)} = \frac{PoolShare_k \cdot J}{ExpectedWinners_k}$$

Specifically:
$$Prize_{5} = \frac{0.25J}{N \cdot 0.00002562}$$
$$Prize_{4} = \frac{0.35J}{N \cdot 0.001249}$$
$$Prize_{3} = \frac{0.40J}{N \cdot 0.02109}$$

**🔒 OPERATOR PROTECTION:** Total payout = $0.25J + 0.35J + 0.40J = J$ (exactly the jackpot). Operator liability is mathematically capped regardless of volume.

**Expected Value during Rolldown (Pari-Mutuel):**

$$EV_{rolldown} = P(5) \cdot Prize_{5} + P(4) \cdot Prize_{4} + P(3) \cdot Prize_{3} + P(2) \cdot 2.50$$

Substituting pari-mutuel prize formulas (terms simplify beautifully):

$$EV_{rolldown} = \frac{0.25J}{N} + \frac{0.35J}{N} + \frac{0.40J}{N} + 0.3659$$

$$EV_{rolldown} = \frac{J}{N} + 0.3659$$

**Player Edge Examples (Pari-Mutuel):**

| Jackpot $J$ | Tickets $N$ | EV Calculation | Player Edge |
|-------------|-------------|----------------|-------------|
| $1,750,000 | 700,000 | $2.50 + $0.37 = $2.87 | **+14.8%** |
| $1,750,000 | 475,000 | $3.68 + $0.37 = $4.05 | **+62%** |
| $2,250,000 | 475,000 | $4.74 + $0.37 = $5.11 | **+104%** |
| $2,250,000 | 1,000,000 | $2.25 + $0.37 = $2.62 | **+4.8%** |

**Key Insight:** Higher volume REDUCES per-winner prizes but NEVER increases operator liability. The pari-mutuel system scales automatically to protect the protocol.

### 3.4 Break-Even Analysis (Pari-Mutuel Context)

For positive expected value ($EV > TicketPrice$) during pari-mutuel rolldown:

$$\frac{J}{N} + 0.3659 > 2.50$$

$$\frac{J}{N} > 2.134$$

$$N < \frac{J}{2.134}$$

**Critical Insight:** The pari-mutuel system creates a natural volume-based equilibrium. If fewer than $J/2.134$ tickets are sold during rolldown, players have +EV. More tickets = lower per-winner prizes = approaching break-even.

| Jackpot $J$ | Break-Even Volume $N$ | At This Volume, EV = |
|-------------|----------------------|---------------------|
| $1,750,000 | 820,056 tickets | $2.50 (break-even) |
| $2,000,000 | 937,207 tickets | $2.50 (break-even) |
| $2,250,000 | 1,054,358 tickets | $2.50 (break-even) |

For 15% profit margin:

$$EV_{rolldown} > 2.50 \times 1.15 = 2.875$$

$$\frac{J}{N} > 2.509$$

$$N < \frac{J}{2.509}$$

**Theorem 3.1 (Pari-Mutuel +EV Threshold):** *For rolldown events with jackpot $J$ and fewer than $J/2.509$ tickets sold, players achieve ≥15% expected profit per ticket.*

| Jackpot $J$ | +15% Edge Volume Threshold |
|-------------|---------------------------|
| $1,750,000 | $N < 697,489$ |
| $2,000,000 | $N < 797,130$ |
| $2,250,000 | $N < 896,771$ |

**🔒 OPERATOR PROTECTION:** Regardless of whether 500,000 or 2,000,000 tickets are sold during rolldown, operator pays out exactly $J$. The pari-mutuel system absorbs all volume risk.

---

## 4. Economic Model

> **🔒 CORE PRINCIPLE: FIXED → PARI-MUTUEL TRANSITION**
>
> All prizes START as FIXED amounts during normal mode, then TRANSITION to PARI-MUTUEL (shared pool) during rolldown events and high-volume draws. This hybrid system ensures operator liability is ALWAYS CAPPED while maintaining attractive +EV windows for players.

### 4.1 Revenue Flow Architecture

```
                    TICKET PURCHASE ($2.50)
                            │
            ┌───────────────┴───────────────┐
            ▼                               ▼
      HOUSE FEE (28-40%)             PRIZE POOL (60-72%)
      (dynamic by tier)              (example at 32%: $1.70)
            │                               │
            ▼               ┌───────────┬───┼───────┬──────────┐
    ┌───────────────┐       ▼           ▼           ▼          ▼
    │  OPERATIONS   │   JACKPOT    FIXED PRIZES  RESERVE   INSURANCE
    │  • Team       │    $0.95       $0.67        $0.05      $0.03
    │  • Marketing  │   (55.6%)     (39.4%)       (3%)       (2%)
    │  • Infra      │       │           │           │          │
    │  • Buybacks   │       ▼           ▼           ▼          ▼
    └───────────────┘   Growing     Immediate    Buffer    Solvency
                        Pool      (FIXED MODE)   Fund     Protection
                                       │
                                       ▼
                                TRANSITION TO
                                PARI-MUTUEL
                                (when needed)
```

### 4.1.1 Prize Mode Transition System

| Mode | When Active | Prize Calculation | Operator Liability |
|------|-------------|-------------------|-------------------|
| **FIXED** | Normal draws, moderate volume | Predetermined amounts | Variable (depends on winners) |
| **PARI-MUTUEL** | Rolldown events, high-volume | Pool ÷ Winner Count | **CAPPED at pool size** |

**Automatic Transition Triggers:**
1. ✅ **Rolldown event** → All prizes become pari-mutuel
2. ✅ **High-volume draw** → (Winners × Fixed Prize) > Pool triggers transition
3. ✅ **Multiple winners** → Automatic pool sharing

**Why This Matters:** During a rolldown with 1M+ tickets, fixed prizes could bankrupt the protocol. Pari-mutuel ensures total payout = jackpot amount (CAPPED), regardless of volume.

### 4.2 Two-Week Cycle Economics

**Assumptions:**
- Daily volume: 100,000 tickets
- Ticket price: $2.50
- Jackpot allocation: 55.6% of prize pool (per code: `JACKPOT_ALLOCATION_BPS = 5560`)
- Dynamic house fee: 28–40% depending on jackpot tier
- Soft cap: $1,750,000
- Seed: $500,000

**Jackpot Growth Calculation (Phased by Fee Tier):**

Since the seed starts at $500,000 (immediately at tier 2), the jackpot grows through three fee phases:

| Phase | Jackpot Range | Fee | Prize Pool/Ticket | Jackpot/Ticket | Tickets Needed | Days |
|-------|---------------|-----|-------------------|----------------|----------------|------|
| A | $500k → $1M | 32% | $1.70 | $0.9452 | 529,010 | 5.3 |
| B | $1M → $1.5M | 36% | $1.60 | $0.8896 | 562,050 | 5.6 |
| C | $1.5M → $1.75M | 40% | $1.50 | $0.834 | 299,760 | 3.0 |
| **Total** | **$500k → $1.75M** | | | | **~1,390,820** | **~14 days** |

*Jackpot per ticket = Prize Pool per ticket × 55.6%*

**Normal Period (~14 days) — FIXED PRIZE MODE:**

| Metric | Calculation | Daily (avg) | 14-Day Total |
|--------|-------------|-------------|--------------|
| Revenue | 100k × $2.50 | $250,000 | $3,500,000 |
| House Fees (blended ~34%) | Dynamic by tier | ~$85,700 | ~$1,200,000 |
| Prize Pool | Revenue − Fees | ~$164,300 | ~$2,300,000 |
| Expected Fixed Prize Payouts* | 100k × $0.76/ticket | $76,120 | $1,065,700 |
| Jackpot Growth | Phases A–C above | — | $1,250,000 |
| Reserve Accrual (3% of pool) | 100k × ~$0.05 | ~$4,930 | ~$69,000 |
| Insurance Accrual (2% of pool) | 100k × ~$0.03 | ~$3,290 | ~$46,000 |

*Expected fixed payout per ticket: P(5)×$4,000 + P(4)×$150 + P(3)×$5 + P(2)×$2.50 = $0.1025 + $0.1874 + $0.1055 + $0.3659 = $0.7613*

*During normal mode, prizes are FIXED amounts. If winner count exceeds pool capacity, automatic transition to pari-mutuel occurs.*

**Rolldown Period (1 day) — PARI-MUTUEL PRIZE MODE:**

> **🔒 CRITICAL: During rolldown, ALL prizes transition to PARI-MUTUEL. Operator liability is EXACTLY $1,750,000 (the jackpot) — no more, no less — regardless of ticket volume or winner count.**

Assuming 700,000 tickets sold during rolldown (fee drops to 28%):

| Metric | Prize Mode | Calculation | Amount |
|--------|------------|-------------|--------|
| Revenue | — | 700k × $2.50 | $1,750,000 |
| House Fee (28%) | — | 700k × $0.70 | $490,000 |
| Prize Pool (from sales) | — | 700k × $1.80 | $1,260,000 |
| Free Ticket Liability | FIXED | 700k × (1/6.833) × $2.50 | $256,410 |
| **Jackpot Distribution** | **PARI-MUTUEL** | Full jackpot to Match 3-5 | **$1,750,000** |

**Pari-Mutuel Distribution of $1,750,000 Jackpot:**

| Tier | Pool Share | Pool Amount | Est. Winners* | Est. Prize/Winner |
|------|------------|-------------|---------------|-------------------|
| Match 5 | 25% | $437,500 | ~18 | ~$24,306 |
| Match 4 | 35% | $612,500 | ~875 | ~$700 |
| Match 3 | 40% | $700,000 | ~14,763 | ~$47 |
| **TOTAL** | **100%** | **$1,750,000** | — | — |

*Winners estimated at 700k tickets. Actual = Pool ÷ Winner Count (pari-mutuel formula).*

**🔒 OPERATOR PROTECTION:** Total payout is EXACTLY $1,750,000 regardless of:
- Whether 500k or 2M tickets are sold
- Whether there are 10 or 100 Match 5 winners
- Market conditions or player behavior

**Full Cycle (~15 days) — Operator Profit & Loss:**

> **IMPORTANT:** The operator's profit comes from **house fees** minus the **jackpot seed** cost. Fixed prize payouts and rolldown distributions are funded entirely from the prize pool (player funds), not from operator revenue. The prize pool is self-sustaining: ticket sales fund it, and prizes are paid from it.

| Component | Source | Amount |
|-----------|--------|--------|
| Normal Period House Fees (~14 days) | Operator Revenue | +$1,200,000 |
| Rolldown House Fees (1 day, 28%) | Operator Revenue | +$490,000 |
| **Total House Fees** | | **+$1,690,000** |
| Jackpot Seed (next cycle) | Operator Cost | -$500,000 |
| **NET OPERATOR PROFIT** | | **+$1,190,000** |
| **Daily Average** | | **~$79,300/day** |

**Prize Pool Balance (Self-Sustaining — Not Operator Cost):**

| Flow | Amount |
|------|--------|
| Prize pool contributions (normal, ~14 days) | +$2,300,000 |
| Prize pool contributions (rolldown day) | +$1,260,000 |
| **Total prize pool inflow** | **+$3,560,000** |
| Expected fixed prize payouts (14 normal days) | -$1,065,700 |
| Free ticket liability (rolldown Match 2) | -$256,410 |
| Jackpot distribution (pari-mutuel) | -$1,750,000 |
| **Total prize pool outflow** | **-$3,072,110** |
| Reserve accumulation (3%) | +$106,800 |
| Insurance accumulation (2%) | +$71,200 |
| Surplus carried to next cycle | +$309,890 |

*Note: The $500,000 seed for the next cycle can eventually be funded from accumulated reserves rather than operator capital.*

**Without Pari-Mutuel Protection (Hypothetical):**
If rolldown prizes were FIXED at high volume:
- Fixed Match 5 ($4,000 × ~18) = $72,000
- Fixed Match 4 ($150 × ~875) = $131,250  
- Fixed Match 3 ($5 × ~14,763) = $73,815
- Total fixed liability = $277,065 (vs $1,750,000 pari-mutuel)

**BUT** at 2M tickets (extreme volume), fixed prizes would be:
- Fixed Match 5 ($4,000 × ~51) = $204,000
- Fixed Match 4 ($150 × ~2,498) = $374,700
- Fixed Match 3 ($5 × ~42,180) = $210,900
- Total = $789,600 **in addition to** jackpot distribution
- **Potential unbounded loss!**

**🔒 PARI-MUTUEL PROTECTION:** With pari-mutuel, operator ALWAYS pays exactly $1,750,000 total during rolldown — the jackpot amount. Volume risk is completely eliminated.

**Annualized Metrics (Conservative with Pari-Mutuel Protection):**

| Metric | Description |
|--------|-------------|
| Cycles per Year | ~24.3 (365 / 15) |
| Net Operator Result | Scales linearly with ticket volume |
| Daily Average | Scales linearly with ticket volume |

**High Volume Scenario (200k daily tickets, Pari-Mutuel Protected):**

| Metric | Description |
|--------|-------------|
| Cycles per Year | ~48.7 (365 / 7.5) — faster cycles due to higher volume |
| Cycle Economics | House fees increase proportionally with ticket volume |
| Operator Result | Scales linearly with ticket volume |
| Daily Average | Scales linearly with ticket volume |

**🔒 KEY INSIGHT:** Higher volume = faster cycles + more house fees, but operator liability ALWAYS CAPPED by pari-mutuel system during rolldown. This is the fundamental protection that makes the protocol sustainable at any scale.

### 4.3 Sensitivity Analysis (With Pari-Mutuel Protection)

**Volume Impact on Profitability:**

| Daily Volume | Prize Mode | Cycle House Fees | Cycle Profit (Fees − Seed) | Annual Result | Viability |
|--------------|------------|------------------|---------------------------|---------------|-----------|
| **25,000** | Fixed Only | ~$500,000 | **~$0** | **Break-even** | **Break-even** |
| 50,000 | Fixed→PM | ~$950,000 | +$450,000 | Positive | ✓ Minimum Sustainable |
| 75,000 | Fixed→PM | ~$1,320,000 | +$820,000 | Positive | ✓ Conservative |
| 100,000 | Fixed→PM | ~$1,690,000 | +$1,190,000 | Positive | ✓ Target |
| 150,000 | Fixed→PM | ~$2,430,000 | +$1,930,000 | Positive | ✓ Growth |
| 200,000 | Fixed→PM | ~$3,170,000 | +$2,670,000 | Positive | ✓ Optimistic |

*PM = Pari-Mutuel. All scenarios assume pari-mutuel transition during rolldown events.

**🔒 CRITICAL OBSERVATION:** At higher volumes, the pari-mutuel system provides GREATER protection. A 200k/day scenario would be catastrophic with fixed prizes during rolldown (unbounded liability), but is highly profitable with pari-mutuel (capped liability).

**Break-Even Volume (With Pari-Mutuel Protection):**

Setting Cycle Profit = 0:

$$0 = HouseFees_{normal} + HouseFees_{rolldown} + PrizePoolSurplus - FixedPrizes_{normal} - Jackpot_{pari-mutuel} - FreeTickets - Seed$$

Key insight: During rolldown, operator pays EXACTLY the jackpot ($1,750,000) via pari-mutuel distribution. This is the capped liability.

Solving yields: **Minimum viable volume ≈ 35,000 tickets/day**

### 4.3.1 Prize Mode Comparison: Fixed vs Pari-Mutuel

| Scenario | Fixed Prizes (Hypothetical) | Pari-Mutuel (Actual) | Operator Savings |
|----------|----------------------------|---------------------|------------------|
| 500k tickets rolldown | ~$400k variable | $1,750,000 capped | Risk eliminated |
| 700k tickets rolldown | ~$550k variable | $1,750,000 capped | Risk eliminated |
| 1M tickets rolldown | ~$790k variable | $1,750,000 capped | Risk eliminated |
| 2M tickets rolldown | ~$1.58M variable | $1,750,000 capped | **$170k+ saved** |

**🔒 KEY PROTECTION:** With fixed prizes, higher volume = higher liability (unbounded). With pari-mutuel, higher volume = SAME liability (capped at jackpot). This is why the Fixed→Pari-Mutuel transition is CRITICAL for protocol sustainability.

### 4.4 Risk Scenarios

**Scenario A: Jackpot Won Early**

If someone wins the jackpot before cap:
- Jackpot paid from accumulated pool
- No rolldown occurs
- Cycle extends until next cap
- **Impact:** Positive for operator (saved rolldown loss)

**Scenario B: Multiple Jackpot Winners**

If multiple Match-6 winners in one draw:
- Jackpot split among winners
- Dramatically positive for operator
- **Impact:** Rare but favorable

**Scenario C: Extreme Rolldown Volume**

If rolldown attracts 2M+ tickets:
- Per-winner prizes decrease
- Player EV approaches negative
- **Impact:** Higher operator profit

**Scenario D: Low Volume Death Spiral**

If daily volume drops below 35,000:
- Cycles extend beyond 3 weeks
- Fixed costs strain margins
- **Impact:** Requires marketing intervention


### 4.5 Jackpot LP Pool — Decentralized Revenue Sharing

#### Overview

The Jackpot LP Pool replaces centralized jackpot seeding with community-provided liquidity. LPs deposit USDC to fund jackpot seeds and earn a proportional share of house fees from every ticket sold. This transforms the protocol's capital structure from operator-funded to community-funded while creating a yield-bearing asset for depositors.

#### Revenue Flow

```
Each $2.50 ticket:
  House Fee (28-40%):           $0.70 - $1.00
    ├── LP Rewards (60%):        $0.42 - $0.60  →  LP pool
    └── Operator (40%):          $0.28 - $0.40  →  Treasury

  Prize Pool (60-72%):           $1.50 - $1.80
```

#### APY Model

LP yield depends on ticket volume and total deposits:

| Total LP Deposits | Tickets/Day | Daily LP Revenue | APY |
|-------------------|-------------|------------------|-----|
| $1,000,000 | 10,000 | $5,100 | 186% |
| $5,000,000 | 10,000 | $5,100 | 37% |
| $10,000,000 | 10,000 | $5,100 | 19% |
| $5,000,000 | 25,000 | $13,500 | 99% |

**Equilibrium:** As APY rises, more LPs deposit → APY falls to market equilibrium.

#### Jackpot Seeding Cost

Each rolldown/jackpot win draws $500,000 (seed_amount) from the LP pool. With 14-day cycles:

- LP pool loses $500,000 every ~14 days
- Annualized seed cost: ~$13,000,000
- Annual LP revenue at 10k tickets/day: ~$1,860,000
- **Net return:** At $5M deposits, the seed draw is ~10% of pool per cycle with ~2 cycles/month → ~20% annual draw. Revenue at 37% APY outpaces seed draws.

#### Risk Analysis

| Risk | Severity | Mitigation |
|------|----------|------------|
| LP pool drained by consecutive rolldowns | Medium | Reserve fund (3%) is fallback; seed can be reduced via config |
| Low ticket volume → low LP revenue | Medium | LP reward % is adjustable; operator can boost incentives |
| Whale LP exit causes seed shortage | Low | Withdrawal gate blocks exits during active draw cycles |
| LP revenue < seed cost over time | Low | Configurable seed_amount and lp_reward_bps allow tuning |

---

## 5. Game Theory Analysis

### 5.1 Player Segmentation

**Casual Players (70% of normal volume)**
- Motivation: Entertainment, jackpot dreams
- Behavior: Play regardless of EV
- Optimal strategy: Quick picks, consistent participation
- Expected outcome: Net negative (entertainment cost)

**Sophisticated Players (30% of normal volume, 80% of rolldown)**
- Motivation: Profit maximization
- Behavior: Heavy participation during +EV windows
- Optimal strategy: Wait for rolldowns, buy in volume
- Expected outcome: Net positive during rolldowns

### 5.2 Nash Equilibrium Analysis

**Question:** Is there a stable equilibrium where both player types coexist?

**Model Setup:**
- $n$ = number of sophisticated players
- Each sophisticated player buys $B$ tickets during rolldown
- Total rolldown tickets: $N = n \times B + C$ (where $C$ = casual player tickets)

**Sophisticated Player Payoff:**

$$\pi_s = B \times \left(\frac{1,750,000}{N} + 0.3659 - 2.50\right)$$

**Equilibrium Condition:**

At equilibrium, marginal entrant earns zero economic profit:

$$\frac{1,750,000}{N^*} + 0.3659 = 2.50$$

$$N^* = 820,056 \text{ tickets}$$

**Theorem 5.1:** *The Nash equilibrium occurs at approximately 820,000 rolldown tickets, where sophisticated player expected profit is zero.*

**Practical Implications:**

1. If current participation < 820k: More sophisticated players enter
2. If current participation > 820k: Some sophisticated players exit
3. System naturally gravitates toward equilibrium

However, several factors prevent perfect equilibrium:
- Information asymmetry (not all players calculate EV)
- Transaction costs (Solana fees, wallet management)
- Capital constraints (not everyone can buy 10,000+ tickets)
- Risk aversion (EV ≠ certainty)

### 5.3 Operator-Player Dynamics

**The Core Tension:**

Operators want: High volume, predictable cycles, sustainable margins
Players want: Positive EV, large prizes, fair games

**MazelProtocol Resolution:**

The rolldown mechanism creates a Pareto improvement:
- Operators profit from increased rolldown volume (more house fees)
- Players profit from +EV window (if volume stays reasonable)
- Casual players enjoy bigger lower-tier prizes during rolldown

**Mathematical Proof of Mutual Benefit:**

Let $V_{normal}$ = normal day volume, $V_{rolldown}$ = rolldown volume

Operator profit maximized when:
$$\frac{\partial Profit}{\partial V_{rolldown}} > 0$$

$$\frac{\partial}{\partial V_{rolldown}}[0.85 \times V_{rolldown}] = 0.85 > 0$$ ✓

Player expected profit positive when:
$$V_{rolldown} < 820,056$$

**Compatible Region:** $V_{normal} < V_{rolldown} < 820,056$

With target $V_{normal} = 100,000$, the compatible region spans $100,000$ to $820,056$—a wide margin for mutual benefit.

### 5.4 Mechanism Design Properties

**Incentive Compatibility:** Players are incentivized to reveal true preferences (buy when EV > 0)

**Individual Rationality:** Participation is voluntary and beneficial for both parties in equilibrium

**Budget Balance:** Protocol fees cover operational costs plus profit margin

**Sybil Resistance:** Volume-based pricing automatically adjusts to participation levels

---

## 6. Technical Implementation

### 6.1 System Architecture

> **Note (v3.0):** The protocol consists of **two Anchor programs** — not
> separate TicketManager/DrawEngine/PrizePool programs. There is no on-chain
> Governance DAO; the authority is a single signer (multi-sig recommended)
> with an inline 24-hour config timelock.

```
┌─────────────────────────────────────────────────────────────┐
│                    APPLICATION LAYER                         │
├─────────────────────────────────────────────────────────────┤
│  Web App    │    Mobile App    │    API/SDK    │   Bots    │
└──────┬──────┴────────┬─────────┴───────┬───────┴─────┬─────┘
       │               │                 │             │
       └───────────────┴────────┬────────┴─────────────┘
                                │
┌───────────────────────────────┴─────────────────────────────┐
│              MAIN LOTTERY PROGRAM (mazelprotocol)             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│  │   TICKET     │ │    DRAW      │ │    PRIZE     │        │
│  │   MODULE     │ │   MODULE     │ │   MODULE     │        │
│  └──────────────┘ └──────────────┘ └──────────────┘        │
│                                                              │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│  │    ADMIN     │ │  SYNDICATE   │ │  SYNDICATE   │        │
│  │   MODULE     │ │   MODULE     │ │    WARS      │        │
│  └──────────────┘ └──────────────┘ └──────────────┘        │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│            QUICK PICK EXPRESS PROGRAM (quickpick)            │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │  ADMIN   │ │  TICKET  │ │   DRAW   │ │  PRIZE   │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
│                                                              │
└─────────────────────────────┬───────────────────────────────┘
                              │
┌─────────────────────────────┴───────────────────────────────┐
│                    INFRASTRUCTURE LAYER                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│  │   SOLANA     │ │ SWITCHBOARD  │ │    USDC      │        │
│  │   RUNTIME    │ │  RANDOMNESS  │ │   (CIRCLE)   │        │
│  └──────────────┘ └──────────────┘ └──────────────┘        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 Smart Contract Specifications

#### 6.2.1 Ticket Module (within mazelprotocol program)

**Purpose:** Handle all ticket purchases, validation, and storage

> **Prerequisite:** Every player must call `init_user_stats` once before their first ticket
> purchase. This creates a `UserStats` PDA that tracks lifetime spending, winnings, and
> streak data. This replaces the deprecated `init_if_needed` pattern.

**Key Instructions:**

```rust
/// Purchase a single ticket
pub fn buy_ticket(
    ctx: Context<BuyTicket>,
    numbers: [u8; 6],
) -> Result<()> {
    // Validate numbers are in range [1, 46]
    require!(numbers.iter().all(|&n| n >= 1 && n <= 46), InvalidNumbers);
    
    // Validate no duplicates
    let mut sorted = numbers;
    sorted.sort();
    require!(sorted.windows(2).all(|w| w[0] != w[1]), DuplicateNumbers);
    
    let state = &mut ctx.accounts.lottery_state;
    let clock = Clock::get()?;
    
    // Ticket sale cutoff: 1 hour before draw
    require!(
        clock.unix_timestamp < state.next_draw_timestamp - 3600,
        TicketSaleEnded
    );
    
    // Dynamic house fee based on jackpot tier and rolldown status
    let is_rolldown = state.is_rolldown_active;
    let house_fee_bps = if is_rolldown {
        2800 // 28% during rolldown
    } else if state.jackpot_balance < 500_000_000_000 {
        2800 // 28% under $500k
    } else if state.jackpot_balance < 1_000_000_000_000 {
        3200 // 32%: $500k-$1M
    } else if state.jackpot_balance < 1_500_000_000_000 {
        3600 // 36%: $1M-$1.5M
    } else {
        4000 // 40%: over $1.5M
    };
    
    // Transfer USDC from player to prize pool
    transfer_usdc(
        ctx.accounts.player_usdc,
        ctx.accounts.prize_pool_usdc,
        TICKET_PRICE, // 2,500,000 ($2.50 in 6 decimals)
    )?;
    
    let house_fee = TICKET_PRICE * house_fee_bps as u64 / 10000;
    let prize_pool = TICKET_PRICE - house_fee;
    
    // Prize pool split (BPS of prize pool, not ticket price)
    let jackpot_contribution = prize_pool * 5560 / 10000;  // 55.6%
    let fixed_prize_pool = prize_pool * 3940 / 10000;      // 39.4%
    let reserve_buffer = prize_pool * 300 / 10000;         // 3%
    let insurance_contribution = prize_pool * 200 / 10000; // 2%
    
    // Update state
    state.jackpot_balance += jackpot_contribution;
    state.fixed_prize_balance += fixed_prize_pool;
    state.reserve_balance += reserve_buffer;
    state.insurance_balance += insurance_contribution;
    state.current_draw_tickets += 1;
    state.total_tickets_sold += 1;
    
    // Create ticket account
    let ticket = &mut ctx.accounts.ticket;
    ticket.owner = ctx.accounts.player.key();
    ticket.draw_id = state.current_draw_id;
    ticket.numbers = sorted;
    ticket.purchase_timestamp = clock.unix_timestamp;
    ticket.is_claimed = false;
    
    emit!(TicketPurchased {
        ticket_id: ticket.key(),
        player: ctx.accounts.player.key(),
        draw_id: ticket.draw_id,
        numbers: ticket.numbers,
    });
    
    Ok(())
}

/// Purchase multiple tickets in one transaction (up to 50)
/// Creates a single UnifiedTicket account with a claimed bitmap
pub fn buy_bulk(
    ctx: Context<BuyBulk>,
    tickets: Vec<[u8; 6]>,
) -> Result<()> {
    require!(tickets.len() <= 50, BulkPurchaseLimitExceeded);
    require!(tickets.len() >= 1, NoTickets);
    
    // Create a single UnifiedTicket account for all tickets
    let unified = &mut ctx.accounts.unified_ticket;
    unified.owner = ctx.accounts.player.key();
    unified.draw_id = ctx.accounts.lottery_state.current_draw_id;
    unified.ticket_count = tickets.len() as u8;
    unified.numbers = tickets;
    unified.claimed_bitmap = 0;  // No tickets claimed yet

    // Single transfer for all tickets (saves CU)
    let total_cost = TICKET_PRICE * tickets.len() as u64;
    transfer_usdc(ctx.accounts.player_usdc, ctx.accounts.prize_pool_usdc, total_cost)?;
    
    // Allocate funds for each ticket
    for _ in 0..tickets.len() {
        allocate_ticket_revenue(&mut ctx.accounts.lottery_state)?;
    }
    
    Ok(())
}
```

**Account Structures:**

```rust
#[account]
pub struct LotteryState {
    pub authority: Pubkey,                // Admin authority (multi-sig recommended)
    pub pending_authority: Option<Pubkey>, // Two-step authority transfer
    pub switchboard_queue: Pubkey,        // Switchboard randomness queue
    pub current_randomness_account: Pubkey, // Active randomness account
    pub current_draw_id: u64,             // Incrementing draw counter
    pub jackpot_balance: u64,             // Current jackpot (USDC lamports)
    pub reserve_balance: u64,             // Reserve fund
    pub insurance_balance: u64,           // Insurance pool
    pub fixed_prize_balance: u64,         // Earmarked for fixed-tier prizes
    pub ticket_price: u64,                // $2.50 = 2,500,000 lamports
    pub house_fee_bps: u16,               // Dynamic (2800-4000 = 28%-40%)
    pub jackpot_cap: u64,                 // UI display only (soft/hard cap used for logic)
    pub seed_amount: u64,                 // Post-rolldown seed ($500,000)
    pub soft_cap: u64,                    // Probabilistic rolldown begins ($1,750,000)
    pub hard_cap: u64,                    // Forced 100% rolldown ($2,250,000)
    pub next_draw_timestamp: i64,         // Scheduled next draw (Unix)
    pub draw_interval: i64,               // 86400 seconds (24hr)
    pub commit_slot: u64,                 // Slot of randomness commit
    pub commit_timestamp: i64,            // Timestamp of randomness commit
    pub current_draw_tickets: u64,        // Tickets in current draw
    pub total_tickets_sold: u64,          // Lifetime counter
    pub total_prizes_paid: u64,           // Lifetime payouts
    pub total_prizes_committed: u64,      // Prizes committed (not yet claimed)
    pub is_draw_in_progress: bool,        // Draw lifecycle flag
    pub is_rolldown_active: bool,         // Rolldown mode active
    pub is_paused: bool,                  // Emergency pause flag
    pub is_funded: bool,                  // Seed deposited flag
    pub config_timelock_end: i64,         // 24hr timelock expiration
    pub pending_config_hash: [u8; 32],    // SHA256 hash of pending config
    pub emergency_transfer_total: u64,    // Cumulative emergency transfers
    pub emergency_transfer_window_start: i64, // Emergency window tracking
    pub max_rolldown_tickets: u64,        // Circuit breaker for liability
    pub bump: u8,                         // PDA bump seed
    pub version: u8,                      // Protocol version
}

#[account]
pub struct UnifiedTicket {
    pub owner: Pubkey,                    // Player wallet
    pub draw_id: u64,                     // Which draw this ticket batch is for
    pub start_ticket_id: u64,             // Base ticket ID (sequential)
    pub ticket_count: u8,                 // Number of tickets (1-50)
    pub numbers: Vec<[u8; 6]>,            // All number sets in order
    pub purchase_timestamp: i64,          // When purchased
    pub syndicate: Option<Pubkey>,        // Syndicate pool (if applicable)
    pub claimed_bitmap: u64,              // Bitmap tracking: bit i = ticket i claimed
}
```

#### 6.2.2 Draw Module (within mazelprotocol program)

**Purpose:** Execute draws using verifiable randomness

**Key Instructions:**

```rust
/// Advance to a new draw period (called during finalize or via permissionless advance_draw)
pub fn initialize_draw(ctx: Context<InitializeDraw>) -> Result<()> {
    let state = &mut ctx.accounts.lottery_state;
    let clock = Clock::get()?;
    
    // Ensure previous draw cycle window has passed
    require!(
        clock.unix_timestamp >= state.next_draw_timestamp,
        DrawNotReady
    );
    
    state.current_draw_id += 1;
    state.next_draw_timestamp = clock.unix_timestamp + state.draw_interval; // 86400s (24hr)
    state.current_draw_tickets = 0;
    state.is_draw_in_progress = false;
    state.commit_slot = 0;
    state.commit_timestamp = 0;
    
    emit!(DrawInitialized {
        draw_id: state.current_draw_id,
        scheduled_time: state.next_draw_timestamp,
    });
    
    Ok(())
}

/// Commit to randomness for the upcoming draw (Switchboard commit-reveal pattern)
/// MEV-tightened slot window: ~4 seconds (10 slots) to limit frontrunning
pub fn commit_randomness(ctx: Context<CommitRandomness>) -> Result<()> {
    let clock = Clock::get()?;
    let lottery_state = &mut ctx.accounts.lottery_state;
    
    // Verify draw time has passed
    require!(
        clock.unix_timestamp >= lottery_state.next_draw_timestamp,
        TooEarly
    );
    
    // MEV protection: randomness must be from within a tight slot window
    // Slot 0 = not yet committed; otherwise must be within 10 slots (~4s)
    require!(
        lottery_state.commit_slot == 0 || clock.slot <= lottery_state.commit_slot + 10,
        RandomnessExpired
    );
    
    // Parse Switchboard randomness account data
    let randomness_data = RandomnessAccountData::parse(
        ctx.accounts.randomness_account_data.data.borrow()
    )?;
    
    // Verify randomness was committed in the previous slot
    require!(
        randomness_data.seed_slot == clock.slot - 1,
        RandomnessNotFresh
    );
    
    // Ensure randomness hasn't been revealed yet
    require!(
        randomness_data.get_value(clock.slot).is_err(),
        RandomnessAlreadyRevealed
    );
    
    // Store commit slot for later verification
    lottery_state.commit_slot = randomness_data.seed_slot;
    lottery_state.commit_timestamp = clock.unix_timestamp;
    lottery_state.current_randomness_account = ctx.accounts.randomness_account_data.key();
    lottery_state.is_draw_in_progress = true;
    
    emit!(RandomnessCommitted {
        draw_id: lottery_state.current_draw_id,
        commit_slot: lottery_state.commit_slot,
        randomness_account: ctx.accounts.randomness_account_data.key(),
        timestamp: clock.unix_timestamp,
    });
    
    Ok(())
}

/// Reveal randomness and execute the draw (Switchboard commit-reveal pattern)
pub fn execute_draw(ctx: Context<ExecuteDraw>) -> Result<()> {
    let clock = Clock::get()?;
    let lottery_state = &mut ctx.accounts.lottery_state;
    
    // Verify randomness account matches stored reference
    require!(
        ctx.accounts.randomness_account_data.key() == lottery_state.current_randomness_account,
        InvalidRandomnessAccount
    );
    
    // Parse Switchboard randomness data
    let randomness_data = RandomnessAccountData::parse(
        ctx.accounts.randomness_account_data.data.borrow()
    )?;
    
    // Verify seed_slot matches commit
    require!(
        randomness_data.seed_slot == lottery_state.commit_slot,
        RandomnessExpired
    );
    
    // Get the revealed random value (32 bytes)
    let revealed_random_value = randomness_data
        .get_value(clock.slot)
        .map_err(|_| RandomnessNotResolved)?;
    
    // Convert 32 random bytes to 6 unique lottery numbers [1, 46]
    let mut winning_numbers: [u8; 6] = [0; 6];
    let mut used: Vec<u8> = Vec::new();
    
    for i in 0..6 {
        // Use different bytes for each number
        let byte_index = i * 4;
        let mut num = ((revealed_random_value[byte_index] as u64 
            + revealed_random_value[byte_index + 1] as u64 * 256) % 46 + 1) as u8;
        
        // Ensure no duplicates
        while used.contains(&num) {
            num = if num == 46 { 1 } else { num + 1 };
        }
        winning_numbers[i] = num;
        used.push(num);
    }
    winning_numbers.sort();
    
    // Store draw result
    let draw_result = &mut ctx.accounts.draw_result;
    draw_result.draw_id = lottery_state.current_draw_id;
    draw_result.winning_numbers = winning_numbers;
    draw_result.randomness_proof = revealed_random_value;
    draw_result.timestamp = clock.unix_timestamp;
    
    // Determine rolldown via probabilistic linear interpolation
    let state = &ctx.accounts.lottery_state;
    let jackpot = state.jackpot_balance;
    let is_rolldown = if jackpot >= state.hard_cap {
        true  // 100% forced rolldown
    } else if jackpot <= state.soft_cap {
        false // 0% probability
    } else {
        // Linear interpolation: probability scales with excess over soft cap
        // Probability(bps) = (jackpot - soft_cap) * 10000 / (hard_cap - soft_cap)
        let excess = (jackpot - state.soft_cap) as u128;
        let range = (state.hard_cap - state.soft_cap) as u128;
        let probability_bps = (excess * 10000 / range) as u16;
        // Derive a deterministic threshold from randomness bytes
        let threshold = u16::from_le_bytes([
            revealed_random_value[30], revealed_random_value[31]
        ]) % 10000;
        threshold < probability_bps
    };
    
    draw_result.was_rolldown = is_rolldown;
    
    emit!(DrawExecuted {
        draw_id: draw_result.draw_id,
        winning_numbers,
        is_rolldown,
    });
    
    Ok(())
}

/// Calculate winners and distribute prizes
pub fn calculate_winners(ctx: Context<CalculateWinners>) -> Result<()> {
    let draw_result = &mut ctx.accounts.draw_result;
    let state = &mut ctx.accounts.lottery_state;
    
    // Winner counts provided off-chain, verified on-chain
    let winner_counts = ctx.accounts.winner_counts;
    
    draw_result.match_6_winners = winner_counts.match_6;
    draw_result.match_5_winners = winner_counts.match_5;
    draw_result.match_4_winners = winner_counts.match_4;
    draw_result.match_3_winners = winner_counts.match_3;
    draw_result.match_2_winners = winner_counts.match_2;
    
    if draw_result.was_rolldown && winner_counts.match_6 == 0 {
        // Rolldown: distribute jackpot to lower tiers (pari-mutuel)
        trigger_rolldown_internal(state, draw_result, winner_counts)?;
    } else if winner_counts.match_6 > 0 {
        // Jackpot won: divide among Match 6 winners
        let prize_per_winner = state.jackpot_balance / winner_counts.match_6 as u64;
        draw_result.match_6_prize_per_winner = prize_per_winner;
        state.jackpot_balance = state.seed_amount;
        state.is_rolldown_active = false;
    }
    
    // Set fixed prizes for normal mode
    if !draw_result.was_rolldown {
        draw_result.match_5_prize_per_winner = 4_000_000_000; // $4,000
        draw_result.match_4_prize_per_winner = 150_000_000;   // $150
        draw_result.match_3_prize_per_winner = 5_000_000;     // $5
        draw_result.match_2_prize_per_winner = 2_500_000;     // Free ticket value
    }
    
    Ok(())
}

fn trigger_rolldown_internal(
    state: &mut LotteryState,
    draw_result: &mut DrawResult,
    winner_counts: WinnerCounts,
) -> Result<()> {
    let jackpot = state.jackpot_balance;
    
    // Pari-mutuel distribution to lower tiers
    // Operator liability is CAPPED at exactly the jackpot amount
    let match_5_pool = jackpot * 25 / 100; // 25%
    let match_4_pool = jackpot * 35 / 100; // 35%
    let match_3_pool = jackpot * 40 / 100; // 40%
    
    if winner_counts.match_5 > 0 {
        draw_result.match_5_prize_per_winner = match_5_pool / winner_counts.match_5 as u64;
    }
    if winner_counts.match_4 > 0 {
        draw_result.match_4_prize_per_winner = match_4_pool / winner_counts.match_4 as u64;
    }
    if winner_counts.match_3 > 0 {
        draw_result.match_3_prize_per_winner = match_3_pool / winner_counts.match_3 as u64;
    }
    draw_result.match_2_prize_per_winner = 2_500_000; // Free ticket value
    
    // Reset jackpot to seed amount
    state.jackpot_balance = state.seed_amount;
    state.is_rolldown_active = false;
    
    emit!(RolldownExecuted {
        draw_id: draw_result.draw_id,
        total_distributed: jackpot,
        match_5_prize: draw_result.match_5_prize_per_winner,
        match_4_prize: draw_result.match_4_prize_per_winner,
        match_3_prize: draw_result.match_3_prize_per_winner,
    });
    
    Ok(())
}
```

#### 6.2.3 Prize Module (within mazelprotocol program)

**Purpose:** Manage fund custody and prize claims

```rust
/// Claim prize for a winning ticket
pub fn claim_prize(ctx: Context<ClaimPrize>) -> Result<()> {
    let ticket = &mut ctx.accounts.ticket;
    let draw_result = &ctx.accounts.draw_result;
    
    // Verify ticket is for this draw
    require!(ticket.draw_id == draw_result.draw_id, WrongDraw);
    
    // Verify not already claimed
    require!(!ticket.is_claimed, AlreadyClaimed);
    
    // Calculate matches
    let matches = count_matches(&ticket.numbers, &draw_result.winning_numbers);
    ticket.match_count = matches;
    
    // Determine prize using per-winner amounts
    let prize = match matches {
        6 => draw_result.match_6_prize_per_winner,
        5 => draw_result.match_5_prize_per_winner,
        4 => draw_result.match_4_prize_per_winner,
        3 => draw_result.match_3_prize_per_winner,
        2 => draw_result.match_2_prize_per_winner,
        _ => 0,
    };
    
    ticket.prize_amount = prize;
    ticket.is_claimed = true;
    
    if prize > 0 {
        // Transfer USDC to winner
        if matches == 2 {
            // Issue free ticket NFT instead of USDC
            mint_free_ticket_nft(ctx.accounts.player.key())?;
        } else {
            transfer_usdc(
                ctx.accounts.prize_pool_usdc,
                ctx.accounts.player_usdc,
                prize,
            )?;
        }
        
        ctx.accounts.lottery_state.total_prizes_paid += prize;
    }
    
    emit!(PrizeClaimed {
        ticket_id: ticket.key(),
        player: ctx.accounts.player.key(),
        match_count: matches,
        prize_amount: prize,
    });
    
    Ok(())
}

fn count_matches(ticket: &[u8; 6], winning: &[u8; 6]) -> u8 {
    let mut matches = 0;
    for &num in ticket.iter() {
        if winning.contains(&num) {
            matches += 1;
        }
    }
    matches
}
```

### 6.3 Randomness Generation

**Switchboard Randomness Integration (TEE + Commit-Reveal):**

Switchboard uses Trusted Execution Environments (TEEs) - protected areas inside a processor that cannot be altered or inspected. This means:
- No one, including the oracle operator, can alter the code running in the TEE
- No one can see what's happening inside the chip, only inputs and outputs
- Economic security via $SWTCH slashing for misbehaving oracles

```
┌───────────────────────────────────────────────────────────┐
│              SWITCHBOARD COMMIT-REVEAL FLOW                │
├───────────────────────────────────────────────────────────┤
│                                                            │
│  1. DRAW TIME REACHED                                      │
│     │                                                      │
│     ▼                                                      │
│  2. CREATE RANDOMNESS ACCOUNT                              │
│     └── Generate keypair for randomness account            │
│     └── Initialize via Switchboard program                 │
│     │                                                      │
│     ▼                                                      │
│  3. COMMIT PHASE                                           │
│     └── Commit to current Solana slothash                  │
│     └── Store commit slot in lottery state                 │
│     └── Randomness not yet revealed                        │
│     │                                                      │
│     ▼                                                      │
│  4. ORACLE GENERATES (inside TEE)                          │
│     └── Oracle generates randomness in secure enclave      │
│     └── Based on committed slot (cannot be manipulated)    │
│     └── Oracle cannot see or bias the randomness           │
│     │                                                      │
│     ▼                                                      │
│  5. REVEAL PHASE                                           │
│     └── Reveal randomness on-chain                         │
│     └── Verify commit slot matches                         │
│     └── Convert 32 bytes to winning numbers                │
│     │                                                      │
│     ▼                                                      │
│  6. SETTLEMENT                                             │
│     └── Calculate winners by match tier                    │
│     └── Distribute prizes                                  │
│     └── Check rolldown conditions                          │
│                                                            │
└───────────────────────────────────────────────────────────┘
```

**Security Guarantees:**
- Neither protocol nor oracle can predict randomness before commit
- Commit-reveal pattern prevents selective revelation attacks
- All proofs verifiable on-chain by anyone

**Number Derivation Algorithm:**

```rust
fn derive_lottery_numbers(random_words: [u64; 6]) -> [u8; 6] {
    let mut numbers: [u8; 6] = [0; 6];
    let mut available: Vec<u8> = (1..=46).collect();
    
    for i in 0..6 {
        // Use modulo to select from remaining numbers
        let index = (random_words[i] % available.len() as u64) as usize;
        numbers[i] = available.remove(index);
    }
    
    numbers.sort();
    numbers
}
```

This ensures:
- Each number is unique (no duplicates)
- Each number is equally likely (uniform distribution)
- Process is deterministic and verifiable

### 6.4 Data Indexing

**Off-Chain Indexer Requirements:**

```typescript
interface IndexerService {
    // Track all tickets for a draw
    async getTicketsForDraw(drawId: number): Promise<Ticket[]>;
    
    // Count winners by match tier
    async countWinners(
        drawId: number, 
        winningNumbers: number[]
    ): Promise<WinnerCounts>;
    
    // Get player history
    async getPlayerTickets(wallet: PublicKey): Promise<Ticket[]>;
    
    // Real-time jackpot tracking
    async getCurrentJackpot(): Promise<number>;
    
    // Rolldown probability calculation
    async getRolldownProbability(): Promise<number>;
}
```

**Indexer Architecture:**

```
┌─────────────────────────────────────────────────────────┐
│                    INDEXER STACK                         │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────────┐    ┌────────────┐    ┌────────────┐    │
│  │  SOLANA    │───▶│   GEYSER   │───▶│  POSTGRES  │    │
│  │   NODE     │    │  PLUGIN    │    │  DATABASE  │    │
│  └────────────┘    └────────────┘    └────────────┘    │
│                                              │          │
│                                              ▼          │
│                                       ┌────────────┐   │
│                                       │  GRAPHQL   │   │
│                                       │    API     │   │
│                                       └────────────┘   │
│                                              │          │
│                    ┌─────────────────────────┤          │
│                    ▼                         ▼          │
│             ┌────────────┐           ┌────────────┐    │
│             │    WEB     │           │   MOBILE   │    │
│             │    APP     │           │    APP     │    │
│             └────────────┘           └────────────┘    │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 6.5 Quick Pick Express (quickpick program — 5/35)

Quick Pick Express is a separate Anchor program offering faster, smaller draws alongside the main lottery.

**Game Parameters:**

| Parameter | Value |
|-----------|-------|
| Ticket Price | $1.50 USDC |
| Matrix | Pick 5 numbers from 1-35 |
| Draw Interval | 14,400 seconds (4 hours) |
| Access Gate | $50 lifetime main lottery spend required (frontend-only, not enforced on-chain) |
| Jackpot Seed | $5,000 |
| Soft Cap | $30,000 (probabilistic rolldown begins) |
| Hard Cap | $50,000 (forced 100% rolldown) |

**Dynamic House Fee:**

| Jackpot Range | Fee |
|---------------|-----|
| < $10,000 | 30% |
| $10,000 - $20,000 | 33% |
| $20,000 - $30,000 | 36% |
| >= $30,000 | 38% |
| Rolldown mode | 28% |

**Revenue Allocation (after house fee):**

- 60% jackpot
- 37% fixed prizes
- 3% insurance

**Fixed Prizes (Normal Mode):**

| Match Tier | Prize |
|------------|-------|
| Match 5 | Jackpot (variable) |
| Match 4 | $100 |
| Match 3 | $4 |

**Rolldown Distribution (pari-mutuel):**

- 60% to Match 4 winners
- 40% to Match 3 winners

Quick Pick Express uses the same probabilistic rolldown formula as the main lottery, the same Switchboard commit-reveal randomness flow, and the same two-step authority transfer and config timelock security patterns.

### 6.6 Current Implementation Status (v3.0)

> **40 on-chain instructions** across both programs as of the v3.0 audit.

**Fully Implemented:**

- Full draw lifecycle (commit → execute → finalize)
- Ticket purchase (single + bulk up to 50 via `UnifiedTicket`)
- Prize claiming (single + bulk + claim-all-bulk)
- Syndicate creation, joining, leaving, ticket purchasing, and prize distribution
- Syndicate Wars (monthly competition with registration, stats, finalization, prizes)
- Insurance pool with reserve fund allocation
- Config timelock (24-hour SHA256 hash-locked `propose_config` / `execute_config`)
- Two-step authority transfer (`propose_authority` / `accept_authority`)
- Permissionless solvency verification (`check_solvency`)
- Expired prize reclaim (`reclaim_expired_prizes` — 90-day window)
- Draw recovery (`advance_draw` — permissionless fallback, 30-min timeout)
- Verification hash for off-chain winner count validation
- Statistical plausibility checks on submitted winner counts
- MEV-tightened slot window (~4 seconds for randomness commit)

**Partially Implemented:**

- Streak tracking (tracked in `UserStats`, but bonus not yet applied to prizes)

**Not Yet Implemented:**

- Threshold encryption for MEV protection
- Jito bundle integration
- Client SDK package (`@mazelprotocol/sdk`)

**Removed from Earlier Designs:**

- `$LOTTO` token and staking system
- Second Chance Draws
- Mega Events

---

## 7. Insurance & Fund Protection System

### 7.1 Overview

MazelProtocol implements a multi-layered fund protection system designed to ensure prize pool solvency and protect player funds during edge cases and emergencies. This system consists of:

1. **Reserve Fund (3%)**: For jackpot seeding and normal shortfalls
2. **Insurance Pool (2%)**: For insolvency emergencies and catastrophic events
3. **Emergency Transfer Mechanism**: Controlled fund movement with audit trails
4. **Automatic Solvency Checks**: Prize scaling during insufficient funds

### 7.2 Fund Allocation Structure

Every ticket purchase is allocated as follows:

```
Ticket Price ($2.50 USDC)
├── House Fee (28-40%): Operator revenue
└── Prize Pool (60-72%):
    ├── Jackpot (55.6%): Main prize accumulation
    ├── Fixed Prizes (39.4%): Match 5/4/3 prizes
    ├── Reserve Fund (3.0%): Jackpot seeding buffer
    └── Insurance Pool (2.0%): Emergency protection
```

**Total Safety Buffer**: 5.0% (Reserve 3% + Insurance 2%)

### 7.3 Automatic Solvency Protection

During draw finalization, the protocol automatically checks prize pool solvency:

```rust
// Available funds for prize distribution
let available_prize_pool = jackpot_at_draw
    .saturating_add(lottery_state.reserve_balance)
    .saturating_add(lottery_state.insurance_balance);

// If insufficient for fixed prizes, scale down proportionally
if funds_for_fixed < total_fixed_required {
    let scale_factor_bps = ((funds_for_fixed as u128 * BPS_DENOMINATOR as u128) 
        / total_fixed_required as u128) as u16;
    // Scale Match 5, 4, 3 prizes proportionally
}
```

**Priority Order for Insolvency:**
1. Jackpot Balance (primary)
2. Reserve Balance (secondary - auto-used)
3. Insurance Balance (tertiary - emergency buffer)
4. Scale Prizes (last resort)

### 7.4 Emergency Fund Transfer

For catastrophic scenarios requiring manual intervention, the protocol includes an emergency fund transfer instruction:

```rust
pub fn emergency_fund_transfer(
    ctx: Context<EmergencyFundTransfer>,
    source: FundSource, // Reserve or Insurance
    amount: u64,
    reason: String,
) -> Result<()> {
    // Security requirements:
    // - Only callable by authority
    // - Requires multi-sig in production
    // - Should have timelock in production
    // - Emits detailed audit event
}
```

**Security Requirements:**
- **Multi-Sig Control**: Emergency transfers require 2-of-3 authority signatures
- **Timelock Delay**: 72-hour delay for transparency and community oversight
- **Audit Trail**: All transfers emit on-chain events with detailed reasoning
- **Transparency**: Transfer amounts and reasons are publicly visible

### 7.5 Insurance Pool Usage Scenarios

The insurance pool is designed for specific emergency scenarios:

1. **Catastrophic Prize Shortfall**: When combined jackpot + reserve is insufficient
2. **Protocol Bug Recovery**: Funds needed to compensate players after bugs
3. **Oracle Failure**: Randomness oracle failure requiring manual resolution
4. **Extreme Market Conditions**: Black swan events affecting prize pool stability

### 7.6 Economic Sustainability

The 5% safety buffer provides significant protection:

- **Expected Annual Ticket Sales**: $50M
- **Annual Safety Buffer**: $2.5M (5% of sales)
- **Maximum Single Draw Exposure**: $2.25M (hard cap)
- **Buffer Coverage**: 111% of maximum exposure

This ensures the protocol can withstand:
- 100% of maximum jackpot payout
- Multiple consecutive rolldown events
- Extreme winner concentration scenarios

### 7.7 Player Protection Guarantees

1. **Fund Segregation**: Player funds are never commingled with operator funds
2. **Transparent Accounting**: All balances are publicly verifiable on-chain
3. **Emergency Safeguards**: Multi-sig control prevents unilateral fund movement
4. **Automatic Protection**: Prize scaling prevents complete insolvency
5. **Audit Trail**: All fund movements are permanently recorded

## 8. Security Considerations

### 7.1 Threat Model

| Threat | Attack Vector | Mitigation |
|--------|---------------|------------|
| **RNG Manipulation** | Compromised oracle | Switchboard TEE ensures oracle cannot see/alter randomness |
| **Selective Revelation** | Only reveal favorable outcomes | Commit-reveal pattern - must commit before randomness known |
| **Front-Running** | MEV bots see winning numbers | Ticket sales close before commit; 10-slot reveal window minimizes MEV |
| **Smart Contract Exploit** | Code vulnerability | Multiple audits, formal verification, bug bounty |
| **Authority Abuse** | Malicious config change | 24-hour inline config timelock (propose → execute); two-step authority transfer; permissionless solvency checks |
| **Oracle Manipulation** | Fake winner counts | SHA256 verification hash; statistical plausibility checks; per-tier upper bounds |
| **Sybil Attack** | Fake volume inflation | USDC payment requirement, per-user ticket limits (5000/draw) |
| **Denial of Service** | Transaction spam | Priority fee market, rate limiting |

### 7.2 Access Control Matrix

> **Note:** There is no on-chain DAO. Authority is a single signer (multi-sig wallet recommended).

| Function | Public | Ticket Holder | Authority |
|----------|--------|---------------|-----------|
| Buy ticket | ✓ | ✓ | ✓ |
| Claim prize | | ✓ | |
| Check solvency | ✓ | ✓ | ✓ |
| Commit/execute draw | | | ✓ |
| Finalize draw | | | ✓ |
| Propose config (24h timelock) | | | ✓ |
| Execute config (after timelock) | | | ✓ |
| Emergency pause | | | ✓ |
| Emergency fund transfer | | | ✓ (daily cap enforced) |
| Propose authority transfer | | | ✓ |
| Accept authority transfer | | ✓ (proposed authority only) | |

### 7.3 Invariants

The protocol maintains these invariants at all times:

1. **Conservation of Value:**
   ```
   Total_Deposits = Jackpot + Reserve + Insurance + Prizes_Paid + House_Fees_Withdrawn
   ```

2. **Ticket Uniqueness:**
   ```
   ∀ ticket: ticket.draw_id ≤ current_draw_id
   ```

3. **Prize Bounds:**
   ```
   ∀ ticket: ticket.prize_amount ≤ jackpot_cap
   ```

4. **Temporal Ordering:**
   ```
   ticket.purchase_timestamp < draw.execution_timestamp
   ```

### 7.4 Audit Checklist

- [ ] Reentrancy protection on all external calls
- [ ] Integer overflow/underflow checks
- [ ] Access control on privileged functions
- [ ] Proper PDA derivation and validation
- [ ] Account ownership verification
- [ ] Signer verification
- [ ] Rent exemption handling
- [ ] CPI (Cross-Program Invocation) validation
- [ ] Event emission for all state changes
- [ ] Emergency pause functionality

---

## 9. Conclusion

### 8.1 Summary

MazelProtocol represents a paradigm shift in lottery design by embracing, rather than hiding, the mathematical realities of probability games. The rolldown mechanism creates a unique value proposition:

1. **For Casual Players:** Entertainment with transparent odds and the excitement of rolldown events
2. **For Sophisticated Players:** Predictable +EV windows for strategic participation
3. **For Operators:** Sustainable profitability through volume-based fees

### 8.2 Key Innovations

| Innovation | Impact |
|------------|--------|
| **Intentional +EV Windows** | Attracts sophisticated capital, increases volume |
| **On-Chain Transparency** | Builds trust, enables verification |
| **Rolldown Mechanism** | Creates unique game dynamics |
| **Syndicate System** | Community pooling and collaboration |
| **MEV Protection** | Fair participation for all players |

### 8.3 Future Directions

- Cross-chain expansion (Arbitrum, Base, other L2s)
- Additional game modes (Quick Pick)
- Prediction market integration
- Insurance products for players
- White-label platform for other projects

### 8.4 Call to Action

MazelProtocol invites participation from:
- **Developers:** Contribute to open-source protocol
- **Auditors:** Review and improve security
- **Players:** Participate in fair, transparent lottery
- **Syndicates:** Pool resources for strategic play
- **Researchers:** Study novel mechanism design

---

## 10. References

1. Selbee, G. (2018). "Cracking the Lottery Code: How a Retired Couple Won $26 Million." *60 Minutes Interview*.

2. Massachusetts State Lottery Commission. (2012). "Cash WinFall Game Rules and Procedures."

3. Switchboard Labs. (2024). "Switchboard Randomness Documentation." https://docs.switchboard.xyz/docs-by-chain/solana-svm/randomness

4. Solana Foundation. (2024). "Solana Program Library (SPL) Specification."

5. Buterin, V. et al. (2014). "A Next-Generation Smart Contract and Decentralized Application Platform." *Ethereum Whitepaper*.

6. Malkiel, B. (2019). *A Random Walk Down Wall Street*. W. W. Norton & Company.

7. von Neumann, J. & Morgenstern, O. (1944). *Theory of Games and Economic Behavior*. Princeton University Press.

8. Thaler, R. & Sunstein, C. (2008). *Nudge: Improving Decisions About Health, Wealth, and Happiness*. Yale University Press.

---

## 11. Appendices

### Appendix A: Full Probability Tables

**6/46 Matrix - Complete Probability Distribution:**

| Match | Combinations | Probability | Cumulative |
|-------|--------------|-------------|------------|
| 6 | 1 | 0.000000107 | 0.000000107 |
| 5 | 240 | 0.0000256 | 0.0000257 |
| 4 | 11,700 | 0.00125 | 0.00128 |
| 3 | 197,600 | 0.02110 | 0.02238 |
| 2 | 1,370,850 | 0.14634 | 0.16872 |
| 1 | 3,948,048 | 0.42153 | 0.59025 |
| 0 | 3,838,380 | 0.40982 | 1.000 |
| **Total** | **9,366,819** | **1.000** | |

### Appendix B: Economic Simulation Results

**Monte Carlo Simulation (100,000 cycles):**

| Metric | Mean | Std Dev | 5th %ile | 95th %ile |
|--------|------|---------|----------|-----------|
| Cycle Length (days) | 13.8 | 2.1 | 10 | 18 |
| Cycle Result | Positive | — | Break-even | Positive |
| Rolldown Volume | 715,000 | 120,000 | 520,000 | 920,000 |
| Player EV (rolldown) | $2.81 | $0.15 | $2.58 | $3.08 |

### Appendix C: Smart Contract Addresses

| Program | Address | Network |
|---------|---------|---------|
| Main Lottery (mazelprotocol) | `7WyaHk2u8AgonsryMpnvbtp42CfLJFPQpyY5p9ys6FiF` | Devnet |
| Quick Pick Express (quickpick) | `7XC1KT5mvsHHXbR2mH6er138fu2tJ4L2fAgmpjLnnZK2` | Devnet |

> **Note:** Mainnet addresses TBD after audit and deployment. There are no separate
> TicketManager, DrawEngine, PrizePool, or Governance programs — all logic lives
> within the two programs above.

### Appendix D: Glossary

| Term | Definition |
|------|------------|
| **EV (Expected Value)** | The average outcome of a bet if repeated infinitely |
| **House Edge** | The percentage advantage the operator has |
| **Rolldown** | Distribution of jackpot to lower tiers when unclaimed |
| **TEE** | Trusted Execution Environment - secure hardware enclave |
| **Commit-Reveal** | Pattern where user commits before randomness is known |
| **Matrix** | The lottery format (e.g., 6/46 = pick 6 from 46) |
| **Seed** | The initial jackpot amount after reset |
| **Cap** | Maximum jackpot before rolldown triggers |

---

*Document Version: 3.1*
*Last Updated: 2025*
*Authors: MazelProtocol Team*

---

<div align="center">

**© 2025 MazelProtocol**

*Building the future of fair, transparent, and mathematically sound lotteries.*

</div>