/**
 * Database schema + default game configurations.
 * Uses libSQL (Turso) via @libsql/client — works with a local file or a
 * remote Turso database.
 */
import type { Client } from '@libsql/client';
import type { GameConfig } from '../types';

export const DDL = `
CREATE TABLE IF NOT EXISTS game_config (
  game                    TEXT PRIMARY KEY,
  ticket_price_usdc       INTEGER NOT NULL,
  numbers_per_ticket      INTEGER NOT NULL,
  max_number              INTEGER NOT NULL,
  draw_interval_s         INTEGER NOT NULL,
  sale_cutoff_s           INTEGER NOT NULL,
  min_draw_interval_s     INTEGER NOT NULL,
  sale_target_tickets     INTEGER NOT NULL DEFAULT 0,
  seed_amount_usdc        INTEGER NOT NULL,
  soft_cap_usdc           INTEGER NOT NULL,
  hard_cap_usdc           INTEGER NOT NULL,
  fee_tiers               TEXT NOT NULL,
  fee_rolldown_bps        INTEGER NOT NULL,
  allocations             TEXT NOT NULL,
  fixed_prizes            TEXT NOT NULL,
  rolldown_allocation_bps TEXT NOT NULL,
  max_tickets_per_wallet  INTEGER NOT NULL DEFAULT 0,
  claim_expiration_s      INTEGER NOT NULL,
  updated_at              INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS game_state (
  game                    TEXT PRIMARY KEY,
  current_draw_id         INTEGER NOT NULL,
  next_draw_timestamp     INTEGER NOT NULL,
  jackpot_balance_usdc    INTEGER NOT NULL,
  fixed_prize_pool_usdc   INTEGER NOT NULL,
  reserve_balance_usdc    INTEGER NOT NULL,
  insurance_balance_usdc  INTEGER NOT NULL,
  house_fee_collected_usdc INTEGER NOT NULL DEFAULT 0,
  current_draw_tickets    INTEGER NOT NULL DEFAULT 0,
  total_tickets_sold      INTEGER NOT NULL DEFAULT 0,
  total_prizes_paid_usdc  INTEGER NOT NULL DEFAULT 0,
  status                  TEXT NOT NULL DEFAULT 'scheduled',
  is_paused               INTEGER NOT NULL DEFAULT 0,
  pending_commitment      TEXT,
  reveal_seed             TEXT,
  commit_at               INTEGER,
  reveal_at               INTEGER,
  finalize_at             INTEGER,
  updated_at              INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS draws (
  game                     TEXT NOT NULL,
  draw_id                  INTEGER NOT NULL,
  status                   TEXT NOT NULL,
  scheduled_at             INTEGER NOT NULL,
  sales_opened_at          INTEGER NOT NULL,
  sales_closed_at          INTEGER,
  committed_at             INTEGER,
  revealed_at              INTEGER,
  finalized_at             INTEGER,
  commitment               TEXT,
  reveal_seed              TEXT,
  winning_numbers          TEXT,
  was_rolldown             INTEGER NOT NULL DEFAULT 0,
  rolldown_decided         INTEGER NOT NULL DEFAULT 0,
  rolldown_probability_bps INTEGER,
  ticket_count             INTEGER NOT NULL DEFAULT 0,
  winner_counts            TEXT,
  prize_per_winner_usdc    TEXT,
  jackpot_before_usdc      INTEGER,
  jackpot_after_usdc       INTEGER,
  total_committed_usdc     INTEGER NOT NULL DEFAULT 0,
  total_paid_usdc          INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (game, draw_id)
);

CREATE TABLE IF NOT EXISTS tickets (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  game           TEXT NOT NULL,
  draw_id        INTEGER NOT NULL,
  wallet         TEXT NOT NULL,
  numbers        TEXT NOT NULL,
  paid_usdc      INTEGER NOT NULL,
  payment_method TEXT NOT NULL,
  is_free        INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tickets_game_draw ON tickets(game, draw_id);
CREATE INDEX IF NOT EXISTS idx_tickets_wallet ON tickets(wallet);

CREATE TABLE IF NOT EXISTS balances (
  wallet        TEXT PRIMARY KEY,
  balance_usdc  INTEGER NOT NULL DEFAULT 0,
  free_tickets  INTEGER NOT NULL DEFAULT 0,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ledger (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet      TEXT NOT NULL,
  amount_usdc INTEGER NOT NULL,
  kind        TEXT NOT NULL,
  ref         TEXT,
  memo        TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_wallet ON ledger(wallet);

CREATE TABLE IF NOT EXISTS claims (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet      TEXT NOT NULL,
  game        TEXT NOT NULL,
  draw_id     INTEGER NOT NULL,
  ticket_id   INTEGER NOT NULL,
  tier        INTEGER NOT NULL,
  amount_usdc INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',
  created_at  INTEGER NOT NULL,
  paid_at     INTEGER,
  UNIQUE(ticket_id)
);
CREATE INDEX IF NOT EXISTS idx_claims_wallet ON claims(wallet);
CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status);

CREATE TABLE IF NOT EXISTS watcher_state (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- Idempotency guard for processed payment transactions. The watcher cursor is
-- advanced only after a batch completes, so a crash can re-poll the same
-- signatures. The PRIMARY KEY here makes reprocessing a no-op.
CREATE TABLE IF NOT EXISTS payment_events (
  signature    TEXT PRIMARY KEY,
  processed_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS deposit_orders (
  id            TEXT PRIMARY KEY,
  wallet        TEXT NOT NULL,
  game          TEXT NOT NULL,
  numbers       TEXT,
  count         INTEGER NOT NULL DEFAULT 1,
  amount_usdc   INTEGER NOT NULL,
  status        TEXT NOT NULL DEFAULT 'open',
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,
  fulfilled_at  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_orders_wallet ON deposit_orders(wallet, status);
`;

/** Default configurations — mirrors the on-chain MazelProtocol constants. */
export const DEFAULT_CONFIGS: Record<string, GameConfig> = {
  main: {
    game: 'main',
    ticketPriceUsdc: 2_500_000, // $2.50
    numbersPerTicket: 6,
    maxNumber: 46,
    drawIntervalS: 86_400, // daily
    saleCutoffS: 3_600, // sales close 1h before draw
    minDrawIntervalS: 3_600, // 1h floor before sale-target acceleration
    saleTargetTickets: 0, // time-only mode by default
    seedAmountUsdc: 500_000_000_000, // $500,000
    softCapUsdc: 1_750_000_000_000, // $1.75M
    hardCapUsdc: 2_250_000_000_000, // $2.25M
    feeTiers: [
      { thresholdUsdc: 0, bps: 2800 },
      { thresholdUsdc: 500_000_000_000, bps: 3200 },
      { thresholdUsdc: 1_000_000_000_000, bps: 3600 },
      { thresholdUsdc: 1_500_000_000_000, bps: 4000 },
    ],
    feeRolldownBps: 2800,
    allocations: { jackpotBps: 5560, fixedBps: 3940, reserveBps: 300, insuranceBps: 200 },
    fixedPrizes: {
      5: { amountUsdc: 4_000_000_000 }, // $4,000
      4: { amountUsdc: 150_000_000 }, // $150
      3: { amountUsdc: 5_000_000 }, // $5
      2: { amountUsdc: 0, freeTickets: 1 }, // Match 2 → 1 free ticket
    },
    rolldownAllocationBps: { 5: 2500, 4: 3500, 3: 4000 },
    maxTicketsPerWallet: 0, // unlimited
    claimExpirationS: 90 * 24 * 60 * 60, // 90 days
  },
  quickpick: {
    game: 'quickpick',
    ticketPriceUsdc: 1_500_000, // $1.50
    numbersPerTicket: 5,
    maxNumber: 35,
    drawIntervalS: 14_400, // every 4 hours
    saleCutoffS: 300, // sales close 5 min before draw
    minDrawIntervalS: 900, // 15 min floor before sale-target acceleration
    saleTargetTickets: 0, // time-only mode by default
    seedAmountUsdc: 5_000_000_000, // $5,000
    softCapUsdc: 30_000_000_000, // $30,000
    hardCapUsdc: 50_000_000_000, // $50,000
    feeTiers: [
      { thresholdUsdc: 0, bps: 3000 },
      { thresholdUsdc: 10_000_000_000, bps: 3300 },
      { thresholdUsdc: 20_000_000_000, bps: 3600 },
      { thresholdUsdc: 30_000_000_000, bps: 3800 },
    ],
    feeRolldownBps: 2800,
    allocations: { jackpotBps: 6000, fixedBps: 3700, reserveBps: 0, insuranceBps: 300 },
    fixedPrizes: {
      4: { amountUsdc: 100_000_000 }, // $100
      3: { amountUsdc: 4_000_000 }, // $4
    },
    rolldownAllocationBps: { 4: 6000, 3: 4000 },
    maxTicketsPerWallet: 100, // per-draw cap (M2 fix)
    claimExpirationS: 90 * 24 * 60 * 60,
  },
};
