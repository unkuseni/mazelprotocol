/**
 * MazelProtocol Customer Bot — Node.js Express Server
 *
 * A customer-facing Telegram bot that provides real-time lottery information,
 * random number generation, ticket checking, wallet guidance, and game education.
 *
 * Runs as a standard Node.js process. No Cloudflare required.
 *
 * Endpoints:
 *   GET  /             — Health check + bot info
 *   POST /telegram     — Telegram webhook receiver
 *   GET  /setup?url=   — Set Telegram webhook
 *
 * Usage:
 *   npm run start       # Start the server (set WEBHOOK_URL in .env)
 *   npm run dev         # Start with auto-reload (tsx watch)
 *   npm run poll        # Start in long-polling mode (no webhook needed)
 */

import express from "express";
import type { Request, Response } from "express";
import { loadConfig } from "./config";
import {
  handleTelegramWebhook,
  setTelegramWebhook,
  getBotInfo,
  startLongPolling,
} from "./telegram";

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.PORT || "3000", 10);
const MODE = process.env.BOT_MODE || "webhook"; // "webhook" or "polling"

// Load config from environment variables
const config = loadConfig();

// ============================================================================
// ROUTES
// ============================================================================

/** Health check */
app.get("/", async (_req: Request, res: Response) => {
  let botInfo: any = null;
  try {
    const info = await getBotInfo(config.telegramBotToken);
    if (info.ok) botInfo = info.result;
  } catch { /* non-critical */ }

  res.json({
    status: "ok",
    service: "mazelprotocol-customer-bot",
    version: "1.0.0",
    mode: MODE,
    timestamp: new Date().toISOString(),
    bot: botInfo
      ? { name: botInfo.first_name, username: `@${botInfo.username}` }
      : { status: "unknown" },
    config: {
      rpcUrl: config.rpcUrl,
      commitment: config.commitment,
      mainProgramId: config.mainProgramId.toBase58(),
      qpProgramId: config.qpProgramId.toBase58(),
    },
  });
});

/** Telegram webhook receiver */
app.post("/telegram", async (req: Request, res: Response) => {
  try {
    const result = await handleTelegramWebhook(req, config);
    res.status(result.status).json(result.body);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[telegram] Webhook error: ${message}`);
    res.status(500).json({ error: "Internal server error" });
  }
});

/** Webhook setup helper */
app.get("/setup", async (req: Request, res: Response) => {
  const webhookUrl = req.query.url as string;
  if (!webhookUrl) {
    res.status(400).json({
      error: "Missing ?url= parameter. Provide the public URL of this server.",
      example: "/setup?url=https://my-bot.example.com",
    });
    return;
  }

  try {
    const result = await setTelegramWebhook(config.telegramBotToken, webhookUrl);
    if (result.ok) {
      console.log(`✅ Webhook set → ${webhookUrl}/telegram`);
      res.json({ ok: true, webhookUrl: `${webhookUrl}/telegram`, description: result.description });
    } else {
      res.status(500).json({ ok: false, error: "Failed to set webhook", description: result.description });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, error: message });
  }
});

// ============================================================================
// STARTUP
// ============================================================================

async function main() {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║     MazelProtocol Customer Bot — Node.js Edition     ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log("");
  console.log(`  Mode:       ${MODE}`);
  console.log(`  RPC:        ${config.rpcUrl}`);
  console.log(`  Main Prog:  ${config.mainProgramId.toBase58()}`);
  console.log(`  QP Prog:    ${config.qpProgramId.toBase58()}`);
  console.log("");

  // Verify bot token works
  try {
    const info = await getBotInfo(config.telegramBotToken);
    if (info.ok && info.result) {
      console.log(`  🤖 Bot:      @${info.result.username} — ${info.result.first_name}`);
      console.log(`  🔗 Link:     https://t.me/${info.result.username}`);
    } else {
      console.warn("  ⚠️  Could not verify bot token. Check TELEGRAM_BOT_TOKEN.");
    }
  } catch (err) {
    console.warn("  ⚠️  Could not reach Telegram API. Check your internet connection.");
  }

  console.log("");

  if (MODE === "polling") {
    // Long-polling mode — no public URL needed
    console.log("  📡 Starting in LONG-POLLING mode...");
    console.log("     The bot will poll Telegram for updates every 2 seconds.");
    console.log("     No public URL or webhook setup needed.");
    console.log("");
    await startLongPolling(config);
  } else {
    // Webhook mode — needs a public URL
    const webhookUrl = process.env.WEBHOOK_URL;
    if (webhookUrl) {
      console.log(`  🔗 Auto-setting webhook → ${webhookUrl}/telegram`);
      try {
        const result = await setTelegramWebhook(config.telegramBotToken, webhookUrl);
        if (result.ok) {
          console.log("  ✅ Webhook set successfully.");
        } else {
          console.warn(`  ⚠️  Webhook setup failed: ${result.description}`);
        }
      } catch (err) {
        console.warn(`  ⚠️  Webhook setup error: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      console.log("  💡 Tip: Set WEBHOOK_URL in .env to auto-configure the webhook.");
      console.log(`     Example: WEBHOOK_URL=https://my-bot.example.com`);
      console.log(`     Then visit /setup?url=https://my-bot.example.com`);
    }

    console.log("");
    app.listen(PORT, () => {
      console.log(`  🚀 Server listening on http://localhost:${PORT}`);
      console.log(`     Webhook: POST http://localhost:${PORT}/telegram`);
      console.log("");
      console.log("  Press Ctrl+C to stop.");
    });
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
