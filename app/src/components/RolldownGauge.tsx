import { useMemo } from "react";
import { TrendingUp, Zap, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

/** Soft cap in USDC dollars — probabilistic rolldown becomes possible */
const SOFT_CAP = 1_750_000;

/** Hard cap in USDC dollars — guaranteed forced rolldown */
const HARD_CAP = 2_250_000;

/** Range of the probabilistic zone */
const RANGE = HARD_CAP - SOFT_CAP;

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export type RolldownPhase = "normal" | "probabilistic" | "hard";

export interface RolldownGaugeProps {
  /** Current jackpot amount in USDC dollars */
  jackpotAmount: number;
  /** Whether rolldown is currently active */
  rolldownActive: boolean;
  /** Whether data is still loading */
  loading?: boolean;
  /** Tickets sold in current draw */
  ticketsSold?: number;
  /** Additional CSS classes */
  className?: string;
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function formatCurrency(value: number): string {
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    if (millions % 1 === 0) return `$${millions.toFixed(0)}M`;
    return `$${millions.toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(0)}K`;
  }
  return `$${value.toLocaleString("en-US")}`;
}

function calculateRolldownProbability(jackpotAmount: number): number {
  if (jackpotAmount >= HARD_CAP) return 100;
  if (jackpotAmount < SOFT_CAP) return 0;
  return ((jackpotAmount - SOFT_CAP) / RANGE) * 100;
}

function getPhase(jackpotAmount: number): RolldownPhase {
  if (jackpotAmount >= HARD_CAP) return "hard";
  if (jackpotAmount >= SOFT_CAP) return "probabilistic";
  return "normal";
}

function getPhaseConfig(phase: RolldownPhase, probability: number) {
  switch (phase) {
    case "hard":
      return {
        label: "FORCED ROLLDOWN",
        description: "100% of jackpot distributes this draw",
        barColor: "from-red-500 to-amber-500",
        glowColor: "shadow-red-500/40",
        textColor: "text-red-400",
        badgeColor: "bg-red-500/15 border-red-500/30 text-red-400",
        pulseClass: "animate-pulse",
        icon: Zap,
      };
    case "probabilistic": {
      const urgency =
        probability > 80 ? "high" : probability > 50 ? "mid" : "low";
      const configs = {
        high: {
          barColor: "from-amber-500 to-amber-400",
          glowColor: "shadow-amber-500/40",
          textColor: "text-amber-400",
          badgeColor: "bg-amber-500/15 border-amber-500/30 text-amber-400",
          pulseClass: "animate-pulse",
        },
        mid: {
          barColor: "from-amber-500/80 to-yellow-500/60",
          glowColor: "shadow-amber-500/20",
          textColor: "text-yellow-400",
          badgeColor:
            "bg-yellow-500/15 border-yellow-500/30 text-yellow-400",
          pulseClass: "",
        },
        low: {
          barColor: "from-emerald-500/60 to-emerald-400/40",
          glowColor: "shadow-emerald-500/10",
          textColor: "text-emerald-400",
          badgeColor:
            "bg-emerald-500/15 border-emerald-500/30 text-emerald-400",
          pulseClass: "",
        },
      };
      return {
        ...configs[urgency],
        label: "PROBABILISTIC ZONE",
        description: `Rolldown may trigger this draw`,
        icon: TrendingUp,
      };
    }
    default:
      return {
        label: "NORMAL MODE",
        description: "Fixed prizes — Jackpot building",
        barColor: "from-emerald-600 to-emerald-500",
        glowColor: "shadow-emerald-500/10",
        textColor: "text-emerald-400",
        badgeColor: "bg-emerald-500/15 border-emerald-500/30 text-emerald-400",
        pulseClass: "",
        icon: TrendingUp,
      };
  }
}

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                            */
/* -------------------------------------------------------------------------- */

function TickMark({
  value,
  position,
  isReached,
  isHardCap = false,
}: {
  value: number;
  position: number;
  isReached: boolean;
  isHardCap?: boolean;
}) {
  return (
    <div
      className="absolute top-0 flex flex-col items-center"
      style={{ left: `${position}%`, transform: "translateX(-50%)" }}
    >
      {/* Tick line */}
      <div
        className={cn(
          "w-0.5 h-3 rounded-full transition-colors duration-700",
          isReached
            ? isHardCap
              ? "bg-red-400"
              : "bg-amber-400"
            : "bg-foreground/15",
        )}
      />
      {/* Label */}
      <span
        className={cn(
          "mt-1.5 text-[9px] font-semibold whitespace-nowrap transition-colors duration-700",
          isReached
            ? isHardCap
              ? "text-red-400"
              : "text-amber-400/80"
            : "text-muted-foreground/50",
        )}
      >
        {formatCurrency(value)}
        {isHardCap && (
          <span className="ml-0.5 text-red-400/60">
            <Zap size={8} className="inline -mt-0.5" />
          </span>
        )}
      </span>
    </div>
  );
}

function GaugeBar({
  jackpotAmount,
  phase,
  probability,
  phaseConfig,
}: {
  jackpotAmount: number;
  phase: RolldownPhase;
  probability: number;
  phaseConfig: ReturnType<typeof getPhaseConfig>;
}) {
  // Calculate fill percentage relative to the gauge (scale 0 to hard cap)
  const fillPercent = Math.min((jackpotAmount / HARD_CAP) * 100, 100);

  // Positions for key markers (as percentages of the gauge)
  const softCapPos = (SOFT_CAP / HARD_CAP) * 100;
  const hardCapPos = 100;

  const softCapReached = jackpotAmount >= SOFT_CAP;
  const hardCapReached = jackpotAmount >= HARD_CAP;

  return (
    <div className="relative mt-8 mb-16">
      {/* Track */}
      <div className="relative h-12 rounded-full bg-foreground/5 border border-foreground/10 overflow-hidden">
        {/* Filled portion */}
        <div
          className={cn(
            "absolute inset-y-0 left-0 rounded-full transition-all duration-1000 ease-out",
            "bg-linear-to-r",
            fillPercent < softCapPos
              ? "from-emerald-600 to-emerald-500"
              : phaseConfig.barColor,
            phaseConfig.glowColor,
          )}
          style={{ width: `${fillPercent}%` }}
        />

        {/* Probability zone shading */}
        <div
          className="absolute inset-y-0 rounded-r-full bg-linear-to-r from-amber-500/5 to-red-500/10 border-r border-amber-500/10"
          style={{ left: `${softCapPos}%`, right: 0 }}
        />

        {/* Hard cap marker line */}
        <div
          className={cn(
            "absolute inset-y-1 right-0 w-0.5 rounded-full transition-colors duration-700",
            hardCapReached ? "bg-red-400 shadow-sm shadow-red-500/30" : "bg-red-400/20",
          )}
        />

        {/* Probability percentage overlay */}
        {phase !== "normal" && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span
              className={cn(
                "text-sm font-black tracking-wider drop-shadow-sm",
                phaseConfig.textColor,
              )}
            >
              {probability.toFixed(1)}% Rolldown Chance
            </span>
          </div>
        )}

        {/* Soft cap tick mark (below bar) */}
        <TickMark
          value={SOFT_CAP}
          position={softCapPos}
          isReached={softCapReached}
        />

        {/* Hard cap tick mark (below bar) */}
        <TickMark
          value={HARD_CAP}
          position={hardCapPos}
          isReached={hardCapReached}
          isHardCap
        />
      </div>

      {/* Current position indicator */}
      <div
        className="absolute -top-1.5 transition-all duration-1000 ease-out"
        style={{ left: `${fillPercent}%`, transform: "translateX(-50%)" }}
      >
        <div
          className={cn(
            "w-4 h-4 rounded-full border-2 shadow-lg",
            phase === "hard"
              ? "bg-red-400 border-red-300 shadow-red-500/50"
              : phase === "probabilistic"
                ? "bg-amber-400 border-amber-300 shadow-amber-500/50"
                : "bg-emerald-400 border-emerald-300 shadow-emerald-500/50",
          )}
        />
        {/* Current jackpot label */}
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap">
          <span
            className={cn(
              "text-[10px] font-bold px-2 py-0.5 rounded-full",
              phase === "hard"
                ? "bg-red-500/15 text-red-400 border border-red-500/20"
                : phase === "probabilistic"
                  ? "bg-amber-500/15 text-amber-400 border border-amber-500/20"
                  : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20",
            )}
          >
            {formatCurrency(jackpotAmount)}
          </span>
        </div>
      </div>
    </div>
  );
}

function NormalModeInfo() {
  return (
    <div className="mt-4 p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-emerald-500/10 shrink-0">
          <TrendingUp size={16} className="text-emerald-400" />
        </div>
        <div>
          <h4 className="text-sm font-semibold text-emerald-400 mb-1">
            Jackpot is Building
          </h4>
          <p className="text-xs text-muted-foreground leading-relaxed">
            The jackpot needs to reach{" "}
            <span className="font-semibold text-foreground">
              {formatCurrency(SOFT_CAP)}
            </span>{" "}
            before rolldown becomes possible. Every ticket purchased grows the
            jackpot and brings us closer to the +EV zone.
          </p>
        </div>
      </div>
    </div>
  );
}

function ProbabilisticInfo({
  probability,
  jackpotAmount,
}: {
  probability: number;
  jackpotAmount: number;
}) {
  const remaining = HARD_CAP - jackpotAmount;
  const urgency = probability > 80 ? "high" : probability > 50 ? "mid" : "low";

  const messages = {
    high: {
      title: "Rolldown Is Imminent!",
      description:
        "Extremely high probability of full jackpot distribution. This is the prime +EV entry window.",
      icon: AlertTriangle,
    },
    mid: {
      title: "Rolldown Likely Soon",
      description: `Better than even odds of rolldown. The jackpot needs ${formatCurrency(remaining)} more to reach the hard cap guarantee.`,
      icon: TrendingUp,
    },
    low: {
      title: "Rolldown Zone Active",
      description: `The probabilistic zone has been entered. Each draw has a ${probability.toFixed(1)}% chance of triggering rolldown.`,
      icon: TrendingUp,
    },
  };

  const msg = messages[urgency];
  const Icon = msg.icon;

  return (
    <div className="mt-4 p-4 rounded-xl bg-amber-500/5 border border-amber-500/10">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-amber-500/10 shrink-0">
          <Icon size={16} className="text-amber-400" />
        </div>
        <div>
          <h4 className="text-sm font-semibold text-amber-400 mb-1">
            {msg.title}
          </h4>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {msg.description}
          </p>
        </div>
      </div>
    </div>
  );
}

function HardCapInfo({ jackpotAmount }: { jackpotAmount: number }) {
  return (
    <div className="mt-4 p-4 rounded-xl bg-red-500/5 border border-red-500/10">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-red-500/10 shrink-0">
          <Zap size={16} className="text-red-400 animate-pulse" />
        </div>
        <div>
          <h4 className="text-sm font-semibold text-red-400 mb-1">
            Forced Rolldown — 100% Guaranteed
          </h4>
          <p className="text-xs text-muted-foreground leading-relaxed">
            The hard cap of {formatCurrency(HARD_CAP)} has been reached. The{" "}
            <span className="font-semibold text-foreground">
              entire jackpot of {formatCurrency(jackpotAmount)}
            </span>{" "}
            will be distributed to winners in this draw. All prizes are now
            pari-mutuel.
          </p>
        </div>
      </div>
    </div>
  );
}

function StatsRow({
  jackpotAmount,
  probability,
  ticketsSold,
  phase,
}: {
  jackpotAmount: number;
  probability: number;
  ticketsSold?: number;
  phase: RolldownPhase;
}) {
  const stats = useMemo(() => {
    const remaining = Math.max(0, HARD_CAP - jackpotAmount);
    const softRemaining = Math.max(0, SOFT_CAP - jackpotAmount);

    return [
      {
        label: "Current Jackpot",
        value: formatCurrency(jackpotAmount),
        sub: "USDC",
      },
      {
        label: "Rolldown Chance",
        value:
          phase === "normal"
            ? "Not Yet"
            : phase === "hard"
              ? "100%"
              : `${probability.toFixed(1)}%`,
        sub:
          phase === "probabilistic"
            ? "Per draw"
            : phase === "hard"
              ? "Guaranteed"
              : "",
      },
      {
        label: phase === "normal" ? "To Rolldown Zone" : "To Hard Cap",
        value: formatCurrency(phase === "normal" ? softRemaining : remaining),
        sub: "Remaining",
      },
      ...(ticketsSold != null
        ? [
          {
            label: "Tickets This Draw",
            value: ticketsSold.toLocaleString("en-US"),
            sub: "Sold so far",
          },
        ]
        : []),
    ];
  }, [jackpotAmount, probability, ticketsSold, phase]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="p-3 rounded-xl bg-card/50 border border-border/50 text-center"
        >
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
            {stat.label}
          </p>
          <p className="text-lg font-bold text-foreground tracking-tight">
            {stat.value}
          </p>
          {stat.sub && (
            <p className="text-[9px] text-muted-foreground/60 mt-0.5">
              {stat.sub}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Skeleton                                                                  */
/* -------------------------------------------------------------------------- */

function GaugeSkeleton() {
  return (
    <div className="animate-pulse">
      {/* Title skeleton */}
      <div className="h-5 w-40 bg-foreground/5 rounded mb-4" />
      {/* Gauge bar skeleton */}
      <div className="h-12 bg-foreground/5 rounded-full mb-16" />
      {/* Info box skeleton */}
      <div className="h-20 bg-foreground/5 rounded-xl" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main Component                                                            */
/* -------------------------------------------------------------------------- */

export function RolldownGauge({
  jackpotAmount,
  rolldownActive,
  loading = false,
  ticketsSold,
  className,
}: RolldownGaugeProps) {
  const phase = useMemo(() => getPhase(jackpotAmount), [jackpotAmount]);
  const probability = useMemo(
    () => calculateRolldownProbability(jackpotAmount),
    [jackpotAmount],
  );
  const phaseConfig = useMemo(
    () => getPhaseConfig(phase, probability),
    [phase, probability],
  );

  if (loading) {
    return <GaugeSkeleton />;
  }

  const PhaseIcon = phaseConfig.icon;

  return (
    <div className={cn("w-full", className)}>
      {/* Phase badge */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold tracking-wider uppercase",
            phaseConfig.badgeColor,
            phaseConfig.pulseClass,
          )}
        >
          <PhaseIcon size={12} />
          {phaseConfig.label}
        </div>

        {rolldownActive && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-xs font-bold text-emerald-400 tracking-wider uppercase animate-pulse">
            <CheckCircle2 size={12} />
            +EV Window Open
          </div>
        )}
      </div>

      {/* Description */}
      <p className="text-sm text-muted-foreground mb-2">
        {phaseConfig.description}
      </p>

      {/* The gauge */}
      <GaugeBar
        jackpotAmount={jackpotAmount}
        phase={phase}
        probability={probability}
        phaseConfig={phaseConfig}
      />

      {/* Phase-specific info */}
      {phase === "normal" && <NormalModeInfo />}
      {phase === "probabilistic" && (
        <ProbabilisticInfo
          probability={probability}
          jackpotAmount={jackpotAmount}
        />
      )}
      {phase === "hard" && <HardCapInfo jackpotAmount={jackpotAmount} />}

      {/* Stats row */}
      <StatsRow
        jackpotAmount={jackpotAmount}
        probability={probability}
        ticketsSold={ticketsSold}
        phase={phase}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Compact variant — for headers, sidebars, cards                            */
/* -------------------------------------------------------------------------- */

export interface RolldownGaugeCompactProps {
  jackpotAmount: number;
  loading?: boolean;
  className?: string;
}

export function RolldownGaugeCompact({
  jackpotAmount,
  loading = false,
  className,
}: RolldownGaugeCompactProps) {
  const probability = useMemo(
    () => calculateRolldownProbability(jackpotAmount),
    [jackpotAmount],
  );
  const phase = useMemo(() => getPhase(jackpotAmount), [jackpotAmount]);
  const fillPercent = Math.min((jackpotAmount / HARD_CAP) * 100, 100);

  if (loading) {
    return (
      <div className={cn("animate-pulse", className)}>
        <div className="h-2 bg-foreground/5 rounded-full w-full" />
      </div>
    );
  }

  return (
    <div className={cn("w-full", className)}>
      {/* Tiny gauge bar */}
      <div className="relative h-2 rounded-full bg-foreground/5 border border-foreground/10 overflow-hidden mb-1.5">
        <div
          className={cn(
            "absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out",
            phase === "hard"
              ? "bg-red-400 shadow-sm shadow-red-500/30"
              : phase === "probabilistic"
                ? "bg-amber-400"
                : "bg-emerald-500",
          )}
          style={{ width: `${fillPercent}%` }}
        />
      </div>

      {/* Info row */}
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-muted-foreground">
          {formatCurrency(jackpotAmount)} / {formatCurrency(HARD_CAP)}
        </span>
        <span
          className={cn(
            "font-semibold",
            phase === "hard"
              ? "text-red-400"
              : phase === "probabilistic"
                ? "text-amber-400"
                : "text-emerald-400",
          )}
        >
          {phase === "normal"
            ? "Building"
            : phase === "hard"
              ? "100% Rolldown"
              : `${probability.toFixed(0)}% chance`}
        </span>
      </div>
    </div>
  );
}
