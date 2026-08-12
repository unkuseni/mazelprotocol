/**
 * Combinatorics and probability helpers for the lottery matrix.
 */

/** C(n, k) — number of combinations, computed exactly with BigInt then reduced. */
export function combination(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  const kk = Math.min(k, n - k);
  let result = 1n;
  for (let i = 0; i < kk; i++) {
    result = (result * BigInt(n - i)) / BigInt(i + 1);
  }
  return Number(result);
}

/**
 * Odds (1 in X) of matching exactly `matched` out of `drawn` from a pool of
 * `range` total numbers.
 *
 * P(k) = C(drawn, k) * C(range - drawn, drawn - k) / C(range, drawn)
 */
export function oddsOfExactMatch(range: number, drawn: number, matched: number): number {
  const total = combination(range, drawn);
  const favorable = combination(drawn, matched) * combination(range - drawn, drawn - matched);
  return total / Math.max(favorable, 1);
}

/**
 * Expected value of a single ticket in USDC lamports given per-tier prizes
 * (amount per winning ticket, 0 for unlisted tiers) and the jackpot prize.
 */
export function expectedValueUsdc(
  range: number,
  drawn: number,
  prizeByMatch: Record<number, number>,
): number {
  let ev = 0;
  for (let k = 2; k <= drawn; k++) {
    const prize = prizeByMatch[k] ?? 0;
    if (prize <= 0) continue;
    ev += prize / oddsOfExactMatch(range, drawn, k);
  }
  return ev;
}

/** Count how many numbers in `ticket` appear in `winning` (both sorted arrays). */
export function countMatches(winning: number[], ticket: number[]): number {
  let i = 0;
  let j = 0;
  let matches = 0;
  while (i < winning.length && j < ticket.length) {
    if (winning[i] === ticket[j]) {
      matches++;
      i++;
      j++;
    } else if (winning[i] < ticket[j]) {
      i++;
    } else {
      j++;
    }
  }
  return matches;
}

/** Group tickets by match count → { matchedCount: ticketIndex[] }. */
export function groupByMatchCount(
  tickets: number[][],
  winning: number[],
): Map<number, number[]> {
  const groups = new Map<number, number[]>();
  for (let i = 0; i < tickets.length; i++) {
    const m = countMatches(winning, tickets[i]);
    const list = groups.get(m) ?? [];
    list.push(i);
    groups.set(m, list);
  }
  return groups;
}
