import { Gem, Globe, MessageCircle, Twitter } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { Route, Routes } from "react-router-dom";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import { getGeoblockMessage, isRegionPending } from "@/lib/geoblock";

/* -------------------------------------------------------------------------- */
/*  Route code-splitting                                                      */
/*  Routes are lazy-loaded so the initial bundle only ships the landing page  */
/*  and its dependencies, not every page in the app (the eager version was    */
/*  a single ~2 MB chunk).                                                    */
/* -------------------------------------------------------------------------- */

const Dashboard = lazy(() => import("@/routes/Dashboard"));
const Home = lazy(() => import("@/routes/Home"));
const LpPool = lazy(() => import("@/routes/Lp"));
const Play = lazy(() => import("@/routes/Play"));
const QuickPick = lazy(() => import("@/routes/QuickPick"));
const Results = lazy(() => import("@/routes/Results"));
const RolldownLearn = lazy(() => import("@/routes/RolldownLearn"));
const SyndicateDetail = lazy(() => import("@/routes/SyndicateDetail"));
const Syndicates = lazy(() => import("@/routes/Syndicates"));
const Tickets = lazy(() => import("@/routes/Tickets"));
const Waitlist = lazy(() => import("@/routes/Waitlist"));
const Whitepaper = lazy(() => import("@/routes/Whitepaper"));

/** Branded loading state shown while a lazy route chunk is fetched. */
function PageFallback() {
	return (
		<div
			className="flex min-h-[60vh] items-center justify-center bg-background"
			role="status"
			aria-live="polite"
		>
			<div className="flex flex-col items-center gap-4">
				<div
					className="h-12 w-12 rounded-full border-2 border-cyan-500/20 border-t-cyan-400 animate-spin"
					aria-hidden="true"
				/>
				<p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
					Loading…
				</p>
			</div>
		</div>
	);
}

/** The main app shell: fixed header, routed content, footer. */
function AppShell() {
	return (
		<>
			{/* Skip link: lets keyboard users jump straight past the nav */}
			<a
				href="#main"
				className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-lg focus:bg-surface-0 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-foreground focus:border focus:border-cyan-500/40"
			>
				Skip to main content
			</a>
			<Header />
			<main id="main">
				<Suspense fallback={<PageFallback />}>
					<Routes>
						<Route path="/" element={<Home />} />
						<Route path="/dashboard" element={<Dashboard />} />
						<Route path="/play" element={<Play />} />
						<Route path="/play/quick-pick" element={<QuickPick />} />
						<Route path="/lp" element={<LpPool />} />
						<Route path="/results" element={<Results />} />
						<Route path="/tickets" element={<Tickets />} />
						<Route path="/syndicates" element={<Syndicates />} />
						<Route
							path="/syndicates/:syndicateId"
							element={<SyndicateDetail />}
						/>
						<Route path="/learn/rolldown" element={<RolldownLearn />} />
						<Route path="/learn/whitepaper" element={<Whitepaper />} />
					</Routes>
				</Suspense>
			</main>
			<Footer />
		</>
	);
}

export default function App() {
	const [regionPending, setRegionPending] = useState(false);

	useEffect(() => {
		if (import.meta.env.VITE_ENABLE_GEOBLOCK !== "true") return;
		const match = document.cookie.match(/(?:^|;\s*)cf_country=([^;]*)/);
		const country = match?.[1];
		if (isRegionPending(country, undefined)) {
			setRegionPending(true);
		}
	}, []);

	if (regionPending) {
		return (
			<div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-8 py-16 text-foreground scanlines">
				{/* Ambient glow background */}
				<div className="pointer-events-none absolute inset-0 bg-linear-to-b from-background via-transparent to-background" />
				<div className="pointer-events-none absolute inset-0 hero-grid opacity-50" />
				<div className="pointer-events-none absolute left-1/4 top-1/4 h-125 w-125 rounded-full bg-cyan-500/6 blur-[150px]" />
				<div className="pointer-events-none absolute bottom-1/4 right-1/4 h-125 w-125 rounded-full bg-magenta-500/6 blur-[150px]" />

				<div className="relative z-10 mx-auto max-w-xl text-center">
					{/* Icon */}
					<div className="mx-auto mb-6 inline-flex h-20 w-20 items-center justify-center rounded-lg border border-cyan-500/30 bg-linear-to-br from-cyan-500/10 to-magenta-500/10 glow-cyan">
						<Gem
							size={36}
							className="text-cyan-300 drop-shadow-[0_0_10px_rgba(0,229,255,0.8)]"
						/>
					</div>

					{/* Heading */}
					<h1 className="font-display mb-3 text-3xl font-black tracking-wide uppercase sm:text-4xl">
						<span className="glitch" data-text="Coming Soon to Your Region">
							Coming Soon to Your Region
						</span>
					</h1>

					{/* Description */}
					<p className="mb-5 text-base leading-relaxed text-muted-foreground">
						MazelProtocol is the first provably fair, on-chain lottery protocol
						built on Solana — delivering mathematically positive expected value
						through transparent smart contracts and community-driven prize
						pools.
					</p>

					{/* Geoblock message */}
					<p className="mb-8 font-mono text-sm leading-relaxed text-muted-foreground/80">
						{getGeoblockMessage()}
					</p>

					{/* Community links */}
					<div className="flex flex-wrap items-center justify-center gap-3">
						<a
							href="https://discord.gg/mazelprotocol"
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/25 bg-surface-1/50 px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-cyan-400/50 hover:bg-cyan-500/10"
						>
							<MessageCircle size={18} className="text-cyan-300" />
							Join Discord
						</a>
						<a
							href="https://x.com/mazelprotocol"
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/25 bg-surface-1/50 px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-cyan-400/50 hover:bg-cyan-500/10"
						>
							<Twitter size={18} className="text-cyan-300" />
							Follow on X
						</a>
						<a
							href="https://mazelprotocol.com"
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-2 rounded-lg border border-magenta-500/25 bg-surface-1/50 px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-magenta-400/50 hover:bg-magenta-500/10"
						>
							<Globe size={18} className="text-magenta-300" />
							Visit Website
						</a>
					</div>
				</div>
			</div>
		);
	}

	/*
	 * `/waitlist` is a standalone prelaunch landing page with its own nav and
	 * footer, so it must NOT be wrapped in the app shell (previously the app
	 * Header/Footer were also rendered, stacking a second set of chrome below
	 * the waitlist page and letting the fixed header float over it).
	 * Everything else renders inside AppShell.
	 */
	return (
		<Suspense fallback={<PageFallback />}>
			<Routes>
				<Route path="/waitlist" element={<Waitlist />} />
				<Route path="*" element={<AppShell />} />
			</Routes>
		</Suspense>
	);
}
