import {
	Activity,
	ArrowDownRight,
	ArrowRight,
	ArrowUpRight,
	BarChart3,
	Clock,
	type LucideIcon,
	Shield,
	Star,
	Ticket,
	TrendingUp,
	Trophy,
	Users,
	Wallet,
	Zap,
} from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { CountdownTimer } from "@/components/CountdownTimer";
import { EVBadge } from "@/components/EVCalculator";
import Footer from "@/components/Footer";
import { JackpotDisplay } from "@/components/JackpotDisplay";
import { LotteryBallRow, WinningNumbers } from "@/components/LotteryBalls";
import { RolldownGauge } from "@/components/RolldownGauge";
import { useDraws } from "@/hooks/use-draws";
import { useLotteryState } from "@/hooks/use-lottery-state";
import { useTickets } from "@/hooks/use-tickets";
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
			iconBg: "bg-emerald/10",
			iconColor: "text-emerald-light",
			valueColor: "text-emerald-light",
		},
		gold: {
			iconBg: "bg-gold/10",
			iconColor: "text-gold",
			valueColor: "text-gold",
		},
		red: {
			iconBg: "bg-red-500/10",
			iconColor: "text-red-400",
			valueColor: "text-red-400",
		},
		amber: {
			iconBg: "bg-amber-400/10",
			iconColor: "text-amber-400",
			valueColor: "text-amber-400",
		},
		default: {
			iconBg: "bg-foreground/5",
			iconColor: "text-muted-foreground",
			valueColor: "text-foreground",
		},
	};

	const colors = colorMap[accent];

	return (
		<div className="p-4 rounded-2xl bg-card/50 border border-border/50">
			<div className="flex items-center gap-3 mb-3">
				<div
					className={cn(
						"w-9 h-9 rounded-xl flex items-center justify-center",
						colors.iconBg,
					)}
				>
					<Icon size={18} className={colors.iconColor} />
				</div>
				<span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
					{label}
				</span>
			</div>
			<div
				className={cn("text-2xl font-black tracking-tight", colors.valueColor)}
			>
				{value}
			</div>
			{sub && <p className="text-[10px] text-muted-foreground mt-1">{sub}</p>}
			{positive !== undefined && (
				<div className="flex items-center gap-1 mt-2">
					{positive ? (
						<ArrowUpRight size={12} className="text-emerald-light" />
					) : (
						<ArrowDownRight size={12} className={colors.iconColor} />
					)}
					<span
						className={cn(
							"text-[10px] font-bold",
							positive ? "text-emerald-light" : colors.valueColor,
						)}
					>
						{positive ? "Profitable" : (negativeLabel ?? "Negative")}
					</span>
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
				"p-5 rounded-2xl border transition-colors",
				wasRolldown
					? "bg-emerald-500/5 border-emerald-500/15"
					: "bg-card/50 border-border/50",
			)}
		>
			<div className="flex items-center justify-between mb-3">
				<div>
					<p className="text-xs font-semibold text-muted-foreground">
						Draw #{drawId}
					</p>
					<p className="text-[10px] text-muted-foreground/60">{date}</p>
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
					<p className="text-[10px] text-muted-foreground">Tickets</p>
					<p className="text-xs font-bold text-foreground">
						{totalTickets.toLocaleString()}
					</p>
				</div>
				<div>
					<p className="text-[10px] text-muted-foreground">Jackpot</p>
					<p className="text-xs font-bold text-gold">{jackpot}</p>
				</div>
				<div>
					<p className="text-[10px] text-muted-foreground">Winners</p>
					<p className="text-xs font-bold text-foreground">
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
			<div className="p-6 rounded-2xl bg-card/50 border border-border/50 animate-pulse">
				<div className="h-5 w-32 bg-foreground/5 rounded mb-4" />
				{[1, 2, 3].map((i) => (
					<div key={i} className="h-16 bg-foreground/5 rounded-lg mb-2" />
				))}
			</div>
		);
	}

	return (
		<div className="p-6 rounded-2xl bg-card/50 border border-border/50">
			<div className="flex items-center justify-between mb-4">
				<h3 className="text-sm font-bold text-foreground flex items-center gap-2">
					<Ticket size={16} className="text-gold" />
					Your Tickets
				</h3>
				<Link
					to="/tickets"
					className="text-[10px] font-semibold text-emerald-light hover:text-emerald flex items-center gap-1"
				>
					View All <ArrowRight size={10} />
				</Link>
			</div>

			{/* Unclaimed prizes callout */}
			{unclaimedTickets.length > 0 && (
				<div className="mb-4 p-3 rounded-xl bg-gold/5 border border-gold/10">
					<div className="flex items-center justify-between">
						<span className="text-xs font-semibold text-gold">
							{unclaimedTickets.length} unclaimed prize
							{unclaimedTickets.length > 1 ? "s" : ""}
						</span>
						<span className="text-sm font-bold text-gold">
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
						className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-emerald-light hover:text-emerald"
					>
						Buy your first ticket <ArrowRight size={10} />
					</Link>
				</div>
			) : (
				<div className="space-y-2">
					{tickets.slice(0, 5).map((ticket) => (
						<div
							key={ticket.id}
							className="flex items-center justify-between p-3 rounded-lg bg-foreground/3 border border-foreground/5"
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
									<p className="text-[9px] text-muted-foreground mt-1">
										Draw #{ticket.drawId} · {timeAgo(ticket.purchaseTime)}
									</p>
								</div>
							</div>
							<div className="text-right">
								{ticket.matchCount >= 2 && (
									<span className="text-xs font-bold text-gold">
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
				<div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-emerald/10 flex items-center justify-center mx-auto mb-6">
					<Wallet size={24} className="text-emerald-light sm:size-7" />
				</div>
				<h2 className="text-xl sm:text-2xl font-black text-foreground mb-3">
					Connect Your Wallet
				</h2>
				<p className="text-sm sm:text-base text-muted-foreground mb-8">
					View your lottery dashboard, track tickets, monitor jackpots, and
					manage your syndicates — all from one place.
				</p>
				<button
					type="button"
					onClick={() => open?.()}
					className="inline-flex items-center gap-2 px-6 sm:px-8 py-3 sm:py-4 rounded-xl bg-linear-to-r from-emerald to-emerald-dark text-white font-bold text-base sm:text-lg shadow-lg shadow-emerald/25 hover:shadow-emerald/40 transition-all hover:-translate-y-0.5"
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

	// Compute player stats from on-chain data
	const playerStats = useMemo(() => {
		if (!isConnected || tickets.length === 0) return null;

		const totalSpent = tickets.length * 2.5;
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
			totalWon,
			netProfit,
			winRate,
			unclaimedCount: unclaimedTickets.length,
			unclaimedTotal: Number(unclaimedPrizeTotal) / 1_000_000,
		};
	}, [tickets, unclaimedTickets, unclaimedPrizeTotal, isConnected]);

	if (!isConnected) {
		return (
			<div className="min-h-screen">
				<WalletNotConnected />
				<Footer />
			</div>
		);
	}

	return (
		<div className="min-h-screen">
			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
				{/* Page header */}
				<div className="mb-6 sm:mb-8">
					<h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-foreground tracking-tight mb-2">
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
							<div className="flex flex-col items-center justify-center p-4 rounded-2xl bg-card/50 border border-border/50">
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
									label="Net P&L"
									value={formatCurrency(Math.abs(playerStats.netProfit))}
									sub="Lifetime"
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
								<h2 className="text-base sm:text-lg font-bold text-foreground flex items-center gap-2">
									<Clock size={18} className="text-muted-foreground" />
									Recent Draws
								</h2>
								<Link
									to="/results"
									className="text-xs font-semibold text-emerald-light hover:text-emerald flex items-center gap-1"
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
								<div className="text-center py-8 sm:py-12 rounded-2xl bg-card/50 border border-border/50">
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
						<div className="p-4 sm:p-6 rounded-2xl bg-card/50 border border-border/50">
							<h3 className="text-xs sm:text-sm font-bold text-foreground mb-4 flex items-center gap-2">
								<Zap size={16} className="text-gold" />
								Quick Actions
							</h3>
							<div className="space-y-2">
								<Link
									to="/play"
									className="flex items-center justify-between p-3 rounded-xl bg-emerald/5 border border-emerald/10 hover:bg-emerald/10 transition-colors group"
								>
									<div className="flex items-center gap-3">
										<Trophy size={16} className="text-emerald-light shrink-0" />
										<span className="text-xs sm:text-sm font-medium text-foreground">
											Buy Tickets
										</span>
									</div>
									<ArrowRight
										size={14}
										className="text-emerald-light opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
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
			</div>
		</div>
	);
}
