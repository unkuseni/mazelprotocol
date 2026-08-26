import { PublicKey } from "@solana/web3.js";
import {
	AlertTriangle,
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
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { FloatingBalls } from "@/components/LotteryBalls";
import SyndicateChat, { type ChatMember } from "@/components/SyndicateChat";
import { Button } from "@/components/ui/button";
import { getConnection } from "@/lib/anchor/connection";
import { useLotteryQueryClient } from "@/lib/anchor/hooks";
import { deriveSyndicateUsdcPDA, USDC_MINT } from "@/lib/anchor/pda";
import { useAnchorProvider } from "@/lib/anchor/provider";
import {
	buySyndicateTickets,
	claimSyndicateMemberPrize,
	createSyndicateTickets,
	joinSyndicate,
	leaveSyndicate,
} from "@/lib/anchor/transactions-lp-syndicate";
import { useAppKitAccount } from "@/lib/appkit-provider";

/* -------------------------------------------------------------------------- */
/*  On-chain Syndicate parsing (borsh, mirrors programs/.../state/syndicate.rs) */
/* -------------------------------------------------------------------------- */

interface OnChainMember {
	wallet: string;
	contribution: number;
	shareBps: number;
	unclaimedPrize: number;
}

interface OnChainSyndicate {
	pubkey: string;
	creator: string;
	originalCreator: string;
	syndicateId: number;
	name: string;
	isPublic: boolean;
	memberCount: number;
	totalContribution: number;
	managerFeeBps: number;
	usdcAccount: string;
	members: OnChainMember[];
	pendingTickets: number;
	bump: number;
}

function readPubkey(data: Uint8Array, off: number): string {
	const slice = data.slice(off, off + 32);
	return new PublicKey(slice).toBase58();
}

function readU64(data: Uint8Array, off: number): number {
	const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
	return Number(dv.getBigUint64(off, true));
}

function readU32(data: Uint8Array, off: number): number {
	const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
	return dv.getUint32(off, true);
}

function readU16(data: Uint8Array, off: number): number {
	const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
	return dv.getUint16(off, true);
}

function readU8(data: Uint8Array, off: number): number {
	return data[off];
}

function parseSyndicateAccount(data: Uint8Array): OnChainSyndicate {
	let off = 8; // skip account discriminator

	const creator = readPubkey(data, off);
	off += 32;
	const originalCreator = readPubkey(data, off);
	off += 32;
	const syndicateId = readU64(data, off);
	off += 8;

	// name: [u8; 32]
	const nameBytes = data.slice(off, off + 32);
	off += 32;
	const name = new TextDecoder().decode(nameBytes).replace(/\0+$/, "").trim();

	const isPublic = readU8(data, off) === 1;
	off += 1;
	const memberCount = readU32(data, off);
	off += 4;
	const totalContribution = readU64(data, off);
	off += 8;
	const managerFeeBps = readU16(data, off);
	off += 2;
	const usdcAccount = readPubkey(data, off);
	off += 32;

	// vec<SyndicateMember>: u32 len + entries
	const memberLen = readU32(data, off);
	off += 4;
	const members: OnChainMember[] = [];
	for (let i = 0; i < memberLen; i++) {
		const wallet = readPubkey(data, off);
		off += 32;
		const contribution = readU64(data, off);
		off += 8;
		const shareBps = readU16(data, off);
		off += 2;
		const unclaimedPrize = readU64(data, off);
		off += 8;
		members.push({ wallet, contribution, shareBps, unclaimedPrize });
	}

	const pendingTickets = readU64(data, off);
	off += 8;
	const pendingTicketsDraw = readU64(data, off);
	off += 8;
	const bump = readU8(data, off);

	// Discriminator is 8 bytes; the account key isn't embedded, so caller
	// attaches `pubkey` separately.
	void pendingTicketsDraw;
	return {
		pubkey: "",
		creator,
		originalCreator,
		syndicateId,
		name,
		isPublic,
		memberCount,
		totalContribution,
		managerFeeBps,
		usdcAccount,
		members,
		pendingTickets,
		bump,
	};
}

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

const TOKEN_PROGRAM_ID = new PublicKey(
	"TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
	"ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);

/** Derive the user's USDC associated token account (required as the
 *  member_usdc / destination account in syndicate instructions). */
function userUsdcAta(wallet: PublicKey): PublicKey {
	const [ata] = PublicKey.findProgramAddressSync(
		[
			wallet.toBuffer(),
			TOKEN_PROGRAM_ID.toBuffer(),
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			USDC_MINT.toBuffer(),
		],
		ASSOCIATED_TOKEN_PROGRAM_ID,
	);
	return ata;
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
		</div>
	);
}

/* -------------------------------------------------------------------------- */
/*  Main Component                                                            */
/* -------------------------------------------------------------------------- */

export default function SyndicateDetailPage() {
	const { syndicateId } = useParams();
	const { isConnected, address } = useAppKitAccount();
	const { connectedProvider } = useAnchorProvider();
	const { invalidateAll } = useLotteryQueryClient();

	const [onChain, setOnChain] = useState<OnChainSyndicate | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [actionLoading, setActionLoading] = useState(false);
	const [contribution, setContribution] = useState("25");
	const [showJoin, setShowJoin] = useState(false);
	const [showBuy, setShowBuy] = useState(false);

	// The route param is the syndicate public key (base58). Fetch + parse it.
	useEffect(() => {
		let cancelled = false;
		async function load() {
			setLoading(true);
			setError(null);
			if (!syndicateId) {
				setLoading(false);
				return;
			}
			try {
				const pubkey = new PublicKey(syndicateId);
				const info = await getConnection().getAccountInfo(pubkey);
				if (info && info.data?.length > 0) {
					const parsed = parseSyndicateAccount(info.data);
					parsed.pubkey = pubkey.toBase58();
					if (!cancelled) setOnChain(parsed);
				} else {
					if (!cancelled) setOnChain(null);
				}
			} catch {
				// Invalid pubkey — fall back to nothing (not-found handles it).
				const mock =
					MOCK_SYNDICATES[syndicateId as keyof typeof MOCK_SYNDICATES];
				if (!cancelled && mock) {
					// Preserve legacy mock URLs as a preview when the key isn't a real pubkey.
					setOnChain(null);
				}
			} finally {
				if (!cancelled) setLoading(false);
			}
		}
		load();
		return () => {
			cancelled = true;
		};
	}, [syndicateId]);

	if (!syndicateId) {
		return <SyndicateNotFound />;
	}

	// Legacy mock fallback for non-pubkey slugs (kept so old links don't 404).
	const mock = MOCK_SYNDICATES[syndicateId as keyof typeof MOCK_SYNDICATES];

	if (!isConnected) {
		return <NotConnectedView />;
	}

	if (loading) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-background">
				<div className="w-8 h-8 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
			</div>
		);
	}

	// On-chain data model
	const isReal = !!onChain;
	const view = onChain
		? {
				id: onChain.pubkey,
				name: onChain.name || "Untitled Syndicate",
				creator: onChain.creator,
				creatorShort: `${onChain.creator.slice(0, 4)}…${onChain.creator.slice(-4)}`,
				description:
					"On-chain group-buying syndicate. Members pool USDC; the manager buys lottery tickets and prizes are split by contribution.",
				members: onChain.memberCount,
				maxMembers: 100,
				totalTickets: 0,
				totalWinnings: 0,
				isPublic: onChain.isPublic,
				managerFeeBps: onChain.managerFeeBps,
				activeSince: "",
				ticketsThisDraw: 0,
				drawsParticipated: 0,
				winRate: 0,
				tags: ["On-chain"],
				nextDrawIn: "—",
				currentEV: "—",
				poolBalance: onChain.totalContribution / 1_000_000,
			}
		: mock;

	if (!view) {
		return <SyndicateNotFound />;
	}

	const userPubkey = address ? new PublicKey(address) : null;
	const userMember = userPubkey
		? (onChain?.members.find((m) => m.wallet === userPubkey.toBase58()) ?? null)
		: null;
	const isMember = isReal ? !!userMember : true; // mock pages default to member view
	const isCreator =
		isReal && userPubkey ? onChain?.creator === userPubkey.toBase58() : false;
	const userUnclaimed = userMember?.unclaimedPrize ?? 0;

	const members: ChatMember[] = isReal
		? onChain.members.slice(0, 10).map((m) => ({
				address: m.wallet,
				addressShort: `${m.wallet.slice(0, 4)}…${m.wallet.slice(-4)}`,
				role:
					m.wallet === onChain.creator
						? ("manager" as const)
						: ("member" as const),
				isOnline: false,
				joinedAt: "",
				ticketsContributed: m.contribution / 1_000_000,
			}))
		: generateMockMembers(view);

	const handleJoin = async () => {
		if (!connectedProvider || !onChain || !userPubkey) return;
		const amount = Math.max(1, parseFloat(contribution) || 1);
		setActionLoading(true);
		setError(null);
		try {
			await joinSyndicate(
				connectedProvider,
				new PublicKey(view.id),
				new PublicKey(onChain.originalCreator),
				onChain.syndicateId,
				Math.floor(amount * 1_000_000),
				userUsdcAta(userPubkey),
			);
			setShowJoin(false);
			invalidateAll();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Join failed");
		} finally {
			setActionLoading(false);
		}
	};

	const handleLeave = async () => {
		if (!connectedProvider || !isMember || !userPubkey) return;
		if (!confirm("Are you sure you want to leave this syndicate?")) return;
		setActionLoading(true);
		setError(null);
		try {
			await leaveSyndicate(
				connectedProvider,
				new PublicKey(view.id),
				userUsdcAta(userPubkey),
			);
			invalidateAll();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Leave failed");
		} finally {
			setActionLoading(false);
		}
	};

	const handleBuyTicket = async () => {
		if (!connectedProvider || !isCreator || !onChain || !userPubkey) return;
		setActionLoading(true);
		setError(null);
		try {
			const numbers = generateMainNumbers();
			const [usdcAccount] = deriveSyndicateUsdcPDA(new PublicKey(view.id));
			await buySyndicateTickets(
				connectedProvider,
				new PublicKey(view.id),
				[numbers],
				usdcAccount,
			);
			await createSyndicateTickets(connectedProvider, new PublicKey(view.id), [
				numbers,
			]);
			setShowBuy(false);
			invalidateAll();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Purchase failed");
		} finally {
			setActionLoading(false);
		}
	};

	const handleClaim = async () => {
		if (!connectedProvider || userUnclaimed <= 0 || !onChain || !userPubkey)
			return;
		setActionLoading(true);
		setError(null);
		try {
			await claimSyndicateMemberPrize(
				connectedProvider,
				new PublicKey(view.id),
				userUnclaimed,
				userUsdcAta(userPubkey),
			);
			invalidateAll();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Claim failed");
		} finally {
			setActionLoading(false);
		}
	};

	return (
		<div className="min-h-screen bg-background flex flex-col">
			{/* Top Navigation */}
			<section className="relative pt-20 sm:pt-24 pb-4 sm:pb-6 px-4 sm:px-6 lg:px-8">
				<div className="absolute inset-0 hero-grid opacity-20" />
				<div className="absolute inset-0 bg-glow-emerald opacity-10" />

				<div className="relative z-10 max-w-7xl mx-auto">
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
							{view.name}
						</span>
					</nav>
				</div>
			</section>

			{/* Main Content */}
			<section className="relative flex-1 px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
				<div className="relative z-10 max-w-7xl mx-auto">
					{!isReal && (
						<div className="mb-4">
							<DemoDataBanner />
						</div>
					)}
					{isReal && (
						<div className="mb-4 hud-frame rounded-lg px-3 py-2 bg-emerald-500/5 border-emerald-500/20">
							<span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
								{"// LIVE ON-CHAIN SYNDICATE"}
							</span>
						</div>
					)}

					<div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
						{/* Left column: info + stats */}
						<div className="w-full lg:w-80 xl:w-96 shrink-0 space-y-4">
							<SyndicateInfoPanel
								syndicate={view}
								isMember={isMember}
								onJoin={() => setShowJoin(true)}
								onLeave={handleLeave}
							/>

							<div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 gap-2 sm:gap-3">
								<StatCard
									label="Total Contribution"
									value={`$${(view.poolBalance).toLocaleString()}`}
									icon={Trophy}
									color="text-gold-300"
								/>
								<StatCard
									label="Members"
									value={`${view.members}`}
									icon={Users}
									color="text-cyan-300"
								/>
								<StatCard
									label="Fee"
									value={
										view.managerFeeBps === 0
											? "None"
											: `${view.managerFeeBps / 100}%`
									}
									icon={Settings}
									color="text-emerald-400"
								/>
								<StatCard
									label="Status"
									value={view.isPublic ? "Public" : "Private"}
									icon={view.isPublic ? Unlock : Lock}
									color="text-muted-foreground"
								/>
							</div>

							{isReal && (
								<div className="hud-frame rounded-lg p-3 space-y-2">
									<label
										htmlFor="contribution"
										className="block text-[10px] text-muted-foreground uppercase tracking-wider"
									>
										Contribution to Join (USDC)
									</label>
									<input
										id="contribution"
										type="number"
										value={contribution}
										onChange={(e) => setContribution(e.target.value)}
										disabled={isMember}
										placeholder="25"
										className="w-full h-9 px-3 rounded-lg bg-surface-1/70 border border-cyan-500/20 text-sm text-foreground focus:outline-none focus:border-cyan-400/60"
									/>
									{!isMember && (
										<Button
											onClick={handleJoin}
											disabled={actionLoading}
											variant="emerald"
											className="w-full h-9 text-xs"
										>
											{actionLoading ? "Joining…" : "Join with Contribution"}
										</Button>
									)}
									{isCreator && (
										<Button
											onClick={() => setShowBuy(true)}
											variant="outline"
											className="w-full h-9 text-xs border-cyan-500/30 text-cyan-300"
										>
											<Target size={12} />
											Buy Ticket (manager)
										</Button>
									)}
									{isMember && userUnclaimed > 0 && (
										<Button
											onClick={handleClaim}
											variant="outline"
											className="w-full h-9 text-xs border-gold-500/30 text-gold-300"
										>
											<Trophy size={12} />
											Claim ${(userUnclaimed / 1_000_000).toFixed(2)}
										</Button>
									)}
									{isMember && (
										<Button
											onClick={handleLeave}
											variant="ghost"
											className="w-full h-9 text-xs text-red-400"
										>
											<LogOut size={12} />
											Leave Syndicate
										</Button>
									)}
								</div>
							)}
						</div>

						{/* Right column: chat */}
						<div className="flex-1 min-w-0 w-full">
							<div className="terminal-window flex flex-col h-[calc(100vh-10rem)] min-h-80 sm:min-h-125">
								<div className="terminal-titlebar shrink-0">
									<span className="size-2.5 rounded-full bg-[#FF3355]/80" />
									<span className="size-2.5 rounded-full bg-gold-400/80" />
									<span className="size-2.5 rounded-full bg-emerald-400/80" />
									<span className="ml-2">
										{"// syndicate channel — "}
										{view.name}
									</span>
								</div>
								<div className="flex-1 min-h-0 overflow-hidden">
									{isMember ? (
										<SyndicateChat
											syndicateId={view.id}
											syndicateName={view.name}
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
											{view.isPublic && !isMember && (
												<Button
													onClick={() => setShowJoin(true)}
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

			{/* Join confirmation modal */}
			{showJoin && (
				<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
					<button
						type="button"
						className="absolute inset-0 bg-black/70 backdrop-blur-sm"
						onClick={() => setShowJoin(false)}
						aria-label="Close"
					/>
					<div className="relative glass-strong rounded-2xl p-6 max-w-md w-full border border-cyan-500/30">
						<h2 className="font-display text-lg font-bold text-foreground uppercase tracking-wide mb-3">
							Join Syndicate
						</h2>
						<p className="text-xs text-muted-foreground mb-4">
							Contribute {contribution || "25"} USDC to join{" "}
							<span className="text-cyan-300">{view.name}</span>. You&apos;ll
							receive a proportional share of pool prizes.
						</p>
						{error && (
							<div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-400">
								{error}
							</div>
						)}
						<div className="flex gap-3">
							<Button
								variant="ghost"
								onClick={() => setShowJoin(false)}
								className="flex-1 h-10 text-sm"
							>
								Cancel
							</Button>
							<Button
								onClick={handleJoin}
								disabled={actionLoading}
								variant="emerald"
								className="flex-1 h-10 text-sm"
							>
								{actionLoading ? "Joining…" : "Join"}
							</Button>
						</div>
					</div>
				</div>
			)}

			{/* Buy confirmation modal */}
			{showBuy && (
				<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
					<button
						type="button"
						className="absolute inset-0 bg-black/70 backdrop-blur-sm"
						onClick={() => setShowBuy(false)}
						aria-label="Close"
					/>
					<div className="relative glass-strong rounded-2xl p-6 max-w-md w-full border border-cyan-500/30">
						<h2 className="font-display text-lg font-bold text-foreground uppercase tracking-wide mb-3">
							Buy a Syndicate Ticket
						</h2>
						<p className="text-xs text-muted-foreground mb-4">
							As manager, buy 1 ticket (random numbers) from the syndicate pool,
							then create the on-chain ticket account.
						</p>
						{error && (
							<div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-400">
								{error}
							</div>
						)}
						<div className="flex gap-3">
							<Button
								variant="ghost"
								onClick={() => setShowBuy(false)}
								className="flex-1 h-10 text-sm"
							>
								Cancel
							</Button>
							<Button
								onClick={handleBuyTicket}
								disabled={actionLoading}
								variant="emerald"
								className="flex-1 h-10 text-sm"
							>
								{actionLoading ? "Buying…" : "Buy & Create Ticket"}
							</Button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

/** Generate 6 unique random numbers 1-46 (crypto.Random-ish, good enough for a single buy). */
function generateMainNumbers(): number[] {
	const set = new Set<number>();
	while (set.size < 6) {
		set.add(Math.floor(Math.random() * 46) + 1);
	}
	return Array.from(set).sort((a, b) => a - b);
}
