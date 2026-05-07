/**
 * /quickpick and /qp commands — Generate random lottery numbers.
 *
 * /quickpick — Generate 6 numbers for Main Lottery (1-46)
 * /qp — Generate 5 numbers for Quick Pick Express (1-35)
 *
 * Uses crypto.getRandomValues for quality randomness.
 * Supports optional count: /quickpick 5 to generate 5 sets of numbers.
 */

import { generateRandomNumbers, escapeHtml } from "../utils";
import {
  MAIN_PICK_COUNT,
  MAIN_MAX_NUMBER,
  MAIN_TICKET_PRICE_LAMPORTS,
  QP_PICK_COUNT,
  QP_MAX_NUMBER,
  QP_TICKET_PRICE_LAMPORTS,
} from "../config";
import { formatUsdc } from "../utils";

const MAX_SETS = 10;

export async function handleQuickPick(args: string[]): Promise<string> {
  let count = 1;
  if (args.length >= 1) {
    count = parseInt(args[0], 10);
    if (isNaN(count) || count < 1) {
      return "❌ Invalid count. Use: <code>/quickpick</code> or <code>/quickpick 5</code> for 5 sets.";
    }
    if (count > MAX_SETS) {
      return `❌ Maximum ${MAX_SETS} sets per request. Requested: ${count}`;
    }
  }

  const lines: string[] = [];
  lines.push(`🎲 <b>Main Lottery Quick Pick (6/46)</b>`);
  lines.push(`🎫 Ticket Price: ${formatUsdc(MAIN_TICKET_PRICE_LAMPORTS)} each`);
  lines.push("");

  for (let i = 0; i < count; i++) {
    const numbers = generateRandomNumbers(MAIN_PICK_COUNT, MAIN_MAX_NUMBER);
    const numsStr = numbers.map((n) => String(n).padStart(2, "0")).join(" • ");
    lines.push(`  <b>Set ${i + 1}:</b> <code>[ ${numsStr} ]</code>`);
  }

  lines.push("");
  lines.push(`<i>⚡ These numbers were generated using cryptographically secure randomness.</i>`);
  lines.push(`<i>📱 Use them on the MazelProtocol app to purchase your ticket.</i>`);
  lines.push(`<i>🔁 Run /quickpick again for a new set.</i>`);

  return lines.join("\n");
}

export async function handleQP(args: string[]): Promise<string> {
  let count = 1;
  if (args.length >= 1) {
    count = parseInt(args[0], 10);
    if (isNaN(count) || count < 1) {
      return "❌ Invalid count. Use: <code>/qp</code> or <code>/qp 5</code> for 5 sets.";
    }
    if (count > MAX_SETS) {
      return `❌ Maximum ${MAX_SETS} sets per request. Requested: ${count}`;
    }
  }

  const lines: string[] = [];
  lines.push(`⚡ <b>Quick Pick Express (5/35)</b>`);
  lines.push(`🎫 Ticket Price: ${formatUsdc(QP_TICKET_PRICE_LAMPORTS)} each`);
  lines.push(`⚠️ Requires $50+ lifetime spend in Main Lottery`);
  lines.push("");

  for (let i = 0; i < count; i++) {
    const numbers = generateRandomNumbers(QP_PICK_COUNT, QP_MAX_NUMBER);
    const numsStr = numbers.map((n) => String(n).padStart(2, "0")).join(" • ");
    lines.push(`  <b>Set ${i + 1}:</b> <code>[ ${numsStr} ]</code>`);
  }

  lines.push("");
  lines.push(`<i>⚡ These numbers were generated using cryptographically secure randomness.</i>`);
  lines.push(`<i>📱 Use them on the MazelProtocol app to purchase your ticket.</i>`);
  lines.push(`<i>🔁 Run /qp again for a new set.</i>`);

  return lines.join("\n");
}
