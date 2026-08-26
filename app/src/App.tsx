import { Gem, Globe, MessageCircle, Twitter } from "lucide-react";
import { useEffect, useState } from "react";
import { Route, Routes } from "react-router-dom";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import { getGeoblockMessage, isRegionPending } from "@/lib/geoblock";
import Dashboard from "@/routes/Dashboard";
// Route components
import Home from "@/routes/Home";
import LpPool from "@/routes/Lp";
import Play from "@/routes/Play";
import QuickPick from "@/routes/QuickPick";
import Results from "@/routes/Results";
import RolldownLearn from "@/routes/RolldownLearn";
import SyndicateDetail from "@/routes/SyndicateDetail";
import Syndicates from "@/routes/Syndicates";
import Tickets from "@/routes/Tickets";
import Waitlist from "@/routes/Waitlist";
import Whitepaper from "@/routes/Whitepaper";

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
							href="https://twitter.com/mazelprotocol"
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

	return (
		<>
			{/* Standalone prelaunch landing page (own nav + footer, no app shell) */}
			<Routes>
				<Route path="/waitlist" element={<Waitlist />} />
			</Routes>
			<Header />
			<main>
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
			</main>
			<Footer />
		</>
	);
}
