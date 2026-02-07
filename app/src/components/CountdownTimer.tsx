import { useState, useEffect, useCallback } from "react";
import { Clock, Zap } from "lucide-react";

interface TimeLeft {
  hours: number;
  minutes: number;
  seconds: number;
  total: number;
}

interface CountdownTimerProps {
  /** Target timestamp for the next draw (Unix ms) */
  targetTime?: number;
  /** Label shown above the countdown */
  label?: string;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Whether to show the pulsing urgency state when time is low */
  showUrgency?: boolean;
  /** Threshold in seconds below which urgency state activates */
  urgencyThreshold?: number;
  /** Callback fired when the countdown reaches zero */
  onComplete?: () => void;
  /** Additional CSS classes */
  className?: string;
}

function padZero(n: number): string {
  return n.toString().padStart(2, "0");
}

function getTimeLeft(targetTime: number): TimeLeft {
  const now = Date.now();
  const total = Math.max(0, targetTime - now);
  const seconds = Math.floor((total / 1000) % 60);
  const minutes = Math.floor((total / 1000 / 60) % 60);
  const hours = Math.floor(total / 1000 / 60 / 60);

  return { hours, minutes, seconds, total };
}

/** Returns a default "next draw" target — the next UTC midnight from now */
function getNextDailyDraw(): number {
  const now = new Date();
  const next = new Date(now);
  next.setUTCDate(next.getUTCDate() + 1);
  next.setUTCHours(0, 0, 0, 0);
  return next.getTime();
}

const sizeConfig = {
  sm: {
    digitClass: "text-lg font-bold",
    labelClass: "text-[9px]",
    separatorClass: "text-lg",
    boxPadding: "px-2 py-1",
    gap: "gap-1",
    iconSize: 12,
    headerClass: "text-[10px]",
  },
  md: {
    digitClass: "text-2xl sm:text-3xl font-bold",
    labelClass: "text-[10px]",
    separatorClass: "text-2xl sm:text-3xl",
    boxPadding: "px-3 py-2",
    gap: "gap-2",
    iconSize: 14,
    headerClass: "text-xs",
  },
  lg: {
    digitClass: "text-4xl sm:text-5xl font-black",
    labelClass: "text-xs",
    separatorClass: "text-4xl sm:text-5xl",
    boxPadding: "px-4 py-3",
    gap: "gap-3",
    iconSize: 18,
    headerClass: "text-sm",
  },
};

interface TimeUnitBoxProps {
  value: string;
  label: string;
  size: "sm" | "md" | "lg";
  isUrgent: boolean;
}

function TimeUnitBox({ value, label, size, isUrgent }: TimeUnitBoxProps) {
  const config = sizeConfig[size];

  return (
    <div className="flex flex-col items-center">
      <div
        className={`
          ${config.boxPadding}
          rounded-xl
          min-w-[2.5em]
          flex items-center justify-center
          transition-all duration-300
          ${
            isUrgent
              ? "bg-gradient-to-b from-red-500/15 to-red-600/10 border border-red-500/30 shadow-sm shadow-red-500/10"
              : "bg-foreground/[0.03] border border-foreground/[0.06]"
          }
        `}
      >
        <span
          className={`
            ${config.digitClass}
            tabular-nums tracking-tight leading-none
            ${isUrgent ? "text-red-400" : "text-foreground"}
            transition-colors duration-300
          `}
        >
          {value}
        </span>
      </div>
      <span
        className={`
          ${config.labelClass}
          mt-1.5 uppercase tracking-wider font-medium
          ${isUrgent ? "text-red-400/60" : "text-muted-foreground"}
        `}
      >
        {label}
      </span>
    </div>
  );
}

function TimeSeparator({
  size,
  isUrgent,
}: {
  size: "sm" | "md" | "lg";
  isUrgent: boolean;
}) {
  const config = sizeConfig[size];

  return (
    <div className="flex flex-col items-center justify-center pb-5">
      <span
        className={`
          ${config.separatorClass}
          font-bold leading-none
          ${isUrgent ? "text-red-400/50 animate-pulse" : "text-muted-foreground/60"}
          transition-colors duration-300
        `}
      >
        :
      </span>
    </div>
  );
}

export function CountdownTimer({
  targetTime,
  label = "Next Draw",
  size = "md",
  showUrgency = true,
  urgencyThreshold = 300,
  onComplete,
  className = "",
}: CountdownTimerProps) {
  const target = targetTime ?? getNextDailyDraw();
  const [timeLeft, setTimeLeft] = useState<TimeLeft>(getTimeLeft(target));
  const [completed, setCompleted] = useState(false);

  const config = sizeConfig[size];
  const isUrgent =
    showUrgency &&
    timeLeft.total > 0 &&
    timeLeft.total / 1000 <= urgencyThreshold;

  const handleComplete = useCallback(() => {
    if (!completed) {
      setCompleted(true);
      onComplete?.();
    }
  }, [completed, onComplete]);

  useEffect(() => {
    const interval = setInterval(() => {
      const updated = getTimeLeft(target);
      setTimeLeft(updated);

      if (updated.total <= 0) {
        clearInterval(interval);
        handleComplete();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [target, handleComplete]);

  // If countdown is done, show a "drawing" state
  if (timeLeft.total <= 0) {
    return (
      <div className={`flex flex-col items-center ${className}`}>
        <div className="flex items-center gap-2 mb-3">
          <Zap
            size={config.iconSize}
            className="text-emerald-light animate-pulse"
          />
          <span
            className={`${config.headerClass} font-semibold text-emerald-light uppercase tracking-wider`}
          >
            Drawing Now
          </span>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-emerald/10 border border-emerald/20">
          <div className="w-2 h-2 rounded-full bg-emerald animate-ping" />
          <span className="text-sm font-medium text-emerald-light">
            Results incoming...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center ${className}`}>
      {/* Header label */}
      <div className="flex items-center gap-1.5 mb-3">
        <Clock
          size={config.iconSize}
          className={`${isUrgent ? "text-red-400" : "text-muted-foreground"} transition-colors`}
        />
        <span
          className={`
            ${config.headerClass}
            font-semibold uppercase tracking-wider
            ${isUrgent ? "text-red-400/80" : "text-muted-foreground"}
            transition-colors
          `}
        >
          {label}
        </span>
        {isUrgent && (
          <span className="ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-500/15 border border-red-500/25 text-[9px] font-semibold text-red-400 uppercase tracking-wider animate-pulse">
            <Zap size={8} />
            Soon
          </span>
        )}
      </div>

      {/* Timer digits */}
      <div className={`flex items-start ${config.gap}`}>
        <TimeUnitBox
          value={padZero(timeLeft.hours)}
          label="Hours"
          size={size}
          isUrgent={isUrgent}
        />
        <TimeSeparator size={size} isUrgent={isUrgent} />
        <TimeUnitBox
          value={padZero(timeLeft.minutes)}
          label="Min"
          size={size}
          isUrgent={isUrgent}
        />
        <TimeSeparator size={size} isUrgent={isUrgent} />
        <TimeUnitBox
          value={padZero(timeLeft.seconds)}
          label="Sec"
          size={size}
          isUrgent={isUrgent}
        />
      </div>

      {/* Sub-label with draw time */}
      {size !== "sm" && (
        <p className="mt-3 text-[10px] text-muted-foreground/60">
          Daily at 00:00 UTC
        </p>
      )}
    </div>
  );
}

/**
 * Compact single-line countdown for tickers and badges.
 */
interface InlineCountdownProps {
  targetTime?: number;
  label?: string;
  className?: string;
}

export function InlineCountdown({
  targetTime,
  label = "Next draw",
  className = "",
}: InlineCountdownProps) {
  const target = targetTime ?? getNextDailyDraw();
  const [timeLeft, setTimeLeft] = useState<TimeLeft>(getTimeLeft(target));

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(getTimeLeft(target));
    }, 1000);

    return () => clearInterval(interval);
  }, [target]);

  if (timeLeft.total <= 0) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 text-emerald-light ${className}`}
      >
        <div className="w-1.5 h-1.5 rounded-full bg-emerald animate-ping" />
        <span className="text-xs font-semibold">Drawing now...</span>
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <Clock size={12} className="text-muted-foreground" />
      <span className="text-xs text-muted-foreground">
        {label}:{" "}
        <span className="font-semibold text-foreground tabular-nums">
          {padZero(timeLeft.hours)}:{padZero(timeLeft.minutes)}:
          {padZero(timeLeft.seconds)}
        </span>
      </span>
    </span>
  );
}

/**
 * Quick Pick specific countdown — shows time until next 4-hour draw.
 */
interface QuickPickCountdownProps {
  size?: "sm" | "md";
  className?: string;
}

export function QuickPickCountdown({
  size = "sm",
  className = "",
}: QuickPickCountdownProps) {
  const [target, setTarget] = useState(() => {
    const now = new Date();
    const currentHour = now.getUTCHours();
    const nextDrawHour = Math.ceil(currentHour / 4) * 4;
    const next = new Date(now);

    if (nextDrawHour >= 24) {
      next.setUTCDate(next.getUTCDate() + 1);
      next.setUTCHours(0, 0, 0, 0);
    } else {
      next.setUTCHours(nextDrawHour, 0, 0, 0);
    }

    return next.getTime();
  });

  const [timeLeft, setTimeLeft] = useState<TimeLeft>(getTimeLeft(target));

  useEffect(() => {
    const interval = setInterval(() => {
      const updated = getTimeLeft(target);
      setTimeLeft(updated);

      // If completed, calculate the next 4-hour window
      if (updated.total <= 0) {
        const now = new Date();
        const currentHour = now.getUTCHours();
        const nextDrawHour = Math.ceil((currentHour + 0.01) / 4) * 4;
        const next = new Date(now);

        if (nextDrawHour >= 24) {
          next.setUTCDate(next.getUTCDate() + 1);
          next.setUTCHours(0, 0, 0, 0);
        } else {
          next.setUTCHours(nextDrawHour, 0, 0, 0);
        }

        setTarget(next.getTime());
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [target]);

  const isUrgent = timeLeft.total > 0 && timeLeft.total / 1000 <= 120;

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <Zap
        size={size === "sm" ? 12 : 14}
        className={isUrgent ? "text-red-400" : "text-emerald"}
      />
      <span
        className={`${size === "sm" ? "text-xs" : "text-sm"} text-muted-foreground`}
      >
        Quick Pick:{" "}
        <span
          className={`font-semibold tabular-nums ${isUrgent ? "text-red-400" : "text-foreground"}`}
        >
          {padZero(timeLeft.hours)}:{padZero(timeLeft.minutes)}:
          {padZero(timeLeft.seconds)}
        </span>
      </span>
    </div>
  );
}
