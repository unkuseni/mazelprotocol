# 📚 MazelProtocol Documentation Index

> **Complete documentation hub for MazelProtocol**

---

## 🗂️ Document Overview

| Document | Purpose | Audience |
|----------|---------|----------|
| [QUICK_START.md](./QUICK_START.md) | Fast onboarding guide | Everyone |
| [SOLANA_LOTTO.md](./SOLANA_LOTTO.md) | Main project README | Everyone |
| [WHITEPAPER.md](./WHITEPAPER.md) | Mathematical & economic foundations | Investors, Researchers |
| [TECHNICAL_SPEC.md](./TECHNICAL_SPEC.md) | Smart contract specifications | Developers |
| [ADVANCED_FEATURES.md](./ADVANCED_FEATURES.md) | Enhanced features (v2.0) | Developers, Power Users |

---

## 🎯 Quick Navigation

### For Players

**"I want to play the lottery"**
→ Start with [QUICK_START.md](./QUICK_START.md)

**"I want to understand the rolldown mechanism"**
→ Read [SOLANA_LOTTO.md § The Rolldown Mechanism](./SOLANA_LOTTO.md#-the-rolldown-mechanism)

**"I want to join a syndicate"**
→ Read [SOLANA_LOTTO.md § Syndicate System](./SOLANA_LOTTO.md#-syndicate-system)

**"I want to understand the math"**
→ Read [WHITEPAPER.md § Mathematical Foundations](./WHITEPAPER.md#3-mathematical-foundations)

---

### For Developers

**"I want to integrate with the protocol"**
→ Start with [TECHNICAL_SPEC.md § Integration Guide](./TECHNICAL_SPEC.md#9-integration-guide)

**"I want to understand the smart contracts"**
→ Read [TECHNICAL_SPEC.md § Smart Contract Specifications](./TECHNICAL_SPEC.md#4-smart-contract-specifications)

**"I want to understand the data structures"**
→ Read [TECHNICAL_SPEC.md § Data Structures](./TECHNICAL_SPEC.md#5-data-structures)

**"I want to implement advanced features"**
→ Read [ADVANCED_FEATURES.md](./ADVANCED_FEATURES.md)

---

### For Investors & Researchers

**"I want to understand the economic model"**
→ Read [WHITEPAPER.md § Economic Model](./WHITEPAPER.md#4-economic-model)

**"I want to see the game theory analysis"**
→ Read [WHITEPAPER.md § Game Theory Analysis](./WHITEPAPER.md#5-game-theory-analysis)

---

## 📋 Feature Implementation Status

### ✅ Core Features (Implemented On-Chain)

| Feature | Main Doc | Technical Spec | Status |
|---------|----------|----------------|--------|
| 6/46 Lottery (buy, bulk buy, claim) | SOLANA_LOTTO.md | TECHNICAL_SPEC.md | ✅ Complete |
| Rolldown Mechanism (soft/hard cap) | SOLANA_LOTTO.md | TECHNICAL_SPEC.md | ✅ Complete |
| Syndicate System (full CRUD + tickets + prizes) | SOLANA_LOTTO.md | TECHNICAL_SPEC.md | ✅ Complete |
| Streak Tracking | SOLANA_LOTTO.md | TECHNICAL_SPEC.md | ⚠️ Tracked only — bonus never applied to prizes |
| Switchboard Randomness (commit-reveal) | WHITEPAPER.md | TECHNICAL_SPEC.md | ✅ Complete |
| Insurance Pool System (2% allocation) | WHITEPAPER.md | TECHNICAL_SPEC.md | ✅ Complete |
| Emergency Fund Transfer (with daily cap) | TECHNICAL_SPEC.md | TECHNICAL_SPEC.md | ✅ Complete |
| Free Tickets (Match 2 credit) | SOLANA_LOTTO.md | TECHNICAL_SPEC.md | ✅ Complete |
| Two-Step Authority Transfer (propose/accept) | — | TECHNICAL_SPEC.md | ✅ Complete |
| Config Timelock (propose/execute with 24h delay) | — | TECHNICAL_SPEC.md | ✅ Complete |
| On-Chain Solvency Check (permissionless) | — | TECHNICAL_SPEC.md | ✅ Complete |
| Expired Prize Reclaim | — | TECHNICAL_SPEC.md | ✅ Complete |
| Draw Recovery (cancel_draw, force_finalize_draw) | — | TECHNICAL_SPEC.md | ✅ Complete |
| Verification Hash (tamper-resistant winner counts) | — | TECHNICAL_SPEC.md | ✅ Complete |
| Statistical Plausibility Checks | — | TECHNICAL_SPEC.md | ✅ Complete |
| **Jackpot LP Pool** | **ADVANCED_FEATURES.md §7** | **TECHNICAL_SPEC.md §6.1.14** | **✅ Complete** |

### ✅ Advanced Features (Implemented On-Chain)

| Feature | Specification | Technical Spec | Status |
|---------|---------------|----------------|--------|
| **🔒 Prize Transition System** | **Fixed → Pari-Mutuel** | **TECHNICAL_SPEC.md §12.4** | **✅ Complete** |
| Dynamic House Fee | ADVANCED_FEATURES.md §1 | TECHNICAL_SPEC.md | ✅ Complete |
| Soft/Hard Caps | ADVANCED_FEATURES.md §2 | TECHNICAL_SPEC.md | ✅ Complete |
| Quick Pick Express (separate program) | ADVANCED_FEATURES.md §5 | TECHNICAL_SPEC.md | ✅ Complete |
| Syndicate Wars (init, register, stats, finalize, prizes) | ADVANCED_FEATURES.md §6 | TECHNICAL_SPEC.md | ✅ Complete |
| **Jackpot LP Pool** (deposit, withdraw, claim rewards, seeding) | **ADVANCED_FEATURES.md §7** | **TECHNICAL_SPEC.md §6.1.14** | **✅ Complete** |

### ⚠️ Partially Implemented

| Feature | Specification | What Exists | What's Missing |
|---------|---------------|-------------|----------------|
| Streak Bonuses | SOLANA_LOTTO.md | `update_streak()` tracks streaks; `get_streak_bonus_bps()` computes bonus | Bonus is **never applied** in any prize calculation or ticket purchase |
| MEV Protection | ADVANCED_FEATURES.md §4 | Slot window tightened to 10 slots (~4s) on randomness reveal | No Jito tip integration; no threshold encryption |

### ❌ Not Yet Implemented (Design Only)

| Feature | Specification | What Exists in Code | What's Missing |
|---------|---------------|---------------------|----------------|

| Threshold Encryption MEV | ADVANCED_FEATURES.md §4.2-4.3 | Nothing | Entire feature — encrypted tickets, key management, decryption |
| Jito Integration | ADVANCED_FEATURES.md §4.4 | Nothing | Jito tip accounts, bundle integration |
| SDK (`@mazelprotocol/sdk`) | QUICK_START.md, SOLANA_LOTTO.md | Nothing | No NPM package exists; API examples in docs are aspirational |

| White-label / Cross-chain / DAO Transition | Roadmap | Nothing | Future roadmap items |

### 🗑️ Removed Features (Documented as Removed)

| Feature | Previously In | Removal Note |
|---------|---------------|--------------|
| Mega Events | ADVANCED_FEATURES.md | Removed in v2.5 |
| $LOTTO Token & Staking | WHITEPAPER.md, TECHNICAL_SPEC.md | Removed in v2.3 |
| Second Chance Draws | TECHNICAL_SPEC.md | Removed in v2.2 (struct reference cleaned up in v3.0) |

> **🔒 CRITICAL DESIGN FEATURE:** All prizes START as FIXED amounts during normal operation, then TRANSITION to PARI-MUTUEL (shared pool) during rolldown events and high-volume draws. This hybrid system ensures **operator liability is ALWAYS CAPPED** while maintaining attractive +EV windows for players.

> **🛡️ INSURANCE SYSTEM:** 2% of every ticket sale goes to an insurance pool that can be used during insolvency emergencies. Combined with the 3% reserve fund, this provides **5% total buffer** for prize pool shortfalls. Emergency fund transfers require authority approval with audit logging.

---

## 📊 Key Parameters Reference

### Main Lottery (6/46) — FIXED → PARI-MUTUEL

| Parameter | Value | Prize Mode | Location |
|-----------|-------|------------|----------|
| Ticket Price | $2.50 USDC | — | TECHNICAL_SPEC.md |
| Soft Cap | $1,750,000 | → PARI-MUTUEL | ADVANCED_FEATURES.md |
| Hard Cap | $2,250,000 | PARI-MUTUEL | ADVANCED_FEATURES.md |
| Jackpot Seed | $500,000 | — | TECHNICAL_SPEC.md |
| Dynamic Fee Range | 28% - 40% | — | ADVANCED_FEATURES.md |
| **Prize Pool Allocation** | **100% of ticket price (after fees)** | **—** | **CONSTANTS_GUIDE.md** |
| **Jackpot Allocation** | **55.6%** | **—** | **CONSTANTS_GUIDE.md** |
| **Fixed Prize Allocation** | **39.4%** | **—** | **CONSTANTS_GUIDE.md** |
| **Reserve Fund Allocation** | **3.0%** | **—** | **CONSTANTS_GUIDE.md** |
| **Insurance Pool Allocation** | **2.0%** | **—** | **CONSTANTS_GUIDE.md** |
| **Normal Mode Prizes** | **Fixed amounts** | **FIXED** | TECHNICAL_SPEC.md |
| **Rolldown Prizes** | **Pool ÷ Winners** | **PARI-MUTUEL** | WHITEPAPER.md §3.3 |

### Dynamic Fee Tiers

| Jackpot Level | Fee | Source |
|---------------|-----|--------|
| < $500k | 28% | ADVANCED_FEATURES.md §1 |
| $500k - $1M | 32% | ADVANCED_FEATURES.md §1 |
| $1M - $1.5M | 36% | ADVANCED_FEATURES.md §1 |
| > $1.5M | 40% | ADVANCED_FEATURES.md §1 |
| Rolldown | 28% | ADVANCED_FEATURES.md §1 |

### Fund Protection System

| Fund Type | Allocation | Purpose | Emergency Access |
|-----------|------------|---------|------------------|
| **Jackpot** | 55.6% | Main prize pool | Automatic during draws |
| **Fixed Prizes** | 39.4% | Match 5/4/3 prizes | Automatic during draws |
| **Reserve Fund** | 3.0% | Jackpot seeding, shortfalls | ✅ Emergency transfer |
| **Insurance Pool** | 2.0% | Insolvency protection | ✅ Emergency transfer |
| **Total Buffer** | **5.0%** | **Combined safety net** | **Multi-sig required** |

### Quick Pick Express (5/35) — FIXED → PARI-MUTUEL

> ⚠️ **$50 Gate Requirement**: Players must spend $50+ lifetime in main lottery to access.

| Parameter | Value | Prize Mode | Location |
|-----------|-------|------------|----------|
| Matrix | 5/35 (Pick 5 from 35) | — | ADVANCED_FEATURES.md §5 |
| Ticket Price | $1.50 USDC | — | ADVANCED_FEATURES.md §5 |
| Draw Frequency | Every 4 hours | — | ADVANCED_FEATURES.md §5 |
| Jackpot Odds | 1 in 324,632 | — | ADVANCED_FEATURES.md §5 |
| Jackpot Seed | $5,000 | — | ADVANCED_FEATURES.md §5 |
| Soft Cap | $30,000 | → PARI-MUTUEL | ADVANCED_FEATURES.md §5 |
| Hard Cap | $50,000 | PARI-MUTUEL | ADVANCED_FEATURES.md §5 |
| **Match 4 Prize** | $100 fixed / ~$3,247* rolldown | **FIXED → PM** | ADVANCED_FEATURES.md §5 |
| **Match 3 Prize** | $4 fixed / ~$75* rolldown | **FIXED → PM** | ADVANCED_FEATURES.md §5 |
| Match 2 Prize | No prize (no free ticket) | — | ADVANCED_FEATURES.md §5 |
| Rolldown Match 4 | 60% of jackpot pool | PARI-MUTUEL | ADVANCED_FEATURES.md §5 |
| Rolldown Match 3 | 40% of jackpot pool | PARI-MUTUEL | ADVANCED_FEATURES.md §5 |
| **🔥 Rolldown EV** | **+66.7% player edge!** | PARI-MUTUEL | ADVANCED_FEATURES.md §5 |

*\*Rolldown prizes are pari-mutuel estimates. Actual = Pool ÷ Winners. Operator liability CAPPED at jackpot amount.*

> **🔒 OPERATOR PROTECTION:** During Quick Pick rolldown, all prizes transition from FIXED to PARI-MUTUEL. Total operator liability is EXACTLY $30,000-$50,000 (the jackpot), regardless of ticket volume or winner count.


---

### Jackpot LP Pool — Revenue Sharing

| Parameter | Value | Location |
|-----------|-------|----------|
| LP Reward Share | 60% of house fees (default) | ADVANCED_FEATURES.md §7 |
| Max LP Reward Share | 80% of house fees | ADVANCED_FEATURES.md §7 |
| Withdrawal Gate | Blocked during active draw cycle | ADVANCED_FEATURES.md §7 |
| Reward Tracking | Masterchef pattern (per-share) | TECHNICAL_SPEC.md §6.1.14 |
| Instructions | deposit_lp, withdraw_lp, claim_lp_rewards, set_lp_config | TECHNICAL_SPEC.md §6.1.14 |

> 💰 PASSIVE YIELD: LPs earn a share of every ticket sold. At ~10,000 tickets/day with 60% LP share: ~$5,100/day distributed to LPs. With $5M in LP deposits, that's ~37% APY.


## 🔗 Cross-Reference Matrix

### Where to Find Specific Topics

| Topic | Primary | Secondary | Technical |
|-------|---------|-----------|-----------|
| **Odds/Probability** | WHITEPAPER §3 | SOLANA_LOTTO §Game Parameters | TECHNICAL_SPEC |
| **Expected Value** | WHITEPAPER §3.3 | ADVANCED_FEATURES §1-2 | - |
| **Prize Structure** | SOLANA_LOTTO §Prize Structure | WHITEPAPER §3 | TECHNICAL_SPEC |
| **Rolldown Mechanics** | SOLANA_LOTTO §Rolldown | ADVANCED_FEATURES §2 | TECHNICAL_SPEC |
| **Insurance System** | WHITEPAPER §8 | CONSTANTS_GUIDE §5 | TECHNICAL_SPEC §6.1.12 |
| **Emergency Procedures** | TECHNICAL_SPEC §6.1.12 | - | TECHNICAL_SPEC §12.5 |
| **Smart Contracts** | - | WHITEPAPER.md §6 | TECHNICAL_SPEC §4-6 |
| **Security** | SOLANA_LOTTO §Security | WHITEPAPER §7 | ADVANCED_FEATURES §4 |
| **MEV Protection** | - | ADVANCED_FEATURES §4 | TECHNICAL_SPEC |
| **Jackpot LP** | - | ADVANCED_FEATURES §7 | TECHNICAL_SPEC §6.1.14 |
| **SDK/API** | SOLANA_LOTTO §API | - | TECHNICAL_SPEC §9 |

---

## 📈 Implementation Roadmap

### ✅ Completed (On-Chain Programs Deployed/Deployable)
- Main lottery program: initialize, fund, buy, bulk buy, draw lifecycle, claim, syndicate, syndicate wars, admin, emergency, solvency, timelock config, authority transfer, expired prize reclaim
- Quick Pick Express program: initialize, fund, buy, draw lifecycle, claim, admin, emergency
- Dynamic house fee system ✅
- Soft/hard rolldown caps ✅
- Insurance pool system ✅
- Emergency fund transfer ✅
- Syndicate Wars competition ✅
- Quick Pick Express game ✅
- Verification hash & statistical plausibility checks ✅
- Two-step authority transfer ✅
- Config timelock (propose/execute) ✅
- On-chain solvency verification ✅
- **Jackpot LP Pool** (deposit, withdraw, claim rewards, set config, draw-cycle-gated withdrawals) ✅

### 🔜 Next Priority
- Apply streak bonus to prize calculations (logic exists, just not wired up)
- Jito MEV protection integration
- Client SDK package (`@mazelprotocol/sdk`)

### 🔮 Future
- Threshold encryption MEV protection
- White-label platform
- Cross-chain deployment
- Cross-chain deployment

---

## 📝 Document Changelog

| Version | Date | Changes |
|---------|------|---------|
| v3.0 | 2025 | **Docs audit**: Corrected implementation status for all features; marked MEV (Jito/Threshold) and SDK as NOT YET IMPLEMENTED; marked streak bonus as tracked-only |
| v3.0 | 2025 | Removed references to TOKEN MODULE, GOV MODULE, SecondChanceEntry, and separate TicketManager/DrawEngine/PrizePool programs that never existed |
| v3.0 | 2025 | Documented newly implemented features: config timelock, 2-step authority transfer, solvency check, expired prize reclaim, draw recovery, verification hash, statistical plausibility checks |
| v2.5 | 2025 | Removed Mega Events feature from all documentation and code |
| v2.4 | 2025 | Updated Quick Pick Express: 5/35 matrix, $1.50 tickets, **+67% rolldown advantage**, no free ticket, $50 gate |
| v2.3 | 2025 | Removed $LOTTO token and staking features |
| v2.2 | 2025 | Migrated from Chainlink VRF to Switchboard Randomness |
| v2.2 | 2025 | Removed Second Chance Draws feature |
| v2.2 | 2025 | Added insurance pool system (2% allocation) |
| v2.2 | 2025 | Added emergency fund transfer instruction |
| v2.2 | 2025 | Updated prize pool allocation: 55.6% jackpot, 39.4% fixed, 3% reserve, 2% insurance |
| v2.2 | 2025 | Updated solvency checks to include insurance pool |
| v2.1 | 2025 | Updated TECHNICAL_SPEC.md error codes (98 variants) to match implementation |
| v2.1 | 2025 | Updated TECHNICAL_SPEC.md data structures to match actual implementation |
| v2.1 | 2025 | Added comprehensive error handling documentation |
| v2.0 | 2025 | Added ADVANCED_FEATURES.md with 7 new feature specifications |
| v2.0 | 2025 | Updated SOLANA_LOTTO.md with dynamic fees, soft/hard caps |
| v2.0 | 2025 | Updated TECHNICAL_SPEC.md with all v2.0 data structures |
| v2.0 | 2025 | Updated QUICK_START.md with complete feature overview |
| v1.0 | 2025 | Initial documentation suite |

---

## 🔍 Search Keywords

**Economic Terms:**
- Expected Value (EV)
- House Edge
- Rolldown
- Soft Cap / Hard Cap
- Dynamic Fee
- Nash Equilibrium

**Technical Terms:**
- PDA (Program Derived Address)
- TEE (Trusted Execution Environment)
- Commit-Reveal Pattern
- MEV (Miner Extractable Value)
- Threshold Encryption
- SPL Token

**Features:**
- Quick Pick Express
- Syndicate Wars
- Syndicate Wars
- Streak Bonus
- Insurance Pool
- Emergency Fund Transfer

---

## 📞 Support & Community

| Channel | Purpose |
|---------|---------|
| [Discord](https://discord.gg/mazelprotocol) | Community chat, support |
| [Twitter](https://twitter.com/MazelProtocol) | Announcements, updates |
| [GitHub](https://github.com/mazelprotocol) | Code, issues, PRs |
| security@mazelprotocol.io | Security vulnerabilities |
| hello@mazelprotocol.io | General inquiries |

---

<div align="center">

**MazelProtocol v3.0**

*Complete documentation for the provably fair decentralized lottery protocol with transparent mechanics*

📚 **6 Documents** | 🎰 **2 On-Chain Programs (38+ instructions)** | 💰 **$34M Annual Profit Target**

> **🔒 CORE PROTECTION:** All prizes START as FIXED amounts, then TRANSITION to PARI-MUTUEL during rolldown events. Operator liability is ALWAYS CAPPED while players enjoy +EV windows.

> **🛡️ FUND PROTECTION:** 5% safety buffer (3% reserve + 2% insurance) protects against insolvency. Emergency transfers require authority approval with daily caps and full audit trail.

</div>