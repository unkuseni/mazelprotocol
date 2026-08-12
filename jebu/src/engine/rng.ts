/**
 * Provably fair randomness — offchain commit-reveal.
 *
 * The operator commits SHA256(seed) BEFORE the reveal, making it impossible to
 * influence the draw after the commitment is public. Winning numbers and the
 * rolldown decision are domain-separated hashes of the seed, so each output is
 * independent and verifiable by anyone (`GET /api/games/:game/draws/:id/verify`).
 */
import { createHash, randomBytes } from 'node:crypto';

export function sha256(data: Buffer): Buffer {
  return createHash('sha256').update(data).digest();
}

export interface Commitment {
  /** 64-char hex seed — kept secret until reveal. */
  seedHex: string;
  /** 64-char hex commitment — published immediately. */
  commitmentHex: string;
}

export function createCommitment(): Commitment {
  const seed = randomBytes(32);
  return {
    seedHex: seed.toString('hex'),
    commitmentHex: sha256(seed).toString('hex'),
  };
}

/**
 * Derive `count` unique sorted numbers in [1, max] from a seed using
 * rejection sampling (no modulo bias), domain-separated from the rolldown
 * decision hash so the two outputs cannot be correlated.
 */
export function deriveWinningNumbers(seedHex: string, count: number, max: number): number[] {
  const seed = Buffer.from(seedHex, 'hex');
  // Domain separation + rejection threshold (largest multiple of max in u32).
  const rejectThreshold = Math.floor(0xffffffff / max) * max;

  let hash = sha256(Buffer.concat([Buffer.from('winning_numbers', 'utf8'), seed]));
  const chosen: number[] = [];

  for (let round = 0; round < 64 && chosen.length < count; round++) {
    for (let i = 0; i + 4 <= hash.length && chosen.length < count; i += 4) {
      const v = hash.readUInt32LE(i);
      if (v >= rejectThreshold) continue;
      const n = (v % max) + 1;
      if (!chosen.includes(n)) chosen.push(n);
    }
    if (chosen.length < count) {
      // Exhausted this hash block — chain another round seeded by the counter.
      hash = sha256(Buffer.concat([seed, Buffer.from([round])]));
    }
  }

  if (chosen.length !== count) {
    throw new Error(`Failed to derive ${count} unique numbers from seed`);
  }
  return chosen.sort((a, b) => a - b);
}

/**
 * Probabilistic rolldown decision.
 * - probabilityBps >= 10000 → always true (hard cap, forced rolldown)
 * - probabilityBps <= 0     → always false (below soft cap)
 * - otherwise → true with probability probabilityBps/10000, determined by the
 *   domain-separated hash of the seed (non-predictable, non-correlated).
 */
export function rolldownDecision(seedHex: string, probabilityBps: number): boolean {
  if (probabilityBps >= 10000) return true;
  if (probabilityBps <= 0) return false;
  const seed = Buffer.from(seedHex, 'hex');
  const h = sha256(Buffer.concat([Buffer.from('rolldown_decision', 'utf8'), seed]));
  const v = h.readUInt32LE(0);
  const threshold = Math.floor((v / 0xffffffff) * 10000);
  return threshold < probabilityBps;
}

/**
 * Independent verification of a revealed draw: recompute the winning numbers
 * (and rolldown decision) from the published seed and compare.
 */
export function verifyDraw(opts: {
  seedHex: string;
  expectedNumbers: number[];
  count: number;
  max: number;
  expectedRolldownDecided: boolean;
  probabilityBps: number;
}): { numbersMatch: boolean; rolldownMatches: boolean; recomputedNumbers: number[] } {
  const recomputedNumbers = deriveWinningNumbers(opts.seedHex, opts.count, opts.max);
  const decided = rolldownDecision(opts.seedHex, opts.probabilityBps);
  return {
    numbersMatch:
      recomputedNumbers.length === opts.expectedNumbers.length &&
      recomputedNumbers.every((v, i) => v === opts.expectedNumbers[i]),
    rolldownMatches: decided === opts.expectedRolldownDecided,
    recomputedNumbers,
  };
}
