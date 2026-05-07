/**
 * /help command — List all available commands with descriptions.
 */

export async function handleHelp(): Promise<string> {
  return (
    `📋 <b>Available Commands</b>\n\n` +
    `<b>💳 Wallet &amp; Buying</b>\n` +
    `/register &lt;address&gt; — Link your Solana wallet\n` +
    `/balance — Check your deposited balance\n` +
    `/deposit — Get deposit address for USDC\n` +
    `/buy main random — Buy a Main Lottery ticket\n` +
    `/buy qp random — Buy a Quick Pick ticket\n` +
    `/buy main 7 14 21 28 35 42 — Buy with chosen numbers\n\n` +
    `<b>📊 Lottery Info</b>\n` +
    `/jackpot — Current jackpots with progress bars\n` +
    `/draw — Latest winning numbers and prizes\n` +
    `/rolldown — Rolldown status and +EV analysis\n\n` +
    `<b>🎲 Quick Pick Generator</b>\n` +
    `/quickpick — 6 random numbers (Main Lottery)\n` +
    `/qp — 5 random numbers (Quick Pick)\n\n` +
    `<b>🔍 Lookup</b>\n` +
    `/ticket main 42 7 14 21 28 35 42 — Check result\n` +
    `/stats &lt;wallet&gt; — Player statistics\n\n` +
    `<b>📖 Info</b>\n` +
    `/prizes — Prize breakdown\n` +
    `/rules — How to play\n` +
    `/wallet — Setup guide (wallets, funding, app)\n\n` +
    `<i>💡 Tip: Use /register then /buy main random to play in seconds!</i>`
  );
}
