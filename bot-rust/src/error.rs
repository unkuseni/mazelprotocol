//! Error types.

use thiserror::Error;

#[derive(Error, Debug)]
pub enum BotError {
    #[error("Config: {0}")]
    Config(String),
    #[error("Solana: {0}")]
    Solana(Box<solana_client::client_error::ClientError>),
    #[error("Program: {0}")]
    AnchorLang(#[from] anchor_lang::error::Error),
    #[error("IO: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON: {0}")]
    Json(#[from] serde_json::Error),
    #[error("HTTP: {0}")]
    Http(#[from] reqwest::Error),
    #[error("Tx timeout: {0}")]
    TxTimeout(String),
    #[error("Draw: {0}")]
    Draw(String),
    #[error("Keypair: {0}")]
    Keypair(String),
    #[error(transparent)]
    Anyhow(#[from] anyhow::Error),
}

pub type Result<T> = std::result::Result<T, BotError>;

// Box the large Solana client error to keep `BotError` small, while still
// letting `?` convert raw `ClientError` values automatically.
impl From<solana_client::client_error::ClientError> for BotError {
    fn from(error: solana_client::client_error::ClientError) -> Self {
        BotError::Solana(Box::new(error))
    }
}
