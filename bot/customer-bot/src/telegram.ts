/**
 * Telegram Webhook Handler for the customer-facing bot.
 *
 * Handles incoming updates from Telegram, routes commands to the appropriate
 * handler, and sends responses back. Supports both webhook and long-polling.
 */

import type { Request } from "express";
import type { BotConfig } from "./config";
import { initSolana } from "./solana";
import { escapeHtml } from "./utils";

import { handleStart } from "./commands/start";
import { handleHelp } from "./commands/help";
import { handleJackpot } from "./commands/jackpot";
import { handleDraw } from "./commands/draw";
import { handleQuickPick, handleQP } from "./commands/quickpick";
import { handleTicket } from "./commands/ticket";
import { handlePrizes } from "./commands/prizes";
import { handleRules } from "./commands/rules";
import { handleRolldown } from "./commands/rolldown";
import { handleStats } from "./commands/stats";
import { handleWallet } from "./commands/wallet";
import { handleRegister } from "./commands/register";
import { handleBalance } from "./commands/balance";
import { handleDeposit } from "./commands/deposit";
import { handleBuy } from "./commands/buy";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; is_bot: boolean; first_name: string; username?: string };
    chat: { id: number; type: "private" | "group" | "supergroup" | "channel"; title?: string };
    date: number;
    text?: string;
    entities?: Array<{ offset: number; length: number; type: string }>;
  };
  edited_message?: TelegramUpdate["message"];
  callback_query?: {
    id: string;
    from: { id: number; first_name: string; username?: string };
    message?: { message_id: number; chat: { id: number } };
    data?: string;
  };
}

// ---------------------------------------------------------------------------
// Command routing
// ---------------------------------------------------------------------------

export interface CmdContext {
  args: string[];
  config: BotConfig;
  telegramId: number;
  username: string;
  chatId: number;
}

type CommandFn = (ctx: CmdContext) => Promise<string>;

const COMMANDS: Record<string, CommandFn> = {
  start: async () => handleStart(),
  help: async () => handleHelp(),
  jackpot: async () => handleJackpot(),
  jp: async () => handleJackpot(),
  draw: async (ctx) => handleDraw(ctx.args),
  results: async (ctx) => handleDraw(ctx.args),
  quickpick: async (ctx) => handleQuickPick(ctx.args),
  qp: async (ctx) => handleQP(ctx.args),
  ticket: async (ctx) => handleTicket(ctx.args),
  check: async (ctx) => handleTicket(ctx.args),
  prizes: async () => handlePrizes(),
  payouts: async () => handlePrizes(),
  rules: async () => handleRules(),
  howto: async () => handleRules(),
  rolldown: async () => handleRolldown(),
  ev: async () => handleRolldown(),
  stats: async (ctx) => handleStats(ctx.args),
  mystats: async (ctx) => handleStats(ctx.args),
  wallet: async (ctx) => handleWallet(ctx.config),
  fund: async (ctx) => handleWallet(ctx.config),
  register: async (ctx) => handleRegister(ctx.args, ctx.telegramId, ctx.username),
  balance: async (ctx) => handleBalance(ctx.telegramId, ctx.config),
  bal: async (ctx) => handleBalance(ctx.telegramId, ctx.config),
  deposit: async (ctx) => handleDeposit(ctx.telegramId, ctx.config),
  buy: async (ctx) => handleBuy(ctx.args, ctx.telegramId, ctx.config),
  withdraw: async () => "🏧 Withdrawals coming soon. Your funds are safe. Use /balance to check.",
};

export const COMMAND_LIST = Object.keys(COMMANDS).filter(
  (k) => !["jp", "results", "check", "payouts", "howto", "ev", "mystats", "fund", "bal"].includes(k),
);

// ---------------------------------------------------------------------------
// Webhook handler
// ---------------------------------------------------------------------------

export async function handleTelegramWebhook(
  req: Request, config: BotConfig,
): Promise<{ status: number; body: any }> {
  initSolana(config);

  let body: TelegramUpdate;
  try { body = req.body as TelegramUpdate; } catch {
    return { status: 400, body: { error: "Invalid JSON" } };
  }

  const message = body.message ?? body.edited_message;
  if (!message || !message.text) {
    if (body.callback_query) await answerCallback(body.callback_query.id, config);
    return { status: 200, body: { ok: true } };
  }

  const chatId = message.chat.id;
  const text = message.text.trim();
  const userId = message.from?.id ?? 0;
  const username = message.from?.username ?? message.from?.first_name ?? "Player";

  if (!text.startsWith("/")) {
    if (message.chat.type === "private") {
      await sendMessage(config.telegramBotToken, chatId,
        `👋 Hi ${escapeHtml(username)}! I'm the MazelProtocol bot.\n\n` +
        `💳 <b>New!</b> Register and buy tickets directly:\n` +
        `/register &lt;address&gt; — Link your wallet\n` +
        `/deposit — Get deposit address\n` +
        `/buy main random — Buy a ticket instantly!\n\n` +
        `/help — All commands`);
    }
    return { status: 200, body: { ok: true } };
  }

  const parts = text.slice(1).split(/\s+/);
  let commandName = parts[0].toLowerCase();
  if (commandName.includes("@")) commandName = commandName.split("@")[0];
  const args = parts.slice(1);

  console.log(`[cmd] /${commandName} ${args.join(" ")} — @${username} (${userId})`);

  const handler = COMMANDS[commandName];
  if (!handler) {
    const suggestions = findSimilar(commandName);
    let reply = `❓ Unknown command: <code>/${escapeHtml(commandName)}</code>\n\n`;
    if (suggestions.length) reply += `Did you mean:\n${suggestions.map((s) => `  /${s}`).join("\n")}\n\n`;
    reply += `Type /help to see all commands.`;
    await sendMessage(config.telegramBotToken, chatId, reply);
    return { status: 200, body: { ok: true } };
  }

  const ctx: CmdContext = { args, config, telegramId: userId, username, chatId };

  try {
    const reply = await Promise.race([
      handler(ctx),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 25_000)),
    ]);
    await sendMessage(config.telegramBotToken, chatId, reply);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[cmd_err] /${commandName}: ${msg}`);
    await sendMessage(config.telegramBotToken, chatId, "⚠️ Something went wrong. Please try again.");
  }

  return { status: 200, body: { ok: true } };
}

// ---------------------------------------------------------------------------
// Long-polling
// ---------------------------------------------------------------------------

export async function startLongPolling(config: BotConfig): Promise<void> {
  initSolana(config);
  let lastUpdateId = 0;

  console.log("  📡 Long-polling started. Waiting for messages...\n");

  while (true) {
    try {
      const url = `https://api.telegram.org/bot${config.telegramBotToken}/getUpdates?offset=${lastUpdateId + 1}&timeout=30&allowed_updates=["message","callback_query"]`;
      const resp = await fetch(url);
      const data = await resp.json() as any;

      if (!data.ok) { await sleep(2000); continue; }

      for (const update of (data.result || []) as TelegramUpdate[]) {
        lastUpdateId = Math.max(lastUpdateId, update.update_id);
        const msg = update.message ?? update.edited_message;
        if (!msg || !msg.text) continue;

        const chatId = msg.chat.id;
        const text = msg.text.trim();
        const userId = msg.from?.id ?? 0;
        const username = msg.from?.username ?? msg.from?.first_name ?? "Player";

        if (!text.startsWith("/")) {
          if (msg.chat.type === "private") {
            await sendMessage(config.telegramBotToken, chatId,
              `👋 Hi ${escapeHtml(username)}! Type /help to see commands.\n/register to get started.`);
          }
          continue;
        }

        const parts = text.slice(1).split(/\s+/);
        let cmd = parts[0].toLowerCase();
        if (cmd.includes("@")) cmd = cmd.split("@")[0];
        const args = parts.slice(1);

        console.log(`[poll] /${cmd} — @${username}`);

        const handler = COMMANDS[cmd];
        if (!handler) {
          await sendMessage(config.telegramBotToken, chatId, `❓ Unknown command. Type /help.`);
          continue;
        }

        const ctx: CmdContext = { args, config, telegramId: userId, username, chatId };
        try {
          const reply = await Promise.race([
            handler(ctx),
            new Promise<string>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 25_000)),
          ]);
          await sendMessage(config.telegramBotToken, chatId, reply);
        } catch {
          await sendMessage(config.telegramBotToken, chatId, "⚠️ Error. Please try again.");
        }
      }
    } catch (err) {
      console.error(`[poll] ${err instanceof Error ? err.message : String(err)}`);
      await sleep(2000);
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function answerCallback(id: string, config: BotConfig): Promise<void> {
  await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/answerCallbackQuery`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: id }),
  }).catch(() => { });
}

async function sendMessage(token: string, chatId: number, text: string): Promise<void> {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
    });
    if (!r.ok) console.error(`[tg] sendMessage HTTP ${r.status}: ${await r.text()}`);
  } catch (err) {
    console.error(`[tg] sendMessage error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function sleep(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }

function findSimilar(name: string): string[] {
  const s: string[] = [];
  for (const c of COMMAND_LIST) {
    if (c.startsWith(name.slice(0, 3)) || name.startsWith(c.slice(0, 3))) s.push(c);
    if (s.length >= 3) break;
  }
  return s;
}

// ---------------------------------------------------------------------------
// Webhook setup
// ---------------------------------------------------------------------------

export async function setTelegramWebhook(token: string, url: string): Promise<{ ok: boolean; description?: string }> {
  const r = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: `${url}/telegram`, allowed_updates: ["message", "callback_query"], drop_pending_updates: true }),
  });
  return (await r.json()) as any;
}

export async function getBotInfo(token: string): Promise<{ ok: boolean; result?: { first_name: string; username: string } }> {
  const r = await fetch(`https://api.telegram.org/bot${token}/getMe`);
  return (await r.json()) as any;
}

export { COMMANDS };
