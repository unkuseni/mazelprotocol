/**
 * Express application for the JEBU API.
 * Public routes for players; `/api/admin/*` routes require a bearer token.
 */
import express from 'express';
import cors from 'cors';
import type { AppConfig } from '../config';
import type { Store } from '../db/store';
import type { DrawService } from '../engine/drawService';
import type { PaymentProcessor } from '../crypto/payments';
import type { SolanaWatcher } from '../crypto/solana';
import { createPublicRouter } from './routes';
import { createAdminRouter } from './adminRoutes';

export interface AppDeps {
  store: Store;
  drawService: DrawService;
  paymentProcessor: PaymentProcessor | null;
  watcher: SolanaWatcher | null;
  cfg: AppConfig;
}

export function createApp(deps: AppDeps): express.Express {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '256kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, ts: Date.now(), version: '0.1.0' });
  });

  app.use('/api', createPublicRouter(deps));
  app.use('/api/admin', createAdminRouter(deps));

  // 404 + error handlers
  app.use((_req, res) => res.status(404).json({ error: 'not_found' }));
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[api] unhandled error:', err);
    res.status(500).json({ error: 'internal_error', message: err.message });
  });

  return app;
}
