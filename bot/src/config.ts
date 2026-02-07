/**
 * Configuration module for MazelProtocol Draw Lifecycle Bot.
 *
 * Cloudflare Worker version — loads configuration from Worker env bindings
 * instead of filesystem / dotenv. Keypair is loaded from a JSON secret.
 *
 * Derives all on-chain PDAs needed by the bot to interact with the
 * Main Lottery and Quick Pick Express programs.
 */

import { type Commitment, Keypair, PublicKey } from "@solana/web3.js";
import type { Env } from "./env";

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

// Quick Pick uses the same token account seeds but scoped to its own program
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
/** Commit timeout in seconds (1 hour) */
export const DRAW_COMMIT_TIMEOUT = 3600;
/** Ticket sale cutoff for main lottery (1 hour before draw) */
export const TICKET_SALE_CUTOFF = 3600;
/** Ticket sale cutoff for Quick Pick (5 minutes before draw) */
export const QP_TICKET_SALE_CUTOFF = 300;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BotMode = "both" | "main-only" | "qp-only";

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

export interface BotConfig {
  // Connection
  rpcUrl: string;
  wssUrl: string | undefined;
  commitment: Commitment;

  // Authority
  authorityKeypair: Keypair;

  // Program IDs
  mainProgramId: PublicKey;
  qpProgramId: PublicKey;

  // Switchboard
  switchboardQueue: PublicKey;
  switchboardProgramId: PublicKey | undefined;

  // USDC
  usdcMint: PublicKey;

  // PDAs
  mainPDAs: MainPDAs;
  qpPDAs: QuickPickPDAs;

  // Bot behavior
  mode: BotMode;
  commitExecuteDelayMs: number;
  maxRetries: number;
  retryDelayMs: number;
  dryRun: boolean;

  // Indexer
  gpaBatchSize: number;
  indexerNonceSeed: number | undefined;

  // Logging
  logLevel: string;

  // Transaction settings
  priorityFeeMicroLamports: number;
  computeUnitLimit: number | undefined;
  skipPreflight: boolean;
  txConfirmTimeoutMs: number;

  // Telegram
  telegramBotToken: string;
  telegramChatId: string;
  telegramAdminIds: string[];
}

// ---------------------------------------------------------------------------
// PDA derivation helpers
// ---------------------------------------------------------------------------

export function deriveMainPDAs(programId: PublicKey): MainPDAs {
  const [lotteryState, lotteryBump] = PublicKey.findProgramAddressSync(
    [LOTTERY_SEED],
    programId,
  );
  const [prizePoolUsdc] = PublicKey.findProgramAddressSync(
    [PRIZE_POOL_USDC_SEED],
    programId,
  );
  const [houseFeeUsdc] = PublicKey.findProgramAddressSync(
    [HOUSE_FEE_USDC_SEED],
    programId,
  );
  const [insurancePoolUsdc] = PublicKey.findProgramAddressSync(
    [INSURANCE_POOL_USDC_SEED],
    programId,
  );
  return {
    lotteryState,
    lotteryBump,
    prizePoolUsdc,
    houseFeeUsdc,
    insurancePoolUsdc,
  };
}

export function deriveQPPDAs(programId: PublicKey): QuickPickPDAs {
  const [quickPickState, qpBump] = PublicKey.findProgramAddressSync(
    [QUICK_PICK_SEED],
    programId,
  );
  const [prizePoolUsdc] = PublicKey.findProgramAddressSync(
    [QP_PRIZE_POOL_USDC_SEED],
    programId,
  );
  const [houseFeeUsdc] = PublicKey.findProgramAddressSync(
    [QP_HOUSE_FEE_USDC_SEED],
    programId,
  );
  const [insurancePoolUsdc] = PublicKey.findProgramAddressSync(
    [QP_INSURANCE_POOL_USDC_SEED],
    programId,
  );
  return {
    quickPickState,
    qpBump,
    prizePoolUsdc,
    houseFeeUsdc,
    insurancePoolUsdc,
  };
}

/**
 * Derive the draw result PDA for a given draw ID (main lottery).
 */
export function deriveDrawResultPDA(
  drawId: number | bigint,
  programId: PublicKey,
): [PublicKey, number] {
  const drawIdBuf = Buffer.alloc(8);
  drawIdBuf.writeBigUInt64LE(BigInt(drawId));
  return PublicKey.findProgramAddressSync([DRAW_SEED, drawIdBuf], programId);
}

/**
 * Derive a single-ticket PDA for the main lottery.
 */
export function deriveTicketPDA(
  drawId: number | bigint,
  ticketIndex: number | bigint,
  programId: PublicKey,
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
 * Derive the Quick Pick draw result PDA for a given draw ID.
 */
export function deriveQPDrawResultPDA(
  drawId: number | bigint,
  programId: PublicKey,
): [PublicKey, number] {
  const drawIdBuf = Buffer.alloc(8);
  drawIdBuf.writeBigUInt64LE(BigInt(drawId));
  return PublicKey.findProgramAddressSync(
    [QUICK_PICK_DRAW_SEED, drawIdBuf],
    programId,
  );
}

// ---------------------------------------------------------------------------
// Environment helpers (Worker env bindings)
// ---------------------------------------------------------------------------

function envStr(
  envObj: Env,
  key: keyof Env,
  fallback?: string,
): string | undefined {
  const val = envObj[key];
  if (val === undefined || val === null || val === "") return fallback;
  return String(val);
}

function envRequired(envObj: Env, key: keyof Env): string {
  const val = envObj[key];
  if (!val || String(val).trim() === "") {
    throw new Error(
      `Missing required environment variable: ${key}. ` +
        `Set it in wrangler.toml [vars] or via \`wrangler secret put ${key}\`.`,
    );
  }
  return String(val);
}

function envInt(envObj: Env, key: keyof Env, fallback: number): number {
  const raw = envObj[key];
  if (raw === undefined || raw === null || raw === "") return fallback;
  const parsed = parseInt(String(raw), 10);
  if (Number.isNaN(parsed)) {
    throw new Error(
      `Environment variable ${key} must be an integer, got: ${raw}`,
    );
  }
  return parsed;
}

function envBool(
  envObj: Env,
  key: keyof Env,
  fallback: boolean = false,
): boolean {
  const raw = envObj[key];
  if (raw === undefined || raw === null || raw === "") return fallback;
  const str = String(raw).toLowerCase();
  return str === "true" || str === "1";
}

/**
 * Load the authority keypair from the AUTHORITY_KEYPAIR_JSON secret.
 *
 * The secret should contain the JSON array of bytes, e.g. "[1,2,3,...,255]"
 */
function loadKeypairFromSecret(jsonStr: string): Keypair {
  try {
    const secretKey = new Uint8Array(JSON.parse(jsonStr));
    if (secretKey.length !== 64) {
      throw new Error(
        `Keypair must be 64 bytes, got ${secretKey.length}. ` +
          `Make sure you're providing the full keypair (secret + public key).`,
      );
    }
    return Keypair.fromSecretKey(secretKey);
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error(
        `AUTHORITY_KEYPAIR_JSON is not valid JSON. ` +
          `It should be a JSON array like [1,2,3,...,255]. ` +
          `Set it with: wrangler secret put AUTHORITY_KEYPAIR_JSON`,
      );
    }
    throw err;
  }
}

function deriveWssFromRpc(rpcUrl: string): string {
  try {
    const url = new URL(rpcUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return url.toString();
  } catch {
    return rpcUrl.replace("https://", "wss://").replace("http://", "ws://");
  }
}

// ---------------------------------------------------------------------------
// Config loader
// ---------------------------------------------------------------------------

/**
 * Load and validate the bot configuration from Cloudflare Worker env bindings.
 *
 * Called on every Worker invocation (fetch or scheduled). Since Workers are
 * stateless, we re-derive everything each time. This is fast (sub-ms).
 */
export function loadConfig(env: Env): BotConfig {
  // Connection
  const rpcUrl = envRequired(env, "RPC_URL");
  const wssUrl = deriveWssFromRpc(rpcUrl);
  const commitment =
    (envStr(env, "COMMITMENT", "confirmed") as Commitment) || "confirmed";

  // Authority
  const keypairJson = envRequired(env, "AUTHORITY_KEYPAIR_JSON");
  const authorityKeypair = loadKeypairFromSecret(keypairJson);

  // Program IDs
  const mainProgramId = new PublicKey(envRequired(env, "MAIN_PROGRAM_ID"));
  const qpProgramId = new PublicKey(envRequired(env, "QP_PROGRAM_ID"));

  // Switchboard
  const sbQueueRaw = envRequired(env, "SWITCHBOARD_QUEUE");
  const switchboardQueue = new PublicKey(sbQueueRaw);
  const sbProgramRaw = envStr(env, "SWITCHBOARD_PROGRAM_ID");
  const switchboardProgramId = sbProgramRaw
    ? new PublicKey(sbProgramRaw)
    : undefined;

  // USDC
  const usdcMint = new PublicKey(envRequired(env, "USDC_MINT"));

  // Derive PDAs
  const mainPDAs = deriveMainPDAs(mainProgramId);
  const qpPDAs = deriveQPPDAs(qpProgramId);

  // Bot behavior
  const modeRaw = envStr(env, "MODE", "both") as string;
  let mode: BotMode = "both";
  if (modeRaw === "main-only" || modeRaw === "qp-only" || modeRaw === "both") {
    mode = modeRaw;
  }

  const commitExecuteDelayMs = envInt(env, "COMMIT_EXECUTE_DELAY_MS", 4_000);
  const maxRetries = envInt(env, "MAX_RETRIES", 3);
  const retryDelayMs = envInt(env, "RETRY_DELAY_MS", 2_000);
  const dryRun = envBool(env, "DRY_RUN");

  // Indexer
  const gpaBatchSize = envInt(env, "GPA_BATCH_SIZE", 1000);
  const indexerNonceSeed = undefined; // Not used in Worker mode

  // Logging
  const logLevel = envStr(env, "LOG_LEVEL", "info") as string;

  // Transaction settings
  const priorityFeeMicroLamports = envInt(
    env,
    "PRIORITY_FEE_MICRO_LAMPORTS",
    1_000,
  );
  const computeUnitLimitRaw = envStr(env, "COMPUTE_UNIT_LIMIT");
  const computeUnitLimit = computeUnitLimitRaw
    ? parseInt(computeUnitLimitRaw, 10)
    : undefined;
  const skipPreflight = envBool(env, "SKIP_PREFLIGHT");
  const txConfirmTimeoutMs = envInt(env, "TX_CONFIRM_TIMEOUT_MS", 60_000);

  // Telegram
  const telegramBotToken = envRequired(env, "TELEGRAM_BOT_TOKEN");
  const telegramChatId = envRequired(env, "TELEGRAM_CHAT_ID");
  const adminIdsRaw = envStr(env, "TELEGRAM_ADMIN_IDS", "");
  const telegramAdminIds = adminIdsRaw
    ? adminIdsRaw
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    : [];

  return {
    rpcUrl,
    wssUrl,
    commitment,
    authorityKeypair,
    mainProgramId,
    qpProgramId,
    switchboardQueue,
    switchboardProgramId,
    usdcMint,
    mainPDAs,
    qpPDAs,
    mode,
    commitExecuteDelayMs,
    maxRetries,
    retryDelayMs,
    dryRun,
    gpaBatchSize,
    indexerNonceSeed,
    logLevel,
    priorityFeeMicroLamports,
    computeUnitLimit,
    skipPreflight,
    txConfirmTimeoutMs,
    telegramBotToken,
    telegramChatId,
    telegramAdminIds,
  };
}

/**
 * Pretty-print the config for startup logging (redacts secrets).
 */
export function formatConfigSummary(cfg: BotConfig): string {
  const lines: string[] = [
    "╔══════════════════════════════════════════════════════════════╗",
    "║     MazelProtocol Draw Bot — Cloudflare Worker Edition      ║",
    "╚══════════════════════════════════════════════════════════════╝",
    "",
    `  RPC URL:          ${cfg.rpcUrl}`,
    `  Commitment:       ${cfg.commitment}`,
    `  Authority:        ${cfg.authorityKeypair.publicKey.toBase58()}`,
    `  Mode:             ${cfg.mode}`,
    `  Dry run:          ${cfg.dryRun}`,
    "",
    `  Main Program:     ${cfg.mainProgramId.toBase58()}`,
    `  QP Program:       ${cfg.qpProgramId.toBase58()}`,
    `  USDC Mint:        ${cfg.usdcMint.toBase58()}`,
    `  SB Queue:         ${cfg.switchboardQueue.toBase58()}`,
    "",
    "  Main PDAs:",
    `    Lottery State:    ${cfg.mainPDAs.lotteryState.toBase58()}`,
    `    Prize Pool USDC:  ${cfg.mainPDAs.prizePoolUsdc.toBase58()}`,
    `    House Fee USDC:   ${cfg.mainPDAs.houseFeeUsdc.toBase58()}`,
    `    Insurance USDC:   ${cfg.mainPDAs.insurancePoolUsdc.toBase58()}`,
    "",
    "  Quick Pick PDAs:",
    `    QP State:         ${cfg.qpPDAs.quickPickState.toBase58()}`,
    `    QP Prize Pool:    ${cfg.qpPDAs.prizePoolUsdc.toBase58()}`,
    `    QP House Fee:     ${cfg.qpPDAs.houseFeeUsdc.toBase58()}`,
    `    QP Insurance:     ${cfg.qpPDAs.insurancePoolUsdc.toBase58()}`,
    "",
    `  Commit→Execute:   ${cfg.commitExecuteDelayMs}ms`,
    `  Max retries:      ${cfg.maxRetries}`,
    `  Priority fee:     ${cfg.priorityFeeMicroLamports} µL/CU`,
    `  Log level:        ${cfg.logLevel}`,
    `  Telegram:         ✅ connected (chat: ${cfg.telegramChatId})`,
  ];
  return lines.join("\n");
}
