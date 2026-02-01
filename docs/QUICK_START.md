# SolanaLotto Quick Start Guide

> **The world's first intentionally exploitable lottery on Solana**

---

## 🚀 What is SolanaLotto?

SolanaLotto is a decentralized lottery protocol that creates **predictable windows of positive expected value (+EV)** for players. Unlike traditional lotteries where the house always wins, SolanaLotto's rolldown mechanism allows sophisticated players to profit during specific market conditions.

### The Core Innovation

SolanaLotto uses a **probabilistic rolldown system**:

| Cap | Threshold | What Happens |
|-----|-----------|--------------|
| **Soft Cap** | $1.75M | Probabilistic rolldown trigger possible each draw |
| **Hard Cap** | $2.25M | 100% of jackpot distributes (forced rolldown) |

Between $1.75M and $2.25M, each draw has a chance to trigger rolldown:
- Probability = (Jackpot - $1.75M) / ($2.25M - $1.75M)
- Increases linearly as jackpot grows
- At hard cap, probability = 100% (forced rolldown)

During full rolldown events:

- **Ticket Cost:** $2.50
- **Expected Value Range:** $2.87 to $4.06 (depends on tickets sold)
- **Player Edge:** +14.6% to +62% (optimal conditions: 475k tickets)

This isn't a bug—it's the core feature that drives engagement and volume.

> **🔒 PRIZE TRANSITION SYSTEM:** All prizes START as FIXED amounts during normal mode, then TRANSITION to PARI-MUTUEL (shared pool) during rolldown events and high-volume draws. This hybrid system ensures **operator liability is ALWAYS CAPPED** while maintaining attractive +EV windows for players.

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

### Why Pari-Mutuel Protects the Operator

During rolldown, prizes transition from fixed to pari-mutuel:
- **Total payout = EXACTLY the jackpot amount** (capped liability)
- Whether 500k or 2M tickets are sold, operator pays the same
- Player +EV is preserved through proportional distribution
- No unbounded risk regardless of volume or winner count

---

## 📦 Project Documentation

| Document | Description |
|----------|-------------|
| [SOLANA_LOTTO.md](./SOLANA_LOTTO.md) | Main README with features, prizes, and API |
| [WHITEPAPER.md](./WHITEPAPER.md) | Mathematical foundations and economic model |
| [TECHNICAL_SPEC.md](./TECHNICAL_SPEC.md) | Smart contract specs for developers |
| [ADVANCED_FEATURES.md](./ADVANCED_FEATURES.md) | Dynamic fees, Lucky Numbers NFT, MEV protection, Quick Pick Express, Mega Events, Syndicate Wars |

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

1. **Monitor Jackpot:** Watch as it grows toward the $1.75M soft cap
2. **Calculate Probability:** Use formula P = (Jackpot - $1.75M) / $0.5M when jackpot ≥ $1.75M
3. **Strategic Buying:** Buy tickets when probability of rolldown justifies expected value
4. **Maximize at Hard Cap:** Buy maximum volume during forced rolldown at $2.25M hard cap
5. **Profit:** Collect winnings from Match 3, 4, and 5 tiers during rolldowns

### Expected Value During Full Rolldown ($2.25M Hard Cap) — PARI-MUTUEL

> **🔒 PARI-MUTUEL PRIZES:** During rolldown, all prizes use shared pool distribution. Actual per-winner prizes depend on ticket volume. Estimates below assume ~475k tickets (optimal conditions).

| Match | Pool Share | Est. Prize* | Odds | EV Contribution |
|-------|------------|-------------|------|-----------------|
| 5 | 25% | ~$46,000* | 1/39,028 | $1.18 |
| 4 | 35% | ~$1,330* | 1/800 | $1.66 |
| 3 | 40% | ~$90* | 1/47 | $1.90 |
| 2 | — | $2.50 (fixed) | 1/6.8 | $0.37 |
| **Total EV** | | | | **$5.11** |

*\*Estimated prizes at 475k tickets. Actual = Pool ÷ Winners (pari-mutuel). More tickets = lower per-winner prizes.*

**Edge: $5.11 - $2.50 = +$2.61 per ticket (+104%)**

**At higher volume (700k tickets):** EV drops to ~$2.87 (+14.8% edge) — pari-mutuel naturally adjusts!

### Probabilistic Rolldown Zone

Between $1.75M and $2.25M, each draw has a chance to trigger full rolldown:
- Probability increases linearly with jackpot size
- Expected value increases as jackpot grows
- Unpredictable timing prevents calendar gaming

### Optimal Strategy

1. **Monitor jackpot growth** as it approaches $1.75M soft cap
2. **Calculate probability** of rolldown using formula: (Jackpot - $1.75M) / $0.5M
3. **Buy tickets when probability is high** for maximum +EV
4. **Buy maximum volume** during forced rolldowns at $2.25M hard cap
5. **Join syndicates** to pool capital and reduce variance
6. **Enter Syndicate Wars** for bonus prize pool (1% of monthly sales)
7. **Collect Lucky Numbers NFTs** for future jackpot bonuses

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
| **Soft Cap** | $1,750,000 (probabilistic rolldown possible) |
| **Hard Cap** | $2,250,000 (forced rolldown) |
| **Jackpot Seed** | $500,000 |
| **House Fee** | 28-40% (dynamic) |
| **Draw Frequency** | Daily (00:00 UTC) |
| **Rolldown Frequency** | ~Every 2-3 weeks |

### Quick Pick Express (5/35) — FIXED → PARI-MUTUEL

> ⚠️ **$50 Gate Requirement**: Must have spent $50+ lifetime in main lottery to access.

| Metric | Value | Prize Mode |
|--------|-------|------------|
| **Ticket Price** | $1.50 USDC | — |
| **Matrix** | 5/35 (Pick 5 from 35) | — |
| **Draw Frequency** | Every 4 hours (6x daily) | — |
| **Jackpot Odds** | 1 in 324,632 | — |
| **Jackpot Seed** | $5,000 | — |
| **Soft Cap** | $30,000 (probabilistic rolldown) | → PARI-MUTUEL |
| **Hard Cap** | $40,000 (forced rolldown) | PARI-MUTUEL |
| **Match 4 Prize** | $100 fixed / ~$3,000* rolldown | FIXED → PARI-MUTUEL |
| **Match 3 Prize** | $4 fixed / ~$74* rolldown | FIXED → PARI-MUTUEL |
| **Match 2 Prize** | No prize (no free ticket) | — |
| **Cycle Duration** | ~2-3 days | — |
| **🔥 Rolldown EV** | **+58.7% player edge!** | PARI-MUTUEL |

*\*Rolldown prizes are pari-mutuel estimates at ~12k tickets. Actual = Pool ÷ Winners.*

> **🔒 OPERATOR PROTECTION:** During Quick Pick rolldown, prizes transition to pari-mutuel. Total operator liability is CAPPED at exactly $30,000-$40,000 (the jackpot), regardless of ticket volume or winner count.

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

### 🏅 Syndicate Wars
Monthly competition for syndicates:
- Prize Pool: 1% of monthly sales (~$75k)
- Compete for best win rate
- Top 10 share the pool

### 🛡️ MEV Protection
- Jito integration prevents front-running
- Future: Threshold encryption for maximum security

### 🔒 Provably Fair Randomness
All randomness is generated using **Switchboard Randomness** with Trusted Execution Environments (TEEs):
- **TEE-based security**: Even oracle operators cannot see or manipulate randomness
- **Commit-reveal pattern**: Prevents selective revelation attacks
- **On-chain verification**: All proofs are verifiable on-chain
- **Slashing mechanism**: Misbehaving oracles lose their $SWTCH stake

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

## 🆕 What's New (v2.4)

- ✅ **Fixed → Pari-Mutuel Prize Transition** (ALL prizes start fixed, transition to pari-mutuel during rolldown to cap operator liability)
- ✅ **Quick Pick Express v2** (5/35 matrix, $1.50 tickets, **+58.7% rolldown exploit**, no free ticket, $50 gate)
- ✅ **Switchboard Randomness** (TEE-based secure randomness with commit-reveal)
- ✅ **Dynamic House Fee** (28-40% based on jackpot)
- ✅ **Soft/Hard Cap System** (prevents calendar gaming)
- ✅ **Lucky Numbers NFT** (1% future jackpot bonus)
- ✅ **Syndicate Wars** (monthly competition)
- ✅ **MEV Protection** (Jito + future threshold encryption)
- ✅ **Insurance Pool** (variance protection)

---

## 📄 License

MIT License - See [LICENSE](../LICENSE) for details.

---

---

<div align="center">

**SolanaLotto Protocol v2.4**

*Where the math finally works in your favor... sometimes.*

🎰

**Full Documentation:** [ADVANCED_FEATURES.md](./ADVANCED_FEATURES.md)

</div>