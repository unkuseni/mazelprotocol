use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Numbers must be between 1 and 46")]
    InvalidNumbers,
    #[msg("Duplicate numbers are not allowed")]
    DuplicateNumbers,
    #[msg("No tickets provided")]
    NoTickets,
    #[msg("Maximum 100 tickets per batch")]
    TooManyTickets,
    #[msg("Draw is not ready yet")]
    DrawNotReady,
    #[msg("Too early to execute draw")]
    TooEarly,
    #[msg("Ticket is for a different draw")]
    WrongDraw,
    #[msg("Prize already claimed")]
    AlreadyClaimed,
    #[msg("Claim exceeds reported winner count")]
    ClaimExceedsWinners,
    #[msg("Lottery is paused")]
    LotteryPaused,
    #[msg("Insufficient funds")]
    InsufficientFunds,
    #[msg("Invalid authority")]
    InvalidAuthority,
    #[msg("Allocation error: sum of allocations exceeds ticket price")]
    AllocationError,
    #[msg("Invalid deposit amount")]
    InvalidAmount,
    #[msg("Jackpot is below the cap required for rolldown")]
    JackpotBelowCap,
    #[msg("Jackpot has already been won in this draw")]
    JackpotAlreadyWon,
    #[msg("Invalid ticket index in batch")]
    InvalidTicketIndex,
    #[msg("Ticket batch is full (max 100 tickets)")]
    BatchFull,
    #[msg("VRF result not yet resolved")]
    VrfNotResolved,
    #[msg("Invalid VRF proof")]
    InvalidVrfProof,
    #[msg("Invalid state: ticket price must be positive")]
    InvalidTicketPrice,
    #[msg("Invalid state: house fee must be <= 10000 basis points")]
    InvalidHouseFee,
    #[msg("Invalid state: jackpot cap must be positive")]
    InvalidJackpotCap,
    #[msg("Invalid state: seed amount exceeds jackpot cap")]
    InvalidSeedAmount,
    #[msg("Invalid state: next draw must be after last draw")]
    InvalidDrawTimestamps,
    #[msg("Maximum 250 tickets per unified ticket account")]
    TooManyTicketsUnified,
    #[msg("Ticket batch is full (max 250 tickets)")]
    BatchFullUnified,
}

// Error codes for ticket operations
#[error_code]
pub enum TicketError {
    #[msg("Ticket batch is full (max 250 tickets)")]
    BatchFull,
    #[msg("No tickets provided")]
    NoTickets,
    #[msg("Maximum 250 tickets per unified ticket account")]
    TooManyTickets,
    #[msg("Invalid ticket index")]
    InvalidTicketIndex,
}

// Convenience trait for converting between error types
pub trait IntoErrorCode {
    fn into_error_code(self) -> ErrorCode;
}

impl IntoErrorCode for TicketError {
    fn into_error_code(self) -> ErrorCode {
        match self {
            TicketError::BatchFull => ErrorCode::BatchFullUnified,
            TicketError::NoTickets => ErrorCode::NoTickets,
            TicketError::TooManyTickets => ErrorCode::TooManyTicketsUnified,
            TicketError::InvalidTicketIndex => ErrorCode::InvalidTicketIndex,
        }
    }
}

// Helper function to convert TicketError to ErrorCode for use with require!
pub fn ticket_error_to_error_code(error: TicketError) -> ErrorCode {
    error.into_error_code()
}
