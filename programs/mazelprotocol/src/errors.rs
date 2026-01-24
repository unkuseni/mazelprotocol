use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    // ============================================================================
    // Authorization & Permissions
    // ============================================================================
    #[msg("Unauthorized access attempt.")]
    Unauthorized,

    #[msg("Admin authority required.")]
    AdminAuthorityRequired,

    #[msg("Caller is not the owner of this account.")]
    NotOwner,

    #[msg("Invalid authority signature.")]
    InvalidAuthority,

    // ============================================================================
    // Lottery State & Configuration
    // ============================================================================
    #[msg("Lottery is currently paused.")]
    Paused,

    #[msg("Draw is already in progress.")]
    DrawInProgress,

    #[msg("Draw is not in progress.")]
    DrawNotInProgress,

    #[msg("Draw not ready yet.")]
    DrawNotReady,

    #[msg("Draw has already been completed.")]
    DrawAlreadyCompleted,

    #[msg("Invalid draw state transition.")]
    InvalidDrawState,

    #[msg("Lottery state is not initialized.")]
    LotteryNotInitialized,

    #[msg("Invalid lottery configuration.")]
    InvalidConfig,

    // ============================================================================
    // Ticket Purchase & Validation
    // ============================================================================
    #[msg("Invalid ticket numbers.")]
    InvalidNumbers,

    #[msg("Duplicate numbers detected.")]
    DuplicateNumbers,

    #[msg("Numbers out of valid range.")]
    NumbersOutOfRange,

    #[msg("Not enough funds to purchase ticket.")]
    InsufficientFunds,

    #[msg("Exceeded maximum ticket purchase limit.")]
    MaxTicketsExceeded,

    #[msg("Exceeded maximum tickets per draw.")]
    MaxTicketsPerDrawExceeded,

    #[msg("Invalid ticket price.")]
    InvalidTicketPrice,

    #[msg("Bulk purchase size exceeds limit.")]
    BulkPurchaseLimitExceeded,

    #[msg("Ticket sale has ended for this draw.")]
    TicketSaleEnded,

    #[msg("Ticket has already been claimed.")]
    AlreadyClaimed,

    #[msg("Ticket has expired.")]
    TicketExpired,

    #[msg("Ticket not found or invalid.")]
    InvalidTicket,

    // ============================================================================
    // Draw Execution & Randomness
    // ============================================================================
    #[msg("Randomness already revealed.")]
    RandomnessAlreadyRevealed,

    #[msg("Randomness not yet resolved.")]
    RandomnessNotResolved,

    #[msg("Randomness has expired.")]
    RandomnessExpired,

    #[msg("Invalid randomness account.")]
    InvalidRandomnessAccount,

    #[msg("Randomness freshness check failed.")]
    RandomnessNotFresh,

    #[msg("Invalid VRF proof.")]
    InvalidVrfProof,

    #[msg("Switchboard queue not configured.")]
    SwitchboardQueueNotSet,

    #[msg("Randomness request failed.")]
    RandomnessRequestFailed,

    #[msg("Randomness commitment missing.")]
    RandomnessNotCommitted,

    // ============================================================================
    // Prize Distribution & Claims
    // ============================================================================
    #[msg("No prize to claim.")]
    NoPrizeToClaim,

    #[msg("Prize already claimed.")]
    PrizeAlreadyClaimed,

    #[msg("Invalid prize calculation.")]
    InvalidPrizeCalculation,

    #[msg("Prize distribution failed.")]
    PrizeDistributionFailed,

    #[msg("Jackpot already won this draw.")]
    JackpotAlreadyWon,

    #[msg("Invalid match count for prize.")]
    InvalidMatchCount,

    #[msg("Prize pool insufficient for distribution.")]
    InsufficientPrizePool,

    #[msg("Rolldown calculation error.")]
    RolldownCalculationError,

    // ============================================================================
    // Staking System
    // ============================================================================
    #[msg("Insufficient staked tokens.")]
    InsufficientStake,

    #[msg("Stake account not initialized.")]
    StakeNotInitialized,

    #[msg("Stake lock period not elapsed.")]
    StakeLocked,

    #[msg("No rewards available to claim.")]
    NoRewardsAvailable,

    #[msg("Invalid stake tier calculation.")]
    InvalidStakeTier,

    #[msg("Stake amount below minimum threshold.")]
    StakeBelowMinimum,

    // ============================================================================
    // Syndicate System
    // ============================================================================
    #[msg("Syndicate is full.")]
    SyndicateFull,

    #[msg("Not a member of this syndicate.")]
    NotSyndicateMember,

    #[msg("Syndicate not found.")]
    SyndicateNotFound,

    #[msg("Invalid syndicate configuration.")]
    InvalidSyndicateConfig,

    #[msg("Syndicate manager fee too high.")]
    ManagerFeeTooHigh,

    #[msg("Syndicate is private.")]
    SyndicatePrivate,

    #[msg("Invalid member share calculation.")]
    InvalidMemberShare,

    #[msg("Syndicate contribution insufficient.")]
    InsufficientContribution,

    // ============================================================================
    // Financial & Token Operations
    // ============================================================================
    #[msg("USDC token account required.")]
    UsdcAccountRequired,

    #[msg("Invalid USDC mint.")]
    InvalidUsdcMint,

    #[msg("Token transfer failed.")]
    TokenTransferFailed,

    #[msg("Insufficient token balance.")]
    InsufficientTokenBalance,

    #[msg("Invalid token account.")]
    InvalidTokenAccount,

    #[msg("ATA (Associated Token Account) required.")]
    AtaRequired,

    // ============================================================================
    // Mathematical & Parameter Validation
    // ============================================================================
    #[msg("Invalid house fee percentage.")]
    InvalidHouseFee,

    #[msg("Invalid jackpot cap.")]
    InvalidJackpotCap,

    #[msg("Invalid seed amount.")]
    InvalidSeedAmount,

    #[msg("Invalid soft/hard cap configuration.")]
    InvalidCapConfig,

    #[msg("Arithmetic overflow/underflow.")]
    ArithmeticError,

    #[msg("Division by zero.")]
    DivisionByZero,

    #[msg("Invalid basis points calculation.")]
    InvalidBasisPoints,

    // ============================================================================
    // Account & PDA Validation
    // ============================================================================
    #[msg("Invalid PDA derivation.")]
    InvalidPdaDerivation,

    #[msg("Account not rent exempt.")]
    NotRentExempt,

    #[msg("Invalid account owner.")]
    InvalidAccountOwner,

    #[msg("Account data too small.")]
    AccountDataTooSmall,

    #[msg("Invalid account discriminator.")]
    InvalidDiscriminator,

    #[msg("Account already initialized.")]
    AlreadyInitialized,

    #[msg("Account not initialized.")]
    NotInitialized,

    // ============================================================================
    // System & Operational Errors
    // ============================================================================
    #[msg("System program required.")]
    SystemProgramRequired,

    #[msg("Clock unavailable.")]
    ClockUnavailable,

    #[msg("Invalid timestamp.")]
    InvalidTimestamp,

    #[msg("Operation timed out.")]
    Timeout,

    #[msg("Retry limit exceeded.")]
    RetryLimitExceeded,

    #[msg("Operation not supported.")]
    NotSupported,

    // ============================================================================
    // Game-Specific Errors
    // ============================================================================
    #[msg("Rolldown not active.")]
    RolldownNotActive,

    #[msg("Rolldown already triggered.")]
    RolldownAlreadyTriggered,

    #[msg("Second chance draw not available.")]
    SecondChanceNotAvailable,

    #[msg("No eligible tickets for second chance.")]
    NoSecondChanceEntries,

    #[msg("Quick pick game not active.")]
    QuickPickNotActive,

    #[msg("Lucky Numbers NFT limit reached.")]
    LuckyNumbersLimitReached,

    #[msg("Insufficient match for Lucky Numbers NFT.")]
    InsufficientMatchForNft,

    #[msg("Syndicate Wars not active.")]
    SyndicateWarsNotActive,

    #[msg("Streak bonus calculation error.")]
    StreakBonusError,

    // ============================================================================
    // Compatibility & Version Errors
    // ============================================================================
    #[msg("Program version mismatch.")]
    VersionMismatch,

    #[msg("Deprecated feature.")]
    DeprecatedFeature,

    #[msg("Unsupported operation in current version.")]
    UnsupportedInVersion,

    // ============================================================================
    // Generic & Catch-All Errors
    // ============================================================================
    #[msg("Unknown error occurred.")]
    UnknownError,

    #[msg("Validation failed.")]
    ValidationFailed,

    #[msg("Constraint violation.")]
    ConstraintViolation,

    #[msg("Internal program error.")]
    InternalError,
}
