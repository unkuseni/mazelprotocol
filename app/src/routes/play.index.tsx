import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useCallback, useMemo } from "react";
import {
  Trophy,
  Zap,
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
} from "lucide-react";
import { useAppKit, useAppKitAccount } from "@/lib/appkit-hooks";
import { Button } from "@/components/ui/button";
import { JackpotDisplay } from "@/components/JackpotDisplay";
import { CountdownTimer } from "@/components/CountdownTimer";
import { LotteryBallRow, FloatingBalls } from "@/components/LotteryBalls";
import Footer from "@/components/Footer";

export const Route = createFileRoute("/play/")({ component: PlayMainLottery });

/* -------------------------------------------------------------------------- */
/*  Constants                                                                 */
/* -------------------------------------------------------------------------- */

const TOTAL_NUMBERS = 46;
const PICK_COUNT = 6;
const TICKET_PRICE = 2.5;
const MAX_TICKETS = 20;

const PRIZE_TIERS = [
  { match: 6, prize: "Jackpot", odds: "1 in 9,366,819", color: "gold" },
  { match: 5, prize: "$4,000", odds: "1 in 39,028", color: "emerald" },
  { match: 4, prize: "$150", odds: "1 in 800", color: "emerald" },
  { match: 3, prize: "$5", odds: "1 in 47", color: "emerald" },
  { match: 2, prize: "Free Ticket", odds: "1 in 6.8", color: "muted" },
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
    <div className="grid grid-cols-8 sm:grid-cols-10 gap-1.5 sm:gap-2">
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
                    ? "bg-foreground/[0.02] text-muted-foreground/60 cursor-not-allowed border border-foreground/[0.03]"
                    : "bg-foreground/[0.04] text-muted-foreground border border-foreground/[0.06] hover:bg-foreground/[0.08] hover:border-emerald/30 hover:text-foreground hover:scale-105 active:scale-95"
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
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
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
          className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all"
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

interface CartSummaryProps {
  ticketCount: number;
  totalCost: number;
  onCheckout: () => void;
  walletConnected: boolean;
}

function CartSummary({
  ticketCount,
  totalCost,
  onCheckout,
  walletConnected,
}: CartSummaryProps) {
  return (
    <div className="glass-strong rounded-2xl p-5 sm:p-6 border-gradient-emerald">
      <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
        <ShoppingCart size={16} className="text-emerald" />
        Your Cart
      </h3>

      <div className="space-y-3 mb-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Tickets</span>
          <span className="font-semibold text-foreground">{ticketCount}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Price each</span>
          <span className="font-semibold text-foreground">
            ${TICKET_PRICE.toFixed(2)} USDC
          </span>
        </div>
        <div className="h-px bg-foreground/5" />
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">Total</span>
          <span className="text-lg font-black text-gradient-gold">
            ${totalCost.toFixed(2)} USDC
          </span>
        </div>
      </div>

      {walletConnected ? (
        <Button
          onClick={onCheckout}
          disabled={ticketCount === 0}
          className="w-full h-12 bg-gradient-to-r from-emerald to-emerald-dark hover:from-emerald-light hover:to-emerald text-white font-bold rounded-xl shadow-lg shadow-emerald/25 hover:shadow-emerald/40 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:hover:scale-100 disabled:shadow-none"
        >
          <ShoppingCart size={18} />
          {ticketCount > 1
            ? `Buy ${ticketCount} Tickets`
            : ticketCount === 1
              ? "Buy Ticket"
              : "Add Tickets First"}
        </Button>
      ) : (
        <Button
          onClick={onCheckout}
          className="w-full h-12 bg-gradient-to-r from-emerald to-emerald-dark hover:from-emerald-light hover:to-emerald text-white font-bold rounded-xl shadow-lg shadow-emerald/25 hover:shadow-emerald/40 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
        >
          <Wallet size={18} />
          Connect Wallet to Play
        </Button>
      )}

      <p className="text-[10px] text-muted-foreground/60 text-center mt-3">
        Non-custodial &bull; Provably fair &bull; On-chain verification
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main Component                                                            */
/* -------------------------------------------------------------------------- */

function PlayMainLottery() {
  const [selectedNumbers, setSelectedNumbers] = useState<Set<number>>(
    new Set(),
  );
  const [tickets, setTickets] = useState<
    { numbers: number[]; isQuickPick: boolean }[]
  >([]);
  const [showPrizeInfo, setShowPrizeInfo] = useState(false);

  const { open } = useAppKit();
  const { isConnected: walletConnected } = useAppKitAccount();
  const mockJackpot = 1_247_832;
  const rolldownActive = mockJackpot >= 1_750_000;

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
    if (!walletConnected) {
      open({ view: "Connect", namespace: "solana" });
      return;
    }
    // In a real app, this would trigger the on-chain transaction
    alert(
      `Purchasing ${tickets.length} ticket(s) for $${totalCost.toFixed(2)} USDC`,
    );
  }, [walletConnected, tickets.length, totalCost, open]);

  return (
    <div className="min-h-screen bg-background">
      {/* ================================================================ */}
      {/*  HERO BANNER                                                     */}
      {/* ================================================================ */}
      <section className="relative pt-24 pb-8 sm:pt-28 sm:pb-12 px-4 sm:px-6 lg:px-8 overflow-hidden">
        <div className="absolute inset-0 hero-grid opacity-30" />
        <div className="absolute inset-0 bg-glow-emerald opacity-20" />
        <FloatingBalls count={5} />

        <div className="relative z-10 max-w-7xl mx-auto">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-xs text-muted-foreground mb-6">
            <Link to="/" className="hover:text-foreground transition-colors">
              Home
            </Link>
            <ChevronRight size={12} />
            <span className="text-emerald-light font-medium">
              6/46 Main Lottery
            </span>
          </nav>

          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-xl bg-gradient-to-br from-emerald/20 to-emerald-dark/10 border border-emerald/20">
                  <Trophy size={24} className="text-emerald-light" />
                </div>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
                    6/46 Main Lottery
                  </h1>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Pick 6 numbers from 1-46 &bull; Daily draws at 00:00 UTC
                  </p>
                </div>
              </div>

              {/* Status badges */}
              <div className="flex flex-wrap items-center gap-2 mt-3">
                {rolldownActive ? (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald/15 border border-emerald/30">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald animate-pulse" />
                    <span className="text-xs font-semibold text-emerald-light">
                      Rolldown Active
                    </span>
                    <TrendingUp size={12} className="text-emerald-light" />
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-foreground/5 border border-foreground/10">
                    <div className="w-1.5 h-1.5 rounded-full bg-gray-500" />
                    <span className="text-xs font-medium text-muted-foreground">
                      Normal Mode
                    </span>
                  </div>
                )}
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gold/10 border border-gold/20">
                  <span className="text-xs font-semibold text-gold">
                    ${TICKET_PRICE.toFixed(2)} USDC / ticket
                  </span>
                </div>
              </div>
            </div>

            {/* Jackpot & Countdown */}
            <div className="flex flex-col sm:flex-row items-center gap-4 lg:gap-6">
              <JackpotDisplay
                amount={mockJackpot}
                size="md"
                glow
                showRolldownStatus={false}
                softCap={1_750_000}
              />
              <CountdownTimer size="sm" label="Next Draw" />
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/*  MAIN CONTENT                                                    */}
      {/* ================================================================ */}
      <section className="relative px-4 sm:px-6 lg:px-8 pb-16">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
            {/* ---------------------------------------------------------- */}
            {/*  LEFT: Number Picker + Ticket Builder                      */}
            {/* ---------------------------------------------------------- */}
            <div className="lg:col-span-2 space-y-6">
              {/* Number Selection */}
              <div className="glass rounded-2xl p-5 sm:p-6">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                      <Star size={18} className="text-gold" />
                      Pick Your Numbers
                    </h2>
                    <p className="text-xs text-muted-foreground mt-1">
                      Select {PICK_COUNT} numbers from 1 to {TOTAL_NUMBERS}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold tabular-nums">
                      <span
                        className={
                          selectedNumbers.size === PICK_COUNT
                            ? "text-emerald-light"
                            : "text-foreground"
                        }
                      >
                        {selectedNumbers.size}
                      </span>
                      <span className="text-muted-foreground">
                        /{PICK_COUNT}
                      </span>
                    </span>
                  </div>
                </div>

                {/* Selection progress bar */}
                <div className="h-1 bg-foreground/5 rounded-full mb-5 overflow-hidden">
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
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <RotateCcw size={14} />
                    Clear
                  </Button>

                  <div className="hidden sm:block h-6 w-px bg-foreground/10 mx-1" />

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
                  <div className="mt-4 pt-4 border-t border-foreground/5">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
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
                  <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
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
                      className="text-xs text-muted-foreground hover:text-red-400 transition-colors flex items-center gap-1"
                    >
                      <Trash2 size={12} />
                      Clear All
                    </button>
                  )}
                </div>

                {tickets.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-foreground/[0.03] border border-foreground/[0.06] mb-4">
                      <ShoppingCart
                        size={24}
                        className="text-muted-foreground/60"
                      />
                    </div>
                    <p className="text-sm text-muted-foreground mb-1">
                      No tickets yet
                    </p>
                    <p className="text-xs text-muted-foreground/60">
                      Pick your numbers above or use Quick Pick to generate
                      random selections
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
                  <p className="text-[10px] text-muted-foreground/60 mt-3 text-center">
                    {MAX_TICKETS - tickets.length} more ticket
                    {MAX_TICKETS - tickets.length !== 1 ? "s" : ""} available
                    (max {MAX_TICKETS} per transaction)
                  </p>
                )}
              </div>
            </div>

            {/* ---------------------------------------------------------- */}
            {/*  RIGHT: Cart + Prize Info                                   */}
            {/* ---------------------------------------------------------- */}
            <div className="space-y-6">
              {/* Cart */}
              <div className="lg:sticky lg:top-20">
                <CartSummary
                  ticketCount={tickets.length}
                  totalCost={totalCost}
                  onCheckout={handleCheckout}
                  walletConnected={walletConnected}
                />

                {/* Use Free Ticket toggle */}
                <div className="glass rounded-xl p-4 mt-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles size={14} className="text-gold" />
                      <span className="text-xs font-semibold text-foreground">
                        Free Tickets Available
                      </span>
                    </div>
                    <span className="text-sm font-bold text-gold">0</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1.5">
                    Match 2 numbers in any draw to earn a free ticket credit
                  </p>
                </div>

                {/* Prize Tiers */}
                <div className="glass rounded-2xl p-5 sm:p-6 mt-4">
                  <button
                    type="button"
                    onClick={() => setShowPrizeInfo(!showPrizeInfo)}
                    className="w-full flex items-center justify-between"
                  >
                    <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                      <Info size={14} className="text-emerald" />
                      Prize Tiers
                    </h3>
                    <ChevronRight
                      size={14}
                      className={`text-muted-foreground transition-transform duration-200 ${
                        showPrizeInfo ? "rotate-90" : ""
                      }`}
                    />
                  </button>

                  {showPrizeInfo && (
                    <div className="mt-4 space-y-2">
                      {PRIZE_TIERS.map((tier) => (
                        <div
                          key={tier.match}
                          className="flex items-center justify-between py-2 px-3 rounded-lg bg-foreground/[0.02]"
                        >
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                tier.color === "gold"
                                  ? "bg-gold/20 text-gold"
                                  : tier.color === "emerald"
                                    ? "bg-emerald/20 text-emerald-light"
                                    : "bg-foreground/5 text-muted-foreground"
                              }`}
                            >
                              {tier.match}
                            </div>
                            <span className="text-xs text-muted-foreground">
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
                                    : "text-muted-foreground"
                              }`}
                            >
                              {tier.prize}
                            </span>
                            <div className="text-[9px] text-muted-foreground/60">
                              {tier.odds}
                            </div>
                          </div>
                        </div>
                      ))}

                      <div className="pt-2 border-t border-foreground/5">
                        <div className="flex items-start gap-2 text-[10px] text-muted-foreground">
                          <AlertTriangle
                            size={10}
                            className="mt-0.5 shrink-0 text-gold/60"
                          />
                          <span>
                            During rolldown events, prizes transition to
                            pari-mutuel mode. Match 3+ prizes can be
                            significantly higher.
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Quick links */}
                <div className="glass rounded-xl p-4 mt-4 space-y-2">
                  <Link
                    to="/play/quick-pick"
                    className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-foreground/[0.03] transition-colors group"
                  >
                    <div className="flex items-center gap-2">
                      <Zap
                        size={14}
                        className="text-emerald group-hover:text-emerald-light transition-colors"
                      />
                      <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                        Quick Pick Express (5/35)
                      </span>
                    </div>
                    <ChevronRight
                      size={12}
                      className="text-muted-foreground/60 group-hover:text-muted-foreground transition-colors"
                    />
                  </Link>
                  <Link
                    to="/syndicates"
                    className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-foreground/[0.03] transition-colors group"
                  >
                    <div className="flex items-center gap-2">
                      <Star
                        size={14}
                        className="text-gold/60 group-hover:text-gold transition-colors"
                      />
                      <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                        Join a Syndicate
                      </span>
                    </div>
                    <ChevronRight
                      size={12}
                      className="text-muted-foreground/60 group-hover:text-muted-foreground transition-colors"
                    />
                  </Link>
                  <Link
                    to="/results"
                    className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-foreground/[0.03] transition-colors group"
                  >
                    <div className="flex items-center gap-2">
                      <Clock
                        size={14}
                        className="text-muted-foreground group-hover:text-muted-foreground transition-colors"
                      />
                      <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                        Past Results
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
