import {
	ArrowRight,
	BarChart3,
	CheckCircle2,
	ChevronDown,
	Gem,
	Github,
	Globe,
	Loader2,
	Lock,
	Mail,
	MessageCircle,
	PartyPopper,
	Shield,
	Sparkles,
	TrendingUp,
	Twitter,
	Users,
	Wallet,
	Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FloatingBalls, LotteryBallRow } from "@/components/LotteryBalls";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/*  Constants                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Prelaunch launch target (UTC). Update as the roadmap shifts.
 * Used by the countdown + roadmap timeline.
 */
const LAUNCH_DATE = new Date("2026-09-05T00:00:00Z").getTime();

const WAITLIST_API = "/api/waitlist";

const SOCIALS = {
	twitter: "https://twitter.com/mazelprotocol",
	discord: "https://discord.gg/mazelprotocol",
	github: "https://github.com/mazelprotocol",
	website: "https://mazelprotocol.com",
};

const features = [
	{
		icon: TrendingUp,
		title: "Mathematical +EV Windows",
		description:
			"When the jackpot hits the soft cap, the odds flip in your favor. Rolldown mechanics create provably positive expected value windows — the math works for you.",
		highlight: true,
	},
	{
		icon: Shield,
		title: "Provably Fair Draws",
		description:
			"Switchboard TEE randomness with a commit-reveal pattern. Every draw is verifiable on-chain. No black boxes, no trust required.",
	},
	{
		icon: Wallet,
		title: "Non-Custodial by Design",
		description:
			"Funds stay in your wallet. Tickets, prizes, and claims are on-chain — direct wallet-to-protocol, no deposits or withdrawals.",
	},
	{
		icon: Zap,
		title: "Quick Pick Express",
		description:
			"A fast 5/35 game with draws every 4 hours at $1.50/ticket, a separate jackpot, and its own rolldown +EV windows.",
	},
	{
		icon: Users,
		title: "On-Chain Syndicates",
		description:
			"Pool capital with other players to cut variance. Automatic prize splitting and a monthly Syndicate Wars competition.",
	},
	{
		icon: BarChart3,
		title: "Pari-Mutuel Protection",
		description:
			"Fixed prizes in normal mode transition to pari-mutuel during rolldowns. Operator liability is always capped — the protocol stays sustainable.",
	},
];

const roadmap = [
	{
		phase: "Phase 1",
		title: "Prelaunch",
		status: "Live now",
		description:
			"Waitlist open. Audits, testnet dry-runs, and final smart-contract hardening.",
		active: true,
	},
	{
		phase: "Phase 2",
		title: "Private Beta",
		status: "Waitlist priority",
		description:
			"First cohort gets early access, a deposit bonus, and priority syndicate seats.",
	},
	{
		phase: "Phase 3",
		title: "Public Launch",
		status: "TBA",
		description:
			"Full launch on Solana mainnet with the 6/46 main lottery and Quick Pick Express.",
	},
];

const faqs = [
	{
		q: "What makes MazelProtocol different from other lotteries?",
		a: "Every draw uses provably fair on-chain randomness, and the rolldown mechanic creates mathematically positive expected value windows when the jackpot reaches its soft cap. The protocol is designed so the math can flip in the player's favor.",
	},
	{
		q: "Is it really non-custodial?",
		a: "Yes. Tickets, prizes, and claims all happen directly between your wallet and the on-chain program. There are no deposits or withdrawals — the protocol never holds your funds.",
	},
	{
		q: "When does it launch?",
		a: "We're in the prelaunch phase. Join the waitlist for priority access to the private beta, then the full public launch on Solana mainnet.",
	},
	{
		q: "How does the +EV rolldown work?",
		a: "A portion of every ticket grows the jackpot. Once the jackpot reaches the soft cap, rolldown becomes possible: if no one matches all numbers, the jackpot distributes to lower-tier winners via pari-mutuel division — pushing player expected value positive.",
	},
	{
		q: "What do I need to play?",
		a: "A Solana wallet (e.g. Phantom or Backpack) and USDC. No KYC, no deposits — connect your wallet and play.",
	},
];

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                            */
/* -------------------------------------------------------------------------- */

function LaunchCountdown() {
	const [now, setNow] = useState(() => Date.now());

	useEffect(() => {
		const id = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(id);
	}, []);

	const diff = Math.max(0, LAUNCH_DATE - now);
	const days = Math.floor(diff / 86_400_000);
	const hours = Math.floor((diff / 3_600_000) % 24);
	const minutes = Math.floor((diff / 60_000) % 60);
	const seconds = Math.floor((diff / 1_000) % 60);

	const units = [
		{ label: "Days", value: days },
		{ label: "Hours", value: hours },
		{ label: "Minutes", value: minutes },
		{ label: "Seconds", value: seconds },
	];

	return (
		<div className="flex items-center justify-center gap-3 sm:gap-4">
			{units.map((u) => (
				<div
					key={u.label}
					className="w-16 sm:w-20 rounded-xl hud-frame px-2 py-3 text-center"
				>
					<div className="font-mono text-2xl sm:text-3xl font-black text-cyan-300 tabular-nums neon-cyan">
						{String(u.value).padStart(2, "0")}
					</div>
					<div className="hud-label mt-1">{u.label}</div>
				</div>
			))}
		</div>
	);
}

interface WaitlistFormProps {
	onJoined: (position: number) => void;
}

function WaitlistForm({ onJoined }: WaitlistFormProps) {
	const [email, setEmail] = useState("");
	const [wallet, setWallet] = useState("");
	const [status, setStatus] = useState<
		| { type: "idle" }
		| { type: "submitting" }
		| { type: "error"; message: string }
	>({ type: "idle" });

	const submit = useCallback(
		async (e: React.FormEvent) => {
			e.preventDefault();
			const trimmedEmail = email.trim();
			if (!trimmedEmail) return;

			setStatus({ type: "submitting" });
			try {
				const res = await fetch(WAITLIST_API, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						email: trimmedEmail,
						wallet: wallet.trim() || undefined,
						source: "landing",
					}),
				});

				let data: { success?: boolean; position?: number; error?: string } = {};
				try {
					data = await res.json();
				} catch {
					/* non-JSON response */
				}

				if (res.ok && data.success) {
					onJoined(data.position ?? 0);
				} else {
					setStatus({
						type: "error",
						message:
							data.error ??
							"Something went wrong — please try again or join us on Discord.",
					});
				}
			} catch {
				// Network failure (e.g. local dev without the Pages function).
				setStatus({
					type: "error",
					message:
						"We couldn't reach the server. Join us on Discord or X so you don't miss the launch.",
				});
			}
		},
		[email, wallet, onJoined],
	);

	return (
		<div className="hud-frame rounded-lg p-5 sm:p-6 relative glow-cyan">
			<form
				onSubmit={submit}
				className="w-full max-w-xl mx-auto text-left"
				noValidate
			>
				<div className="flex flex-col sm:flex-row gap-2.5">
					<div className="flex-1 relative">
						<Mail
							size={16}
							className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/60"
						/>
						<input
							type="email"
							required
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							placeholder="you@example.com"
							autoComplete="email"
							maxLength={254}
							className="w-full h-12 pl-10 pr-4 rounded-xl bg-surface-1/70 border border-border text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-gold-500/40 focus:ring-2 focus:ring-gold-500/15 transition-colors"
						/>
					</div>
					<Button
						type="submit"
						size="xl"
						variant="default"
						disabled={status.type === "submitting" || !email.trim()}
						className="h-12 shrink-0"
					>
						{status.type === "submitting" ? (
							<>
								<Loader2 size={16} className="animate-spin" />
								Joining…
							</>
						) : (
							<>
								Join the Waitlist
								<ArrowRight size={16} />
							</>
						)}
					</Button>
				</div>

				<div className="mt-2.5 relative">
					<Wallet
						size={16}
						className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/60"
					/>
					<input
						type="text"
						value={wallet}
						onChange={(e) => setWallet(e.target.value)}
						placeholder="Solana wallet (optional) — reserve your spot faster"
						autoComplete="off"
						spellCheck={false}
						maxLength={44}
						className="w-full h-11 pl-10 pr-4 rounded-xl bg-surface-1/50 border border-cyan-500/20 text-sm text-foreground placeholder:text-muted-foreground/45 focus:outline-none focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-500/15 transition-colors"
					/>
				</div>

				{status.type === "error" && (
					<div className="mt-3 text-sm text-red-400/90 bg-red-500/8 border border-red-500/15 rounded-xl px-4 py-3">
						{status.message}
						<div className="mt-2 flex items-center gap-3">
							<a
								href={SOCIALS.discord}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-1.5 text-xs font-semibold text-gold-400 hover:text-gold-300"
							>
								<MessageCircle size={13} /> Discord
							</a>
							<a
								href={SOCIALS.twitter}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-1.5 text-xs font-semibold text-gold-400 hover:text-gold-300"
							>
								<Twitter size={13} /> X / Twitter
							</a>
						</div>
					</div>
				)}
			</form>
		</div>
	);
}

function FaqItem({ q, a }: { q: string; a: string }) {
	return (
		<details className="group rounded-2xl border border-cyan-500/10 bg-surface-1/40 open:bg-surface-1/70 transition-colors">
			<summary className="flex items-center justify-between gap-4 cursor-pointer list-none px-5 py-4 select-none">
				<span className="text-sm sm:text-base font-semibold text-foreground">
					{q}
				</span>
				<ChevronDown
					size={16}
					className="shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
				/>
			</summary>
			<p className="px-5 pb-5 text-sm text-muted-foreground leading-relaxed">
				{a}
			</p>
		</details>
	);
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export default function Waitlist() {
	const [joined, setJoined] = useState<{ position: number } | null>(null);
	const [totalCount, setTotalCount] = useState<number | null>(null);

	// Load waitlist count (stats endpoint) for social proof.
	useEffect(() => {
		let cancelled = false;
		fetch(`${WAITLIST_API}/stats`)
			.then((r) => (r.ok ? r.json() : null))
			.then((d: { count?: number } | null) => {
				if (!cancelled && d && typeof d.count === "number") {
					setTotalCount(d.count);
				}
			})
			.catch(() => {
				/* stats are decorative — ignore failures */
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const handleJoined = useCallback((position: number) => {
		setJoined({ position });
		// Bump the visible count optimistically.
		setTotalCount((c) => (c === null ? c : c + 1));
		try {
			window.scrollTo({ top: 0, behavior: "smooth" });
		} catch {
			/* noop */
		}
	}, []);

	const socialProof = useMemo(() => {
		const parts: string[] = [];
		if (totalCount !== null) {
			parts.push(`${totalCount.toLocaleString()}+ on the waitlist`);
		}
		parts.push("Provably fair on Solana");
		parts.push("No KYC · Non-custodial");
		return parts;
	}, [totalCount]);

	return (
		<div className="relative min-h-screen bg-background text-foreground overflow-x-hidden scanlines">
			{/* ================================================================ */}
			{/*  NAV                                                             */}
			{/* ================================================================ */}
			<header className="relative z-20">
				<nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
					<Link to="/" className="flex items-center gap-2">
						<div className="w-9 h-9 rounded-xl bg-linear-to-br from-gold-400/20 to-cyan-500/10 border border-gold-500/25 flex items-center justify-center">
							<Gem size={18} className="text-gold-400" />
						</div>
						<span className="font-display font-black text-lg tracking-tight">
							Mazel<span className="text-gold-400">Protocol</span>
						</span>
					</Link>

					<div className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
						<a href="#how" className="hover:text-foreground transition-colors">
							How it works
						</a>
						<a
							href="#features"
							className="hover:text-foreground transition-colors"
						>
							Features
						</a>
						<a
							href="#roadmap"
							className="hover:text-foreground transition-colors"
						>
							Roadmap
						</a>
						<a href="#faq" className="hover:text-foreground transition-colors">
							FAQ
						</a>
					</div>

					<div className="flex items-center gap-2">
						<a
							href={SOCIALS.twitter}
							target="_blank"
							rel="noopener noreferrer"
							aria-label="Twitter / X"
							className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-gold-500/30 transition-colors"
						>
							<Twitter size={15} />
						</a>
						<a
							href={SOCIALS.discord}
							target="_blank"
							rel="noopener noreferrer"
							aria-label="Discord"
							className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-gold-500/30 transition-colors"
						>
							<MessageCircle size={15} />
						</a>
					</div>
				</nav>
			</header>

			{/* ================================================================ */}
			{/*  HERO                                                            */}
			{/* ================================================================ */}
			<section className="relative flex items-center justify-center overflow-hidden pt-10 pb-20 sm:pb-28">
				{/* Background */}
				<div className="absolute inset-0 hero-grid opacity-30 pointer-events-none" />
				<div className="absolute inset-0 bg-glow-top-left opacity-60 pointer-events-none" />
				<div className="absolute inset-0 bg-glow-bottom-right opacity-60 pointer-events-none" />
				<div className="absolute top-1/4 left-1/4 w-125 h-125 bg-gold-500/5 rounded-full blur-[150px] pointer-events-none" />
				<div className="absolute bottom-1/4 right-1/4 w-125 h-125 bg-emerald-500/5 rounded-full blur-[150px] pointer-events-none" />
				<FloatingBalls count={10} className="opacity-25" />

				<div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
					{/* Badge */}
					<div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gold-500/8 border border-gold-500/20 mb-8 animate-pulse-glow">
						<Sparkles size={13} className="text-gold-400" />
						<span className="text-[11px] font-bold text-gold-400 uppercase tracking-[0.2em]">
							Prelaunch — Private Beta
						</span>
					</div>

					<h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-wide leading-[1.05] mb-6 font-display">
						<span className="uppercase">
							<span className="glitch" data-text="The First">
								The First
							</span>{" "}
							<span className="text-gradient-gold">+EV Lottery</span>
						</span>
						<br />
						<span className="text-2xl sm:text-3xl md:text-4xl font-medium text-cyan-300/80">
							Built on Solana
						</span>
					</h1>

					<p className="max-w-2xl mx-auto text-base sm:text-lg text-muted-foreground leading-relaxed mb-10">
						MazelProtocol creates predictable windows of{" "}
						<span className="text-emerald-400 font-semibold">
							positive expected value
						</span>{" "}
						through mathematical rolldown mechanics. When the jackpot reaches
						the soft cap, the edge flips — the math works in your favor.
					</p>

					{/* Countdown */}
					<div className="mb-10">
						<p className="hud-label mb-3">{"// PUBLIC LAUNCH IN"}</p>
						<LaunchCountdown />
					</div>

					{/* Form / success */}
					{joined ? (
						<div className="relative glass-gold rounded-2xl border border-gold-500/25 p-8 sm:p-10 max-w-xl mx-auto glow-gold overflow-hidden">
							<div className="absolute inset-0 bg-glow-gold opacity-20 pointer-events-none" />
							<div className="relative z-10">
								<div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 mb-5">
									<PartyPopper size={24} className="text-emerald-400" />
								</div>
								<h2 className="text-xl sm:text-2xl font-black mb-2">
									You're on the list!
								</h2>
								<p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
									You're position{" "}
									<span className="font-bold text-gold-400">
										#{joined.position.toLocaleString()}
									</span>{" "}
									on the waitlist. Keep an eye on your inbox for beta
									invitations, and follow us on X for launch updates.
								</p>
								<div className="flex flex-wrap items-center justify-center gap-3">
									<a
										href={SOCIALS.twitter}
										target="_blank"
										rel="noopener noreferrer"
										className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-foreground/5 border border-border text-sm font-semibold hover:border-gold-500/30 transition-colors"
									>
										<Twitter size={14} className="text-gold-400" />
										Follow on X
									</a>
									<a
										href={SOCIALS.discord}
										target="_blank"
										rel="noopener noreferrer"
										className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-foreground/5 border border-border text-sm font-semibold hover:border-gold-500/30 transition-colors"
									>
										<MessageCircle size={14} className="text-gold-400" />
										Join Discord
									</a>
								</div>
							</div>
						</div>
					) : (
						<>
							<WaitlistForm onJoined={handleJoined} />

							{/* Social proof strip */}
							<div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 mt-8 text-[11px] text-muted-foreground">
								{socialProof.map((item, i) => (
									<span key={item} className="inline-flex items-center gap-2">
										{i > 0 && (
											<span className="hidden sm:inline w-px h-3 bg-foreground/10" />
										)}
										{i === 0 && (
											<Users size={12} className="text-emerald-400" />
										)}
										{i === 1 && <Shield size={12} className="text-gold-400" />}
										{i === 2 && <Lock size={12} className="text-emerald-400" />}
										{item}
									</span>
								))}
							</div>
						</>
					)}
				</div>
			</section>

			{/* ================================================================ */}
			{/*  HOW THE MATH WORKS (ROLldown strip)                             */}
			{/* ================================================================ */}
			<section id="how" className="py-16 sm:py-24">
				<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
					<div className="text-center mb-12">
						<div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 mb-3">
							<div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
							<span className="hud-label">The Mechanism</span>
						</div>
						<h2 className="text-2xl sm:text-3xl lg:text-4xl font-black font-display tracking-wide uppercase mb-3">
							How <span className="text-gradient-gold">Rolldown</span> Flips the
							Edge
						</h2>
						<p className="text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto">
							A four-phase cycle that turns lottery math in your favor.
						</p>
					</div>

					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
						{[
							{
								step: "01",
								title: "Jackpot Builds",
								desc: "Every $2.50 ticket grows the jackpot. 55.6% goes to prizes, 39.4% to fixed payouts, 5% to safety reserves.",
							},
							{
								step: "02",
								title: "Soft Cap ($1.75M)",
								desc: "Probabilistic rolldown becomes possible. Each draw has a chance to trigger full jackpot distribution.",
							},
							{
								step: "03",
								title: "Probability Rises",
								desc: "The chance grows linearly with the jackpot. At $2M there's a ~50% rolldown chance per draw.",
							},
							{
								step: "04",
								title: "Hard Cap ($2.25M)",
								desc: "100% guaranteed distribution via pari-mutuel. Player edge reaches +104% under optimal conditions.",
							},
						].map((s) => (
							<div
								key={s.step}
								className="relative card-premium rounded-2xl p-6 hover:border-gold-500/20 transition-colors"
							>
								<div className="text-3xl font-black text-gold-400/25 mb-4">
									{s.step}
								</div>
								<h3 className="text-sm font-bold mb-2 text-foreground">
									{s.title}
								</h3>
								<p className="text-xs text-muted-foreground leading-relaxed">
									{s.desc}
								</p>
							</div>
						))}
					</div>
				</div>
			</section>

			{/* ================================================================ */}
			{/*  FEATURES                                                        */}
			{/* ================================================================ */}
			<section
				id="features"
				className="py-16 sm:py-24 bg-surface-1/30 border-y border-border/60"
			>
				<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
					<div className="text-center mb-12">
						<div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 mb-3">
							<div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
							<span className="hud-label">Why MazelProtocol</span>
						</div>
						<h2 className="text-2xl sm:text-3xl lg:text-4xl font-black font-display tracking-wide uppercase mb-3">
							Built Different,{" "}
							<span className="text-gradient-emerald">Provably Fair</span>
						</h2>
						<p className="text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto">
							Every mechanic is on-chain, auditable, and engineered so the house
							doesn't always win.
						</p>
					</div>

					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
						{features.map((f) => (
							<div
								key={f.title}
								className={cn(
									"group relative rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1",
									f.highlight
										? "bg-linear-to-br from-gold-500/8 via-gold-500/3 to-transparent border border-gold-500/15 glow-gold hover:border-gold-500/30"
										: "bg-surface-1/50 border border-cyan-500/10 hover:border-cyan-400/30 hover:bg-surface-2/50",
								)}
							>
								<div
									className={cn(
										"w-10 h-10 rounded-xl flex items-center justify-center mb-4 transition-colors",
										f.highlight
											? "bg-gold-500/15 text-gold-400"
											: "bg-surface-2 text-muted-foreground group-hover:text-gold-400 group-hover:bg-gold-500/10",
									)}
								>
									<f.icon size={20} />
								</div>
								<h3 className="text-sm sm:text-base font-bold mb-2 text-foreground">
									{f.title}
								</h3>
								<p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
									{f.description}
								</p>
								{f.highlight && (
									<div className="absolute top-4 right-4">
										<Sparkles
											size={16}
											className="text-gold-400 animate-pulse"
										/>
									</div>
								)}
							</div>
						))}
					</div>
				</div>
			</section>

			{/* ================================================================ */}
			{/*  PREVIEW: PRIZE STRUCTURE                                        */}
			{/* ================================================================ */}
			<section className="py-16 sm:py-24">
				<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
					<div className="text-center mb-12">
						<div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 mb-3">
							<div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
							<span className="hud-label">Main Lottery · 6/46</span>
						</div>
						<h2 className="text-2xl sm:text-3xl lg:text-4xl font-black font-display tracking-wide uppercase mb-3">
							Prize Structure Preview
						</h2>
						<p className="text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto">
							Fixed prizes in normal mode, pari-mutuel during rolldowns.
						</p>
					</div>

					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-5xl mx-auto">
						{[
							{
								match: "Match 5",
								prize: "$4,000",
								rolldown: "~$46,000*",
								balls: [1, 2, 3, 4, 5],
							},
							{
								match: "Match 4",
								prize: "$150",
								rolldown: "~$1,330*",
								balls: [1, 2, 3, 4],
							},
							{
								match: "Match 3",
								prize: "$5",
								rolldown: "~$90*",
								balls: [1, 2, 3],
							},
							{
								match: "Match 2",
								prize: "Free Ticket",
								rolldown: "Free Ticket",
								balls: [1, 2],
							},
						].map((tier) => (
							<div
								key={tier.match}
								className="relative rounded-2xl p-6 card-premium text-center hover:border-gold-500/15 transition-colors"
							>
								<p className="hud-label mb-3">{tier.match}</p>
								<div className="mb-3 flex justify-center">
									<LotteryBallRow numbers={tier.balls} />
								</div>
								<div className="font-mono text-lg font-black text-gold-300">
									{tier.prize}
								</div>
								<div className="font-mono text-[11px] text-gold-300/80 mt-1">
									{tier.rolldown}
								</div>
							</div>
						))}
					</div>
					<p className="text-center text-[10px] text-muted-foreground/60 mt-6 max-w-md mx-auto">
						*Rolldown prizes are pari-mutuel estimates. Actual = Pool ÷ Winners.
					</p>
				</div>
			</section>

			{/* ================================================================ */}
			{/*  ROADMAP                                                         */}
			{/* ================================================================ */}
			<section
				id="roadmap"
				className="py-16 sm:py-24 bg-surface-1/30 border-y border-border/60"
			>
				<div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
					<div className="text-center mb-12">
						<div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 mb-3">
							<div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
							<span className="hud-label">Roadmap</span>
						</div>
						<h2 className="text-2xl sm:text-3xl lg:text-4xl font-black font-display tracking-wide uppercase mb-3">
							From Prelaunch to{" "}
							<span className="text-gradient-gold">Mainnet</span>
						</h2>
					</div>

					<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
						{roadmap.map((phase, i) => (
							<div
								key={phase.phase}
								className={cn(
									"relative rounded-2xl p-6 border transition-colors",
									phase.active
										? "border-gold-500/25 bg-linear-to-br from-gold-500/8 to-transparent glow-gold"
										: "border-cyan-500/10 bg-surface-1/40",
								)}
							>
								{i < roadmap.length - 1 && (
									<div className="hidden md:block absolute top-1/2 -right-2 z-10 text-muted-foreground/40">
										<ArrowRight size={16} />
									</div>
								)}
								<div className="text-[10px] font-bold uppercase tracking-[0.18em] text-gold-400/70 mb-1">
									{phase.phase}
								</div>
								<h3 className="text-base font-bold mb-1">{phase.title}</h3>
								<div
									className={cn(
										"inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider mb-3",
										phase.active ? "text-emerald-400" : "text-muted-foreground",
									)}
								>
									{phase.active && (
										<CheckCircle2 size={11} className="text-emerald-400" />
									)}
									{phase.status}
								</div>
								<p className="text-xs text-muted-foreground leading-relaxed">
									{phase.description}
								</p>
							</div>
						))}
					</div>
				</div>
			</section>

			{/* ================================================================ */}
			{/*  FAQ                                                             */}
			{/* ================================================================ */}
			<section id="faq" className="py-16 sm:py-24">
				<div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
					<div className="text-center mb-12">
						<div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 mb-3">
							<div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
							<span className="hud-label">FAQ</span>
						</div>
						<h2 className="text-2xl sm:text-3xl lg:text-4xl font-black font-display tracking-wide uppercase mb-3">
							Frequently Asked
						</h2>
					</div>

					<div className="space-y-3">
						{faqs.map((f) => (
							<FaqItem key={f.q} q={f.q} a={f.a} />
						))}
					</div>
				</div>
			</section>

			{/* ================================================================ */}
			{/*  FINAL CTA + FOOTER                                              */}
			{/* ================================================================ */}
			<section className="relative py-20 sm:py-28 overflow-hidden">
				<div className="absolute inset-0 bg-glow-gold opacity-30 pointer-events-none" />
				<FloatingBalls count={6} className="opacity-20" />

				<div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
					<h2 className="text-3xl sm:text-4xl lg:text-5xl font-black font-display tracking-wide uppercase mb-4">
						Be First in Line When{" "}
						<span className="text-gradient-emerald">We Launch</span>
					</h2>
					<p className="text-sm sm:text-base text-muted-foreground max-w-xl mx-auto mb-8">
						Join the waitlist for priority beta access, launch rewards, and
						early syndicate seats.
					</p>

					{!joined ? (
						<WaitlistForm onJoined={handleJoined} />
					) : (
						<div className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-semibold">
							<CheckCircle2 size={16} />
							You're on the list — position #{joined.position.toLocaleString()}
						</div>
					)}

					{/* Footer */}
					<footer className="mt-16 pt-8 border-t border-border/60">
						<div className="flex flex-col items-center gap-4">
							<div className="flex items-center gap-2">
								<div className="w-7 h-7 rounded-lg bg-linear-to-br from-gold-400/20 to-cyan-500/10 border border-gold-500/25 flex items-center justify-center">
									<Gem size={14} className="text-gold-400" />
								</div>
								<span className="font-display font-black text-sm">
									Mazel<span className="text-gold-400">Protocol</span>
								</span>
							</div>

							<div className="flex items-center gap-3">
								{[
									{
										href: SOCIALS.twitter,
										label: "X / Twitter",
										icon: Twitter,
									},
									{
										href: SOCIALS.discord,
										label: "Discord",
										icon: MessageCircle,
									},
									{ href: SOCIALS.github, label: "GitHub", icon: Github },
									{ href: SOCIALS.website, label: "Website", icon: Globe },
								].map((s) => (
									<a
										key={s.label}
										href={s.href}
										target="_blank"
										rel="noopener noreferrer"
										aria-label={s.label}
										className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-gold-500/30 transition-colors"
									>
										<s.icon size={15} />
									</a>
								))}
							</div>

							<p className="text-[10px] text-muted-foreground/60 text-center max-w-sm">
								Provably fair · Switchboard VRF · Non-custodial · Fully
								transparent on-chain. © 2026 MazelProtocol.
							</p>
						</div>
					</footer>
				</div>
			</section>
		</div>
	);
}
