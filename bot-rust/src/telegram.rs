//! Telegram notification client.
//!
//! Sends draw completion/failure notifications via the Telegram Bot API.
//! All failures are logged but never propagated — Telegram is non-critical.

use reqwest::Client;
use serde::Serialize;

use crate::error::{BotError, Result};

const TELEGRAM_API: &str = "https://api.telegram.org";

/// Build an HTTP client with a request timeout so a stalled connection
/// cannot hang the bot.
fn http_client() -> Client {
    Client::builder().timeout(std::time::Duration::from_secs(20)).build().unwrap_or_else(|e| {
        tracing::error!("failed to build HTTP client with timeout: {e}; using default client");
        Client::new()
    })
}

/// Send an HTML-formatted message to a Telegram chat.
pub async fn send_message(bot_token: &str, chat_id: &str, text: &str) -> Result<bool> {
    let url = format!("{TELEGRAM_API}/bot{bot_token}/sendMessage");
    let client = http_client();

    #[derive(Serialize)]
    struct SendMessage {
        chat_id: String,
        text: String,
        parse_mode: String,
        disable_web_page_preview: bool,
    }

    let body = SendMessage {
        chat_id: chat_id.to_string(),
        text: text.to_string(),
        parse_mode: "HTML".to_string(),
        disable_web_page_preview: true,
    };

    match client.post(&url).json(&body).send().await {
        Ok(resp) => {
            if resp.status().is_success() {
                Ok(true)
            } else {
                let status = resp.status();
                let body_text = resp.text().await.unwrap_or_default();
                tracing::warn!(
                    status = %status,
                    body = %body_text,
                    "Telegram sendMessage failed"
                );
                Ok(false)
            }
        }
        Err(e) => {
            // SECURITY: never log the full error — reqwest's Display includes
            // the request URL, which embeds the bot token.
            tracing::error!(
                timeout = e.is_timeout(),
                connect = e.is_connect(),
                "Telegram sendMessage request failed (details redacted)"
            );
            Ok(false)
        }
    }
}

/// Send a draw completion notification.
pub async fn notify_draw_complete(
    bot_token: &str,
    chat_id: &str,
    program: &str,
    draw_id: u64,
    winning_numbers: &[u8],
) -> Result<()> {
    let name = if program == "main" { "Main Lottery" } else { "Quick Pick" };
    let nums: Vec<String> = winning_numbers.iter().map(|n| n.to_string()).collect();
    let nums_str = nums.join(", ");

    let text = format!(
        "🎉 <b>{name} Draw #{draw_id} Completed!</b>\n\n\
         🎯 Winning Numbers: <code>{nums_str}</code>\n\n\
         Prizes have been distributed. Use /results {draw_id} to check your tickets."
    );

    send_message(bot_token, chat_id, &text).await?;
    Ok(())
}

/// Send a draw error notification.
pub async fn notify_draw_error(
    bot_token: &str,
    chat_id: &str,
    program: &str,
    draw_id: u64,
    error: &str,
) -> Result<()> {
    let name = if program == "main" { "Main Lottery" } else { "Quick Pick" };
    let escaped = error.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;");

    let text = format!(
        "❌ <b>{name} Draw #{draw_id} Failed</b>\n\n\
         <pre>{escaped}</pre>\n\n\
         The bot will retry on the next cycle."
    );

    send_message(bot_token, chat_id, &text).await?;
    Ok(())
}

/// Verify the bot token is valid.
pub async fn verify_bot_token(bot_token: &str) -> Result<()> {
    let url = format!("{TELEGRAM_API}/bot{bot_token}/getMe");
    let client = http_client();

    // SECURITY: reqwest's error Display embeds the request URL (and thus the
    // bot token); map to a redacted message before it can reach the fatal
    // error log in main.
    let resp = client.get(&url).send().await.map_err(|_| {
        BotError::Config("Telegram API verification request failed (details redacted)".to_string())
    })?;
    if resp.status().is_success() {
        let body: serde_json::Value = resp.json().await?;
        if let Some(bot) = body["result"].as_object() {
            tracing::info!(
                username = %bot.get("username").and_then(|v| v.as_str()).unwrap_or("unknown"),
                "Telegram bot verified"
            );
        }
    } else {
        tracing::warn!("Could not verify Telegram bot token");
    }

    Ok(())
}
