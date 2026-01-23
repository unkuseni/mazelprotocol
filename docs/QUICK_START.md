# SolanaLotto Quick Start Guide

> **The world's first intentionally exploitable lottery on Solana**

---

## 🚀 What is SolanaLotto?

SolanaLotto is a decentralized lottery protocol that creates **predictable windows of positive expected value (+EV)** for players. Unlike traditional lotteries where the house always wins, SolanaLotto's rolldown mechanism allows sophisticated players to profit during specific market conditions.

### The Core Innovation

SolanaLotto uses a **two-tier cap system**:

| Cap | Threshold | What Happens |
|-----|-----------|--------------|
| **Soft Cap** | $1.5M | 30% of excess rolls down (mini-rolldowns) |
| **Hard Cap** | $2.0M | 100% of jackpot distributes (full rolldown) |

During full rolldown events:

- **Ticket Cost:** $2.50
- **Expected Value:** ~$2.78
- **Player Edge:** +11.2%

This isn't a bug—it's the core feature that drives engagement and volume.

### Dynamic House Fee

Fees scale with jackpot excitement:

| Jackpot Level | House Fee |
|---------------|-----------|
| < $500k | 28% |
| $500k - $1M | 32% |
| $1M - $1.5M | 36% |
| > $1.5M | 40% |
| Rolldown | 28% |

---

## 📦 Project Documentation

| Document | Description |
|----------|-------------|
| [SOLANA_LOTTO.md](./SOLANA_LOTTO.md) | Main README with features, prizes, and API |
| [WHITEPAPER.md](./WHITEPAPER.md) | Mathematical foundations and economic model |
| [TECHNICAL_SPEC.md](./TECHNICAL_SPEC.md) | Smart contract specs for developers |
| [ADVANCED_FEATURES.md](./ADVANCED_FEATURES.md) | **NEW:** Dynamic fees, Lucky Numbers NFT, Second Chance, MEV protection, Quick Pick Express, Mega Events, Syndicate Wars |

---

## 🎯 For Players

### Step 1: Connect Your Wallet

```bash
# Supported wallets:
- Phantom
- Solflare
- Backpack
- Ledger (via Phantom)
```

### Step 2: Get USDC

You need USDC (Solana) to buy tickets. Minimum $2.50 per ticket.

### Step 3: Pick Your Numbers

Choose 6 numbers between 1 and 46, or use Quick Pick for random selection.

### Step 4: Buy Tickets

Confirm the transaction in your wallet. Tickets cost $2.50 each.

### Step 5: Watch the Draw

Draws happen daily at 00:00 UTC. Results are posted within minutes.

### Step 6: Claim Prizes

Prizes are automatically calculated. Claim them anytime through the app.

---

## 🧠 For Sophisticated Players (The Exploit)

### Understanding the Rolldown

1. **Monitor Jackpot:** Watch as it grows toward the $1.75M cap
2. **Calculate EV:** When jackpot ≥ $1.5M, start preparing
3. **Wait for Trigger:** Rolldown happens when jackpot ≥ cap AND no Match-6 winner
4. **Buy in Volume:** During rolldown, expected value exceeds ticket cost
5. **Profit:** Collect winnings from Match 3, 4, and 5 tiers

### Expected Value During Full Rolldown ($2M Hard Cap)

| Match | Rolldown Prize | Odds | EV Contribution |
|-------|----------------|------|-----------------|
| 5 | ~$25,000 | 1/39,028 | $0.64 |
| 4 | ~$900 | 1/800 | $1.13 |
| 3 | ~$45 | 1/47 | $0.96 |
| 2 | $2.50 | 1/6.8 | $0.37 |
| **Total EV** | | | **$3.10** |

**Edge: $3.10 - $2.50 = +$0.60 per ticket (+24%)**

### Soft Cap Mini-Rolldowns

Between $1.5M and $2M, you get **mini-rolldowns** every draw:
- 30% of excess over $1.5M rolls down
- Small +EV bumps without the full exploit
- Unpredictable timing prevents calendar gaming

### Optimal Strategy

1. **Monitor soft cap zone** ($1.5M-$2M) for mini-rolldown opportunities
2. **Accumulate capital** for hard cap rolldowns (~every 2-3 weeks)
3. **Buy maximum volume** during full rolldowns
4. **Join syndicates** to pool capital and reduce variance
5. **Enter Syndicate Wars** for bonus prize pool (1% of monthly sales)
6. **Collect Lucky Numbers NFTs** for future jackpot bonuses

### Risk Warning

- **Variance exists:** Individual draws can still lose money
- **Volume affects prizes:** More tickets = lower per-winner prizes
- **Timing matters:** If someone hits jackpot, rolldown is cancelled

---

## 💻 For Developers

### Installation

```bash
npm install @solanalotto/sdk
```

### Quick Example

```typescript
import { Connection, PublicKey } from '@solana/web3.js';
import { SolanaLotto } from '@solanalotto/sdk';

const connection = new Connection('https://api.mainnet-beta.solana.com');
const lotto = new SolanaLotto(connection);

// Get current state
const state = await lotto.getLotteryState();
console.log('Jackpot:', state.jackpotBalance / 1e6, 'USDC');

// Buy ticket
const tx = await lotto.buyTicket(wallet, [7, 14, 21, 28, 35, 42]);

// Check results
const result = await lotto.getDrawResult(state.currentDrawId - 1);
console.log('Winning numbers:', result.winningNumbers);
```

### Key Endpoints

```typescript
// State
lotto.getLotteryState()         // Current jackpot, draw info
lotto.getDrawResult(drawId)     // Historical draw results

// Tickets
lotto.buyTicket(wallet, numbers)
lotto.buyBulk(wallet, ticketsArray)
lotto.getUserTickets(publicKey)

// Claims
lotto.claimPrize(wallet, ticketPubkey)

// Staking
lotto.stakeLotto(wallet, amount)
lotto.getStakeAccount(publicKey)
lotto.claimStakingRewards(wallet)

// Syndicates
lotto.createSyndicate(wallet, config)
lotto.joinSyndicate(wallet, syndicatePubkey, amount)
```

---

## 📊 Key Numbers

### Main Lottery (6/46)

| Metric | Value |
|--------|-------|
| **Ticket Price** | $2.50 USDC |
| **Matrix** | 6/46 (pick 6 from 46) |
| **Jackpot Odds** | 1 in 9,366,819 |
| **Soft Cap** | $1,500,000 (mini-rolldowns begin) |
| **Hard Cap** | $2,000,000 (full rolldown) |
| **Jackpot Seed** | $500,000 |
| **House Fee** | 28-40% (dynamic) |
| **Draw Frequency** | Daily (00:00 UTC) |
| **Rolldown Frequency** | ~Every 2-3 weeks |

### Quick Pick Express (4/20)

| Metric | Value |
|--------|-------|
| **Ticket Price** | $0.50 USDC |
| **Matrix** | 4/20 |
| **Draw Frequency** | Every 4 hours (6x daily) |
| **Match 4 Prize** | $500 (1 in 4,845) |
| **Match 3 Prize** | $10 (1 in 76) |

### Mega Events (Quarterly)

| Metric | Value |
|--------|-------|
| **Ticket Price** | $10 USDC |
| **Matrix** | 6/49 |
| **Target Jackpot** | $5,000,000 |
| **Guaranteed** | Full rolldown on final day |

---

## 🎰 Additional Features

### 🏆 Lucky Numbers NFT
Win Match 4+ → Receive NFT with your numbers → If those numbers ever hit jackpot → You get **1% of the jackpot** (even if you didn't play!)

### 🎫 Second Chance Draws
Every non-winning ticket enters weekly Second Chance Draw:
- Grand Prize: $10,000
- 10 Runner Ups: $1,000 each
- 100 Consolation: $100 each

### 🏅 Syndicate Wars
Monthly competition for syndicates:
- Prize Pool: 1% of monthly sales (~$75k)
- Compete for best win rate
- Top 10 share the pool

### 🛡️ MEV Protection
- Jito integration prevents front-running
- Future: Threshold encryption for maximum security

---

## 🔗 Links

| Resource | URL |
|----------|-----|
| 🌐 Website | https://solanalotto.io |
| 📖 Documentation | https://docs.solanalotto.io |
| 💬 Discord | https://discord.gg/solanalotto |
| 🐦 Twitter | https://twitter.com/SolanaLotto |
| 📦 GitHub | https://github.com/solanalotto |
| 🔒 Security | security@solanalotto.io |

---

## ⚠️ Disclaimer

**This is gambling.** Most players will lose money over time. The rolldown exploit requires:

- Significant capital (recommended $1,000+ for meaningful exploitation)
- Correct timing (monitor soft cap zone and hard cap approach)
- Acceptance of variance (even +EV bets can lose short-term)
- Understanding of the dynamic fee system

Only play with money you can afford to lose. Verify your local laws before participating.

---

## 🆕 What's New (v2.0)

- ✅ **Dynamic House Fee** (28-40% based on jackpot)
- ✅ **Soft/Hard Cap System** (prevents calendar gaming)
- ✅ **Lucky Numbers NFT** (1% future jackpot bonus)
- ✅ **Second Chance Draws** (weekly)
- ✅ **Quick Pick Express** (4/20, every 4 hours)
- ✅ **Mega Rolldown Events** (quarterly, $5M jackpot)
- ✅ **Syndicate Wars** (monthly competition)
- ✅ **MEV Protection** (Jito + future threshold encryption)
- ✅ **Insurance Pool** (variance protection)

---

## 📄 License

MIT License - See [LICENSE](../LICENSE) for details.

---

---

<div align="center">

**SolanaLotto Protocol v2.0**

*Where the math finally works in your favor... sometimes.*

🎰

**Full Documentation:** [ADVANCED_FEATURES.md](./ADVANCED_FEATURES.md)

</div>