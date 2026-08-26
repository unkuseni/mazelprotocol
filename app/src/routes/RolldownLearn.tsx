import {
	ArrowDown,
	BarChart3,
	BookOpen,
	CheckCircle,
	ChevronRight,
	Clock,
	DollarSign,
	Eye,
	Gem,
	type LucideIcon,
	Shield,
	Sparkles,
	Star,
	Target,
	TrendingUp,
	Trophy,
	Users,
	Wallet,
	Zap,
} from "lucide-react";
import { Link } from "react-router-dom";
import { FloatingBalls } from "@/components/LotteryBalls";

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                            */
/* -------------------------------------------------------------------------- */

interface SectionHeadingProps {
	number: string;
	title: string;
	subtitle?: string;
	icon: LucideIcon;
}

function SectionHeading({
	number,
	title,
	subtitle,
	icon: Icon,
}: SectionHeadingProps) {
	return (
		<div className="flex items-start gap-3 mb-6">
			<div className="shrink-0 w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center font-mono text-sm font-black text-cyan-300">
				{number}
			</div>
			<div>
				<h2 className="font-display text-lg sm:text-xl lg:text-2xl font-black text-foreground uppercase tracking-wide flex items-center gap-2">
					{title}
					<Icon size={20} className="text-cyan-300/70" />
				</h2>
				{subtitle && (
					<p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
				)}
			</div>
		</div>
	);
}

interface FlowStepProps {
	step: string;
	title: string;
	description: string;
	icon: LucideIcon;
	highlight?: boolean;
	isLast?: boolean;
}

function FlowStep({
	step,
	title,
	description,
	icon: Icon,
	highlight,
	isLast,
}: FlowStepProps) {
	return (
		<div className="relative">
			<div
				className={`hud-frame rounded-lg p-4 sm:p-6 lg:p-8 transition-all ${
					highlight
						? "border-emerald-500/40 shadow-sm shadow-emerald-500/10"
						: ""
				}`}
			>
				<div className="flex items-start gap-3">
					<div
						className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center font-mono text-xs font-black ${
							highlight
								? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-400"
								: "bg-cyan-500/10 border border-cyan-500/30 text-cyan-300"
						}`}
					>
						{step}
					</div>
					<div>
						<div className="flex items-center gap-2 mb-1">
							<h3 className="font-display text-sm font-bold text-foreground uppercase tracking-wide">
								{title}
							</h3>
							<Icon
								size={14}
								className={
									highlight ? "text-emerald-400" : "text-muted-foreground"
								}
							/>
						</div>
						<p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
							{description}
						</p>
					</div>
				</div>
			</div>
			{!isLast && (
				<div className="flex justify-center py-1.5">
					<ArrowDown size={16} className="text-muted-foreground/60" />
				</div>
			)}
		</div>
	);
}

interface ComparisonRowProps {
	label: string;
	normal: string;
	rolldown: string;
	rolldownHighlight?: boolean;
}

function ComparisonRow({
	label,
	normal,
	rolldown,
	rolldownHighlight,
}: ComparisonRowProps) {
	return (
		<div className="grid grid-cols-3 gap-2 sm:gap-3 py-2.5 border-b border-foreground/3 last:border-0">
			<div className="text-[11px] sm:text-xs text-muted-foreground font-medium truncate">
				{label}
			</div>
			<div className="font-mono text-[11px] sm:text-xs text-muted-foreground text-center font-semibold truncate">
				{normal}
			</div>
			<div
				className={`font-mono text-[11px] sm:text-xs text-center font-bold truncate ${
					rolldownHighlight ? "text-emerald-400" : "text-muted-foreground"
				}`}
			>
				{rolldown}
			</div>
		</div>
	);
}

interface EVBarProps {
	label: string;
	ev: number;
	maxEv: number;
	isPositive: boolean;
}

function EVBar({ label, ev, maxEv, isPositive }: EVBarProps) {
	const absEv = Math.abs(ev);
	const width = Math.min((absEv / maxEv) * 100, 100);

	return (
		<div className="space-y-1.5">
			<div className="flex items-center justify-between text-xs">
				<span className="text-muted-foreground">{label}</span>
				<span
					className={`font-mono font-bold ${
						isPositive ? "text-emerald-400" : "text-magenta-300"
					}`}
				>
					{isPositive ? "+" : ""}
					{ev.toFixed(1)}%
				</span>
			</div>
			<div className="h-2.5 bg-foreground/5 rounded-full overflow-hidden">
				<div
					className={`h-full rounded-full transition-all duration-700 ease-out ${
						isPositive
							? "bg-linear-to-r from-emerald-600 to-emerald-400"
							: "bg-linear-to-r from-magenta-600 to-magenta-400"
					}`}
					style={{ width: `${width}%` }}
				/>
			</div>
		</div>
	);
}

function VisualDiagram() {
	return (
		<div className="hud-frame rounded-lg p-4 sm:p-6 lg:p-8 overflow-hidden relative">
			<div className="absolute top-0 right-0 w-64 h-64 bg-glow-emerald opacity-10" />

			<h3 className="font-display text-base font-bold text-foreground uppercase tracking-wide mb-6 flex items-center gap-2 relative z-10">
				<BarChart3 size={18} className="text-cyan-300" />
				Rolldown Prize Distribution Flow
			</h3>

			<div className="relative z-10 space-y-3 sm:space-y-4">
				{/* Jackpot Pool */}
				<div className="text-center">
					<div className="inline-flex flex-col items-center max-w-full">
						<div className="px-4 sm:px-6 py-2 sm:py-3 rounded-xl bg-linear-to-br from-gold-500/20 to-gold-600/10 border border-gold-500/40 glow-gold">
							<div className="text-[10px] sm:text-[11px] text-gold-300/80 uppercase tracking-wider font-semibold mb-0.5">
								Jackpot Pool
							</div>
							<div className="font-mono text-xl sm:text-2xl font-black text-gradient-gold">
								$1,750,000
							</div>
							<div className="text-[9px] sm:text-[10px] text-gold-300/60 mt-0.5">
								Soft Cap Reached — No Match 6 Winner
							</div>
						</div>
						<div className="w-px h-6 bg-emerald-500/40" />
						<div className="flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/40">
							<Zap size={10} className="text-emerald-400" />
							<span className="text-[9px] sm:text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
								Rolldown Triggered
							</span>
						</div>
						<div className="w-px h-6 bg-emerald-500/40" />
					</div>
				</div>

				{/* Distribution split */}
				<div className="grid grid-cols-1 md:grid-cols-3 gap-3">
					{/* Match 5 */}
					<div className="hud-frame rounded-lg p-3 sm:p-4 text-center border-gold-500/30">
						<div className="text-[10px] sm:text-[11px] text-muted-foreground uppercase tracking-wider mb-1">
							25% → Match 5
						</div>
						<div className="font-mono text-base sm:text-lg font-black text-gold-300">
							$437,500
						</div>
						<div className="h-px bg-foreground/5 my-2" />
						<div className="text-[11px] sm:text-[12px] text-muted-foreground">
							~20 winners ={" "}
							<span className="font-mono font-bold text-gold-300">
								$21,875 each
							</span>
						</div>
						<div className="text-[10px] sm:text-[11px] text-muted-foreground/60 mt-1">
							Normal: $4,000 fixed
						</div>
					</div>

					{/* Match 4 */}
					<div className="hud-frame rounded-lg p-3 sm:p-4 text-center border-emerald-500/30">
						<div className="text-[10px] sm:text-[11px] text-muted-foreground uppercase tracking-wider mb-1">
							35% → Match 4
						</div>
						<div className="font-mono text-base sm:text-lg font-black text-emerald-400">
							$612,500
						</div>
						<div className="h-px bg-foreground/5 my-2" />
						<div className="text-[11px] sm:text-[12px] text-muted-foreground">
							~1,200 winners ={" "}
							<span className="font-mono font-bold text-emerald-400">
								$510 each
							</span>
						</div>
						<div className="text-[10px] sm:text-[11px] text-muted-foreground/60 mt-1">
							Normal: $150 fixed
						</div>
					</div>

					{/* Match 3 */}
					<div className="hud-frame rounded-lg p-3 sm:p-4 text-center border-emerald-500/30">
						<div className="text-[10px] sm:text-[11px] text-muted-foreground uppercase tracking-wider mb-1">
							40% → Match 3
						</div>
						<div className="font-mono text-base sm:text-lg font-black text-emerald-400">
							$700,000
						</div>
						<div className="h-px bg-foreground/5 my-2" />
						<div className="text-[11px] sm:text-[12px] text-muted-foreground">
							~20,000 winners ={" "}
							<span className="font-mono font-bold text-emerald-400">
								$35 each
							</span>
						</div>
						<div className="text-[10px] sm:text-[11px] text-muted-foreground/60 mt-1">
							Normal: $5 fixed
						</div>
					</div>
				</div>

				{/* Result callout */}
				<div className="flex items-center justify-center">
					<div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/30">
						<TrendingUp size={14} className="text-emerald-400" />
						<span className="font-mono text-[11px] sm:text-xs font-bold text-emerald-400">
							Total Distributed: $1,750,000 — Player EV: +14.6% to +62%
						</span>
					</div>
				</div>

				<p className="text-[11px] sm:text-[12px] text-muted-foreground text-center">
					All prizes are pari-mutuel (Pool ÷ Winners) — fewer winners means
					bigger prizes for you. After rolldown, the jackpot resets to the
					$500,000 seed and the cycle begins again.
				</p>
			</div>
		</div>
	);
}

function QuickPickExpressDiagram() {
	return (
		<div className="hud-frame rounded-lg p-4 sm:p-6 lg:p-8 border-emerald-500/30">
			<h4 className="font-display text-sm font-bold text-foreground uppercase tracking-wide mb-4 flex items-center gap-2">
				<Zap size={14} className="text-emerald-400" />
				Quick Pick Express (5/35) Rolldown
			</h4>

			<div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
				<div className="p-3 sm:p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-center">
					<div className="text-[10px] sm:text-[11px] text-muted-foreground uppercase tracking-wider mb-1">
						60% → Match 4
					</div>
					<div className="font-mono text-sm sm:text-base font-black text-emerald-400">
						~$3,247
					</div>
					<div className="text-[10px] sm:text-[11px] text-muted-foreground/60 mt-0.5">
						Normal: $100 fixed
					</div>
				</div>
				<div className="p-3 sm:p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-center">
					<div className="text-[10px] sm:text-[11px] text-muted-foreground uppercase tracking-wider mb-1">
						40% → Match 3
					</div>
					<div className="font-mono text-sm sm:text-base font-black text-emerald-400">
						~$75
					</div>
					<div className="text-[10px] sm:text-[11px] text-muted-foreground/60 mt-0.5">
						Normal: $4 fixed
					</div>
				</div>
			</div>

			<div className="flex items-center justify-center mb-3">
				<div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/40">
					<TrendingUp size={12} className="text-emerald-400" />
					<span className="font-mono text-[11px] sm:text-[12px] font-bold text-emerald-400">
						Player EV: +66.7% during rolldown!
					</span>
				</div>
			</div>

			<div className="space-y-1.5 text-[11px] sm:text-[12px] text-muted-foreground">
				<p>
					<span className="font-semibold text-muted-foreground">Soft Cap:</span>{" "}
					<span className="font-mono">$30,000</span> &bull;{" "}
					<span className="font-semibold text-muted-foreground">Hard Cap:</span>{" "}
					<span className="font-mono">$50,000</span>
				</p>
				<p>
					Draws every 4 hours. At $1.50/ticket with 1-in-324,632 jackpot odds,
					the smaller pool rolls down much faster — creating more frequent +EV
					windows.
				</p>
			</div>
		</div>
	);
}

function MathCallout({
	title,
	formula,
	result,
	explanation,
}: {
	title: string;
	formula: string;
	result: string;
	explanation: string;
}) {
	return (
		<div className="hud-frame rounded-lg p-4">
			<div className="font-display text-xs font-bold text-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
				<Target size={12} className="text-gold-300" />
				{title}
			</div>
			<div className="terminal-window overflow-x-auto">
				<div className="terminal-titlebar">
					<span className="size-2 rounded-full bg-[#FF3355]/80" />
					<span className="size-2 rounded-full bg-gold-400/80" />
					<span className="size-2 rounded-full bg-emerald-400/80" />
					<span className="ml-2">{"// math"}</span>
				</div>
				<div className="px-3 py-3">
					<div className="font-mono text-xs text-cyan-300 text-center whitespace-nowrap min-w-max">
						{formula}
					</div>
				</div>
			</div>
			<div className="flex items-center justify-center mb-2">
				<span className="font-mono text-sm font-black text-gradient-gold">
					{result}
				</span>
			</div>
			<p className="text-[10px] text-muted-foreground text-center">
				{explanation}
			</p>
		</div>
	);
}

/* -------------------------------------------------------------------------- */
/*  Main Component                                                            */
/* -------------------------------------------------------------------------- */

export default function LearnRolldownPage() {
	return (
		<div className="min-h-screen bg-background">
			{/* ================================================================ */}
			{/*  HERO                                                            */}
			{/* ================================================================ */}
			<section className="relative pt-24 pb-10 sm:pt-28 sm:pb-14 px-4 sm:px-6 lg:px-8 overflow-hidden">
				<div className="absolute inset-0 hero-grid opacity-30" />
				<div className="absolute inset-0 bg-glow-emerald opacity-20" />
				<div className="absolute inset-0 bg-glow-bottom-right opacity-15" />
				<FloatingBalls count={6} className="hidden sm:block" />

				<div className="relative z-10 max-w-7xl mx-auto">
					{/* Breadcrumb */}
					<nav className="flex items-center gap-2 text-xs text-muted-foreground mb-8">
						<Link to="/" className="hover:text-foreground transition-colors">
							Home
						</Link>
						<ChevronRight size={12} />
						<span className="text-muted-foreground">Learn</span>
						<ChevronRight size={12} />
						<span className="text-cyan-300 font-medium">
							How Rolldown Works
						</span>
					</nav>

					<div className="text-center">
						<p className="hud-label mb-3">{"// KNOWLEDGE BASE"}</p>
						<div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-linear-to-br from-emerald-500/20 to-emerald-600/10 border border-emerald-500/30 mb-6 glow-emerald">
							<TrendingUp size={32} className="text-emerald-400" />
						</div>

						<h1 className="font-display text-2xl sm:text-3xl lg:text-4xl font-black tracking-wide uppercase text-foreground mb-4">
							How the <span className="text-gradient-primary">Rolldown</span>{" "}
							Works
						</h1>

						<p className="text-base sm:text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto mb-6">
							The rolldown mechanism is what makes MazelProtocol unique — it
							creates{" "}
							<span className="font-semibold text-emerald-400">
								intentional positive expected value (+EV) windows
							</span>{" "}
							where the math favors players over the house.
						</p>

						<div className="flex flex-wrap items-center justify-center gap-3">
							<div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30">
								<TrendingUp size={12} className="text-emerald-400" />
								<span className="font-mono text-xs font-semibold text-emerald-400">
									6/46: +62% EV during rolldown
								</span>
							</div>
							<div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30">
								<Zap size={12} className="text-emerald-400" />
								<span className="font-mono text-xs font-semibold text-emerald-400">
									5/35: +66.7% EV during rolldown
								</span>
							</div>
							<div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gold-500/10 border border-gold-500/30">
								<Shield size={12} className="text-gold-300" />
								<span className="text-xs font-semibold text-gold-300">
									Your prizes are always guaranteed
								</span>
							</div>
						</div>
					</div>
				</div>
			</section>

			{/* ================================================================ */}
			{/*  CONTENT                                                         */}
			{/* ================================================================ */}
			<section className="relative">
				<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-16">
					{/* -------------------------------------------------------------- */}
					{/*  Section 1: The Big Idea                                       */}
					{/* -------------------------------------------------------------- */}
					<div>
						<SectionHeading
							number="1"
							title="The Big Idea"
							subtitle="Why MazelProtocol is fundamentally different from traditional lotteries"
							icon={Gem}
						/>

						<div className="space-y-4">
							<div className="hud-frame rounded-lg p-4 sm:p-6 lg:p-8">
								<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
									{/* Traditional */}
									<div>
										<h3 className="font-display text-sm font-bold text-magenta-300 uppercase tracking-wide mb-3 flex items-center gap-2">
											<span className="w-2 h-2 rounded-full bg-magenta-400" />
											Traditional Lotteries
										</h3>
										<ul className="space-y-2">
											{[
												"Only ~50% of ticket value is ever returned as prizes",
												"Jackpot rolls forever — you never see that money",
												"Opaque randomness — no way to verify fairness",
												"Fixed prizes that never change",
												"No strategic advantage for smart play",
											].map((item) => (
												<li
													key={item}
													className="flex items-start gap-2 text-xs text-muted-foreground"
												>
													<span className="shrink-0 mt-1 w-1.5 h-1.5 rounded-full bg-magenta-500/40" />
													{item}
												</li>
											))}
										</ul>
									</div>

									{/* MazelProtocol */}
									<div>
										<h3 className="font-display text-sm font-bold text-emerald-400 uppercase tracking-wide mb-3 flex items-center gap-2">
											<span className="w-2 h-2 rounded-full bg-emerald-400" />
											MazelProtocol Rolldown
										</h3>
										<ul className="space-y-2">
											{[
												"Up to +104% EV — more money back than you put in",
												"Jackpot capped — the excess flows straight to players",
												"Match 2 returns your $2.50 as a free ticket",
												"Verifiable randomness (Switchboard TEE)",
												"Timing is rewarded — buy near the cap for maximum return",
											].map((item) => (
												<li
													key={item}
													className="flex items-start gap-2 text-xs text-muted-foreground"
												>
													<CheckCircle
														size={12}
														className="shrink-0 mt-0.5 text-emerald-400"
													/>
													{item}
												</li>
											))}
										</ul>
									</div>
								</div>
							</div>

							<div className="hud-frame rounded-lg p-4 border-emerald-500/30">
								<div className="flex items-start gap-3">
									<div className="p-1.5 rounded-lg bg-emerald-500/10 shrink-0 mt-0.5">
										<Wallet size={14} className="text-emerald-400" />
									</div>
									<div>
										<p className="font-display text-xs font-bold text-emerald-400 uppercase tracking-wide mb-1">
											The Money Difference
										</p>
										<p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
											Traditional lotteries keep roughly half of every
											ticket dollar forever. MazelProtocol returns it —
											during rolldown, players receive up to{" "}
											<span className="font-bold text-emerald-400">
												$2.04 back for every $1 wagered
											</span>
											, on top of Match 2 free tickets and streak
											bonuses. That&apos;s the difference between money that
											disappears and money that comes back to your pocket.
										</p>
									</div>
								</div>
							</div>

							<div className="hud-frame rounded-lg p-4 border-gold-500/30">
								<div className="flex items-start gap-3">
									<div className="p-1.5 rounded-lg bg-gold-500/10 shrink-0 mt-0.5">
										<BookOpen size={14} className="text-gold-300" />
									</div>
									<div>
										<p className="font-display text-xs font-bold text-gold-300 uppercase tracking-wide mb-1">
											Inspired by Real History
										</p>
										<p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
											MazelProtocol&apos;s rolldown mechanism is inspired by the
											Massachusetts Cash WinFall lottery (2004–2012), where
											strategic syndicates discovered that the rolldown created
											consistent +EV opportunities. MazelProtocol makes this
											transparent and <em>intentional</em> — we want players to
											benefit from it.
										</p>
									</div>
								</div>
							</div>
						</div>
					</div>

					{/* -------------------------------------------------------------- */}
					{/*  Section 2: How It Works Step by Step                          */}
					{/* -------------------------------------------------------------- */}
					<div>
						<SectionHeading
							number="2"
							title="How It Works"
							subtitle="Step-by-step walkthrough of the rolldown mechanism"
							icon={Target}
						/>

						<div className="space-y-0">
							<FlowStep
								step="1"
								title="Jackpot Accumulates"
								description="With each draw, 55.6% of ticket revenue is allocated to the jackpot. If no one matches all 6 numbers, the jackpot grows. Daily draws with ~14,000 tickets add approximately $19,500 to the jackpot per draw."
								icon={DollarSign}
							/>
							<FlowStep
								step="2"
								title="Soft Cap Reached ($1.75M)"
								description="When the jackpot reaches the soft cap of $1,750,000, the protocol enters 'rolldown-eligible' mode. A probabilistic trigger determines if this draw will be a rolldown: probability = (jackpot - softCap) / (hardCap - softCap). The closer to the hard cap, the more likely a rolldown."
								icon={Target}
							/>
							<FlowStep
								step="3"
								title="Draw Occurs — No Match 6 Winner"
								description="If the draw happens and no one matches all 6 numbers (1 in 9,366,819 odds), the rolldown is triggered. The entire jackpot becomes the rolldown prize pool, distributed among lower-tier winners using pari-mutuel division."
								icon={Zap}
								highlight
							/>
							<FlowStep
								step="4"
								title="Pari-Mutuel Distribution"
								description="The jackpot is split: 25% to Match 5, 35% to Match 4, and 40% to Match 3 winners. Each tier's prize = (Pool × Share%) ÷ Number of Winners. This means Match 3 winners might get $35 instead of the normal $5 — a 7× increase!"
								icon={Users}
								highlight
							/>
							<FlowStep
								step="5"
								title="Jackpot Resets"
								description="After the rolldown, the jackpot resets to the $500,000 seed amount. The cycle begins again, building towards the next rolldown window. A full cycle typically takes ~15 days."
								icon={Clock}
								isLast
							/>
						</div>
					</div>

					{/* -------------------------------------------------------------- */}
					{/*  Section 3: Visual Diagram                                     */}
					{/* -------------------------------------------------------------- */}
					<div>
						<SectionHeading
							number="3"
							title="Prize Distribution"
							subtitle="Visual breakdown of how the jackpot flows to winners during rolldown"
							icon={BarChart3}
						/>

						<VisualDiagram />

						<div className="mt-6">
							<QuickPickExpressDiagram />
						</div>
					</div>

					{/* -------------------------------------------------------------- */}
					{/*  Section 4: The Math                                           */}
					{/* -------------------------------------------------------------- */}
					<div>
						<SectionHeading
							number="4"
							title="The Math Behind +EV"
							subtitle="Understanding expected value and why rolldown creates player edge"
							icon={Target}
						/>

						<div className="space-y-4">
							{/* EV Comparison */}
							<div className="hud-frame rounded-lg p-4 sm:p-6 lg:p-8">
								<h3 className="font-display text-sm font-bold text-foreground uppercase tracking-wide mb-5 flex items-center gap-2">
									<BarChart3 size={14} className="text-cyan-300" />
									Expected Value Comparison
								</h3>

								<div className="space-y-4">
									<EVBar
										label="Traditional Lottery (e.g. Powerball)"
										ev={-50}
										maxEv={110}
										isPositive={false}
									/>
									<EVBar
										label="MazelProtocol Average (including +EV windows)"
										ev={18}
										maxEv={110}
										isPositive={true}
									/>
									<EVBar
										label="MazelProtocol Rolldown Mode (6/46)"
										ev={104}
										maxEv={110}
										isPositive={true}
									/>
									<EVBar
										label="Quick Pick Express Rolldown (5/35)"
										ev={66.7}
										maxEv={110}
										isPositive={true}
									/>
								</div>

								<div className="mt-5 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
									<p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
										<span className="font-bold text-emerald-400">
											Traditional lotteries NEVER offer +EV.
										</span>{" "}
										Powerball and Mega Millions keep roughly half of every dollar
										forever, with no mechanism to return it to players.
										MazelProtocol creates predictable +EV windows where the math
										shifts in your favor. During a 6/46 rolldown, the average
										return is up to $2.04 per dollar wagered — an unprecedented
										+104% edge that no traditional lottery can match.
									</p>
								</div>
							</div>

							{/* Math formulas */}
							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								<MathCallout
									title="Rolldown EV (6/46)"
									formula="EV = Σ(P(match) × PoolShare/Winners) - $2.50"
									result="+$2.60 per ticket (+104%)"
									explanation="During rolldown, expected return far exceeds ticket cost. Players have up to a +104% mathematical edge — unprecedented in lottery design."
								/>
								<MathCallout
									title="Average EV Across All Draws (6/46)"
									formula="EV = Weighted Avg(Normal EV, Rolldown EV)"
									result="+18% overall"
									explanation="Even averaging across normal and rolldown draws, MazelProtocol maintains a positive expected value. Traditional lotteries never return their accumulated jackpots to players at all."
								/>
							</div>

							{/* Break-even analysis */}
							<div className="hud-frame rounded-lg p-4 sm:p-6 lg:p-8">
								<h4 className="font-display text-sm font-bold text-foreground uppercase tracking-wide mb-4 flex items-center gap-2">
									<DollarSign size={14} className="text-gold-300" />
									Break-Even Point
								</h4>
								<div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
									<div className="text-center p-3 sm:p-4 rounded-xl bg-cyan-500/5 border border-cyan-500/10">
										<div className="font-mono text-base sm:text-lg font-black text-gold-300 tabular-nums">
											$1.75M
										</div>
										<div className="text-[11px] sm:text-[12px] text-muted-foreground uppercase tracking-wider mt-0.5">
											6/46 Soft Cap
										</div>
										<div className="text-[10px] text-muted-foreground/60 mt-0.5">
											Rolldown eligible
										</div>
									</div>
									<div className="text-center p-3 sm:p-4 rounded-xl bg-cyan-500/5 border border-cyan-500/10">
										<div className="font-mono text-base sm:text-lg font-black text-gold-300 tabular-nums">
											$2.25M
										</div>
										<div className="text-[11px] sm:text-[12px] text-muted-foreground uppercase tracking-wider mt-0.5">
											6/46 Hard Cap
										</div>
										<div className="text-[10px] text-muted-foreground/60 mt-0.5">
											Forced rolldown
										</div>
									</div>
									<div className="text-center p-3 sm:p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
										<div className="font-mono text-lg font-black text-emerald-400 tabular-nums">
											~15 days
										</div>
										<div className="text-[11px] sm:text-[12px] text-muted-foreground uppercase tracking-wider mt-0.5">
											Avg Cycle Length
										</div>
										<div className="text-[10px] text-muted-foreground/60 mt-0.5">
											From seed to rolldown
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>

					{/* -------------------------------------------------------------- */}
					{/*  Section 5: Normal vs Rolldown Comparison                      */}
					{/* -------------------------------------------------------------- */}
					<div>
						<SectionHeading
							number="5"
							title="Prize Comparison"
							subtitle="See exactly how much more you can win during rolldown events"
							icon={Trophy}
						/>

						<div className="hud-frame rounded-lg p-4 sm:p-6 lg:p-8">
							<h3 className="font-display text-sm font-bold text-foreground uppercase tracking-wide mb-4">
								6/46 Main Lottery Prizes
							</h3>

							{/* Table header */}
							<div className="grid grid-cols-3 gap-2 sm:gap-3 pb-2 border-b border-foreground/6">
								<div className="text-[10px] sm:text-[11px] text-muted-foreground uppercase tracking-wider font-semibold truncate">
									Tier
								</div>
								<div className="text-[10px] sm:text-[11px] text-muted-foreground uppercase tracking-wider font-semibold text-center truncate">
									Normal (Fixed)
								</div>
								<div className="text-[10px] sm:text-[11px] text-emerald-400/80 uppercase tracking-wider font-semibold text-center truncate">
									Rolldown (Pari-Mutuel)
								</div>
							</div>

							<ComparisonRow
								label="Match 6 (Jackpot)"
								normal="$500K–$2.25M"
								rolldown="No winner → pool flows down"
							/>
							<ComparisonRow
								label="Match 5"
								normal="$4,000"
								rolldown="~$21,875"
								rolldownHighlight
							/>
							<ComparisonRow
								label="Match 4"
								normal="$150"
								rolldown="~$510"
								rolldownHighlight
							/>
							<ComparisonRow
								label="Match 3"
								normal="$5"
								rolldown="~$35"
								rolldownHighlight
							/>
							<ComparisonRow
								label="Match 2"
								normal="Free Ticket"
								rolldown="Free Ticket"
							/>

							<div className="mt-4 flex items-start gap-2 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
								<Sparkles
									size={12}
									className="text-emerald-400 mt-0.5 shrink-0"
								/>
								<p className="text-[10px] text-muted-foreground leading-relaxed">
									<span className="font-bold text-emerald-400">
										Match 5 rolldown prize is ~5.5× normal.
									</span>{" "}
									Match 4 is ~3.4×. Match 3 is ~7×. The largest group of winners
									(Match 3 at 1:47 odds) gets 40% of the pool, making the
									rolldown valuable even for common outcomes. This is
									intentional — we want the benefit to reach the widest number
									of players.
								</p>
							</div>
						</div>
					</div>

					{/* -------------------------------------------------------------- */}
					{/*  Section 6: Strategy Guide                                     */}
					{/* -------------------------------------------------------------- */}
					<div>
						<SectionHeading
							number="6"
							title="Strategic Play"
							subtitle="How to maximize your edge during rolldown windows"
							icon={Star}
						/>

						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							{[
								{
									title: "Monitor the Jackpot",
									description:
										"Watch the jackpot tracker on the Dashboard. When it approaches the $1.75M soft cap, a rolldown becomes increasingly likely. The probability meter shows you the exact trigger chance.",
									icon: Eye,
									tip: "Bookmark the Dashboard for daily checks",
								},
								{
									title: "Buy More During Rolldown",
									description:
										"When the rolldown is active, every ticket has positive expected value. Strategic players increase their ticket purchases during these windows. Even Match 3 (1:47 odds) pays ~$35 instead of $5.",
									icon: TrendingUp,
									tip: "Use bulk buy (up to 20 tickets) for max coverage",
								},
								{
									title: "Join a Syndicate",
									description:
										"Pool resources with other players to buy more tickets. During rolldown, a syndicate's combined buying power means more winners and more prizes distributed among members.",
									icon: Users,
									tip: "Syndicates are most effective during rolldown",
								},
								{
									title: "Use Quick Pick Express",
									description:
										"With draws every 4 hours and a $30K soft cap, Quick Pick Express reaches rolldown faster. Its +66.7% EV (at the $50K hard cap) is even higher than the main lottery's +104% (at the $2.25M hard cap). At $1.50/ticket, it's low-cost, high-frequency.",
									icon: Zap,
									tip: "Requires $50 lifetime spend in main lottery",
								},
							].map((item) => {
								const Icon = item.icon;
								return (
									<div
										key={item.title}
										className="hud-frame rounded-lg p-4 sm:p-6 lg:p-8"
									>
										<div className="flex items-center gap-2 mb-2">
											<div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
												<Icon size={14} className="text-emerald-400" />
											</div>
											<h3 className="font-display text-sm font-bold text-foreground uppercase tracking-wide">
												{item.title}
											</h3>
										</div>
										<p className="text-sm sm:text-base text-muted-foreground leading-relaxed mb-3">
											{item.description}
										</p>
										<div className="flex items-center gap-1.5 text-[10px] text-gold-300/80">
											<Star size={9} className="text-gold-300" />
											<span className="font-semibold">Tip:</span>{" "}
											<span>{item.tip}</span>
										</div>
									</div>
								);
							})}
						</div>

						<div className="mt-4 hud-frame rounded-lg p-4 border-gold-500/30">
							<div className="flex items-start gap-3">
								<div className="p-1.5 rounded-lg bg-gold-500/10 shrink-0 mt-0.5">
									<CheckCircle size={14} className="text-emerald-400" />
								</div>
								<div>
									<p className="font-display text-xs font-bold text-emerald-400 uppercase tracking-wide mb-1">
										Play Smart, Win Bigger
									</p>
									<p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
										MazelProtocol is built on transparency and mathematical
										design — not blind luck. Unlike traditional lotteries that
										guarantee the house always wins, our rolldown mechanism
										creates predictable windows where the odds shift in your
										favor. Every draw is verifiable on-chain, every prize pool
										is visible, and every +EV window is broadcast well in
										advance. That&apos;s the edge traditional lotteries
										can&apos;t give you — and it&apos;s available to every
										player.
									</p>
								</div>
							</div>
						</div>
					</div>

					{/* -------------------------------------------------------------- */}
					{/*  Section 7: Why Your Odds Are Better                           */}
					{/* -------------------------------------------------------------- */}
					<div>
						<SectionHeading
							number="7"
							title="Why Your Odds Are Better Here"
							subtitle="How the rolldown gives you a real mathematical edge over every other lottery"
							icon={TrendingUp}
						/>

						<div className="hud-frame rounded-lg p-4 sm:p-6 lg:p-8 space-y-5">
							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								<div>
									<h4 className="font-display text-xs font-bold text-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
										<TrendingUp size={11} className="text-emerald-400" />
										The Rolldown Is Your Edge
									</h4>
									<p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
										Every other lottery keeps the unclaimed jackpot and rolls it
										forward forever — you never see that money. MazelProtocol{" "}
										<strong>
											caps the jackpot and forces it back to players
										</strong>
										. When no one hits the top prize, the entire pool flows down
										to lower tiers. Your Match 3 ticket that normally pays $5
										can suddenly pay{" "}
										<span className="font-mono text-emerald-400 font-semibold">
											$225
										</span>
										.
									</p>
								</div>
								<div>
									<h4 className="font-display text-xs font-bold text-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
										<DollarSign size={11} className="text-gold-300" />
										Pari-Mutuel = Fewer Winners, Bigger Prizes
									</h4>
									<p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
										During rolldown, prizes are <strong>pari-mutuel</strong>{" "}
										(Pool ÷ Winners). This means{" "}
										<span className="text-gold-300 font-semibold">
											the fewer people who play, the more each winner gets
										</span>
										. Time your purchases when you spot a rolldown window
										forming and you&apos;re splitting a massive pool with fewer
										players. That&apos;s the favorable distribution mechanism.
									</p>
								</div>
							</div>

							{/* Odds comparison with other lotteries */}
							<div>
								<h4 className="font-display text-xs font-bold text-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
									<Target size={11} className="text-emerald-400" />
									Your Odds vs Other Lotteries
								</h4>
								<div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
									{[
										{
											name: "Powerball",
											odds: "1 in 292M",
											ev: "-50%",
											color: "text-magenta-300",
										},
										{
											name: "Mega Millions",
											odds: "1 in 302M",
											ev: "-55%",
											color: "text-magenta-300",
										},
										{
											name: "EuroMillions",
											odds: "1 in 139M",
											ev: "-50%",
											color: "text-magenta-300",
										},
										{
											name: "MazelProtocol",
											odds: "1 in 9.37M",
											ev: "+62%",
											color: "text-emerald-400",
										},
									].map((lottery) => (
										<div
											key={lottery.name}
											className={`p-2.5 rounded-lg text-center ${
												lottery.name === "MazelProtocol"
													? "bg-emerald-500/10 border border-emerald-500/40"
													: "bg-cyan-500/5 border border-cyan-500/10"
											}`}
										>
											<div className="text-[10px] text-muted-foreground mb-0.5">
												{lottery.name}
											</div>
											<div className="font-mono text-[10px] text-muted-foreground">
												{lottery.odds}
											</div>
											<div
												className={`font-mono text-sm font-black mt-0.5 ${lottery.color}`}
											>
												{lottery.ev} EV
											</div>
										</div>
									))}
								</div>
							</div>

							{/* Why this matters for YOU */}
							<div>
								<h4 className="font-display text-xs font-bold text-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
									<Sparkles size={11} className="text-gold-300" />
									What This Means For You
								</h4>
								<div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
									<div className="p-3 sm:p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
										<div className="font-mono text-base sm:text-lg font-black text-emerald-400">
											31× Better
										</div>
										<div className="text-[11px] sm:text-[12px] text-muted-foreground mt-0.5">
											Jackpot Odds vs Powerball
										</div>
										<div className="font-mono text-[9px] text-muted-foreground/60 mt-0.5">
											1:9.37M vs 1:292M
										</div>
									</div>
									<div className="p-3 sm:p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
										<div className="font-mono text-base sm:text-lg font-black text-emerald-400">
											1 in 47
										</div>
										<div className="text-[11px] sm:text-[12px] text-muted-foreground mt-0.5">
											Match 3 Odds
										</div>
										<div className="text-[9px] text-muted-foreground/60 mt-0.5">
											Pays ~$225 during rolldown
										</div>
									</div>
									<div className="p-3 rounded-xl bg-gold-500/10 border border-gold-500/30">
										<div className="font-mono text-sm font-black text-gold-300">
											~15 Days
										</div>
										<div className="text-[11px] sm:text-[12px] text-muted-foreground mt-0.5">
											Average Rolldown Cycle
										</div>
										<div className="text-[9px] text-muted-foreground/60 mt-0.5">
											Regular +EV windows to take advantage of
										</div>
									</div>
								</div>
							</div>

							<div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
								<p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
									<span className="font-bold text-emerald-400">
										The rolldown is designed for you to benefit from.
									</span>{" "}
									Every ~15 days, the jackpot caps and the entire pool
									redistributes to lower-tier winners. Smart players monitor the
									jackpot tracker, increase their ticket purchases when the soft
									cap approaches, and let the math work in their favor. Your
									prizes are always backed by on-chain reserves — 5% of every
									ticket goes to reserve and insurance funds that guarantee
									payouts.
								</p>
							</div>
						</div>
					</div>

					{/* -------------------------------------------------------------- */}
					{/*  Section 8: FAQ                                                */}
					{/* -------------------------------------------------------------- */}
					<div>
						<SectionHeading
							number="8"
							title="Frequently Asked Questions"
							subtitle="Common questions about the rolldown mechanism"
							icon={BookOpen}
						/>

						<div className="space-y-3">
							{[
								{
									q: "What happens if someone wins the jackpot during a rolldown-eligible draw?",
									a: "If a player matches all 6 numbers (or all 5 in Quick Pick Express), they win the full jackpot at its current amount — there is no rolldown. The rolldown only triggers when the top prize goes unclaimed. The jackpot then resets to the seed amount and the cycle begins again.",
								},
								{
									q: "Can anyone prevent or delay the rolldown?",
									a: "No. Rolldowns are triggered automatically by the smart contract based on on-chain jackpot balance and verifiable randomness. Nobody can interfere with, delay, or manipulate the rolldown. The code is open, the logic is transparent, and every draw is verifiable on-chain.",
								},
								{
									q: "When should I buy tickets for maximum advantage?",
									a: "Watch the jackpot tracker on the Dashboard. When it approaches the $1.75M soft cap, rolldown probability increases linearly. At the $2.25M hard cap, a rolldown is guaranteed. The closer to the hard cap, the better your expected value. Strategic players load up on tickets during these windows.",
								},
								{
									q: "Does the +EV guarantee I'll make money?",
									a: "Positive EV is a statistical edge over many plays — not a guarantee on any single ticket. But consider this: traditional lotteries return only about half of ticket value as prizes, and their jackpots never come back. During rolldown, MazelProtocol has +62% EV at the $1.75M soft cap, rising to +104% at the $2.25M hard cap, because the accumulated jackpot is distributed back to players. Over time, that mathematical edge compounds in your favor. It's the same principle strategic investors use — maximizing opportunities when conditions favor you.",
								},
								{
									q: "Why are the odds so much better than Powerball or Mega Millions?",
									a: "MazelProtocol uses a 6/46 matrix (1 in 9.37 million for the jackpot) versus Powerball's 5/69+1/26 (1 in 292 million). That's 31× better odds. And during rolldown, even matching just 3 numbers (1 in 47 odds) pays ~$69 at the soft cap instead of the fixed $5. No traditional lottery offers anything close to this.",
								},
								{
									q: "How does pari-mutuel pricing benefit me?",
									a: "During rolldown, prizes are Pool ÷ Winners. Fewer players in a draw means each winner gets a bigger share of the jackpot. If you time your purchases when fewer people are buying — say, a rolldown that triggers mid-week — you're splitting a massive pool with fewer competitors. That's how you maximize your edge.",
								},
								{
									q: "How long between rolldown windows?",
									a: "At average volumes (~14,000 tickets/day for 6/46), the jackpot grows from the $500K seed to the $1.75M soft cap in roughly 15 days. Quick Pick Express cycles are much faster due to the smaller $30K soft cap and 4-hour draw frequency — you get rolldown opportunities multiple times per week.",
								},
								{
									q: "How do I know the draws are fair?",
									a: "MazelProtocol uses Switchboard's Trusted Execution Environment (TEE) randomness with a commit-reveal pattern. The randomness is committed before ticket purchases close, then revealed to execute the draw. Everything is on-chain and verifiable. You can audit every single draw yourself.",
								},
							].map((faq) => (
								<div
									key={faq.q}
									className="hud-frame rounded-lg p-4 sm:p-6 lg:p-8"
								>
									<h3 className="font-display text-xs font-bold text-foreground uppercase tracking-wide mb-2">
										{faq.q}
									</h3>
									<p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
										{faq.a}
									</p>
								</div>
							))}
						</div>
					</div>

					{/* -------------------------------------------------------------- */}
					{/*  CTA                                                           */}
					{/* -------------------------------------------------------------- */}
					<div className="relative hud-frame rounded-lg p-8 sm:p-12 text-center overflow-hidden">
						<div className="absolute inset-0 bg-glow-emerald opacity-15" />
						<div className="absolute inset-0 bg-glow-gold opacity-10" />

						<div className="relative z-10">
							<div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-linear-to-br from-emerald-500/20 to-gold-500/10 border border-emerald-500/30 mb-5 glow-emerald">
								<Trophy size={24} className="text-emerald-400" />
							</div>

							<h2 className="font-display text-2xl sm:text-3xl font-black text-foreground uppercase tracking-wide mb-3">
								Ready to Play{" "}
								<span className="text-gradient-primary">Smart</span>?
							</h2>
							<p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
								Monitor the jackpot, time your purchases during rolldown
								windows, and let the math work in your favor.
							</p>

							<div className="flex flex-col sm:flex-row gap-3 justify-center">
								<Link
									to="/play"
									className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 text-sm font-bold text-black bg-linear-to-b from-emerald-400 to-emerald-600 hover:from-emerald-300 hover:to-emerald-500 rounded-xl transition-all duration-300 shadow-xl shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:scale-[1.02] active:scale-[0.98]"
								>
									<Trophy size={16} />
									Play 6/46 Lottery
								</Link>
								<Link
									to="/play/quick-pick"
									className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 text-sm font-bold text-emerald-400 bg-transparent border-2 border-emerald-500/40 hover:border-emerald-400/60 hover:bg-emerald-500/10 rounded-xl transition-all duration-300"
								>
									<Zap size={16} />
									Quick Pick Express
								</Link>
								<Link
									to="/dashboard"
									className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 text-sm font-semibold text-muted-foreground bg-transparent border border-cyan-500/20 hover:border-cyan-400/40 hover:bg-cyan-500/10 rounded-xl transition-all duration-300"
								>
									<BarChart3 size={16} />
									Monitor Rolldown
								</Link>
							</div>
						</div>
					</div>
				</div>
			</section>
		</div>
	);
}
