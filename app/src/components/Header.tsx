import {
	BarChart3,
	BookOpen,
	Check,
	ChevronDown,
	Coins,
	Copy,
	ExternalLink,
	Gem,
	Loader2,
	LogOut,
	Menu,
	Ticket,
	Trophy,
	Users,
	Wallet,
	X,
	Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { ThemeToggleCompact } from "@/components/ThemeToggle";
import { useLotteryState } from "@/hooks/use-lottery-state";
import {
	useAppKit,
	useAppKitAccount,
	useDisconnect,
} from "@/lib/appkit-provider";

const navLinks = [
	{
		label: "Play",
		icon: Trophy,
		children: [
			{
				to: "/play",
				label: "6/46 Main Lottery",
				description: "Daily draws with rolldown mechanics",
				icon: Trophy,
			},
			{
				to: "/play/quick-pick",
				label: "Quick Pick Express",
				description: "5/35 mini-lottery every 4 hours",
				icon: Zap,
			},
		],
	},
	{
		label: "Dashboard",
		icon: Trophy,
		children: [
			{
				to: "/dashboard",
				label: "Dashboard",
				description: "View your account details",
				icon: Trophy,
			},
			{
				to: "/lp",
				label: "LP Pool",
				description: "Deposit USDC, earn house fee rewards",
				icon: Coins,
			},
		],
	},
	{
		to: "/syndicates",
		label: "Syndicates",
		icon: Users,
	},
	{
		to: "/results",
		label: "Results",
		icon: BarChart3,
	},
	{
		to: "/tickets",
		label: "My Tickets",
		icon: Ticket,
	},
	{
		label: "Learn",
		icon: BookOpen,
		children: [
			{
				to: "/learn/rolldown",
				label: "How Rolldown Works",
				description: "The math behind positive-EV windows",
				icon: Zap,
			},
			{
				to: "/learn/whitepaper",
				label: "Whitepaper",
				description: "Full protocol specification",
				icon: BookOpen,
			},
			{
				href: "https://github.com/mazelprotocol",
				label: "GitHub",
				description: "Open-source smart contracts",
				icon: Gem,
			},
		],
	},
];

function LogoMark() {
	return (
		<div className="relative w-9 h-9 rounded-lg overflow-hidden flex items-center justify-center bg-linear-to-br from-cyan-400 via-violet-500 to-magenta-500 shadow-lg shadow-cyan-500/30 group-hover:shadow-cyan-400/50 transition-shadow">
			<svg
				viewBox="0 0 32 32"
				className="w-5 h-5"
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

interface DropdownProps {
	label: string;
	icon: React.ComponentType<{ className?: string; size?: number }>;
	items: Array<{
		to?: string;
		href?: string;
		label: string;
		description?: string;
		icon: React.ComponentType<{ className?: string; size?: number }>;
	}>;
}

function DesktopDropdown({ label, icon: Icon, items }: DropdownProps) {
	const [open, setOpen] = useState(false);

	// Close with Escape anywhere while the menu is open.
	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setOpen(false);
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [open]);

	return (
		<nav
			className="relative"
			onMouseEnter={() => setOpen(true)}
			onMouseLeave={() => setOpen(false)}
		>
			<button
				type="button"
				className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold tracking-wide text-muted-foreground hover:text-cyan-300 transition-colors rounded-lg hover:bg-cyan-500/10"
				onClick={() => setOpen(!open)}
				aria-haspopup="menu"
				aria-expanded={open}
			>
				<Icon size={16} className="opacity-70" />
				<span>{label}</span>
				<ChevronDown
					size={14}
					className={`opacity-50 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
				/>
			</button>

			{open && (
				<div className="absolute top-full left-0 pt-2 z-50">
					<div className="w-72 rounded-xl glass-strong p-2 shadow-2xl shadow-black/40 border border-cyan-500/15 animate-slide-down hud-frame">
						{items.map((child) => {
							const ChildIcon = child.icon;
							const isExternal = !!child.href;

							if (isExternal) {
								return (
									<a
										key={child.label}
										href={child.href}
										target="_blank"
										rel="noopener noreferrer"
										className="flex items-start gap-3 p-3 rounded-lg hover:bg-cyan-500/10 transition-colors group"
										onClick={() => setOpen(false)}
									>
										<div className="mt-0.5 p-1.5 rounded-md bg-cyan-500/10 text-cyan-300 group-hover:bg-cyan-500/20 transition-colors">
											<ChildIcon size={16} />
										</div>
										<div>
											<div className="text-sm font-medium text-foreground flex items-center gap-1.5">
												{child.label}
												<ExternalLink size={11} className="opacity-40" />
											</div>
											{child.description && (
												<div className="text-xs text-muted-foreground mt-0.5">
													{child.description}
												</div>
											)}
										</div>
									</a>
								);
							}

							return (
								<Link
									key={child.label}
									to={child.to as string}
									className="flex items-start gap-3 p-3 rounded-lg hover:bg-cyan-500/10 transition-colors group"
									onClick={() => setOpen(false)}
								>
									<div className="mt-0.5 p-1.5 rounded-md bg-cyan-500/10 text-cyan-300 group-hover:bg-cyan-500/20 transition-colors">
										<ChildIcon size={16} />
									</div>
									<div>
										<div className="text-sm font-medium text-foreground">
											{child.label}
										</div>
										{child.description && (
											<div className="text-xs text-muted-foreground mt-0.5">
												{child.description}
											</div>
										)}
									</div>
								</Link>
							);
						})}
					</div>
				</div>
			)}
		</nav>
	);
}

function WalletButton() {
	const { open, ready, requested } = useAppKit();
	const { address, isConnected } = useAppKitAccount();
	const { disconnect } = useDisconnect();
	const [copied, setCopied] = useState(false);
	const [showDropdown, setShowDropdown] = useState(false);

	const truncatedAddress = address
		? `${address.slice(0, 6)}...${address.slice(-4)}`
		: "";

	const handleCopy = () => {
		if (address) {
			navigator.clipboard.writeText(address);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		}
	};

	// Close the dropdown with Escape (the invisible overlay button is not
	// focusable, so a document-level listener is required).
	useEffect(() => {
		if (!showDropdown) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setShowDropdown(false);
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [showDropdown]);

	if (isConnected && address) {
		return (
			<div className="relative">
				<button
					type="button"
					onClick={() => setShowDropdown((p) => !p)}
					aria-haspopup="menu"
					aria-expanded={showDropdown}
					className="flex items-center gap-2 px-3.5 py-2 text-sm font-semibold text-cyan-300 bg-cyan-500/8 border border-cyan-500/25 hover:border-cyan-400/50 rounded-lg transition-all duration-200 shadow-[0_0_14px_rgba(0,229,255,0.12)]"
				>
					<div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(0,255,159,0.9)]" />
					<span className="font-mono text-xs">{truncatedAddress}</span>
					<ChevronDown
						size={14}
						className={`opacity-60 transition-transform duration-200 ${showDropdown ? "rotate-180" : ""}`}
					/>
				</button>

				{showDropdown && (
					<>
						<button
							type="button"
							className="fixed inset-0 z-40 bg-transparent border-none cursor-default"
							tabIndex={-1}
							onClick={() => setShowDropdown(false)}
							onKeyDown={(e) => {
								if (e.key === "Escape") setShowDropdown(false);
							}}
							aria-label="Close dropdown"
						/>
						<div className="absolute right-0 mt-2 w-56 z-50 rounded-xl glass-strong border border-gold-500/10 shadow-xl shadow-black/40 p-2 space-y-1">
							<button
								type="button"
								onClick={handleCopy}
								className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-cyan-500/10 rounded-lg transition-colors"
							>
								{copied ? (
									<Check size={14} className="text-emerald-500" />
								) : (
									<Copy size={14} className="opacity-60" />
								)}
								<span>{copied ? "Copied!" : "Copy Address"}</span>
							</button>
							<button
								type="button"
								onClick={() => {
									open({ view: "Account" });
									setShowDropdown(false);
								}}
								className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-cyan-500/10 rounded-lg transition-colors"
							>
								<Wallet size={14} className="opacity-60" />
								<span>Wallet Details</span>
							</button>
							<div className="h-px bg-border my-1" />
							<button
								type="button"
								onClick={() => {
									disconnect();
									setShowDropdown(false);
								}}
								className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/5 rounded-lg transition-colors"
							>
								<LogOut size={14} />
								<span>Disconnect</span>
							</button>
						</div>
					</>
				)}
			</div>
		);
	}

	const preparing = !ready && requested;

	return (
		<button
			type="button"
			onClick={() => open({ view: "Connect", namespace: "solana" })}
			disabled={preparing}
			className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold tracking-wide text-primary-foreground bg-linear-to-b from-cyan-300 to-cyan-600 hover:from-cyan-200 hover:to-cyan-500 rounded-lg transition-all duration-300 shadow-lg shadow-cyan-500/30 hover:shadow-cyan-400/50 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 disabled:pointer-events-none"
		>
			{preparing ? (
				<>
					<Loader2 size={16} className="animate-spin" />
					<span>Preparing Wallet…</span>
				</>
			) : (
				<>
					<Wallet size={16} />
					<span>Connect Wallet</span>
				</>
			)}
		</button>
	);
}

function MobileWalletButton() {
	const { open, ready, requested } = useAppKit();
	const { address, isConnected } = useAppKitAccount();
	const { disconnect } = useDisconnect();
	const preparing = !ready && requested;

	const truncatedAddress = address
		? `${address.slice(0, 6)}...${address.slice(-4)}`
		: "";

	if (isConnected && address) {
		return (
			<div className="space-y-2">
				<div className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-cyan-500/8 border border-cyan-500/25">
					<div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(0,255,159,0.9)]" />
					<span className="font-mono text-xs text-cyan-300">
						{truncatedAddress}
					</span>
				</div>
				<div className="grid grid-cols-2 gap-2">
					<button
						type="button"
						onClick={() => open({ view: "Account" })}
						className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-muted-foreground bg-surface-2 hover:bg-surface-2/80 rounded-lg transition-colors"
					>
						<Wallet size={13} />
						<span>Details</span>
					</button>
					<button
						type="button"
						onClick={() => disconnect()}
						className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-red-400 bg-red-500/5 hover:bg-red-500/10 rounded-lg transition-colors"
					>
						<LogOut size={13} />
						<span>Disconnect</span>
					</button>
				</div>
			</div>
		);
	}

	return (
		<button
			type="button"
			onClick={() => open({ view: "Connect", namespace: "solana" })}
			disabled={preparing}
			className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold tracking-wide text-primary-foreground bg-linear-to-b from-cyan-300 to-cyan-600 rounded-lg shadow-lg shadow-cyan-500/30 disabled:opacity-70 disabled:pointer-events-none"
		>
			{preparing ? (
				<>
					<Loader2 size={16} className="animate-spin" />
					<span>Preparing Wallet…</span>
				</>
			) : (
				<>
					<Wallet size={16} />
					<span>Connect Wallet</span>
				</>
			)}
		</button>
	);
}

export default function Header() {
	const [mobileOpen, setMobileOpen] = useState(false);
	const [scrolled, setScrolled] = useState(false);
	const [mobileExpanded, setMobileExpanded] = useState<Record<string, boolean>>(
		{},
	);

	// SECURITY (review M5): the jackpot badges previously showed a hardcoded
	// "$1,247,832" that never reflected reality — users were materially misled
	// about the jackpot size. Now it reads the live on-chain lottery state.
	const { jackpotDollars, state } = useLotteryState();

	// Format for display: compact ($1.2M) on desktop, full ($1,247,832) on mobile
	const jackpotCompact =
		jackpotDollars >= 1_000_000
			? `$${(jackpotDollars / 1_000_000).toFixed(1)}M`
			: `$${Math.round(jackpotDollars).toLocaleString()}`;
	const jackpotFull = `$${Math.round(jackpotDollars).toLocaleString()}`;
	const jackpotKnown = state !== null && jackpotDollars > 0;

	useEffect(() => {
		// rAF-throttle: the scroll listener fires on every scroll event and
		// re-renders the whole nav; only update at most once per frame.
		let ticking = false;
		const handleScroll = () => {
			if (ticking) return;
			ticking = true;
			requestAnimationFrame(() => {
				setScrolled(window.scrollY > 20);
				ticking = false;
			});
		};
		window.addEventListener("scroll", handleScroll, { passive: true });
		return () => window.removeEventListener("scroll", handleScroll);
	}, []);

	// Lock body scroll when mobile menu is open
	useEffect(() => {
		if (mobileOpen) {
			document.body.style.overflow = "hidden";
		} else {
			document.body.style.overflow = "";
		}
		return () => {
			document.body.style.overflow = "";
		};
	}, [mobileOpen]);

	// Move focus into the panel when it opens and close it with Escape;
	// the invisible overlay is intentionally non-focusable, so Escape must be
	// handled at the document level.
	const mobileCloseRef = useRef<HTMLButtonElement>(null);
	useEffect(() => {
		if (!mobileOpen) return;
		mobileCloseRef.current?.focus();
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setMobileOpen(false);
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [mobileOpen]);

	return (
		<>
			{/* Main Header */}
			<header
				className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 ${
					scrolled
						? "glass-strong shadow-lg shadow-black/10 dark:shadow-black/20"
						: "bg-transparent"
				}`}
			>
				<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
					<div className="flex items-center justify-between h-16 md:h-18">
						{/* Logo */}
						<Link to="/" className="flex items-center gap-2.5 group shrink-0">
							<LogoMark />
							<div className="flex flex-col">
								<span className="text-base font-bold text-foreground tracking-tight leading-none font-display group-hover:text-gold-400 transition-colors">
									Mazel
								</span>
								<span className="text-[10px] text-muted-foreground font-semibold tracking-[0.15em] uppercase leading-none mt-0.5">
									Protocol
								</span>
							</div>
						</Link>

						{/* Desktop Navigation */}
						<nav className="hidden lg:flex items-center gap-1">
							{navLinks.map((link) => {
								if ("children" in link && link.children) {
									return (
										<DesktopDropdown
											key={link.label}
											label={link.label}
											icon={link.icon}
											items={link.children}
										/>
									);
								}

								return (
									<NavLink
										key={link.label}
										to={(link as { to: string }).to}
										className={({ isActive }) =>
											isActive
												? "relative flex items-center gap-1.5 px-3 py-2 text-sm font-bold tracking-wide text-cyan-300 bg-cyan-500/10 rounded-lg after:absolute after:inset-x-3 after:bottom-0.5 after:h-px after:bg-cyan-400 after:shadow-[0_0_8px_rgba(0,229,255,0.9)]"
												: "flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-cyan-200 transition-colors rounded-lg hover:bg-cyan-500/10"
										}
									>
										<link.icon size={16} className="opacity-70" />
										<span>{link.label}</span>
									</NavLink>
								);
							})}
						</nav>

						{/* Right side: Theme + Wallet + Mobile menu */}
						<div className="flex items-center gap-3">
							{/* Live Jackpot Badge (Desktop) */}
							<div
								className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-gold-500/8 border border-gold-500/15"
								title={
									jackpotKnown
										? `${jackpotFull} USDC`
										: "Jackpot data unavailable"
								}
							>
								<div
									className={`w-1.5 h-1.5 rounded-full ${
										jackpotKnown ? "bg-gold-400 animate-pulse" : "bg-gray-500"
									}`}
								/>
								<span className="text-xs font-semibold text-gold-400 tracking-wide">
									{jackpotKnown ? `Jackpot: ${jackpotCompact}` : "Jackpot: --"}
								</span>
							</div>

							{/* Theme toggle (desktop) */}
							<div className="hidden sm:block">
								<ThemeToggleCompact />
							</div>

							{/* Wallet Connect Button */}
							<div className="hidden sm:block">
								<WalletButton />
							</div>

							{/* Mobile Menu Toggle */}
							<button
								type="button"
								onClick={() => setMobileOpen(!mobileOpen)}
								className="lg:hidden p-2 text-muted-foreground hover:text-foreground hover:bg-cyan-500/10 rounded-lg transition-colors"
								aria-label={mobileOpen ? "Close menu" : "Open menu"}
								aria-expanded={mobileOpen}
								aria-controls="mobile-menu"
							>
								{mobileOpen ? <X size={22} /> : <Menu size={22} />}
							</button>
						</div>
					</div>
				</div>

				{/* Gradient border at bottom when scrolled */}
				{scrolled && <div className="section-divider" />}
			</header>

			{/* Mobile Menu Overlay */}
			{mobileOpen && (
				<button
					type="button"
					className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm z-40 lg:hidden border-none cursor-default"
					tabIndex={-1}
					onClick={() => setMobileOpen(false)}
					onKeyDown={(e) => {
						if (e.key === "Escape") setMobileOpen(false);
					}}
					aria-label="Close mobile menu"
				/>
			)}

			{/* Mobile Menu Panel */}
			<aside
				id="mobile-menu"
				className={`fixed top-0 right-0 h-full w-80 max-w-[85vw] z-50 lg:hidden transform transition-transform duration-300 ease-in-out ${mobileOpen ? "translate-x-0" : "translate-x-full"}`}
				aria-hidden={!mobileOpen}
				inert={!mobileOpen}
			>
				<div className="h-full flex flex-col bg-surface-0/98 backdrop-blur-xl border-l border-border">
					{/* Mobile header */}
					<div className="flex items-center justify-between p-4 border-b border-border">
						<div className="flex items-center gap-2.5">
							<LogoMark />
							<span className="font-bold text-foreground font-display">
								MazelProtocol
							</span>
						</div>
						<button
							ref={mobileCloseRef}
							type="button"
							onClick={() => setMobileOpen(false)}
							className="p-2 text-muted-foreground hover:text-foreground hover:bg-cyan-500/10 rounded-lg transition-colors"
							aria-label="Close menu"
						>
							<X size={20} />
						</button>
					</div>

					{/* Mobile wallet connect */}
					<div className="px-4 pt-4">
						<MobileWalletButton />
						<div className="mt-3 flex items-center justify-center">
							<ThemeToggleCompact />
						</div>
					</div>

					{/* Jackpot badge mobile */}
					<div
						className="mx-4 mt-3 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-gold-500/8 border border-gold-500/15"
						title={
							jackpotKnown ? `${jackpotFull} USDC` : "Jackpot data unavailable"
						}
					>
						<div
							className={`w-1.5 h-1.5 rounded-full ${
								jackpotKnown ? "bg-gold-400 animate-pulse" : "bg-gray-500"
							}`}
						/>
						<span className="text-xs font-semibold text-gold-400">
							{jackpotKnown
								? `Live Jackpot: ${jackpotFull}`
								: "Live Jackpot: --"}
						</span>
					</div>

					{/* Mobile nav links */}
					<nav className="flex-1 overflow-y-auto p-4 space-y-1">
						<NavLink
							to="/"
							onClick={() => setMobileOpen(false)}
							className={({ isActive }) =>
								isActive
									? "flex items-center gap-3 px-3 py-2.5 text-sm font-bold tracking-wide text-cyan-300 bg-cyan-500/10 rounded-lg"
									: "flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-cyan-500/10 rounded-lg transition-colors"
							}
						>
							<Trophy size={18} className="opacity-70" />
							<span>Home</span>
						</NavLink>

						{navLinks.map((link) => {
							if ("children" in link && link.children) {
								const isExpanded = mobileExpanded[link.label];
								return (
									<div key={link.label}>
										<button
											type="button"
											onClick={() =>
												setMobileExpanded((prev) => ({
													...prev,
													[link.label]: !prev[link.label],
												}))
											}
											className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-cyan-500/10 rounded-lg transition-colors"
										>
											<div className="flex items-center gap-3">
												<link.icon size={18} className="opacity-70" />
												<span>{link.label}</span>
											</div>
											<ChevronDown
												size={16}
												className={`opacity-50 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
											/>
										</button>
										{isExpanded && (
											<div className="ml-4 mt-1 space-y-1 border-l border-border pl-3">
												{link.children.map((child) => {
													const ChildIcon = child.icon;

													if ("href" in child && child.href) {
														return (
															<a
																key={child.label}
																href={child.href}
																target="_blank"
																rel="noopener noreferrer"
																onClick={() => setMobileOpen(false)}
																className="flex items-center gap-2.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-cyan-500/10 rounded-lg transition-colors"
															>
																<ChildIcon size={15} className="opacity-60" />
																<span>{child.label}</span>
																<ExternalLink
																	size={11}
																	className="ml-auto opacity-30"
																/>
															</a>
														);
													}

													return (
														<NavLink
															key={child.label}
															to={child.to as string}
															onClick={() => setMobileOpen(false)}
															className={({ isActive }) =>
																isActive
																	? "flex items-center gap-2.5 px-3 py-2 text-sm text-cyan-300 bg-cyan-500/10 rounded-lg"
																	: "flex items-center gap-2.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-cyan-500/10 rounded-lg transition-colors"
															}
														>
															<ChildIcon size={15} className="opacity-60" />
															<span>{child.label}</span>
														</NavLink>
													);
												})}
											</div>
										)}
									</div>
								);
							}

							return (
								<NavLink
									key={link.label}
									to={(link as { to: string }).to}
									onClick={() => setMobileOpen(false)}
									className={({ isActive }) =>
										isActive
											? "flex items-center gap-3 px-3 py-2.5 text-sm font-bold tracking-wide text-cyan-300 bg-cyan-500/10 rounded-lg"
											: "flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-cyan-500/10 rounded-lg transition-colors"
									}
								>
									<link.icon size={18} className="opacity-70" />
									<span>{link.label}</span>
								</NavLink>
							);
						})}
					</nav>

					{/* Mobile footer */}
					<div className="p-4 border-t border-border">
						<div className="flex items-center justify-center gap-4 text-muted-foreground text-xs">
							<span>Built on Solana</span>
							<span className="w-1 h-1 rounded-full bg-muted-foreground/40" />
							<span>Non-custodial</span>
							<span className="w-1 h-1 rounded-full bg-muted-foreground/40" />
							<span>Provably Fair</span>
						</div>
					</div>
				</div>
			</aside>

			{/* Spacer for fixed header */}
			<div className="h-16" />
		</>
	);
}
