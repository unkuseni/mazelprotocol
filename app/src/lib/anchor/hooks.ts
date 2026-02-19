import React from "react";
import {
  useQuery,
  useQueries,
  type UseQueryResult,
  type UseQueryOptions,
  useQueryClient,
} from "@tanstack/react-query";
import { PublicKey } from "@solana/web3.js";
import type { BN } from "@coral-xyz/anchor";
import {
  fetchMainLotteryState,
  fetchQuickPickState,
  fetchMainDrawResult,
  fetchQuickPickDrawResult,
  fetchUserMainTicketsForDraw,
  fetchUserQuickPickTicketsForDraw,
  fetchAllLotteryData,
  type MainLotteryProgram,
  type QuickPickProgram,
  createMainLotteryProgram,
  createQuickPickProgram,
} from "./programs";
import { getConnection } from "./connection";

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const lotteryKeys = {
  all: ["lottery"] as const,
  main: {
    all: () => [...lotteryKeys.all, "main"] as const,
    state: () => [...lotteryKeys.main.all(), "state"] as const,
    draw: (drawId: number | BN) =>
      [
        ...lotteryKeys.main.all(),
        "draw",
        { drawId: drawId.toString() },
      ] as const,
    userTickets: (user: string, drawId: number | BN) =>
      [
        ...lotteryKeys.main.all(),
        "user-tickets",
        { user, drawId: drawId.toString() },
      ] as const,
  },
  quickPick: {
    all: () => [...lotteryKeys.all, "quick-pick"] as const,
    state: () => [...lotteryKeys.quickPick.all(), "state"] as const,
    draw: (drawId: number | BN) =>
      [
        ...lotteryKeys.quickPick.all(),
        "draw",
        { drawId: drawId.toString() },
      ] as const,
    userTickets: (user: string, drawId: number | BN) =>
      [
        ...lotteryKeys.quickPick.all(),
        "user-tickets",
        { user, drawId: drawId.toString() },
      ] as const,
  },
  combined: {
    all: () => [...lotteryKeys.all, "combined"] as const,
    states: () => [...lotteryKeys.combined.all(), "states"] as const,
  },
  program: {
    all: () => [...lotteryKeys.all, "program"] as const,
    main: () => [...lotteryKeys.program.all(), "main"] as const,
    quickPick: () => [...lotteryKeys.program.all(), "quick-pick"] as const,
  },
};

// ---------------------------------------------------------------------------
// Default query options
// ---------------------------------------------------------------------------

const DEFAULT_STALE_TIME = 30_000; // 30 seconds
const DEFAULT_CACHE_TIME = 5 * 60_000; // 5 minutes
const DEFAULT_RETRY = 2;
const DEFAULT_RETRY_DELAY = 1000;

const defaultQueryOptions: Partial<UseQueryOptions> = {
  staleTime: DEFAULT_STALE_TIME,
  gcTime: DEFAULT_CACHE_TIME,
  retry: DEFAULT_RETRY,
  retryDelay: DEFAULT_RETRY_DELAY,
  refetchOnWindowFocus: false,
  refetchOnMount: true,
  refetchOnReconnect: true,
};

// ---------------------------------------------------------------------------
// Connection and program hooks
// ---------------------------------------------------------------------------

/**
 * Hook to get the Solana connection instance
 */
export function useConnection() {
  return getConnection();
}

/**
 * Hook to get the Main Lottery program client (read-only)
 */
export function useMainLotteryProgram() {
  return createMainLotteryProgram();
}

/**
 * Hook to get the Quick Pick program client (read-only)
 */
export function useQuickPickProgram() {
  return createQuickPickProgram();
}

// ---------------------------------------------------------------------------
// Main Lottery hooks
// ---------------------------------------------------------------------------

/**
 * Hook to fetch the Main Lottery state
 */
export function useMainLotteryState(options?: Partial<UseQueryOptions>) {
  return useQuery({
    queryKey: lotteryKeys.main.state(),
    queryFn: () => fetchMainLotteryState(),
    ...defaultQueryOptions,
    ...options,
  });
}

/**
 * Hook to fetch a specific Main Lottery draw result
 */
export function useMainDrawResult(
  drawId: number | BN,
  options?: Partial<UseQueryOptions>,
) {
  return useQuery({
    queryKey: lotteryKeys.main.draw(drawId),
    queryFn: () => fetchMainDrawResult(drawId),
    ...defaultQueryOptions,
    ...options,
  });
}

/**
 * Hook to fetch a user's Main Lottery tickets for a specific draw
 */
export function useUserMainTicketsForDraw(
  user: PublicKey | string | null | undefined,
  drawId: number | BN,
  options?: Partial<UseQueryOptions>,
) {
  const userKey = user instanceof PublicKey ? user.toBase58() : user;

  return useQuery({
    queryKey: lotteryKeys.main.userTickets(userKey || "", drawId),
    queryFn: () => {
      if (!userKey) {
        return Promise.resolve([]);
      }
      return fetchUserMainTicketsForDraw(new PublicKey(userKey), drawId);
    },
    enabled: !!userKey,
    ...defaultQueryOptions,
    ...options,
  });
}

// ---------------------------------------------------------------------------
// Quick Pick hooks
// ---------------------------------------------------------------------------

/**
 * Hook to fetch the Quick Pick state
 */
export function useQuickPickState(options?: Partial<UseQueryOptions>) {
  return useQuery({
    queryKey: lotteryKeys.quickPick.state(),
    queryFn: () => fetchQuickPickState(),
    ...defaultQueryOptions,
    ...options,
  });
}

/**
 * Hook to fetch a specific Quick Pick draw result
 */
export function useQuickPickDrawResult(
  drawId: number | BN,
  options?: Partial<UseQueryOptions>,
) {
  return useQuery({
    queryKey: lotteryKeys.quickPick.draw(drawId),
    queryFn: () => fetchQuickPickDrawResult(drawId),
    ...defaultQueryOptions,
    ...options,
  });
}

/**
 * Hook to fetch a user's Quick Pick tickets for a specific draw
 */
export function useUserQuickPickTicketsForDraw(
  user: PublicKey | string | null | undefined,
  drawId: number | BN,
  options?: Partial<UseQueryOptions>,
) {
  const userKey = user instanceof PublicKey ? user.toBase58() : user;

  return useQuery({
    queryKey: lotteryKeys.quickPick.userTickets(userKey || "", drawId),
    queryFn: () => {
      if (!userKey) {
        return Promise.resolve([]);
      }
      return fetchUserQuickPickTicketsForDraw(new PublicKey(userKey), drawId);
    },
    enabled: !!userKey,
    ...defaultQueryOptions,
    ...options,
  });
}

// ---------------------------------------------------------------------------
// Combined hooks
// ---------------------------------------------------------------------------

/**
 * Hook to fetch both Main Lottery and Quick Pick states
 */
export function useAllLotteryStates(options?: Partial<UseQueryOptions>) {
  return useQuery({
    queryKey: lotteryKeys.combined.states(),
    queryFn: () => fetchAllLotteryData(),
    ...defaultQueryOptions,
    ...options,
  });
}

/**
 * Hook to fetch multiple Main Lottery draw results
 */
export function useMultipleMainDrawResults(
  drawIds: (number | BN)[],
  options?: Partial<UseQueryOptions>,
): UseQueryResult[] {
  const queries = useQueries({
    queries: drawIds.map((drawId) => ({
      queryKey: lotteryKeys.main.draw(drawId),
      queryFn: () => fetchMainDrawResult(drawId),
      ...defaultQueryOptions,
      ...options,
    })),
  });

  return queries;
}

/**
 * Hook to fetch multiple Quick Pick draw results
 */
export function useMultipleQuickPickDrawResults(
  drawIds: (number | BN)[],
  options?: Partial<UseQueryOptions>,
): UseQueryResult[] {
  const queries = useQueries({
    queries: drawIds.map((drawId) => ({
      queryKey: lotteryKeys.quickPick.draw(drawId),
      queryFn: () => fetchQuickPickDrawResult(drawId),
      ...defaultQueryOptions,
      ...options,
    })),
  });

  return queries;
}

/**
 * Hook to fetch all tickets for a user across both lotteries
 * (For a specific draw or all draws)
 */
export function useAllUserTickets(
  user: PublicKey | string | null | undefined,
  drawIds: {
    main: (number | BN)[];
    quickPick: (number | BN)[];
  },
  options?: Partial<UseQueryOptions>,
) {
  const userKey = user instanceof PublicKey ? user.toBase58() : user;

  const mainQueries = useQueries({
    queries: drawIds.main.map((drawId) => ({
      queryKey: lotteryKeys.main.userTickets(userKey || "", drawId),
      queryFn: () => {
        if (!userKey) return [];
        return fetchUserMainTicketsForDraw(new PublicKey(userKey), drawId);
      },
      enabled: !!userKey,
      ...defaultQueryOptions,
      ...options,
    })),
  });

  const quickPickQueries = useQueries({
    queries: drawIds.quickPick.map((drawId) => ({
      queryKey: lotteryKeys.quickPick.userTickets(userKey || "", drawId),
      queryFn: () => {
        if (!userKey) return [];
        return fetchUserQuickPickTicketsForDraw(new PublicKey(userKey), drawId);
      },
      enabled: !!userKey,
      ...defaultQueryOptions,
      ...options,
    })),
  });

  // Combine results
  const allMainTickets = mainQueries.flatMap((query) => query.data || []);
  const allQuickPickTickets = quickPickQueries.flatMap(
    (query) => query.data || [],
  );

  return {
    mainTickets: allMainTickets,
    quickPickTickets: allQuickPickTickets,
    isLoading:
      mainQueries.some((q) => q.isLoading) ||
      quickPickQueries.some((q) => q.isLoading),
    isError:
      mainQueries.some((q) => q.isError) ||
      quickPickQueries.some((q) => q.isError),
    error:
      mainQueries.find((q) => q.error)?.error ||
      quickPickQueries.find((q) => q.error)?.error,
  };
}

// ---------------------------------------------------------------------------
// Invalidation utilities
// ---------------------------------------------------------------------------

/**
 * Hook to get query client for manual invalidation
 */
export function useLotteryQueryClient() {
  const queryClient = useQueryClient();

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: lotteryKeys.all });
  };

  const invalidateMainLottery = () => {
    queryClient.invalidateQueries({ queryKey: lotteryKeys.main.all() });
  };

  const invalidateQuickPick = () => {
    queryClient.invalidateQueries({ queryKey: lotteryKeys.quickPick.all() });
  };

  const invalidateMainDraw = (drawId: number | BN) => {
    queryClient.invalidateQueries({ queryKey: lotteryKeys.main.draw(drawId) });
  };

  const invalidateQuickPickDraw = (drawId: number | BN) => {
    queryClient.invalidateQueries({
      queryKey: lotteryKeys.quickPick.draw(drawId),
    });
  };

  const invalidateUserMainTickets = (user: string, drawId: number | BN) => {
    queryClient.invalidateQueries({
      queryKey: lotteryKeys.main.userTickets(user, drawId),
    });
  };

  const invalidateUserQuickPickTickets = (
    user: string,
    drawId: number | BN,
  ) => {
    queryClient.invalidateQueries({
      queryKey: lotteryKeys.quickPick.userTickets(user, drawId),
    });
  };

  return {
    queryClient,
    invalidateAll,
    invalidateMainLottery,
    invalidateQuickPick,
    invalidateMainDraw,
    invalidateQuickPickDraw,
    invalidateUserMainTickets,
    invalidateUserQuickPickTickets,
  };
}

// ---------------------------------------------------------------------------
// Real-time subscription hooks (WebSocket)
// ---------------------------------------------------------------------------

/**
 * Hook to subscribe to Main Lottery state changes
 * Note: This is a placeholder - implement WebSocket subscription logic
 */
export function useSubscribeToMainLotteryState(
  enabled: boolean = true,
  onUpdate?: (data: any) => void,
) {
  // Implementation would use WebSocket connection
  // For now, we'll use polling via React Query
  const { data, refetch } = useMainLotteryState({
    refetchInterval: enabled ? 10_000 : false, // Poll every 10 seconds if enabled
  });

  // Call onUpdate when data changes
  React.useEffect(() => {
    if (onUpdate && data) {
      onUpdate(data);
    }
  }, [data, onUpdate]);

  return { data, refetch };
}

/**
 * Hook to subscribe to Quick Pick state changes
 */
export function useSubscribeToQuickPickState(
  enabled: boolean = true,
  onUpdate?: (data: any) => void,
) {
  const { data, refetch } = useQuickPickState({
    refetchInterval: enabled ? 10_000 : false,
  });

  React.useEffect(() => {
    if (onUpdate && data) {
      onUpdate(data);
    }
  }, [data, onUpdate]);

  return { data, refetch };
}

// ---------------------------------------------------------------------------
// Prefetch utilities
// ---------------------------------------------------------------------------

/**
 * Prefetch Main Lottery state
 */
export async function prefetchMainLotteryState(queryClient: any) {
  return queryClient.prefetchQuery({
    queryKey: lotteryKeys.main.state(),
    queryFn: () => fetchMainLotteryState(),
    ...defaultQueryOptions,
  });
}

/**
 * Prefetch Quick Pick state
 */
export async function prefetchQuickPickState(queryClient: any) {
  return queryClient.prefetchQuery({
    queryKey: lotteryKeys.quickPick.state(),
    queryFn: () => fetchQuickPickState(),
    ...defaultQueryOptions,
  });
}

/**
 * Prefetch all lottery data
 */
export async function prefetchAllLotteryData(queryClient: any) {
  await Promise.all([
    prefetchMainLotteryState(queryClient),
    prefetchQuickPickState(queryClient),
  ]);
}

// ---------------------------------------------------------------------------
// Type exports
// ---------------------------------------------------------------------------

export type { MainLotteryProgram, QuickPickProgram };
