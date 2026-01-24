use anchor_lang::prelude::*;
use anchor_spl::token;
use switchboard_on_demand::accounts::RandomnessAccountData;

declare_id!("3zi12qNicsbBazvKxGqFp8cirL1dFXCijsZzRCPrAGT4");

pub mod constants;
pub mod context;
pub mod errors;
pub mod state;

pub use constants::*;
pub use context::*;

#[program]
pub mod solana_lotto {

    use super::*;
    use crate::errors;
    use crate::state::*;

    /// Initialize the lottery with configuration parameters
    pub fn initialize_lottery(
        ctx: Context<InitializeLottery>,
        ticket_price: u64,
        jackpot_cap: u64,
        seed_amount: u64,
        soft_cap: u64,
        hard_cap: u64,
    ) -> Result<()> {
        let lottery_state = &mut ctx.accounts.lottery_state;

        // Initialize with provided parameters
        lottery_state.set_inner(LotteryState::new(
            ctx.accounts.authority.key(),
            ctx.accounts.switchboard_queue.key(),
            ticket_price,
            jackpot_cap,
            seed_amount,
            soft_cap,
            hard_cap,
            ctx.bumps.lottery_state,
        ));

        // Fund the initial jackpot seed
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token::Transfer {
                    from: ctx.accounts.authority_usdc.to_account_info(),
                    to: ctx.accounts.prize_pool_usdc.to_account_info(),
                    authority: ctx.accounts.authority.to_account_info(),
                },
            ),
            seed_amount,
        )?;

        msg!(
            "Lottery initialized with seed: {} USDC",
            seed_amount / 1_000_000
        );
        Ok(())
    }

    /// Purchase a single lottery ticket
    pub fn buy_ticket(ctx: Context<BuyTicket>, numbers: [u8; NUMBERS_PER_TICKET]) -> Result<()> {
        let lottery_state = &mut ctx.accounts.lottery_state;

        // Validate lottery is active
        require!(!lottery_state.is_paused, errors::ErrorCode::Paused);
        require!(
            !lottery_state.is_draw_in_progress,
            errors::ErrorCode::DrawInProgress
        );

        // Validate numbers
        let lottery_numbers = LotteryNumbers::new(numbers)?;

        // Calculate house fee
        lottery_state.update_house_fee();
        let house_fee_amount =
            calculate_house_fee_amount(lottery_state.ticket_price, lottery_state.house_fee_bps);
        let prize_pool_amount =
            calculate_prize_pool_amount(lottery_state.ticket_price, lottery_state.house_fee_bps);

        // Transfer ticket price: house fee + prize pool
        let cpi_context = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            token::Transfer {
                from: ctx.accounts.player_usdc.to_account_info(),
                to: ctx.accounts.house_fee_usdc.to_account_info(),
                authority: ctx.accounts.player.to_account_info(),
            },
        );
        token::transfer(cpi_context, house_fee_amount)?;

        let cpi_context = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            token::Transfer {
                from: ctx.accounts.player_usdc.to_account_info(),
                to: ctx.accounts.prize_pool_usdc.to_account_info(),
                authority: ctx.accounts.player.to_account_info(),
            },
        );
        token::transfer(cpi_context, prize_pool_amount)?;

        // Allocate prize pool to jackpot and fixed prizes
        let jackpot_allocation = (prize_pool_amount as u128 * JACKPOT_ALLOCATION_BPS as u128
            / BPS_PER_100_PERCENT as u128) as u64;
        let fixed_prize_allocation = (prize_pool_amount as u128
            * FIXED_PRIZE_ALLOCATION_BPS as u128
            / BPS_PER_100_PERCENT as u128) as u64;
        let reserve_allocation = (prize_pool_amount as u128 * RESERVE_ALLOCATION_BPS as u128
            / BPS_PER_100_PERCENT as u128) as u64;

        lottery_state.jackpot_balance += jackpot_allocation;
        lottery_state.insurance_balance += fixed_prize_allocation;
        lottery_state.reserve_balance += reserve_allocation;

        // Create ticket account
        let ticket = TicketData::new(
            ctx.accounts.player.key(),
            lottery_state.current_draw_id,
            lottery_numbers,
            None, // No syndicate by default
        );

        ctx.accounts.ticket.set_inner(ticket);

        msg!(
            "Ticket purchased for draw {}",
            lottery_state.current_draw_id
        );
        Ok(())
    }

    /// Start a new draw (commit phase)
    pub fn start_draw(ctx: Context<StartDraw>) -> Result<()> {
        let lottery_state = &mut ctx.accounts.lottery_state;

        // Validate draw can start
        require!(
            lottery_state.is_draw_time(),
            errors::ErrorCode::DrawNotReady
        );
        require!(
            !lottery_state.is_draw_in_progress,
            errors::ErrorCode::DrawInProgress
        );
        require!(!lottery_state.is_paused, errors::ErrorCode::Paused);

        // Check if rolldown should be active
        if lottery_state.jackpot_balance >= lottery_state.hard_cap {
            lottery_state.is_rolldown_active = true;
        } else if lottery_state.jackpot_balance > lottery_state.soft_cap {
            // Use a deterministic value from blockhash for probabilistic check
            let blockhash = ctx.accounts.clock.slot;
            lottery_state.is_rolldown_active = lottery_state.should_trigger_rolldown(blockhash);
        } else {
            lottery_state.is_rolldown_active = false;
        }

        // Update house fee for this draw
        lottery_state.update_house_fee();

        // Start draw cycle
        lottery_state.start_draw();

        // Store current randomness account reference
        lottery_state.current_randomness_account = ctx.accounts.randomness_account_data.key();

        msg!(
            "Draw {} started. Rolldown active: {}",
            lottery_state.current_draw_id,
            lottery_state.is_rolldown_active
        );
        Ok(())
    }

    /// Execute draw with revealed randomness (reveal phase)
    pub fn execute_draw(ctx: Context<ExecuteDraw>) -> Result<()> {
        let clock = Clock::get()?;
        let lottery_state = &mut ctx.accounts.lottery_state;

        // Validate draw is in progress
        require!(
            lottery_state.is_draw_in_progress,
            errors::ErrorCode::DrawNotInProgress
        );

        // SECURITY: Verify randomness account matches stored reference
        if ctx.accounts.randomness_account_data.key() != lottery_state.current_randomness_account {
            return Err(errors::ErrorCode::InvalidRandomnessAccount.into());
        }

        // Parse Switchboard randomness data
        let randomness_data =
            RandomnessAccountData::parse(ctx.accounts.randomness_account_data.data.borrow())
                .map_err(|_| errors::ErrorCode::RandomnessNotResolved)?;

        // SECURITY: Verify freshness (committed in previous slot)
        if randomness_data.seed_slot != clock.slot - 1 {
            msg!("seed_slot: {}", randomness_data.seed_slot);
            msg!("current slot: {}", clock.slot);
            return Err(errors::ErrorCode::RandomnessNotFresh.into());
        }

        // SECURITY: Ensure randomness hasn't been revealed yet
        if !randomness_data.get_value(clock.slot).is_err() {
            return Err(errors::ErrorCode::RandomnessAlreadyRevealed.into());
        }

        // Get the revealed random value (32 bytes)
        let random_bytes = randomness_data
            .get_value(clock.slot)
            .map_err(|_| errors::ErrorCode::RandomnessNotResolved)?;

        // Generate winning lottery numbers from randomness
        let mut winning_numbers = [0u8; NUMBERS_PER_TICKET];
        let mut used = [false; MAX_NUMBER as usize + 1];

        for i in 0..NUMBERS_PER_TICKET {
            // Use different bytes for each number
            let byte_index = (i * 3) % 32;
            let mut candidate = (random_bytes[byte_index] % MAX_NUMBER) + 1;

            // Ensure uniqueness with linear probing
            while used[candidate as usize] {
                candidate = (candidate % MAX_NUMBER) + 1;
            }

            winning_numbers[i] = candidate;
            used[candidate as usize] = true;
        }

        winning_numbers.sort();

        // Store draw result - need to convert 32 bytes to 64 bytes for VRF proof
        let mut vrf_proof = [0u8; 64];
        vrf_proof[..32].copy_from_slice(&random_bytes);
        // Use blockhash for remaining 32 bytes for demonstration
        let blockhash_bytes = ctx.accounts.clock.slot.to_le_bytes();
        vrf_proof[32..40].copy_from_slice(&blockhash_bytes);

        let draw_result = DrawResult::new(
            lottery_state.current_draw_id,
            winning_numbers,
            vrf_proof,
            0, // Total tickets will be updated from indexer
            lottery_state.is_rolldown_active,
        );

        ctx.accounts.draw_result.set_inner(draw_result);

        // Complete draw cycle
        lottery_state.complete_draw();

        // Reset rolldown status
        lottery_state.is_rolldown_active = false;

        // Reset jackpot if there was a winner (will be updated during prize distribution)
        // If no jackpot winner, jackpot rolls over automatically

        msg!(
            "Draw {} executed. Winning numbers: {:?}",
            lottery_state.current_draw_id - 1,
            winning_numbers
        );
        Ok(())
    }

    /// Claim prize for a winning ticket
    pub fn claim_prize(ctx: Context<ClaimPrize>) -> Result<()> {
        let ticket = &mut ctx.accounts.ticket;

        // Validate ticket
        require!(!ticket.is_claimed, errors::ErrorCode::AlreadyClaimed);
        require!(ticket.match_count >= 2, errors::ErrorCode::NoPrizeToClaim);

        // Get draw result to calculate prize
        let draw_result = &ctx.accounts.draw_result;
        let prize_amount = draw_result.calculate_prize(ticket.match_count);

        require!(prize_amount > 0, errors::ErrorCode::NoPrizeToClaim);

        // Transfer prize from prize pool to player
        let cpi_context = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            token::Transfer {
                from: ctx.accounts.prize_pool_usdc.to_account_info(),
                to: ctx.accounts.player_usdc.to_account_info(),
                authority: ctx.accounts.prize_pool_authority.to_account_info(),
            },
        );
        token::transfer(cpi_context, prize_amount)?;

        // Mark ticket as claimed
        ticket.is_claimed = true;
        ticket.prize_amount = prize_amount;

        // Update lottery state if jackpot was won
        if ticket.match_count == 6 {
            let lottery_state = &mut ctx.accounts.lottery_state;
            lottery_state.jackpot_balance = lottery_state.seed_amount; // Reset to seed
        }

        msg!("Prize claimed: {} USDC", prize_amount / 1_000_000);
        Ok(())
    }

    /// Admin function to pause/unpause lottery
    pub fn set_paused(ctx: Context<SetPaused>, paused: bool) -> Result<()> {
        let lottery_state = &mut ctx.accounts.lottery_state;
        require!(
            lottery_state.authority == ctx.accounts.authority.key(),
            errors::ErrorCode::AdminAuthorityRequired
        );

        lottery_state.is_paused = paused;

        if paused {
            msg!("Lottery paused");
        } else {
            msg!("Lottery resumed");
        }

        Ok(())
    }
}
