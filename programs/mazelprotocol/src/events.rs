use crate::constants::NUMBERS_COUNT;
use anchor_lang::prelude::*;

#[event]
pub struct TicketPurchased {
    pub ticket_id: Pubkey,
    pub player: Pubkey,
    pub draw_id: u64,
    pub numbers: [u8; NUMBERS_COUNT],
    pub timestamp: i64,
}

#[event]
pub struct BulkTicketsPurchased {
    pub player: Pubkey,
    pub draw_id: u64,
    pub ticket_count: u32,
    pub total_amount: u64,
}

#[event]
pub struct DrawInitialized {
    pub draw_id: u64,
    pub scheduled_time: i64,
    pub jackpot_balance: u64,
}

#[event]
pub struct DrawExecuted {
    pub draw_id: u64,
    pub winning_numbers: [u8; NUMBERS_COUNT],
    pub is_rolldown: bool,
    pub jackpot_balance: u64,
}

#[event]
pub struct WinnersCalculated {
    pub draw_id: u64,
    pub was_rolldown: bool,
    pub total_prizes: u64,
    pub match_6_winners: u32,
    pub match_5_winners: u32,
    pub match_4_winners: u32,
    pub match_3_winners: u32,
    pub match_2_winners: u32,
}

#[event]
pub struct RolldownExecuted {
    pub draw_id: u64,
    pub total_distributed: u64,
    pub match_5_prize: u64,
    pub match_4_prize: u64,
    pub match_3_prize: u64,
    pub match_5_winners: u32,
    pub match_4_winners: u32,
    pub match_3_winners: u32,
    pub rolldown_type: String,
}

#[event]
pub struct MiniRolldownExecuted {
    pub draw_id: u64,
    pub excess_amount: u64,
    pub distributed_amount: u64,
    pub match_5_prize: u64,
    pub match_4_prize: u64,
    pub match_3_prize: u64,
    pub match_5_winners: u32,
    pub match_4_winners: u32,
    pub match_3_winners: u32,
}

#[event]
pub struct FreeTicketRedeemed {
    pub ticket_id: Pubkey,
    pub player: Pubkey,
    pub draw_id: u64,
    pub numbers: [u8; NUMBERS_COUNT],
    pub nft_mint: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct JackpotDeposited {
    pub depositor: Pubkey,
    pub amount: u64,
    pub new_jackpot_balance: u64,
    pub timestamp: i64,
}

#[event]
pub struct RolldownManuallyTriggered {
    pub draw_id: u64,
    pub jackpot_amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct PrizeClaimed {
    pub ticket_id: Pubkey,
    pub player: Pubkey,
    pub match_count: u8,
    pub prize_amount: u64,
    pub draw_id: u64,
}

#[event]
pub struct LotteryInitialized {
    pub authority: Pubkey,
    pub ticket_price: u64,
    pub house_fee_bps: u16,
    pub jackpot_cap: u64,
    pub seed_amount: u64,
    pub start_time: i64,
}
