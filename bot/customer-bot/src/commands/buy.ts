/**
 * /buy command — Purchase lottery tickets directly through Telegram.
 *
 * Usage:
 *   /buy main 7 14 21 28 35 42     — Buy 1 Main Lottery ticket
 *   /buy qp 3 8 17 22 31           — Buy 1 Quick Pick ticket
 *   /buy main random               — Buy with auto-generated numbers
 *   /buy qp random 5               — Buy 5 Quick Pick tickets (random numbers)
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { getUser, debitBalance, recordTicketPurchase } from "../store";
import { buyTicket } from "../transact";
import {
  formatUsdc,
  generateRandomNumbers,
  shortenAddress,
} from "../utils";
import {
  MAIN_PICK_COUNT,
  MAIN_MAX_NUMBER,
  MAIN_TICKET_PRICE_LAMPORTS,
  QP_PICK_COUNT,
  QP_MAX_NUMBER,
  QP_TICKET_PRICE_LAMPORTS,
} from "../config";
import type { BotConfig } from "../config";

export async function handleBuy(
  args: string[],
  telegramId: number,
  config: BotConfig,
): Promise<string> {
  // Check registration
  const user = getUser(telegramId);
  if (!user) {
    return (
      `❌ You need to register first.\n\n` +
      `<b>Quick start:</b>\n` +
      `1. /register &lt;your_solana_address&gt;\n` +
      `2. /deposit to add USDC\n` +
      `3. /buy main random to purchase a ticket`
    );
  }

  // Check custodial mode
  if (!config.authorityKeypair) {
    return (
      `⚠️ <b>Direct buying is not available yet.</b>\n\n` +
      `The bot operator needs to configure the authority keypair to enable ticket purchases.\n\n` +
      `In the meantime:\n` +
      `• Use /quickpick to generate numbers\n` +
      `• Visit the web app to buy tickets with your wallet\n` +
      `• Use /wallet for full setup guide`
    );
  }

  // Parse arguments
  if (args.length < 2) {
    return (
      `🎟 <b>Buy Tickets</b>\n\n` +
      `<b>Usage:</b>\n` +
      `<code>/buy main 7 14 21 28 35 42</code> — Main Lottery ticket\n` +
      `<code>/buy qp 3 8 17 22 31</code> — Quick Pick ticket\n` +
      `<code>/buy main random</code> — Auto-generate numbers\n` +
      `<code>/buy qp random 3</code> — Buy 3 Quick Pick tickets (random)\n\n` +
      `<b>Your balance:</b> ${formatUsdc(user.balanceLamports)}\n` +
      `<b>Prices:</b> Main ${formatUsdc(MAIN_TICKET_PRICE_LAMPORTS)} | QP ${formatUsdc(QP_TICKET_PRICE_LAMPORTS)}`
    );
  }

  // Determine lottery type
  const lotteryType = args[0].toLowerCase();
  let lottery: "main" | "qp";
  let pickCount: number;
  let maxNumber: number;
  let ticketPrice: bigint;

  if (lotteryType === "main" || lotteryType === "m") {
    lottery = "main";
    pickCount = MAIN_PICK_COUNT;
    maxNumber = MAIN_MAX_NUMBER;
    ticketPrice = BigInt(MAIN_TICKET_PRICE_LAMPORTS);
  } else if (lotteryType === "qp" || lotteryType === "quickpick" || lotteryType === "q") {
    lottery = "qp";
    pickCount = QP_PICK_COUNT;
    maxNumber = QP_MAX_NUMBER;
    ticketPrice = BigInt(QP_TICKET_PRICE_LAMPORTS);
  } else {
    return `❌ Invalid lottery type. Use <code>main</code> or <code>qp</code>.`;
  }

  // Parse numbers or generate random
  let numbersList: number[][] = [];
  const remaining = args.slice(1);

  if (remaining[0]?.toLowerCase() === "random") {
    const count = Math.min(parseInt(remaining[1] || "1", 10) || 1, 10);
    for (let i = 0; i < count; i++) {
      numbersList.push(generateRandomNumbers(pickCount, maxNumber));
    }
  } else {
    // Manual numbers
    const manualNumbers: number[] = [];
    for (const n of remaining) {
      const parsed = parseInt(n, 10);
      if (isNaN(parsed) || parsed < 1 || parsed > maxNumber) {
        return `❌ Invalid number: ${n}. Must be 1-${maxNumber} for ${lottery === "main" ? "6/46" : "5/35"}.`;
      }
      manualNumbers.push(parsed);
    }

    if (manualNumbers.length !== pickCount) {
      return `❌ Expected ${pickCount} numbers for ${lottery === "main" ? "Main (6/46)" : "Quick Pick (5/35)"}, got ${manualNumbers.length}.`;
    }

    // Check duplicates
    if (new Set(manualNumbers).size !== manualNumbers.length) {
      return "❌ Duplicate numbers detected. All numbers must be unique.";
    }

    numbersList.push(manualNumbers);
  }

  // Check balance
  const totalCost = ticketPrice * BigInt(numbersList.length);
  if (user.balanceLamports < totalCost) {
    return (
      `❌ <b>Insufficient Balance</b>\n\n` +
      `  💰 Cost: ${formatUsdc(totalCost)} (${numbersList.length} ticket(s))\n` +
      `  🏦 Your Balance: ${formatUsdc(user.balanceLamports)}\n` +
      `  📉 Shortfall: ${formatUsdc(totalCost - user.balanceLamports)}\n\n` +
      `Use /deposit to add more USDC.`
    );
  }

  // Connect to chain
  const connection = new Connection(config.rpcUrl, config.commitment);
  const userWallet = new PublicKey(user.walletAddress);

  const results: string[] = [];

  for (const numbers of numbersList) {
    const sorted = [...numbers].sort((a, b) => a - b);
    const numsStr = sorted.map((n) => String(n).padStart(2, "0")).join(" • ");

    // Deduct balance first (optimistic)
    const debited = debitBalance(telegramId, ticketPrice);
    if (!debited) {
      results.push(`❌ Failed to process payment. Please try again.`);
      continue;
    }

    // Submit transaction
    const result = await buyTicket(config, connection, userWallet, numbers, lottery);

    if (result.success && result.signature) {
      recordTicketPurchase(telegramId, lottery, 0, sorted, result.signature);
      results.push(
        `✅ <b>Ticket Purchased!</b>\n` +
        `  🎯 Type: ${lottery === "main" ? "Main (6/46)" : "Quick Pick (5/35)"}\n` +
        `  🎫 Numbers: <code>[ ${numsStr} ]</code>\n` +
        `  💰 Price: ${formatUsdc(ticketPrice)}\n` +
        `  🔗 Tx: <code>${result.signature.slice(0, 16)}...</code>`
      );
    } else {
      // Refund the debited balance
      const { creditBalance } = await import("../store");
      creditBalance(telegramId, ticketPrice, "refund");
      results.push(
        `❌ <b>Purchase Failed</b>\n` +
        `  🎫 Numbers: <code>[ ${numsStr} ]</code>\n` +
        `  ⚠️ ${result.error || "Unknown error"}\n` +
        `  💰 Balance has been restored.`
      );
    }
  }

  // Show remaining balance
  const updatedUser = getUser(telegramId);
  results.push("");
  results.push(`🏦 <b>Remaining Balance:</b> ${formatUsdc(updatedUser?.balanceLamports || 0n)}`);
  results.push(`<i>Use /balance for details • /draw to check results</i>`);

  return results.join("\n");
}
