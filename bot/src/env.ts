/**
 * Cloudflare Worker Environment Bindings.
 *
 * Defines the shape of `env` passed to fetch/scheduled handlers.
 * Secrets are set via `wrangler secret put <NAME>`.
 * Variables are set in wrangler.toml under [vars].
 */

// ---------------------------------------------------------------------------
// KV Namespace binding
// ---------------------------------------------------------------------------
export interface Env {
  // ---- KV Namespace ----
  /** Persists draw state between Worker invocations */
  DRAW_STATE: KVNamespace;

  // ---- Solana Connection ----
  /** RPC endpoint URL */
  RPC_URL: string;
  /** Commitment level: processed | confirmed | finalized */
  COMMITMENT: string;

  // ---- Authority Wallet (SECRET) ----
  /** JSON array of the authority keypair bytes, e.g. "[1,2,3,...,255]" */
  AUTHORITY_KEYPAIR_JSON: string;

  // ---- Telegram Bot (SECRETS) ----
  /** Telegram bot API token from @BotFather */
  TELEGRAM_BOT_TOKEN: string;
  /** Chat ID (user/group/channel) for notifications */
  TELEGRAM_CHAT_ID: string;
  /** Comma-separated list of authorized Telegram user IDs for commands */
  TELEGRAM_ADMIN_IDS?: string;

  // ---- Program IDs ----
  /** Main lottery program ID */
  MAIN_PROGRAM_ID: string;
  /** Quick Pick Express program ID */
  QP_PROGRAM_ID: string;

  // ---- Switchboard ----
  /** Switchboard on-demand queue public key */
  SWITCHBOARD_QUEUE: string;
  /** Optional Switchboard program ID override */
  SWITCHBOARD_PROGRAM_ID?: string;

  // ---- USDC ----
  /** USDC mint address */
  USDC_MINT: string;

  // ---- Bot Behavior ----
  /** "both" | "main-only" | "qp-only" */
  MODE?: string;
  /** Delay ms between commit and execute (default: "4000") */
  COMMIT_EXECUTE_DELAY_MS?: string;
  /** Max retries per phase (default: "3") */
  MAX_RETRIES?: string;
  /** Delay between retries in ms (default: "2000") */
  RETRY_DELAY_MS?: string;
  /** "true" to log without sending transactions */
  DRY_RUN?: string;

  // ---- Indexer ----
  /** Max getProgramAccounts results per call (default: "1000") */
  GPA_BATCH_SIZE?: string;

  // ---- Logging ----
  /** Log level: trace | debug | info | warn | error | fatal */
  LOG_LEVEL?: string;

  // ---- Transaction Settings ----
  /** Priority fee in micro-lamports per CU (default: "1000") */
  PRIORITY_FEE_MICRO_LAMPORTS?: string;
  /** Compute unit limit override */
  COMPUTE_UNIT_LIMIT?: string;
  /** "true" to skip preflight simulation */
  SKIP_PREFLIGHT?: string;
  /** Tx confirmation timeout in ms (default: "60000") */
  TX_CONFIRM_TIMEOUT_MS?: string;
}

// ---------------------------------------------------------------------------
// KV State Keys
// ---------------------------------------------------------------------------

/** Keys used in the DRAW_STATE KV namespace */
export const KV_KEYS = {
  /** Current main draw lifecycle state JSON */
  MAIN_DRAW_STATE: "main:draw_state",
  /** Current QP draw lifecycle state JSON */
  QP_DRAW_STATE: "qp:draw_state",
  /** Bot statistics JSON */
  BOT_STATS: "bot:stats",
  /** Whether the bot is paused ("true"/"false") */
  BOT_PAUSED: "bot:paused",
  /** Last successful main draw timestamp */
  MAIN_LAST_DRAW_TS: "main:last_draw_ts",
  /** Last successful QP draw timestamp */
  QP_LAST_DRAW_TS: "qp:last_draw_ts",
} as const;

// ---------------------------------------------------------------------------
// Persisted Draw State (stored in KV as JSON)
// ---------------------------------------------------------------------------

export interface PersistedDrawState {
  program: "main" | "quickpick";
  drawId: string; // stringified bigint
  phase: "idle" | "committed" | "executed" | "indexed" | "finalized" | "error";
  commitSlot?: number;
  commitTimestamp?: number;
  randomnessAccount?: string; // base58 pubkey
  winningNumbers?: number[];
  errorCount: number;
  lastError?: string;
  lastAttemptTimestamp?: number;
  /** Indexer result stored for finalize phase */
  indexerResult?: {
    winnerCounts: Record<string, number>;
    totalTicketsScanned: number;
    verificationHash: string; // hex-encoded
    nonce: string; // stringified bigint
  };
}

export interface PersistedBotStats {
  startTime: string; // ISO timestamp
  pollCount: number;
  mainDrawsCompleted: number;
  mainDrawsFailed: number;
  qpDrawsCompleted: number;
  qpDrawsFailed: number;
  lastMainDrawId: string | null;
  lastMainDrawPhase: string | null;
  lastQPDrawId: string | null;
  lastQPDrawPhase: string | null;
  consecutiveErrors: number;
}
