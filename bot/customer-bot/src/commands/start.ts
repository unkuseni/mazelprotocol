/**
 * /start command — Welcome message and bot introduction.
 */

export async function handleStart(): Promise<string> {
  return (
    `🎰 <b>Welcome to MazelProtocol!</b>\n\n` +
    `The world's first <i>intentionally exploitable</i> lottery on Solana, ` +
    `where the math actually works in your favor... sometimes.\n\n` +
    `<b>🎟 Two Ways to Play:</b>\n` +
    `• <b>Main Lottery</b> — 6/46 matrix, $2.50 tickets, daily draws\n` +
    `• <b>Quick Pick Express</b> — 5/35 matrix, $1.50 tickets, every 4 hours\n\n` +
    `<b>🔥 The Rolldown:</b> When the jackpot hits the soft cap, ` +
    `prizes switch from fixed amounts to a share of the entire pool. ` +
    `This creates <b>positive expected value (+EV)</b> windows for players!\n\n` +
    `Use the commands below or tap the menu button to get started.\n\n` +
    `<i>⚠️ This is gambling. Only play with money you can afford to lose. ` +
    `Verify your local laws before participating.</i>`
  );
}
