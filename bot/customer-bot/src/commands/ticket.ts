/**
 * /ticket command — Check a ticket against draw results.
 *
 * Usage: /ticket main 42 7 14 21 28 35 42
 *        /ticket qp 15 3 8 17 22 31
 */

import {
  fetchMainDrawResult,
  fetchQPDrawResult,
} from "../solana";
import {
  formatUsdc,
  countMatches,
  escapeHtml,
} from "../utils";

export async function handleTicket(args: string[]): Promise<string> {
  if (args.length < 3) {
    return (
      `❌ <b>Usage:</b>\n\n` +
      `<b>Main Lottery:</b>\n` +
      `<code>/ticket main 42 7 14 21 28 35 42</code>\n\n` +
      `<b>Quick Pick:</b>\n` +
      `<code>/ticket qp 15 3 8 17 22 31</code>\n\n` +
      `Arguments: <code>lottery draw_id num1 num2 ...</code>`
    );
  }

  const lottery = args[0].toLowerCase();
  const drawIdStr = args[1];
  const drawId = parseInt(drawIdStr, 10);

  if (isNaN(drawId) || drawId <= 0) {
    return `❌ Invalid draw ID: <code>${escapeHtml(drawIdStr)}</code>. Must be a positive number.`;
  }

  const numberStrs = args.slice(2);
  const numbers: number[] = [];

  for (const n of numberStrs) {
    const parsed = parseInt(n, 10);
    if (isNaN(parsed) || parsed < 1) {
      return `❌ Invalid number: <code>${escapeHtml(n)}</code>. All numbers must be positive integers.`;
    }
    numbers.push(parsed);
  }

  // Determine lottery type and validate
  let isMain: boolean;
  let expectedCount: number;
  let maxNumber: number;

  if (lottery === "main" || lottery === "m") {
    isMain = true;
    expectedCount = 6;
    maxNumber = 46;
  } else if (lottery === "qp" || lottery === "quickpick" || lottery === "q") {
    isMain = false;
    expectedCount = 5;
    maxNumber = 35;
  } else {
    return `❌ Invalid lottery type: <code>${escapeHtml(lottery)}</code>. Use <code>main</code> or <code>qp</code>.`;
  }

  if (numbers.length !== expectedCount) {
    return `❌ Expected ${expectedCount} numbers for ${isMain ? "Main Lottery (6/46)" : "Quick Pick (5/35)"}, got ${numbers.length}.`;
  }

  // Check for duplicates
  if (new Set(numbers).size !== numbers.length) {
    return "❌ Duplicate numbers detected. All numbers must be unique.";
  }

  // Check range
  for (const n of numbers) {
    if (n > maxNumber) {
      return `❌ Number ${n} is out of range. Max is ${maxNumber} for ${isMain ? "6/46" : "5/35"}.`;
    }
  }

  // Sort numbers for display
  const sortedNumbers = [...numbers].sort((a, b) => a - b);
  const numbersStr = sortedNumbers.map((n) => String(n).padStart(2, "0")).join(" • ");

  const lines: string[] = [];

  // Fetch the draw result
  try {
    const result = isMain
      ? await fetchMainDrawResult(drawId)
      : await fetchQPDrawResult(drawId);

    if (!result) {
      lines.push(`<b>🔍 Ticket Check</b>`);
      lines.push("");
      lines.push(`  🎯 Draw: <code>#${drawId}</code> (${isMain ? "Main 6/46" : "Quick Pick 5/35"})`);
      lines.push(`  🎫 Your Numbers: <code>[ ${numbersStr} ]</code>`);
      lines.push("");
      lines.push(`  ❌ Draw <code>#${drawId}</code> not found. It may not have been executed yet.`);
      return lines.join("\n");
    }

    const winningNums = result.winningNumbers.filter((n: number) => n > 0);
    const matches = countMatches(numbers, winningNums);
    const winningStr = winningNums.map((n: number) => String(n).padStart(2, "0")).join(" • ");

    lines.push(`<b>🔍 Ticket Check — ${isMain ? "Main Lottery" : "Quick Pick Express"}</b>`);
    lines.push("");
    lines.push(`  🎯 Draw: <code>#${drawId}</code>`);
    lines.push(`  📅 Date: ${new Date(Number(result.timestamp) * 1000).toISOString().slice(0, 10)}`);
    lines.push(`  🔥 Rolldown: ${result.wasRolldown ? "<b>YES</b>" : "No"}`);
    lines.push("");
    lines.push(`  🎫 <b>Your Numbers:</b> <code>[ ${numbersStr} ]</code>`);
    lines.push(`  🎯 <b>Winning Numbers:</b> <code>[ ${winningStr} ]</code>`);
    lines.push("");

    // Determine prize
    if (isMain) {
      switch (matches) {
        case 6:
          lines.push(`  ⭐ <b>MATCH 6 — JACKPOT WINNER!</b>`);
          lines.push(`  💰 Prize: ${formatUsdc(result.match6PrizePerWinner)}`);
          if (result.match6Winners > 1) {
            lines.push(`  👥 Shared with ${result.match6Winners} winner(s)`);
          }
          break;
        case 5:
          lines.push(`  🔵 <b>MATCH 5 — WINNER!</b>`);
          lines.push(`  💰 Prize: ${formatUsdc(result.match5PrizePerWinner)}`);
          break;
        case 4:
          lines.push(`  🟢 <b>MATCH 4 — WINNER!</b>`);
          lines.push(`  💰 Prize: ${formatUsdc(result.match4PrizePerWinner)}`);
          break;
        case 3:
          lines.push(`  🟡 <b>MATCH 3 — WINNER!</b>`);
          lines.push(`  💰 Prize: ${formatUsdc(result.match3PrizePerWinner)}`);
          break;
        case 2:
          lines.push(`  ⚪ Match 2 — Free ticket credit earned!`);
          lines.push(`  🎫 Value: $2.50 (free ticket for next draw)`);
          break;
        default:
          lines.push(`  ❌ Matched ${matches} number(s) — No prize this time.`);
          lines.push(`  🍀 Better luck next draw!`);
      }
    } else {
      // Quick Pick
      switch (matches) {
        case 5:
          lines.push(`  ⭐ <b>MATCH 5 — JACKPOT WINNER!</b>`);
          lines.push(`  💰 Prize: ${formatUsdc(result.match5PrizePerWinner)}`);
          break;
        case 4:
          lines.push(`  🔵 <b>MATCH 4 — WINNER!</b>`);
          lines.push(`  💰 Prize: ${formatUsdc(result.match4PrizePerWinner)}`);
          break;
        case 3:
          lines.push(`  🟢 <b>MATCH 3 — WINNER!</b>`);
          lines.push(`  💰 Prize: ${formatUsdc(result.match3PrizePerWinner)}`);
          break;
        default:
          lines.push(`  ❌ Matched ${matches} number(s) — No prize this time.`);
          lines.push(`  🍀 Better luck next draw!`);
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    lines.push(`<b>🔍 Ticket Check:</b> ❌ ${escapeHtml(msg)}`);
  }

  return lines.join("\n");
}
