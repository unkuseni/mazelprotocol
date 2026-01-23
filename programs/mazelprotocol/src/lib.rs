use anchor_lang::prelude::*;
use anchor_spl::token::{self, Transfer};

// Import modules
pub mod constants;
pub mod contexts;
pub mod errors;
pub mod events;
pub mod helpers;
pub mod state;

// Re-export commonly used items
pub use constants::*;
pub use contexts::*;
// ErrorCode is used via crate::errors::ErrorCode to avoid ambiguity
pub use events::*;
pub use helpers::*;
pub use state::*;

declare_id!("3zi12qNicsbBazvKxGqFp8cirL1dFXCijsZzRCPrAGT4");

#[program]
pub mod mazelprotocol {
    use super::*;

    // ==================== TICKET MANAGER ====================

    /// Purchase a single lottery ticket
    pub fn buy_ticket(ctx: Context<BuyTicket>, numbers: [u8; NUMBERS_COUNT]) -> Result<()> {
        // Validate numbers
        validate_numbers(&numbers)?;

        // Transfer USDC from player to prize pool
        let cpi_accounts = Transfer {
            from: ctx.accounts.player_usdc.to_account_info(),
            to: ctx.accounts.prize_pool_usdc.to_account_info(),
            authority: ctx.accounts.player.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, TICKET_PRICE)?;

        // Calculate dynamic house fee based on current jackpot
        let jackpot_balance = ctx.accounts.lottery_state.jackpot_balance;
        let is_rolldown_active = ctx.accounts.lottery_state.is_rolldown_active;
        let house_fee_bps = calculate_dynamic_fee(jackpot_balance, is_rolldown_active);

        // Update state with current fee
        ctx.accounts.lottery_state.house_fee_bps = house_fee_bps;

        // Calculate fund allocation with dynamic fee
        let house_fee = TICKET_PRICE * house_fee_bps as u64 / 10_000;
        let jackpot_contribution = TICKET_PRICE * 38 / 100; // 38% to jackpot
        let fixed_prize_pool = TICKET_PRICE * 26 / 100; // 26% to fixed prizes
        let reserve_buffer = TICKET_PRICE * 2 / 100; // 2% to reserve

        // Verify allocation sums to ticket price (with rounding)
        let total_allocated = house_fee + jackpot_contribution + fixed_prize_pool + reserve_buffer;
        require!(
            total_allocated <= TICKET_PRICE,
            crate::errors::ErrorCode::AllocationError
        );

        // Update lottery state
        let lottery_state = &mut ctx.accounts.lottery_state;
        lottery_state.jackpot_balance += jackpot_contribution;
        lottery_state.reserve_balance += reserve_buffer;
        lottery_state.total_tickets_sold += 1;

        // Create ticket account
        let mut sorted_numbers = numbers;
        sorted_numbers.sort();

        let ticket = &mut ctx.accounts.ticket;
        ticket.owner = ctx.accounts.player.key();
        ticket.draw_id = lottery_state.current_draw_id;
        ticket.numbers = sorted_numbers;
        ticket.purchase_timestamp = Clock::get()?.unix_timestamp;
        ticket.is_claimed = false;
        ticket.prize_amount = 0;
        ticket.match_count = 0;
        ticket.syndicate = None;

        // Emit event
        emit!(TicketPurchased {
            ticket_id: ticket.key(),
            player: ctx.accounts.player.key(),
            draw_id: ticket.draw_id,
            numbers: ticket.numbers,
            timestamp: ticket.purchase_timestamp,
        });

        Ok(())
    }

    /// Purchase multiple tickets in one transaction
    pub fn buy_bulk(ctx: Context<BuyBulk>, tickets: Vec<[u8; NUMBERS_COUNT]>) -> Result<()> {
        require!(!tickets.is_empty(), crate::errors::ErrorCode::NoTickets);
        require!(
            tickets.len() <= 10,
            crate::errors::ErrorCode::TooManyTickets
        );

        // Calculate total price
        let total_price = TICKET_PRICE * tickets.len() as u64;

        // Transfer USDC from player to prize pool
        let cpi_accounts = Transfer {
            from: ctx.accounts.player_usdc.to_account_info(),
            to: ctx.accounts.prize_pool_usdc.to_account_info(),
            authority: ctx.accounts.player.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, total_price)?;

        // Calculate dynamic house fee based on current jackpot
        let jackpot_balance = ctx.accounts.lottery_state.jackpot_balance;
        let is_rolldown_active = ctx.accounts.lottery_state.is_rolldown_active;
        let house_fee_bps = calculate_dynamic_fee(jackpot_balance, is_rolldown_active);

        // Update state with current fee
        ctx.accounts.lottery_state.house_fee_bps = house_fee_bps;

        // Calculate fund allocation with dynamic fee
        let house_fee = total_price * house_fee_bps as u64 / 10_000;
        let jackpot_contribution = total_price * 38 / 100;
        let fixed_prize_pool = total_price * 26 / 100;
        let reserve_buffer = total_price * 2 / 100;

        // Verify allocation sums to ticket price (with rounding)
        let total_allocated = house_fee + jackpot_contribution + fixed_prize_pool + reserve_buffer;
        require!(
            total_allocated <= total_price,
            crate::errors::ErrorCode::AllocationError
        );

        // Update lottery state
        let lottery_state = &mut ctx.accounts.lottery_state;
        lottery_state.jackpot_balance += jackpot_contribution;
        lottery_state.reserve_balance += reserve_buffer;
        lottery_state.total_tickets_sold += tickets.len() as u64;

        // Store tickets in separate accounts (in real implementation, would need dynamic accounts)
        // For simplicity, we're only storing the first ticket in the provided account
        if let Some(first_numbers) = tickets.first() {
            validate_numbers(first_numbers)?;

            let mut sorted_numbers = *first_numbers;
            sorted_numbers.sort();

            let ticket = &mut ctx.accounts.ticket;
            ticket.owner = ctx.accounts.player.key();
            ticket.draw_id = lottery_state.current_draw_id;
            ticket.numbers = sorted_numbers;
            ticket.purchase_timestamp = Clock::get()?.unix_timestamp;
            ticket.is_claimed = false;
            ticket.prize_amount = 0;
            ticket.match_count = 0;
            ticket.syndicate = None;
        }

        emit!(BulkTicketsPurchased {
            player: ctx.accounts.player.key(),
            draw_id: lottery_state.current_draw_id,
            ticket_count: tickets.len() as u32,
            total_amount: total_price,
        });

        Ok(())
    }

    /// Redeem a free ticket using an NFT (simplified version)
    pub fn redeem_free_ticket(
        ctx: Context<RedeemFreeTicket>,
        numbers: [u8; NUMBERS_COUNT],
        nft_mint: Pubkey,
    ) -> Result<()> {
        // In production, would verify NFT ownership and validity
        // For now, we'll just validate numbers and create a free ticket

        validate_numbers(&numbers)?;

        // Create free ticket (no payment required)
        let mut sorted_numbers = numbers;
        sorted_numbers.sort();

        let ticket = &mut ctx.accounts.ticket;
        ticket.owner = ctx.accounts.player.key();
        ticket.draw_id = ctx.accounts.lottery_state.current_draw_id;
        ticket.numbers = sorted_numbers;
        ticket.purchase_timestamp = Clock::get()?.unix_timestamp;
        ticket.is_claimed = false;
        ticket.prize_amount = 0;
        ticket.match_count = 0;
        ticket.syndicate = None;

        // Update ticket count
        ctx.accounts.lottery_state.total_tickets_sold += 1;

        emit!(FreeTicketRedeemed {
            ticket_id: ticket.key(),
            player: ctx.accounts.player.key(),
            draw_id: ticket.draw_id,
            numbers: ticket.numbers,
            nft_mint,
            timestamp: ticket.purchase_timestamp,
        });

        Ok(())
    }

    /// Deposit funds to the jackpot pool
    pub fn deposit_to_jackpot(ctx: Context<DepositToJackpot>, amount: u64) -> Result<()> {
        require!(amount > 0, crate::errors::ErrorCode::InvalidAmount);

        // Transfer USDC from depositor to prize pool
        let cpi_accounts = Transfer {
            from: ctx.accounts.depositor_usdc.to_account_info(),
            to: ctx.accounts.prize_pool_usdc.to_account_info(),
            authority: ctx.accounts.depositor.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, amount)?;

        // Update jackpot balance
        ctx.accounts.lottery_state.jackpot_balance += amount;

        emit!(JackpotDeposited {
            depositor: ctx.accounts.depositor.key(),
            amount,
            new_jackpot_balance: ctx.accounts.lottery_state.jackpot_balance,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    /// Manually trigger rolldown distribution (admin function)
    pub fn distribute_rolldown(ctx: Context<DistributeRolldown>) -> Result<()> {
        let lottery_state = &mut ctx.accounts.lottery_state;

        require!(
            lottery_state.jackpot_balance >= lottery_state.jackpot_cap,
            crate::errors::ErrorCode::JackpotBelowCap
        );

        // Extract winner counts before mutable borrow of draw_result
        let winner_counts = WinnerCounts {
            match_6: ctx.accounts.draw_result.match_6_winners,
            match_5: ctx.accounts.draw_result.match_5_winners,
            match_4: ctx.accounts.draw_result.match_4_winners,
            match_3: ctx.accounts.draw_result.match_3_winners,
            match_2: ctx.accounts.draw_result.match_2_winners,
        };

        require!(
            winner_counts.match_6 == 0,
            crate::errors::ErrorCode::JackpotAlreadyWon
        );

        let draw_result = &mut ctx.accounts.draw_result;

        // Trigger full rolldown
        let rolldown_event = trigger_rolldown_internal(
            lottery_state,
            draw_result,
            &winner_counts,
            FULL_ROLLDOWN_PERCENTAGE,
        )?;

        emit!(rolldown_event);

        emit!(RolldownManuallyTriggered {
            draw_id: draw_result.draw_id,
            jackpot_amount: lottery_state.jackpot_balance,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    // ==================== DRAW ENGINE ====================

    /// Initialize a new draw period
    pub fn initialize_draw(ctx: Context<InitializeDraw>) -> Result<()> {
        let lottery_state = &mut ctx.accounts.lottery_state;

        // Ensure previous draw is complete (or enough time has passed)
        let current_time = Clock::get()?.unix_timestamp;
        require!(
            current_time >= lottery_state.next_draw_timestamp,
            crate::errors::ErrorCode::DrawNotReady
        );

        // Increment draw ID and schedule next draw
        lottery_state.current_draw_id += 1;
        lottery_state.next_draw_timestamp = current_time + DRAW_INTERVAL_SECONDS;
        lottery_state.is_rolldown_active = false;
        lottery_state.is_soft_cap_zone = false;

        // Initialize draw result
        let draw_result = &mut ctx.accounts.draw_result;
        draw_result.draw_id = lottery_state.current_draw_id;
        draw_result.timestamp = current_time;
        draw_result.total_tickets = 0;
        draw_result.was_rolldown = false;
        draw_result.match_6_winners = 0;
        draw_result.match_5_winners = 0;
        draw_result.match_4_winners = 0;
        draw_result.match_3_winners = 0;
        draw_result.match_2_winners = 0;
        draw_result.total_prizes_distributed = 0;

        emit!(DrawInitialized {
            draw_id: lottery_state.current_draw_id,
            scheduled_time: lottery_state.next_draw_timestamp,
            jackpot_balance: lottery_state.jackpot_balance,
        });

        Ok(())
    }

    /// Execute a draw with provided random numbers
    /// In production, this would use Chainlink VRF
    pub fn execute_draw(
        ctx: Context<ExecuteDraw>,
        random_numbers: [u8; NUMBERS_COUNT],
    ) -> Result<()> {
        // Verify draw time has passed
        let current_time = Clock::get()?.unix_timestamp;
        require!(
            current_time >= ctx.accounts.lottery_state.next_draw_timestamp,
            crate::errors::ErrorCode::TooEarly
        );

        // Validate random numbers
        validate_numbers(&random_numbers)?;

        // Store winning numbers (sorted)
        let mut winning_numbers = random_numbers;
        winning_numbers.sort();

        // Check for rolldown condition (two-tier system)
        let jackpot_balance = ctx.accounts.lottery_state.jackpot_balance;
        let is_hard_cap_rolldown = jackpot_balance >= JACKPOT_CAP;
        let is_soft_cap_zone = jackpot_balance >= SOFT_CAP && jackpot_balance < JACKPOT_CAP;
        let is_rolldown = is_hard_cap_rolldown;

        // Update state with rolldown flags
        ctx.accounts.lottery_state.is_rolldown_active = is_rolldown;
        if is_soft_cap_zone {
            // Soft cap zone - mini-rolldown eligible
            ctx.accounts.lottery_state.is_soft_cap_zone = true;
        }

        // Update draw result
        let draw_result = &mut ctx.accounts.draw_result;
        draw_result.winning_numbers = winning_numbers;
        draw_result.was_rolldown = is_rolldown;
        draw_result.timestamp = current_time;

        // If rolldown condition met, activate it
        if is_rolldown {
            ctx.accounts.lottery_state.is_rolldown_active = true;
        }

        emit!(DrawExecuted {
            draw_id: draw_result.draw_id,
            winning_numbers,
            is_rolldown,
            jackpot_balance: ctx.accounts.lottery_state.jackpot_balance,
        });

        Ok(())
    }

    /// Calculate winners and distribute prizes
    pub fn calculate_winners(
        ctx: Context<CalculateWinners>,
        winner_counts: WinnerCounts,
    ) -> Result<()> {
        let draw_result = &mut ctx.accounts.draw_result;
        let lottery_state = &mut ctx.accounts.lottery_state;

        // Store winner counts
        draw_result.match_6_winners = winner_counts.match_6;
        draw_result.match_5_winners = winner_counts.match_5;
        draw_result.match_4_winners = winner_counts.match_4;
        draw_result.match_3_winners = winner_counts.match_3;
        draw_result.match_2_winners = winner_counts.match_2;

        // Calculate prizes with two-tier cap system
        let jackpot_balance = lottery_state.jackpot_balance;
        let is_soft_cap_zone = jackpot_balance >= SOFT_CAP && jackpot_balance < JACKPOT_CAP;

        if draw_result.was_rolldown && winner_counts.match_6 == 0 {
            // Hard cap rolldown - execute full distribution
            let rolldown_event = trigger_rolldown_internal(
                lottery_state,
                draw_result,
                &winner_counts,
                FULL_ROLLDOWN_PERCENTAGE,
            )?;
            emit!(rolldown_event);
        } else if is_soft_cap_zone && winner_counts.match_6 == 0 {
            // Soft cap zone - execute mini-rolldown (30% of excess)
            let mini_rolldown_event =
                trigger_mini_rolldown_internal(lottery_state, draw_result, &winner_counts)?;
            emit!(mini_rolldown_event);
        } else if winner_counts.match_6 > 0 {
            // Jackpot won - distribute to Match 6 winners
            let prize_per_winner = lottery_state.jackpot_balance / winner_counts.match_6 as u64;
            draw_result.match_6_prize = prize_per_winner;
            draw_result.total_prizes_distributed = prize_per_winner * winner_counts.match_6 as u64;

            // Reset jackpot to seed amount
            lottery_state.jackpot_balance = lottery_state.seed_amount;
        } else {
            // Normal mode with fixed prizes
            draw_result.match_5_prize = 4_000_000_000; // $4,000
            draw_result.match_4_prize = 150_000_000; // $150
            draw_result.match_3_prize = 5_000_000; // $5
            draw_result.match_2_prize = 2_500_000; // $2.50 (free ticket value)

            // Calculate total distributed for fixed prizes
            draw_result.total_prizes_distributed = (draw_result.match_5_prize
                * winner_counts.match_5 as u64)
                + (draw_result.match_4_prize * winner_counts.match_4 as u64)
                + (draw_result.match_3_prize * winner_counts.match_3 as u64)
                + (draw_result.match_2_prize * winner_counts.match_2 as u64);
        }

        // Update lottery state
        lottery_state.total_prizes_paid += draw_result.total_prizes_distributed;
        lottery_state.is_rolldown_active = false;

        emit!(WinnersCalculated {
            draw_id: draw_result.draw_id,
            was_rolldown: draw_result.was_rolldown,
            total_prizes: draw_result.total_prizes_distributed,
            match_6_winners: winner_counts.match_6,
            match_5_winners: winner_counts.match_5,
            match_4_winners: winner_counts.match_4,
            match_3_winners: winner_counts.match_3,
            match_2_winners: winner_counts.match_2,
        });

        Ok(())
    }

    // ==================== PRIZE POOL ====================

    /// Claim prize for a winning ticket
    pub fn claim_prize(ctx: Context<ClaimPrize>) -> Result<()> {
        let ticket = &mut ctx.accounts.ticket;
        let draw_result = &ctx.accounts.draw_result;

        // Verify ticket is for this draw
        require!(
            ticket.draw_id == draw_result.draw_id,
            crate::errors::ErrorCode::WrongDraw
        );

        // Verify not already claimed
        require!(!ticket.is_claimed, crate::errors::ErrorCode::AlreadyClaimed);

        // Calculate matches
        let matches = count_matches(&ticket.numbers, &draw_result.winning_numbers);
        ticket.match_count = matches;

        // Determine prize amount
        let prize = match matches {
            6 => draw_result.match_6_prize,
            5 => draw_result.match_5_prize,
            4 => draw_result.match_4_prize,
            3 => draw_result.match_3_prize,
            2 => draw_result.match_2_prize,
            _ => 0,
        };

        ticket.prize_amount = prize;
        ticket.is_claimed = true;

        if prize > 0 {
            if matches == 2 {
                // For Match 2, we would issue a free ticket NFT
                // For now, we'll transfer the ticket price value
                let cpi_accounts = Transfer {
                    from: ctx.accounts.prize_pool_usdc.to_account_info(),
                    to: ctx.accounts.player_usdc.to_account_info(),
                    authority: ctx.accounts.prize_pool_authority.to_account_info(),
                };
                let cpi_program = ctx.accounts.token_program.to_account_info();
                let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
                token::transfer(cpi_ctx, prize)?;
            } else {
                // Transfer prize to winner
                let cpi_accounts = Transfer {
                    from: ctx.accounts.prize_pool_usdc.to_account_info(),
                    to: ctx.accounts.player_usdc.to_account_info(),
                    authority: ctx.accounts.prize_pool_authority.to_account_info(),
                };
                let cpi_program = ctx.accounts.token_program.to_account_info();
                let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
                token::transfer(cpi_ctx, prize)?;
            }

            // Update lottery state
            ctx.accounts.lottery_state.total_prizes_paid += prize;
        }

        emit!(PrizeClaimed {
            ticket_id: ticket.key(),
            player: ctx.accounts.player.key(),
            match_count: matches,
            prize_amount: prize,
            draw_id: ticket.draw_id,
        });

        Ok(())
    }

    /// Initialize the lottery with default parameters
    pub fn initialize_lottery(
        ctx: Context<InitializeLottery>,
        ticket_price: u64,
        house_fee_bps: u16,
        jackpot_cap: u64,
        seed_amount: u64,
    ) -> Result<()> {
        let lottery_state = &mut ctx.accounts.lottery_state;

        lottery_state.authority = ctx.accounts.authority.key();
        lottery_state.current_draw_id = 0;
        lottery_state.jackpot_balance = seed_amount;
        lottery_state.reserve_balance = 0;
        lottery_state.insurance_balance = 0;
        lottery_state.ticket_price = ticket_price;
        lottery_state.house_fee_bps = house_fee_bps;
        lottery_state.jackpot_cap = jackpot_cap;
        lottery_state.seed_amount = seed_amount;
        lottery_state.total_tickets_sold = 0;
        lottery_state.total_prizes_paid = 0;
        lottery_state.last_draw_timestamp = Clock::get()?.unix_timestamp;
        lottery_state.next_draw_timestamp = Clock::get()?.unix_timestamp + DRAW_INTERVAL_SECONDS;
        lottery_state.is_rolldown_active = false;
        lottery_state.is_soft_cap_zone = false;
        lottery_state.is_paused = false;
        lottery_state.bump = ctx.bumps.lottery_state;

        emit!(LotteryInitialized {
            authority: lottery_state.authority,
            ticket_price,
            house_fee_bps,
            jackpot_cap,
            seed_amount,
            start_time: lottery_state.last_draw_timestamp,
        });

        Ok(())
    }
}
