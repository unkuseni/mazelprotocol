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
        // Validate lottery is not paused
        require!(
            !ctx.accounts.lottery_state.is_paused,
            crate::errors::ErrorCode::LotteryPaused
        );

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

        // Update lottery state and get ticket_id
        let lottery_state = &mut ctx.accounts.lottery_state;
        let ticket_id = lottery_state.total_tickets_sold;

        lottery_state.jackpot_balance += jackpot_contribution;
        lottery_state.reserve_balance += reserve_buffer;
        lottery_state.total_tickets_sold += 1;

        let mut sorted_numbers = numbers;
        sorted_numbers.sort();

        let ticket = &mut ctx.accounts.ticket;
        ticket.owner = ctx.accounts.player.key();
        ticket.draw_id = lottery_state.current_draw_id;
        ticket.ticket_id = ticket_id;
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

    /// Purchase multiple tickets in one transaction using TicketBatch for efficient storage
    /// This creates a NEW batch account and stores ALL tickets, solving the "lost tickets" bug
    /// For adding more tickets to an existing batch, use `add_to_batch`
    pub fn buy_bulk(ctx: Context<BuyTicketBatch>, tickets: Vec<[u8; NUMBERS_COUNT]>) -> Result<()> {
        // Validate lottery is not paused
        require!(
            !ctx.accounts.lottery_state.is_paused,
            crate::errors::ErrorCode::LotteryPaused
        );

        require!(!tickets.is_empty(), crate::errors::ErrorCode::NoTickets);
        require!(
            tickets.len() <= TicketBatch::MAX_TICKETS,
            crate::errors::ErrorCode::TooManyTickets
        );

        // Validate all ticket numbers before processing
        for numbers in tickets.iter() {
            validate_numbers(numbers)?;
        }

        // Calculate total price
        let ticket_count = tickets.len() as u64;
        let total_price = TICKET_PRICE * ticket_count;

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
        let start_ticket_id = lottery_state.total_tickets_sold;

        lottery_state.jackpot_balance += jackpot_contribution;
        lottery_state.reserve_balance += reserve_buffer;

        // Initialize the new ticket batch
        let ticket_batch = &mut ctx.accounts.ticket_batch;
        let current_timestamp = Clock::get()?.unix_timestamp;

        ticket_batch.owner = ctx.accounts.player.key();
        ticket_batch.draw_id = lottery_state.current_draw_id;
        ticket_batch.start_ticket_id = start_ticket_id;
        ticket_batch.bump = ctx.bumps.ticket_batch;
        ticket_batch.tickets = Vec::with_capacity(tickets.len());

        // Store ALL tickets in the batch
        for numbers in tickets.iter() {
            let mut sorted_numbers = *numbers;
            sorted_numbers.sort();

            let ticket_entry = TicketEntry {
                numbers: sorted_numbers,
                purchase_timestamp: current_timestamp,
                is_claimed: false,
                prize_amount: 0,
                match_count: 0,
            };

            ticket_batch.tickets.push(ticket_entry);

            // Emit event for each ticket
            emit!(TicketPurchased {
                ticket_id: ticket_batch.key(),
                player: ctx.accounts.player.key(),
                draw_id: lottery_state.current_draw_id,
                numbers: sorted_numbers,
                timestamp: current_timestamp,
            });
        }

        // Update total tickets sold
        lottery_state.total_tickets_sold += ticket_count;

        emit!(BulkTicketsPurchased {
            player: ctx.accounts.player.key(),
            draw_id: lottery_state.current_draw_id,
            ticket_count: ticket_count as u32,
            total_amount: total_price,
        });

        Ok(())
    }

    /// Add more tickets to an existing batch (for players who want to buy more tickets in same draw)
    pub fn add_to_batch(
        ctx: Context<AddToTicketBatch>,
        tickets: Vec<[u8; NUMBERS_COUNT]>,
    ) -> Result<()> {
        // Validate lottery is not paused
        require!(
            !ctx.accounts.lottery_state.is_paused,
            crate::errors::ErrorCode::LotteryPaused
        );

        require!(!tickets.is_empty(), crate::errors::ErrorCode::NoTickets);

        let ticket_batch = &ctx.accounts.ticket_batch;

        // Check we won't exceed max tickets in batch
        require!(
            ticket_batch.tickets.len() + tickets.len() <= TicketBatch::MAX_TICKETS,
            crate::errors::ErrorCode::BatchFull
        );

        // Validate all ticket numbers before processing
        for numbers in tickets.iter() {
            validate_numbers(numbers)?;
        }

        // Calculate total price
        let ticket_count = tickets.len() as u64;
        let total_price = TICKET_PRICE * ticket_count;

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

        // Add tickets to existing batch
        let ticket_batch = &mut ctx.accounts.ticket_batch;
        let current_timestamp = Clock::get()?.unix_timestamp;

        for numbers in tickets.iter() {
            let mut sorted_numbers = *numbers;
            sorted_numbers.sort();

            let ticket_entry = TicketEntry {
                numbers: sorted_numbers,
                purchase_timestamp: current_timestamp,
                is_claimed: false,
                prize_amount: 0,
                match_count: 0,
            };

            ticket_batch.tickets.push(ticket_entry);

            // Emit event for each ticket
            emit!(TicketPurchased {
                ticket_id: ticket_batch.key(),
                player: ctx.accounts.player.key(),
                draw_id: lottery_state.current_draw_id,
                numbers: sorted_numbers,
                timestamp: current_timestamp,
            });
        }

        // Update total tickets sold
        lottery_state.total_tickets_sold += ticket_count;

        emit!(BulkTicketsPurchased {
            player: ctx.accounts.player.key(),
            draw_id: lottery_state.current_draw_id,
            ticket_count: ticket_count as u32,
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
        // Validate lottery is not paused
        require!(
            !ctx.accounts.lottery_state.is_paused,
            crate::errors::ErrorCode::LotteryPaused
        );

        // In production, would verify NFT ownership and validity
        // For now, we'll just validate numbers and create a free ticket

        validate_numbers(&numbers)?;

        // Create free ticket (no payment required)
        let mut sorted_numbers = numbers;
        sorted_numbers.sort();

        let lottery_state = &mut ctx.accounts.lottery_state;
        let ticket_id = lottery_state.total_tickets_sold;

        let ticket = &mut ctx.accounts.ticket;
        ticket.owner = ctx.accounts.player.key();
        ticket.draw_id = lottery_state.current_draw_id;
        ticket.ticket_id = ticket_id;
        ticket.numbers = sorted_numbers;
        ticket.purchase_timestamp = Clock::get()?.unix_timestamp;
        ticket.is_claimed = false;
        ticket.prize_amount = 0;
        ticket.match_count = 0;
        ticket.syndicate = None;

        // Update ticket count
        lottery_state.total_tickets_sold += 1;

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
    ///
    /// SECURITY NOTE: This function currently accepts manual random number input.
    /// For production use, this MUST be replaced with verifiable randomness.
    ///
    /// TODO: Integrate with Switchboard VRF or Chainlink VRF:
    /// 1. Request randomness from VRF oracle in a separate instruction
    /// 2. VRF callback delivers verified random bytes
    /// 3. Convert random bytes to lottery numbers
    /// 4. Store VRF proof on-chain for auditability
    ///
    /// Example Switchboard integration:
    /// ```ignore
    /// use switchboard_v2::VrfAccountData;
    ///
    /// // In execute_draw, verify the VRF result:
    /// let vrf = ctx.accounts.vrf.load()?;
    /// let result_buffer = vrf.get_result()?;
    /// require!(!result_buffer.iter().all(|&x| x == 0), ErrorCode::VrfNotResolved);
    ///
    /// // Convert VRF result to lottery numbers
    /// let random_numbers = vrf_result_to_lottery_numbers(&result_buffer);
    /// ```
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
    ///
    /// SECURITY NOTE: This function currently accepts manual winner counts.
    /// For a trustless system, winner verification should happen on-chain.
    ///
    /// Current limitations and future improvements:
    /// 1. Winner counts are provided by admin (trusted backend)
    /// 2. For full decentralization, implement one of:
    ///    a) Merkle tree of ticket hashes - verify inclusion proofs on-chain
    ///    b) ZK proofs - verify winner counts without revealing all tickets
    ///    c) On-chain ticket iteration (expensive but trustless)
    ///
    /// The current design is "Web2.5" - backend calculates, contract executes.
    /// This is acceptable for MVP if the backend is auditable and transparent.
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

    /// Claim prize for a winning ticket (individual ticket)
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
            // Build PDA signer seeds for prize pool authority
            let seeds = &[
                b"prize_pool_auth".as_ref(),
                &[ctx.bumps.prize_pool_authority],
            ];
            let signer_seeds = &[&seeds[..]];

            // Transfer prize to winner
            let cpi_accounts = Transfer {
                from: ctx.accounts.prize_pool_usdc.to_account_info(),
                to: ctx.accounts.player_usdc.to_account_info(),
                authority: ctx.accounts.prize_pool_authority.to_account_info(),
            };
            let cpi_program = ctx.accounts.token_program.to_account_info();
            let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
            token::transfer(cpi_ctx, prize)?;

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

    /// Claim prize for a ticket in a batch
    /// ticket_index is the position of the ticket within the batch (0-indexed)
    pub fn claim_batch_prize(ctx: Context<ClaimBatchPrize>, ticket_index: u32) -> Result<()> {
        let ticket_batch = &mut ctx.accounts.ticket_batch;
        let draw_result = &ctx.accounts.draw_result;

        // Verify batch is for this draw
        require!(
            ticket_batch.draw_id == draw_result.draw_id,
            crate::errors::ErrorCode::WrongDraw
        );

        // Verify ticket index is valid
        require!(
            (ticket_index as usize) < ticket_batch.tickets.len(),
            crate::errors::ErrorCode::InvalidTicketIndex
        );

        let ticket_entry = &mut ticket_batch.tickets[ticket_index as usize];

        // Verify not already claimed
        require!(
            !ticket_entry.is_claimed,
            crate::errors::ErrorCode::AlreadyClaimed
        );

        // Calculate matches
        let matches = count_matches(&ticket_entry.numbers, &draw_result.winning_numbers);
        ticket_entry.match_count = matches;

        // Determine prize amount
        let prize = match matches {
            6 => draw_result.match_6_prize,
            5 => draw_result.match_5_prize,
            4 => draw_result.match_4_prize,
            3 => draw_result.match_3_prize,
            2 => draw_result.match_2_prize,
            _ => 0,
        };

        ticket_entry.prize_amount = prize;
        ticket_entry.is_claimed = true;

        if prize > 0 {
            // Build PDA signer seeds for prize pool authority
            let seeds = &[
                b"prize_pool_auth".as_ref(),
                &[ctx.bumps.prize_pool_authority],
            ];
            let signer_seeds = &[&seeds[..]];

            // Transfer prize to winner
            let cpi_accounts = Transfer {
                from: ctx.accounts.prize_pool_usdc.to_account_info(),
                to: ctx.accounts.player_usdc.to_account_info(),
                authority: ctx.accounts.prize_pool_authority.to_account_info(),
            };
            let cpi_program = ctx.accounts.token_program.to_account_info();
            let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
            token::transfer(cpi_ctx, prize)?;

            // Update lottery state
            ctx.accounts.lottery_state.total_prizes_paid += prize;
        }

        emit!(BatchPrizeClaimed {
            batch_id: ticket_batch.key(),
            ticket_index,
            player: ctx.accounts.player.key(),
            match_count: matches,
            prize_amount: prize,
            draw_id: ticket_batch.draw_id,
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

    // ==================== ADMIN FUNCTIONS ====================

    /// Pause the lottery (emergency stop)
    pub fn pause_lottery(ctx: Context<AdminAction>) -> Result<()> {
        ctx.accounts.lottery_state.is_paused = true;
        Ok(())
    }

    /// Unpause the lottery
    pub fn unpause_lottery(ctx: Context<AdminAction>) -> Result<()> {
        ctx.accounts.lottery_state.is_paused = false;
        Ok(())
    }
}
