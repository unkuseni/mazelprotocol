/**
 * Formatting and utility functions for the customer-facing bot.
 */

const USDC_DECIMALS = 6;

/**
 * Format a lamports amount as a human-readable USD string.
 * Assumes 6 decimal places for USDC.
 */
export function formatUsdc(lamports: bigint | number): string {
  const value = typeof lamports === "bigint" ? lamports : BigInt(lamports);
  const usd = Number(value) / 10 ** USDC_DECIMALS;

  if (usd >= 1_000_000) {
    return `$${(usd / 1_000_000).toFixed(2)}M`;
  }
  if (usd >= 1_000) {
    return `$${(usd / 1_000).toFixed(1)}K`;
  }
  if (usd >= 1) {
    return `$${usd.toFixed(2)}`;
  }
  return `$${usd.toFixed(4)}`;
}

/**
 * Format a basis points value as a percentage string.
 */
export function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(1)}%`;
}

/**
 * Format a Unix timestamp as a human-readable date/time string.
 */
export function formatTimestamp(unixSeconds: bigint | number): string {
  const ts = typeof unixSeconds === "bigint" ? Number(unixSeconds) : unixSeconds;
  if (ts <= 0) return "N/A";
  const date = new Date(ts * 1000);
  return date.toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

/**
 * Format a countdown from now to a given Unix timestamp.
 */
export function formatCountdown(targetUnix: bigint | number): string {
  const target = typeof targetUnix === "bigint" ? Number(targetUnix) : targetUnix;
  const now = Math.floor(Date.now() / 1000);
  const diff = target - now;

  if (diff <= 0) return "⏰ Overdue";

  const hours = Math.floor(diff / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  const seconds = diff % 60;

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

/**
 * Format the ticket sale window status.
 */
export function formatSaleWindow(
  nextDrawTimestamp: bigint,
  isDrawInProgress: boolean,
  isPaused: boolean,
): string {
  if (isPaused) return "⏸ Paused";
  if (isDrawInProgress) return "🔒 Sales Closed (Draw in progress)";

  const target = Number(nextDrawTimestamp);
  const now = Math.floor(Date.now() / 1000);
  const cutoff = target - 3600; // 1 hour before draw

  if (now >= cutoff) {
    return "🔒 Sales Closed (Cutoff reached)";
  }

  const remaining = cutoff - now;
  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  return `🟢 Open (closes in ${hours}h ${minutes}m)`;
}

/**
 * Format a probability from basis points as a percentage with one decimal.
 */
export function formatProbability(bps: number): string {
  return `${(bps / 100).toFixed(1)}%`;
}

/**
 * Escape HTML special characters for Telegram's HTML parse mode.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Generate a random integer between min and max (inclusive).
 * Uses crypto.getRandomValues for cryptographic-quality randomness.
 */
export function cryptoRandomInt(min: number, max: number): number {
  const range = max - min + 1;
  const bytesNeeded = Math.ceil(Math.log2(range) / 8);
  const maxValid = Math.floor(256 ** bytesNeeded / range) * range - 1;

  const randomBytes = new Uint8Array(bytesNeeded);
  let randomValue: number;

  do {
    crypto.getRandomValues(randomBytes);
    randomValue = 0;
    for (let i = 0; i < bytesNeeded; i++) {
      randomValue = (randomValue << 8) | randomBytes[i];
    }
  } while (randomValue > maxValid);

  return min + (randomValue % range);
}

/**
 * Generate sorted, unique random numbers for a lottery ticket.
 */
export function generateRandomNumbers(
  count: number,
  maxNumber: number,
): number[] {
  const numbers = new Set<number>();
  while (numbers.size < count) {
    numbers.add(cryptoRandomInt(1, maxNumber));
  }
  return Array.from(numbers).sort((a, b) => a - b);
}

/**
 * Count how many numbers match between a ticket and the winning numbers.
 */
export function countMatches(
  ticketNumbers: number[],
  winningNumbers: number[],
): number {
  const winningSet = new Set(winningNumbers);
  return ticketNumbers.filter((n) => winningSet.has(n)).length;
}

/**
 * Validate a Solana wallet address format.
 */
export function isValidWalletAddress(address: string): boolean {
  try {
    // Basic Solana pubkey validation (base58, 32-44 chars)
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Truncate a wallet address for display.
 */
export function shortenAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
