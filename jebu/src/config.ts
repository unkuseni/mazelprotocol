/**
 * Environment configuration for JEBU.
 * Infra-level settings come from the environment; game-level settings live
 * in the `game_config` table (editable via `jebu settings`).
 */
import 'dotenv/config';

export interface AppConfig {
  databaseUrl: string;
  databaseAuthToken?: string;
  port: number;
  host: string;
  adminToken: string;
  treasuryPubkey?: string;
  treasuryKeypair?: string;
  rpcUrl: string;
  usdcMint: string;
  solUsdPrice: number;
  tickMs: number;
  watchMs: number;
  commitRevealDelayS: number;
  finalizationDelayS: number;
  orderExpiryS: number;
  minPaymentUsdc: number;
  orderToleranceUsdc: number;
  commitTimeoutS: number;
  advancementTimeoutS: number;
  pollSignaturesLimit: number;
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) throw new Error(`Invalid integer for ${name}: ${raw}`);
  return n;
}

function numEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseFloat(raw);
  if (Number.isNaN(n)) throw new Error(`Invalid number for ${name}: ${raw}`);
  return n;
}

/**
 * Admin token must be explicitly configured. Failing closed prevents a
 * misconfigured production deployment from exposing the admin API behind the
 * well-known `change-me-admin-token` default.
 */
function requireAdminToken(): string {
  const token = process.env.JEBU_ADMIN_TOKEN;
  if (!token || token === 'change-me-admin-token') {
    if (process.env.JEBU_ALLOW_INSECURE_ADMIN === '1') {
      return 'change-me-admin-token';
    }
    throw new Error(
      'JEBU_ADMIN_TOKEN is required. Set JEBU_ALLOW_INSECURE_ADMIN=1 only for local development.',
    );
  }
  return token;
}

export function loadConfig(): AppConfig {
  return {
    databaseUrl: process.env.JEBU_DATABASE_URL ?? 'file:jebu.db',
    databaseAuthToken: process.env.JEBU_DATABASE_AUTH_TOKEN || undefined,
    port: intEnv('JEBU_PORT', 3000),
    host: process.env.JEBU_HOST ?? '127.0.0.1',
    adminToken: requireAdminToken(),
    treasuryPubkey: process.env.JEBU_TREASURY_PUBKEY || undefined,
    treasuryKeypair: process.env.JEBU_TREASURY_KEYPAIR || undefined,
    rpcUrl: process.env.JEBU_RPC_URL ?? 'https://api.devnet.solana.com',
    usdcMint: process.env.JEBU_USDC_MINT ?? '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDNCiu',
    solUsdPrice: numEnv('JEBU_SOL_USD_PRICE', 150),
    tickMs: intEnv('JEBU_TICK_MS', 5000),
    watchMs: intEnv('JEBU_WATCH_MS', 10000),
    commitRevealDelayS: intEnv('JEBU_COMMIT_REVEAL_DELAY_S', 60),
    finalizationDelayS: intEnv('JEBU_FINALIZATION_DELAY_S', 120),
    orderExpiryS: intEnv('JEBU_ORDER_EXPIRY_S', 1800),
    minPaymentUsdc: intEnv('JEBU_MIN_PAYMENT_USDC', 250_000),
    orderToleranceUsdc: intEnv('JEBU_ORDER_TOLERANCE_USDC', 100_000),
    commitTimeoutS: intEnv('JEBU_COMMIT_TIMEOUT_S', 3600),
    advancementTimeoutS: intEnv('JEBU_ADVANCEMENT_TIMEOUT_S', 1800),
    pollSignaturesLimit: intEnv('JEBU_POLL_SIGNATURES_LIMIT', 50),
  };
}
