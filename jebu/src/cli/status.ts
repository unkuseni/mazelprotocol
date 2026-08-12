/** `jebu status` — snapshot of games, pools, and recent draws. */
import type { Store } from '../db/store';
import { drawSummary, usd } from './util';

export async function runStatus(store: Store): Promise<void> {
  const states = await store.getStates();
  const configs = await store.getAllConfigs();

  for (const state of states) {
    const cfg = configs.find((c) => c.game === state.game)!;
    const draw = await store.getDraw(state.game, state.currentDrawId);
    console.log(`\n=== ${state.game.toUpperCase()} ===`);
    console.log(`  draw:        #${state.currentDrawId} [${state.status}]`);
    console.log(`  next draw:   ${draw ? new Date(draw.scheduledAt * 1000).toISOString() : '—'}`);
    console.log(`  jackpot:     ${usd(state.jackpotBalanceUsdc)}  (seed ${usd(cfg.seedAmountUsdc)}, soft ${usd(cfg.softCapUsdc)}, hard ${usd(cfg.hardCapUsdc)})`);
    console.log(`  fixed pool:  ${usd(state.fixedPrizePoolUsdc)}`);
    console.log(`  reserve:     ${usd(state.reserveBalanceUsdc)}   insurance: ${usd(state.insuranceBalanceUsdc)}`);
    console.log(`  house fees:  ${usd(state.houseFeeCollectedUsdc)}   tickets (draw): ${state.currentDrawTickets} (all-time): ${state.totalTicketsSold}`);
    console.log(`  prizes paid: ${usd(state.totalPrizesPaidUsdc)}`);
  }

  const recentMain = await store.listDraws('main', 5);
  if (recentMain.length > 0) {
    console.log('\n--- recent main draws ---');
    for (const d of recentMain) console.log('  ' + drawSummary(d));
  }
  const recentQp = await store.listDraws('quickpick', 5);
  if (recentQp.length > 0) {
    console.log('\n--- recent quickpick draws ---');
    for (const d of recentQp) console.log('  ' + drawSummary(d));
  }

  const pendingClaims = await store.listClaims('pending');
  console.log(`\npending claims: ${pendingClaims.length}`);
}
