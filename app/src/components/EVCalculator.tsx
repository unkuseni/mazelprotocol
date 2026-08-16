import {
	Calculator,
	Info,
	Minus,
	Sparkles,
	TrendingUp,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

const TICKET_PRICE = 2.5;

// Odds for 6/46 matrix
const ODDS = {
	match6: 1 / 9_366_819,
	match5: 1 / 39_028,
	match4: 1 / 800,
	match3: 1 / 47,
	match2: 1 / 6.8,
};

// Rolldown pool shares
const ROLLDOWN_POOL_SHARES = {
	match5: 0.25,
	match4: 0.35,
	match3: 0.4,
};

// Fixed prizes (normal mode)
const FIXED_PRIZES = {
	match5: 4_000,
	match4: 150,
	match3: 5,
	match2: 2.5, // free ticket
};

// Jackpot allocation to prizes during rolldown
const ROLLDOWN_JACKPOT_ALLOCATION_BPS = 7200; // 72% to prizes

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

interface EVResult {
	matchTier: string;
	probability: number;
	prizePerWinner: number;
	evContribution: number;
	isPositive: boolean;
}

interface EVScenario {
	totalEV: number;
	edge: number;
	edgePercent: number;
	isPlusEV: boolean;
	results: EVResult[];
	totalTicketCost: number;
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function formatCurrency(value: number): string {
	if (value >= 1_000_000) {
		return `$${(value / 1_000_000).toFixed(2)}M`;
	}
	if (value >= 1_000) {
		return `$${(value / 1_000).toFixed(0)}K`;
	}
	return `$${value.toFixed(2)}`;
}

function formatPercent(value: number): string {
	return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

/* -------------------------------------------------------------------------- */
/*  Main Component                                                            */
/* -------------------------------------------------------------------------- */

export interface EVCalculatorProps {
	/** Current jackpot amount in USDC dollars */
	jackpotAmount: number;
	/** Whether rolldown is active */
	rolldownActive: boolean;
	/** Whether data is loading */
	loading?: boolean;
	/** Additional CSS classes */
	className?: string;
}

export function EVCalculator({
	jackpotAmount,
	rolldownActive,
	loading = false,
	className,
}: EVCalculatorProps) {
	// Default: assume rolldown scenario
	const defaultTickets = rolldownActive ? 475_000 : 200_000;
	const [ticketsEstimate, setTicketsEstimate] = useState(defaultTickets);

	const handleSliderChange = useCallback((value: number[]) => {
		setTicketsEstimate(value[0]);
	}, []);

	const scenario = useMemo<EVScenario>(() => {
		if (!rolldownActive) {
			// Normal mode — fixed prizes
			const results: EVResult[] = [
				{
					matchTier: "Match 5",
					probability: ODDS.match5,
					prizePerWinner: FIXED_PRIZES.match5,
					evContribution: ODDS.match5 * FIXED_PRIZES.match5,
					isPositive: false,
				},
				{
					matchTier: "Match 4",
					probability: ODDS.match4,
					prizePerWinner: FIXED_PRIZES.match4,
					evContribution: ODDS.match4 * FIXED_PRIZES.match4,
					isPositive: false,
				},
				{
					matchTier: "Match 3",
					probability: ODDS.match3,
					prizePerWinner: FIXED_PRIZES.match3,
					evContribution: ODDS.match3 * FIXED_PRIZES.match3,
					isPositive: false,
				},
				{
					matchTier: "Match 2",
					probability: ODDS.match2,
					prizePerWinner: FIXED_PRIZES.match2,
					evContribution: ODDS.match2 * FIXED_PRIZES.match2,
					isPositive: false,
				},
			];

			const totalEV = results.reduce((sum, r) => sum + r.evContribution, 0);

			return {
				totalEV,
				edge: totalEV - TICKET_PRICE,
				edgePercent: ((totalEV - TICKET_PRICE) / TICKET_PRICE) * 100,
				isPlusEV: totalEV > TICKET_PRICE,
				results,
				totalTicketCost: TICKET_PRICE,
			};
		}

		// Rolldown mode — pari-mutuel
		const totalPoolForPrizes =
			jackpotAmount * (ROLLDOWN_JACKPOT_ALLOCATION_BPS / 10000);

		// Estimate winners per tier based on ticket count
		const estimatedWinners = {
			match5: Math.max(1, Math.round(ticketsEstimate * ODDS.match5)),
			match4: Math.max(1, Math.round(ticketsEstimate * ODDS.match4)),
			match3: Math.max(1, Math.round(ticketsEstimate * ODDS.match3)),
		};

		// Pari-mutuel prize per winner
		const match5Prize =
			(totalPoolForPrizes * ROLLDOWN_POOL_SHARES.match5) /
			estimatedWinners.match5;
		const match4Prize =
			(totalPoolForPrizes * ROLLDOWN_POOL_SHARES.match4) /
			estimatedWinners.match4;
		const match3Prize =
			(totalPoolForPrizes * ROLLDOWN_POOL_SHARES.match3) /
			estimatedWinners.match3;

		const results: EVResult[] = [
			{
				matchTier: "Match 5",
				probability: ODDS.match5,
				prizePerWinner: match5Prize,
				evContribution: ODDS.match5 * match5Prize,
				isPositive: ODDS.match5 * match5Prize > 0,
			},
			{
				matchTier: "Match 4",
				probability: ODDS.match4,
				prizePerWinner: match4Prize,
				evContribution: ODDS.match4 * match4Prize,
				isPositive: ODDS.match4 * match4Prize > 0,
			},
			{
				matchTier: "Match 3",
				probability: ODDS.match3,
				prizePerWinner: match3Prize,
				evContribution: ODDS.match3 * match3Prize,
				isPositive: ODDS.match3 * match3Prize > 0,
			},
			{
				matchTier: "Match 2",
				probability: ODDS.match2,
				prizePerWinner: TICKET_PRICE, // free ticket
				evContribution: ODDS.match2 * TICKET_PRICE,
				isPositive: true,
			},
		];

		const totalEV = results.reduce((sum, r) => sum + r.evContribution, 0);

		return {
			totalEV,
			edge: totalEV - TICKET_PRICE,
			edgePercent: ((totalEV - TICKET_PRICE) / TICKET_PRICE) * 100,
			isPlusEV: totalEV > TICKET_PRICE,
			results,
			totalTicketCost: TICKET_PRICE,
		};
	}, [jackpotAmount, rolldownActive, ticketsEstimate]);

	if (loading) {
		return (
			<div
				className={cn(
					"animate-pulse p-6 rounded-2xl bg-card/50 border border-border/50",
					className,
				)}
			>
				<div className="h-6 w-32 bg-foreground/5 rounded mb-4" />
				<div className="h-4 w-64 bg-foreground/5 rounded mb-6" />
				{[1, 2, 3, 4].map((i) => (
					<div key={i} className="h-12 bg-foreground/5 rounded-lg mb-2" />
				))}
			</div>
		);
	}

	return (
		<div
			className={cn(
				"p-6 rounded-2xl bg-card/50 border border-border/50",
				className,
			)}
		>
			{/* Header */}
			<div className="flex items-center gap-2 mb-1">
				<Calculator size={18} className="text-gold-300" />
				<h3 className="text-lg font-bold text-foreground">
					Expected Value Calculator
				</h3>
			</div>
			<p className="text-xs text-muted-foreground mb-6">
				{rolldownActive
					? "Pari-mutuel prizes — adjust ticket estimate below to see how volume affects prizes per winner"
					: "Normal mode — fixed prizes, plus every ticket builds the jackpot that rolldown distributes"}
			</p>

			{/* Rolldown mode: ticket volume slider */}
			{rolldownActive && (
				<div className="mb-6 p-4 rounded-xl bg-muted/30 border border-border/30">
					<div className="flex items-center justify-between mb-2">
						<span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
							Estimated Total Tickets in Draw
						</span>
						<span className="text-sm font-bold text-foreground tabular-nums">
							{(ticketsEstimate / 1000).toFixed(0)}K
						</span>
					</div>
					<Slider
						value={[ticketsEstimate]}
						onValueChange={handleSliderChange}
						min={50_000}
						max={1_500_000}
						step={25_000}
						className="w-full"
					/>
					<div className="flex justify-between mt-1.5">
						<span className="text-[9px] text-muted-foreground">
							50K (low volume)
						</span>
						<span className="text-[9px] text-muted-foreground">
							1.5M (high volume)
						</span>
					</div>
					<p className="text-[10px] text-muted-foreground/60 mt-2">
						More tickets = more winners per tier = lower per-winner prizes.
						<br />
						Slide to see how volume affects your edge.
					</p>
				</div>
			)}

			{/* Big EV number */}
			<div
				className={cn(
					"text-center py-6 rounded-2xl mb-6 border",
					scenario.isPlusEV
						? "bg-emerald-500/5 border-emerald-500/20"
						: "bg-gold-500/5 border-gold-500/15",
				)}
			>
				<p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
					{scenario.isPlusEV ? "Expected Value Per Ticket" : "Expected Prizes Per Ticket"}
				</p>
				<p
					className={cn(
						"text-4xl sm:text-5xl font-black tracking-tight tabular-nums",
						scenario.isPlusEV ? "text-emerald-400" : "text-gold-300",
					)}
				>
					{formatCurrency(scenario.totalEV)}
				</p>
				<div className="flex items-center justify-center gap-2 mt-2">
					{scenario.isPlusEV ? (
						<TrendingUp size={16} className="text-emerald-400" />
					) : scenario.edge < -0.5 ? (
						<Sparkles size={16} className="text-gold-300" />
					) : (
						<Minus size={16} className="text-muted-foreground" />
					)}
					<span
						className={cn(
							"text-sm font-bold",
							scenario.isPlusEV ? "text-emerald-400" : "text-gold-300",
						)}
					>
						{scenario.isPlusEV
							? `${formatPercent(scenario.edgePercent)} edge`
							: "Jackpot building"}
					</span>
					{scenario.isPlusEV && (
						<span className="text-xs text-muted-foreground">
							({formatCurrency(scenario.edge)} per ticket)
						</span>
					)}
				</div>
			</div>

			{/* Breakdown table */}
			<div>
				<h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
					Prize Tier Breakdown
				</h4>
				<div className="space-y-2">
					{/* Header row */}
					<div className="grid grid-cols-4 gap-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2">
						<span>Tier</span>
						<span className="text-center">Prize</span>
						<span className="text-center">Odds (1 in)</span>
						<span className="text-right">EV</span>
					</div>

					{scenario.results.map((tier) => (
						<div
							key={tier.matchTier}
							className={cn(
								"grid grid-cols-4 gap-2 items-center py-2.5 px-3 rounded-lg text-sm border transition-colors",
								tier.evContribution > 0.5
									? "bg-emerald-500/5 border-emerald-500/10"
									: "bg-foreground/3 border-foreground/5",
							)}
						>
							<span className="font-semibold text-foreground">
								{tier.matchTier}
							</span>
							<span className="text-center font-medium tabular-nums text-foreground">
								{formatCurrency(tier.prizePerWinner)}
							</span>
							<span className="text-center text-muted-foreground tabular-nums">
								{tier.probability < 0.0001
									? (1 / tier.probability).toLocaleString("en-US", {
											maximumFractionDigits: 0,
										})
									: (1 / tier.probability).toFixed(1)}
							</span>
							<span
								className={cn(
									"text-right font-bold tabular-nums",
									tier.evContribution > 1.0
										? "text-emerald-400"
										: tier.evContribution > 0.3
											? "text-foreground"
											: "text-muted-foreground",
								)}
							>
								{formatCurrency(tier.evContribution)}
							</span>
						</div>
					))}
				</div>
			</div>

			{/* Rolldown mode: pari-mutuel note */}
			{rolldownActive && (
				<div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-foreground/3 border border-foreground/5">
					<Info size={14} className="text-muted-foreground shrink-0 mt-0.5" />
					<p className="text-[10px] text-muted-foreground leading-relaxed">
						Prizes are{" "}
						<span className="font-semibold text-foreground">pari-mutuel</span>{" "}
						during rolldown — per-winner amounts decrease as more tickets are
						sold. This protects the protocol from unbounded liability while
						maintaining fair distribution. The more popular the draw, the more
						winners share each pool.
					</p>
				</div>
			)}

			{/* Normal mode: rolldown teaser */}
			{!rolldownActive && (
				<div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/10">
					<Info size={14} className="text-amber-400 shrink-0 mt-0.5" />
					<p className="text-[10px] text-muted-foreground leading-relaxed">
						In normal mode, a share of every ticket is set aside to build the
						jackpot. Once it reaches{" "}
						<span className="font-semibold text-foreground">$1.75M</span> and
						rolldown activates, that jackpot is distributed back to players as
						pari-mutuel prizes. This is the +EV window that makes MazelProtocol
						unique.
					</p>
				</div>
			)}
		</div>
	);
}

/* -------------------------------------------------------------------------- */
/*  Compact EV badge for inline use                                           */
/* -------------------------------------------------------------------------- */

export interface EVBadgeProps {
	jackpotAmount: number;
	rolldownActive: boolean;
	loading?: boolean;
	className?: string;
}

export function EVBadge({
	jackpotAmount,
	rolldownActive,
	loading = false,
	className,
}: EVBadgeProps) {
	const data = useMemo(() => {
		if (!rolldownActive || loading) return null;

		// Quick estimate at 475k tickets for badge display
		const totalPool = jackpotAmount * (ROLLDOWN_JACKPOT_ALLOCATION_BPS / 10000);
		const estWinners5 = Math.max(1, Math.round(475_000 * ODDS.match5));
		const estWinners4 = Math.max(1, Math.round(475_000 * ODDS.match4));
		const estWinners3 = Math.max(1, Math.round(475_000 * ODDS.match3));

		const ev =
			ODDS.match5 * ((totalPool * ROLLDOWN_POOL_SHARES.match5) / estWinners5) +
			ODDS.match4 * ((totalPool * ROLLDOWN_POOL_SHARES.match4) / estWinners4) +
			ODDS.match3 * ((totalPool * ROLLDOWN_POOL_SHARES.match3) / estWinners3) +
			ODDS.match2 * TICKET_PRICE;

		return {
			ev,
			edgePercent: ((ev - TICKET_PRICE) / TICKET_PRICE) * 100,
		};
	}, [jackpotAmount, rolldownActive, loading]);

	if (loading) {
		return (
			<div
				className={cn(
					"inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/50 animate-pulse",
					className,
				)}
			>
				<div className="w-2 h-2 rounded-full bg-foreground/20" />
				<div className="h-3 w-16 bg-foreground/10 rounded" />
			</div>
		);
	}

	if (!data) {
		return (
			<div
				className={cn(
					"inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-foreground/5 border border-foreground/10",
					className,
				)}
			>
				<div className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
				<span className="text-[10px] font-medium text-muted-foreground">
					Standard Mode
				</span>
			</div>
		);
	}

	return (
		<div
			className={cn(
				"inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full",
				data.edgePercent > 50
					? "bg-emerald-500/15 border border-emerald-500/30"
					: "bg-emerald-500/10 border border-emerald-500/20",
				className,
			)}
		>
			<div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
			<span className="text-[10px] font-bold text-emerald-400">
				+{data.edgePercent.toFixed(0)}% EV
			</span>
		</div>
	);
}
