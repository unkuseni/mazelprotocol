//! Quick Pick Express Errors
//!
//! This module contains all error codes specific to the Quick Pick Express lottery program.

use anchor_lang::prelude::*;

/// Quick Pick Express error codes
#[error_code]
pub enum QuickPickError {
    // =========================================================================
    // AUTHORIZATION ERRORS (6000-6009)
    // =========================================================================
    /// Unauthorized access attempt
    #[msg("Unauthorized: caller is not the authority")]
    Unauthorized = 6000,

    /// Not the ticket owner
    #[msg("Not the owner of this ticket")]
    NotTicketOwner,

    /// Invalid authority for this operation
    #[msg("Invalid authority")]
    InvalidAuthority,

    // =========================================================================
    // STATE ERRORS (6010-6019)
    // =========================================================================
    /// Quick Pick is paused
    #[msg("Quick Pick Express is currently paused")]
    Paused = 6010,

    /// Quick Pick not initialized
    #[msg("Quick Pick Express has not been initialized")]
    NotInitialized,

    /// Quick Pick already initialized
    #[msg("Quick Pick Express is already initialized")]
    AlreadyInitialized,

    /// Invalid draw state for this operation
    #[msg("Invalid draw state for this operation")]
    InvalidDrawState,

    /// Draw is not ready yet
    #[msg("Draw is not ready - draw time not reached")]
    DrawNotReady,

    /// Draw is not in progress
    #[msg("Draw is not in progress")]
    DrawNotInProgress,

    /// Draw already completed
    #[msg("Draw has already been completed")]
    DrawAlreadyCompleted,

    /// Draw ID mismatch
    #[msg("Draw ID mismatch")]
    DrawIdMismatch,

    // =========================================================================
    // TICKET ERRORS (6020-6039)
    // =========================================================================
    /// Invalid numbers selected
    #[msg("Invalid numbers: must select 5 unique numbers from 1-35")]
    InvalidNumbers = 6020,

    /// Duplicate numbers in selection
    #[msg("Duplicate numbers are not allowed")]
    DuplicateNumbers,

    /// Numbers out of valid range
    #[msg("Numbers must be between 1 and 35")]
    NumbersOutOfRange,

    /// Ticket sale has ended for this draw
    #[msg("Ticket sale has ended for this draw")]
    TicketSaleEnded,

    /// Ticket already claimed
    #[msg("This ticket has already been claimed")]
    AlreadyClaimed,

    /// Ticket has expired
    #[msg("This ticket has expired and can no longer be claimed")]
    TicketExpired,

    /// Invalid ticket
    #[msg("Invalid ticket")]
    InvalidTicket,

    /// Numbers not sorted
    #[msg("Numbers must be sorted in ascending order")]
    NumbersNotSorted,

    // =========================================================================
    // ACCESS GATE ERRORS (6040-6049)
    // =========================================================================
    /// Insufficient main lottery spend for Quick Pick access
    #[msg("Insufficient main lottery spend: $50 lifetime spend required")]
    InsufficientMainLotterySpend = 6040,

    // =========================================================================
    // FUND ERRORS (6050-6069)
    // =========================================================================
    /// Insufficient funds
    #[msg("Insufficient funds for this operation")]
    InsufficientFunds = 6050,

    /// Insufficient prize pool balance
    #[msg("Insufficient prize pool balance to pay prize")]
    InsufficientPrizePool,

    /// No prize to claim
    #[msg("No prize to claim for this ticket")]
    NoPrizeToClaim,

    /// Prize already claimed
    #[msg("Prize has already been claimed")]
    PrizeAlreadyClaimed,

    /// Prize pool solvency failed
    #[msg("Prize pool solvency check failed")]
    PrizePoolSolvencyFailed,

    /// Prize calculation overflow
    #[msg("Prize calculation overflow")]
    PrizeCalculationOverflow,

    // =========================================================================
    // RANDOMNESS ERRORS (6070-6089)
    // =========================================================================
    /// Randomness already revealed
    #[msg("Randomness has already been revealed - cannot commit")]
    RandomnessAlreadyRevealed = 6070,

    /// Randomness not resolved yet
    #[msg("Randomness has not been resolved yet")]
    RandomnessNotResolved,

    /// Randomness has expired
    #[msg("Randomness has expired - request new randomness")]
    RandomnessExpired,

    /// Invalid randomness proof
    #[msg("Invalid randomness proof")]
    InvalidRandomnessProof,

    /// Randomness not fresh
    #[msg("Randomness is not fresh enough")]
    RandomnessNotFresh,

    /// Randomness not committed
    #[msg("Randomness has not been committed yet")]
    RandomnessNotCommitted,

    /// Failed to parse randomness account
    #[msg("Failed to parse randomness account data")]
    RandomnessParseError,

    // =========================================================================
    // TOKEN ERRORS (6090-6099)
    // =========================================================================
    /// Invalid USDC mint
    #[msg("Invalid USDC mint address")]
    InvalidUsdcMint = 6090,

    /// Token account owner mismatch
    #[msg("Token account owner does not match expected owner")]
    TokenAccountOwnerMismatch,

    /// Token transfer failed
    #[msg("Token transfer failed")]
    TokenTransferFailed,

    /// Invalid token account
    #[msg("Invalid token account")]
    InvalidTokenAccount,

    // =========================================================================
    // ARITHMETIC ERRORS (6100-6109)
    // =========================================================================
    /// Arithmetic overflow
    #[msg("Arithmetic overflow")]
    Overflow = 6100,

    /// Arithmetic underflow
    #[msg("Arithmetic underflow")]
    Underflow,

    /// Division by zero
    #[msg("Division by zero")]
    DivisionByZero,

    /// General arithmetic error
    #[msg("Arithmetic error")]
    ArithmeticError,

    // =========================================================================
    // VALIDATION ERRORS (6110-6119)
    // =========================================================================
    /// Invalid configuration
    #[msg("Invalid configuration parameter")]
    InvalidConfig = 6110,

    /// Winner counts exceed total tickets
    #[msg("Winner counts exceed total tickets sold")]
    WinnerCountsExceedTickets,

    /// Suspicious winner count (statistically improbable)
    #[msg("Suspicious winner count - statistically improbable")]
    SuspiciousWinnerCount,

    /// Rolldown calculation error
    #[msg("Error calculating rolldown distribution")]
    RolldownCalculationError,

    /// Invalid match count
    #[msg("Invalid match count")]
    InvalidMatchCount,

    // =========================================================================
    // SYSTEM ERRORS (6120-6129)
    // =========================================================================
    /// Clock unavailable
    #[msg("System clock is unavailable")]
    ClockUnavailable = 6120,

    /// Invalid timestamp
    #[msg("Invalid timestamp")]
    InvalidTimestamp,

    /// Timeout occurred
    #[msg("Operation timed out")]
    Timeout,

    /// Internal error
    #[msg("Internal error")]
    InternalError,
}

impl From<QuickPickError> for ProgramError {
    fn from(e: QuickPickError) -> Self {
        ProgramError::Custom(e as u32)
    }
}
