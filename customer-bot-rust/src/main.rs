//! MazelProtocol Customer Bot — Rust Edition
//!
//! Customer-facing Telegram bot. Supports webhook and long-polling modes.

mod commands;
mod config;
mod error;
mod solana;
mod store;
mod telegram;

use clap::Parser;
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

#[derive(Parser, Debug, Clone)]
#[command(name = "mazelprotocol-customer-bot", version, about)]
pub struct Cli {
    #[arg(long, env = "RPC_URL")]
    pub rpc_url: String,

    #[arg(long, env = "TELEGRAM_BOT_TOKEN")]
    pub telegram_bot_token: String,

    #[arg(
        long,
        env = "MAIN_PROGRAM_ID",
        default_value = "7WyaHk2u8AgonsryMpnvbtp42CfLJFPQpyY5p9ys6FiF"
    )]
    pub main_program_id: String,

    #[arg(
        long,
        env = "QP_PROGRAM_ID",
        default_value = "7XC1KT5mvsHHXbR2mH6er138fu2tJ4L2fAgmpjLnnZK2"
    )]
    pub qp_program_id: String,

    #[arg(long, env = "USDC_MINT", default_value = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")]
    pub usdc_mint: String,

    #[arg(long, env = "WEBHOOK_URL")]
    pub webhook_url: Option<String>,

    /// Secret token for webhook authentication. When set, Telegram sends it
    /// in the `X-Telegram-Bot-Api-Secret-Token` header on every update and
    /// the bot rejects requests without a matching header. REQUIRED for
    /// webhook mode — without it anyone who discovers the URL can inject
    /// fake updates.
    #[arg(long, env = "WEBHOOK_SECRET_TOKEN")]
    pub webhook_secret_token: Option<String>,

    #[arg(long, env = "PORT", default_value = "3002")]
    pub port: u16,

    #[arg(long, env = "BOT_MODE", default_value = "polling")]
    pub mode: String,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::registry()
        .with(fmt::layer().json())
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")))
        .init();

    let cli = Cli::parse();
    let cfg = config::BotConfig::from_cli(&cli)?;

    tracing::info!(version = env!("CARGO_PKG_VERSION"), "Customer Bot starting");

    if cli.mode == "webhook" {
        telegram::run_webhook(cfg).await?;
    } else {
        telegram::run_polling(cfg).await?;
    }

    Ok(())
}
