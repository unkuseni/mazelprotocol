/**
 * /balance command — Check your deposited USDC balance.
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { getUser } from "../store";
import { formatUsdc, shortenAddress } from "../utils";
import type { BotConfig } from "../config";

export async function handleBalance(
  telegramId: number,
  config: BotConfig,
): Promise<string> {
  const user = getUser(telegramId);
  if (!user) {
    return (
      `❌ You haven't registered yet.\n\n` +
      `Use /register &lt;your_solana_address&gt; to get started.`
    );
  }

  const lines: string[] = [];
  lines.push(`💰 <b>Your Balance</b>`);
  lines.push(`  Wallet: <code>${shortenAddress(user.walletAddress)}</code>`);
  lines.push("");

  // Bot-custodied balance
  lines.push(`  🏦 <b>Deposited Balance:</b> <code>${formatUsdc(user.balanceLamports)}</code>`);

  // On-chain USDC balance
  try {
    const connection = new Connection(config.rpcUrl, config.commitment);
    const wallet = new PublicKey(user.walletAddress);

    // Get SOL balance
    const solBalance = await connection.getBalance(wallet);
    lines.push(`  💎 SOL Balance: <code>${(solBalance / 1e9).toFixed(4)} SOL</code>`);

    // Get USDC balance via token accounts
    try {
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(wallet, {
        mint: config.usdcMint,
      });
      let usdcBalance = 0n;
      for (const ta of tokenAccounts.value) {
        usdcBalance += BigInt(ta.account.data.parsed.info.tokenAmount.amount);
      }
      lines.push(`  💵 On-chain USDC: <code>${formatUsdc(usdcBalance)}</code>`);
    } catch {
      lines.push(`  💵 On-chain USDC: Unable to fetch`);
    }
  } catch {
    lines.push(`  ⚠️ Could not fetch on-chain balances.`);
  }

  // Stats
  lines.push("");
  lines.push(`  📊 <b>Stats:</b>`);
  lines.push(`  Total Deposited: ${formatUsdc(user.totalDeposited)}`);
  lines.push(`  Total Spent: ${formatUsdc(user.totalSpent)}`);
  lines.push(`  Tickets Purchased: ${user.ticketsPurchased}`);

  // Show ticket price equivalents
  if (user.balanceLamports > 0n) {
    const mainTickets = Number(user.balanceLamports) / 2_500_000;
    const qpTickets = Number(user.balanceLamports) / 1_500_000;
    lines.push("");
    lines.push(`  🎟 You can buy ~${Math.floor(mainTickets)} main tickets or ~${Math.floor(qpTickets)} QP tickets`);
  }

  lines.push("");
  lines.push(`<i>Use /deposit to add funds • /buy to purchase tickets</i>`);

  return lines.join("\n");
}
