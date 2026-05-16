/**
 * MazelProtocol Draw Lifecycle Bot — Cloudflare Worker Entry Point
 *
 * This is the top-level orchestrator that runs as a Cloudflare Worker:
 *
 *   1. `scheduled` handler — Cron trigger that polls draw readiness and
 *      advances the draw lifecycle one phase at a time. State is persisted
 *      in KV between invocations.
 *
 *   2. `fetch` handler — Delegates to routes.ts for HTTP dispatch
 *      (Telegram webhook, admin endpoints, health checks).
 *
 * Architecture:
 *   - Each cron tick checks on-chain state and advances ONE phase per program
 *   - Draw state is persisted in Cloudflare KV (DRAW_STATE namespace)
 *   - Telegram is used for notifications and command interface
 *   - Config is loaded from Worker env bindings (vars + secrets)
 *   - The bot is stateless between invocations; all state lives in KV + on-chain
 */

import { Connection, type Program } from "@coral-xyz/anchor";

import { loadConfig, type BotConfig } from "./config";
import {
  createLogger,
  logError,
  logFatal,
  sendAlert,
  type Logger,
} from "./logger";
import {
  executeMainDrawLifecycle,
  executeQPDrawLifecycle,
  isMainDrawReady,
  isQPDrawReady,
  type DrawState,
} from "./draw-executor";
import {
  handleTelegramWebhook,
  notifyDrawComplete,
  notifyDrawError,
} from "./telegram";
import type { Env, PersistedBotStats, PersistedDrawState } from "./env";
import { KV_KEYS } from "./env";
import { createPrograms } from "./programs";
import { loadStats, saveStats } from "./stats";
import { handleFetch } from "./routes";

// ---------------------------------------------------------------------------
// Draw state persistence
// ---------------------------------------------------------------------------

async function _loadDrawState(
  kv: KVNamespace,
  key: string,
): Promise<PersistedDrawState | null> {
  const raw = await kv.get(key);
  if (!raw) return null;
  return JSON.parse(raw);
}

async function saveDrawState(
  kv: KVNamespace,
  key: string,
  state: PersistedDrawState,
): Promise<void> {
  await kv.put(key, JSON.stringify(state));
}

function drawStateToKV(
  state: DrawState,
  program: "main" | "quickpick",
): PersistedDrawState {
  return {
    program,
    drawId: state.drawId.toString(),
    phase: state.phase,
    commitSlot: state.commitSlot,
    commitTimestamp: state.commitTimestamp,
    randomnessAccount: state.randomnessAccount?.toBase58(),
    winningNumbers: state.winningNumbers,
    errorCount: state.errorCount,
    lastError: state.lastError,
    lastAttemptTimestamp: state.lastAttemptTimestamp,
    indexerResult: state.indexerResult
      ? {
        winnerCounts: state.indexerResult.winnerCounts as Record<
          string,
          number
        >,
        totalTicketsScanned: state.indexerResult.totalTicketsScanned,
        verificationHash:
          state.indexerResult.verificationHash instanceof Buffer
            ? state.indexerResult.verificationHash.toString("hex")
            : String(state.indexerResult.verificationHash),
        nonce: state.indexerResult.nonce.toString(),
      }
      : undefined,
  };
}

// ---------------------------------------------------------------------------
// Scheduled Handler — Cron trigger for draw polling
// ---------------------------------------------------------------------------

async function handleScheduled(
  _event: ScheduledController,
  env: Env,
  ctx: ExecutionContext,
): Promise<void> {
  let config: BotConfig;
  let logger: Logger;

  try {
    config = loadConfig(env);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Failed to load configuration: ${msg}`);
    return;
  }

  logger = createLogger({
    level: (config.logLevel as any) || "info",
    telegramBotToken: config.telegramBotToken,
    telegramChatId: config.telegramChatId,
  });

  // Check if bot is paused
  const isPaused = await env.DRAW_STATE.get(KV_KEYS.BOT_PAUSED);
  if (isPaused === "true") {
    logger.debug("Bot is paused — skipping cron tick");
    return;
  }

  // Create connection and programs
  const connection = new Connection(config.rpcUrl, {
    commitment: config.commitment,
    confirmTransactionInitialTimeout: config.txConfirmTimeoutMs,
  });

  let mainProgram: Program<any>;
  let qpProgram: Program<any>;

  try {
    const programs = createPrograms(config, connection);
    mainProgram = programs.mainProgram;
    qpProgram = programs.qpProgram;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logFatal(logger, `Failed to load programs: ${msg}`, { error: msg });
    return;
  }

  // Load stats
  const stats = await loadStats(env.DRAW_STATE);
  stats.pollCount++;

  logger.debug({ pollCount: stats.pollCount }, `Cron tick #${stats.pollCount}`);

  // ---- Main Lottery ----
  if (config.mode === "both" || config.mode === "main-only") {
    ctx.waitUntil(
      processMainDraw(
        connection,
        mainProgram,
        config,
        env,
        logger,
        stats,
      ).catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        logError(
          logger,
          `[main] Unhandled error in cron tick: ${msg}`,
          { error: msg },
          true,
        );
        stats.mainDrawsFailed++;
        stats.consecutiveErrors++;
      }),
    );
  }

  // ---- Quick Pick Express ----
  if (config.mode === "both" || config.mode === "qp-only") {
    ctx.waitUntil(
      processQPDraw(
        connection,
        mainProgram,
        qpProgram,
        config,
        env,
        logger,
        stats,
      ).catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        logError(
          logger,
          `[quickpick] Unhandled error in cron tick: ${msg}`,
          { error: msg },
          true,
        );
        stats.qpDrawsFailed++;
        stats.consecutiveErrors++;
      }),
    );
  }

  // Save stats (we use waitUntil so the response isn't blocked)
  ctx.waitUntil(saveStats(env.DRAW_STATE, stats));
}

// ---------------------------------------------------------------------------
// Draw Processing — Main Lottery
// ---------------------------------------------------------------------------

async function processMainDraw(
  connection: Connection,
  mainProgram: Program<any>,
  config: BotConfig,
  env: Env,
  logger: Logger,
  stats: PersistedBotStats,
): Promise<void> {
  // Check if draw is ready
  const readiness = await isMainDrawReady(mainProgram, config, logger);
  if (!readiness.ready) {
    if (readiness.drawId) {
      logger.debug(
        { drawId: Number(readiness.drawId), reason: readiness.reason },
        `[main] Draw #${readiness.drawId} not ready: ${readiness.reason}`,
      );
    }
    return;
  }

  const drawId = readiness.drawId!;

  logger.info(
    { drawId: Number(drawId), reason: readiness.reason },
    `[main] Draw #${drawId} is ready — starting lifecycle`,
  );

  try {
    const result = await executeMainDrawLifecycle(
      connection,
      mainProgram,
      config,
      logger,
    );

    if (result.phase === "finalized") {
      stats.mainDrawsCompleted++;
      stats.consecutiveErrors = 0;
      logger.info(
        { drawId: Number(result.drawId), totalCompleted: stats.mainDrawsCompleted },
        `[main] Draw #${result.drawId} completed successfully`,
      );
      await notifyDrawComplete(
        config,
        logger,
        "main",
        Number(result.drawId),
        result.winningNumbers,
      );
    } else {
      logger.warn(
        { drawId: Number(result.drawId), phase: result.phase },
        `[main] Draw #${result.drawId} lifecycle stopped at phase: ${result.phase}`,
      );
    }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    logger.error(
      { drawId: Number(drawId), error, stack },
      `[main] Draw #${drawId} lifecycle failed`,
    );
    stats.mainDrawsFailed++;
    stats.consecutiveErrors++;
    await notifyDrawError(config, logger, "main", Number(drawId), error);
  }
}

// ---------------------------------------------------------------------------
// Draw Processing — Quick Pick Express
// ---------------------------------------------------------------------------

async function processQPDraw(
  connection: Connection,
  mainProgram: Program<any>,
  qpProgram: Program<any>,
  config: BotConfig,
  env: Env,
  logger: Logger,
  stats: PersistedBotStats,
): Promise<void> {
  // Check if draw is ready
  const readiness = await isQPDrawReady(qpProgram, config, logger);
  if (!readiness.ready) {
    if (readiness.drawId) {
      logger.debug(
        { drawId: Number(readiness.drawId), reason: readiness.reason },
        `[quickpick] Draw #${readiness.drawId} not ready: ${readiness.reason}`,
      );
    }
    return;
  }

  const drawId = readiness.drawId!;

  logger.info(
    { drawId: Number(drawId), reason: readiness.reason },
    `[quickpick] Draw #${drawId} is ready — starting lifecycle`,
  );

  try {
    const result = await executeQPDrawLifecycle(
      connection,
      mainProgram,
      qpProgram,
      config,
      logger,
    );

    if (result.phase === "finalized") {
      stats.qpDrawsCompleted++;
      stats.consecutiveErrors = 0;
      logger.info(
        { drawId: Number(result.drawId), totalCompleted: stats.qpDrawsCompleted },
        `[quickpick] Draw #${result.drawId} completed successfully`,
      );
      await notifyDrawComplete(
        config,
        logger,
        "quickpick",
        Number(result.drawId),
        result.winningNumbers,
      );
    } else {
      logger.warn(
        { drawId: Number(result.drawId), phase: result.phase },
        `[quickpick] Draw #${result.drawId} lifecycle stopped at phase: ${result.phase}`,
      );
    }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    logger.error(
      { drawId: Number(drawId), error, stack },
      `[quickpick] Draw #${drawId} lifecycle failed`,
    );
    stats.qpDrawsFailed++;
    stats.consecutiveErrors++;
    await notifyDrawError(config, logger, "quickpick", Number(drawId), error);
  }
}

// ---------------------------------------------------------------------------
// Worker Export
// ---------------------------------------------------------------------------

export default {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) =>
    handleFetch(request, env),
  scheduled: handleScheduled,
};
