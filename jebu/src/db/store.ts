/**
 * Data-access layer over libSQL (Turso).
 *
 * All multi-statement writes use `client.batch(..., 'write')` for atomicity
 * (ticket issuance, finalization, payouts, etc.).
 */
import { createClient, type Client } from '@libsql/client';
import {
  type ClaimRow,
  type ClaimStatus,
  type DepositOrder,
  type DrawRow,
  type DrawStatus,
  type GameConfig,
  type GameId,
  type GameState,
  type LedgerEntry,
  type LedgerKind,
  type OrderStatus,
  type TicketRow,
  type WalletSummary,
} from '../types';
import { DDL, DEFAULT_CONFIGS } from './schema';

type Row = Record<string, unknown>;

function int(v: unknown): number {
  if (v === null || v === undefined) return 0;
  return typeof v === 'bigint' ? Number(v) : Number(v);
}
function str(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v);
}
function maybeStr(v: unknown): string | null {
  return v === null || v === undefined ? null : String(v);
}
function maybeInt(v: unknown): number | null {
  return v === null || v === undefined ? null : int(v);
}
function parseJson<T>(v: unknown, fallback: T): T {
  const s = maybeStr(v);
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}
function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

export class Store {
  readonly client: Client;

  constructor(url: string, authToken?: string) {
    this.client = createClient(
      authToken ? { url, authToken } : { url },
    );
  }

  async close(): Promise<void> {
    await this.client.close();
  }

  /** Apply schema + seed default game configs/states. Idempotent. */
  async init(): Promise<void> {
    await this.client.execute(DDL);
    for (const cfg of Object.values(DEFAULT_CONFIGS)) {
      const exists = await this.client.execute({
        sql: 'SELECT 1 FROM game_config WHERE game = ?',
        args: [cfg.game],
      });
      if (exists.rows.length === 0) {
        await this.upsertConfig(cfg);
      }
      const st = await this.getState(cfg.game);
      if (!st) {
        await this.seedGame(cfg.game);
      }
    }
  }

  /** Create a fresh game cycle. For 'main' the first draw aligns to next UTC midnight. */
  private async seedGame(game: GameId): Promise<void> {
    const cfg = await this.getConfig(game);
    if (!cfg) throw new Error(`No config for game ${game}`);
    const now = nowSec();
    let firstDrawAt = now + cfg.drawIntervalS;
    if (game === 'main') {
      firstDrawAt = nextUtcMidnight();
    }
    await this.client.batch(
      [
        {
          sql: `INSERT INTO game_state (
            game, current_draw_id, next_draw_timestamp, jackpot_balance_usdc,
            fixed_prize_pool_usdc, reserve_balance_usdc, insurance_balance_usdc,
            current_draw_tickets, total_tickets_sold, total_prizes_paid_usdc,
            status, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 'scheduled', ?)`,
          args: [
            game,
            1,
            firstDrawAt,
            cfg.seedAmountUsdc,
            0,
            0,
            0,
            now,
          ],
        },
        {
          sql: `INSERT INTO draws (game, draw_id, status, scheduled_at, sales_opened_at)
                VALUES (?, 1, 'scheduled', ?, ?)`,
          args: [game, firstDrawAt, now],
        },
      ],
      'write',
    );
  }

  // ------------------------------------------------------------------ config

  async getConfig(game: GameId): Promise<GameConfig> {
    const rs = await this.client.execute({
      sql: 'SELECT * FROM game_config WHERE game = ?',
      args: [game],
    });
    const row = rs.rows[0];
    if (!row) throw new Error(`Game config not found: ${game}`);
    return rowToConfig(row);
  }

  async getAllConfigs(): Promise<GameConfig[]> {
    const rs = await this.client.execute('SELECT * FROM game_config ORDER BY game');
    return rs.rows.map(rowToConfig);
  }

  async upsertConfig(cfg: GameConfig): Promise<void> {
    await this.client.execute({
      sql: `INSERT INTO game_config (
        game, ticket_price_usdc, numbers_per_ticket, max_number, draw_interval_s,
        sale_cutoff_s, min_draw_interval_s, sale_target_tickets, seed_amount_usdc,
        soft_cap_usdc, hard_cap_usdc, fee_tiers, fee_rolldown_bps, allocations,
        fixed_prizes, rolldown_allocation_bps, max_tickets_per_wallet,
        claim_expiration_s, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(game) DO UPDATE SET
        ticket_price_usdc=excluded.ticket_price_usdc,
        numbers_per_ticket=excluded.numbers_per_ticket,
        max_number=excluded.max_number,
        draw_interval_s=excluded.draw_interval_s,
        sale_cutoff_s=excluded.sale_cutoff_s,
        min_draw_interval_s=excluded.min_draw_interval_s,
        sale_target_tickets=excluded.sale_target_tickets,
        seed_amount_usdc=excluded.seed_amount_usdc,
        soft_cap_usdc=excluded.soft_cap_usdc,
        hard_cap_usdc=excluded.hard_cap_usdc,
        fee_tiers=excluded.fee_tiers,
        fee_rolldown_bps=excluded.fee_rolldown_bps,
        allocations=excluded.allocations,
        fixed_prizes=excluded.fixed_prizes,
        rolldown_allocation_bps=excluded.rolldown_allocation_bps,
        max_tickets_per_wallet=excluded.max_tickets_per_wallet,
        claim_expiration_s=excluded.claim_expiration_s,
        updated_at=excluded.updated_at`,
      args: [
        cfg.game,
        cfg.ticketPriceUsdc,
        cfg.numbersPerTicket,
        cfg.maxNumber,
        cfg.drawIntervalS,
        cfg.saleCutoffS,
        cfg.minDrawIntervalS,
        cfg.saleTargetTickets,
        cfg.seedAmountUsdc,
        cfg.softCapUsdc,
        cfg.hardCapUsdc,
        JSON.stringify(cfg.feeTiers),
        cfg.feeRolldownBps,
        JSON.stringify(cfg.allocations),
        JSON.stringify(cfg.fixedPrizes),
        JSON.stringify(cfg.rolldownAllocationBps),
        cfg.maxTicketsPerWallet,
        cfg.claimExpirationS,
        nowSec(),
      ],
    });
  }

  // ------------------------------------------------------------------ state

  async getState(game: GameId): Promise<GameState | null> {
    const rs = await this.client.execute({
      sql: 'SELECT * FROM game_state WHERE game = ?',
      args: [game],
    });
    const row = rs.rows[0];
    if (!row) return null;
    return rowToState(row);
  }

  async getStates(): Promise<GameState[]> {
    const rs = await this.client.execute('SELECT * FROM game_state ORDER BY game');
    return rs.rows.map(rowToState);
  }

  /** Replace the whole runtime state row (draw lifecycle transitions). */
  async putState(st: GameState): Promise<void> {
    await this.client.execute({
      sql: `UPDATE game_state SET
        current_draw_id=?, next_draw_timestamp=?, jackpot_balance_usdc=?,
        fixed_prize_pool_usdc=?, reserve_balance_usdc=?, insurance_balance_usdc=?,
        house_fee_collected_usdc=?, current_draw_tickets=?, total_tickets_sold=?,
        total_prizes_paid_usdc=?, status=?, is_paused=?, pending_commitment=?,
        reveal_seed=?, commit_at=?, reveal_at=?, finalize_at=?, updated_at=?
        WHERE game=?`,
      args: [
        st.currentDrawId,
        st.nextDrawTimestamp,
        st.jackpotBalanceUsdc,
        st.fixedPrizePoolUsdc,
        st.reserveBalanceUsdc,
        st.insuranceBalanceUsdc,
        st.houseFeeCollectedUsdc,
        st.currentDrawTickets,
        st.totalTicketsSold,
        st.totalPrizesPaidUsdc,
        st.status,
        st.isPaused ? 1 : 0,
        st.pendingCommitment,
        st.revealSeed,
        st.commitAt,
        st.revealAt,
        st.finalizeAt,
        nowSec(),
        st.game,
      ],
    });
  }

  // ------------------------------------------------------------------ draws

  async listDraws(game: GameId, limit = 20, offset = 0): Promise<DrawRow[]> {
    const rs = await this.client.execute({
      sql: 'SELECT * FROM draws WHERE game = ? ORDER BY draw_id DESC LIMIT ? OFFSET ?',
      args: [game, limit, offset],
    });
    return rs.rows.map(rowToDraw);
  }

  async getDraw(game: GameId, drawId: number): Promise<DrawRow | null> {
    const rs = await this.client.execute({
      sql: 'SELECT * FROM draws WHERE game = ? AND draw_id = ?',
      args: [game, drawId],
    });
    const row = rs.rows[0];
    return row ? rowToDraw(row) : null;
  }

  async putDraw(d: DrawRow): Promise<void> {
    await this.client.execute({
      sql: `UPDATE draws SET
        status=?, scheduled_at=?, sales_opened_at=?, sales_closed_at=?,
        committed_at=?, revealed_at=?, finalized_at=?, commitment=?, reveal_seed=?,
        winning_numbers=?, was_rolldown=?, rolldown_decided=?,
        rolldown_probability_bps=?, ticket_count=?, winner_counts=?,
        prize_per_winner_usdc=?, jackpot_before_usdc=?, jackpot_after_usdc=?,
        total_committed_usdc=?, total_paid_usdc=?
        WHERE game=? AND draw_id=?`,
      args: [
        d.status,
        d.scheduledAt,
        d.salesOpenedAt,
        d.salesClosedAt,
        d.committedAt,
        d.revealedAt,
        d.finalizedAt,
        d.commitment,
        d.revealSeed,
        d.winningNumbers ? JSON.stringify(d.winningNumbers) : null,
        d.wasRolldown,
        d.rolldownDecided,
        d.rolldownProbabilityBps,
        d.ticketCount,
        d.winnerCounts ? JSON.stringify(d.winnerCounts) : null,
        d.prizePerWinnerUsdc ? JSON.stringify(d.prizePerWinnerUsdc) : null,
        d.jackpotBeforeUsdc,
        d.jackpotAfterUsdc,
        d.totalCommittedUsdc,
        d.totalPaidUsdc,
        d.game,
        d.drawId,
      ],
    });
  }

  /** Insert a new draw cycle row (status scheduled). */
  async insertDrawCycle(
    game: GameId,
    drawId: number,
    scheduledAt: number,
    salesOpenedAt: number,
  ): Promise<void> {
    await this.client.execute({
      sql: `INSERT INTO draws (game, draw_id, status, scheduled_at, sales_opened_at)
            VALUES (?, ?, 'scheduled', ?, ?)`,
      args: [game, drawId, scheduledAt, salesOpenedAt],
    });
  }

  // ------------------------------------------------------------------ tickets

  async countTickets(game: GameId, drawId: number): Promise<number> {
    const rs = await this.client.execute({
      sql: 'SELECT COUNT(*) AS c FROM tickets WHERE game = ? AND draw_id = ?',
      args: [game, drawId],
    });
    return int(rs.rows[0]?.c);
  }

  async countTicketsByWallet(game: GameId, drawId: number, wallet: string): Promise<number> {
    const rs = await this.client.execute({
      sql: 'SELECT COUNT(*) AS c FROM tickets WHERE game = ? AND draw_id = ? AND wallet = ?',
      args: [game, drawId, wallet],
    });
    return int(rs.rows[0]?.c);
  }

  async getTicketsForDraw(game: GameId, drawId: number): Promise<TicketRow[]> {
    const rs = await this.client.execute({
      sql: 'SELECT * FROM tickets WHERE game = ? AND draw_id = ? ORDER BY id',
      args: [game, drawId],
    });
    return rs.rows.map(rowToTicket);
  }

  async getTicketsByWallet(game: GameId, drawId: number, wallet: string): Promise<TicketRow[]> {
    const rs = await this.client.execute({
      sql: 'SELECT * FROM tickets WHERE game = ? AND draw_id = ? AND wallet = ? ORDER BY id',
      args: [game, drawId, wallet],
    });
    return rs.rows.map(rowToTicket);
  }

  async getTicketById(id: number): Promise<TicketRow | null> {
    const rs = await this.client.execute({
      sql: 'SELECT * FROM tickets WHERE id = ?',
      args: [id],
    });
    const row = rs.rows[0];
    return row ? rowToTicket(row) : null;
  }

  /**
   * Atomically insert tickets + record the funding ledger entry + bump state counters.
   * `debitFromBalance` may be passed for balance-funded purchases.
   */
  async issueTickets(opts: {
    game: GameId;
    drawId: number;
    wallet: string;
    numbersList: number[][];
    paidUsdc: number;
    method: TicketRow['paymentMethod'];
    isFree: boolean;
    ledgerKind: LedgerKind;
    ledgerRef: string | null;
    ledgerMemo: string | null;
    debitFromBalance?: boolean;
  }): Promise<TicketRow[]> {
    const now = nowSec();
    const stmts: Array<{ sql: string; args: unknown[] }> = [];

    if (opts.debitFromBalance && opts.paidUsdc > 0) {
      stmts.push({
        sql: `UPDATE balances SET balance_usdc = balance_usdc - ?, updated_at = ?
              WHERE wallet = ? AND balance_usdc >= ?`,
        args: [opts.paidUsdc, now, opts.wallet, opts.paidUsdc],
      });
    }
    for (const numbers of opts.numbersList) {
      stmts.push({
        sql: `INSERT INTO tickets (game, draw_id, wallet, numbers, paid_usdc, payment_method, is_free, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          opts.game,
          opts.drawId,
          opts.wallet,
          JSON.stringify(numbers),
          opts.paidUsdc,
          opts.method,
          opts.isFree ? 1 : 0,
          now,
        ],
      });
    }
    stmts.push({
      sql: 'UPDATE game_state SET current_draw_tickets = current_draw_tickets + ?, total_tickets_sold = total_tickets_sold + ?, updated_at = ? WHERE game = ?',
      args: [opts.numbersList.length, opts.numbersList.length, now, opts.game],
    });
    stmts.push({
      sql: `INSERT INTO ledger (wallet, amount_usdc, kind, ref, memo, created_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        opts.wallet,
        opts.debitFromBalance ? -opts.paidUsdc : opts.paidUsdc,
        opts.ledgerKind,
        opts.ledgerRef,
        opts.ledgerMemo,
        now,
      ],
    });

    await this.client.batch(stmts, 'write');

    // Return the newly created rows.
    const rs = await this.client.execute({
      sql: `SELECT * FROM tickets WHERE game = ? AND draw_id = ? AND wallet = ? AND created_at = ?
            ORDER BY id DESC LIMIT ?`,
      args: [opts.game, opts.drawId, opts.wallet, now, opts.numbersList.length],
    });
    return rs.rows.map(rowToTicket).reverse();
  }

  // ------------------------------------------------------------------ balances

  async getBalance(wallet: string): Promise<WalletSummary> {
    const rs = await this.client.execute({
      sql: 'SELECT * FROM balances WHERE wallet = ?',
      args: [wallet],
    });
    const row = rs.rows[0];
    if (!row) return { wallet, balanceUsdc: 0, freeTickets: 0 };
    return {
      wallet,
      balanceUsdc: int(row.balance_usdc),
      freeTickets: int(row.free_tickets),
    };
  }

  /** Add `amount` (positive) to balance and record a ledger entry. */
  async credit(wallet: string, amountUsdc: number, kind: LedgerKind, ref: string | null, memo: string | null): Promise<void> {
    if (amountUsdc <= 0) return;
    const now = nowSec();
    await this.client.batch(
      [
        {
          sql: `INSERT INTO balances (wallet, balance_usdc, free_tickets, updated_at)
                VALUES (?, ?, 0, ?)
                ON CONFLICT(wallet) DO UPDATE SET
                  balance_usdc = balance_usdc + excluded.balance_usdc,
                  updated_at = excluded.updated_at`,
          args: [wallet, amountUsdc, now],
        },
        {
          sql: `INSERT INTO ledger (wallet, amount_usdc, kind, ref, memo, created_at)
                VALUES (?, ?, ?, ?, ?, ?)`,
          args: [wallet, amountUsdc, kind, ref, memo, now],
        },
      ],
      'write',
    );
  }

  /** Debit balance (throws-like behavior via rowsAffected check) and record ledger. */
  async debit(wallet: string, amountUsdc: number, kind: LedgerKind, ref: string | null, memo: string | null): Promise<boolean> {
    if (amountUsdc <= 0) return true;
    const now = nowSec();
    const rs = await this.client.execute({
      sql: `UPDATE balances SET balance_usdc = balance_usdc - ?, updated_at = ?
            WHERE wallet = ? AND balance_usdc >= ?`,
      args: [amountUsdc, now, wallet, amountUsdc],
    });
    if (rs.rowsAffected === 0) return false;
    await this.client.execute({
      sql: `INSERT INTO ledger (wallet, amount_usdc, kind, ref, memo, created_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [wallet, -amountUsdc, kind, ref, memo, now],
    });
    return true;
  }

  /** Credit free tickets (main lottery Match 2). */
  async creditFreeTickets(wallet: string, count: number, ref: string | null): Promise<void> {
    if (count <= 0) return;
    const now = nowSec();
    await this.client.batch(
      [
        {
          sql: `INSERT INTO balances (wallet, balance_usdc, free_tickets, updated_at)
                VALUES (?, 0, ?, ?)
                ON CONFLICT(wallet) DO UPDATE SET
                  free_tickets = free_tickets + excluded.free_tickets,
                  updated_at = excluded.updated_at`,
          args: [wallet, count, now],
        },
        {
          sql: `INSERT INTO ledger (wallet, amount_usdc, kind, ref, memo, created_at)
                VALUES (?, 0, 'free_credit', ?, ?, ?)`,
          args: [wallet, ref, `+${count} free ticket(s)`, now],
        },
      ],
      'write',
    );
  }

  async useFreeTickets(wallet: string, count: number): Promise<boolean> {
    const now = nowSec();
    const rs = await this.client.execute({
      sql: `UPDATE balances SET free_tickets = free_tickets - ?, updated_at = ?
            WHERE wallet = ? AND free_tickets >= ?`,
      args: [count, now, wallet, count],
    });
    return rs.rowsAffected > 0;
  }

  // ------------------------------------------------------------------ ledger

  async listLedger(wallet: string | null, limit = 50): Promise<LedgerEntry[]> {
    if (wallet) {
      const rs = await this.client.execute({
        sql: 'SELECT * FROM ledger WHERE wallet = ? ORDER BY id DESC LIMIT ?',
        args: [wallet, limit],
      });
      return rs.rows.map(rowToLedger);
    }
    const rs = await this.client.execute({
      sql: 'SELECT * FROM ledger ORDER BY id DESC LIMIT ?',
      args: [limit],
    });
    return rs.rows.map(rowToLedger);
  }

  // ------------------------------------------------------------------ claims

  async createClaim(row: {
    wallet: string;
    game: GameId;
    drawId: number;
    ticketId: number;
    tier: number;
    amountUsdc: number;
  }): Promise<number | null> {
    try {
      const rs = await this.client.execute({
        sql: `INSERT INTO claims (wallet, game, draw_id, ticket_id, tier, amount_usdc, status, created_at)
              VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
        args: [row.wallet, row.game, row.drawId, row.ticketId, row.tier, row.amountUsdc, nowSec()],
      });
      return Number(rs.lastInsertRowid);
    } catch {
      return null; // unique(ticket_id) violated → already claimed
    }
  }

  async getClaim(id: number): Promise<ClaimRow | null> {
    const rs = await this.client.execute({
      sql: 'SELECT * FROM claims WHERE id = ?',
      args: [id],
    });
    const row = rs.rows[0];
    return row ? rowToClaim(row) : null;
  }

  async listClaims(status?: ClaimStatus, limit = 100): Promise<ClaimRow[]> {
    if (status) {
      const rs = await this.client.execute({
        sql: 'SELECT * FROM claims WHERE status = ? ORDER BY id DESC LIMIT ?',
        args: [status, limit],
      });
      return rs.rows.map(rowToClaim);
    }
    const rs = await this.client.execute({
      sql: 'SELECT * FROM claims ORDER BY id DESC LIMIT ?',
      args: [limit],
    });
    return rs.rows.map(rowToClaim);
  }

  async listClaimsByWallet(wallet: string, limit = 100): Promise<ClaimRow[]> {
    const rs = await this.client.execute({
      sql: 'SELECT * FROM claims WHERE wallet = ? ORDER BY id DESC LIMIT ?',
      args: [wallet, limit],
    });
    return rs.rows.map(rowToClaim);
  }

  /**
   * Mark a claim paid and record the payout ledger entry + bump
   * draw/game payout counters. Returns the payout details.
   */
  async markClaimPaid(claimId: number, txSignature: string | null): Promise<{ claim: ClaimRow; ok: boolean }> {
    const claim = await this.getClaim(claimId);
    if (!claim || claim.status === 'paid' || claim.status === 'expired' || claim.status === 'reclaimed') {
      return { claim: claim as ClaimRow, ok: false };
    }
    const now = nowSec();
    await this.client.batch(
      [
        {
          sql: `UPDATE claims SET status = 'paid', paid_at = ? WHERE id = ?`,
          args: [now, claimId],
        },
        {
          sql: `INSERT INTO ledger (wallet, amount_usdc, kind, ref, memo, created_at)
                VALUES (?, ?, 'payout', ?, ?, ?)`,
          args: [claim.wallet, claim.amountUsdc, String(claimId), txSignature ?? null, now],
        },
        {
          sql: `UPDATE draws SET total_paid_usdc = total_paid_usdc + ?
                WHERE game = ? AND draw_id = ?`,
          args: [claim.amountUsdc, claim.game, claim.drawId],
        },
        {
          sql: `UPDATE game_state SET total_prizes_paid_usdc = total_prizes_paid_usdc + ?, updated_at = ?
                WHERE game = ?`,
          args: [claim.amountUsdc, now, claim.game],
        },
      ],
      'write',
    );
    return { claim: { ...claim, status: 'paid', paidAt: now }, ok: true };
  }

  /** Expire pending claims older than `expiresBefore` and reclaim to reserve. */
  async expireClaims(game: GameId, expiresBefore: number): Promise<number> {
    const rs = await this.client.execute({
      sql: `UPDATE claims SET status = 'expired'
            WHERE game = ? AND status IN ('pending','processing') AND created_at < ?`,
      args: [game, expiresBefore],
    });
    return Number(rs.rowsAffected);
  }

  /** Reclaim expired claims' funds into the game reserve. */
  async reclaimExpired(game: GameId): Promise<number> {
    const rs = await this.client.execute({
      sql: 'SELECT COALESCE(SUM(amount_usdc), 0) AS total FROM claims WHERE game = ? AND status = ?',
      args: [game, 'expired'],
    });
    const total = int(rs.rows[0]?.total);
    if (total <= 0) return 0;
    const now = nowSec();
    await this.client.batch(
      [
        {
          sql: `UPDATE claims SET status = 'reclaimed' WHERE game = ? AND status = 'expired'`,
          args: [game],
        },
        {
          sql: `UPDATE game_state SET reserve_balance_usdc = reserve_balance_usdc + ?, updated_at = ?
                WHERE game = ?`,
          args: [total, now, game],
        },
      ],
      'write',
    );
    return total;
  }

  // ------------------------------------------------------------------ orders

  async createDepositOrder(order: DepositOrder): Promise<void> {
    await this.client.execute({
      sql: `INSERT INTO deposit_orders (id, wallet, game, numbers, count, amount_usdc, status, created_at, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
      args: [
        order.id,
        order.wallet,
        order.game,
        order.numbers ? JSON.stringify(order.numbers) : null,
        order.count,
        order.amountUsdc,
        order.createdAt,
        order.expiresAt,
      ],
    });
  }

  async getOrder(id: string): Promise<DepositOrder | null> {
    const rs = await this.client.execute({
      sql: 'SELECT * FROM deposit_orders WHERE id = ?',
      args: [id],
    });
    const row = rs.rows[0];
    return row ? rowToOrder(row) : null;
  }

  /**
   * Oldest open, unexpired order for a wallet whose amount can be covered by
   * `amountUsdc`. Only overpayments within `toleranceUsdc` match, so a
   * shortfall can never fulfill an order.
   */
  async findOpenOrderForPayment(wallet: string, amountUsdc: number, toleranceUsdc: number, now: number): Promise<DepositOrder | null> {
    const rs = await this.client.execute({
      sql: `SELECT * FROM deposit_orders
            WHERE wallet = ? AND status = 'open' AND expires_at > ?
            ORDER BY created_at ASC`,
      args: [wallet, now],
    });
    for (const row of rs.rows) {
      const order = rowToOrder(row);
      if (
        amountUsdc >= order.amountUsdc &&
        amountUsdc - order.amountUsdc <= toleranceUsdc
      ) {
        return order;
      }
    }
    return null;
  }

  /**
   * Atomically mark an order fulfilled only if it is still open. Returns true
   * when this call performed the transition, false when another process
   * already fulfilled it.
   */
  async markOrderFulfilled(id: string, at: number): Promise<boolean> {
    const rs = await this.client.execute({
      sql: `UPDATE deposit_orders SET status = 'fulfilled', fulfilled_at = ?
            WHERE id = ? AND status = 'open'`,
      args: [at, id],
    });
    return Number(rs.rowsAffected) > 0;
  }

  async expireOrders(before: number): Promise<number> {
    const rs = await this.client.execute({
      sql: `UPDATE deposit_orders SET status = 'expired' WHERE status = 'open' AND expires_at < ?`,
      args: [before],
    });
    return Number(rs.rowsAffected);
  }

  // ------------------------------------------------------------------ watcher

  async getWatcherState(key: string): Promise<string | null> {
    const rs = await this.client.execute({
      sql: 'SELECT value FROM watcher_state WHERE key = ?',
      args: [key],
    });
    return maybeStr(rs.rows[0]?.value);
  }

  async setWatcherState(key: string, value: string): Promise<void> {
    await this.client.execute({
      sql: `INSERT INTO watcher_state (key, value) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      args: [key, value],
    });
  }

  /**
   * Record a processed payment signature exactly once. Returns true when this
   * call claimed the signature and false when it was already processed, so
   * callers can safely skip duplicate transfers after a watcher crash.
   */
  async claimPaymentSignature(signature: string): Promise<boolean> {
    const rs = await this.client.execute({
      sql: `INSERT OR IGNORE INTO payment_events (signature, processed_at)
            VALUES (?, ?)`,
      args: [signature, nowSec()],
    });
    return Number(rs.rowsAffected) > 0;
  }
}

// --------------------------------------------------------------------------
// Row mappers
// --------------------------------------------------------------------------

function rowToConfig(row: Row): GameConfig {
  return {
    game: str(row.game) as GameId,
    ticketPriceUsdc: int(row.ticket_price_usdc),
    numbersPerTicket: int(row.numbers_per_ticket),
    maxNumber: int(row.max_number),
    drawIntervalS: int(row.draw_interval_s),
    saleCutoffS: int(row.sale_cutoff_s),
    minDrawIntervalS: int(row.min_draw_interval_s),
    saleTargetTickets: int(row.sale_target_tickets),
    seedAmountUsdc: int(row.seed_amount_usdc),
    softCapUsdc: int(row.soft_cap_usdc),
    hardCapUsdc: int(row.hard_cap_usdc),
    feeTiers: parseJson(row.fee_tiers, []),
    feeRolldownBps: int(row.fee_rolldown_bps),
    allocations: parseJson(row.allocations, { jackpotBps: 0, fixedBps: 0, reserveBps: 0, insuranceBps: 0 }),
    fixedPrizes: parseJson(row.fixed_prizes, {}),
    rolldownAllocationBps: parseJson(row.rolldown_allocation_bps, {}),
    maxTicketsPerWallet: int(row.max_tickets_per_wallet),
    claimExpirationS: int(row.claim_expiration_s),
  };
}

function rowToState(row: Row): GameState {
  return {
    game: str(row.game) as GameId,
    currentDrawId: int(row.current_draw_id),
    nextDrawTimestamp: int(row.next_draw_timestamp),
    jackpotBalanceUsdc: int(row.jackpot_balance_usdc),
    fixedPrizePoolUsdc: int(row.fixed_prize_pool_usdc),
    reserveBalanceUsdc: int(row.reserve_balance_usdc),
    insuranceBalanceUsdc: int(row.insurance_balance_usdc),
    houseFeeCollectedUsdc: int(row.house_fee_collected_usdc),
    currentDrawTickets: int(row.current_draw_tickets),
    totalTicketsSold: int(row.total_tickets_sold),
    totalPrizesPaidUsdc: int(row.total_prizes_paid_usdc),
    status: str(row.status) as DrawStatus,
    isPaused: int(row.is_paused) === 1,
    pendingCommitment: maybeStr(row.pending_commitment),
    revealSeed: maybeStr(row.reveal_seed),
    commitAt: maybeInt(row.commit_at),
    revealAt: maybeInt(row.reveal_at),
    finalizeAt: maybeInt(row.finalize_at),
  };
}

function rowToDraw(row: Row): DrawRow {
  return {
    game: str(row.game) as GameId,
    drawId: int(row.draw_id),
    status: str(row.status) as DrawStatus,
    scheduledAt: int(row.scheduled_at),
    salesOpenedAt: int(row.sales_opened_at),
    salesClosedAt: maybeInt(row.sales_closed_at),
    committedAt: maybeInt(row.committed_at),
    revealedAt: maybeInt(row.revealed_at),
    finalizedAt: maybeInt(row.finalized_at),
    commitment: maybeStr(row.commitment),
    revealSeed: maybeStr(row.reveal_seed),
    winningNumbers: parseJson(row.winning_numbers, null),
    wasRolldown: int(row.was_rolldown),
    rolldownDecided: int(row.rolldown_decided),
    rolldownProbabilityBps: maybeInt(row.rolldown_probability_bps),
    ticketCount: int(row.ticket_count),
    winnerCounts: parseJson(row.winner_counts, null),
    prizePerWinnerUsdc: parseJson(row.prize_per_winner_usdc, null),
    jackpotBeforeUsdc: maybeInt(row.jackpot_before_usdc),
    jackpotAfterUsdc: maybeInt(row.jackpot_after_usdc),
    totalCommittedUsdc: int(row.total_committed_usdc),
    totalPaidUsdc: int(row.total_paid_usdc),
  };
}

function rowToTicket(row: Row): TicketRow {
  return {
    id: int(row.id),
    game: str(row.game) as GameId,
    drawId: int(row.draw_id),
    wallet: str(row.wallet),
    numbers: parseJson(row.numbers, []),
    paidUsdc: int(row.paid_usdc),
    paymentMethod: str(row.payment_method) as TicketRow['paymentMethod'],
    isFree: int(row.is_free),
    createdAt: int(row.created_at),
  };
}

function rowToClaim(row: Row): ClaimRow {
  return {
    id: int(row.id),
    wallet: str(row.wallet),
    game: str(row.game) as GameId,
    drawId: int(row.draw_id),
    ticketId: int(row.ticket_id),
    tier: int(row.tier),
    amountUsdc: int(row.amount_usdc),
    status: str(row.status) as ClaimStatus,
    createdAt: int(row.created_at),
    paidAt: maybeInt(row.paid_at),
  };
}

function rowToOrder(row: Row): DepositOrder {
  return {
    id: str(row.id),
    wallet: str(row.wallet),
    game: str(row.game) as GameId,
    numbers: parseJson(row.numbers, null),
    count: int(row.count),
    amountUsdc: int(row.amount_usdc),
    status: str(row.status) as OrderStatus,
    createdAt: int(row.created_at),
    expiresAt: int(row.expires_at),
    fulfilledAt: maybeInt(row.fulfilled_at),
  };
}

function rowToLedger(row: Row): LedgerEntry {
  return {
    id: int(row.id),
    wallet: str(row.wallet),
    amountUsdc: int(row.amount_usdc),
    kind: str(row.kind) as LedgerKind,
    ref: maybeStr(row.ref),
    memo: maybeStr(row.memo),
    createdAt: int(row.created_at),
  };
}

/** Next UTC midnight (seconds). Draws for the main game align to UTC 00:00. */
export function nextUtcMidnight(): number {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0));
  return Math.floor(next.getTime() / 1000);
}
