use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Numbers must be between 1 and 46")]
    InvalidNumbers,
    #[msg("Duplicate numbers are not allowed")]
    DuplicateNumbers,
    #[msg("No tickets provided")]
    NoTickets,
    #[msg("Maximum 10 tickets per transaction")]
    TooManyTickets,
    #[msg("Draw is not ready yet")]
    DrawNotReady,
    #[msg("Too early to execute draw")]
    TooEarly,
    #[msg("Ticket is for a different draw")]
    WrongDraw,
    #[msg("Prize already claimed")]
    AlreadyClaimed,
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
}
