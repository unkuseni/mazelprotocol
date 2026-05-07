/**
 * /rolldown command — Detailed rolldown status and +EV analysis.
 */

import { fetchMainLotteryState, fetchQPLotteryState } from "../solana";
import {
  formatUsdc,
  formatProbability,
  escapeHtml,
} from "../utils";
import { BPS_DENOMINATOR } from "../config";

/**
 * Calculate rolldown probability in basis points.
 */
function calcRolldownProb(jackpot: bigint, soft: bigint, hard: bigint): number {
  const j = Number(jackpot);
  const s = Number(soft);
  const h = Number(hard);
  if (j >= h) return BPS_DENOMINATOR;
  if (j <= s) return 0;
  const range = h - s;
  const progress = j - s;
  return Math.floor((progress / range) * BPS_DENOMINATOR);
}

/**
 * Estimate pari-mutuel prizes during rolldown for main lottery.
 * Uses conservative assumptions about ticket sales.
 */
function estimateMainRolldownPrizes(jackpot: bigint, estimatedTickets: number = 500_000): {
  match5PerWinner: number;
  match4PerWinner: number;
  match3PerWinner: number;
  totalEV: number;
} {
  const jackpotUSD = Number(jackpot) / 1_000_000;

  // Estimated winners based on probability * ticket count
  const estMatch5Winners = Math.max(1, Math.floor(estimatedTickets / 39_028));
  const estMatch4Winners = Math.max(1, Math.floor(estimatedTickets / 800));
  const estMatch3Winners = Math.max(1, Math.floor(estimatedTickets / 47));

  // Pool splits: 25% to Match 5, 35% to Match 4, 40% to Match 3
  const match5Pool = jackpotUSD * 0.25;
  const match4Pool = jackpotUSD * 0.35;
  const match3Pool = jackpotUSD * 0.40;

  const match5PerWinner = match5Pool / estMatch5Winners;
  const match4PerWinner = match4Pool / estMatch4Winners;
  const match3PerWinner = match3Pool / estMatch3Winners;

  // EV calculation (excluding Match 6 jackpot)
  const totalEV =
    (match5PerWinner * (1 / 39_028) +
      match4PerWinner * (1 / 800) +
      match3PerWinner * (1 / 47)) * (1 / 39_028 + 1 / 800 + 1 / 47 > 0 ? 1 : 0);

  // Simpler EV: sum of (prize * probability)
  const ev =
    match5PerWinner / 39_028 +
    match4PerWinner / 800 +
    match3PerWinner / 47;

  return {
    match5PerWinner: Math.round(match5PerWinner * 100) / 100,
    match4PerWinner: Math.round(match4PerWinner * 100) / 100,
    match3PerWinner: Math.round(match3PerWinner * 100) / 100,
    totalEV: Math.round(ev * 100) / 100,
  };
}

export async function handleRolldown(): Promise<string> {
  const lines: string[] = [];

  // =========================================================================
  // MAIN LOTTERY
  // =========================================================================
  try {
    const main = await fetchMainLotteryState();

    const jackpot = main.jackpotBalance;
    const softCap = main.softCap;
    const hardCap = main.hardCap;
    const isRolldown = main.isRolldownActive;
    const probBps = calcRolldownProb(jackpot, softCap, hardCap);

    const jackpotUSD = Number(jackpot) / 1_000_000;
    const softUSD = Number(softCap) / 1_000_000;
    const hardUSD = Number(hardCap) / 1_000_000;

    lines.push(`<b>🔥 Main Lottery Rolldown Status</b>`);
    lines.push("");

    // Progress visualization
    const progress = Math.min(100, (jackpotUSD / hardUSD) * 100);
    const barLen = 20;
    const filled = Math.floor((progress / 100) * barLen);
    const bar = "█".repeat(Math.min(filled, barLen)) + "░".repeat(Math.max(0, barLen - filled));

    lines.push(`  <code>$${softUSD.toFixed(1)}K  ${bar}  $${(hardUSD / 1000).toFixed(2)}M</code>`);
    lines.push(`  ${" ".repeat(10)}Soft Cap${" ".repeat(barLen - 6)}Hard Cap`);
    lines.push("");

    if (isRolldown) {
      lines.push(`  🔥 <b>ROLLDOWN IS ACTIVE!</b>`);
      lines.push(`  All non-jackpot prizes are now pari-mutuel (shared pool).`);
    } else if (probBps > 0) {
      lines.push(`  🎲 <b>Rolldown Probability:</b> ${formatProbability(probBps)} per draw`);
      lines.push(`  📈 Progress: $${(jackpotUSD / 1000).toFixed(0)}K / $${(hardUSD / 1000).toFixed(0)}K`);
    } else {
      const toSoft = softUSD * 1_000_000 - jackpotUSD;
      lines.push(`  📉 <b>No rolldown risk yet.</b>`);
      lines.push(`  💰 $${(toSoft / 1_000_000).toFixed(2)}M needed to reach soft cap at $${(softUSD / 1_000_000).toFixed(2)}M`);
    }

    lines.push("");

    if (isRolldown || probBps > 0) {
      const est = estimateMainRolldownPrizes(jackpot);
      const ticketPrice = 2.50;
      const evEdge = est.totalEV - ticketPrice;

      lines.push(`  <b>📊 Estimated Pari-Mutuel Prizes (if rolldown triggers):</b>`);
      lines.push(`  🔵 Match 5: ~$${est.match5PerWinner.toLocaleString()} per winner`);
      lines.push(`  🟢 Match 4: ~$${est.match4PerWinner.toLocaleString()} per winner`);
      lines.push(`  🟡 Match 3: ~$${est.match3PerWinner.toLocaleString()} per winner`);
      lines.push("");
      lines.push(`  💰 <b>Estimated EV:</b> $${est.totalEV.toFixed(2)} per $2.50 ticket`);
      if (evEdge > 0) {
        lines.push(`  📈 <b>Player Edge: +$${evEdge.toFixed(2)} (+${((evEdge / ticketPrice) * 100).toFixed(0)}%)</b>`);
      } else {
        lines.push(`  📉 Player Edge: $${evEdge.toFixed(2)}`);
      }
      lines.push(`  <i>Estimates assume ~500K tickets sold. Actual prizes vary.</i>`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    lines.push(`<b>🎟 Main Lottery:</b> ❌ ${escapeHtml(msg)}`);
  }

  lines.push("");
  lines.push("──────────────────────────");
  lines.push("");

  // =========================================================================
  // QUICK PICK
  // =========================================================================
  try {
    const qp = await fetchQPLotteryState();

    const jackpot = qp.jackpotBalance;
    const softCap = qp.softCap;
    const hardCap = qp.hardCap;
    const isRolldown = qp.isRolldownPending;
    const probBps = calcRolldownProb(jackpot, softCap, hardCap);

    const jackpotUSD = Number(jackpot) / 1_000_000;
    const softUSD = Number(softCap) / 1_000_000;
    const hardUSD = Number(hardCap) / 1_000_000;

    lines.push(`<b>⚡ Quick Pick Express Rolldown</b>`);
    lines.push("");

    const progress = Math.min(100, (jackpotUSD / hardUSD) * 100);
    const barLen = 20;
    const filled = Math.floor((progress / 100) * barLen);
    const bar = "█".repeat(Math.min(filled, barLen)) + "░".repeat(Math.max(0, barLen - filled));

    lines.push(`  <code>$${softUSD.toFixed(0)}K   ${bar}   $${hardUSD.toFixed(0)}K</code>`);
    lines.push("");

    if (isRolldown) {
      lines.push(`  🔥 <b>ROLLDOWN IS ACTIVE!</b>`);

      // Estimate QP rolldown prizes
      const jpUSD = Number(jackpot) / 1_000_000;
      const estTickets = 50_000;
      const estMatch4Winners = Math.max(1, Math.floor(estTickets / 2_165));
      const estMatch3Winners = Math.max(1, Math.floor(estTickets / 72));
      const match4Pool = jpUSD * 0.60;
      const match3Pool = jpUSD * 0.40;
      const match4Each = match4Pool / estMatch4Winners;
      const match3Each = match3Pool / estMatch3Winners;
      const ev = match4Each / 2165 + match3Each / 72;

      lines.push(`  🔵 Match 4: ~$${match4Each.toFixed(0)} per winner (60% pool)`);
      lines.push(`  🟢 Match 3: ~$${match3Each.toFixed(0)} per winner (40% pool)`);
      lines.push(`  💰 Estimated EV: $${ev.toFixed(2)} per $1.50 ticket`);
      lines.push(`  📈 Edge: ${ev > 1.50 ? "+" : ""}$${(ev - 1.50).toFixed(2)}`);
    } else if (probBps > 0) {
      lines.push(`  🎲 <b>Rolldown Probability:</b> ${formatProbability(probBps)} per draw`);
    } else {
      lines.push(`  📉 <b>No rolldown risk yet.</b>`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    lines.push(`<b>⚡ Quick Pick:</b> ❌ ${escapeHtml(msg)}`);
  }

  lines.push("");
  lines.push(`<i>Use /jackpot for current jackpot amounts • /prizes for full prize structure</i>`);

  return lines.join("\n");
}
