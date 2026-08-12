//! Telegram API client — polling and webhook modes.

use crate::commands;
use crate::config::BotConfig;
use crate::error::Result;
use crate::solana::Solana;
use crate::store::Store;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

const API: &str = "https://api.telegram.org";

#[derive(Debug, Deserialize)]
struct TgResponse<T> {
    ok: bool,
    result: Option<T>,
}

#[derive(Debug, Deserialize)]
struct TgUpdate {
    update_id: u64,
    message: Option<TgMessage>,
}

#[derive(Debug, Deserialize)]
struct TgMessage {
    chat: TgChat,
    from: Option<TgUser>,
    text: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TgChat {
    id: i64,
}

#[derive(Debug, Deserialize)]
struct TgUser {
    id: u64,
    first_name: String,
    username: Option<String>,
}

pub async fn send_message(token: &str, chat_id: i64, text: &str) -> Result<()> {
    let url = format!("{API}/bot{token}/sendMessage");
    let client = Client::new();
    #[derive(Serialize)]
    struct Body {
        chat_id: i64,
        text: String,
        parse_mode: String,
        disable_web_page_preview: bool,
    }
    let body = Body {
        chat_id,
        text: text.to_string(),
        parse_mode: "HTML".into(),
        disable_web_page_preview: true,
    };
    client.post(&url).json(&body).send().await?;
    Ok(())
}

pub async fn run_polling(cfg: BotConfig) -> Result<()> {
    let solana = Arc::new(Solana::new(cfg.clone()));
    let store = Arc::new(Store::new(std::path::PathBuf::from("data_customer")));
    let token = cfg.telegram_bot_token.clone();
    let client = Client::new();
    let mut offset: u64 = 0;

    tracing::info!("Long-polling mode started");

    loop {
        let url = format!(
            "{API}/bot{token}/getUpdates?offset={}&timeout=30&allowed_updates=[\"message\"]",
            offset + 1
        );
        let resp: TgResponse<Vec<TgUpdate>> = client.get(&url).send().await?.json().await?;

        // `ok=false` indicates a Telegram API-level error (bad token, rate
        // limit, etc.). Back off briefly instead of tight-looping.
        if !resp.ok {
            tracing::warn!("Telegram getUpdates returned ok=false; backing off");
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            continue;
        }

        if let Some(updates) = resp.result {
            for upd in updates {
                offset = offset.max(upd.update_id);
                if let Some(msg) = upd.message {
                    if let Some(text) = msg.text {
                        let chat = msg.chat.id;
                        let username = msg
                            .from
                            .as_ref()
                            .map(|u| u.username.as_deref().unwrap_or(&u.first_name))
                            .unwrap_or("Player")
                            .to_string();
                        let uid = msg.from.map(|u| u.id).unwrap_or(0);
                        let reply =
                            commands::handle(&text, uid, &username, chat, &solana, &store, &cfg)
                                .await;
                        let _ = send_message(&token, chat, &reply).await;
                    }
                }
            }
        }
    }
}

pub async fn run_webhook(cfg: BotConfig) -> Result<()> {
    let solana = Arc::new(Solana::new(cfg.clone()));
    let store = Arc::new(Store::new(std::path::PathBuf::from("data_customer")));
    let token = cfg.telegram_bot_token.clone();
    let port = cfg.port;

    // Set webhook if URL provided
    if let Some(ref wh_url) = cfg.webhook_url {
        let client = Client::new();
        let wh = format!("{wh_url}/telegram");
        let url = format!("{API}/bot{token}/setWebhook");
        #[derive(Serialize)]
        struct Wh {
            url: String,
            allowed_updates: Vec<String>,
            drop_pending_updates: bool,
            #[serde(skip_serializing_if = "Option::is_none")]
            secret_token: Option<String>,
        }
        client
            .post(&url)
            .json(&Wh {
                url: wh,
                allowed_updates: vec!["message".into()],
                drop_pending_updates: true,
                secret_token: cfg.webhook_secret_token.clone(),
            })
            .send()
            .await?;
        tracing::info!("Webhook set");
    }

    // SECURITY: webhook mode without a secret token means anyone who learns
    // the URL can inject fake updates (e.g. /register with an attacker wallet).
    if cfg.webhook_secret_token.is_none() {
        tracing::warn!(
            "Webhook mode WITHOUT secret token — requests are unauthenticated. Set WEBHOOK_SECRET_TOKEN."
        );
    }

    let addr = format!("0.0.0.0:{port}");
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!(addr = %addr, "Webhook server listening");

    loop {
        let (socket, _) = listener.accept().await?;
        let token = token.clone();
        let solana = solana.clone();
        let store = store.clone();
        let cfg = cfg.clone();
        let expected_secret = cfg.webhook_secret_token.clone();
        tokio::spawn(async move {
            let Ok(Some((body, secret))) = read_http_body(socket).await else {
                return;
            };
            // Reject updates without the matching secret token.
            if let Some(expected) = expected_secret {
                if secret.as_deref() != Some(expected.as_str()) {
                    tracing::warn!("Webhook request rejected: missing/mismatched secret token");
                    return;
                }
            }
            if let Ok(upd) = serde_json::from_str::<TgUpdate>(&body) {
                if let Some(msg) = upd.message {
                    if let Some(text) = msg.text {
                        let chat = msg.chat.id;
                        let username = msg
                            .from
                            .as_ref()
                            .map(|u| u.username.as_deref().unwrap_or(&u.first_name))
                            .unwrap_or("Player")
                            .to_string();
                        let uid = msg.from.map(|u| u.id).unwrap_or(0);
                        let reply =
                            commands::handle(&text, uid, &username, chat, &solana, &store, &cfg)
                                .await;
                        let _ = send_message(&token, chat, &reply).await;
                    }
                }
            }
        });
    }
}

/// Maximum accepted webhook body size (bytes). Telegram updates are small;
/// anything larger is either a misconfigured client or an attack.
const MAX_BODY_SIZE: usize = 16 * 1024;

/// Read an HTTP request's headers and body.
/// Returns `(body, x_telegram_bot_api_secret_token)` on success.
async fn read_http_body(
    mut socket: tokio::net::TcpStream,
) -> Result<Option<(String, Option<String>)>> {
    use tokio::io::{AsyncBufReadExt, AsyncReadExt, BufReader};
    let (reader, _) = socket.split();
    let mut reader = BufReader::new(reader);
    let mut content_length = 0usize;
    let mut secret_token: Option<String> = None;
    loop {
        let mut line = String::new();
        if reader.read_line(&mut line).await? == 0 {
            return Ok(None); // connection closed before headers finished
        }
        let trimmed = line.trim();
        if trimmed.is_empty() {
            break;
        }
        let lower = trimmed.to_ascii_lowercase();
        if let Some(val) = lower.strip_prefix("content-length:") {
            content_length = val.trim().parse().unwrap_or(0);
        }
        if let Some(val) = lower.strip_prefix("x-telegram-bot-api-secret-token:") {
            secret_token = Some(trimmed[val.len()..].trim().to_string());
        }
    }

    // Cap the body to prevent memory exhaustion from a hostile client.
    if content_length == 0 || content_length > MAX_BODY_SIZE {
        return Ok(None);
    }
    let mut body = vec![0u8; content_length];
    reader.read_exact(&mut body).await?;
    Ok(Some((String::from_utf8_lossy(&body).to_string(), secret_token)))
}
