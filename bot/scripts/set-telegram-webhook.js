#!/usr/bin/env node

/**
 * Set Telegram Webhook for MazelProtocol Draw Bot
 *
 * Usage:
 *   node scripts/set-telegram-webhook.js <WORKER_URL> <BOT_TOKEN>
 *
 * Example:
 *   node scripts/set-telegram-webhook.js https://mazelprotocol-draw-bot.yourname.workers.dev 123456789:ABCdefGHIjklMNOpqrSTUvwxYZ
 *
 * Or use the admin endpoint after deploying:
 *   curl -X POST https://mazelprotocol-draw-bot.yourname.workers.dev/admin/set-webhook
 *
 * Environment variables (alternative to CLI args):
 *   WORKER_URL          — Your deployed Worker URL
 *   TELEGRAM_BOT_TOKEN  — Your Telegram bot token from @BotFather
 */

const TELEGRAM_API = "https://api.telegram.org";

async function main() {
  const workerUrl = process.argv[2] || process.env.WORKER_URL;
  const botToken = process.argv[3] || process.env.TELEGRAM_BOT_TOKEN;

  if (!workerUrl || !botToken) {
    console.error("Usage: node scripts/set-telegram-webhook.js <WORKER_URL> <BOT_TOKEN>");
    console.error("");
    console.error("Arguments:");
    console.error("  WORKER_URL   — Your deployed Cloudflare Worker URL");
    console.error("                  e.g. https://mazelprotocol-draw-bot.yourname.workers.dev");
    console.error("  BOT_TOKEN    — Your Telegram bot token from @BotFather");
    console.error("                  e.g. 123456789:ABCdefGHIjklMNOpqrSTUvwxYZ");
    console.error("");
    console.error("You can also set WORKER_URL and TELEGRAM_BOT_TOKEN as environment variables.");
    process.exit(1);
  }

  const webhookUrl = `${workerUrl.replace(/\/$/, "")}/telegram`;

  console.log("🔗 Setting Telegram webhook...");
  console.log(`   Worker URL:  ${workerUrl}`);
  console.log(`   Webhook URL: ${webhookUrl}`);
  console.log("");

  // Step 1: Delete any existing webhook
  console.log("1. Deleting existing webhook...");
  try {
    const deleteRes = await fetch(`${TELEGRAM_API}/bot${botToken}/deleteWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ drop_pending_updates: true }),
    });
    const deleteResult = await deleteRes.json();
    if (deleteResult.ok) {
      console.log("   ✅ Existing webhook deleted (pending updates dropped)");
    } else {
      console.warn(`   ⚠️  Delete webhook response: ${deleteResult.description}`);
    }
  } catch (err) {
    console.warn(`   ⚠️  Failed to delete existing webhook: ${err.message}`);
  }

  // Step 2: Set the new webhook
  console.log("2. Setting new webhook...");
  try {
    const setRes = await fetch(`${TELEGRAM_API}/bot${botToken}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ["message", "callback_query"],
        drop_pending_updates: true,
      }),
    });
    const setResult = await setRes.json();
    if (setResult.ok) {
      console.log("   ✅ Webhook set successfully!");
    } else {
      console.error(`   ❌ Failed to set webhook: ${setResult.description}`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`   ❌ Failed to set webhook: ${err.message}`);
    process.exit(1);
  }

  // Step 3: Verify the webhook
  console.log("3. Verifying webhook...");
  try {
    const infoRes = await fetch(`${TELEGRAM_API}/bot${botToken}/getWebhookInfo`);
    const infoResult = await infoRes.json();
    if (infoResult.ok) {
      const info = infoResult.result;
      console.log(`   URL:              ${info.url}`);
      console.log(`   Has custom cert:  ${info.has_custom_certificate}`);
      console.log(`   Pending updates:  ${info.pending_update_count}`);
      console.log(`   Max connections:  ${info.max_connections || "default"}`);
      console.log(`   Allowed updates:  ${(info.allowed_updates || []).join(", ") || "all"}`);

      if (info.last_error_date) {
        const errorDate = new Date(info.last_error_date * 1000).toISOString();
        console.warn(`   ⚠️  Last error:    ${info.last_error_message} (${errorDate})`);
      }
    } else {
      console.warn(`   ⚠️  Could not verify: ${infoResult.description}`);
    }
  } catch (err) {
    console.warn(`   ⚠️  Could not verify webhook: ${err.message}`);
  }

  // Step 4: Get bot info
  console.log("4. Getting bot info...");
  try {
    const meRes = await fetch(`${TELEGRAM_API}/bot${botToken}/getMe`);
    const meResult = await meRes.json();
    if (meResult.ok) {
      const bot = meResult.result;
      console.log(`   Bot name:     ${bot.first_name}`);
      console.log(`   Bot username: @${bot.username}`);
      console.log(`   Bot ID:       ${bot.id}`);
    }
  } catch (err) {
    console.warn(`   ⚠️  Could not get bot info: ${err.message}`);
  }

  console.log("");
  console.log("✅ Done! Your Telegram bot is now connected to the Cloudflare Worker.");
  console.log("");
  console.log("Next steps:");
  console.log(`  1. Open Telegram and message @${process.argv[3] ? "your bot" : "your bot"}`);
  console.log("  2. Send /start to verify it works");
  console.log("  3. Send /help to see available commands");
  console.log("");
  console.log("Don't forget to set your secrets in Cloudflare:");
  console.log("  wrangler secret put AUTHORITY_KEYPAIR_JSON");
  console.log("  wrangler secret put TELEGRAM_BOT_TOKEN");
  console.log("  wrangler secret put TELEGRAM_CHAT_ID");
}

main().catch((err) => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
