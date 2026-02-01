# SolanaLotto Advanced Features Specification

## Version 2.0.0

---

## Table of Contents

1. [Dynamic House Fee System](#1-dynamic-house-fee-system)
2. [Soft/Hard Rolldown Caps](#2-softhard-rolldown-caps)
3. [Lucky Numbers NFT System](#3-lucky-numbers-nft-system)
4. [MEV Protection](#4-mev-protection)
5. [Quick Pick Express (5/35)](#5-quick-pick-express-535)
6. [Syndicate Wars Competition](#6-syndicate-wars-competition)
7. [Implementation Priority](#7-implementation-priority)

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
| $1,500,000 - $2,250,000 | 40% | 60% | Maximum extraction during rolldown zone |
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

### 6.8 UI/UX Considerations

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
| **Soft Cap** | $1,750,000 | Probabilistic rolldown trigger possible each draw |
| **Hard Cap** | $2,250,000 | 100% of jackpot distributes (forced rolldown) |

### 2.3 Probabilistic Trigger Mechanism

When jackpot exceeds $1.75M but is below $2.25M:

- Each draw, if no jackpot winner, rolldown triggers with probability:
  ```
  P(rolldown) = (jackpot - soft_cap) / (hard_cap - soft_cap)
  ```
- Probability increases linearly as jackpot grows
- At hard cap ($2.25M), probability = 100% (forced rolldown)

Example: Jackpot at $2,000,000
├── Excess over soft cap: $250,000
├── Total range: $500,000 ($2.25M - $1.75M)
├── Rolldown probability: $250,000 / $500,000 = 50%

If rolldown triggers:
├── 100% of jackpot distributes
├── Distribution follows standard rolldown percentages
├── Jackpot resets to $500,000 seed

### 2.4 Hard Cap Mechanics

When jackpot reaches or exceeds $2.25M:

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

**Solution with Probabilistic Cap:**
- Rolldown occurs at random time between soft and hard caps
- Players can't perfectly time the "big one"
- Engagement spreads across more draws
- Probability increases as jackpot grows, creating anticipation

### 2.6 Smart Contract Implementation

```rust
/// Cap thresholds
pub const SOFT_CAP: u64 = 1_750_000_000_000;    // $1.75M
pub const HARD_CAP: u64 = 2_250_000_000_000;    // $2.25M

#[account]
pub struct LotteryState {
    // ... existing fields ...
    
    /// Soft cap threshold (probabilistic rolldown begins)
    pub soft_cap: u64,
    
    /// Hard cap threshold (forced rolldown)
    pub hard_cap: u64,
}

/// Check and execute probabilistic rolldown after draw
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
    
    // Hard cap check (forced rolldown)
    if state.jackpot_balance >= state.hard_cap {
        execute_full_rolldown(ctx)?;
        state.jackpot_balance = state.seed_amount;
        draw_result.was_rolldown = true;
        draw_result.rolldown_type = RolldownType::Hard;
        return Ok(());
    }
    
    // Probabilistic rolldown check (soft cap zone)
    if state.jackpot_balance > state.soft_cap {
        // Calculate rolldown probability
        let probability_numerator = state.jackpot_balance - state.soft_cap;
        let probability_denominator = state.hard_cap - state.soft_cap;
        let probability = probability_numerator as u128 * 10000 / probability_denominator as u128; // basis points
        
        // Generate random number [0, 9999] via Switchboard Randomness
        let random_value = revealed_random_value[0] as u64 % 10000;
        
        if random_value < probability as u64 {
            // Probabilistic rolldown triggered
            execute_full_rolldown(ctx)?;
            state.jackpot_balance = state.seed_amount;
            draw_result.was_rolldown = true;
            draw_result.rolldown_type = RolldownType::Soft; // Soft indicates probabilistic trigger
        }
    }
    
    Ok(())
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum RolldownType {
    None,
    Soft,   // Probabilistic rolldown (full jackpot)
    Hard,   // Forced rolldown (100% of jackpot at hard cap)
}

// Mini-rolldown function removed - replaced with probabilistic full rolldown
```

### 2.7 Expected Value Analysis

**Probabilistic Rolldown Zone ($1.75M - $2.25M):**

```
Scenario: Jackpot at $2.0M, 100k tickets sold
Probability of rolldown: 50%

Expected rolldown contribution:
├── If rolldown triggers (50% chance):
│   ├── Match 5: (1/39,028) × $25,000* = $0.32
│   ├── Match 4: (1/800) × $900* = $1.13
│   ├── Match 3: (1/47) × $45* = $0.96
│   └── Match 2: (1/6.8) × $2.50 = $0.37
│   └── Total EV during rolldown: $2.78
├── If no rolldown (50% chance):
│   └── Normal EV: $0.88

Weighted EV = (0.5 × $2.78) + (0.5 × $0.88) = $1.83
*Example prize amounts scaled to $2.0M jackpot

As jackpot approaches hard cap:
├── At $2.25M: Probability = 100%, EV = $2.78
├── At $2.0M: Probability = 50%, EV = $1.83
├── At $1.875M: Probability = 25%, EV = $1.36

Players get increasing +EV as jackpot grows, with guaranteed +EV at hard cap.
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
├── Average jackpot: $1,750,000
├── Bonus: 1% = $17,500
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

## 4. MEV Protection

### 4.1 Threat Model

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

### 4.2 Solution: Threshold Encryption

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

### 4.3 Implementation

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

### 4.4 Alternative: Jito Integration

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

### 4.5 Recommendation

**Phase 1 (Launch):** Implement Jito integration for basic MEV protection
**Phase 2 (6+ months):** Add threshold encryption for maximum security

---

## 5. Quick Pick Express (5/35) — FIXED → PARI-MUTUEL PRIZE SYSTEM

### 5.1 Overview

A high-frequency mini-lottery featuring the **same rolldown mechanics and +EV exploit as the main lottery**, running every 4 hours (6x daily). This exclusive game provides continuous engagement between main draws and is only accessible to players who have demonstrated commitment to the main lottery.

> **🔒 PRIZE TRANSITION SYSTEM:** All Quick Pick prizes START as FIXED amounts during normal mode, then TRANSITION to PARI-MUTUEL (shared pool) during rolldown events. This hybrid system ensures operator liability is ALWAYS CAPPED while maintaining attractive +EV windows for players.

**🎯 Key Feature:** During rolldown events, players enjoy **+58.7% positive expected value** using pari-mutuel prize distribution — comparable to the main lottery's optimal rolldown conditions.

### 5.2 Access Requirements

> ⚠️ **$50 Gate Requirement**: Players must have spent a minimum of **$50 USDC lifetime** in the main SolanaLotto (6/46) before gaining access to Quick Pick Express.

This requirement:
- Ensures players understand the main lottery mechanics first
- Creates exclusivity and rewards loyal players
- Reduces abuse potential from bot accounts
- Builds a committed player base for the mini-game

**Implementation:**
```rust
// Check user eligibility before Quick Pick purchase
pub fn verify_quick_pick_eligibility(user_stats: &UserStats) -> Result<()> {
    require!(
        user_stats.total_spent >= QUICK_PICK_MIN_SPEND_GATE,
        LottoError::InsufficientMainLotterySpend
    );
    Ok(())
}

// Constant
pub const QUICK_PICK_MIN_SPEND_GATE: u64 = 50_000_000; // $50 in USDC lamports
```

### 5.3 Game Parameters

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| **Matrix** | 5/35 (Pick 5 from 35) | Balanced odds — occasional jackpot wins + frequent rolldowns |
| **Ticket Price** | $1.50 USDC | Accessible yet meaningful stake |
| **Draw Frequency** | Every 4 hours (6x daily) | Continuous engagement |
| **Jackpot Seed** | $5,000 | Attractive starting point |
| **Soft Cap** | $30,000 | Probabilistic rolldown begins |
| **Hard Cap** | $40,000 | Forced rolldown guaranteed |
| **Cycle Duration** | ~2-3 days (12-18 draws) | Fast-paced excitement |

### 5.4 Odds Calculation

```
Total combinations: C(35, 5) = 324,632

Match Probabilities:
├── Match 5 (Jackpot): C(5,5) × C(30,0) / 324,632 = 1/324,632 (0.000308%)
├── Match 4: C(5,4) × C(30,1) / 324,632 = 150/324,632 = 1/2,164 (0.0462%)
├── Match 3: C(5,3) × C(30,2) / 324,632 = 4,350/324,632 = 1/74.6 (1.34%)
├── Match 2: C(5,2) × C(30,3) / 324,632 = 40,600/324,632 = 1/8.0 (12.5%)
├── Match 1: C(5,1) × C(30,4) / 324,632 = 136,750/324,632 = 42.1%
├── Match 0: C(5,0) × C(30,5) / 324,632 = 142,506/324,632 = 43.9%
```

**Why 5/35?**
- Jackpot odds (1 in 324,632) create ~14% chance of direct jackpot win per cycle
- This means ~86% of cycles end in rolldown — consistent +EV opportunities
- More exciting than 6/46 (where jackpots almost never hit)
- Match 4 odds (1 in 2,164) provide meaningful secondary prizes

### 5.5 Dynamic House Fee System

Like the main lottery, Quick Pick Express uses dynamic fees based on jackpot level:

| Jackpot Level | House Fee | Prize Pool | Effect |
|---------------|-----------|------------|--------|
| < $10,000 | **30%** | 70% | Attracts early players |
| $10,000 - $20,000 | **33%** | 67% | Standard operations |
| $20,000 - $30,000 | **36%** | 64% | Building anticipation |
| > $30,000 | **38%** | 62% | Maximum extraction near cap |
| During Rolldown | **28%** | 72% | Encourages maximum volume |

### 5.6 Prize Structure - Normal Mode — FIXED PRIZES

During normal operation (Jackpot < $30,000), prizes are **FIXED amounts**:

| Match | Prize Type | Prize Amount | Odds | Expected Value |
|-------|------------|--------------|------|----------------|
| **5 (Jackpot)** | Variable Pool | $5,000 → $40,000 (growing) | 1 in 324,632 | $0.015 - $0.12 |
| **4** | **FIXED** | $100 | 1 in 2,164 | $0.046 |
| **3** | **FIXED** | $4 | 1 in 74.6 | $0.054 |
| **Total EV** | | | | **$0.12 - $0.22** |

**House Edge (Normal):** ~85-92% — funds the rolldown exploit

**Pari-Mutuel Transition Trigger:** If (Winner Count × Fixed Prize) > Prize Pool, automatic transition to pari-mutuel occurs to cap operator liability.

### 5.7 🔥 Prize Structure - Rolldown Mode — PARI-MUTUEL (THE EXPLOIT)

> **🔒 CRITICAL TRANSITION:** During rolldown, ALL prizes transition from FIXED to **PARI-MUTUEL**. Operator liability is CAPPED at exactly the jackpot amount ($30,000-$40,000), regardless of ticket volume or winner count.

When jackpot caps and no Match 5 winner, the **full jackpot distributes down using PARI-MUTUEL**:

| Match | Pool Share | Pool Amount | Est. Prize* | Formula | Expected Value |
|-------|------------|-------------|-------------|---------|----------------|
| **5** | 0% | $0 | $0 (no winner) | — | $0 |
| **4** | 60% | $18,000 | ~$3,000* | `Pool ÷ Winners` | $1.39 |
| **3** | 40% | $12,000 | ~$74* | `Pool ÷ Winners` | $0.99 |
| **Total EV** | | | | | **$2.38** |

*\*Estimated prizes at ~12,000 tickets. Actual = Pool ÷ Winner Count (pari-mutuel formula). More tickets = more winners = lower per-winner prize, but operator liability STAYS CAPPED at jackpot amount.*

### 🎯 **Player Edge (Rolldown): +58.7%** 

**This is the exploit!** During rolldown:
- Ticket costs $1.50
- Expected return is $2.38
- **Profit: +$0.88 per ticket**

**🔒 WHY PARI-MUTUEL PROTECTS THE OPERATOR:**
- Total payout = EXACTLY $30,000 (the jackpot), regardless of:
  - Whether 5,000 or 50,000 tickets are sold
  - Whether there are 3 or 30 Match 4 winners
- Operator liability is mathematically CAPPED
- Player +EV is preserved through proportional distribution

This provides comparable value to the main lottery's rolldown, which can offer up to +62% player edge under optimal conditions (475k tickets sold during rolldown).

### 5.8 The Rolldown Mechanism — PARI-MUTUEL DISTRIBUTION

Quick Pick Express uses the same probabilistic rolldown system as the main lottery, with **PARI-MUTUEL prize distribution** during rolldown events:

#### Soft/Hard Cap System

| Parameter | Value | Behavior | Prize Mode |
|-----------|-------|----------|------------|
| **Below Soft Cap** | < $30,000 | Normal operation | **FIXED** |
| **Soft Cap** | $30,000 | Rolldown can trigger randomly each draw | **→ PARI-MUTUEL** |
| **Hard Cap** | $40,000 | Rolldown forced (100% of jackpot distributes) | **PARI-MUTUEL** |

#### Probabilistic Trigger

When jackpot exceeds $30,000 but is below $40,000:

```
P(rolldown) = (jackpot - soft_cap) / (hard_cap - soft_cap)
            = (jackpot - $30,000) / $10,000

Example: Jackpot at $35,000
├── Excess over soft cap: $5,000
├── Total range: $10,000
├── Rolldown probability: 50%
```

#### Rolldown Distribution Flow — PARI-MUTUEL

```
┌─────────────────────────────────────────────────────────┐
│       QUICK PICK ROLLDOWN TRIGGERED (PARI-MUTUEL)        │
│                  Jackpot: $30,000                        │
│         Total Operator Liability: EXACTLY $30,000        │
└─────────────────────────────────────────────────────────┘
                           │
           ┌───────────────┴───────────────┐
           ▼                               ▼
    ┌─────────────┐                 ┌─────────────┐
    │   MATCH 4   │                 │   MATCH 3   │
    │  POOL: 60%  │                 │  POOL: 40%  │
    │  $18,000    │                 │  $12,000    │
    └─────────────┘                 └─────────────┘
           │                               │
           ▼                               ▼
    ┌─────────────┐                 ┌─────────────┐
    │ PARI-MUTUEL │                 │ PARI-MUTUEL │
    │  ~6 winners │                 │ ~161 winners│
    │ ~$3,000 ea* │                 │  ~$74 ea*   │
    └─────────────┘                 └─────────────┘
    
    * Estimated at ~12,000 tickets. Actual = Pool ÷ Winners
    
    🔒 OPERATOR PROTECTION: Total payout = EXACTLY $30,000
       regardless of ticket volume or winner count
```

#### Post-Rolldown Reset

After a rolldown:
1. Jackpot resets to $5,000 seed
2. Normal mode resumes
3. New cycle begins (~2-3 days to next cap)

### 5.9 Prize Pool Allocation

Revenue allocation per $1.50 ticket (at 33% average fee):

```
┌──────────────────────────────────────────────────────────┐
│                    TICKET: $1.50                          │
├──────────────────────────────────────────────────────────┤
│  ┌────────────────┐  ┌────────────────────────────────┐  │
│  │   HOUSE FEE    │  │         PRIZE POOL             │  │
│  │     $0.50      │  │           $1.00                │  │
│  │   (28-38%)     │  │         (62-72%)               │  │
│  └────────────────┘  └────────────────────────────────┘  │
│                              │                            │
│           ┌──────────────────┼──────────────────┐        │
│           ▼                  ▼                  ▼        │
│    ┌─────────────┐   ┌─────────────┐   ┌─────────────┐  │
│    │   JACKPOT   │   │   FIXED     │   │  INSURANCE  │  │
│    │    60%      │   │   PRIZES    │   │    POOL     │  │
│    │   $0.60     │   │    37%      │   │     3%      │  │
│    └─────────────┘   └─────────────┘   └─────────────┘  │
└──────────────────────────────────────────────────────────┘
```

> **Note:** Quick Pick Express has no Match 2 (free ticket) prize. Only Match 3+ wins.

### 5.10 Smart Contract Implementation

```rust
// Quick Pick Express Constants (5/35 Matrix)
pub const QUICK_PICK_TICKET_PRICE: u64 = 1_500_000;        // $1.50 in USDC lamports
pub const QUICK_PICK_NUMBERS: u8 = 5;                       // Pick 5 numbers
pub const QUICK_PICK_RANGE: u8 = 35;                        // From 1-35
pub const QUICK_PICK_INTERVAL: i64 = 14400;                 // 4 hours in seconds
pub const QUICK_PICK_MIN_SPEND_GATE: u64 = 50_000_000;      // $50 gate requirement

// Quick Pick Jackpot Parameters
pub const QUICK_PICK_SEED_AMOUNT: u64 = 5_000_000_000;      // $5,000 seed
pub const QUICK_PICK_SOFT_CAP: u64 = 30_000_000_000;        // $30,000 soft cap
pub const QUICK_PICK_HARD_CAP: u64 = 40_000_000_000;        // $40,000 hard cap

// Quick Pick Dynamic Fees
pub const QUICK_PICK_FEE_TIER_1_THRESHOLD: u64 = 10_000_000_000;  // $10,000
pub const QUICK_PICK_FEE_TIER_2_THRESHOLD: u64 = 20_000_000_000;  // $20,000
pub const QUICK_PICK_FEE_TIER_3_THRESHOLD: u64 = 30_000_000_000;  // $30,000
pub const QUICK_PICK_FEE_TIER_1_BPS: u16 = 3000;            // 30%
pub const QUICK_PICK_FEE_TIER_2_BPS: u16 = 3300;            // 33%
pub const QUICK_PICK_FEE_TIER_3_BPS: u16 = 3600;            // 36%
pub const QUICK_PICK_FEE_TIER_4_BPS: u16 = 3800;            // 38%
pub const QUICK_PICK_FEE_ROLLDOWN_BPS: u16 = 2800;          // 28% during rolldown

// Quick Pick Fixed Prizes (Normal Mode) — NO FREE TICKET
pub const QUICK_PICK_MATCH_4_PRIZE: u64 = 100_000_000;      // $100
pub const QUICK_PICK_MATCH_3_PRIZE: u64 = 4_000_000;        // $4
// No Match 2 prize in Quick Pick Express

// Quick Pick Rolldown Allocation
pub const QUICK_PICK_ROLLDOWN_MATCH_4_BPS: u16 = 6000;      // 60%
pub const QUICK_PICK_ROLLDOWN_MATCH_3_BPS: u16 = 4000;      // 40%

// Quick Pick Prize Pool Allocation (no free tickets = more to jackpot)
pub const QUICK_PICK_JACKPOT_ALLOCATION_BPS: u16 = 6000;    // 60%
pub const QUICK_PICK_FIXED_PRIZE_ALLOCATION_BPS: u16 = 3700; // 37%
pub const QUICK_PICK_INSURANCE_ALLOCATION_BPS: u16 = 300;   // 3%

/// Quick Pick Express game state with rolldown mechanics (5/35)
#[account]
pub struct QuickPickState {
    /// Game identifier
    pub game_id: u64,
    
    /// Current draw number
    pub current_draw: u64,
    
    /// Ticket price (1,500,000 = $1.50)
    pub ticket_price: u64,
    
    /// Matrix parameters
    pub pick_count: u8,      // 5
    pub number_range: u8,    // 35
    
    /// Current house fee (dynamic based on jackpot)
    pub house_fee_bps: u16,
    
    /// Draw interval in seconds (14400 = 4 hours)
    pub draw_interval: i64,
    
    /// Next draw timestamp
    pub next_draw_timestamp: i64,
    
    /// Jackpot balance (accumulates between draws)
    pub jackpot_balance: u64,
    
    /// Jackpot caps
    pub soft_cap: u64,       // $30,000
    pub hard_cap: u64,       // $40,000
    
    /// Seed amount for jackpot reset
    pub seed_amount: u64,    // $5,000
    
    /// Fixed prize amounts (in USDC lamports) — NO FREE TICKET
    pub match_4_prize: u64,  // $100
    pub match_3_prize: u64,  // $4
    // No match_2 prize in Quick Pick Express
    
    /// Current draw ticket count
    pub current_draw_tickets: u64,
    
    /// Prize pool balance (for fixed prizes)
    pub prize_pool_balance: u64,
    
    /// Insurance pool balance
    pub insurance_balance: u64,
    
    /// Rolldown state
    pub is_rolldown_pending: bool,
    
    /// Is paused
    pub is_paused: bool,
    
    /// PDA bump
    pub bump: u8,
}

/// Quick Pick Express ticket (5/35)
#[account]
pub struct QuickPickTicket {
    pub owner: Pubkey,
    pub draw_id: u64,
    pub numbers: [u8; 5],    // 5 numbers for 5/35 matrix
    pub purchase_timestamp: i64,
    pub is_claimed: bool,
    pub match_count: u8,
    pub prize_amount: u64,
    pub bump: u8,
}

/// Calculate dynamic house fee for Quick Pick
pub fn calculate_quick_pick_fee_bps(jackpot_balance: u64, is_rolldown_pending: bool) -> u16 {
    if is_rolldown_pending {
        return QUICK_PICK_FEE_ROLLDOWN_BPS;
    }
    
    if jackpot_balance < QUICK_PICK_FEE_TIER_1_THRESHOLD {
        QUICK_PICK_FEE_TIER_1_BPS
    } else if jackpot_balance < QUICK_PICK_FEE_TIER_2_THRESHOLD {
        QUICK_PICK_FEE_TIER_2_BPS
    } else if jackpot_balance < QUICK_PICK_FEE_TIER_3_THRESHOLD {
        QUICK_PICK_FEE_TIER_3_BPS
    } else {
        QUICK_PICK_FEE_TIER_4_BPS
    }
}

/// Check if probabilistic rolldown should trigger
pub fn should_quick_pick_rolldown(jackpot_balance: u64, random_value: u64) -> bool {
    if jackpot_balance < QUICK_PICK_SOFT_CAP {
        return false;
    }
    
    if jackpot_balance >= QUICK_PICK_HARD_CAP {
        return true;
    }
    
    // Linear probability between soft and hard caps
    let probability_bps = ((jackpot_balance - QUICK_PICK_SOFT_CAP) as u128 * 10000
        / (QUICK_PICK_HARD_CAP - QUICK_PICK_SOFT_CAP) as u128) as u64;
    
    (random_value % 10000) < probability_bps
}

/// Buy Quick Pick ticket with gate verification
pub fn buy_quick_pick_ticket(
    ctx: Context<BuyQuickPick>,
    numbers: [u8; 5],
) -> Result<()> {
    let state = &mut ctx.accounts.quick_pick_state;
    let ticket = &mut ctx.accounts.ticket;
    let user_stats = &ctx.accounts.user_stats;
    
    // Verify $50 gate requirement
    require!(
        user_stats.total_spent >= QUICK_PICK_MIN_SPEND_GATE,
        LottoError::InsufficientMainLotterySpend
    );
    
    // Validate numbers (1-35, unique)
    validate_quick_pick_numbers(&numbers)?;
    
    // Calculate dynamic fees based on current jackpot
    let fee_bps = calculate_quick_pick_fee_bps(
        state.jackpot_balance,
        state.is_rolldown_pending
    );
    let house_fee = state.ticket_price * fee_bps as u64 / 10000;
    let prize_contribution = state.ticket_price - house_fee;
    
    // Allocate prize contribution
    let jackpot_contribution = prize_contribution * QUICK_PICK_JACKPOT_ALLOCATION_BPS as u64 / 10000;
    let fixed_prize_contribution = prize_contribution * QUICK_PICK_FIXED_PRIZE_ALLOCATION_BPS as u64 / 10000;
    let insurance_contribution = prize_contribution * QUICK_PICK_INSURANCE_ALLOCATION_BPS as u64 / 10000;
    
    // Transfer USDC
    transfer_usdc(
        ctx.accounts.player_usdc,
        ctx.accounts.prize_pool,
        state.ticket_price
    )?;
    
    // Update state
    state.jackpot_balance += jackpot_contribution;
    state.prize_pool_balance += fixed_prize_contribution;
    state.insurance_balance += insurance_contribution;
    state.current_draw_tickets += 1;
    state.house_fee_bps = fee_bps;
    
    // Create ticket
    ticket.owner = ctx.accounts.player.key();
    ticket.draw_id = state.current_draw;
    ticket.numbers = sort_numbers_5(numbers);
    ticket.purchase_timestamp = Clock::get()?.unix_timestamp;
    ticket.is_claimed = false;
    
    emit!(QuickPickTicketPurchased {
        ticket: ticket.key(),
        player: ctx.accounts.player.key(),
        draw_id: state.current_draw,
        numbers: ticket.numbers,
        price: state.ticket_price,
        fee_bps,
        jackpot_balance: state.jackpot_balance,
    });
    
    Ok(())
}

/// Execute Quick Pick draw with rolldown logic
pub fn execute_quick_pick_draw(
    ctx: Context<ExecuteQuickPickDraw>,
    winning_numbers: [u8; 5],
    random_value: u64,
) -> Result<()> {
    let state = &mut ctx.accounts.quick_pick_state;
    let draw_result = &mut ctx.accounts.draw_result;
    
    // Check for Match 5 winner (jackpot winner)
    let has_jackpot_winner = draw_result.match_5_winners > 0;
    
    if has_jackpot_winner {
        // Jackpot won - distribute to winner(s)
        draw_result.match_5_prize_per_winner = state.jackpot_balance / draw_result.match_5_winners as u64;
        draw_result.match_4_prize_per_winner = state.match_4_prize;
        draw_result.match_3_prize_per_winner = state.match_3_prize;
        draw_result.was_rolldown = false;
        
        // Reset jackpot to seed
        state.jackpot_balance = state.seed_amount;
    } else if should_quick_pick_rolldown(state.jackpot_balance, random_value) {
        // No jackpot winner and rolldown triggered — THE EXPLOIT!
        let jackpot_to_distribute = state.jackpot_balance;
        
        // Calculate rolldown prizes (60% to Match 4, 40% to Match 3)
        let match_4_pool = jackpot_to_distribute * QUICK_PICK_ROLLDOWN_MATCH_4_BPS as u64 / 10000;
        let match_3_pool = jackpot_to_distribute * QUICK_PICK_ROLLDOWN_MATCH_3_BPS as u64 / 10000;
        
        draw_result.match_5_prize_per_winner = 0;
        
        if draw_result.match_4_winners > 0 {
            draw_result.match_4_prize_per_winner = match_4_pool / draw_result.match_4_winners as u64;
        }
        if draw_result.match_3_winners > 0 {
            draw_result.match_3_prize_per_winner = match_3_pool / draw_result.match_3_winners as u64;
        }
        
        draw_result.was_rolldown = true;
        
        // Reset jackpot to seed
        state.jackpot_balance = state.seed_amount;
        
        emit!(QuickPickRolldownExecuted {
            draw_id: state.current_draw,
            jackpot_distributed: jackpot_to_distribute,
            match_4_prize: draw_result.match_4_prize_per_winner,
            match_3_prize: draw_result.match_3_prize_per_winner,
        });
    } else {
        // Normal draw - fixed prizes only
        draw_result.match_4_prize_per_winner = state.match_4_prize;
        draw_result.match_3_prize_per_winner = state.match_3_prize;
        draw_result.was_rolldown = false;
    }
    
    // No Match 2 prize in Quick Pick Express
    draw_result.match_2_prize_per_winner = 0;
    
    // Advance to next draw
    state.current_draw += 1;
    state.next_draw_timestamp += state.draw_interval;
    state.current_draw_tickets = 0;
    state.is_rolldown_pending = state.jackpot_balance >= state.soft_cap;
    
    Ok(())
}

fn validate_quick_pick_numbers(numbers: &[u8; 5]) -> Result<()> {
    for &num in numbers.iter() {
        require!(num >= 1 && num <= 35, LottoError::NumberOutOfRange);
    }
    
    let mut sorted = *numbers;
    sorted.sort();
    for i in 0..4 {
        require!(sorted[i] != sorted[i + 1], LottoError::DuplicateNumber);
    }
    
    Ok(())
}
```

### 5.11 Expected Value Analysis

#### Normal Mode (Early Cycle, Jackpot ~$10,000)

| Match | Calculation | Expected Value |
|-------|-------------|----------------|
| Match 5 | $10,000 × (1/324,632) | $0.031 |
| Match 4 | $100 × (1/2,164) | $0.046 |
| Match 3 | $4 × (1/74.6) | $0.054 |
| **Total** | | **$0.13** |

**House Edge:** ($1.50 - $0.13) / $1.50 = **91%**

#### Near-Cap Mode (Jackpot ~$30,000)

| Match | Calculation | Expected Value |
|-------|-------------|----------------|
| Match 5 | $30,000 × (1/324,632) | $0.092 |
| Match 4 | $100 × (1/2,164) | $0.046 |
| Match 3 | $4 × (1/74.6) | $0.054 |
| **Total** | | **$0.19** |

**House Edge:** ($1.50 - $0.19) / $1.50 = **87%**

#### 🔥 Rolldown Mode (THE EXPLOIT — Full Jackpot Distribution)

| Match | Calculation | Expected Value |
|-------|-------------|----------------|
| Match 5 | $0 (no winner) | $0.00 |
| Match 4 | $3,000 × (1/2,164) | **$1.39** |
| Match 3 | $74 × (1/74.6) | **$0.99** |
| **Total** | | **$2.38** |

### 🎯 **Player Edge (Rolldown): +58.7%**

```
┌────────────────────────────────────────────────────────┐
│                  THE QUICK PICK EXPLOIT                 │
├────────────────────────────────────────────────────────┤
│   Ticket Cost:        $1.50                            │
│   Expected Return:    $2.38                            │
│   ─────────────────────────────────                    │
│   PROFIT PER TICKET:  +$0.88 (+58.7%)                  │
│                                                        │
│   Buy 100 tickets during rolldown:                     │
│   ├── Cost: $150                                       │
│   ├── Expected return: $238                            │
│   └── Expected profit: $88                             │
└────────────────────────────────────────────────────────┘
```

### 5.12 Cycle Economics & Operator Profitability — FIXED → PARI-MUTUEL

#### Full Cycle Analysis (2.5 days, 15 draws) - With Pari-Mutuel Prize Transition

> **🔒 PRIZE MODE TRANSITION:** Normal mode uses FIXED prizes. Rolldown mode uses PARI-MUTUEL prizes. This hybrid system ensures operator liability is CAPPED during high-volume rolldown events.

**Phase 1 — Normal Mode (11 draws, 4,000 tickets/draw) — FIXED PRIZES:**
```
Prize Mode: FIXED
Revenue: 11 × 4,000 × $1.50 = $66,000
House Fees (avg 33%): $21,780
Expected Fixed Prize Payouts: ~$8,500
Operator Liability: Variable (depends on winners)
```

**Phase 2 — Near-Cap (3 draws, 8,000 tickets/draw) — FIXED PRIZES:**
```
Prize Mode: FIXED
Revenue: 3 × 8,000 × $1.50 = $36,000
House Fees (37%): $13,320
Expected Fixed Prize Payouts: ~$4,600
Operator Liability: Variable (depends on winners)
```

**Phase 3 — Rolldown (1 draw, 12,000 tickets) — PARI-MUTUEL PRIZES:**
```
Prize Mode: PARI-MUTUEL (transition from fixed!)
Revenue: 12,000 × $1.50 = $18,000
House Fees (28%): $5,040
Jackpot Distribution: $30,000 (EXACTLY - capped by pari-mutuel)
🔒 Operator Liability: CAPPED at $30,000 regardless of volume
```

#### Cycle Summary (Corrected)

| Metric | Prize Mode | Amount |
|--------|------------|--------|
| **Total Tickets** | — | 80,000 |
| **Total Revenue** | — | $120,000 |
| **Total House Fees** | — | $40,140 |
| **Expected Fixed Prize Payouts** | FIXED | ~$13,100 |
| **Jackpot Distributed** | **PARI-MUTUEL** | $30,000 |
| **New Seed Required** | — | -$5,000 |
| **Net Cycle Profit** | | **~$9,540** |

> **🔒 OPERATOR PROTECTION:** During rolldown (Phase 3), prizes transition from FIXED to PARI-MUTUEL. Total rolldown liability is CAPPED at exactly $30,000 (the jackpot), regardless of ticket volume or winner count.

*Note: Prize transition system converts fixed prizes to pari-mutuel (shared pool) during high-volume draws to limit operator loss while maintaining player value.*

#### Annual Projections (Corrected)

```
Cycles per year: ~146 (365 days / 2.5 days)
Annual house fees: $40,140 × 146 = $5.86M
Annual prize payouts: ~$13,100 × 146 = $1.91M
Annual net profit: $9,540 × 146 = $1.39M

Combined with Main Lottery (Corrected):
├── Main Lottery: $10.9M/year (target, corrected)
├── Quick Pick Express: $1.39M/year (corrected)
├── Total: $12.29M/year (+12.8%)
```

*Note: All calculations include pari-mutuel prize transition system which limits operator loss during high-volume draws while maintaining sustainable player value.*

### 5.13 Why This Works: The Rolldown Exploit Economics

```
┌─────────────────────────────────────────────────────────┐
│            QUICK PICK EXPRESS PROFIT MODEL              │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  NORMAL MODE (11-14 draws per cycle):                   │
│  ├── House edge: 87-91% (no free tickets!)              │
│  ├── Operator collects substantial fees                 │
│  ├── Jackpot grows toward cap                           │
│  └── Players lose money (standard lottery)              │
│                                                         │
│  ROLLDOWN MODE (1 draw per cycle):                      │
│  ├── Player edge: +59%                                  │
│  ├── Operator still collects 28% house fee              │
│  ├── Full jackpot distributes to M4/M3 winners          │
│  └── PLAYERS WIN — This is the exploit!                 │
│                                                         │
│  NET RESULT:                                            │
│  ├── Normal mode profits > Rolldown mode costs          │
│  ├── Operator profitable every cycle ✅                 │
│  ├── Players have predictable +EV windows ✅            │
│  └── Creates unique value proposition ✅                │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 5.14 Comparison: Main Lottery vs Quick Pick Express

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
| **Normal Mode Edge** | -65% (house) | -89% (house) |
| **🔥 Rolldown EV** | **+14.6% to +62% (player)** | **+58.7% (player)** |
| **Rolldown Frequency** | ~Every 2-3 weeks | ~Every 2-3 days |

### 5.15 Strategy Guide for Players

#### The Quick Pick Exploit Strategy

1. **Qualify First**: Spend $50+ in the main lottery to unlock Quick Pick Express
2. **Monitor Jackpot**: Watch as it grows toward the $30,000 soft cap
3. **Calculate Probability**: When jackpot ≥ $30,000, rolldown can trigger any draw
4. **Buy During Rolldown Zone**: Probability = (Jackpot - $30k) / $10k
5. **Maximum Volume at Hard Cap**: At $40,000+, rolldown is guaranteed — buy maximum tickets
6. **Expected Profit**: ~$0.88 per ticket during rolldown (+59%)

#### Recommended Bankroll

| Risk Level | Bankroll | Tickets/Rolldown | Expected Profit |
|------------|----------|------------------|-----------------|
| Conservative | $150 | 100 | $88 |
| Moderate | $450 | 300 | $264 |
| Aggressive | $1,500 | 1,000 | $880 |

⚠️ **Variance Warning**: Even with +59% edge, individual draws can lose. Recommended minimum 10+ rolldown participations to realize expected value.



## 6. Syndicate Wars Competition

### 6.1 Overview

Monthly competition where syndicates compete for the best win rate, creating tribal loyalty and recurring engagement.

### 6.2 Competition Rules

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

### 6.3 Prize Pool

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

### 7.4 Data Structures

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

### 7.5 Leaderboard Logic

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

### 7.6 UI/UX Design

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

## 7. Implementation Priority

### 7.1 Priority Matrix

| Feature | Impact | Complexity | Priority |
|---------|--------|------------|----------|
| **MEV Protection (Jito)** | Critical | Low | P0 - Launch |
| **Dynamic House Fee** | High | Low | P1 - Month 1 |
| **Soft/Hard Caps** | High | Medium | P1 - Month 1 |
| **Syndicate Wars** | Medium | Medium | P2 - Month 3 |
| **Second Chance Draws** | Medium | Medium | P2 - Month 3 |
| **Quick Pick Express** | High | Medium | P2 - Month 4 |
| **Lucky Numbers NFT** | Medium | High | P3 - Month 6 |

| **MEV Protection (Threshold)** | Medium | High | P4 - Month 9 |

### 7.2 Implementation Timeline

```
PHASE 1: Security & Core (Months 1-2)
├── Jito MEV protection
├── Dynamic house fee system
├── Soft/hard rolldown caps
├── Switchboard Randomness integration

PHASE 2: Engagement (Months 3-5)
├── Syndicate Wars competition
├── Quick Pick Express game
├── Enhanced dashboards

PHASE 3: Premium Features (Months 6-9)
├── Lucky Numbers NFT system
├── Advanced MEV protection
├── Cross-chain preparation

PHASE 4: Scale (Months 10-12)
├── White-label platform
├── Cross-chain deployment
├── Advanced analytics
├── DAO transition
```

### 8.3 Resource Requirements

| Feature | Engineering | Design | Marketing |
|---------|-------------|--------|-----------|
| MEV Protection (Jito) | 1 week | - | - |
| Dynamic House Fee | 1 week | 2 days | - |
| Soft/Hard Caps | 2 weeks | 3 days | - |
| Syndicate Wars | 3 weeks | 1 week | 1 week |
| Quick Pick Express | 3 weeks | 1 week | 1 week |
| Lucky Numbers NFT | 4 weeks | 2 weeks | 2 weeks |
| Mega Events | 4 weeks | 2 weeks | 3 weeks |

### 7.5 Success Metrics

| Feature | KPI | Target |
|---------|-----|--------|
| Dynamic Fee | Average fee collected | +7% vs fixed |
| Soft/Hard Caps | Volume during soft cap | +15% vs baseline |
| Syndicate Wars | Monthly active syndicates | 100+ |
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