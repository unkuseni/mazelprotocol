/** CLI shared helpers. */
import type { GameId } from '../types';

export function gameId(v: string): GameId {
  if (v === 'main' || v === 'quickpick') return v;
  throw new Error(`invalid game '${v}' — use 'main' or 'quickpick'`);
}

/** Format USDC lamports (6dp) as $X.XX. */
export function usd(v: number): string {
  return `$${(v / 1e6).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Format a timestamp as ISO (or '—'). */
export function ts(v: number | null): string {
  return v ? new Date(v * 1000).toISOString() : '—';
}

export function short(wallet: string): string {
  return wallet.length > 12 ? `${wallet.slice(0, 4)}…${wallet.slice(-4)}` : wallet;
}

export function drawSummary(d: {
  drawId: number;
  status: string;
  scheduledAt: number;
  winningNumbers: number[] | null;
  wasRolldown: number;
  ticketCount: number;
  totalCommittedUsdc: number;
  totalPaidUsdc: number;
}): string {
  const nums = d.winningNumbers ? d.winningNumbers.join('-') : '····';
  return (
    `#${d.drawId} [${d.status}] @ ${ts(d.scheduledAt)} ` +
    `nums=${nums} tickets=${d.ticketCount} rolldown=${d.wasRolldown ? '✓' : '·'} ` +
    `committed=${usd(d.totalCommittedUsdc)} paid=${usd(d.totalPaidUsdc)}`
  );
}
