# SolanaLotto Constants Documentation Guide

## Overview

This guide provides comprehensive documentation for all constants used in the SolanaLotto protocol. Constants are organized into logical categories with detailed explanations, usage examples, and mathematical formulas.

> **🔒 CRITICAL DESIGN FEATURE: FIXED → PARI-MUTUEL PRIZE TRANSITION**
>
> All prizes in SolanaLotto START as **FIXED amounts** during normal operation, then TRANSITION to **PARI-MUTUEL** (shared pool) distribution during:
> 1. **Rolldown events** — All prizes become pari-mutuel
> 2. **High-volume draws** — When (Winners × Fixed Prize) > Pool triggers transition
> 3. **Multiple winner scenarios** — Automatic pool sharing
>
> This hybrid system ensures **operator liability is ALWAYS CAPPED** while maintaining attractive +EV windows for players. During rolldown, the operator pays out EXACTLY the jackpot amount—no more, no less—regardless of how many tickets are sold or how many winners there are.

## Table of Contents

1. [Program Constants (PDA Seeds)](#1-program-constants-pda-seeds)
2. [Core Game Parameters](#2-core-game-parameters)
3. [Dynamic House Fee System](#3-dynamic-house-fee-system)
4. [Soft/Hard Cap System](#4-softhard-cap-system)
5. [Prize Allocation System](#5-prize-allocation-system)
6. [Fixed Prize Amounts](#6-fixed-prize-amounts)
7. [Rolldown Allocation](#7-rolldown-allocation)
8. [Quick Pick Express](#8-quick-pick-express)
9. [Lucky Numbers NFT](#9-lucky-numbers-nft)
10. [Syndicate Wars](#10-syndicate-wars)
11. [Limits & Validation](#11-limits--validation)
12. [Randomness & Timing](#12-randomness--timing)
13. [Mathematical Constants](#13-mathematical-constants)
14. [Account Sizes](#14-account-sizes)
15. [Helper Functions](#15-helper-functions)
16. [Enumerations](#16-enumerations)

## Conventions

### Basis Points (BPS)
- `100 BPS = 1%`
- `10,000 BPS = 100%`
- Example: `2,800 BPS = 28%`

### Amount Formats
- **USDC amounts**: In lamports (6 decimals) - `$1.00 = 1,000,000`
- **SOL amounts**: In lamports (9 decimals) - `1 SOL = 1,000,000,000`

### Time Formats
- All timestamps in Unix seconds
- All intervals in seconds

---

## 1. Program Constants (PDA Seeds)

Program Derived Address (PDA) seeds used for deterministic account derivation.

### State Accounts
| Constant | Value | Description | Usage |
|----------|-------|-------------|-------|
| `LOTTERY_SEED` | `b"lottery"` | Global lottery state (singleton) | `Pubkey::find_program_address(&[LOTTERY_SEED], &program_id)` |
| `TICKET_SEED` | `b"ticket"` | Individual ticket accounts | Ticket PDA derivation with owner and draw ID |
| `DRAW_SEED` | `b"draw"` | Historical draw results | Draw result PDA with draw ID |
| `USER_SEED` | `b"user"` | User statistics and tracking | User stats PDA with wallet address |
| `SYNDICATE_SEED` | `b"syndicate"` | Syndicate (group play) accounts | Syndicate PDA with creator and ID |

### Token Accounts
| Constant | Value | Description |
|----------|-------|-------------|
| `PRIZE_POOL_USDC_SEED` | `b"prize_pool_usdc"` | Prize pool USDC token account (holds all prize funds) |
| `HOUSE_FEE_USDC_SEED` | `b"house_fee_usdc"` | House fee USDC token account (collects operator revenue) |

### Advanced Features
| Constant | Value | Description |
|----------|-------|-------------|
| `LUCKY_NUMBERS_SEED` | `b"lucky_numbers"` | Lucky Numbers NFT accounts (Match 4+ winners) |
| `QUICK_PICK_SEED` | `b"quick_pick"` | Quick Pick Express game state |
| `SYNDICATE_WARS_SEED` | `b"syndicate_wars"` | Syndicate Wars competition entries |

### External Integrations
| Constant | Value | Description |
|----------|-------|-------------|
| `SWITCHBOARD_QUEUE_SEED` | `b"switchboard_queue"` | Switchboard VRF queue for randomness generation |
| `RANDOMNESS_ACCOUNT_SEED` | `b"randomness_account"` | Switchboard randomness result account |

---

## 2. Core Game Parameters

Main 6/46 lottery configuration.

| Constant | Value | Description | Rationale |
|----------|-------|-------------|-----------|
| `TICKET_PRICE` | `2,500,000` lamports | Ticket price ($2.50) | Accessible price point for mass adoption |
| `NUMBERS_PER_TICKET` | `6` | Numbers per ticket | 6/46 matrix configuration |
| `MIN_NUMBER` | `1` | Minimum selectable number | Inclusive lower bound |
| `MAX_NUMBER` | `46` | Maximum selectable number | Inclusive upper bound |
| `DRAW_INTERVAL` | `86,400` seconds | Draw frequency (24 hours) | Maintains engagement and jackpot growth |
| `SEED_AMOUNT` | `500,000,000,000` lamports | Jackpot seed ($500,000) | Attractive starting point for each cycle |
| `JACKPOT_CAP` | `1,750,000,000,000` lamports | Maximum jackpot ($1.75M) | Rolldown trigger threshold |

### Odds Calculation (6/46 Matrix)
```
Total combinations: C(46, 6) = 9,366,819
Jackpot odds: 1 in 9,366,819
Match 5 odds: 1 in 39,028
Match 4 odds: 1 in 800
Match 3 odds: 1 in 47
Match 2 odds: 1 in 6.8
```

---

## 3. Dynamic House Fee System

Jackpot-linked fee scaling that optimizes revenue extraction.

### Fee Tiers
| Jackpot Level | Threshold | House Fee | Prize Pool | Player EV Impact |
|---------------|-----------|-----------|------------|------------------|
| Tier 1 | < $500k | 28% | 72% | Higher EV attracts early players |
| Tier 2 | $500k - $1M | 32% | 68% | Standard operations |
| Tier 3 | $1M - $1.5M | 36% | 64% | Building anticipation |
| Tier 4 | > $1.5M | 40% | 60% | Maximum extraction during rolldown zone |
| Rolldown | Any | 28% | 72% | Encourages volume during rolldown |

### Constants
| Constant | Value | Description |
|----------|-------|-------------|
| `FEE_TIER_1_THRESHOLD` | `500,000,000,000` lamports | $500k threshold |
| `FEE_TIER_2_THRESHOLD` | `1,000,000,000,000` lamports | $1M threshold |
| `FEE_TIER_3_THRESHOLD` | `1,500,000,000,000` lamports | $1.5M threshold |
| `FEE_TIER_1_BPS` | `2,800` BPS (28%) | Fee for jackpot < $500k |
| `FEE_TIER_2_BPS` | `3,200` BPS (32%) | Fee for $500k - $1M |
| `FEE_TIER_3_BPS` | `3,600` BPS (36%) | Fee for $1M - $1.5M |
| `FEE_TIER_4_BPS` | `4,000` BPS (40%) | Fee for jackpot > $1.5M |
| `FEE_ROLLDOWN_BPS` | `2,800` BPS (28%) | Fee during rolldown events |

### Fee Calculation Formula
```rust
pub fn calculate_house_fee_bps(jackpot_balance: u64, is_rolldown_pending: bool) -> u16 {
    if is_rolldown_pending {
        return FEE_ROLLDOWN_BPS;
    }
    
    if jackpot_balance < FEE_TIER_1_THRESHOLD {
        FEE_TIER_1_BPS
    } else if jackpot_balance < FEE_TIER_2_THRESHOLD {
        FEE_TIER_2_BPS
    } else if jackpot_balance < FEE_TIER_3_THRESHOLD {
        FEE_TIER_3_BPS
    } else {
        FEE_TIER_4_BPS
    }
}
```

---

## 4. Soft/Hard Cap System

Two-tier rolldown system with probabilistic triggers.

### Constants
| Constant | Value | Description |
|----------|-------|-------------|
| `SOFT_CAP` | `1,750,000,000,000` lamports | Soft cap ($1.75M) - probabilistic rolldown begins |
| `HARD_CAP` | `2,250,000,000,000` lamports | Hard cap ($2.25M) - forced rolldown triggers |

### Probability Calculation
```rust
pub fn should_probabilistic_rolldown(jackpot_balance: u64, random_value: u64) -> bool {
    if jackpot_balance < SOFT_CAP {
        return false; // Below soft cap, never rolldown
    }
    
    if jackpot_balance >= HARD_CAP {
        return true; // At or above hard cap, always rolldown
    }
    
    // Linear probability between soft and hard caps
    let probability_bps = ((jackpot_balance - SOFT_CAP) as u128 * BPS_PER_100_PERCENT as u128
        / (HARD_CAP - SOFT_CAP) as u128) as u64;
    
    random_value < probability_bps
}
```

### System Behavior
1. **Below Soft Cap**: No rolldown possible (0% probability)
2. **Soft Cap to Hard Cap**: Linear probability from 0% to 100%
3. **At/Above Hard Cap**: Guaranteed rolldown (100% probability)

---

## 5. Prize Allocation System

Prize pool distribution percentages.

| Constant | Value | Description | Allocation |
|----------|-------|-------------|------------|
| `JACKPOT_ALLOCATION_BPS` | `5,760` BPS (57.6%) | Jackpot allocation | 57.6% of prize pool |
| `FIXED_PRIZE_ALLOCATION_BPS` | `3,940` BPS (39.4%) | Fixed prize allocation | 39.4% of prize pool |
| `RESERVE_ALLOCATION_BPS` | `300` BPS (3%) | Reserve fund allocation | 3% of prize pool |

### Allocation Formula
```rust
let ticket_price = TICKET_PRICE;
let house_fee_bps = calculate_house_fee_bps(jackpot_balance, false);
let house_fee = ticket_price * house_fee_bps as u64 / 10000;
let prize_pool = ticket_price - house_fee;

let jackpot_contribution = prize_pool * JACKPOT_ALLOCATION_BPS as u64 / 10000;
let fixed_prize_contribution = prize_pool * FIXED_PRIZE_ALLOCATION_BPS as u64 / 10000;
let reserve_contribution = prize_pool * RESERVE_ALLOCATION_BPS as u64 / 10000;
```

---

## 6. Fixed Prize Amounts — NORMAL MODE

Guaranteed prize values for each match tier during **NORMAL MODE** (before rolldown triggers).

> **⚠️ PRIZE MODE: FIXED** — These prizes are predetermined fixed amounts. They automatically transition to PARI-MUTUEL during rolldown events or when winner count would exceed pool capacity.

| Constant | Value | Description | Match Tier |
|----------|-------|-------------|------------|
| `MATCH_5_PRIZE` | `4,000,000,000` lamports | $4,000 prize | Match 5 |
| `MATCH_4_PRIZE` | `150,000,000` lamports | $150 prize | Match 4 |
| `MATCH_3_PRIZE` | `5,000,000` lamports | $5 prize | Match 3 |
| `MATCH_2_VALUE` | `2,500,000` lamports | $2.50 value (free ticket) | Match 2 |

### Fixed Prize Logic
- **Match 6**: Jackpot (variable amount from jackpot pool)
- **Match 5**: Fixed $4,000 prize
- **Match 4**: Fixed $150 prize
- **Match 3**: Fixed $5 prize
- **Match 2**: Free ticket (value equal to ticket price)
- **Match 0-1**: No prize

---

## 7. Rolldown Allocation — PARI-MUTUEL MODE

Jackpot distribution during rolldown events using **PARI-MUTUEL** prize calculation.

> **🔒 PRIZE MODE TRANSITION: FIXED → PARI-MUTUEL**
>
> During rolldown, ALL prizes transition from fixed amounts to pari-mutuel distribution. This means:
> - **Total payout = EXACTLY the jackpot amount** (capped operator liability)
> - **Prize per winner = Pool Share × Jackpot ÷ Winner Count**
> - Operator liability is mathematically CAPPED regardless of volume

| Constant | Value | Description | Allocation |
|----------|-------|-------------|------------|
| `ROLLDOWN_MATCH_5_BPS` | `2,500` BPS (25%) | Match 5 rolldown allocation | 25% of jackpot |
| `ROLLDOWN_MATCH_4_BPS` | `3,500` BPS (35%) | Match 4 rolldown allocation | 35% of jackpot |
| `ROLLDOWN_MATCH_3_BPS` | `4,000` BPS (40%) | Match 3 rolldown allocation | 40% of jackpot |

### Rolldown Distribution
When no Match 6 winner and rolldown triggers:
1. **Match 6**: 0% (no winner)
2. **Match 5**: 25% of jackpot divided among Match 5 winners
3. **Match 4**: 35% of jackpot divided among Match 4 winners
4. **Match 3**: 40% of jackpot divided among Match 3 winners
5. **Match 2**: 0% (no rolldown allocation)

### Prize Calculation Example — PARI-MUTUEL FORMULA
```rust
// PARI-MUTUEL: Prize = Pool ÷ Winners (operator liability CAPPED at jackpot)
let jackpot = 1_750_000_000_000; // $1.75M — this is the TOTAL operator liability
let match_5_winners = 20;
let match_4_winners = 1200;
let match_3_winners = 20000;

// Pari-mutuel prize calculation
let match_5_pool = jackpot * ROLLDOWN_MATCH_5_BPS as u64 / 10000; // $437,500
let match_4_pool = jackpot * ROLLDOWN_MATCH_4_BPS as u64 / 10000; // $612,500
let match_3_pool = jackpot * ROLLDOWN_MATCH_3_BPS as u64 / 10000; // $700,000

let match_5_prize = match_5_pool / match_5_winners as u64; // ~$21,875 each
let match_4_prize = match_4_pool / match_4_winners as u64; // ~$510 each
let match_3_prize = match_3_pool / match_3_winners as u64; // ~$35 each

// 🔒 TOTAL PAYOUT = $437,500 + $612,500 + $700,000 = $1,750,000 (EXACTLY the jackpot)
// Operator liability is CAPPED regardless of ticket volume or winner count!
```

---

## 8. Quick Pick Express — FIXED → PARI-MUTUEL PRIZE SYSTEM

5/35 mini-game with **full rolldown mechanics and +59% player edge exploit** — exclusive to committed players.

> **🔒 PRIZE TRANSITION:** Quick Pick Express uses the same Fixed → Pari-Mutuel prize transition system as the main lottery. Normal mode prizes are FIXED; rolldown prizes are PARI-MUTUEL (operator liability CAPPED at jackpot amount).

> ⚠️ **$50 Gate Requirement**: Players must have spent $50+ lifetime in the main lottery to access Quick Pick Express.

**🎯 Key Feature:** During rolldown events, players enjoy **+58.7% positive expected value** using pari-mutuel prize distribution — comparable to the main lottery's optimal rolldown conditions.

### Access Gate
| Constant | Value | Description |
|----------|-------|-------------|
| `QUICK_PICK_MIN_SPEND_GATE` | `50,000,000` lamports | $50 minimum main lottery spend required |

### Core Parameters
| Constant | Value | Description |
|----------|-------|-------------|
| `QUICK_PICK_TICKET_PRICE` | `1,500,000` lamports | Ticket price ($1.50) |
| `QUICK_PICK_NUMBERS` | `5` | Numbers per ticket |
| `QUICK_PICK_RANGE` | `35` | Number range (1-35) |
| `QUICK_PICK_INTERVAL` | `14,400` seconds | Draw interval (4 hours) |

### Jackpot System
| Constant | Value | Description |
|----------|-------|-------------|
| `QUICK_PICK_SEED_AMOUNT` | `5,000,000,000` lamports | Jackpot seed ($5,000) |
| `QUICK_PICK_SOFT_CAP` | `30,000,000,000` lamports | Soft cap ($30,000) - probabilistic rolldown |
| `QUICK_PICK_HARD_CAP` | `40,000,000,000` lamports | Hard cap ($40,000) - forced rolldown |

### Dynamic Fee Tiers
| Constant | Value | Description |
|----------|-------|-------------|
| `QUICK_PICK_FEE_TIER_1_THRESHOLD` | `10,000,000,000` lamports | $10,000 threshold |
| `QUICK_PICK_FEE_TIER_2_THRESHOLD` | `20,000,000,000` lamports | $20,000 threshold |
| `QUICK_PICK_FEE_TIER_3_THRESHOLD` | `30,000,000,000` lamports | $30,000 threshold |
| `QUICK_PICK_FEE_TIER_1_BPS` | `3,000` BPS (30%) | Fee for jackpot < $10,000 |
| `QUICK_PICK_FEE_TIER_2_BPS` | `3,300` BPS (33%) | Fee for $10,000 - $20,000 |
| `QUICK_PICK_FEE_TIER_3_BPS` | `3,600` BPS (36%) | Fee for $20,000 - $30,000 |
| `QUICK_PICK_FEE_TIER_4_BPS` | `3,800` BPS (38%) | Fee for jackpot > $30,000 |
| `QUICK_PICK_FEE_ROLLDOWN_BPS` | `2,800` BPS (28%) | Fee during rolldown (encourages volume) |

### Fixed Prizes (Normal Mode) — NO FREE TICKET
> **⚠️ PRIZE MODE: FIXED** — These are fixed amounts during normal operation. They transition to PARI-MUTUEL during rolldown events.

| Constant | Value | Description | Prize Mode |
|----------|-------|-------------|------------|
| `QUICK_PICK_MATCH_4_PRIZE` | `100,000,000` lamports | $100 prize for Match 4 | **FIXED** |
| `QUICK_PICK_MATCH_3_PRIZE` | `4,000,000` lamports | $4 prize for Match 3 | **FIXED** |
| — | — | No Match 2 prize in Quick Pick Express | — |

### Rolldown Allocation (THE EXPLOIT: +59% Player Edge!) — PARI-MUTUEL
> **🔒 PRIZE MODE: PARI-MUTUEL** — During rolldown, prizes are calculated as Pool ÷ Winners. Operator liability is CAPPED at exactly the jackpot amount ($30,000-$40,000).

| Constant | Value | Description | Prize Mode |
|----------|-------|-------------|------------|
| `QUICK_PICK_ROLLDOWN_MATCH_4_BPS` | `6,000` BPS (60%) | Match 4 pool allocation | **PARI-MUTUEL** |
| `QUICK_PICK_ROLLDOWN_MATCH_3_BPS` | `4,000` BPS (40%) | Match 3 pool allocation | **PARI-MUTUEL** |

**Pari-Mutuel Prize Formula:** `Prize per Winner = (Pool Share × Jackpot) ÷ Winner Count`

### Prize Pool Allocation (No Free Tickets = More to Jackpot)
| Constant | Value | Description |
|----------|-------|-------------|
| `QUICK_PICK_JACKPOT_ALLOCATION_BPS` | `6,000` BPS (60%) | Jackpot allocation |
| `QUICK_PICK_FIXED_PRIZE_ALLOCATION_BPS` | `3,700` BPS (37%) | Fixed prize allocation |
| `QUICK_PICK_INSURANCE_ALLOCATION_BPS` | `300` BPS (3%) | Insurance pool allocation |

### Odds (5/35 Matrix)
```
Total combinations: C(35, 5) = 324,632
Match 5 (Jackpot): 1 in 324,632 (0.000308%)
Match 4: 1 in 2,164 (0.0462%)
Match 3: 1 in 74.6 (1.34%)
Match 2: No prize (12.5% - no free ticket in Quick Pick)
```

### Expected Value Analysis — FIXED vs PARI-MUTUEL
```
NORMAL MODE (FIXED PRIZES — 87-91% house edge):
├── Match 5: $15,000 × 1/324,632 = $0.046
├── Match 4: $100 (FIXED) × 1/2,164 = $0.046
├── Match 3: $4 (FIXED) × 1/74.6 = $0.054
├── Match 2: $0 (no free ticket)
├── Total EV: ~$0.15 on $1.50 ticket
├── Prize Mode: FIXED amounts

🔥 ROLLDOWN MODE (PARI-MUTUEL PRIZES — +58.7% PLAYER EDGE):
├── Match 4: ~$3,000* (PARI-MUTUEL) × 1/2,164 = $1.39
├── Match 3: ~$74* (PARI-MUTUEL) × 1/74.6 = $0.99
├── Match 2: $0 (no free ticket)
├── Total EV: $2.38 on $1.50 ticket
├── PROFIT: +$0.88 per ticket!
├── Prize Mode: PARI-MUTUEL (Pool ÷ Winners)

*Estimated at ~12,000 tickets. Actual = Pool ÷ Winners.
```

> **🔒 OPERATOR PROTECTION:** During rolldown, total payout is EXACTLY $30,000 (the jackpot) — regardless of whether 5,000 or 50,000 tickets are sold. The pari-mutuel system absorbs all volume risk.

### Gate Verification
```rust
pub fn verify_quick_pick_eligibility(user_stats: &UserStats) -> Result<()> {
    require!(
        user_stats.total_spent >= QUICK_PICK_MIN_SPEND_GATE,
        LottoError::InsufficientMainLotterySpend
    );
    Ok(())
}
```

### Dynamic Fee Calculation
```rust
pub fn calculate_quick_pick_fee_bps(jackpot_balance: u64, is_rolldown_pending: bool) -> u16 {
    if is_rolldown_pending {
        return QUICK_PICK_FEE_ROLLDOWN_BPS; // 28% during rolldown
    }
    
    if jackpot_balance < QUICK_PICK_FEE_TIER_1_THRESHOLD {  // < $10k
        QUICK_PICK_FEE_TIER_1_BPS  // 30%
    } else if jackpot_balance < QUICK_PICK_FEE_TIER_2_THRESHOLD {  // $10k-$20k
        QUICK_PICK_FEE_TIER_2_BPS  // 33%
    } else if jackpot_balance < QUICK_PICK_FEE_TIER_3_THRESHOLD {  // $20k-$30k
        QUICK_PICK_FEE_TIER_3_BPS  // 36%
    } else {  // > $30k
        QUICK_PICK_FEE_TIER_4_BPS  // 38%
    }
}
```

### Probabilistic Rolldown
```rust
pub fn should_quick_pick_rolldown(jackpot_balance: u64, random_value: u64) -> bool {
    if jackpot_balance < QUICK_PICK_SOFT_CAP {  // < $30,000
        return false;
    }
    if jackpot_balance >= QUICK_PICK_HARD_CAP {  // >= $40,000
        return true;  // Forced rolldown!
    }
    
    // Linear probability between $30k and $40k
    // At $35k: 50% chance, at $38k: 80% chance, etc.
    let probability_bps = ((jackpot_balance - QUICK_PICK_SOFT_CAP) as u128 * 10000
        / (QUICK_PICK_HARD_CAP - QUICK_PICK_SOFT_CAP) as u128) as u64;
    
    (random_value % 10000) < probability_bps
}
```

---

## 9. Lucky Numbers NFT

Lucky Numbers NFT configuration for Match 4+ winners.

| Constant | Value | Description |
|----------|-------|-------------|
| `LUCKY_NUMBERS_BONUS_BPS` | `100` BPS (1%) | Bonus percentage of jackpot |
| `LUCKY_NUMBERS_MIN_MATCH` | `4` | Minimum match tier to receive NFT |

---

## 10. Syndicate Wars

Monthly syndicate competition configuration.

| Constant | Value | Description |
|----------|-------|-------------|
| `SYNDICATE_WARS_POOL_BPS` | `100` BPS (1%) | Pool percentage of monthly sales |
| `SYNDICATE_WARS_MIN_TICKETS` | `1,000` | Minimum tickets to qualify |

---

## 11. Limits & Validation

System limits and validation parameters.

| Constant | Value | Description |
|----------|-------|-------------|
| `MAX_BULK_TICKETS` | `10` | Maximum tickets per bulk purchase |
| `MAX_SYNDICATE_MEMBERS` | `100` | Maximum members per syndicate |
| `MAX_NUMBER` | `46` | Maximum selectable number (main lottery) |
| `MIN_NUMBER` | `1` | Minimum selectable number |
| `NUMBERS_PER_TICKET` | `6` | Numbers per ticket (main lottery) |

---

## 12. Comparison: Main Lottery vs Quick Pick Express — FIXED → PARI-MUTUEL

| Feature | Main Lottery (6/46) | Quick Pick Express (5/35) |
|---------|---------------------|---------------------------|
| **Ticket Price** | $2.50 | $1.50 |
| **Draw Frequency** | Daily | Every 4 hours |
| **Jackpot Odds** | 1 in 9.37M | 1 in 324,632 |
| **Jackpot Seed** | $500,000 | $5,000 |
| **Soft Cap** | $1,750,000 | $30,000 |
| **Hard Cap** | $2,250,000 | $40,000 |
| **Cycle Duration** | ~15-16 days | ~2-3 days |
| **Rolldown Mechanics** | ✅ Probabilistic | ✅ Probabilistic |
| **Dynamic Fees** | ✅ 28-40% | ✅ 28-38% |
| **Access** | Open to all | $50 gate required |
| **Free Ticket (Match 2)** | ✅ Yes | ❌ No |
| **Normal Mode Prizes** | **FIXED** | **FIXED** |
| **Rolldown Prizes** | **PARI-MUTUEL** | **PARI-MUTUEL** |
| **Normal Mode Edge** | -65% (house) | -89% (house) |
| **🔥 Rolldown EV** | **+14.6% to +62% (player)** | **+58.7% (player)** |
| **Rolldown Frequency** | ~Every 2-3 weeks | ~Every 2-3 days |
| **🔒 Prize Transition** | **Fixed → Pari-Mutuel** | **Fixed → Pari-Mutuel** |

> **🔒 CRITICAL OPERATOR PROTECTION:** Both games use the Fixed → Pari-Mutuel prize transition system. During rolldown events:
> - **Main Lottery:** Operator liability CAPPED at $1,750,000-$2,250,000 (the jackpot)
> - **Quick Pick:** Operator liability CAPPED at $30,000-$40,000 (the jackpot)
>
> Regardless of ticket volume or winner count, operators pay EXACTLY the jackpot amount during rolldown. The pari-mutuel system absorbs all volume risk while preserving player +EV.
