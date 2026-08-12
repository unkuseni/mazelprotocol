/** `jebu payouts …` — manage prize claim payouts. */
import type { Store } from '../db/store';
import { short, ts, usd } from './util';

export function registerPayouts(program: import('commander').Command, getStore: () => Store): void {
  const payouts = program.command('payouts').description('manage claim payouts');

  payouts
    .command('list')
    .description('list claims')
    .option('-s, --status <status>', 'filter: pending|processing|paid|expired|reclaimed', 'pending')
    .action(async (opts) => {
      const store = getStore();
      const claims = await store.listClaims(opts.status as never, 100);
      if (claims.length === 0) {
        console.log(`no claims with status '${opts.status}'`);
        return;
      }
      for (const c of claims) {
        console.log(
          `#${c.id} ${c.game} draw#${c.drawId} tier${c.tier} ${usd(c.amountUsdc)} → ${short(c.wallet)} ` +
          `[${c.status}] created ${ts(c.createdAt)}`,
        );
      }
    });

  payouts
    .command('pay <claimId>')
    .description('mark a claim as paid (after sending the crypto payout)')
    .option('-t, --tx <signature>', 'optional on-chain transaction signature')
    .action(async (claimId, opts) => {
      const store = getStore();
      const { claim, ok } = await store.markClaimPaid(Number(claimId), opts.tx ?? null);
      if (!ok) {
        console.error(`claim #${claimId} not payable (current status: ${claim?.status ?? 'unknown'})`);
        process.exit(1);
      }
      console.log(`✅ claim #${claim.id} marked paid: ${usd(claim.amountUsdc)} → ${claim.wallet}`);
    });
}
