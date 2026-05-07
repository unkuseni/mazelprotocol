/**
 * /draw command — Show the latest draw results for both lotteries.
 * Optionally: /draw main 42 or /draw qp 15 to see a specific draw.
 */

import {
  fetchMainLotteryState,
  fetchQPLotteryState,
  fetchMainDrawResult,
  fetchQPDrawResult,
} from "../solana";
import {
  formatUsdc,
  formatTimestamp,
  escapeHtml,
} from "../utils";

export async function handleDraw(args: string[]): Promise<string> {
  const lines: string[] = [];

  // Determine which lottery and optionally a specific draw ID
  let target: "both" | "main" | "quickpick" = "both";
  let mainDrawId: bigint | undefined;
  let qpDrawId: bigint | undefined;

  if (args.length >= 2) {
    const lottery = args[0].toLowerCase();
    const drawIdArg = args[1];
    const parsed = parseInt(drawIdArg, 10);

    if (isNaN(parsed) || parsed <= 0) {
      return "❌ Invalid draw ID. Usage: <code>/draw main 42</code> or <code>/draw qp 15</code>";
    }

    if (lottery === "main" || lottery === "m") {
      target = "main";
      mainDrawId = BigInt(parsed);
    } else if (lottery === "qp" || lottery === "quickpick" || lottery === "q") {
      target = "quickpick";
      qpDrawId = BigInt(parsed);
    } else {
      return "❌ Invalid lottery. Use <code>main</code> or <code>qp</code>. Example: <code>/draw main 42</code>";
    }
  }

  // =========================================================================
  // MAIN LOTTERY
  // =========================================================================
  if (target === "both" || target === "main") {
    try {
      const main = await fetchMainLotteryState();

      // If no specific draw requested, show the last completed draw
      const drawId = mainDrawId ?? (main.isDrawInProgress
        ? main.currentDrawId - 1n
        : main.currentDrawId - 1n);

      if (drawId <= 0n) {
        lines.push(`<b>🎟 Main Lottery:</b> No draws completed yet.`);
      } else {
        const result = await fetchMainDrawResult(drawId);

        if (!result) {
          lines.push(`<b>🎟 Main Lottery:</b> Draw <code>#${drawId}</code> not found.`);
        } else {
          const winningNums = result.winningNumbers.filter((n: number) => n > 0);
          const numbersStr = winningNums.length === 6
            ? winningNums.map((n: number) => String(n).padStart(2, "0")).join(" • ")
            : "Not yet available";

          lines.push(`<b>🎟 Main Lottery — Draw #${drawId}</b>`);
          lines.push("");
          lines.push(`  🎯 <b>Winning Numbers:</b>`);
          lines.push(`  <code>[ ${numbersStr} ]</code>`);
          lines.push(`  📅 ${formatTimestamp(result.timestamp)}`);
          lines.push(`  🔥 Rolldown: ${result.wasRolldown ? "<b>YES</b>" : "No"}`);
          lines.push("");

          if (result.wasRolldown) {
            lines.push(`  <b>🏆 Prizes (Pari-Mutuel):</b>`);
          } else {
            lines.push(`  <b>🏆 Prizes:</b>`);
          }

          // Match 6 (Jackpot)
          if (result.match6Winners > 0) {
            lines.push(`  ⭐ Match 6: ${formatUsdc(result.match6PrizePerWinner)} × ${result.match6Winners} winner(s)`);
          } else {
            lines.push(`  ⭐ Match 6: No winner (rolls over)`);
          }

          // Match 5
          lines.push(`  🔵 Match 5: ${formatUsdc(result.match5PrizePerWinner)} × ${result.match5Winners} winner(s)`);

          // Match 4
          lines.push(`  🟢 Match 4: ${formatUsdc(result.match4PrizePerWinner)} × ${result.match4Winners} winner(s)`);

          // Match 3
          lines.push(`  🟡 Match 3: ${formatUsdc(result.match3PrizePerWinner)} × ${result.match3Winners} winner(s)`);

          // Match 2
          if (result.match2PrizePerWinner > 0n) {
            lines.push(`  ⚪ Match 2: Free ticket credit × ${result.match2Winners} winner(s)`);
          }

          // Total
          if (result.totalCommitted > 0n) {
            lines.push("");
            lines.push(`  💰 Total Distributed: ${formatUsdc(result.totalCommitted)}`);
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      lines.push(`<b>🎟 Main Lottery:</b> ❌ ${escapeHtml(msg)}`);
    }
  }

  // =========================================================================
  // QUICK PICK
  // =========================================================================
  if (target === "both" || target === "quickpick") {
    if (target === "both") lines.push("");

    try {
      const qp = await fetchQPLotteryState();

      const drawId = qpDrawId ?? (qp.isDrawInProgress
        ? qp.currentDraw - 1n
        : qp.currentDraw - 1n);

      if (drawId <= 0n) {
        lines.push(`<b>⚡ Quick Pick:</b> No draws completed yet.`);
      } else {
        const result = await fetchQPDrawResult(drawId);

        if (!result) {
          lines.push(`<b>⚡ Quick Pick:</b> Draw <code>#${drawId}</code> not found.`);
        } else {
          const winningNums = result.winningNumbers.filter((n: number) => n > 0);
          const numbersStr = winningNums.length === 5
            ? winningNums.map((n: number) => String(n).padStart(2, "0")).join(" • ")
            : "Not yet available";

          lines.push(`<b>⚡ Quick Pick Express — Draw #${drawId}</b>`);
          lines.push("");
          lines.push(`  🎯 <b>Winning Numbers:</b>`);
          lines.push(`  <code>[ ${numbersStr} ]</code>`);
          lines.push(`  📅 ${formatTimestamp(result.timestamp)}`);
          lines.push(`  🔥 Rolldown: ${result.wasRolldown ? "<b>YES</b>" : "No"}`);
          lines.push("");

          lines.push(`  <b>🏆 Prizes:</b>`);

          // Match 5 (Jackpot)
          if (result.match5Winners > 0) {
            lines.push(`  ⭐ Match 5: ${formatUsdc(result.match5PrizePerWinner)} × ${result.match5Winners} winner(s)`);
          } else {
            lines.push(`  ⭐ Match 5: No winner (rolls over)`);
          }

          // Match 4
          lines.push(`  🔵 Match 4: ${formatUsdc(result.match4PrizePerWinner)} × ${result.match4Winners} winner(s)`);

          // Match 3
          lines.push(`  🟢 Match 3: ${formatUsdc(result.match3PrizePerWinner)} × ${result.match3Winners} winner(s)`);

          if (result.totalCommitted > 0n) {
            lines.push("");
            lines.push(`  💰 Total Distributed: ${formatUsdc(result.totalCommitted)}`);
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      lines.push(`<b>⚡ Quick Pick:</b> ❌ ${escapeHtml(msg)}`);
    }
  }

  lines.push("");
  lines.push(`<i>Use /draw main 42 or /draw qp 15 for a specific draw</i>`);

  return lines.join("\n");
}
