//! MazeProtocol Integration Tests
//!
//! These tests validate the core lottery logic using the actual program types
//! and helper functions from the constants and state modules. They exercise:
//!
//! - Number validation (6/46 matrix)
//! - Dynamic fee calculation across all tiers
//! - Ticket sale window logic
//! - Rolldown probability calculation
//! - Match count calculation
//! - Draw state transitions
//! - Winner count validation
//! - Account size consistency
//! - Constant sanity checks (no silent drift)
//!
//! Run with: `cargo test-bpf` or `anchor test`

#[cfg(test)]
mod test_lottery_constants {
    use mazelprotocol::constants::*;

    // =========================================================================
    // NUMBER VALIDATION TESTS
    // =========================================================================

    #[test]
    fn test_validate_lottery_numbers_valid() {
        let numbers = [1, 10, 20, 30, 40, 46];
        assert!(validate_lottery_numbers(&numbers));
    }

    #[test]
    fn test_validate_lottery_numbers_sorted() {
        let numbers = [1, 2, 3, 4, 5, 6];
        assert!(validate_lottery_numbers(&numbers));
    }

    #[test]
    fn test_validate_lottery_numbers_unsorted() {
        // Unsorted-but-unique numbers are valid — the program sorts at buy time
        // (see buy_ticket.rs). The `validate_lottery_numbers` helper checks
        // range + uniqueness only; sorting is handled by the caller.
        let numbers = [6, 5, 4, 3, 2, 1];
        assert!(validate_lottery_numbers(&numbers));
    }

    #[test]
    fn test_validate_lottery_numbers_out_of_range_zero() {
        let numbers = [0, 10, 20, 30, 40, 46];
        assert!(!validate_lottery_numbers(&numbers));
    }

    #[test]
    fn test_validate_lottery_numbers_out_of_range_high() {
        let numbers = [1, 10, 20, 30, 40, 47];
        assert!(!validate_lottery_numbers(&numbers));
    }

    #[test]
    fn test_validate_lottery_numbers_duplicates() {
        let numbers = [1, 10, 10, 30, 40, 46];
        assert!(!validate_lottery_numbers(&numbers));
    }

    #[test]
    fn test_validate_lottery_numbers_all_front() {
        let numbers = [1, 2, 3, 4, 5, 6];
        assert!(validate_lottery_numbers(&numbers));
    }

    #[test]
    fn test_validate_lottery_numbers_all_back() {
        let numbers = [41, 42, 43, 44, 45, 46];
        assert!(validate_lottery_numbers(&numbers));
    }

    // =========================================================================
    // DYNAMIC FEE CALCULATION TESTS
    // =========================================================================

    #[test]
    fn test_calculate_house_fee_bps_rolldown() {
        // Rolldown should always return 28%
        assert_eq!(calculate_house_fee_bps(0, true), FEE_ROLLDOWN_BPS);
        assert_eq!(calculate_house_fee_bps(2_000_000_000_000, true), FEE_ROLLDOWN_BPS);
    }

    #[test]
    fn test_calculate_house_fee_bps_tier_1() {
        // Tier 1: jackpot < $500k => 28%
        assert_eq!(calculate_house_fee_bps(0, false), FEE_TIER_1_BPS);
        assert_eq!(calculate_house_fee_bps(499_999_999_999, false), FEE_TIER_1_BPS);
    }

    #[test]
    fn test_calculate_house_fee_bps_tier_2() {
        // Tier 2: $500k <= jackpot < $1M => 32%
        assert_eq!(calculate_house_fee_bps(500_000_000_000, false), FEE_TIER_2_BPS);
        assert_eq!(calculate_house_fee_bps(999_999_999_999, false), FEE_TIER_2_BPS);
    }

    #[test]
    fn test_calculate_house_fee_bps_tier_3() {
        // Tier 3: $1M <= jackpot < $1.5M => 36%
        assert_eq!(calculate_house_fee_bps(1_000_000_000_000, false), FEE_TIER_3_BPS);
        assert_eq!(calculate_house_fee_bps(1_499_999_999_999, false), FEE_TIER_3_BPS);
    }

    #[test]
    fn test_calculate_house_fee_bps_tier_4() {
        // Tier 4: jackpot >= $1.5M => 40%
        assert_eq!(calculate_house_fee_bps(1_500_000_000_000, false), FEE_TIER_4_BPS);
        assert_eq!(calculate_house_fee_bps(3_000_000_000_000, false), FEE_TIER_4_BPS);
    }

    // =========================================================================
    // ROLLDOWN PROBABILITY TESTS
    // =========================================================================

    #[test]
    fn test_calculate_rolldown_probability_below_soft_cap() {
        // Below soft cap => 0% probability
        assert_eq!(calculate_rolldown_probability_bps(0), 0);
        assert_eq!(calculate_rolldown_probability_bps(SOFT_CAP.saturating_sub(1)), 0);
    }

    #[test]
    fn test_calculate_rolldown_probability_at_hard_cap() {
        // At hard cap => 100% probability
        assert_eq!(calculate_rolldown_probability_bps(HARD_CAP), BPS_DENOMINATOR as u16);
        assert_eq!(
            calculate_rolldown_probability_bps(HARD_CAP + 100_000_000_000),
            BPS_DENOMINATOR as u16
        );
    }

    #[test]
    fn test_calculate_rolldown_probability_midway() {
        // At 50% between soft and hard cap => ~50% probability
        let halfway = SOFT_CAP + (HARD_CAP - SOFT_CAP) / 2;
        let prob = calculate_rolldown_probability_bps(halfway);
        // Should be approximately 5000 (50%) with some rounding
        assert!(prob >= 4900 && prob <= 5100);
    }

    #[test]
    fn test_calculate_rolldown_probability_monotonic() {
        // Probability should increase as jackpot increases
        let p1 = calculate_rolldown_probability_bps(SOFT_CAP + 1);
        let p2 = calculate_rolldown_probability_bps(SOFT_CAP + 100_000_000_000);
        assert!(p2 >= p1);
    }

    // =========================================================================
    // MATCH COUNT TESTS
    // =========================================================================

    #[test]
    fn test_calculate_match_count_full_match() {
        let ticket = [1, 2, 3, 4, 5, 6];
        let winning = [1, 2, 3, 4, 5, 6];
        assert_eq!(calculate_match_count(&ticket, &winning), 6);
    }

    #[test]
    fn test_calculate_match_count_no_match() {
        let ticket = [1, 2, 3, 4, 5, 6];
        let winning = [7, 8, 9, 10, 11, 12];
        assert_eq!(calculate_match_count(&ticket, &winning), 0);
    }

    #[test]
    fn test_calculate_match_count_partial() {
        let ticket = [1, 2, 3, 4, 5, 6];
        let winning = [1, 2, 3, 10, 20, 30];
        assert_eq!(calculate_match_count(&ticket, &winning), 3);
    }

    #[test]
    fn test_calculate_match_count_interleaved() {
        let ticket = [1, 3, 5, 7, 9, 11];
        let winning = [2, 4, 6, 8, 10, 12];
        assert_eq!(calculate_match_count(&ticket, &winning), 0);
    }

    #[test]
    fn test_calculate_match_count_empty() {
        let ticket = [];
        let winning = [1, 2, 3, 4, 5, 6];
        assert_eq!(calculate_match_count(&ticket, &winning), 0);
    }

    // =========================================================================
    // CONSTANT SANITY CHECKS
    // =========================================================================

    #[test]
    fn test_constants_invariants() {
        // Soft cap must be less than hard cap
        assert!(SOFT_CAP < HARD_CAP);
        // Seed amount must be less than soft cap
        assert!(SEED_AMOUNT < SOFT_CAP);
        // Fee tiers must be in increasing order
        assert!(FEE_TIER_1_THRESHOLD < FEE_TIER_2_THRESHOLD);
        assert!(FEE_TIER_2_THRESHOLD < FEE_TIER_3_THRESHOLD);
        // Fee percentages must be in increasing order
        assert!(FEE_TIER_1_BPS <= FEE_TIER_2_BPS);
        assert!(FEE_TIER_2_BPS <= FEE_TIER_3_BPS);
        assert!(FEE_TIER_3_BPS <= FEE_TIER_4_BPS);
        // Rolldown allocation must sum to 100%
        assert_eq!(
            ROLLDOWN_MATCH_5_BPS + ROLLDOWN_MATCH_4_BPS + ROLLDOWN_MATCH_3_BPS,
            BPS_DENOMINATOR as u16
        );
        // Revenue allocation must sum to 100%
        assert_eq!(
            JACKPOT_ALLOCATION_BPS
                + FIXED_PRIZE_ALLOCATION_BPS
                + RESERVE_ALLOCATION_BPS
                + INSURANCE_ALLOCATION_BPS,
            BPS_DENOMINATOR as u16
        );
        // Ticket claim expiration must be > 0 (otherwise reclaim breaks)
        assert!(TICKET_CLAIM_EXPIRATION > 0);
        // Reclaim buffer must be positive
        assert!(RECLAIM_BUFFER > 0);
        // Draw interval must be positive
        assert!(DRAW_INTERVAL > 0);
        // Ticket sale cutoff must be less than draw interval
        assert!(TICKET_SALE_CUTOFF < DRAW_INTERVAL);
    }

    #[test]
    fn test_prize_constants_sanity() {
        // Match 5 prize must be greater than Match 4
        assert!(MATCH_5_PRIZE > MATCH_4_PRIZE);
        // Match 4 prize must be greater than Match 3
        assert!(MATCH_4_PRIZE > MATCH_3_PRIZE);
        // Match 3 prize must be greater than 0
        assert!(MATCH_3_PRIZE > 0);
    }

    #[test]
    fn test_ticket_price_and_numbers_range() {
        // Ticket price must be > 0
        assert!(TICKET_PRICE > 0);
        // Must pick between 1 and MAX_NUMBER numbers
        assert!(NUMBERS_PER_TICKET > 0 && NUMBERS_PER_TICKET <= MAX_NUMBER as usize);
        // Minimum number must be 1
        assert_eq!(MIN_NUMBER, 1);
    }

    // =========================================================================
    // CROSS-PROGRAM CONSTANT VERIFICATION
    // =========================================================================

    #[test]
    fn test_quick_pick_constants_consistency() {
        // Verify that the Quick Pick constants defined in this crate
        // match what the quickpick program uses. This prevents silent drift.
        //
        // These values should match quickpick::constants
        assert_eq!(QUICK_PICK_TICKET_PRICE, 1_500_000); // $1.50
        assert_eq!(QUICK_PICK_NUMBERS, 5);
        assert_eq!(QUICK_PICK_RANGE, 35);
        assert_eq!(QUICK_PICK_INTERVAL, 14400); // 4 hours
        assert_eq!(QUICK_PICK_SEED_AMOUNT, 5_000_000_000); // $5,000
        assert_eq!(QUICK_PICK_SOFT_CAP, 30_000_000_000); // $30,000
        assert_eq!(QUICK_PICK_HARD_CAP, 50_000_000_000); // $50,000
        assert_eq!(QUICK_PICK_MATCH_4_PRIZE, 100_000_000); // $100
        assert_eq!(QUICK_PICK_MATCH_3_PRIZE, 4_000_000); // $4
        assert_eq!(QUICK_PICK_ROLLDOWN_MATCH_4_BPS, 6000); // 60%
        assert_eq!(QUICK_PICK_ROLLDOWN_MATCH_3_BPS, 4000); // 40%

        // Rolldown allocation sums to 100%
        assert_eq!(
            QUICK_PICK_ROLLDOWN_MATCH_4_BPS + QUICK_PICK_ROLLDOWN_MATCH_3_BPS,
            BPS_DENOMINATOR as u16
        );
    }
}

#[cfg(test)]
mod test_lottery_state {
    use mazelprotocol::constants::*;
    use mazelprotocol::state::LotteryState;

    fn create_test_state() -> LotteryState {
        LotteryState {
            authority: anchor_lang::prelude::Pubkey::new_unique(),
            pending_authority: None,
            switchboard_queue: anchor_lang::prelude::Pubkey::new_unique(),
            current_randomness_account: anchor_lang::prelude::Pubkey::new_unique(),
            current_draw_id: 1,
            jackpot_balance: SEED_AMOUNT,
            reserve_balance: 0,
            insurance_balance: 0,
            fixed_prize_balance: 0,
            ticket_price: TICKET_PRICE,
            house_fee_bps: FEE_TIER_1_BPS,
            jackpot_cap: JACKPOT_CAP,
            seed_amount: SEED_AMOUNT,
            soft_cap: SOFT_CAP,
            hard_cap: HARD_CAP,
            next_draw_timestamp: 1_000_000,
            draw_interval: DRAW_INTERVAL,
            commit_slot: 0,
            commit_timestamp: 0,
            current_draw_tickets: 0,
            total_tickets_sold: 0,
            total_prizes_paid: 0,
            total_prizes_committed: 0,
            is_draw_in_progress: false,
            is_rolldown_active: false,
            is_awaiting_finalization: false,
            is_paused: false,
            is_funded: true,
            version: 1,
            bump: 0,
            config_timelock_end: 0,
            pending_config_hash: [0u8; 32],
            emergency_transfer_total: 0,
            emergency_transfer_window_start: 0,
            max_rolldown_tickets: 0,
            sale_target_tickets: 0,
        }
    }

    // =========================================================================
    // TICKET SALE WINDOW TESTS
    // =========================================================================

    #[test]
    fn test_is_ticket_sale_open_before_cutoff() {
        let state = LotteryState { next_draw_timestamp: 2_000_000, ..create_test_state() };

        // 1 hour before draw cutoff
        let sale_open = state.is_ticket_sale_open(2_000_000 - TICKET_SALE_CUTOFF - 1);
        assert!(sale_open);
    }

    #[test]
    fn test_is_ticket_sale_open_after_cutoff() {
        let state = LotteryState { next_draw_timestamp: 2_000_000, ..create_test_state() };

        // At the cutoff time
        let sale_closed = state.is_ticket_sale_open(2_000_000 - TICKET_SALE_CUTOFF);
        assert!(!sale_closed);
    }

    #[test]
    fn test_is_ticket_sale_open_when_paused() {
        let state = LotteryState { is_paused: true, ..create_test_state() };

        assert!(!state.is_ticket_sale_open(1_000_000));
    }

    #[test]
    fn test_is_ticket_sale_open_when_not_funded() {
        let state = LotteryState { is_funded: false, ..create_test_state() };

        assert!(!state.is_ticket_sale_open(1_000_000));
    }

    #[test]
    fn test_is_ticket_sale_open_when_draw_in_progress() {
        let state = LotteryState { is_draw_in_progress: true, ..create_test_state() };

        assert!(!state.is_ticket_sale_open(1_000_000));
    }

    // =========================================================================
    // ROLLDOWN TRIGGER TESTS
    // =========================================================================

    #[test]
    fn test_should_trigger_rolldown_below_hard_cap() {
        let state =
            LotteryState { jackpot_balance: HARD_CAP.saturating_sub(1), ..create_test_state() };

        assert!(!state.should_trigger_rolldown());
    }

    #[test]
    fn test_should_trigger_rolldown_at_hard_cap() {
        let state = LotteryState { jackpot_balance: HARD_CAP, ..create_test_state() };

        assert!(state.should_trigger_rolldown());
    }

    #[test]
    fn test_should_trigger_rolldown_above_hard_cap() {
        let state =
            LotteryState { jackpot_balance: HARD_CAP + 100_000_000_000, ..create_test_state() };

        assert!(state.should_trigger_rolldown());
    }

    #[test]
    fn test_should_trigger_rolldown_invalid_caps() {
        let state = LotteryState {
            soft_cap: HARD_CAP + 1, // Invalid: soft > hard
            hard_cap: HARD_CAP,
            ..create_test_state()
        };

        assert!(!state.should_trigger_rolldown());
    }

    // =========================================================================
    // COMMIT TIMEOUT TESTS
    // =========================================================================

    #[test]
    fn test_is_commit_timed_out_not_timed_out() {
        let state = LotteryState {
            is_draw_in_progress: true,
            commit_timestamp: 1_000_000,
            ..create_test_state()
        };

        assert!(!state.is_commit_timed_out(1_000_000 + DRAW_COMMIT_TIMEOUT - 1));
    }

    #[test]
    fn test_is_commit_timed_out_exactly_at_timeout() {
        let state = LotteryState {
            is_draw_in_progress: true,
            commit_timestamp: 1_000_000,
            ..create_test_state()
        };

        // Strictly greater than commit + timeout => timed out
        assert!(state.is_commit_timed_out(1_000_000 + DRAW_COMMIT_TIMEOUT + 1));
    }

    #[test]
    fn test_is_commit_timed_out_zero_timestamp() {
        let state =
            LotteryState { is_draw_in_progress: true, commit_timestamp: 0, ..create_test_state() };

        // No commit => not timed out
        assert!(!state.is_commit_timed_out(1_000_000));
    }

    // =========================================================================
    // SAFETY BUFFER TESTS
    // =========================================================================

    #[test]
    fn test_get_safety_buffer() {
        let state = LotteryState {
            reserve_balance: 100_000_000_000,
            insurance_balance: 50_000_000_000,
            ..create_test_state()
        };

        assert_eq!(state.get_safety_buffer(), 150_000_000_000);
    }

    #[test]
    fn test_get_safety_buffer_zero() {
        let state =
            LotteryState { reserve_balance: 0, insurance_balance: 0, ..create_test_state() };

        assert_eq!(state.get_safety_buffer(), 0);
    }

    // =========================================================================
    // PRIZE POOL SOLVENCY TESTS
    // =========================================================================

    #[test]
    fn test_check_solvency_detailed_solvent() {
        let state = LotteryState {
            jackpot_balance: 100_000_000_000,
            fixed_prize_balance: 50_000_000_000,
            reserve_balance: 100_000_000_000,
            total_prizes_committed: 50_000_000_000,
            ..create_test_state()
        };

        // check_solvency_detailed takes (required_fixed_prizes, jackpot_to_distribute)
        // With 100M jackpot + 50M fixed + 100M reserve, 50M required is easily covered
        let (solvent, _shortfall, _uses_insurance) =
            state.check_solvency_detailed(50_000_000_000, 0);
        assert!(solvent);
    }

    #[test]
    fn test_check_solvency_detailed_insolvent() {
        let state = LotteryState {
            jackpot_balance: 10_000_000_000,
            fixed_prize_balance: 0,
            reserve_balance: 0,
            insurance_balance: 0,
            ..create_test_state()
        };

        // Requiring 500M with only 10M available => insolvent
        let (solvent, shortfall, uses_insurance) =
            state.check_solvency_detailed(500_000_000_000, 0);
        assert!(!solvent);
        assert!(shortfall > 0);
        assert!(!uses_insurance);
    }

    // =========================================================================
    // ACCOUNT SIZE CONSISTENCY
    // =========================================================================

    #[test]
    fn test_lottery_state_len_matches_constant() {
        // LotteryState::LEN should match the manually-computed LOTTERY_STATE_SIZE
        assert_eq!(LotteryState::LEN, LOTTERY_STATE_SIZE);
    }

    #[test]
    fn test_lottery_state_len_is_reasonable() {
        // Account size should be within Solana's 10KB limit for non-rent-exempt
        assert!(LotteryState::LEN <= 10 * 1024);
        // And at least 200 bytes for all the fields
        assert!(LotteryState::LEN >= 200);
    }

    #[test]
    fn test_lottery_state_len_matches_serialized_size() {
        // Robust check against the hand-computed LEN constant: serialize a
        // default instance and ensure the declared account size is large
        // enough for the actual Borsh layout (+ 8-byte discriminator).
        // Catches silent breaks when a field is added without updating LEN.
        use anchor_lang::AnchorSerialize;
        let state = LotteryState::default();
        let bytes = state.try_to_vec().expect("serialize lottery state");
        let required = bytes.len() + 8; // discriminator
        assert!(
            LotteryState::LEN >= required,
            "LotteryState::LEN ({}) too small for serialized layout ({}) — add a field without updating LEN?",
            LotteryState::LEN,
            required
        );
    }
}

#[cfg(test)]
mod test_draw_result {
    use mazelprotocol::constants::*;
    use mazelprotocol::state::DrawResult;
    use mazelprotocol::state::WinnerCounts;

    fn create_test_draw_result() -> DrawResult {
        DrawResult {
            draw_id: 1,
            winning_numbers: [1, 10, 20, 30, 40, 46],
            randomness_proof: [0u8; 32],
            timestamp: 1_000_000,
            total_tickets: 1000,
            was_rolldown: false,
            match_6_winners: 0,
            match_5_winners: 0,
            match_4_winners: 10,
            match_3_winners: 100,
            match_2_winners: 500,
            match_6_prize_per_winner: 0,
            match_5_prize_per_winner: 0,
            match_4_prize_per_winner: MATCH_4_PRIZE,
            match_3_prize_per_winner: MATCH_3_PRIZE,
            match_2_prize_per_winner: MATCH_2_VALUE,
            is_explicitly_finalized: true,
            bump: 0,
            total_committed: 0,
            total_reclaimed: 0,
            streak_bonus_pool: 0,
            total_streak_bonus_paid: 0,
            challenged: false,
        }
    }

    #[test]
    fn test_is_finalized_explicit_flag() {
        let result = create_test_draw_result();
        assert!(result.is_finalized());
    }

    #[test]
    fn test_is_finalized_not_finalized() {
        let result = DrawResult {
            is_explicitly_finalized: false,
            match_4_prize_per_winner: 0,
            match_3_prize_per_winner: 0,
            match_2_prize_per_winner: 0,
            ..create_test_draw_result()
        };

        // Neither flag nor prizes set => not finalized
        assert!(!result.is_finalized());
    }

    #[test]
    fn test_get_total_prizes() {
        let result = create_test_draw_result();

        // 10 * $150 + 100 * $5 + 500 * $2.50
        // = $1,500 + $500 + $1,250 = $3,250
        let expected = (10 * MATCH_4_PRIZE) + (100 * MATCH_3_PRIZE) + (500 * MATCH_2_VALUE);
        assert_eq!(result.get_total_prizes(), expected);
    }

    #[test]
    fn test_get_reclaimable_amount() {
        let result = DrawResult {
            total_committed: 10_000_000_000,
            total_reclaimed: 3_000_000_000,
            ..create_test_draw_result()
        };

        assert_eq!(result.get_reclaimable_amount(), 7_000_000_000);
    }

    #[test]
    fn test_get_reclaimable_amount_none() {
        let result = DrawResult {
            total_committed: 10_000_000_000,
            total_reclaimed: 10_000_000_000,
            ..create_test_draw_result()
        };

        assert_eq!(result.get_reclaimable_amount(), 0);
    }

    #[test]
    fn test_get_prize_for_matches() {
        let result = create_test_draw_result();

        assert_eq!(result.get_prize_for_matches(4), MATCH_4_PRIZE);
        assert_eq!(result.get_prize_for_matches(3), MATCH_3_PRIZE);
        assert_eq!(result.get_prize_for_matches(2), MATCH_2_VALUE);
        assert_eq!(result.get_prize_for_matches(1), 0);
        assert_eq!(result.get_prize_for_matches(0), 0);
        assert_eq!(result.get_prize_for_matches(6), result.match_6_prize_per_winner);
    }

    // =========================================================================
    // STREAK BONUS (L-7)
    // =========================================================================

    #[test]
    fn test_get_remaining_streak_bonus_full_pool() {
        let result = DrawResult {
            streak_bonus_pool: 1_000_000,
            total_streak_bonus_paid: 0,
            ..create_test_draw_result()
        };
        assert_eq!(result.get_remaining_streak_bonus(), 1_000_000);
    }

    #[test]
    fn test_get_remaining_streak_bonus_partially_paid() {
        let result = DrawResult {
            streak_bonus_pool: 1_000_000,
            total_streak_bonus_paid: 400_000,
            ..create_test_draw_result()
        };
        assert_eq!(result.get_remaining_streak_bonus(), 600_000);
    }

    #[test]
    fn test_get_remaining_streak_bonus_saturates_at_zero() {
        // Defensive: if paid ever exceeded the pool (shouldn't happen), the
        // remainder must saturate to zero rather than underflow.
        let result = DrawResult {
            streak_bonus_pool: 1_000_000,
            total_streak_bonus_paid: 1_500_000,
            ..create_test_draw_result()
        };
        assert_eq!(result.get_remaining_streak_bonus(), 0);
    }

    // =========================================================================
    // WINNER COUNTS VALIDATION
    // =========================================================================

    #[test]
    fn test_winner_counts_validate_valid() {
        let counts =
            WinnerCounts { match_6: 0, match_5: 1, match_4: 10, match_3: 100, match_2: 500 };

        // Total: 611 winners, 1000 tickets => valid
        assert!(counts.validate(1000));
    }

    #[test]
    fn test_winner_counts_validate_exceeds() {
        let counts = WinnerCounts { match_6: 0, match_5: 0, match_4: 0, match_3: 0, match_2: 1001 };

        // 1001 winners, 1000 tickets => invalid
        assert!(!counts.validate(1000));
    }

    #[test]
    fn test_winner_counts_total() {
        let counts =
            WinnerCounts { match_6: 0, match_5: 2, match_4: 5, match_3: 100, match_2: 1000 };

        assert_eq!(counts.total(), 1107);
    }
}

#[cfg(test)]
mod test_edge_cases {
    use mazelprotocol::constants::*;

    #[test]
    fn test_reclaim_buffer_greater_than_finalization_delay() {
        // The reclaim buffer (24h) must be >> finalization delay (2 min)
        // to prevent race conditions between legitimate claims and reclaims
        assert!(RECLAIM_BUFFER > FINALIZATION_DELAY);
    }

    #[test]
    fn test_emergency_transfer_cap_is_reasonable() {
        // Emergency transfer daily cap should be < 50% of hard cap
        assert!(EMERGENCY_TRANSFER_DAILY_CAP_BPS < 5000);
        // And greater than 0
        assert!(EMERGENCY_TRANSFER_DAILY_CAP_BPS > 0);
    }

    #[test]
    fn test_config_timelock_is_reasonable() {
        // Config timelock should be at least 24 hours
        assert!(CONFIG_TIMELOCK_DELAY >= 86400);
        // And at most 7 days (to allow reasonable governance)
        assert!(CONFIG_TIMELOCK_DELAY <= 7 * 86400);
    }

    #[test]
    fn test_draw_advancement_timeout_reasonable() {
        // Timeout should be at least 5 minutes to give operator a chance
        assert!(DRAW_ADVANCEMENT_TIMEOUT >= 300);
        // And at most 2 hours to prevent excessive delays
        assert!(DRAW_ADVANCEMENT_TIMEOUT <= 7200);
    }
}
