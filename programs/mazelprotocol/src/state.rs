use crate::constants::NUMBERS_COUNT;
use anchor_lang::prelude::*;

#[account]
pub struct LotteryState {
    pub authority: Pubkey,        // Admin wallet that can control the lottery
    pub vrf_account: Pubkey,      // VRF account for random number generation
    pub current_draw_id: u64,     // Current draw number
    pub jackpot_balance: u64,     // Current jackpot amount
    pub reserve_balance: u64,     // Reserve fund for future draws
    pub insurance_balance: u64,   // Insurance fund for guaranteed payouts
    pub ticket_price: u64,        // Price per ticket (2.5 USDC)
    pub house_fee_bps: u16,       // House fee percentage (basis points)
    pub jackpot_cap: u64,         // Maximum jackpot before rolldown ($2M)
    pub seed_amount: u64,         // Initial seed amount ($500k)
    pub total_tickets_sold: u64,  // Lifetime tickets sold
    pub total_prizes_paid: u64,   // Lifetime prizes paid
    pub last_draw_timestamp: i64, // When last draw occurred
    pub next_draw_timestamp: i64, // When next draw will occur
    pub is_rolldown_active: bool, // Whether rolldown is active
    pub is_soft_cap_zone: bool,   // Whether in soft cap zone ($1.5M-$2M)
    pub is_paused: bool,          // Whether lottery is paused
    pub bump: u8,                 // PDA bump seed
}

impl LotteryState {
    pub const LEN: usize = 32 +  // authority
        32 +  // vrf_account
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

    pub fn validate_state(&self) -> Result<()> {
        require!(
            self.ticket_price > 0,
            crate::errors::ErrorCode::InvalidAmount
        );
        require!(
            self.house_fee_bps <= 10_000,
            crate::errors::ErrorCode::InvalidAmount
        ); // Max 100%
        require!(
            self.jackpot_cap > 0,
            crate::errors::ErrorCode::InvalidAmount
        );
        require!(
            self.seed_amount <= self.jackpot_cap,
            crate::errors::ErrorCode::InvalidAmount
        );
        require!(
            self.next_draw_timestamp > self.last_draw_timestamp,
            crate::errors::ErrorCode::InvalidAmount
        );
        Ok(())
    }

    pub fn is_draw_ready(&self, current_time: i64) -> bool {
        current_time >= self.next_draw_timestamp
    }

    pub fn calculate_house_fee(&self, amount: u64) -> u64 {
        (amount as u128 * self.house_fee_bps as u128 / 10_000) as u64
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct LotteryNumbers([u8; NUMBERS_COUNT]);

impl LotteryNumbers {
    pub fn new(numbers: [u8; NUMBERS_COUNT]) -> Result<Self> {
        // Validate numbers are within range and unique
        for &num in &numbers {
            require!(
                num >= MIN_NUMBER && num <= MAX_NUMBER,
                crate::errors::ErrorCode::InvalidNumbers
            );
        }

        // Check for duplicates
        let mut sorted = numbers;
        sorted.sort();
        for i in 0..NUMBERS_COUNT - 1 {
            require!(
                sorted[i] != sorted[i + 1],
                crate::errors::ErrorCode::DuplicateNumbers
            );
        }

        Ok(Self(numbers))
    }

    pub fn as_array(&self) -> [u8; NUMBERS_COUNT] {
        self.0
    }
}

/// Compressed ticket data for efficient storage
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct TicketData {
    pub numbers: LotteryNumbers,
    pub purchase_timestamp: i64,
    pub is_claimed: bool,
    pub prize_amount: u64,
    pub match_count: u8,
    pub syndicate: Option<Pubkey>, // Optional syndicate wallet
}

impl TicketData {
    pub const LEN: usize = 6 +   // numbers (6 * u8)
        8 +   // purchase_timestamp
        1 +   // is_claimed
        8 +   // prize_amount
        1 +   // match_count
        33; // syndicate (Option<Pubkey> = 1 + 32)
}

/// Enum to represent either a single ticket or multiple tickets
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub enum TicketVariant {
    /// Single ticket - stored directly
    Single(TicketData),
    /// Multiple tickets - stored in a vector
    Multiple(Vec<TicketData>),
}

/// Unified ticket structure that can store 1-250 tickets
/// Replaces Ticket, TicketEntry, and TicketBatch structures
#[account]
pub struct UnifiedTicket {
    /// Wallet that owns all tickets in this account
    pub owner: Pubkey,

    /// Draw ID that all tickets are for
    pub draw_id: u64,

    /// Starting ticket ID for this batch
    /// For single tickets, this is the actual ticket ID
    /// For multiple tickets, tickets are numbered sequentially from this ID
    pub start_ticket_id: u64,

    /// The actual ticket data - can be single or multiple
    pub tickets: TicketVariant,

    /// PDA bump seed
    pub bump: u8,
}

impl UnifiedTicket {
    /// Maximum number of tickets that can be stored in a single UnifiedTicket account
    pub const MAX_TICKETS: usize = 250;

    /// Calculate the size needed for a UnifiedTicket account
    pub fn calculate_size(ticket_count: usize) -> usize {
        let base_size = 32 +  // owner
            8 +   // draw_id
            8 +   // start_ticket_id
            1 +   // bump
            1; // TicketVariant discriminant

        match ticket_count {
            0 => base_size, // Empty account (shouldn't happen)
            1 => {
                // Single ticket variant - TicketData stored inline
                base_size + TicketData::LEN
            }
            _ => {
                // Multiple tickets variant - Vec with capacity for MAX_TICKETS
                base_size +
                4 + // Vec length (u32)
                (Self::MAX_TICKETS * TicketData::LEN) // Space for max tickets
            }
        }
    }

    /// Get the total number of tickets in this account
    pub fn ticket_count(&self) -> usize {
        match &self.tickets {
            TicketVariant::Single(_) => 1,
            TicketVariant::Multiple(tickets) => tickets.len(),
        }
    }

    /// Check if this account can hold more tickets
    pub fn has_capacity(&self, additional_tickets: usize) -> bool {
        let current_count = self.ticket_count();
        current_count + additional_tickets <= Self::MAX_TICKETS
    }

    /// Get a ticket by index (0-based)
    pub fn get_ticket(&self, index: usize) -> Option<&TicketData> {
        match &self.tickets {
            TicketVariant::Single(ticket) => {
                if index == 0 {
                    Some(ticket)
                } else {
                    None
                }
            }
            TicketVariant::Multiple(tickets) => tickets.get(index),
        }
    }

    /// Get a mutable reference to a ticket by index
    pub fn get_ticket_mut(&mut self, index: usize) -> Option<&mut TicketData> {
        match &mut self.tickets {
            TicketVariant::Single(ticket) => {
                if index == 0 {
                    Some(ticket)
                } else {
                    None
                }
            }
            TicketVariant::Multiple(tickets) => tickets.get_mut(index),
        }
    }

    /// Add a new ticket to the account
    /// Returns the index of the added ticket
    pub fn add_ticket(&mut self, ticket_data: TicketData) -> Result<usize> {
        let current_count = self.ticket_count();

        // Check capacity
        if current_count >= Self::MAX_TICKETS {
            return Err(ErrorCode::BatchFull.into());
        }

        match &mut self.tickets {
            TicketVariant::Single(existing_ticket) => {
                // Convert from single to multiple
                let mut tickets_vec = Vec::with_capacity(Self::MAX_TICKETS);
                tickets_vec.push(existing_ticket.clone());
                tickets_vec.push(ticket_data);
                self.tickets = TicketVariant::Multiple(tickets_vec);
                Ok(1) // New ticket is at index 1
            }
            TicketVariant::Multiple(tickets) => {
                tickets.push(ticket_data);
                Ok(tickets.len() - 1) // Return index of newly added ticket
            }
        }
    }

    /// Create a new UnifiedTicket with a single ticket
    pub fn new_single(
        owner: Pubkey,
        draw_id: u64,
        start_ticket_id: u64,
        ticket_data: TicketData,
        bump: u8,
    ) -> Self {
        Self {
            owner,
            draw_id,
            start_ticket_id,
            tickets: TicketVariant::Single(ticket_data),
            bump,
        }
    }

    /// Create a new UnifiedTicket with multiple tickets
    pub fn new_multiple(
        owner: Pubkey,
        draw_id: u64,
        start_ticket_id: u64,
        tickets_data: Vec<TicketData>,
        bump: u8,
    ) -> Result<Self> {
        // Validate ticket count
        if tickets_data.is_empty() {
            return Err(ErrorCode::NoTickets.into());
        }

        if tickets_data.len() > Self::MAX_TICKETS {
            return Err(ErrorCode::TooManyTickets.into());
        }

        let tickets = if tickets_data.len() == 1 {
            TicketVariant::Single(tickets_data.into_iter().next().unwrap())
        } else {
            TicketVariant::Multiple(tickets_data)
        };

        Ok(Self {
            owner,
            draw_id,
            start_ticket_id,
            tickets,
            bump,
        })
    }

    /// Get the actual ticket ID for a ticket at the given index
    pub fn get_actual_ticket_id(&self, index: usize) -> Option<u64> {
        if index < self.ticket_count() {
            Some(self.start_ticket_id + index as u64)
        } else {
            None
        }
    }
}

#[account]
pub struct DrawResult {
    pub draw_id: u64,
    pub winning_numbers: [u8; NUMBERS_COUNT],
    pub vrf_proof: [u8; 64],
    pub timestamp: i64,
    pub total_tickets: u64,
    pub was_rolldown: bool,
    pub match_6_winners: u32,
    pub match_5_winners: u32,
    pub match_4_winners: u32,
    pub match_3_winners: u32,
    pub match_2_winners: u32,
    pub match_6_claimed: u32,
    pub match_5_claimed: u32,
    pub match_4_claimed: u32,
    pub match_3_claimed: u32,
    pub match_2_claimed: u32,
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
        64 +  // vrf_proof (64 * u8)
        8 +   // timestamp
        8 +   // total_tickets
        1 +   // was_rolldown
        4 +   // match_6_winners
        4 +   // match_5_winners
        4 +   // match_4_winners
        4 +   // match_3_winners
        4 +   // match_2_winners
        4 +   // match_6_claimed
        4 +   // match_5_claimed
        4 +   // match_4_claimed
        4 +   // match_3_claimed
        4 +   // match_2_claimed
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
