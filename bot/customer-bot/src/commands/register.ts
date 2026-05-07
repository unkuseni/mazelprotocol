/**
 * /register command — Link a Solana wallet to your Telegram account.
 *
 * This is the first step for custodial mode. Once registered, you can
 * deposit USDC and buy tickets with simple commands.
 */

import { PublicKey } from "@solana/web3.js";
import { registerUser, getUser } from "../store";
import { shortenAddress } from "../utils";

export async function handleRegister(
  args: string[],
  telegramId: number,
  username: string,
): Promise<string> {
  if (args.length < 1) {
    const existing = getUser(telegramId);
    if (existing) {
      return (
        `✅ You're already registered!\n\n` +
        `  Wallet: <code>${shortenAddress(existing.walletAddress)}</code>\n` +
        `  Balance: Coming soon\n\n` +
        `To update your wallet: <code>/register NEW_ADDRESS</code>\n` +
        `Use /balance to check your funds.`
      );
    }
    return (
      `📝 <b>Register Your Wallet</b>\n\n` +
      `Link your Solana wallet to start buying tickets directly through the bot.\n\n` +
      `<b>Usage:</b> <code>/register SOLANA_ADDRESS</code>\n\n` +
      `<b>Example:</b> <code>/register 7WyaHk2u8AgonsryMpnvbtp42CfLJFPQpyY5p9ys6FiF</code>\n\n` +
      `<i>Your wallet address can be found in Phantom, Solflare, or Backpack.</i>`
    );
  }

  const address = args[0].trim();

  // Validate
  try {
    new PublicKey(address);
  } catch {
    return `❌ Invalid Solana address: <code>${address.slice(0, 20)}...</code>\nPlease provide a valid base58 Solana wallet address.`;
  }

  const user = registerUser(telegramId, username, address);

  return (
    `✅ <b>Wallet Registered!</b>\n\n` +
    `  👤 Telegram: @${username}\n` +
    `  💳 Wallet: <code>${shortenAddress(user.walletAddress)}</code>\n` +
    `  📅 Registered: ${new Date(user.registeredAt).toISOString().slice(0, 10)}\n\n` +
    `─── <b>Next Steps</b> ───\n\n` +
    `<b>1.</b> Deposit USDC using /deposit\n` +
    `<b>2.</b> Buy tickets with /buy\n` +
    `<b>3.</b> Check balance with /balance\n\n` +
    `<i>💰 Your wallet is now linked. Start by depositing USDC!</i>`
  );
}
