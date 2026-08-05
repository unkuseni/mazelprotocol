//! Bot orchestrator — cron scheduler and HTTP server.

use solana_client::rpc_client::RpcClient;
use solana_signer::Signer;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::config::BotConfig;
use crate::draw;
use crate::error::Result;
use crate::store::{PersistedBotStats, Store};
use crate::telegram;
use crate::Cli;

pub async fn run(cli: Cli) -> Result<()> {
    let config = BotConfig::from_cli(&cli)?;
    let store = Arc::new(Store::new(std::path::PathBuf::from("data")));
    let stats = Arc::new(RwLock::new(store.load_stats()?));

    verify_connectivity(&config).await?;
    print_banner(&config);

    let cron_handle = tokio::spawn(run_cron(config.clone(), store.clone(), stats.clone()));
    let http_handle = tokio::spawn(run_http(config, store, stats));

    tokio::select! {
        _ = cron_handle => tracing::warn!("Cron stopped"),
        _ = http_handle => tracing::warn!("HTTP stopped"),
    }

    Ok(())
}

async fn verify_connectivity(config: &BotConfig) -> Result<()> {
    let rpc = RpcClient::new_with_commitment(config.rpc_url.clone(), config.commitment);
    match rpc.get_slot() {
        Ok(slot) => tracing::info!(slot, "Connected to Solana"),
        Err(e) => return Err(crate::error::BotError::Solana(e)),
    }
    telegram::verify_bot_token(&config.telegram_bot_token).await?;
    Ok(())
}

fn print_banner(config: &BotConfig) {
    tracing::info!(
        rpc = %config.rpc_url, authority = %config.authority.pubkey(),
        mode = ?config.mode, dry_run = config.dry_run,
        main = %config.main_program_id, qp = %config.qp_program_id,
        "MazelProtocol Draw Bot started"
    );
}

// ---------------------------------------------------------------------------
// Cron
// ---------------------------------------------------------------------------

async fn run_cron(config: BotConfig, store: Arc<Store>, stats: Arc<RwLock<PersistedBotStats>>) {
    loop {
        tokio::time::sleep(std::time::Duration::from_secs(60)).await;
        poll_draws(&config, &store, &stats).await;
    }
}

async fn poll_draws(config: &BotConfig, store: &Store, stats: &RwLock<PersistedBotStats>) {
    if store.is_paused() {
        return;
    }

    let mut s = stats.write().await;
    s.poll_count += 1;

    let rpc = RpcClient::new_with_commitment(config.rpc_url.clone(), config.commitment);

    if config.mode == crate::config::BotMode::Both
        || config.mode == crate::config::BotMode::MainOnly
    {
        match draw::run_main_lifecycle(&rpc, config, store).await {
            Ok(r) => {
                if r.phase == crate::store::DrawPhase::Finalized {
                    s.main_draws_completed += 1;
                    s.consecutive_errors = 0;
                }
            }
            Err(e) => {
                tracing::error!(error = %e, "[main] Failed");
                s.main_draws_failed += 1;
                s.consecutive_errors += 1;
                let _ = telegram::notify_draw_error(
                    &config.telegram_bot_token,
                    &config.telegram_chat_id,
                    "main",
                    0, // draw id unavailable on hard lifecycle error
                    &e.to_string(),
                )
                .await;
            }
        }
    }

    if config.mode == crate::config::BotMode::Both || config.mode == crate::config::BotMode::QpOnly
    {
        match draw::run_qp_lifecycle(&rpc, config, store).await {
            Ok(r) => {
                if r.phase == crate::store::DrawPhase::Finalized {
                    s.qp_draws_completed += 1;
                    s.consecutive_errors = 0;
                }
            }
            Err(e) => {
                tracing::error!(error = %e, "[quickpick] Failed");
                s.qp_draws_failed += 1;
                s.consecutive_errors += 1;
                let _ = telegram::notify_draw_error(
                    &config.telegram_bot_token,
                    &config.telegram_chat_id,
                    "quickpick",
                    0, // draw id unavailable on hard lifecycle error
                    &e.to_string(),
                )
                .await;
            }
        }
    }

    let _ = store.save_stats(&s);
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

async fn run_http(config: BotConfig, store: Arc<Store>, stats: Arc<RwLock<PersistedBotStats>>) {
    let addr = format!("0.0.0.0:{}", config.port);
    let listener = match tokio::net::TcpListener::bind(&addr).await {
        Ok(l) => l,
        Err(e) => {
            tracing::error!(error = %e, "Bind failed");
            return;
        }
    };
    tracing::info!(addr = %addr, "HTTP server listening");

    loop {
        let (socket, _) = match listener.accept().await {
            Ok(c) => c,
            Err(_) => continue,
        };
        let config = config.clone();
        let store = store.clone();
        let stats = stats.clone();
        tokio::spawn(handle_http(socket, config, store, stats));
    }
}

async fn handle_http(
    mut socket: tokio::net::TcpStream,
    config: BotConfig,
    store: Arc<Store>,
    stats: Arc<RwLock<PersistedBotStats>>,
) {
    use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
    let (reader, mut writer) = socket.split();
    let mut reader = BufReader::new(reader);
    let mut request_line = String::new();
    if reader.read_line(&mut request_line).await.is_err() {
        return;
    }

    let parts: Vec<&str> = request_line.split_whitespace().collect();
    let path = parts.get(1).unwrap_or(&"/");

    // Read headers so we can authenticate admin endpoints.
    let mut auth_header: Option<String> = None;
    let mut header_line = String::new();
    loop {
        header_line.clear();
        if reader.read_line(&mut header_line).await.is_err() {
            break;
        }
        let trimmed = header_line.trim();
        if trimmed.is_empty() {
            break;
        }
        if let Some(val) = trimmed.to_ascii_lowercase().strip_prefix("authorization:") {
            auth_header = Some(trimmed[val.len()..].trim().to_string());
        }
    }

    let (status, body) = match *path {
        "/health" | "/" => (
            "200 OK",
            serde_json::json!({"status":"ok","service":"mazelprotocol-draw-bot","version":env!("CARGO_PKG_VERSION")}).to_string(),
        ),
        "/admin/stats" | "/admin/pause" | "/admin/resume" => {
            // SECURITY: Admin endpoints require a bearer token. If none was
            // configured at startup, admin endpoints are disabled entirely.
            let authorized = config
                .admin_token
                .as_ref()
                .map(|expected| {
                    auth_header
                        .as_deref()
                        .map(|h| h == format!("Bearer {expected}") || h == format!("bearer {expected}"))
                        .unwrap_or(false)
                })
                .unwrap_or(false);

            if !authorized {
                ("401 Unauthorized", r#"{"error":"Unauthorized"}"#.into())
            } else if *path == "/admin/stats" {
                let s = stats.read().await;
                ("200 OK", serde_json::to_string(&*s).unwrap_or_default())
            } else if *path == "/admin/pause" {
                let _ = store.set_paused(true);
                ("200 OK", r#"{"paused":true}"#.into())
            } else {
                let _ = store.set_paused(false);
                ("200 OK", r#"{"paused":false}"#.into())
            }
        }
        _ => ("404 Not Found", r#"{"error":"Not found"}"#.into()),
    };

    let resp = format!(
        "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = writer.write_all(resp.as_bytes()).await;
}
