import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import {
  Users,
  Plus,
  Trophy,
  TrendingUp,
  ChevronRight,
  Search,
  Filter,
  Shield,
  Crown,
  Lock,
  Unlock,
  ArrowUpDown,
  Wallet,
  BarChart3,
  Target,
  Clock,
  Sparkles,
  UserPlus,
  Settings,
  AlertTriangle,
  Check,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FloatingBalls } from "@/components/LotteryBalls";
import Footer from "@/components/Footer";

export const Route = createFileRoute("/syndicates")({
  component: SyndicatesPage,
});

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

interface Syndicate {
  id: string;
  name: string;
  creator: string;
  creatorShort: string;
  members: number;
  maxMembers: number;
  totalTickets: number;
  totalWinnings: number;
  isPublic: boolean;
  managerFeeBps: number;
  activeSince: string;
  ticketsThisDraw: number;
  drawsParticipated: number;
  winRate: number;
  tags: string[];
}

type SortField = "members" | "totalWinnings" | "totalTickets" | "winRate";
type SortDir = "asc" | "desc";
type FilterVisibility = "all" | "public" | "private";

/* -------------------------------------------------------------------------- */
/*  Mock Data                                                                 */
/* -------------------------------------------------------------------------- */

const MOCK_SYNDICATES: Syndicate[] = [
  {
    id: "syn_001",
    name: "Diamond Hands Lotto Club",
    creator: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    creatorShort: "7xKX...AsU",
    members: 47,
    maxMembers: 50,
    totalTickets: 2_840,
    totalWinnings: 14_230,
    isPublic: true,
    managerFeeBps: 200,
    activeSince: "2025-03-15",
    ticketsThisDraw: 120,
    drawsParticipated: 89,
    winRate: 72.4,
    tags: ["Top Earner", "Active"],
  },
  {
    id: "syn_002",
    name: "Solana Whales Pool",
    creator: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
    creatorShort: "4zMM...cDU",
    members: 50,
    maxMembers: 50,
    totalTickets: 5_100,
    totalWinnings: 28_750,
    isPublic: false,
    managerFeeBps: 300,
    activeSince: "2025-02-01",
    ticketsThisDraw: 200,
    drawsParticipated: 142,
    winRate: 81.2,
    tags: ["Full", "Premium"],
  },
  {
    id: "syn_003",
    name: "EV Maximizers",
    creator: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
    creatorShort: "9WzD...WWM",
    members: 23,
    maxMembers: 100,
    totalTickets: 1_560,
    totalWinnings: 7_890,
    isPublic: true,
    managerFeeBps: 150,
    activeSince: "2025-04-10",
    ticketsThisDraw: 85,
    drawsParticipated: 54,
    winRate: 64.8,
    tags: ["Strategy", "Rolldown Focus"],
  },
  {
    id: "syn_004",
    name: "Lucky Degens United",
    creator: "HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH",
    creatorShort: "HN7c...WrH",
    members: 15,
    maxMembers: 25,
    totalTickets: 890,
    totalWinnings: 3_210,
    isPublic: true,
    managerFeeBps: 100,
    activeSince: "2025-05-20",
    ticketsThisDraw: 42,
    drawsParticipated: 28,
    winRate: 53.6,
    tags: ["New", "Low Fee"],
  },
  {
    id: "syn_005",
    name: "Rolldown Raiders",
    creator: "3Kn9gVkdA6RqYCbxPxtaeo8N5FpDHzrKuxGMaUVAVoqh",
    creatorShort: "3Kn9...oqh",
    members: 38,
    maxMembers: 40,
    totalTickets: 3_400,
    totalWinnings: 19_450,
    isPublic: true,
    managerFeeBps: 250,
    activeSince: "2025-01-28",
    ticketsThisDraw: 150,
    drawsParticipated: 168,
    winRate: 76.8,
    tags: ["Veteran", "Rolldown Focus"],
  },
  {
    id: "syn_006",
    name: "Moonshot Collective",
    creator: "BYR3k8mFxQJvN3nZqKGkGRuFmZch8dHo6QAL9qU6LBFR",
    creatorShort: "BYR3...BFR",
    members: 8,
    maxMembers: 20,
    totalTickets: 320,
    totalWinnings: 960,
    isPublic: true,
    managerFeeBps: 100,
    activeSince: "2025-06-01",
    ticketsThisDraw: 16,
    drawsParticipated: 12,
    winRate: 41.7,
    tags: ["New", "Small Group"],
  },
  {
    id: "syn_007",
    name: "Alpha Lottery DAO",
    creator: "FwpGN4XoL3xJ4jvSJfz7YKMV8RKDcQbWyYT1bUfGFxkA",
    creatorShort: "FwpG...xkA",
    members: 50,
    maxMembers: 50,
    totalTickets: 6_200,
    totalWinnings: 35_800,
    isPublic: false,
    managerFeeBps: 350,
    activeSince: "2025-01-10",
    ticketsThisDraw: 250,
    drawsParticipated: 195,
    winRate: 84.6,
    tags: ["Full", "Top Earner", "Premium"],
  },
  {
    id: "syn_008",
    name: "Community Pool #1",
    creator: "2XG1v7jJKvDaKjFhm5psN2aVz8g3v4TkGrJkecLqWt3d",
    creatorShort: "2XG1...t3d",
    members: 31,
    maxMembers: 75,
    totalTickets: 2_100,
    totalWinnings: 11_200,
    isPublic: true,
    managerFeeBps: 0,
    activeSince: "2025-03-01",
    ticketsThisDraw: 95,
    drawsParticipated: 110,
    winRate: 68.2,
    tags: ["No Fee", "Community"],
  },
];

const SYNDICATE_WARS_SEASON = {
  season: 3,
  endsIn: "4 days",
  topSyndicate: "Alpha Lottery DAO",
  prizePool: 12_500,
  participants: 24,
};

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                            */
/* -------------------------------------------------------------------------- */

function SyndicateCard({
  syndicate,
  onJoin,
}: {
  syndicate: Syndicate;
  onJoin: (id: string) => void;
}) {
  const isFull = syndicate.members >= syndicate.maxMembers;
  const fillPercent = (syndicate.members / syndicate.maxMembers) * 100;

  return (
    <div className="group glass rounded-2xl p-5 transition-all duration-300 hover:border-emerald/20 hover:shadow-lg hover:shadow-emerald/5">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3 min-w-0">
          {/* Avatar */}
          <div
            className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm ${
              syndicate.totalWinnings >= 20_000
                ? "bg-gradient-to-br from-gold/30 to-gold-dark/20 text-gold border border-gold/20"
                : syndicate.totalWinnings >= 10_000
                  ? "bg-gradient-to-br from-emerald/20 to-emerald-dark/10 text-emerald-light border border-emerald/20"
                  : "bg-white/[0.04] text-gray-400 border border-white/[0.06]"
            }`}
          >
            {syndicate.name.charAt(0)}
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-white truncate group-hover:text-emerald-light transition-colors">
              {syndicate.name}
            </h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] text-gray-500 font-mono">
                by {syndicate.creatorShort}
              </span>
              {!syndicate.isPublic && (
                <Lock size={9} className="text-gray-500" />
              )}
            </div>
          </div>
        </div>

        {/* Tags */}
        <div className="flex items-center gap-1 shrink-0">
          {syndicate.tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider ${
                tag === "Top Earner"
                  ? "bg-gold/15 text-gold border border-gold/20"
                  : tag === "Full"
                    ? "bg-red-500/10 text-red-400 border border-red-500/20"
                    : tag === "New"
                      ? "bg-emerald/10 text-emerald-light border border-emerald/20"
                      : tag === "No Fee"
                        ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                        : "bg-white/5 text-gray-400 border border-white/[0.06]"
              }`}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">
            Winnings
          </div>
          <div className="text-sm font-bold text-gradient-gold">
            ${syndicate.totalWinnings.toLocaleString()}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">
            Win Rate
          </div>
          <div className="text-sm font-bold text-emerald-light">
            {syndicate.winRate}%
          </div>
        </div>
        <div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">
            This Draw
          </div>
          <div className="text-sm font-bold text-white">
            {syndicate.ticketsThisDraw}
            <span className="text-[10px] text-gray-500 font-normal ml-0.5">
              tix
            </span>
          </div>
        </div>
      </div>

      {/* Members bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-[10px] mb-1.5">
          <span className="text-gray-500 flex items-center gap-1">
            <Users size={10} />
            Members
          </span>
          <span
            className={`font-bold ${isFull ? "text-red-400" : "text-white"}`}
          >
            {syndicate.members}/{syndicate.maxMembers}
          </span>
        </div>
        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              isFull
                ? "bg-gradient-to-r from-red-500 to-red-400"
                : fillPercent >= 80
                  ? "bg-gradient-to-r from-gold-dark to-gold"
                  : "bg-gradient-to-r from-emerald-dark to-emerald"
            }`}
            style={{ width: `${fillPercent}%` }}
          />
        </div>
      </div>

      {/* Meta info row */}
      <div className="flex items-center justify-between text-[10px] text-gray-500 mb-4">
        <span>
          {syndicate.drawsParticipated} draws &bull;{" "}
          {syndicate.totalTickets.toLocaleString()} total tickets
        </span>
        <span>
          Fee:{" "}
          {syndicate.managerFeeBps === 0
            ? "None"
            : `${syndicate.managerFeeBps / 100}%`}
        </span>
      </div>

      {/* Action */}
      {isFull ? (
        <Button
          variant="outline"
          className="w-full h-9 text-xs font-semibold border-white/10 text-gray-400 cursor-not-allowed"
          disabled
        >
          <Lock size={12} />
          Full
        </Button>
      ) : !syndicate.isPublic ? (
        <Button
          variant="outline"
          className="w-full h-9 text-xs font-semibold border-gold/20 text-gold hover:bg-gold/5 hover:border-gold/40"
        >
          <Lock size={12} />
          Request Invite
        </Button>
      ) : (
        <Button
          onClick={() => onJoin(syndicate.id)}
          className="w-full h-9 text-xs font-bold bg-gradient-to-r from-emerald to-emerald-dark hover:from-emerald-light hover:to-emerald text-white rounded-xl shadow-md shadow-emerald/15 hover:shadow-emerald/30 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
        >
          <UserPlus size={12} />
          Join Syndicate
        </Button>
      )}
    </div>
  );
}

function SyndicateWarsBanner() {
  return (
    <div className="relative glass-strong rounded-2xl p-5 sm:p-6 overflow-hidden border border-gold/15">
      <div className="absolute inset-0 bg-gradient-to-br from-gold/[0.04] via-transparent to-emerald/[0.03]" />
      <div className="absolute top-0 right-0 w-48 h-48 bg-glow-gold opacity-20" />

      <div className="relative z-10">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <div className="p-1.5 rounded-lg bg-gold/15 border border-gold/20">
                <Crown size={16} className="text-gold" />
              </div>
              <span className="text-[10px] font-bold text-gold uppercase tracking-wider">
                Syndicate Wars &bull; Season {SYNDICATE_WARS_SEASON.season}
              </span>
            </div>
            <h3 className="text-lg font-black text-white mb-1">
              Compete for{" "}
              <span className="text-gradient-gold">
                ${SYNDICATE_WARS_SEASON.prizePool.toLocaleString()}
              </span>{" "}
              Prize Pool
            </h3>
            <p className="text-xs text-gray-400 max-w-lg">
              Syndicates compete based on total winnings, tickets purchased, and
              member engagement. Top 3 syndicates share the prize pool.
            </p>
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs">
              <Clock size={12} className="text-gray-500" />
              <span className="text-gray-400">
                Ends in{" "}
                <span className="font-bold text-white">
                  {SYNDICATE_WARS_SEASON.endsIn}
                </span>
              </span>
            </div>
            <div className="flex items-center gap-4 text-[10px] text-gray-500">
              <span>
                <span className="font-bold text-white">
                  {SYNDICATE_WARS_SEASON.participants}
                </span>{" "}
                syndicates competing
              </span>
              <span>
                Leading:{" "}
                <span className="font-bold text-gold">
                  {SYNDICATE_WARS_SEASON.topSyndicate}
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CreateSyndicateModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [maxMembers, setMaxMembers] = useState("25");
  const [isPublic, setIsPublic] = useState(true);
  const [managerFee, setManagerFee] = useState("2");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
        role="button"
        tabIndex={0}
        aria-label="Close modal"
      />

      {/* Modal */}
      <div className="relative glass-strong rounded-2xl p-6 sm:p-8 max-w-md w-full border border-emerald/20 shadow-2xl shadow-black/50 animate-slide-up">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald/15 border border-emerald/20">
              <Plus size={16} className="text-emerald-light" />
            </div>
            <h2 className="text-lg font-bold text-white">Create Syndicate</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <label
              htmlFor="syndicate-name"
              className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5"
            >
              Syndicate Name
            </label>
            <input
              id="syndicate-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Diamond Hands Club"
              maxLength={32}
              className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald/40 focus:ring-1 focus:ring-emerald/20 transition-colors"
            />
            <p className="text-[10px] text-gray-600 mt-1">
              {name.length}/32 characters
            </p>
          </div>

          {/* Max Members */}
          <div>
            <label
              htmlFor="max-members"
              className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5"
            >
              Max Members
            </label>
            <input
              id="max-members"
              type="number"
              value={maxMembers}
              onChange={(e) => setMaxMembers(e.target.value)}
              min={2}
              max={100}
              className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald/40 focus:ring-1 focus:ring-emerald/20 transition-colors"
            />
            <p className="text-[10px] text-gray-600 mt-1">
              Between 2 and 100 members
            </p>
          </div>

          {/* Manager Fee */}
          <div>
            <label
              htmlFor="manager-fee"
              className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5"
            >
              Manager Fee (%)
            </label>
            <input
              id="manager-fee"
              type="number"
              value={managerFee}
              onChange={(e) => setManagerFee(e.target.value)}
              min={0}
              max={10}
              step={0.5}
              className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald/40 focus:ring-1 focus:ring-emerald/20 transition-colors"
            />
            <p className="text-[10px] text-gray-600 mt-1">
              Fee taken from syndicate prize winnings (0-10%)
            </p>
          </div>

          {/* Visibility */}
          <div>
            <span className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Visibility
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsPublic(true)}
                className={`flex-1 h-10 rounded-xl flex items-center justify-center gap-2 text-xs font-semibold transition-all ${
                  isPublic
                    ? "bg-emerald/15 border border-emerald/30 text-emerald-light"
                    : "bg-white/[0.03] border border-white/[0.06] text-gray-500 hover:bg-white/[0.05]"
                }`}
              >
                <Unlock size={12} />
                Public
              </button>
              <button
                type="button"
                onClick={() => setIsPublic(false)}
                className={`flex-1 h-10 rounded-xl flex items-center justify-center gap-2 text-xs font-semibold transition-all ${
                  !isPublic
                    ? "bg-gold/15 border border-gold/30 text-gold"
                    : "bg-white/[0.03] border border-white/[0.06] text-gray-500 hover:bg-white/[0.05]"
                }`}
              >
                <Lock size={12} />
                Private
              </button>
            </div>
            <p className="text-[10px] text-gray-600 mt-1.5">
              {isPublic
                ? "Anyone can join your syndicate"
                : "Members need an invite to join"}
            </p>
          </div>

          {/* Info */}
          <div className="flex items-start gap-2 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
            <AlertTriangle size={12} className="text-gold/60 mt-0.5 shrink-0" />
            <p className="text-[10px] text-gray-500">
              Creating a syndicate requires a wallet connection. You&apos;ll
              need to sign a transaction to create the on-chain syndicate
              account.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 mt-6">
          <Button
            variant="ghost"
            onClick={onClose}
            className="flex-1 h-10 text-sm text-gray-400 hover:text-white"
          >
            Cancel
          </Button>
          <Button
            disabled={!name.trim()}
            className="flex-1 h-10 text-sm font-bold bg-gradient-to-r from-emerald to-emerald-dark hover:from-emerald-light hover:to-emerald text-white rounded-xl shadow-lg shadow-emerald/20 disabled:opacity-40 disabled:shadow-none transition-all"
          >
            <Wallet size={14} />
            Connect & Create
          </Button>
        </div>
      </div>
    </div>
  );
}

function StatsBar() {
  const stats = [
    {
      label: "Active Syndicates",
      value: "142",
      icon: Users,
      color: "text-emerald-light",
    },
    {
      label: "Total Members",
      value: "3,847",
      icon: UserPlus,
      color: "text-white",
    },
    {
      label: "Combined Winnings",
      value: "$487K",
      icon: Trophy,
      color: "text-gold",
    },
    {
      label: "Avg Win Rate",
      value: "67.3%",
      icon: TrendingUp,
      color: "text-emerald-light",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <div
            key={stat.label}
            className="glass rounded-xl p-3 sm:p-4 text-center"
          >
            <Icon
              size={16}
              className={`${stat.color} mx-auto mb-1.5 opacity-70`}
            />
            <div className={`text-lg sm:text-xl font-black ${stat.color}`}>
              {stat.value}
            </div>
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">
              {stat.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main Component                                                            */
/* -------------------------------------------------------------------------- */

function SyndicatesPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("totalWinnings");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filterVisibility, setFilterVisibility] =
    useState<FilterVisibility>("all");
  const [showCreateModal, setShowCreateModal] = useState(false);

  const filteredSyndicates = useMemo(() => {
    let result = [...MOCK_SYNDICATES];

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.creator.toLowerCase().includes(q) ||
          s.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }

    // Visibility filter
    if (filterVisibility === "public") {
      result = result.filter((s) => s.isPublic);
    } else if (filterVisibility === "private") {
      result = result.filter((s) => !s.isPublic);
    }

    // Sort
    result.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      return sortDir === "desc"
        ? (bVal as number) - (aVal as number)
        : (aVal as number) - (bVal as number);
    });

    return result;
  }, [searchQuery, sortField, sortDir, filterVisibility]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const handleJoin = (id: string) => {
    alert(
      `Wallet connection required to join syndicate ${id}. Connect your wallet to proceed.`,
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* ================================================================ */}
      {/*  HERO                                                            */}
      {/* ================================================================ */}
      <section className="relative pt-24 pb-8 sm:pt-28 sm:pb-12 px-4 sm:px-6 lg:px-8 overflow-hidden">
        <div className="absolute inset-0 hero-grid opacity-30" />
        <div className="absolute inset-0 bg-glow-emerald opacity-15" />
        <FloatingBalls count={4} />

        <div className="relative z-10 max-w-7xl mx-auto">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-xs text-gray-500 mb-6">
            <Link to="/" className="hover:text-white transition-colors">
              Home
            </Link>
            <ChevronRight size={12} />
            <span className="text-emerald-light font-medium">Syndicates</span>
          </nav>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-xl bg-gradient-to-br from-emerald/20 to-emerald-dark/10 border border-emerald/20">
                  <Users size={24} className="text-emerald-light" />
                </div>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                    Syndicates
                  </h1>
                  <p className="text-sm text-gray-400 mt-0.5">
                    Pool resources with other players &bull; Share tickets
                    &bull; Split winnings
                  </p>
                </div>
              </div>
            </div>

            <Button
              onClick={() => setShowCreateModal(true)}
              className="h-11 px-6 bg-gradient-to-r from-emerald to-emerald-dark hover:from-emerald-light hover:to-emerald text-white font-bold rounded-xl shadow-lg shadow-emerald/25 hover:shadow-emerald/40 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
            >
              <Plus size={16} />
              Create Syndicate
            </Button>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/*  MAIN CONTENT                                                    */}
      {/* ================================================================ */}
      <section className="relative px-4 sm:px-6 lg:px-8 pb-16">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Stats */}
          <StatsBar />

          {/* Syndicate Wars Banner */}
          <SyndicateWarsBanner />

          {/* Filters & Search */}
          <div className="glass rounded-2xl p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              {/* Search */}
              <div className="relative flex-1 w-full">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search syndicates by name, address, or tag..."
                  className="w-full h-9 pl-9 pr-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald/40 focus:ring-1 focus:ring-emerald/20 transition-colors"
                />
              </div>

              {/* Visibility filter */}
              <div className="flex items-center gap-1">
                <Filter size={12} className="text-gray-500 mr-1" />
                {(["all", "public", "private"] as FilterVisibility[]).map(
                  (vis) => (
                    <button
                      key={vis}
                      type="button"
                      onClick={() => setFilterVisibility(vis)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        filterVisibility === vis
                          ? "bg-emerald/15 text-emerald-light border border-emerald/20"
                          : "text-gray-500 hover:text-white hover:bg-white/5"
                      }`}
                    >
                      {vis === "all"
                        ? "All"
                        : vis === "public"
                          ? "Public"
                          : "Private"}
                    </button>
                  ),
                )}
              </div>

              {/* Sort */}
              <div className="flex items-center gap-1">
                <ArrowUpDown size={12} className="text-gray-500 mr-1" />
                {(
                  [
                    { field: "totalWinnings" as SortField, label: "Winnings" },
                    { field: "members" as SortField, label: "Members" },
                    { field: "winRate" as SortField, label: "Win Rate" },
                    { field: "totalTickets" as SortField, label: "Tickets" },
                  ] as const
                ).map(({ field, label }) => (
                  <button
                    key={field}
                    type="button"
                    onClick={() => handleSort(field)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${
                      sortField === field
                        ? "bg-emerald/15 text-emerald-light border border-emerald/20"
                        : "text-gray-500 hover:text-white hover:bg-white/5"
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
            <p className="text-xs text-gray-500">
              Showing{" "}
              <span className="font-bold text-white">
                {filteredSyndicates.length}
              </span>{" "}
              syndicate{filteredSyndicates.length !== 1 ? "s" : ""}
              {searchQuery && (
                <span>
                  {" "}
                  matching &ldquo;
                  <span className="text-emerald-light">{searchQuery}</span>
                  &rdquo;
                </span>
              )}
            </p>
          </div>

          {/* Syndicate Grid */}
          {filteredSyndicates.length === 0 ? (
            <div className="glass rounded-2xl p-12 text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/[0.06] mb-4">
                <Search size={24} className="text-gray-600" />
              </div>
              <p className="text-sm text-gray-400 mb-1">No syndicates found</p>
              <p className="text-xs text-gray-600 mb-4">
                Try adjusting your search or filter criteria
              </p>
              <Button
                onClick={() => {
                  setSearchQuery("");
                  setFilterVisibility("all");
                }}
                variant="outline"
                size="sm"
                className="text-xs border-emerald/20 text-emerald-light hover:bg-emerald/5"
              >
                Clear Filters
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredSyndicates.map((syndicate) => (
                <SyndicateCard
                  key={syndicate.id}
                  syndicate={syndicate}
                  onJoin={handleJoin}
                />
              ))}
            </div>
          )}

          {/* How Syndicates Work */}
          <div className="glass rounded-2xl p-6 sm:p-8 mt-8">
            <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
              <Sparkles size={18} className="text-gold" />
              How Syndicates Work
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                {
                  step: "1",
                  title: "Join or Create",
                  description:
                    "Browse public syndicates or create your own with custom rules and member limits.",
                  icon: UserPlus,
                },
                {
                  step: "2",
                  title: "Pool Resources",
                  description:
                    "Members contribute USDC. The syndicate manager buys bulk tickets for better coverage.",
                  icon: Target,
                },
                {
                  step: "3",
                  title: "Play Together",
                  description:
                    "More tickets = better odds. During rolldown events, your combined buying power maximizes +EV.",
                  icon: TrendingUp,
                },
                {
                  step: "4",
                  title: "Share Winnings",
                  description:
                    "Prizes are automatically distributed proportionally to each member's contribution, minus the manager fee.",
                  icon: Trophy,
                },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.step} className="relative">
                    <div className="flex items-center gap-2.5 mb-2">
                      <div className="w-7 h-7 rounded-lg bg-emerald/15 border border-emerald/20 flex items-center justify-center text-xs font-black text-emerald-light">
                        {item.step}
                      </div>
                      <Icon size={14} className="text-emerald/60" />
                    </div>
                    <h3 className="text-sm font-bold text-white mb-1">
                      {item.title}
                    </h3>
                    <p className="text-xs text-gray-500 leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 pt-4 border-t border-white/5 flex flex-wrap items-center gap-4 text-[10px] text-gray-500">
              <div className="flex items-center gap-1.5">
                <Shield size={10} className="text-emerald/60" />
                <span>Fully on-chain &bull; Non-custodial</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Check size={10} className="text-emerald/60" />
                <span>Automatic prize distribution</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Settings size={10} className="text-emerald/60" />
                <span>Configurable manager fees (0-10%)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <BarChart3 size={10} className="text-emerald/60" />
                <span>Transparent on-chain accounting</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Create Modal */}
      <CreateSyndicateModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />

      <Footer />
    </div>
  );
}
