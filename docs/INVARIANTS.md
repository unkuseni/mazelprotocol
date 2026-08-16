# MazelProtocol — Protocol Invariants

> Mathematical invariants that the protocol must maintain at all times.
> These are checked by the test suite and should be verified by auditors.

## Economic Invariants

1. **Conservation of Value**:
   ```
   prize_pool_usdc (token balance)
   == jackpot_balance + reserve_balance + fixed_prize_balance
      + unclaimed committed prizes
   ```
   where `unclaimed committed prizes` tracks what was promised at
   finalization but not yet paid out (`total_prizes_committed −
   total_prizes_paid`, adjusted for reclaims).

   **Post-audit accounting model (v3.1):** the committed liability for each
   draw (base prizes + pre-funded streak bonus) is deducted from the
   accounting buckets **at finalization time** via
   `LotteryState::commit_prize_liability` / `QuickPickState::commit_prize_liability`,
   BEFORE the jackpot is re-seeded. Claim instructions transfer USDC from
   the prize-pool token account and only update the lifetime `total_prizes_paid`
   counter — they never touch the buckets. This guarantees that claims on
   past draws can never drain the re-seeded jackpot or push
   `jackpot_balance` below `seed_amount` (which would halt ticket sales).

2. **Pari-Mutuel Cap** (during rolldown):
   ```
   Σ (prize_per_winner_tier × winner_count_tier) ≤ jackpot_at_draw
   ```

3. **Cap Ordering** (at all times):
   ```
   seed_amount < soft_cap < hard_cap
   ```

4. **Insurance Pool Backing** (v3.0 — L-4 fix):
   ```
   insurance_pool_usdc (token account) ≥ insurance_balance (accounting)
   ```
   Whenever `finalize_draw` uses insurance to cover a prize shortfall, the
   **actual USDC** is transferred from `insurance_pool_usdc` into
   `prize_pool_usdc` — the accounting balance and the token balance move
   together. Finalization fails with `InsufficientInsuranceFunds` if the token
   account cannot cover the declared balance. Quick Pick exposes an explicit
   `sweep_insurance` instruction for the same purpose.

5. **LP Pool Conservation**:
   ```
   lp_pool_usdc (token account) ≥ total_deposits + accumulated_rewards
   ```
   LP withdrawals and reward claims both draw from `lp_pool_usdc`; shares are
   priced as `shares × total_deposits / total_shares`. Claiming rewards must
   never eat into deposit backing.

## State Invariants

6. **Ticket Uniqueness**: No two tickets can have the same (owner, draw_id, index).

7. **Draw Monotonicity**: `current_draw_id` never decreases.

8. **Claim State**: Once `ticket.is_claimed == true`, `ticket.prize_amount` is immutable.

9. **Funded Flag**: `is_funded` is set once on initialization, never cleared.

10. **Syndicate Pending Tickets** (v3.0 — security fix): A syndicate can only
    materialize as many ticket accounts via `create_syndicate_ticket` as it has
    `pending_tickets` credits, and credits are scoped to the current draw
    (`pending_tickets_draw == current_draw_id`). This prevents minting free
    tickets — especially with winning numbers revealed after `execute_draw`.
    `create_syndicate_ticket` is additionally gated to the ticket-sale window.

## Temporal Invariants

11. **Ticket-Draw Ordering**: For any ticket, `purchase_timestamp < draw.execution_timestamp`.

12. **Claim Expiry**: Tickets claimed after `TICKET_CLAIM_EXPIRATION` seconds from `draw.timestamp` are rejected.

## Parameter Invariants

13. Valid ranges: `ticket_price > 0`, `house_fee_bps ≤ 5000` (max 50%), `draw_interval ≥ 3600` and `≤ 604800`.

14. `seed_amount > 0`, `soft_cap > seed_amount`, `hard_cap > soft_cap`.

## Verification

To verify these invariants on-chain, call the permissionless `check_solvency` instruction. To verify off-chain, use the indexer to compute:
```bash
solana account <PRIZE_POOL_USDC_PDA>  # Compare with lottery_state.* balances
```
The Rust test suite also asserts the account layouts directly: `test_*_len_matches_serialized_size`
serializes each account struct and verifies the hand-computed `LEN` constant fits the actual
Borsh layout — catching silent breakage when a field is added without updating the size constant.
