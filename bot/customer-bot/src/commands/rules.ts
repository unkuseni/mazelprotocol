/**
 * /rules command — How to play and game rules.
 */

export async function handleRules(): Promise<string> {
  return (
    `<b>📖 How to Play MazelProtocol</b>\n\n` +
    `<b>🎟 Main Lottery (6/46)</b>\n` +
    `1. Pick 6 numbers from 1 to 46\n` +
    `2. Each ticket costs $2.50 USDC\n` +
    `3. Draws happen daily at 00:00 UTC\n` +
    `4. Match winning numbers to win prizes\n` +
    `5. Match 2+ to win (free ticket at minimum)\n\n` +
    `<b>⚡ Quick Pick Express (5/35)</b>\n` +
    `1. Pick 5 numbers from 1 to 35\n` +
    `2. Each ticket costs $1.50 USDC\n` +
    `3. Draws happen every 4 hours (6x daily)\n` +
    `4. Match 3+ to win\n` +
    `5. Requires $50+ lifetime spend in Main Lottery\n\n` +
    `<b>🔥 The Rolldown — Your Edge</b>\n` +
    `When the jackpot reaches the soft cap, each draw has a\n` +
    `chance to trigger rolldown. During rolldown:\n` +
    `• Fixed prizes become pari-mutuel (shared pool)\n` +
    `• Prize pools can exceed ticket price → <b>+EV!</b>\n` +
    `• At hard cap, rolldown is forced (100% chance)\n\n` +
    `<b>🎲 Odds of Winning (Main Lottery)</b>\n` +
    `  Match 6: 1 in 9,366,819\n` +
    `  Match 5: 1 in 39,028\n` +
    `  Match 4: 1 in 800\n` +
    `  Match 3: 1 in 47\n` +
    `  Match 2: 1 in 6.8\n\n` +
    `<b>🎲 Odds of Winning (Quick Pick)</b>\n` +
    `  Match 5: 1 in 324,632\n` +
    `  Match 4: 1 in 2,165\n` +
    `  Match 3: 1 in 72\n\n` +
    `<b>💰 Prize Claims</b>\n` +
    `• Prizes can be claimed on the MazelProtocol app\n` +
    `• Claims must be made within 90 days of the draw\n` +
    `• Unclaimed prizes are swept to the reserve after 90 days\n\n` +
    `<b>🛡 Fund Allocation (per ticket)</b>\n` +
    `  55.6% — Jackpot pool\n` +
    `  39.4% — Fixed prize pool\n` +
    `  3.0% — Reserve fund\n` +
    `  2.0% — Insurance pool\n\n` +
    `<i>⚠️ Gambling involves risk. Only play with money you can afford to lose.</i>`
  );
}
