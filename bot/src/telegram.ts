/**
 * Telegram Bot Integration for MazelProtocol Draw Lifecycle Bot.
 *
 * Handles incoming webhook updates from Telegram and provides
 * commands for monitoring and controlling the draw bot.
 *
 * Commands:
 *   /start   — Welcome message and overview
 *   /help    — List available commands
 *   /status  — Current draw state for both programs
 *   /stats   — Bot statistics (draws completed, errors, etc.)
 *   /draw    — Manually trigger a draw check
 *   /pause   — Pause the bot (skip cron ticks)
 *   /resume  — Resume the bot after pausing
 *   /config  — Show current configuration summary
 *   /health  — Quick RPC health check
 */

import type { Connection } from "@solana/web3.js";
import type { Program } from "@coral-xyz/anchor";
import type { BotConfig } from "./config";
import { formatConfigSummary } from "./config";
import type { Env, PersistedBotStats, PersistedDrawState } from "./env";
import { KV_KEYS } from "./env";
import type { Logger } from "./logger";
import { sendTelegramMessage } from "./logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Telegram Update object (subset of fields we care about) */
export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: {
      id: number;
      is_bot: boolean;
      first_name: string;
      username?: string;
    };
    chat: {
      id: number;
      type: "private" | "group" | "supergroup" | "channel";
    };
    date: number;
    text?: string;
    entities?: Array<{
      offset: number;
      length: number;
      type: string;
    }>;
  };
  callback_query?: {
    id: string;
    from: {
      id: number;
      first_name: string;
      username?: string;
    };
    data?: string;
  };
}

/** Context passed to command handlers */
export interface CommandContext {
  chatId: number;
  userId: number;
  username: string;
  args: string[];
  env: Env;
  config: BotConfig;
  logger: Logger;
  connection: Connection;
  mainProgram: Program<any>;
  qpProgram: Program<any>;
}

type CommandHandler = (ctx: CommandContext) => Promise<string>;

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

/**
 * Check if a user is authorized to send commands.
 * Authorization is based on TELEGRAM_CHAT_ID and TELEGRAM_ADMIN_IDS.
 */
function isAuthorized(
  userId: number,
  chatId: number,
  config: BotConfig,
): boolean {
  // The configured chat ID is always authorized
  if (String(chatId) === config.telegramChatId) return true;
  if (String(userId) === config.telegramChatId) return true;

  // Check admin IDs list
  if (config.telegramAdminIds.length > 0) {
    return config.telegramAdminIds.includes(String(userId));
  }

  return false;
}

// ---------------------------------------------------------------------------
// Command Handlers
// ---------------------------------------------------------------------------

const commands: Record<string, CommandHandler> = {
  start: handleStart,
  help: handleHelp,
  status: handleStatus,
  stats: handleStats,
  draw: handleDraw,
  pause: handlePause,
  resume: handleResume,
  config: handleConfig,
  health: handleHealth,
};

async function handleStart(_ctx: CommandContext): Promise<string> {
  return (
    `🎰 <b>MazelProtocol Draw Bot</b>\n\n` +
    `Welcome! I manage the draw lifecycle for both the <b>Main Lottery</b> (6/46) ` +
    `and <b>Quick Pick Express</b> (5/35).\n\n` +
    `I run as a Cloudflare Worker with scheduled cron triggers to poll for ` +
    `draw readiness and execute the commit → execute → index → finalize pipeline.\n\n` +
    `Use /help to see available commands.`
  );
}

async function handleHelp(_ctx: CommandContext): Promise<string> {
  return (
    `📋 <b>Available Commands</b>\n\n` +
    `/status  — Current draw state for both programs\n` +
    `/stats   — Bot statistics\n` +
    `/draw    — Trigger a draw check now\n` +
    `/pause   — Pause automated draws\n` +
    `/resume  — Resume automated draws\n` +
    `/config  — Show current configuration\n` +
    `/health  — Quick RPC health check\n` +
    `/help    — This message`
  );
}

async function handleStatus(ctx: CommandContext): Promise<string> {
  const { env, config, mainProgram, qpProgram } = ctx;

  const lines: string[] = [`📊 <b>Draw Status</b>\n`];

  // Main Lottery Status
  if (config.mode === "both" || config.mode === "main-only") {
    try {
      const lotteryState = await (
        mainProgram.account as any
      ).lotteryState.fetch(config.mainPDAs.lotteryState);
      const drawId = Number(lotteryState.currentDrawId.toString());
      const nextDraw = Number(lotteryState.nextDrawTimestamp.toString());
      const isPaused = lotteryState.isPaused;
      const isDrawInProgress = lotteryState.isDrawInProgress;
      const tickets = Number(lotteryState.totalTickets?.toString() ?? "0");

      const now = Math.floor(Date.now() / 1000);
      const timeUntil = nextDraw - now;
      const timeStr =
        timeUntil <= 0
          ? "⏰ <b>OVERDUE</b>"
          : `${Math.floor(timeUntil / 3600)}h ${Math.floor((timeUntil % 3600) / 60)}m`;

      lines.push(`<b>🎟 Main Lottery (6/46)</b>`);
      lines.push(`  Draw ID: <code>#${drawId}</code>`);
      lines.push(
        `  Status: ${isPaused ? "⏸ Paused" : isDrawInProgress ? "🔄 In Progress" : "✅ Active"}`,
      );
      lines.push(`  Tickets: <code>${tickets}</code>`);
      lines.push(`  Next draw: ${timeStr}`);

      // Check persisted state
      const stateJson = await env.DRAW_STATE.get(KV_KEYS.MAIN_DRAW_STATE);
      if (stateJson) {
        const state: PersistedDrawState = JSON.parse(stateJson);
        if (state.phase !== "idle" && state.phase !== "finalized") {
          lines.push(
            `  Phase: <code>${state.phase}</code> (draw #${state.drawId})`,
          );
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      lines.push(`<b>🎟 Main Lottery</b>: ❌ Error — ${escapeHtml(msg)}`);
    }
    lines.push("");
  }

  // Quick Pick Status
  if (config.mode === "both" || config.mode === "qp-only") {
    try {
      const qpState = await (qpProgram.account as any).quickPickState.fetch(
        config.qpPDAs.quickPickState,
      );
      const drawId = Number(qpState.currentDrawId.toString());
      const nextDraw = Number(qpState.nextDrawTimestamp.toString());
      const isPaused = qpState.isPaused;
      const isDrawInProgress = qpState.isDrawInProgress;
      const tickets = Number(qpState.totalTickets?.toString() ?? "0");

      const now = Math.floor(Date.now() / 1000);
      const timeUntil = nextDraw - now;
      const timeStr =
        timeUntil <= 0
          ? "⏰ <b>OVERDUE</b>"
          : `${Math.floor(timeUntil / 3600)}h ${Math.floor((timeUntil % 3600) / 60)}m`;

      lines.push(`<b>⚡ Quick Pick Express (5/35)</b>`);
      lines.push(`  Draw ID: <code>#${drawId}</code>`);
      lines.push(
        `  Status: ${isPaused ? "⏸ Paused" : isDrawInProgress ? "🔄 In Progress" : "✅ Active"}`,
      );
      lines.push(`  Tickets: <code>${tickets}</code>`);
      lines.push(`  Next draw: ${timeStr}`);

      // Check persisted state
      const stateJson = await env.DRAW_STATE.get(KV_KEYS.QP_DRAW_STATE);
      if (stateJson) {
        const state: PersistedDrawState = JSON.parse(stateJson);
        if (state.phase !== "idle" && state.phase !== "finalized") {
          lines.push(
            `  Phase: <code>${state.phase}</code> (draw #${state.drawId})`,
          );
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      lines.push(`<b>⚡ Quick Pick Express</b>: ❌ Error — ${escapeHtml(msg)}`);
    }
  }

  // Bot paused state
  const isPaused = await env.DRAW_STATE.get(KV_KEYS.BOT_PAUSED);
  if (isPaused === "true") {
    lines.push(`\n⏸ <b>Bot is PAUSED</b> — use /resume to continue`);
  }

  return lines.join("\n");
}

async function handleStats(ctx: CommandContext): Promise<string> {
  const { env } = ctx;

  const statsJson = await env.DRAW_STATE.get(KV_KEYS.BOT_STATS);
  if (!statsJson) {
    return "📈 <b>Bot Stats</b>\n\nNo statistics available yet. The bot hasn't completed any cron cycles.";
  }

  const stats: PersistedBotStats = JSON.parse(statsJson);
  const startTime = new Date(stats.startTime);
  const uptime = Date.now() - startTime.getTime();
  const uptimeHours = Math.floor(uptime / 3_600_000);
  const uptimeMinutes = Math.floor((uptime % 3_600_000) / 60_000);

  const lines = [
    `📈 <b>Bot Statistics</b>\n`,
    `  Uptime: <code>${uptimeHours}h ${uptimeMinutes}m</code>`,
    `  Poll cycles: <code>${stats.pollCount}</code>`,
    ``,
    `  <b>Main Lottery:</b>`,
    `    ✅ Completed: <code>${stats.mainDrawsCompleted}</code>`,
    `    ❌ Failed: <code>${stats.mainDrawsFailed}</code>`,
    stats.lastMainDrawId
      ? `    Last draw: <code>#${stats.lastMainDrawId}</code> (${stats.lastMainDrawPhase})`
      : `    Last draw: <i>none</i>`,
    ``,
    `  <b>Quick Pick Express:</b>`,
    `    ✅ Completed: <code>${stats.qpDrawsCompleted}</code>`,
    `    ❌ Failed: <code>${stats.qpDrawsFailed}</code>`,
    stats.lastQPDrawId
      ? `    Last draw: <code>#${stats.lastQPDrawId}</code> (${stats.lastQPDrawPhase})`
      : `    Last draw: <i>none</i>`,
    ``,
    `  Consecutive errors: <code>${stats.consecutiveErrors}</code>`,
  ];

  return lines.join("\n");
}

async function handleDraw(ctx: CommandContext): Promise<string> {
  // We don't actually execute the draw here — we signal the next cron tick
  // to run immediately by setting a flag in KV
  await ctx.env.DRAW_STATE.put("trigger:immediate", "true", {
    expirationTtl: 120, // expires after 2 minutes
  });

  return (
    `🔄 <b>Draw Check Triggered</b>\n\n` +
    `The next cron tick will check draw readiness and execute if due.\n` +
    `This typically happens within 60 seconds.`
  );
}

async function handlePause(ctx: CommandContext): Promise<string> {
  await ctx.env.DRAW_STATE.put(KV_KEYS.BOT_PAUSED, "true");
  return `⏸ <b>Bot Paused</b>\n\nAutomated draw execution is now paused. Use /resume to continue.`;
}

async function handleResume(ctx: CommandContext): Promise<string> {
  await ctx.env.DRAW_STATE.put(KV_KEYS.BOT_PAUSED, "false");
  return `▶️ <b>Bot Resumed</b>\n\nAutomated draw execution is now active.`;
}

async function handleConfig(ctx: CommandContext): Promise<string> {
  const summary = formatConfigSummary(ctx.config);
  return `⚙️ <b>Configuration</b>\n\n<pre>${escapeHtml(summary)}</pre>`;
}

async function handleHealth(ctx: CommandContext): Promise<string> {
  const { connection } = ctx;
  const startMs = Date.now();

  try {
    const [slot, version] = await Promise.all([
      connection.getSlot(),
      connection.getVersion(),
    ]);
    const latencyMs = Date.now() - startMs;

    const balance = await connection.getBalance(
      ctx.config.authorityKeypair.publicKey,
    );
    const solBalance = balance / 1e9;

    return (
      `🏥 <b>Health Check</b>\n\n` +
      `  RPC: ✅ <code>${ctx.config.rpcUrl}</code>\n` +
      `  Slot: <code>${slot}</code>\n` +
      `  Version: <code>${JSON.stringify(version)}</code>\n` +
      `  Latency: <code>${latencyMs}ms</code>\n` +
      `  Authority balance: <code>${solBalance.toFixed(4)} SOL</code>` +
      (solBalance < 0.1
        ? `\n\n⚠️ <b>Low SOL balance!</b> Top up to avoid tx failures.`
        : ``)
    );
  } catch (err) {
    const latencyMs = Date.now() - startMs;
    const msg = err instanceof Error ? err.message : String(err);
    return (
      `🏥 <b>Health Check</b>\n\n` +
      `  RPC: ❌ <code>${ctx.config.rpcUrl}</code>\n` +
      `  Error: ${escapeHtml(msg)}\n` +
      `  Latency: <code>${latencyMs}ms</code>`
    );
  }
}

// ---------------------------------------------------------------------------
// Webhook Handler
// ---------------------------------------------------------------------------

/**
 * Process an incoming Telegram webhook update.
 *
 * Returns a Response to send back to Telegram (always 200 OK).
 */
export async function handleTelegramWebhook(
  request: Request,
  env: Env,
  config: BotConfig,
  logger: Logger,
  connection: Connection,
  mainProgram: Program<any>,
  qpProgram: Program<any>,
): Promise<Response> {
  let update: TelegramUpdate;

  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    logger.warn("Received invalid JSON from Telegram webhook");
    return new Response("OK", { status: 200 });
  }

  // Only handle text messages with commands
  const message = update.message;
  if (!message?.text) {
    return new Response("OK", { status: 200 });
  }

  const text = message.text.trim();
  const chatId = message.chat.id;
  const userId = message.from?.id ?? 0;
  const username =
    message.from?.username ?? message.from?.first_name ?? "unknown";

  // Check if it's a command (starts with /)
  if (!text.startsWith("/")) {
    return new Response("OK", { status: 200 });
  }

  // Parse command and args
  // Handle "/command@botname args" format
  const parts = text.split(/\s+/);
  const rawCommand = parts[0].toLowerCase();
  const commandName = rawCommand.replace(/^\//, "").replace(/@.*$/, "");
  const args = parts.slice(1);

  logger.info(
    { chatId, userId, username, command: commandName },
    `Telegram command: /${commandName} from @${username}`,
  );

  // Authorization check
  if (!isAuthorized(userId, chatId, config)) {
    logger.warn(
      { chatId, userId, username },
      `Unauthorized command attempt from @${username} (${userId})`,
    );
    await sendReply(
      config.telegramBotToken,
      chatId,
      `🔒 Unauthorized. Your user ID (<code>${userId}</code>) is not in the admin list.`,
    );
    return new Response("OK", { status: 200 });
  }

  // Find and execute command handler
  const handler = commands[commandName];
  if (!handler) {
    await sendReply(
      config.telegramBotToken,
      chatId,
      `Unknown command: <code>/${escapeHtml(commandName)}</code>\n\nUse /help to see available commands.`,
    );
    return new Response("OK", { status: 200 });
  }

  try {
    const ctx: CommandContext = {
      chatId,
      userId,
      username,
      args,
      env,
      config,
      logger,
      connection,
      mainProgram,
      qpProgram,
    };

    const reply = await handler(ctx);
    await sendReply(config.telegramBotToken, chatId, reply);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(
      { command: commandName, error: msg },
      `Error handling /${commandName}: ${msg}`,
    );
    await sendReply(
      config.telegramBotToken,
      chatId,
      `❌ Error executing <code>/${escapeHtml(commandName)}</code>:\n<pre>${escapeHtml(msg)}</pre>`,
    );
  }

  return new Response("OK", { status: 200 });
}

// ---------------------------------------------------------------------------
// Notification Helpers
// ---------------------------------------------------------------------------

/**
 * Send a draw completion notification to Telegram.
 */
export async function notifyDrawComplete(
  program: "main" | "quickpick",
  drawId: number | bigint,
  winningNumbers: number[],
  totalTickets: number,
  winnerCounts: Record<string, number>,
): Promise<void> {
  const emoji = program === "main" ? "🎟" : "⚡";
  const name = program === "main" ? "Main Lottery" : "Quick Pick Express";
  const numbers = winningNumbers.join(", ");

  const winners = Object.entries(winnerCounts)
    .filter(([, count]) => count > 0)
    .map(([tier, count]) => `  ${tier}: <code>${count}</code>`)
    .join("\n");

  const text =
    `${emoji} <b>${name} Draw #${drawId} Complete!</b>\n\n` +
    `🔢 Winning numbers: <code>${numbers}</code>\n` +
    `🎫 Total tickets: <code>${totalTickets}</code>\n` +
    (winners
      ? `\n🏆 <b>Winners:</b>\n${winners}`
      : `\n😔 No winners this draw.`);

  await sendTelegramMessage(text);
}

/**
 * Send a draw error notification to Telegram.
 */
export async function notifyDrawError(
  program: "main" | "quickpick",
  drawId: number | bigint,
  phase: string,
  error: string,
): Promise<void> {
  const emoji = program === "main" ? "🎟" : "⚡";
  const name = program === "main" ? "Main Lottery" : "Quick Pick Express";

  const text =
    `${emoji} ❌ <b>${name} Draw #${drawId} Error</b>\n\n` +
    `Phase: <code>${phase}</code>\n` +
    `Error: <pre>${escapeHtml(error)}</pre>`;

  await sendTelegramMessage(text);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function sendReply(
  botToken: string,
  chatId: number,
  text: string,
): Promise<void> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(
        `[telegram] Failed to send reply: HTTP ${response.status} — ${body}`,
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[telegram] Failed to send reply: ${msg}`);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ---------------------------------------------------------------------------
// Webhook Setup Helper
// ---------------------------------------------------------------------------

/**
 * Set the Telegram webhook URL. Call this after deploying the Worker.
 *
 * Can be triggered via a special admin endpoint or the setup script.
 */
export async function setTelegramWebhook(
  botToken: string,
  webhookUrl: string,
): Promise<{ ok: boolean; description?: string }> {
  const url = `https://api.telegram.org/bot${botToken}/setWebhook`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl,
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: true,
    }),
  });

  return response.json() as Promise<{ ok: boolean; description?: string }>;
}

/**
 * Delete the Telegram webhook (useful for cleanup).
 */
export async function deleteTelegramWebhook(
  botToken: string,
): Promise<{ ok: boolean; description?: string }> {
  const url = `https://api.telegram.org/bot${botToken}/deleteWebhook`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ drop_pending_updates: true }),
  });

  return response.json() as Promise<{ ok: boolean; description?: string }>;
}
