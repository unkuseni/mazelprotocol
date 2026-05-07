/**
 * /jackpot command — Display current jackpot status for both lotteries.
 */

import { fetchMainLotteryState, fetchQPLotteryState } from "../solana";
import {
  formatUsdc,
  formatBps,
  formatCountdown,
  formatSaleWindow,
  formatProbability,
  escapeHtml,
} from "../utils";
import { BPS_DENOMINATOR } from "../config";

/**
 * Calculate the rolldown probability for the main lottery.
 */
function calcMainRolldownProbability(jackpotBalance: bigint, softCap: bigint, hardCap: bigint): number {
  const jackpot = Number(jackpotBalance);
  const soft = Number(softCap);
  const hard = Number(hardCap);

  if (jackpot >= hard) return BPS_DENOMINATOR; // 100%
  if (jackpot <= soft) return 0; // 0%

  // Linear interpolation between soft cap and hard cap
  const range = hard - soft;
  const progress = jackpot - soft;
  return Math.floor((progress / range) * BPS_DENOMINATOR);
}

/**
 * Get the current fee tier description.
 */
function getFeeTierDescription(houseFeeBps: number, isRolldown: boolean): string {
  if (isRolldown) return "Rolldown (28%)";
  if (houseFeeBps <= 2800) return "Tier 1 (28%) — Jackpot below $500K";
  if (houseFeeBps <= 3200) return "Tier 2 (32%) — Jackpot $500K–$1M";
  if (houseFeeBps <= 3600) return "Tier 3 (36%) — Jackpot $1M–$1.5M";
  return "Tier 4 (40%) — Jackpot above $1.5M";
}

export async function handleJackpot(): Promise<string> {
  const lines: string[] = [];

  // =========================================================================
  // MAIN LOTTERY
  // =========================================================================
  try {
    const main = await fetchMainLotteryState();

    const drawId = main.currentDrawId;
    const jackpot = main.jackpotBalance;
    const softCap = main.softCap;
    const hardCap = main.hardCap;
    const tickets = main.currentDrawTickets;
    const isRolldown = main.isRolldownActive;
    const probBps = calcMainRolldownProbability(jackpot, softCap, hardCap);
    const feeTier = getFeeTierDescription(main.houseFeeBps, isRolldown);
    const saleWindow = formatSaleWindow(main.nextDrawTimestamp, main.isDrawInProgress, main.isPaused);
    const countdown = main.isDrawInProgress
      ? "🔄 Draw in progress"
      : formatCountdown(main.nextDrawTimestamp);

    // Progress bar for jackpot relative to caps
    const softProgress = Math.min(100, Math.floor((Number(jackpot) / Number(softCap)) * 100));
    const hardProgress = Math.min(100, Math.floor((Number(jackpot) / Number(hardCap)) * 100));
    const barLength = 16;
    const filledBars = Math.min(barLength, Math.floor((softProgress / 100) * barLength));
    const progressBar = "█".repeat(filledBars) + "░".repeat(barLength - filledBars);

    lines.push(`<b>🎟 Main Lottery (6/46)</b>`);
    lines.push("");
    lines.push(`  🏆 <b>Jackpot:</b> <code>${formatUsdc(jackpot)}</code>`);
    lines.push(`  📊 Progress: ${progressBar} ${softProgress}%`);
    lines.push(`  💰 Soft Cap: ${formatUsdc(softCap)} | Hard Cap: ${formatUsdc(hardCap)}`);
    lines.push(`  🎯 Draw: <code>#${drawId}</code> | Tickets: <code>${tickets}</code>`);
    lines.push(`  ⏱ Next Draw: ${countdown}`);
    lines.push(`  🎫 Sales: ${saleWindow}`);
    lines.push(`  💸 Fee: ${feeTier}`);

    if (isRolldown) {
      lines.push(`  🔥 <b>ROLLDOWN ACTIVE!</b> Prizes are now pari-mutuel!`);
    } else if (probBps > 0) {
      lines.push(`  🎲 Rolldown Chance: <b>${formatProbability(probBps)}</b> per draw`);
    }

    if (main.isPaused) {
      lines.push(`  ⏸ <b>LOTTERY IS PAUSED</b>`);
    }

    // Total prize pool breakdown
    const totalBuffer = main.reserveBalance + main.insuranceBalance;
    lines.push("");
    lines.push(`  🛡 Safety Buffer: ${formatUsdc(totalBuffer)} (Reserve + Insurance)`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    lines.push(`<b>🎟 Main Lottery:</b> ❌ ${escapeHtml(msg)}`);
  }

  lines.push("");

  // =========================================================================
  // QUICK PICK EXPRESS
  // =========================================================================
  try {
    const qp = await fetchQPLotteryState();

    const drawId = qp.currentDraw;
    const jackpot = qp.jackpotBalance;
    const softCap = qp.softCap;
    const hardCap = qp.hardCap;
    const tickets = qp.currentDrawTickets;
    const isRolldown = qp.isRolldownPending;
    const probBps = calcMainRolldownProbability(jackpot, softCap, hardCap);
    const saleWindow = formatSaleWindow(qp.nextDrawTimestamp, qp.isDrawInProgress, qp.isPaused);
    const countdown = qp.isDrawInProgress
      ? "🔄 Draw in progress"
      : formatCountdown(qp.nextDrawTimestamp);

    const softProgress = Math.min(100, Math.floor((Number(jackpot) / Number(softCap)) * 100));
    const barLength = 16;
    const filledBars = Math.min(barLength, Math.floor((softProgress / 100) * barLength));
    const progressBar = "█".repeat(filledBars) + "░".repeat(barLength - filledBars);

    lines.push(`<b>⚡ Quick Pick Express (5/35)</b>`);
    lines.push("");
    lines.push(`  🏆 <b>Jackpot:</b> <code>${formatUsdc(jackpot)}</code>`);
    lines.push(`  📊 Progress: ${progressBar} ${softProgress}%`);
    lines.push(`  💰 Soft Cap: ${formatUsdc(softCap)} | Hard Cap: ${formatUsdc(hardCap)}`);
    lines.push(`  🎯 Draw: <code>#${drawId}</code> | Tickets: <code>${tickets}</code>`);
    lines.push(`  ⏱ Next Draw: ${countdown}`);
    lines.push(`  🎫 Sales: ${saleWindow}`);
    lines.push(`  💸 Fee: ${formatBps(qp.houseFeeBps)} (${qp.isRolldownPending ? "Rolldown" : "Standard"})`);

    if (isRolldown) {
      lines.push(`  🔥 <b>ROLLDOWN PENDING!</b> +EV window opening!`);
    } else if (probBps > 0) {
      lines.push(`  🎲 Rolldown Chance: <b>${formatProbability(probBps)}</b> per draw`);
    }

    if (qp.isPaused) {
      lines.push(`  ⏸ <b>QUICK PICK IS PAUSED</b>`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    lines.push(`<b>⚡ Quick Pick:</b> ❌ ${escapeHtml(msg)}`);
  }

  lines.push("");
  lines.push(`<i>Updated just now • Use /draw for latest results</i>`);

  return lines.join("\n");
}
