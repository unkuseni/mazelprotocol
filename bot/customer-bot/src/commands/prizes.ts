/**
 * /prizes command — Prize breakdown and payout structure.
 */

import { formatUsdc } from "../utils";

export async function handlePrizes(): Promise<string> {
  return (
    `<b>🏆 Prize Structure</b>\n\n` +
    `<b>🎟 Main Lottery (6/46) — $2.50 per ticket</b>\n\n` +
    `<b>Normal Mode (Fixed Prizes):</b>\n` +
    `  ⭐ Match 6: <b>Jackpot</b> (starts at $500,000)\n` +
    `  🔵 Match 5: <b>$4,000</b>\n` +
    `  🟢 Match 4: <b>$150</b>\n` +
    `  🟡 Match 3: <b>$5</b>\n` +
    `  ⚪ Match 2: <b>Free Ticket</b> ($2.50 credit)\n\n` +
    `<b>🔥 Rolldown Mode (Pari-Mutuel):</b>\n` +
    `  ⭐ Match 6: Jackpot (variable)\n` +
    `  🔵 Match 5: 25% of jackpot pool ÷ winners\n` +
    `  🟢 Match 4: 35% of jackpot pool ÷ winners\n` +
    `  🟡 Match 3: 40% of jackpot pool ÷ winners\n` +
    `  ⚪ Match 2: Free ticket credit\n\n` +
    `<b>📊 Rolldown Triggers:</b>\n` +
    `  Soft Cap: $1,750,000 (probabilistic rolldown begins)\n` +
    `  Hard Cap: $2,250,000 (forced 100% rolldown)\n\n` +
    `<b>💸 Dynamic Fees:</b>\n` +
    `  28% — Jackpot below $500K or during rolldown\n` +
    `  32% — Jackpot $500K–$1M\n` +
    `  36% — Jackpot $1M–$1.5M\n` +
    `  40% — Jackpot above $1.5M\n\n` +
    `──────────────────────────\n\n` +
    `<b>⚡ Quick Pick Express (5/35) — $1.50 per ticket</b>\n` +
    `<i>⚠️ Requires $50+ lifetime main lottery spend</i>\n\n` +
    `<b>Normal Mode (Fixed Prizes):</b>\n` +
    `  ⭐ Match 5: <b>Jackpot</b> (starts at $5,000)\n` +
    `  🔵 Match 4: <b>$100</b>\n` +
    `  🟢 Match 3: <b>$4</b>\n\n` +
    `<b>🔥 Rolldown Mode (Pari-Mutuel):</b>\n` +
    `  ⭐ Match 5: Jackpot (variable)\n` +
    `  🔵 Match 4: 60% of jackpot pool ÷ winners\n` +
    `  🟢 Match 3: 40% of jackpot pool ÷ winners\n\n` +
    `<b>📊 Rolldown Triggers:</b>\n` +
    `  Soft Cap: $30,000\n` +
    `  Hard Cap: $50,000\n\n` +
    `<i>🔒 All prizes are paid in USDC on Solana.</i>`
  );
}
