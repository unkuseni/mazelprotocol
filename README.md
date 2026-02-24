# MazelProtocol - The First Intentionally Exploitable Lottery on Solana

[![Anchor](https://img.shields.io/badge/Anchor-v0.32.1-8C2CE0)](https://www.anchor-lang.com/)
[![Solana](https://img.shields.io/badge/Solana-1.91.0-00FFA3)](https://solana.com/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**MazelProtocol** is a decentralized lottery protocol that creates predictable windows of **positive expected value (+EV)** for players through sophisticated probabilistic rolldown mechanics. Unlike traditional lotteries where the house always wins, MazelProtocol's unique economic model allows players to profit during specific market conditions.

## 🚀 The Core Innovation

### Probabilistic Rolldown System

MazelProtocol introduces a revolutionary cap-based system that triggers rolldown events:

| Cap | Threshold | What Happens |
|-----|-----------|--------------|
| **Soft Cap** | $1.75M | Probabilistic rolldown trigger possible each draw |
| **Hard Cap** | $2.25M | 100% of jackpot distributes (forced rolldown) |

Between $1.75M and $2.25M, each draw has a chance to trigger rolldown:
- **Probability = (Jackpot - $1.75M) / ($2.25M - $1.75M)**
- Increases linearly as jackpot grows
- At hard cap, probability = 100% (forced rolldown)

### Hybrid Prize System: Fixed → Pari-Mutuel

All prizes **START as FIXED amounts** during normal mode, then **TRANSITION to PARI-MUTUEL** (shared pool) during rolldown events and high-volume draws. This hybrid system ensures:

- ✅ **Operator liability is ALWAYS CAPPED**
- ✅ **Attractive +EV windows for players**
- ✅ **No unbounded risk regardless of volume**

### Dynamic House Fee

Fees scale with jackpot excitement to maintain sustainability:

| Jackpot Level | House Fee |
|---------------|-----------|
| < $500k | 28% |
| $500k - $1M | 32% |
| $1M - $1.5M | 36% |
| > $1.5M | 40% |
| Rolldown | 28% |

## 📦 Project Structure

```
mazelprotocol/
├── programs/                    # Solana smart contracts
│   ├── mazelprotocol/          # Main lottery program (6/46 matrix)
│   └── quickpick/              # Quick Pick Express program (5/35 matrix)
├── app/                        # Web frontend (TanStack + React)
├── bot/                        # Draw lifecycle bot (Cloudflare Worker)
├── tests/                      # Integration tests
├── migrations/                 # Deployment scripts
├── docs/                       # Comprehensive documentation
└── node_modules/               # Dependencies
```

## 🎯 Two On-Chain Programs

### 1. Main Lottery (6/46 Matrix)
- **Ticket Price:** $2.50 USDC
- **Matrix:** Pick 6 numbers from 1-46
- **Jackpot Odds:** 1 in 9,366,819
- **Draw Frequency:** Daily (00:00 UTC)
- **Jackpot Seed:** $500,000
- **Soft Cap:** $1,750,000
- **Hard Cap:** $2,250,000

### 2. Quick Pick Express (5/35 Matrix)
- **Ticket Price:** $1.50 USDC
- **Matrix:** Pick 5 numbers from 1-35
- **Draw Frequency:** Every 4 hours (6x daily)
- **Jackpot Odds:** 1 in 324,632
- **Jackpot Seed:** $5,000
- **Soft Cap:** $30,000
- **Hard Cap:** $50,000
- **$50 Gate Requirement:** Must have spent $50+ lifetime in main lottery

## ✨ Key Features

### ✅ Fully Implemented
- **Fixed → Pari-Mutuel Prize Transition** - Capped operator liability with +EV windows
- **Switchboard Randomness** - TEE-based secure randomness with commit-reveal pattern
- **Syndicate Support** - Group buying with automatic prize splitting
- **Syndicate Wars** - Monthly competition with 1% prize pool
- **Dynamic House Fee** - Scales 28-40% based on jackpot level
- **Insurance Pool** - 2% allocation with daily claim caps
- **Config Timelock** - 24-hour propose→execute flow for upgrades
- **Two-Step Authority Transfer** - Propose→accept prevents accidental loss
- **Solvency Verification** - Anyone can verify, auto-pauses on mismatch
- **Expired Prize Reclaim** - Unclaimed prizes sweep after 90 days

### 🚧 Partially Implemented
- **Streak Tracking** - Streaks tracked but bonuses not yet applied
- **MEV Protection** - Slot window tightened to ~4s (no Jito integration yet)

### 📋 Design Phase
- **Threshold Encryption** - Encrypted tickets for MEV protection

## 🚀 Getting Started

### Prerequisites
- [Rust](https://rustup.rs/) (latest stable)
- [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools)
- [Anchor CLI](https://www.anchor-lang.com/docs/installation)
- [Node.js](https://nodejs.org/) 18+ and pnpm/yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/mazelprotocol/mazelprotocol.git
cd mazelprotocol

# Install dependencies
pnpm install  # or yarn install

# Build the programs
anchor build

# Generate TypeScript IDL
anchor idl generate -f target/idl/solana_lotto.json
anchor idl generate -f target/idl/quickpick.json
```

### Local Development

```bash
# Start local Solana validator
solana-test-validator

# Deploy programs locally
anchor deploy

# Run tests
anchor test
```

## 🌐 Running the Frontend

The web application is built with TanStack Router and React:

```bash
cd app
pnpm install    # Install frontend dependencies
pnpm dev        # Start development server
```

The frontend will be available at `http://localhost:5173`.

### Frontend Features
- **Wallet Integration**: Connect Phantom, Solflare, Backpack, and other Solana wallets
- **Ticket Purchase**: Interactive number selection or Quick Pick
- **Syndicate Management**: Create, join, and manage syndicates
- **Prize Claims**: View and claim winnings
- **Live Draw Results**: Real-time draw updates
- **Statistics**: Player stats and jackpot tracking

## 🤖 Running the Bot

The Cloudflare Worker bot handles the complete draw lifecycle for both lotteries:

```bash
cd bot
pnpm install    # Install bot dependencies
pnpm dev        # Start development server (requires Cloudflare account)
```

### Bot Configuration
1. **Set up Cloudflare Workers**: Create a Workers account and KV namespace
2. **Configure Secrets**: Set required environment variables:
   ```bash
   pnpm run secret:keypair          # Authority keypair (JSON)
   pnpm run secret:telegram-token   # Telegram bot token
   pnpm run secret:telegram-chat    # Telegram chat ID
   ```
3. **Deploy**: `pnpm run deploy`

### Bot Responsibilities
- **Commit Phase**: Request randomness from Switchboard
- **Execute Phase**: Reveal randomness and determine winners  
- **Finalize Phase**: Distribute prizes and prepare next draw
- **Telegram Notifications**: Real-time updates for draws
- **Error Recovery**: Handle failed draws and timeouts

## 🧪 Testing

The project includes comprehensive integration tests:

```bash
# Run all tests
anchor test

# Run main lottery tests
yarn test tests/mazelprotocol.ts

# Run Quick Pick tests
yarn test tests/quickpick.ts
```



## 🏗️ Architecture

### Smart Contract Structure

```
src/
├── lib.rs                      # Program entry point and instruction declarations
├── constants.rs                # Constants (caps, fees, prizes)
├── errors.rs                   # Custom error definitions
├── events.rs                   # Event definitions for indexing
├── state/                      # Account structs
│   ├── mod.rs
│   ├── lottery_state.rs        # Global configuration
│   ├── draw_result.rs          # Draw results and winners
│   ├── ticket_data.rs          # Individual tickets
│   └── user_stats.rs           # Player statistics
└── instructions/               # Instruction handlers
    ├── admin.rs                # Pause/unpause, config updates
    ├── buy_ticket.rs           # Single ticket purchase
    ├── buy_bulk.rs             # Bulk ticket purchase (up to 50)
    ├── claim_prize.rs          # Prize claiming
    ├── syndicate.rs            # Syndicate operations
    ├── syndicate_wars.rs       # Monthly competition
    └── initialize.rs           # Program initialization
```

### Key Accounts

- **`LotteryState`** - Global configuration and state (PDA: `["lottery"]`)
- **`DrawResult`** - Results of each draw (PDA: `["draw", draw_number]`)
- **`TicketData`** - Individual ticket with numbers (PDA: `["ticket", user, ticket_id]`)
- **`UserStats`** - Player statistics (PDA: `["user_stats", user]`)
- **`Syndicate`** - Group buying pool (PDA: `["syndicate", creator]`)

## 📊 Expected Value Analysis

### During Full Rolldown ($2.25M Hard Cap)

> Assuming ~475k tickets sold (optimal conditions)

| Match | Pool Share | Est. Prize* | Odds | EV Contribution |
|-------|------------|-------------|------|-----------------|
| 5 | 25% | ~$46,000* | 1/39,028 | $1.18 |
| 4 | 35% | ~$1,330* | 1/800 | $1.66 |
| 3 | 40% | ~$90* | 1/47 | $1.90 |
| 2 | — | $2.50 (fixed) | 1/6.8 | $0.37 |
| **Total EV** | | | | **$5.11** |

**Edge: $5.11 - $2.50 = +$2.61 per ticket (+104%)**

*\*Pari-mutuel prizes: Actual = Pool ÷ Winners. More tickets = lower per-winner prizes.*

### Quick Pick Express Rolldown ($50k Hard Cap)

| Match | Pool Share | Est. Prize* | Odds | EV Contribution |
|-------|------------|-------------|------|-----------------|
| 4 | 50% | ~$3,247* | 1/2,165 | $1.50 |
| 3 | 50% | ~$75* | 1/72 | $1.04 |
| **Total EV** | | | | **$2.54** |

**Edge: $2.54 - $1.50 = +$1.04 per ticket (+69.3%)**

## 🔧 For Developers

### Program IDs

```typescript
// Localnet
export const MAZELPROTOCOL_PROGRAM_ID = new PublicKey(
  "7WyaHk2u8AgonsryMpnvbtp42CfLJFPQpyY5p9ys6FiF"
);

export const QUICKPICK_PROGRAM_ID = new PublicKey(
  "7XC1KT5mvsHHXbR2mH6er138fu2tJ4L2fAgmpjLnnZK2"
);
```

### Example: Buying a Ticket

```typescript
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { IDL } from './idl/solana_lotto';

const connection = new Connection('https://api.devnet.solana.com');
const wallet = /* your wallet */;
const provider = new AnchorProvider(connection, wallet, {});
const program = new Program(IDL, PROGRAM_ID, provider);

// Buy a ticket
const tx = await program.methods
  .buyTicket({
    numbers: [7, 14, 21, 28, 35, 42],
    useFreeTicket: false,
  })
  .accounts({
    lotteryState: lotteryStatePda,
    user: wallet.publicKey,
    ticketData: ticketPda,
    // ... other required accounts
  })
  .rpc();

console.log('Ticket purchased:', tx);
```

## 📚 Documentation

Comprehensive documentation is available in the `docs/` directory:

| Document | Description |
|----------|-------------|
| [QUICK_START.md](docs/QUICK_START.md) | Getting started guide for all users |
| [WHITEPAPER.md](docs/WHITEPAPER.md) | Mathematical foundations and economic model |
| [TECHNICAL_SPEC.md](docs/TECHNICAL_SPEC.md) | Smart contract specifications |
| [ADVANCED_FEATURES.md](docs/ADVANCED_FEATURES.md) | Advanced features and implementation details |
| [SOLANA_LOTTO.md](docs/SOLANA_LOTTO.md) | Main lottery documentation |
| [CONSTANTS_GUIDE.md](docs/CONSTANTS_GUIDE.md) | Constants reference guide |

## 🔒 Security

### Provably Fair Randomness
- **Switchboard TEEs**: Trusted Execution Environment security
- **Commit-Reveal Pattern**: Prevents selective revelation attacks
- **On-Chain Verification**: All proofs verifiable on-chain
- **Oracle Slashing**: Misbehaving oracles lose $SWTCH stake

### Security Features
- Two-step authority transfer (propose/accept)
- 24-hour config timelock
- Permissionless solvency verification
- Statistical plausibility checks
- Draw timeout recovery mechanism
- Per-user ticket limits

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ⚠️ Risk Disclaimer

**This is gambling.** Most players will lose money over time. The rolldown exploit requires:
- Significant capital (recommended $1,000+ for meaningful exploitation)
- Correct timing (monitor soft cap zone and hard cap approach)
- Acceptance of variance (even +EV bets can lose short-term)
- Understanding of the dynamic fee system

Only play with money you can afford to lose. Verify your local laws before participating.

---

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

## 📞 Support

- **Website**: https://mazelprotocol.io
- **Documentation**: https://docs.mazelprotocol.io
- **Discord**: https://discord.gg/mazelprotocol
- **Twitter**: https://twitter.com/MazelProtocol
- **GitHub**: https://github.com/mazelprotocol
- **Security**: security@mazelprotocol.io

---

<div align="center">

**MazelProtocol v3.0**

*Where the math finally works in your favor... sometimes.*

🎰 **2 On-Chain Programs** | **38+ Instructions** | **Full Syndicate & Syndicate Wars Support**

</div>