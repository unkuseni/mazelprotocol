import {
	AlertTriangle,
	BarChart3,
	Bell,
	BellOff,
	Check,
	ChevronLeft,
	ChevronRight,
	Clock,
	Copy,
	Crown,
	ExternalLink,
	Lock,
	LogOut,
	MoreVertical,
	Settings,
	Shield,
	Target,
	TrendingUp,
	Trophy,
	Unlock,
	Users,
	Wallet,
} from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import Footer from "@/components/Footer";
import { FloatingBalls } from "@/components/LotteryBalls";
import SyndicateChat, { type ChatMember } from "@/components/SyndicateChat";
import { Button } from "@/components/ui/button";
import { useAppKit, useAppKitAccount } from "@/lib/appkit-provider";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

interface SyndicateDetail {
	id: string;
	name: string;
	creator: string;
	creatorShort: string;
	description: string;
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
	nextDrawIn: string;
	currentEV: string;
	poolBalance: number;
}

/* -------------------------------------------------------------------------- */
/*  Mock Data                                                                 */
/* -------------------------------------------------------------------------- */

const MOCK_SYNDICATES: Record<string, SyndicateDetail> = {
	"alpha-lottery-dao": {
		id: "alpha-lottery-dao",
		name: "Alpha Lottery DAO",
		creator: "7xKXq9Rm4p3sT8vN2wBcDfGh1jLkMnPr5tYuZaEb",
		creatorShort: "7xKX...ZaEb",
		description:
			"A data-driven syndicate focused on capitalizing on favorable rolldown windows. We coordinate ticket purchases during mathematically favorable periods and share analysis in chat.",
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
		nextDrawIn: "2h 14m",
		currentEV: "+12.3%",
		poolBalance: 487.5,
	},
	"diamond-hands-club": {
		id: "diamond-hands-club",
		name: "Diamond Hands Club",
		creator: "3mNPw7Rt2kBxYcFg8hJdLqSvUzAa9nEp4oWiXsMt",
		creatorShort: "3mNP...XsMt",
		description:
			"We never skip a draw. Consistent players pooling tickets together for better coverage every single round. Steady strategy, compounding wins.",
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
		nextDrawIn: "2h 14m",
		currentEV: "+8.7%",
		poolBalance: 342.0,
	},
	"whale-pool-prime": {
		id: "whale-pool-prime",
		name: "Whale Pool Prime",
		creator: "9bQRy5Xk7mDzWcHn3pLsAtGv1jEf8uBi2oNrKwTq",
		creatorShort: "9bQR...KwTq",
		description:
			"High-roller syndicate. Minimum 25 USDC contribution per draw. We go big during rolldown events with massive ticket batches.",
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
		nextDrawIn: "2h 14m",
		currentEV: "+15.2%",
		poolBalance: 1_250.0,
	},
	"rolldown-raiders": {
		id: "rolldown-raiders",
		name: "Rolldown Raiders",
		creator: "4jWSd6Yn1rFzXcKm8pLtBvHg3eAf9uDi2oNqMwSx",
		creatorShort: "4jWS...MwSx",
		description:
			"We ONLY play during rolldown windows. Patient strategy — we wait for +EV conditions and then go all-in as a group.",
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
		nextDrawIn: "2h 14m",
		currentEV: "+12.3%",
		poolBalance: 520.0,
	},
	"degen-lottery-squad": {
		id: "degen-lottery-squad",
		name: "Degen Lottery Squad",
		creator: "6cYTh8Zn3rFzXcKm2pLtBvHg5eAf1uDi4oNqMwJx",
		creatorShort: "6cYT...MwJx",
		description:
			"Full degen energy. We play every draw, heavy on quick picks, and vibes-based number selection. Community-first, no manager fee.",
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
		nextDrawIn: "2h 14m",
		currentEV: "+8.7%",
		poolBalance: 215.0,
	},
	"solana-sharks": {
		id: "solana-sharks",
		name: "Solana Sharks",
		creator: "8dZUi9Xk5mDzWcHn7pLsAtGv3jEf2uBi6oNrKwRq",
		creatorShort: "8dZU...KwRq",
		description:
			"Elite invite-only syndicate. Data analysts and quant-minded players only. We run custom models to optimize ticket selection.",
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
		nextDrawIn: "2h 14m",
		currentEV: "+18.1%",
		poolBalance: 890.0,
	},
	"lucky-7s-collective": {
		id: "lucky-7s-collective",
		name: "Lucky 7s Collective",
		creator: "2kMNa4Bp7cDxYeGh9jLqSvUzAa1nEp6oWiRtFsXm",
		creatorShort: "2kMN...FsXm",
		description:
			"Lucky number 7 enthusiasts. We always include at least one 7 in every ticket. Superstition meets on-chain probability.",
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
		nextDrawIn: "2h 14m",
		currentEV: "+8.7%",
		poolBalance: 148.0,
	},
	"night-owls-syndicate": {
		id: "night-owls-syndicate",
		name: "Night Owls Syndicate",
		creator: "5fHJb8Cp3dExZeGk1jLqTvUzBa7nFp4oWiStGsYn",
		creatorShort: "5fHJ...GsYn",
		description:
			"Late-night draw watchers. We coordinate buys in the final hours before draw close when the EV picture is clearest.",
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
		nextDrawIn: "2h 14m",
		currentEV: "+10.5%",
		poolBalance: 278.0,
	},
};

function generateMockMembers(syndicate: SyndicateDetail): ChatMember[] {
	const mockAddresses = [
		{
			addr: syndicate.creator,
			short: syndicate.creatorShort,
			role: "manager" as const,
			online: true,
			tickets: 120,
		},
		{
			addr: "3mNPabc123456789def2wVd",
			short: "3mNP...2wVd",
			role: "member" as const,
			online: true,
			tickets: 87,
		},
		{
			addr: "9bQRabc123456789def5tLe",
			short: "9bQR...5tLe",
			role: "member" as const,
			online: true,
			tickets: 65,
		},
		{
			addr: "4jWSabc123456789def8kMn",
			short: "4jWS...8kMn",
			role: "member" as const,
			online: false,
			tickets: 54,
		},
		{
			addr: "6cYTabc123456789def1pAo",
			short: "6cYT...1pAo",
			role: "member" as const,
			online: true,
			tickets: 43,
		},
		{
			addr: "8dZUabc123456789def7rBq",
			short: "8dZU...7rBq",
			role: "member" as const,
			online: false,
			tickets: 38,
		},
		{
			addr: "2kMNabc123456789defFsXm",
			short: "2kMN...FsXm",
			role: "member" as const,
			online: true,
			tickets: 32,
		},
		{
			addr: "5fHJabc123456789defGsYn",
			short: "5fHJ...GsYn",
			role: "member" as const,
			online: false,
			tickets: 28,
		},
		{
			addr: "1aLKabc123456789defHtZo",
			short: "1aLK...HtZo",
			role: "member" as const,
			online: false,
			tickets: 22,
		},
		{
			addr: "7gPQabc123456789defItAp",
			short: "7gPQ...ItAp",
			role: "member" as const,
			online: true,
			tickets: 19,
		},
	];

	return mockAddresses.slice(0, Math.min(syndicate.members, 10)).map((m) => ({
		address: m.addr,
		addressShort: m.short,
		role: m.role,
		isOnline: m.online,
		joinedAt: syndicate.activeSince,
		ticketsContributed: m.tickets,
	}));
}

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                            */
/* -------------------------------------------------------------------------- */

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
				This syndicate page is a UI preview: the name, manager address, win
				rate, EV, pool balance, and member list are fabricated examples, not
				real on-chain data.
			</p>
		</div>
	);
}

function StatCard({
	label,
	value,
	icon: Icon,
	color = "text-foreground",
	subtext,
}: {
	label: string;
	value: string;
	icon: React.ComponentType<{ size?: number; className?: string }>;
	color?: string;
	subtext?: string;
}) {
	return (
		<div className="hud-frame rounded-lg p-3 text-center">
			<Icon size={14} className={`${color} mx-auto mb-1 opacity-70`} />
			<div className={`font-mono text-base sm:text-lg font-black ${color}`}>
				{value}
			</div>
			<div className="hud-label mt-1">{label}</div>
			{subtext && (
				<div className="text-[9px] text-muted-foreground/60 mt-0.5">
					{subtext}
				</div>
			)}
		</div>
	);
}

function SyndicateInfoPanel({
	syndicate,
	isMember,
	onJoin,
	onLeave,
}: {
	syndicate: SyndicateDetail;
	isMember: boolean;
	onJoin: () => void;
	onLeave: () => void;
}) {
	const [copied, setCopied] = useState(false);
	const [notifications, setNotifications] = useState(true);
	const [showSettings, setShowSettings] = useState(false);
	const fillPercent = (syndicate.members / syndicate.maxMembers) * 100;
	const isFull = syndicate.members >= syndicate.maxMembers;

	const handleCopyAddress = () => {
		navigator.clipboard.writeText(syndicate.creator);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<div className="hud-frame rounded-lg overflow-hidden">
			{/* Header gradient bar */}
			<div className="h-1.5 bg-linear-to-r from-emerald-400 via-emerald-300 to-gold-400" />

			<div className="p-4 sm:p-5 space-y-4">
				{/* Name + tags */}
				<div className="flex items-start justify-between gap-3">
					<div>
						<div className="flex items-center gap-2 mb-1">
							<h2 className="font-display text-base sm:text-lg font-black text-foreground tracking-wide">
								{syndicate.name}
							</h2>
							{syndicate.isPublic ? (
								<Unlock size={12} className="text-emerald-400/70" />
							) : (
								<Lock size={12} className="text-gold-300/70" />
							)}
						</div>
						<div className="flex items-center gap-2 flex-wrap">
							{syndicate.tags.map((tag) => (
								<span
									key={tag}
									className={`px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider ${
										tag === "Top Earner"
											? "bg-gold-500/15 text-gold-300 border border-gold-500/30"
											: tag.includes("+EV")
												? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
												: tag === "No Fee"
													? "bg-violet-500/10 text-violet-400 border border-violet-500/30"
													: tag === "New"
														? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
														: "bg-foreground/5 text-muted-foreground border border-foreground/6"
									}`}
								>
									{tag}
								</span>
							))}
						</div>
					</div>

					{/* Settings dropdown */}
					{isMember && (
						<div className="relative">
							<button
								type="button"
								onClick={() => setShowSettings((v) => !v)}
								className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
							>
								<MoreVertical size={16} />
							</button>
							{showSettings && (
								<div className="absolute right-0 top-full mt-1 w-44 glass-strong rounded-xl border border-foreground/10 py-1 z-20 shadow-xl shadow-black/30">
									<button
										type="button"
										onClick={() => {
											setNotifications((v) => !v);
											setShowSettings(false);
										}}
										className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:bg-foreground/5 transition-colors"
									>
										{notifications ? <BellOff size={12} /> : <Bell size={12} />}
										{notifications
											? "Mute notifications"
											: "Enable notifications"}
									</button>
									<button
										type="button"
										onClick={() => {
											onLeave();
											setShowSettings(false);
										}}
										className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-red-500/5 transition-colors"
									>
										<LogOut size={12} />
										Leave syndicate
									</button>
								</div>
							)}
						</div>
					)}
				</div>

				{/* Description */}
				<p className="text-xs text-muted-foreground leading-relaxed">
					{syndicate.description}
				</p>

				{/* Creator */}
				<div className="flex items-center gap-2">
					<span className="hud-label">Manager (demo)</span>
					<button
						type="button"
						onClick={handleCopyAddress}
						className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-xs font-mono text-cyan-300 hover:text-cyan-200 hover:bg-cyan-500/15 transition-colors"
					>
						<Crown size={10} className="text-gold-300" />
						{syndicate.creatorShort}
						{copied ? (
							<Check size={10} className="text-emerald-400" />
						) : (
							<Copy size={10} className="text-muted-foreground/60" />
						)}
					</button>
				</div>

				{/* Members bar */}
				<div>
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

				{/* Quick stats */}
				<div className="grid grid-cols-2 gap-2">
					<div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-cyan-500/5 border border-cyan-500/10">
						<Clock size={12} className="text-cyan-300 shrink-0" />
						<div>
							<div className="hud-label">Next draw</div>
							<div className="font-mono text-xs font-bold text-cyan-300">
								{syndicate.nextDrawIn}
							</div>
						</div>
					</div>
					<div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-cyan-500/5 border border-cyan-500/10">
						<TrendingUp size={12} className="text-emerald-400/70 shrink-0" />
						<div>
							<div className="hud-label">Current EV</div>
							<div className="font-mono text-xs font-bold text-emerald-400">
								{syndicate.currentEV}
							</div>
						</div>
					</div>
				</div>

				{/* Manager fee & pool */}
				<div className="flex items-center justify-between font-mono text-[10px] text-muted-foreground px-1">
					<span>
						Fee:{" "}
						<span className="text-cyan-300 font-semibold">
							{syndicate.managerFeeBps === 0
								? "None"
								: `${syndicate.managerFeeBps / 100}%`}
						</span>
					</span>
					<span>
						Pool:{" "}
						<span className="text-gold-300 font-semibold">
							${syndicate.poolBalance.toLocaleString()} USDC
						</span>
					</span>
				</div>

				{/* Action buttons */}
				{!isMember ? (
					<div className="space-y-2">
						{isFull ? (
							<Button
								disabled
								className="w-full h-10 text-xs font-semibold border-foreground/10 text-muted-foreground cursor-not-allowed"
								variant="outline"
							>
								<Lock size={12} />
								Syndicate Full
							</Button>
						) : !syndicate.isPublic ? (
							<Button
								variant="outline"
								className="w-full h-10 text-xs font-semibold border-gold-500/30 text-gold-300 hover:bg-gold-500/10"
							>
								<Lock size={12} />
								Request Invite
							</Button>
						) : (
							<Button
								onClick={onJoin}
								variant="emerald"
								className="w-full h-10 text-xs"
							>
								<Wallet size={14} />
								Join Syndicate
							</Button>
						)}
					</div>
				) : (
					<Link
						to="/play"
						className="flex items-center justify-center gap-2 w-full h-10 text-xs font-bold bg-linear-to-r from-emerald-400 to-emerald-600 hover:from-emerald-300 hover:to-emerald-500 text-black rounded-xl shadow-lg shadow-emerald-500/25 transition-all"
					>
						<Target size={14} />
						Buy Tickets for Syndicate
					</Link>
				)}

				{/* Meta info */}
				<div className="flex items-center justify-between font-mono text-[9px] text-muted-foreground/60 pt-1 border-t border-foreground/5">
					<span>Active since {syndicate.activeSince}</span>
					<button
						type="button"
						className="flex items-center gap-1 text-muted-foreground hover:text-cyan-300 transition-colors"
						onClick={() => {
							/* TODO: link to on-chain explorer */
						}}
					>
						On-chain <ExternalLink size={8} />
					</button>
				</div>
			</div>
		</div>
	);
}

function NotConnectedView() {
	const { open } = useAppKit();

	return (
		<div className="min-h-screen bg-background">
			<section className="relative pt-24 pb-8 sm:pt-28 sm:pb-12 px-4 sm:px-6 lg:px-8 overflow-hidden">
				<div className="absolute inset-0 hero-grid opacity-30" />
				<div className="absolute inset-0 bg-glow-emerald opacity-15" />
				<FloatingBalls count={4} />

				<div className="relative z-10 max-w-2xl mx-auto text-center mt-16 sm:mt-24">
					<div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 mb-6">
						<Users size={28} className="text-cyan-300" />
					</div>
					<p className="hud-label mb-2">{"// SECURE CHANNEL"}</p>
					<h1 className="font-display text-xl sm:text-3xl font-black text-foreground uppercase tracking-wide mb-3">
						Connect to View Syndicate
					</h1>
					<p className="text-sm text-muted-foreground mb-8 max-w-md mx-auto">
						Connect your wallet to view syndicate details, join the group chat,
						and coordinate ticket purchases with other players.
					</p>
					<Button
						onClick={() => open()}
						variant="emerald"
						size="lg"
						className="w-full sm:w-auto"
					>
						<Wallet size={18} />
						Connect Wallet
					</Button>
				</div>
			</section>
			<Footer />
		</div>
	);
}

function SyndicateNotFound() {
	return (
		<div className="min-h-screen bg-background">
			<section className="relative pt-24 pb-8 sm:pt-28 sm:pb-12 px-4 sm:px-6 lg:px-8 overflow-hidden">
				<div className="absolute inset-0 hero-grid opacity-30" />
				<div className="absolute inset-0 bg-glow-emerald opacity-15" />
				<FloatingBalls count={3} />

				<div className="relative z-10 max-w-2xl mx-auto text-center mt-16 sm:mt-24">
					<div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 mb-6">
						<Shield size={28} className="text-cyan-300" />
					</div>
					<p className="hud-label mb-2">{"// 404 — NOT FOUND"}</p>
					<h1 className="font-display text-xl sm:text-3xl font-black text-foreground uppercase tracking-wide mb-3">
						Syndicate Not Found
					</h1>
					<p className="text-sm text-muted-foreground mb-8 max-w-md mx-auto">
						This syndicate doesn&apos;t exist or may have been dissolved. Browse
						available syndicates to find a group to join.
					</p>
					<Link
						to="/syndicates"
						className="inline-flex items-center gap-2 w-full sm:w-auto justify-center h-11 px-6 text-sm font-bold bg-linear-to-r from-emerald-400 to-emerald-600 hover:from-emerald-300 hover:to-emerald-500 text-black rounded-xl shadow-lg shadow-emerald-500/25 transition-all"
					>
						<ChevronLeft size={16} />
						Browse Syndicates
					</Link>
				</div>
			</section>
			<Footer />
		</div>
	);
}

/* -------------------------------------------------------------------------- */
/*  Main Component                                                            */
/* -------------------------------------------------------------------------- */

export default function SyndicateDetailPage() {
	const { syndicateId } = useParams();
	const { isConnected } = useAppKitAccount();
	const { open } = useAppKit();

	// Simulated member state (in real app, check on-chain)
	const [isMember, setIsMember] = useState(true);

	if (!syndicateId) {
		return <SyndicateNotFound />;
	}

	const syndicate =
		MOCK_SYNDICATES[syndicateId as keyof typeof MOCK_SYNDICATES];

	if (!syndicate) {
		return <SyndicateNotFound />;
	}

	if (!isConnected) {
		return <NotConnectedView />;
	}

	const members = generateMockMembers(syndicate);

	const handleJoin = () => {
		if (!isConnected) {
			open();
			return;
		}
		setIsMember(true);
	};

	const handleLeave = () => {
		if (confirm("Are you sure you want to leave this syndicate?")) {
			setIsMember(false);
		}
	};

	return (
		<div className="min-h-screen bg-background flex flex-col">
			{/* ================================================================ */}
			{/*  Top Navigation                                                   */}
			{/* ================================================================ */}
			<section className="relative pt-20 sm:pt-24 pb-4 sm:pb-6 px-4 sm:px-6 lg:px-8">
				<div className="absolute inset-0 hero-grid opacity-20" />
				<div className="absolute inset-0 bg-glow-emerald opacity-10" />

				<div className="relative z-10 max-w-7xl mx-auto">
					{/* Breadcrumb */}
					<nav className="flex items-center gap-2 text-xs text-muted-foreground mb-3 sm:mb-4 overflow-x-auto whitespace-nowrap pb-1">
						<Link to="/" className="hover:text-foreground transition-colors">
							Home
						</Link>
						<ChevronRight size={12} />
						<Link
							to="/syndicates"
							className="hover:text-foreground transition-colors"
						>
							Syndicates
						</Link>
						<ChevronRight size={12} />
						<span className="text-cyan-300 font-medium truncate max-w-50">
							{syndicate.name}
						</span>
					</nav>
				</div>
			</section>

			{/* ================================================================ */}
			{/*  Main Content                                                     */}
			{/* ================================================================ */}
			<section className="relative flex-1 px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
				<div className="relative z-10 max-w-7xl mx-auto">
					{/* Demo data notice — this page renders mock syndicate data */}
					<div className="mb-4">
						<DemoDataBanner />
					</div>
					<div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
						{/* ========================================================== */}
						{/*  Left Column: Info + Stats                                  */}
						{/* ========================================================== */}
						<div className="w-full lg:w-80 xl:w-96 shrink-0 space-y-4">
							{/* Syndicate Info */}
							<SyndicateInfoPanel
								syndicate={syndicate}
								isMember={isMember}
								onJoin={handleJoin}
								onLeave={handleLeave}
							/>

							{/* Stats Grid */}
							<div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 gap-2 sm:gap-3">
								<StatCard
									label="Total Winnings"
									value={`$${syndicate.totalWinnings.toLocaleString()}`}
									icon={Trophy}
									color="text-gold-300"
								/>
								<StatCard
									label="Win Rate"
									value={`${syndicate.winRate}%`}
									icon={TrendingUp}
									color="text-emerald-400"
								/>
								<StatCard
									label="This Draw"
									value={`${syndicate.ticketsThisDraw}`}
									icon={Target}
									color="text-cyan-300"
									subtext="tickets"
								/>
								<StatCard
									label="Total Tickets"
									value={syndicate.totalTickets.toLocaleString()}
									icon={BarChart3}
									color="text-muted-foreground"
								/>
							</div>

							{/* On-chain badges */}
							<div className="hud-frame rounded-lg p-3">
								<div className="flex flex-wrap items-center gap-3 text-[9px] text-muted-foreground">
									<div className="flex items-center gap-1.5">
										<Shield size={9} className="text-emerald-400/70" />
										<span>Non-custodial</span>
									</div>
									<div className="flex items-center gap-1.5">
										<Check size={9} className="text-emerald-400/70" />
										<span>Auto-distribution</span>
									</div>
									<div className="flex items-center gap-1.5">
										<Settings size={9} className="text-emerald-400/70" />
										<span>On-chain accounting</span>
									</div>
									<div className="flex items-center gap-1.5">
										<BarChart3 size={9} className="text-emerald-400/70" />
										<span>{syndicate.drawsParticipated} draws played</span>
									</div>
								</div>
							</div>
						</div>

						{/* ========================================================== */}
						{/*  Right Column: Chat                                         */}
						{/* ========================================================== */}
						<div className="flex-1 min-w-0 w-full">
							<div className="terminal-window flex flex-col h-[calc(100vh-10rem)] min-h-80 sm:min-h-125">
								<div className="terminal-titlebar shrink-0">
									<span className="size-2.5 rounded-full bg-[#FF3355]/80" />
									<span className="size-2.5 rounded-full bg-gold-400/80" />
									<span className="size-2.5 rounded-full bg-emerald-400/80" />
									<span className="ml-2">
										{"// syndicate channel — "}
										{syndicate.name}
									</span>
								</div>
								<div className="flex-1 min-h-0 overflow-hidden">
									{isMember ? (
										<SyndicateChat
											syndicateId={syndicate.id}
											syndicateName={syndicate.name}
											members={members}
										/>
									) : (
										<div className="flex flex-col items-center justify-center h-full px-6 text-center">
											<div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mb-4">
												<Lock size={24} className="text-cyan-300" />
											</div>
											<h3 className="font-display text-base font-bold text-foreground uppercase tracking-wide mb-2">
												Members Only Chat
											</h3>
											<p className="text-xs text-muted-foreground max-w-sm mb-6">
												Join this syndicate to access the group chat, coordinate
												ticket purchases, and discuss rolldown strategies with
												other members.
											</p>
											{syndicate.isPublic &&
												!isMember &&
												syndicate.members < syndicate.maxMembers && (
													<Button
														onClick={handleJoin}
														variant="emerald"
														size="lg"
													>
														<Users size={14} />
														Join to Chat
													</Button>
												)}
										</div>
									)}
								</div>
							</div>
						</div>
					</div>
				</div>
			</section>
		</div>
	);
}
