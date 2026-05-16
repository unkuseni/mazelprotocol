/**
 * HTTP Route Handlers for MazelProtocol Draw Lifecycle Bot.
 *
 * Extracted from worker.ts to keep routing logic separate from the
 * Worker entry point. Handles:
 *   - Health checks
 *   - Telegram webhook
 *   - Admin endpoints (stats, pause/resume, config, webhook management)
 */

import type { Program } from "@coral-xyz/anchor";
import { Connection } from "@solana/web3.js";
import { loadConfig, formatConfigSummary, type BotConfig } from "./config";
import { createLogger, type LogLevel } from "./logger";
import {
  handleTelegramWebhook,
  setTelegramWebhook,
  deleteTelegramWebhook,
} from "./telegram";
import type { Env } from "./env";
import { KV_KEYS } from "./env";
import { createPrograms } from "./programs";
import { loadStats } from "./stats";

export { createPrograms, loadStats };

// ---------------------------------------------------------------------------
// Route handler type
// ---------------------------------------------------------------------------

type RouteHandler = (
  request: Request,
  env: Env,
  url: URL,
) => Promise<Response | null>;

// ---------------------------------------------------------------------------
// Individual route handlers
// ---------------------------------------------------------------------------

/** GET / or /health — health check */
const handleHealth: RouteHandler = async (_request, _env, _url) => {
  return new Response(
    JSON.stringify({
      status: "ok",
      service: "mazelprotocol-draw-bot",
      timestamp: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
};

/** POST /telegram — Telegram webhook */
const handleTelegram: RouteHandler = async (request, env, _url) => {
  let config: BotConfig;
  try {
    config = loadConfig(env);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Failed to load config for webhook: ${msg}`);
    return new Response("OK", { status: 200 });
  }

  const logger = createLogger({
    level: (config.logLevel as LogLevel) || "info",
    telegramBotToken: config.telegramBotToken,
    telegramChatId: config.telegramChatId,
  });

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
    logger.error(`Failed to load programs for webhook: ${msg}`);
    return new Response("OK", { status: 200 });
  }

  return handleTelegramWebhook(
    request,
    env,
    config,
    logger,
    connection,
    mainProgram,
    qpProgram,
  );
};

/** POST /admin/set-webhook — Set Telegram webhook URL */
const handleSetWebhook: RouteHandler = async (_request, env, _url) => {
  let config: BotConfig;
  try {
    config = loadConfig(env);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const workerUrl = `${_url.protocol}//${_url.host}/telegram`;
  const result = await setTelegramWebhook(config.telegramBotToken, workerUrl);

  return new Response(JSON.stringify({ webhookUrl: workerUrl, ...result }), {
    status: result.ok ? 200 : 500,
    headers: { "Content-Type": "application/json" },
  });
};

/** POST /admin/delete-webhook — Delete Telegram webhook */
const handleDeleteWebhook: RouteHandler = async (_request, env, _url) => {
  let config: BotConfig;
  try {
    config = loadConfig(env);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const result = await deleteTelegramWebhook(config.telegramBotToken);

  return new Response(JSON.stringify(result), {
    status: result.ok ? 200 : 500,
    headers: { "Content-Type": "application/json" },
  });
};

/** GET /admin/stats — Bot statistics */
const handleStats: RouteHandler = async (_request, env, _url) => {
  const stats = await loadStats(env.DRAW_STATE);
  return new Response(JSON.stringify(stats, null, 2), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

/** POST /admin/pause — Pause the bot */
const handlePause: RouteHandler = async (_request, env, _url) => {
  await env.DRAW_STATE.put(KV_KEYS.BOT_PAUSED, "true");
  return new Response(JSON.stringify({ paused: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

/** POST /admin/resume — Resume the bot */
const handleResume: RouteHandler = async (_request, env, _url) => {
  await env.DRAW_STATE.put(KV_KEYS.BOT_PAUSED, "false");
  return new Response(JSON.stringify({ paused: false }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

/** GET /admin/config — Configuration summary (no secrets) */
const handleConfig: RouteHandler = async (_request, env, _url) => {
  try {
    const config = loadConfig(env);
    return new Response(formatConfigSummary(config), {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

// ---------------------------------------------------------------------------
// Route table
// ---------------------------------------------------------------------------

interface Route {
  method: string;
  path: string | ((pathname: string) => boolean);
  handler: RouteHandler;
}

const ROUTES: Route[] = [
  // Health
  {
    method: "GET",
    path: (p) => p === "/" || p === "/health",
    handler: handleHealth,
  },
  // Telegram webhook
  { method: "POST", path: "/telegram", handler: handleTelegram },
  // Admin endpoints
  { method: "POST", path: "/admin/set-webhook", handler: handleSetWebhook },
  {
    method: "POST",
    path: "/admin/delete-webhook",
    handler: handleDeleteWebhook,
  },
  { method: "GET", path: "/admin/stats", handler: handleStats },
  { method: "POST", path: "/admin/pause", handler: handlePause },
  { method: "POST", path: "/admin/resume", handler: handleResume },
  { method: "GET", path: "/admin/config", handler: handleConfig },
];

// ---------------------------------------------------------------------------
// Main fetch handler
// ---------------------------------------------------------------------------

/**
 * HTTP request handler for the Worker.
 * Dispatches incoming requests to the appropriate route handler.
 */
export async function handleFetch(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);

  // Try each route
  for (const route of ROUTES) {
    if (request.method !== route.method) continue;

    const pathMatch =
      typeof route.path === "function"
        ? route.path(url.pathname)
        : url.pathname === route.path;

    if (pathMatch) {
      const response = await route.handler(request, env, url);
      if (response) return response;
    }
  }

  // 404 for unmatched routes
  return new Response(
    JSON.stringify({
      error: "Not found",
      availableEndpoints: [
        "GET  /                     — Health check",
        "POST /telegram             — Telegram webhook",
        "POST /admin/set-webhook    — Set Telegram webhook URL",
        "POST /admin/delete-webhook — Delete Telegram webhook",
        "GET  /admin/stats          — Bot statistics",
        "POST /admin/pause          — Pause the bot",
        "POST /admin/resume         — Resume the bot",
        "GET  /admin/config         — Configuration summary",
      ],
    }),
    {
      status: 404,
      headers: { "Content-Type": "application/json" },
    },
  );
}
