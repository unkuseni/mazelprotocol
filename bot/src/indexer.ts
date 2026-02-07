/**
 * Indexer Module for MazelProtocol Draw Lifecycle Bot.
 *
 * Responsible for:
 * 1. Fetching all tickets (single + bulk) for a given draw from on-chain accounts
 * 2. Comparing each ticket's numbers against the winning numbers
 * 3. Counting winners per match tier
 * 4. Computing the verification hash (SHA256) required by finalize_draw
 *
 * The indexer supports both the Main Lottery (6/46) and Quick Pick Express (5/35).
 *
 * Verification Hash Format:
 *   Main:  SHA256(draw_id_le || winning_numbers || match_6_le || match_5_le || match_4_le || match_3_le || match_2_le || nonce_le)
 *   QP:    SHA256(draw_id_le || winning_numbers || match_5_le || match_4_le || match_3_le || nonce_le)
 */

import type {
  Connection,
  GetProgramAccountsFilter,
  PublicKey,
} from "@solana/web3.js";
import { createHash } from "node:crypto";
import {
  MAX_NUMBER,
  NUMBERS_PER_TICKET,
  QP_MAX_NUMBER,
  QP_NUMBERS_PER_TICKET,
} from "./config";
import type { Logger } from "./logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Winner counts for the main lottery (6/46). */
export interface MainWinnerCounts {
  match6: number;
  match5: number;
  match4: number;
  match3: number;
  match2: number;
}

/** Winner counts for Quick Pick Express (5/35). */
export interface QPWinnerCounts {
  match5: number;
  match4: number;
  match3: number;
}

/** Full indexer result for the main lottery. */
export interface MainIndexerResult {
  drawId: bigint;
  winningNumbers: number[];
  winnerCounts: MainWinnerCounts;
  totalTicketsScanned: number;
  verificationHash: Buffer;
  nonce: bigint;
  durationMs: number;
}

/** Full indexer result for Quick Pick Express. */
export interface QPIndexerResult {
  drawId: bigint;
  winningNumbers: number[];
  winnerCounts: QPWinnerCounts;
  totalTicketsScanned: number;
  verificationHash: Buffer;
  nonce: bigint;
  durationMs: number;
}

/** Parsed ticket data from on-chain accounts. */
interface ParsedTicket {
  /** The lottery numbers on this ticket */
  numbers: number[];
  /** Source account pubkey (for debugging) */
  pubkey: PublicKey;
}

// ---------------------------------------------------------------------------
// Constants — Account Discriminators & Layout Offsets
// ---------------------------------------------------------------------------

// Anchor account discriminators are the first 8 bytes of SHA256("account:<AccountName>")
// We compute these at module load time.

function anchorDiscriminator(accountName: string): Buffer {
  const hash = createHash("sha256").update(`account:${accountName}`).digest();
  return hash.subarray(0, 8);
}

/** Discriminator for `TicketData` (single ticket in main lottery) */
const TICKET_DATA_DISCRIMINATOR = anchorDiscriminator("TicketData");

/** Discriminator for `UnifiedTicket` (bulk ticket in main lottery) */
const UNIFIED_TICKET_DISCRIMINATOR = anchorDiscriminator("UnifiedTicket");

/** Discriminator for `QuickPickTicket` */
const QP_TICKET_DISCRIMINATOR = anchorDiscriminator("QuickPickTicket");

// --- TicketData layout offsets ---
// 8 (disc) + 32 (owner) + 8 (draw_id) + 6 (numbers) ...
const TICKET_DATA_DRAW_ID_OFFSET = 8 + 32; // byte 40
const TICKET_DATA_NUMBERS_OFFSET = 8 + 32 + 8; // byte 48
const TICKET_DATA_NUMBERS_LEN = 6;

// --- UnifiedTicket layout offsets ---
// 8 (disc) + 32 (owner) + 8 (draw_id) + 8 (start_ticket_id) + 4 (ticket_count) + 4 (vec_len) + N*6 (numbers)
const UNIFIED_DRAW_ID_OFFSET = 8 + 32; // byte 40
const UNIFIED_TICKET_COUNT_OFFSET = 8 + 32 + 8 + 8; // byte 56
const UNIFIED_VEC_LEN_OFFSET = 8 + 32 + 8 + 8 + 4; // byte 60
const UNIFIED_NUMBERS_DATA_OFFSET = 8 + 32 + 8 + 8 + 4 + 4; // byte 64

// --- QuickPickTicket layout offsets ---
// 8 (disc) + 32 (owner) + 8 (draw_id) + 5 (numbers) ...
const QP_TICKET_DRAW_ID_OFFSET = 8 + 32; // byte 40
const QP_TICKET_NUMBERS_OFFSET = 8 + 32 + 8; // byte 48
const QP_TICKET_NUMBERS_LEN = 5;

// ---------------------------------------------------------------------------
// Match counting
// ---------------------------------------------------------------------------

/**
 * Count how many numbers in `ticketNumbers` match `winningNumbers`.
 *
 * Both arrays must be sorted ascending. Uses a two-pointer merge
 * for O(n + m) performance.
 */
function countMatches(
  ticketNumbers: number[],
  winningNumbers: number[],
): number {
  let matches = 0;
  let i = 0;
  let j = 0;

  while (i < ticketNumbers.length && j < winningNumbers.length) {
    if (ticketNumbers[i] === winningNumbers[j]) {
      matches++;
      i++;
      j++;
    } else if (ticketNumbers[i] < winningNumbers[j]) {
      i++;
    } else {
      j++;
    }
  }

  return matches;
}

/**
 * Ensure a number array is sorted ascending (non-destructive).
 */
function ensureSorted(nums: number[]): number[] {
  const sorted = [...nums];
  sorted.sort((a, b) => a - b);
  return sorted;
}

// ---------------------------------------------------------------------------
// Verification Hash
// ---------------------------------------------------------------------------

/**
 * Compute the verification hash for the main lottery finalize_draw instruction.
 *
 * Format: SHA256(draw_id_le(8) || winning_numbers(6) || match_6_le(4) || match_5_le(4) || match_4_le(4) || match_3_le(4) || match_2_le(4) || nonce_le(8))
 */
function computeMainVerificationHash(
  drawId: bigint,
  winningNumbers: number[],
  counts: MainWinnerCounts,
  nonce: bigint,
): Buffer {
  const buf = Buffer.alloc(8 + 6 + 4 * 5 + 8); // 42 bytes
  let offset = 0;

  // draw_id as u64 LE
  buf.writeBigUInt64LE(drawId, offset);
  offset += 8;

  // winning_numbers (6 bytes)
  for (let i = 0; i < 6; i++) {
    buf.writeUInt8(winningNumbers[i] ?? 0, offset);
    offset += 1;
  }

  // match counts as u32 LE
  buf.writeUInt32LE(counts.match6, offset);
  offset += 4;
  buf.writeUInt32LE(counts.match5, offset);
  offset += 4;
  buf.writeUInt32LE(counts.match4, offset);
  offset += 4;
  buf.writeUInt32LE(counts.match3, offset);
  offset += 4;
  buf.writeUInt32LE(counts.match2, offset);
  offset += 4;

  // nonce as u64 LE
  buf.writeBigUInt64LE(nonce, offset);

  return createHash("sha256").update(buf).digest();
}

/**
 * Compute the verification hash for the Quick Pick finalize_draw instruction.
 *
 * Format: SHA256(draw_id_le(8) || winning_numbers(5) || match_5_le(4) || match_4_le(4) || match_3_le(4) || nonce_le(8))
 */
function computeQPVerificationHash(
  drawId: bigint,
  winningNumbers: number[],
  counts: QPWinnerCounts,
  nonce: bigint,
): Buffer {
  const buf = Buffer.alloc(8 + 5 + 4 * 3 + 8); // 33 bytes
  let offset = 0;

  // draw_id as u64 LE
  buf.writeBigUInt64LE(drawId, offset);
  offset += 8;

  // winning_numbers (5 bytes)
  for (let i = 0; i < 5; i++) {
    buf.writeUInt8(winningNumbers[i] ?? 0, offset);
    offset += 1;
  }

  // match counts as u32 LE
  buf.writeUInt32LE(counts.match5, offset);
  offset += 4;
  buf.writeUInt32LE(counts.match4, offset);
  offset += 4;
  buf.writeUInt32LE(counts.match3, offset);
  offset += 4;

  // nonce as u64 LE
  buf.writeBigUInt64LE(nonce, offset);

  return createHash("sha256").update(buf).digest();
}

/**
 * Generate a nonce. If a seed is provided, use it deterministically;
 * otherwise, generate a cryptographically random nonce.
 */
function generateNonce(seed?: number): bigint {
  if (seed !== undefined) {
    return BigInt(seed);
  }
  // Random 8-byte nonce
  const buf = Buffer.alloc(8);
  // Use crypto.getRandomValues or simple Math.random fallback
  for (let i = 0; i < 8; i++) {
    buf[i] = Math.floor(Math.random() * 256);
  }
  return buf.readBigUInt64LE();
}

// ---------------------------------------------------------------------------
// Account Parsing
// ---------------------------------------------------------------------------

/**
 * Parse a single TicketData account buffer into ticket numbers.
 * Returns null if the data is malformed.
 */
function parseTicketData(data: Buffer): number[] | null {
  if (data.length < TICKET_DATA_NUMBERS_OFFSET + TICKET_DATA_NUMBERS_LEN) {
    return null;
  }

  const numbers: number[] = [];
  for (let i = 0; i < TICKET_DATA_NUMBERS_LEN; i++) {
    const num = data[TICKET_DATA_NUMBERS_OFFSET + i];
    if (num < 1 || num > MAX_NUMBER) return null;
    numbers.push(num);
  }

  return ensureSorted(numbers);
}

/**
 * Parse a UnifiedTicket account buffer into multiple ticket number arrays.
 * Returns an empty array if the data is malformed.
 */
function parseUnifiedTicket(data: Buffer): number[][] {
  if (data.length < UNIFIED_NUMBERS_DATA_OFFSET) {
    return [];
  }

  const ticketCount = data.readUInt32LE(UNIFIED_TICKET_COUNT_OFFSET);
  const vecLen = data.readUInt32LE(UNIFIED_VEC_LEN_OFFSET);

  // Sanity: vecLen should match ticketCount
  const count = Math.min(ticketCount, vecLen);

  if (
    data.length <
    UNIFIED_NUMBERS_DATA_OFFSET + count * TICKET_DATA_NUMBERS_LEN
  ) {
    return [];
  }

  const tickets: number[][] = [];
  for (let t = 0; t < count; t++) {
    const offset = UNIFIED_NUMBERS_DATA_OFFSET + t * TICKET_DATA_NUMBERS_LEN;
    const numbers: number[] = [];
    let valid = true;

    for (let i = 0; i < TICKET_DATA_NUMBERS_LEN; i++) {
      const num = data[offset + i];
      if (num < 1 || num > MAX_NUMBER) {
        valid = false;
        break;
      }
      numbers.push(num);
    }

    if (valid) {
      tickets.push(ensureSorted(numbers));
    }
  }

  return tickets;
}

/**
 * Parse a QuickPickTicket account buffer into ticket numbers.
 * Returns null if the data is malformed.
 */
function parseQPTicket(data: Buffer): number[] | null {
  if (data.length < QP_TICKET_NUMBERS_OFFSET + QP_TICKET_NUMBERS_LEN) {
    return null;
  }

  const numbers: number[] = [];
  for (let i = 0; i < QP_TICKET_NUMBERS_LEN; i++) {
    const num = data[QP_TICKET_NUMBERS_OFFSET + i];
    if (num < 1 || num > QP_MAX_NUMBER) return null;
    numbers.push(num);
  }

  return ensureSorted(numbers);
}

// ---------------------------------------------------------------------------
// RPC Fetching
// ---------------------------------------------------------------------------

/**
 * Build a memcmp filter to match the Anchor discriminator + draw_id at
 * a specific offset.
 */
function drawIdFilter(
  discriminator: Buffer,
  drawId: bigint,
  drawIdOffset: number,
): GetProgramAccountsFilter[] {
  // Filter 1: match discriminator at offset 0
  const discFilter: GetProgramAccountsFilter = {
    memcmp: {
      offset: 0,
      bytes: discriminator.toString("base64"),
      encoding: "base64" as any,
    },
  };

  // Filter 2: match draw_id at the known offset
  const drawIdBuf = Buffer.alloc(8);
  drawIdBuf.writeBigUInt64LE(drawId);
  const drawIdFilterObj: GetProgramAccountsFilter = {
    memcmp: {
      offset: drawIdOffset,
      bytes: drawIdBuf.toString("base64"),
      encoding: "base64" as any,
    },
  };

  return [discFilter, drawIdFilterObj];
}

/**
 * Fetch all single-ticket (TicketData) accounts for a given draw ID
 * from the main lottery program.
 */
async function fetchMainSingleTickets(
  connection: Connection,
  programId: PublicKey,
  drawId: bigint,
  logger: Logger,
): Promise<ParsedTicket[]> {
  const filters = drawIdFilter(
    TICKET_DATA_DISCRIMINATOR,
    drawId,
    TICKET_DATA_DRAW_ID_OFFSET,
  );

  logger.debug(
    { drawId: Number(drawId), accountType: "TicketData" },
    "Fetching single tickets via getProgramAccounts",
  );

  const accounts = await connection.getProgramAccounts(programId, {
    filters,
    commitment: "confirmed",
  });

  logger.debug(
    { drawId: Number(drawId), count: accounts.length },
    "Fetched single ticket accounts",
  );

  const tickets: ParsedTicket[] = [];
  for (const { pubkey, account } of accounts) {
    const numbers = parseTicketData(Buffer.from(account.data));
    if (numbers) {
      tickets.push({ numbers, pubkey });
    } else {
      logger.warn(
        { pubkey: pubkey.toBase58(), drawId: Number(drawId) },
        "Skipping malformed TicketData account",
      );
    }
  }

  return tickets;
}

/**
 * Fetch all bulk-ticket (UnifiedTicket) accounts for a given draw ID
 * from the main lottery program, and flatten them into individual tickets.
 */
async function fetchMainBulkTickets(
  connection: Connection,
  programId: PublicKey,
  drawId: bigint,
  logger: Logger,
): Promise<ParsedTicket[]> {
  const filters = drawIdFilter(
    UNIFIED_TICKET_DISCRIMINATOR,
    drawId,
    UNIFIED_DRAW_ID_OFFSET,
  );

  logger.debug(
    { drawId: Number(drawId), accountType: "UnifiedTicket" },
    "Fetching bulk tickets via getProgramAccounts",
  );

  const accounts = await connection.getProgramAccounts(programId, {
    filters,
    commitment: "confirmed",
  });

  logger.debug(
    { drawId: Number(drawId), count: accounts.length },
    "Fetched bulk ticket accounts",
  );

  const tickets: ParsedTicket[] = [];
  for (const { pubkey, account } of accounts) {
    const ticketSets = parseUnifiedTicket(Buffer.from(account.data));
    for (const numbers of ticketSets) {
      tickets.push({ numbers, pubkey });
    }
    if (ticketSets.length === 0) {
      logger.warn(
        { pubkey: pubkey.toBase58(), drawId: Number(drawId) },
        "Skipping malformed or empty UnifiedTicket account",
      );
    }
  }

  return tickets;
}

/**
 * Fetch all QuickPickTicket accounts for a given draw ID
 * from the Quick Pick Express program.
 */
async function fetchQPTickets(
  connection: Connection,
  programId: PublicKey,
  drawId: bigint,
  logger: Logger,
): Promise<ParsedTicket[]> {
  const filters = drawIdFilter(
    QP_TICKET_DISCRIMINATOR,
    drawId,
    QP_TICKET_DRAW_ID_OFFSET,
  );

  logger.debug(
    { drawId: Number(drawId), accountType: "QuickPickTicket" },
    "Fetching Quick Pick tickets via getProgramAccounts",
  );

  const accounts = await connection.getProgramAccounts(programId, {
    filters,
    commitment: "confirmed",
  });

  logger.debug(
    { drawId: Number(drawId), count: accounts.length },
    "Fetched Quick Pick ticket accounts",
  );

  const tickets: ParsedTicket[] = [];
  for (const { pubkey, account } of accounts) {
    const numbers = parseQPTicket(Buffer.from(account.data));
    if (numbers) {
      tickets.push({ numbers, pubkey });
    } else {
      logger.warn(
        { pubkey: pubkey.toBase58(), drawId: Number(drawId) },
        "Skipping malformed QuickPickTicket account",
      );
    }
  }

  return tickets;
}

// ---------------------------------------------------------------------------
// Main Lottery Indexer
// ---------------------------------------------------------------------------

/**
 * Index all tickets for a main lottery draw.
 *
 * Fetches single tickets (TicketData) and bulk tickets (UnifiedTicket),
 * counts matches per tier, and computes the verification hash.
 *
 * @param connection  - Solana RPC connection
 * @param programId   - Main lottery program ID
 * @param drawId      - The draw ID to index
 * @param winningNumbers - The 6 winning numbers (sorted ascending)
 * @param logger      - Logger instance
 * @param nonceSeed   - Optional deterministic nonce seed (for testing)
 * @returns MainIndexerResult with winner counts and verification hash
 */
export async function indexMainDraw(
  connection: Connection,
  programId: PublicKey,
  drawId: bigint,
  winningNumbers: number[],
  logger: Logger,
  nonceSeed?: number,
): Promise<MainIndexerResult> {
  const startTime = Date.now();

  // Validate winning numbers
  const sortedWinning = ensureSorted(winningNumbers);
  if (sortedWinning.length !== NUMBERS_PER_TICKET) {
    throw new Error(
      `Expected ${NUMBERS_PER_TICKET} winning numbers, got ${sortedWinning.length}`,
    );
  }
  for (const n of sortedWinning) {
    if (n < 1 || n > MAX_NUMBER) {
      throw new Error(`Winning number ${n} out of range [1, ${MAX_NUMBER}]`);
    }
  }

  logger.info(
    { drawId: Number(drawId), winningNumbers: sortedWinning },
    `[main] Indexing draw #${drawId}`,
  );

  // Fetch all tickets in parallel
  const [singleTickets, bulkTickets] = await Promise.all([
    fetchMainSingleTickets(connection, programId, drawId, logger),
    fetchMainBulkTickets(connection, programId, drawId, logger),
  ]);

  const allTickets = [...singleTickets, ...bulkTickets];

  logger.info(
    {
      drawId: Number(drawId),
      singleTickets: singleTickets.length,
      bulkTickets: bulkTickets.length,
      total: allTickets.length,
    },
    `[main] draw #${drawId}: ${allTickets.length} tickets found (${singleTickets.length} single + ${bulkTickets.length} bulk)`,
  );

  // Count winners per tier
  const counts: MainWinnerCounts = {
    match6: 0,
    match5: 0,
    match4: 0,
    match3: 0,
    match2: 0,
  };

  for (const ticket of allTickets) {
    const matches = countMatches(ticket.numbers, sortedWinning);
    switch (matches) {
      case 6:
        counts.match6++;
        break;
      case 5:
        counts.match5++;
        break;
      case 4:
        counts.match4++;
        break;
      case 3:
        counts.match3++;
        break;
      case 2:
        counts.match2++;
        break;
      // 0 or 1 matches: no prize
    }
  }

  // Generate nonce
  const nonce = generateNonce(nonceSeed);

  // Compute verification hash
  const verificationHash = computeMainVerificationHash(
    drawId,
    sortedWinning,
    counts,
    nonce,
  );

  const durationMs = Date.now() - startTime;

  logger.info(
    {
      drawId: Number(drawId),
      counts,
      totalTickets: allTickets.length,
      nonce: nonce.toString(),
      verificationHash: verificationHash.toString("hex"),
      durationMs,
    },
    `[main] draw #${drawId} indexed in ${durationMs}ms: M6=${counts.match6} M5=${counts.match5} M4=${counts.match4} M3=${counts.match3} M2=${counts.match2}`,
  );

  return {
    drawId,
    winningNumbers: sortedWinning,
    winnerCounts: counts,
    totalTicketsScanned: allTickets.length,
    verificationHash,
    nonce,
    durationMs,
  };
}

// ---------------------------------------------------------------------------
// Quick Pick Express Indexer
// ---------------------------------------------------------------------------

/**
 * Index all tickets for a Quick Pick Express draw.
 *
 * Fetches QuickPickTicket accounts, counts matches per tier,
 * and computes the verification hash.
 *
 * @param connection  - Solana RPC connection
 * @param programId   - Quick Pick Express program ID
 * @param drawId      - The draw ID to index
 * @param winningNumbers - The 5 winning numbers (sorted ascending)
 * @param logger      - Logger instance
 * @param nonceSeed   - Optional deterministic nonce seed (for testing)
 * @returns QPIndexerResult with winner counts and verification hash
 */
export async function indexQPDraw(
  connection: Connection,
  programId: PublicKey,
  drawId: bigint,
  winningNumbers: number[],
  logger: Logger,
  nonceSeed?: number,
): Promise<QPIndexerResult> {
  const startTime = Date.now();

  // Validate winning numbers
  const sortedWinning = ensureSorted(winningNumbers);
  if (sortedWinning.length !== QP_NUMBERS_PER_TICKET) {
    throw new Error(
      `Expected ${QP_NUMBERS_PER_TICKET} winning numbers, got ${sortedWinning.length}`,
    );
  }
  for (const n of sortedWinning) {
    if (n < 1 || n > QP_MAX_NUMBER) {
      throw new Error(`Winning number ${n} out of range [1, ${QP_MAX_NUMBER}]`);
    }
  }

  logger.info(
    { drawId: Number(drawId), winningNumbers: sortedWinning },
    `[quickpick] Indexing draw #${drawId}`,
  );

  // Fetch all Quick Pick tickets
  const tickets = await fetchQPTickets(connection, programId, drawId, logger);

  logger.info(
    { drawId: Number(drawId), total: tickets.length },
    `[quickpick] draw #${drawId}: ${tickets.length} tickets found`,
  );

  // Count winners per tier
  const counts: QPWinnerCounts = {
    match5: 0,
    match4: 0,
    match3: 0,
  };

  for (const ticket of tickets) {
    const matches = countMatches(ticket.numbers, sortedWinning);
    switch (matches) {
      case 5:
        counts.match5++;
        break;
      case 4:
        counts.match4++;
        break;
      case 3:
        counts.match3++;
        break;
      // 0, 1, or 2 matches: no prize in Quick Pick
    }
  }

  // Generate nonce
  const nonce = generateNonce(nonceSeed);

  // Compute verification hash
  const verificationHash = computeQPVerificationHash(
    drawId,
    sortedWinning,
    counts,
    nonce,
  );

  const durationMs = Date.now() - startTime;

  logger.info(
    {
      drawId: Number(drawId),
      counts,
      totalTickets: tickets.length,
      nonce: nonce.toString(),
      verificationHash: verificationHash.toString("hex"),
      durationMs,
    },
    `[quickpick] draw #${drawId} indexed in ${durationMs}ms: M5=${counts.match5} M4=${counts.match4} M3=${counts.match3}`,
  );

  return {
    drawId,
    winningNumbers: sortedWinning,
    winnerCounts: counts,
    totalTicketsScanned: tickets.length,
    verificationHash,
    nonce,
    durationMs,
  };
}

// ---------------------------------------------------------------------------
// Statistical Plausibility Check
// ---------------------------------------------------------------------------

/**
 * Run a basic statistical plausibility check on the winner counts.
 *
 * The on-chain program also runs its own checks, but pre-validating here
 * avoids wasting transaction fees on obviously bogus data.
 *
 * For the main lottery (6/46), approximate expected proportions:
 *   Match 6: ~1 in 9,366,819
 *   Match 5: ~1 in 39,028
 *   Match 4: ~1 in 800
 *   Match 3: ~1 in 47
 *   Match 2: ~1 in 6.8
 *
 * For Quick Pick (5/35):
 *   Match 5: ~1 in 324,632
 *   Match 4: ~1 in 2,164
 *   Match 3: ~1 in 75
 *
 * We use generous upper bounds (10x expected) to avoid false positives
 * while still catching obvious data corruption.
 */
export function plausibilityCheckMain(
  counts: MainWinnerCounts,
  totalTickets: number,
  logger: Logger,
): { ok: boolean; warnings: string[] } {
  const warnings: string[] = [];

  // Match 6 should be extremely rare
  if (totalTickets > 0 && counts.match6 > 0) {
    const expectedMax = Math.max(1, Math.ceil((totalTickets / 9_366_819) * 10));
    if (counts.match6 > expectedMax) {
      warnings.push(
        `Match 6 count (${counts.match6}) exceeds plausibility threshold (${expectedMax}) for ${totalTickets} tickets`,
      );
    }
  }

  // Match 5
  if (totalTickets > 0) {
    const expectedMax5 = Math.max(1, Math.ceil((totalTickets / 39_028) * 10));
    if (counts.match5 > expectedMax5) {
      warnings.push(
        `Match 5 count (${counts.match5}) exceeds plausibility threshold (${expectedMax5}) for ${totalTickets} tickets`,
      );
    }
  }

  // Match 4
  if (totalTickets > 0) {
    const expectedMax4 = Math.max(1, Math.ceil((totalTickets / 800) * 10));
    if (counts.match4 > expectedMax4) {
      warnings.push(
        `Match 4 count (${counts.match4}) exceeds plausibility threshold (${expectedMax4}) for ${totalTickets} tickets`,
      );
    }
  }

  // Match 3
  if (totalTickets > 0) {
    const expectedMax3 = Math.max(1, Math.ceil((totalTickets / 47) * 10));
    if (counts.match3 > expectedMax3) {
      warnings.push(
        `Match 3 count (${counts.match3}) exceeds plausibility threshold (${expectedMax3}) for ${totalTickets} tickets`,
      );
    }
  }

  // Total winners should not exceed total tickets
  const totalWinners =
    counts.match6 +
    counts.match5 +
    counts.match4 +
    counts.match3 +
    counts.match2;
  if (totalWinners > totalTickets) {
    warnings.push(
      `Total winners (${totalWinners}) exceeds total tickets (${totalTickets})`,
    );
  }

  // Monotonicity: lower tiers should generally have more winners
  // (not enforced strictly since small samples can violate this)
  if (
    totalTickets > 1000 &&
    counts.match3 > 0 &&
    counts.match4 > counts.match3
  ) {
    warnings.push(
      `Match 4 count (${counts.match4}) > Match 3 count (${counts.match3}) — unusual for ${totalTickets} tickets`,
    );
  }

  if (warnings.length > 0) {
    for (const w of warnings) {
      logger.warn({ check: "plausibility", program: "main" }, w);
    }
  }

  return { ok: warnings.length === 0, warnings };
}

/**
 * Run a basic statistical plausibility check on Quick Pick winner counts.
 */
export function plausibilityCheckQP(
  counts: QPWinnerCounts,
  totalTickets: number,
  logger: Logger,
): { ok: boolean; warnings: string[] } {
  const warnings: string[] = [];

  // Match 5 (jackpot) — very rare
  if (totalTickets > 0 && counts.match5 > 0) {
    const expectedMax = Math.max(1, Math.ceil((totalTickets / 324_632) * 10));
    if (counts.match5 > expectedMax) {
      warnings.push(
        `Match 5 count (${counts.match5}) exceeds plausibility threshold (${expectedMax}) for ${totalTickets} tickets`,
      );
    }
  }

  // Match 4
  if (totalTickets > 0) {
    const expectedMax4 = Math.max(1, Math.ceil((totalTickets / 2_164) * 10));
    if (counts.match4 > expectedMax4) {
      warnings.push(
        `Match 4 count (${counts.match4}) exceeds plausibility threshold (${expectedMax4}) for ${totalTickets} tickets`,
      );
    }
  }

  // Match 3
  if (totalTickets > 0) {
    const expectedMax3 = Math.max(1, Math.ceil((totalTickets / 75) * 10));
    if (counts.match3 > expectedMax3) {
      warnings.push(
        `Match 3 count (${counts.match3}) exceeds plausibility threshold (${expectedMax3}) for ${totalTickets} tickets`,
      );
    }
  }

  // Total winners should not exceed total tickets
  const totalWinners = counts.match5 + counts.match4 + counts.match3;
  if (totalWinners > totalTickets) {
    warnings.push(
      `Total winners (${totalWinners}) exceeds total tickets (${totalTickets})`,
    );
  }

  if (warnings.length > 0) {
    for (const w of warnings) {
      logger.warn({ check: "plausibility", program: "quickpick" }, w);
    }
  }

  return { ok: warnings.length === 0, warnings };
}

// ---------------------------------------------------------------------------
// Exports for testing
// ---------------------------------------------------------------------------

export const _testing = {
  countMatches,
  ensureSorted,
  computeMainVerificationHash,
  computeQPVerificationHash,
  generateNonce,
  parseTicketData,
  parseUnifiedTicket,
  parseQPTicket,
  TICKET_DATA_DISCRIMINATOR,
  UNIFIED_TICKET_DISCRIMINATOR,
  QP_TICKET_DISCRIMINATOR,
};
