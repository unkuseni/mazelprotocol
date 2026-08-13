import { useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import { Gem, Globe, MessageCircle, Twitter } from "lucide-react";
import { isRegionPending, getGeoblockMessage } from "@/lib/geoblock";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

// Route components
import Home from "@/routes/Home";
import Dashboard from "@/routes/Dashboard";
import Play from "@/routes/Play";
import QuickPick from "@/routes/QuickPick";
import Results from "@/routes/Results";
import Tickets from "@/routes/Tickets";
import Syndicates from "@/routes/Syndicates";
import SyndicateDetail from "@/routes/SyndicateDetail";
import RolldownLearn from "@/routes/RolldownLearn";
import Whitepaper from "@/routes/Whitepaper";
import Waitlist from "@/routes/Waitlist";

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
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-8 py-16 text-foreground">
        {/* Ambient glow background */}
        <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-background via-transparent to-background" />
        <div className="pointer-events-none absolute left-1/4 top-1/4 h-125 w-125 rounded-full bg-gold-500/5 blur-[150px]" />
        <div className="pointer-events-none absolute bottom-1/4 right-1/4 h-125 w-125 rounded-full bg-emerald-500/5 blur-[150px]" />

        <div className="relative z-10 mx-auto max-w-xl text-center">
          {/* Icon */}
          <div className="mx-auto mb-6 inline-flex h-20 w-20 items-center justify-center rounded-2xl border border-gold-500/25 bg-linear-to-br from-gold-500/10 to-emerald-500/10 glow-gold">
            <Gem size={36} className="text-gold-400" />
          </div>

          {/* Heading */}
          <h1 className="font-display mb-3 text-3xl font-black tracking-tight sm:text-4xl">
            Coming Soon to Your Region
          </h1>

          {/* Description */}
          <p className="mb-5 text-base leading-relaxed text-muted-foreground">
            MazelProtocol is the first provably fair, on-chain lottery protocol
            built on Solana — delivering mathematically positive expected value
            through transparent smart contracts and community-driven prize pools.
          </p>

          {/* Geoblock message */}
          <p className="mb-8 text-sm leading-relaxed text-muted-foreground/80">
            {getGeoblockMessage()}
          </p>

          {/* Community links */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <a
              href="https://discord.gg/mazelprotocol"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface-1/50 px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-gold-500/30 hover:bg-surface-2"
            >
              <MessageCircle size={18} className="text-gold-400" />
              Join Discord
            </a>
            <a
              href="https://twitter.com/mazelprotocol"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface-1/50 px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-gold-500/30 hover:bg-surface-2"
            >
              <Twitter size={18} className="text-gold-400" />
              Follow on X
            </a>
            <a
              href="https://mazelprotocol.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface-1/50 px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-emerald-500/30 hover:bg-surface-2"
            >
              <Globe size={18} className="text-emerald-400" />
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
          <Route path="/results" element={<Results />} />
          <Route path="/tickets" element={<Tickets />} />
          <Route path="/syndicates" element={<Syndicates />} />
          <Route path="/syndicates/:syndicateId" element={<SyndicateDetail />} />
          <Route path="/learn/rolldown" element={<RolldownLearn />} />
          <Route path="/learn/whitepaper" element={<Whitepaper />} />
        </Routes>
      </main>
      <Footer />
    </>
  );
}
