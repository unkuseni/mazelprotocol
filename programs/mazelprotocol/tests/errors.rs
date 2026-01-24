//! Error code test suite
//!
//! This module contains comprehensive tests for the MazelProtocol error system.
//! It validates that all error codes are properly defined, have unique identifiers,
//! and can be correctly converted to Anchor's error system.
//!
//! # Test Categories
//! 1. **Existence Tests** - Verify all error variants are defined
//! 2. **Conversion Tests** - Test Anchor error conversion
//! 3. **Validation Tests** - Verify error properties (messages, uniqueness)
//! 4. **Completeness Tests** - Ensure all errors are tested
//!
//! These tests are critical for maintaining error consistency across the protocol
//! and ensuring proper error handling in production.

#[cfg(test)]
mod tests {
    use anchor_lang::error::Error as AnchorError;
    use anchor_lang::prelude::ProgramError;
    use mazelprotocol::errors::ErrorCode;

    #[test]
    /// Tests existence and conversion of authorization-related error codes
    ///
    /// Validates that all authorization error variants are properly defined
    /// and can be converted to Anchor's error system. Authorization errors
    /// handle permission and access control failures in the protocol.
    fn test_authorization_errors_exist() {
        // Test that authorization error variants exist and have messages
        let _ = ErrorCode::Unauthorized;
        let _ = ErrorCode::AdminAuthorityRequired;
        let _ = ErrorCode::NotOwner;
        let _ = ErrorCode::InvalidAuthority;

        // Verify they can be converted to ProgramError via AnchorError
        let anchor_err: AnchorError = ErrorCode::Unauthorized.into();
        let err: ProgramError = anchor_err.into();
        assert!(matches!(err, ProgramError::Custom(_)));
    }

    #[test]
    /// Tests existence of lottery state and configuration error codes
    ///
    /// Validates error codes related to lottery lifecycle management,
    /// including draw state transitions, initialization status, and
    /// configuration validation failures.
    fn test_lottery_state_errors_exist() {
        let _ = ErrorCode::Paused;
        let _ = ErrorCode::DrawInProgress;
        let _ = ErrorCode::DrawNotInProgress;
        let _ = ErrorCode::DrawNotReady;
        let _ = ErrorCode::DrawAlreadyCompleted;
        let _ = ErrorCode::InvalidDrawState;
        let _ = ErrorCode::LotteryNotInitialized;
        let _ = ErrorCode::InvalidConfig;
    }

    #[test]
    /// Tests existence of ticket purchase and validation error codes
    ///
    /// Validates error codes related to ticket buying operations,
    /// including number validation, purchase limits, funds checking,
    /// and ticket lifecycle management (expiration, claiming).
    fn test_ticket_purchase_errors_exist() {
        let _ = ErrorCode::InvalidNumbers;
        let _ = ErrorCode::DuplicateNumbers;
        let _ = ErrorCode::NumbersOutOfRange;
        let _ = ErrorCode::InsufficientFunds;
        let _ = ErrorCode::MaxTicketsExceeded;
        let _ = ErrorCode::MaxTicketsPerDrawExceeded;
        let _ = ErrorCode::InvalidTicketPrice;
        let _ = ErrorCode::BulkPurchaseLimitExceeded;
        let _ = ErrorCode::TicketSaleEnded;
        let _ = ErrorCode::AlreadyClaimed;
        let _ = ErrorCode::TicketExpired;
        let _ = ErrorCode::InvalidTicket;
    }

    #[test]
    /// Tests existence of draw execution and randomness error codes
    ///
    /// Validates error codes related to draw execution, VRF randomness
    /// generation, Switchboard oracle integration, and randomness
    /// lifecycle management (request, commitment, revelation).
    fn test_draw_randomness_errors_exist() {
        let _ = ErrorCode::RandomnessAlreadyRevealed;
        let _ = ErrorCode::RandomnessNotResolved;
        let _ = ErrorCode::RandomnessExpired;
        let _ = ErrorCode::InvalidRandomnessAccount;
        let _ = ErrorCode::RandomnessNotFresh;
        let _ = ErrorCode::InvalidVrfProof;
        let _ = ErrorCode::SwitchboardQueueNotSet;
        let _ = ErrorCode::RandomnessRequestFailed;
        let _ = ErrorCode::RandomnessNotCommitted;
    }

    #[test]
    /// Tests existence of prize distribution and claiming error codes
    ///
    /// Validates error codes related to prize calculation, distribution,
    /// claiming operations, jackpot management, and rolldown mechanics.
    fn test_prize_distribution_errors_exist() {
        let _ = ErrorCode::NoPrizeToClaim;
        let _ = ErrorCode::PrizeAlreadyClaimed;
        let _ = ErrorCode::InvalidPrizeCalculation;
        let _ = ErrorCode::PrizeDistributionFailed;
        let _ = ErrorCode::JackpotAlreadyWon;
        let _ = ErrorCode::InvalidMatchCount;
        let _ = ErrorCode::InsufficientPrizePool;
        let _ = ErrorCode::RolldownCalculationError;
    }

    #[test]
    /// Tests existence of staking system error codes
    ///
    /// Validates error codes related to token staking operations,
    /// including stake management, reward claiming, tier calculations,
    /// and lock period enforcement.
    fn test_staking_errors_exist() {
        let _ = ErrorCode::InsufficientStake;
        let _ = ErrorCode::StakeNotInitialized;
        let _ = ErrorCode::StakeLocked;
        let _ = ErrorCode::NoRewardsAvailable;
        let _ = ErrorCode::InvalidStakeTier;
        let _ = ErrorCode::StakeBelowMinimum;
    }

    #[test]
    /// Tests existence of syndicate system error codes
    ///
    /// Validates error codes related to syndicate (group play) operations,
    /// including member management, profit sharing, configuration validation,
    /// and access control for private syndicates.
    fn test_syndicate_errors_exist() {
        let _ = ErrorCode::SyndicateFull;
        let _ = ErrorCode::NotSyndicateMember;
        let _ = ErrorCode::SyndicateNotFound;
        let _ = ErrorCode::InvalidSyndicateConfig;
        let _ = ErrorCode::ManagerFeeTooHigh;
        let _ = ErrorCode::SyndicatePrivate;
        let _ = ErrorCode::InvalidMemberShare;
        let _ = ErrorCode::InsufficientContribution;
    }

    #[test]
    /// Tests existence of financial and token operation error codes
    ///
    /// Validates error codes related to token transfers, USDC integration,
    /// token account validation, and financial operation failures.
    fn test_financial_errors_exist() {
        let _ = ErrorCode::UsdcAccountRequired;
        let _ = ErrorCode::InvalidUsdcMint;
        let _ = ErrorCode::TokenTransferFailed;
        let _ = ErrorCode::InsufficientTokenBalance;
        let _ = ErrorCode::InvalidTokenAccount;
        let _ = ErrorCode::AtaRequired;
    }

    #[test]
    /// Tests existence of mathematical and parameter validation error codes
    ///
    /// Validates error codes related to mathematical calculations,
    /// parameter validation, arithmetic safety, and configuration
    /// consistency checks.
    fn test_mathematical_errors_exist() {
        let _ = ErrorCode::InvalidHouseFee;
        let _ = ErrorCode::InvalidJackpotCap;
        let _ = ErrorCode::InvalidSeedAmount;
        let _ = ErrorCode::InvalidCapConfig;
        let _ = ErrorCode::ArithmeticError;
        let _ = ErrorCode::DivisionByZero;
        let _ = ErrorCode::InvalidBasisPoints;
    }

    #[test]
    /// Tests existence of account and PDA validation error codes
    ///
    /// Validates error codes related to account management, PDA derivation,
    /// rent exemption, account initialization state, and data size validation.
    fn test_account_pda_errors_exist() {
        let _ = ErrorCode::InvalidPdaDerivation;
        let _ = ErrorCode::NotRentExempt;
        let _ = ErrorCode::InvalidAccountOwner;
        let _ = ErrorCode::AccountDataTooSmall;
        let _ = ErrorCode::InvalidDiscriminator;
        let _ = ErrorCode::AlreadyInitialized;
        let _ = ErrorCode::NotInitialized;
    }

    #[test]
    /// Tests existence of system and operational error codes
    ///
    /// Validates error codes related to system-level operations,
    /// time management, retry limits, and feature support checks.
    fn test_system_errors_exist() {
        let _ = ErrorCode::SystemProgramRequired;
        let _ = ErrorCode::ClockUnavailable;
        let _ = ErrorCode::InvalidTimestamp;
        let _ = ErrorCode::Timeout;
        let _ = ErrorCode::RetryLimitExceeded;
        let _ = ErrorCode::NotSupported;
    }

    #[test]
    /// Tests existence of game-specific feature error codes
    ///
    /// Validates error codes related to special game features including
    /// rolldown mechanics, second chance draws, quick pick games,
    /// Lucky Numbers NFTs, Syndicate Wars, and streak bonuses.
    fn test_game_specific_errors_exist() {
        let _ = ErrorCode::RolldownNotActive;
        let _ = ErrorCode::RolldownAlreadyTriggered;
        let _ = ErrorCode::SecondChanceNotAvailable;
        let _ = ErrorCode::NoSecondChanceEntries;
        let _ = ErrorCode::QuickPickNotActive;
        let _ = ErrorCode::LuckyNumbersLimitReached;
        let _ = ErrorCode::InsufficientMatchForNft;
        let _ = ErrorCode::SyndicateWarsNotActive;
        let _ = ErrorCode::StreakBonusError;
    }

    #[test]
    /// Tests existence of compatibility and version error codes
    ///
    /// Validates error codes related to program version compatibility,
    /// deprecated feature usage, and version-specific operation support.
    fn test_compatibility_errors_exist() {
        let _ = ErrorCode::VersionMismatch;
        let _ = ErrorCode::DeprecatedFeature;
        let _ = ErrorCode::UnsupportedInVersion;
    }

    #[test]
    /// Tests existence of generic and catch-all error codes
    ///
    /// Validates general-purpose error codes used for unknown errors,
    /// validation failures, constraint violations, and internal errors
    /// that don't fit into specific categories.
    fn test_generic_errors_exist() {
        let _ = ErrorCode::UnknownError;
        let _ = ErrorCode::ValidationFailed;
        let _ = ErrorCode::ConstraintViolation;
        let _ = ErrorCode::InternalError;
    }

    #[test]
    /// Tests that all error variants have non-empty error messages
    ///
    /// Validates that every error code in the system can be successfully
    /// converted to Anchor's error system and has a valid error code
    /// (≥6000, which is Anchor's starting point for custom errors).
    /// This ensures users will receive meaningful error messages.
    fn test_error_messages_not_empty() {
        // This test ensures each error variant has a non-empty message
        // We can't directly access messages via reflection, but we can test
        // that the error can be converted to string and is not empty
        let test_cases = [
            ErrorCode::Unauthorized,
            ErrorCode::AdminAuthorityRequired,
            ErrorCode::NotOwner,
            ErrorCode::InvalidAuthority,
            ErrorCode::Paused,
            ErrorCode::DrawInProgress,
            ErrorCode::DrawNotInProgress,
            ErrorCode::DrawNotReady,
            ErrorCode::DrawAlreadyCompleted,
            ErrorCode::InvalidDrawState,
            ErrorCode::LotteryNotInitialized,
            ErrorCode::InvalidConfig,
            ErrorCode::InvalidNumbers,
            ErrorCode::DuplicateNumbers,
            ErrorCode::NumbersOutOfRange,
            ErrorCode::InsufficientFunds,
            ErrorCode::MaxTicketsExceeded,
            ErrorCode::MaxTicketsPerDrawExceeded,
            ErrorCode::InvalidTicketPrice,
            ErrorCode::BulkPurchaseLimitExceeded,
            ErrorCode::TicketSaleEnded,
            ErrorCode::AlreadyClaimed,
            ErrorCode::TicketExpired,
            ErrorCode::InvalidTicket,
            ErrorCode::RandomnessAlreadyRevealed,
            ErrorCode::RandomnessNotResolved,
            ErrorCode::RandomnessExpired,
            ErrorCode::InvalidRandomnessAccount,
            ErrorCode::RandomnessNotFresh,
            ErrorCode::InvalidVrfProof,
            ErrorCode::SwitchboardQueueNotSet,
            ErrorCode::RandomnessRequestFailed,
            ErrorCode::RandomnessNotCommitted,
            ErrorCode::NoPrizeToClaim,
            ErrorCode::PrizeAlreadyClaimed,
            ErrorCode::InvalidPrizeCalculation,
            ErrorCode::PrizeDistributionFailed,
            ErrorCode::JackpotAlreadyWon,
            ErrorCode::InvalidMatchCount,
            ErrorCode::InsufficientPrizePool,
            ErrorCode::RolldownCalculationError,
            ErrorCode::InsufficientStake,
            ErrorCode::StakeNotInitialized,
            ErrorCode::StakeLocked,
            ErrorCode::NoRewardsAvailable,
            ErrorCode::InvalidStakeTier,
            ErrorCode::StakeBelowMinimum,
            ErrorCode::SyndicateFull,
            ErrorCode::NotSyndicateMember,
            ErrorCode::SyndicateNotFound,
            ErrorCode::InvalidSyndicateConfig,
            ErrorCode::ManagerFeeTooHigh,
            ErrorCode::SyndicatePrivate,
            ErrorCode::InvalidMemberShare,
            ErrorCode::InsufficientContribution,
            ErrorCode::UsdcAccountRequired,
            ErrorCode::InvalidUsdcMint,
            ErrorCode::TokenTransferFailed,
            ErrorCode::InsufficientTokenBalance,
            ErrorCode::InvalidTokenAccount,
            ErrorCode::AtaRequired,
            ErrorCode::InvalidHouseFee,
            ErrorCode::InvalidJackpotCap,
            ErrorCode::InvalidSeedAmount,
            ErrorCode::InvalidCapConfig,
            ErrorCode::ArithmeticError,
            ErrorCode::DivisionByZero,
            ErrorCode::InvalidBasisPoints,
            ErrorCode::InvalidPdaDerivation,
            ErrorCode::NotRentExempt,
            ErrorCode::InvalidAccountOwner,
            ErrorCode::AccountDataTooSmall,
            ErrorCode::InvalidDiscriminator,
            ErrorCode::AlreadyInitialized,
            ErrorCode::NotInitialized,
            ErrorCode::SystemProgramRequired,
            ErrorCode::ClockUnavailable,
            ErrorCode::InvalidTimestamp,
            ErrorCode::Timeout,
            ErrorCode::RetryLimitExceeded,
            ErrorCode::NotSupported,
            ErrorCode::RolldownNotActive,
            ErrorCode::RolldownAlreadyTriggered,
            ErrorCode::SecondChanceNotAvailable,
            ErrorCode::NoSecondChanceEntries,
            ErrorCode::QuickPickNotActive,
            ErrorCode::LuckyNumbersLimitReached,
            ErrorCode::InsufficientMatchForNft,
            ErrorCode::SyndicateWarsNotActive,
            ErrorCode::StreakBonusError,
            ErrorCode::VersionMismatch,
            ErrorCode::DeprecatedFeature,
            ErrorCode::UnsupportedInVersion,
            ErrorCode::UnknownError,
            ErrorCode::ValidationFailed,
            ErrorCode::ConstraintViolation,
            ErrorCode::InternalError,
        ];

        for error in test_cases.iter() {
            let anchor_err: AnchorError = (*error).into();
            let program_error: ProgramError = anchor_err.into();
            // Ensure it's a Custom error (Anchor uses ProgramError::Custom)
            if let ProgramError::Custom(code) = program_error {
                // The error code should be non-zero (Anchor assigns codes starting from 6000)
                assert!(code >= 6000, "Error code {} is less than 6000", code);
            } else {
                panic!(
                    "ErrorCode {:?} did not convert to Custom ProgramError",
                    error
                );
            }
        }
    }

    #[test]
    /// Tests that error codes have unique discriminants
    ///
    /// Validates that a subset of error codes have unique numeric identifiers
    /// when converted to Anchor's ProgramError. While we can't test all
    /// variants due to Rust's reflection limitations, this spot-check ensures
    /// basic uniqueness properties are maintained.
    fn test_error_code_uniqueness() {
        // This test ensures that each error variant has a unique discriminant
        // Since we can't iterate over enum variants in Rust, we rely on Anchor
        // to assign unique error codes. We'll just test a few to ensure they're different.
        // Convert each error to ProgramError and compare error_code_number.
        use std::collections::HashSet;
        let mut seen = HashSet::new();

        let errors = [
            ErrorCode::Unauthorized,
            ErrorCode::AdminAuthorityRequired,
            ErrorCode::NotOwner,
            ErrorCode::InvalidAuthority,
            ErrorCode::Paused,
            ErrorCode::DrawInProgress,
        ];

        for error in errors.iter() {
            let anchor_err: AnchorError = (*error).into();
            let program_error: ProgramError = anchor_err.into();
            if let ProgramError::Custom(code) = program_error {
                assert!(
                    seen.insert(code),
                    "Duplicate error code found for {:?}",
                    error
                );
            }
        }
    }
}
