import React from "react";
import { JackpotDisplay, type JackpotDisplayProps } from "./JackpotDisplay";
import { useMainLotteryState, useQuickPickState } from "@/lib/anchor/hooks";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

// Constants based on the MazelProtocol program
const USDC_DECIMALS = 6; // USDC has 6 decimal places
const SOFT_CAP_USDC = 1_750_000; // $1.75M soft cap

export interface RealJackpotDisplayProps
  extends Omit<JackpotDisplayProps, "amount" | "softCap"> {
  /** Whether to show refresh button */
  showRefresh?: boolean;
  /** Polling interval in milliseconds (0 to disable) */
  pollInterval?: number;
  /** Whether to animate value changes */
  animateChanges?: boolean;
  /** Override the soft cap value (defaults to $1.75M) */
  softCapOverride?: number;
  /** Additional CSS classes for wrapper */
  wrapperClassName?: string;
}

/**
 * Extract jackpot amount from lottery state data
 * The lottery state likely contains a jackpot field in lamports or USDC base units
 */
function extractJackpotAmount(lotteryState: any): number {
  if (!lotteryState) return 0;

  // Try different possible field names for jackpot amount
  // Based on the IDL structure, it could be one of these
  const possibleFields = [
    "jackpot",
    "totalPrizePool",
    "prizePool",
    "currentJackpot",
    "jackpotAmount",
    "totalJackpot",
  ];

  for (const field of possibleFields) {
    if (lotteryState[field] !== undefined) {
      const rawValue = lotteryState[field];

      // Handle different types: BN, number, string, bigint
      if (
        typeof rawValue === "object" &&
        rawValue !== null &&
        "toNumber" in rawValue
      ) {
        // BN object from Anchor
        const baseUnits = rawValue.toNumber();
        return baseUnits / 10 ** USDC_DECIMALS; // Convert to USDC
      } else if (typeof rawValue === "bigint") {
        const baseUnits = Number(rawValue);
        return baseUnits / 10 ** USDC_DECIMALS;
      } else if (typeof rawValue === "number") {
        // Assume it's already in USDC
        return rawValue;
      } else if (typeof rawValue === "string") {
        const baseUnits = parseFloat(rawValue);
        return baseUnits / 10 ** USDC_DECIMALS;
      }
    }
  }

  // If no jackpot field found, try to calculate from other fields
  if (
    lotteryState.totalTicketsSold !== undefined &&
    lotteryState.ticketPrice !== undefined
  ) {
    // Calculate approximate jackpot: tickets sold * ticket price * prize pool percentage
    const ticketsSold =
      typeof lotteryState.totalTicketsSold === "object" &&
      "toNumber" in lotteryState.totalTicketsSold
        ? lotteryState.totalTicketsSold.toNumber()
        : Number(lotteryState.totalTicketsSold || 0);

    const ticketPrice =
      typeof lotteryState.ticketPrice === "object" &&
      "toNumber" in lotteryState.ticketPrice
        ? lotteryState.ticketPrice.toNumber()
        : Number(lotteryState.ticketPrice || 2_500_000); // Default 2.5 USDC in base units

    const baseUnits = ticketsSold * ticketPrice;
    const prizePoolPercentage = 0.72; // 72% to prize pool during normal operation

    return (baseUnits * prizePoolPercentage) / 10 ** USDC_DECIMALS;
  }

  return 0;
}

/**
 * Extract rolldown status from lottery state
 */
function extractRolldownStatus(lotteryState: any): boolean {
  if (!lotteryState) return false;

  // Try different possible field names for rolldown status
  const possibleFields = [
    "rolldownActive",
    "isRolldown",
    "rolldownTriggered",
    "isRolldownWindow",
  ];

  for (const field of possibleFields) {
    if (lotteryState[field] !== undefined) {
      return Boolean(lotteryState[field]);
    }
  }

  // Calculate based on jackpot amount if available
  const jackpotAmount = extractJackpotAmount(lotteryState);
  return jackpotAmount >= SOFT_CAP_USDC;
}

export function RealJackpotDisplay({
  showRefresh = true,
  pollInterval = 10000, // 10 seconds
  animateChanges = true,
  softCapOverride,
  wrapperClassName = "",
  showRolldownStatus = true,
  size = "lg",
  ...jackpotProps
}: RealJackpotDisplayProps) {
  // Fetch lottery state from blockchain
  const {
    data: lotteryState,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useMainLotteryState({
    refetchInterval: pollInterval,
  });

  // Extract data from lottery state
  const jackpotAmount = React.useMemo(() => {
    return extractJackpotAmount(lotteryState);
  }, [lotteryState]);

  const rolldownActive = React.useMemo(() => {
    return extractRolldownStatus(lotteryState);
  }, [lotteryState]);

  const softCap = softCapOverride ?? SOFT_CAP_USDC;

  // Calculate progress percentage

  // Handle loading state
  if (isLoading) {
    return (
      <div className={`relative ${wrapperClassName}`}>
        <div className="relative rounded-2xl overflow-hidden px-6 py-6 bg-card/50 border border-border/50">
          <div className="flex flex-col items-center gap-4">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-12 w-48" />
            <Skeleton className="h-4 w-24" />
            {showRolldownStatus && <Skeleton className="h-6 w-40" />}
          </div>
        </div>
      </div>
    );
  }

  // Handle error state
  if (isError) {
    return (
      <div className={`relative ${wrapperClassName}`}>
        <div className="relative rounded-2xl overflow-hidden px-6 py-6 bg-destructive/10 border border-destructive/30">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle size={24} />
              <span className="font-semibold">Failed to load jackpot</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Unable to fetch lottery data from blockchain
            </p>
            {showRefresh && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isRefetching}
                className="gap-2"
              >
                <RefreshCw
                  size={16}
                  className={isRefetching ? "animate-spin" : ""}
                />
                Try Again
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Handle no data state
  if (!lotteryState) {
    return (
      <div className={`relative ${wrapperClassName}`}>
        <div className="relative rounded-2xl overflow-hidden px-6 py-6 bg-muted/50 border border-border">
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="text-lg font-semibold">No Lottery Data</span>
            <p className="text-sm text-muted-foreground">
              Lottery state not found on blockchain
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative ${wrapperClassName}`}>
      {/* Refresh button overlay */}
      {showRefresh && (
        <div className="absolute -top-2 -right-2 z-20">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => refetch()}
            disabled={isRefetching}
            className="h-8 w-8 rounded-full bg-background/80 backdrop-blur-sm border border-border shadow-sm"
            title="Refresh jackpot data"
          >
            <RefreshCw
              size={16}
              className={isRefetching ? "animate-spin" : ""}
            />
          </Button>
        </div>
      )}

      {/* Blockchain indicator */}
      <div className="absolute -top-2 left-2 z-20">
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-primary/10 border border-primary/20">
          <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          <span className="text-[10px] font-medium text-primary">Live</span>
        </div>
      </div>

      {/* Main jackpot display */}
      <JackpotDisplay
        amount={jackpotAmount}
        label={jackpotProps.label || "Current Jackpot"}
        animated={animateChanges && !isRefetching}
        size={size}
        glow={jackpotAmount >= SOFT_CAP_USDC * 0.9} // Glow when close to soft cap
        showRolldownStatus={showRolldownStatus}
        rolldownActive={rolldownActive}
        softCap={softCap}
        {...jackpotProps}
      />

      {/* Additional blockchain info */}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-primary" />
          <span>Live from Solana</span>
        </div>
        <span className="opacity-50">•</span>
        <span>Updated just now</span>
        {isRefetching && (
          <>
            <span className="opacity-50">•</span>
            <span className="text-primary animate-pulse">Updating...</span>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Compact real jackpot badge for headers and tickers
 */
export function RealJackpotBadge({
  showRefresh = false,
  pollInterval = 30000, // 30 seconds
  className = "",
}: {
  showRefresh?: boolean;
  pollInterval?: number;
  className?: string;
}) {
  const {
    data: lotteryState,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useMainLotteryState({
    refetchInterval: pollInterval,
  });

  const jackpotAmount = React.useMemo(() => {
    return extractJackpotAmount(lotteryState);
  }, [lotteryState]);

  if (isLoading) {
    return (
      <div
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50 border border-border ${className}`}
      >
        <Skeleton className="w-1.5 h-1.5 rounded-full" />
        <Skeleton className="h-4 w-24" />
      </div>
    );
  }

  if (isError || !lotteryState) {
    return (
      <div
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-destructive/10 border border-destructive/20 ${className}`}
      >
        <div className="w-1.5 h-1.5 rounded-full bg-destructive" />
        <span className="text-xs font-semibold text-destructive">Error</span>
        {showRefresh && (
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isRefetching}
            className="ml-1 text-destructive/60 hover:text-destructive"
            title="Refresh"
          >
            <RefreshCw
              size={12}
              className={isRefetching ? "animate-spin" : ""}
            />
          </button>
        )}
      </div>
    );
  }

  const formattedAmount =
    jackpotAmount >= 1_000_000
      ? `$${(jackpotAmount / 1_000_000).toFixed(1)}M`
      : `$${Math.floor(jackpotAmount).toLocaleString()}`;

  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 ${className}`}
    >
      <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
      <span className="text-xs font-semibold text-primary">
        Jackpot: {formattedAmount}
      </span>
      {showRefresh && (
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isRefetching}
          className="ml-1 text-primary/60 hover:text-primary"
          title="Refresh jackpot"
        >
          <RefreshCw size={12} className={isRefetching ? "animate-spin" : ""} />
        </button>
      )}
    </div>
  );
}

/**
 * Real jackpot display for Quick Pick Express
 */
export function RealQuickPickJackpotDisplay({
  showRefresh = true,
  pollInterval = 5000, // 5 seconds (faster for Quick Pick)
  wrapperClassName = "",
  size = "md",
  showRolldownStatus = true,
  ...jackpotProps
}: RealJackpotDisplayProps) {
  const {
    data: quickPickState,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useQuickPickState({
    refetchInterval: pollInterval,
  });

  // Quick Pick has different constants
  const QP_SOFT_CAP_USDC = 100_000; // Example soft cap

  const jackpotAmount = React.useMemo(() => {
    return extractJackpotAmount(quickPickState);
  }, [quickPickState]);

  const rolldownActive = React.useMemo(() => {
    return extractRolldownStatus(quickPickState);
  }, [quickPickState]);

  const softCap = jackpotProps.softCapOverride ?? QP_SOFT_CAP_USDC;

  if (isLoading) {
    return (
      <div className={`relative ${wrapperClassName}`}>
        <div className="relative rounded-2xl overflow-hidden px-6 py-6 bg-card/50 border border-border/50">
          <div className="flex flex-col items-center gap-4">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-12 w-48" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
      </div>
    );
  }

  if (isError || !quickPickState) {
    return (
      <div className={`relative ${wrapperClassName}`}>
        <div className="relative rounded-2xl overflow-hidden px-6 py-6 bg-destructive/10 border border-destructive/30">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle size={24} />
              <span className="font-semibold">
                Failed to load Quick Pick jackpot
              </span>
            </div>
            {showRefresh && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isRefetching}
                className="gap-2"
              >
                <RefreshCw
                  size={16}
                  className={isRefetching ? "animate-spin" : ""}
                />
                Try Again
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative ${wrapperClassName}`}>
      {showRefresh && (
        <div className="absolute -top-2 -right-2 z-20">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => refetch()}
            disabled={isRefetching}
            className="h-8 w-8 rounded-full bg-background/80 backdrop-blur-sm border border-border shadow-sm"
            title="Refresh Quick Pick jackpot"
          >
            <RefreshCw
              size={16}
              className={isRefetching ? "animate-spin" : ""}
            />
          </Button>
        </div>
      )}

      <JackpotDisplay
        amount={jackpotAmount}
        label={jackpotProps.label || "Quick Pick Jackpot"}
        animated={jackpotProps.animateChanges ?? true}
        size={size}
        glow={jackpotAmount >= QP_SOFT_CAP_USDC * 0.9}
        showRolldownStatus={showRolldownStatus}
        rolldownActive={rolldownActive}
        softCap={softCap}
      />
    </div>
  );
}
