/**
 * /deposit command — Show the user how to deposit USDC into the bot.
 *
 * The bot uses a simple approach: users send USDC to the bot's authority
 * wallet (or a dedicated vault), and the bot credits their account after
 * detecting the deposit.
 *
 * For production, this would use per-user ATAs under a PDA for isolation.
 */

import { getUser } from "../store";
import { shortenAddress, formatUsdc } from "../utils";
import type { BotConfig } from "../config";
import {
  MAIN_TICKET_PRICE_LAMPORTS,
  QP_TICKET_PRICE_LAMPORTS,
} from "../config";

export async function handleDeposit(
  telegramId: number,
  config: BotConfig,
): Promise<string> {
  const user = getUser(telegramId);

  if (!user) {
    return (
      `❌ You need to register first.\n\n` +
      `Use /register &lt;your_solana_address&gt; to link your wallet, then deposit.`
    );
  }

  const depositAddress = config.authorityKeypair
    ? config.authorityKeypair.publicKey.toBase58()
    : user.walletAddress; // fallback: show user's own address

  const isCustodial = !!config.authorityKeypair;

  return (
    `📥 <b>Deposit USDC</b>\n\n` +
    (isCustodial
      ? `<b>Send USDC to the bot's deposit address:</b>\n\n` +
      `<code>${depositAddress}</code>\n\n` +
      `<b>⚠️ IMPORTANT:</b>\n` +
      `• Only send <b>USDC on Solana</b> (not USDC on other chains!)\n` +
      `• Minimum deposit: ${formatUsdc(MAIN_TICKET_PRICE_LAMPORTS)} (1 main ticket)\n` +
      `• Deposits are detected automatically within 1-2 minutes\n` +
      `• Check your balance with /balance after sending\n\n` +
      `<b>Ticket Prices:</b>\n` +
      `• Main Lottery (6/46): ${formatUsdc(MAIN_TICKET_PRICE_LAMPORTS)} each\n` +
      `• Quick Pick (5/35): ${formatUsdc(QP_TICKET_PRICE_LAMPORTS)} each\n\n` +
      `<b>How to get USDC:</b>\n` +
      `• Buy on Coinbase, Binance, Kraken → withdraw to the address above\n` +
      `• Swap SOL → USDC inside Phantom/Solflare wallet\n` +
      `• Use MoonPay/Transak directly in your wallet app\n\n` +
      `<i>After sending, your balance will update automatically.</i>`
      : `⚠️ <b>Custodial mode is not enabled.</b>\n\n` +
      `The bot operator needs to set AUTHORITY_KEYPAIR_JSON in .env to enable deposits.\n\n` +
      `In the meantime, you can use /wallet to learn how to buy tickets through the web app.`)
  );
}
