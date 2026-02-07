import { useEffect, useState } from "react";

interface LotteryBallProps {
  number: number;
  delay?: number;
  size?: "sm" | "md" | "lg";
  variant?: "emerald" | "gold" | "muted";
  animated?: boolean;
}

const sizeClasses = {
  sm: "w-8 h-8 text-xs font-bold",
  md: "w-12 h-12 text-lg font-bold",
  lg: "w-16 h-16 text-2xl font-black",
};

export function LotteryBall({
  number,
  delay = 0,
  size = "md",
  variant = "emerald",
  animated = true,
}: LotteryBallProps) {
  const [visible, setVisible] = useState(!animated);

  useEffect(() => {
    if (!animated) return;
    const timeout = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timeout);
  }, [animated, delay]);

  const variantClass =
    variant === "gold"
      ? "lottery-ball-gold"
      : variant === "muted"
        ? "lottery-ball-muted"
        : "lottery-ball";

  return (
    <div
      className={`
        ${sizeClasses[size]}
        ${variantClass}
        rounded-full flex items-center justify-center
        select-none cursor-default
        transition-all duration-300
        ${
          animated
            ? visible
              ? "animate-ball-bounce opacity-100"
              : "opacity-0 scale-0"
            : ""
        }
      `}
      style={animated ? { animationDelay: `${delay}ms` } : undefined}
    >
      {number}
    </div>
  );
}

interface LotteryBallRowProps {
  numbers: number[];
  size?: "sm" | "md" | "lg";
  variant?: "emerald" | "gold" | "muted";
  animated?: boolean;
  staggerDelay?: number;
  className?: string;
}

export function LotteryBallRow({
  numbers,
  size = "md",
  variant = "emerald",
  animated = true,
  staggerDelay = 120,
  className = "",
}: LotteryBallRowProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {numbers.map((num, i) => (
        <LotteryBall
          key={`${num}-${i}`}
          number={num}
          size={size}
          variant={variant}
          animated={animated}
          delay={i * staggerDelay}
        />
      ))}
    </div>
  );
}

/**
 * Decorative floating balls for hero backgrounds or section accents.
 * Renders faded, slowly-floating lottery balls scattered across a container.
 */
interface FloatingBallsProps {
  count?: number;
  className?: string;
}

interface BallConfig {
  number: number;
  x: number;
  y: number;
  size: number;
  opacity: number;
  animDelay: number;
  isGold: boolean;
}

export function FloatingBalls({
  count = 8,
  className = "",
}: FloatingBallsProps) {
  const [balls, setBalls] = useState<BallConfig[]>([]);

  useEffect(() => {
    const generated: BallConfig[] = Array.from({ length: count }, (_, i) => ({
      number: Math.floor(Math.random() * 46) + 1,
      x: Math.random() * 90 + 5,
      y: Math.random() * 80 + 10,
      size: Math.random() * 24 + 28,
      opacity: Math.random() * 0.12 + 0.04,
      animDelay: Math.random() * 6,
      isGold: i % 4 === 0,
    }));
    setBalls(generated);
  }, [count]);

  return (
    <div
      className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}
      aria-hidden="true"
    >
      {balls.map((ball, i) => (
        <div
          key={i}
          className="absolute animate-float"
          style={{
            left: `${ball.x}%`,
            top: `${ball.y}%`,
            width: ball.size,
            height: ball.size,
            opacity: ball.opacity,
            animationDelay: `${ball.animDelay}s`,
            animationDuration: `${6 + Math.random() * 4}s`,
          }}
        >
          <div
            className={`w-full h-full rounded-full flex items-center justify-center text-[10px] font-bold ${
              ball.isGold
                ? "bg-gradient-to-br from-gold-light to-gold-dark text-white/70"
                : "bg-gradient-to-br from-emerald-light to-emerald-dark text-white/70"
            }`}
            style={{
              boxShadow: ball.isGold
                ? "inset 0 -2px 4px rgba(0,0,0,0.2), inset 0 2px 4px rgba(255,255,255,0.15)"
                : "inset 0 -2px 4px rgba(0,0,0,0.2), inset 0 2px 4px rgba(255,255,255,0.15)",
            }}
          >
            {ball.number}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Static display row used for showing winning numbers in results, tables, etc.
 */
interface WinningNumbersProps {
  numbers: number[];
  matchedIndices?: Set<number>;
  size?: "sm" | "md";
}

export function WinningNumbers({
  numbers,
  matchedIndices,
  size = "sm",
}: WinningNumbersProps) {
  return (
    <div className="flex items-center gap-1.5">
      {numbers.map((num, i) => {
        const isMatched = matchedIndices?.has(i);
        return (
          <div
            key={`${num}-${i}`}
            className={`
              ${size === "sm" ? "w-7 h-7 text-[11px]" : "w-9 h-9 text-sm"}
              rounded-full flex items-center justify-center font-bold
              transition-colors duration-300
              ${
                isMatched
                  ? "bg-gradient-to-br from-gold-light to-gold text-navy shadow-sm shadow-gold/20"
                  : "bg-foreground/5 text-muted-foreground border border-foreground/10"
              }
            `}
          >
            {num}
          </div>
        );
      })}
    </div>
  );
}
