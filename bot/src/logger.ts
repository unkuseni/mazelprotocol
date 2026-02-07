/**
 * Logger module for MazelProtocol Draw Lifecycle Bot — Cloudflare Worker Edition.
 *
 * Replaces pino with a lightweight console-based logger compatible with
 * Cloudflare Workers runtime. Logs are viewable via `wrangler tail` or
 * the Cloudflare dashboard.
 *
 * Also integrates Telegram notifications for critical events.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export interface LoggerConfig {
  /** Log level: trace | debug | info | warn | error | fatal */
  level: LogLevel;
  /** Telegram bot token for sending alerts */
  telegramBotToken?: string;
  /** Telegram chat ID for alerts */
  telegramChatId?: string;
}

export interface Logger {
  trace(obj: Record<string, unknown>, msg: string): void;
  trace(msg: string): void;
  debug(obj: Record<string, unknown>, msg: string): void;
  debug(msg: string): void;
  info(obj: Record<string, unknown>, msg: string): void;
  info(msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  warn(msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
  error(msg: string): void;
  fatal(obj: Record<string, unknown>, msg: string): void;
  fatal(msg: string): void;
  child(bindings: Record<string, unknown>): Logger;
}

// ---------------------------------------------------------------------------
// Log level ordering
// ---------------------------------------------------------------------------

const LOG_LEVELS: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

// ---------------------------------------------------------------------------
// Telegram integration
// ---------------------------------------------------------------------------

let _telegramBotToken: string | undefined;
let _telegramChatId: string | undefined;

/**
 * Send a message to the configured Telegram chat.
 * Non-blocking — failures are logged to console but never thrown.
 */
export async function sendTelegramMessage(
  text: string,
  parseMode: "HTML" | "MarkdownV2" | "Markdown" = "HTML",
): Promise<void> {
  if (!_telegramBotToken || !_telegramChatId) return;

  const url = `https://api.telegram.org/bot${_telegramBotToken}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: _telegramChatId,
        text,
        parse_mode: parseMode,
        disable_web_page_preview: true,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(
        `[telegram] Failed to send message: HTTP ${response.status} — ${body}`,
      );
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[telegram] Failed to send message: ${errMsg}`);
  }
}

/**
 * Send an alert via Telegram for critical events.
 */
export async function sendAlert(
  level: "warn" | "error" | "fatal",
  message: string,
  context?: Record<string, unknown>,
): Promise<void> {
  const emoji = level === "fatal" ? "🚨" : level === "error" ? "❌" : "⚠️";

  let text = `${emoji} <b>[${level.toUpperCase()}]</b>\n${escapeHtml(message)}`;

  if (context && Object.keys(context).length > 0) {
    const details = Object.entries(context)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `  <code>${k}</code>: ${escapeHtml(String(v))}`)
      .join("\n");
    if (details) {
      text += `\n\n<b>Details:</b>\n${details}`;
    }
  }

  await sendTelegramMessage(text);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ---------------------------------------------------------------------------
// Console Logger implementation
// ---------------------------------------------------------------------------

class ConsoleLogger implements Logger {
  private readonly minLevel: number;
  private readonly bindings: Record<string, unknown>;

  constructor(level: LogLevel, bindings: Record<string, unknown> = {}) {
    this.minLevel = LOG_LEVELS[level] ?? LOG_LEVELS.info;
    this.bindings = bindings;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= this.minLevel;
  }

  private format(
    _level: LogLevel,
    objOrMsg: Record<string, unknown> | string,
    msg?: string,
  ): { message: string; data: Record<string, unknown> } {
    let message: string;
    let data: Record<string, unknown>;

    if (typeof objOrMsg === "string") {
      message = objOrMsg;
      data = { ...this.bindings };
    } else {
      message = msg ?? "";
      data = { ...this.bindings, ...objOrMsg };
    }

    return { message, data };
  }

  private log(
    level: LogLevel,
    objOrMsg: Record<string, unknown> | string,
    msg?: string,
  ): void {
    if (!this.shouldLog(level)) return;

    const { message, data } = this.format(level, objOrMsg, msg);
    const timestamp = new Date().toISOString();
    const hasData = Object.keys(data).length > 0;

    const entry = {
      level,
      time: timestamp,
      msg: message,
      ...(hasData ? data : {}),
    };

    switch (level) {
      case "trace":
      case "debug":
        console.debug(JSON.stringify(entry));
        break;
      case "info":
        console.log(JSON.stringify(entry));
        break;
      case "warn":
        console.warn(JSON.stringify(entry));
        break;
      case "error":
      case "fatal":
        console.error(JSON.stringify(entry));
        break;
    }
  }

  trace(objOrMsg: Record<string, unknown> | string, msg?: string): void {
    this.log("trace", objOrMsg, msg);
  }

  debug(objOrMsg: Record<string, unknown> | string, msg?: string): void {
    this.log("debug", objOrMsg, msg);
  }

  info(objOrMsg: Record<string, unknown> | string, msg?: string): void {
    this.log("info", objOrMsg, msg);
  }

  warn(objOrMsg: Record<string, unknown> | string, msg?: string): void {
    this.log("warn", objOrMsg, msg);
  }

  error(objOrMsg: Record<string, unknown> | string, msg?: string): void {
    this.log("error", objOrMsg, msg);
  }

  fatal(objOrMsg: Record<string, unknown> | string, msg?: string): void {
    this.log("fatal", objOrMsg, msg);
  }

  child(bindings: Record<string, unknown>): Logger {
    const level = (Object.entries(LOG_LEVELS).find(
      ([, v]) => v === this.minLevel,
    )?.[0] ?? "info") as LogLevel;
    return new ConsoleLogger(level, { ...this.bindings, ...bindings });
  }
}

// ---------------------------------------------------------------------------
// Logger factory
// ---------------------------------------------------------------------------

let _rootLogger: Logger | undefined;

/**
 * Create and return the root logger instance.
 *
 * Subsequent calls return the same instance (singleton within a Worker invocation).
 * Call this once per request/scheduled event.
 */
export function createLogger(config: LoggerConfig): Logger {
  // Store Telegram config for alert helpers
  _telegramBotToken = config.telegramBotToken;
  _telegramChatId = config.telegramChatId;

  _rootLogger = new ConsoleLogger(config.level || "info", {
    service: "mazelprotocol-draw-bot",
  });

  return _rootLogger;
}

/**
 * Get the root logger. Throws if `createLogger` has not been called yet.
 */
export function getLogger(): Logger {
  if (!_rootLogger) {
    throw new Error("Logger not initialized. Call createLogger() first.");
  }
  return _rootLogger;
}

/**
 * Create a child logger with additional context fields.
 */
export function childLogger(bindings: Record<string, unknown>): Logger {
  return getLogger().child(bindings);
}

// ---------------------------------------------------------------------------
// Convenience helpers that also trigger Telegram alerts
// ---------------------------------------------------------------------------

/**
 * Log a warning and optionally fire a Telegram alert.
 */
export function logWarn(
  logger: Logger,
  message: string,
  context?: Record<string, unknown>,
  alert: boolean = false,
): void {
  logger.warn(context ?? {}, message);
  if (alert) {
    sendAlert("warn", message, context).catch(() => {});
  }
}

/**
 * Log an error and optionally fire a Telegram alert.
 */
export function logError(
  logger: Logger,
  message: string,
  context?: Record<string, unknown>,
  alert: boolean = true,
): void {
  logger.error(context ?? {}, message);
  if (alert) {
    sendAlert("error", message, context).catch(() => {});
  }
}

/**
 * Log a fatal error and fire a Telegram alert.
 */
export function logFatal(
  logger: Logger,
  message: string,
  context?: Record<string, unknown>,
): void {
  logger.fatal(context ?? {}, message);
  sendAlert("fatal", message, context).catch(() => {});
}

// ---------------------------------------------------------------------------
// Draw lifecycle logging helpers
// ---------------------------------------------------------------------------

/**
 * Structured log entry for a draw phase transition.
 */
export function logPhase(
  logger: Logger,
  program: "main" | "quickpick",
  drawId: number | bigint,
  phase: "commit" | "execute" | "index" | "finalize" | "recovery",
  status: "start" | "success" | "error" | "skip" | "retry",
  details?: Record<string, unknown>,
): void {
  const entry = {
    program,
    drawId: Number(drawId),
    phase,
    status,
    ...details,
  };

  switch (status) {
    case "error":
      logger.error(entry, `[${program}] draw #${drawId} ${phase}: ${status}`);
      sendAlert(
        "error",
        `[${program}] draw #${drawId} ${phase} failed`,
        entry,
      ).catch(() => {});
      break;
    case "retry":
      logger.warn(entry, `[${program}] draw #${drawId} ${phase}: retrying`);
      break;
    case "skip":
      logger.info(entry, `[${program}] draw #${drawId} ${phase}: skipped`);
      break;
    default:
      logger.info(entry, `[${program}] draw #${drawId} ${phase}: ${status}`);
      break;
  }
}

/**
 * Log a transaction result.
 */
export function logTx(
  logger: Logger,
  program: "main" | "quickpick",
  instruction: string,
  signature: string,
  durationMs?: number,
  details?: Record<string, unknown>,
): void {
  logger.info(
    {
      program,
      instruction,
      signature,
      ...(durationMs !== undefined ? { durationMs } : {}),
      ...details,
    },
    `[${program}] tx ${instruction}: ${signature}`,
  );
}

/**
 * Log the result of the indexer run for a draw.
 */
export function logIndexerResult(
  logger: Logger,
  program: "main" | "quickpick",
  drawId: number | bigint,
  winnerCounts: Record<string, number>,
  totalTickets: number,
  durationMs: number,
): void {
  logger.info(
    {
      program,
      drawId: Number(drawId),
      winnerCounts,
      totalTickets,
      durationMs,
    },
    `[${program}] draw #${drawId} indexed: ${totalTickets} tickets, ${JSON.stringify(winnerCounts)} winners in ${durationMs}ms`,
  );
}
