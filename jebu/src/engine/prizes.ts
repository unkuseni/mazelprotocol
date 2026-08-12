/**
 * Prize engine — fees, revenue allocation, winner counting and the
 * fixed → pari-mutuel prize transition with rolldown support.
 *
 * Mirrors the on-chain MazelProtocol economics:
 * - Dynamic house fee by jackpot tier (28–40%), 28% during rolldown.
 * - Ticket revenue split: jackpot / fixed-prize / reserve / insurance pools.
 * - Fixed prizes in normal mode; pari-mutuel (shared pool) when rolldown fires
 *   or when fixed liability exceeds the fixed-prize pool.
 * - Probabilistic rolldown between soft/hard cap; forced at hard cap.
 * - Jackpot resets to the seed amount after a jackpot win or rolldown.
 */
import type { Allocations, GameConfig, GameState, GameId } from '../types';
import { countMatches } from './math';

export interface RevenueSplit {
  grossUsdc: number;
  houseFeeUsdc: number;
  jackpotAllocUsdc: number;
  fixedAllocUsdc: number;
  reserveAllocUsdc: number;
  insuranceAllocUsdc: number;
}

/** House fee bps for a jackpot level (dynamic tiers). */
export function feeBpsForJackpot(cfg: GameConfig, jackpotUsdc: number): number {
  let bps = cfg.feeTiers[cfg.feeTiers.length - 1]?.bps ?? 0;
  for (const tier of cfg.feeTiers) {
    if (jackpotUsdc < tier.thresholdUsdc) {
      bps = tier.bps;
      break;
    }
  }
  return bps;
}

/** Rolldown probability in bps (0–10000): 0 below soft cap, 10000 at/above hard cap, linear between. */
export function rolldownProbabilityBps(cfg: GameConfig, jackpotUsdc: number): number {
  if (jackpotUsdc < cfg.softCapUsdc) return 0;
  if (jackpotUsdc >= cfg.hardCapUsdc) return 10000;
  if (cfg.softCapUsdc >= cfg.hardCapUsdc) return 10000;
  const excess = jackpotUsdc - cfg.softCapUsdc;
  const range = cfg.hardCapUsdc - cfg.softCapUsdc;
  return Math.floor((excess * 10000) / range);
}

/** Split gross ticket revenue into pools. */
export function splitRevenue(
  grossUsdc: number,
  houseFeeBps: number,
  allocs: Allocations,
): RevenueSplit {
  const houseFeeUsdc = Math.floor((grossUsdc * houseFeeBps) / 10000);
  const netUsdc = grossUsdc - houseFeeUsdc;
  return {
    grossUsdc,
    houseFeeUsdc,
    jackpotAllocUsdc: Math.floor((netUsdc * allocs.jackpotBps) / 10000),
    fixedAllocUsdc: Math.floor((netUsdc * allocs.fixedBps) / 10000),
    reserveAllocUsdc: Math.floor((netUsdc * allocs.reserveBps) / 10000),
    insuranceAllocUsdc: Math.floor((netUsdc * allocs.insuranceBps) / 10000),
  };
}

export interface WinnerCounts {
  /** matchedCount → number of winning tickets. Only tiers > 0 stored. */
  counts: Record<number, number>;
  /** matchedCount → list of ticket indices. */
  byMatch: Map<number, number[]>;
}

export function countWinners(
  ticketNumbers: number[][],
  winningNumbers: number[],
  minTier: number,
  maxTier: number,
): WinnerCounts {
  const byMatch = new Map<number, number[]>();
  for (let i = 0; i < ticketNumbers.length; i++) {
    const m = countMatches(winningNumbers, ticketNumbers[i]);
    if (m < minTier || m > maxTier) continue;
    const list = byMatch.get(m) ?? [];
    list.push(i);
    byMatch.set(m, list);
  }
  const counts: Record<number, number> = {};
  for (const [tier, list] of byMatch) counts[tier] = list.length;
  return { counts, byMatch };
}

export interface FinalizeInput {
  game: GameId;
  cfg: GameConfig;
  state: GameState;
  /** Parallel array to ticketNumbers: wallet for each ticket (for free-ticket crediting). */
  ticketWallets: string[];
  ticketNumbers: number[][];
  winningNumbers: number[];
  /** Rolldown decision made at reveal (hard cap forced already applied). */
  rolldownDecided: boolean;
}

export interface TierPayout {
  /** prize per winning ticket in USDC lamports (0 = not paid this draw). */
  perWinnerUsdc: number;
  /** total paid out for this tier. */
  totalUsdc: number;
}

export interface FinalizeOutput {
  topTier: number;
  jackpotWinners: number;
  wasRolldown: boolean;
  winnerCounts: Record<number, number>;
  payouts: Record<number, TierPayout>;
  /** wallet → free tickets earned (main Match 2). */
  freeTicketsByWallet: Map<string, number>;
  jackpotAfterUsdc: number;
  fixedPoolAfterUsdc: number;
  reserveAfterUsdc: number;
  insuranceAfterUsdc: number;
  houseFeeAfterUsdc: number;
  totalCommittedUsdc: number;
  revenue: RevenueSplit;
}

/**
 * Compute the complete finalization result for a draw.
 *
 * Rules:
 * 1. Jackpot tier winners split the whole jackpot; jackpot resets to seed.
 * 2. Else if rolldown fired (decision && no jackpot winner): jackpot pools
 *    distribute pari-mutuel to lower tiers (empty tiers redistribute to the
 *    remaining non-empty tiers); jackpot resets to seed.
 * 3. Else: jackpot carries forward (+ this draw's jackpot allocation) and
 *    lower tiers are paid FIXED amounts from the fixed-prize pool.
 * 4. If fixed liability would exceed the available fixed pool, prizes scale
 *    down proportionally (pari-mutuel transition — caps operator liability).
 * 5. Free tickets (main Match 2) are credited to winners' balances.
 */
export function computeFinalize(input: FinalizeInput): FinalizeOutput {
  const { cfg, state, ticketWallets, ticketNumbers, winningNumbers, rolldownDecided } = input;
  const topTier = cfg.numbersPerTicket;
  const minTier = Math.min(...Object.keys(cfg.fixedPrizes).map(Number));

  const { counts, byMatch } = countWinners(ticketNumbers, winningNumbers, minTier, topTier);
  const jackpotWinners = counts[topTier] ?? 0;

  const grossUsdc = ticketNumbers.length * cfg.ticketPriceUsdc;
  const houseFeeBps = rolldownDecided ? cfg.feeRolldownBps : feeBpsForJackpot(cfg, state.jackpotBalanceUsdc);
  const revenue = splitRevenue(grossUsdc, houseFeeBps, cfg.allocations);

  const wasRolldown = jackpotWinners === 0 && rolldownDecided;

  const payouts: Record<number, TierPayout> = {};
  const freeTicketsByWallet = new Map<string, number>();
  let totalCommittedUsdc = 0;

  // --- jackpot distribution -------------------------------------------------
  let jackpotAfterUsdc = state.jackpotBalanceUsdc + revenue.jackpotAllocUsdc;
  if (jackpotWinners > 0) {
    const perWinner = Math.floor(state.jackpotBalanceUsdc / jackpotWinners);
    payouts[topTier] = { perWinnerUsdc: perWinner, totalUsdc: perWinner * jackpotWinners };
    totalCommittedUsdc += perWinner * jackpotWinners;
    jackpotAfterUsdc = cfg.seedAmountUsdc;
  } else if (wasRolldown) {
    // Distribute the whole jackpot pari-mutuel across lower tiers.
    const pool = state.jackpotBalanceUsdc;
    const tiers = Object.keys(cfg.rolldownAllocationBps)
      .map(Number)
      .filter((t) => (counts[t] ?? 0) > 0);
    const allocated = distributeRolldown(pool, cfg.rolldownAllocationBps, tiers, counts);
    for (const [tier, perWinner] of Object.entries(allocated)) {
      const t = Number(tier);
      payouts[t] = { perWinnerUsdc: perWinner, totalUsdc: perWinner * counts[t] };
      totalCommittedUsdc += perWinner * counts[t];
    }
    jackpotAfterUsdc = cfg.seedAmountUsdc;
  }
  // else: no jackpot winner, no rolldown → jackpot carries (jackpotAfter already includes alloc).

  // --- lower tiers: fixed prizes (or pari-mutuel transition) -----------------
  const fixedPoolAvailable = state.fixedPrizePoolUsdc + revenue.fixedAllocUsdc;
  const fixedTiers = Object.keys(cfg.fixedPrizes)
    .map(Number)
    .filter((t) => t < topTier && (counts[t] ?? 0) > 0);

  const fixedCost = fixedTiers.reduce(
    (sum, t) => sum + counts[t] * cfg.fixedPrizes[t].amountUsdc,
    0,
  );
  // Pari-mutuel transition: if fixed liability exceeds the pool, scale down.
  const scale = fixedCost > 0 && fixedCost > fixedPoolAvailable ? fixedPoolAvailable / fixedCost : 1;

  for (const t of fixedTiers) {
    const prize = cfg.fixedPrizes[t];
    const perWinner = Math.floor(prize.amountUsdc * scale);
    const total = perWinner * counts[t];
    payouts[t] = { perWinnerUsdc: perWinner, totalUsdc: total };
    totalCommittedUsdc += total;

    if (prize.freeTickets && prize.freeTickets > 0 && scale === 1) {
      // Credit free tickets to each winning wallet (main Match 2).
      for (const idx of byMatch.get(t) ?? []) {
        const wallet = ticketWallets[idx];
        if (wallet) {
          freeTicketsByWallet.set(wallet, (freeTicketsByWallet.get(wallet) ?? 0) + prize.freeTickets!);
        }
      }
    }
  }

  // Fixed pool consumed by lower-tier payouts (jackpot tier paid from jackpot balance).
  const fixedPaid = fixedTiers.reduce((sum, t) => sum + payouts[t].totalUsdc, 0);

  return {
    topTier,
    jackpotWinners,
    wasRolldown,
    winnerCounts: counts,
    payouts,
    freeTicketsByWallet,
    jackpotAfterUsdc,
    fixedPoolAfterUsdc: fixedPoolAvailable - fixedPaid,
    reserveAfterUsdc: state.reserveBalanceUsdc + revenue.reserveAllocUsdc,
    insuranceAfterUsdc: state.insuranceBalanceUsdc + revenue.insuranceAllocUsdc,
    houseFeeAfterUsdc: state.houseFeeCollectedUsdc + revenue.houseFeeUsdc,
    totalCommittedUsdc,
    revenue,
  };
}

/**
 * Distribute a jackpot pool pari-mutuel across non-empty rolldown tiers.
 * Empty tiers' shares are redistributed proportionally to the remaining tiers.
 * Returns { tier → per-winner USDC }.
 */
function distributeRolldown(
  pool: number,
  allocationBps: Record<number, number>,
  tiers: number[],
  counts: Record<number, number>,
): Record<number, number> {
  if (tiers.length === 0) return {};
  const totalBps = tiers.reduce((sum, t) => sum + (allocationBps[t] ?? 0), 0);
  if (totalBps <= 0) return {};
  const result: Record<number, number> = {};
  let distributed = 0;
  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i];
    const isLast = i === tiers.length - 1;
    // Proportional share over the ORIGINAL bps of winner tiers only.
    const share = Math.floor((pool * (allocationBps[t] ?? 0)) / totalBps);
    const tierPool = isLast ? pool - distributed : share;
    distributed += tierPool;
    result[t] = Math.floor(tierPool / counts[t]);
  }
  return result;
}
