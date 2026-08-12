/** `jebu settings …` and dev helpers (`seed-balance`, `credit-free-tickets`). */
import { PublicKey } from '@solana/web3.js';
import type { Store } from '../db/store';
import { gameId, usd } from './util';

export function registerSettings(program: import('commander').Command, getStore: () => Store): void {
  const settings = program.command('settings').description('view/edit game settings');

  settings
    .command('get')
    .description('show the full config for a game')
    .option('-g, --game <game>', 'game (main | quickpick)', 'main')
    .action(async (opts) => {
      const cfg = await getStore().getConfig(gameId(opts.game));
      console.log(JSON.stringify(cfg, null, 2));
    });

  settings
    .command('set')
    .description('set one config field, e.g. --key saleTargetTickets --value 10000')
    .option('-g, --game <game>', 'game (main | quickpick)', 'main')
    .option('-k, --key <key>', 'config key (e.g. saleTargetTickets, drawIntervalS)')
    .option('-v, --value <value>', 'new value (JSON-parsed)')
    .action(async (opts) => {
      if (!opts.key || opts.value === undefined) {
        console.error('usage: jebu settings set -g <game> -k <key> -v <value>');
        process.exit(1);
      }
      const store = getStore();
      const game = gameId(opts.game);
      const cfg = await store.getConfig(game);
      let value: unknown = opts.value;
      try {
        value = JSON.parse(opts.value);
      } catch {
        // keep as string
      }
      if (!(opts.key in cfg)) {
        console.error(`unknown key '${opts.key}'. Known keys:\n${Object.keys(cfg).join('\n')}`);
        process.exit(1);
      }
      (cfg as unknown as Record<string, unknown>)[opts.key] = value;
      await store.upsertConfig(cfg);
      console.log(`✅ ${game}.${opts.key} = ${JSON.stringify(value)}`);
    });
}

export function registerDev(program: import('commander').Command, getStore: () => Store): void {
  program
    .command('seed-balance')
    .description('dev tool: credit a wallet balance without a real crypto payment')
    .argument('<wallet>', 'wallet public key (base58)')
    .argument('<amountUsdc>', 'amount in USDC lamports (e.g. 2500000 = $2.50)')
    .option('-m, --memo <memo>', 'ledger memo')
    .action(async (wallet, amountUsdc, opts) => {
      try {
        new PublicKey(wallet);
      } catch {
        console.error('invalid wallet public key');
        process.exit(1);
      }
      const amount = Math.floor(Number(amountUsdc));
      if (!Number.isInteger(amount) || amount <= 0) {
        console.error('amount must be a positive integer of USDC lamports');
        process.exit(1);
      }
      const store = getStore();
      await store.credit(wallet, amount, 'adjustment', null, opts.memo ?? 'dev seed');
      console.log(`✅ credited ${usd(amount)} → ${wallet}`);
    });

  program
    .command('credit-free-tickets')
    .description('dev tool: credit main-lottery free tickets (Match 2 equivalent)')
    .argument('<wallet>', 'wallet public key (base58)')
    .argument('<count>', 'number of free tickets')
    .action(async (wallet, count) => {
      const store = getStore();
      await store.creditFreeTickets(wallet, Math.floor(Number(count)), 'dev');
      console.log(`✅ credited ${count} free ticket(s) → ${wallet}`);
    });
}
