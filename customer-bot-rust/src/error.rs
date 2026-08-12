//! Error types.

use thiserror::Error;

#[derive(Error, Debug)]
pub enum Error {
    #[error("Solana: {0}")]
    Solana(Box<solana_client::client_error::ClientError>),
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

// Box the large Solana client error to keep `Error` small, while still
// letting `?` convert raw `ClientError` values automatically.
impl From<solana_client::client_error::ClientError> for Error {
    fn from(error: solana_client::client_error::ClientError) -> Self {
        Error::Solana(Box::new(error))
    }
}

pub type Result<T> = std::result::Result<T, Error>;
