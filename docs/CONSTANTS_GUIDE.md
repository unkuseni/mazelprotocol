# SolanaLotto Constants Documentation Guide

## Overview

This guide provides comprehensive documentation for all constants used in the SolanaLotto protocol. Constants are organized into logical categories with detailed explanations, usage examples, and mathematical formulas.

## Table of Contents

1. [Program Constants (PDA Seeds)](#1-program-constants-pda-seeds)
2. [Core Game Parameters](#2-core-game-parameters)
3. [Dynamic House Fee System](#3-dynamic-house-fee-system)
4. [Soft/Hard Cap System](#4-softhard-cap-system)
5. [Prize Allocation System](#5-prize-allocation-system)
6. [Fixed Prize Amounts](#6-fixed-prize-amounts)
7. [Rolldown Allocation](#7-rolldown-allocation)
8. [Staking System](#8-staking-system)
9. [Quick Pick Express](#9-quick-pick-express)
10. [Lucky Numbers NFT](#10-lucky-numbers-nft)
11. [Second Chance Draws](#11-second-chance-draws)
12. [Syndicate Wars](#12-syndicate-wars)
13. [Limits & Validation](#13-limits--validation)
14. [Randomness & Timing](#14-randomness--timing)
15. [Mathematical Constants](#15-mathematical-constants)
16. [Account Sizes](#16-account-sizes)
17. [Helper Functions](#17-helper-functions)
18. [Enumerations](#18-enumerations)

## Conventions

### Basis Points (BPS)
- `100 BPS = 1%`
- `10,000 BPS = 100%`
- Example: `2,800 BPS = 28%`

### Amount Formats
- **USDC amounts**: In lamports (6 decimals) - `$1.00 = 1,000,000`
- **$LOTTO amounts**: In lamports (9 decimals) - `1 LOTTO = 1,000,000,000`
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
| `STAKE_SEED` | `b"stake"` | $LOTTO token staking accounts | Stake account PDA with wallet address |
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
| `SECOND_CHANCE_SEED` | `b"second_chance"` | Second chance draw entries |
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

## 6. Fixed Prize Amounts

Guaranteed prize values for each match tier (normal mode).

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

## 7. Rolldown Allocation

Jackpot distribution during rolldown events.

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

### Prize Calculation Example
```rust
let jackpot = 1_750_000_000_000; // $1.75M
let match_5_winners = 20;
let match_4_winners = 1200;
let match_3_winners = 20000;

let match_5_prize = jackpot * ROLLDOWN_MATCH_5_BPS as u64 / 10000 / match_5_winners as u64;
let match_4_prize = jackpot * ROLLDOWN_MATCH_4_BPS as u64 / 10000 / match_4_winners as u64;
let match_3_prize = jackpot * ROLLDOWN_MATCH_3_BPS as u64 / 10000 / match_3_winners as u64;
```

---

## 8. Staking System

$LOTTO token staking tiers and rewards.

### Tier Thresholds
| Constant | Value | Description | LOTTO Amount |
|----------|-------|-------------|--------------|
| `BRONZE_THRESHOLD` | `1,000,000,000,000` lamports | Bronze tier threshold | 1,000 LOTTO |
| `SILVER_THRESHOLD` | `10,000,000,000,000` lamports | Silver tier threshold | 10,000 LOTTO |
| `GOLD_THRESHOLD` | `50,000,000,000,000` lamports | Gold tier threshold | 50,000 LOTTO |
| `DIAMOND_THRESHOLD` | `250,000,000,000,000` lamports | Diamond tier threshold | 250,000 LOTTO |

### Reward Rates (per epoch)
| Constant | Value | Description | Annualized Rate* |
|----------|-------|-------------|------------------|
| `BRONZE_REWARD_BPS` | `100` BPS (1%) | Bronze reward rate | ~12% |
| `SILVER_REWARD_BPS` | `150` BPS (1.5%) | Silver reward rate | ~18% |
| `GOLD_REWARD_BPS` | `200` BPS (2%) | Gold reward rate | ~24% |
| `DIAMOND_REWARD_BPS` | `250` BPS (2.5%) | Diamond reward rate | ~30% |

*Assuming 12 epochs per year

### Tier Determination
```rust
pub fn get_stake_tier(staked_amount: u64) -> StakeTier {
    if staked_amount >= DIAMOND_THRESHOLD {
        StakeTier::Diamond
    } else if staked_amount >= GOLD_THRESHOLD {
        StakeTier::Gold
    } else if staked_amount >= SILVER_THRESHOLD {
        StakeTier::Silver
    } else if staked_amount >= BRONZE_THRESHOLD {
        StakeTier::Bronze
    } else {
        StakeTier::None
    }
}
```

### Benefits by Tier
| Tier | Ticket Discount | Fee Share | Reward Rate | Minimum Stake |
|------|----------------|-----------|-------------|---------------|
| None | 0% | 0% | 0% | 0 LOTTO |
| Bronze | 5% | 0.5% | 1% | 1,000 LOTTO |
| Silver | 10% | 1.5% | 1.5% | 10,000 LOTTO |
| Gold | 15% | 3% | 2% | 50,000 LOTTO |
| Diamond | 20% | 5% | 2.5% | 250,000 LOTTO |

---

## 9. Quick Pick Express

4/20 mini-game configuration.

| Constant | Value | Description |
|----------|-------|-------------|
| `QUICK_PICK_TICKET_PRICE` | `500,000` lamports | Ticket price ($0.50) |
| `QUICK_PICK_NUMBERS` | `4` | Numbers per ticket |
| `QUICK_PICK_RANGE` | `20` | Number range (1-20) |
| `QUICK_PICK_HOUSE_FEE_BPS` | `3,000` BPS (30%) | House fee percentage |
| `QUICK_PICK_INTERVAL` | `14,400` seconds | Draw interval (4 hours) |
| `QUICK_PICK_MATCH_4_PRIZE` | `
