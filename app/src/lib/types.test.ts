import { describe, expect, it } from "vitest";
import { mapRawToLotteryState } from "./types";

/** Minimal BN-like object as returned by @coral-xyz/anchor */
const bn = (value: number) => ({
  toNumber: () => value,
});

/** PublicKey-like object */
const pubkey = (base58: string) => ({
  toBase58: () => base58,
});

describe("mapRawToLotteryState", () => {
  it("returns null for null input", () => {
    expect(mapRawToLotteryState(null)).toBeNull();
  });

  it("maps snake_case on-chain fields (Anchor fetch output)", () => {
    const raw = {
      authority: pubkey("11111111111111111111111111111111"),
      current_draw_id: bn(7),
      jackpot_balance: bn(1_750_000_000_000),
      reserve_balance: bn(500_000_000_000),
      insurance_balance: bn(250_000_000_000),
      fixed_prize_balance: bn(1_000_000_000),
      ticket_price: bn(2_500_000),
      house_fee_bps: 2800,
      jackpot_cap: bn(1_750_000_000_000),
      seed_amount: bn(500_000_000_000),
      soft_cap: bn(1_750_000_000_000),
      hard_cap: bn(2_250_000_000_000),
      next_draw_timestamp: bn(1_800_000_000),
      current_draw_tickets: bn(42),
      total_tickets_sold: bn(1000),
      total_prizes_paid: bn(0),
      is_draw_in_progress: false,
      is_rolldown_active: true,
      is_paused: false,
      is_funded: true,
    };

    const state = mapRawToLotteryState(raw);
    expect(state).not.toBeNull();
    expect(state!.authority).toBe("11111111111111111111111111111111");
    expect(state!.currentDrawId).toBe(7);
    expect(state!.jackpotBalance).toBe(1_750_000_000_000n);
    expect(state!.ticketPrice).toBe(2_500_000n);
    expect(state!.houseFeeBps).toBe(2800);
    expect(state!.currentDrawTickets).toBe(42);
    expect(state!.isRolldownActive).toBe(true);
    expect(state!.isPaused).toBe(false);
    expect(state!.isFunded).toBe(true);
  });

  it("maps camelCase pre-mapped fields", () => {
    const raw = {
      authority: "11111111111111111111111111111111",
      currentDrawId: 3,
      jackpotBalance: bn(900_000_000_000),
      reserveBalance: bn(0),
      insuranceBalance: bn(100_000_000),
      fixedPrizeBalance: bn(50_000_000),
      ticketPrice: bn(2_500_000),
      houseFeeBps: 2800,
      jackpotCap: bn(1_750_000_000_000),
      seedAmount: bn(500_000_000_000),
      softCap: bn(1_750_000_000_000),
      hardCap: bn(2_250_000_000_000),
      nextDrawTimestamp: bn(1_800_000_000),
      currentDrawTickets: 12,
      totalTicketsSold: bn(999),
      totalPrizesPaid: bn(42_000_000),
      isDrawInProgress: false,
      isRolldownActive: false,
      isPaused: true,
      isFunded: true,
    };

    const state = mapRawToLotteryState(raw);
    expect(state).not.toBeNull();
    expect(state!.currentDrawId).toBe(3);
    expect(state!.jackpotBalance).toBe(900_000_000_000n);
    expect(state!.isPaused).toBe(true);
    expect(state!.totalTicketsSold).toBe(999n);
  });

  it("handles numeric and string values gracefully", () => {
    const state = mapRawToLotteryState({
      current_draw_id: 5,
      jackpot_balance: "1750000000000",
      house_fee_bps: "2800",
      // unknown field should be coerced to defaults, not crash
      garbage: "ignore me",
    } as never);
    expect(state).not.toBeNull();
    expect(state!.currentDrawId).toBe(5);
    expect(state!.jackpotBalance).toBe(1_750_000_000_000n);
    expect(state!.houseFeeBps).toBe(2800);
    expect(state!.authority).toBe("");
  });

  it("coerces missing fields to safe defaults", () => {
    const state = mapRawToLotteryState({} as never);
    expect(state).not.toBeNull();
    expect(state!.currentDrawId).toBe(0);
    expect(state!.jackpotBalance).toBe(0n);
    expect(state!.isPaused).toBe(false);
  });
});
