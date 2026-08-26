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
import { Link } from "react-router-dom";
import { CountdownTimer } from "@/components/CountdownTimer";
import { JackpotDisplay } from "@/components/JackpotDisplay";
import { FloatingBalls, WinningNumbers } from "@/components/LotteryBalls";
import { Button } from "@/components/ui/button";
import type { DrawResultData } from "@/hooks/use-draws";
import { useDraws } from "@/hooks/use-draws";
import { useLotteryState } from "@/hooks/use-lottery-state";
import { useAppKit, useAppKitAccount } from "@/lib/appkit-provider";

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
/*  NOTE: no mock data (review M5).                                            */
/*  All draw history and protocol stats on this page come from live on-chain   */
/*  data (useDraws + useLotteryState). The legacy MOCK_DRAWS /                */
/*  MOCK_AGGREGATE_STATS arrays were removed — they presented fabricated       */
/*  2025 records as real results.                                              */
/* -------------------------------------------------------------------------- */

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

/** Map hook DrawResultData to the UI's DrawResult interface */
function mapHookDrawToUI(d: DrawResultData): DrawResult {
	// The hook returns prize amounts as USDC lamports (6 decimals); convert to
	// whole USDC dollars for display (previously the lamport values were
	// rendered as dollars — off by 1,000,000x).
	const USDC_DECIMALS = 1_000_000;
	const toUsd = (lamports: number): number => lamports / USDC_DECIMALS;

	const totalPrizesPaid =
		(d.matchCounts.match6 * Number(d.prizesPerWinner.match6) +
			d.matchCounts.match5 * Number(d.prizesPerWinner.match5) +
			d.matchCounts.match4 * Number(d.prizesPerWinner.match4) +
			d.matchCounts.match3 * Number(d.prizesPerWinner.match3) +
			d.matchCounts.match2 * Number(d.prizesPerWinner.match2)) /
		USDC_DECIMALS;

	const jackpotAtDrawUsd = toUsd(Number(d.jackpotAtDraw));

	const dateObj = new Date(Number(d.timestamp) * 1000);

	return {
		drawId: d.drawId,
		date: dateObj.toISOString(),
		time: dateObj.toLocaleTimeString("en-US", {
			hour: "2-digit",
			minute: "2-digit",
		}),
		gameType: "main",
		winningNumbers: d.winningNumbers,
		totalTickets: d.totalTickets,
		jackpotAtDraw: jackpotAtDrawUsd,
		prizePoolDistributed: totalPrizesPaid,
		wasRolldown: d.wasRolldown,
		matchCounts: {
			match6: d.matchCounts.match6,
			match5: d.matchCounts.match5,
			match4: d.matchCounts.match4,
			match3: d.matchCounts.match3,
			match2: d.matchCounts.match2,
		},
		prizesPerWinner: {
			match6: toUsd(Number(d.prizesPerWinner.match6)),
			match5: toUsd(Number(d.prizesPerWinner.match5)),
			match4: toUsd(Number(d.prizesPerWinner.match4)),
			match3: toUsd(Number(d.prizesPerWinner.match3)),
			match2: toUsd(Number(d.prizesPerWinner.match2)),
		},
		totalPrizesPaid,
		// Remaining jackpot after this draw's prizes were distributed
		// (approximately — the pool is reduced by what it paid out).
		// Previously hardcoded to 0.
		jackpotAfterDraw: Math.max(0, jackpotAtDrawUsd - totalPrizesPaid),
		// House fee = gross ticket revenue × default on-chain house fee
		// (2800 bps = 28%). Previously hardcoded to 0.
		houseFeeCollected: Math.max(0, d.totalTickets * 2.5 * 0.28),
		randomnessProof: "",
		verificationHash: "",
	};
}

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                            */
/* -------------------------------------------------------------------------- */

function ProtocolStats({
	draws,
	loading,
}: {
	draws: DrawResult[];
	loading: boolean;
}) {
	// SECURITY (review M5): these stats were previously the hardcoded
	// MOCK_AGGREGATE_STATS (fake 2025 figures presented as live). Now they are
	// computed from the actual on-chain draw results loaded by the page.
	const mainDraws = draws.filter((d) => d.gameType === "main").length;
	const qpDraws = draws.filter((d) => d.gameType === "quickpick").length;
	const totalTickets = draws.reduce((s, d) => s + d.totalTickets, 0);
	const prizesPaid = draws.reduce((s, d) => s + d.totalPrizesPaid, 0);
	const biggestWin = draws.reduce((s, d) => Math.max(s, d.jackpotAtDraw), 0);
	const rolldownEvents = draws.filter((d) => d.wasRolldown).length;

	const fmt = (n: number) => (n > 0 ? formatCurrency(n, true) : "—");
	const count = (n: number) => (n > 0 ? n.toString() : "—");
	const countCompact = (n: number) =>
		n >= 1_000_000
			? `${(n / 1_000_000).toFixed(1)}M`
			: n >= 1_000
				? `${(n / 1_000).toFixed(0)}K`
				: n.toString();

	const items: {
		label: string;
		value: string;
		icon: LucideIcon;
		color: string;
	}[] = [
		{
			label: "Main Draws",
			value: loading ? "…" : count(mainDraws),
			icon: Trophy,
			color: "text-gold-300",
		},
		{
			label: "QP Draws",
			value: loading ? "…" : count(qpDraws),
			icon: Zap,
			color: "text-cyan-300",
		},
		{
			label: "Total Tickets",
			value: loading ? "…" : totalTickets > 0 ? countCompact(totalTickets) : "—",
			icon: Ticket,
			color: "text-foreground",
		},
		{
			label: "Prizes Paid",
			value: loading ? "…" : fmt(prizesPaid),
			icon: Award,
			color: "text-gold-300",
		},
		{
			label: "Biggest Win",
			value: loading ? "…" : fmt(biggestWin),
			icon: Star,
			color: "text-gold-300",
		},
		{
			label: "Rolldown Events",
			value: loading ? "…" : count(rolldownEvents),
			icon: TrendingUp,
			color: "text-magenta-300",
		},
	];

	return (
		<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
			{items.map((item) => {
				const Icon = item.icon;
				return (
					<div
						key={item.label}
						className="hud-frame rounded-lg p-3 sm:p-4 text-center"
					>
						<Icon
							size={16}
							className={`${item.color} mx-auto mb-1.5 opacity-70`}
						/>
						<div
							className={`font-mono text-lg sm:text-xl font-black tabular-nums ${item.color}`}
						>
							{item.value}
						</div>
						<div className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.2em] mt-0.5">
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
			className={`glass rounded-lg transition-all duration-200 ${
				draw.wasRolldown
					? "border-magenta-500/40 shadow-lg shadow-magenta-500/10 glow-magenta"
					: "border-cyan-500/15"
			}`}
		>
			{/* Main row (clickable) */}
			<button
				type="button"
				onClick={onToggle}
				aria-expanded={expanded}
				aria-controls={`draw-details-${draw.drawId}`}
				className="w-full p-4 sm:p-5 text-left hover:bg-foreground/1 transition-colors rounded-lg"
			>
				<div className="flex flex-col sm:flex-row sm:items-center gap-4">
					{/* Left: Draw info + Numbers */}
					<div className="flex-1 min-w-0">
						{/* Header badges */}
						<div className="flex items-center gap-2 flex-wrap mb-2.5">
							<span className="font-mono text-sm font-bold neon-cyan truncate max-w-30 sm:max-w-none">
								Draw #{draw.drawId}
							</span>
							<span className="font-mono text-[10px] text-muted-foreground shrink-0">
								{formatDate(draw.date)} · {draw.time}
							</span>

							{/* Game badge */}
							{isMain ? (
								<span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-gold-500/10 border border-gold-500/30 font-mono text-[9px] font-semibold text-gold-300 uppercase tracking-[0.2em]">
									<Trophy size={8} />
									6/46
								</span>
							) : (
								<span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/30 font-mono text-[9px] font-semibold text-cyan-300 uppercase tracking-[0.2em]">
									<Zap size={8} />
									5/35
								</span>
							)}

							{draw.wasRolldown && (
								<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-magenta-500/10 border border-magenta-500/30 font-mono text-[9px] font-bold text-magenta-300 uppercase tracking-[0.2em]">
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
					<div className="flex items-center gap-3 sm:gap-6 shrink-0">
						{/* Jackpot */}
						<div className="text-right">
							<div className="font-mono text-[9px] sm:text-[10px] text-muted-foreground uppercase tracking-[0.2em] mb-0.5">
								Jackpot
							</div>
							<div className="font-mono text-xs sm:text-sm font-black text-gradient-gold tabular-nums truncate max-w-20 sm:max-w-none">
								{formatCurrency(draw.jackpotAtDraw, true)}
							</div>
						</div>

						{/* Tickets */}
						<div className="text-right hidden sm:block">
							<div className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.2em] mb-0.5">
								Tickets
							</div>
							<div className="font-mono text-sm font-bold text-cyan-300 tabular-nums">
								{draw.totalTickets.toLocaleString()}
							</div>
						</div>

						{/* Winners */}
						<div className="text-right hidden sm:block">
							<div className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.2em] mb-0.5">
								Winners
							</div>
							<div className="font-mono text-sm font-bold text-emerald-400 tabular-nums">
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
				<div className="px-4 sm:px-5 pb-5 border-t border-cyan-500/10 pt-4 space-y-4 animate-slide-down">
					{/* Rolldown info banner */}
					{draw.wasRolldown && (
						<div className="relative rounded-xl p-3 bg-magenta-500/5 border border-magenta-500/25 overflow-hidden">
							<div className="absolute inset-0 bg-linear-to-r from-magenta-500/5 to-transparent" />
							<div className="relative z-10 flex items-start gap-2">
								<TrendingUp
									size={14}
									className="text-magenta-300 mt-0.5 shrink-0"
								/>
								<div>
									<p className="font-display text-xs font-bold text-magenta-300 uppercase tracking-wide mb-0.5">
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
						<h4 className="hud-label mb-3 flex items-center gap-2">
							<Award size={12} className="text-gold-300" />
							Prize Breakdown
						</h4>
						<div className="overflow-x-auto">
							<table className="w-full text-xs">
								<thead>
									<tr className="border-b border-foreground/5">
										<th className="text-left py-2 pr-2 sm:pr-4 font-mono text-[10px] text-muted-foreground uppercase tracking-[0.2em] font-semibold">
											Tier
										</th>
										<th className="text-right py-2 px-2 sm:px-4 font-mono text-[10px] text-muted-foreground uppercase tracking-[0.2em] font-semibold">
											Winners
										</th>
										<th className="text-right py-2 px-2 sm:px-4 font-mono text-[10px] text-muted-foreground uppercase tracking-[0.2em] font-semibold">
											Prize
										</th>
										<th className="text-right py-2 pl-2 sm:pl-4 font-mono text-[10px] text-muted-foreground uppercase tracking-[0.2em] font-semibold hidden sm:table-cell">
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
												<td className="py-2.5 pr-2 sm:pr-4">
													<div className="flex items-center gap-1.5 sm:gap-2">
														<div
															className={`w-5 h-5 rounded-full flex items-center justify-center font-mono text-[9px] font-bold ${
																tier === "jackpot"
																	? "bg-gold-500/20 text-gold-300"
																	: tier === "high"
																		? "bg-emerald-500/20 text-emerald-400"
																		: tier === "mid"
																			? "bg-emerald-500/10 text-emerald-400/70"
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
																	? "text-gold-300"
																	: tier === "high"
																		? "text-emerald-400"
																		: "text-muted-foreground"
															}`}
														>
															{label}
														</span>
														{tier === "jackpot" && (
															<Star size={9} className="text-gold-300/50" />
														)}
														{tier === "free" && isMain && (
															<span className="font-mono text-[8px] text-muted-foreground">
																(Free Ticket)
															</span>
														)}
													</div>
												</td>
												<td className="py-2.5 px-2 sm:px-4 text-right font-mono tabular-nums">
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
												<td className="py-2.5 px-2 sm:px-4 text-right font-mono tabular-nums">
													{prizeEach > 0 ? (
														<span
															className={`font-bold ${
																tier === "jackpot"
																	? "text-gold-300"
																	: tier === "high"
																		? "text-emerald-400"
																		: "text-muted-foreground"
															}`}
														>
															{prizeEach >= 1_000
																? formatCurrency(prizeEach, true)
																: `$${prizeEach.toLocaleString("en-US", { minimumFractionDigits: prizeEach % 1 !== 0 ? 2 : 0 })}`}
															{draw.wasRolldown &&
																tier !== "free" &&
																winners > 0 && (
																	<span className="ml-1 font-mono text-[8px] text-magenta-300/70">
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
												<td className="py-2.5 pl-2 sm:pl-4 text-right font-mono tabular-nums hidden sm:table-cell">
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
										<td className="py-2.5 pr-2 sm:pr-4 font-mono text-xs font-bold text-foreground">
											Total
										</td>
										<td className="py-2.5 px-2 sm:px-4 text-right font-mono text-xs font-bold text-foreground tabular-nums">
											{totalWinners.toLocaleString()}
										</td>
										<td className="py-2.5 px-2 sm:px-4 text-right" />
										<td className="py-2.5 pl-2 sm:pl-4 text-right font-mono text-xs font-black text-gradient-gold tabular-nums hidden sm:table-cell">
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
							<div className="font-mono text-[9px] text-muted-foreground uppercase tracking-[0.2em]">
								Total Tickets
							</div>
							<div className="font-mono text-xs font-bold text-cyan-300 mt-0.5 tabular-nums">
								{draw.totalTickets.toLocaleString()}
							</div>
						</div>
						<div className="p-2.5 rounded-lg bg-foreground/2">
							<div className="font-mono text-[9px] text-muted-foreground uppercase tracking-[0.2em]">
								Revenue
							</div>
							<div className="font-mono text-xs font-bold text-foreground mt-0.5 tabular-nums">
								{formatCurrency(draw.totalTickets * (isMain ? 2.5 : 1.5), true)}
							</div>
						</div>
						<div className="p-2.5 rounded-lg bg-foreground/2">
							<div className="font-mono text-[9px] text-muted-foreground uppercase tracking-[0.2em]">
								House Fee (est.)
							</div>
							<div className="font-mono text-xs font-bold text-foreground mt-0.5 tabular-nums">
								{formatCurrency(draw.houseFeeCollected, true)}
							</div>
						</div>
						<div className="p-2.5 rounded-lg bg-foreground/2">
							<div className="font-mono text-[9px] text-muted-foreground uppercase tracking-[0.2em]">
								Jackpot After
							</div>
							<div className="font-mono text-xs font-bold text-gold-300 mt-0.5 tabular-nums">
								{formatCurrency(draw.jackpotAfterDraw, true)}
							</div>
						</div>
					</div>

					{/* Verification */}
					<div className="terminal-window">
						<div className="terminal-titlebar">
							<span className="w-1.5 h-1.5 rounded-full bg-cyan-400/80" />
							<span className="w-1.5 h-1.5 rounded-full bg-emerald-400/80" />
							<span className="ml-1 flex items-center gap-1.5">
								<Eye size={10} className="text-cyan-300" />
								On-Chain Verification
							</span>
						</div>
						<div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
							<div>
								<div className="font-mono text-[9px] text-muted-foreground mb-0.5 uppercase tracking-[0.2em]">
									Randomness Source
								</div>
								<div className="font-mono text-[10px] text-cyan-300/80 break-all">
									{draw.randomnessProof ? draw.randomnessProof : "—"}
								</div>
							</div>
							<div>
								<div className="font-mono text-[9px] text-muted-foreground mb-0.5 uppercase tracking-[0.2em]">
									Verification Hash
								</div>
								<div className="font-mono text-[10px] text-cyan-300/80 flex items-center gap-1.5">
									<span>{draw.verificationHash ? draw.verificationHash : "—"}</span>
									{draw.verificationHash && (
										<a
											href={`https://solscan.io/tx/${draw.verificationHash}`}
											target="_blank"
											rel="noopener noreferrer"
											className="text-emerald-400/50 hover:text-emerald-400 transition-colors"
											aria-label="View on Solscan"
										>
											<ExternalLink size={9} />
										</a>
									)}
								</div>
							</div>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

function RolldownHistory({
	draws,
	loading,
}: {
	draws?: DrawResult[];
	loading?: boolean;
}) {
	// SECURITY (review M5): previously fell back to MOCK_DRAWS (fake history)
	// when no live data was loaded. Now renders nothing until real on-chain
	// rolldown draws are available — no fabricated events presented as live.
	if (loading || !draws || draws.length === 0) return null;
	const source = draws;
	const rolldownDraws = source.filter((d) => d.wasRolldown);

	if (rolldownDraws.length === 0) return null;

	return (
		<div className="hud-frame rounded-lg p-5 sm:p-6 glow-magenta">
			<div className="flex items-center justify-between mb-4">
				<h3 className="font-display text-xs sm:text-sm font-bold text-magenta-300 uppercase tracking-wide flex items-center gap-2">
					<TrendingUp size={16} className="text-magenta-300" />
					Recent Rolldown Events
				</h3>
				<span className="font-mono text-[10px] text-muted-foreground">
					{rolldownDraws.length} total rolldowns
				</span>
			</div>

			<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
				{rolldownDraws.map((draw) => {
					const isMain = draw.gameType === "main";
					return (
						<div
							key={`rolldown-${draw.drawId}`}
							className="p-3 rounded-lg bg-magenta-500/5 border border-magenta-500/20"
						>
							<div className="flex items-center justify-between mb-2">
								<div className="flex items-center gap-2">
									<span className="font-mono text-xs font-bold text-magenta-300">
										#{draw.drawId}
									</span>
									<span className="font-mono text-[10px] text-muted-foreground">
										{formatDate(draw.date)}
									</span>
									{isMain ? (
										<span className="font-mono text-[8px] px-1 py-0.5 rounded bg-gold-500/10 text-gold-300 font-bold uppercase tracking-[0.15em]">
											6/46
										</span>
									) : (
										<span className="font-mono text-[8px] px-1 py-0.5 rounded bg-cyan-500/10 text-cyan-300 font-bold uppercase tracking-[0.15em]">
											5/35
										</span>
									)}
								</div>
								<span className="font-mono text-xs font-black text-gradient-gold">
									{formatCurrency(draw.jackpotAtDraw, true)}
								</span>
							</div>

							<div className="flex items-center gap-1.5 mb-2">
								<WinningNumbers numbers={draw.winningNumbers} size="sm" />
							</div>

							<div className="grid grid-cols-3 gap-2 font-mono text-[10px]">
								<div>
									<span className="text-muted-foreground">Tickets</span>
									<div className="font-bold text-cyan-300">
										{draw.totalTickets.toLocaleString()}
									</div>
								</div>
								<div>
									<span className="text-muted-foreground">Distributed</span>
									<div className="font-bold text-emerald-400">
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

			<div className="mt-4 p-3 rounded-lg bg-foreground/2 border border-cyan-500/10">
				<div className="flex items-start gap-2">
					<Sparkles size={12} className="text-gold-300/60 mt-0.5 shrink-0" />
					<div className="font-mono text-[10px] text-muted-foreground">
						<span className="font-semibold text-muted-foreground">
							Total rolldown prizes paid:
						</span>{" "}
						<span className="font-bold text-gradient-gold">
							{formatCurrency(
								rolldownDraws.reduce((s, d) => s + d.totalPrizesPaid, 0),
								true,
							)}
						</span>{" "}
						across {rolldownDraws.length} events. Rolldowns occur when the
						jackpot exceeds the soft cap and no top-tier winner is drawn.{" "}
						<Link
							to="/learn/rolldown"
							className="text-cyan-300 hover:text-cyan-400 font-semibold inline-flex items-center gap-0.5 transition-colors"
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
		<div className="flex items-center justify-center gap-1 sm:gap-2">
			<Button
				variant="ghost"
				size="icon-sm"
				onClick={() => onPageChange(currentPage - 1)}
				disabled={currentPage <= 1}
				className="text-muted-foreground hover:text-foreground disabled:opacity-30"
				aria-label="Previous page"
			>
				<ArrowLeft size={14} />
			</Button>

			{/* Mobile: current page indicator */}
			<span className="sm:hidden font-mono text-xs font-semibold text-cyan-300 px-2">
				{currentPage} / {totalPages}
			</span>

			{/* Desktop: all page buttons */}
			<div className="hidden sm:flex items-center gap-2">
				{Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
					<button
						key={page}
						type="button"
						onClick={() => onPageChange(page)}
						className={`w-8 h-8 rounded-lg font-mono text-xs font-semibold transition-all ${
							page === currentPage
								? "bg-cyan-500/15 text-cyan-300 border border-cyan-400/30"
								: "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
						}`}
					>
						{page}
					</button>
				))}
			</div>

			<Button
				variant="ghost"
				size="icon-sm"
				onClick={() => onPageChange(currentPage + 1)}
				disabled={currentPage >= totalPages}
				className="text-muted-foreground hover:text-foreground disabled:opacity-30"
				aria-label="Next page"
			>
				<ArrowRight size={14} />
			</Button>
		</div>
	);
}

/* -------------------------------------------------------------------------- */
/*  Main Component                                                            */
/* -------------------------------------------------------------------------- */

export default function ResultsPage() {
	const { open } = useAppKit();
	const { isConnected } = useAppKitAccount();
	const { draws: rawDraws, loading: drawsLoading } = useDraws();
	const {
		jackpotDollars,
		state: lotteryState,
		nextDrawTimeMs,
	} = useLotteryState();
	const [gameFilter, setGameFilter] = useState<GameFilter>("all");
	const [rolldownFilter, setRolldownFilter] = useState<RolldownFilter>("all");
	const [searchQuery, setSearchQuery] = useState("");
	const [expandedDraw, setExpandedDraw] = useState<number | null>(null);
	const [currentPage, setCurrentPage] = useState(1);

	// Map on-chain draw data to the UI DrawResult shape
	const liveDraws = useMemo<DrawResult[]>(
		() => rawDraws.map(mapHookDrawToUI),
		[rawDraws],
	);

	const filteredDraws = useMemo(() => {
		// SECURITY (review M5): never fall back to MOCK_DRAWS. When no live
		// data has loaded the empty-state message below is shown instead, so
		// users are never presented with fabricated draw history.
		let result = [...liveDraws];

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
	}, [gameFilter, rolldownFilter, searchQuery, liveDraws]);

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
			<section className="relative pt-24 pb-8 sm:pt-28 sm:pb-12 px-4 sm:px-6 lg:px-8 overflow-hidden scanlines">
				<div className="absolute inset-0 hero-grid opacity-20" />
				<div className="absolute inset-0 bg-glow-top-left" />
				<div className="absolute inset-0 bg-glow-bottom-right" />
				<FloatingBalls count={4} />

				<div className="relative z-10 max-w-7xl mx-auto py-6 sm:py-8">
					{/* Breadcrumb */}
					<nav className="flex items-center gap-2 text-xs text-muted-foreground mb-6">
						<Link to="/" className="hover:text-foreground transition-colors">
							Home
						</Link>
						<ChevronRight size={12} />
						<span className="font-mono text-cyan-300 font-medium">Results</span>
					</nav>

					<div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
						<div>
							<div className="hud-label mb-2">{"// Draw Archive"}</div>
							<div className="flex items-center gap-3 mb-2">
								<div className="p-2 rounded-xl bg-linear-to-br from-cyan-500/20 to-magenta-500/10 border border-cyan-500/30 glow-cyan">
									<BarChart3 size={24} className="text-cyan-300" />
								</div>
								<div>
									<h1 className="font-display text-2xl sm:text-3xl font-black tracking-wide uppercase text-gradient-primary">
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
							{/* SECURITY (review M5): this jackpot was previously hardcoded
                  to a fake $1,247,832. Now reads live on-chain state. */}
							<JackpotDisplay
								amount={jackpotDollars}
								unknown={lotteryState === null}
								size="sm"
								glow
								showRolldownStatus={false}
								softCap={1_750_000}
							/>
							{nextDrawTimeMs ? (
								<CountdownTimer
									size="sm"
									label="Next Draw"
									targetTime={nextDrawTimeMs}
								/>
							) : (
								<div className="text-[10px] text-muted-foreground/60">
									Next draw schedule loading…
								</div>
							)}
							{isConnected ? (
								<Link
									to="/tickets"
									className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-bold text-primary-foreground bg-linear-to-r from-cyan-400 to-cyan-600 hover:from-cyan-300 hover:to-cyan-500 rounded-xl shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] shrink-0"
								>
									<Ticket size={16} />
									Check My Tickets
								</Link>
							) : (
								<button
									type="button"
									onClick={() => open({ view: "Connect", namespace: "solana" })}
									className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-bold text-primary-foreground bg-linear-to-r from-cyan-400 to-cyan-600 hover:from-cyan-300 hover:to-cyan-500 rounded-xl shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] shrink-0"
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
				<div className="max-w-7xl mx-auto py-6 sm:py-8 space-y-6">
					{/* Protocol Stats */}
					<ProtocolStats draws={liveDraws} loading={drawsLoading} />

					{/* Main content: 2/3 + 1/3 layout */}
					<div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
						{/* Left column: Draw list */}
						<div className="lg:col-span-2 space-y-4">
							{/* Filters */}
							<div className="hud-frame rounded-lg p-4 sm:p-5 space-y-3">
								{/* Search + Game filter */}
								<div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
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
											aria-label="Search draws"
											className="w-full h-9 pl-9 pr-3 rounded-lg bg-foreground/4 border border-foreground/8 text-sm text-foreground placeholder-gray-600 focus:outline-none focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/20 transition-colors"
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
												className={`px-3 py-1.5 rounded-lg font-mono text-xs font-semibold transition-all ${
													gameFilter === key
														? "bg-cyan-500/15 text-cyan-300 border border-cyan-400/30"
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
											className={`px-3 py-1.5 rounded-lg font-mono text-xs font-semibold transition-all ${
												rolldownFilter === key
													? "bg-cyan-500/15 text-cyan-300 border border-cyan-400/30"
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
									<span className="font-mono font-bold text-cyan-300 tabular-nums">
										{filteredDraws.length}
									</span>{" "}
									draw{filteredDraws.length !== 1 ? "s" : ""}
									{searchQuery && (
										<span>
											{" "}
											matching &ldquo;
											<span className="font-mono text-cyan-300">
												{searchQuery}
											</span>
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
							{drawsLoading ? (
								<div className="space-y-3">
									{Array.from({ length: 4 }).map((_, i) => (
										<div
											// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
											key={`skeleton-row-${i}`}
											className="glass rounded-lg p-5 animate-pulse"
										>
											<div className="flex items-center gap-3 mb-3">
												<div className="h-4 w-20 bg-foreground/10 rounded" />
												<div className="h-3 w-24 bg-foreground/8 rounded" />
												<div className="h-5 w-12 bg-foreground/8 rounded-full" />
											</div>
											<div className="flex gap-2">
												{Array.from({ length: 6 }).map((_, j) => (
													<div
														// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
														key={`skeleton-ball-${j}`}
														className="w-8 h-8 rounded-full bg-foreground/8"
													/>
												))}
											</div>
										</div>
									))}
								</div>
							) : paginatedDraws.length === 0 ? (
								<div className="hud-frame rounded-lg p-12 text-center">
									<div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-cyan-500/5 border border-cyan-500/20 mb-4">
										<Search size={24} className="text-cyan-300/60" />
									</div>
									<p className="text-sm text-muted-foreground mb-1">
										No draws found
									</p>
									<p className="text-xs text-muted-foreground/60 mb-4">
										{rawDraws.length === 0
											? "Draw results will appear here once on-chain data is available."
											: "Try adjusting your search or filter criteria"}
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
										className="w-full sm:w-auto text-xs border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10"
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
							<RolldownHistory draws={liveDraws} loading={drawsLoading} />

							{/* How to Read Results */}
							<div className="hud-frame rounded-lg p-5 sm:p-6">
								<h3 className="hud-label mb-4 flex items-center gap-2">
									<Eye size={16} className="text-cyan-300" />
									Understanding Results
								</h3>

								<div className="space-y-3">
									<div>
										<h4 className="font-mono text-xs font-semibold text-foreground mb-1 flex items-center gap-1.5 uppercase tracking-wider">
											<div className="w-3 h-3 rounded-full bg-linear-to-br from-gold-300 to-gold-500" />
											Matched Numbers
										</h4>
										<p className="text-[10px] text-muted-foreground leading-relaxed">
											Numbers highlighted in gold are matches between your
											ticket and the winning numbers. More matches = bigger
											prizes.
										</p>
									</div>

									<div>
										<h4 className="font-mono text-xs font-semibold text-foreground mb-1 flex items-center gap-1.5 uppercase tracking-wider">
											<TrendingUp size={11} className="text-magenta-300" />
											Rolldown Draws
										</h4>
										<p className="text-[10px] text-muted-foreground leading-relaxed">
											Draws marked with the magenta &quot;Rolldown&quot; badge
											used pari-mutuel prize distribution. The jackpot was
											divided among Match 3+ winners, resulting in
											higher-than-normal prizes.
										</p>
									</div>

									<div>
										<h4 className="font-mono text-xs font-semibold text-foreground mb-1 flex items-center gap-1.5 uppercase tracking-wider">
											<span className="font-mono text-[9px] font-bold px-1 py-0.5 rounded bg-magenta-500/10 text-magenta-300">
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
										<h4 className="font-mono text-xs font-semibold text-foreground mb-1 flex items-center gap-1.5 uppercase tracking-wider">
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
										className="flex items-center gap-1.5 font-mono text-[10px] font-semibold text-cyan-300 hover:text-cyan-400 transition-colors"
									>
										<Sparkles size={10} />
										Learn how rolldown mechanics work
										<ChevronRight size={10} />
									</Link>
								</div>
							</div>

							{/* Quick Links */}
							<div className="hud-frame rounded-lg p-4 space-y-2">
								<h3 className="hud-label mb-3 flex items-center gap-2">
									<Zap size={12} className="text-cyan-300" />
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
											className="text-cyan-400/60 group-hover:text-cyan-300 transition-colors"
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
		</div>
	);
}
