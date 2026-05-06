# MazelProtocol — Protocol Invariants

> Mathematical invariants that the protocol must maintain at all times.
> These are checked by the test suite and should be verified by auditors.

## Economic Invariants

1. **Conservation of Value**:
   ```
   jackpot_balance + reserve_balance + insurance_balance + fixed_prize_balance
   + total_prizes_paid + accumulated_house_fees
   == total_tickets_sold × ticket_price
   ```

2. **Pari-Mutuel Cap** (during rolldown):
   ```
   Σ (prize_per_winner_tier × winner_count_tier) ≤ jackpot_at_draw
   ```

3. **Cap Ordering** (at all times):
   ```
   seed_amount < soft_cap < hard_cap
   ```

## State Invariants

4. **Ticket Uniqueness**: No two tickets can have the same (owner, draw_id, index).

5. **Draw Monotonicity**: `current_draw_id` never decreases.

6. **Claim State**: Once `ticket.is_claimed == true`, `ticket.prize_amount` is immutable.

7. **Funded Flag**: `is_funded` is set once on initialization, never cleared.

## Temporal Invariants

8. **Ticket-Draw Ordering**: For any ticket, `purchase_timestamp < draw.execution_timestamp`.

9. **Claim Expiry**: Tickets claimed after `TICKET_CLAIM_EXPIRATION` seconds from `draw.timestamp` are rejected.

## Parameter Invariants

10. Valid ranges: `ticket_price > 0`, `house_fee_bps ≤ 5000` (max 50%), `draw_interval ≥ 3600` and `≤ 604800`.

11. `seed_amount > 0`, `soft_cap > seed_amount`, `hard_cap > soft_cap`.

## Verification

To verify these invariants on-chain, call the permissionless `check_solvency` instruction. To verify off-chain, use the indexer to compute:
```bash
solana account <PRIZE_POOL_USDC_PDA>  # Compare with lottery_state.* balances
```
