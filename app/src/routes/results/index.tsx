import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Award,
  BarChart3,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Eye,
  Filter,
  Hash,
  type LucideIcon,
  Search,
  Sparkles,
  Star,
  Ticket,
  TrendingUp,
  Trophy,
  Wallet,
  Zap,
} from "lucide-react";
import { useMemo, useState } from "react";
import { CountdownTimer } from "@/components/CountdownTimer";
import Footer from "@/components/Footer";
import { JackpotDisplay } from "@/components/JackpotDisplay";
import { FloatingBalls, WinningNumbers } from "@/components/LotteryBalls";
import { Button } from "@/components/ui/button";
import { useAppKit, useAppKitAccount } from "@/lib/appkit-provider";

export const Route = createFileRoute("/results/")({
  component: ResultsPage,
});

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

type GameFilter = "all" | "main" | "quickpick";
type RolldownFilter = "all" | "rolldown" | "normal";

interface DrawResult {
  drawId: number;
  date: string;
  time: string;
  gameType: "main" | "quickpick";
  winningNumbers: number[];
  totalTickets: number;
  jackpotAtDraw: number;
  prizePoolDistributed: number;
  wasRolldown: boolean;
  rolldownTrigger?: "soft_cap" | "hard_cap";
  matchCounts: {
    match6?: number;
    match5: number;
    match4: number;
    match3: number;
    match2: number;
  };
  prizesPerWinner: {
    match6?: number;
    match5: number;
    match4: number;
    match3: number;
    match2: number;
  };
  totalPrizesPaid: number;
  jackpotAfterDraw: number;
  houseFeeCollected: number;
  randomnessProof: string;
  verificationHash: string;
}

/* -------------------------------------------------------------------------- */
/*  Mock Data                                                                 */
/* -------------------------------------------------------------------------- */

const MOCK_DRAWS: DrawResult[] = [
  {
    drawId: 89,
    date: "2025-06-14",
    time: "00:00 UTC",
    gameType: "main",
    winningNumbers: [3, 12, 18, 27, 33, 41],
    totalTickets: 14_200,
    jackpotAtDraw: 1_247_832,
    prizePoolDistributed: 24_850,
    wasRolldown: false,
    matchCounts: {
      match6: 0,
      match5: 2,
      match4: 87,
      match3: 1_420,
      match2: 8_340,
    },
    prizesPerWinner: {
      match6: 0,
      match5: 1_000,
      match4: 50,
      match3: 5,
      match2: 0,
    },
    totalPrizesPaid: 17_450,
    jackpotAfterDraw: 1_270_382,
    houseFeeCollected: 11_360,
    randomnessProof: "Switchboard TEE · Slot 285,471,220",
    verificationHash: "a3f7c1b9e2d4...8k5m",
  },
  {
    drawId: 88,
    date: "2025-06-13",
    time: "00:00 UTC",
    gameType: "main",
    winningNumbers: [7, 14, 22, 31, 38, 45],
    totalTickets: 28_400,
    jackpotAtDraw: 1_820_000,
    prizePoolDistributed: 1_820_000,
    wasRolldown: true,
    rolldownTrigger: "soft_cap",
    matchCounts: {
      match6: 0,
      match5: 5,
      match4: 210,
      match3: 3_100,
      match2: 17_600,
    },
    prizesPerWinner: {
      match6: 0,
      match5: 72_800,
      match4: 1_387,
      match3: 94,
      match2: 0,
    },
    totalPrizesPaid: 949_200,
    jackpotAfterDraw: 500_000,
    houseFeeCollected: 22_720,
    randomnessProof: "Switchboard TEE · Slot 285,328,810",
    verificationHash: "f2a8d7c4e1b5...3n9p",
  },
  {
    drawId: 87,
    date: "2025-06-12",
    time: "00:00 UTC",
    gameType: "main",
    winningNumbers: [1, 9, 17, 28, 35, 42],
    totalTickets: 12_800,
    jackpotAtDraw: 1_180_000,
    prizePoolDistributed: 22_200,
    wasRolldown: false,
    matchCounts: {
      match6: 0,
      match5: 1,
      match4: 62,
      match3: 1_100,
      match2: 6_800,
    },
    prizesPerWinner: {
      match6: 0,
      match5: 1_000,
      match4: 50,
      match3: 5,
      match2: 0,
    },
    totalPrizesPaid: 9_600,
    jackpotAfterDraw: 1_192_400,
    houseFeeCollected: 10_240,
    randomnessProof: "Switchboard TEE · Slot 285,186,400",
    verificationHash: "b4d2f8a1c7e3...6j2q",
  },
  {
    drawId: 86,
    date: "2025-06-11",
    time: "00:00 UTC",
    gameType: "main",
    winningNumbers: [5, 11, 23, 30, 37, 44],
    totalTickets: 11_500,
    jackpotAtDraw: 1_050_000,
    prizePoolDistributed: 19_800,
    wasRolldown: false,
    matchCounts: {
      match6: 0,
      match5: 0,
      match4: 55,
      match3: 980,
      match2: 5_900,
    },
    prizesPerWinner: {
      match6: 0,
      match5: 0,
      match4: 50,
      match3: 5,
      match2: 0,
    },
    totalPrizesPaid: 7_650,
    jackpotAfterDraw: 1_062_150,
    houseFeeCollected: 9_200,
    randomnessProof: "Switchboard TEE · Slot 285,043,990",
    verificationHash: "e7c1a9d3f2b6...4h8r",
  },
  {
    drawId: 85,
    date: "2025-06-10",
    time: "00:00 UTC",
    gameType: "main",
    winningNumbers: [2, 16, 24, 29, 36, 40],
    totalTickets: 13_100,
    jackpotAtDraw: 920_000,
    prizePoolDistributed: 21_300,
    wasRolldown: false,
    matchCounts: {
      match6: 0,
      match5: 1,
      match4: 71,
      match3: 1_200,
      match2: 7_100,
    },
    prizesPerWinner: {
      match6: 0,
      match5: 1_000,
      match4: 50,
      match3: 5,
      match2: 0,
    },
    totalPrizesPaid: 10_550,
    jackpotAfterDraw: 930_750,
    houseFeeCollected: 10_480,
    randomnessProof: "Switchboard TEE · Slot 284,901,580",
    verificationHash: "c3f5b7a2d9e1...7m1s",
  },
  {
    drawId: 84,
    date: "2025-06-09",
    time: "00:00 UTC",
    gameType: "main",
    winningNumbers: [8, 13, 19, 26, 34, 43],
    totalTickets: 10_800,
    jackpotAtDraw: 810_000,
    prizePoolDistributed: 18_900,
    wasRolldown: false,
    matchCounts: {
      match6: 0,
      match5: 0,
      match4: 48,
      match3: 890,
      match2: 5_200,
    },
    prizesPerWinner: {
      match6: 0,
      match5: 0,
      match4: 50,
      match3: 5,
      match2: 0,
    },
    totalPrizesPaid: 6_850,
    jackpotAfterDraw: 822_050,
    houseFeeCollected: 8_640,
    randomnessProof: "Switchboard TEE · Slot 284,759,170",
    verificationHash: "d9a2e4c6f1b8...2k5t",
  },
  {
    drawId: 83,
    date: "2025-06-08",
    time: "00:00 UTC",
    gameType: "main",
    winningNumbers: [4, 10, 21, 32, 39, 46],
    totalTickets: 15_600,
    jackpotAtDraw: 680_000,
    prizePoolDistributed: 25_400,
    wasRolldown: false,
    matchCounts: {
      match6: 0,
      match5: 3,
      match4: 95,
      match3: 1_540,
      match2: 9_200,
    },
    prizesPerWinner: {
      match6: 0,
      match5: 1_000,
      match4: 50,
      match3: 5,
      match2: 0,
    },
    totalPrizesPaid: 15_450,
    jackpotAfterDraw: 689_950,
    houseFeeCollected: 12_480,
    randomnessProof: "Switchboard TEE · Slot 284,616,760",
    verificationHash: "a1b3c5d7e9f2...8n4u",
  },
  // Quick Pick Express draws
  {
    drawId: 539,
    date: "2025-06-14",
    time: "20:00 UTC",
    gameType: "quickpick",
    winningNumbers: [7, 15, 22, 28, 33],
    totalTickets: 3_200,
    jackpotAtDraw: 22_400,
    prizePoolDistributed: 3_360,
    wasRolldown: false,
    matchCounts: {
      match5: 0,
      match4: 8,
      match3: 142,
      match2: 820,
    },
    prizesPerWinner: {
      match5: 0,
      match4: 100,
      match3: 4,
      match2: 0,
    },
    totalPrizesPaid: 1_368,
    jackpotAfterDraw: 24_392,
    houseFeeCollected: 1_344,
    randomnessProof: "Switchboard TEE · Slot 285,442,800",
    verificationHash: "f8e2a4b6c1d3...5p7v",
  },
  {
    drawId: 538,
    date: "2025-06-14",
    time: "16:00 UTC",
    gameType: "quickpick",
    winningNumbers: [5, 14, 23, 30, 35],
    totalTickets: 2_800,
    jackpotAtDraw: 19_600,
    prizePoolDistributed: 2_940,
    wasRolldown: false,
    matchCounts: {
      match5: 0,
      match4: 6,
      match3: 118,
      match2: 710,
    },
    prizesPerWinner: {
      match5: 0,
      match4: 100,
      match3: 4,
      match2: 0,
    },
    totalPrizesPaid: 1_072,
    jackpotAfterDraw: 21_468,
    houseFeeCollected: 1_176,
    randomnessProof: "Switchboard TEE · Slot 285,414_380",
    verificationHash: "c2d4f6a8b1e3...9q3w",
  },
  {
    drawId: 537,
    date: "2025-06-14",
    time: "12:00 UTC",
    gameType: "quickpick",
    winningNumbers: [2, 11, 19, 27, 34],
    totalTickets: 4_100,
    jackpotAtDraw: 32_800,
    prizePoolDistributed: 32_800,
    wasRolldown: true,
    rolldownTrigger: "soft_cap",
    matchCounts: {
      match5: 0,
      match4: 12,
      match3: 185,
      match2: 1_050,
    },
    prizesPerWinner: {
      match5: 0,
      match4: 1_640,
      match3: 70.8,
      match2: 0,
    },
    totalPrizesPaid: 32_778,
    jackpotAfterDraw: 5_000,
    houseFeeCollected: 1_722,
    randomnessProof: "Switchboard TEE · Slot 285,385_960",
    verificationHash: "b7a1d3e5f9c2...6r8x",
  },
  {
    drawId: 536,
    date: "2025-06-14",
    time: "08:00 UTC",
    gameType: "quickpick",
    winningNumbers: [1, 8, 16, 25, 31],
    totalTickets: 3_500,
    jackpotAtDraw: 26_250,
    prizePoolDistributed: 3_675,
    wasRolldown: false,
    matchCounts: {
      match5: 1,
      match4: 9,
      match3: 155,
      match2: 890,
    },
    prizesPerWinner: {
      match5: 26_250,
      match4: 100,
      match3: 4,
      match2: 0,
    },
    totalPrizesPaid: 27_870,
    jackpotAfterDraw: 5_000,
    houseFeeCollected: 1_470,
    randomnessProof: "Switchboard TEE · Slot 285,357_540",
    verificationHash: "e4f6a8b2c1d5...3s9y",
  },
];

const MOCK_AGGREGATE_STATS = {
  totalDrawsMain: 89,
  totalDrawsQP: 539,
  totalTicketsSold: 1_240_000,
  totalPrizesPaid: 18_750_000,
  biggestJackpotWin: 2_180_000,
  rolldownEvents: 14,
  averageTicketsPerDraw: 13_933,
  totalRolldownPaid: 8_420_000,
};

const PAGE_SIZE = 8;

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function formatCurrency(value: number, compact?: boolean): string {
  if (compact) {
    if (value >= 1_000_000) {
      return `$${(value / 1_000_000).toFixed(2)}M`;
    }
    if (value >= 1_000) {
      return `$${(value / 1_000).toFixed(1)}K`;
    }
  }
  return `$${Math.floor(value).toLocaleString("en-US")}`;
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                            */
/* -------------------------------------------------------------------------- */

function ProtocolStats() {
  const stats = MOCK_AGGREGATE_STATS;

  const items: {
    label: string;
    value: string;
    icon: LucideIcon;
    color: string;
  }[] = [
    {
      label: "Main Draws",
      value: stats.totalDrawsMain.toString(),
      icon: Trophy,
      color: "text-gold",
    },
    {
      label: "QP Draws",
      value: stats.totalDrawsQP.toString(),
      icon: Zap,
      color: "text-emerald-light",
    },
    {
      label: "Total Tickets",
      value:
        formatCurrency(stats.totalTicketsSold, true).replace("$", "") + " ",
      icon: Ticket,
      color: "text-foreground",
    },
    {
      label: "Prizes Paid",
      value: formatCurrency(stats.totalPrizesPaid, true),
      icon: Award,
      color: "text-gold",
    },
    {
      label: "Biggest Win",
      value: formatCurrency(stats.biggestJackpotWin, true),
      icon: Star,
      color: "text-gold",
    },
    {
      label: "Rolldown Events",
      value: stats.rolldownEvents.toString(),
      icon: TrendingUp,
      color: "text-emerald-light",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div
            key={item.label}
            className="glass rounded-xl p-3 sm:p-4 text-center"
          >
            <Icon
              size={16}
              className={`${item.color} mx-auto mb-1.5 opacity-70`}
            />
            <div className={`text-lg sm:text-xl font-black ${item.color}`}>
              {item.value}
            </div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">
              {item.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DrawCard({
  draw,
  expanded,
  onToggle,
}: {
  draw: DrawResult;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isMain = draw.gameType === "main";
  const matchLabels = isMain
    ? [
        { key: "match6" as const, label: "Match 6", tier: "jackpot" },
        { key: "match5" as const, label: "Match 5", tier: "high" },
        { key: "match4" as const, label: "Match 4", tier: "mid" },
        { key: "match3" as const, label: "Match 3", tier: "low" },
        { key: "match2" as const, label: "Match 2", tier: "free" },
      ]
    : [
        { key: "match5" as const, label: "Match 5", tier: "jackpot" },
        { key: "match4" as const, label: "Match 4", tier: "high" },
        { key: "match3" as const, label: "Match 3", tier: "mid" },
        { key: "match2" as const, label: "Match 2", tier: "low" },
      ];

  const totalWinners = Object.values(draw.matchCounts).reduce(
    (sum, v) => sum + (v || 0),
    0,
  );

  return (
    <div
      className={`glass rounded-2xl transition-all duration-200 ${
        draw.wasRolldown ? "border-emerald/15 shadow-sm shadow-emerald/5" : ""
      }`}
    >
      {/* Main row (clickable) */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full p-4 sm:p-5 text-left hover:bg-foreground/1 transition-colors rounded-2xl"
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          {/* Left: Draw info + Numbers */}
          <div className="flex-1 min-w-0">
            {/* Header badges */}
            <div className="flex items-center gap-2 flex-wrap mb-2.5">
              <span className="text-sm font-bold text-foreground">
                Draw #{draw.drawId}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {formatDate(draw.date)} · {draw.time}
              </span>

              {/* Game badge */}
              {isMain ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-gold/10 border border-gold/20 text-[9px] font-semibold text-gold uppercase tracking-wider">
                  <Trophy size={8} />
                  6/46
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald/10 border border-emerald/20 text-[9px] font-semibold text-emerald-light uppercase tracking-wider">
                  <Zap size={8} />
                  5/35
                </span>
              )}

              {draw.wasRolldown && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald/15 border border-emerald/30 text-[9px] font-bold text-emerald-light uppercase tracking-wider">
                  <TrendingUp size={8} />
                  Rolldown
                  {draw.rolldownTrigger === "hard_cap" ? " (Hard)" : ""}
                </span>
              )}
            </div>

            {/* Winning Numbers */}
            <WinningNumbers numbers={draw.winningNumbers} size="sm" />
          </div>

          {/* Right: Key stats */}
          <div className="flex items-center gap-4 sm:gap-6 shrink-0">
            {/* Jackpot */}
            <div className="text-right">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">
                Jackpot
              </div>
              <div className="text-sm font-black text-gradient-gold tabular-nums">
                {formatCurrency(draw.jackpotAtDraw, true)}
              </div>
            </div>

            {/* Tickets */}
            <div className="text-right hidden sm:block">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">
                Tickets
              </div>
              <div className="text-sm font-bold text-foreground tabular-nums">
                {draw.totalTickets.toLocaleString()}
              </div>
            </div>

            {/* Winners */}
            <div className="text-right hidden sm:block">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">
                Winners
              </div>
              <div className="text-sm font-bold text-emerald-light tabular-nums">
                {totalWinners.toLocaleString()}
              </div>
            </div>

            {/* Expand chevron */}
            <ChevronDown
              size={16}
              className={`shrink-0 text-muted-foreground/60 transition-transform duration-200 ${
                expanded ? "rotate-180" : ""
              }`}
            />
          </div>
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 sm:px-5 pb-5 border-t border-foreground/5 pt-4 space-y-4 animate-slide-down">
          {/* Rolldown info banner */}
          {draw.wasRolldown && (
            <div className="relative rounded-xl p-3 bg-emerald/4 border border-emerald/15 overflow-hidden">
              <div className="absolute inset-0 bg-linear-to-r from-emerald/3 to-transparent" />
              <div className="relative z-10 flex items-start gap-2">
                <TrendingUp
                  size={14}
                  className="text-emerald-light mt-0.5 shrink-0"
                />
                <div>
                  <p className="text-xs font-bold text-emerald-light mb-0.5">
                    Rolldown Event — Pari-Mutuel Prizes
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    No {isMain ? "Match 6" : "Match 5"} winner was drawn. The
                    entire jackpot of {formatCurrency(draw.jackpotAtDraw)} was
                    distributed among lower-tier winners using pari-mutuel
                    division. All prizes in this draw were calculated as Pool ÷
                    Winners.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Prize breakdown table */}
          <div>
            <h4 className="text-xs font-bold text-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
              <Award size={12} className="text-gold" />
              Prize Breakdown
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-foreground/5">
                    <th className="text-left py-2 pr-4 text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                      Tier
                    </th>
                    <th className="text-right py-2 px-4 text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                      Winners
                    </th>
                    <th className="text-right py-2 px-4 text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                      Prize Each
                    </th>
                    <th className="text-right py-2 pl-4 text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                      Total Paid
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {matchLabels.map(({ key, label, tier }) => {
                    const winners =
                      (draw.matchCounts as Record<string, number | undefined>)[
                        key
                      ] ?? 0;
                    const prizeEach =
                      (
                        draw.prizesPerWinner as Record<
                          string,
                          number | undefined
                        >
                      )[key] ?? 0;
                    const totalPaid = winners * prizeEach;

                    return (
                      <tr
                        key={key}
                        className="border-b border-foreground/3 last:border-0"
                      >
                        <td className="py-2.5 pr-4">
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${
                                tier === "jackpot"
                                  ? "bg-gold/20 text-gold"
                                  : tier === "high"
                                    ? "bg-emerald/20 text-emerald-light"
                                    : tier === "mid"
                                      ? "bg-emerald/10 text-emerald-light/70"
                                      : tier === "free"
                                        ? "bg-foreground/5 text-muted-foreground"
                                        : "bg-foreground/5 text-muted-foreground"
                              }`}
                            >
                              {key.replace("match", "")}
                            </div>
                            <span
                              className={`font-medium ${
                                tier === "jackpot"
                                  ? "text-gold"
                                  : tier === "high"
                                    ? "text-emerald-light"
                                    : "text-muted-foreground"
                              }`}
                            >
                              {label}
                            </span>
                            {tier === "jackpot" && (
                              <Star size={9} className="text-gold/50" />
                            )}
                            {tier === "free" && isMain && (
                              <span className="text-[8px] text-muted-foreground">
                                (Free Ticket)
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-4 text-right tabular-nums">
                          <span
                            className={`font-semibold ${
                              winners > 0
                                ? "text-foreground"
                                : "text-muted-foreground/60"
                            }`}
                          >
                            {winners.toLocaleString()}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-right tabular-nums">
                          {prizeEach > 0 ? (
                            <span
                              className={`font-bold ${
                                tier === "jackpot"
                                  ? "text-gold"
                                  : tier === "high"
                                    ? "text-emerald-light"
                                    : "text-muted-foreground"
                              }`}
                            >
                              {prizeEach >= 1_000
                                ? formatCurrency(prizeEach, true)
                                : `$${prizeEach.toLocaleString("en-US", { minimumFractionDigits: prizeEach % 1 !== 0 ? 2 : 0 })}`}
                              {draw.wasRolldown &&
                                tier !== "free" &&
                                winners > 0 && (
                                  <span className="ml-1 text-[8px] text-emerald-light/60">
                                    PM
                                  </span>
                                )}
                            </span>
                          ) : tier === "free" && isMain ? (
                            <span className="text-muted-foreground">
                              Free Tkt
                            </span>
                          ) : (
                            <span className="text-muted-foreground/60">—</span>
                          )}
                        </td>
                        <td className="py-2.5 pl-4 text-right tabular-nums">
                          {totalPaid > 0 ? (
                            <span className="font-semibold text-muted-foreground">
                              {formatCurrency(totalPaid, totalPaid >= 10_000)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/60">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-foreground/6">
                    <td className="py-2.5 pr-4 text-xs font-bold text-foreground">
                      Total
                    </td>
                    <td className="py-2.5 px-4 text-right text-xs font-bold text-foreground tabular-nums">
                      {totalWinners.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-4 text-right" />
                    <td className="py-2.5 pl-4 text-right text-xs font-black text-gradient-gold tabular-nums">
                      {formatCurrency(
                        draw.totalPrizesPaid,
                        draw.totalPrizesPaid >= 10_000,
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Draw Details Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="p-2.5 rounded-lg bg-foreground/2">
              <div className="text-[9px] text-muted-foreground uppercase tracking-wider">
                Total Tickets
              </div>
              <div className="text-xs font-bold text-foreground mt-0.5 tabular-nums">
                {draw.totalTickets.toLocaleString()}
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-foreground/2">
              <div className="text-[9px] text-muted-foreground uppercase tracking-wider">
                Revenue
              </div>
              <div className="text-xs font-bold text-foreground mt-0.5 tabular-nums">
                {formatCurrency(draw.totalTickets * (isMain ? 2.5 : 1.5), true)}
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-foreground/2">
              <div className="text-[9px] text-muted-foreground uppercase tracking-wider">
                House Fee
              </div>
              <div className="text-xs font-bold text-foreground mt-0.5 tabular-nums">
                {formatCurrency(draw.houseFeeCollected, true)}
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-foreground/2">
              <div className="text-[9px] text-muted-foreground uppercase tracking-wider">
                Jackpot After
              </div>
              <div className="text-xs font-bold text-gold mt-0.5 tabular-nums">
                {formatCurrency(draw.jackpotAfterDraw, true)}
              </div>
            </div>
          </div>

          {/* Verification */}
          <div className="p-3 rounded-xl bg-foreground/2 border border-foreground/4">
            <h4 className="text-[10px] font-bold text-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Eye size={10} className="text-emerald/60" />
              On-Chain Verification
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <div className="text-[9px] text-muted-foreground mb-0.5">
                  Randomness Source
                </div>
                <div className="text-[10px] text-muted-foreground font-mono">
                  {draw.randomnessProof}
                </div>
              </div>
              <div>
                <div className="text-[9px] text-muted-foreground mb-0.5">
                  Verification Hash
                </div>
                <div className="text-[10px] text-muted-foreground font-mono flex items-center gap-1.5">
                  <span>{draw.verificationHash}</span>
                  <a
                    href={`https://solscan.io/tx/${draw.verificationHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-light/50 hover:text-emerald-light transition-colors"
                    aria-label="View on Solscan"
                  >
                    <ExternalLink size={9} />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RolldownHistory() {
  const rolldownDraws = MOCK_DRAWS.filter((d) => d.wasRolldown);

  if (rolldownDraws.length === 0) return null;

  return (
    <div className="glass-strong rounded-2xl p-5 sm:p-6 border-gradient-emerald">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <TrendingUp size={16} className="text-emerald" />
          Recent Rolldown Events
        </h3>
        <span className="text-[10px] text-muted-foreground">
          {MOCK_AGGREGATE_STATS.rolldownEvents} total rolldowns
        </span>
      </div>

      <div className="space-y-3">
        {rolldownDraws.map((draw) => {
          const isMain = draw.gameType === "main";
          return (
            <div
              key={`rolldown-${draw.drawId}`}
              className="p-3 rounded-xl bg-emerald/3 border border-emerald/10"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-foreground">
                    #{draw.drawId}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {formatDate(draw.date)}
                  </span>
                  {isMain ? (
                    <span className="text-[8px] px-1 py-0.5 rounded bg-gold/10 text-gold font-bold uppercase">
                      6/46
                    </span>
                  ) : (
                    <span className="text-[8px] px-1 py-0.5 rounded bg-emerald/10 text-emerald-light font-bold uppercase">
                      5/35
                    </span>
                  )}
                </div>
                <span className="text-xs font-black text-gradient-gold">
                  {formatCurrency(draw.jackpotAtDraw, true)}
                </span>
              </div>

              <div className="flex items-center gap-1.5 mb-2">
                <WinningNumbers numbers={draw.winningNumbers} size="sm" />
              </div>

              <div className="grid grid-cols-3 gap-2 text-[10px]">
                <div>
                  <span className="text-muted-foreground">Tickets</span>
                  <div className="font-bold text-foreground">
                    {draw.totalTickets.toLocaleString()}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Distributed</span>
                  <div className="font-bold text-emerald-light">
                    {formatCurrency(draw.totalPrizesPaid, true)}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Trigger</span>
                  <div className="font-bold text-foreground">
                    {draw.rolldownTrigger === "hard_cap"
                      ? "Hard Cap"
                      : "Soft Cap"}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 p-3 rounded-xl bg-foreground/2 border border-foreground/4">
        <div className="flex items-start gap-2">
          <Sparkles size={12} className="text-gold/60 mt-0.5 shrink-0" />
          <div className="text-[10px] text-muted-foreground">
            <span className="font-semibold text-muted-foreground">
              Total rolldown prizes paid:
            </span>{" "}
            <span className="font-bold text-gradient-gold">
              {formatCurrency(MOCK_AGGREGATE_STATS.totalRolldownPaid, true)}
            </span>{" "}
            across {MOCK_AGGREGATE_STATS.rolldownEvents} events. Rolldowns occur
            when the jackpot exceeds the soft cap and no top-tier winner is
            drawn.{" "}
            <Link
              to="/learn/rolldown"
              className="text-emerald-light hover:text-emerald font-semibold inline-flex items-center gap-0.5 transition-colors"
            >
              Learn more <ChevronRight size={8} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function Pagination({
  currentPage,
  totalPages,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-2">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        className="text-muted-foreground hover:text-foreground disabled:opacity-30"
      >
        <ArrowLeft size={14} />
      </Button>

      {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
        <button
          key={page}
          type="button"
          onClick={() => onPageChange(page)}
          className={`w-8 h-8 rounded-lg text-xs font-semibold transition-all ${
            page === currentPage
              ? "bg-emerald/15 text-emerald-light border border-emerald/20"
              : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
          }`}
        >
          {page}
        </button>
      ))}

      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        className="text-muted-foreground hover:text-foreground disabled:opacity-30"
      >
        <ArrowRight size={14} />
      </Button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main Component                                                            */
/* -------------------------------------------------------------------------- */

function ResultsPage() {
  const { open } = useAppKit();
  const { isConnected } = useAppKitAccount();
  const [gameFilter, setGameFilter] = useState<GameFilter>("all");
  const [rolldownFilter, setRolldownFilter] = useState<RolldownFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedDraw, setExpandedDraw] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const filteredDraws = useMemo(() => {
    let result = [...MOCK_DRAWS];

    // Game filter
    if (gameFilter === "main") {
      result = result.filter((d) => d.gameType === "main");
    } else if (gameFilter === "quickpick") {
      result = result.filter((d) => d.gameType === "quickpick");
    }

    // Rolldown filter
    if (rolldownFilter === "rolldown") {
      result = result.filter((d) => d.wasRolldown);
    } else if (rolldownFilter === "normal") {
      result = result.filter((d) => !d.wasRolldown);
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (d) =>
          d.drawId.toString().includes(q) ||
          d.date.includes(q) ||
          d.winningNumbers.some((n) => n.toString() === q),
      );
    }

    // Sort by draw ID descending (most recent first)
    result.sort((a, b) => {
      // Group by game type first, then sort by draw ID
      if (a.gameType !== b.gameType) {
        // Main draws first, then quick pick
        return a.date > b.date ? -1 : 1;
      }
      return b.drawId - a.drawId;
    });

    return result;
  }, [gameFilter, rolldownFilter, searchQuery]);

  const totalPages = Math.ceil(filteredDraws.length / PAGE_SIZE);
  const paginatedDraws = filteredDraws.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  // Reset page when filters change
  const handleGameFilter = (f: GameFilter) => {
    setGameFilter(f);
    setCurrentPage(1);
    setExpandedDraw(null);
  };
  const handleRolldownFilter = (f: RolldownFilter) => {
    setRolldownFilter(f);
    setCurrentPage(1);
    setExpandedDraw(null);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* ================================================================ */}
      {/*  HERO                                                            */}
      {/* ================================================================ */}
      <section className="relative pt-24 pb-8 sm:pt-28 sm:pb-12 px-4 sm:px-6 lg:px-8 overflow-hidden">
        <div className="absolute inset-0 hero-grid opacity-20" />
        <div className="absolute inset-0 bg-glow-emerald opacity-15" />
        <FloatingBalls count={4} />

        <div className="relative z-10 max-w-7xl mx-auto">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-xs text-muted-foreground mb-6">
            <Link to="/" className="hover:text-foreground transition-colors">
              Home
            </Link>
            <ChevronRight size={12} />
            <span className="text-emerald-light font-medium">Results</span>
          </nav>

          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-xl bg-linear-to-br from-emerald/20 to-emerald-dark/10 border border-emerald/20">
                  <BarChart3 size={24} className="text-emerald-light" />
                </div>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
                    Draw Results
                  </h1>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Past draw results, winning numbers, and prize breakdowns
                    &bull; Fully verifiable on-chain
                  </p>
                </div>
              </div>
            </div>

            {/* Current Jackpot + Countdown + Check Tickets */}
            <div className="flex flex-col sm:flex-row items-center gap-4 lg:gap-6">
              <JackpotDisplay
                amount={1_247_832}
                size="sm"
                glow
                showRolldownStatus={false}
                softCap={1_750_000}
              />
              <CountdownTimer size="sm" label="Next Draw" />
              {isConnected ? (
                <Link
                  to="/tickets"
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-linear-to-r from-emerald to-emerald-dark hover:from-emerald-light hover:to-emerald rounded-xl shadow-lg shadow-emerald/25 hover:shadow-emerald/40 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] shrink-0"
                >
                  <Ticket size={16} />
                  Check My Tickets
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => open({ view: "Connect", namespace: "solana" })}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-linear-to-r from-emerald to-emerald-dark hover:from-emerald-light hover:to-emerald rounded-xl shadow-lg shadow-emerald/25 hover:shadow-emerald/40 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] shrink-0"
                >
                  <Wallet size={16} />
                  Connect to Check Tickets
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/*  MAIN CONTENT                                                    */}
      {/* ================================================================ */}
      <section className="relative px-4 sm:px-6 lg:px-8 pb-16">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Protocol Stats */}
          <ProtocolStats />

          {/* Main content: 2/3 + 1/3 layout */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
            {/* Left column: Draw list */}
            <div className="lg:col-span-2 space-y-4">
              {/* Filters */}
              <div className="glass rounded-2xl p-4 sm:p-5 space-y-3">
                {/* Search + Game filter */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <div className="relative flex-1 w-full">
                    <Search
                      size={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setCurrentPage(1);
                      }}
                      placeholder="Search by draw #, date, or winning number..."
                      className="w-full h-9 pl-9 pr-3 rounded-xl bg-foreground/4 border border-foreground/8 text-sm text-foreground placeholder-gray-600 focus:outline-none focus:border-emerald/40 focus:ring-1 focus:ring-emerald/20 transition-colors"
                    />
                  </div>

                  {/* Game filter */}
                  <div className="flex items-center gap-1 shrink-0">
                    {(
                      [
                        { key: "all" as GameFilter, label: "All Games" },
                        { key: "main" as GameFilter, label: "6/46" },
                        {
                          key: "quickpick" as GameFilter,
                          label: "5/35",
                        },
                      ] as const
                    ).map(({ key, label }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => handleGameFilter(key)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          gameFilter === key
                            ? "bg-emerald/15 text-emerald-light border border-emerald/20"
                            : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Rolldown filter */}
                <div className="flex items-center gap-1">
                  <Filter size={12} className="text-muted-foreground mr-1" />
                  {(
                    [
                      { key: "all" as RolldownFilter, label: "All Draws" },
                      {
                        key: "rolldown" as RolldownFilter,
                        label: "Rolldown Only",
                      },
                      {
                        key: "normal" as RolldownFilter,
                        label: "Normal Only",
                      },
                    ] as const
                  ).map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleRolldownFilter(key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        rolldownFilter === key
                          ? "bg-emerald/15 text-emerald-light border border-emerald/20"
                          : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Results count */}
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Showing{" "}
                  <span className="font-bold text-foreground">
                    {filteredDraws.length}
                  </span>{" "}
                  draw{filteredDraws.length !== 1 ? "s" : ""}
                  {searchQuery && (
                    <span>
                      {" "}
                      matching &ldquo;
                      <span className="text-emerald-light">{searchQuery}</span>
                      &rdquo;
                    </span>
                  )}
                </p>
                {expandedDraw !== null && (
                  <button
                    type="button"
                    onClick={() => setExpandedDraw(null)}
                    className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Collapse
                  </button>
                )}
              </div>

              {/* Draw Cards */}
              {paginatedDraws.length === 0 ? (
                <div className="glass rounded-2xl p-12 text-center">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-foreground/3 border border-foreground/6 mb-4">
                    <Search size={24} className="text-muted-foreground/60" />
                  </div>
                  <p className="text-sm text-muted-foreground mb-1">
                    No draws found
                  </p>
                  <p className="text-xs text-muted-foreground/60 mb-4">
                    Try adjusting your search or filter criteria
                  </p>
                  <Button
                    onClick={() => {
                      setSearchQuery("");
                      setGameFilter("all");
                      setRolldownFilter("all");
                      setCurrentPage(1);
                    }}
                    variant="outline"
                    size="sm"
                    className="text-xs border-emerald/20 text-emerald-light hover:bg-emerald/5"
                  >
                    Clear Filters
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {paginatedDraws.map((draw) => (
                    <DrawCard
                      key={`${draw.gameType}-${draw.drawId}`}
                      draw={draw}
                      expanded={expandedDraw === draw.drawId}
                      onToggle={() =>
                        setExpandedDraw((prev) =>
                          prev === draw.drawId ? null : draw.drawId,
                        )
                      }
                    />
                  ))}
                </div>
              )}

              {/* Pagination */}
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            </div>

            {/* Right column: Sidebar */}
            <div className="space-y-6">
              {/* Rolldown History */}
              <RolldownHistory />

              {/* How to Read Results */}
              <div className="glass rounded-2xl p-5 sm:p-6">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2 mb-4">
                  <Eye size={16} className="text-emerald" />
                  Understanding Results
                </h3>

                <div className="space-y-3">
                  <div>
                    <h4 className="text-xs font-semibold text-foreground mb-1 flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-linear-to-br from-gold-light to-gold" />
                      Matched Numbers
                    </h4>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      Numbers highlighted in gold are matches between your
                      ticket and the winning numbers. More matches = bigger
                      prizes.
                    </p>
                  </div>

                  <div>
                    <h4 className="text-xs font-semibold text-foreground mb-1 flex items-center gap-1.5">
                      <TrendingUp size={11} className="text-emerald" />
                      Rolldown Draws
                    </h4>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      Draws marked with the green &quot;Rolldown&quot; badge
                      used pari-mutuel prize distribution. The jackpot was
                      divided among Match 3+ winners, resulting in
                      higher-than-normal prizes.
                    </p>
                  </div>

                  <div>
                    <h4 className="text-xs font-semibold text-foreground mb-1 flex items-center gap-1.5">
                      <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-emerald/10 text-emerald-light">
                        PM
                      </span>
                      Pari-Mutuel
                    </h4>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      Prize amounts tagged with &quot;PM&quot; were calculated
                      as Pool ÷ Winners rather than fixed amounts. This happens
                      during rolldown events.
                    </p>
                  </div>

                  <div>
                    <h4 className="text-xs font-semibold text-foreground mb-1 flex items-center gap-1.5">
                      <Hash size={11} className="text-muted-foreground" />
                      Verification
                    </h4>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      Every draw includes a Switchboard TEE randomness proof and
                      a tamper-resistant verification hash. Click the link icon
                      to verify on Solana Explorer.
                    </p>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-foreground/5">
                  <Link
                    to="/learn/rolldown"
                    className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-light hover:text-emerald transition-colors"
                  >
                    <Sparkles size={10} />
                    Learn how rolldown mechanics work
                    <ChevronRight size={10} />
                  </Link>
                </div>
              </div>

              {/* Quick Links */}
              <div className="glass rounded-xl p-4 space-y-2">
                <h3 className="text-xs font-bold text-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Zap size={12} className="text-emerald" />
                  Quick Links
                </h3>
                <Link
                  to="/play"
                  className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-foreground/3 transition-colors group"
                >
                  <div className="flex items-center gap-2">
                    <Trophy
                      size={14}
                      className="text-gold/60 group-hover:text-gold transition-colors"
                    />
                    <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                      Buy 6/46 Tickets
                    </span>
                  </div>
                  <ChevronRight
                    size={12}
                    className="text-muted-foreground/60 group-hover:text-muted-foreground transition-colors"
                  />
                </Link>
                <Link
                  to="/play/quick-pick"
                  className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-foreground/3 transition-colors group"
                >
                  <div className="flex items-center gap-2">
                    <Zap
                      size={14}
                      className="text-emerald/60 group-hover:text-emerald-light transition-colors"
                    />
                    <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                      Quick Pick Express
                    </span>
                  </div>
                  <ChevronRight
                    size={12}
                    className="text-muted-foreground/60 group-hover:text-muted-foreground transition-colors"
                  />
                </Link>
                <Link
                  to="/tickets"
                  className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-foreground/3 transition-colors group"
                >
                  <div className="flex items-center gap-2">
                    <Ticket
                      size={14}
                      className="text-muted-foreground group-hover:text-muted-foreground transition-colors"
                    />
                    <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                      My Tickets
                    </span>
                  </div>
                  <ChevronRight
                    size={12}
                    className="text-muted-foreground/60 group-hover:text-muted-foreground transition-colors"
                  />
                </Link>
                <Link
                  to="/dashboard"
                  className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-foreground/3 transition-colors group"
                >
                  <div className="flex items-center gap-2">
                    <BarChart3
                      size={14}
                      className="text-muted-foreground group-hover:text-muted-foreground transition-colors"
                    />
                    <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                      Dashboard
                    </span>
                  </div>
                  <ChevronRight
                    size={12}
                    className="text-muted-foreground/60 group-hover:text-muted-foreground transition-colors"
                  />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
