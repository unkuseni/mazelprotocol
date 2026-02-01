//! SolanaLotto Protocol - Error Codes
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

    /// User doesn't have enough funds to purchase the requested tickets
    #[msg("Not enough funds to purchase ticket.")]
    InsufficientFunds,

    /// User exceeded their personal ticket purchase limit
    #[msg("Exceeded maximum ticket purchase limit.")]
    MaxTicketsExceeded,

    /// User exceeded per-draw ticket purchase limit
    #[msg("Exceeded maximum tickets per draw.")]
    MaxTicketsPerDrawExceeded,

    /// Ticket price doesn't match the current lottery configuration
    #[msg("Invalid ticket price.")]
    InvalidTicketPrice,

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

    /// Lucky Numbers NFT limit reached
    #[msg("Lucky Numbers limit reached.")]
    LuckyNumbersLimitReached,

    /// Match tier insufficient for Lucky Numbers NFT
    #[msg("Insufficient match tier for NFT.")]
    InsufficientMatchForNft,

    /// Syndicate Wars competition is not active
    #[msg("Syndicate Wars not active.")]
    SyndicateWarsNotActive,

    /// Streak bonus calculation error
    #[msg("Streak bonus error.")]
    StreakBonusError,

    /// Mega Event not active
    #[msg("Mega Event not active.")]
    MegaEventNotActive,

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
}

impl From<LottoError> for ProgramError {
    fn from(e: LottoError) -> Self {
        ProgramError::Custom(e as u32)
    }
}
