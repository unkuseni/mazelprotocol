import type { BN } from "@coral-xyz/anchor";

/* -------------------------------------------------------------------------- */
/*  Lottery State                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Raw on-chain LotteryState account data as returned by Anchor.
 * All u64/i64 fields are BN objects; pubkeys are base58 strings after mapping.
 *
 * Mirrors the `LotteryState` account in the solana_lotto IDL.
 */
export interface RawLotteryState {
	authority: string;
	pendingAuthority: string | null;
	switchboardQueue: string;
	currentRandomnessAccount: string;
	currentDrawId: BN;
	jackpotBalance: BN;
	reserveBalance: BN;
	insuranceBalance: BN;
	fixedPrizeBalance: BN;
	ticketPrice: BN;
	houseFeeBps: number; // u16
	jackpotCap: BN;
	seedAmount: BN;
	softCap: BN;
	hardCap: BN;
	nextDrawTimestamp: BN;
	drawInterval: BN;
	commitSlot: BN;
	commitTimestamp: BN;
	currentDrawTickets: BN;
	totalTicketsSold: BN;
	totalPrizesPaid: BN;
	totalPrizesCommitted: BN;
	isDrawInProgress: boolean;
	isRolldownActive: boolean;
	isPaused: boolean;
	isFunded: boolean;
	bump: number; // u8
	configTimelockEnd: BN;
	pendingConfigHash: number[]; // [u8; 32]
	emergencyTransferTotal: BN;
	emergencyTransferWindowStart: BN;
}

/**
 * Mirrors the on-chain LotteryState account with camelCase field names.
 * Suitable for UI consumption — pubkeys are strings, monetary values are bigint.
 */
export interface LotteryState {
	authority: string;
	currentDrawId: number;
	jackpotBalance: bigint;
	reserveBalance: bigint;
	insuranceBalance: bigint;
	fixedPrizeBalance: bigint;
	ticketPrice: bigint;
	houseFeeBps: number;
	jackpotCap: bigint;
	seedAmount: bigint;
	softCap: bigint;
	hardCap: bigint;
	nextDrawTimestamp: bigint;
	currentDrawTickets: number;
	totalTicketsSold: bigint;
	totalPrizesPaid: bigint;
	isDrawInProgress: boolean;
	isRolldownActive: boolean;
	isPaused: boolean;
	isFunded: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Mapping helpers                                                           */
/* -------------------------------------------------------------------------- */

/** Convert a BN or number to a bigint */
function toBigInt(value: unknown): bigint {
	if (typeof value === "bigint") return value;
	if (typeof value === "number") return BigInt(Math.trunc(value));
	if (typeof value === "string") {
		try {
			return BigInt(value);
		} catch {
			return 0n;
		}
	}
	if (
		typeof value === "object" &&
		value !== null &&
		"toString" in value &&
		typeof (value as { toString: () => string }).toString === "function"
	) {
		// BN from @coral-xyz/anchor. Prefer toString() (exact decimal) over
		// toNumber() — the latter loses precision above 2^53 (review L4).
		try {
			return BigInt((value as { toString: () => string }).toString());
		} catch {
			return 0n;
		}
	}
	return 0n;
}

/** Convert a BN or number to a plain number (safe for u32 or smaller) */
function toNumber(value: unknown): number {
	if (typeof value === "number") return value;
	if (typeof value === "bigint") return Number(value);
	if (
		typeof value === "object" &&
		value !== null &&
		"toNumber" in value &&
		typeof (value as { toNumber: () => number }).toNumber === "function"
	) {
		return (value as { toNumber: () => number }).toNumber();
	}
	if (typeof value === "string") {
		const n = parseInt(value, 10);
		return Number.isNaN(n) ? 0 : n;
	}
	return 0;
}

/** Convert a base58 pubkey or PublicKey object to a string */
function toPubkey(value: unknown): string {
	if (typeof value === "string") return value;
	if (
		typeof value === "object" &&
		value !== null &&
		"toBase58" in value &&
		typeof (value as { toBase58: () => string }).toBase58 === "function"
	) {
		return (value as { toBase58: () => string }).toBase58();
	}
	return "";
}

/**
 * Map a raw Record<string,unknown> from Anchor's `account.lotteryState.fetch()`
 * into a strongly-typed `LotteryState` object.
 *
 * Handles both snake_case (on-chain) and camelCase (pre-mapped) keys.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapRawToLotteryState(
	raw: Record<string, any> | null,
): LotteryState | null {
	if (!raw) return null;

	// Support both snake_case (direct from chain) and camelCase (pre-mapped)
	const get = (snake: string, camel: string): unknown => {
		if (raw[snake] !== undefined) return raw[snake];
		return raw[camel];
	};

	return {
		authority: toPubkey(get("authority", "authority")),
		currentDrawId: toNumber(get("current_draw_id", "currentDrawId")),
		jackpotBalance: toBigInt(get("jackpot_balance", "jackpotBalance")),
		reserveBalance: toBigInt(get("reserve_balance", "reserveBalance")),
		insuranceBalance: toBigInt(get("insurance_balance", "insuranceBalance")),
		fixedPrizeBalance: toBigInt(
			get("fixed_prize_balance", "fixedPrizeBalance"),
		),
		ticketPrice: toBigInt(get("ticket_price", "ticketPrice")),
		houseFeeBps: toNumber(get("house_fee_bps", "houseFeeBps")),
		jackpotCap: toBigInt(get("jackpot_cap", "jackpotCap")),
		seedAmount: toBigInt(get("seed_amount", "seedAmount")),
		softCap: toBigInt(get("soft_cap", "softCap")),
		hardCap: toBigInt(get("hard_cap", "hardCap")),
		nextDrawTimestamp: toBigInt(
			get("next_draw_timestamp", "nextDrawTimestamp"),
		),
		currentDrawTickets: toNumber(
			get("current_draw_tickets", "currentDrawTickets"),
		),
		totalTicketsSold: toBigInt(get("total_tickets_sold", "totalTicketsSold")),
		totalPrizesPaid: toBigInt(get("total_prizes_paid", "totalPrizesPaid")),
		isDrawInProgress: Boolean(get("is_draw_in_progress", "isDrawInProgress")),
		isRolldownActive: Boolean(get("is_rolldown_active", "isRolldownActive")),
		isPaused: Boolean(get("is_paused", "isPaused")),
		isFunded: Boolean(get("is_funded", "isFunded")),
	};
}
