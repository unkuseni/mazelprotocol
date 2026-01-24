//! Error definitions for the MazelProtocol lottery program
//!
//! This module defines all error codes that can be returned by the lottery program.
//! Errors are organized into logical categories for better maintainability and
//! developer experience. Each error includes a descriptive message that will be
//! displayed to users when the error occurs.
//!
//! # Error Categories
//! 1. **Authorization & Permissions** - Access control and permission errors
//! 2. **Lottery State & Configuration** - Lottery lifecycle and configuration errors
//! 3. **Ticket Purchase & Validation** - Ticket buying and validation errors
//! 4. **Draw Execution & Randomness** - Draw process and randomness generation errors
//! 5. **Prize Distribution & Claims** - Prize calculation and claiming errors
//! 6. **Staking System** - Staking operation and reward errors
//! 7. **Syndicate System** - Syndicate management and sharing errors
//! 8. **Financial & Token Operations** - Token transfer and financial operation errors
//! 9. **Mathematical & Parameter Validation** - Calculation and parameter validation errors
//! 10. **Account & PDA Validation** - Account derivation and validation errors
//! 11. **System & Operational Errors** - System-level and operational errors
//! 12. **Game-Specific Errors** - Special game feature errors
//! 13. **Compatibility & Version Errors** - Version compatibility errors
//! 14. **Generic & Catch-All Errors** - General purpose errors
//!
//! # Usage
//! Errors are automatically converted to Anchor's `ProgramError` type and can be
//! returned from instruction handlers using the `err!` macro or by returning
//! `Result<(), ErrorCode>`.

use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    // ============================================================================
    // Authorization & Permissions
    // ============================================================================
    /// Attempted to perform an operation without proper authorization
    #[msg("Unauthorized access attempt.")]
    Unauthorized,

    /// Operation requires admin-level authority but caller doesn't have it
    #[msg("Admin authority required.")]
    AdminAuthorityRequired,

    /// Caller is not the owner of the account they're trying to modify
    #[msg("Caller is not the owner of this account.")]
    NotOwner,

    /// Provided authority signature is invalid or doesn't match expected authority
    #[msg("Invalid authority signature.")]
    InvalidAuthority,

    // ============================================================================
    // Lottery State & Configuration
    // ============================================================================
    /// Lottery operations are temporarily suspended
    #[msg("Lottery is currently paused.")]
    Paused,

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

    // ============================================================================
    // Ticket Purchase & Validation
    // ============================================================================
    /// Ticket numbers fail basic validation (wrong count, format, etc.)
    #[msg("Invalid ticket numbers.")]
    InvalidNumbers,

    /// Ticket contains duplicate numbers (must be unique)
    #[msg("Duplicate numbers detected.")]
    DuplicateNumbers,

    /// Ticket numbers are outside the valid range (1-45)
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

    // ============================================================================
    // Draw Execution & Randomness
    // ============================================================================
    /// Attempted to reveal randomness that has already been revealed
    #[msg("Randomness already revealed.")]
    RandomnessAlreadyRevealed,

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

    /// VRF proof verification failed
    #[msg("Invalid VRF proof.")]
    InvalidVrfProof,

    /// Switchboard queue is not configured for randomness generation
    #[msg("Switchboard queue not configured.")]
    SwitchboardQueueNotSet,

    /// Failed to request randomness from the oracle
    #[msg("Randomness request failed.")]
    RandomnessRequestFailed,

    /// Randomness commitment is missing or invalid
    #[msg("Randomness commitment missing.")]
    RandomnessNotCommitted,

    // ============================================================================
    // Prize Distribution & Claims
    // ============================================================================
    /// No prize is available for the user to claim
    #[msg("No prize to claim.")]
    NoPrizeToClaim,

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

    /// Prize pool doesn't have enough funds to pay out prizes
    #[msg("Prize pool insufficient for distribution.")]
    InsufficientPrizePool,

    /// Error calculating rolldown prize distribution
    #[msg("Rolldown calculation error.")]
    RolldownCalculationError,

    // ============================================================================
    // Staking System
    // ============================================================================
    /// User doesn't have enough staked tokens for the requested operation
    #[msg("Insufficient staked tokens.")]
    InsufficientStake,

    /// Stake account has not been properly initialized
    #[msg("Stake account not initialized.")]
    StakeNotInitialized,

    /// Stake is still within the lock period and cannot be withdrawn
    #[msg("Stake lock period not elapsed.")]
    StakeLocked,

    /// No rewards are available for claiming at this time
    #[msg("No rewards available to claim.")]
    NoRewardsAvailable,

    /// Stake tier calculation produced invalid results
    #[msg("Invalid stake tier calculation.")]
    InvalidStakeTier,

    /// Stake amount is below the minimum required threshold
    #[msg("Stake amount below minimum threshold.")]
    StakeBelowMinimum,

    // ============================================================================
    // Syndicate System
    // ============================================================================
    /// Syndicate has reached its maximum member capacity
    #[msg("Syndicate is full.")]
    SyndicateFull,

    /// User is not a member of the specified syndicate
    #[msg("Not a member of this syndicate.")]
    NotSyndicateMember,

    /// Syndicate with the given ID does not exist
    #[msg("Syndicate not found.")]
    SyndicateNotFound,

    /// Syndicate configuration parameters are invalid
    #[msg("Invalid syndicate configuration.")]
    InvalidSyndicateConfig,

    /// Syndicate manager fee exceeds the maximum allowed percentage
    #[msg("Syndicate manager fee too high.")]
    ManagerFeeTooHigh,

    /// Attempted to join a private syndicate without invitation
    #[msg("Syndicate is private.")]
    SyndicatePrivate,

    /// Member share calculation produced invalid results
    #[msg("Invalid member share calculation.")]
    InvalidMemberShare,

    /// User's contribution to the syndicate is below the minimum required
    #[msg("Syndicate contribution insufficient.")]
    InsufficientContribution,

    // ============================================================================
    // Financial & Token Operations
    // ============================================================================
    /// Operation requires a USDC token account but none was provided
    #[msg("USDC token account required.")]
    UsdcAccountRequired,

    /// Provided USDC mint doesn't match the expected USDC mint
    #[msg("Invalid USDC mint.")]
    InvalidUsdcMint,

    /// Token transfer operation failed (insufficient balance, approval, etc.)
    #[msg("Token transfer failed.")]
    TokenTransferFailed,

    /// Account doesn't have sufficient token balance for the operation
    #[msg("Insufficient token balance.")]
    InsufficientTokenBalance,

    /// Token account is malformed or invalid
    #[msg("Invalid token account.")]
    InvalidTokenAccount,

    /// Associated Token Account (ATA) is required but not provided
    #[msg("ATA (Associated Token Account) required.")]
    AtaRequired,

    // ============================================================================
    // Mathematical & Parameter Validation
    // ============================================================================
    /// House fee percentage is outside valid bounds (0-100%)
    #[msg("Invalid house fee percentage.")]
    InvalidHouseFee,

    /// Jackpot cap is invalid (e.g., less than seed amount)
    #[msg("Invalid jackpot cap.")]
    InvalidJackpotCap,

    /// Seed amount is invalid (e.g., negative or too large)
    #[msg("Invalid seed amount.")]
    InvalidSeedAmount,

    /// Soft/hard cap configuration is inconsistent
    #[msg("Invalid soft/hard cap configuration.")]
    InvalidCapConfig,

    /// Arithmetic operation overflowed or underflowed
    #[msg("Arithmetic overflow/underflow.")]
    ArithmeticError,

    /// Attempted division by zero
    #[msg("Division by zero.")]
    DivisionByZero,

    /// Basis points calculation is invalid (e.g., >10,000 bps)
    #[msg("Invalid basis points calculation.")]
    InvalidBasisPoints,

    // ============================================================================
    // Account & PDA Validation
    // ============================================================================
    /// Program Derived Address derivation failed or produced invalid result
    #[msg("Invalid PDA derivation.")]
    InvalidPdaDerivation,

    /// Account doesn't have enough lamports to be rent-exempt
    #[msg("Account not rent exempt.")]
    NotRentExempt,

    /// Account owner doesn't match the expected program ID
    #[msg("Invalid account owner.")]
    InvalidAccountOwner,

    /// Account data size is insufficient for the required operation
    #[msg("Account data too small.")]
    AccountDataTooSmall,

    /// Account discriminator doesn't match expected value
    #[msg("Invalid account discriminator.")]
    InvalidDiscriminator,

    /// Account has already been initialized
    #[msg("Account already initialized.")]
    AlreadyInitialized,

    /// Account has not been initialized
    #[msg("Account not initialized.")]
    NotInitialized,

    // ============================================================================
    // System & Operational Errors
    // ============================================================================
    /// System program is required but not provided
    #[msg("System program required.")]
    SystemProgramRequired,

    /// System clock is unavailable for timestamp operations
    #[msg("Clock unavailable.")]
    ClockUnavailable,

    /// Timestamp is invalid or outside acceptable range
    #[msg("Invalid timestamp.")]
    InvalidTimestamp,

    /// Operation exceeded its time limit
    #[msg("Operation timed out.")]
    Timeout,

    /// Operation retry limit has been exceeded
    #[msg("Retry limit exceeded.")]
    RetryLimitExceeded,

    /// Operation is not supported in the current context
    #[msg("Operation not supported.")]
    NotSupported,

    // ============================================================================
    // Game-Specific Errors
    // ============================================================================
    /// Rolldown feature is not currently active
    #[msg("Rolldown not active.")]
    RolldownNotActive,

    /// Rolldown has already been triggered for this draw
    #[msg("Rolldown already triggered.")]
    RolldownAlreadyTriggered,

    /// Second chance draw is not available
    #[msg("Second chance draw not available.")]
    SecondChanceNotAvailable,

    /// No eligible tickets found for second chance draw
    #[msg("No eligible tickets for second chance.")]
    NoSecondChanceEntries,

    /// Quick pick game feature is not active
    #[msg("Quick pick game not active.")]
    QuickPickNotActive,

    /// Maximum Lucky Numbers NFT limit has been reached
    #[msg("Lucky Numbers NFT limit reached.")]
    LuckyNumbersLimitReached,

    /// Match count is insufficient for Lucky Numbers NFT eligibility
    #[msg("Insufficient match for Lucky Numbers NFT.")]
    InsufficientMatchForNft,

    /// Syndicate Wars feature is not currently active
    #[msg("Syndicate Wars not active.")]
    SyndicateWarsNotActive,

    /// Error calculating streak bonus rewards
    #[msg("Streak bonus calculation error.")]
    StreakBonusError,

    // ============================================================================
    // Compatibility & Version Errors
    // ============================================================================
    /// Program version doesn't match expected version
    #[msg("Program version mismatch.")]
    VersionMismatch,

    /// Attempted to use a deprecated feature
    #[msg("Deprecated feature.")]
    DeprecatedFeature,

    /// Operation is not supported in the current program version
    #[msg("Unsupported operation in current version.")]
    UnsupportedInVersion,

    // ============================================================================
    // Generic & Catch-All Errors
    // ============================================================================
    /// Unknown or unclassified error occurred
    #[msg("Unknown error occurred.")]
    UnknownError,

    /// General validation check failed
    #[msg("Validation failed.")]
    ValidationFailed,

    /// Program constraint was violated
    #[msg("Constraint violation.")]
    ConstraintViolation,

    /// Internal program error (should not occur in normal operation)
    #[msg("Internal program error.")]
    InternalError,
}
