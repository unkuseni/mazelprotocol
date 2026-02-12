import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import {
  Ticket,
  Trophy,
  Clock,
  ChevronRight,
  Zap,
  Filter,
  Search,
  ArrowUpDown,
  Shield,
  Eye,
  Check,
  X,
  Gift,
  AlertTriangle,
  Star,
  Sparkles,
  TrendingUp,
  ChevronDown,
  ExternalLink,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useAppKit, useAppKitAccount } from "@/lib/appkit-hooks";
import { Button } from "@/components/ui/button";
import { JackpotDisplay } from "@/components/JackpotDisplay";
import { CountdownTimer } from "@/components/CountdownTimer";
import { WinningNumbers, FloatingBalls } from "@/components/LotteryBalls";
import Footer from "@/components/Footer";

export const Route = createFileRoute("/tickets/")({
  component: MyTicketsPage,
});

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

type TicketStatus = "pending" | "won" | "lost" | "claimed" | "expired";
type GameType = "main" | "quickpick";
type TicketFilter = "all" | "pending" | "won" | "lost" | "claimed";
type SortField = "date" | "prize" | "matchCount" | "drawId";
type SortDir = "asc" | "desc";

interface TicketData {
  id: string;
  numbers: number[];
  drawId: number;
  drawDate: string;
  winningNumbers: number[] | null;
  purchaseTime: string;
  gameType: GameType;
  isQuickPick: boolean;
  isSyndicateTicket: boolean;
  syndicateName?: string;
  status: TicketStatus;
  matchCount: number;
  prize: number;
  isClaimed: boolean;
  isExpired: boolean;
  wasRolldown: boolean;
  txSignature: string;
}

/* -------------------------------------------------------------------------- */
/*  Mock Data                                                                 */
/* -------------------------------------------------------------------------- */

const MOCK_TICKETS: TicketData[] = [
  // Active tickets for next draw
  {
    id: "tkt_active_001",
    numbers: [4, 15, 22, 33, 38, 46],
    drawId: 90,
    drawDate: "2025-06-16",
    winningNumbers: null,
    purchaseTime: "2025-06-15T10:30:00Z",
    gameType: "main",
    isQuickPick: false,
    isSyndicateTicket: false,
    status: "pending",
    matchCount: 0,
    prize: 0,
    isClaimed: false,
    isExpired: false,
    wasRolldown: false,
    txSignature: "5VERv8NMvzbJ...",
  },
  {
    id: "tkt_active_002",
    numbers: [8, 11, 19, 27, 35, 42],
    drawId: 90,
    drawDate: "2025-06-16",
    winningNumbers: null,
    purchaseTime: "2025-06-15T10:30:00Z",
    gameType: "main",
    isQuickPick: true,
    isSyndicateTicket: false,
    status: "pending",
    matchCount: 0,
    prize: 0,
    isClaimed: false,
    isExpired: false,
    wasRolldown: false,
    txSignature: "3ABcH7QzL1rp...",
  },
  {
    id: "tkt_active_003",
    numbers: [1, 6, 14, 29, 37, 44],
    drawId: 90,
    drawDate: "2025-06-16",
    winningNumbers: null,
    purchaseTime: "2025-06-15T10:31:00Z",
    gameType: "main",
    isQuickPick: true,
    isSyndicateTicket: true,
    syndicateName: "Diamond Hands Lotto Club",
    status: "pending",
    matchCount: 0,
    prize: 0,
    isClaimed: false,
    isExpired: false,
    wasRolldown: false,
    txSignature: "9KLm2WxNb4eQ...",
  },
  // Quick Pick Express active
  {
    id: "tkt_qp_active_001",
    numbers: [3, 12, 21, 28, 34],
    drawId: 540,
    drawDate: "2025-06-15",
    winningNumbers: null,
    purchaseTime: "2025-06-15T14:00:00Z",
    gameType: "quickpick",
    isQuickPick: true,
    isSyndicateTicket: false,
    status: "pending",
    matchCount: 0,
    prize: 0,
    isClaimed: false,
    isExpired: false,
    wasRolldown: false,
    txSignature: "7RTy5VxK3pWm...",
  },
  // Won - unclaimed
  {
    id: "tkt_won_001",
    numbers: [3, 12, 18, 27, 33, 41],
    drawId: 89,
    drawDate: "2025-06-14",
    winningNumbers: [3, 12, 18, 27, 33, 41],
    purchaseTime: "2025-06-14T08:15:00Z",
    gameType: "main",
    isQuickPick: false,
    isSyndicateTicket: false,
    status: "won",
    matchCount: 3,
    prize: 5.0,
    isClaimed: false,
    isExpired: false,
    wasRolldown: false,
    txSignature: "2NHj8RtF6dKs...",
  },
  {
    id: "tkt_won_002",
    numbers: [7, 14, 22, 31, 38, 45],
    drawId: 88,
    drawDate: "2025-06-13",
    winningNumbers: [7, 14, 22, 31, 38, 45],
    purchaseTime: "2025-06-13T06:20:00Z",
    gameType: "main",
    isQuickPick: true,
    isSyndicateTicket: false,
    status: "won",
    matchCount: 4,
    prize: 250.0,
    isClaimed: false,
    isExpired: false,
    wasRolldown: true,
    txSignature: "8WQe3XzR7mYv...",
  },
  {
    id: "tkt_won_003",
    numbers: [7, 14, 22, 29, 36, 43],
    drawId: 88,
    drawDate: "2025-06-13",
    winningNumbers: [7, 14, 22, 31, 38, 45],
    purchaseTime: "2025-06-13T06:20:00Z",
    gameType: "main",
    isQuickPick: false,
    isSyndicateTicket: false,
    status: "won",
    matchCount: 3,
    prize: 45.0,
    isClaimed: false,
    isExpired: false,
    wasRolldown: true,
    txSignature: "4FGa9BcT2nKp...",
  },
  // Won - claimed
  {
    id: "tkt_claimed_001",
    numbers: [1, 9, 17, 28, 35, 42],
    drawId: 87,
    drawDate: "2025-06-12",
    winningNumbers: [1, 9, 17, 28, 35, 42],
    purchaseTime: "2025-06-12T09:00:00Z",
    gameType: "main",
    isQuickPick: false,
    isSyndicateTicket: false,
    status: "claimed",
    matchCount: 3,
    prize: 5.0,
    isClaimed: true,
    isExpired: false,
    wasRolldown: false,
    txSignature: "6MNp4QwV8kXe...",
  },
  {
    id: "tkt_claimed_002",
    numbers: [2, 16, 24, 32, 39, 46],
    drawId: 85,
    drawDate: "2025-06-10",
    winningNumbers: [2, 16, 24, 29, 36, 40],
    purchaseTime: "2025-06-10T07:30:00Z",
    gameType: "main",
    isQuickPick: false,
    isSyndicateTicket: true,
    syndicateName: "EV Maximizers",
    status: "claimed",
    matchCount: 3,
    prize: 5.0,
    isClaimed: true,
    isExpired: false,
    wasRolldown: false,
    txSignature: "1HKr7TsN5jBf...",
  },
  // Lost tickets
  {
    id: "tkt_lost_001",
    numbers: [5, 20, 30, 34, 40, 46],
    drawId: 89,
    drawDate: "2025-06-14",
    winningNumbers: [3, 12, 18, 27, 33, 41],
    purchaseTime: "2025-06-14T08:15:00Z",
    gameType: "main",
    isQuickPick: true,
    isSyndicateTicket: false,
    status: "lost",
    matchCount: 0,
    prize: 0,
    isClaimed: false,
    isExpired: false,
    wasRolldown: false,
    txSignature: "5PLf2VxC8tRe...",
  },
  {
    id: "tkt_lost_002",
    numbers: [10, 15, 21, 28, 36, 44],
    drawId: 89,
    drawDate: "2025-06-14",
    winningNumbers: [3, 12, 18, 27, 33, 41],
    purchaseTime: "2025-06-14T08:15:00Z",
    gameType: "main",
    isQuickPick: true,
    isSyndicateTicket: false,
    status: "lost",
    matchCount: 1,
    prize: 0,
    isClaimed: false,
    isExpired: false,
    wasRolldown: false,
    txSignature: "7QMd6WyB3sKn...",
  },
  {
    id: "tkt_lost_003",
    numbers: [2, 8, 14, 25, 31, 43],
    drawId: 88,
    drawDate: "2025-06-13",
    winningNumbers: [7, 14, 22, 31, 38, 45],
    purchaseTime: "2025-06-13T06:20:00Z",
    gameType: "main",
    isQuickPick: false,
    isSyndicateTicket: false,
    status: "lost",
    matchCount: 2,
    prize: 0,
    isClaimed: false,
    isExpired: false,
    wasRolldown: true,
    txSignature: "9XNk1RzA4pGt...",
  },
  {
    id: "tkt_lost_004",
    numbers: [11, 23, 30, 37, 44],
    drawId: 538,
    drawDate: "2025-06-14",
    winningNumbers: [5, 14, 23, 30, 35],
    purchaseTime: "2025-06-14T12:00:00Z",
    gameType: "quickpick",
    isQuickPick: true,
    isSyndicateTicket: false,
    status: "lost",
    matchCount: 2,
    prize: 0,
    isClaimed: false,
    isExpired: false,
    wasRolldown: false,
    txSignature: "3FHp8SvE2qLm...",
  },
  // Won Quick Pick Express
  {
    id: "tkt_qp_won_001",
    numbers: [5, 14, 23, 30, 35],
    drawId: 538,
    drawDate: "2025-06-14",
    winningNumbers: [5, 14, 23, 30, 35],
    purchaseTime: "2025-06-14T12:00:00Z",
    gameType: "quickpick",
    isQuickPick: true,
    isSyndicateTicket: false,
    status: "won",
    matchCount: 3,
    prize: 4.0,
    isClaimed: false,
    isExpired: false,
    wasRolldown: false,
    txSignature: "6TKp2BxR9mWn...",
  },
  // Expired ticket
  {
    id: "tkt_expired_001",
    numbers: [6, 18, 25, 32, 39, 45],
    drawId: 72,
    drawDate: "2025-05-28",
    winningNumbers: [6, 18, 25, 32, 39, 45],
    purchaseTime: "2025-05-28T07:00:00Z",
    gameType: "main",
    isQuickPick: false,
    isSyndicateTicket: false,
    status: "expired",
    matchCount: 3,
    prize: 5.0,
    isClaimed: false,
    isExpired: true,
    wasRolldown: false,
    txSignature: "2VRm5NxK7pYt...",
  },
];

const MOCK_UNCLAIMED_TOTAL = MOCK_TICKETS.filter(
  (t) => t.status === "won" && !t.isClaimed,
).reduce((sum, t) => sum + t.prize, 0);

const MOCK_FREE_TICKET_CREDITS = 3;

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                            */
/* -------------------------------------------------------------------------- */

function StatusBadge({ status }: { status: TicketStatus }) {
  const config: Record<
    TicketStatus,
    { label: string; bg: string; text: string; icon: LucideIcon }
  > = {
    pending: {
      label: "Pending",
      bg: "bg-blue-500/10 border-blue-500/20",
      text: "text-blue-400",
      icon: Clock,
    },
    won: {
      label: "Won",
      bg: "bg-gold/10 border-gold/20",
      text: "text-gold",
      icon: Trophy,
    },
    lost: {
      label: "No Win",
      bg: "bg-foreground/[0.03] border-foreground/[0.06]",
      text: "text-muted-foreground",
      icon: X,
    },
    claimed: {
      label: "Claimed",
      bg: "bg-emerald/10 border-emerald/20",
      text: "text-emerald-light",
      icon: Check,
    },
    expired: {
      label: "Expired",
      bg: "bg-red-500/10 border-red-500/20",
      text: "text-red-400",
      icon: AlertTriangle,
    },
  };

  const c = config[status];
  const Icon = c.icon;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase tracking-wider ${c.bg} ${c.text}`}
    >
      <Icon size={9} />
      {c.label}
    </span>
  );
}

function GameBadge({ gameType }: { gameType: GameType }) {
  if (gameType === "quickpick") {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald/10 border border-emerald/20 text-[9px] font-semibold text-emerald-light uppercase tracking-wider">
        <Zap size={8} />
        5/35
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-gold/10 border border-gold/20 text-[9px] font-semibold text-gold uppercase tracking-wider">
      <Trophy size={8} />
      6/46
    </span>
  );
}

function TicketRow({
  ticket,
  onClaim,
  expanded,
  onToggleExpand,
}: {
  ticket: TicketData;
  onClaim: (id: string) => void;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const matchedIndices = useMemo(() => {
    if (!ticket.winningNumbers) return undefined;
    const set = new Set<number>();
    ticket.numbers.forEach((num, idx) => {
      if (ticket.winningNumbers!.includes(num)) {
        set.add(idx);
      }
    });
    return set;
  }, [ticket.numbers, ticket.winningNumbers]);

  return (
    <div
      className={`glass rounded-xl transition-all duration-200 ${
        ticket.status === "won" && !ticket.isClaimed
          ? "border-gold/20 shadow-sm shadow-gold/5"
          : ticket.status === "pending"
            ? "border-blue-500/10"
            : ""
      }`}
    >
      {/* Main row */}
      <button
        type="button"
        onClick={onToggleExpand}
        className="w-full p-4 flex items-center gap-3 sm:gap-4 text-left hover:bg-foreground/1 transition-colors rounded-xl"
      >
        {/* Status indicator dot */}
        <div
          className={`shrink-0 w-2 h-2 rounded-full ${
            ticket.status === "pending"
              ? "bg-blue-400 animate-pulse"
              : ticket.status === "won"
                ? "bg-gold"
                : ticket.status === "claimed"
                  ? "bg-emerald"
                  : ticket.status === "expired"
                    ? "bg-red-400"
                    : "bg-gray-600"
          }`}
        />

        {/* Numbers */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <WinningNumbers
              numbers={ticket.numbers}
              matchedIndices={matchedIndices}
              size="sm"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <GameBadge gameType={ticket.gameType} />
            {ticket.isQuickPick && (
              <span className="text-[9px] text-muted-foreground font-medium flex items-center gap-0.5">
                <Zap size={7} />
                Quick Pick
              </span>
            )}
            {ticket.isSyndicateTicket && (
              <span className="text-[9px] text-emerald-light/70 font-medium flex items-center gap-0.5">
                <Star size={7} />
                {ticket.syndicateName}
              </span>
            )}
            {ticket.wasRolldown && (
              <span className="text-[9px] text-emerald-light font-semibold flex items-center gap-0.5">
                <TrendingUp size={7} />
                Rolldown
              </span>
            )}
          </div>
        </div>

        {/* Draw info */}
        <div className="hidden sm:block text-right shrink-0">
          <div className="text-[10px] text-muted-foreground">
            Draw #{ticket.drawId}
          </div>
          <div className="text-[10px] text-muted-foreground/60">
            {ticket.drawDate}
          </div>
        </div>

        {/* Match count / Prize */}
        <div className="text-right shrink-0 min-w-15">
          {ticket.status === "pending" ? (
            <div className="text-xs text-blue-400 font-semibold">Pending</div>
          ) : ticket.matchCount > 0 ? (
            <>
              <div
                className={`text-xs font-bold ${
                  ticket.matchCount >= 4
                    ? "text-gold"
                    : ticket.matchCount >= 3
                      ? "text-emerald-light"
                      : "text-muted-foreground"
                }`}
              >
                {ticket.matchCount} match{ticket.matchCount !== 1 ? "es" : ""}
              </div>
              {ticket.prize > 0 && (
                <div className="text-xs font-black text-gradient-gold">
                  +${ticket.prize.toFixed(ticket.prize >= 1 ? 0 : 2)}
                </div>
              )}
            </>
          ) : (
            <div className="text-xs text-muted-foreground/60">No match</div>
          )}
        </div>

        {/* Status */}
        <div className="shrink-0 hidden sm:block">
          <StatusBadge status={ticket.status} />
        </div>

        {/* Expand chevron */}
        <ChevronDown
          size={14}
          className={`shrink-0 text-muted-foreground/60 transition-transform duration-200 ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-foreground/5 pt-3 space-y-3 animate-slide-down">
          {/* Mobile-only status & draw info */}
          <div className="flex items-center justify-between sm:hidden">
            <div>
              <div className="text-[10px] text-muted-foreground">
                Draw #{ticket.drawId}
              </div>
              <div className="text-[10px] text-muted-foreground/60">
                {ticket.drawDate}
              </div>
            </div>
            <StatusBadge status={ticket.status} />
          </div>

          {/* Winning numbers comparison */}
          {ticket.winningNumbers && (
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">
                Winning Numbers
              </div>
              <WinningNumbers numbers={ticket.winningNumbers} size="sm" />
            </div>
          )}

          {/* Details grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="p-2 rounded-lg bg-foreground/2">
              <div className="text-[9px] text-muted-foreground uppercase tracking-wider">
                Purchased
              </div>
              <div className="text-[10px] text-foreground font-medium mt-0.5">
                {new Date(ticket.purchaseTime).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            </div>
            <div className="p-2 rounded-lg bg-foreground/2">
              <div className="text-[9px] text-muted-foreground uppercase tracking-wider">
                Game
              </div>
              <div className="text-[10px] text-foreground font-medium mt-0.5">
                {ticket.gameType === "main"
                  ? "6/46 Main Lottery"
                  : "Quick Pick Express 5/35"}
              </div>
            </div>
            <div className="p-2 rounded-lg bg-foreground/2">
              <div className="text-[9px] text-muted-foreground uppercase tracking-wider">
                Matches
              </div>
              <div
                className={`text-[10px] font-bold mt-0.5 ${
                  ticket.status === "pending"
                    ? "text-blue-400"
                    : ticket.matchCount >= 3
                      ? "text-emerald-light"
                      : "text-muted-foreground"
                }`}
              >
                {ticket.status === "pending"
                  ? "Awaiting draw"
                  : `${ticket.matchCount} / ${ticket.numbers.length}`}
              </div>
            </div>
            <div className="p-2 rounded-lg bg-foreground/2">
              <div className="text-[9px] text-muted-foreground uppercase tracking-wider">
                Prize
              </div>
              <div
                className={`text-[10px] font-bold mt-0.5 ${
                  ticket.prize > 0 ? "text-gold" : "text-muted-foreground"
                }`}
              >
                {ticket.status === "pending"
                  ? "TBD"
                  : ticket.prize > 0
                    ? `$${ticket.prize.toFixed(2)} USDC`
                    : ticket.matchCount === 2 && ticket.gameType === "main"
                      ? "Free Ticket"
                      : "—"}
              </div>
            </div>
          </div>

          {/* Transaction link */}
          <div className="flex items-center justify-between">
            <a
              href={`https://solscan.io/tx/${ticket.txSignature}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-emerald-light transition-colors"
            >
              <ExternalLink size={9} />
              <span className="font-mono">{ticket.txSignature}</span>
            </a>

            {/* Claim button */}
            {ticket.status === "won" && !ticket.isClaimed && (
              <Button
                onClick={() => onClaim(ticket.id)}
                size="sm"
                className="h-8 px-4 text-xs font-bold bg-linear-to-r from-gold-dark to-gold hover:from-gold to-gold-light text-navy rounded-lg shadow-md shadow-gold/20 hover:shadow-gold/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <Gift size={12} />
                Claim Prize
              </Button>
            )}
            {ticket.status === "expired" && (
              <span className="text-[10px] text-red-400/70 flex items-center gap-1">
                <AlertTriangle size={9} />
                Prize expired — unclaimed after 30 days
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function UnclaimedBanner({
  total,
  count,
  onClaimAll,
}: {
  total: number;
  count: number;
  onClaimAll: () => void;
}) {
  if (total <= 0) return null;

  return (
    <div className="relative glass-strong rounded-2xl p-5 sm:p-6 overflow-hidden border border-gold/20">
      <div className="absolute inset-0 bg-gradient-to-br from-gold/4 via-transparent to-emerald/2" />
      <div className="absolute top-0 right-0 w-40 h-40 bg-glow-gold opacity-15" />

      <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gold/15 border border-gold/20 shrink-0">
            <Gift size={22} className="text-gold" />
          </div>
          <div>
            <h3 className="text-base font-black text-foreground">
              You have{" "}
              <span className="text-gradient-gold">
                ${total.toFixed(2)} USDC
              </span>{" "}
              to claim!
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {count} winning ticket{count !== 1 ? "s" : ""} with unclaimed
              prizes. Prizes expire after 30 days.
            </p>
          </div>
        </div>

        <Button
          onClick={onClaimAll}
          className="h-11 px-6 bg-linear-to-r from-gold-dark to-gold-light hover:from-gold hover:to-gold-light text-navy font-bold rounded-xl shadow-lg shadow-gold/25 hover:shadow-gold/40 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] shrink-0"
        >
          <Gift size={16} />
          Claim All (${total.toFixed(2)})
        </Button>
      </div>
    </div>
  );
}

function TicketStats({ tickets }: { tickets: TicketData[] }) {
  const totalTickets = tickets.length;
  const pendingCount = tickets.filter((t) => t.status === "pending").length;
  const wonCount = tickets.filter(
    (t) => t.status === "won" || t.status === "claimed",
  ).length;
  const totalPrizes = tickets.reduce((sum, t) => sum + t.prize, 0);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
      <div className="glass rounded-xl p-3 text-center">
        <div className="text-lg font-black text-foreground">{totalTickets}</div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
          Total Tickets
        </div>
      </div>
      <div className="glass rounded-xl p-3 text-center">
        <div className="text-lg font-black text-blue-400">{pendingCount}</div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
          Pending
        </div>
      </div>
      <div className="glass rounded-xl p-3 text-center">
        <div className="text-lg font-black text-gold">{wonCount}</div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
          Wins
        </div>
      </div>
      <div className="glass rounded-xl p-3 text-center">
        <div className="text-lg font-black text-gradient-gold">
          ${totalPrizes.toFixed(0)}
        </div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
          Total Prizes
        </div>
      </div>
      <div className="glass rounded-xl p-3 text-center">
        <div className="text-lg font-black text-emerald-light">
          {MOCK_FREE_TICKET_CREDITS}
        </div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
          Free Credits
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Wallet Not Connected View                                                 */
/* -------------------------------------------------------------------------- */

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
            <Ticket size={36} className="text-emerald-light" />
          </div>

          <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-foreground mb-3">
            Connect Your Wallet
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground max-w-md mx-auto mb-8">
            Connect your Solana wallet to view your tickets, track results, and
            claim your winnings.
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
              <span>Sign to claim prizes</span>
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

function EmptyState({ filter }: { filter: TicketFilter }) {
  const messages: Record<TicketFilter, { title: string; desc: string }> = {
    all: {
      title: "No tickets yet",
      desc: "Buy your first lottery ticket to get started!",
    },
    pending: {
      title: "No pending tickets",
      desc: "You don't have any tickets waiting for the next draw.",
    },
    won: {
      title: "No unclaimed prizes",
      desc: "All your winning tickets have been claimed.",
    },
    lost: {
      title: "No losing tickets",
      desc: "Good news — nothing to see here!",
    },
    claimed: {
      title: "No claimed tickets",
      desc: "You haven't claimed any prizes yet.",
    },
  };

  const msg = messages[filter];

  return (
    <div className="glass rounded-2xl p-12 text-center">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-foreground/3 border border-foreground/6 mb-4">
        <Ticket size={24} className="text-muted-foreground/60" />
      </div>
      <p className="text-sm text-muted-foreground mb-1">{msg.title}</p>
      <p className="text-xs text-muted-foreground/60 mb-4">{msg.desc}</p>
      {filter === "all" && (
        <Link
          to="/play"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-linear-to-r from-emerald to-emerald-dark hover:from-emerald-light hover:to-emerald text-white text-sm font-bold rounded-xl shadow-lg shadow-emerald/25 hover:shadow-emerald/40 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
        >
          <Trophy size={14} />
          Buy Tickets
        </Link>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main Component                                                            */
/* -------------------------------------------------------------------------- */

function MyTicketsPage() {
  const { open } = useAppKit();
  const { isConnected } = useAppKitAccount();
  const [filter, setFilter] = useState<TicketFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedTicket, setExpandedTicket] = useState<string | null>(null);
  const [gameFilter, setGameFilter] = useState<"all" | GameType>("all");

  const filteredTickets = useMemo(() => {
    let result = [...MOCK_TICKETS];

    // Status filter
    if (filter !== "all") {
      result = result.filter((t) => t.status === filter);
    }

    // Game type filter
    if (gameFilter !== "all") {
      result = result.filter((t) => t.gameType === gameFilter);
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.id.toLowerCase().includes(q) ||
          t.drawId.toString().includes(q) ||
          t.numbers.some((n) => n.toString() === q) ||
          t.syndicateName?.toLowerCase().includes(q) ||
          t.txSignature.toLowerCase().includes(q),
      );
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "date":
          cmp =
            new Date(b.purchaseTime).getTime() -
            new Date(a.purchaseTime).getTime();
          break;
        case "prize":
          cmp = b.prize - a.prize;
          break;
        case "matchCount":
          cmp = b.matchCount - a.matchCount;
          break;
        case "drawId":
          cmp = b.drawId - a.drawId;
          break;
      }
      return sortDir === "desc" ? cmp : -cmp;
    });

    return result;
  }, [filter, gameFilter, searchQuery, sortField, sortDir]);

  const unclaimedTickets = MOCK_TICKETS.filter(
    (t) => t.status === "won" && !t.isClaimed,
  );

  const handleClaim = (id: string) => {
    if (!isConnected) {
      open({ view: "Connect", namespace: "solana" });
      return;
    }
    // In a real app, this would trigger the on-chain claim transaction
    alert(
      `Claiming prize for ticket ${id}. Sign the transaction to receive your USDC.`,
    );
  };

  const handleClaimAll = () => {
    if (!isConnected) {
      open({ view: "Connect", namespace: "solana" });
      return;
    }
    // In a real app, this would batch-claim all prizes in a single transaction
    alert(
      `Claiming all ${unclaimedTickets.length} prizes ($${MOCK_UNCLAIMED_TOTAL.toFixed(2)} USDC total). Sign the transaction to batch-claim.`,
    );
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const filterCounts = useMemo(() => {
    const gameFiltered =
      gameFilter === "all"
        ? MOCK_TICKETS
        : MOCK_TICKETS.filter((t) => t.gameType === gameFilter);
    return {
      all: gameFiltered.length,
      pending: gameFiltered.filter((t) => t.status === "pending").length,
      won: gameFiltered.filter((t) => t.status === "won").length,
      lost: gameFiltered.filter((t) => t.status === "lost").length,
      claimed: gameFiltered.filter((t) => t.status === "claimed").length,
    };
  }, [gameFilter]);

  // Show wallet prompt when not connected (after all hooks)
  if (!isConnected) {
    return <WalletNotConnected />;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* ================================================================ */}
      {/*  HERO                                                            */}
      {/* ================================================================ */}
      <section className="relative pt-24 pb-6 sm:pt-28 sm:pb-8 px-4 sm:px-6 lg:px-8 overflow-hidden">
        <div className="absolute inset-0 hero-grid opacity-20" />
        <div className="absolute inset-0 bg-glow-top-left" />
        <FloatingBalls count={4} />

        <div className="relative z-10 max-w-7xl mx-auto">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-xs text-muted-foreground mb-6">
            <Link to="/" className="hover:text-foreground transition-colors">
              Home
            </Link>
            <ChevronRight size={12} />
            <span className="text-emerald-light font-medium">My Tickets</span>
          </nav>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="p-2 rounded-xl bg-linear-to-br from-emerald/20 to-emerald-dark/10 border border-emerald/20">
                  <Ticket size={24} className="text-emerald-light" />
                </div>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
                    My Tickets
                  </h1>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    View, track, and claim your lottery tickets
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {MOCK_FREE_TICKET_CREDITS > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gold/10 border border-gold/20">
                  <Sparkles size={14} className="text-gold" />
                  <span className="text-xs font-bold text-gold">
                    {MOCK_FREE_TICKET_CREDITS} Free
                  </span>
                </div>
              )}
              <Link
                to="/play"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-linear-to-r from-emerald to-emerald-dark hover:from-emerald-light hover:to-emerald text-white text-sm font-bold rounded-xl shadow-lg shadow-emerald/25 hover:shadow-emerald/40 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
              >
                <Trophy size={16} />
                Buy Tickets
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
          {/* Stats */}
          <TicketStats tickets={MOCK_TICKETS} />

          {/* Unclaimed banner */}
          <UnclaimedBanner
            total={MOCK_UNCLAIMED_TOTAL}
            count={unclaimedTickets.length}
            onClaimAll={handleClaimAll}
          />

          {/* Filters & Controls */}
          <div className="glass rounded-2xl p-4 sm:p-5 space-y-3">
            {/* Top row: search + game filter */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              {/* Search */}
              <div className="relative flex-1 w-full">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by draw #, ticket ID, numbers, or syndicate..."
                  className="w-full h-9 pl-9 pr-3 rounded-xl bg-foreground/4 border border-foreground/8 text-sm text-foreground placeholder-gray-600 focus:outline-none focus:border-emerald/40 focus:ring-1 focus:ring-emerald/20 transition-colors"
                />
              </div>

              {/* Game filter */}
              <div className="flex items-center gap-1 shrink-0">
                {(
                  [
                    { key: "all" as const, label: "All Games" },
                    { key: "main" as const, label: "6/46" },
                    { key: "quickpick" as const, label: "5/35" },
                  ] as const
                ).map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setGameFilter(key)}
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

            {/* Bottom row: status filter + sort */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              {/* Status filter tabs */}
              <div className="flex items-center gap-1">
                <Filter size={12} className="text-muted-foreground mr-1" />
                {(
                  [
                    { key: "all" as TicketFilter, label: "All" },
                    { key: "pending" as TicketFilter, label: "Pending" },
                    { key: "won" as TicketFilter, label: "Won" },
                    { key: "claimed" as TicketFilter, label: "Claimed" },
                    { key: "lost" as TicketFilter, label: "No Win" },
                  ] as const
                ).map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilter(key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                      filter === key
                        ? "bg-emerald/15 text-emerald-light border border-emerald/20"
                        : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                    }`}
                  >
                    {label}
                    <span
                      className={`text-[9px] tabular-nums ${
                        filter === key
                          ? "text-emerald-light/70"
                          : "text-muted-foreground/60"
                      }`}
                    >
                      {filterCounts[key]}
                    </span>
                  </button>
                ))}
              </div>

              {/* Sort */}
              <div className="flex items-center gap-1 shrink-0">
                <ArrowUpDown size={12} className="text-muted-foreground mr-1" />
                {(
                  [
                    { field: "date" as SortField, label: "Date" },
                    { field: "prize" as SortField, label: "Prize" },
                    { field: "matchCount" as SortField, label: "Matches" },
                    { field: "drawId" as SortField, label: "Draw #" },
                  ] as const
                ).map(({ field, label }) => (
                  <button
                    key={field}
                    type="button"
                    onClick={() => handleSort(field)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${
                      sortField === field
                        ? "bg-emerald/15 text-emerald-light border border-emerald/20"
                        : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                    }`}
                  >
                    {label}
                    {sortField === field && (
                      <span className="text-[9px]">
                        {sortDir === "desc" ? "↓" : "↑"}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Results count */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Showing{" "}
              <span className="font-bold text-foreground">
                {filteredTickets.length}
              </span>{" "}
              ticket{filteredTickets.length !== 1 ? "s" : ""}
              {searchQuery && (
                <span>
                  {" "}
                  matching &ldquo;
                  <span className="text-emerald-light">{searchQuery}</span>
                  &rdquo;
                </span>
              )}
            </p>
            {filteredTickets.length > 0 && (
              <button
                type="button"
                onClick={() => setExpandedTicket(null)}
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Collapse all
              </button>
            )}
          </div>

          {/* Tickets List */}
          {filteredTickets.length === 0 ? (
            <EmptyState filter={filter} />
          ) : (
            <div className="space-y-2">
              {filteredTickets.map((ticket) => (
                <TicketRow
                  key={ticket.id}
                  ticket={ticket}
                  onClaim={handleClaim}
                  expanded={expandedTicket === ticket.id}
                  onToggleExpand={() =>
                    setExpandedTicket((prev) =>
                      prev === ticket.id ? null : ticket.id,
                    )
                  }
                />
              ))}
            </div>
          )}

          {/* Bottom info */}
          <div className="glass rounded-2xl p-5 sm:p-6">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2 mb-4">
              <Shield size={16} className="text-emerald" />
              Ticket Information
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <h4 className="text-xs font-semibold text-foreground mb-1 flex items-center gap-1.5">
                  <Clock size={11} className="text-muted-foreground" />
                  Prize Expiry
                </h4>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Unclaimed prizes expire 30 days after the draw. Expired prizes
                  are returned to the prize pool. Claim as soon as possible!
                </p>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-foreground mb-1 flex items-center gap-1.5">
                  <Sparkles size={11} className="text-gold" />
                  Free Ticket Credits
                </h4>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Match 2 numbers in the 6/46 lottery to earn a free ticket
                  credit. Use it on your next purchase to save $2.50 USDC. Quick
                  Pick Express does not award free tickets.
                </p>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-foreground mb-1 flex items-center gap-1.5">
                  <TrendingUp size={11} className="text-emerald" />
                  Rolldown Prizes
                </h4>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  During rolldown events, prizes transition to pari-mutuel mode.
                  Match 3+ prizes are calculated as Pool &divide; Winners, which
                  can be significantly higher than fixed prizes.
                </p>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-foreground/5 flex flex-wrap items-center gap-4 text-[10px] text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Shield size={10} className="text-emerald/60" />
                <span>All tickets stored on-chain</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Eye size={10} className="text-emerald/60" />
                <span>Verifiable on Solana Explorer</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Shield size={10} className="text-emerald/60" />
                <span>Non-custodial prize claiming</span>
              </div>
              <Link
                to="/results"
                className="flex items-center gap-1.5 text-emerald-light hover:text-emerald transition-colors"
              >
                <ExternalLink size={10} />
                <span className="font-semibold">View Draw Results</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
