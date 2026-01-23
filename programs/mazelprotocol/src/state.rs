use crate::constants::NUMBERS_COUNT;
use anchor_lang::prelude::*;

#[account]
pub struct LotteryState {
    pub authority: Pubkey,
    pub current_draw_id: u64,
    pub jackpot_balance: u64,
    pub reserve_balance: u64,
    pub insurance_balance: u64,
    pub ticket_price: u64,
    pub house_fee_bps: u16,
    pub jackpot_cap: u64,
    pub seed_amount: u64,
    pub total_tickets_sold: u64,
    pub total_prizes_paid: u64,
    pub last_draw_timestamp: i64,
    pub next_draw_timestamp: i64,
    pub is_rolldown_active: bool,
    pub is_soft_cap_zone: bool,
    pub is_paused: bool,
    pub bump: u8,
}

impl LotteryState {
    pub const LEN: usize = 32 +  // authority
        8 +   // current_draw_id
        8 +   // jackpot_balance
        8 +   // reserve_balance
        8 +   // insurance_balance
        8 +   // ticket_price
        2 +   // house_fee_bps
        8 +   // jackpot_cap
        8 +   // seed_amount
        8 +   // total_tickets_sold
        8 +   // total_prizes_paid
        8 +   // last_draw_timestamp
        8 +   // next_draw_timestamp
        1 +   // is_rolldown_active
        1 +   // is_soft_cap_zone
        1 +   // is_paused
        1; // bump
}

#[account]
pub struct Ticket {
    pub owner: Pubkey,
    pub draw_id: u64,
    pub numbers: [u8; NUMBERS_COUNT],
    pub purchase_timestamp: i64,
    pub is_claimed: bool,
    pub prize_amount: u64,
    pub match_count: u8,
    pub syndicate: Option<Pubkey>,
}

impl Ticket {
    pub const LEN: usize = 32 +  // owner
        8 +   // draw_id
        6 +   // numbers (6 * u8)
        8 +   // purchase_timestamp
        1 +   // is_claimed
        8 +   // prize_amount
        1 +   // match_count
        33; // syndicate (Option<Pubkey>)
}

#[account]
pub struct DrawResult {
    pub draw_id: u64,
    pub winning_numbers: [u8; NUMBERS_COUNT],
    pub timestamp: i64,
    pub total_tickets: u64,
    pub was_rolldown: bool,
    pub match_6_winners: u32,
    pub match_5_winners: u32,
    pub match_4_winners: u32,
    pub match_3_winners: u32,
    pub match_2_winners: u32,
    pub total_prizes_distributed: u64,
    pub match_6_prize: u64,
    pub match_5_prize: u64,
    pub match_4_prize: u64,
    pub match_3_prize: u64,
    pub match_2_prize: u64,
}

impl DrawResult {
    pub const LEN: usize = 8 +   // draw_id
        6 +   // winning_numbers (6 * u8)
        8 +   // timestamp
        8 +   // total_tickets
        1 +   // was_rolldown
        4 +   // match_6_winners
        4 +   // match_5_winners
        4 +   // match_4_winners
        4 +   // match_3_winners
        4 +   // match_2_winners
        8 +   // total_prizes_distributed
        8 +   // match_6_prize
        8 +   // match_5_prize
        8 +   // match_4_prize
        8 +   // match_3_prize
        8; // match_2_prize
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct WinnerCounts {
    pub match_6: u32,
    pub match_5: u32,
    pub match_4: u32,
    pub match_3: u32,
    pub match_2: u32,
}
