import {
	AlertTriangle,
	ArrowUpDown,
	BarChart3,
	Check,
	ChevronRight,
	Clock,
	Crown,
	Eye,
	Filter,
	Lock,
	Plus,
	Search,
	Settings,
	Shield,
	Sparkles,
	Target,
	TrendingUp,
	Trophy,
	Unlock,
	UserPlus,
	Users,
	Wallet,
	X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FloatingBalls } from "@/components/LotteryBalls";
import { Button } from "@/components/ui/button";
import { deriveSyndicatePDA } from "@/lib/anchor/pda";
import { useAnchorProvider } from "@/lib/anchor/provider";
import {
	fetchAllSyndicates,
	type OnChainSyndicate,
} from "@/lib/anchor/syndicate";
import { createSyndicate } from "@/lib/anchor/transactions-lp-syndicate";
import { useAppKit, useAppKitAccount } from "@/lib/appkit-provider";

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
		id: "alpha-lottery-dao",
		name: "Alpha Lottery DAO",
		creator: "7xKXq9Rm4p3sT8vN2wBcDfGh1jLkMnPr5tYuZaEb",
		creatorShort: "7xKX...ZaEb",
		members: 23,
		maxMembers: 25,
		totalTickets: 4_820,
		totalWinnings: 34_200,
		isPublic: true,
		managerFeeBps: 200,
		activeSince: "Jan 2025",
		ticketsThisDraw: 52,
		drawsParticipated: 89,
		winRate: 72.4,
		tags: ["Top Earner", "+EV Focused"],
	},
	{
		id: "diamond-hands-club",
		name: "Diamond Hands Club",
		creator: "3mNPw7Rt2kBxYcFg8hJdLqSvUzAa9nEp4oWiXsMt",
		creatorShort: "3mNP...XsMt",
		members: 18,
		maxMembers: 30,
		totalTickets: 3_240,
		totalWinnings: 22_800,
		isPublic: true,
		managerFeeBps: 150,
		activeSince: "Feb 2025",
		ticketsThisDraw: 38,
		drawsParticipated: 67,
		winRate: 68.2,
		tags: ["Consistent"],
	},
	{
		id: "whale-pool-prime",
		name: "Whale Pool Prime",
		creator: "9bQRy5Xk7mDzWcHn3pLsAtGv1jEf8uBi2oNrKwTq",
		creatorShort: "9bQR...KwTq",
		members: 12,
		maxMembers: 15,
		totalTickets: 6_100,
		totalWinnings: 48_500,
		isPublic: false,
		managerFeeBps: 300,
		activeSince: "Dec 2024",
		ticketsThisDraw: 87,
		drawsParticipated: 102,
		winRate: 78.1,
		tags: ["Top Earner", "Whale"],
	},
	{
		id: "rolldown-raiders",
		name: "Rolldown Raiders",
		creator: "4jWSd6Yn1rFzXcKm8pLtBvHg3eAf9uDi2oNqMwSx",
		creatorShort: "4jWS...MwSx",
		members: 15,
		maxMembers: 20,
		totalTickets: 2_100,
		totalWinnings: 18_900,
		isPublic: true,
		managerFeeBps: 250,
		activeSince: "Mar 2025",
		ticketsThisDraw: 45,
		drawsParticipated: 34,
		winRate: 82.4,
		tags: ["+EV Only", "High Win Rate"],
	},
	{
		id: "degen-lottery-squad",
		name: "Degen Lottery Squad",
		creator: "6cYTh8Zn3rFzXcKm2pLtBvHg5eAf1uDi4oNqMwJx",
		creatorShort: "6cYT...MwJx",
		members: 31,
		maxMembers: 50,
		totalTickets: 5_600,
		totalWinnings: 15_200,
		isPublic: true,
		managerFeeBps: 0,
		activeSince: "Jan 2025",
		ticketsThisDraw: 64,
		drawsParticipated: 91,
		winRate: 54.3,
		tags: ["No Fee", "Community"],
	},
	{
		id: "solana-sharks",
		name: "Solana Sharks",
		creator: "8dZUi9Xk5mDzWcHn7pLsAtGv3jEf2uBi6oNrKwRq",
		creatorShort: "8dZU...KwRq",
		members: 8,
		maxMembers: 10,
		totalTickets: 3_800,
		totalWinnings: 42_100,
		isPublic: false,
		managerFeeBps: 500,
		activeSince: "Nov 2024",
		ticketsThisDraw: 72,
		drawsParticipated: 115,
		winRate: 85.2,
		tags: ["Top Earner", "Invite Only"],
	},
	{
		id: "lucky-7s-collective",
		name: "Lucky 7s Collective",
		creator: "2kMNa4Bp7cDxYeGh9jLqSvUzAa1nEp6oWiRtFsXm",
		creatorShort: "2kMN...FsXm",
		members: 14,
		maxMembers: 21,
		totalTickets: 1_890,
		totalWinnings: 8_400,
		isPublic: true,
		managerFeeBps: 100,
		activeSince: "Apr 2025",
		ticketsThisDraw: 21,
		drawsParticipated: 28,
		winRate: 57.1,
		tags: ["New", "Fun"],
	},
	{
		id: "night-owls-syndicate",
		name: "Night Owls Syndicate",
		creator: "5fHJb8Cp3dExZeGk1jLqTvUzBa7nFp4oWiStGsYn",
		creatorShort: "5fHJ...GsYn",
		members: 19,
		maxMembers: 25,
		totalTickets: 2_670,
		totalWinnings: 11_300,
		isPublic: true,
		managerFeeBps: 0,
		activeSince: "Feb 2025",
		ticketsThisDraw: 33,
		drawsParticipated: 52,
		winRate: 61.5,
		tags: ["No Fee", "Community"],
	},
];

const SYNDICATE_WARS_SEASON = {
	season: 3,
	endsIn: "4 days",
	topSyndicate: "Alpha Lottery DAO",
	prizePool: 12_500,
	participants: 8,
};

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                            */
/* -------------------------------------------------------------------------- */

function SyndicateCard({ syndicate }: { syndicate: Syndicate }) {
	const isFull = syndicate.members >= syndicate.maxMembers;
	const fillPercent = (syndicate.members / syndicate.maxMembers) * 100;

	return (
		<Link
			to={`/syndicates/${syndicate.id}`}
			className="group block hud-frame rounded-lg p-5 transition-all duration-300 hover:border-cyan-400/40 hover:shadow-lg hover:shadow-cyan-500/10"
		>
			{/* Header */}
			<div className="flex items-start justify-between mb-3">
				<div className="flex items-center gap-3 min-w-0">
					{/* Avatar */}
					<div
						className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm ${
							syndicate.totalWinnings >= 20_000
								? "bg-linear-to-br from-gold-500/30 to-gold-600/20 text-gold-300 border border-gold-500/30"
								: syndicate.totalWinnings >= 10_000
									? "bg-linear-to-br from-emerald-400/20 to-emerald-600/10 text-emerald-400 border border-emerald-500/30"
									: "bg-foreground/4 text-muted-foreground border border-foreground/6"
						}`}
					>
						{syndicate.name.charAt(0)}
					</div>
					<div className="min-w-0">
						<h3 className="text-sm font-bold text-foreground truncate group-hover:text-cyan-300 transition-colors">
							{syndicate.name}
						</h3>
						<div className="flex items-center gap-1.5 mt-0.5">
							<span className="text-[10px] text-muted-foreground font-mono">
								by {syndicate.creatorShort}
							</span>
							{!syndicate.isPublic && (
								<Lock size={9} className="text-muted-foreground" />
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
									? "bg-gold-500/15 text-gold-300 border border-gold-500/30"
									: tag === "Full"
										? "bg-red-500/10 text-red-400 border border-red-500/20"
										: tag === "New"
											? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
											: tag === "No Fee"
												? "bg-violet-500/10 text-violet-400 border border-violet-500/30"
												: "bg-foreground/5 text-muted-foreground border border-foreground/6"
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
					<div className="hud-label mb-1">Winnings</div>
					<div className="font-mono text-sm font-bold text-gradient-gold">
						${syndicate.totalWinnings.toLocaleString()}
					</div>
				</div>
				<div>
					<div className="hud-label mb-1">Win Rate</div>
					<div className="font-mono text-sm font-bold text-emerald-400">
						{syndicate.winRate}%
					</div>
				</div>
				<div>
					<div className="hud-label mb-1">This Draw</div>
					<div className="font-mono text-sm font-bold text-cyan-300">
						{syndicate.ticketsThisDraw}
						<span className="text-[10px] text-muted-foreground font-normal ml-0.5">
							tix
						</span>
					</div>
				</div>
			</div>

			{/* Members bar */}
			<div className="mb-4">
				<div className="flex items-center justify-between text-[10px] mb-1.5">
					<span className="text-muted-foreground flex items-center gap-1">
						<Users size={10} />
						Members
					</span>
					<span
						className={`font-mono font-bold ${isFull ? "text-red-400" : "text-cyan-300"}`}
					>
						{syndicate.members}/{syndicate.maxMembers}
					</span>
				</div>
				<div className="h-1.5 bg-foreground/5 rounded-full overflow-hidden">
					<div
						className={`h-full rounded-full transition-all duration-500 ${
							isFull
								? "bg-linear-to-r from-red-500 to-red-400"
								: fillPercent >= 80
									? "bg-linear-to-r from-gold-500 to-gold-300"
									: "bg-linear-to-r from-emerald-600 to-emerald-400"
						}`}
						style={{ width: `${fillPercent}%` }}
					/>
				</div>
			</div>

			{/* Meta info row */}
			<div className="flex items-center justify-between font-mono text-[10px] text-muted-foreground mb-4">
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
				<div className="w-full h-9 text-xs font-semibold border border-foreground/10 text-muted-foreground rounded-md inline-flex items-center justify-center gap-2 opacity-50">
					<Lock size={12} />
					Full
				</div>
			) : !syndicate.isPublic ? (
				<div className="w-full h-9 text-xs font-semibold border border-gold-500/30 text-gold-300 rounded-md inline-flex items-center justify-center gap-2">
					<Lock size={12} />
					Request Invite
				</div>
			) : (
				<div className="w-full h-9 text-xs font-bold bg-linear-to-r from-emerald-400 to-emerald-600 text-black rounded-xl shadow-md shadow-emerald-500/20 inline-flex items-center justify-center gap-2 group-hover:from-emerald-300 group-hover:to-emerald-500 group-hover:shadow-emerald-500/30 transition-all duration-300">
					<UserPlus size={12} />
					View &amp; Join
				</div>
			)}
		</Link>
	);
}

function SyndicateWarsBanner() {
	return (
		<div className="relative hud-frame rounded-lg p-5 sm:p-6 overflow-hidden">
			<div className="absolute inset-0 bg-linear-to-br from-gold-500/5 via-transparent to-emerald-500/4" />
			<div className="absolute top-0 right-0 w-48 h-48 bg-glow-gold opacity-20" />

			<div className="relative z-10">
				<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
					<div>
						<div className="flex items-center gap-2 mb-1.5">
							<div className="p-1.5 rounded-lg bg-gold-500/15 border border-gold-500/30">
								<Crown size={16} className="text-gold-300" />
							</div>
							<span className="text-[10px] font-bold text-gold-300 uppercase tracking-wider">
								Syndicate Wars &bull; Season {SYNDICATE_WARS_SEASON.season}
							</span>
						</div>
						<h3 className="font-display text-lg font-black text-foreground uppercase tracking-wide mb-1">
							Compete for{" "}
							<span className="text-gradient-gold">
								${SYNDICATE_WARS_SEASON.prizePool.toLocaleString()}
							</span>{" "}
							Prize Pool
						</h3>
						<p className="text-xs text-muted-foreground max-w-lg">
							Syndicates compete based on total winnings, tickets purchased, and
							member engagement. Top 3 syndicates share the prize pool.
						</p>
					</div>

					<div className="flex flex-col items-end gap-2 shrink-0">
						<div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-xs">
							<Clock size={12} className="text-cyan-300" />
							<span className="text-muted-foreground">
								Ends in{" "}
								<span className="font-mono font-bold text-cyan-300">
									{SYNDICATE_WARS_SEASON.endsIn}
								</span>
							</span>
						</div>
						<div className="flex items-center gap-4 font-mono text-[10px] text-muted-foreground">
							<span>
								<span className="font-bold text-cyan-300">
									{SYNDICATE_WARS_SEASON.participants}
								</span>{" "}
								syndicates competing
							</span>
							<span>
								Leading:{" "}
								<span className="font-bold text-gold-300">
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
	const { open: openWallet } = useAppKit();
	const { isConnected } = useAppKitAccount();
	const { connectedProvider } = useAnchorProvider();
	const [creating, setCreating] = useState(false);
	const [createError, setCreateError] = useState<string | null>(null);
	const navigate = useNavigate();

	const handleCreate = async () => {
		if (!connectedProvider) {
			setCreateError("Wallet must be connected to create a syndicate");
			return;
		}
		setCreating(true);
		setCreateError(null);
		try {
			// Fee in % → bps; on-chain max is 5% (500 bps).
			const feeBps = Math.min(Math.round(parseFloat(managerFee) * 100), 500);
			// Generate a unique syndicate ID from the name + timestamp.
			const syndicateId = Math.floor(Date.now() / 1000) % 2_000_000_000;
			await createSyndicate(connectedProvider, {
				syndicateId,
				name: name.trim(),
				isPublic,
				managerFeeBps: feeBps,
			});
			// Derive the new syndicate PDA and open its on-chain detail page.
			const [syndicatePubkey] = deriveSyndicatePDA(
				connectedProvider.wallet.publicKey,
				syndicateId,
			);
			onClose();
			setName("");
			navigate(`/syndicates/${syndicatePubkey.toBase58()}`);
		} catch (err) {
			setCreateError(
				err instanceof Error ? err.message : "Failed to create syndicate",
			);
		} finally {
			setCreating(false);
		}
	};

	if (!open) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4">
			{/* Backdrop */}
			<button
				type="button"
				className="absolute inset-0 bg-black/70 backdrop-blur-sm border-none cursor-default"
				onClick={onClose}
				onKeyDown={(e) => e.key === "Escape" && onClose()}
				aria-label="Close modal"
			/>

			{/* Modal */}
			<div className="relative glass-strong rounded-none sm:rounded-2xl p-6 sm:p-8 max-w-md w-full h-full sm:h-auto sm:max-w-lg border border-cyan-500/30 shadow-2xl shadow-black/50 animate-slide-up overflow-y-auto">
				<div className="flex items-center justify-between mb-6">
					<div className="flex items-center gap-2">
						<div className="p-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30">
							<Plus size={16} className="text-emerald-400" />
						</div>
						<h2 className="font-display text-lg font-bold text-foreground uppercase tracking-wide">
							Create Syndicate
						</h2>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
					>
						<X size={18} />
					</button>
				</div>

				<div className="space-y-4">
					{/* Name */}
					<div>
						<label
							htmlFor="syndicate-name"
							className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5"
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
							className="w-full h-10 px-3 rounded-xl bg-surface-1/70 border border-cyan-500/20 text-sm text-foreground placeholder-gray-600 focus:outline-none focus:border-cyan-400/60 focus:ring-1 focus:ring-cyan-500/30 transition-colors"
						/>
						<p className="text-[10px] text-muted-foreground/60 mt-1">
							{name.length}/32 characters
						</p>
					</div>

					{/* Max Members */}
					<div>
						<label
							htmlFor="max-members"
							className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5"
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
							className="w-full h-10 px-3 rounded-xl bg-surface-1/70 border border-cyan-500/20 text-sm text-foreground placeholder-gray-600 focus:outline-none focus:border-cyan-400/60 focus:ring-1 focus:ring-cyan-500/30 transition-colors"
						/>
						<p className="text-[10px] text-muted-foreground/60 mt-1">
							Between 2 and 100 members
						</p>
					</div>

					{/* Manager Fee */}
					<div>
						<label
							htmlFor="manager-fee"
							className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5"
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
							className="w-full h-10 px-3 rounded-xl bg-surface-1/70 border border-cyan-500/20 text-sm text-foreground placeholder-gray-600 focus:outline-none focus:border-cyan-400/60 focus:ring-1 focus:ring-cyan-500/30 transition-colors"
						/>
						<p className="text-[10px] text-muted-foreground/60 mt-1">
							Fee taken from syndicate prize winnings (0-10%)
						</p>
					</div>

					{/* Visibility */}
					<div>
						<span className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
							Visibility
						</span>
						<div className="flex items-center gap-2">
							<button
								type="button"
								onClick={() => setIsPublic(true)}
								className={`flex-1 h-10 rounded-xl flex items-center justify-center gap-2 text-xs font-semibold transition-all ${
									isPublic
										? "bg-emerald-500/15 border border-emerald-500/40 text-emerald-400"
										: "bg-foreground/3 border border-foreground/6 text-muted-foreground hover:bg-foreground/5"
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
										? "bg-gold-500/15 border border-gold-500/40 text-gold-300"
										: "bg-foreground/3 border border-foreground/6 text-muted-foreground hover:bg-foreground/5"
								}`}
							>
								<Lock size={12} />
								Private
							</button>
						</div>
						<p className="text-[10px] text-muted-foreground/60 mt-1.5">
							{isPublic
								? "Anyone can join your syndicate"
								: "Members need an invite to join"}
						</p>
					</div>

					{/* Info */}
					<div className="flex items-start gap-2 p-3 rounded-xl bg-cyan-500/5 border border-cyan-500/10">
						<AlertTriangle
							size={12}
							className="text-gold-300/70 mt-0.5 shrink-0"
						/>
						<p className="text-[10px] text-muted-foreground">
							Creating a syndicate requires a wallet connection. You&apos;ll
							need to sign a transaction to create the on-chain syndicate
							account.
						</p>
					</div>

					{createError && (
						<div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-400">
							{createError}
						</div>
					)}
				</div>

				{/* Actions */}
				<div className="flex items-center gap-3 mt-6">
					<Button
						variant="ghost"
						onClick={onClose}
						className="flex-1 h-10 text-sm text-muted-foreground hover:text-foreground"
					>
						Cancel
					</Button>
					{isConnected ? (
						<Button
							disabled={!name.trim() || creating}
							onClick={handleCreate}
							variant="emerald"
							className="flex-1 h-10 text-sm"
						>
							{creating ? (
								<span className="flex items-center gap-2">
									<span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
									Creating…
								</span>
							) : (
								<>
									<Plus size={14} />
									Create Syndicate
								</>
							)}
						</Button>
					) : (
						<Button
							onClick={() =>
								openWallet({ view: "Connect", namespace: "solana" })
							}
							variant="emerald"
							className="flex-1 h-10 text-sm"
						>
							<Wallet size={14} />
							Connect & Create
						</Button>
					)}
				</div>
			</div>
		</div>
	);
}

function DemoDataBanner() {
	return (
		<div className="hud-frame rounded-lg flex items-start gap-2.5 p-3.5">
			<AlertTriangle
				size={14}
				className="text-magenta-300 shrink-0 mt-0.5"
				aria-hidden="true"
			/>
			<p className="text-[11px] leading-relaxed text-muted-foreground">
				<span className="block hud-label mb-1">
					{"// DEMO FEED — NOT LIVE"}
				</span>
				<span className="font-bold text-magenta-300 uppercase tracking-wider">
					Demo data — not live on-chain data.
				</span>{" "}
				Syndicate listings below are UI previews: names, addresses, win rates,
				and winnings are fabricated examples, not real on-chain syndicates.
			</p>
		</div>
	);
}

/** Aggregated stats computed from the live on-chain syndicate accounts. */
interface LiveSyndicateStats {
	members: number;
	pooledUsdc: number;
	publicCount: number;
}

function StatsBar({
	liveCount = 0,
	liveStats,
	loading = false,
}: {
	liveCount?: number;
	liveStats?: LiveSyndicateStats;
	loading?: boolean;
}) {
	const fmtUsdc = (n: number) =>
		n >= 1_000_000
			? `$${(n / 1_000_000).toFixed(1)}M`
			: `$${Math.round(n).toLocaleString("en-US")}`;

	// Live on-chain data: every tile shows real (or unknown) values.
	// While loading, show placeholders instead of fabricated "demo" numbers.
	// Only fall back to the illustrative values in the demo feed (no live
	// syndicates) — the banner above explains those are not real.
	const stats = liveStats
		? [
				{
					label: "Active Syndicates",
					value: liveCount.toLocaleString(),
					icon: Users,
					color: "text-emerald-400",
				},
				{
					label: "Total Members",
					value: liveStats.members.toLocaleString(),
					icon: UserPlus,
					color: "text-cyan-300",
				},
				{
					label: "Pooled USDC",
					value: fmtUsdc(liveStats.pooledUsdc),
					icon: Trophy,
					color: "text-gold-300",
				},
				{
					label: "Public Syndicates",
					value: liveStats.publicCount.toLocaleString(),
					icon: TrendingUp,
					color: "text-emerald-400",
				},
			]
		: loading
			? [
					{
						label: "Active Syndicates",
						value: "…",
						icon: Users,
						color: "text-emerald-400",
					},
					{
						label: "Total Members",
						value: "…",
						icon: UserPlus,
						color: "text-cyan-300",
					},
					{
						label: "Pooled USDC",
						value: "…",
						icon: Trophy,
						color: "text-gold-300",
					},
					{
						label: "Public Syndicates",
						value: "…",
						icon: TrendingUp,
						color: "text-emerald-400",
					},
				]
			: [
					{
						label: "Active Syndicates",
						value: "142",
						icon: Users,
						color: "text-emerald-400",
					},
					{
						label: "Total Members",
						value: "3,847",
						icon: UserPlus,
						color: "text-cyan-300",
					},
					{
						label: "Combined Winnings",
						value: "$487K",
						icon: Trophy,
						color: "text-gold-300",
					},
					{
						label: "Avg Win Rate",
						value: "67.3%",
						icon: TrendingUp,
						color: "text-emerald-400",
					},
				];

	return (
		<div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
			{stats.map((stat) => {
				const Icon = stat.icon;
				return (
					<div
						key={stat.label}
						className="hud-frame rounded-lg p-3 sm:p-4 text-center"
					>
						<Icon
							size={16}
							className={`${stat.color} mx-auto mb-1.5 opacity-70`}
						/>
						<div
							className={`font-mono text-lg sm:text-xl font-black ${stat.color}`}
						>
							{stat.value}
						</div>
						<div className="hud-label mt-1">{stat.label}</div>
					</div>
				);
			})}
		</div>
	);
}

/* -------------------------------------------------------------------------- */
/*  Main Component                                                            */
/* -------------------------------------------------------------------------- */

/** A live on-chain syndicate card (real data). Links to the detail page. */
function LiveSyndicateCard({ syndicate: s }: { syndicate: OnChainSyndicate }) {
	const contribution = s.totalContribution / 1_000_000;
	return (
		<div className="hud-frame rounded-lg p-4 flex flex-col h-full gap-2">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
					<h3 className="font-display text-sm font-bold text-foreground tracking-wide truncate">
						{s.name || "Untitled Syndicate"}
					</h3>
				</div>
				{s.isPublic ? (
					<Unlock size={12} className="text-emerald-400/70 shrink-0" />
				) : (
					<Lock size={12} className="text-gold-300/70 shrink-0" />
				)}
			</div>

			<div className="flex items-center gap-1.5 text-[9px] font-mono text-muted-foreground">
				<Crown size={10} className="text-gold-300" />
				<span>
					Manager: {`${s.creator.slice(0, 4)}…${s.creator.slice(-4)}`}
				</span>
			</div>

			<div className="grid grid-cols-3 gap-2 mt-1">
				<div className="text-center">
					<div className="font-mono text-sm font-bold text-cyan-300">
						{s.memberCount}
					</div>
					<div className="hud-label">Members</div>
				</div>
				<div className="text-center">
					<div className="font-mono text-sm font-bold text-gold-300">
						{contribution.toLocaleString()}
					</div>
					<div className="hud-label">Pool USDC</div>
				</div>
				<div className="text-center">
					<div className="font-mono text-sm font-bold text-emerald-400">
						{s.managerFeeBps === 0 ? "None" : `${s.managerFeeBps / 100}%`}
					</div>
					<div className="hud-label">Fee</div>
				</div>
			</div>

			<div className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-semibold mt-auto pt-2 border-t border-foreground/5">
				<Target size={10} />
				<span>View &amp; Join</span>
			</div>
		</div>
	);
}

export default function SyndicatesPage() {
	const [searchQuery, setSearchQuery] = useState("");
	const [sortField, setSortField] = useState<SortField>("totalWinnings");
	const [sortDir, setSortDir] = useState<SortDir>("desc");
	const [filterVisibility, setFilterVisibility] =
		useState<FilterVisibility>("all");
	const [showCreateModal, setShowCreateModal] = useState(false);
	const [liveSyndicates, setLiveSyndicates] = useState<OnChainSyndicate[]>([]);
	const [liveLoading, setLiveLoading] = useState(false);

	useEffect(() => {
		let cancelled = false;
		async function loadLive() {
			setLiveLoading(true);
			try {
				const live = await fetchAllSyndicates();
				if (!cancelled) setLiveSyndicates(live);
			} catch {
				if (!cancelled) setLiveSyndicates([]);
			} finally {
				if (!cancelled) setLiveLoading(false);
			}
		}
		loadLive();
		return () => {
			cancelled = true;
		};
	}, []);

	const { open: openWallet } = useAppKit();
	const { isConnected } = useAppKitAccount();

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

	// Real aggregates from the live on-chain syndicate list (base-unit
	// contributions are converted from 6-decimal USDC).
	const liveStats = useMemo<LiveSyndicateStats | undefined>(() => {
		if (liveSyndicates.length === 0) return undefined;
		return {
			members: liveSyndicates.reduce((sum, s) => sum + s.memberCount, 0),
			pooledUsdc:
				liveSyndicates.reduce((sum, s) => sum + s.totalContribution, 0) /
				1_000_000,
			publicCount: liveSyndicates.filter((s) => s.isPublic).length,
		};
	}, [liveSyndicates]);

	const handleSort = (field: SortField) => {
		if (sortField === field) {
			setSortDir((d) => (d === "desc" ? "asc" : "desc"));
		} else {
			setSortField(field);
			setSortDir("desc");
		}
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
					<nav className="flex items-center gap-2 text-xs text-muted-foreground mb-6">
						<Link to="/" className="hover:text-foreground transition-colors">
							Home
						</Link>
						<ChevronRight size={12} />
						<span className="text-cyan-300 font-medium">Syndicates</span>
					</nav>

					<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
						<div>
							<p className="hud-label mb-2">{"// ON-CHAIN SYNDICATE POOLS"}</p>
							<div className="flex items-center gap-3 mb-2">
								<div className="p-2 rounded-xl bg-linear-to-br from-cyan-500/20 to-cyan-600/10 border border-cyan-500/30">
									<Users size={24} className="text-cyan-300" />
								</div>
								<div>
									<h1 className="font-display text-2xl sm:text-3xl font-black tracking-wide uppercase text-foreground">
										Syndicates
									</h1>
									<p className="text-sm text-muted-foreground mt-0.5">
										Pool resources with other players &bull; Share tickets
										&bull; Split winnings
									</p>
								</div>
							</div>
						</div>

						<Button
							onClick={() => {
								if (!isConnected) {
									openWallet({ view: "Connect", namespace: "solana" });
								} else {
									setShowCreateModal(true);
								}
							}}
							variant="emerald"
							size="lg"
							className="w-full sm:w-auto"
						>
							{isConnected ? <Plus size={16} /> : <Wallet size={16} />}
							{isConnected ? "Create Syndicate" : "Connect to Create"}
						</Button>
					</div>
				</div>
			</section>

			{/* ================================================================ */}
			{/*  MAIN CONTENT                                                    */}
			{/* ================================================================ */}
			<section className="relative px-4 sm:px-6 lg:px-8 pb-16">
				<div className="max-w-7xl mx-auto space-y-6">
					{/* Demo data notice — only when the demo feed is actually shown */}
					{liveSyndicates.length === 0 && !liveLoading && <DemoDataBanner />}

					{/* Stats (live on-chain when available) */}
					<StatsBar
						liveCount={liveSyndicates.length}
						liveStats={liveStats}
						loading={liveLoading}
					/>

					{/* Syndicate Wars Banner */}
					<SyndicateWarsBanner />

					{/* Filters & Search */}
					<div className="hud-frame rounded-lg p-4 sm:p-5">
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
									placeholder="Search syndicates by name, address, or tag..."
									aria-label="Search syndicates"
									className="w-full h-9 pl-9 pr-3 rounded-xl bg-surface-1/70 border border-cyan-500/20 text-sm text-foreground placeholder-gray-600 focus:outline-none focus:border-cyan-400/60 focus:ring-1 focus:ring-cyan-500/30 transition-colors"
								/>
							</div>

							{/* Visibility filter */}
							<div className="flex items-center gap-1">
								<Filter size={12} className="text-muted-foreground mr-1" />
								{(["all", "public", "private"] as FilterVisibility[]).map(
									(vis) => (
										<button
											key={vis}
											type="button"
											onClick={() => setFilterVisibility(vis)}
											className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
												filterVisibility === vis
													? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/40"
													: "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
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
								<ArrowUpDown size={12} className="text-muted-foreground mr-1" />
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
												? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/40"
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
							<span className="font-mono font-bold text-cyan-300">
								{filteredSyndicates.length}
							</span>{" "}
							syndicate{filteredSyndicates.length !== 1 ? "s" : ""}
							{searchQuery && (
								<span>
									{" "}
									matching &ldquo;
									<span className="text-emerald-400">{searchQuery}</span>
									&rdquo;
								</span>
							)}
						</p>
					</div>

					{/* Syndicate Grid */}
					{filteredSyndicates.length === 0 ? (
						<div className="hud-frame rounded-lg p-12 text-center">
							<div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 mb-4">
								<Search size={24} className="text-cyan-300/60" />
							</div>
							<p className="text-sm text-muted-foreground mb-1">
								No syndicates found
							</p>
							<p className="text-xs text-muted-foreground/60 mb-4">
								Try adjusting your search or filter criteria
							</p>
							<Button
								onClick={() => {
									setSearchQuery("");
									setFilterVisibility("all");
								}}
								variant="outline"
								size="sm"
								className="w-full sm:w-auto text-xs"
							>
								Clear Filters
							</Button>
						</div>
					) : (
						<>
							<div className="space-y-4 mb-6">
								{liveSyndicates.length > 0 && (
									<>
										<div className="flex items-center gap-2">
											<span className="relative flex h-2 w-2">
												<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
												<span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
											</span>
											<h3 className="text-sm font-bold text-emerald-400 uppercase tracking-wider">
												{"// LIVE ON-CHAIN SYNDICATES"}
											</h3>
										</div>
										<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
											{liveSyndicates.map((s) => (
												<Link
													key={s.pubkey}
													to={`/syndicates/${s.pubkey}`}
													className="block h-full"
												>
													<LiveSyndicateCard syndicate={s} />
												</Link>
											))}
										</div>
									</>
								)}
								{liveLoading && (
									<div className="flex items-center gap-2 text-xs text-muted-foreground">
										<div className="w-4 h-4 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
										Loading live syndicates...
									</div>
								)}
							</div>
							{liveSyndicates.length === 0 && !liveLoading && (
								<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
									{filteredSyndicates.map((syndicate) => (
										<SyndicateCard key={syndicate.id} syndicate={syndicate} />
									))}
								</div>
							)}
						</>
					)}

					{/* How Syndicates Work */}
					<div className="hud-frame rounded-lg p-6 sm:p-8 mt-8">
						<h2 className="font-display text-base sm:text-lg font-bold text-foreground uppercase tracking-wide mb-6 flex items-center gap-2">
							<Sparkles size={18} className="text-gold-300" />
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
											<div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-xs font-black text-emerald-400">
												{item.step}
											</div>
											<Icon size={14} className="text-emerald-400/70" />
										</div>
										<h3 className="text-sm font-bold text-foreground mb-1">
											{item.title}
										</h3>
										<p className="text-xs text-muted-foreground leading-relaxed">
											{item.description}
										</p>
									</div>
								);
							})}
						</div>

						<div className="mt-6 pt-4 border-t border-foreground/5 flex flex-wrap items-center gap-4 text-[10px] text-muted-foreground">
							<div className="flex items-center gap-1.5">
								<Shield size={10} className="text-emerald-400/70" />
								<span>Fully on-chain &bull; Non-custodial</span>
							</div>
							<div className="flex items-center gap-1.5">
								<Check size={10} className="text-emerald-400/70" />
								<span>Automatic prize distribution</span>
							</div>
							<div className="flex items-center gap-1.5">
								<Settings size={10} className="text-emerald-400/70" />
								<span>Configurable manager fees (0-10%)</span>
							</div>
							<div className="flex items-center gap-1.5">
								<BarChart3 size={10} className="text-emerald-400/70" />
								<span>Transparent on-chain accounting</span>
							</div>
						</div>
					</div>

					{/* Wallet Connection CTA (when not connected) */}
					{!isConnected && (
						<div className="hud-frame rounded-lg p-6 sm:p-8 overflow-hidden relative">
							<div className="absolute inset-0 bg-linear-to-br from-cyan-500/5 via-transparent to-gold-500/3" />
							<div className="relative z-10 flex flex-col sm:flex-row items-center gap-6">
								<div className="p-3 rounded-2xl bg-linear-to-br from-cyan-500/20 to-cyan-600/10 border border-cyan-500/30 shrink-0">
									<Wallet size={28} className="text-cyan-300" />
								</div>
								<div className="text-center sm:text-left flex-1">
									<h3 className="font-display text-base font-black text-foreground uppercase tracking-wide mb-1">
										Connect Your Wallet to Get Started
									</h3>
									<p className="text-xs text-muted-foreground max-w-md">
										Connect your Solana wallet to create syndicates, join
										existing ones, and start pooling resources with other
										players.
									</p>
								</div>
								<Button
									onClick={() =>
										openWallet({ view: "Connect", namespace: "solana" })
									}
									variant="emerald"
									size="lg"
									className="shrink-0"
								>
									<Wallet size={18} />
									Connect Wallet
								</Button>
							</div>
							<div className="relative z-10 mt-4 pt-3 border-t border-foreground/5 flex flex-wrap items-center justify-center sm:justify-start gap-4 text-[10px] text-muted-foreground">
								<div className="flex items-center gap-1.5">
									<Shield size={10} className="text-emerald-400/70" />
									<span>Non-custodial</span>
								</div>
								<div className="flex items-center gap-1.5">
									<Eye size={10} className="text-emerald-400/70" />
									<span>Read-only access</span>
								</div>
								<div className="flex items-center gap-1.5">
									<Shield size={10} className="text-emerald-400/70" />
									<span>Sign to transact</span>
								</div>
							</div>
						</div>
					)}
				</div>
			</section>

			{/* Create Modal */}
			<CreateSyndicateModal
				open={showCreateModal}
				onClose={() => setShowCreateModal(false)}
			/>
		</div>
	);
}
