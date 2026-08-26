import {
	AlertTriangle,
	Check,
	ChevronRight,
	Clock,
	Info,
	Plus,
	RotateCcw,
	ShoppingCart,
	Shuffle,
	Sparkles,
	Star,
	Trash2,
	TrendingUp,
	Trophy,
	Wallet,
	Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CountdownTimer } from "@/components/CountdownTimer";
import { JackpotDisplay } from "@/components/JackpotDisplay";
import { FloatingBalls, LotteryBallRow } from "@/components/LotteryBalls";
import { Button } from "@/components/ui/button";
import { SOFT_CAP_USDC, useLotteryState } from "@/hooks/use-lottery-state";
import { useLotteryQueryClient } from "@/lib/anchor/hooks";
import { useAnchorProvider } from "@/lib/anchor/provider";
import {
	buyMainTicket,
	ensureUsdcTokenAccount,
	ensureUserStatsInitialized,
	fetchUserStats,
} from "@/lib/anchor/transactions";
import { buyBulkMainTickets } from "@/lib/anchor/transactions-lp-syndicate";
import { useAppKit, useAppKitAccount } from "@/lib/appkit-provider";

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

/** Per-ticket purchase status for the batch flow (review M2). */
type PurchaseStatus = "purchasing" | "purchased" | "failed";

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
              relative w-10 h-10 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center
              text-sm sm:text-base font-bold font-mono transition-all duration-200
              select-none cursor-pointer
              ${
								isSelected
									? "bg-linear-to-b from-cyan-300 to-cyan-600 text-primary-foreground shadow-lg shadow-cyan-500/40 scale-105 ring-1 ring-cyan-300/70 [text-shadow:0_0_10px_rgba(125,243,255,0.4)]"
									: isFull
										? "bg-surface-2 text-muted-foreground/40 cursor-not-allowed border border-border"
										: "bg-surface-1 text-muted-foreground border border-cyan-500/15 hover:bg-surface-2 hover:border-cyan-400/40 hover:text-cyan-200 hover:scale-105 active:scale-95 hover:shadow-[0_0_10px_rgba(0,229,255,0.15)]"
							}
            `}
					>
						{num}
						{isSelected && (
							<div className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-cyan-400 flex items-center justify-center shadow-[0_0_8px_rgba(0,229,255,0.9)]">
								<Check size={8} className="text-primary-foreground" />
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
	/** Purchase status for the batch flow (review M2); undefined = not started */
	purchaseStatus?: PurchaseStatus;
}

const STATUS_META: Record<
	PurchaseStatus,
	{ label: string; className: string; icon: typeof Check }
> = {
	purchasing: {
		label: "Purchasing…",
		className: "bg-blue-500/10 border-blue-500/25 text-blue-400",
		icon: Clock,
	},
	purchased: {
		label: "Purchased",
		className: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300",
		icon: Check,
	},
	failed: {
		label: "Failed — retry",
		className: "bg-red-500/10 border-red-500/25 text-red-400",
		icon: AlertTriangle,
	},
};

function TicketCard({
	numbers,
	index,
	onRemove,
	isQuickPick,
	purchaseStatus,
}: TicketCardProps) {
	const status = purchaseStatus ? STATUS_META[purchaseStatus] : null;
	return (
		<div
			className={`group relative glass rounded-xl p-3 sm:p-4 transition-all hover:border-gold-500/20 ${purchaseStatus === "failed" ? "border-red-500/30" : ""} ${purchaseStatus === "purchased" ? "border-emerald-500/25" : ""}`}
		>
			<div className="flex items-center justify-between mb-2">
				<div className="flex items-center gap-2">
					<span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
						Ticket #{index + 1}
					</span>
					{isQuickPick && (
						<span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-gold-500/10 border border-gold-500/20 text-[9px] font-semibold text-gold-400 uppercase tracking-wider">
							<Zap size={8} />
							Quick Pick
						</span>
					)}
					{status && (
						<span
							className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[9px] font-semibold uppercase tracking-wider ${status.className}`}
						>
							<status.icon size={8} />
							{status.label}
						</span>
					)}
				</div>
				<button
					type="button"
					onClick={onRemove}
					disabled={purchaseStatus === "purchasing"}
					className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-0"
					aria-label="Remove ticket"
				>
					<Trash2 size={14} />
				</button>
			</div>
			<div className="flex items-center gap-1.5">
				{numbers.map((num) => (
					<div
						key={num}
						className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-xs sm:text-sm font-bold bg-gold-500/10 border border-gold-500/20 text-gold-400"
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
	isPurchasing?: boolean;
	purchaseError?: string | null;
	purchaseTx?: string | null;
	/** Number of tickets confirmed purchased so far (batch progress, review M2) */
	purchasedCount?: number;
	/** Whether to redeem a free ticket credit */
	useFreeTicket?: boolean;
	/** Toggle free-ticket redemption */
	onUseFreeTicketChange?: (value: boolean) => void;
	/** Number of free-ticket credits the wallet holds */
	freeTicketsAvailable?: number;
}

function CartSummary({
	ticketCount,
	totalCost,
	onCheckout,
	walletConnected,
	isPurchasing = false,
	purchaseError = null,
	purchaseTx = null,
	purchasedCount = 0,
	useFreeTicket = false,
	onUseFreeTicketChange,
	freeTicketsAvailable = 0,
}: CartSummaryProps) {
	// Batch purchase progress (review M2): show how many tickets have been
	// confirmed so the user knows the loop is still running.
	const progressPct =
		ticketCount > 0 ? Math.min(100, (purchasedCount / ticketCount) * 100) : 0;
	return (
		<div className="glass-strong rounded-2xl p-5 sm:p-6 border-gradient-gold">
			<h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
				<ShoppingCart size={16} className="text-gold-400" />
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
				<div className="h-px bg-border" />
				<div className="flex items-center justify-between">
					<span className="text-sm font-semibold text-foreground">Total</span>
					<span className="text-lg font-black text-gradient-gold">
						${totalCost.toFixed(2)} USDC
					</span>
				</div>
			</div>

			{isPurchasing && ticketCount > 0 && (
				<div className="mb-4">
					<div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1.5">
						<span className="uppercase tracking-wider">
							Purchasing tickets…
						</span>
						<span className="font-bold text-foreground">
							{purchasedCount}/{ticketCount}
						</span>
					</div>
					<div className="h-1.5 bg-foreground/5 rounded-full overflow-hidden">
						<div
							className="h-full rounded-full bg-linear-to-r from-emerald-500 to-gold-400 transition-all duration-300"
							style={{ width: `${progressPct}%` }}
						/>
					</div>
				</div>
			)}

			{purchaseError && (
				<div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
					{purchaseError}
				</div>
			)}

			{purchaseTx && (
				<div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
					<p className="text-xs font-bold text-emerald-300 mb-1">
						Purchase successful!
					</p>
					<p className="text-[10px] text-muted-foreground break-all">
						TX: {purchaseTx}
					</p>
				</div>
			)}

			{walletConnected ? (
				<>
					{/* Free-ticket redemption toggle (on-chain Match-2 credit) —
					    only when the wallet holds credits. */}
					{ticketCount > 0 &&
						onUseFreeTicketChange &&
						freeTicketsAvailable > 0 && (
							<label className="flex items-center gap-2 mb-2 cursor-pointer select-none text-sm text-muted-foreground hover:text-foreground transition-colors">
								<input
									type="checkbox"
									checked={useFreeTicket}
									onChange={(e) => onUseFreeTicketChange(e.target.checked)}
									className="w-4 h-4 rounded border-border accent-emerald-500"
								/>
								<Sparkles size={14} className="text-emerald-400" />
								Redeem free ticket ({freeTicketsAvailable} available)
							</label>
						)}
					<Button
						onClick={onCheckout}
						disabled={ticketCount === 0 || isPurchasing}
						className="w-full h-12 bg-linear-to-r from-emerald-400 to-emerald-600 hover:from-emerald-300 hover:to-emerald-500 text-primary-foreground font-bold rounded-xl shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:hover:scale-100 disabled:shadow-none"
					>
						{isPurchasing ? (
							<span className="flex items-center gap-2">
								<span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
								Purchasing...
							</span>
						) : (
							<>
								<ShoppingCart size={18} />
								{ticketCount > 1
									? `Buy ${ticketCount} Tickets`
									: ticketCount === 1
										? "Buy Ticket"
										: "Add Tickets First"}
							</>
						)}
					</Button>
				</>
			) : (
				<Button
					onClick={onCheckout}
					className="w-full h-12 bg-linear-to-r from-emerald-400 to-emerald-600 hover:from-emerald-300 hover:to-emerald-500 text-primary-foreground font-bold rounded-xl shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
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

export default function PlayMainLottery() {
	const [selectedNumbers, setSelectedNumbers] = useState<Set<number>>(
		new Set(),
	);
	const [tickets, setTickets] = useState<
		{ numbers: number[]; isQuickPick: boolean }[]
	>([]);
	const [showPrizeInfo, setShowPrizeInfo] = useState(false);

	// Free-ticket redemption: players earn free tickets from Match-2 wins and
	// can redeem them at purchase time. Previously hardcoded to false — the
	// UI never exposed this on-chain feature.
	const [useFreeTicket, setUseFreeTicket] = useState(false);

	const [isPurchasing, setIsPurchasing] = useState(false);
	const [purchaseError, setPurchaseError] = useState<string | null>(null);
	const [purchaseTx, setPurchaseTx] = useState<string | null>(null);
	// Per-ticket purchase status for the batch flow (review M2). Keyed by the
	// ticket's index in the cart. Cleared when successful tickets are removed.
	const [purchaseStatuses, setPurchaseStatuses] = useState<
		Map<number, PurchaseStatus>
	>(new Map());

	const { open } = useAppKit();
	const { isConnected: walletConnected } = useAppKitAccount();
	const { canSign, connectedProvider } = useAnchorProvider();
	const { invalidateMainLottery } = useLotteryQueryClient();

	// Free-ticket credits earned from Match-2 wins. The redemption checkbox is
	// only shown when the user actually has credits — the on-chain instruction
	// rejects useFreeTicket when none are available.
	const [freeTicketsAvailable, setFreeTicketsAvailable] = useState(0);

	useEffect(() => {
		let cancelled = false;
		if (walletConnected && connectedProvider) {
			fetchUserStats(connectedProvider, connectedProvider.wallet.publicKey)
				.then((stats) => {
					if (cancelled) return;
					const raw = stats as Record<string, unknown> | null;
					const val =
						raw?.free_tickets_available ?? raw?.freeTicketsAvailable ?? 0;
					setFreeTicketsAvailable(Number(val) || 0);
				})
				.catch(() => {
					if (!cancelled) setFreeTicketsAvailable(0);
				});
		} else {
			setFreeTicketsAvailable(0);
		}
		return () => {
			cancelled = true;
		};
	}, [walletConnected, connectedProvider]);

	// Live on-chain lottery state (polls every 30s)
	const {
		jackpotDollars,
		rolldownActive,
		drawId: _drawId,
		ticketsSold: _ticketsSold,
		loading: jackpotLoading,
		error: jackpotError,
		refetch: refetchJackpot,
		nextDrawTimeMs,
		isSaleOpen,
	} = useLotteryState();
	// Suppress unused-vars until drawId / ticketsSold are wired into the UI
	void _drawId;
	void _ticketsSold;

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
		// Drop any recorded status for the removed ticket; keep the rest aligned.
		setPurchaseStatuses((prev) => {
			const next = new Map<number, PurchaseStatus>();
			for (const [k, v] of prev) {
				if (k < index) next.set(k, v);
				else if (k > index) next.set(k - 1, v);
			}
			return next;
		});
	}, []);

	const clearAllTickets = useCallback(() => {
		setTickets([]);
		setPurchaseStatuses(new Map());
	}, []);

	// SECURITY (review M2): purchase previously looped over all tickets with a
	// single try/catch — if ticket #7 of 20 failed, the loop aborted, the user
	// saw only "Transaction failed", and a retry could double-buy the first 6.
	// Now each ticket is attempted independently, failures are reported per
	// ticket, and only successfully purchased tickets are removed from the cart.
	const handleCheckout = useCallback(async () => {
		if (!walletConnected) {
			open({ view: "Connect", namespace: "solana" });
			return;
		}
		// Trigger on-chain transaction via Anchor program
		if (!connectedProvider || !canSign) {
			setPurchaseError("Wallet not connected or cannot sign transactions");
			return;
		}
		if (tickets.length === 0) return;

		// Pre-flight: refuse when the on-chain sale window is closed so the user
		// isn't surprised by a late failure after signing (review M2).
		if (!isSaleOpen) {
			setPurchaseError(
				"Ticket sales are currently closed for this draw (paused or past the cutoff). Please wait for the next draw window.",
			);
			return;
		}

		setIsPurchasing(true);
		setPurchaseError(null);
		setPurchaseTx(null);

		try {
			// SECURITY (review M8): the on-chain buy_ticket requires a UserStats
			// account (seed = USER_SEED || player). Previously this was never
			// created, so a new user's first purchase always failed with a raw
			// "Account not initialized" error. Ensure it exists before buying.
			await ensureUserStatsInitialized(connectedProvider);

			const playerUsdc = await ensureUsdcTokenAccount(
				connectedProvider,
				connectedProvider.wallet.publicKey,
			);

			// When buying multiple tickets, use the on-chain buy_bulk
			// instruction (one tx, one unified account, lower priority fees).
			// For a single ticket, use buy_ticket with the free-ticket option.
			if (tickets.length === 1) {
				const ticket = tickets[0];
				setPurchaseStatuses((prev) => {
					const next = new Map(prev);
					next.set(0, "purchasing");
					return next;
				});
				try {
					const sig = await buyMainTicket(
						connectedProvider,
						{
							numbers: ticket.numbers,
							useFreeTicket: useFreeTicket && freeTicketsAvailable > 0,
						},
						playerUsdc,
					);
					setPurchaseTx(sig);
					setPurchaseStatuses((prev) => {
						const next = new Map(prev);
						next.set(0, "purchased");
						return next;
					});
				} catch (ticketErr) {
					setPurchaseStatuses((prev) => {
						const next = new Map(prev);
						next.set(0, "failed");
						return next;
					});
					throw ticketErr;
				}
			} else {
				// Bulk: all tickets in one transaction.
				setPurchaseStatuses((prev) => {
					const next = new Map(prev);
					tickets.forEach((_, i) => {
						next.set(i, "purchasing");
					});
					return next;
				});
				const sig = await buyBulkMainTickets(
					connectedProvider,
					{
						tickets: tickets.map((t) => t.numbers),
						freeTicketsToUse:
							useFreeTicket && freeTicketsAvailable > 0
								? Math.min(freeTicketsAvailable, tickets.length)
								: 0,
					},
					playerUsdc,
				);
				setPurchaseTx(sig);
				setPurchaseStatuses((prev) => {
					const next = new Map(prev);
					tickets.forEach((_, i) => {
						next.set(i, "purchased");
					});
					return next;
				});
			}

			// Bulk buy succeeded — clear the cart (all tickets purchased in one tx).
			if (purchaseTx) {
				setTickets([]);
				setPurchaseStatuses(new Map());
				invalidateMainLottery();
			}
		} catch (err) {
			// Setup failures (UserStats init, ATA creation) abort the whole batch.
			setPurchaseError(
				`Setup failed: ${err instanceof Error ? err.message : "Transaction failed"}. No tickets were purchased.`,
			);
		} finally {
			setIsPurchasing(false);
		}
	}, [
		walletConnected,
		connectedProvider,
		canSign,
		tickets,
		open,
		invalidateMainLottery,
		isSaleOpen,
		useFreeTicket,
		purchaseTx,
	]);

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
						<span className="text-emerald-300 font-medium">
							6/46 Main Lottery
						</span>
					</nav>

					<div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
						<div>
							<div className="flex items-center gap-3 mb-2">
								<div className="p-2 rounded-xl bg-linear-to-br from-emerald-500/20 to-emerald-600/10 border border-emerald-500/20">
									<Trophy size={24} className="text-emerald-300" />
								</div>
								<div>
									<h1 className="text-lg sm:text-xl lg:text-2xl font-black tracking-tight text-foreground">
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
									<div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30">
										<div className="w-1.5 h-1.5 rounded-full bg-emerald animate-pulse" />
										<span className="text-xs font-semibold text-emerald-300">
											Rolldown Active
										</span>
										<TrendingUp size={12} className="text-emerald-300" />
									</div>
								) : (
									<div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-foreground/5 border border-foreground/10">
										<div className="w-1.5 h-1.5 rounded-full bg-gray-500" />
										<span className="text-xs font-medium text-muted-foreground">
											Normal Mode
										</span>
									</div>
								)}
								<div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gold-500/10 border border-gold-500/20">
									<span className="text-xs font-semibold text-gold-300">
										${TICKET_PRICE.toFixed(2)} USDC / ticket
									</span>
								</div>
							</div>
						</div>

						{/* Jackpot & Countdown */}
						<div className="flex flex-col sm:flex-row items-center gap-4 lg:gap-6 max-md:mx-auto">
							{/* Loading skeleton */}
							{jackpotLoading && (
								<div className="relative rounded-2xl overflow-hidden px-5 py-4 bg-card/50 border border-border/50">
									<div className="flex flex-col items-center gap-3">
										<div className="h-5 w-28 animate-pulse rounded bg-foreground/10" />
										<div className="h-9 w-40 animate-pulse rounded bg-foreground/10" />
										<div className="h-3 w-20 animate-pulse rounded bg-foreground/10" />
									</div>
								</div>
							)}

							{/* Error banner */}
							{jackpotError && !jackpotLoading && (
								<div className="relative rounded-2xl overflow-hidden px-5 py-4 bg-destructive/10 border border-destructive/30">
									<div className="flex flex-col items-center gap-2 text-center">
										<span className="text-sm font-semibold text-destructive">
											Failed to load jackpot
										</span>
										<p className="text-xs text-muted-foreground">
											{jackpotError}
										</p>
										<button
											type="button"
											onClick={() => refetchJackpot()}
											className="text-xs text-primary hover:underline"
										>
											Tap to retry
										</button>
									</div>
								</div>
							)}

							{/* Live jackpot display */}
							{!jackpotLoading && !jackpotError && (
								<JackpotDisplay
									amount={jackpotDollars}
									size="md"
									glow
									showRolldownStatus={false}
									softCap={SOFT_CAP_USDC}
								/>
							)}
							{/* Countdown uses the on-chain next-draw schedule (review L3) */}
							{nextDrawTimeMs ? (
								<CountdownTimer
									size="sm"
									label="Next Draw"
									targetTime={nextDrawTimeMs}
								/>
							) : (
								<div className="text-[10px] text-muted-foreground/60 text-center">
									Next draw schedule loading…
								</div>
							)}
						</div>
					</div>
				</div>
			</section>

			{/* ================================================================ */}
			{/*  MAIN CONTENT                                                    */}
			{/* ================================================================ */}
			<section className="relative px-4 sm:px-6 lg:px-8 pb-16">
				<div className="max-w-7xl mx-auto px-0 py-4 sm:py-6">
					<div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
						{/* ---------------------------------------------------------- */}
						{/*  LEFT: Number Picker + Ticket Builder                      */}
						{/* ---------------------------------------------------------- */}
						<div className="flex-1 min-w-0 space-y-6">
							{/* Number Selection */}
							<div className="glass rounded-2xl p-5 sm:p-6">
								<div className="flex items-center justify-between mb-5">
									<div>
										<h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-foreground flex items-center gap-2">
											<Star size={18} className="text-gold-300" />
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
														? "text-emerald-300"
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
										className={`h-full rounded-full transition-all duration-300 ease-out ${selectedNumbers.size === PICK_COUNT ? "bg-linear-to-r from-emerald-500 to-emerald-400" : "bg-linear-to-r from-gold-500 to-gold-400"}`}
										style={{
											width: `${(selectedNumbers.size / PICK_COUNT) * 100}%`,
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
										className="w-full lg:w-auto bg-linear-to-r from-emerald-400 to-emerald-600 hover:from-emerald-300 hover:to-emerald-500 text-primary-foreground font-bold rounded-xl shadow-lg shadow-emerald-500/20 disabled:opacity-40 disabled:shadow-none transition-all"
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
										className="w-full lg:w-auto text-muted-foreground hover:text-foreground"
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
										className="w-full lg:w-auto border-emerald-500/20 hover:border-emerald-400/40 hover:bg-emerald-500/5 text-emerald-300"
									>
										<Shuffle size={14} />
										Quick Pick
									</Button>

									<Button
										onClick={() => addQuickPick(5)}
										disabled={tickets.length >= MAX_TICKETS - 4}
										variant="outline"
										size="lg"
										className="w-full lg:w-auto border-emerald-500/20 hover:border-emerald-400/40 hover:bg-emerald-500/5 text-emerald-300"
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
											className="flex-wrap justify-center"
										/>
									</div>
								)}
							</div>

							{/* Tickets List */}
							<div className="glass rounded-2xl p-5 sm:p-6">
								<div className="flex items-center justify-between mb-4">
									<h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-foreground flex items-center gap-2">
										<ShoppingCart size={18} className="text-emerald-300" />
										Your Tickets
										{tickets.length > 0 && (
											<span className="ml-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-xs font-bold text-emerald-300">
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
										<div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-foreground/3 border border-foreground/6 mb-4">
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
												key={ticket.numbers.join("-")}
												numbers={ticket.numbers}
												index={i}
												onRemove={() => removeTicket(i)}
												isQuickPick={ticket.isQuickPick}
												purchaseStatus={purchaseStatuses.get(i)}
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
						<div className="lg:w-80 xl:w-96 shrink-0 space-y-6">
							{/* Cart */}
							<div className="lg:sticky lg:top-20">
								<CartSummary
									ticketCount={tickets.length}
									totalCost={totalCost}
									onCheckout={handleCheckout}
									walletConnected={walletConnected}
									isPurchasing={isPurchasing}
									purchaseError={purchaseError}
									purchaseTx={purchaseTx}
									purchasedCount={
										Array.from(purchaseStatuses.values()).filter(
											(s) => s === "purchased",
										).length
									}
									useFreeTicket={useFreeTicket}
									onUseFreeTicketChange={setUseFreeTicket}
									freeTicketsAvailable={freeTicketsAvailable}
								/>

								{/* Use Free Ticket toggle */}
								<div className="glass rounded-xl p-4 mt-4">
									<div className="flex items-center justify-between">
										<div className="flex items-center gap-2">
											<Sparkles size={14} className="text-gold-300" />
											<span className="text-xs font-semibold text-foreground">
												Free Tickets Available
											</span>
										</div>
										<span className="text-sm font-bold text-gold-300">0</span>
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
										<h3 className="text-sm font-bold text-foreground flex items-center gap-2 shrink-0">
											<Info size={14} className="text-emerald-300" />
											Prize Tiers
										</h3>
										<ChevronRight
											size={14}
											className={`text-muted-foreground transition-transform duration-200 shrink-0 ${
												showPrizeInfo ? "rotate-90" : ""
											}`}
										/>
									</button>

									{showPrizeInfo && (
										<div className="mt-4 overflow-x-auto pb-1 -mx-1 px-1">
											<div className="flex lg:block gap-2 min-w-max">
												{PRIZE_TIERS.map((tier) => (
													<div
														key={tier.match}
														className="flex items-center justify-between py-2 px-3 rounded-lg bg-foreground/2 shrink-0"
													>
														<div className="flex items-center gap-2">
															<div
																className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
																	tier.color === "gold"
																		? "bg-gold-500/20 text-gold-300"
																		: tier.color === "emerald"
																			? "bg-emerald-500/20 text-emerald-300"
																			: "bg-foreground/5 text-muted-foreground"
																}`}
															>
																{tier.match}
															</div>
															<span className="text-xs text-muted-foreground whitespace-nowrap">
																Match {tier.match}
															</span>
														</div>
														<div className="text-right ml-4">
															<span
																className={`text-xs font-bold whitespace-nowrap ${
																	tier.color === "gold"
																		? "text-gold-300"
																		: tier.color === "emerald"
																			? "text-emerald-300"
																			: "text-muted-foreground"
																}`}
															>
																{tier.prize}
															</span>
															<div className="text-[9px] text-muted-foreground/60 whitespace-nowrap">
																{tier.odds}
															</div>
														</div>
													</div>
												))}
											</div>

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
										className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-foreground/3 transition-colors group"
									>
										<div className="flex items-center gap-2">
											<Zap
												size={14}
												className="text-emerald-300 group-hover:text-emerald-300 transition-colors"
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
										className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-foreground/3 transition-colors group"
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
										className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-foreground/3 transition-colors group"
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
		</div>
	);
}
