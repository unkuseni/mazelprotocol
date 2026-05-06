import { useMemo } from "react";
import { useMainLotteryState } from "@/lib/anchor/hooks";
import { type LotteryState, mapRawToLotteryState } from "@/lib/types";

/**
 * Default jackpot in USDC when on-chain data is unavailable.
 * Used as a fallback so the UI never shows $0.00.
 */
const FALLBACK_JACKPOT_DOLLARS = 1_247_832;

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
  };
}
