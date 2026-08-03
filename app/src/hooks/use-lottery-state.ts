import { useMemo } from "react";
import { useMainLotteryState } from "@/lib/anchor/hooks";
import { type LotteryState, mapRawToLotteryState } from "@/lib/types";

/**
 * Fallback jackpot when on-chain data is unavailable.
 *
 * SECURITY (review M5): this was previously a fabricated value ($1,247,832)
 * that was displayed as live data whenever the on-chain fetch failed —
 * users were misled into thinking the jackpot existed. It is now 0, and
 * consumers should render "--" (not a fake number) when the chain is
 * unreachable.
 */
const FALLBACK_JACKPOT_DOLLARS = 0;

/**
 * Soft cap for the rolldown progress bar, in USDC.
 */
export const SOFT_CAP_USDC = 1_750_000;

/**
 * USDC has 6 decimal places on-chain.
 * Divide raw lamport values by this to get USDC dollars.
 */
export const USDC_DECIMALS = 6;

/** Convert a bigint base-unit value to a dollar number */
function baseUnitsToDollars(baseUnits: bigint): number {
	return Number(baseUnits) / 10 ** USDC_DECIMALS;
}

export interface UseLotteryStateReturn {
	/** Typed lottery state from on-chain, or null if not yet fetched */
	state: LotteryState | null;
	/** Whether the initial fetch is in progress */
	loading: boolean;
	/** Error message if the fetch failed */
	error: string | null;
	/** Manually refetch the lottery state */
	refetch: () => void;
	/* ---------------------------------------------------------------------- */
	/*  Derived convenience values (computed from state)                      */
	/* ---------------------------------------------------------------------- */
	/** Jackpot balance in USDC dollars (number for display) */
	jackpotDollars: number;
	/** Whether rolldown mode is active */
	rolldownActive: boolean;
	/** Current draw ID, or null if unknown */
	drawId: number | null;
	/** Tickets sold in the current draw */
	ticketsSold: number | null;
	/** Whether the lottery is paused */
	isPaused: boolean;
	/**
	 * On-chain next draw time in milliseconds (epoch ms) for countdown clocks.
	 * null when the chain is unreachable — callers should fall back to a
	 * "schedule unknown" state rather than a fabricated time (review L3).
	 */
	nextDrawTimeMs: number | null;
	/** Whether ticket sales are open for the current draw (advisory, from state) */
	isSaleOpen: boolean;
}

/**
 * Hook to fetch the live lottery state from on-chain.
 *
 * Uses `useMainLotteryState` under the hood (React Query with 30-second
 * polling), then maps the raw Anchor account data into a strongly-typed
 * `LotteryState` object and computes derived convenience values.
 *
 * @returns The lottery state, loading/error indicators, and derived values.
 *
 * @example
 * ```tsx
 * const { jackpotDollars, rolldownActive, loading, error } = useLotteryState();
 *
 * if (loading) return <Skeleton />;
 * if (error) return <ErrorBanner message={error} />;
 * return <JackpotDisplay amount={jackpotDollars} rolldownActive={rolldownActive} />;
 * ```
 */
export function useLotteryState(): UseLotteryStateReturn {
	const {
		data: rawState,
		isLoading,
		isError,
		error: queryError,
		refetch,
	} = useMainLotteryState({
		// Poll every 30 seconds (default from hooks.ts is already 30s)
	});

	// Map raw Anchor data to a typed LotteryState
	const state = useMemo<LotteryState | null>(() => {
		if (!rawState) return null;
		return mapRawToLotteryState(rawState as Record<string, unknown>);
	}, [rawState]);

	// Derive convenience values
	const jackpotBalance = state?.jackpotBalance;
	const jackpotDollars = jackpotBalance
		? baseUnitsToDollars(jackpotBalance)
		: FALLBACK_JACKPOT_DOLLARS;

	const rolldownActive = state?.isRolldownActive ?? false;
	const drawId = state?.currentDrawId ?? null;
	const ticketsSold = state?.currentDrawTickets ?? null;
	const isPaused = state?.isPaused ?? false;

	// On-chain next draw timestamp is a bigint in Unix seconds. Convert to
	// epoch ms for CountdownTimer; never fabricate a value when unknown (L3).
	const nextDrawTimeMs =
		state && state.nextDrawTimestamp > 0n
			? Number(state.nextDrawTimestamp) * 1000
			: null;

	// Sales are open when funded, unpaused, and no draw in progress.
	const isSaleOpen =
		state !== null &&
		!state.isPaused &&
		state.isFunded &&
		!state.isDrawInProgress;

	const error = isError
		? queryError instanceof Error
			? queryError.message
			: "Failed to fetch lottery state"
		: null;

	return {
		state,
		loading: isLoading,
		error,
		refetch: refetch as () => void,
		jackpotDollars,
		rolldownActive,
		drawId,
		ticketsSold,
		isPaused,
		nextDrawTimeMs,
		isSaleOpen,
	};
}
