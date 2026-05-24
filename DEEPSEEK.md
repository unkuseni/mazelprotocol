# DeepSeek.md — MazelProtocol

> Project-specific guidance for DeepSeek coding agents working on MazelProtocol.

## Project Identity

**MazelProtocol** is a decentralized, provably fair lottery protocol on Solana. It features two on-chain programs (Main Lottery 6/46 and Quick Pick Express 5/35), a TanStack Start + React frontend, and a Cloudflare Worker draw-lifecycle bot. The protocol uses Switchboard TEE-based randomness with a commit-reveal pattern and a unique probabilistic rolldown system that creates predictable +EV windows for players.

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Smart Contracts | Anchor (Solana) | 0.32.1 |
| Rust Toolchain | rustc | 1.89.0 |
| Frontend Framework | TanStack Start + React | 1.132.0 / 19.2.0 |
| Styling | Tailwind CSS | 4.0.6 |
| State Management | TanStack Query | 5.90.20 |
| Wallet Integration | Reown AppKit | 1.8.17 |
| Bot Runtime | Cloudflare Workers | wrangler 4.x / 3.x |
| Randomness Oracle | Switchboard On-Demand | 0.11.3 |
| Smart Contract Deps | anchor-spl, sha2 | — |
| Testing (Rust) | Anchor test framework | — |
| Testing (TS) | Vitest (app), mocha (root) | 3.x / 10.x |
| Package Manager | pnpm (app, bot), yarn (root) | — |
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
├── bot/                     # Cloudflare Worker draw-lifecycle bot
│   └── src/
│       ├── worker.ts         # Worker entry point
│       ├── draw-executor.ts  # Draw phase execution (commit → execute → finalize)
│       ├── indexer.ts        # On-chain event indexing
│       ├── telegram.ts       # Telegram notification integration
│       ├── config.ts         # Bot configuration
│       ├── logger.ts         # Structured logging
│       └── env.ts            # Environment variable validation
├── tests/                   # TypeScript integration tests (mocha)
├── migrations/              # Deployment and verification scripts
├── docs/                    # Whitepaper, specs, guides
├── Anchor.toml              # Anchor workspace configuration
├── Cargo.toml               # Rust workspace manifest
├── rust-toolchain.toml      # Pinned Rust toolchain (1.89.0)
└── package.json             # Root package (yarn) — Anchor test scripts
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

# Run specific test file
yarn test tests/mazelprotocol.ts
yarn test tests/quickpick.ts

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

### Bot (from `bot/`)

```bash
cd bot

# Install dependencies
pnpm install

# Start local development (wrangler dev)
pnpm dev

# Type-check
pnpm typecheck

# Deploy
pnpm deploy

# Deploy to staging
pnpm deploy:staging

# Deploy to production
pnpm deploy:production

# Set secrets
pnpm secret:keypair
pnpm secret:telegram-token
pnpm secret:telegram-chat

# View logs
pnpm tail
```

### Root (yarn)

```bash
# Install root dependencies (Anchor test runner)
yarn install

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
| `bot/wrangler.toml` | Cloudflare Worker config for the draw bot |
| `bot/src/worker.ts` | Bot entry point — CRON-triggered draw lifecycle |
| `bot/src/draw-executor.ts` | Core draw logic: commit → execute → index → finalize |
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
- **Cloudflare Workers** with CRON triggers for scheduled draw execution
- **KV namespace** (`DRAW_STATE`) for persistent draw state
- **Telegram integration** for real-time operator notifications
- Handles both Main Lottery and Quick Pick Express draw lifecycles
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
