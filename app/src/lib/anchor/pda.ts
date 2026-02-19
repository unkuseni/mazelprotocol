import { PublicKey } from "@solana/web3.js";
import { env } from "@/env";

// ---------------------------------------------------------------------------
// PDA Seeds — must mirror on-chain constants exactly
// ---------------------------------------------------------------------------

// Main lottery seeds
export const LOTTERY_SEED = Buffer.from("lottery");
export const TICKET_SEED = Buffer.from("ticket");
export const DRAW_SEED = Buffer.from("draw");
export const USER_SEED = Buffer.from("user");
export const UNIFIED_TICKET_SEED = Buffer.from("unified_ticket");
export const PRIZE_POOL_USDC_SEED = Buffer.from("prize_pool_usdc");
export const HOUSE_FEE_USDC_SEED = Buffer.from("house_fee_usdc");
export const INSURANCE_POOL_USDC_SEED = Buffer.from("insurance_pool_usdc");

// Quick Pick seeds
export const QUICK_PICK_SEED = Buffer.from("quick_pick");
export const QUICK_PICK_TICKET_SEED = Buffer.from("quick_pick_ticket");
export const QUICK_PICK_DRAW_SEED = Buffer.from("quick_pick_draw");
export const QP_PRIZE_POOL_USDC_SEED = Buffer.from("prize_pool_usdc");
export const QP_HOUSE_FEE_USDC_SEED = Buffer.from("house_fee_usdc");
export const QP_INSURANCE_POOL_USDC_SEED = Buffer.from("insurance_pool_usdc");

// ---------------------------------------------------------------------------
// On-chain constants (mirrored from programs)
// ---------------------------------------------------------------------------

/** Main lottery: 6 numbers per ticket */
export const NUMBERS_PER_TICKET = 6;
/** Main lottery: max number is 46 */
export const MAX_NUMBER = 46;
/** Quick Pick: 5 numbers per ticket */
export const QP_NUMBERS_PER_TICKET = 5;
/** Quick Pick: max number is 35 */
export const QP_MAX_NUMBER = 35;

// ---------------------------------------------------------------------------
// Program IDs (from environment)
// ---------------------------------------------------------------------------

/** Main lottery program ID */
export const MAIN_LOTTERY_PROGRAM_ID = new PublicKey(
  env.VITE_MAIN_LOTTERY_PROGRAM_ID,
);

/** Quick Pick Express program ID */
export const QUICK_PICK_PROGRAM_ID = new PublicKey(
  env.VITE_QUICKPICK_PROGRAM_ID,
);

/** USDC mint address */
export const USDC_MINT = new PublicKey(env.VITE_USDC_MINT);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MainPDAs {
  lotteryState: PublicKey;
  lotteryBump: number;
  prizePoolUsdc: PublicKey;
  houseFeeUsdc: PublicKey;
  insurancePoolUsdc: PublicKey;
}

export interface QuickPickPDAs {
  quickPickState: PublicKey;
  qpBump: number;
  prizePoolUsdc: PublicKey;
  houseFeeUsdc: PublicKey;
  insurancePoolUsdc: PublicKey;
}

// ---------------------------------------------------------------------------
// Main Lottery PDA derivation helpers
// ---------------------------------------------------------------------------

/**
 * Derive the main lottery state PDA
 */
export function deriveLotteryState(
  programId: PublicKey = MAIN_LOTTERY_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([LOTTERY_SEED], programId);
}

/**
 * Derive the draw result PDA for a given draw ID (main lottery)
 */
export function deriveDrawResultPDA(
  drawId: number | bigint,
  programId: PublicKey = MAIN_LOTTERY_PROGRAM_ID,
): [PublicKey, number] {
  const drawIdBuf = Buffer.alloc(8);
  drawIdBuf.writeBigUInt64LE(BigInt(drawId));
  return PublicKey.findProgramAddressSync([DRAW_SEED, drawIdBuf], programId);
}

/**
 * Derive a single-ticket PDA for the main lottery
 */
export function deriveTicketPDA(
  drawId: number | bigint,
  ticketIndex: number | bigint,
  programId: PublicKey = MAIN_LOTTERY_PROGRAM_ID,
): [PublicKey, number] {
  const drawIdBuf = Buffer.alloc(8);
  drawIdBuf.writeBigUInt64LE(BigInt(drawId));
  const ticketIdxBuf = Buffer.alloc(8);
  ticketIdxBuf.writeBigUInt64LE(BigInt(ticketIndex));
  return PublicKey.findProgramAddressSync(
    [TICKET_SEED, drawIdBuf, ticketIdxBuf],
    programId,
  );
}

/**
 * Derive a user's unified ticket PDA (across all draws)
 */
export function deriveUnifiedTicketPDA(
  user: PublicKey,
  programId: PublicKey = MAIN_LOTTERY_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [UNIFIED_TICKET_SEED, user.toBuffer()],
    programId,
  );
}

/**
 * Derive a user account PDA
 */
export function deriveUserPDA(
  user: PublicKey,
  programId: PublicKey = MAIN_LOTTERY_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [USER_SEED, user.toBuffer()],
    programId,
  );
}

/**
 * Derive the prize pool USDC token account PDA
 */
export function derivePrizePoolUsdcPDA(
  programId: PublicKey = MAIN_LOTTERY_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([PRIZE_POOL_USDC_SEED], programId);
}

/**
 * Derive the house fee USDC token account PDA
 */
export function deriveHouseFeeUsdcPDA(
  programId: PublicKey = MAIN_LOTTERY_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([HOUSE_FEE_USDC_SEED], programId);
}

/**
 * Derive the insurance pool USDC token account PDA
 */
export function deriveInsurancePoolUsdcPDA(
  programId: PublicKey = MAIN_LOTTERY_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([INSURANCE_POOL_USDC_SEED], programId);
}

/**
 * Derive all main lottery PDAs at once
 */
export function deriveMainPDAs(
  programId: PublicKey = MAIN_LOTTERY_PROGRAM_ID,
): MainPDAs {
  const [lotteryState, lotteryBump] = deriveLotteryState(programId);
  const [prizePoolUsdc] = derivePrizePoolUsdcPDA(programId);
  const [houseFeeUsdc] = deriveHouseFeeUsdcPDA(programId);
  const [insurancePoolUsdc] = deriveInsurancePoolUsdcPDA(programId);

  return {
    lotteryState,
    lotteryBump,
    prizePoolUsdc,
    houseFeeUsdc,
    insurancePoolUsdc,
  };
}

// ---------------------------------------------------------------------------
// Quick Pick Express PDA derivation helpers
// ---------------------------------------------------------------------------

/**
 * Derive the Quick Pick state PDA
 */
export function deriveQuickPickState(
  programId: PublicKey = QUICK_PICK_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([QUICK_PICK_SEED], programId);
}

/**
 * Derive the Quick Pick draw result PDA for a given draw ID
 */
export function deriveQuickPickDrawResultPDA(
  drawId: number | bigint,
  programId: PublicKey = QUICK_PICK_PROGRAM_ID,
): [PublicKey, number] {
  const drawIdBuf = Buffer.alloc(8);
  drawIdBuf.writeBigUInt64LE(BigInt(drawId));
  return PublicKey.findProgramAddressSync(
    [QUICK_PICK_DRAW_SEED, drawIdBuf],
    programId,
  );
}

/**
 * Derive a single-ticket PDA for Quick Pick
 */
export function deriveQuickPickTicketPDA(
  drawId: number | bigint,
  ticketIndex: number | bigint,
  programId: PublicKey = QUICK_PICK_PROGRAM_ID,
): [PublicKey, number] {
  const drawIdBuf = Buffer.alloc(8);
  drawIdBuf.writeBigUInt64LE(BigInt(drawId));
  const ticketIdxBuf = Buffer.alloc(8);
  ticketIdxBuf.writeBigUInt64LE(BigInt(ticketIndex));
  return PublicKey.findProgramAddressSync(
    [QUICK_PICK_TICKET_SEED, drawIdBuf, ticketIdxBuf],
    programId,
  );
}

/**
 * Derive the Quick Pick prize pool USDC token account PDA
 */
export function deriveQuickPickPrizePoolUsdcPDA(
  programId: PublicKey = QUICK_PICK_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([QP_PRIZE_POOL_USDC_SEED], programId);
}

/**
 * Derive the Quick Pick house fee USDC token account PDA
 */
export function deriveQuickPickHouseFeeUsdcPDA(
  programId: PublicKey = QUICK_PICK_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([QP_HOUSE_FEE_USDC_SEED], programId);
}

/**
 * Derive the Quick Pick insurance pool USDC token account PDA
 */
export function deriveQuickPickInsurancePoolUsdcPDA(
  programId: PublicKey = QUICK_PICK_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [QP_INSURANCE_POOL_USDC_SEED],
    programId,
  );
}

/**
 * Derive all Quick Pick PDAs at once
 */
export function deriveQuickPickPDAs(
  programId: PublicKey = QUICK_PICK_PROGRAM_ID,
): QuickPickPDAs {
  const [quickPickState, qpBump] = deriveQuickPickState(programId);
  const [prizePoolUsdc] = deriveQuickPickPrizePoolUsdcPDA(programId);
  const [houseFeeUsdc] = deriveQuickPickHouseFeeUsdcPDA(programId);
  const [insurancePoolUsdc] = deriveQuickPickInsurancePoolUsdcPDA(programId);

  return {
    quickPickState,
    qpBump,
    prizePoolUsdc,
    houseFeeUsdc,
    insurancePoolUsdc,
  };
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/**
 * Convert a number to a 8-byte little-endian buffer
 */
export function numberToU64Buffer(value: number | bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(value));
  return buf;
}

/**
 * Generate random lottery numbers within valid range
 */
export function generateRandomNumbers(
  count: number,
  max: number,
  min: number = 1,
): number[] {
  const numbers: number[] = [];
  while (numbers.length < count) {
    const num = Math.floor(Math.random() * (max - min + 1)) + min;
    if (!numbers.includes(num)) {
      numbers.push(num);
    }
  }
  return numbers.sort((a, b) => a - b);
}

/**
 * Generate random main lottery numbers (6 numbers from 1-46)
 */
export function generateMainLotteryNumbers(): number[] {
  return generateRandomNumbers(NUMBERS_PER_TICKET, MAX_NUMBER);
}

/**
 * Generate random Quick Pick numbers (5 numbers from 1-35)
 */
export function generateQuickPickNumbers(): number[] {
  return generateRandomNumbers(QP_NUMBERS_PER_TICKET, QP_MAX_NUMBER);
}

// ---------------------------------------------------------------------------
// Pre-computed PDAs (for convenience)
// ---------------------------------------------------------------------------

/** Main lottery PDAs */
export const mainPDAs = deriveMainPDAs();

/** Quick Pick PDAs */
export const quickPickPDAs = deriveQuickPickPDAs();

/** Main lottery state PDA */
export const lotteryState = mainPDAs.lotteryState;

/** Quick Pick state PDA */
export const quickPickState = quickPickPDAs.quickPickState;

/** Main lottery prize pool USDC account */
export const prizePoolUsdc = mainPDAs.prizePoolUsdc;

/** Main lottery house fee USDC account */
export const houseFeeUsdc = mainPDAs.houseFeeUsdc;

/** Main lottery insurance pool USDC account */
export const insurancePoolUsdc = mainPDAs.insurancePoolUsdc;

/** Quick Pick prize pool USDC account */
export const quickPickPrizePoolUsdc = quickPickPDAs.prizePoolUsdc;

/** Quick Pick house fee USDC account */
export const quickPickHouseFeeUsdc = quickPickPDAs.houseFeeUsdc;

/** Quick Pick insurance pool USDC account */
export const quickPickInsurancePoolUsdc = quickPickPDAs.insurancePoolUsdc;
