#[cfg(test)]
mod tests {
    use mazelprotocol::constants::*;

    #[test]
    fn test_calculate_house_fee_bps() {
        // Test below tier 1 threshold (< $500k)
        assert_eq!(
            calculate_house_fee_bps(400_000_000_000, false),
            FEE_TIER_1_BPS
        );

        // Test at tier 2 threshold ($500k - $1M)
        assert_eq!(
            calculate_house_fee_bps(600_000_000_000, false),
            FEE_TIER_2_BPS
        );

        // Test at tier 3 threshold ($1M - $1.5M)
        assert_eq!(
            calculate_house_fee_bps(1_200_000_000_000, false),
            FEE_TIER_3_BPS
        );

        // Test above tier 3 threshold (> $1.5M)
        assert_eq!(
            calculate_house_fee_bps(1_800_000_000_000, false),
            FEE_TIER_4_BPS
        );

        // Test rolldown override (should return rolldown fee regardless of jackpot)
        assert_eq!(
            calculate_house_fee_bps(400_000_000_000, true),
            FEE_ROLLDOWN_BPS
        );
        assert_eq!(
            calculate_house_fee_bps(1_800_000_000_000, true),
            FEE_ROLLDOWN_BPS
        );

        // Test edge cases
        assert_eq!(
            calculate_house_fee_bps(FEE_TIER_1_THRESHOLD - 1, false),
            FEE_TIER_1_BPS
        );
        assert_eq!(
            calculate_house_fee_bps(FEE_TIER_1_THRESHOLD, false),
            FEE_TIER_2_BPS
        );
        assert_eq!(
            calculate_house_fee_bps(FEE_TIER_2_THRESHOLD, false),
            FEE_TIER_3_BPS
        );
        assert_eq!(
            calculate_house_fee_bps(FEE_TIER_3_THRESHOLD, false),
            FEE_TIER_4_BPS
        );
    }

    #[test]
    fn test_should_probabilistic_rolldown() {
        // Test below soft cap - should never rolldown
        assert!(!should_probabilistic_rolldown(SOFT_CAP - 1, 0));
        assert!(!should_probabilistic_rolldown(SOFT_CAP - 1, 9999));

        // Test at or above hard cap - should always rolldown
        assert!(should_probabilistic_rolldown(HARD_CAP, 0));
        assert!(should_probabilistic_rolldown(HARD_CAP, 9999));
        assert!(should_probabilistic_rolldown(HARD_CAP + 1, 0));

        // Test between soft and hard cap - depends on random value
        let mid_point = SOFT_CAP + (HARD_CAP - SOFT_CAP) / 2;

        // With probability 50% at midpoint, test boundary
        let probability_bps = ((mid_point - SOFT_CAP) as u128 * BPS_PER_100_PERCENT as u128
            / (HARD_CAP - SOFT_CAP) as u128) as u64;

        // random_value < probability_bps should return true
        assert!(should_probabilistic_rolldown(
            mid_point,
            probability_bps - 1
        ));
        // random_value >= probability_bps should return false
        assert!(!should_probabilistic_rolldown(mid_point, probability_bps));

        // Test edge at soft cap (0% probability)
        assert!(!should_probabilistic_rolldown(SOFT_CAP, 0));
        assert!(!should_probabilistic_rolldown(SOFT_CAP, 9999));

        // Test just below hard cap (near 100% probability)
        let near_hard_cap = HARD_CAP - 1;
        let near_probability = ((near_hard_cap - SOFT_CAP) as u128 * BPS_PER_100_PERCENT as u128
            / (HARD_CAP - SOFT_CAP) as u128) as u64;
        // Should be very high probability, test with high random value
        assert!(should_probabilistic_rolldown(
            near_hard_cap,
            near_probability - 1
        ));
    }

    #[test]
    fn test_validate_lottery_numbers() {
        // Test valid numbers
        let valid_numbers = [1, 2, 3, 4, 5, 6];
        assert!(validate_lottery_numbers(&valid_numbers));

        // Test with numbers in different order (should still be valid)
        let unsorted_numbers = [6, 5, 4, 3, 2, 1];
        assert!(validate_lottery_numbers(&unsorted_numbers));

        // Test duplicate numbers
        let duplicate_numbers = [1, 1, 2, 3, 4, 5];
        assert!(!validate_lottery_numbers(&duplicate_numbers));

        // Test out of range (below min)
        let below_min = [0, 2, 3, 4, 5, 6];
        assert!(!validate_lottery_numbers(&below_min));

        // Test out of range (above max)
        let above_max = [1, 2, 3, 4, 5, MAX_NUMBER + 1];
        assert!(!validate_lottery_numbers(&above_max));

        // Note: Cannot test wrong number of numbers because function expects exactly NUMBERS_PER_TICKET
        // Compile-time type checking ensures correct array size

        // Test valid boundary numbers
        let boundary_numbers = [MIN_NUMBER, MAX_NUMBER, 2, 3, 4, 5];
        assert!(validate_lottery_numbers(&boundary_numbers));
    }

    #[test]
    fn test_calculate_match_count() {
        // Test perfect match
        let winning = [1, 2, 3, 4, 5, 6];
        let ticket = [1, 2, 3, 4, 5, 6];
        assert_eq!(calculate_match_count(&ticket, &winning), 6);

        // Test 5 matches
        let ticket_5 = [1, 2, 3, 4, 5, 7];
        assert_eq!(calculate_match_count(&ticket_5, &winning), 5);

        // Test 4 matches
        let ticket_4 = [1, 2, 3, 4, 7, 8];
        assert_eq!(calculate_match_count(&ticket_4, &winning), 4);

        // Test 3 matches
        let ticket_3 = [1, 2, 3, 7, 8, 9];
        assert_eq!(calculate_match_count(&ticket_3, &winning), 3);

        // Test 2 matches
        let ticket_2 = [1, 2, 7, 8, 9, 10];
        assert_eq!(calculate_match_count(&ticket_2, &winning), 2);

        // Test 1 match
        let ticket_1 = [1, 7, 8, 9, 10, 11];
        assert_eq!(calculate_match_count(&ticket_1, &winning), 1);

        // Test 0 matches
        let ticket_0 = [7, 8, 9, 10, 11, 12];
        assert_eq!(calculate_match_count(&ticket_0, &winning), 0);

        // Test with unsorted arrays (should still work)
        let unsorted_winning = [6, 5, 4, 3, 2, 1];
        let unsorted_ticket = [1, 3, 5, 7, 9, 11];
        assert_eq!(
            calculate_match_count(&unsorted_ticket, &unsorted_winning),
            3
        ); // 1, 3, 5 match
    }

    #[test]
    fn test_get_stake_tier() {
        // Test Bronze tier
        assert_eq!(get_stake_tier(BRONZE_THRESHOLD), StakeTier::Bronze);
        assert_eq!(get_stake_tier(BRONZE_THRESHOLD + 1), StakeTier::Bronze);

        // Test Silver tier
        assert_eq!(get_stake_tier(SILVER_THRESHOLD), StakeTier::Silver);
        assert_eq!(get_stake_tier(SILVER_THRESHOLD + 1), StakeTier::Silver);

        // Test Gold tier
        assert_eq!(get_stake_tier(GOLD_THRESHOLD), StakeTier::Gold);
        assert_eq!(get_stake_tier(GOLD_THRESHOLD + 1), StakeTier::Gold);

        // Test Diamond tier
        assert_eq!(get_stake_tier(DIAMOND_THRESHOLD), StakeTier::Diamond);
        assert_eq!(
            get_stake_tier(DIAMOND_THRESHOLD + 1_000_000_000),
            StakeTier::Diamond
        );

        // Test below Bronze threshold
        assert_eq!(get_stake_tier(BRONZE_THRESHOLD - 1), StakeTier::None);
        assert_eq!(get_stake_tier(0), StakeTier::None);

        // Test boundary values
        assert_eq!(get_stake_tier(BRONZE_THRESHOLD - 1), StakeTier::None);
        assert_eq!(get_stake_tier(BRONZE_THRESHOLD), StakeTier::Bronze);
        assert_eq!(get_stake_tier(SILVER_THRESHOLD - 1), StakeTier::Bronze);
        assert_eq!(get_stake_tier(SILVER_THRESHOLD), StakeTier::Silver);
        assert_eq!(get_stake_tier(GOLD_THRESHOLD - 1), StakeTier::Silver);
        assert_eq!(get_stake_tier(GOLD_THRESHOLD), StakeTier::Gold);
        assert_eq!(get_stake_tier(DIAMOND_THRESHOLD - 1), StakeTier::Gold);
        assert_eq!(get_stake_tier(DIAMOND_THRESHOLD), StakeTier::Diamond);
    }

    #[test]
    fn test_calculate_stake_discount_bps() {
        // Test None tier
        assert_eq!(calculate_stake_discount_bps(get_stake_tier(0)), 0);
        assert_eq!(
            calculate_stake_discount_bps(get_stake_tier(BRONZE_THRESHOLD - 1)),
            0
        );

        // Test Bronze tier
        assert_eq!(
            calculate_stake_discount_bps(get_stake_tier(BRONZE_THRESHOLD)),
            StakeTier::Bronze.get_discount_bps()
        );

        // Test Silver tier
        assert_eq!(
            calculate_stake_discount_bps(get_stake_tier(SILVER_THRESHOLD)),
            StakeTier::Silver.get_discount_bps()
        );

        // Test Gold tier
        assert_eq!(
            calculate_stake_discount_bps(get_stake_tier(GOLD_THRESHOLD)),
            StakeTier::Gold.get_discount_bps()
        );

        // Test Diamond tier
        assert_eq!(
            calculate_stake_discount_bps(get_stake_tier(DIAMOND_THRESHOLD)),
            StakeTier::Diamond.get_discount_bps()
        );

        // Test values between tiers
        assert_eq!(
            calculate_stake_discount_bps(get_stake_tier((BRONZE_THRESHOLD + SILVER_THRESHOLD) / 2)),
            StakeTier::Bronze.get_discount_bps()
        );
        assert_eq!(
            calculate_stake_discount_bps(get_stake_tier((SILVER_THRESHOLD + GOLD_THRESHOLD) / 2)),
            StakeTier::Silver.get_discount_bps()
        );
        assert_eq!(
            calculate_stake_discount_bps(get_stake_tier((GOLD_THRESHOLD + DIAMOND_THRESHOLD) / 2)),
            StakeTier::Gold.get_discount_bps()
        );
    }

    #[test]
    fn test_stake_tier_methods() {
        // Test reward rates
        assert_eq!(StakeTier::None.get_reward_rate_bps(), 0);
        assert_eq!(StakeTier::Bronze.get_reward_rate_bps(), BRONZE_REWARD_BPS);
        assert_eq!(StakeTier::Silver.get_reward_rate_bps(), SILVER_REWARD_BPS);
        assert_eq!(StakeTier::Gold.get_reward_rate_bps(), GOLD_REWARD_BPS);
        assert_eq!(StakeTier::Diamond.get_reward_rate_bps(), DIAMOND_REWARD_BPS);

        // Test discount rates (these should be hardcoded in the impl)
        assert_eq!(StakeTier::None.get_discount_bps(), 0);
        // Note: The actual discount values depend on the implementation
        // We just verify the method exists and returns u16
        let _: u16 = StakeTier::Bronze.get_discount_bps();
        let _: u16 = StakeTier::Silver.get_discount_bps();
        let _: u16 = StakeTier::Gold.get_discount_bps();
        let _: u16 = StakeTier::Diamond.get_discount_bps();
    }

    #[test]
    fn test_calculate_house_fee_amount() {
        let ticket_price = 2_500_000; // $2.50

        // Test with 28% fee
        let fee_28 = calculate_house_fee_amount(ticket_price, 2800);
        assert_eq!(fee_28, ticket_price * 2800 / 10000);

        // Test with 40% fee
        let fee_40 = calculate_house_fee_amount(ticket_price, 4000);
        assert_eq!(fee_40, ticket_price * 4000 / 10000);

        // Test edge cases
        assert_eq!(calculate_house_fee_amount(0, 2800), 0);
        assert_eq!(calculate_house_fee_amount(ticket_price, 0), 0);
        assert_eq!(
            calculate_house_fee_amount(ticket_price, 10000),
            ticket_price
        ); // 100% fee
    }

    #[test]
    fn test_calculate_prize_pool_amount() {
        let ticket_price = 2_500_000; // $2.50

        // Test with 28% fee (72% to prize pool)
        let pool_28 = calculate_prize_pool_amount(ticket_price, 2800);
        assert_eq!(pool_28, ticket_price * (10000 - 2800) / 10000);

        // Test with 40% fee (60% to prize pool)
        let pool_40 = calculate_prize_pool_amount(ticket_price, 4000);
        assert_eq!(pool_40, ticket_price * (10000 - 4000) / 10000);

        // Test edge cases
        assert_eq!(calculate_prize_pool_amount(0, 2800), 0);
        assert_eq!(calculate_prize_pool_amount(ticket_price, 0), ticket_price); // 0% fee
        assert_eq!(calculate_prize_pool_amount(ticket_price, 10000), 0); // 100% fee
    }

    #[test]
    fn test_match_tier_methods() {
        // Test fixed prizes
        assert!(MatchTier::Match6.get_fixed_prize() > 0); // Jackpot
        assert_eq!(MatchTier::Match5.get_fixed_prize(), MATCH_5_PRIZE);
        assert_eq!(MatchTier::Match4.get_fixed_prize(), MATCH_4_PRIZE);
        assert_eq!(MatchTier::Match3.get_fixed_prize(), MATCH_3_PRIZE);
        assert_eq!(MatchTier::Match2.get_fixed_prize(), MATCH_2_VALUE);
        assert_eq!(MatchTier::NoMatch.get_fixed_prize(), 0);

        // Test rolldown allocations
        assert_eq!(
            MatchTier::Match5.get_rolldown_allocation_bps(),
            ROLLDOWN_MATCH_5_BPS
        );
        assert_eq!(
            MatchTier::Match4.get_rolldown_allocation_bps(),
            ROLLDOWN_MATCH_4_BPS
        );
        assert_eq!(
            MatchTier::Match3.get_rolldown_allocation_bps(),
            ROLLDOWN_MATCH_3_BPS
        );
        assert_eq!(MatchTier::Match2.get_rolldown_allocation_bps(), 0); // Match 2 doesn't get rolldown
        assert_eq!(MatchTier::NoMatch.get_rolldown_allocation_bps(), 0);

        // Verify Match6 has 0 rolldown allocation (jackpot winner takes all)
        assert_eq!(MatchTier::Match6.get_rolldown_allocation_bps(), 0);
    }

    #[test]
    fn test_quick_pick_constants() {
        // Verify Quick Pick game parameters
        assert_eq!(QUICK_PICK_TICKET_PRICE, 500_000); // $0.50
        assert_eq!(QUICK_PICK_NUMBERS, 4);
        assert_eq!(QUICK_PICK_RANGE, 20);
        assert_eq!(QUICK_PICK_HOUSE_FEE_BPS, 3000); // 30%
        assert_eq!(QUICK_PICK_INTERVAL, 14_400); // 4 hours in seconds

        // Verify Quick Pick prizes
        assert_eq!(QUICK_PICK_MATCH_4_PRIZE, 500_000_000); // $500
        assert_eq!(QUICK_PICK_MATCH_3_PRIZE, 10_000_000); // $10
    }

    #[test]
    fn test_second_chance_constants() {
        assert_eq!(SECOND_CHANCE_PRIZE_POOL_BPS, 500); // 5%
        assert_eq!(SECOND_CHANCE_WEEKLY_WINNERS, 1111);
        assert_eq!(SECOND_CHANCE_WEEKLY_PRIZE, 50_000_000); // $50
    }

    #[test]
    fn test_syndicate_wars_constants() {
        assert_eq!(SYNDICATE_WARS_POOL_BPS, 100); // 1%
        assert_eq!(SYNDICATE_WARS_MIN_TICKETS, 1_000);
        assert_eq!(SYNDICATE_WARS_MONTHLY_WINNERS, 3);
    }

    #[test]
    fn test_lucky_numbers_constants() {
        assert_eq!(LUCKY_NUMBERS_BONUS_BPS, 100); // 1%
        assert_eq!(LUCKY_NUMBERS_MIN_MATCH, 4); // Match 4+
        assert_eq!(LUCKY_NUMBERS_MAX_PER_DRAW, 10); // Max 10 NFTs per draw
    }
}