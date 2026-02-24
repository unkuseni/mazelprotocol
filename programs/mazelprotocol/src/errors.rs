//! MazelProtocol - Error Codes
//!
//! This module defines all error codes for the lottery protocol.
//! Errors are grouped by category for easier debugging and handling.

use anchor_lang::prelude::*;

#[error_code]
pub enum LottoError {
    // ============================================================================
    // Authorization & Permissions (6000-6009)
    // ============================================================================
    /// Attempted to perform an operation without proper authorization
    #[msg("Unauthorized access attempt.")]
    Unauthorized = 6000,

    /// Operation requires admin-level authority but caller doesn't have it
    #[msg("Admin authority required.")]
    AdminAuthorityRequired,

    /// Caller is not the owner of the account they're trying to modify
    #[msg("Caller is not the owner of this account.")]
    NotOwner,

    /// Provided authority signature is invalid or doesn't match expected authority
    #[msg("Invalid authority signature.")]
    InvalidAuthority,

    /// Caller is not the ticket owner
    #[msg("Caller is not the ticket owner.")]
    NotTicketOwner,

    /// Invalid amount provided
    #[msg("Invalid amount.")]
    InvalidAmount,

    // ============================================================================
    // Lottery State & Configuration (6010-6029)
    // ============================================================================
    /// Lottery operations are temporarily suspended
    #[msg("Lottery is currently paused.")]
    Paused = 6010,

    /// Attempted to start a new draw while one is already running
    #[msg("Draw is already in progress.")]
    DrawInProgress,

    /// Attempted to perform draw-specific operation when no draw is active
    #[msg("Draw is not in progress.")]
    DrawNotInProgress,

    /// Draw cannot be started yet (e.g., insufficient time has passed)
    #[msg("Draw not ready yet.")]
    DrawNotReady,

    /// Invalid duration provided
    #[msg("Invalid duration.")]
    InvalidDuration,

    /// Attempted to complete a draw that has already been finalized
    #[msg("Draw has already been completed.")]
    DrawAlreadyCompleted,

    /// Invalid state transition in the draw lifecycle
    #[msg("Invalid draw state transition.")]
    InvalidDrawState,

    /// Lottery state account has not been properly initialized
    #[msg("Lottery state is not initialized.")]
    LotteryNotInitialized,

    /// Lottery configuration parameters are invalid or inconsistent
    #[msg("Invalid lottery configuration.")]
    InvalidConfig,

    /// Lottery is already initialized
    #[msg("Lottery is already initialized.")]
    AlreadyInitialized,

    /// Draw ID mismatch
    #[msg("Draw ID mismatch.")]
    DrawIdMismatch,

    /// Jackpot is below minimum required amount
    #[msg("Jackpot is below minimum required amount.")]
    InsufficientJackpotFunding,

    // ============================================================================
    // Ticket Purchase & Validation (6030-6049)
    // ============================================================================
    /// Ticket numbers fail basic validation (wrong count, format, etc.)
    #[msg("Invalid ticket numbers.")]
    InvalidNumbers = 6030,

    /// Ticket contains duplicate numbers (must be unique)
    #[msg("Duplicate numbers detected.")]
    DuplicateNumbers,

    /// Ticket numbers are outside the valid range (1-46)
    #[msg("Numbers out of valid range.")]
    NumbersOutOfRange,

    /// Ticket array is wrong size (must be exactly 6 numbers)
    #[msg("Invalid ticket array size.")]
    InvalidTicketArraySize,

    /// Ticket numbers are not sorted in ascending order
    #[msg("Ticket numbers must be sorted in ascending order.")]
    NumbersNotSorted,

    /// User doesn't have enough funds to purchase the requested tickets
    #[msg("Not enough funds to purchase ticket.")]
    InsufficientFunds,

    /// User attempted to use free ticket but has none available
    #[msg("No free tickets available.")]
    NoFreeTicketsAvailable,

    /// User has reached maximum free ticket limit
    #[msg("Maximum free ticket limit reached.")]
    MaxFreeTicketsReached,

    /// User exceeded their personal ticket purchase limit
    #[msg("Exceeded maximum ticket purchase limit.")]
    MaxTicketsExceeded,

    /// User exceeded per-draw ticket purchase limit
    #[msg("Exceeded maximum tickets per draw.")]
    MaxTicketsPerDrawExceeded,

    /// Ticket price doesn't match the current lottery configuration
    #[msg("Invalid ticket price.")]
    InvalidTicketPrice,

    /// Ticket sale has not started yet
    #[msg("Ticket sale has not started yet.")]
    TicketSaleNotStarted,

    /// Ticket sale cutoff calculation underflow
    #[msg("Ticket sale cutoff calculation error.")]
    TicketSaleCutoffError,

    /// Bulk ticket purchase exceeds the allowed batch size
    #[msg("Bulk purchase size exceeds limit.")]
    BulkPurchaseLimitExceeded,

    /// Attempted to purchase tickets after the sale period has ended
    #[msg("Ticket sale has ended for this draw.")]
    TicketSaleEnded,

    /// Ticket has already been claimed for its prize
    #[msg("Ticket has already been claimed.")]
    AlreadyClaimed,

    /// Ticket is no longer valid for claiming (claim period expired)
    #[msg("Ticket has expired.")]
    TicketExpired,

    /// Ticket reference is invalid or doesn't exist
    #[msg("Ticket not found or invalid.")]
    InvalidTicket,

    /// Empty ticket array provided
    #[msg("No tickets provided.")]
    EmptyTicketArray,

    // ============================================================================
    // Draw Execution & Randomness (6050-6069)
    // ============================================================================
    /// Attempted to reveal randomness that has already been revealed
    #[msg("Randomness already revealed.")]
    RandomnessAlreadyRevealed = 6050,

    /// Randomness result is not yet available from the oracle
    #[msg("Randomness not yet resolved.")]
    RandomnessNotResolved,

    /// Randomness value is too old and cannot be used
    #[msg("Randomness has expired.")]
    RandomnessExpired,

    /// Randomness value is all zeros or predictable pattern
    #[msg("Invalid randomness pattern detected.")]
    InvalidRandomnessPattern,

    /// Randomness reveal attempted too soon after commit
    #[msg("Randomness reveal too soon after commit.")]
    RandomnessRevealTooSoon,

    /// Randomness account is malformed or invalid
    #[msg("Invalid randomness account.")]
    InvalidRandomnessAccount,

    /// Randomness value doesn't meet freshness requirements
    #[msg("Randomness freshness check failed.")]
    RandomnessNotFresh,

    /// Randomness proof verification failed
    #[msg("Invalid randomness proof.")]
    InvalidRandomnessProof,

    /// Switchboard queue is not configured for randomness generation
    #[msg("Switchboard queue not configured.")]
    SwitchboardQueueNotSet,

    /// Failed to request randomness from the oracle
    #[msg("Randomness request failed.")]
    RandomnessRequestFailed,

    /// Randomness commitment is missing or invalid
    #[msg("Randomness commitment missing.")]
    RandomnessNotCommitted,

    /// Failed to parse randomness account data
    #[msg("Failed to parse randomness data.")]
    RandomnessParseError,

    // ============================================================================
    // Prize Distribution & Claims (6070-6089)
    // ============================================================================
    /// No prize is available for the user to claim
    #[msg("No prize to claim.")]
    NoPrizeToClaim = 6070,

    /// Prize has already been claimed by the user
    #[msg("Prize already claimed.")]
    PrizeAlreadyClaimed,

    /// Prize calculation produced invalid or inconsistent results
    #[msg("Invalid prize calculation.")]
    InvalidPrizeCalculation,

    /// Winner counts exceed total tickets in draw
    #[msg("Winner counts exceed total tickets.")]
    WinnerCountsExceedTickets,

    /// Suspiciously high winner count detected
    #[msg("Suspicious winner count detected.")]
    SuspiciousWinnerCount,

    /// Prize calculation overflow occurred
    #[msg("Prize calculation overflow.")]
    PrizeCalculationOverflow,

    /// Failed to distribute prize to winner(s)
    #[msg("Prize distribution failed.")]
    PrizeDistributionFailed,

    /// Jackpot has already been won in the current draw
    #[msg("Jackpot already won this draw.")]
    JackpotAlreadyWon,

    /// Match count doesn't correspond to a valid prize tier
    #[msg("Invalid match count for prize.")]
    InvalidMatchCount,

    /// Insufficient funds in prize pool to pay out
    #[msg("Insufficient prize pool balance.")]
    InsufficientPrizePool,

    /// Prize pool solvency check failed with details
    #[msg("Prize pool solvency check failed.")]
    PrizePoolSolvencyFailed,

    /// Prize distribution would leave dust amounts
    #[msg("Prize distribution would create dust amounts.")]
    PrizeDistributionDust,

    /// Error calculating rolldown prizes
    #[msg("Rolldown calculation error.")]
    RolldownCalculationError,

    /// Draw result not found
    #[msg("Draw result not found.")]
    DrawResultNotFound,

    // ============================================================================
    // Syndicate Errors (6090-6109)
    // ============================================================================
    /// Syndicate has reached maximum member capacity
    #[msg("Syndicate is full.")]
    SyndicateFull = 6090,

    /// User is not a member of the specified syndicate
    #[msg("Not a syndicate member.")]
    NotSyndicateMember,

    /// Syndicate reference is invalid or doesn't exist
    #[msg("Syndicate not found.")]
    SyndicateNotFound,

    /// Syndicate configuration is invalid
    #[msg("Invalid syndicate configuration.")]
    InvalidSyndicateConfig,

    /// Manager fee exceeds maximum allowed (5%)
    #[msg("Manager fee too high.")]
    ManagerFeeTooHigh,

    /// Syndicate configuration validation failed
    #[msg("Syndicate configuration invalid.")]
    SyndicateConfigInvalid,

    /// Syndicate member share calculation error
    #[msg("Syndicate member share calculation error.")]
    SyndicateShareCalculationError,

    /// Syndicate is private and user was not invited
    #[msg("Syndicate is private.")]
    SyndicatePrivate,

    /// Invalid member share calculation
    #[msg("Invalid member share.")]
    InvalidMemberShare,

    /// Contribution amount is too low
    #[msg("Insufficient contribution.")]
    InsufficientContribution,

    /// Syndicate name is too long
    #[msg("Syndicate name too long.")]
    SyndicateNameTooLong,

    /// Already a member of this syndicate
    #[msg("Already a syndicate member.")]
    AlreadySyndicateMember,

    /// Invalid rank provided
    #[msg("Invalid rank.")]
    InvalidRank,

    // ============================================================================
    // Token & Account Errors (6110-6129)
    // ============================================================================
    /// USDC token account is required but not provided
    #[msg("USDC account required.")]
    UsdcAccountRequired = 6110,

    /// USDC mint address doesn't match expected mint
    #[msg("Invalid USDC mint.")]
    InvalidUsdcMint,

    /// Token transfer failed
    #[msg("Token transfer failed.")]
    TokenTransferFailed,

    /// Insufficient token balance for operation
    #[msg("Insufficient token balance.")]
    InsufficientTokenBalance,

    /// Invalid token account
    #[msg("Invalid token account.")]
    InvalidTokenAccount,

    /// Associated token account required
    #[msg("Associated token account required.")]
    AtaRequired,

    /// Token account owner mismatch
    #[msg("Token account owner mismatch.")]
    TokenAccountOwnerMismatch,

    // ============================================================================
    // Configuration Validation Errors (6130-6149)
    // ============================================================================
    /// House fee is invalid (outside allowed range)
    #[msg("Invalid house fee.")]
    InvalidHouseFee = 6130,

    /// Jackpot cap is invalid
    #[msg("Invalid jackpot cap.")]
    InvalidJackpotCap,

    /// Seed amount is invalid
    #[msg("Invalid seed amount.")]
    InvalidSeedAmount,

    /// Cap configuration is invalid (soft cap must be less than hard cap)
    #[msg("Invalid cap configuration.")]
    InvalidCapConfig,

    /// Draw interval is invalid
    #[msg("Invalid draw interval.")]
    InvalidDrawInterval,

    /// Invalid basis points value (must be <= 10000)
    #[msg("Invalid basis points value.")]
    InvalidBasisPoints,

    /// Cap configuration invalid (soft cap > hard cap)
    #[msg("Invalid cap configuration.")]
    InvalidCapConfiguration,

    /// Probability calculation error
    #[msg("Probability calculation error.")]
    ProbabilityCalculationError,

    /// Arithmetic operation would overflow
    #[msg("Arithmetic overflow would occur.")]
    ArithmeticOverflow,

    // ============================================================================
    // Arithmetic & Computation Errors (6150-6169)
    // ============================================================================
    /// Arithmetic operation resulted in overflow or underflow
    #[msg("Arithmetic overflow or underflow.")]
    ArithmeticError = 6150,

    /// Division by zero attempted
    #[msg("Division by zero.")]
    DivisionByZero,

    /// Calculation overflow
    #[msg("Calculation overflow.")]
    Overflow,

    /// Calculation underflow
    #[msg("Calculation underflow.")]
    Underflow,

    // ============================================================================
    // Account & PDA Errors (6170-6189)
    // ============================================================================
    /// PDA derivation failed or doesn't match expected address
    #[msg("Invalid PDA derivation.")]
    InvalidPdaDerivation = 6170,

    /// Account is not rent exempt
    #[msg("Account not rent exempt.")]
    NotRentExempt,

    /// Account size calculation error
    #[msg("Account size calculation error.")]
    AccountSizeError,

    /// Dynamic account size exceeds limits
    #[msg("Dynamic account size exceeds limits.")]
    AccountSizeExceeded,

    /// Account owner doesn't match expected program
    #[msg("Invalid account owner.")]
    InvalidAccountOwner,

    /// Account data is too small for the expected structure
    #[msg("Account data too small.")]
    AccountDataTooSmall,

    /// Account discriminator doesn't match expected value
    #[msg("Invalid account discriminator.")]
    InvalidDiscriminator,

    /// Account is already initialized
    #[msg("Account already initialized.")]
    AccountAlreadyInitialized,

    /// Account is not initialized
    #[msg("Account not initialized.")]
    AccountNotInitialized,

    /// Invalid account data
    #[msg("Invalid account data.")]
    InvalidAccountData,

    // ============================================================================
    // System & Runtime Errors (6190-6209)
    // ============================================================================
    /// System program required but not provided
    #[msg("System program required.")]
    SystemProgramRequired = 6190,

    /// Clock sysvar unavailable
    #[msg("Clock unavailable.")]
    ClockUnavailable,

    /// Invalid timestamp
    #[msg("Invalid timestamp.")]
    InvalidTimestamp,

    /// Operation timed out
    #[msg("Operation timed out.")]
    Timeout,

    /// State validation failed
    #[msg("State validation failed.")]
    StateValidationFailed,

    /// Configuration validation failed
    #[msg("Configuration validation failed.")]
    ConfigValidationFailed,

    /// Safety check failed
    #[msg("Safety check failed.")]
    SafetyCheckFailed,

    /// Maximum retry attempts exceeded
    #[msg("Retry limit exceeded.")]
    RetryLimitExceeded,

    /// Feature not supported
    #[msg("Feature not supported.")]
    NotSupported,

    // ============================================================================
    // Advanced Feature Errors (6210-6249)
    // ============================================================================
    /// Rolldown is not currently active
    #[msg("Rolldown not active.")]
    RolldownNotActive = 6210,

    /// Rolldown has already been triggered for this draw
    #[msg("Rolldown already triggered.")]
    RolldownAlreadyTriggered,

    /// Quick Pick Express is not active
    #[msg("Quick Pick not active.")]
    QuickPickNotActive,

    /// User hasn't met minimum main lottery spend for Quick Pick access
    #[msg("Insufficient main lottery spend for Quick Pick access.")]
    InsufficientMainLotterySpend,

    /// Syndicate Wars competition is not active
    #[msg("Syndicate Wars not active.")]
    SyndicateWarsNotActive,

    /// Streak bonus calculation error
    #[msg("Streak bonus error.")]
    StreakBonusError,

    /// User statistics validation error
    #[msg("User statistics validation error.")]
    UserStatsValidationError,

    /// Draw state transition invalid
    #[msg("Invalid draw state transition.")]
    InvalidDrawStateTransition,

    /// Second Chance entry not eligible
    #[msg("Not eligible for Second Chance.")]
    SecondChanceNotEligible,

    // ============================================================================
    // Version & Compatibility Errors (6250-6269)
    // ============================================================================
    /// Program version mismatch
    #[msg("Version mismatch.")]
    VersionMismatch = 6250,

    /// Feature is deprecated and no longer supported
    #[msg("Feature deprecated.")]
    DeprecatedFeature,

    /// Feature not supported in this version
    #[msg("Not supported in this version.")]
    UnsupportedInVersion,

    // ============================================================================
    // Generic Errors (6270-6299)
    // ============================================================================
    /// Unknown or unspecified error occurred
    #[msg("Unknown error occurred.")]
    UnknownError = 6270,

    /// Generic validation failure
    #[msg("Validation failed.")]
    ValidationFailed,

    /// Detailed validation error with context
    #[msg("Detailed validation failed.")]
    DetailedValidationFailed,

    /// Recovery operation required
    #[msg("Recovery operation required.")]
    RecoveryRequired,

    /// Emergency state detected
    #[msg("Emergency state detected.")]
    EmergencyState,

    /// Constraint violation
    #[msg("Constraint violation.")]
    ConstraintViolation,

    /// Internal program error
    #[msg("Internal error.")]
    InternalError,

    /// Invalid instruction data
    #[msg("Invalid instruction data.")]
    InvalidInstructionData,

    /// Invalid program ID
    #[msg("Invalid program ID.")]
    InvalidProgramId,

    // ==========================================================================
    // EXPIRED PRIZE RECLAMATION (Audit Issue #5)
    // ==========================================================================
    /// The claim window for this draw has not yet expired
    #[msg("Claim window has not expired yet. Prizes can still be claimed.")]
    ClaimWindowNotExpired,

    /// The reclaim amount exceeds what was committed for this draw
    #[msg("Reclaim amount exceeds committed prizes for this draw.")]
    ReclaimAmountExceedsCommitted,

    /// Prizes for this draw have already been reclaimed
    #[msg("Prizes for this draw have already been reclaimed.")]
    PrizesAlreadyReclaimed,

    /// Distribution already completed for this competition
    #[msg("Prizes have already been distributed for this competition.")]
    AlreadyDistributed,

    // ==========================================================================
    // SYNDICATE PRIZE VERIFICATION (Audit Fix #7)
    // ==========================================================================
    /// Ticket does not belong to the specified syndicate
    #[msg("Ticket does not belong to this syndicate.")]
    SyndicateTicketNotOwned,

    /// Ticket draw ID does not match the distribution draw ID
    #[msg("Ticket draw ID does not match the distribution draw ID.")]
    SyndicateTicketDrawMismatch,

    /// Ticket has already been processed for syndicate distribution
    #[msg("Ticket has already been claimed/processed for syndicate distribution.")]
    SyndicateTicketAlreadyClaimed,

    /// The draw result has not been finalized yet
    #[msg("Draw result must be finalized before distributing syndicate prizes.")]
    DrawNotFinalized,

    /// No winning tickets found in the provided batch
    #[msg("No winning tickets found in the provided remaining accounts batch.")]
    NoWinningTicketsInBatch,

    /// Failed to deserialize a ticket account from remaining_accounts
    #[msg("Failed to deserialize ticket account from remaining_accounts.")]
    InvalidTicketAccount,
}

impl From<LottoError> for ProgramError {
    fn from(e: LottoError) -> Self {
        ProgramError::Custom(e as u32)
    }
}
