/** `jebu serve` — run API server + draw scheduler + payment watcher. */
import type { AppConfig } from '../config';
import type { Store } from '../db/store';
import { DrawService } from '../engine/drawService';
import { SolanaWatcher } from '../crypto/solana';
import { PaymentProcessor } from '../crypto/payments';
import { createApp } from '../server/app';

export async function runServe(store: Store, cfg: AppConfig): Promise<void> {
  await store.init();

  const drawService = new DrawService(store, cfg);

  let watcher: SolanaWatcher | null = null;
  let paymentProcessor: PaymentProcessor | null = null;

  if (cfg.treasuryPubkey) {
    try {
      watcher = new SolanaWatcher({
        rpcUrl: cfg.rpcUrl,
        treasuryPubkey: cfg.treasuryPubkey,
        usdcMint: cfg.usdcMint,
        solUsdPrice: cfg.solUsdPrice,
        treasuryKeypair: cfg.treasuryKeypair,
      });
      paymentProcessor = new PaymentProcessor(store, watcher, cfg);
      const probe = await watcher.probe().catch(() => null);
      if (probe) {
        console.log(`[crypto] treasury=${watcher.treasuryPubkey.toBase58()} usdcAta=${watcher.treasuryAta.toBase58()}`);
        console.log(`[crypto] treasury funded=${probe.treasuryExists} ataExists=${probe.ataExists} lamports=${probe.treasuryLamports}`);
      } else {
        console.warn('[crypto] ⚠️  could not probe RPC — is JEBU_RPC_URL reachable?');
      }
    } catch (err) {
      console.warn('[crypto] ⚠️  watcher init failed:', (err as Error).message);
    }
  } else {
    console.warn('[crypto] ⚠️  JEBU_TREASURY_PUBKEY not set — crypto orders disabled (use `jebu seed-balance` to test)');
  }

  const app = createApp({ store, drawService, paymentProcessor, watcher, cfg });
  const server = app.listen(cfg.port, cfg.host, () => {
    console.log(`[api] listening on http://${cfg.host}:${cfg.port}`);
  });

  drawService.start();
  paymentProcessor?.start();

  const shutdown = () => {
    console.log('\n[serve] shutting down…');
    drawService.stop();
    paymentProcessor?.stop();
    server.close(() => void store.close());
    setTimeout(() => process.exit(0), 500).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
