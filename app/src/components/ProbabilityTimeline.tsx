import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { TrendingUp, ArrowRight } from "lucide-react";

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

const SOFT_CAP = 1_750_000;
const HARD_CAP = 2_250_000;
const RANGE = HARD_CAP - SOFT_CAP;
const SEED_AMOUNT = 500_000;

/** Key milestones on the timeline */
const MILESTONES = [
  { amount: SEED_AMOUNT, label: "Seed", description: "Initial jackpot funding" },
  { amount: 1_000_000, label: "$1M", description: "Fee rises to 36%" },
  { amount: 1_500_000, label: "$1.5M", description: "Fee hits 40%" },
  { amount: SOFT_CAP, label: "Soft Cap", description: "Probabilistic rolldown begins" },
  { amount: 2_000_000, label: "$2M", description: "~50% rolldown probability" },
  { amount: HARD_CAP, label: "Hard Cap", description: "Forced 100% rolldown" },
];

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function formatCurrency(value: number): string {
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    return m % 1 === 0 ? `$${m.toFixed(0)}M` : `$${m.toFixed(1)}M`;
  }
  return `$${(value / 1_000).toFixed(0)}K`;
}

function calculateProbability(jackpot: number): number {
  if (jackpot >= HARD_CAP) return 100;
  if (jackpot < SOFT_CAP) return 0;
  return ((jackpot - SOFT_CAP) / RANGE) * 100;
}

/* -------------------------------------------------------------------------- */
/*  Main Component                                                            */
/* -------------------------------------------------------------------------- */

export interface ProbabilityTimelineProps {
  currentJackpot: number;
  loading?: boolean;
  className?: string;
}

export function ProbabilityTimeline({
  currentJackpot,
  loading = false,
  className,
}: ProbabilityTimelineProps) {
  // Generate curve data points
  const curvePoints = useMemo(() => {
    const points: { x: number; y: number; jackpot: number }[] = [];
    const step = 25_000; // $25k steps
    for (let j = SEED_AMOUNT; j <= HARD_CAP + step; j += step) {
      const x = ((j - SEED_AMOUNT) / (HARD_CAP - SEED_AMOUNT)) * 100;
      const y = 100 - calculateProbability(j); // invert for SVG (top = 0%)
      points.push({ x, y, jackpot: j });
    }
    return points;
  }, []);

  // Build SVG path
  const pathD = useMemo(() => {
    if (curvePoints.length === 0) return "";
    const parts = curvePoints.map((p, i) =>
      i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`,
    );
    return parts.join(" ");
  }, [curvePoints]);

  // Current position
  const currentPosition = useMemo(() => {
    const clamped = Math.min(Math.max(currentJackpot, SEED_AMOUNT), HARD_CAP);
    return ((clamped - SEED_AMOUNT) / (HARD_CAP - SEED_AMOUNT)) * 100;
  }, [currentJackpot]);

  const currentProbability = useMemo(
    () => calculateProbability(currentJackpot),
    [currentJackpot],
  );

  if (loading) {
    return (
      <div className={cn("animate-pulse p-6 rounded-2xl bg-card/50 border border-border/50", className)}>
        <div className="h-6 w-48 bg-foreground/5 rounded mb-4" />
        <div className="h-40 bg-foreground/5 rounded-xl" />
      </div>
    );
  }

  return (
    <div className={cn("p-6 rounded-2xl bg-card/50 border border-border/50", className)}>
      <div className="flex items-center gap-2 mb-1">
        <TrendingUp size={18} className="text-gold" />
        <h3 className="text-lg font-bold text-foreground">
          Rolldown Probability Curve
        </h3>
      </div>
      <p className="text-xs text-muted-foreground mb-6">
        As the jackpot grows from {formatCurrency(SOFT_CAP)} to {formatCurrency(HARD_CAP)},
        the probability of rolldown increases linearly from 0% to 100%.
      </p>

      {/* SVG Chart */}
      <div className="relative w-full max-h-64 mb-6" style={{ aspectRatio: "2/1" }}>
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full"
          preserveAspectRatio="none"
          role="img"
          aria-label="Rolldown probability curve showing probability increase from 0% to 100% as jackpot grows"
        >
          <title>Rolldown Probability Curve</title>
          {/* Grid lines */}
          <defs>
            <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
              <path d="M 10 0 L 0 0 0 10" fill="none" stroke="currentColor" strokeWidth="0.15" className="text-foreground/5" />
            </pattern>
          </defs>
          <rect width="100" height="100" fill="url(#grid)" />

          {/* Probability zone shading */}
          <defs>
            <linearGradient id="probGradient" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="oklch(0.55 0.17 160)" stopOpacity="0.15" />
              <stop offset="50%" stopColor="oklch(0.68 0.14 85)" stopOpacity="0.15" />
              <stop offset="100%" stopColor="oklch(0.5 0.18 25)" stopOpacity="0.25" />
            </linearGradient>
          </defs>

          {/* Soft cap zone marker */}
          <rect
            x={(SOFT_CAP - SEED_AMOUNT) / (HARD_CAP - SEED_AMOUNT) * 100}
            y="0"
            width={(RANGE / (HARD_CAP - SEED_AMOUNT)) * 100}
            height="100"
            fill="url(#probGradient)"
          />

          {/* Probability curve */}
          <path
            d={pathD}
            fill="none"
            stroke="oklch(0.68 0.14 85)"
            strokeWidth="0.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Filled area under curve in probability zone */}
          {currentJackpot >= SOFT_CAP && (
            <path
              d={`${pathD} L 100 100 L 0 100 Z`}
              fill="oklch(0.68 0.14 85 / 0.08)"
            />
          )}
        </svg>

        {/* Current position dot */}
        <div
          className="absolute bottom-0 transition-all duration-1000 ease-out"
          style={{ left: `${currentPosition}%`, transform: "translateX(-50%)" }}
        >
          <div className="relative">
            <div
              className={cn(
                "w-3 h-3 rounded-full border-2 shadow-lg",
                currentJackpot >= HARD_CAP
                  ? "bg-red-400 border-red-300 shadow-red-500/50"
                  : currentJackpot >= SOFT_CAP
                    ? "bg-amber-400 border-amber-300 shadow-amber-500/50"
                    : "bg-emerald-400 border-emerald-300 shadow-emerald-500/50",
              )}
            />
            {/* Tooltip */}
            <div className="absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap">
              <span
                className={cn(
                  "text-[9px] font-bold px-1.5 py-0.5 rounded-full border",
                  currentJackpot >= HARD_CAP
                    ? "bg-red-500/15 text-red-400 border-red-500/20"
                    : currentJackpot >= SOFT_CAP
                      ? "bg-amber-500/15 text-amber-400 border-amber-500/20"
                      : "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
                )}
              >
                {formatCurrency(currentJackpot)}
                {currentJackpot >= SOFT_CAP && (
                  <span className="ml-0.5 opacity-80">
                    ({currentProbability.toFixed(0)}%)
                  </span>
                )}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Milestones row */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {MILESTONES.map((m) => {
          const isReached = currentJackpot >= m.amount;
          const isCurrent =
            currentJackpot >= m.amount &&
            (MILESTONES[MILESTONES.indexOf(m) + 1]?.amount ?? HARD_CAP + 1) >
            currentJackpot;

          return (
            <div
              key={m.label}
              className={cn(
                "text-center p-2 rounded-lg transition-colors",
                isCurrent
                  ? "bg-gold/10 border border-gold/20"
                  : isReached
                    ? "bg-emerald-500/5 border border-emerald-500/10"
                    : "bg-foreground/3 border border-foreground/5",
              )}
            >
              <div className="flex items-center justify-center gap-1 mb-0.5">
                <span
                  className={cn(
                    "text-[10px] font-bold",
                    isCurrent
                      ? "text-gold"
                      : isReached
                        ? "text-emerald-400"
                        : "text-muted-foreground",
                  )}
                >
                  {m.label}
                </span>
                {isReached && !isCurrent && (
                  <ArrowRight size={8} className="text-emerald-400/60" />
                )}
              </div>
              <p className="text-[8px] text-muted-foreground/70 leading-tight">
                {m.description}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
