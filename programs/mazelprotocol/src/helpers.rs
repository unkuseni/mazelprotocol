use anchor_lang::prelude::*;
use std::collections::HashSet;

use crate::constants::*;
use crate::events::{MiniRolldownExecuted, RolldownExecuted};
use crate::state::{DrawResult, LotteryState, WinnerCounts};

/// Validate lottery numbers are within range [1, 46] and have no duplicates
pub fn validate_numbers(numbers: &[u8; NUMBERS_COUNT]) -> Result<()> {
    // Validate numbers are in range [1, 46]
    for &num in numbers.iter() {
        require!(
            num >= MIN_NUMBER && num <= MAX_NUMBER,
            crate::errors::ErrorCode::InvalidNumbers
        );
    }

    // Validate no duplicates
    let mut sorted = *numbers;
    sorted.sort();
    for i in 0..NUMBERS_COUNT - 1 {
        require!(
            sorted[i] != sorted[i + 1],
            crate::errors::ErrorCode::DuplicateNumbers
        );
    }

    Ok(())
}

/// Calculate dynamic house fee based on jackpot balance and rolldown status
pub fn calculate_dynamic_fee(jackpot_balance: u64, is_rolldown_active: bool) -> u16 {
    if is_rolldown_active {
        return ROLLDOWN_FEE_BPS;
    }

    match jackpot_balance {
        bal if bal < FEE_THRESHOLD_1 => FEE_TIER_1_BPS,
        bal if bal < FEE_THRESHOLD_2 => FEE_TIER_2_BPS,
        bal if bal < FEE_THRESHOLD_3 => FEE_TIER_3_BPS,
        _ => FEE_TIER_4_BPS,
    }
}

/// Count how many numbers match between ticket and winning numbers
pub fn count_matches(ticket: &[u8; NUMBERS_COUNT], winning: &[u8; NUMBERS_COUNT]) -> u8 {
    let ticket_set: HashSet<u8> = ticket.iter().cloned().collect();
    let winning_set: HashSet<u8> = winning.iter().cloned().collect();
    ticket_set.intersection(&winning_set).count() as u8
}

/// Data structure to hold rolldown calculation results
#[derive(Debug)]
pub struct RolldownCalculation {
    pub match_5_prize: u64,
    pub match_4_prize: u64,
    pub match_3_prize: u64,
    pub match_2_prize: u64,
    pub match_6_prize: u64,
    pub total_distributed: u64,
    pub new_jackpot_balance: u64,
    pub amount_distributed: u64,
}

/// Calculate rolldown distribution without modifying state
pub fn calculate_rolldown_distribution(
    current_jackpot: u64,
    seed_amount: u64,
    winner_counts: &WinnerCounts,
    rolldown_percentage: u16,
) -> RolldownCalculation {
    let amount_to_distribute = current_jackpot * rolldown_percentage as u64 / 10_000;

    // Distribute to lower tiers based on rolldown percentages
    let match_5_pool = amount_to_distribute * 25 / 100; // 25% to Match 5
    let match_4_pool = amount_to_distribute * 35 / 100; // 35% to Match 4
    let match_3_pool = amount_to_distribute * 40 / 100; // 40% to Match 3

    // Calculate per-winner prizes
    let match_5_prize = if winner_counts.match_5 > 0 {
        match_5_pool / winner_counts.match_5 as u64
    } else {
        0
    };

    let match_4_prize = if winner_counts.match_4 > 0 {
        match_4_pool / winner_counts.match_4 as u64
    } else {
        0
    };

    let match_3_prize = if winner_counts.match_3 > 0 {
        match_3_pool / winner_counts.match_3 as u64
    } else {
        0
    };

    let match_2_prize = 2_500_000; // Free ticket remains $2.50
    let match_6_prize = 0; // No jackpot in rolldown

    // Calculate total distributed
    let total_distributed = (match_5_prize * winner_counts.match_5 as u64)
        + (match_4_prize * winner_counts.match_4 as u64)
        + (match_3_prize * winner_counts.match_3 as u64)
        + (match_2_prize * winner_counts.match_2 as u64);

    // Calculate new jackpot balance
    let new_jackpot_balance = if rolldown_percentage == FULL_ROLLDOWN_PERCENTAGE {
        seed_amount
    } else {
        current_jackpot - amount_to_distribute
    };

    RolldownCalculation {
        match_5_prize,
        match_4_prize,
        match_3_prize,
        match_2_prize,
        match_6_prize,
        total_distributed,
        new_jackpot_balance,
        amount_distributed: amount_to_distribute,
    }
}

/// Calculate mini-rolldown distribution (30% of excess over soft cap)
pub fn calculate_mini_rolldown_distribution(
    current_jackpot: u64,
    winner_counts: &WinnerCounts,
) -> RolldownCalculation {
    let excess_over_soft_cap = current_jackpot.saturating_sub(SOFT_CAP);
    let amount_to_distribute = excess_over_soft_cap * MINI_ROLLDOWN_PERCENTAGE as u64 / 10_000;

    // Distribute to lower tiers
    let match_5_pool = amount_to_distribute * 25 / 100;
    let match_4_pool = amount_to_distribute * 35 / 100;
    let match_3_pool = amount_to_distribute * 40 / 100;

    // Calculate per-winner prizes
    let match_5_prize = if winner_counts.match_5 > 0 {
        match_5_pool / winner_counts.match_5 as u64
    } else {
        0
    };

    let match_4_prize = if winner_counts.match_4 > 0 {
        match_4_pool / winner_counts.match_4 as u64
    } else {
        0
    };

    let match_3_prize = if winner_counts.match_3 > 0 {
        match_3_pool / winner_counts.match_3 as u64
    } else {
        0
    };

    let match_2_prize = 2_500_000;
    let match_6_prize = 0;

    // Calculate total distributed
    let total_distributed = (match_5_prize * winner_counts.match_5 as u64)
        + (match_4_prize * winner_counts.match_4 as u64)
        + (match_3_prize * winner_counts.match_3 as u64)
        + (match_2_prize * winner_counts.match_2 as u64);

    let new_jackpot_balance = current_jackpot - amount_to_distribute;

    RolldownCalculation {
        match_5_prize,
        match_4_prize,
        match_3_prize,
        match_2_prize,
        match_6_prize,
        total_distributed,
        new_jackpot_balance,
        amount_distributed: amount_to_distribute,
    }
}

/// Apply rolldown calculation results to state
pub fn apply_rolldown_calculation(
    lottery_state: &mut LotteryState,
    draw_result: &mut DrawResult,
    _winner_counts: &WinnerCounts,
    calculation: &RolldownCalculation,
) {
    draw_result.match_5_prize = calculation.match_5_prize;
    draw_result.match_4_prize = calculation.match_4_prize;
    draw_result.match_3_prize = calculation.match_3_prize;
    draw_result.match_2_prize = calculation.match_2_prize;
    draw_result.match_6_prize = calculation.match_6_prize;
    draw_result.total_prizes_distributed = calculation.total_distributed;

    lottery_state.jackpot_balance = calculation.new_jackpot_balance;
}

/// Trigger rolldown distribution and return event data
pub fn trigger_rolldown_internal(
    lottery_state: &mut LotteryState,
    draw_result: &mut DrawResult,
    winner_counts: &WinnerCounts,
    rolldown_percentage: u16,
) -> Result<RolldownExecuted> {
    let calculation = calculate_rolldown_distribution(
        lottery_state.jackpot_balance,
        lottery_state.seed_amount,
        winner_counts,
        rolldown_percentage,
    );

    apply_rolldown_calculation(lottery_state, draw_result, winner_counts, &calculation);

    let rolldown_type = if rolldown_percentage == FULL_ROLLDOWN_PERCENTAGE {
        "full".to_string()
    } else {
        "mini".to_string()
    };

    Ok(RolldownExecuted {
        draw_id: draw_result.draw_id,
        total_distributed: calculation.amount_distributed,
        match_5_prize: calculation.match_5_prize,
        match_4_prize: calculation.match_4_prize,
        match_3_prize: calculation.match_3_prize,
        match_5_winners: winner_counts.match_5,
        match_4_winners: winner_counts.match_4,
        match_3_winners: winner_counts.match_3,
        rolldown_type,
    })
}

/// Trigger mini-rolldown distribution and return event data
pub fn trigger_mini_rolldown_internal(
    lottery_state: &mut LotteryState,
    draw_result: &mut DrawResult,
    winner_counts: &WinnerCounts,
) -> Result<MiniRolldownExecuted> {
    let calculation =
        calculate_mini_rolldown_distribution(lottery_state.jackpot_balance, winner_counts);

    apply_rolldown_calculation(lottery_state, draw_result, winner_counts, &calculation);

    let excess_amount = lottery_state
        .jackpot_balance
        .saturating_add(calculation.amount_distributed)
        .saturating_sub(SOFT_CAP);

    Ok(MiniRolldownExecuted {
        draw_id: draw_result.draw_id,
        excess_amount,
        distributed_amount: calculation.amount_distributed,
        match_5_prize: calculation.match_5_prize,
        match_4_prize: calculation.match_4_prize,
        match_3_prize: calculation.match_3_prize,
        match_5_winners: winner_counts.match_5,
        match_4_winners: winner_counts.match_4,
        match_3_winners: winner_counts.match_3,
    })
}
