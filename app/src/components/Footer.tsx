import {
	BookOpen,
	ExternalLink,
	Github,
	MessageCircle,
	Trophy,
	Twitter,
	Users,
	Zap,
} from "lucide-react";
import { Link } from "react-router-dom";

const footerSections = [
	{
		title: "Play",
		links: [
			{ to: "/play", label: "6/46 Main Lottery", icon: Trophy },
			{ to: "/play/quick-pick", label: "Quick Pick Express", icon: Zap },
			{ to: "/syndicates", label: "Syndicates", icon: Users },
		],
	},
	{
		title: "Learn",
		links: [
			{ to: "/results", label: "Draw Results", icon: BookOpen },
			{
				to: "/learn/rolldown",
				label: "How Rolldown Works",
				icon: Zap,
			},
			{
				to: "/learn/whitepaper",
				label: "Whitepaper",
				icon: BookOpen,
			},
		],
	},
	{
		title: "Community",
		links: [
			{
				href: "https://x.com/mazelprotocol",
				label: "Twitter / X",
				icon: Twitter,
			},
			{
				href: "https://discord.gg/mazelprotocol",
				label: "Discord",
				icon: MessageCircle,
			},
			{
				href: "https://github.com/mazelprotocol",
				label: "GitHub",
				icon: Github,
			},
		],
	},
];

function FooterLogoMark() {
	return (
		<div className="relative w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center bg-linear-to-br from-cyan-400 via-violet-500 to-magenta-500 shadow-lg shadow-cyan-500/30">
			<svg
				viewBox="0 0 32 32"
				className="w-6 h-6"
				fill="none"
				stroke="#04050D"
				strokeWidth="2.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			>
				<title>MazelProtocol</title>
				<circle cx="16" cy="16" r="10" />
				<path d="M16 6v20" />
				<path d="M6 16h20" />
				<circle
					cx="16"
					cy="16"
					r="4"
					fill="#04050D"
					fillOpacity="0.25"
					stroke="none"
				/>
			</svg>
			<div className="absolute inset-0 bg-linear-to-tr from-transparent via-white/10 to-white/20 pointer-events-none" />
		</div>
	);
}

export default function Footer() {
	const currentYear = new Date().getFullYear();

	return (
		<footer className="relative bg-surface-0 border-t border-border">
			{/* Top gradient line */}
			<div className="section-divider" />

			{/* Cyber grid backdrop */}
			<div className="pointer-events-none absolute inset-0 hero-grid opacity-40" />

			<div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
				{/* Main footer content */}
				<div className="py-12 lg:py-16 grid grid-cols-2 md:grid-cols-4 gap-10 lg:gap-16">
					{/* Brand column */}
					<div className="col-span-2 md:col-span-1">
						<Link to="/" className="flex items-center gap-3 group mb-4">
							<FooterLogoMark />
							<div className="flex flex-col">
								<span className="text-lg font-bold text-foreground tracking-wide leading-none group-hover:text-cyan-300 transition-colors font-display">
									MazelProtocol
								</span>
								<span className="hud-label mt-1">Provably Fair</span>
							</div>
						</Link>
						<p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
							A provably fair lottery protocol on Solana. Transparent rolldown
							mechanics with publicly verifiable randomness.
						</p>

						{/* Social icons */}
						<div className="flex items-center gap-3 mt-5">
							<a
								href="https://x.com/mazelprotocol"
								target="_blank"
								rel="noopener noreferrer"
								className="p-2 rounded-lg text-muted-foreground hover:text-cyan-300 hover:bg-cyan-500/10 transition-colors"
								aria-label="Twitter"
							>
								<Twitter size={18} />
							</a>
							<a
								href="https://discord.gg/mazelprotocol"
								target="_blank"
								rel="noopener noreferrer"
								className="p-2 rounded-lg text-muted-foreground hover:text-magenta-300 hover:bg-magenta-500/10 transition-colors"
								aria-label="Discord"
							>
								<MessageCircle size={18} />
							</a>
							<a
								href="https://github.com/mazelprotocol"
								target="_blank"
								rel="noopener noreferrer"
								className="p-2 rounded-lg text-muted-foreground hover:text-gold-300 hover:bg-gold-500/10 transition-colors"
								aria-label="GitHub"
							>
								<Github size={18} />
							</a>
						</div>
					</div>

					{/* Link columns */}
					{footerSections.map((section) => (
						<div key={section.title}>
							<h4 className="hud-label mb-4">{section.title}</h4>
							<ul className="space-y-2.5">
								{section.links.map((link) => {
									const Icon = link.icon;

									if ("href" in link && link.href) {
										return (
											<li key={link.label}>
												<a
													href={link.href}
													target="_blank"
													rel="noopener noreferrer"
													className="flex items-center gap-2 text-sm text-muted-foreground hover:text-cyan-300 transition-colors group"
												>
													<Icon
														size={14}
														className="opacity-50 group-hover:opacity-80 transition-opacity"
													/>
													<span>{link.label}</span>
													<ExternalLink
														size={10}
														className="opacity-30 ml-auto"
													/>
												</a>
											</li>
										);
									}

									return (
										<li key={link.label}>
											<Link
												to={(link as { to: string }).to}
												className="flex items-center gap-2 text-sm text-muted-foreground hover:text-cyan-300 transition-colors group"
											>
												<Icon
													size={14}
													className="opacity-50 group-hover:opacity-80 transition-opacity"
												/>
												<span>{link.label}</span>
											</Link>
										</li>
									);
								})}
							</ul>
						</div>
					))}
				</div>

				{/* Badges row */}
				<div className="py-6 border-t border-border flex flex-wrap items-center justify-center gap-6">
					<div className="flex items-center gap-2 text-xs text-muted-foreground">
						<div className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(0,229,255,0.9)]" />
						<span>Built on Solana</span>
					</div>
					<div className="flex items-center gap-2 text-xs text-muted-foreground">
						<div className="w-2 h-2 rounded-full bg-magenta-400 shadow-[0_0_8px_rgba(255,46,196,0.9)]" />
						<span>Provably Fair (Switchboard VRF)</span>
					</div>
					<div className="flex items-center gap-2 text-xs text-muted-foreground">
						<div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(0,255,159,0.9)]" />
						<span>Non-custodial</span>
					</div>
					<div className="flex items-center gap-2 text-xs text-muted-foreground">
						<div className="w-2 h-2 rounded-full bg-gold-400 shadow-[0_0_8px_rgba(255,214,10,0.9)]" />
						<span>Fully Transparent On-chain</span>
					</div>
				</div>

				{/* Bottom bar */}
				<div className="py-5 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3">
					<p className="font-mono text-xs text-muted-foreground/60">
						&copy; {currentYear} MazelProtocol. All rights reserved.
					</p>
					<div className="flex items-center gap-4 text-xs text-muted-foreground/60">
						<Link
							to="/learn/whitepaper"
							className="hover:text-cyan-300 transition-colors"
						>
							Whitepaper
						</Link>
						<Link
							to="/learn/rolldown"
							className="hover:text-cyan-300 transition-colors"
						>
							How Rolldown Works
						</Link>
						<Link
							to="/results"
							className="hover:text-cyan-300 transition-colors"
						>
							Draw Results
						</Link>
						<a
							href="https://discord.gg/mazelprotocol"
							target="_blank"
							rel="noopener noreferrer"
							className="hover:text-cyan-300 transition-colors inline-flex items-center gap-1"
						>
							<MessageCircle size={10} />
							Discord
						</a>
					</div>
				</div>
			</div>
		</footer>
	);
}
