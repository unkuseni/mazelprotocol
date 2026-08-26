import type { PublicKey } from "@solana/web3.js";
import {
	AlertTriangle,
	ArrowRight,
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
import { QuickPickCountdown } from "@/components/CountdownTimer";
import { JackpotDisplay } from "@/components/JackpotDisplay";
import { FloatingBalls, LotteryBallRow } from "@/components/LotteryBalls";
import { Button } from "@/components/ui/button";
import { useQuickPickState } from "@/lib/anchor/hooks";
import { deriveUserPDA } from "@/lib/anchor/pda";
import { useAnchorProvider } from "@/lib/anchor/provider";
import {
	buyQuickPickTicketsBulk,
	checkUserMeetsGateRequirement,
	ensureUsdcTokenAccount,
	fetchUserStats,
} from "@/lib/anchor/transactions";
import { useAppKit, useAppKitAccount } from "@/lib/appkit-provider";

/** Fetch a user's lifetime spend (USDC dollars) for the gate overlay. */
async function fetchUserStatsForGate(
	provider: ReturnType<typeof useAnchorProvider>["connectedProvider"],
	wallet: PublicKey,
): Promise<number> {
	if (!provider) return 0;
	const stats = await fetchUserStats(provider, wallet);
	if (!stats) return 0;
	const rawSpent = stats.totalSpent ?? stats.total_spent ?? 0;
	const lamports =
		typeof rawSpent === "bigint"
			? rawSpent
			: BigInt(
					typeof rawSpent === "string" || typeof rawSpent === "number"
						? rawSpent
						: String(rawSpent),
				);
	return Number(lamports) / 1_000_000;
}

/* -------------------------------------------------------------------------- */
/*  Constants                                                                 */
/* -------------------------------------------------------------------------- */

const TOTAL_NUMBERS = 35;
const PICK_COUNT = 5;
const TICKET_PRICE = 1.5;
const MAX_TICKETS = 10; // max per transaction
const LIFETIME_GATE = 50; // $50 lifetime spend required (frontend-only)
const PER_WALLET_DRAW_LIMIT = 100; // on-chain cap per draw (mirrors QUICK_PICK_MAX_TICKETS_PER_WALLET)

const PRIZE_TIERS = [
	{ match: 5, prize: "Jackpot", odds: "1 in 324,632", color: "gold" as const },
	{ match: 4, prize: "$100", odds: "1 in 2,164", color: "emerald" as const },
	{ match: 3, prize: "$4", odds: "1 in 75", color: "emerald" as const },
	{ match: 2, prize: "—", odds: "1 in 8.0", color: "muted" as const },
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
              relative w-10 h-10 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center
              font-mono text-sm sm:text-base font-bold tabular-nums transition-all duration-200 border
              select-none cursor-pointer
              ${
								isSelected
									? "bg-cyan-500/15 border-cyan-400/60 text-cyan-300 ring-1 ring-cyan-400/50 shadow-[0_0_16px_rgba(0,229,255,0.35)] scale-105 glow-cyan"
									: isFull
										? "bg-foreground/2 text-muted-foreground/60 cursor-not-allowed border-foreground/3"
										: "bg-foreground/4 text-muted-foreground border-foreground/6 hover:bg-cyan-500/10 hover:border-cyan-400/40 hover:text-cyan-300 hover:scale-105 active:scale-95"
							}
            `}
					>
						{num}
						{isSelected && (
							<div className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(0,229,255,0.9)] flex items-center justify-center">
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
}

function TicketCard({
	numbers,
	index,
	onRemove,
	isQuickPick,
}: TicketCardProps) {
	return (
		<div className="group relative hud-frame rounded-lg p-3 sm:p-4 transition-all hover:border-cyan-400/40">
			<div className="flex items-center justify-between mb-2">
				<div className="flex items-center gap-2">
					<span className="hud-label">Ticket #{index + 1}</span>
					{isQuickPick && (
						<span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-magenta-500/10 border border-magenta-500/30 font-mono text-[9px] font-semibold text-magenta-300 uppercase tracking-[0.2em]">
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
				{numbers.map((num) => (
					<div
						key={num}
						className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-mono text-xs sm:text-sm font-bold bg-linear-to-br from-cyan-400/25 to-cyan-500/10 border border-cyan-400/40 text-cyan-300"
					>
						{num}
					</div>
				))}
			</div>
		</div>
	);
}

function GateLockedOverlay({ lifetimeSpend }: { lifetimeSpend: number }) {
	const remaining = LIFETIME_GATE - lifetimeSpend;
	const progress = Math.min((lifetimeSpend / LIFETIME_GATE) * 100, 100);

	return (
		<div className="relative hud-frame rounded-lg p-6 sm:p-8 lg:p-12 text-center overflow-hidden mx-auto max-w-lg glow-gold">
			{/* Background */}
			<div className="absolute inset-0 bg-glow-gold opacity-20" />

			<div className="relative z-10">
				<div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-gold-500/10 border border-gold-500/30 mb-5 glow-gold">
					<Sparkles size={28} className="text-gold-300" />
				</div>

				<div className="hud-label mb-2">{"// Premium Access"}</div>
				<h2 className="font-display text-lg sm:text-xl lg:text-2xl font-black uppercase tracking-wide text-gradient-gold mb-2">
					Unlock Quick Pick Express Premium Access
				</h2>
				<p className="text-sm text-muted-foreground max-w-md mx-auto mb-6 px-4">
					Quick Pick Express is a premium feature unlocked after{" "}
					<span className="font-mono font-bold text-gold-300">
						${LIFETIME_GATE}
					</span>{" "}
					in main lottery play. It's our way of rewarding committed players with
					higher-frequency draws at a lower price point.
				</p>

				{/* Progress */}
				<div className="max-w-xs mx-auto mb-6">
					<div className="flex items-center justify-between font-mono text-xs mb-1.5">
						<span className="text-muted-foreground">Lifetime spend</span>
						<span className="font-bold text-gold-300">
							${lifetimeSpend.toFixed(2)} / ${LIFETIME_GATE}
						</span>
					</div>
					<div className="h-2 bg-foreground/5 rounded-full overflow-hidden">
						<div
							className="h-full rounded-full bg-linear-to-r from-gold-600 to-gold-400 transition-all duration-500"
							style={{ width: `${progress}%` }}
						/>
					</div>
					<p className="font-mono text-[10px] text-muted-foreground/60 mt-1.5">
						${remaining.toFixed(2)} more to unlock
					</p>
				</div>

				<Link
					to="/play"
					className="inline-flex items-center gap-2 px-6 py-3 bg-linear-to-r from-emerald-400 to-emerald-600 hover:from-emerald-300 hover:to-emerald-500 text-primary-foreground font-bold rounded-xl shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] text-sm"
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

export default function PlayQuickPickExpress() {
	const [selectedNumbers, setSelectedNumbers] = useState<Set<number>>(
		new Set(),
	);
	const [tickets, setTickets] = useState<
		{ numbers: number[]; isQuickPick: boolean }[]
	>([]);
	const [showPrizeInfo, setShowPrizeInfo] = useState(false);
	const [showRolldownInfo, setShowRolldownInfo] = useState(false);
	const [isPurchasing, setIsPurchasing] = useState(false);
	const [purchaseError, setPurchaseError] = useState<string | null>(null);
	const [purchaseTx, setPurchaseTx] = useState<string | null>(null);
	const [gateState, setGateState] = useState<
		| { status: "loading" }
		| { status: "unlocked" }
		| { status: "locked"; lifetimeSpend: number }
		| { status: "error" }
	>({ status: "loading" });

	const { open } = useAppKit();
	const { isConnected: walletConnected } = useAppKitAccount();
	const { data: qpState } = useQuickPickState();
	const { connectedProvider } = useAnchorProvider();

	// SECURITY (review M5): the jackpot and the $50 gate were previously
	// hardcoded demo values (mockJackpot = 18_420, mockLifetimeSpend = 72.5)
	// that bypassed the gate in the UI and showed a fake jackpot. Now both
	// read live on-chain state.
	const jackpotLamports = qpState
		? ((qpState as Record<string, unknown>).jackpot_balance ?? 0n)
		: null;
	const jackpotDollars =
		jackpotLamports !== null
			? Number(
					typeof jackpotLamports === "bigint"
						? jackpotLamports
						: BigInt(String(jackpotLamports)),
				) / 1_000_000
			: 0;
	const jackpotUnknown = qpState === null || jackpotDollars === 0;
	const rolldownActive = jackpotDollars >= 30_000;

	// Actual +EV figure: if a rolldown fires this draw, the ENTIRE jackpot is
	// shared among that draw's tickets, so expected value per ticket ≈
	// jackpot / tickets. The old hardcoded "+66.7%" only holds at the $50k hard
	// cap with exactly 20k tickets — showing it at $30k was misleading.
	const rolldownEdgePercent = useMemo(() => {
		if (!rolldownActive) return null;
		const raw =
			(qpState as Record<string, unknown>).current_draw_tickets ??
			(qpState as Record<string, unknown>).currentDrawTickets;
		let tickets = 0;
		if (typeof raw === "bigint") tickets = Number(raw);
		else if (typeof raw === "number") tickets = raw;
		else if (
			typeof raw === "object" &&
			raw !== null &&
			"toNumber" in raw &&
			typeof (raw as { toNumber: () => number }).toNumber === "function"
		) {
			tickets = (raw as { toNumber: () => number }).toNumber();
		}
		if (tickets <= 0) return null;
		const evPerTicket = jackpotDollars / tickets;
		return (evPerTicket / 1.5 - 1) * 100;
	}, [rolldownActive, jackpotDollars, qpState]);

	const rolldownEdgeLabel =
		rolldownEdgePercent !== null
			? `${rolldownEdgePercent >= 0 ? "+" : ""}${rolldownEdgePercent.toFixed(1)}%`
			: "+EV window (volume-dependent)";

	// On-chain next draw time (Unix seconds → ms) from QuickPickState. Prefer
	// this over the client-clock 4-hour boundary for the countdown.
	const nextDrawTimestampMs = useMemo(() => {
		if (!qpState) return null;
		const raw =
			(qpState as Record<string, unknown>).next_draw_timestamp ??
			(qpState as Record<string, unknown>).nextDrawTimestamp;
		if (raw === null || raw === undefined) return null;
		let seconds: number;
		if (typeof raw === "bigint") seconds = Number(raw);
		else if (typeof raw === "number") seconds = raw;
		else if (typeof raw === "string") seconds = Number(raw);
		else if (
			typeof raw === "object" &&
			raw !== null &&
			"toNumber" in raw &&
			typeof (raw as { toNumber: () => number }).toNumber === "function"
		) {
			seconds = (raw as { toNumber: () => number }).toNumber();
		} else {
			seconds = Number(raw);
		}
		if (!Number.isFinite(seconds) || seconds <= 0) return null;
		return seconds * 1000;
	}, [qpState]);

	// Check the $50 lifetime-spend gate against the real UserStats account.
	const walletPublicKey = connectedProvider?.wallet.publicKey ?? null;
	const userStatsPda = walletPublicKey
		? deriveUserPDA(walletPublicKey)[0]
		: null;

	useEffect(() => {
		let cancelled = false;

		const checkGate = async (showLoading: boolean) => {
			// C2 fix: no wallet connected → nothing to gate on-chain. Treat as
			// LOCKED — the builder must not render unlocked pre-connect. A wallet
			// must be connected AND pass the on-chain $50 spend check.
			if (!walletPublicKey || !connectedProvider || !userStatsPda) {
				if (!cancelled) setGateState({ status: "locked", lifetimeSpend: 0 });
				return;
			}
			if (showLoading) setGateState({ status: "loading" });
			try {
				const meets = await checkUserMeetsGateRequirement(
					connectedProvider,
					userStatsPda,
				);
				if (cancelled) return;
				if (meets) {
					setGateState({ status: "unlocked" });
				} else {
					// Fetch lifetime spend for display in the locked overlay
					const spend = await fetchUserStatsForGate(
						connectedProvider,
						walletPublicKey,
					);
					if (cancelled) return;
					setGateState({ status: "locked", lifetimeSpend: spend });
				}
			} catch {
				if (!cancelled) setGateState({ status: "error" });
			}
		};

		// Initial check (with loading state)
		void checkGate(true);

		// L2 fix: re-check periodically and on focus/visibility so the gate
		// reflects an updated lifetime spend without a page reload. Later
		// checks are silent (no loading flicker).
		const interval = setInterval(() => {
			void checkGate(false);
		}, 30_000);
		const onRecheck = () => {
			void checkGate(false);
		};
		window.addEventListener("focus", onRecheck);
		document.addEventListener("visibilitychange", onRecheck);

		return () => {
			cancelled = true;
			clearInterval(interval);
			window.removeEventListener("focus", onRecheck);
			document.removeEventListener("visibilitychange", onRecheck);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [walletPublicKey?.toBase58()]);

	const isUnlocked = gateState.status === "unlocked";

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

	const handleCheckout = useCallback(async () => {
		if (!walletConnected) {
			open({ view: "Connect", namespace: "solana" });
			return;
		}
		if (!connectedProvider) {
			setPurchaseError("Wallet not connected");
			return;
		}
		if (tickets.length === 0) return;

		setPurchaseError(null);
		setPurchaseTx(null);

		// SECURITY (review C2): the $50 main-lottery spend gate is UI-only (the
		// on-chain QuickPick program does not enforce it), so re-verify it HARD
		// at checkout — never trust the cached gateState. Re-fetch the user's
		// main-lottery UserStats.total_spent and abort with a visible error if
		// it is below $50 (50,000,000 USDC lamports) or the fetch fails (fail
		// closed). Nothing is built or signed until this check passes.
		try {
			const wallet = connectedProvider.wallet.publicKey;
			const [userStatsPda] = deriveUserPDA(wallet);
			const meetsGate = await checkUserMeetsGateRequirement(
				connectedProvider,
				userStatsPda,
			);
			if (!meetsGate) {
				setPurchaseError(
					"Quick Pick Express requires a $50 lifetime spend in the 6/46 main lottery. Your on-chain spend could not be verified as $50+ — play the main lottery to unlock, then try again.",
				);
				return;
			}
		} catch {
			setPurchaseError(
				"Could not verify your $50 Quick Pick access on-chain. Please reconnect your wallet and try again.",
			);
			return;
		}

		// SECURITY (review M5): checkout previously only showed an alert() — it
		// never executed an on-chain purchase. Now it submits the real QuickPick
		// bulk purchase. NOTE: the $50 main-lottery spend gate is enforced above
		// (frontend-only) — the on-chain program does not check it, so no
		// UserStats initialization is required before purchasing.
		setIsPurchasing(true);
		try {
			const playerUsdc = await ensureUsdcTokenAccount(
				connectedProvider,
				connectedProvider.wallet.publicKey,
			);
			const params = tickets.map((t) => ({ numbers: t.numbers }));
			const sig = await buyQuickPickTicketsBulk(
				connectedProvider,
				params,
				playerUsdc,
			);
			setPurchaseTx(sig);
			setTickets([]);
		} catch (err) {
			setPurchaseError(err instanceof Error ? err.message : "Purchase failed");
		} finally {
			setIsPurchasing(false);
		}
	}, [walletConnected, connectedProvider, tickets, open]);

	return (
		<div className="min-h-screen bg-background">
			{/* ================================================================ */}
			{/*  HERO BANNER                                                     */}
			{/* ================================================================ */}
			<section className="relative pt-24 pb-8 sm:pt-28 sm:pb-12 px-4 sm:px-6 lg:px-8 overflow-hidden scanlines">
				<div className="absolute inset-0 hero-grid opacity-30" />
				<div className="absolute inset-0 bg-glow-top-left" />
				<div className="absolute inset-0 bg-glow-bottom-right" />
				<FloatingBalls count={4} />

				<div className="relative z-10 max-w-7xl mx-auto">
					{/* Breadcrumb */}
					<nav className="flex items-center gap-2 text-xs text-muted-foreground mb-6">
						<Link to="/" className="hover:text-foreground transition-colors">
							Home
						</Link>
						<ChevronRight size={12} />
						<Link
							to="/play"
							className="hover:text-foreground transition-colors"
						>
							Play
						</Link>
						<ChevronRight size={12} />
						<span className="font-mono text-cyan-300 font-medium">
							Quick Pick Express
						</span>
					</nav>

					<div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
						<div>
							<div className="hud-label mb-2">{"// Live On-Chain"}</div>
							<div className="flex items-center gap-3 mb-2">
								<div className="p-2 rounded-xl bg-linear-to-br from-cyan-500/20 to-magenta-500/10 border border-cyan-500/30 glow-cyan">
									<Zap size={24} className="text-cyan-300" />
								</div>
								<div>
									<h1 className="font-display text-lg sm:text-xl lg:text-2xl font-black tracking-wide uppercase text-gradient-primary">
										Quick Pick Express
										<span className="ml-2 inline-block align-middle text-sm font-bold text-gold-300 bg-gold-500/10 px-2 py-0.5 rounded-md border border-gold-500/30 font-mono">
											5/35
										</span>
									</h1>
									<p className="text-sm text-muted-foreground mt-0.5">
										Pick 5 numbers from 1-35 &bull; Draws every 4 hours &bull;
										$1.50/ticket
									</p>
								</div>
							</div>

							{/* Status badges */}
							<div className="flex flex-wrap items-center gap-2 mt-3">
								{rolldownActive ? (
									<div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-magenta-500/10 border border-magenta-500/30 font-mono text-[10px] uppercase tracking-[0.2em] text-magenta-300">
										<div className="w-1.5 h-1.5 rounded-full bg-magenta-400 animate-pulse" />
										Rolldown Active — {rolldownEdgeLabel} EV
										<TrendingUp size={11} className="text-magenta-300" />
									</div>
								) : (
									<div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-foreground/5 border border-foreground/10 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
										<div className="w-1.5 h-1.5 rounded-full bg-gray-500" />
										Normal Mode
									</div>
								)}
								<div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-gold-500/10 border border-gold-500/30 font-mono text-[10px] uppercase tracking-[0.2em] text-gold-300">
									${TICKET_PRICE.toFixed(2)} USDC / ticket
								</div>
								<div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-foreground/5 border border-foreground/10 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
									{PER_WALLET_DRAW_LIMIT} tickets / draw per wallet
								</div>
								{isUnlocked ? (
									<div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/30 font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-400">
										<Check size={10} className="text-emerald-400" />
										Unlocked
									</div>
								) : (
									<div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/30 font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-400">
										<Sparkles size={10} className="text-emerald-400" />
										Premium Feature
									</div>
								)}
							</div>
						</div>

						{/* Jackpot & Countdown */}
						<div className="flex flex-col sm:flex-row items-center gap-4 lg:gap-6 max-md:mx-auto">
							<JackpotDisplay
								amount={jackpotDollars}
								unknown={jackpotUnknown}
								size="sm"
								glow
								showRolldownStatus={false}
								softCap={30_000}
								label="Quick Pick Jackpot"
							/>
							<div className="hud-frame rounded-lg px-4 py-3 flex flex-col items-center gap-1.5 glow-cyan">
								<span className="hud-label">{"// Next Draw"}</span>
								<QuickPickCountdown
									size="sm"
									className="font-mono [&_span]:text-cyan-300"
									nextDrawTimestamp={nextDrawTimestampMs ?? undefined}
								/>
							</div>
						</div>
					</div>
				</div>
			</section>

			{/* ================================================================ */}
			{/*  MAIN CONTENT                                                    */}
			{/* ================================================================ */}
			<section className="relative px-4 sm:px-6 lg:px-8 pb-16">
				<div className="max-w-7xl mx-auto px-0 py-4 sm:py-6">
					{gateState.status === "locked" ? (
						<GateLockedOverlay lifetimeSpend={gateState.lifetimeSpend} />
					) : gateState.status === "loading" ? (
						<div className="relative hud-frame rounded-lg p-6 sm:p-8 text-center overflow-hidden mx-auto max-w-lg glow-cyan">
							<div className="font-mono text-[10px] uppercase tracking-[0.2em] text-cyan-300 mb-2">
								{"// Verifying Access"}
							</div>
							<div className="text-sm text-muted-foreground animate-pulse">
								Checking Quick Pick access…
							</div>
						</div>
					) : gateState.status === "error" ? (
						<div className="relative hud-frame rounded-lg p-6 sm:p-8 text-center overflow-hidden mx-auto max-w-lg">
							<div className="font-mono text-[10px] uppercase tracking-[0.2em] text-red-400 mb-2">
								{"// Access Error"}
							</div>
							<p className="text-sm text-muted-foreground mb-2">
								Could not verify your Quick Pick access right now.
							</p>
							<Link
								to="/play"
								className="inline-flex items-center gap-2 px-6 py-3 bg-linear-to-r from-emerald-400 to-emerald-600 hover:from-emerald-300 hover:to-emerald-500 text-primary-foreground font-bold rounded-xl shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] text-sm"
							>
								<Trophy size={16} />
								Play 6/46 Main Lottery
								<ArrowRight size={14} />
							</Link>
						</div>
					) : (
						<div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
							{/* ------------------------------------------------------ */}
							{/*  LEFT: Number Picker + Ticket Builder                  */}
							{/* ------------------------------------------------------ */}
							<div className="flex-1 min-w-0 space-y-6">
								{/* +EV Alert Banner */}
								{rolldownActive && (
									<div className="relative glass rounded-xl p-4 border border-magenta-500/30 overflow-hidden glow-magenta">
										<div className="absolute inset-0 bg-linear-to-r from-magenta-500/10 to-transparent" />
										<div className="relative z-10 flex items-start gap-3">
											<div className="p-1.5 rounded-lg bg-magenta-500/15 shrink-0 mt-0.5">
												<TrendingUp size={16} className="text-magenta-300" />
											</div>
											<div>
												<p className="font-display text-sm font-bold text-magenta-300 uppercase tracking-wide mb-0.5">
													+EV Window Open — Rolldown Active!
												</p>
												<p className="text-xs text-muted-foreground">
													The jackpot has reached the soft cap. If no one
													matches all 5, the entire jackpot is distributed among
													Match 4 (60%) and Match 3 (40%) winners using
													pari-mutuel division. Expected player edge:{" "}
													<span className="font-mono font-bold text-emerald-400">
														{rolldownEdgeLabel}
													</span>
												</p>
											</div>
										</div>
									</div>
								)}

								{/* Number Selection */}
								<div className="hud-frame rounded-lg p-5 sm:p-6">
									<div className="flex items-center justify-between mb-5">
										<div>
											<h2 className="font-display text-lg sm:text-xl lg:text-2xl font-bold uppercase tracking-wide text-foreground flex items-center gap-2">
												<Star size={18} className="text-cyan-300" />
												Pick Your Numbers
											</h2>
											<p className="text-xs text-muted-foreground mt-1">
												Select {PICK_COUNT} numbers from 1 to {TOTAL_NUMBERS}
											</p>
										</div>
										<div className="flex items-center gap-2">
											<span className="font-mono text-sm font-bold tabular-nums">
												<span
													className={
														selectedNumbers.size === PICK_COUNT
															? "text-cyan-300 neon-cyan"
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
														? "linear-gradient(90deg, oklch(0.78 0.14 195), oklch(0.85 0.1 190))"
														: "linear-gradient(90deg, oklch(0.72 0.15 90), oklch(0.82 0.13 85))",
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
											variant="emerald"
											size="lg"
											className="w-full lg:w-auto"
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
											className="w-full lg:w-auto"
										>
											<Shuffle size={14} />
											Quick Pick
										</Button>

										<Button
											onClick={() => addQuickPick(5)}
											disabled={tickets.length >= MAX_TICKETS - 4}
											variant="outline"
											size="lg"
											className="w-full lg:w-auto"
										>
											<Zap size={14} />
											Quick Pick ×5
										</Button>
									</div>

									{/* Selected numbers preview */}
									{selectedNumbers.size > 0 && (
										<div className="mt-4 pt-4 border-t border-foreground/5">
											<div className="flex items-center gap-2 mb-2">
												<span className="hud-label">Your Selection</span>
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
								<div className="hud-frame rounded-lg p-5 sm:p-6">
									<div className="flex items-center justify-between mb-4">
										<h2 className="font-display text-lg sm:text-xl lg:text-2xl font-bold uppercase tracking-wide text-foreground flex items-center gap-2">
											<ShoppingCart size={18} className="text-cyan-300" />
											Your Tickets
											{tickets.length > 0 && (
												<span className="ml-1 px-2 py-0.5 rounded-md bg-cyan-500/15 border border-cyan-500/30 font-mono text-xs font-bold text-cyan-300">
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
											<div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-cyan-500/5 border border-cyan-500/20 mb-4">
												<Zap size={24} className="text-cyan-300/60" />
											</div>
											<p className="text-sm text-muted-foreground mb-1">
												No tickets yet
											</p>
											<p className="text-xs text-muted-foreground/60">
												Pick your numbers above or use Quick Pick to get started
												fast
											</p>
										</div>
									) : (
										<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
											{tickets.map((ticket, i) => (
												<TicketCard
													key={`${i}-${ticket.numbers.join("-")}`}
													numbers={ticket.numbers}
													index={i}
													onRemove={() => removeTicket(i)}
													isQuickPick={ticket.isQuickPick}
												/>
											))}
										</div>
									)}

									{tickets.length > 0 && tickets.length < MAX_TICKETS && (
										<p className="font-mono text-[10px] text-muted-foreground/60 mt-3 text-center">
											{MAX_TICKETS - tickets.length} more ticket
											{MAX_TICKETS - tickets.length !== 1 ? "s" : ""} available
											(max {MAX_TICKETS} per transaction)
										</p>
									)}
								</div>
							</div>

							{/* ------------------------------------------------------ */}
							{/*  RIGHT: Cart + Prize Info                               */}
							{/* ------------------------------------------------------ */}
							<div className="lg:w-80 xl:w-96 shrink-0 space-y-6">
								<div className="lg:sticky lg:top-20">
									{/* Cart */}
									<div className="terminal-window">
										<div className="terminal-titlebar">
											<span className="w-2 h-2 rounded-full bg-red-500/80" />
											<span className="w-2 h-2 rounded-full bg-gold-400/80" />
											<span className="w-2 h-2 rounded-full bg-emerald-400/80" />
											<span className="ml-2 flex items-center gap-1.5">
												<ShoppingCart size={11} className="text-cyan-300" />
												Checkout :: Quick Pick
											</span>
										</div>
										<div className="p-5 sm:p-6">
											<h3 className="hud-label mb-4">Cart Summary</h3>

											<div className="space-y-3 mb-4">
												<div className="flex items-center justify-between text-sm">
													<span className="text-muted-foreground">Tickets</span>
													<span className="font-mono font-semibold text-cyan-300 tabular-nums">
														{tickets.length}
													</span>
												</div>
												<div className="flex items-center justify-between text-sm">
													<span className="text-muted-foreground">
														Price each
													</span>
													<span className="font-mono font-semibold text-cyan-300">
														${TICKET_PRICE.toFixed(2)} USDC
													</span>
												</div>
												<div className="h-px bg-cyan-500/10" />
												<div className="flex items-center justify-between">
													<span className="text-sm font-semibold text-foreground">
														Total
													</span>
													<span className="font-mono text-lg font-black text-gradient-gold tabular-nums">
														${totalCost.toFixed(2)} USDC
													</span>
												</div>
											</div>

											{purchaseError && (
												<div
													role="alert"
													className="mb-3 p-3 rounded-lg bg-red-500/5 border border-red-500/25"
												>
													<p className="font-mono text-[11px] text-red-400 font-medium">
														{purchaseError}
													</p>
												</div>
											)}

											{purchaseTx && (
												<div className="mb-3 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/25">
													<p className="font-mono text-[11px] text-emerald-400 font-medium">
														Purchase submitted!
													</p>
													<a
														href={`https://solscan.io/tx/${purchaseTx}`}
														target="_blank"
														rel="noopener noreferrer"
														className="text-[10px] text-emerald-400/70 hover:text-emerald-400 font-mono break-all"
													>
														{purchaseTx.slice(0, 32)}…
													</a>
												</div>
											)}

											{walletConnected ? (
												<Button
													onClick={handleCheckout}
													disabled={tickets.length === 0 || isPurchasing}
													variant="emerald"
													size="xl"
													className="w-full"
												>
													<ShoppingCart size={18} />
													{isPurchasing
														? "Processing…"
														: tickets.length > 1
															? `Buy ${tickets.length} Tickets`
															: tickets.length === 1
																? "Buy Ticket"
																: "Add Tickets First"}
												</Button>
											) : (
												<Button
													onClick={handleCheckout}
													variant="emerald"
													size="xl"
													className="w-full"
												>
													<Wallet size={18} />
													Connect Wallet to Play
												</Button>
											)}

											<p className="font-mono text-[10px] text-muted-foreground/60 text-center mt-3">
												Non-custodial &bull; Provably fair &bull; On-chain
												verification
											</p>
										</div>
									</div>

									{/* Key Differences Banner */}
									<div className="hud-frame rounded-lg p-4 mt-4">
										<h4 className="hud-label mb-3 flex items-center gap-2">
											<Sparkles size={12} className="text-gold-300" />
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
													qp: "1 in 324,632",
													main: "1 in 9,366,819",
												},
												{
													label: "Rolldown EV",
													qp: rolldownEdgeLabel,
													main: "+62%",
												},
											].map((row) => (
												<div
													key={row.label}
													className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-[11px] gap-1"
												>
													<span className="text-muted-foreground shrink-0">
														{row.label}
													</span>
													<div className="flex items-center gap-3">
														<span className="font-mono font-bold text-cyan-300">
															{row.qp}
														</span>
														<span className="text-muted-foreground/60">vs</span>
														<span className="font-mono text-muted-foreground">
															{row.main}
														</span>
													</div>
												</div>
											))}
										</div>
									</div>

									{/* Prize Tiers */}
									<div className="hud-frame rounded-lg p-5 sm:p-6 mt-4">
										<button
											type="button"
											onClick={() => setShowPrizeInfo(!showPrizeInfo)}
											aria-expanded={showPrizeInfo}
											aria-controls="qp-prize-tiers"
											className="w-full flex items-center justify-between"
										>
											<span className="hud-label flex items-center gap-2">
												<Info size={14} className="text-cyan-300" />
												Normal Prize Tiers
											</span>
											<ChevronRight
												size={14}
												className={`text-muted-foreground transition-transform duration-200 ${
													showPrizeInfo ? "rotate-90" : ""
												}`}
											/>
										</button>

										{showPrizeInfo && (
											<div
												id="qp-prize-tiers"
												className="mt-4 overflow-x-auto pb-1 -mx-1 px-1"
											>
												<div className="flex lg:block gap-2 min-w-max">
													{PRIZE_TIERS.map((tier) => (
														<div
															key={tier.match}
															className="flex items-center justify-between py-2 px-3 rounded-lg bg-foreground/2 shrink-0"
														>
															<div className="flex items-center gap-2">
																<div
																	className={`w-6 h-6 rounded-full flex items-center justify-center font-mono text-[10px] font-bold ${
																		tier.color === "gold"
																			? "bg-gold-500/20 text-gold-300"
																			: tier.color === "emerald"
																				? "bg-emerald-500/20 text-emerald-400"
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
																	className={`font-mono text-xs font-bold whitespace-nowrap ${
																		tier.color === "gold"
																			? "text-gold-300"
																			: tier.color === "emerald"
																				? "text-emerald-400"
																				: "text-muted-foreground"
																	}`}
																>
																	{tier.prize}
																</span>
																<div className="font-mono text-[9px] text-muted-foreground/60 whitespace-nowrap">
																	{tier.odds}
																</div>
															</div>
														</div>
													))}
												</div>

												<p className="text-[10px] text-muted-foreground pt-2 border-t border-foreground/5">
													No prize for Match 2 in Quick Pick Express (unlike the
													main lottery's free ticket)
												</p>
											</div>
										)}
									</div>

									{/* Rolldown Tiers */}
									<div className="hud-frame rounded-lg p-5 sm:p-6 mt-4">
										<button
											type="button"
											onClick={() => setShowRolldownInfo(!showRolldownInfo)}
											aria-expanded={showRolldownInfo}
											aria-controls="qp-rolldown-tiers"
											className="w-full flex items-center justify-between"
										>
											<span className="hud-label flex items-center gap-2">
												<TrendingUp size={14} className="text-magenta-300" />
												Rolldown Prizes
											</span>
											<ChevronRight
												size={14}
												className={`text-muted-foreground transition-transform duration-200 ${
													showRolldownInfo ? "rotate-90" : ""
												}`}
											/>
										</button>

										{showRolldownInfo && (
											<div id="qp-rolldown-tiers" className="mt-4 space-y-2">
												{ROLLDOWN_TIERS.map((tier) => (
													<div
														key={tier.match}
														className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-magenta-500/5 border border-magenta-500/20"
													>
														<div className="flex items-center gap-2">
															<div className="w-6 h-6 rounded-full flex items-center justify-center font-mono text-[10px] font-bold bg-magenta-500/20 text-magenta-300 shrink-0">
																{tier.match}
															</div>
															<div>
																<span className="text-xs text-muted-foreground font-medium whitespace-nowrap">
																	Match {tier.match}
																</span>
																<div className="font-mono text-[9px] text-muted-foreground whitespace-nowrap">
																	{tier.share} of jackpot pool
																</div>
															</div>
														</div>
														<span className="font-mono text-sm font-bold text-magenta-300 whitespace-nowrap ml-4">
															{tier.estimate}*
														</span>
													</div>
												))}

												<div className="pt-2 border-t border-foreground/5 space-y-1.5">
													<div className="flex items-start gap-2 text-[10px] text-muted-foreground">
														<AlertTriangle
															size={10}
															className="mt-0.5 shrink-0 text-gold-300/60"
														/>
														<span>
															*Rolldown prizes are pari-mutuel estimates. Actual
															= Pool ÷ Winners. Fewer winners means bigger
															prizes for you ($30K-$50K pool).
														</span>
													</div>
													<div className="flex items-start gap-2 text-[10px] text-emerald-400/70">
														<TrendingUp size={10} className="mt-0.5 shrink-0" />
														<span>
															During rolldown, your expected value is{" "}
															<span className="font-mono font-bold text-emerald-400">
																{rolldownEdgeLabel}
															</span>{" "}
															— the math flips and you have the edge!
														</span>
													</div>
												</div>
											</div>
										)}
									</div>

									{/* Quick links */}
									<div className="hud-frame rounded-lg p-4 mt-4 space-y-2">
										<Link
											to="/play"
											className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-foreground/3 transition-colors group"
										>
											<div className="flex items-center gap-2">
												<Trophy
													size={14}
													className="text-gold/60 group-hover:text-gold transition-colors"
												/>
												<span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
													6/46 Main Lottery
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
					)}
				</div>
			</section>
		</div>
	);
}
