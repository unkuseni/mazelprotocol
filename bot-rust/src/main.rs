//! MazelProtocol Draw Lifecycle Bot — Rust Edition
//!
//! A production-grade bot that manages the 4-phase draw lifecycle
//! (commit → execute → index → finalize) for both the Main Lottery
//! and Quick Pick Express programs on Solana.
//!
//! ## Usage
//!
//! ```bash
//! cargo run --release -- \
//!   --rpc-url https://api.devnet.solana.com \
//!   --keypair ~/.config/solana/id.json \
//!   --switchboard-queue <PUBKEY> \
//!   --usdc-mint <PUBKEY> \
//!   --telegram-bot-token <TOKEN> \
//!   --telegram-chat-id <ID>
//! ```

mod bot;
mod config;
mod draw;
mod error;
mod indexer;
mod store;
mod telegram;

use clap::Parser;
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

/// MazelProtocol Draw Lifecycle Bot
#[derive(Parser, Debug, Clone)]
#[command(name = "mazelprotocol-draw-bot", version, about)]
pub struct Cli {
    /// Solana RPC URL
    #[arg(long, env = "RPC_URL", default_value = "https://api.devnet.solana.com")]
    pub rpc_url: String,

    /// Path to authority keypair file or JSON array of 64 bytes
    #[arg(long, env = "AUTHORITY_KEYPAIR")]
    pub keypair: String,

    /// Telegram bot token
    #[arg(long, env = "TELEGRAM_BOT_TOKEN")]
    pub telegram_bot_token: String,

    /// Telegram chat ID for notifications
    #[arg(long, env = "TELEGRAM_CHAT_ID")]
    pub telegram_chat_id: String,

    /// Comma-separated Telegram admin user IDs
    #[arg(long, env = "TELEGRAM_ADMIN_IDS")]
    pub telegram_admin_ids: Option<String>,

    /// Main lottery program ID
    #[arg(
        long,
        env = "MAIN_PROGRAM_ID",
        default_value = "7WyaHk2u8AgonsryMpnvbtp42CfLJFPQpyY5p9ys6FiF"
    )]
    pub main_program_id: String,

    /// Quick Pick program ID
    #[arg(
        long,
        env = "QP_PROGRAM_ID",
        default_value = "7XC1KT5mvsHHXbR2mH6er138fu2tJ4L2fAgmpjLnnZK2"
    )]
    pub qp_program_id: String,

    /// Switchboard queue public key
    #[arg(long, env = "SWITCHBOARD_QUEUE")]
    pub switchboard_queue: String,

    /// USDC mint address
    #[arg(long, env = "USDC_MINT")]
    pub usdc_mint: String,

    /// Bot mode: both | main-only | qp-only
    #[arg(long, env = "MODE", default_value = "both")]
    pub mode: String,

    /// Dry run (log without sending transactions)
    #[arg(long, env = "DRY_RUN", default_value = "false")]
    pub dry_run: bool,

    /// HTTP server port
    #[arg(long, env = "PORT", default_value = "3001")]
    pub port: u16,

    /// Admin token for protected endpoints
    #[arg(long, env = "ADMIN_TOKEN")]
    pub admin_token: Option<String>,

    /// Commitment level
    #[arg(long, env = "COMMITMENT", default_value = "confirmed")]
    pub commitment: String,

    /// Priority fee in micro-lamports per CU
    #[arg(long, env = "PRIORITY_FEE_MICRO_LAMPORTS", default_value = "1000")]
    pub priority_fee: u64,

    /// Commit→execute delay in milliseconds
    #[arg(long, env = "COMMIT_EXECUTE_DELAY_MS", default_value = "4000")]
    pub commit_execute_delay_ms: u64,

    /// Max retries per phase
    #[arg(long, env = "MAX_RETRIES", default_value = "3")]
    pub max_retries: u32,

    /// Retry delay in milliseconds
    #[arg(long, env = "RETRY_DELAY_MS", default_value = "2000")]
    pub retry_delay_ms: u64,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::registry()
        .with(fmt::layer().json())
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")))
        .init();

    let cli = Cli::parse();

    tracing::info!(version = env!("CARGO_PKG_VERSION"), "MazelProtocol Draw Bot starting...");

    if let Err(e) = bot::run(cli).await {
        tracing::error!(error = %e, "Fatal error");
        std::process::exit(1);
    }
}
