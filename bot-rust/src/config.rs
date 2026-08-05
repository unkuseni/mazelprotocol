//! Configuration for the draw bot.
//!
//! Loads from CLI args (clap) and provides a unified `BotConfig` struct.
//! All PDA seed constants mirror the on-chain programs exactly.

use solana_commitment_config::CommitmentConfig;
use solana_keypair::{read_keypair_file, Keypair};
use solana_pubkey::Pubkey;
use std::str::FromStr;

use crate::error::{BotError, Result};
use crate::Cli;

// ---------------------------------------------------------------------------
// PDA seeds — MUST match on-chain constants exactly
// ---------------------------------------------------------------------------

pub const LOTTERY_SEED: &[u8] = b"lottery";
pub const DRAW_SEED: &[u8] = b"draw";
pub const PRIZE_POOL_USDC_SEED: &[u8] = b"prize_pool_usdc";
pub const HOUSE_FEE_USDC_SEED: &[u8] = b"house_fee_usdc";
pub const INSURANCE_POOL_USDC_SEED: &[u8] = b"insurance_pool_usdc";
pub const QUICK_PICK_SEED: &[u8] = b"quick_pick";
pub const QUICK_PICK_DRAW_SEED: &[u8] = b"quick_pick_draw";

// ---------------------------------------------------------------------------
// On-chain constants
// ---------------------------------------------------------------------------

pub const NUMBERS_PER_TICKET: usize = 6;
pub const MAX_NUMBER: u8 = 46;
pub const QP_NUMBERS_PER_TICKET: usize = 5;
pub const QP_MAX_NUMBER: u8 = 35;
pub const DRAW_COMMIT_TIMEOUT: i64 = 3600;
pub const MAIN_FINALIZATION_DELAY: i64 = 120;
pub const QP_FINALIZATION_DELAY: i64 = 60;

// ---------------------------------------------------------------------------
// Bot mode
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq)]
pub enum BotMode {
    Both,
    MainOnly,
    QpOnly,
}

impl FromStr for BotMode {
    type Err = BotError;
    fn from_str(s: &str) -> Result<Self> {
        match s {
            "both" => Ok(BotMode::Both),
            "main-only" => Ok(BotMode::MainOnly),
            "qp-only" => Ok(BotMode::QpOnly),
            _ => Err(BotError::Config(format!(
                "Invalid mode: '{s}'. Use 'both', 'main-only', or 'qp-only'"
            ))),
        }
    }
}

// ---------------------------------------------------------------------------
// BotConfig
// ---------------------------------------------------------------------------

#[derive(Clone)]
pub struct BotConfig {
    pub rpc_url: String,
    pub commitment: CommitmentConfig,
    pub authority: Keypair,
    pub main_program_id: Pubkey,
    pub qp_program_id: Pubkey,
    pub switchboard_queue: Pubkey,
    pub usdc_mint: Pubkey,
    pub mode: BotMode,
    pub dry_run: bool,
    pub commit_execute_delay_ms: u64,
    pub max_retries: u32,
    pub retry_delay_ms: u64,
    pub priority_fee_micro_lamports: u64,
    pub telegram_bot_token: String,
    pub telegram_chat_id: String,
    pub telegram_admin_ids: Vec<String>,
    pub port: u16,
    pub admin_token: Option<String>,
}

impl BotConfig {
    pub fn from_cli(cli: &Cli) -> Result<Self> {
        let authority = if cli.keypair.starts_with('[') {
            let bytes: Vec<u8> = serde_json::from_str(&cli.keypair)
                .map_err(|e| BotError::Keypair(format!("Invalid JSON: {e}")))?;
            if bytes.len() != 64 {
                return Err(BotError::Keypair(format!(
                    "Keypair must be 64 bytes, got {}",
                    bytes.len()
                )));
            }
            Keypair::from_bytes(&bytes)
                .map_err(|e| BotError::Keypair(format!("Invalid bytes: {e}")))?
        } else {
            read_keypair_file(&cli.keypair)
                .map_err(|e| BotError::Keypair(format!("Cannot read keypair file: {e}")))?
        };

        let commitment = match cli.commitment.as_str() {
            "processed" => CommitmentConfig::processed(),
            "finalized" => CommitmentConfig::finalized(),
            _ => CommitmentConfig::confirmed(),
        };

        Ok(BotConfig {
            rpc_url: cli.rpc_url.clone(),
            commitment,
            authority,
            main_program_id: Pubkey::from_str(&cli.main_program_id)
                .map_err(|e| BotError::Config(format!("MAIN_PROGRAM_ID: {e}")))?,
            qp_program_id: Pubkey::from_str(&cli.qp_program_id)
                .map_err(|e| BotError::Config(format!("QP_PROGRAM_ID: {e}")))?,
            switchboard_queue: Pubkey::from_str(&cli.switchboard_queue)
                .map_err(|e| BotError::Config(format!("SWITCHBOARD_QUEUE: {e}")))?,
            usdc_mint: Pubkey::from_str(&cli.usdc_mint)
                .map_err(|e| BotError::Config(format!("USDC_MINT: {e}")))?,
            mode: BotMode::from_str(&cli.mode)?,
            dry_run: cli.dry_run,
            commit_execute_delay_ms: cli.commit_execute_delay_ms,
            max_retries: cli.max_retries,
            retry_delay_ms: cli.retry_delay_ms,
            priority_fee_micro_lamports: cli.priority_fee,
            telegram_bot_token: cli.telegram_bot_token.clone(),
            telegram_chat_id: cli.telegram_chat_id.clone(),
            telegram_admin_ids: cli
                .telegram_admin_ids
                .as_deref()
                .unwrap_or("")
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect(),
            port: cli.port,
            admin_token: cli.admin_token.clone(),
        })
    }

    pub fn main_lottery_state_pda(&self) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[LOTTERY_SEED], &self.main_program_id)
    }

    pub fn main_draw_result_pda(&self, draw_id: u64) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[DRAW_SEED, &draw_id.to_le_bytes()], &self.main_program_id)
    }

    pub fn qp_state_pda(&self) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[QUICK_PICK_SEED], &self.qp_program_id)
    }

    pub fn qp_draw_result_pda(&self, draw_id: u64) -> (Pubkey, u8) {
        Pubkey::find_program_address(
            &[QUICK_PICK_DRAW_SEED, &draw_id.to_le_bytes()],
            &self.qp_program_id,
        )
    }
}
