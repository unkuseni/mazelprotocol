import { useState, useEffect, useRef, useCallback } from "react";
import { Trophy, TrendingUp } from "lucide-react";

interface JackpotDisplayProps {
  /** Target amount in dollars (e.g., 1247832) */
  amount: number;
  /** Label shown above the amount */
  label?: string;
  /** Whether to animate the count-up on mount */
  animated?: boolean;
  /** Duration of count-up animation in ms */
  duration?: number;
  /** Size variant */
  size?: "sm" | "md" | "lg" | "xl";
  /** Whether to show the pulsing glow effect */
  glow?: boolean;
  /** Whether to show the rolldown status badge */
  showRolldownStatus?: boolean;
  /** Current rolldown status */
  rolldownActive?: boolean;
  /** Soft cap value for progress bar */
  softCap?: number;
  /** Additional CSS classes */
  className?: string;
}

const sizeConfig = {
  sm: {
    amountClass: "text-2xl sm:text-3xl",
    labelClass: "text-xs",
    iconSize: 16,
    padding: "px-4 py-3",
  },
  md: {
    amountClass: "text-3xl sm:text-4xl",
    labelClass: "text-sm",
    iconSize: 20,
    padding: "px-5 py-4",
  },
  lg: {
    amountClass: "text-4xl sm:text-5xl md:text-6xl",
    labelClass: "text-sm",
    iconSize: 24,
    padding: "px-6 py-6",
  },
  xl: {
    amountClass: "text-5xl sm:text-6xl md:text-7xl",
    labelClass: "text-base",
    iconSize: 28,
    padding: "px-8 py-8",
  },
};

function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    // Show one decimal only if it's not a round number
    if (millions % 1 === 0) {
      return `$${millions.toFixed(0)}M`;
    }
    return `$${millions.toFixed(millions >= 10 ? 1 : 2)}M`;
  }
  return `$${value.toLocaleString("en-US")}`;
}

function formatCurrencyFull(value: number): string {
  return `$${Math.floor(value).toLocaleString("en-US")}`;
}

export function JackpotDisplay({
  amount,
  label = "Current Jackpot",
  animated = true,
  duration = 2000,
  size = "lg",
  glow = true,
  showRolldownStatus = false,
  rolldownActive = false,
  softCap = 1_750_000,
  className = "",
}: JackpotDisplayProps) {
  const [displayValue, setDisplayValue] = useState(animated ? 0 : amount);
  const [hasAnimated, setHasAnimated] = useState(!animated);
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);

  const config = sizeConfig[size];
  const progress = softCap > 0 ? Math.min((amount / softCap) * 100, 100) : 0;

  const animate = useCallback(() => {
    const startTime = performance.now();
    const startValue = 0;

    function step(currentTime: number) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutExpo(progress);
      const currentValue = startValue + (amount - startValue) * easedProgress;

      setDisplayValue(Math.floor(currentValue));

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(step);
      } else {
        setDisplayValue(amount);
        setHasAnimated(true);
      }
    }

    animFrameRef.current = requestAnimationFrame(step);
  }, [amount, duration]);

  useEffect(() => {
    if (!animated) {
      setDisplayValue(amount);
      return;
    }

    // Use IntersectionObserver to trigger animation when visible
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !hasAnimated) {
            animate();
          }
        });
      },
      { threshold: 0.3 },
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      observer.disconnect();
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [animated, animate, hasAnimated]);

  // Update display when amount changes after initial animation
  useEffect(() => {
    if (hasAnimated) {
      setDisplayValue(amount);
    }
  }, [amount, hasAnimated]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div
        className={`
          relative rounded-2xl overflow-hidden
          ${config.padding}
          ${glow ? "glow-gold" : ""}
        `}
      >
        {/* Background with gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-card/80 via-muted/60 to-card/80 dark:from-navy-light/80 dark:via-navy/60 dark:to-navy-deep/80 backdrop-blur-sm border border-gold/10 rounded-2xl" />

        {/* Subtle shimmer overlay */}
        <div
          className="absolute inset-0 opacity-[0.03] rounded-2xl"
          style={{
            background:
              "linear-gradient(110deg, transparent 25%, rgba(255,255,255,0.1) 50%, transparent 75%)",
            backgroundSize: "200% 100%",
            animation: "shimmer 3s linear infinite",
          }}
        />

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center text-center">
          {/* Label row */}
          <div className="flex items-center gap-2 mb-2">
            <Trophy size={config.iconSize} className="text-gold" />
            <span
              className={`${config.labelClass} font-semibold text-gold/80 uppercase tracking-wider`}
            >
              {label}
            </span>
          </div>

          {/* Main amount */}
          <div
            className={`${config.amountClass} font-black tracking-tight shimmer-text leading-none`}
          >
            {formatCurrencyFull(displayValue)}
          </div>

          {/* Sub-info */}
          {size !== "sm" && (
            <div className="mt-2 text-xs text-muted-foreground">
              {formatCurrency(amount)} USDC
            </div>
          )}

          {/* Rolldown status badge */}
          {showRolldownStatus && (
            <div className="mt-3">
              {rolldownActive ? (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald/15 border border-emerald/30">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald animate-pulse" />
                  <span className="text-xs font-semibold text-emerald-light">
                    Rolldown Active — +EV Window Open
                  </span>
                  <TrendingUp size={12} className="text-emerald-light" />
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-foreground/5 border border-foreground/10">
                  <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">
                    Normal Draw Mode
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Progress bar to soft cap */}
          {softCap > 0 && size !== "sm" && (
            <div className="w-full max-w-xs mt-4">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1.5">
                <span>Rolldown at {formatCurrency(softCap)}</span>
                <span className="text-gold/70 font-medium">
                  {progress.toFixed(1)}%
                </span>
              </div>
              <div className="h-1.5 bg-foreground/5 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-1000 ease-out"
                  style={{
                    width: `${animated && !hasAnimated ? 0 : progress}%`,
                    background:
                      progress >= 100
                        ? "linear-gradient(90deg, oklch(0.55 0.17 160), oklch(0.72 0.19 160))"
                        : "linear-gradient(90deg, oklch(0.6 0.15 85), oklch(0.75 0.15 85))",
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Compact inline jackpot display for headers, tickers, etc.
 */
interface JackpotBadgeProps {
  amount: number;
  className?: string;
}

export function JackpotBadge({ amount, className = "" }: JackpotBadgeProps) {
  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gold/10 border border-gold/20 ${className}`}
    >
      <div className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse-glow" />
      <span className="text-xs font-semibold text-gold">
        Jackpot: {formatCurrency(amount)}
      </span>
    </div>
  );
}

/**
 * Mini display showing just the amount with a label, used in stat bars.
 */
interface JackpotStatProps {
  amount: number;
  label?: string;
  className?: string;
}

export function JackpotStat({
  amount,
  label = "Jackpot",
  className = "",
}: JackpotStatProps) {
  return (
    <div className={`flex flex-col items-center ${className}`}>
      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
        {label}
      </span>
      <span className="text-lg font-bold text-gradient-gold">
        {formatCurrency(amount)}
      </span>
    </div>
  );
}
