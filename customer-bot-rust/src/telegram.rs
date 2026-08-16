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

/// Exponential backoff for transient network failures: starts at 2s,
/// doubles on each consecutive failure up to a 30s cap, and resets to 2s
/// after any success.
#[derive(Debug, Clone, Copy)]
struct Backoff {
    delay_secs: u64,
}

impl Backoff {
    const INITIAL_SECS: u64 = 2;
    const MAX_SECS: u64 = 30;

    fn new() -> Self {
        Backoff { delay_secs: Self::INITIAL_SECS }
    }

    /// Delay to sleep before the next attempt.
    fn delay(&self) -> std::time::Duration {
        std::time::Duration::from_secs(self.delay_secs)
    }

    /// Record a failure; returns the delay to sleep before retrying.
    fn fail(&mut self) -> std::time::Duration {
        let delay = self.delay();
        self.delay_secs = (self.delay_secs * 2).min(Self::MAX_SECS);
        delay
    }

    /// Record a success, resetting the backoff to its initial delay.
    fn success(&mut self) {
        self.delay_secs = Self::INITIAL_SECS;
    }
}

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

    let mut backoff = Backoff::new();

    loop {
        let url = format!(
            "{API}/bot{token}/getUpdates?offset={}&timeout=30&allowed_updates=[\"message\"]",
            offset + 1
        );
        // Transient network errors (connection reset, timeout, etc.) must
        // not kill the bot: log, back off, and retry instead of exiting.
        let resp: TgResponse<Vec<TgUpdate>> = match client.get(&url).send().await {
            Ok(response) => match response.json().await {
                Ok(parsed) => parsed,
                Err(e) => {
                    tracing::warn!(error = %e, "Failed to decode getUpdates response; backing off");
                    tokio::time::sleep(backoff.fail()).await;
                    continue;
                }
            },
            Err(e) => {
                tracing::warn!(error = %e, "getUpdates request failed; backing off");
                tokio::time::sleep(backoff.fail()).await;
                continue;
            }
        };

        // `ok=false` indicates a Telegram API-level error (bad token, rate
        // limit, etc.). Back off instead of tight-looping.
        if !resp.ok {
            tracing::warn!("Telegram getUpdates returned ok=false; backing off");
            tokio::time::sleep(backoff.fail()).await;
            continue;
        }
        backoff.success();

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
    // SECURITY: webhook mode without a secret token means anyone who learns
    // the URL can inject fake updates (e.g. /register with an attacker's
    // wallet). Refuse to start rather than serving an unauthenticated
    // webhook — matching the CLI docs which mark the token REQUIRED.
    let expected_secret = cfg.webhook_secret_token.clone().ok_or_else(|| {
        crate::error::Error::Anyhow(anyhow::anyhow!(
            "WEBHOOK_SECRET_TOKEN is required in webhook mode; refusing to start an unauthenticated webhook server"
        ))
    })?;

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
                secret_token: Some(expected_secret.clone()),
            })
            .send()
            .await?;
        tracing::info!("Webhook set");
    }

    let addr = format!("0.0.0.0:{port}");
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!(addr = %addr, "Webhook server listening");

    let mut accept_backoff = Backoff::new();
    loop {
        // A single failed accept (e.g. EMFILE) must not kill the server.
        let (socket, _) = match listener.accept().await {
            Ok(accepted) => accepted,
            Err(e) => {
                tracing::warn!(error = %e, "Webhook accept failed; retrying");
                tokio::time::sleep(accept_backoff.fail()).await;
                continue;
            }
        };
        accept_backoff.success();
        let token = token.clone();
        let solana = solana.clone();
        let store = store.clone();
        let cfg = cfg.clone();
        let expected_secret = expected_secret.clone();
        tokio::spawn(async move {
            let mut socket = socket;
            let (body, secret) = match read_http_body(&mut socket).await {
                Ok(Some(pair)) => pair,
                Ok(None) => {
                    tracing::warn!("Webhook request malformed or too large; rejecting");
                    let _ = write_http_response(&mut socket, 400).await;
                    return;
                }
                Err(e) => {
                    tracing::warn!(error = %e, "Failed to read webhook request; rejecting");
                    let _ = write_http_response(&mut socket, 400).await;
                    return;
                }
            };
            // Reject updates without the matching secret token.
            if secret.as_deref() != Some(expected_secret.as_str()) {
                tracing::warn!("Webhook request rejected: missing/mismatched secret token");
                let _ = write_http_response(&mut socket, 400).await;
                return;
            }
            match serde_json::from_str::<TgUpdate>(&body) {
                Ok(upd) => {
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
                            let reply = commands::handle(
                                &text, uid, &username, chat, &solana, &store, &cfg,
                            )
                            .await;
                            let _ = send_message(&token, chat, &reply).await;
                        }
                    }
                }
                Err(e) => {
                    tracing::warn!(error = %e, "Failed to parse webhook update JSON; rejecting");
                    let _ = write_http_response(&mut socket, 400).await;
                    return;
                }
            }
            // Always answer with a terminal status so Telegram stops
            // re-delivering the update (which would cause duplicate
            // processing of the same update).
            let _ = write_http_response(&mut socket, 200).await;
        });
    }
}

/// Maximum accepted webhook body size (bytes). Telegram updates are small;
/// anything larger is either a misconfigured client or an attack.
const MAX_BODY_SIZE: usize = 16 * 1024;

/// Build the minimal HTTP/1.1 response written after each webhook update so
/// Telegram sees a terminal status and stops re-delivering the update
/// (re-delivery would cause duplicate processing).
fn http_response_bytes(status: u16) -> String {
    let reason = match status {
        200 => "OK",
        400 => "Bad Request",
        _ => "Internal Server Error",
    };
    format!("HTTP/1.1 {status} {reason}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
}

/// Write a minimal HTTP response on the accepted stream.
async fn write_http_response(
    socket: &mut tokio::net::TcpStream,
    status: u16,
) -> std::io::Result<()> {
    use tokio::io::AsyncWriteExt;
    socket.write_all(http_response_bytes(status).as_bytes()).await
}

/// Read an HTTP request's headers and body.
/// Returns `(body, x_telegram_bot_api_secret_token)` on success.
async fn read_http_body(
    socket: &mut tokio::net::TcpStream,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backoff_doubles_up_to_cap_and_resets() {
        let mut b = Backoff::new();
        assert_eq!(b.delay(), std::time::Duration::from_secs(Backoff::INITIAL_SECS));
        let mut prev = 0u64;
        for _ in 0..10 {
            let secs = b.fail().as_secs();
            assert!(secs >= prev, "backoff must be non-decreasing");
            assert!(secs <= Backoff::MAX_SECS, "backoff must not exceed the cap");
            prev = secs;
        }
        assert_eq!(prev, Backoff::MAX_SECS, "backoff must reach the cap");
        b.success();
        assert_eq!(b.delay(), std::time::Duration::from_secs(Backoff::INITIAL_SECS));
    }

    #[test]
    fn http_response_bytes_is_minimal_and_terminal() {
        let ok = http_response_bytes(200);
        assert!(ok.starts_with("HTTP/1.1 200 OK\r\n"));
        assert!(ok.contains("Content-Length: 0"));
        assert!(ok.contains("Connection: close"));
        assert!(ok.ends_with("\r\n\r\n"));
        let bad = http_response_bytes(400);
        assert!(bad.starts_with("HTTP/1.1 400 Bad Request\r\n"));
    }
}
