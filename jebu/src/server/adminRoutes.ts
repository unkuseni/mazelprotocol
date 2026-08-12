/**
 * Admin API — requires `Authorization: Bearer <JEBU_ADMIN_TOKEN>`.
 * Manual draw control, payouts, ledger, and game settings.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { timingSafeEqual } from 'node:crypto';
import type { AppDeps } from './app';
import type { GameId } from '../types';

export function createAdminRouter(deps: AppDeps): Router {
  const r = Router();

  r.use((req: Request, res: Response, next: NextFunction) => {
    const auth = req.headers.authorization ?? '';
    const expected = `Bearer ${deps.cfg.adminToken}`;
    // Constant-time comparison avoids leaking token length/prefix timing.
    const authOk =
      auth.length === expected.length &&
      timingSafeEqual(Buffer.from(auth), Buffer.from(expected));
    if (!authOk) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    next();
  });

  // ------------------------------------------------------------- draws

  r.post('/draws/:game/commit', async (req, res, next) => {
    try {
      const draw = await deps.drawService.beginDraw(gameParam(req.params.game));
      res.json({ ok: true, draw });
    } catch (err) {
      next(err);
    }
  });

  r.post('/draws/:game/reveal', async (req, res, next) => {
    try {
      const draw = await deps.drawService.revealDraw(gameParam(req.params.game));
      res.json({ ok: true, draw });
    } catch (err) {
      next(err);
    }
  });

  r.post('/draws/:game/finalize', async (req, res, next) => {
    try {
      const draw = await deps.drawService.finalizeDraw(gameParam(req.params.game));
      res.json({ ok: true, draw });
    } catch (err) {
      next(err);
    }
  });

  r.post('/draws/:game/skip', async (req, res, next) => {
    try {
      const draw = await deps.drawService.skipDraw(gameParam(req.params.game), 'manual admin skip');
      res.json({ ok: true, draw });
    } catch (err) {
      next(err);
    }
  });

  r.post('/draws/:game/tick', async (req, res, next) => {
    try {
      await deps.drawService.tickGame(gameParam(req.params.game));
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // ------------------------------------------------------------- payouts

  r.get('/payouts', async (req, res, next) => {
    try {
      const status = String(req.query.status ?? 'pending') as 'pending' | 'paid' | 'expired' | 'reclaimed' | 'processing';
      const claims = await deps.store.listClaims(status, 200);
      res.json({ claims });
    } catch (err) {
      next(err);
    }
  });

  r.post('/payouts/:id/pay', async (req, res, next) => {
    try {
      const txSignature = (req.body?.txSignature as string | undefined) ?? null;
      const { claim, ok } = await deps.store.markClaimPaid(Number(req.params.id), txSignature);
      if (!ok) return res.status(409).json({ error: 'claim_not_payable', claim });
      res.json({ ok: true, claim });
    } catch (err) {
      next(err);
    }
  });

  // ------------------------------------------------------------- ledger

  r.get('/ledger', async (req, res, next) => {
    try {
      const wallet = req.query.wallet ? String(req.query.wallet) : null;
      const entries = await deps.store.listLedger(wallet, 200);
      res.json({ entries });
    } catch (err) {
      next(err);
    }
  });

  /** Manual balance adjustment (reconciliation / testing). */
  r.post('/credit', async (req, res, next) => {
    try {
      const wallet = String(req.body?.wallet ?? '');
      const amountUsdc = Math.floor(Number(req.body?.amountUsdc));
      const memo = req.body?.memo ? String(req.body.memo) : null;
      if (!wallet || !Number.isInteger(amountUsdc) || amountUsdc === 0) {
        return res.status(400).json({ error: 'invalid_args' });
      }
      await deps.store.credit(wallet, Math.abs(amountUsdc), 'adjustment', null, memo ?? 'admin credit');
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // ------------------------------------------------------------- settings

  r.get('/settings/:game', async (req, res, next) => {
    try {
      const cfg = await deps.store.getConfig(gameParam(req.params.game));
      res.json({ game: cfg.game, config: cfg });
    } catch (err) {
      next(err);
    }
  });

  r.patch('/settings/:game', async (req, res, next) => {
    try {
      const game = gameParam(req.params.game);
      const cfg = await deps.store.getConfig(game);
      const patch = req.body ?? {};
      for (const [key, value] of Object.entries(patch)) {
        if (!(key in cfg)) continue;
        (cfg as unknown as Record<string, unknown>)[key] = value;
      }
      await deps.store.upsertConfig(cfg);
      res.json({ ok: true, game, config: cfg });
    } catch (err) {
      next(err);
    }
  });

  return r;
}

function gameParam(v: string): GameId {
  if (v === 'main' || v === 'quickpick') return v;
  throw new Error('unknown_game');
}
