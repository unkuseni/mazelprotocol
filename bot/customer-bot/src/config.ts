/**
 * Configuration module for the customer-facing Telegram bot.
 *
 * Loads from environment variables via process.env (dotenv).
 * Standard Node.js — no Cloudflare bindings.
 */

import "dotenv/config";
import { type Commitment, PublicKey, Keypair } from "@solana/web3.js";

// ---------------------------------------------------------------------------
// PDA Seeds — must mirror on-chain constants exactly
// ---------------------------------------------------------------------------

export const LOTTERY_SEED = Buffer.from("lottery");
export const DRAW_SEED = Buffer.from("draw");
export const TICKET_SEED = Buffer.from("ticket");
export const USER_SEED = Buffer.from("user");
export const UNIFIED_TICKET_SEED = Buffer.from("unified_ticket");
export const PRIZE_POOL_USDC_SEED = Buffer.from("prize_pool_usdc");
export const HOUSE_FEE_USDC_SEED = Buffer.from("house_fee_usdc");
export const INSURANCE_POOL_USDC_SEED = Buffer.from("insurance_pool_usdc");
export const QUICK_PICK_SEED = Buffer.from("quick_pick");
export const QUICK_PICK_DRAW_SEED = Buffer.from("quick_pick_draw");
export const QUICK_PICK_TICKET_SEED = Buffer.from("quick_pick_ticket");
export const SYNDICATE_SEED = Buffer.from("syndicate");

// ---------------------------------------------------------------------------
// On-chain constants (mirrored from programs/)
// ---------------------------------------------------------------------------

export const MAIN_PICK_COUNT = 6;
export const MAIN_MAX_NUMBER = 46;
export const MAIN_TICKET_PRICE_LAMPORTS = 2_500_000;
export const MAIN_SEED_AMOUNT = 500_000_000_000;
export const MAIN_SOFT_CAP = 1_750_000_000_000;
export const MAIN_HARD_CAP = 2_250_000_000_000;

export const QP_PICK_COUNT = 5;
export const QP_MAX_NUMBER = 35;
export const QP_TICKET_PRICE_LAMPORTS = 1_500_000;
export const QP_SEED_AMOUNT = 5_000_000_000;
export const QP_SOFT_CAP = 30_000_000_000;
export const QP_HARD_CAP = 50_000_000_000;

export const MAIN_MATCH_5_PRIZE = 4_000_000_000;
export const MAIN_MATCH_4_PRIZE = 150_000_000;
export const MAIN_MATCH_3_PRIZE = 5_000_000;
export const MAIN_MATCH_2_VALUE = 2_500_000;

export const QP_MATCH_4_PRIZE = 100_000_000;
export const QP_MATCH_3_PRIZE = 4_000_000;

export const ROLLDOWN_MATCH_5_BPS = 2500;
export const ROLLDOWN_MATCH_4_BPS = 3500;
export const ROLLDOWN_MATCH_3_BPS = 4000;
export const QP_ROLLDOWN_MATCH_4_BPS = 6000;
export const QP_ROLLDOWN_MATCH_3_BPS = 4000;

export const FEE_TIER_1_BPS = 2800;
export const FEE_TIER_2_BPS = 3200;
export const FEE_TIER_3_BPS = 3600;
export const FEE_TIER_4_BPS = 4000;
export const FEE_ROLLDOWN_BPS = 2800;

export const BPS_DENOMINATOR = 10_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BotConfig {
  rpcUrl: string;
  commitment: Commitment;
  telegramBotToken: string;
  mainProgramId: PublicKey;
  qpProgramId: PublicKey;
  usdcMint: PublicKey;
  webAppUrl: string;
  /** Authority keypair for signing ticket purchases (optional — custodial mode) */
  authorityKeypair: Keypair | null;
}

export interface MainPDAs {
  lotteryState: PublicKey;
  lotteryBump: number;
  prizePoolUsdc: PublicKey;
  houseFeeUsdc: PublicKey;
  insurancePoolUsdc: PublicKey;
}

export interface QPPDAs {
  quickPickState: PublicKey;
  qpBump: number;
  prizePoolUsdc: PublicKey;
  houseFeeUsdc: PublicKey;
  insurancePoolUsdc: PublicKey;
}

// ---------------------------------------------------------------------------
// PDA derivation
// ---------------------------------------------------------------------------

export function deriveMainPDAs(programId: PublicKey): MainPDAs {
  const [lotteryState, lotteryBump] = PublicKey.findProgramAddressSync(
    [LOTTERY_SEED], programId);
  const [prizePoolUsdc] = PublicKey.findProgramAddressSync(
    [PRIZE_POOL_USDC_SEED], programId);
  const [houseFeeUsdc] = PublicKey.findProgramAddressSync(
    [HOUSE_FEE_USDC_SEED], programId);
  const [insurancePoolUsdc] = PublicKey.findProgramAddressSync(
    [INSURANCE_POOL_USDC_SEED], programId);
  return { lotteryState, lotteryBump, prizePoolUsdc, houseFeeUsdc, insurancePoolUsdc };
}

export function deriveQPPDAs(programId: PublicKey): QPPDAs {
  const [quickPickState, qpBump] = PublicKey.findProgramAddressSync(
    [QUICK_PICK_SEED], programId);
  const [prizePoolUsdc] = PublicKey.findProgramAddressSync(
    [PRIZE_POOL_USDC_SEED], programId);
  const [houseFeeUsdc] = PublicKey.findProgramAddressSync(
    [HOUSE_FEE_USDC_SEED], programId);
  const [insurancePoolUsdc] = PublicKey.findProgramAddressSync(
    [INSURANCE_POOL_USDC_SEED], programId);
  return { quickPickState, qpBump, prizePoolUsdc, houseFeeUsdc, insurancePoolUsdc };
}

export function deriveDrawResultPDA(drawId: number | bigint, programId: PublicKey): [PublicKey, number] {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(drawId));
  return PublicKey.findProgramAddressSync([DRAW_SEED, buf], programId);
}

export function deriveQPDrawResultPDA(drawId: number | bigint, programId: PublicKey): [PublicKey, number] {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(drawId));
  return PublicKey.findProgramAddressSync([QUICK_PICK_DRAW_SEED, buf], programId);
}

export function deriveUserStatsPDA(wallet: PublicKey, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([USER_SEED, wallet.toBuffer()], programId);
}

export function deriveTicketPDA(
  drawId: number | bigint, ticketIndex: number | bigint, programId: PublicKey,
): [PublicKey, number] {
  const drawBuf = Buffer.alloc(8); drawBuf.writeBigUInt64LE(BigInt(drawId));
  const idxBuf = Buffer.alloc(8); idxBuf.writeBigUInt64LE(BigInt(ticketIndex));
  return PublicKey.findProgramAddressSync([TICKET_SEED, drawBuf, idxBuf], programId);
}

export function deriveQPTicketPDA(
  drawId: number | bigint, ticketIndex: number | bigint, programId: PublicKey,
): [PublicKey, number] {
  const drawBuf = Buffer.alloc(8); drawBuf.writeBigUInt64LE(BigInt(drawId));
  const idxBuf = Buffer.alloc(8); idxBuf.writeBigUInt64LE(BigInt(ticketIndex));
  return PublicKey.findProgramAddressSync(
    [QUICK_PICK_TICKET_SEED, drawBuf, idxBuf], programId);
}

// ---------------------------------------------------------------------------
// Config loader (from process.env)
// ---------------------------------------------------------------------------

function envRequired(key: string): string {
  const val = process.env[key];
  if (!val || val.trim() === "") {
    throw new Error(`Missing required environment variable: ${key}. Set it in .env`);
  }
  return val;
}

function envStr(key: string, fallback?: string): string | undefined {
  const val = process.env[key];
  if (val === undefined || val === null || val === "") return fallback;
  return val;
}

export function loadConfig(): BotConfig {
  const rpcUrl = envRequired("RPC_URL");
  const commitment = (envStr("COMMITMENT", "confirmed") || "confirmed") as Commitment;
  const telegramBotToken = envRequired("TELEGRAM_BOT_TOKEN");
  const mainProgramId = new PublicKey(envRequired("MAIN_PROGRAM_ID"));
  const qpProgramId = new PublicKey(envRequired("QP_PROGRAM_ID"));
  const usdcMintRaw = envStr("USDC_MINT");
  const usdcMint = usdcMintRaw ? new PublicKey(usdcMintRaw) : new PublicKey(
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" // mainnet USDC default
  );
  const webAppUrl = envStr("WEB_APP_URL", "https://app.mazelprotocol.io")!;

  // Authority keypair (optional — enables custodial ticket buying)
  let authorityKeypair: Keypair | null = null;
  const authKeyRaw = envStr("AUTHORITY_KEYPAIR_JSON");
  if (authKeyRaw) {
    try {
      const secretKey = new Uint8Array(JSON.parse(authKeyRaw));
      if (secretKey.length === 64) {
        authorityKeypair = Keypair.fromSecretKey(secretKey);
      }
    } catch { /* leave as null */ }
  }

  return { rpcUrl, commitment, telegramBotToken, mainProgramId, qpProgramId, usdcMint, webAppUrl, authorityKeypair };
}
