//! Error types.

use thiserror::Error;

#[derive(Error, Debug)]
pub enum Error {
    #[error("Config: {0}")]
    Config(String),
    #[error("Solana: {0}")]
    Solana(#[from] solana_client::client_error::ClientError),
    #[error("Parse: {0}")]
    Parse(#[from] solana_pubkey::ParsePubkeyError),
    #[error("IO: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON: {0}")]
    Json(#[from] serde_json::Error),
    #[error("HTTP: {0}")]
    Http(#[from] reqwest::Error),
    #[error("Store: {0}")]
    Store(String),
    #[error(transparent)]
    Anyhow(#[from] anyhow::Error),
}

pub type Result<T> = std::result::Result<T, Error>;
