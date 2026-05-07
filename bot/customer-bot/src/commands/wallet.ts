/**
 * /wallet command — Guide users through setting up a wallet and funding it
 * so they can buy lottery tickets on the MazelProtocol web app.
 *
 * Also aliased as /fund and /deposit.
 */

import type { BotConfig } from "../config";
import { formatUsdc } from "../utils";
import {
  MAIN_TICKET_PRICE_LAMPORTS,
  QP_TICKET_PRICE_LAMPORTS,
} from "../config";

export async function handleWallet(config: BotConfig): Promise<string> {
  const webAppUrl = config.webAppUrl;

  return (
    `💳 <b>How to Play MazelProtocol</b>\n\n` +
    `<b>You need two things:</b>\n` +
    `1. A <b>Solana wallet</b> with SOL (for gas fees)\n` +
    `2. <b>USDC</b> tokens (to buy tickets)\n\n` +

    `─── <b>Step 1: Get a Wallet</b> ───\n\n` +
    `Download one of these Solana wallets:\n` +
    `• <a href="https://phantom.app">Phantom</a> — Most popular, mobile + browser\n` +
    `• <a href="https://solflare.com">Solflare</a> — Full-featured, mobile + browser\n` +
    `• <a href="https://backpack.app">Backpack</a> — Modern, mobile + browser\n\n` +
    `<i>Save your seed phrase securely! Never share it with anyone.</i>\n\n` +

    `─── <b>Step 2: Fund Your Wallet</b> ───\n\n` +
    `<b>Get SOL (for gas fees):</b>\n` +
    `• Buy SOL on exchanges like Coinbase, Binance, or Kraken\n` +
    `• Transfer to your wallet address\n` +
    `• You need ~0.01 SOL for transaction fees ($1-2 worth)\n\n` +
    `<b>Get USDC (for tickets):</b>\n` +
    `• Buy USDC on Solana from exchanges (make sure it's "USDC on Solana")\n` +
    `• Or swap SOL → USDC inside Phantom/Solflare wallet\n` +
    `• Ticket prices: ${formatUsdc(MAIN_TICKET_PRICE_LAMPORTS)} (Main) / ${formatUsdc(QP_TICKET_PRICE_LAMPORTS)} (Quick Pick)\n\n` +

    `─── <b>Step 3: Buy Tickets</b> ───\n\n` +
    `Visit the MazelProtocol web app:\n` +
    `<a href="${webAppUrl}">${webAppUrl}</a>\n\n` +
    `1. Connect your wallet\n` +
    `2. Pick your numbers or use Quick Pick\n` +
    `3. Confirm the transaction in your wallet\n` +
    `4. Check back after the draw to claim winnings!\n\n` +

    `─── <b>Quick Commands</b> ───\n\n` +
    `/quickpick — Generate random Main Lottery numbers (6/46)\n` +
    `/qp — Generate random Quick Pick numbers (5/35)\n` +
    `/jackpot — See current jackpots and rolldown status\n` +
    `/draw — View latest results\n` +
    `/ticket — Check if your numbers won\n` +
    `/stats &lt;wallet&gt; — View your player stats\n\n` +

    `<i>⚠️ Only gamble what you can afford to lose. Verify your local laws.</i>`
  );
}
