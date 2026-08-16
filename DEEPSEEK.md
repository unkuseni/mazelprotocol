# DeepSeek.md — MazelProtocol

> Project-specific guidance for DeepSeek coding agents working on MazelProtocol.

## Project Identity

**MazelProtocol** is a decentralized, provably fair lottery protocol on Solana. It features two on-chain programs (Main Lottery 6/46 and Quick Pick Express 5/35), a TanStack Start + React frontend, and two Rust bot binaries (draw lifecycle orchestrator and customer-facing Telegram bot). The protocol uses Switchboard TEE-based randomness with a commit-reveal pattern and a unique probabilistic rolldown system that creates predictable +EV windows for players.

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Smart Contracts | Anchor (Solana) | 0.32.1 |
| Rust Toolchain | rustc | 1.89.0 |
| Frontend Framework | TanStack Start + React | 1.132.0 / 19.2.0 |
| Styling | Tailwind CSS | 4.0.6 |
| State Management | TanStack Query | 5.90.20 |
| Wallet Integration | Reown AppKit | 1.8.17 |
| Bot Runtime | Rust (tokio) | 1.89.0 |
| Randomness Oracle | Switchboard On-Demand | 0.11.3 |
| Smart Contract Deps | anchor-spl, sha2 | — |
| Testing (Rust) | Anchor test framework | — |
| Testing (TS) | Vitest (app), mocha (root) | 3.x / 10.x |
| Package Manager | pnpm (app), npm (root — package-lock.json; bun.lock also present) | — |
| Linting/Formatting | Biome (app), rustfmt + clippy (Rust) | — |

## Key Directories

```
mazelprotocol/
├── programs/
│   ├── mazelprotocol/       # Main lottery (6/46 matrix) — Anchor program
│   └── quickpick/           # Quick Pick Express (5/35 matrix) — Anchor program
├── app/                     # TanStack Start + React frontend
│   └── src/
│       ├── routes/           # File-based routes (TanStack Router)
│       ├── components/       # Reusable UI components
│       ├── hooks/            # Custom React hooks
│       ├── integrations/     # Third-party integrations (Reown, etc.)
│       └── lib/              # Shared utilities
├── bot-rust/                 # Draw lifecycle bot (Rust binary)
│   └── src/
│       ├── main.rs           # CLI entry point (clap)
│       ├── bot.rs            # Orchestrator (cron + HTTP)
│       ├── config.rs         # BotConfig, PDA derivation, on-chain constants
│       ├── store.rs          # JSON file persistence (draw state, stats)
│       ├── telegram.rs       # Telegram notification client
│       ├── indexer.rs        # Ticket indexer + SHA256 verification hash
│       └── draw/
│           ├── mod.rs        # Lifecycle orchestration (main + QP)
│           ├── commit.rs     # Phase 1: commit_randomness
│           ├── execute.rs    # Phase 2: execute_draw
│           ├── finalize.rs   # Phase 4: finalize_draw
│           └── recovery.rs   # Stuck draw recovery
├── customer-bot-rust/        # Customer-facing Telegram bot (Rust binary)
│   └── src/
│       ├── main.rs           # CLI (webhook or polling mode)
│       ├── solana.rs         # RPC queries (fetch state, draw results)
│       ├── telegram.rs       # Telegram API (polling + webhook)
│       ├── store.rs          # User registration store
│       └── commands/mod.rs   # All command handlers
├── tests/                   # TypeScript integration tests (mocha)
├── migrations/              # Deployment and verification scripts
├── docs/                    # Whitepaper, specs, guides
├── Anchor.toml              # Anchor workspace configuration
├── Cargo.toml               # Rust workspace manifest
├── rust-toolchain.toml      # Pinned Rust toolchain (1.89.0)
└── package.json             # Root package (npm) — Anchor test scripts
```

## Naming Conventions

| Context | Convention | Examples |
|---------|-----------|----------|
| Rust (programs) | `snake_case` | `lottery_state`, `buy_ticket`, `DrawResult` (PascalCase for types) |
| TypeScript (app, bot, tests) | `camelCase` | `useWallet`, `fetchDrawResults`, `UserStats` (PascalCase for types/interfaces) |
| Files (all) | `kebab-case` or `snake_case` (match existing) | `draw-executor.ts`, `buy_ticket.rs`, `user-stats.ts` |
| Directories | `kebab-case` or `snake_case` | `programs/mazelprotocol`, `app/src/components` |
| Database tables | `snake_case`, plural | (N/A — fully on-chain) |
| API endpoints | `kebab-case`, plural nouns | `/api/v1/draws`, `/api/v1/tickets` |
| Constants (Rust) | `UPPER_SNAKE_CASE` | `MAX_TICKETS_PER_USER`, `SOFT_CAP_THRESHOLD` |
| Constants (TS) | `UPPER_SNAKE_CASE` | `MAZELPROTOCOL_PROGRAM_ID`, `QUICKPICK_PROGRAM_ID` |
| Environment variables | `UPPER_SNAKE_CASE` | `VITE_SOLANA_RPC_URL`, `NODE_ENV`, `REOWN_PROJECT_ID` |
| Anchor PDA seeds | `snake_case` strings | `b"lottery"`, `b"draw"`, `b"ticket"` |

## Development Commands

### Rust / Anchor (from project root)

```bash
# Check Rust toolchain (pinned to 1.89.0)
rustup show

# Build all Anchor programs
anchor build

# Run all integration tests (local validator)
anchor test

# Run a single test file (the root `npm test` script always runs tests/**/*.ts,
# so use ts-mocha directly for one file)
npx ts-mocha -p ./tsconfig.json -t 1000000 tests/mazelprotocol.ts
npx ts-mocha -p ./tsconfig.json -t 1000000 tests/quickpick.ts

# Format Rust code
cargo fmt --all

# Lint Rust code
cargo clippy --all -- -D warnings

# Type-check Rust code
cargo check --all

# Deploy programs to localnet
anchor deploy

# Generate TypeScript IDLs
anchor idl generate -f target/idl/mazelprotocol.json
anchor idl generate -f target/idl/quickpick.json
```

### Frontend (from `app/`)

```bash
cd app

# Install dependencies
pnpm install

# Start development server (port 3000)
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm serve

# Run tests
pnpm test

# Type-check
pnpm exec tsc --noEmit

# Lint with Biome
pnpm exec biome check src/

# Format with Biome
pnpm exec biome format src/ --write

# Deploy to Cloudflare
pnpm deploy

# Generate Cloudflare types
pnpm cf-typegen
```

### Bot (Rust binaries)

```bash
# Draw lifecycle bot
cd bot-rust
cargo build --release
cargo run --release -- --dry-run true --help
cargo test

# Customer bot (polling mode)
cd customer-bot-rust
cargo run --release -- --telegram-bot-token <TOKEN> --mode polling

# Customer bot (webhook mode)
cargo run --release -- --telegram-bot-token <TOKEN> --mode webhook --webhook-url https://my-bot.example.com
```

### Root (npm)

```bash
# Install root dependencies (Anchor test runner)
npm install

# Run integration tests via Anchor
anchor test
```

## Important Files

| File | Purpose |
|------|---------|
| `Anchor.toml` | Anchor workspace config, program IDs, test scripts |
| `Cargo.toml` | Rust workspace — lists all program crates |
| `rust-toolchain.toml` | Pins Rust version to 1.89.0 with rustfmt + clippy |
| `app/vite.config.ts` | Vite config with TanStack Start + Tailwind plugins |
| `app/wrangler.jsonc` | Cloudflare Worker config for the frontend app |
| `app/src/env.ts` | Environment variable validation (t3-oss/env-core + Zod) |
| `app/src/router.tsx` | TanStack Router configuration |
| `app/src/routeTree.gen.ts` | Auto-generated route tree — **never edit manually** |
| `bot-rust/src/main.rs` | Draw bot CLI entry point — clap arg parsing |
| `bot-rust/src/bot.rs` | Orchestrator: cron scheduler + HTTP health/admin server |
| `bot-rust/src/draw/mod.rs` | Core draw lifecycle: commit → execute → index → finalize |
| `bot-rust/src/indexer.rs` | Ticket scanning + winner counting + SHA256 verification hash |
| `bot-rust/src/config.rs` | BotConfig, PDA derivation, on-chain constants |
| `customer-bot-rust/src/main.rs` | Customer bot CLI entry point |
| `customer-bot-rust/src/commands/mod.rs` | All Telegram command handlers |
| `programs/mazelprotocol/src/lib.rs` | Main lottery program entry point |
| `programs/quickpick/src/lib.rs` | Quick Pick program entry point |
| `tests/mazelprotocol.ts` | Main lottery integration tests |
| `tests/quickpick.ts` | Quick Pick integration tests |

## Architecture Notes

### Solana Program Architecture
- Both programs use the **Anchor framework** with standard PDA derivation
- **Commit-reveal randomness**: `commit_randomness` → `execute_draw` → `finalize_draw`
- All instructions go through `lib.rs` → `instructions/` module dispatch
- State account structs live in `state.rs` (single file per program)
- Error codes are centralized in `errors.rs`
- Constants and validation helpers in `constants.rs`

### Frontend Architecture
- **TanStack Start** with file-based routing in `app/src/routes/`
- **TanStack Query** for all server-state (API calls, blockchain data)
- **Reown AppKit** for Solana wallet connections
- **tRPC** integration available for API calls
- Environment variables validated at startup via `@t3-oss/env-core` + Zod
- Auto-generated `routeTree.gen.ts` is read-only (configured in `.vscode/settings.json`)

### Bot Architecture
- **Native Rust binaries** with tokio async runtime
- **Built-in cron scheduler** for draw polling (every 60 seconds)
- **Built-in HTTP server** for health checks and admin endpoints
- **File-based persistence** (JSON) for draw state and bot statistics
- **Telegram integration** for real-time operator notifications and customer commands
- Handles both Main Lottery and Quick Pick Express draw lifecycles
- **Draw state persisted after each phase** for crash recovery
- Permissionless fallback: `advance_draw` after 30-minute timeout

## Code Quality Standards

### Rust
- Never use `.unwrap()` in library/production code — use `?` or proper error handling
- All public structs derive `Debug`, `Clone`, `PartialEq` where appropriate
- Run `cargo fmt --check` and `cargo clippy -- -D warnings` before committing
- Anchor-specific: use `#[account(...)]` constraints for all account validation
- Use `require!()` macro for input validation in instruction handlers

### TypeScript
- Strict mode enabled in all `tsconfig.json` files
- Never use `any` — use `unknown` and narrow types
- Use Zod for runtime validation at system boundaries
- Use `import type` for type-only imports
- All environment variables validated through `env.ts` schemas
- Biome for formatting and linting (configured in `app/biome.json`)

### General
- No hardcoded secrets, API keys, or credentials
- Environment variables use `.env.example` / `.dev.vars.example` patterns
- All file endings with newline, no trailing whitespace
- Comments explain **why**, not **what**

## Testing Strategy

- **Unit tests**: Co-located with source (Rust `#[cfg(test)]` modules, TS `*.test.ts`)
- **Integration tests**: Root `tests/` directory (TypeScript, run via `anchor test`)
- **Frontend tests**: Vitest in `app/` directory
- Test against local validator (`solana-test-validator`) for Anchor tests
- Mock external services (Switchboard oracles) in integration tests

## Common Pitfalls to Avoid

- ❌ Don't edit `app/src/routeTree.gen.ts` — it's auto-generated
- ❌ Don't commit `.env` or `.dev.vars` files (only `.example` variants)
- ❌ Don't use `unwrap()` in Anchor instruction handlers
- ❌ Don't hardcode program IDs outside of config (use `declare_id!()` in Rust, constants in TS)
- ❌ Don't assume the bot is the only draw executor — `advance_draw` is permissionless
- ❌ Don't forget PDA seed ordering — it must match on-chain derivation exactly
- ❌ Don't use `any` in TypeScript — the project has strict mode enabled
- ❌ Don't deploy without running `anchor test` and `pnpm typecheck`
