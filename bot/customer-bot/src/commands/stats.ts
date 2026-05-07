/**
 * /stats command — View player statistics by wallet address.
 *
 * Usage: /stats <wallet_address>
 */

import { fetchUserStats } from "../solana";
import {
  formatUsdc,
  isValidWalletAddress,
  shortenAddress,
  escapeHtml,
} from "../utils";

export async function handleStats(args: string[]): Promise<string> {
  if (args.length < 1) {
    return (
      `❌ <b>Usage:</b> <code>/stats WALLET_ADDRESS</code>\n\n` +
      `Example: <code>/stats 7WyaHk2u8AgonsryMpnvbtp42CfLJFPQpyY5p9ys6FiF</code>\n\n` +
      `<i>Your wallet address can be found in your Solana wallet (Phantom, Solflare, etc.)</i>`
    );
  }

  const walletAddress = args[0].trim();

  if (!isValidWalletAddress(walletAddress)) {
    return `❌ Invalid wallet address: <code>${escapeHtml(walletAddress)}</code>. Please provide a valid Solana wallet address.`;
  }

  const lines: string[] = [];

  try {
    const stats = await fetchUserStats(walletAddress);

    lines.push(`<b>👤 Player Statistics</b>`);
    lines.push(`  Wallet: <code>${shortenAddress(walletAddress)}</code>`);
    lines.push("");

    if (!stats) {
      lines.push(`  ℹ️ No stats found. This wallet has not played yet.`);
      lines.push("");
      lines.push(`  <i>Stats are created when you purchase your first ticket.</i>`);
      return lines.join("\n");
    }

    lines.push(`  🎫 Total Tickets: <code>${stats.totalTickets}</code>`);
    lines.push(`  💰 Total Spent: <code>${formatUsdc(stats.totalSpent)}</code>`);
    lines.push(`  🏆 Total Won: <code>${formatUsdc(stats.totalWon)}</code>`);

    // Net profit/loss
    const spent = Number(stats.totalSpent);
    const won = Number(stats.totalWon);
    const net = won - spent;

    if (net > 0) {
      lines.push(`  📈 Net Profit: <code>+${formatUsdc(BigInt(net))}</code> 🎉`);
    } else if (net < 0) {
      lines.push(`  📉 Net Loss: <code>-${formatUsdc(BigInt(Math.abs(net)))}</code>`);
    } else {
      lines.push(`  ➡️ Net: $0.00 (break even)`);
    }

    // ROI
    if (spent > 0) {
      const roi = ((net / spent) * 100).toFixed(1);
      lines.push(`  📊 ROI: <code>${roi}%</code>`);
    }

    lines.push("");

    // Streaks
    lines.push(`  🔥 Current Streak: <code>${stats.currentStreak}</code> draws`);
    lines.push(`  💪 Best Streak: <code>${stats.bestStreak}</code> draws`);

    // Free tickets
    if (stats.freeTicketsAvailable > 0) {
      lines.push(`  🎫 Free Tickets Available: <code>${stats.freeTicketsAvailable}</code>`);
    }

    // Quick Pick gate status
    const hasQPAccess = spent >= 50_000_000; // $50 USDC in lamports
    lines.push("");
    lines.push(`  ⚡ Quick Pick Access: ${hasQPAccess ? "✅ Unlocked" : "🔒 Locked (need $50+ spent)"}`);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    lines.push(`<b>👤 Player Statistics:</b> ❌ ${escapeHtml(msg)}`);
  }

  return lines.join("\n");
}
