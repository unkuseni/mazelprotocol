/**
 * Draw service — offchain draw lifecycle state machine + scheduler.
 *
 * Lifecycle per draw (per game):
 *   scheduled ──(cutoff reached)──▶ closed ──(draw time)──▶ committed
 *   committed ──(reveal delay)──▶ revealed ──(finalize delay)──▶ finalized
 *   (any) ──(timeout / zero tickets)──▶ skipped
 *
 * Sale-target acceleration: when `sale_target_tickets > 0`, tickets sold and
 * the minimum interval since cycle start has elapsed, the draw is pulled
 * forward (mirrors the on-chain `advance_draw` Mode 2a).
 */
import type { AppConfig } from '../config';
import type { Store } from '../db/store';
import type { DrawRow, GameConfig, GameId, GameState } from '../types';
import { createCommitment, deriveWinningNumbers, rolldownDecision } from './rng';
import { computeFinalize, rolldownProbabilityBps } from './prizes';

export class DrawService {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly store: Store,
    private readonly cfg: AppConfig,
  ) { }

  // ------------------------------------------------------------- scheduler

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.tickAll().catch((err) => console.error('[scheduler] tick failed:', err));
    }, this.cfg.tickMs);
    void this.tickAll().catch((err) => console.error('[scheduler] initial tick failed:', err));
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async tickAll(): Promise<void> {
    for (const st of await this.store.getStates()) {
      if (st.isPaused) continue;
      try {
        await this.tickGame(st.game);
      } catch (err) {
        console.error(`[scheduler] tick ${st.game} failed:`, err);
      }
    }
    await this.maintenance();
  }

  /** Daily-ish maintenance: expire claims + orders. */
  private async maintenance(): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    for (const cfg of await this.store.getAllConfigs()) {
      await this.store.expireClaims(cfg.game, now - cfg.claimExpirationS);
      const reclaimed = await this.store.reclaimExpired(cfg.game);
      if (reclaimed > 0) {
        console.log(`[scheduler] reclaimed ${reclaimed} USDC-lamports of expired prizes (${cfg.game})`);
      }
    }
    const expiredOrders = await this.store.expireOrders(now);
    if (expiredOrders > 0) console.log(`[scheduler] expired ${expiredOrders} stale deposit order(s)`);
  }

  // --------------------------------------------------------- state machine

  async tickGame(game: GameId): Promise<void> {
    const state = await this.store.getState(game);
    if (!state) return;
    const cfg = await this.store.getConfig(game);
    const now = Math.floor(Date.now() / 1000);

    switch (state.status) {
      case 'scheduled': {
        const closeAt = state.nextDrawTimestamp - cfg.saleCutoffS;
        const cycleStart = state.nextDrawTimestamp - cfg.drawIntervalS;

        // Sale-target acceleration (mirrors on-chain advance_draw Mode 2a).
        if (
          cfg.saleTargetTickets > 0 &&
          state.currentDrawTickets >= cfg.saleTargetTickets &&
          now >= cycleStart + cfg.minDrawIntervalS &&
          now < state.nextDrawTimestamp
        ) {
          console.log(`[${game}] 🎯 sale target hit (${state.currentDrawTickets} >= ${cfg.saleTargetTickets}) — accelerating draw`);
          state.nextDrawTimestamp = now;
          await this.store.putState(state);
          await this.beginDraw(game);
          return;
        }

        if (now >= state.nextDrawTimestamp) {
          await this.beginDraw(game);
        } else if (now >= closeAt) {
          console.log(`[${game}] sales closed for draw #${state.currentDrawId}`);
          state.status = 'closed';
          await this.store.putState(state);
          const draw = await this.store.getDraw(game, state.currentDrawId);
          if (draw) {
            draw.status = 'closed';
            draw.salesClosedAt = now;
            await this.store.putDraw(draw);
          }
        }
        break;
      }

      case 'closed': {
        if (now >= state.nextDrawTimestamp) {
          await this.beginDraw(game);
        }
        break;
      }

      case 'committed': {
        if (state.revealAt !== null && now >= state.revealAt) {
          await this.revealDraw(game);
        } else if (state.commitAt !== null && now - state.commitAt > this.cfg.commitTimeoutS) {
          console.warn(`[${game}] commit timeout — skipping draw #${state.currentDrawId}`);
          await this.skipDraw(game, 'commit timeout');
        }
        break;
      }

      case 'revealed': {
        if (state.finalizeAt !== null && now >= state.finalizeAt) {
          await this.finalizeDraw(game);
        } else if (state.revealAt !== null && now - state.revealAt > this.cfg.advancementTimeoutS) {
          console.warn(`[${game}] reveal timeout — skipping draw #${state.currentDrawId}`);
          await this.skipDraw(game, 'reveal timeout');
        }
        break;
      }

      case 'finalized':
      case 'skipped':
        break; // next cycle already scheduled
    }
  }

  // ------------------------------------------------------------- transitions

  /** Commit randomness for the current draw (or skip if zero tickets). */
  async beginDraw(game: GameId): Promise<DrawRow> {
    const state = await this.store.getState(game);
    if (!state) throw new Error(`No state for ${game}`);
    const cfg = await this.store.getConfig(game);
    const now = Math.floor(Date.now() / 1000);
    const draw = await this.store.getDraw(game, state.currentDrawId);
    if (!draw) throw new Error(`No draw row for ${game} #${state.currentDrawId}`);

    const tickets = await this.store.countTickets(game, state.currentDrawId);
    if (tickets === 0) {
      console.log(`[${game}] zero tickets for draw #${state.currentDrawId} — skipping`);
      return this.skipDraw(game, 'no tickets');
    }

    const { seedHex, commitmentHex } = createCommitment();
    const revealAt = now + this.cfg.commitRevealDelayS;
    const finalizeAt = revealAt + this.cfg.finalizationDelayS;

    state.status = 'committed';
    state.pendingCommitment = commitmentHex;
    state.revealSeed = seedHex;
    state.commitAt = now;
    state.revealAt = revealAt;
    state.finalizeAt = finalizeAt;
    await this.store.putState(state);

    draw.status = 'committed';
    draw.committedAt = now;
    draw.commitment = commitmentHex;
    draw.revealSeed = seedHex;
    draw.ticketCount = tickets;
    await this.store.putDraw(draw);

    console.log(`[${game}] 🔒 committed draw #${state.currentDrawId} (${tickets} tickets), reveal in ${this.cfg.commitRevealDelayS}s`);
    return draw;
  }

  /** Reveal randomness: derive winning numbers + decide rolldown. */
  async revealDraw(game: GameId): Promise<DrawRow> {
    const state = await this.store.getState(game);
    if (!state) throw new Error(`No state for ${game}`);
    const cfg = await this.store.getConfig(game);
    const now = Math.floor(Date.now() / 1000);
    const draw = await this.store.getDraw(game, state.currentDrawId);
    if (!draw) throw new Error(`No draw row for ${game} #${state.currentDrawId}`);
    if (!state.revealSeed) throw new Error(`No reveal seed for ${game} #${state.currentDrawId}`);

    const winningNumbers = deriveWinningNumbers(state.revealSeed, cfg.numbersPerTicket, cfg.maxNumber);
    const probabilityBps = rolldownProbabilityBps(cfg, state.jackpotBalanceUsdc);
    const decided = rolldownDecision(state.revealSeed, probabilityBps);

    state.status = 'revealed';
    state.finalizeAt = now + this.cfg.finalizationDelayS;
    await this.store.putState(state);

    draw.status = 'revealed';
    draw.revealedAt = now;
    draw.winningNumbers = winningNumbers;
    draw.rolldownDecided = decided ? 1 : 0;
    draw.rolldownProbabilityBps = probabilityBps;
    draw.jackpotBeforeUsdc = state.jackpotBalanceUsdc;
    await this.store.putDraw(draw);

    console.log(
      `[${game}] 🎲 revealed draw #${state.currentDrawId}: ${winningNumbers.join('-')}` +
      ` rolldown=${decided ? 'YES' : 'no'} (p=${(probabilityBps / 100).toFixed(2)}%)`,
    );
    return draw;
  }

  /** Finalize: count winners, compute prizes, roll state into the next cycle. */
  async finalizeDraw(game: GameId): Promise<DrawRow> {
    const state = await this.store.getState(game);
    if (!state) throw new Error(`No state for ${game}`);
    const cfg = await this.store.getConfig(game);
    const now = Math.floor(Date.now() / 1000);
    const draw = await this.store.getDraw(game, state.currentDrawId);
    if (!draw) throw new Error(`No draw row for ${game} #${state.currentDrawId}`);
    if (!draw.winningNumbers) throw new Error(`No winning numbers for ${game} #${state.currentDrawId}`);

    const tickets = await this.store.getTicketsForDraw(game, state.currentDrawId);
    const ticketNumbers = tickets.map((t) => t.numbers);
    const ticketWallets = tickets.map((t) => t.wallet);

    const out = computeFinalize({
      game,
      cfg,
      state,
      ticketWallets,
      ticketNumbers,
      winningNumbers: draw.winningNumbers,
      rolldownDecided: draw.rolldownDecided === 1,
    });

    // --- persist draw result -------------------------------------------------
    draw.status = 'finalized';
    draw.finalizedAt = now;
    draw.wasRolldown = out.wasRolldown ? 1 : 0;
    draw.winnerCounts = out.winnerCounts;
    const perWinner: Record<number, number> = {};
    for (const [tier, p] of Object.entries(out.payouts)) perWinner[Number(tier)] = p.perWinnerUsdc;
    draw.prizePerWinnerUsdc = perWinner;
    draw.jackpotAfterUsdc = out.jackpotAfterUsdc;
    draw.totalCommittedUsdc = out.totalCommittedUsdc;
    await this.store.putDraw(draw);

    // --- create claim rows for cash winners ----------------------------------
    for (const ticket of tickets) {
      const tier = matchTier(ticket.numbers, draw.winningNumbers);
      const payout = out.payouts[tier];
      if (!payout || payout.perWinnerUsdc <= 0) continue;
      const claimId = await this.store.createClaim({
        wallet: ticket.wallet,
        game,
        drawId: state.currentDrawId,
        ticketId: ticket.id,
        tier,
        amountUsdc: payout.perWinnerUsdc,
      });
      if (claimId !== null) {
        console.log(`  → claim #${claimId}: wallet ${short(ticket.wallet)} tier ${tier} $${(payout.perWinnerUsdc / 1e6).toFixed(2)}`);
      }
    }

    // --- credit free tickets (main Match 2) -----------------------------------
    for (const [wallet, count] of out.freeTicketsByWallet) {
      await this.store.creditFreeTickets(wallet, count, `draw:${state.currentDrawId}`);
      console.log(`  → ${count} free ticket(s) → ${short(wallet)}`);
    }

    // --- roll state into the next draw cycle ---------------------------------
    const nextDrawId = state.currentDrawId + 1;
    const nextDrawAt = now + cfg.drawIntervalS;

    state.status = 'scheduled';
    state.currentDrawId = nextDrawId;
    state.nextDrawTimestamp = nextDrawAt;
    state.jackpotBalanceUsdc = out.jackpotAfterUsdc;
    state.fixedPrizePoolUsdc = out.fixedPoolAfterUsdc;
    state.reserveBalanceUsdc = out.reserveAfterUsdc;
    state.insuranceBalanceUsdc = out.insuranceAfterUsdc;
    state.houseFeeCollectedUsdc = out.houseFeeAfterUsdc;
    state.currentDrawTickets = 0;
    state.pendingCommitment = null;
    state.revealSeed = null;
    state.commitAt = null;
    state.revealAt = null;
    state.finalizeAt = null;
    await this.store.putState(state);

    await this.store.insertDrawCycle(game, nextDrawId, nextDrawAt, now);

    console.log(
      `[${game}] ✅ finalized draw #${state.currentDrawId - 1}: tickets=${tickets.length}` +
      ` rolldown=${out.wasRolldown} committed=$${(out.totalCommittedUsdc / 1e6).toFixed(2)}` +
      ` jackpot: $${(draw.jackpotBeforeUsdc ?? 0) / 1e6} → $${(out.jackpotAfterUsdc / 1e6).toFixed(2)}` +
      ` | next draw #${nextDrawId} at ${new Date(nextDrawAt * 1000).toISOString()}`,
    );
    return draw;
  }

  /** Skip the current draw (advance to next cycle, jackpot carries). */
  async skipDraw(game: GameId, reason: string): Promise<DrawRow> {
    const state = await this.store.getState(game);
    if (!state) throw new Error(`No state for ${game}`);
    const cfg = await this.store.getConfig(game);
    const now = Math.floor(Date.now() / 1000);
    const draw = await this.store.getDraw(game, state.currentDrawId);
    if (!draw) throw new Error(`No draw row for ${game} #${state.currentDrawId}`);

    draw.status = 'skipped';
    draw.finalizedAt = now;
    draw.ticketCount = await this.store.countTickets(game, state.currentDrawId);
    await this.store.putDraw(draw);

    const nextDrawId = state.currentDrawId + 1;
    const nextDrawAt = now + cfg.drawIntervalS;

    state.status = 'scheduled';
    state.currentDrawId = nextDrawId;
    state.nextDrawTimestamp = nextDrawAt;
    state.currentDrawTickets = 0;
    state.pendingCommitment = null;
    state.revealSeed = null;
    state.commitAt = null;
    state.revealAt = null;
    state.finalizeAt = null;
    await this.store.putState(state);

    await this.store.insertDrawCycle(game, nextDrawId, nextDrawAt, now);
    console.log(`[${game}] ⏭️ skipped draw #${draw.drawId} (${reason}) — next draw #${nextDrawId} at ${new Date(nextDrawAt * 1000).toISOString()}`);
    return draw;
  }
}

function matchTier(ticket: number[], winning: number[]): number {
  let i = 0;
  let j = 0;
  let m = 0;
  while (i < winning.length && j < ticket.length) {
    if (winning[i] === ticket[j]) {
      m++;
      i++;
      j++;
    } else if (winning[i] < ticket[j]) {
      i++;
    } else {
      j++;
    }
  }
  return m;
}

function short(wallet: string): string {
  return wallet.length > 12 ? `${wallet.slice(0, 4)}…${wallet.slice(-4)}` : wallet;
}
