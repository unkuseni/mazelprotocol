#[cfg(test)]
mod tests {
    use super::*;
    use anchor_lang::AnchorSerialize;

    #[test]
    fn test_lottery_state_size() {
        // Test that LEN matches actual serialized size
        let state = LotteryState {
            authority: Pubkey::new_unique(),
            vrf_account: Pubkey::new_unique(),
            current_draw_id: 1,
            jackpot_balance: 1000,
            reserve_balance: 100,
            insurance_balance: 50,
            ticket_price: 2_500_000,
            house_fee_bps: 2800,
            jackpot_cap: 2_000_000_000_000,
            seed_amount: 500_000_000_000,
            total_tickets_sold: 1000,
            total_prizes_paid: 500,
            last_draw_timestamp: 0,
            next_draw_timestamp: 86_400,
            is_rolldown_active: false,
            is_soft_cap_zone: false,
            is_paused: false,
            bump: 255,
        };

        let mut data = Vec::new();
        state.serialize(&mut data).unwrap();
        assert_eq!(data.len(), LotteryState::LEN);
    }

    #[test]
    fn test_unified_ticket_capacity() {
        // Test that MAX_TICKETS is reasonable
        assert!(UnifiedTicket::MAX_TICKETS >= 1);
        assert!(UnifiedTicket::MAX_TICKETS <= 1000); // Reasonable upper bound

        // Test calculate_size for different ticket counts
        let size_1 = UnifiedTicket::calculate_size(1);
        let size_10 = UnifiedTicket::calculate_size(10);
        let size_max = UnifiedTicket::calculate_size(UnifiedTicket::MAX_TICKETS);

        assert!(size_1 < size_10);
        assert!(size_10 < size_max);
    }

    #[test]
    fn test_lottery_numbers_validation() {
        // Test valid numbers
        let valid_numbers = [7, 14, 21, 28, 35, 42];
        let result = LotteryNumbers::new(valid_numbers);
        assert!(result.is_ok());

        // Test invalid numbers (out of range)
        let invalid_numbers = [0, 14, 21, 28, 35, 42];
        let result = LotteryNumbers::new(invalid_numbers);
        assert!(result.is_err());

        // Test duplicate numbers
        let duplicate_numbers = [7, 7, 21, 28, 35, 42];
        let result = LotteryNumbers::new(duplicate_numbers);
        assert!(result.is_err());
    }

    #[test]
    fn test_draw_result_helpers() {
        let draw_result = DrawResult {
            draw_id: 1,
            winning_numbers: [1, 2, 3, 4, 5, 6],
            vrf_proof: [0; 64],
            timestamp: 1234567890,
            total_tickets: 1000,
            was_rolldown: false,
            match_6_winners: 1,
            match_5_winners: 10,
            match_4_winners: 50,
            match_3_winners: 200,
            match_2_winners: 500,
            match_6_claimed: 0,
            match_5_claimed: 5,
            match_4_claimed: 25,
            match_3_claimed: 100,
            match_2_claimed: 250,
            total_prizes_distributed: 1_000_000,
            match_6_prize: 500_000,
            match_5_prize: 10_000,
            match_4_prize: 1_000,
            match_3_prize: 100,
            match_2_prize: 2_500_000,
        };

        assert_eq!(draw_result.total_winners(), 761);
        assert_eq!(draw_result.total_claimed(), 380);
        assert_eq!(draw_result.unclaimed_winners(), 381);

        assert_eq!(draw_result.get_prize_for_match(6), Some(500_000));
        assert_eq!(draw_result.get_prize_for_match(5), Some(10_000));
        assert_eq!(draw_result.get_prize_for_match(4), Some(1_000));
        assert_eq!(draw_result.get_prize_for_match(3), Some(100));
        assert_eq!(draw_result.get_prize_for_match(2), Some(2_500_000));
        assert_eq!(draw_result.get_prize_for_match(1), None);

        assert_eq!(draw_result.get_winners_for_match(6), Some(1));
        assert_eq!(draw_result.get_winners_for_match(5), Some(10));
        assert_eq!(draw_result.get_winners_for_match(4), Some(50));
        assert_eq!(draw_result.get_winners_for_match(3), Some(200));
        assert_eq!(draw_result.get_winners_for_match(2), Some(500));
        assert_eq!(draw_result.get_winners_for_match(1), None);
    }

    #[test]
    fn test_unified_ticket_operations() {
        let owner = Pubkey::new_unique();
        let draw_id = 1;
        let start_ticket_id = 100;
        let bump = 1;

        // Create a single ticket
        let ticket_data = TicketData {
            numbers: LotteryNumbers::new([1, 2, 3, 4, 5, 6]).unwrap(),
            purchase_timestamp: 1234567890,
            is_claimed: false,
            prize_amount: 0,
            match_count: 0,
            syndicate: None,
        };

        let mut unified_ticket =
            UnifiedTicket::new_single(owner, draw_id, start_ticket_id, ticket_data, bump);

        assert_eq!(unified_ticket.ticket_count(), 1);
        assert!(unified_ticket.has_capacity(249));

        // Add another ticket
        let ticket_data2 = TicketData {
            numbers: LotteryNumbers::new([7, 8, 9, 10, 11, 12]).unwrap(),
            purchase_timestamp: 1234567891,
            is_claimed: false,
            prize_amount: 0,
            match_count: 0,
            syndicate: None,
        };

        let result = unified_ticket.add_ticket(ticket_data2);
        assert!(result.is_ok());
        assert_eq!(unified_ticket.ticket_count(), 2);

        // Test ticket ID lookup
        assert_eq!(unified_ticket.get_actual_ticket_id(0), Some(100));
        assert_eq!(unified_ticket.get_actual_ticket_id(1), Some(101));
        assert_eq!(unified_ticket.get_actual_ticket_id(2), None);

        // Test get_ticket_by_id
        assert!(unified_ticket.get_ticket_by_id(100).is_some());
        assert!(unified_ticket.get_ticket_by_id(101).is_some());
        assert!(unified_ticket.get_ticket_by_id(99).is_none());
        assert!(unified_ticket.get_ticket_by_id(102).is_none());

        // Test find_ticket_index
        assert_eq!(unified_ticket.find_ticket_index(100), Some(0));
        assert_eq!(unified_ticket.find_ticket_index(101), Some(1));
        assert_eq!(unified_ticket.find_ticket_index(99), None);
        assert_eq!(unified_ticket.find_ticket_index(102), None);

        // Test mark_as_claimed
        let result = unified_ticket.mark_as_claimed(0, 1_000_000);
        assert!(result.is_ok());

        let ticket = unified_ticket.get_ticket(0).unwrap();
        assert!(ticket.is_claimed);
        assert_eq!(ticket.prize_amount, 1_000_000);

        // Test cannot claim already claimed ticket
        let result = unified_ticket.mark_as_claimed(0, 2_000_000);
        assert!(result.is_err());
    }

    #[test]
    fn test_lottery_state_validation() {
        let mut state = LotteryState {
            authority: Pubkey::new_unique(),
            vrf_account: Pubkey::new_unique(),
            current_draw_id: 1,
            jackpot_balance: 1000,
            reserve_balance: 100,
            insurance_balance: 50,
            ticket_price: 2_500_000,
            house_fee_bps: 2800,
            jackpot_cap: 2_000_000_000_000,
            seed_amount: 500_000_000_000,
            total_tickets_sold: 1000,
            total_prizes_paid: 500,
            last_draw_timestamp: 0,
            next_draw_timestamp: 86_400,
            is_rolldown_active: false,
            is_soft_cap_zone: false,
            is_paused: false,
            bump: 255,
        };

        // Valid state should pass
        assert!(state.validate_state().is_ok());

        // Test invalid ticket price
        let invalid_state = LotteryState {
            ticket_price: 0,
            ..state
        };
        assert!(invalid_state.validate_state().is_err());

        // Test invalid house fee
        let invalid_state = LotteryState {
            house_fee_bps: 10_001,
            ..state
        };
        assert!(invalid_state.validate_state().is_err());

        // Test invalid jackpot cap
        let invalid_state = LotteryState {
            jackpot_cap: 0,
            ..state
        };
        assert!(invalid_state.validate_state().is_err());

        // Test invalid seed amount
        let invalid_state = LotteryState {
            seed_amount: 3_000_000_000_000, // Exceeds cap
            ..state
        };
        assert!(invalid_state.validate_state().is_err());

        // Test invalid draw timestamps
        let invalid_state = LotteryState {
            next_draw_timestamp: 0, // Same as last draw
            ..state
        };
        assert!(invalid_state.validate_state().is_err());
    }

    #[test]
    fn test_lottery_state_helpers() {
        let state = LotteryState {
            authority: Pubkey::new_unique(),
            vrf_account: Pubkey::new_unique(),
            current_draw_id: 1,
            jackpot_balance: 1000,
            reserve_balance: 100,
            insurance_balance: 50,
            ticket_price: 2_500_000,
            house_fee_bps: 2800, // 28%
            jackpot_cap: 2_000_000_000_000,
            seed_amount: 500_000_000_000,
            total_tickets_sold: 1000,
            total_prizes_paid: 500,
            last_draw_timestamp: 0,
            next_draw_timestamp: 86_400,
            is_rolldown_active: false,
            is_soft_cap_zone: false,
            is_paused: false,
            bump: 255,
        };

        // Test is_draw_ready
        assert!(!state.is_draw_ready(0));
        assert!(!state.is_draw_ready(86_399));
        assert!(state.is_draw_ready(86_400));
        assert!(state.is_draw_ready(86_401));

        // Test calculate_house_fee
        let amount = 1_000_000;
        let expected_fee = (amount as u128 * 2800 / 10_000) as u64; // 28% of 1,000,000 = 280,000
        assert_eq!(state.calculate_house_fee(amount), expected_fee);
    }
}
