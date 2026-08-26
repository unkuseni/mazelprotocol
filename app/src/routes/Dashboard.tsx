import { PublicKey } from "@solana/web3.js";
import {
	Activity,
	AlertTriangle,
	ArrowDownRight,
	ArrowRight,
	ArrowUpRight,
	BarChart3,
	CheckCircle2,
	Clock,
	ExternalLink,
	Gavel,
	Loader2,
	type LucideIcon,
	Shield,
	ShieldCheck,
	SkipForward,
	Star,
	Ticket,
	TrendingUp,
	Trophy,
	Users,
	Wallet,
	X,
	Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CountdownTimer } from "@/components/CountdownTimer";
import { EVBadge } from "@/components/EVCalculator";
import { JackpotDisplay } from "@/components/JackpotDisplay";
import { LotteryBallRow, WinningNumbers } from "@/components/LotteryBalls";
import { RolldownGauge } from "@/components/RolldownGauge";
import { Button } from "@/components/ui/button";
import { useDraws } from "@/hooks/use-draws";
import { useLotteryState } from "@/hooks/use-lottery-state";
import { useTickets } from "@/hooks/use-tickets";
import { USDC_MINT } from "@/lib/anchor/pda";
import { useAnchorProvider } from "@/lib/anchor/provider";
import { fetchUserStats } from "@/lib/anchor/transactions";
import {
	advanceDraw,
	challengeDraw,
	checkSolvency,
} from "@/lib/anchor/transactions-lp-syndicate";
import { useAppKit, useAppKitAccount } from "@/lib/appkit-provider";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function formatCurrency(value: number): string {
	if (value >= 1_000_000) {
		const m = value / 1_000_000;
		return m % 1 === 0 ? `$${m.toFixed(0)}M` : `$${m.toFixed(1)}M`;
	}
	if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
	return `$${value.toFixed(2)}`;
}

function formatUSDC(bigintValue: bigint): string {
	const dollars = Number(bigintValue) / 1_000_000;
	if (dollars >= 1_000) return `$${(dollars / 1000).toFixed(1)}K`;
	return `$${dollars.toFixed(2)}`;
}

function timeAgo(timestamp: number): string {
	const now = Date.now() / 1000;
	const diff = now - timestamp;
	if (diff < 60) return "just now";
	if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
	if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
	return `${Math.floor(diff / 86400)}d ago`;
}

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                            */
/* -------------------------------------------------------------------------- */

function StatCard({
	label,
	value,
	sub,
	icon: Icon,
	accent = "default",
	positive,
	negativeLabel,
}: {
	label: string;
	value: string;
	sub?: string;
	icon: LucideIcon;
	accent?: "emerald" | "gold" | "amber" | "default" | "red";
	positive?: boolean;
	negativeLabel?: string;
}) {
	const colorMap = {
		emerald: {
			iconBg: "bg-emerald-500/10",
			iconColor: "text-emerald-400",
			valueColor: "neon-green",
		},
		gold: {
			iconBg: "bg-gold-500/10",
			iconColor: "text-gold-300",
			valueColor: "neon-amber",
		},
		red: {
			iconBg: "bg-magenta-500/10",
			iconColor: "text-magenta-300",
			valueColor: "neon-magenta",
		},
		amber: {
			iconBg: "bg-magenta-500/10",
			iconColor: "text-magenta-300",
			valueColor: "neon-magenta",
		},
		default: {
			iconBg: "bg-cyan-500/10",
			iconColor: "text-cyan-300",
			valueColor: "text-foreground",
		},
	};

	const colors = colorMap[accent];

	return (
		<div className="hud-frame rounded-lg p-4">
			<div className="flex items-center gap-3 mb-3">
				<div
					className={cn(
						"w-9 h-9 rounded-xl flex items-center justify-center",
						colors.iconBg,
					)}
				>
					<Icon size={18} className={colors.iconColor} />
				</div>
				<span className="hud-label">{label}</span>
			</div>
			<div
				className={cn(
					"font-mono text-2xl font-black tracking-tight",
					colors.valueColor,
				)}
			>
				{value}
			</div>
			{sub && <p className="text-[10px] text-muted-foreground mt-1">{sub}</p>}
			{positive !== undefined && (
				<div className="flex items-center gap-1 mt-2">
					{positive ? (
						<ArrowUpRight size={12} className="text-emerald-400" />
					) : (
						<ArrowDownRight size={12} className={colors.iconColor} />
					)}
					<span
						className={cn(
							"text-[10px] font-bold",
							positive ? "text-emerald-400" : colors.valueColor,
						)}
					>
						{positive ? "Profitable" : (negativeLabel ?? "In Play")}
					</span>
				</div>
			)}
		</div>
	);
}

/* -------------------------------------------------------------------------- */
/*  Protocol Safety (permissionless watchdog)                                  */
/* -------------------------------------------------------------------------- */

type ActionPhase = "idle" | "running" | "ok" | "error";

interface ActionFeedback {
	phase: ActionPhase;
	message?: string;
	/** Transaction signature, shown as a Solscan link on success */
	tx?: string;
}

const SAFETY_ACCENTS = {
	cyan: {
		tile: "bg-cyan-500/10 border-cyan-500/25 text-cyan-300 shadow-[0_0_14px_rgba(0,229,255,0.2)]",
		button:
			"bg-linear-to-r from-cyan-400 to-cyan-600 hover:from-cyan-300 hover:to-cyan-500 text-primary-foreground shadow-lg shadow-cyan-500/25 hover:shadow-cyan-400/40",
		dot: "bg-cyan-400 shadow-[0_0_8px_rgba(0,229,255,0.9)]",
	},
	magenta: {
		tile: "bg-magenta-500/10 border-magenta-500/25 text-magenta-300 shadow-[0_0_14px_rgba(255,46,196,0.2)]",
		button:
			"bg-linear-to-r from-magenta-400 to-magenta-600 hover:from-magenta-300 hover:to-magenta-500 text-primary-foreground shadow-lg shadow-magenta-500/25 hover:shadow-magenta-400/40",
		dot: "bg-magenta-400 shadow-[0_0_8px_rgba(255,46,196,0.9)]",
	},
	gold: {
		tile: "bg-gold-500/10 border-gold-500/25 text-gold-300 shadow-[0_0_14px_rgba(255,214,10,0.2)]",
		button:
			"bg-linear-to-r from-gold-400 to-gold-600 hover:from-gold-300 hover:to-gold-500 text-black shadow-lg shadow-gold-500/25 hover:shadow-gold-400/40",
		dot: "bg-gold-400 shadow-[0_0_8px_rgba(255,214,10,0.9)]",
	},
} as const;

/**
 * One permissionless watchdog instruction card — neon tile, hud-label
 * eyebrow, branded action button, and inline tx feedback.
 */
export function SafetyCard({
	accent,
	icon: Icon,
	title,
	eyebrow,
	description,
	actionLabel,
	actionIcon: ActionIcon,
	onAction,
	loading = false,
	loadingLabel = "Broadcasting…",
	disabled = false,
	feedback,
}: {
	accent: keyof typeof SAFETY_ACCENTS;
	icon: LucideIcon;
	title: string;
	eyebrow: string;
	description: string;
	actionLabel: string;
	actionIcon: LucideIcon;
	onAction: () => void;
	loading?: boolean;
	loadingLabel?: string;
	disabled?: boolean;
	feedback?: ActionFeedback | null;
}) {
	const a = SAFETY_ACCENTS[accent];

	return (
		<div className="relative hud-frame rounded-xl p-5 flex flex-col gap-4">
			<div className="flex items-center gap-3">
				<div
					className={cn(
						"w-10 h-10 rounded-lg border flex items-center justify-center shrink-0",
						a.tile,
					)}
				>
					<Icon size={18} aria-hidden />
				</div>
				<div className="min-w-0">
					<p className="hud-label flex items-center gap-1.5">
						<span
							className={cn("w-1.5 h-1.5 rounded-full animate-pulse", a.dot)}
						/>
						{eyebrow}
					</p>
					<h3 className="font-display text-sm font-bold text-foreground uppercase tracking-wide mt-0.5">
						{title}
					</h3>
				</div>
			</div>

			<p className="text-xs text-muted-foreground leading-relaxed -mt-2">
				{description}
			</p>

			<button
				type="button"
				onClick={onAction}
				disabled={disabled || loading}
				className={cn(
					"mt-auto w-full h-10 inline-flex items-center justify-center gap-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-40 disabled:pointer-events-none disabled:hover:translate-y-0",
					a.button,
				)}
			>
				{loading ? (
					<>
						<Loader2 size={14} className="animate-spin" />
						{loadingLabel}
					</>
				) : (
					<>
						<ActionIcon size={14} />
						{actionLabel}
					</>
				)}
			</button>

			{feedback?.phase === "ok" && (
				<div
					role="status"
					className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5"
				>
					<CheckCircle2
						size={13}
						className="text-emerald-400 shrink-0 mt-0.5"
					/>
					<div className="min-w-0 text-[11px] leading-relaxed">
						<p className="font-semibold text-emerald-300">
							{feedback.message ?? "Transaction confirmed."}
						</p>
						{feedback.tx && (
							<a
								href={`https://solscan.io/tx/${feedback.tx}`}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-1 text-emerald-400/70 hover:text-emerald-300 font-mono break-all"
							>
								{feedback.tx.slice(0, 24)}…
								<ExternalLink size={9} className="shrink-0" />
							</a>
						)}
					</div>
				</div>
			)}
			{feedback?.phase === "error" && (
				<div
					role="alert"
					className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2.5"
				>
					<AlertTriangle size={13} className="text-red-400 shrink-0 mt-0.5" />
					<p className="text-[11px] leading-relaxed text-red-300">
						{feedback.message ?? "Transaction failed."}
					</p>
				</div>
			)}
		</div>
	);
}

function RecentDrawCard({
	drawId,
	date,
	numbers,
	wasRolldown,
	totalTickets,
	jackpot,
	matchCounts,
}: {
	drawId: number;
	date: string;
	numbers: number[];
	wasRolldown: boolean;
	totalTickets: number;
	jackpot: string;
	matchCounts: Record<number, number>;
}) {
	return (
		<div
			className={cn(
				"hud-frame rounded-lg p-5 transition-colors",
				wasRolldown
					? "bg-emerald-500/10 border-emerald-500/30"
					: "border-cyan-500/10",
			)}
		>
			<div className="flex items-center justify-between mb-3">
				<div>
					<p className="hud-label">Draw #{drawId}</p>
					<p className="font-mono text-[10px] text-muted-foreground/60">
						{date}
					</p>
				</div>
				{wasRolldown && (
					<div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/20">
						<Zap size={10} className="text-emerald-400" />
						<span className="text-[9px] font-bold text-emerald-400 uppercase">
							Rolldown
						</span>
					</div>
				)}
			</div>

			<WinningNumbers numbers={numbers} size="sm" />

			<div className="grid grid-cols-3 gap-2 mt-4 text-center">
				<div>
					<p className="hud-label">Tickets</p>
					<p className="font-mono text-xs font-bold text-cyan-300">
						{totalTickets.toLocaleString()}
					</p>
				</div>
				<div>
					<p className="hud-label">Jackpot</p>
					<p className="font-mono text-xs font-bold text-gold-300">{jackpot}</p>
				</div>
				<div>
					<p className="hud-label">Winners</p>
					<p className="font-mono text-xs font-bold text-foreground">
						{Object.values(matchCounts).reduce((a, b) => a + b, 0)}
					</p>
				</div>
			</div>
		</div>
	);
}

function ActiveTicketsPanel() {
	const { tickets, unclaimedTickets, unclaimedPrizeTotal, loading } =
		useTickets();

	if (loading) {
		return (
			<div className="hud-frame rounded-lg p-6 animate-pulse">
				<div className="h-5 w-32 bg-foreground/5 rounded mb-4" />
				{[1, 2, 3].map((i) => (
					<div key={i} className="h-16 bg-foreground/5 rounded-lg mb-2" />
				))}
			</div>
		);
	}

	return (
		<div className="hud-frame rounded-lg p-6">
			<div className="flex items-center justify-between mb-4">
				<h3 className="font-display text-sm font-bold text-foreground uppercase tracking-wide flex items-center gap-2">
					<Ticket size={16} className="text-gold-300" />
					Your Tickets
				</h3>
				<Link
					to="/tickets"
					className="text-[10px] font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
				>
					View All <ArrowRight size={10} />
				</Link>
			</div>

			{/* Unclaimed prizes callout */}
			{unclaimedTickets.length > 0 && (
				<div className="mb-4 p-3 rounded-lg bg-gold-500/10 border border-gold-500/30">
					<div className="flex items-center justify-between">
						<span className="text-xs font-semibold text-gold-300">
							{unclaimedTickets.length} unclaimed prize
							{unclaimedTickets.length > 1 ? "s" : ""}
						</span>
						<span className="font-mono text-sm font-bold text-gold-300">
							{formatUSDC(unclaimedPrizeTotal)}
						</span>
					</div>
				</div>
			)}

			{/* Recent tickets */}
			{tickets.length === 0 ? (
				<div className="text-center py-8">
					<Ticket size={32} className="mx-auto mb-3 text-muted-foreground/30" />
					<p className="text-sm text-muted-foreground">No tickets yet</p>
					<Link
						to="/play"
						className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-emerald-400 hover:text-emerald-300"
					>
						Buy your first ticket <ArrowRight size={10} />
					</Link>
				</div>
			) : (
				<div className="space-y-2">
					{tickets.slice(0, 5).map((ticket) => (
						<div
							key={ticket.id}
							className="flex items-center justify-between p-3 rounded-lg bg-cyan-500/5 border border-cyan-500/10"
						>
							<div className="flex items-center gap-3">
								<div
									className={cn(
										"w-2 h-2 rounded-full",
										ticket.matchCount >= 3
											? "bg-gold"
											: ticket.matchCount === 2
												? "bg-emerald"
												: "bg-muted-foreground/30",
									)}
								/>
								<div>
									<LotteryBallRow
										numbers={ticket.numbers}
										size="sm"
										variant={ticket.matchCount >= 4 ? "gold" : "muted"}
										animated={false}
										staggerDelay={0}
									/>
									<p className="font-mono text-[9px] text-muted-foreground mt-1">
										Draw #{ticket.drawId} · {timeAgo(ticket.purchaseTime)}
									</p>
								</div>
							</div>
							<div className="text-right">
								{ticket.matchCount >= 2 && (
									<span className="font-mono text-xs font-bold text-gold-300">
										{formatUSDC(ticket.prize)}
									</span>
								)}
								{ticket.matchCount < 2 && (
									<span className="text-[10px] text-muted-foreground">
										No prize
									</span>
								)}
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

function WalletNotConnected() {
	const { open } = useAppKit();

	return (
		<div className="min-h-[60vh] flex items-center justify-center px-4 sm:px-6 lg:px-8">
			<div className="text-center max-w-md">
				<div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto mb-6">
					<Wallet size={24} className="text-emerald-400 sm:size-7" />
				</div>
				<h2 className="font-display text-xl sm:text-2xl font-black text-foreground uppercase tracking-wide mb-3">
					Connect Your Wallet
				</h2>
				<p className="text-sm sm:text-base text-muted-foreground mb-8">
					View your lottery dashboard, track tickets, monitor jackpots, and
					manage your syndicates — all from one place.
				</p>
				<button
					type="button"
					onClick={() => open?.()}
					className="inline-flex items-center gap-2 px-6 sm:px-8 py-3 sm:py-4 rounded-xl bg-linear-to-b from-emerald-400 to-emerald-600 text-black font-bold text-base sm:text-lg shadow-lg shadow-emerald-500/25 hover:from-emerald-300 hover:to-emerald-500 hover:shadow-emerald-500/40 transition-all hover:-translate-y-0.5"
				>
					<Wallet size={18} className="sm:size-5" />
					Connect Wallet
					<ArrowRight size={18} className="sm:size-5" />
				</button>
			</div>
		</div>
	);
}

/* -------------------------------------------------------------------------- */
/*  Main Dashboard Page                                                       */
/* -------------------------------------------------------------------------- */

export default function DashboardPage() {
	const { isConnected } = useAppKitAccount();
	const {
		jackpotDollars,
		rolldownActive,
		loading: jackpotLoading,
		nextDrawTimeMs,
	} = useLotteryState();
	const { draws, currentDrawId, loading: drawsLoading } = useDraws();
	const { tickets, unclaimedTickets, unclaimedPrizeTotal } = useTickets();

	// On-chain lifetime spend (main lottery UserStats.total_spent in USDC
	// lamports, divided by 1e6). Fall back to an estimate when unavailable.
	const { connectedProvider } = useAnchorProvider();
	const [showChallenge, setShowChallenge] = useState(false);
	const [challengeDrawId, setChallengeDrawId] = useState("");
	const [challengeCounts, setChallengeCounts] = useState({
		match6: "0",
		match5: "0",
		match4: "0",
		match3: "0",
		match2: "0",
	});
	const [challengeEvidence, setChallengeEvidence] = useState("");
	const [challengeLoading, setChallengeLoading] = useState(false);
	const [challengeError, setChallengeError] = useState<string | null>(null);

	// Permissionless watchdog actions — per-action feedback (was previously
	// silent: errors only went to console, so a failed check looked like a
	// success no-op).
	const [solvencyFeedback, setSolvencyFeedback] =
		useState<ActionFeedback | null>(null);
	const [advanceFeedback, setAdvanceFeedback] = useState<ActionFeedback | null>(
		null,
	);

	const runCheckSolvency = useCallback(async () => {
		const provider = connectedProvider;
		if (!provider) return;
		setSolvencyFeedback({ phase: "running" });
		try {
			const tx = await checkSolvency(provider);
			setSolvencyFeedback({
				phase: "ok",
				message: "Solvency check passed — balances match accounting.",
				tx,
			});
		} catch (err) {
			setSolvencyFeedback({
				phase: "error",
				message: err instanceof Error ? err.message : "Solvency check failed",
			});
		}
	}, [connectedProvider]);

	const runAdvanceDraw = useCallback(async () => {
		const provider = connectedProvider;
		if (!provider) return;
		setAdvanceFeedback({ phase: "running" });
		try {
			const tx = await advanceDraw(provider);
			setAdvanceFeedback({
				phase: "ok",
				message: "Draw advanced — tx confirmed.",
				tx,
			});
		} catch (err) {
			setAdvanceFeedback({
				phase: "error",
				message: err instanceof Error ? err.message : "Failed to advance draw",
			});
		}
	}, [connectedProvider]);

	const walletPubkey = connectedProvider?.wallet.publicKey ?? null;
	const [onChainTotalSpent, setOnChainTotalSpent] = useState<number | null>(
		null,
	);

	useEffect(() => {
		let cancelled = false;
		if (!connectedProvider || !walletPubkey) {
			setOnChainTotalSpent(null);
			return;
		}
		void (async () => {
			try {
				const stats = await fetchUserStats(connectedProvider, walletPubkey);
				if (cancelled || !stats) return;
				const raw = stats.totalSpent ?? stats.total_spent ?? 0;
				const lamports =
					typeof raw === "bigint"
						? raw
						: typeof raw === "number"
							? BigInt(Math.trunc(raw))
							: BigInt(String(raw ?? 0));
				if (!cancelled) {
					setOnChainTotalSpent(Number(lamports) / 1_000_000);
				}
			} catch {
				// Non-fatal — fall back to the estimate below
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [connectedProvider, walletPubkey]);

	// Compute player stats from on-chain data
	const playerStats = useMemo(() => {
		if (!isConnected || tickets.length === 0) return null;

		// Prefer the on-chain lifetime spend. If the UserStats fetch failed
		// (or hasn't resolved yet), fall back to the old per-ticket estimate
		// and label it as such.
		const usingEstimate = onChainTotalSpent === null;
		const totalSpent =
			onChainTotalSpent !== null ? onChainTotalSpent : tickets.length * 2.5;
		const totalWon = tickets.reduce(
			(sum, t) => sum + Number(t.prize) / 1_000_000,
			0,
		);
		const netProfit = totalWon - totalSpent;
		const winningTickets = tickets.filter((t) => t.matchCount >= 2).length;
		const winRate =
			tickets.length > 0 ? (winningTickets / tickets.length) * 100 : 0;

		return {
			totalTickets: tickets.length,
			totalSpent,
			totalSpentIsEstimate: usingEstimate,
			totalWon,
			netProfit,
			winRate,
			unclaimedCount: unclaimedTickets.length,
			unclaimedTotal: Number(unclaimedPrizeTotal) / 1_000_000,
		};
	}, [
		tickets,
		unclaimedTickets,
		unclaimedPrizeTotal,
		isConnected,
		onChainTotalSpent,
	]);

	if (!isConnected) {
		return (
			<div className="min-h-screen">
				<WalletNotConnected />
			</div>
		);
	}

	return (
		<div className="min-h-screen">
			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
				{/* Page header */}
				<div className="mb-6 sm:mb-8">
					<p className="hud-label mb-2">{"// PLAYER COMMAND CENTER"}</p>
					<h1 className="font-display text-2xl sm:text-3xl lg:text-4xl font-black text-foreground uppercase tracking-wide mb-2">
						Dashboard
					</h1>
					<p className="text-xs sm:text-sm md:text-base text-muted-foreground">
						Your lottery command center — track jackpots, monitor your tickets,
						and stay ahead of rolldown events.
					</p>
				</div>

				<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
					{/* Main column */}
					<div className="lg:col-span-2 space-y-6">
						{/* Live jackpot + rolldown */}
						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							<JackpotDisplay
								amount={jackpotDollars}
								size="md"
								glow={jackpotDollars >= 1_575_000}
								showRolldownStatus
								rolldownActive={rolldownActive}
								softCap={1_750_000}
							/>
							<div className="hud-frame rounded-lg flex flex-col items-center justify-center p-4">
								{nextDrawTimeMs ? (
									<CountdownTimer
										size="sm"
										showUrgency
										targetTime={nextDrawTimeMs}
									/>
								) : (
									<div className="text-[10px] text-muted-foreground/60">
										Next draw schedule loading…
									</div>
								)}
								{rolldownActive && (
									<div className="mt-3">
										<EVBadge
											jackpotAmount={jackpotDollars}
											rolldownActive={rolldownActive}
											loading={jackpotLoading}
										/>
									</div>
								)}
							</div>
						</div>

						{/* Rolldown gauge */}
						<RolldownGauge
							jackpotAmount={jackpotDollars}
							rolldownActive={rolldownActive}
							loading={jackpotLoading}
						/>

						{/* Quick stats */}
						{playerStats && (
							<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
								<StatCard
									label="Tickets Bought"
									value={playerStats.totalTickets.toString()}
									sub="Lifetime"
									icon={Ticket}
									accent="default"
								/>
								<StatCard
									label="Total Won"
									value={formatCurrency(playerStats.totalWon)}
									sub={`${playerStats.winRate.toFixed(1)}% win rate`}
									icon={Trophy}
									accent="gold"
								/>
								<StatCard
									label="Player Edge"
									value={formatCurrency(Math.abs(playerStats.netProfit))}
									sub={
										playerStats.totalSpentIsEstimate
											? "Lifetime (est.)"
											: "Lifetime"
									}
									icon={TrendingUp}
									accent={playerStats.netProfit >= 0 ? "emerald" : "amber"}
									positive={playerStats.netProfit >= 0}
									negativeLabel="In Play"
								/>
								<StatCard
									label="Unclaimed"
									value={formatCurrency(playerStats.unclaimedTotal)}
									sub={`${playerStats.unclaimedCount} prizes`}
									icon={Star}
									accent={playerStats.unclaimedCount > 0 ? "gold" : "default"}
								/>
							</div>
						)}

						{/* Recent draws */}
						<div>
							<div className="flex items-center justify-between mb-4">
								<h2 className="font-display text-base sm:text-lg font-bold text-foreground uppercase tracking-wide flex items-center gap-2">
									<Clock size={18} className="text-cyan-300" />
									Recent Draws
								</h2>
								<Link
									to="/results"
									className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
								>
									All Results <ArrowRight size={12} />
								</Link>
							</div>

							{drawsLoading ? (
								<div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-pulse">
									{[1, 2].map((i) => (
										<div key={i} className="h-40 bg-foreground/5 rounded-2xl" />
									))}
								</div>
							) : draws.length === 0 ? (
								<div className="hud-frame rounded-lg text-center py-8 sm:py-12">
									<Activity
										size={32}
										className="mx-auto mb-3 text-muted-foreground/30"
									/>
									<p className="text-xs sm:text-sm text-muted-foreground">
										No draw results yet
									</p>
									<p className="text-[10px] sm:text-xs text-muted-foreground/60 mt-1">
										Draw #{currentDrawId} is currently active
									</p>
								</div>
							) : (
								<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
									{draws.slice(0, 4).map((draw) => (
										<RecentDrawCard
											key={draw.drawId}
											drawId={draw.drawId}
											date={new Date(
												Number(draw.timestamp) * 1000,
											).toLocaleDateString("en-US", {
												month: "short",
												day: "numeric",
												hour: "2-digit",
												minute: "2-digit",
											})}
											numbers={draw.winningNumbers}
											wasRolldown={draw.wasRolldown}
											totalTickets={draw.totalTickets}
											jackpot={formatCurrency(
												Number(draw.jackpotAtDraw) / 1_000_000,
											)}
											matchCounts={draw.matchCounts}
										/>
									))}
								</div>
							)}
						</div>
					</div>

					{/* Sidebar */}
					<div className="space-y-6">
						{/* Active tickets */}
						<ActiveTicketsPanel />

						{/* Quick links */}
						<div className="hud-frame rounded-lg p-4 sm:p-6">
							<h3 className="font-display text-xs sm:text-sm font-bold text-foreground uppercase tracking-wide mb-4 flex items-center gap-2">
								<Zap size={16} className="text-gold-300" />
								Quick Actions
							</h3>
							<div className="space-y-2">
								<Link
									to="/play"
									className="flex items-center justify-between p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/15 transition-colors group"
								>
									<div className="flex items-center gap-3">
										<Trophy size={16} className="text-emerald-400 shrink-0" />
										<span className="text-xs sm:text-sm font-medium text-foreground">
											Buy Tickets
										</span>
									</div>
									<ArrowRight
										size={14}
										className="text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
									/>
								</Link>
								<Link
									to="/syndicates"
									className="flex items-center justify-between p-3 rounded-xl bg-foreground/3 border border-foreground/5 hover:bg-foreground/5 transition-colors group"
								>
									<div className="flex items-center gap-3">
										<Users
											size={16}
											className="text-muted-foreground shrink-0"
										/>
										<span className="text-xs sm:text-sm font-medium text-foreground">
											Syndicates
										</span>
									</div>
									<ArrowRight
										size={14}
										className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
									/>
								</Link>
								<Link
									to="/results"
									className="flex items-center justify-between p-3 rounded-xl bg-foreground/3 border border-foreground/5 hover:bg-foreground/5 transition-colors group"
								>
									<div className="flex items-center gap-3">
										<BarChart3
											size={16}
											className="text-muted-foreground shrink-0"
										/>
										<span className="text-xs sm:text-sm font-medium text-foreground">
											Draw Results
										</span>
									</div>
									<ArrowRight
										size={14}
										className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
									/>
								</Link>
								<Link
									to="/learn/rolldown"
									className="flex items-center justify-between p-3 rounded-xl bg-foreground/3 border border-foreground/5 hover:bg-foreground/5 transition-colors group"
								>
									<div className="flex items-center gap-3">
										<Shield
											size={16}
											className="text-muted-foreground shrink-0"
										/>
										<span className="text-xs sm:text-sm font-medium text-foreground">
											How Rolldown Works
										</span>
									</div>
									<ArrowRight
										size={14}
										className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
									/>
								</Link>
							</div>
						</div>
					</div>
				</div>

				{/* Protocol Safety — permissionless watchdog (full-width, horizontal on lg) */}
				<div className="mt-8">
						<div className="relative hud-frame rounded-2xl overflow-hidden px-5 py-6 sm:p-6">
							{/* Cyberpunk backdrop: grid + neon divider */}
							<div className="pointer-events-none absolute inset-0 hero-grid opacity-15" />
							<div className="pointer-events-none absolute inset-x-0 top-0 section-divider" />

							<div className="relative z-10">
								<header className="mb-5">
									<p className="hud-label mb-1.5">
										{"// PERMISSIONLESS WATCHDOG"}
									</p>
									<h2 className="font-display text-lg sm:text-xl font-black uppercase tracking-wide text-foreground flex items-center gap-2">
										<ShieldCheck
											size={20}
											className="text-cyan-300 drop-shadow-[0_0_10px_rgba(0,229,255,0.7)]"
											aria-hidden
										/>
										Protocol Safety
									</h2>
									<p className="text-xs sm:text-sm text-muted-foreground leading-relaxed mt-2">
										Three watchdog instructions keep the protocol honest. Anyone
										can run them — each transaction is signed by your wallet and
										executed on-chain.
									</p>
								</header>

								<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
									<SafetyCard
										accent="cyan"
										icon={Shield}
										eyebrow="Verify pool funding"
										title="Verify Solvency"
										description="Permissionless check: if token balances don't match accounting, the lottery automatically pauses."
										actionLabel="Check Now"
										actionIcon={ShieldCheck}
										onAction={runCheckSolvency}
										loading={solvencyFeedback?.phase === "running"}
										loadingLabel="Checking…"
										disabled={!connectedProvider}
										feedback={solvencyFeedback}
									/>
									<SafetyCard
										accent="magenta"
										icon={SkipForward}
										eyebrow="Unstick a stalled draw"
										title="Advance Stuck Draw"
										description="Permissionless fallback: advance a draw the bot hasn't finalized within 30+ minutes."
										actionLabel="Advance Draw"
										actionIcon={Zap}
										onAction={runAdvanceDraw}
										loading={advanceFeedback?.phase === "running"}
										loadingLabel="Advancing…"
										disabled={!connectedProvider}
										feedback={advanceFeedback}
									/>
									{/* Challenge a finalized draw (bonded dispute, permissionless) */}
									<div className="sm:col-span-2 lg:col-span-1">
										<SafetyCard
											accent="gold"
											icon={Gavel}
											eyebrow="Bonded dispute — $500 USDC"
											title="Challenge Draw Results"
											description="Dispute a finalized draw's winner counts. If upheld, the bond is refunded plus a $500 reward; frivolous challenges are slashed."
											actionLabel="Post Challenge"
											actionIcon={AlertTriangle}
											onAction={() => setShowChallenge(true)}
										/>
									</div>
								</div>
							</div>
						</div>
					</div>
			</div>
			{/* Challenge modal */}
			{showChallenge && (
				<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
					<button
						type="button"
						className="absolute inset-0 bg-black/70 backdrop-blur-sm"
						onClick={() => setShowChallenge(false)}
						aria-label="Close"
					/>
					<div className="relative glass-strong rounded-2xl p-6 max-w-md w-full border border-gold-500/30 max-h-[90vh] overflow-y-auto">
						<div className="flex items-center justify-between mb-4">
							<h2 className="font-display text-lg font-bold text-foreground uppercase tracking-wide">
								Challenge Draw
							</h2>
							<button
								type="button"
								onClick={() => setShowChallenge(false)}
								className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/5"
								aria-label="Close challenge dialog"
							>
								<X size={18} />
							</button>
						</div>
						<p className="text-xs text-muted-foreground mb-4">
							Post a $500 USDC bond to dispute a finalized draw&apos;s winner
							counts. If upheld, the bond is refunded + $500 reward. Frivolous
							challenges are slashed.
						</p>
						{challengeError && (
							<div
								role="alert"
								className="mb-3 rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-400"
							>
								{challengeError}
							</div>
						)}
						<div className="space-y-3">
							<input
								type="number"
								value={challengeDrawId}
								onChange={(e) => setChallengeDrawId(e.target.value)}
								placeholder="Draw ID"
								aria-label="Draw ID to challenge"
								className="w-full h-10 px-3 rounded-xl bg-surface-1/70 border border-cyan-500/20 text-sm text-foreground placeholder-gray-600 focus:outline-none focus:border-cyan-400/60"
							/>
							<div className="grid grid-cols-5 gap-2">
								{(
									["match6", "match5", "match4", "match3", "match2"] as const
								).map((k) => (
									<div key={k}>
										<label
											htmlFor={`challenge-${k}`}
											className="block text-[9px] text-muted-foreground mb-1 uppercase"
										>
											{k.replace("match", "M")}
										</label>
										<input
											id={`challenge-${k}`}
											type="number"
											value={challengeCounts[k]}
											onChange={(e) =>
												setChallengeCounts({
													...challengeCounts,
													[k]: e.target.value,
												})
											}
											className="w-full h-9 px-2 rounded-lg bg-surface-1/70 border border-cyan-500/20 text-sm text-foreground text-center focus:outline-none focus:border-cyan-400/60"
										/>
									</div>
								))}
							</div>
							<textarea
								value={challengeEvidence}
								onChange={(e) => setChallengeEvidence(e.target.value)}
								placeholder="Evidence note (hashed on-chain as proof)"
								aria-label="Challenge evidence note"
								className="w-full h-20 px-3 py-2 rounded-xl bg-surface-1/70 border border-cyan-500/20 text-sm text-foreground placeholder-gray-600 focus:outline-none focus:border-cyan-400/60"
							/>
							<Button
								onClick={async () => {
									if (!connectedProvider) return;
									setChallengeLoading(true);
									setChallengeError(null);
									try {
										const uid = new TextEncoder();
										const witness = `mazel:draw:${challengeDrawId}:${JSON.stringify(challengeCounts)}:${challengeEvidence}`;
										const digest = await crypto.subtle.digest(
											"SHA-256",
											uid.encode(witness),
										);
										const evidenceHash = new Uint8Array(digest);
										const tokenProgram = new PublicKey(
											"TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
										);
										const ataProg = new PublicKey(
											"ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
										);
										const [ata] = PublicKey.findProgramAddressSync(
											[
												connectedProvider.wallet.publicKey.toBuffer(),
												tokenProgram.toBuffer(),
												USDC_MINT.toBuffer(),
											],
											ataProg,
										);
										await challengeDraw(
											connectedProvider,
											{
												drawId: Number(challengeDrawId),
												alternativeWinnerCounts: {
													match6: Number(challengeCounts.match6) || 0,
													match5: Number(challengeCounts.match5) || 0,
													match4: Number(challengeCounts.match4) || 0,
													match3: Number(challengeCounts.match3) || 0,
													match2: Number(challengeCounts.match2) || 0,
												},
												evidenceHash,
											},
											ata,
										);
										setShowChallenge(false);
										setChallengeDrawId("");
										setChallengeEvidence("");
									} catch (err) {
										setChallengeError(
											err instanceof Error ? err.message : "Challenge failed",
										);
									} finally {
										setChallengeLoading(false);
									}
								}}
								disabled={challengeLoading || !challengeDrawId}
								variant="emerald"
								className="w-full h-10 text-sm"
							>
								{challengeLoading
									? "Submitting…"
									: "Post Challenge ($500 bond)"}
							</Button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
