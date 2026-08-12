/**
 * Public player API.
 */
import { Router } from 'express';
import { randomInt } from 'node:crypto';
import { PublicKey } from '@solana/web3.js';
import type { AppDeps } from './app';
import type { GameConfig, GameId } from '../types';
import { verifyDraw } from '../engine/rng';

function isValidPubkey(s: string): boolean {
  try {
    new PublicKey(s);
    return true;
  } catch {
    return false;
  }
}

function randomNumbers(count: number, max: number): number[] {
  const set = new Set<number>();
  while (set.size < count) {
    set.add(randomInt(1, max + 1));
  }
  return [...set].sort((a, b) => a - b);
}

export function createPublicRouter(deps: AppDeps): Router {
  const r = Router();

  /** All games: config + live state. */
  r.get('/games', async (_req, res, next) => {
    try {
      const configs = await deps.store.getAllConfigs();
      const states = await deps.store.getStates();
      const byGame = new Map(states.map((s) => [s.game, s]));
      res.json(
        configs.map((cfg) => ({
          game: cfg.game,
          state: byGame.get(cfg.game) ?? null,
          config: publicConfig(cfg),
        })),
      );
    } catch (err) {
      next(err);
    }
  });

  r.get('/games/:game', async (req, res, next) => {
    try {
      const game = gameParam(req.params.game);
      const cfg = await deps.store.getConfig(game);
      const state = await deps.store.getState(game);
      const draw = await deps.store.getDraw(game, state!.currentDrawId);
      res.json({ game, state, draw, config: publicConfig(cfg) });
    } catch (err) {
      next(err);
    }
  });

  // ------------------------------------------------------------------ draws

  r.get('/games/:game/draws', async (req, res, next) => {
    try {
      const game = gameParam(req.params.game);
      const limit = Math.min(Number(req.query.limit ?? 20) || 20, 100);
      const offset = Math.max(Number(req.query.offset ?? 0) || 0, 0);
      const draws = await deps.store.listDraws(game, limit, offset);
      res.json({ game, draws, count: draws.length });
    } catch (err) {
      next(err);
    }
  });

  r.get('/games/:game/draws/current', async (req, res, next) => {
    try {
      const game = gameParam(req.params.game);
      const state = await deps.store.getState(game);
      const draw = await deps.store.getDraw(game, state!.currentDrawId);
      res.json({ game, draw });
    } catch (err) {
      next(err);
    }
  });

  r.get('/games/:game/draws/:drawId', async (req, res, next) => {
    try {
      const game = gameParam(req.params.game);
      const draw = await deps.store.getDraw(game, Number(req.params.drawId));
      if (!draw) return res.status(404).json({ error: 'draw_not_found' });
      res.json({ game, draw });
    } catch (err) {
      next(err);
    }
  });

  /** Fairness proof: recompute numbers/rolldown from the revealed seed. */
  r.get('/games/:game/draws/:drawId/verify', async (req, res, next) => {
    try {
      const game = gameParam(req.params.game);
      const draw = await deps.store.getDraw(game, Number(req.params.drawId));
      if (!draw) return res.status(404).json({ error: 'draw_not_found' });
      if (!draw.revealSeed || !draw.winningNumbers) {
        return res.status(409).json({ error: 'draw_not_revealed' });
      }
      const cfg = await deps.store.getConfig(game);
      const result = verifyDraw({
        seedHex: draw.revealSeed,
        expectedNumbers: draw.winningNumbers,
        count: cfg.numbersPerTicket,
        max: cfg.maxNumber,
        expectedRolldownDecided: draw.rolldownDecided === 1,
        probabilityBps: draw.rolldownProbabilityBps ?? 0,
      });
      res.json({
        game,
        drawId: draw.drawId,
        commitment: draw.commitment,
        revealSeed: draw.revealSeed,
        winningNumbers: draw.winningNumbers,
        recomputedNumbers: result.recomputedNumbers,
        numbersMatch: result.numbersMatch,
        rolldownMatches: result.rolldownMatches,
        valid: result.numbersMatch && result.rolldownMatches,
      });
    } catch (err) {
      next(err);
    }
  });

  // ------------------------------------------------------------------ orders

  /**
   * Create a ticket order.
   * body: { wallet, game, numbers?, count?, fundSource? }
   *   fundSource 'balance' | 'free' | 'crypto' (default)
   */
  r.post('/orders', async (req, res, next) => {
    try {
      const body = req.body ?? {};
      const wallet = String(body.wallet ?? '');
      if (!isValidPubkey(wallet)) return res.status(400).json({ error: 'invalid_wallet' });
      const game = gameParam(String(body.game ?? ''));
      const count = Math.max(1, Math.min(Number(body.count ?? 1) || 1, 50));
      const fundSource = String(body.fundSource ?? 'crypto');

      const cfg = await deps.store.getConfig(game);
      const state = await deps.store.getState(game);
      if (!state) return res.status(500).json({ error: 'no_game_state' });
      if (state.isPaused) return res.status(409).json({ error: 'game_paused' });

      // Sales window check (cutoff).
      const now = Math.floor(Date.now() / 1000);
      const closeAt = state.nextDrawTimestamp - cfg.saleCutoffS;
      if (now >= closeAt) {
        return res.status(409).json({ error: 'sales_closed', nextDrawAt: state.nextDrawTimestamp });
      }
      if (state.status !== 'scheduled') {
        return res.status(409).json({ error: `draw_not_open:${state.status}` });
      }

      // Per-wallet cap (Quick Pick).
      if (cfg.maxTicketsPerWallet > 0) {
        const existing = await deps.store.countTicketsByWallet(game, state.currentDrawId, wallet);
        if (existing + count > cfg.maxTicketsPerWallet) {
          return res.status(409).json({
            error: 'per_wallet_limit_exceeded',
            limit: cfg.maxTicketsPerWallet,
            existing,
          });
        }
      }

      // Numbers validation / generation.
      let numbers: number[] | null = null;
      if (Array.isArray(body.numbers)) {
        numbers = validateNumbers(body.numbers, cfg.numbersPerTicket, cfg.maxNumber);
        if (!numbers) return res.status(400).json({ error: 'invalid_numbers' });
      }

      const costUsdc = count * cfg.ticketPriceUsdc;

      if (fundSource === 'balance') {
        const ok = await deps.store.debit(wallet, costUsdc, 'purchase', null, `order (${game} draw #${state.currentDrawId})`);
        if (!ok) {
          return res.status(402).json({
            error: 'insufficient_balance',
            requiredUsdc: costUsdc,
            balanceUsdc: (await deps.store.getBalance(wallet)).balanceUsdc,
          });
        }
        const tickets = await deps.store.issueTickets({
          game,
          drawId: state.currentDrawId,
          wallet,
          numbersList: ticketNumbersList(numbers, cfg, count),
          paidUsdc: costUsdc,
          method: 'balance',
          isFree: false,
          ledgerKind: 'purchase',
          ledgerRef: null,
          ledgerMemo: `balance-funded (${game} draw #${state.currentDrawId})`,
        });
        return res.status(201).json({ ok: true, tickets, fundedBy: 'balance' });
      }

      if (fundSource === 'free') {
        if (game !== 'main') return res.status(400).json({ error: 'free_tickets_main_only' });
        const used = await deps.store.useFreeTickets(wallet, count);
        if (!used) return res.status(402).json({ error: 'no_free_tickets' });
        const tickets = await deps.store.issueTickets({
          game,
          drawId: state.currentDrawId,
          wallet,
          numbersList: ticketNumbersList(numbers, cfg, count),
          paidUsdc: 0,
          method: 'free',
          isFree: true,
          ledgerKind: 'purchase',
          ledgerRef: null,
          ledgerMemo: `free ticket (${game} draw #${state.currentDrawId})`,
        });
        return res.status(201).json({ ok: true, tickets, fundedBy: 'free' });
      }

      // --- crypto deposit order ---------------------------------------------
      if (!deps.cfg.treasuryPubkey) {
        return res.status(503).json({ error: 'crypto_unconfigured', hint: 'set JEBU_TREASURY_PUBKEY' });
      }
      const orderId = `ord_${randomInt(1_000_000, 9_999_999)}_${Date.now().toString(36)}`;
      const createdAt = now;
      const expiresAt = now + deps.cfg.orderExpiryS;
      await deps.store.createDepositOrder({
        id: orderId,
        wallet,
        game,
        numbers,
        count,
        amountUsdc: costUsdc,
        status: 'open',
        createdAt,
        expiresAt,
        fulfilledAt: null,
      });
      return res.status(201).json({
        ok: true,
        orderId,
        game,
        count,
        amountUsdc: costUsdc,
        amountUsd: costUsdc / 1e6,
        treasuryAddress: deps.cfg.treasuryPubkey,
        accepts: ['USDC', 'SOL'],
        expiresAt,
      });
    } catch (err) {
      next(err);
    }
  });

  r.get('/orders/:id', async (req, res, next) => {
    try {
      const order = await deps.store.getOrder(String(req.params.id));
      if (!order) return res.status(404).json({ error: 'order_not_found' });
      res.json({ order });
    } catch (err) {
      next(err);
    }
  });

  // ------------------------------------------------------------------ wallet

  r.get('/wallets/:wallet', async (req, res, next) => {
    try {
      const wallet = String(req.params.wallet);
      if (!isValidPubkey(wallet)) return res.status(400).json({ error: 'invalid_wallet' });
      const balance = await deps.store.getBalance(wallet);
      const ledger = await deps.store.listLedger(wallet, 25);
      const claims = await deps.store.listClaimsByWallet(wallet, 25);
      const states = await deps.store.getStates();
      const ticketsByGame: Record<string, unknown[]> = {};
      for (const st of states) {
        ticketsByGame[st.game] = await deps.store.getTicketsByWallet(st.game, st.currentDrawId, wallet);
      }
      res.json({ wallet, balance, ledger, claims, currentDrawTickets: ticketsByGame });
    } catch (err) {
      next(err);
    }
  });

  // ------------------------------------------------------------------ claims

  r.post('/claims', async (req, res, next) => {
    try {
      const body = req.body ?? {};
      const wallet = String(body.wallet ?? '');
      const ticketIds = Array.isArray(body.ticketIds)
        ? body.ticketIds.map(Number).filter((n: number) => Number.isInteger(n) && n > 0)
        : [];
      if (!isValidPubkey(wallet)) return res.status(400).json({ error: 'invalid_wallet' });
      if (ticketIds.length === 0) return res.status(400).json({ error: 'no_ticket_ids' });

      const created: Array<{ claimId: number; ticketId: number; tier: number; amountUsdc: number }> = [];
      const errors: string[] = [];
      const now = Math.floor(Date.now() / 1000);

      for (const ticketId of ticketIds) {
        const ticket = await deps.store.getTicketById(ticketId);
        if (!ticket) {
          errors.push(`ticket_${ticketId}:not_found`);
          continue;
        }
        if (ticket.wallet !== wallet) {
          errors.push(`ticket_${ticketId}:not_owner`);
          continue;
        }
        const cfg = await deps.store.getConfig(ticket.game);
        const draw = await deps.store.getDraw(ticket.game, ticket.drawId);
        if (!draw || draw.status !== 'finalized' || !draw.winningNumbers || !draw.prizePerWinnerUsdc) {
          errors.push(`ticket_${ticketId}:draw_not_finalized`);
          continue;
        }
        const tier = matchTier(ticket.numbers, draw.winningNumbers);
        const amount = draw.prizePerWinnerUsdc[tier] ?? 0;
        if (amount <= 0 || tier === cfg.numbersPerTicket || tier < 3) {
          errors.push(`ticket_${ticketId}:no_cash_prize`);
          continue;
        }
        if (now - draw.finalizedAt! > cfg.claimExpirationS) {
          errors.push(`ticket_${ticketId}:claim_expired`);
          continue;
        }
        const claimId = await deps.store.createClaim({
          wallet,
          game: ticket.game,
          drawId: ticket.drawId,
          ticketId,
          tier,
          amountUsdc: amount,
        });
        if (claimId === null) {
          errors.push(`ticket_${ticketId}:already_claimed`);
        } else {
          created.push({ claimId, ticketId, tier, amountUsdc: amount });
        }
      }

      res.status(created.length > 0 ? 201 : 400).json({ created, errors });
    } catch (err) {
      next(err);
    }
  });

  return r;
}

// ------------------------------------------------------------------ helpers

function gameParam(v: string): GameId {
  if (v === 'main' || v === 'quickpick') return v;
  throw new Error('unknown_game');
}

function publicConfig(cfg: GameConfig) {
  return {
    game: cfg.game,
    ticketPriceUsdc: cfg.ticketPriceUsdc,
    numbersPerTicket: cfg.numbersPerTicket,
    maxNumber: cfg.maxNumber,
    drawIntervalS: cfg.drawIntervalS,
    saleCutoffS: cfg.saleCutoffS,
    minDrawIntervalS: cfg.minDrawIntervalS,
    saleTargetTickets: cfg.saleTargetTickets,
    seedAmountUsdc: cfg.seedAmountUsdc,
    softCapUsdc: cfg.softCapUsdc,
    hardCapUsdc: cfg.hardCapUsdc,
    feeRolldownBps: cfg.feeRolldownBps,
    fixedPrizes: cfg.fixedPrizes,
    rolldownAllocationBps: cfg.rolldownAllocationBps,
    maxTicketsPerWallet: cfg.maxTicketsPerWallet,
    claimExpirationS: cfg.claimExpirationS,
  };
}

function validateNumbers(input: unknown, count: number, max: number): number[] | null {
  if (!Array.isArray(input) || input.length !== count) return null;
  const nums = input.map(Number);
  if (nums.some((n) => !Number.isInteger(n) || n < 1 || n > max)) return null;
  if (new Set(nums).size !== count) return null;
  return nums.sort((a, b) => a - b);
}

function ticketNumbersList(numbers: number[] | null, cfg: { numbersPerTicket: number; maxNumber: number }, count: number): number[][] {
  if (numbers) return [numbers];
  return Array.from({ length: count }, () => randomNumbers(cfg.numbersPerTicket, cfg.maxNumber));
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

