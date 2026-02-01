# 📚 SolanaLotto Documentation Index

> **Complete documentation hub for the SolanaLotto Protocol**

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

**"I want to understand the rolldown exploit"**
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

### ✅ Core Features (Documented & Specified)

| Feature | Main Doc | Technical Spec | Status |
|---------|----------|----------------|--------|
| 6/46 Lottery | SOLANA_LOTTO.md | TECHNICAL_SPEC.md | ✅ Complete |
| Rolldown Mechanism | SOLANA_LOTTO.md | TECHNICAL_SPEC.md | ✅ Complete |
| Syndicate System | SOLANA_LOTTO.md | TECHNICAL_SPEC.md | ✅ Complete |
| Streak Bonuses | SOLANA_LOTTO.md | TECHNICAL_SPEC.md | ✅ Complete |
| Switchboard Randomness | WHITEPAPER.md | TECHNICAL_SPEC.md | ✅ Complete |

### ✅ Advanced Features (v2.0 - Documented & Specified)

| Feature | Specification | Technical Spec | Status |
|---------|---------------|----------------|--------|
| **🔒 Prize Transition System** | **Fixed → Pari-Mutuel** | **TECHNICAL_SPEC.md §12.4** | **✅ Complete** |
| Dynamic House Fee | ADVANCED_FEATURES.md §1 | TECHNICAL_SPEC.md | ✅ Complete |
| Soft/Hard Caps | ADVANCED_FEATURES.md §2 | TECHNICAL_SPEC.md | ✅ Complete |
| Lucky Numbers NFT | ADVANCED_FEATURES.md §3 | TECHNICAL_SPEC.md | ✅ Complete |
| MEV Protection | ADVANCED_FEATURES.md §4 | TECHNICAL_SPEC.md | ✅ Complete |
| Quick Pick Express | ADVANCED_FEATURES.md §5 | TECHNICAL_SPEC.md | ✅ Complete |
| Syndicate Wars | ADVANCED_FEATURES.md §6 | TECHNICAL_SPEC.md | ✅ Complete |

> **🔒 CRITICAL DESIGN FEATURE:** All prizes START as FIXED amounts during normal operation, then TRANSITION to PARI-MUTUEL (shared pool) during rolldown events and high-volume draws. This hybrid system ensures **operator liability is ALWAYS CAPPED** while maintaining attractive +EV windows for players.

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
| Hard Cap | $40,000 | PARI-MUTUEL | ADVANCED_FEATURES.md §5 |
| **Match 4 Prize** | $100 fixed / ~$3,000* rolldown | **FIXED → PM** | ADVANCED_FEATURES.md §5 |
| **Match 3 Prize** | $4 fixed / ~$74* rolldown | **FIXED → PM** | ADVANCED_FEATURES.md §5 |
| Match 2 Prize | No prize (no free ticket) | — | ADVANCED_FEATURES.md §5 |
| Rolldown Match 4 | 60% of jackpot pool | PARI-MUTUEL | ADVANCED_FEATURES.md §5 |
| Rolldown Match 3 | 40% of jackpot pool | PARI-MUTUEL | ADVANCED_FEATURES.md §5 |
| **🔥 Rolldown EV** | **+58.7% player edge!** | PARI-MUTUEL | ADVANCED_FEATURES.md §5 |

*\*Rolldown prizes are pari-mutuel estimates. Actual = Pool ÷ Winners. Operator liability CAPPED at jackpot amount.*

> **🔒 OPERATOR PROTECTION:** During Quick Pick rolldown, all prizes transition from FIXED to PARI-MUTUEL. Total operator liability is EXACTLY $30,000-$40,000 (the jackpot), regardless of ticket volume or winner count.

### Mega Events (Quarterly)

| Parameter | Value | Location |
|-----------|-------|----------|
| Ticket Price | $10 USDC | ADVANCED_FEATURES.md §6 |
| Matrix | 6/49 | ADVANCED_FEATURES.md §6 |
| Target Jackpot | $5,000,000 | ADVANCED_FEATURES.md §6 |

---

## 🔗 Cross-Reference Matrix

### Where to Find Specific Topics

| Topic | Primary | Secondary | Technical |
|-------|---------|-----------|-----------|
| **Odds/Probability** | WHITEPAPER §3 | SOLANA_LOTTO §Game Parameters | TECHNICAL_SPEC |
| **Expected Value** | WHITEPAPER §3.3 | ADVANCED_FEATURES §1-2 | - |
| **Prize Structure** | SOLANA_LOTTO §Prize Structure | WHITEPAPER §3 | TECHNICAL_SPEC |
| **Rolldown Mechanics** | SOLANA_LOTTO §Rolldown | ADVANCED_FEATURES §2 | TECHNICAL_SPEC |
| **Smart Contracts** | - | WHITEPAPER.md §6 | TECHNICAL_SPEC §4-6 |
| **Security** | SOLANA_LOTTO §Security | WHITEPAPER §7 | ADVANCED_FEATURES §4 |
| **MEV Protection** | - | ADVANCED_FEATURES §4 | TECHNICAL_SPEC |
| **SDK/API** | SOLANA_LOTTO §API | - | TECHNICAL_SPEC §9 |

---

## 📈 Implementation Roadmap

From [ADVANCED_FEATURES.md §8](./ADVANCED_FEATURES.md#8-implementation-priority):

### Phase 1: Security & Core (Months 1-2)
- Jito MEV protection
- Dynamic house fee system
- Soft/hard rolldown caps

### Phase 2: Engagement (Months 3-5)
- Syndicate Wars competition
- Quick Pick Express game
- Enhanced dashboards

### Phase 3: Premium Features (Months 6-9)
- Lucky Numbers NFT system
- Advanced MEV protection (Threshold Encryption)

### Phase 4: Scale (Months 10-12)
- White-label platform
- Cross-chain deployment
- DAO transition

---

## 📝 Document Changelog

| Version | Date | Changes |
|---------|------|---------|
| v2.4 | 2025 | Updated Quick Pick Express: 5/35 matrix, $1.50 tickets, **+59% rolldown exploit**, no free ticket, $50 gate |
| v2.3 | 2025 | Removed $LOTTO token and staking features |
| v2.2 | 2025 | Migrated from Chainlink VRF to Switchboard Randomness |
| v2.2 | 2025 | Removed Second Chance Draws feature |
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
- Lucky Numbers NFT
- Quick Pick Express
- Syndicate Wars
- Streak Bonus

---

## 📞 Support & Community

| Channel | Purpose |
|---------|---------|
| [Discord](https://discord.gg/solanalotto) | Community chat, support |
| [Twitter](https://twitter.com/SolanaLotto) | Announcements, updates |
| [GitHub](https://github.com/solanalotto) | Code, issues, PRs |
| security@solanalotto.io | Security vulnerabilities |
| hello@solanalotto.io | General inquiries |

---

<div align="center">

**SolanaLotto Protocol v2.4**

*Complete documentation for the world's first intentionally exploitable lottery*

📚 **5 Documents** | 🎰 **7 Advanced Features** | 💰 **$12.3M Annual Profit Target**

> **🔒 CORE PROTECTION:** All prizes START as FIXED amounts, then TRANSITION to PARI-MUTUEL during rolldown events. Operator liability is ALWAYS CAPPED while players enjoy +EV windows.

</div>