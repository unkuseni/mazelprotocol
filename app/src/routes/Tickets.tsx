import { PublicKey } from "@solana/web3.js";
import {
	AlertTriangle,
	ArrowUpDown,
	Check,
	ChevronDown,
	ChevronRight,
	Clock,
	ExternalLink,
	Eye,
	Filter,
	Gift,
	type LucideIcon,
	Search,
	Shield,
	Sparkles,
	Star,
	Ticket,
	TrendingUp,
	Trophy,
	Wallet,
	X,
	Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CountdownTimer } from "@/components/CountdownTimer";
import Footer from "@/components/Footer";
import { JackpotDisplay } from "@/components/JackpotDisplay";
import { FloatingBalls, WinningNumbers } from "@/components/LotteryBalls";
import { Button } from "@/components/ui/button";
import { useLotteryState } from "@/hooks/use-lottery-state";
import { type UserTicket, useTickets } from "@/hooks/use-tickets";
import { useAnchorProvider } from "@/lib/anchor/provider";
import {
	claimAllMainPrizes,
	claimMainPrize,
	claimQuickPickPrize,
	fetchUserStats,
	usdcTokenAccountAddress,
} from "@/lib/anchor/transactions";
import { useAppKit, useAppKitAccount } from "@/lib/appkit-provider";

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
	/** On-chain ticket account address (base58), used for claiming. */
	ticketAddress?: string;
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
/*  NOTE: no mock ticket data (review M5).                                     */
/*  The page renders live on-chain tickets from useTickets(). Any legacy       */
/*  MOCK_TICKETS array was removed — it showed fabricated 2025 records that    */
/*  could not be claimed (no on-chain address) and misled users.               */
/* -------------------------------------------------------------------------- */

// Free ticket credits are read live from on-chain UserStats in the page
// component (see `freeTicketCredits`). No mock constant is used (review M5).

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
			if (ticket.winningNumbers?.includes(num)) {
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
							<span className="text-[9px] text-emerald-light/70 font-medium flex items-center gap-0.5 truncate max-w-30">
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

				{/* Draw info - compact on mobile */}
				<div className="text-right shrink-0">
					<div className="text-[10px] text-muted-foreground">
						<span className="sm:hidden">#</span>Draw{" "}
						<span className="hidden sm:inline">#</span>
						{ticket.drawId}
					</div>
					<div className="text-[10px] text-muted-foreground/60 truncate max-w-25 sm:max-w-none">
						{ticket.drawDate}
					</div>
				</div>

				{/* Match count / Prize */}
				<div className="text-right shrink-0 min-w-12.5 sm:min-w-15">
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
	busy = false,
}: {
	total: number;
	count: number;
	onClaimAll: () => void;
	/** Disable the button while a batch claim is in flight. */
	busy?: boolean;
}) {
	if (total <= 0) return null;

	return (
		<div className="relative glass-strong rounded-2xl p-4 sm:p-6 overflow-hidden border border-gold/20 w-full">
			<div className="absolute inset-0 bg-linear-to-br from-gold/4 via-transparent to-emerald/2" />
			<div className="absolute top-0 right-0 w-40 h-40 bg-glow-gold opacity-15" />

			<div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
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
					disabled={busy}
					className="w-full sm:w-auto h-11 px-6 bg-linear-to-r from-gold-dark to-gold-light hover:from-gold hover:to-gold-light text-navy font-bold rounded-xl shadow-lg shadow-gold/25 hover:shadow-gold/40 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] shrink-0 disabled:opacity-60 disabled:pointer-events-none"
				>
					<Gift size={16} />
					{busy ? "Claiming…" : `Claim All ($${total.toFixed(2)})`}
				</Button>
			</div>
		</div>
	);
}

function TicketStats({
	tickets,
	freeCredits,
}: {
	tickets: TicketData[];
	freeCredits: number;
}) {
	const totalTickets = tickets.length;
	const pendingCount = tickets.filter((t) => t.status === "pending").length;
	const wonCount = tickets.filter(
		(t) => t.status === "won" || t.status === "claimed",
	).length;
	const totalPrizes = tickets.reduce((sum, t) => sum + t.prize, 0);

	return (
		<div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
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
					{freeCredits}
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
	// SECURITY (review M5): the jackpot below was previously hardcoded to a
	// fake $1,247,832. Now reads live on-chain state.
	const {
		jackpotDollars,
		state: lotteryState,
		nextDrawTimeMs,
	} = useLotteryState();

	return (
		<div className="min-h-screen bg-background">
			<section className="relative pt-24 pb-8 sm:pt-28 sm:pb-12 px-4 sm:px-6 lg:px-8 overflow-hidden">
				<div className="absolute inset-0 hero-grid opacity-30" />
				<div className="absolute inset-0 bg-glow-emerald opacity-15" />
				<FloatingBalls count={5} />

				<div className="relative z-10 max-w-2xl mx-auto text-center py-6 sm:py-8 mt-16 sm:mt-24">
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
							amount={jackpotDollars}
							unknown={lotteryState === null}
							size="lg"
							glow
							showRolldownStatus
							softCap={1_750_000}
						/>

						<div className="mt-8">
							{nextDrawTimeMs ? (
								<CountdownTimer
									size="md"
									label="Next Draw"
									targetTime={nextDrawTimeMs}
								/>
							) : (
								<div className="text-[10px] text-muted-foreground/60">
									Next draw schedule loading…
								</div>
							)}
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
					className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-linear-to-r from-emerald to-emerald-dark hover:from-emerald-light hover:to-emerald text-white text-sm font-bold rounded-xl shadow-lg shadow-emerald/25 hover:shadow-emerald/40 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
				>
					<Trophy size={14} />
					Buy Tickets
				</Link>
			)}
		</div>
	);
}

/* -------------------------------------------------------------------------- */
/*  Data mapping — UserTicket → TicketData                                   */
/* -------------------------------------------------------------------------- */

/** USDC has 6 decimal places on-chain. */
const USDC_DECIMALS = 6;

/** Convert bigint lamports to a dollar number for display. */
function lamportsToDollars(lamports: bigint): number {
	return Number(lamports) / 10 ** USDC_DECIMALS;
}

/** Derive a UI-facing status from on-chain ticket fields. */
function deriveStatus(
	matchCount: number,
	isClaimed: boolean,
	winningNumbers: number[],
): TicketStatus {
	// Draw not yet settled — no winning numbers published yet
	if (winningNumbers.length === 0) return "pending";
	if (isClaimed) return "claimed";
	// Match 2+ is a win (free ticket for main lottery, small prize for QP)
	if (matchCount >= 2) return "won";
	return "lost";
}

/** Map a `UserTicket` from the `useTickets` hook to the `TicketData` shape the UI expects. */
function mapUserTicketToTicketData(t: UserTicket): TicketData {
	const winningNumbers = t.winningNumbers.length > 0 ? t.winningNumbers : null;

	return {
		id: t.id,
		ticketAddress: t.ticketAddress,
		numbers: t.numbers,
		drawId: t.drawId,
		drawDate: winningNumbers
			? new Date(t.purchaseTime * 1000).toISOString().split("T")[0]
			: "Pending",
		winningNumbers,
		purchaseTime: new Date(t.purchaseTime * 1000).toISOString(),
		gameType: t.gameType,
		isQuickPick: t.isQuickPick,
		isSyndicateTicket: t.isSyndicateTicket,
		status: deriveStatus(t.matchCount, t.isClaimed, t.winningNumbers),
		matchCount: t.matchCount,
		prize: lamportsToDollars(t.prize),
		isClaimed: t.isClaimed,
		isExpired: false,
		wasRolldown: false,
		txSignature: "",
	};
}

/* -------------------------------------------------------------------------- */
/*  Main Component                                                            */
/* -------------------------------------------------------------------------- */

export default function MyTicketsPage() {
	const { open } = useAppKit();
	const { isConnected } = useAppKitAccount();
	const [filter, setFilter] = useState<TicketFilter>("all");
	const [searchQuery, setSearchQuery] = useState("");
	const [sortField, setSortField] = useState<SortField>("date");
	const [sortDir, setSortDir] = useState<SortDir>("desc");
	const [expandedTicket, setExpandedTicket] = useState<string | null>(null);
	const [gameFilter, setGameFilter] = useState<"all" | GameType>("all");

	// ---- real on-chain data --------------------------------------------------
	const {
		tickets: rawTickets,
		unclaimedTickets: rawUnclaimed,
		unclaimedPrizeTotal,
		loading,
		error: fetchError,
		refetch,
	} = useTickets();

	// Map UserTicket -> TicketData for the existing UI components
	const allTickets = useMemo<TicketData[]>(
		() => rawTickets.map(mapUserTicketToTicketData),
		[rawTickets],
	);

	const filteredTickets = useMemo(() => {
		let result = [...allTickets];

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
	}, [allTickets, filter, gameFilter, searchQuery, sortField, sortDir]);

	const unclaimedTickets = useMemo<TicketData[]>(
		() => rawUnclaimed.map(mapUserTicketToTicketData),
		[rawUnclaimed],
	);

	const handleClaim = (id: string) => {
		if (!isConnected) {
			open({ view: "Connect", namespace: "solana" });
			return;
		}
		// SECURITY (review H5): this previously only showed an alert — users
		// could never actually claim winnings (and lost them to expiry). Now it
		// submits the real on-chain claim against the ticket's actual PDA.
		const ticket =
			rawTickets.find((t) => t.id === id) ??
			rawUnclaimed.find((t) => t.id === id);
		if (!ticket) return;
		setClaimingId(id);
		void runClaim(ticket).finally(() => setClaimingId(null));
	};

	const handleClaimAll = () => {
		if (!isConnected) {
			open({ view: "Connect", namespace: "solana" });
			return;
		}
		if (!connectedProvider || unclaimedTickets.length === 0) return;
		setClaimingAll(true);
		setClaimMessage(null);
		void (async () => {
			try {
				const playerUsdc = usdcTokenAccountAddress(
					connectedProvider.wallet.publicKey,
				);
				const mainTickets = unclaimedTickets.filter(
					(t) => t.gameType === "main",
				);
				const qpTickets = unclaimedTickets.filter(
					(t) => t.gameType === "quickpick",
				);
				if (mainTickets.length > 0) {
					await claimAllMainPrizes(
						connectedProvider,
						mainTickets
							.filter((t) => !!t.ticketAddress)
							.map((t) => ({
								drawId: t.drawId,
								ticketIndex: 0, // unused when ticketAddress is provided
								ticketAddress: t.ticketAddress,
							})),
						playerUsdc,
					);
				}
				for (const t of qpTickets) {
					// Skip tickets without an on-chain address rather than crashing
					// the whole batch (review: claim safety).
					if (!t.ticketAddress) continue;
					await claimQuickPickPrize(
						connectedProvider,
						t.drawId,
						0,
						playerUsdc,
						{},
						new PublicKey(t.ticketAddress),
					);
				}
				setClaimMessage({
					kind: "success",
					text: `Claimed ${unclaimedTickets.length} prize(s)!`,
				});
				refetch();
			} catch (error) {
				const msg = error instanceof Error ? error.message : String(error);
				setClaimMessage({ kind: "error", text: `Batch claim failed: ${msg}` });
			} finally {
				setClaimingAll(false);
			}
		})();
	};

	const handleSort = (field: SortField) => {
		if (sortField === field) {
			setSortDir((d) => (d === "desc" ? "asc" : "desc"));
		} else {
			setSortField(field);
			setSortDir("desc");
		}
	};

	// ---- on-chain claiming state (review H5) -------------------------------
	const [claimingId, setClaimingId] = useState<string | null>(null);
	const [claimingAll, setClaimingAll] = useState(false);
	const [claimMessage, setClaimMessage] = useState<{
		kind: "success" | "error";
		text: string;
	} | null>(null);

	const { connectedProvider } = useAnchorProvider();

	// ---- free ticket credits from on-chain UserStats (review M5) ------------
	// Previously hardcoded to MOCK_FREE_TICKET_CREDITS = 0, so Match-2 free
	// tickets could never be shown or used. Now read from UserStats.
	const [freeTicketCredits, setFreeTicketCredits] = useState(0);
	const walletPubkey = connectedProvider?.wallet.publicKey ?? null;

	useEffect(() => {
		let cancelled = false;
		if (!connectedProvider || !walletPubkey) {
			setFreeTicketCredits(0);
			return;
		}
		void (async () => {
			try {
				const stats = await fetchUserStats(connectedProvider, walletPubkey);
				if (cancelled || !stats) return;
				const raw =
					stats.freeTicketsAvailable ?? stats.free_tickets_available ?? 0;
				const count =
					typeof raw === "bigint" || typeof raw === "number"
						? Number(raw)
						: Number(String(raw ?? 0));
				if (!cancelled) setFreeTicketCredits(count);
			} catch {
				// Non-fatal — leave credits at 0 if the fetch fails
			}
		})();
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [connectedProvider, walletPubkey]);

	const runClaim = useCallback(
		async (t: UserTicket): Promise<void> => {
			if (!connectedProvider) return;
			const playerUsdc = usdcTokenAccountAddress(
				connectedProvider.wallet.publicKey,
			);
			setClaimMessage(null);
			try {
				// SECURITY: the ticket's on-chain account address must be known to
				// claim. Tickets without one (e.g. legacy/unsynced records) cannot
				// be claimed — fail loudly instead of building a broken tx.
				if (!t.ticketAddress) {
					setClaimMessage({
						kind: "error",
						text: `Ticket ${t.id} has no on-chain address — please refresh and try again.`,
					});
					return;
				}
				const ticketPubkey = new PublicKey(t.ticketAddress);
				if (t.gameType === "main") {
					// ticketIndex is unused when an explicit ticket pubkey is provided
					await claimMainPrize(
						connectedProvider,
						t.drawId,
						0,
						playerUsdc,
						{},
						ticketPubkey,
					);
				} else {
					await claimQuickPickPrize(
						connectedProvider,
						t.drawId,
						0,
						playerUsdc,
						{},
						ticketPubkey,
					);
				}
				setClaimMessage({
					kind: "success",
					text: `Prize claimed for ticket ${t.id}!`,
				});
				refetch();
			} catch (error) {
				const msg = error instanceof Error ? error.message : String(error);
				setClaimMessage({
					kind: "error",
					text: `Claim failed for ticket ${t.id}: ${msg}`,
				});
			}
		},
		[connectedProvider, refetch],
	);

	const filterCounts = useMemo(() => {
		const gameFiltered =
			gameFilter === "all"
				? allTickets
				: allTickets.filter((t) => t.gameType === gameFilter);
		return {
			all: gameFiltered.length,
			pending: gameFiltered.filter((t) => t.status === "pending").length,
			won: gameFiltered.filter((t) => t.status === "won").length,
			lost: gameFiltered.filter((t) => t.status === "lost").length,
			claimed: gameFiltered.filter((t) => t.status === "claimed").length,
		};
	}, [allTickets, gameFilter]);

	// Show wallet prompt when not connected (after all hooks)
	if (!isConnected) {
		return <WalletNotConnected />;
	}

	// ---- loading skeleton ---------------------------------------------------
	if (loading) {
		return (
			<div className="min-h-screen bg-background">
				<section className="relative pt-24 pb-6 sm:pt-28 sm:pb-8 px-4 sm:px-6 lg:px-8 overflow-hidden">
					<div className="absolute inset-0 hero-grid opacity-20" />
					<div className="relative z-10 max-w-7xl mx-auto">
						<nav className="flex items-center gap-2 text-xs text-muted-foreground mb-6">
							<Link to="/" className="hover:text-foreground transition-colors">
								Home
							</Link>
							<ChevronRight size={12} />
							<span className="text-emerald-light font-medium">My Tickets</span>
						</nav>
						<div className="flex items-center gap-3 mb-4">
							<div className="p-2 rounded-xl bg-linear-to-br from-emerald/20 to-emerald-dark/10 border border-emerald/20">
								<Ticket size={24} className="text-emerald-light" />
							</div>
							<div>
								<div className="h-7 w-40 bg-foreground/8 rounded-lg animate-pulse" />
								<div className="h-4 w-60 bg-foreground/5 rounded-lg mt-2 animate-pulse" />
							</div>
						</div>
					</div>
				</section>
				<section className="px-4 sm:px-6 lg:px-8 pb-16">
					<div className="max-w-7xl mx-auto py-6 sm:py-8 space-y-6">
						<div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
							{Array.from({ length: 4 }).map((_, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholder
								<div
									key={`skel-stat-${i}`}
									className="glass rounded-xl p-3 text-center animate-pulse"
								>
									<div className="h-6 w-12 bg-foreground/8 rounded mx-auto mb-1" />
									<div className="h-3 w-16 bg-foreground/5 rounded mx-auto" />
								</div>
							))}
						</div>
						<div className="space-y-2">
							{Array.from({ length: 4 }).map((_, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholder
								<div
									key={`skel-row-${i}`}
									className="glass rounded-xl p-4 animate-pulse"
								>
									<div className="flex items-center gap-3">
										<div className="w-2 h-2 rounded-full bg-foreground/10" />
										<div className="flex-1">
											<div className="h-4 w-48 bg-foreground/6 rounded mb-2" />
											<div className="h-3 w-32 bg-foreground/4 rounded" />
										</div>
										<div className="h-4 w-16 bg-foreground/6 rounded" />
									</div>
								</div>
							))}
						</div>
					</div>
				</section>
				<Footer />
			</div>
		);
	}

	// ---- error state ---------------------------------------------------------
	if (fetchError) {
		return (
			<div className="min-h-screen bg-background">
				<section className="relative pt-24 pb-6 sm:pt-28 sm:pb-8 px-4 sm:px-6 lg:px-8 overflow-hidden">
					<div className="absolute inset-0 hero-grid opacity-20" />
					<div className="relative z-10 max-w-7xl mx-auto text-center py-6 sm:py-8">
						<div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 mb-4">
							<AlertTriangle size={28} className="text-red-400" />
						</div>
						<h2 className="text-xl font-bold text-foreground mb-2">
							Failed to load tickets
						</h2>
						<p className="text-sm text-muted-foreground mb-6">{fetchError}</p>
						<Button
							onClick={refetch}
							className="h-10 px-6 bg-linear-to-r from-emerald to-emerald-dark hover:from-emerald-light hover:to-emerald text-white font-bold rounded-xl"
						>
							Try Again
						</Button>
					</div>
				</section>
				<Footer />
			</div>
		);
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

				<div className="relative z-10 max-w-7xl mx-auto py-6 sm:py-8">
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
							{freeTicketCredits > 0 && (
								<div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gold/10 border border-gold/20">
									<Sparkles size={14} className="text-gold" />
									<span className="text-xs font-bold text-gold">
										{freeTicketCredits} Free
									</span>
								</div>
							)}
							<Link
								to="/play"
								className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-linear-to-r from-emerald to-emerald-dark hover:from-emerald-light hover:to-emerald text-white text-sm font-bold rounded-xl shadow-lg shadow-emerald/25 hover:shadow-emerald/40 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
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
				<div className="max-w-7xl mx-auto py-6 sm:py-8 space-y-6">
					{/* Stats */}
					<TicketStats tickets={allTickets} freeCredits={freeTicketCredits} />

					{/* Unclaimed banner */}
					<UnclaimedBanner
						total={lamportsToDollars(unclaimedPrizeTotal)}
						count={unclaimedTickets.length}
						onClaimAll={handleClaimAll}
						busy={claimingAll}
					/>

					{/* Claim status message (review H5) */}
					{claimMessage && (
						<div
							className={`rounded-xl px-4 py-3 text-sm font-semibold border ${
								claimMessage.kind === "success"
									? "bg-emerald/10 border-emerald/30 text-emerald-light"
									: "bg-red-500/10 border-red-500/30 text-red-400"
							}`}
						>
							{claimingAll || claimingId ? "⏳ " : ""}
							{claimMessage.text}
						</div>
					)}

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
							<div className="flex items-center gap-1 shrink-0 flex-wrap">
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
						<h3 className="text-xs sm:text-sm font-bold text-foreground flex items-center gap-2 mb-4">
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
		</div>
	);
}
