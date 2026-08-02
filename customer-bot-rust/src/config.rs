//! Configuration for the customer bot.

use solana_sdk::{commitment_config::CommitmentConfig, pubkey::Pubkey};
use std::str::FromStr;

#[derive(Debug, Clone)]
pub struct BotConfig {
    pub rpc_url: String,
    pub commitment: CommitmentConfig,
    pub telegram_bot_token: String,
    pub main_program_id: Pubkey,
    pub qp_program_id: Pubkey,
    pub usdc_mint: Pubkey,
    pub webhook_url: Option<String>,
    pub webhook_secret_token: Option<String>,
    pub port: u16,
}

impl BotConfig {
    pub fn from_cli(cli: &crate::Cli) -> Result<Self, crate::error::Error> {
        Ok(BotConfig {
            rpc_url: cli.rpc_url.clone(),
            commitment: CommitmentConfig::confirmed(),
            telegram_bot_token: cli.telegram_bot_token.clone(),
            main_program_id: Pubkey::from_str(&cli.main_program_id)?,
            qp_program_id: Pubkey::from_str(&cli.qp_program_id)?,
            usdc_mint: Pubkey::from_str(&cli.usdc_mint)?,
            webhook_url: cli.webhook_url.clone(),
            webhook_secret_token: cli.webhook_secret_token.clone(),
            port: cli.port,
        })
    }
}
