import { useMemo, useCallback } from "react";
import { PublicKey } from "@solana/web3.js";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useAppKitAccount } from "@/lib/appkit-provider";
import { useAnchorProvider } from "@/lib/anchor/provider";
import {
  useMainLotteryState,
  useMultipleMainDrawResults,
  lotteryKeys,
} from "@/lib/anchor/hooks";
import {
  fetchUserMainTicketsForDraw,
  fetchUserQuickPickTicketsForDraw,
} from "@/lib/anchor/programs";

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

/** Number of past draws to fetch results for */
const DRAW_LOOKBACK = 10;

/** Polling interval in ms */
const STALE_TIME = 30_000;

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export interface UserTicket {
  /** Unique ID: drawId-ticketIndex */
  id: string;
  /** Sorted ticket numbers */
  numbers: number[];
  /** Draw ID this ticket belongs to */
  drawId: number;
  /** Whether this was a Quick Pick (auto-generated) */
  isQuickPick: boolean;
  /** Match count against winning numbers (0-6). -1 if draw not settled. */
  matchCount: number;
  /** Prize amount in USDC lamports. 0 if no prize or not settled. */
  prize: bigint;
  /** Whether prize has been claimed */
  isClaimed: boolean;
  /** Purchase timestamp (unix seconds) */
  purchaseTime: number;
  /** Winning numbers for this draw. Empty if draw not settled. */
  winningNumbers: number[];
  /** Game type */
  gameType: "main" | "quickpick";
  /** Whether this is a syndicate ticket */
  isSyndicateTicket: boolean;
}

export interface UseTicketsReturn {
  tickets: UserTicket[];
  unclaimedTickets: UserTicket[];
  unclaimedPrizeTotal: bigint;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/* -------------------------------------------------------------------------- */
/*  Helpers — raw on-chain → UserTicket                                       */
/* -------------------------------------------------------------------------- */

/**
 * Map a raw Main Lottery `TicketData` account to a `UserTicket`.
 *
 * The on-chain struct (from the solana_lotto IDL):
 *   owner: Pubkey           — ignored (already filtered by owner)
 *   draw_id: u64
 *   numbers: [u8; 6]
 *   purchase_timestamp: i64
 *   is_claimed: bool
 *   match_count: u8
 *   prize_amount: u64
 *   syndicate: Option<Pubkey>
 *   bump: u8
 */
function mapRawMainTicketToUserTicket(
  raw: Record<string, unknown>,
  index: number,
  winningNumbers: number[],
): UserTicket {
  const get = (snake: string, camel: string): unknown =>
    raw[snake] !== undefined ? raw[snake] : raw[camel];

  const drawId = bnToNumber(get("draw_id", "drawId"));
  const numbers = extractNumbers(get("numbers", "numbers"), 6);
  const purchaseTime = bnToNumber(get("purchase_timestamp", "purchaseTimestamp"));
  const isClaimed = Boolean(get("is_claimed", "isClaimed"));
  const matchCount = Number(get("match_count", "matchCount") ?? 0);
  const prizeAmount = toBigInt(get("prize_amount", "prizeAmount") ?? 0);
  const syndicate = get("syndicate", "syndicate");

  return {
    id: `${drawId}-main-${index}`,
    numbers,
    drawId,
    isQuickPick: false,
    matchCount,
    prize: prizeAmount,
    isClaimed,
    purchaseTime,
    winningNumbers,
    gameType: "main",
    isSyndicateTicket: syndicate != null,
  };
}

/**
 * Map a raw Quick Pick `QuickPickTicket` account to a `UserTicket`.
 *
 * The on-chain struct (from the quickpick IDL):
 *   owner: Pubkey
 *   draw_id: u64
 *   numbers: [u8; 5]
 *   purchase_timestamp: i64
 *   is_claimed: bool
 *   match_count: u8
 *   prize_amount: u64
 *   bump: u8
 */
function mapRawQuickPickTicketToUserTicket(
  raw: Record<string, unknown>,
  index: number,
  winningNumbers: number[],
): UserTicket {
  const get = (snake: string, camel: string): unknown =>
    raw[snake] !== undefined ? raw[snake] : raw[camel];

  const drawId = bnToNumber(get("draw_id", "drawId"));
  const numbers = extractNumbers(get("numbers", "numbers"), 5);
  const purchaseTime = bnToNumber(get("purchase_timestamp", "purchaseTimestamp"));
  const isClaimed = Boolean(get("is_claimed", "isClaimed"));
  const matchCount = Number(get("match_count", "matchCount") ?? 0);
  const prizeAmount = toBigInt(get("prize_amount", "prizeAmount") ?? 0);

  return {
    id: `${drawId}-qp-${index}`,
    numbers,
    drawId,
    isQuickPick: true,
    matchCount,
    prize: prizeAmount,
    isClaimed,
    purchaseTime,
    winningNumbers,
    gameType: "quickpick",
    isSyndicateTicket: false,
  };
}

/* -------------------------------------------------------------------------- */
/*  Low-level helpers                                                         */
/* -------------------------------------------------------------------------- */

/** Convert a BN / number / bigint to a plain number. */
function bnToNumber(value: unknown): number {
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
  return Number(value ?? 0);
}

/** Convert a BN / number / bigint to a bigint. */
function toBigInt(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.trunc(value));
  if (
    typeof value === "object" &&
    value !== null &&
    "toNumber" in value &&
    typeof (value as { toNumber: () => number }).toNumber === "function"
  ) {
    return BigInt((value as { toNumber: () => number }).toNumber().toString());
  }
  if (typeof value === "string") {
    try {
      return BigInt(value);
    } catch {
      return 0n;
    }
  }
  return 0n;
}

/**
 * Extract an array of numbers from a raw Anchor array field.
 *
 * Anchor serializes fixed-size arrays as plain JS arrays of numbers,
 * but they can also arrive as objects with numeric keys if fetched
 * via a generic JSON RPC path.
 */
function extractNumbers(value: unknown, expectedLen: number): number[] {
  if (Array.isArray(value)) {
    return value.map((n) => bnToNumber(n)).slice(0, expectedLen);
  }
  if (typeof value === "object" && value !== null) {
    const arr: number[] = [];
    const obj = value as Record<string, unknown>;
    for (let i = 0; i < expectedLen; i++) {
      const v = obj[i.toString()];
      if (v !== undefined) arr.push(bnToNumber(v));
    }
    return arr;
  }
  return [];
}

/* -------------------------------------------------------------------------- */
/*  Hook                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Hook to fetch the current user's tickets from on-chain data.
 *
 * Queries the last {@link DRAW_LOOKBACK} draws for both Main Lottery and
 * Quick Pick tickets owned by the connected wallet.  Maps raw Anchor account
 * data into strongly-typed {@link UserTicket} objects and derives
 * convenience aggregates (unclaimed tickets, total prize value).
 *
 * Falls back to an empty array when the wallet is not connected.
 *
 * @returns Tickets, loading/error state, and a refetch trigger.
 *
 * @example
 * ```tsx
 * const { tickets, unclaimedTickets, unclaimedPrizeTotal, loading, error } = useTickets();
 *
 * if (loading) return <Skeleton />;
 * if (error) return <ErrorBanner message={error} />;
 * return <TicketList tickets={tickets} />;
 * ```
 */
export function useTickets(): UseTicketsReturn {
  const { address } = useAppKitAccount();
  const { canSign } = useAnchorProvider();
  const queryClient = useQueryClient();

  // ---- lottery state (need current draw ID) --------------------------------
  const {
    data: lotteryState,
    isLoading: stateLoading,
    error: stateError,
  } = useMainLotteryState();

  // Derive current draw ID
  const currentDrawId = useMemo(() => {
    if (!lotteryState) return 0;
    const raw = lotteryState as Record<string, unknown>;
    return bnToNumber(raw.current_draw_id ?? raw.currentDrawId ?? 0);
  }, [lotteryState]);

  // Build list of draw IDs to query (latest N draws)
  const drawIds = useMemo(() => {
    if (currentDrawId <= 0) return [];
    const ids: number[] = [];
    for (let i = 0; i < DRAW_LOOKBACK; i++) {
      const id = currentDrawId - i;
      if (id >= 0) ids.push(id);
    }
    return ids;
  }, [currentDrawId]);

  // ---- draw results (winning numbers) --------------------------------------
  const drawResultQueries = useMultipleMainDrawResults(drawIds);

  // Build a map: drawId → winning numbers
  const winningNumbersMap = useMemo(() => {
    const map = new Map<number, number[]>();
    drawResultQueries.forEach((query, i) => {
      const drawId = drawIds[i];
      if (!query.data) return;
      const raw = query.data as Record<string, unknown>;
      const nums = extractNumbers(
        raw.winning_numbers ?? raw.winningNumbers ?? [],
        6,
      );
      if (nums.length > 0) {
        map.set(drawId, nums);
      }
    });
    return map;
  }, [drawResultQueries, drawIds]);

  // ---- user tickets (main lottery) -----------------------------------------
  const mainTicketQueries = useQueries({
    queries: drawIds.map((drawId) => ({
      queryKey: lotteryKeys.main.userTickets(address || "", drawId),
      queryFn: () =>
        address
          ? fetchUserMainTicketsForDraw(new PublicKey(address), drawId)
          : Promise.resolve([] as Record<string, unknown>[]),
      staleTime: STALE_TIME,
      enabled: !!address && drawIds.length > 0,
    })),
  });

  // ---- user tickets (quick pick) -------------------------------------------
  const quickPickTicketQueries = useQueries({
    queries: drawIds.map((drawId) => ({
      queryKey: lotteryKeys.quickPick.userTickets(address || "", drawId),
      queryFn: () =>
        address
          ? fetchUserQuickPickTicketsForDraw(new PublicKey(address), drawId)
          : Promise.resolve([] as Record<string, unknown>[]),
      staleTime: STALE_TIME,
      enabled: !!address && drawIds.length > 0,
    })),
  });

  // ---- map raw data → UserTicket[] -----------------------------------------
  const tickets = useMemo<UserTicket[]>(() => {
    if (!address || !canSign) return [];

    const result: UserTicket[] = [];

    // Process main lottery tickets
    mainTicketQueries.forEach((query, i) => {
      const drawId = drawIds[i];
      const winningNumbers = winningNumbersMap.get(drawId) ?? [];
      if (query.data && Array.isArray(query.data)) {
        query.data.forEach((raw, j) => {
          result.push(
            mapRawMainTicketToUserTicket(
              raw as Record<string, unknown>,
              j,
              winningNumbers,
            ),
          );
        });
      }
    });

    // Process quick pick tickets
    quickPickTicketQueries.forEach((query, i) => {
      const drawId = drawIds[i];
      const winningNumbers = winningNumbersMap.get(drawId) ?? [];
      if (query.data && Array.isArray(query.data)) {
        query.data.forEach((raw, j) => {
          result.push(
            mapRawQuickPickTicketToUserTicket(
              raw as Record<string, unknown>,
              j,
              winningNumbers,
            ),
          );
        });
      }
    });

    // Sort by purchase time descending (newest first)
    result.sort((a, b) => b.purchaseTime - a.purchaseTime);

    return result;
  }, [
    address,
    canSign,
    drawIds,
    mainTicketQueries,
    quickPickTicketQueries,
    winningNumbersMap,
  ]);

  // ---- derived aggregates --------------------------------------------------
  const unclaimedTickets = useMemo(
    () => tickets.filter((t) => !t.isClaimed && t.matchCount >= 2),
    [tickets],
  );

  const unclaimedPrizeTotal = useMemo(
    () => unclaimedTickets.reduce((sum, t) => sum + t.prize, 0n),
    [unclaimedTickets],
  );

  // ---- loading / error -----------------------------------------------------
  const anyTicketLoading =
    mainTicketQueries.some((q) => q.isLoading) ||
    quickPickTicketQueries.some((q) => q.isLoading);

  const loading = stateLoading || anyTicketLoading;

  const anyTicketError =
    mainTicketQueries.some((q) => q.isError) ||
    quickPickTicketQueries.some((q) => q.isError);

  const error = stateError
    ? String(stateError)
    : anyTicketError
      ? "Failed to fetch some tickets"
      : null;

  // ---- refetch -------------------------------------------------------------
  const refetch = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: lotteryKeys.main.userTickets(address || "", 0),
    });
    queryClient.invalidateQueries({
      queryKey: lotteryKeys.quickPick.userTickets(address || "", 0),
    });
  }, [queryClient, address]);

  return {
    tickets,
    unclaimedTickets,
    unclaimedPrizeTotal,
    loading,
    error,
    refetch,
  };
}
