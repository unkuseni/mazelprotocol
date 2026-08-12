#!/usr/bin/env node
/**
 * JEBU — offchain provably-fair lottery with crypto (SOL/USDC) funding.
 *
 * CLI entry:
 *   jebu init                          create DB + seed games
 *   jebu serve                         API + scheduler + payment watcher
 *   jebu scheduler                     run the draw scheduler only
 *   jebu watch                         run the payment watcher only
 *   jebu status                        game/pool snapshot
 *   jebu draws list|show|commit|reveal|finalize|skip|tick
 *   jebu payouts list|pay <claimId>
 *   jebu settings get|set
 *   jebu seed-balance <wallet> <amountUsdc>      (dev)
 *   jebu credit-free-tickets <wallet> <count>    (dev)
 */
import { Command } from 'commander';
import { loadConfig } from './config';
import { Store } from './db/store';
import { DrawService } from './engine/drawService';
import { SolanaWatcher } from './crypto/solana';
import { PaymentProcessor } from './crypto/payments';
import { runServe } from './cli/serve';
import { runStatus } from './cli/status';
import { registerDraws } from './cli/draws';
import { registerPayouts } from './cli/payouts';
import { registerDev, registerSettings } from './cli/settings';

async function main(): Promise<void> {
  const cfg = loadConfig();
  const store = new Store(cfg.databaseUrl, cfg.databaseAuthToken);
  const program = new Command();

  program
    .name('jebu')
    .description('Offchain provably-fair lottery funded by SOL/USDC (libSQL + Solana)')
    .version('0.1.0');

  const getDeps = () => ({ store, draws: new DrawService(store, cfg) });

  program
    .command('init')
    .description('create the database schema and seed both games')
    .action(async () => {
      await store.init();
      console.log('✅ database initialized (games: main, quickpick)');
      await store.close();
    });

  program
    .command('serve')
    .description('run API server + draw scheduler + payment watcher')
    .action(() => runServe(store, cfg));

  program
    .command('scheduler')
    .description('run the draw scheduler only')
    .action(async () => {
      await store.init();
      const draws = new DrawService(store, cfg);
      draws.start();
      console.log('[scheduler] running — Ctrl+C to stop');
      const stop = () => {
        draws.stop();
        void store.close();
        process.exit(0);
      };
      process.on('SIGINT', stop);
      process.on('SIGTERM', stop);
    });

  program
    .command('watch')
    .description('run the payment watcher only')
    .action(async () => {
      await store.init();
      if (!cfg.treasuryPubkey) {
        console.error('JEBU_TREASURY_PUBKEY is required for the payment watcher');
        process.exit(1);
      }
      const watcher = new SolanaWatcher({
        rpcUrl: cfg.rpcUrl,
        treasuryPubkey: cfg.treasuryPubkey,
        usdcMint: cfg.usdcMint,
        solUsdPrice: cfg.solUsdPrice,
        treasuryKeypair: cfg.treasuryKeypair,
      });
      const payments = new PaymentProcessor(store, watcher, cfg);
      console.log(`[watch] watching ${watcher.treasuryPubkey.toBase58()} (ATA ${watcher.treasuryAta.toBase58()})`);
      payments.start();
      const stop = () => {
        payments.stop();
        void store.close();
        process.exit(0);
      };
      process.on('SIGINT', stop);
      process.on('SIGTERM', stop);
    });

  program
    .command('status')
    .description('show game status, pools, and recent draws')
    .action(async () => {
      await store.init();
      await runStatus(store);
      await store.close();
    });

  registerDraws(program, getDeps);
  registerPayouts(program, () => store);
  registerSettings(program, () => store);
  registerDev(program, () => store);

  await program.parseAsync(process.argv);
}

main().catch((err) => {
  console.error('fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
