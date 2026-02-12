import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BarChart3,
  Trophy,
  TrendingUp,
  Wallet,
  Clock,
  ChevronRight,
  Zap,
  Target,
  ArrowUpRight,
  ArrowDownRight,
  Ticket,
  Shield,
  Eye,
  Users,
  Sparkles,
  Activity,
  Award,
  Flame,
  type LucideIcon,
} from "lucide-react";
import { useAppKit, useAppKitAccount } from "@/lib/appkit-hooks";
import { Button } from "@/components/ui/button";
import { JackpotDisplay } from "@/components/JackpotDisplay";
import {
  CountdownTimer,
  QuickPickCountdown,
} from "@/components/CountdownTimer";
import { WinningNumbers, FloatingBalls } from "@/components/LotteryBalls";
import Footer from "@/components/Footer";

export const Route = createFileRoute("/dashboard/")({
  component: DashboardPage,
});

/* -------------------------------------------------------------------------- */
/*  Mock Data                                                                 */
/* -------------------------------------------------------------------------- */

const MOCK_PLAYER_STATS = {
  totalTickets: 147,
  totalSpent: 367.5,
  totalWon: 485.0,
  netProfit: 117.5,
  freeTickets: 3,
  currentStreak: 5,
  bestStreak: 12,
  drawsPlayed: 42,
  winRate: 31.4,
  biggestWin: 250,
  syndicateMemberships: 2,
  lifetimeSpend: 367.5,
  quickPickUnlocked: true,
};

const MOCK_RECENT_DRAWS = [
  {
    drawId: 89,
    date: "2025-06-14",
    numbers: [3, 12, 18, 27, 33, 41],
    wasRolldown: false,
    totalTickets: 14_200,
    jackpot: 1_247_832,
    matchCounts: { 6: 0, 5: 2, 4: 87, 3: 1_420, 2: 8_340 },
    userTickets: 5,
    userMatches: [
      { ticketNumbers: [3, 12, 22, 30, 33, 41], matchCount: 3, prize: 5.0 },
      { ticketNumbers: [7, 18, 25, 33, 40, 44], matchCount: 2, prize: 0 },
    ],
  },
  {
    drawId: 88,
    date: "2025-06-13",
    numbers: [7, 14, 22, 31, 38, 45],
    wasRolldown: true,
    totalTickets: 28_400,
    jackpot: 1_820_000,
    matchCounts: { 6: 0, 5: 5, 4: 210, 3: 3_100, 2: 17_600 },
    userTickets: 10,
    userMatches: [
      {
        ticketNumbers: [7, 14, 22, 31, 38, 45],
        matchCount: 4,
        prize: 250.0,
      },
      { ticketNumbers: [7, 14, 22, 29, 36, 43], matchCount: 3, prize: 45.0 },
    ],
  },
  {
    drawId: 87,
    date: "2025-06-12",
    numbers: [1, 9, 17, 28, 35, 42],
    wasRolldown: false,
    totalTickets: 12_800,
    jackpot: 1_180_000,
    matchCounts: { 6: 0, 5: 1, 4: 62, 3: 1_100, 2: 6_800 },
    userTickets: 3,
    userMatches: [
      { ticketNumbers: [1, 9, 20, 28, 35, 46], matchCount: 3, prize: 5.0 },
    ],
  },
  {
    drawId: 86,
    date: "2025-06-11",
    numbers: [5, 11, 23, 30, 37, 44],
    wasRolldown: false,
    totalTickets: 11_500,
    jackpot: 1_050_000,
    matchCounts: { 6: 0, 5: 0, 4: 55, 3: 980, 2: 5_900 },
    userTickets: 5,
    userMatches: [],
  },
  {
    drawId: 85,
    date: "2025-06-10",
    numbers: [2, 16, 24, 29, 36, 40],
    wasRolldown: false,
    totalTickets: 13_100,
    jackpot: 920_000,
    matchCounts: { 6: 0, 5: 1, 4: 71, 3: 1_200, 2: 7_100 },
    userTickets: 4,
    userMatches: [
      { ticketNumbers: [2, 16, 24, 32, 39, 46], matchCount: 3, prize: 5.0 },
      { ticketNumbers: [2, 16, 19, 25, 36, 40], matchCount: 3, prize: 5.0 },
    ],
  },
];

const MOCK_JACKPOT_HISTORY = [
  { drawId: 85, amount: 920_000 },
  { drawId: 86, amount: 1_050_000 },
  { drawId: 87, amount: 1_180_000 },
  { drawId: 88, amount: 1_820_000 },
  { drawId: 89, amount: 1_247_832 },
];

const MOCK_ACTIVE_TICKETS = [
  {
    id: "tkt_001",
    numbers: [4, 15, 22, 33, 38, 46],
    drawId: 90,
    isQuickPick: false,
    purchaseTime: "2025-06-15T10:30:00Z",
  },
  {
    id: "tkt_002",
    numbers: [8, 11, 19, 27, 35, 42],
    drawId: 90,
    isQuickPick: true,
    purchaseTime: "2025-06-15T10:30:00Z",
  },
  {
    id: "tkt_003",
    numbers: [1, 6, 14, 29, 37, 44],
    drawId: 90,
    isQuickPick: true,
    purchaseTime: "2025-06-15T10:31:00Z",
  },
];

const MOCK_SYNDICATE_MEMBERSHIPS = [
  {
    id: "syn_001",
    name: "Diamond Hands Lotto Club",
    members: 47,
    maxMembers: 50,
    myContribution: 25.0,
    totalPool: 587.5,
    ticketsThisDraw: 120,
    myShare: 4.25,
  },
  {
    id: "syn_003",
    name: "EV Maximizers",
    members: 23,
    maxMembers: 100,
    myContribution: 15.0,
    totalPool: 210.0,
    ticketsThisDraw: 85,
    myShare: 7.14,
  },
];

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                            */
/* -------------------------------------------------------------------------- */

interface StatCardProps {
  label: string;
  value: string;
  subValue?: string;
  icon: LucideIcon;
  trend?: { value: string; positive: boolean };
  accentColor?: "emerald" | "gold" | "default";
}

function StatCard({
  label,
  value,
  subValue,
  icon: Icon,
  trend,
  accentColor = "default",
}: StatCardProps) {
  const colorMap = {
    emerald: {
      iconBg: "bg-emerald/15 border-emerald/20",
      iconColor: "text-emerald-light",
      valueColor: "text-emerald-light",
    },
    gold: {
      iconBg: "bg-gold/15 border-gold/20",
      iconColor: "text-gold",
      valueColor: "text-gradient-gold",
    },
    default: {
      iconBg: "bg-foreground/[0.04] border-foreground/[0.06]",
      iconColor: "text-muted-foreground",
      valueColor: "text-foreground",
    },
  };

  const colors = colorMap[accentColor];

  return (
    <div className="glass rounded-xl p-4 transition-all hover:border-foreground/10">
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2 rounded-lg border ${colors.iconBg}`}>
          <Icon size={16} className={colors.iconColor} />
        </div>
        {trend && (
          <div
            className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
              trend.positive
                ? "bg-emerald/15 text-emerald-light"
                : "bg-red-500/15 text-red-400"
            }`}
          >
            {trend.positive ? (
              <ArrowUpRight size={10} />
            ) : (
              <ArrowDownRight size={10} />
            )}
            {trend.value}
          </div>
        )}
      </div>
      <div className={`text-xl font-black ${colors.valueColor} leading-none`}>
        {value}
      </div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1.5">
        {label}
      </div>
      {subValue && (
        <div className="text-[10px] text-muted-foreground/60 mt-0.5">
          {subValue}
        </div>
      )}
    </div>
  );
}

function RolldownMonitor() {
  const currentJackpot = 1_247_832;
  const softCap = 1_750_000;
  const hardCap = 2_250_000;
  const progress = (currentJackpot / softCap) * 100;
  const isRolldownActive = currentJackpot >= softCap;
  const ticketsPerDraw = 14_200;
  const avgTicketRevenue = 2.5 * 0.556; // price * jackpot allocation after fees
  const drawsToSoftCap = Math.ceil(
    (softCap - currentJackpot) / (ticketsPerDraw * avgTicketRevenue),
  );

  return (
    <div className="glass-strong rounded-2xl p-5 sm:p-6 border-gradient-emerald">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Activity size={16} className="text-emerald" />
          Rolldown Monitor
        </h3>
        {isRolldownActive ? (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald/15 border border-emerald/30">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald animate-pulse" />
            <span className="text-[10px] font-bold text-emerald-light uppercase tracking-wider">
              Active
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-foreground/5 border border-foreground/10">
            <div className="w-1.5 h-1.5 rounded-full bg-gray-500" />
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              Normal
            </span>
          </div>
        )}
      </div>

      {/* Progress visualization */}
      <div className="mb-4">
        <div className="relative h-3 bg-foreground/5 rounded-full overflow-hidden">
          {/* Hard cap zone */}
          <div
            className="absolute top-0 right-0 h-full bg-red-500/10"
            style={{
              width: `${((hardCap - softCap) / hardCap) * 100}%`,
            }}
          />
          {/* Current progress */}
          <div
            className="h-full rounded-full transition-all duration-1000 ease-out relative"
            style={{
              width: `${Math.min((currentJackpot / hardCap) * 100, 100)}%`,
              background: isRolldownActive
                ? "linear-gradient(90deg, oklch(0.55 0.17 160), oklch(0.72 0.19 160))"
                : "linear-gradient(90deg, oklch(0.6 0.15 85), oklch(0.75 0.15 85))",
            }}
          />
          {/* Soft cap marker */}
          <div
            className="absolute top-0 h-full w-px bg-emerald-light/60"
            style={{ left: `${(softCap / hardCap) * 100}%` }}
          />
        </div>

        {/* Labels */}
        <div className="flex items-center justify-between mt-2 text-[10px]">
          <span className="text-muted-foreground/60">$0</span>
          <div className="flex items-center gap-4">
            <span className="text-emerald-light/70">
              Soft Cap: ${(softCap / 1_000_000).toFixed(2)}M
            </span>
            <span className="text-red-400/70">
              Hard Cap: ${(hardCap / 1_000_000).toFixed(2)}M
            </span>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="text-center p-2.5 rounded-lg bg-foreground/2">
          <div className="text-xs font-bold text-gold tabular-nums">
            ${(currentJackpot / 1_000_000).toFixed(2)}M
          </div>
          <div className="text-[9px] text-muted-foreground mt-0.5">
            Current Jackpot
          </div>
        </div>
        <div className="text-center p-2.5 rounded-lg bg-foreground/2">
          <div className="text-xs font-bold text-foreground tabular-nums">
            {progress.toFixed(1)}%
          </div>
          <div className="text-[9px] text-muted-foreground mt-0.5">
            To Soft Cap
          </div>
        </div>
        <div className="text-center p-2.5 rounded-lg bg-foreground/2">
          <div className="text-xs font-bold text-emerald-light tabular-nums">
            ~{drawsToSoftCap}
          </div>
          <div className="text-[9px] text-muted-foreground mt-0.5">
            Draws Est.
          </div>
        </div>
      </div>

      {/* EV indicator */}
      <div className="mt-4 p-3 rounded-xl bg-foreground/2 border border-foreground/4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp
              size={12}
              className={
                isRolldownActive
                  ? "text-emerald-light"
                  : "text-muted-foreground"
              }
            />
            <span className="text-[10px] text-muted-foreground">
              Expected Value (Rolldown)
            </span>
          </div>
          <span
            className={`text-xs font-bold ${
              isRolldownActive ? "text-emerald-light" : "text-gold"
            }`}
          >
            {isRolldownActive ? "+47.2%" : "Pending"}
          </span>
        </div>
        {!isRolldownActive && (
          <p className="text-[10px] text-muted-foreground/60 mt-1.5">
            EV turns positive when the jackpot reaches the soft cap ($
            {(softCap / 1_000_000).toFixed(2)}M) and no Match 6 winner is drawn.
            Strategic players buy more tickets during rolldown windows.
          </p>
        )}
      </div>
    </div>
  );
}

function RecentDrawCard({ draw }: { draw: (typeof MOCK_RECENT_DRAWS)[0] }) {
  const hasWin = draw.userMatches.some((m) => m.prize > 0);
  const totalPrize = draw.userMatches.reduce((sum, m) => sum + m.prize, 0);

  return (
    <div className="glass rounded-xl p-4 transition-all hover:border-foreground/10">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-foreground">
            Draw #{draw.drawId}
          </span>
          <span className="text-[10px] text-muted-foreground">{draw.date}</span>
          {draw.wasRolldown && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald/10 border border-emerald/20 text-[9px] font-bold text-emerald-light uppercase tracking-wider">
              <Zap size={8} />
              Rolldown
            </span>
          )}
        </div>
        {hasWin && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gold/10 border border-gold/20 text-[10px] font-bold text-gold">
            <Trophy size={9} />
            +${totalPrize.toFixed(0)}
          </span>
        )}
      </div>

      {/* Winning Numbers */}
      <div className="mb-3">
        <WinningNumbers numbers={draw.numbers} size="sm" />
      </div>

      {/* Your results */}
      {draw.userTickets > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
            Your Tickets ({draw.userTickets})
          </div>
          {draw.userMatches.length > 0 ? (
            draw.userMatches.map((match, i) => {
              const matchedIndices = new Set<number>();
              match.ticketNumbers.forEach((num, idx) => {
                if (draw.numbers.includes(num)) {
                  matchedIndices.add(idx);
                }
              });

              return (
                <div
                  key={`match-${draw.drawId}-${i}`}
                  className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-foreground/2"
                >
                  <WinningNumbers
                    numbers={match.ticketNumbers}
                    matchedIndices={matchedIndices}
                    size="sm"
                  />
                  <div className="flex items-center gap-2 ml-2">
                    <span
                      className={`text-[10px] font-bold ${
                        match.matchCount >= 4
                          ? "text-gold"
                          : match.matchCount >= 3
                            ? "text-emerald-light"
                            : "text-muted-foreground"
                      }`}
                    >
                      {match.matchCount} match
                      {match.matchCount !== 1 ? "es" : ""}
                    </span>
                    {match.prize > 0 && (
                      <span className="text-[10px] font-bold text-gold">
                        +${match.prize.toFixed(0)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-[10px] text-muted-foreground/60 py-1">
              No matches this draw
            </div>
          )}
        </div>
      )}

      {/* Draw Stats */}
      <div className="flex items-center gap-4 mt-3 pt-2.5 border-t border-foreground/5 text-[10px] text-muted-foreground">
        <span>{draw.totalTickets.toLocaleString()} total tickets</span>
        <span>Jackpot: ${(draw.jackpot / 1_000_000).toFixed(2)}M</span>
      </div>
    </div>
  );
}

function ActiveTicketsPanel() {
  if (MOCK_ACTIVE_TICKETS.length === 0) {
    return (
      <div className="glass rounded-2xl p-5 sm:p-6">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2 mb-4">
          <Ticket size={16} className="text-emerald" />
          Active Tickets
        </h3>
        <div className="text-center py-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-foreground/3 border border-foreground/6 mb-3">
            <Ticket size={20} className="text-muted-foreground/60" />
          </div>
          <p className="text-sm text-muted-foreground mb-1">
            No active tickets
          </p>
          <p className="text-xs text-muted-foreground/60 mb-4">
            Buy tickets for the next draw
          </p>
          <Link
            to="/play"
            className="inline-flex items-center gap-2 px-4 py-2 bg-linear-to-r from-emerald to-emerald-dark hover:from-emerald-light hover:to-emerald text-white text-xs font-bold rounded-xl shadow-md shadow-emerald/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <Trophy size={12} />
            Buy Tickets
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="glass rounded-2xl p-5 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Ticket size={16} className="text-emerald" />
          Active Tickets
          <span className="ml-1 px-1.5 py-0.5 rounded-full bg-emerald/15 text-[10px] font-bold text-emerald-light">
            {MOCK_ACTIVE_TICKETS.length}
          </span>
        </h3>
        <span className="text-[10px] text-muted-foreground">
          Draw #90 &bull; Pending
        </span>
      </div>

      <div className="space-y-2">
        {MOCK_ACTIVE_TICKETS.map((ticket) => (
          <div
            key={ticket.id}
            className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-foreground/2 border border-foreground/4"
          >
            <div className="flex items-center gap-3">
              <WinningNumbers numbers={ticket.numbers} size="sm" />
              {ticket.isQuickPick && (
                <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[8px] font-bold text-emerald-light bg-emerald/10 uppercase">
                  <Zap size={7} />
                  QP
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <Clock size={10} className="text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">Pending</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <Link
          to="/tickets"
          className="text-[10px] text-emerald-light hover:text-emerald font-semibold flex items-center gap-1 transition-colors"
        >
          View all tickets
          <ChevronRight size={10} />
        </Link>
        <Link
          to="/play"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald/10 border border-emerald/20 text-[10px] font-bold text-emerald-light rounded-lg hover:bg-emerald/15 transition-colors"
        >
          <Plus size={10} />
          Buy More
        </Link>
      </div>
    </div>
  );
}

function Plus({ size, className }: { size: number; className?: string }) {
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: <no title>
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  )
}

function SyndicateMemberships() {
  if (MOCK_SYNDICATE_MEMBERSHIPS.length === 0) return null;

  return (
    <div className="glass rounded-2xl p-5 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Users size={16} className="text-emerald" />
          My Syndicates
        </h3>
        <Link
          to="/syndicates"
          className="text-[10px] text-emerald-light hover:text-emerald font-semibold flex items-center gap-1 transition-colors"
        >
          Browse All
          <ChevronRight size={10} />
        </Link>
      </div>

      <div className="space-y-3">
        {MOCK_SYNDICATE_MEMBERSHIPS.map((syn) => (
          <div
            key={syn.id}
            className="p-3 rounded-xl bg-foreground/2 border border-foreground/4 hover:border-emerald/10 transition-colors"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald/15 border border-emerald/20 flex items-center justify-center text-[10px] font-black text-emerald-light">
                  {syn.name.charAt(0)}
                </div>
                <div>
                  <h4 className="text-xs font-bold text-foreground">
                    {syn.name}
                  </h4>
                  <span className="text-[9px] text-muted-foreground">
                    {syn.members}/{syn.maxMembers} members
                  </span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs font-bold text-emerald-light">
                  {syn.myShare.toFixed(2)}%
                </div>
                <div className="text-[9px] text-muted-foreground">
                  Your share
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="text-center py-1.5 rounded-md bg-foreground/2">
                <div className="text-[10px] font-bold text-foreground">
                  ${syn.myContribution.toFixed(0)}
                </div>
                <div className="text-[8px] text-muted-foreground uppercase">
                  My Contrib
                </div>
              </div>
              <div className="text-center py-1.5 rounded-md bg-foreground/2">
                <div className="text-[10px] font-bold text-foreground">
                  ${syn.totalPool.toFixed(0)}
                </div>
                <div className="text-[8px] text-muted-foreground uppercase">
                  Total Pool
                </div>
              </div>
              <div className="text-center py-1.5 rounded-md bg-foreground/2">
                <div className="text-[10px] font-bold text-emerald-light">
                  {syn.ticketsThisDraw}
                </div>
                <div className="text-[8px] text-muted-foreground uppercase">
                  Tickets
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function JackpotTrend() {
  const max = Math.max(...MOCK_JACKPOT_HISTORY.map((h) => h.amount));
  const min = Math.min(...MOCK_JACKPOT_HISTORY.map((h) => h.amount));
  const range = max - min || 1;

  return (
    <div className="glass rounded-2xl p-5 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <BarChart3 size={16} className="text-gold" />
          Jackpot Trend
        </h3>
        <Link
          to="/results"
          className="text-[10px] text-emerald-light hover:text-emerald font-semibold flex items-center gap-1 transition-colors"
        >
          Full History
          <ChevronRight size={10} />
        </Link>
      </div>

      {/* Simple bar chart */}
      <div className="flex items-end gap-2 h-32 mb-3">
        {MOCK_JACKPOT_HISTORY.map((point, i) => {
          const height = ((point.amount - min) / range) * 80 + 20; // min 20% height
          const isLatest = i === MOCK_JACKPOT_HISTORY.length - 1;
          const softCapReached = point.amount >= 1_750_000;

          return (
            <div
              key={point.drawId}
              className="flex-1 flex flex-col items-center gap-1.5"
            >
              <div
                className={`w-full rounded-t-md transition-all duration-500 ${
                  softCapReached
                    ? "bg-linear-to-t from-emerald-dark to-emerald"
                    : isLatest
                      ? "bg-linear-to-t from-gold-dark to-gold"
                      : "bg-linear-to-t from-white/5 to-white/10"
                }`}
                style={{ height: `${height}%` }}
              />
              <div className="text-center">
                <div
                  className={`text-[9px] font-bold tabular-nums ${
                    isLatest ? "text-gold" : "text-muted-foreground"
                  }`}
                >
                  ${(point.amount / 1_000_000).toFixed(2)}M
                </div>
                <div className="text-[8px] text-muted-foreground/60">
                  #{point.drawId}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Soft cap indicator */}
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-sm bg-linear-to-t from-emerald-dark to-emerald" />
          <span>Rolldown active</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-sm bg-linear-to-t from-gold-dark to-gold" />
          <span>Current</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-sm bg-linear-to-t from-white/5 to-white/10" />
          <span>Normal</span>
        </div>
      </div>
    </div>
  );
}

function WalletNotConnected() {
  const { open } = useAppKit();

  return (
    <div className="min-h-screen bg-background">
      <section className="relative pt-24 pb-8 sm:pt-28 sm:pb-12 px-4 sm:px-6 lg:px-8 overflow-hidden">
        <div className="absolute inset-0 hero-grid opacity-30" />
        <div className="absolute inset-0 bg-glow-emerald opacity-15" />
        <FloatingBalls count={5} />

        <div className="relative z-10 max-w-2xl mx-auto text-center mt-16 sm:mt-24">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-linear-to-br from-emerald/20 to-emerald-dark/10 border border-emerald/20 mb-6 glow-emerald">
            <Wallet size={36} className="text-emerald-light" />
          </div>

          <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-foreground mb-3">
            Connect Your Wallet
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground max-w-md mx-auto mb-8">
            Connect your Solana wallet to view your dashboard, track tickets,
            monitor rolldown windows, and manage your syndicates.
          </p>

          <Button
            onClick={() => open({ view: "Connect", namespace: "solana" })}
            className="h-12 px-8 bg-linear-to-r from-emerald to-emerald-dark hover:from-emerald-light hover:to-emerald text-white font-bold rounded-xl shadow-lg shadow-emerald/25 hover:shadow-emerald/40 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] text-sm"
          >
            <Wallet size={18} />
            Connect Wallet
          </Button>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-4 text-[10px] text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Shield size={10} className="text-emerald/60" />
              <span>Non-custodial</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Eye size={10} className="text-emerald/60" />
              <span>Read-only access</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Shield size={10} className="text-emerald/60" />
              <span>Sign to transact</span>
            </div>
          </div>

          {/* Still show public info */}
          <div className="mt-16">
            <JackpotDisplay
              amount={1_247_832}
              size="lg"
              glow
              showRolldownStatus
              softCap={1_750_000}
            />

            <div className="mt-8">
              <CountdownTimer size="md" label="Next Draw" />
            </div>
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main Component                                                            */
/* -------------------------------------------------------------------------- */

function DashboardPage() {
  const { isConnected } = useAppKitAccount();

  // Show wallet prompt when not connected
  if (!isConnected) {
    return <WalletNotConnected />;
  }

  const stats = MOCK_PLAYER_STATS;

  return (
    <div className="min-h-screen bg-background">
      {/* ================================================================ */}
      {/*  HERO / TOP BAR                                                  */}
      {/* ================================================================ */}
      <section className="relative pt-24 pb-6 sm:pt-28 sm:pb-8 px-4 sm:px-6 lg:px-8 overflow-hidden">
        <div className="absolute inset-0 hero-grid opacity-20" />
        <div className="absolute inset-0 bg-glow-top-left" />

        <div className="relative z-10 max-w-7xl mx-auto">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-xs text-muted-foreground mb-6">
            <Link to="/" className="hover:text-foreground transition-colors">
              Home
            </Link>
            <ChevronRight size={12} />
            <span className="text-emerald-light font-medium">Dashboard</span>
          </nav>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="p-2 rounded-xl bg-linear-to-br from-emerald/20 to-emerald-dark/10 border border-emerald/20">
                  <BarChart3 size={24} className="text-emerald-light" />
                </div>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
                    Dashboard
                  </h1>
                  <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      7xKX...AsU
                    </span>
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald/10 border border-emerald/20 text-[9px] font-bold text-emerald-light">
                      <Flame size={8} />
                      {stats.currentStreak} draw streak
                    </span>
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <QuickPickCountdown size="sm" />
              <Link
                to="/play"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-linear-to-r from-emerald to-emerald-dark hover:from-emerald-light hover:to-emerald text-white text-sm font-bold rounded-xl shadow-lg shadow-emerald/25 hover:shadow-emerald/40 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
              >
                <Trophy size={16} />
                Play Now
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/*  MAIN CONTENT                                                    */}
      {/* ================================================================ */}
      <section className="relative px-4 sm:px-6 lg:px-8 pb-16">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* ---- Stats Cards ---- */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard
              label="Total Won"
              value={`$${stats.totalWon.toFixed(0)}`}
              icon={Trophy}
              accentColor="gold"
              trend={{ value: "+$250", positive: true }}
            />
            <StatCard
              label="Net Profit"
              value={`$${stats.netProfit.toFixed(0)}`}
              subValue={`${((stats.netProfit / stats.totalSpent) * 100).toFixed(1)}% ROI`}
              icon={TrendingUp}
              accentColor={stats.netProfit >= 0 ? "emerald" : "default"}
              trend={{
                value: stats.netProfit >= 0 ? "Profitable" : "Loss",
                positive: stats.netProfit >= 0,
              }}
            />
            <StatCard
              label="Total Tickets"
              value={stats.totalTickets.toString()}
              subValue={`${stats.drawsPlayed} draws played`}
              icon={Ticket}
            />
            <StatCard
              label="Win Rate"
              value={`${stats.winRate}%`}
              subValue={`Biggest: $${stats.biggestWin}`}
              icon={Target}
              accentColor="emerald"
            />
            <StatCard
              label="Free Tickets"
              value={stats.freeTickets.toString()}
              subValue="Match 2 credits"
              icon={Sparkles}
              accentColor="gold"
            />
            <StatCard
              label="Streak"
              value={stats.currentStreak.toString()}
              subValue={`Best: ${stats.bestStreak}`}
              icon={Flame}
              accentColor="emerald"
            />
          </div>

          {/* ---- Main grid: 2 columns ---- */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: 2/3 width */}
            <div className="lg:col-span-2 space-y-6">
              {/* Jackpot + Countdown row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <JackpotDisplay
                  amount={1_247_832}
                  size="md"
                  glow
                  showRolldownStatus
                  softCap={1_750_000}
                  className="flex-1"
                />
                <div className="flex items-center justify-center glass rounded-2xl p-5">
                  <CountdownTimer size="md" label="Next Draw" />
                </div>
              </div>

              {/* Recent Draws */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                    <Clock size={18} className="text-emerald" />
                    Recent Draws
                  </h2>
                  <Link
                    to="/results"
                    className="text-xs text-emerald-light hover:text-emerald font-semibold flex items-center gap-1 transition-colors"
                  >
                    View All Results
                    <ChevronRight size={12} />
                  </Link>
                </div>
                <div className="space-y-3">
                  {MOCK_RECENT_DRAWS.slice(0, 4).map((draw) => (
                    <RecentDrawCard key={draw.drawId} draw={draw} />
                  ))}
                </div>
              </div>
            </div>

            {/* Right: 1/3 width sidebar */}
            <div className="space-y-6">
              {/* Rolldown Monitor */}
              <RolldownMonitor />

              {/* Active Tickets */}
              <ActiveTicketsPanel />

              {/* Jackpot Trend */}
              <JackpotTrend />

              {/* Syndicate Memberships */}
              <SyndicateMemberships />

              {/* Quick Actions */}
              <div className="glass rounded-2xl p-5 sm:p-6">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2 mb-4">
                  <Zap size={16} className="text-emerald" />
                  Quick Actions
                </h3>
                <div className="space-y-2">
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
                      <Award
                        size={14}
                        className="text-gold/60 group-hover:text-gold transition-colors"
                      />
                      <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                        Claim Prizes
                      </span>
                    </div>
                    <ChevronRight
                      size={12}
                      className="text-muted-foreground/60 group-hover:text-muted-foreground transition-colors"
                    />
                  </Link>
                  <Link
                    to="/syndicates"
                    className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-foreground/3 transition-colors group"
                  >
                    <div className="flex items-center gap-2">
                      <Users
                        size={14}
                        className="text-emerald/60 group-hover:text-emerald-light transition-colors"
                      />
                      <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                        Browse Syndicates
                      </span>
                    </div>
                    <ChevronRight
                      size={12}
                      className="text-muted-foreground/60 group-hover:text-muted-foreground transition-colors"
                    />
                  </Link>
                  <Link
                    to="/learn/rolldown"
                    className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-foreground/3 transition-colors group"
                  >
                    <div className="flex items-center gap-2">
                      <TrendingUp
                        size={14}
                        className="text-emerald/60 group-hover:text-emerald-light transition-colors"
                      />
                      <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                        Learn Rolldown Strategy
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
        </div>
      </section>

      <Footer />
    </div>
  );
}
