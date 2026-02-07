import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useCallback, useMemo } from "react";
import {
  Zap,
  Trophy,
  Shuffle,
  Trash2,
  Plus,
  ShoppingCart,
  Wallet,
  Info,
  ChevronRight,
  Sparkles,
  TrendingUp,
  Clock,
  Star,
  RotateCcw,
  Check,
  AlertTriangle,
  Lock,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { JackpotDisplay } from "@/components/JackpotDisplay";
import { QuickPickCountdown } from "@/components/CountdownTimer";
import { LotteryBallRow, FloatingBalls } from "@/components/LotteryBalls";
import Footer from "@/components/Footer";

export const Route = createFileRoute("/play/quick-pick")({
  component: PlayQuickPickExpress,
});

/* -------------------------------------------------------------------------- */
/*  Constants                                                                 */
/* -------------------------------------------------------------------------- */

const TOTAL_NUMBERS = 35;
const PICK_COUNT = 5;
const TICKET_PRICE = 1.5;
const MAX_TICKETS = 20;
const LIFETIME_GATE = 50; // $50 lifetime spend required

const PRIZE_TIERS = [
  { match: 5, prize: "Jackpot", odds: "1 in 324,632", color: "gold" as const },
  { match: 4, prize: "$100", odds: "1 in 2,164", color: "emerald" as const },
  { match: 3, prize: "$4", odds: "1 in 75", color: "emerald" as const },
  { match: 2, prize: "—", odds: "1 in 8.6", color: "muted" as const },
];

const ROLLDOWN_TIERS = [
  {
    match: 4,
    share: "60%",
    estimate: "~$3,247",
    color: "emerald" as const,
  },
  {
    match: 3,
    share: "40%",
    estimate: "~$75",
    color: "emerald" as const,
  },
];

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function generateQuickPick(): number[] {
  const nums = new Set<number>();
  while (nums.size < PICK_COUNT) {
    nums.add(Math.floor(Math.random() * TOTAL_NUMBERS) + 1);
  }
  return Array.from(nums).sort((a, b) => a - b);
}

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                            */
/* -------------------------------------------------------------------------- */

interface NumberGridProps {
  selected: Set<number>;
  onToggle: (n: number) => void;
  disabled?: boolean;
}

function NumberGrid({ selected, onToggle, disabled }: NumberGridProps) {
  return (
    <div className="grid grid-cols-7 sm:grid-cols-7 gap-1.5 sm:gap-2">
      {Array.from({ length: TOTAL_NUMBERS }, (_, i) => i + 1).map((num) => {
        const isSelected = selected.has(num);
        const isFull = selected.size >= PICK_COUNT && !isSelected;

        return (
          <button
            key={num}
            type="button"
            disabled={disabled || isFull}
            onClick={() => onToggle(num)}
            className={`
              relative aspect-square rounded-xl flex items-center justify-center
              text-sm sm:text-base font-bold transition-all duration-200
              select-none cursor-pointer
              ${
                isSelected
                  ? "bg-gradient-to-br from-emerald-light to-emerald text-white shadow-lg shadow-emerald/30 scale-105 ring-2 ring-emerald-light/50"
                  : isFull
                    ? "bg-white/[0.02] text-gray-600 cursor-not-allowed border border-white/[0.03]"
                    : "bg-white/[0.04] text-gray-300 border border-white/[0.06] hover:bg-white/[0.08] hover:border-emerald/30 hover:text-white hover:scale-105 active:scale-95"
              }
            `}
          >
            {num}
            {isSelected && (
              <div className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-gold flex items-center justify-center">
                <Check size={8} className="text-navy" />
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

interface TicketCardProps {
  numbers: number[];
  index: number;
  onRemove: () => void;
  isQuickPick?: boolean;
}

function TicketCard({
  numbers,
  index,
  onRemove,
  isQuickPick,
}: TicketCardProps) {
  return (
    <div className="group relative glass rounded-xl p-3 sm:p-4 transition-all hover:border-emerald/20">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
            Ticket #{index + 1}
          </span>
          {isQuickPick && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald/10 border border-emerald/20 text-[9px] font-semibold text-emerald-light uppercase tracking-wider">
              <Zap size={8} />
              Quick Pick
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
          aria-label="Remove ticket"
        >
          <Trash2 size={14} />
        </button>
      </div>
      <div className="flex items-center gap-1.5">
        {numbers.map((num, i) => (
          <div
            key={`${num}-${i}`}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-xs sm:text-sm font-bold bg-gradient-to-br from-emerald-light/20 to-emerald/10 border border-emerald/20 text-emerald-light"
          >
            {num}
          </div>
        ))}
      </div>
    </div>
  );
}

function GateLockedOverlay({
  lifetimeSpend,
}: {
  lifetimeSpend: number;
}) {
  const remaining = LIFETIME_GATE - lifetimeSpend;
  const progress = Math.min((lifetimeSpend / LIFETIME_GATE) * 100, 100);

  return (
    <div className="relative glass-strong rounded-2xl p-8 sm:p-12 text-center border border-gold/20 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-glow-gold opacity-10" />

      <div className="relative z-10">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gold/10 border border-gold/20 mb-5">
          <Lock size={28} className="text-gold" />
        </div>

        <h2 className="text-xl sm:text-2xl font-black text-white mb-2">
          Quick Pick Express Locked
        </h2>
        <p className="text-sm text-gray-400 max-w-md mx-auto mb-6">
          You need to spend at least{" "}
          <span className="font-bold text-gold">${LIFETIME_GATE}</span> in the
          main 6/46 lottery to unlock Quick Pick Express.
        </p>

        {/* Progress */}
        <div className="max-w-xs mx-auto mb-6">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-gray-500">Your lifetime spend</span>
            <span className="font-bold text-gold">
              ${lifetimeSpend.toFixed(2)} / ${LIFETIME_GATE}
            </span>
          </div>
          <div className="h-2 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-gold-dark to-gold transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-[10px] text-gray-600 mt-1.5">
            ${remaining.toFixed(2)} more to unlock
          </p>
        </div>

        <Link
          to="/play"
          className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald to-emerald-dark hover:from-emerald-light hover:to-emerald text-white font-bold rounded-xl shadow-lg shadow-emerald/25 hover:shadow-emerald/40 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] text-sm"
        >
          <Trophy size={16} />
          Play 6/46 Main Lottery
          <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main Component                                                            */
/* -------------------------------------------------------------------------- */

function PlayQuickPickExpress() {
  const [selectedNumbers, setSelectedNumbers] = useState<Set<number>>(
    new Set(),
  );
  const [tickets, setTickets] = useState<
    { numbers: number[]; isQuickPick: boolean }[]
  >([]);
  const [showPrizeInfo, setShowPrizeInfo] = useState(false);
  const [showRolldownInfo, setShowRolldownInfo] = useState(false);

  // Mock state
  const walletConnected = false;
  const mockJackpot = 18_420;
  const mockLifetimeSpend = 72.5; // Above the $50 gate for demo
  const isUnlocked = mockLifetimeSpend >= LIFETIME_GATE;
  const rolldownActive = mockJackpot >= 30_000;

  const totalCost = useMemo(
    () => tickets.length * TICKET_PRICE,
    [tickets.length],
  );

  const toggleNumber = useCallback((num: number) => {
    setSelectedNumbers((prev) => {
      const next = new Set(prev);
      if (next.has(num)) {
        next.delete(num);
      } else if (next.size < PICK_COUNT) {
        next.add(num);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedNumbers(new Set());
  }, []);

  const addManualTicket = useCallback(() => {
    if (selectedNumbers.size !== PICK_COUNT) return;
    if (tickets.length >= MAX_TICKETS) return;

    const sorted = Array.from(selectedNumbers).sort((a, b) => a - b);
    setTickets((prev) => [...prev, { numbers: sorted, isQuickPick: false }]);
    setSelectedNumbers(new Set());
  }, [selectedNumbers, tickets.length]);

  const addQuickPick = useCallback(
    (count: number = 1) => {
      const available = MAX_TICKETS - tickets.length;
      const toAdd = Math.min(count, available);
      if (toAdd <= 0) return;

      const newTickets = Array.from({ length: toAdd }, () => ({
        numbers: generateQuickPick(),
        isQuickPick: true,
      }));
      setTickets((prev) => [...prev, ...newTickets]);
    },
    [tickets.length],
  );

  const removeTicket = useCallback((index: number) => {
    setTickets((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearAllTickets = useCallback(() => {
    setTickets([]);
  }, []);

  const handleCheckout = useCallback(() => {
    alert(
      walletConnected
        ? `Purchasing ${tickets.length} Quick Pick Express ticket(s) for $${totalCost.toFixed(2)} USDC`
        : "Wallet connection flow would open here",
    );
  }, [walletConnected, tickets.length, totalCost]);

  return (
    <div className="min-h-screen bg-background">
      {/* ================================================================ */}
      {/*  HERO BANNER                                                     */}
      {/* ================================================================ */}
      <section className="relative pt-24 pb-8 sm:pt-28 sm:pb-12 px-4 sm:px-6 lg:px-8 overflow-hidden">
        <div className="absolute inset-0 hero-grid opacity-30" />
        <div className="absolute inset-0 bg-glow-emerald opacity-15" />
        <div className="absolute inset-0 bg-glow-gold opacity-10" />
        <FloatingBalls count={4} />

        <div className="relative z-10 max-w-7xl mx-auto">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-xs text-gray-500 mb-6">
            <Link to="/" className="hover:text-white transition-colors">
              Home
            </Link>
            <ChevronRight size={12} />
            <Link to="/play" className="hover:text-white transition-colors">
              Play
            </Link>
            <ChevronRight size={12} />
            <span className="text-emerald-light font-medium">
              Quick Pick Express
            </span>
          </nav>

          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-xl bg-gradient-to-br from-emerald/20 to-gold/10 border border-emerald/20">
                  <Zap size={24} className="text-emerald-light" />
                </div>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                    Quick Pick Express
                    <span className="ml-2 text-sm font-bold text-gold bg-gold/10 px-2 py-0.5 rounded-full border border-gold/20 align-middle">
                      5/35
                    </span>
                  </h1>
                  <p className="text-sm text-gray-400 mt-0.5">
                    Pick 5 numbers from 1-35 &bull; Draws every 4 hours &bull;
                    $1.50/ticket
                  </p>
                </div>
              </div>

              {/* Status badges */}
              <div className="flex flex-wrap items-center gap-2 mt-3">
                {rolldownActive ? (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald/15 border border-emerald/30">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald animate-pulse" />
                    <span className="text-xs font-semibold text-emerald-light">
                      Rolldown Active — +66.7% EV
                    </span>
                    <TrendingUp size={12} className="text-emerald-light" />
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10">
                    <div className="w-1.5 h-1.5 rounded-full bg-gray-500" />
                    <span className="text-xs font-medium text-gray-400">
                      Normal Mode
                    </span>
                  </div>
                )}
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gold/10 border border-gold/20">
                  <span className="text-xs font-semibold text-gold">
                    ${TICKET_PRICE.toFixed(2)} USDC / ticket
                  </span>
                </div>
                {isUnlocked ? (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald/10 border border-emerald/20">
                    <Check size={10} className="text-emerald-light" />
                    <span className="text-xs font-semibold text-emerald-light">
                      Unlocked
                    </span>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20">
                    <Lock size={10} className="text-red-400" />
                    <span className="text-xs font-semibold text-red-400">
                      Requires $50 spend
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Jackpot & Countdown */}
            <div className="flex flex-col sm:flex-row items-center gap-4 lg:gap-6">
              <JackpotDisplay
                amount={mockJackpot}
                size="sm"
                glow
                showRolldownStatus={false}
                softCap={30_000}
                label="Quick Pick Jackpot"
              />
              <div className="flex flex-col items-center gap-1">
                <QuickPickCountdown size="sm" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/*  MAIN CONTENT                                                    */}
      {/* ================================================================ */}
      <section className="relative px-4 sm:px-6 lg:px-8 pb-16">
        <div className="max-w-7xl mx-auto">
          {!isUnlocked ? (
            <GateLockedOverlay lifetimeSpend={mockLifetimeSpend} />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
              {/* ------------------------------------------------------ */}
              {/*  LEFT: Number Picker + Ticket Builder                  */}
              {/* ------------------------------------------------------ */}
              <div className="lg:col-span-2 space-y-6">
                {/* +EV Alert Banner */}
                {rolldownActive && (
                  <div className="relative glass rounded-xl p-4 border border-emerald/20 overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-emerald/5 to-transparent" />
                    <div className="relative z-10 flex items-start gap-3">
                      <div className="p-1.5 rounded-lg bg-emerald/15 shrink-0 mt-0.5">
                        <TrendingUp size={16} className="text-emerald-light" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-emerald-light mb-0.5">
                          +EV Window Open — Rolldown Active!
                        </p>
                        <p className="text-xs text-gray-400">
                          The jackpot has reached the soft cap. If no one
                          matches all 5, the entire jackpot is distributed
                          among Match 4 (60%) and Match 3 (40%) winners using
                          pari-mutuel division. Expected player edge:{" "}
                          <span className="font-bold text-emerald-light">
                            +66.7%
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Number Selection */}
                <div className="glass rounded-2xl p-5 sm:p-6">
                  <div className="flex items-center justify-between mb-5">
                    <div>
                      <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Star size={18} className="text-gold" />
                        Pick Your Numbers
                      </h2>
                      <p className="text-xs text-gray-500 mt-1">
                        Select {PICK_COUNT} numbers from 1 to {TOTAL_NUMBERS}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold tabular-nums">
                        <span
                          className={
                            selectedNumbers.size === PICK_COUNT
                              ? "text-emerald-light"
                              : "text-white"
                          }
                        >
                          {selectedNumbers.size}
                        </span>
                        <span className="text-gray-500">/{PICK_COUNT}</span>
                      </span>
                    </div>
                  </div>

                  {/* Selection progress bar */}
                  <div className="h-1 bg-white/5 rounded-full mb-5 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300 ease-out"
                      style={{
                        width: `${(selectedNumbers.size / PICK_COUNT) * 100}%`,
                        background:
                          selectedNumbers.size === PICK_COUNT
                            ? "linear-gradient(90deg, oklch(0.55 0.17 160), oklch(0.72 0.19 160))"
                            : "linear-gradient(90deg, oklch(0.6 0.15 85), oklch(0.75 0.15 85))",
                      }}
                    />
                  </div>

                  {/* Grid */}
                  <NumberGrid
                    selected={selectedNumbers}
                    onToggle={toggleNumber}
                  />

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-2 mt-5">
                    <Button
                      onClick={addManualTicket}
                      disabled={
                        selectedNumbers.size !== PICK_COUNT ||
                        tickets.length >= MAX_TICKETS
                      }
                      className="bg-gradient-to-r from-emerald to-emerald-dark hover:from-emerald-light hover:to-emerald text-white font-bold rounded-xl shadow-lg shadow-emerald/20 disabled:opacity-40 disabled:shadow-none transition-all"
                      size="lg"
                    >
                      <Plus size={16} />
                      Add Ticket
                    </Button>

                    <Button
                      onClick={clearSelection}
                      disabled={selectedNumbers.size === 0}
                      variant="ghost"
                      size="lg"
                      className="text-gray-400 hover:text-white"
                    >
                      <RotateCcw size={14} />
                      Clear
                    </Button>

                    <div className="hidden sm:block h-6 w-px bg-white/10 mx-1" />

                    <Button
                      onClick={() => addQuickPick(1)}
                      disabled={tickets.length >= MAX_TICKETS}
                      variant="outline"
                      size="lg"
                      className="border-emerald/20 hover:border-emerald/40 hover:bg-emerald/5 text-emerald-light"
                    >
                      <Shuffle size={14} />
                      Quick Pick
                    </Button>

                    <Button
                      onClick={() => addQuickPick(5)}
                      disabled={tickets.length >= MAX_TICKETS - 4}
                      variant="outline"
                      size="lg"
                      className="border-emerald/20 hover:border-emerald/40 hover:bg-emerald/5 text-emerald-light"
                    >
                      <Zap size={14} />
                      Quick Pick ×5
                    </Button>
                  </div>

                  {/* Selected numbers preview */}
                  {selectedNumbers.size > 0 && (
                    <div className="mt-4 pt-4 border-t border-white/5">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                          Your Selection
                        </span>
                      </div>
                      <LotteryBallRow
                        numbers={Array.from(selectedNumbers).sort(
                          (a, b) => a - b,
                        )}
                        size="md"
                        variant="emerald"
                        animated={false}
                      />
                    </div>
                  )}
                </div>

                {/* Tickets List */}
                <div className="glass rounded-2xl p-5 sm:p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                      <ShoppingCart size={18} className="text-emerald" />
                      Your Tickets
                      {tickets.length > 0 && (
                        <span className="ml-1 px-2 py-0.5 rounded-full bg-emerald/15 text-xs font-bold text-emerald-light">
                          {tickets.length}
                        </span>
                      )}
                    </h2>
                    {tickets.length > 0 && (
                      <button
                        type="button"
                        onClick={clearAllTickets}
                        className="text-xs text-gray-500 hover:text-red-400 transition-colors flex items-center gap-1"
                      >
                        <Trash2 size={12} />
                        Clear All
                      </button>
                    )}
                  </div>

                  {tickets.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/[0.06] mb-4">
                        <Zap size={24} className="text-gray-600" />
                      </div>
                      <p className="text-sm text-gray-500 mb-1">
                        No tickets yet
                      </p>
                      <p className="text-xs text-gray-600">
                        Pick your numbers above or use Quick Pick to get
                        started fast
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {tickets.map((ticket, i) => (
                        <TicketCard
                          key={`ticket-${i}-${ticket.numbers.join("-")}`}
                          numbers={ticket.numbers}
                          index={i}
                          onRemove={() => removeTicket(i)}
                          isQuickPick={ticket.isQuickPick}
                        />
                      ))}
                    </div>
                  )}

                  {tickets.length > 0 && tickets.length < MAX_TICKETS && (
                    <p className="text-[10px] text-gray-600 mt-3 text-center">
                      {MAX_TICKETS - tickets.length} more ticket
                      {MAX_TICKETS - tickets.length !== 1 ? "s" : ""}{" "}
                      available (max {MAX_TICKETS} per transaction)
                    </p>
                  )}
                </div>
              </div>

              {/* ------------------------------------------------------ */}
              {/*  RIGHT: Cart + Prize Info                               */}
              {/* ------------------------------------------------------ */}
              <div className="space-y-6">
                <div className="lg:sticky lg:top-20">
                  {/* Cart */}
                  <div className="glass-strong rounded-2xl p-5 sm:p-6 border-gradient-emerald">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
                      <ShoppingCart size={16} className="text-emerald" />
                      Your Cart
                    </h3>

                    <div className="space-y-3 mb-4">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-400">Tickets</span>
                        <span className="font-semibold text-white">
                          {tickets.length}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-400">Price each</span>
                        <span className="font-semibold text-white">
                          ${TICKET_PRICE.toFixed(2)} USDC
                        </span>
                      </div>
                      <div className="h-px bg-white/5" />
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-white">
                          Total
                        </span>
                        <span className="text-lg font-black text-gradient-gold">
                          ${totalCost.toFixed(2)} USDC
                        </span>
                      </div>
                    </div>

                    {walletConnected ? (
                      <Button
                        onClick={handleCheckout}
                        disabled={tickets.length === 0}
                        className="w-full h-12 bg-gradient-to-r from-emerald to-emerald-dark hover:from-emerald-light hover:to-emerald text-white font-bold rounded-xl shadow-lg shadow-emerald/25 hover:shadow-emerald/40 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:hover:scale-100 disabled:shadow-none"
                      >
                        <ShoppingCart size={18} />
                        {tickets.length > 1
                          ? `Buy ${tickets.length} Tickets`
                          : tickets.length === 1
                            ? "Buy Ticket"
                            : "Add Tickets First"}
                      </Button>
                    ) : (
                      <Button
                        onClick={handleCheckout}
                        className="w-full h-12 bg-gradient-to-r from-emerald to-emerald-dark hover:from-emerald-light hover:to-emerald text-white font-bold rounded-xl shadow-lg shadow-emerald/25 hover:shadow-emerald/40 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
                      >
                        <Wallet size={18} />
                        Connect Wallet to Play
                      </Button>
                    )}

                    <p className="text-[10px] text-gray-600 text-center mt-3">
                      Non-custodial &bull; Provably fair &bull; On-chain
                      verification
                    </p>
                  </div>

                  {/* Key Differences Banner */}
                  <div className="glass rounded-xl p-4 mt-4">
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2">
                      <Sparkles size={12} className="text-gold" />
                      Quick Pick Express vs Main
                    </h4>
                    <div className="space-y-2">
                      {[
                        {
                          label: "Matrix",
                          qp: "5/35",
                          main: "6/46",
                        },
                        {
                          label: "Price",
                          qp: "$1.50",
                          main: "$2.50",
                        },
                        {
                          label: "Draws",
                          qp: "Every 4h",
                          main: "Daily",
                        },
                        {
                          label: "Jackpot Odds",
                          qp: "1:324K",
                          main: "1:9.3M",
                        },
                        {
                          label: "Rolldown EV",
                          qp: "+66.7%",
                          main: "+47%",
                        },
                      ].map((row) => (
                        <div
                          key={row.label}
                          className="flex items-center justify-between text-[11px]"
                        >
                          <span className="text-gray-500">{row.label}</span>
                          <div className="flex items-center gap-3">
                            <span className="font-bold text-emerald-light">
                              {row.qp}
                            </span>
                            <span className="text-gray-600">vs</span>
                            <span className="text-gray-400">{row.main}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Prize Tiers */}
                  <div className="glass rounded-2xl p-5 sm:p-6 mt-4">
                    <button
                      type="button"
                      onClick={() => setShowPrizeInfo(!showPrizeInfo)}
                      className="w-full flex items-center justify-between"
                    >
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <Info size={14} className="text-emerald" />
                        Normal Prize Tiers
                      </h3>
                      <ChevronRight
                        size={14}
                        className={`text-gray-500 transition-transform duration-200 ${
                          showPrizeInfo ? "rotate-90" : ""
                        }`}
                      />
                    </button>

                    {showPrizeInfo && (
                      <div className="mt-4 space-y-2">
                        {PRIZE_TIERS.map((tier) => (
                          <div
                            key={tier.match}
                            className="flex items-center justify-between py-2 px-3 rounded-lg bg-white/[0.02]"
                          >
                            <div className="flex items-center gap-2">
                              <div
                                className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                  tier.color === "gold"
                                    ? "bg-gold/20 text-gold"
                                    : tier.color === "emerald"
                                      ? "bg-emerald/20 text-emerald-light"
                                      : "bg-white/5 text-gray-400"
                                }`}
                              >
                                {tier.match}
                              </div>
                              <span className="text-xs text-gray-400">
                                Match {tier.match}
                              </span>
                            </div>
                            <div className="text-right">
                              <span
                                className={`text-xs font-bold ${
                                  tier.color === "gold"
                                    ? "text-gold"
                                    : tier.color === "emerald"
                                      ? "text-emerald-light"
                                      : "text-gray-400"
                                }`}
                              >
                                {tier.prize}
                              </span>
                              <div className="text-[9px] text-gray-600">
                                {tier.odds}
                              </div>
                            </div>
                          </div>
                        ))}

                        <p className="text-[10px] text-gray-500 pt-2 border-t border-white/5">
                          No prize for Match 2 in Quick Pick Express (unlike the
                          main lottery's free ticket)
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Rolldown Tiers */}
                  <div className="glass rounded-2xl p-5 sm:p-6 mt-4">
                    <button
                      type="button"
                      onClick={() =>
                        setShowRolldownInfo(!showRolldownInfo)
                      }
                      className="w-full flex items-center justify-between"
                    >
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <TrendingUp size={14} className="text-emerald" />
                        Rolldown Prizes
                      </h3>
                      <ChevronRight
                        size={14}
                        className={`text-gray-500 transition-transform duration-200 ${
                          showRolldownInfo ? "rotate-90" : ""
                        }`}
                      />
                    </button>

                    {showRolldownInfo && (
                      <div className="mt-4 space-y-2">
                        {ROLLDOWN_TIERS.map((tier) => (
                          <div
                            key={tier.match}
                            className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-emerald/[0.03] border border-emerald/10"
                          >
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold bg-emerald/20 text-emerald-light">
                                {tier.match}
                              </div>
                              <div>
                                <span className="text-xs text-gray-300 font-medium">
                                  Match {tier.match}
                                </span>
                                <div className="text-[9px] text-gray-500">
                                  {tier.share} of jackpot pool
                                </div>
                              </div>
                            </div>
                            <span className="text-sm font-bold text-emerald-light">
                              {tier.estimate}*
                            </span>
                          </div>
                        ))}

                        <div className="pt-2 border-t border-white/5 space-y-1.5">
                          <div className="flex items-start gap-2 text-[10px] text-gray-500">
                            <AlertTriangle
                              size={10}
                              className="mt-0.5 shrink-0 text-gold/60"
                            />
                            <span>
                              *Rolldown prizes are pari-mutuel estimates.
                              Actual = Pool ÷ Winners. Operator liability is
                              capped at the jackpot amount ($30K-$50K).
                            </span>
                          </div>
                          <div className="flex items-start gap-2 text-[10px] text-emerald-light/70">
                            <TrendingUp
                              size={10}
                              className="mt-0.5 shrink-0"
                            />
                            <span>
                              During rolldown, player expected value is{" "}
                              <span className="font-bold">+66.7%</span> — the
                              house edge inverts in players' favor!
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Quick links */}
                  <div className="glass rounded-xl p-4 mt-4 space-y-2">
                    <Link
                      to="/play"
                      className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-white/[0.03] transition-colors group"
                    >
                      <div className="flex items-center gap-2">
                        <Trophy
                          size={14}
                          className="text-gold/60 group-hover:text-gold transition-colors"
                        />
                        <span className="text-xs text-gray-400 group-hover:text-white transition-colors">
                          6/46 Main Lottery
                        </span>
                      </div>
                      <ChevronRight
                        size={12}
                        className="text-gray-600 group-hover:text-gray-400 transition-colors"
                      />
                    </Link>
                    <Link
                      to="/results"
                      className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-white/[0.03] transition-colors group"
                    >
                      <div className="flex items-center gap-2">
                        <Clock
                          size={14}
                          className="text-gray-500 group-hover:text-gray-300 transition-colors"
                        />
                        <span className="text-xs text-gray-400 group-hover:text-white transition-colors">
                          Past Results
                        </span>
                      </div>
                      <ChevronRight
                        size={12}
                        className="text-gray-600 group-hover:text-gray-400 transition-colors"
                      />
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}
