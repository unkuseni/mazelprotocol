/** `jebu draws …` — inspect and manually drive draw cycles. */
import type { Store } from '../db/store';
import type { DrawService } from '../engine/drawService';
import { drawSummary, gameId } from './util';

export function registerDraws(program: import('commander').Command, getDeps: () => { store: Store; draws: DrawService }): void {
  const draws = program.command('draws').description('inspect and control draw cycles');

  draws
    .command('list')
    .description('list recent draws')
    .option('-g, --game <game>', 'game (main | quickpick)', 'main')
    .option('-n, --limit <n>', 'number of draws', '10')
    .action(async (opts) => {
      const { store } = getDeps();
      const rows = await store.listDraws(gameId(opts.game), Number(opts.limit));
      for (const d of rows) console.log(drawSummary(d));
    });

  draws
    .command('show <drawId>')
    .description('show one draw in detail')
    .option('-g, --game <game>', 'game (main | quickpick)', 'main')
    .action(async (drawId, opts) => {
      const { store } = getDeps();
      const d = await store.getDraw(gameId(opts.game), Number(drawId));
      if (!d) {
        console.error('draw not found');
        process.exit(1);
      }
      console.log(JSON.stringify(d, null, 2));
    });

  draws
    .command('commit')
    .description('commit randomness for the current draw')
    .option('-g, --game <game>', 'game (main | quickpick)', 'main')
    .action(async (opts) => {
      await getDeps().draws.beginDraw(gameId(opts.game));
    });

  draws
    .command('reveal')
    .description('reveal randomness for the current draw')
    .option('-g, --game <game>', 'game (main | quickpick)', 'main')
    .action(async (opts) => {
      await getDeps().draws.revealDraw(gameId(opts.game));
    });

  draws
    .command('finalize')
    .description('finalize the current draw')
    .option('-g, --game <game>', 'game (main | quickpick)', 'main')
    .action(async (opts) => {
      await getDeps().draws.finalizeDraw(gameId(opts.game));
    });

  draws
    .command('skip')
    .description('skip the current draw (advance to next cycle)')
    .option('-g, --game <game>', 'game (main | quickpick)', 'main')
    .action(async (opts) => {
      await getDeps().draws.skipDraw(gameId(opts.game), 'manual skip');
    });

  draws
    .command('tick')
    .description('run one scheduler tick for a game')
    .option('-g, --game <game>', 'game (main | quickpick)', 'main')
    .action(async (opts) => {
      await getDeps().draws.tickGame(gameId(opts.game));
      console.log('tick done');
    });
}
