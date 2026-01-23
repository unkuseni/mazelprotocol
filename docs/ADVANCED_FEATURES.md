# SolanaLotto Advanced Features Specification

## Version 1.0.0

---

## Table of Contents

1. [Dynamic House Fee System](#1-dynamic-house-fee-system)
2. [Soft/Hard Rolldown Caps](#2-softhard-rolldown-caps)
3. [Lucky Numbers NFT System](#3-lucky-numbers-nft-system)
4. [Second Chance Draws](#4-second-chance-draws)
5. [MEV Protection](#5-mev-protection)
6. [Quick Pick Express (4/20)](#6-quick-pick-express-420)
7. [Mega Rolldown Events](#7-mega-rolldown-events)
8. [Syndicate Wars Competition](#8-syndicate-wars-competition)
9. [Implementation Priority](#9-implementation-priority)

---

## 1. Dynamic House Fee System

### 1.1 Overview

Replace the fixed 34% house fee with a jackpot-linked sliding scale that optimizes revenue extraction based on player psychology and jackpot excitement levels.

### 1.2 Fee Schedule

| Jackpot Level | House Fee | Prize Pool | Player EV Impact |
|---------------|-----------|------------|------------------|
| < $500,000 | 28% | 72% | Higher EV attracts early players |
| $500,000 - $1,000,000 | 32% | 68% | Standard operations |
| $1,000,000 - $1,500,000 | 36% | 64% | Building anticipation |
| $1,500,000 - $1,750,000 | 40% | 60% | Maximum extraction pre-rolldown |
| Rolldown Event | 28% | 72% | Encourages volume during rolldown |

### 1.3 Rationale

**Psychological Pricing:**
- Players are more willing to pay higher fees when jackpots are large
- The excitement of a $1.5M jackpot masks the increased house edge
- Lower fees during early stages bootstrap the jackpot faster
- Lower fees during rolldown maximize volume (more important than margin)

**Economic Impact:**

```
Standard Model (Fixed 34%):
├── 100k tickets × $2.50 × 34% = $85,000/day house fees
├── Consistent but suboptimal

Dynamic Model:
├── Phase 1 (Days 1-5, <$500k): 100k × $2.50 × 28% = $70,000/day
├── Phase 2 (Days 6-8, $500k-$1M): 100k × $2.50 × 32% = $80,000/day
├── Phase 3 (Days 9-11, $1M-$1.5M): 120k × $2.50 × 36% = $108,000/day
├── Phase 4 (Days 12-13, >$1.5M): 150k × $2.50 × 40% = $150,000/day
├── Rolldown (Day 14): 700k × $2.50 × 28% = $490,000

Total Cycle (Dynamic): $1,278,000
Total Cycle (Fixed): $1,190,000
Improvement: +7.4%
```

### 1.4 Smart Contract Implementation

```rust
/// Constants for dynamic fee tiers
pub const FEE_TIER_1_THRESHOLD: u64 = 500_000_000_000;      // $500k
pub const FEE_TIER_2_THRESHOLD: u64 = 1_000_000_000_000;    // $1M
pub const FEE_TIER_3_THRESHOLD: u64 = 1_500_000_000_000;    // $1.5M

pub const FEE_TIER_1_BPS: u16 = 2800;  // 28%
pub const FEE_TIER_2_BPS: u16 = 3200;  // 32%
pub const FEE_TIER_3_BPS: u16 = 3600;  // 36%
pub const FEE_TIER_4_BPS: u16 = 4000;  // 40%
pub const FEE_ROLLDOWN_BPS: u16 = 2800; // 28% during rolldown

/// Calculate dynamic house fee based on current jackpot
pub fn calculate_house_fee_bps(
    jackpot_balance: u64,
    is_rolldown_pending: bool
) -> u16 {
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

/// Updated buy_ticket instruction
pub fn buy_ticket(ctx: Context<BuyTicket>, params: BuyTicketParams) -> Result<()> {
    let lottery_state = &mut ctx.accounts.lottery_state;
    
    // Calculate dynamic fee
    let fee_bps = calculate_house_fee_bps(
        lottery_state.jackpot_balance,
        lottery_state.is_rolldown_pending
    );
    
    let house_fee = ctx.accounts.ticket_price * fee_bps as u64 / 10000;
    let prize_pool = ctx.accounts.ticket_price - house_fee;
    
    // ... rest of ticket purchase logic
    
    emit!(TicketPurchased {
        // ...
        fee_bps_applied: fee_bps,
    });
    
    Ok(())
}
```

### 1.5 UI/UX Considerations

```
┌─────────────────────────────────────────────────────────┐
│  TICKET PURCHASE                                         │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Current Jackpot: $1,234,567                            │
│  Current Fee Tier: 36% (Tier 3)                         │
│                                                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Fee Breakdown:                                  │   │
│  │  ├── Ticket Price: $2.50                        │   │
│  │  ├── House Fee (36%): $0.90                     │   │
│  │  └── Prize Pool (64%): $1.60                    │   │
│  └─────────────────────────────────────────────────┘   │
│                                                          │
│  💡 Tip: Fees drop to 28% during rolldown events!      │
│                                                          │
│  [ BUY TICKET ]                                         │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Soft/Hard Rolldown Caps

### 2.1 Overview

Implement a two-tier cap system that creates "mini rolldowns" before the main event, preventing players from perfectly timing their participation.

### 2.2 Cap Structure

| Cap Type | Threshold | Behavior |
|----------|-----------|----------|
| **Soft Cap** | $1,500,000 | 30% of excess rolls down each draw |
| **Hard Cap** | $2,000,000 | 100% of jackpot distributes |

### 2.3 Soft Cap Mechanics

When jackpot exceeds $1.5M but is below $2M:

```
Example: Jackpot reaches $1,650,000

Calculation:
├── Excess over soft cap: $1,650,000 - $1,500,000 = $150,000
├── Rolldown amount: $150,000 × 30% = $45,000
├── Remaining jackpot: $1,650,000 - $45,000 = $1,605,000

Mini-Rolldown Distribution ($45,000):
├── Match 5 (25%): $11,250
├── Match 4 (35%): $15,750
├── Match 3 (40%): $18,000

Effect:
├── Players get small +EV bump
├── Jackpot growth slows but doesn't stop
├── Unpredictable timing for full rolldown
├── Maintains player engagement
```

### 2.4 Hard Cap Mechanics

When jackpot reaches or exceeds $2M:

```
Full Rolldown Triggered:
├── 100% of jackpot distributed
├── Jackpot resets to $500k seed
├── Normal cycle resumes
```

### 2.5 Anti-Gaming Benefits

**Problem with Single Cap:**
- Players know exactly when rolldown happens
- They skip normal draws and wait
- Volume concentrates in predictable windows

**Solution with Dual Caps:**
- Mini-rolldowns create ongoing +EV opportunities
- Players can't perfectly time the "big one"
- Engagement spreads across more draws
- Jackpot can theoretically grow indefinitely (if always won before hard cap)

### 2.6 Smart Contract Implementation

```rust
/// Cap thresholds
pub const SOFT_CAP: u64 = 1_500_000_000_000;    // $1.5M
pub const HARD_CAP: u64 = 2_000_000_000_000;    // $2M
pub const SOFT_CAP_ROLLDOWN_RATE: u16 = 3000;   // 30%

#[account]
pub struct LotteryState {
    // ... existing fields ...
    
    /// Soft cap threshold (can be adjusted via governance)
    pub soft_cap: u64,
    
    /// Hard cap threshold
    pub hard_cap: u64,
    
    /// Soft cap rolldown rate in basis points
    pub soft_cap_rolldown_rate_bps: u16,
    
    /// Total distributed via soft cap rolldowns (for analytics)
    pub total_soft_rolldowns: u64,
}

/// Check and execute soft/hard rolldown after draw
pub fn process_rolldown(ctx: Context<ProcessRolldown>) -> Result<()> {
    let state = &mut ctx.accounts.lottery_state;
    let draw_result = &mut ctx.accounts.draw_result;
    
    // Check if jackpot was won
    if draw_result.match_6_winners > 0 {
        // Jackpot won - distribute to winners, reset to seed
        distribute_jackpot_to_winners(ctx)?;
        state.jackpot_balance = state.seed_amount;
        return Ok(());
    }
    
    // Hard cap check (full rolldown)
    if state.jackpot_balance >= state.hard_cap {
        execute_full_rolldown(ctx)?;
        state.jackpot_balance = state.seed_amount;
        draw_result.was_rolldown = true;
        draw_result.rolldown_type = RolldownType::Hard;
        return Ok(());
    }
    
    // Soft cap check (partial rolldown)
    if state.jackpot_balance > state.soft_cap {
        let excess = state.jackpot_balance - state.soft_cap;
        let rolldown_amount = excess * state.soft_cap_rolldown_rate_bps as u64 / 10000;
        
        execute_mini_rolldown(ctx, rolldown_amount)?;
        
        state.jackpot_balance -= rolldown_amount;
        state.total_soft_rolldowns += rolldown_amount;
        draw_result.was_rolldown = true;
        draw_result.rolldown_type = RolldownType::Soft;
        draw_result.rolldown_amount = rolldown_amount;
    }
    
    Ok(())
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum RolldownType {
    None,
    Soft,   // Mini rolldown (30% of excess)
    Hard,   // Full rolldown (100% of jackpot)
}

fn execute_mini_rolldown(
    ctx: Context<ProcessRolldown>,
    amount: u64
) -> Result<()> {
    let draw_result = &mut ctx.accounts.draw_result;
    
    // Calculate prizes for mini-rolldown
    let match_5_pool = amount * 2500 / 10000;  // 25%
    let match_4_pool = amount * 3500 / 10000;  // 35%
    let match_3_pool = amount * 4000 / 10000;  // 40%
    
    // Calculate per-winner prizes
    if draw_result.match_5_winners > 0 {
        draw_result.match_5_bonus = match_5_pool / draw_result.match_5_winners as u64;
    }
    if draw_result.match_4_winners > 0 {
        draw_result.match_4_bonus = match_4_pool / draw_result.match_4_winners as u64;
    }
    if draw_result.match_3_winners > 0 {
        draw_result.match_3_bonus = match_3_pool / draw_result.match_3_winners as u64;
    }
    
    emit!(MiniRolldown {
        draw_id: draw_result.draw_id,
        amount,
        match_5_bonus: draw_result.match_5_bonus,
        match_4_bonus: draw_result.match_4_bonus,
        match_3_bonus: draw_result.match_3_bonus,
    });
    
    Ok(())
}
```

### 2.7 Expected Value Analysis

**Soft Cap Zone ($1.5M - $2M):**

```
Scenario: Jackpot at $1.7M, 100k tickets sold

Mini-Rolldown:
├── Excess: $200,000
├── Rolldown: $60,000
├── Match 5 (25%): $15,000 ÷ 2.56 winners = $5,859 bonus
├── Match 4 (35%): $21,000 ÷ 125 winners = $168 bonus
├── Match 3 (40%): $24,000 ÷ 2,128 winners = $11.28 bonus

EV Calculation (Soft Cap Zone):
├── Match 2: (1/6.8) × $2.50 = $0.37
├── Match 3: (1/47) × ($5 + $11.28) = $0.35
├── Match 4: (1/800) × ($150 + $168) = $0.40
├── Match 5: (1/39,028) × ($4,000 + $5,859) = $0.25

Total EV: $1.37 on $2.50 ticket
Still negative, but better than normal mode ($0.88)
Players get "taste" of +EV without full exploit
```

---

## 3. Lucky Numbers NFT System

### 3.1 Overview

Award NFTs to Match 4+ winners containing their winning combination. These NFTs grant a 1% bonus if those exact numbers ever hit the jackpot in the future.

### 3.2 NFT Structure

```rust
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
    
    /// Is this NFT active (can be deactivated by governance)
    pub is_active: bool,
}
```

### 3.3 Minting Logic

```rust
/// Mint Lucky Numbers NFT to Match 4+ winner
pub fn mint_lucky_numbers_nft(
    ctx: Context<MintLuckyNumbers>,
    ticket: &Ticket,
    match_count: u8,
) -> Result<()> {
    // Only mint for Match 4+
    require!(match_count >= 4, LottoError::IneligibleForNFT);
    
    let nft = &mut ctx.accounts.lucky_numbers_nft;
    let draw_result = &ctx.accounts.draw_result;
    
    // Store the complete 6-number combination
    nft.numbers = ticket.numbers;
    nft.original_draw_id = ticket.draw_id;
    nft.original_match_tier = match_count;
    nft.original_winner = ticket.owner;
    nft.owner = ticket.owner;
    nft.created_at = Clock::get()?.unix_timestamp;
    nft.total_bonuses_claimed = 0;
    nft.jackpot_hits = 0;
    nft.is_active = true;
    
    // Mint the actual NFT token
    mint_nft_to_owner(ctx)?;
    
    emit!(LuckyNumbersNFTMinted {
        mint: nft.mint,
        owner: nft.owner,
        numbers: nft.numbers,
        original_match_tier: match_count,
        draw_id: ticket.draw_id,
    });
    
    Ok(())
}
```

### 3.4 Jackpot Bonus Distribution

```rust
/// Called after jackpot is won - check for Lucky Numbers NFT holders
pub fn distribute_lucky_numbers_bonuses(
    ctx: Context<DistributeBonuses>,
    winning_numbers: [u8; 6],
    jackpot_amount: u64,
) -> Result<()> {
    // Calculate 1% bonus pool
    let bonus_pool = jackpot_amount / 100;
    
    // Find all active NFTs with matching numbers
    let matching_nfts = find_matching_nfts(winning_numbers)?;
    
    if matching_nfts.is_empty() {
        // No matching NFTs - bonus goes to reserve
        ctx.accounts.lottery_state.reserve_balance += bonus_pool;
        return Ok(());
    }
    
    // Split bonus equally among all matching NFT holders
    let bonus_per_nft = bonus_pool / matching_nfts.len() as u64;
    
    for nft in matching_nfts {
        // Transfer bonus to NFT owner
        transfer_bonus(ctx, nft.owner, bonus_per_nft)?;
        
        // Update NFT stats
        nft.total_bonuses_claimed += bonus_per_nft;
        nft.jackpot_hits += 1;
        
        emit!(LuckyNumbersBonusPaid {
            nft_mint: nft.mint,
            owner: nft.owner,
            numbers: nft.numbers,
            bonus_amount: bonus_per_nft,
            jackpot_draw_id: ctx.accounts.draw_result.draw_id,
        });
    }
    
    Ok(())
}
```

### 3.5 NFT Metadata

```json
{
    "name": "Lucky Numbers #4521",
    "symbol": "LUCKYNUMS",
    "description": "This NFT contains the lucky numbers [4, 12, 23, 31, 38, 45] which won Match 5 on Draw #127. If these exact numbers ever hit the jackpot, the holder receives 1% of the jackpot!",
    "image": "https://solanalotto.io/nft/4521.png",
    "external_url": "https://solanalotto.io/lucky-numbers/4521",
    "attributes": [
        {
            "trait_type": "Number 1",
            "value": 4
        },
        {
            "trait_type": "Number 2",
            "value": 12
        },
        {
            "trait_type": "Number 3",
            "value": 23
        },
        {
            "trait_type": "Number 4",
            "value": 31
        },
        {
            "trait_type": "Number 5",
            "value": 38
        },
        {
            "trait_type": "Number 6",
            "value": 45
        },
        {
            "trait_type": "Original Match Tier",
            "value": "Match 5"
        },
        {
            "trait_type": "Original Draw",
            "value": 127
        },
        {
            "trait_type": "Jackpot Hits",
            "value": 0
        },
        {
            "trait_type": "Total Bonuses Claimed",
            "value": "$0"
        }
    ],
    "properties": {
        "category": "lottery",
        "creators": [
            {
                "address": "SolanaLottoProgram...",
                "share": 100
            }
        ]
    }
}
```

### 3.6 Secondary Market Dynamics

**Value Proposition:**

```
Expected Value of Lucky Numbers NFT:

Assumptions:
├── Jackpot odds: 1 in 9,366,819
├── Average jackpot: $1,500,000
├── Bonus: 1% = $15,000
├── Draws per year: 365

Probability these numbers hit jackpot in 1 year:
├── P = 1 - (1 - 1/9,366,819)^365
├── P ≈ 0.000039 (0.0039%)

Expected annual value:
├── EV = 0.000039 × $15,000 = $0.58/year

Theoretical NFT value (assuming 10% discount rate):
├── Perpetuity value = $0.58 / 0.10 = $5.80

BUT: Speculation premium could be 10-100x due to:
├── Lottery ticket psychology
├── Rarity (limited mints)
├── Secondary market liquidity
├── Meme/social value
├── Floor price dynamics
```

**Market Mechanisms:**

```
Tensor/Magic Eden Integration:
├── Automatic listing capability
├── Royalties: 5% to protocol treasury
├── Collection verified and featured

Price Discovery Factors:
├── Recent near-misses (these numbers matched 5/6)
├── "Hot" vs "cold" number perception
├── Time since last jackpot
├── Overall collection floor price
├── Number of NFTs with same combination (usually 0-1)
```

### 3.7 Governance Controls

```rust
/// Governance can adjust NFT parameters
pub struct LuckyNumbersConfig {
    /// Bonus percentage of jackpot (default 100 = 1%)
    pub bonus_bps: u16,
    
    /// Minimum match tier to receive NFT (default 4)
    pub min_match_tier: u8,
    
    /// Whether new NFTs can be minted
    pub minting_enabled: bool,
    
    /// Whether bonuses are being paid
    pub bonuses_enabled: bool,
    
    /// Maximum NFTs per combination (prevent dilution)
    pub max_nfts_per_combination: u8,
}
```

---

## 4. Second Chance Draws

### 4.1 Overview

Every non-winning ticket automatically enters a weekly Second Chance Draw, giving losing tickets residual value and encouraging continued participation.

### 4.2 Prize Structure

```
Weekly Second Chance Draw:

Prize Pool: 5% of weekly reserve fund allocation
├── At 100k tickets/day: ~$35,000/week

Prizes:
├── 1× Grand Prize: $10,000
├── 10× Runner Up: $1,000 each ($10,000 total)
├── 100× Consolation: $100 each ($10,000 total)
├── 1,000× Free Tickets: $2.50 each ($2,500 total)
├── Buffer for operations: $2,500

Total: $35,000
```

### 4.3 Eligibility Rules

```rust
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct SecondChanceEntry {
    /// Original ticket reference
    pub ticket: Pubkey,
    
    /// Player wallet
    pub player: Pubkey,
    
    /// Week number for this entry
    pub week_id: u64,
    
    /// Number of entries (based on ticket value)
    pub entry_count: u32,
}

/// Calculate entries for second chance
pub fn calculate_second_chance_entries(ticket: &Ticket) -> u32 {
    // Non-winners get 1 entry per ticket
    if ticket.match_count < 2 {
        return 1;
    }
    
    // Match 2 winners already got free ticket, no second chance
    0
}
```

### 4.4 Drawing Mechanism

```rust
/// Weekly Second Chance Draw execution
pub fn execute_second_chance_draw(
    ctx: Context<ExecuteSecondChance>
) -> Result<()> {
    let state = &ctx.accounts.lottery_state;
    let week_id = calculate_current_week();
    
    // Get all eligible entries for this week
    let total_entries = get_weekly_entry_count(week_id)?;
    
    require!(total_entries > 0, LottoError::NoSecondChanceEntries);
    
    // Request VRF for second chance draw
    let random_seeds = request_vrf_randomness(1111)?; // 1111 winners total
    
    // Select winners
    let winners = select_second_chance_winners(
        random_seeds,
        total_entries,
        SecondChancePrizes {
            grand_prize_count: 1,
            runner_up_count: 10,
            consolation_count: 100,
            free_ticket_count: 1000,
        }
    )?;
    
    // Distribute prizes
    for winner in winners.grand_prize {
        distribute_second_chance_prize(ctx, winner, 10_000_000_000)?;
    }
    for winner in winners.runner_up {
        distribute_second_chance_prize(ctx, winner, 1_000_000_000)?;
    }
    for winner in winners.consolation {
        distribute_second_chance_prize(ctx, winner, 100_000_000)?;
    }
    for winner in winners.free_ticket {
        mint_free_ticket_nft(ctx, winner)?;
    }
    
    emit!(SecondChanceDrawExecuted {
        week_id,
        total_entries,
        total_distributed: 32_500_000_000, // $32,500
        grand_prize_winner: winners.grand_prize[0],
    });
    
    Ok(())
}
```

### 4.5 UI Integration

```
┌─────────────────────────────────────────────────────────┐
│  YOUR TICKETS - DRAW #127                                │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Ticket #1: [4, 12, 23, 31, 38, 45]                     │
│  Status: Match 1 (No Prize)                             │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 🎰 SECOND CHANCE ENTRY: ACTIVE                  │   │
│  │    Week #23 Draw: Sunday 00:00 UTC              │   │
│  │    Your entries: 1                               │   │
│  │    Total entries this week: 487,293              │   │
│  │    Your odds: 1 in 487,293                       │   │
│  └─────────────────────────────────────────────────┘   │
│                                                          │
│  Ticket #2: [7, 14, 21, 28, 35, 42]                     │
│  Status: Match 2 (Free Ticket!)                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ ✅ Free ticket claimed - not eligible for        │   │
│  │    second chance (already won!)                  │   │
│  └─────────────────────────────────────────────────┘   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 4.6 Economic Impact

```
Player Psychology Benefits:
├── "Even losing tickets have value"
├── Reduces regret of not winning
├── Weekly engagement touchpoint
├── Social sharing of second chance wins

Protocol Benefits:
├── Increased ticket purchases (residual value perception)
├── Weekly engagement beyond main draws
├── Additional viral moments (grand prize winners)
├── Data collection on player preferences

Cost Analysis:
├── $35,000/week from reserve fund
├── Reserve accumulates $35,000/week at target volume
├── Net neutral to reserve, but drives volume growth
├── Volume growth > offsets second chance costs
```

---

## 5. MEV Protection

### 5.1 Threat Model

**Attack Vector 1: Front-Running Ticket Purchase**
```
Scenario:
1. Validator sees winning numbers in mempool
2. Validator front-runs to buy winning ticket
3. Validator claims prize fraudulently

Risk Level: CRITICAL
```

**Attack Vector 2: Sandwich Attack on Claims**
```
Scenario:
1. Attacker sees large prize claim transaction
2. Attacker manipulates token prices around claim
3. Attacker profits from price movement

Risk Level: LOW (prizes in USDC)
```

**Attack Vector 3: Block Manipulation**
```
Scenario:
1. Validator controls block production
2. Validator excludes/reorders transactions
3. Validator gains unfair advantage

Risk Level: MEDIUM
```

### 5.2 Solution: Threshold Encryption

**Overview:**

Ticket numbers are encrypted at purchase time. Decryption only occurs after winning numbers are committed on-chain.

```
┌─────────────────────────────────────────────────────────┐
│                 THRESHOLD ENCRYPTION FLOW                │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  TICKET PURCHASE:                                        │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Player selects: [4, 12, 23, 31, 38, 45]         │   │
│  │                       │                          │   │
│  │                       ▼                          │   │
│  │ Encrypt with threshold public key               │   │
│  │                       │                          │   │
│  │                       ▼                          │   │
│  │ Store: encrypted_numbers = 0x7f3a...            │   │
│  │ (Nobody can read the actual numbers)            │   │
│  └─────────────────────────────────────────────────┘   │
│                                                          │
│  DRAW EXECUTION:                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 1. VRF generates winning numbers                │   │
│  │ 2. Winning numbers committed on-chain           │   │
│  │ 3. Threshold nodes release decryption shares    │   │
│  │ 4. Tickets can now be decrypted                 │   │
│  │ 5. Winners calculated from decrypted tickets    │   │
│  └─────────────────────────────────────────────────┘   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 5.3 Implementation

```rust
/// Encrypted ticket structure
#[account]
pub struct EncryptedTicket {
    /// Ticket owner
    pub owner: Pubkey,
    
    /// Draw this ticket is for
    pub draw_id: u64,
    
    /// Encrypted numbers (ciphertext)
    pub encrypted_numbers: [u8; 48], // 6 numbers encrypted
    
    /// Encryption nonce
    pub nonce: [u8; 24],
    
    /// Threshold encryption epoch
    pub encryption_epoch: u64,
    
    /// Decrypted numbers (set after draw)
    pub decrypted_numbers: Option<[u8; 6]>,
    
    /// Purchase timestamp
    pub purchase_timestamp: i64,
    
    /// Claim status
    pub is_claimed: bool,
}

/// Threshold encryption key management
#[account]
pub struct ThresholdKeyState {
    /// Current epoch
    pub current_epoch: u64,
    
    /// Public key for encryption
    pub public_key: [u8; 32],
    
    /// Threshold (e.g., 3 of 5)
    pub threshold: u8,
    
    /// Total key holders
    pub total_holders: u8,
    
    /// Key holder addresses
    pub key_holders: Vec<Pubkey>,
    
    /// Decryption key shares submitted
    pub shares_submitted: u8,
    
    /// Combined decryption key (available after threshold met)
    pub decryption_key: Option<[u8; 32]>,
}

/// Buy ticket with encryption
pub fn buy_encrypted_ticket(
    ctx: Context<BuyEncryptedTicket>,
    encrypted_numbers: [u8; 48],
    nonce: [u8; 24],
) -> Result<()> {
    let ticket = &mut ctx.accounts.ticket;
    let key_state = &ctx.accounts.threshold_key_state;
    
    // Store encrypted ticket
    ticket.owner = ctx.accounts.player.key();
    ticket.draw_id = ctx.accounts.lottery_state.current_draw_id;
    ticket.encrypted_numbers = encrypted_numbers;
    ticket.nonce = nonce;
    ticket.encryption_epoch = key_state.current_epoch;
    ticket.decrypted_numbers = None;
    ticket.purchase_timestamp = Clock::get()?.unix_timestamp;
    ticket.is_claimed = false;
    
    // Transfer payment (same as regular ticket)
    // ...
    
    Ok(())
}

/// Submit decryption key share (called by threshold key holders)
pub fn submit_decryption_share(
    ctx: Context<SubmitShare>,
    share: [u8; 32],
    proof: [u8; 64],
) -> Result<()> {
    let key_state = &mut ctx.accounts.threshold_key_state;
    
    // Verify share is valid
    require!(
        verify_share_proof(&share, &proof, ctx.accounts.key_holder.key()),
        LottoError::InvalidDecryptionShare
    );
    
    // Store share
    key_state.shares_submitted += 1;
    
    // Check if threshold met
    if key_state.shares_submitted >= key_state.threshold {
        // Combine shares to recover decryption key
        key_state.decryption_key = Some(combine_shares(/* shares */)?);
        
        emit!(DecryptionKeyAvailable {
            epoch: key_state.current_epoch,
            draw_id: ctx.accounts.lottery_state.current_draw_id,
        });
    }
    
    Ok(())
}

/// Decrypt ticket (called after decryption key available)
pub fn decrypt_ticket(ctx: Context<DecryptTicket>) -> Result<()> {
    let ticket = &mut ctx.accounts.ticket;
    let key_state = &ctx.accounts.threshold_key_state;
    
    // Ensure decryption key is available
    let decryption_key = key_state.decryption_key
        .ok_or(LottoError::DecryptionKeyNotAvailable)?;
    
    // Decrypt numbers
    let decrypted = decrypt(
        &ticket.encrypted_numbers,
        &ticket.nonce,
        &decryption_key
    )?;
    
    ticket.decrypted_numbers = Some(decrypted);
    
    Ok(())
}
```

### 5.4 Alternative: Jito Integration

For simpler MEV protection without full threshold encryption:

```rust
/// Use Jito's fair ordering service
pub fn buy_ticket_with_jito(
    ctx: Context<BuyTicket>,
    params: BuyTicketParams,
) -> Result<()> {
    // Verify transaction came through Jito bundle
    require!(
        is_jito_bundle_transaction(),
        LottoError::MustUseJitoBundle
    );
    
    // Jito guarantees FIFO ordering
    // Validators cannot front-run or reorder
    
    // Process ticket purchase normally
    buy_ticket_internal(ctx, params)
}
```

**Jito Benefits:**
- Simpler implementation
- No key management overhead
- Proven infrastructure
- Lower latency

**Jito Limitations:**
- Relies on Jito's availability
- Less censorship resistant than threshold encryption
- Requires users to submit through Jito

### 5.5 Recommendation

**Phase 1 (Launch):** Implement Jito integration for basic MEV protection
**Phase 2 (6+ months):** Add threshold encryption for maximum security

---

## 6. Quick Pick Express (4/20)

### 6.1 Overview

A high-frequency, low-stakes lottery game that runs every 4 hours (6x daily), providing continuous engagement between main draws.

### 6.2 Game Parameters

| Parameter | Value |
|-----------|-------|
| **Matrix** | 4/20 (Pick 4 from 20) |
| **Ticket Price** | $0.50 USDC |
| **Draw Frequency** | Every 4 hours (6x daily) |
| **House Fee** | 30% |
| **Prize Pool** | 70% |

### 6.3 Odds Calculation

```
Total combinations: C(20, 4) = 4,845

Match Probabilities:
├── Match 4: C(4,4) × C(16,0) / 4,845 = 1/4,845
├── Match 3: C(4,3) × C(16,1) / 4,845 = 64/4,845 = 1/75.7
├── Match 2: C(4,2) × C(16,2) / 4,845 = 720/4,845 = 1/6.7
├── Match 1: C(4,1) × C(16,3) / 4,845 = 2,240/4,845 = 46.2%
├── Match 0: C(4,0) × C(16,4) / 4,845 = 1,820/4,845 = 37.6%
```

### 6.4 Prize Structure

| Match | Prize | Odds | Expected Value |
|-------|-------|------|----------------|
| 4 | $500 | 1 in 4,845 | $0.103 |
| 3 | $10 | 1 in 75.7 | $0.132 |
| 2 | Free Ticket ($0.50) | 1 in 6.7 | $0.075 |
| **Total EV** | | | **$0.310** |

**House Edge:** ($0.50 - $0.31) / $0.50 = **38%**

### 6.5 Smart Contract Implementation

```rust
/// Quick Pick Express game state
#[account]
pub struct QuickPickState {
    /// Game identifier
    pub game_id: u64,
    
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
    
    /// Prize amounts (in USDC lamports)
    pub match_4_prize: u64,
    pub match_3_prize: u64,
    pub match_2_value: u64, // Free ticket value
    
    /// Current draw ticket count
    pub current_draw_tickets: u64,
    
    /// Prize pool balance
    pub prize_pool_balance: u64,
    
    /// Is paused
    pub is_paused: bool,
}

/// Quick Pick Express ticket
#[account]
pub struct QuickPickTicket {
    pub owner: Pubkey,
    pub draw_id: u64,
    pub numbers: [u8; 4],
    pub purchase_timestamp: i64,
    pub is_claimed: bool,
    pub match_count: u8,
    pub prize_amount: u64,
}

/// Buy Quick Pick ticket
pub fn buy_quick_pick_ticket(
    ctx: Context<BuyQuickPick>,
    numbers: [u8; 4],
) -> Result<()> {
    let state = &mut ctx.accounts.quick_pick_state;
    let ticket = &mut ctx.accounts.ticket;
    
    // Validate numbers (1-20, unique)
    validate_quick_pick_numbers(&numbers)?;
    
    // Calculate fees
    let house_fee = state.ticket_price * state.house_fee_bps as u64 / 10000;
    let prize_contribution = state.ticket_price - house_fee;
    
    // Transfer USDC
    transfer_usdc(ctx.accounts.player_usdc, ctx.accounts.prize_pool, state.ticket_price)?;
    
    // Update state
    state.prize_pool_balance += prize_contribution;
    state.current_draw_tickets += 1;
    
    // Create ticket
    ticket.owner = ctx.accounts.player.key();
    ticket.draw_id = state.current_draw;
    ticket.numbers = sort_numbers_4(numbers);
    ticket.purchase_timestamp = Clock::get()?.unix_timestamp;
    ticket.is_claimed = false;
    
    Ok(())
}

fn validate_quick_pick_numbers(numbers: &[u8; 4]) -> Result<()> {
    for &num in numbers.iter() {
        require!(num >= 1 && num <= 20, LottoError::NumberOutOfRange);
    }
    
    let mut sorted = *numbers;
    sorted.sort();
    for i in 0..3 {
        require!(sorted[i] != sorted[i + 1], LottoError::DuplicateNumber);
    }
    
    Ok(())
}
```

### 6.6 Revenue Projections

```
Target Volume: 50,000 tickets/day

Daily Revenue:
├── Tickets: 50,000 × $0.50 = $25,000
├── House Fee (30%): $7,500/day
├── Prize Pool (70%): $17,500/day

Monthly: $225,000 house fees
Annual: $2.74M house fees

Combined with Main Lottery:
├── Main Lottery: $31M/year (target)
├── Quick Pick Express: $2.74M/year
├── Total: $33.74M/year (+8.8%)
```

---

## 7. Mega Rolldown Events

### 7.1 Overview

Quarterly special events with larger jackpots, higher stakes, and guaranteed full rolldown.

### 7.2 Event Parameters

| Parameter | Value |
|-----------|-------|
| **Frequency** | Once per quarter (4x/year) |
| **Duration** | 2 weeks (14 draws) |
| **Matrix** | 6/49 (harder odds) |
| **Ticket Price** | $10 USDC |
| **Target Jackpot** | $5,000,000 |
| **House Fee** | 32% |
| **Guaranteed Rolldown** | Final draw of event |

### 7.3 Odds Comparison

| Metric | Main Lottery (6/46) | Mega Event (6/49) |
|--------|---------------------|-------------------|
| **Jackpot Odds** | 1 in 9,366,819 | 1 in 13,983,816 |
| **Match 5 Odds** | 1 in 39,028 | 1 in 54,201 |
| **Match 4 Odds** | 1 in 800 | 1 in 1,032 |
| **Match 3 Odds** | 1 in 47 | 1 in 57 |

### 7.4 Prize Structure

**Normal Draws (Days 1-13):**

| Match | Prize |
|-------|-------|
| 6 | Jackpot (growing) |
| 5 | $15,000 |
| 4 | $500 |
| 3 | $20 |
| 2 | Free Ticket ($10) |

**Guaranteed Rolldown (Day 14):**

```
$5,000,000 Jackpot Distribution:

Match 5 (20%): $1,000,000
├── Expected winners: ~92 (at 500k tickets)
├── Prize per winner: ~$10,870

Match 4 (35%): $1,750,000
├── Expected winners: ~485
├── Prize per winner: ~$3,608

Match 3 (45%): $2,250,000
├── Expected winners: ~8,772
├── Prize per winner: ~$257
```

### 7.5 Economic Analysis

```
Mega Event Projections (per event):

Ticket Sales Target: 500,000 tickets × $10 = $5,000,000

Revenue:
├── House Fee (32%): $1,600,000
├── Prize Pool (68%): $3,400,000

Costs:
├── Jackpot Seed: $1,000,000
├── Marketing: $200,000
├── Operations: $50,000

Net Profit per Event: $350,000

Annual (4 events): $1,400,000 additional profit

Plus: Main lottery volume increase during event period
├── Estimated +50% main lottery volume
├── Additional $500,000 in fees per event quarter
```

### 7.6 Marketing Integration

```
Pre-Event (2 weeks before):
├── Countdown timer on site
├── Email/push notification campaign
├── Influencer partnerships
├── Social media blitz
├── "Mega Rolldown" branding

During Event:
├── Real-time jackpot tracker
├── Leaderboard: "Top Ticket Buyers"
├── Daily prize recaps
├── Final day "Rolldown Party" live stream

Post-Event:
├── Winner announcements
├── Statistics dashboard
├── Community celebration
├── Teaser for next event
```

---

## 8. Syndicate Wars Competition

### 8.1 Overview

Monthly competition where syndicates compete for the best win rate, creating tribal loyalty and recurring engagement.

### 8.2 Competition Rules

```
Eligibility:
├── Minimum 1,000 tickets purchased by syndicate during month
├── Minimum 5 members in syndicate
├── Syndicate must be registered before month starts

Scoring Metric: Win Rate
├── Win Rate = (Total Prizes Won) / (Total Tickets Purchased)
├── Only Match 3+ counts as "win"
├── Normalized for variance: Must have statistical significance

Duration: Monthly (calendar month)
```

### 8.3 Prize Pool

```
Monthly Prize Pool: 1% of monthly ticket sales

At 100k tickets/day × 30 days × $2.50 = $7,500,000/month
Prize Pool = $75,000/month

Distribution:
├── 1st Place: 50% = $37,500
├── 2nd Place: 25% = $18,750
├── 3rd Place: 15% = $11,250
├── 4th-10th: Split 10% = $1,071 each
```

### 8.4 Data Structures

```rust
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
    
    /// Win rate (calculated at end)
    pub win_rate: u64, // Stored as fixed-point (×1,000,000)
    
    /// Final rank
    pub final_rank: Option<u32>,
    
    /// Prize claimed
    pub prize_claimed: bool,
}

/// Leaderboard entry
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct LeaderboardEntry {
    pub syndicate: Pubkey,
    pub name: [u8; 32],
    pub tickets: u64,
    pub prizes: u64,
    pub win_rate: u64,
    pub rank: u32,
}
```

### 8.5 Leaderboard Logic

```rust
/// Calculate syndicate win rate
pub fn calculate_win_rate(entry: &SyndicateWarsEntry) -> u64 {
    if entry.tickets_purchased == 0 {
        return 0;
    }
    
    // Win rate as fixed-point number (×1,000,000)
    (entry.prizes_won as u128 * 1_000_000 / entry.tickets_purchased as u128) as u64
}

/// Update leaderboard (called after each draw)
pub fn update_syndicate_wars_leaderboard(
    ctx: Context<UpdateLeaderboard>
) -> Result<()> {
    let state = &ctx.accounts.syndicate_wars_state;
    
    // Get all entries for this month
    let entries = get_all_entries_for_month(state.month)?;
    
    // Filter eligible entries
    let eligible: Vec<_> = entries
        .iter()
        .filter(|e| e.tickets_purchased >= state.min_tickets)
        .collect();
    
    // Sort by win rate (descending)
    let mut sorted = eligible.clone();
    sorted.sort_by(|a, b| {
        calculate_win_rate(b).cmp(&calculate_win_rate(a))
    });
    
    // Assign ranks
    for (i, entry) in sorted.iter_mut().enumerate() {
        entry.final_rank = Some((i + 1) as u32);
    }
    
    emit!(LeaderboardUpdated {
        month: state.month,
        top_10: sorted.iter().take(10).map(|e| LeaderboardEntry {
            syndicate: e.syndicate,
            tickets: e.tickets_purchased,
            prizes: e.prizes_won,
            win_rate: calculate_win_rate(e),
            rank: e.final_rank.unwrap(),
            name: get_syndicate_name(e.syndicate),
        }).collect(),
    });
    
    Ok(())
}

/// Distribute prizes at month end
pub fn distribute_syndicate_wars_prizes(
    ctx: Context<DistributeWarsPrizes>
) -> Result<()> {
    let state = &mut ctx.accounts.syndicate_wars_state;
    
    require!(
        Clock::get()?.unix_timestamp > state.end_timestamp,
        LottoError::CompetitionNotEnded
    );
    
    let prize_pool = state.prize_pool;
    
    // Get final rankings
    let rankings = get_final_rankings(state.month)?;
    
    // Distribute prizes
    if let Some(first) = rankings.get(0) {
        let prize = prize_pool * 50 / 100;
        distribute_to_syndicate(first.syndicate, prize)?;
    }
    
    if let Some(second) = rankings.get(1) {
        let prize = prize_pool * 25 / 100;
        distribute_to_syndicate(second.syndicate, prize)?;
    }
    
    if let Some(third) = rankings.get(2) {
        let prize = prize_pool * 15 / 100;
        distribute_to_syndicate(third.syndicate, prize)?;
    }
    
    let remaining = prize_pool * 10 / 100;
    let per_runner_up = remaining / 7; // 4th-10th
    
    for entry in rankings.iter().skip(3).take(7) {
        distribute_to_syndicate(entry.syndicate, per_runner_up)?;
    }
    
    emit!(SyndicateWarsConcluded {
        month: state.month,
        total_distributed: prize_pool,
        winner: rankings[0].syndicate,
        winner_win_rate: rankings[0].win_rate,
    });
    
    Ok(())
}
```

### 8.6 UI/UX Design

```
┌─────────────────────────────────────────────────────────┐
│  🏆 SYNDICATE WARS - DECEMBER 2025                      │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Prize Pool: $75,000    |    Days Left: 12              │
│  Registered: 247        |    Your Syndicate: #14        │
│                                                          │
│  ═══════════════════════════════════════════════════    │
│                                                          │
│  LEADERBOARD                                             │
│  ──────────────────────────────────────────────────     │
│  #  | SYNDICATE         | TICKETS | WIN RATE | PRIZES  │
│  ──────────────────────────────────────────────────     │
│  🥇 | Diamond Hands     | 45,230  | 0.847    | $38,291 │
│  🥈 | Whale Squad       | 38,102  | 0.823    | $31,359 │
│  🥉 | Lucky 7s          | 29,847  | 0.801    | $23,907 │
│  4  | Moon Chasers      | 25,119  | 0.789    | $19,819 │
│  5  | Sol Soldiers      | 22,456  | 0.776    | $17,426 │
│  ...                                                     │
│  14 | YOUR SYNDICATE    | 12,340  | 0.721    | $8,897  │
│                                                          │
│  ═══════════════════════════════════════════════════    │
│                                                          │
│  YOUR SYNDICATE STATS                                    │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Name: Degen Lottery Club                        │   │
│  │ Members: 23                                      │   │
│  │ This Month's Tickets: 12,340                    │   │
│  │ This Month's Wins: 287 (Match 3+)               │   │
│  │ Win Rate: 0.721 ($0.72 returned per $1 spent)   │   │
│  │                                                  │   │
│  │ Needs: +8,660 tickets to reach Top 10           │   │
│  │ Needs: +0.126 win rate to reach Top 3           │   │
│  └─────────────────────────────────────────────────┘   │
│                                                          │
│  [ VIEW FULL LEADERBOARD ]  [ BUY SYNDICATE TICKETS ]   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 9. Implementation Priority

### 9.1 Priority Matrix

| Feature | Impact | Complexity | Priority |
|---------|--------|------------|----------|
| **MEV Protection (Jito)** | Critical | Low | P0 - Launch |
| **Dynamic House Fee** | High | Low | P1 - Month 1 |
| **Soft/Hard Caps** | High | Medium | P1 - Month 1 |
| **Syndicate Wars** | Medium | Medium | P2 - Month 3 |
| **Second Chance Draws** | Medium | Medium | P2 - Month 3 |
| **Quick Pick Express** | High | Medium | P2 - Month 4 |
| **Lucky Numbers NFT** | Medium | High | P3 - Month 6 |
| **Mega Rolldown Events** | High | High | P3 - Month 6 |
| **MEV Protection (Threshold)** | Medium | High | P4 - Month 9 |

### 9.2 Implementation Timeline

```
PHASE 1: Security & Core (Months 1-2)
├── Jito MEV protection
├── Dynamic house fee system
├── Soft/hard rolldown caps
├── Enhanced VRF integration

PHASE 2: Engagement (Months 3-5)
├── Syndicate Wars competition
├── Second Chance draws
├── Quick Pick Express game
├── Enhanced dashboards

PHASE 3: Premium Features (Months 6-9)
├── Lucky Numbers NFT system
├── Mega Rolldown events
├── Advanced MEV protection
├── Cross-chain preparation

PHASE 4: Scale (Months 10-12)
├── White-label platform
├── Cross-chain deployment
├── Advanced analytics
├── DAO transition
```

### 9.3 Resource Requirements

| Feature | Engineering | Design | Marketing |
|---------|-------------|--------|-----------|
| MEV Protection (Jito) | 1 week | - | - |
| Dynamic House Fee | 1 week | 2 days | - |
| Soft/Hard Caps | 2 weeks | 3 days | - |
| Syndicate Wars | 3 weeks | 1 week | 1 week |
| Second Chance | 2 weeks | 3 days | 3 days |
| Quick Pick Express | 3 weeks | 1 week | 1 week |
| Lucky Numbers NFT | 4 weeks | 2 weeks | 2 weeks |
| Mega Events | 4 weeks | 2 weeks | 3 weeks |

### 9.4 Success Metrics

| Feature | KPI | Target |
|---------|-----|--------|
| Dynamic Fee | Average fee collected | +7% vs fixed |
| Soft/Hard Caps | Volume during soft cap | +15% vs baseline |
| Syndicate Wars | Monthly active syndicates | 100+ |
| Second Chance | Weekly active users | +20% retention |
| Quick Pick | Daily tickets sold | 50k/day |
| Lucky Numbers NFT | Secondary market volume | $50k/month |
| Mega Events | Event ticket sales | 500k tickets |

---

## Appendix: Event Definitions

```rust
// New events for advanced features

#[event]
pub struct DynamicFeeApplied {
    pub draw_id: u64,
    pub jackpot_level: u64,
    pub fee_bps: u16,
    pub ticket_id: Pubkey,
}

#[event]
pub struct MiniRolldown {
    pub draw_id: u64,
    pub amount: u64,
    pub match_5_bonus: u64,
    pub match_4_bonus: u64,
    pub match_3_bonus: u64,
}

#[event]
pub struct LuckyNumbersNFTMinted {
    pub mint: Pubkey,
    pub owner: Pubkey,
    pub numbers: [u8; 6],
    pub original_match_tier: u8,
    pub draw_id: u64,
}

#[event]
pub struct LuckyNumbersBonusPaid {
    pub nft_mint: Pubkey,
    pub owner: Pubkey,
    pub numbers: [u8; 6],
    pub bonus_amount: u64,
    pub jackpot_draw_id: u64,
}

#[event]
pub struct SecondChanceDrawExecuted {
    pub week_id: u64,
    pub total_entries: u64,
    pub total_distributed: u64,
    pub grand_prize_winner: Pubkey,
}

#[event]
pub struct DecryptionKeyAvailable {
    pub epoch: u64,
    pub draw_id: u64,
}

#[event]
pub struct QuickPickDrawExecuted {
    pub draw_id: u64,
    pub winning_numbers: [u8; 4],
    pub total_tickets: u64,
    pub total_distributed: u64,
}

#[event]
pub struct MegaEventStarted {
    pub event_id: u64,
    pub start_timestamp: i64,
    pub end_timestamp: i64,
    pub target_jackpot: u64,
}

#[event]
pub struct MegaRolldownExecuted {
    pub event_id: u64,
    pub jackpot_distributed: u64,
    pub match_5_prize: u64,
    pub match_4_prize: u64,
    pub match_3_prize: u64,
}

#[event]
pub struct SyndicateWarsRegistered {
    pub month: u64,
    pub syndicate: Pubkey,
    pub name: [u8; 32],
}

#[event]
pub struct LeaderboardUpdated {
    pub month: u64,
    pub top_10: Vec<LeaderboardEntry>,
}

#[event]
pub struct SyndicateWarsConcluded {
    pub month: u64,
    pub total_distributed: u64,
    pub winner: Pubkey,
    pub winner_win_rate: u64,
}
```

---

*Advanced Features Specification v1.0.0*
*SolanaLotto Protocol*
*Last Updated: 2025*