/**
 * Bot statistics persistence helpers.
 *
 * Loads and saves bot statistics (draws completed, errors, etc.) from
 * Cloudflare KV. Stats are loaded fresh on every Worker invocation.
 */

import type { PersistedBotStats } from "./env";
import { KV_KEYS } from "./env";

/** Load bot stats from KV, returning defaults if none exist. */
export async function loadStats(kv: KVNamespace): Promise<PersistedBotStats> {
  const raw = await kv.get(KV_KEYS.BOT_STATS);
  if (raw) {
    return JSON.parse(raw);
  }
  return {
    startTime: new Date().toISOString(),
    pollCount: 0,
    mainDrawsCompleted: 0,
    mainDrawsFailed: 0,
    qpDrawsCompleted: 0,
    qpDrawsFailed: 0,
    lastMainDrawId: null,
    lastMainDrawPhase: null,
    lastQPDrawId: null,
    lastQPDrawPhase: null,
    consecutiveErrors: 0,
  };
}

/** Persist bot stats to KV. */
export async function saveStats(
  kv: KVNamespace,
  stats: PersistedBotStats,
): Promise<void> {
  await kv.put(KV_KEYS.BOT_STATS, JSON.stringify(stats));
}
