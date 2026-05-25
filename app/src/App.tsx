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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          padding: "2rem",
          fontFamily: "Inter, system-ui, sans-serif",
          background: "#0a0f1a",
          color: "#fff",
        }}
      >
        <div
          style={{
            textAlign: "center",
            maxWidth: "560px",
            margin: "0 auto",
          }}
        >
          {/* Icon */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "80px",
              height: "80px",
              borderRadius: "20px",
              background: "linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(245, 158, 11, 0.15))",
              border: "1px solid rgba(16, 185, 129, 0.3)",
              marginBottom: "1.5rem",
            }}
          >
            <Gem size={36} color="#10b981" />
          </div>

          {/* Heading */}
          <h1
            style={{
              fontSize: "2rem",
              fontWeight: 800,
              marginBottom: "0.75rem",
              background: "linear-gradient(135deg, #10b981, #f59e0b)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Coming Soon to Your Region
          </h1>

          {/* Description */}
          <p
            style={{
              color: "#cbd5e1",
              fontSize: "1.05rem",
              lineHeight: 1.7,
              marginBottom: "1.25rem",
            }}
          >
            MazelProtocol is the first provably fair, on-chain lottery protocol
            built on Solana — delivering mathematically positive expected value
            through transparent smart contracts and community-driven prize pools.
          </p>

          {/* Geoblock message */}
          <p
            style={{
              color: "#94a3b8",
              fontSize: "0.95rem",
              lineHeight: 1.6,
              marginBottom: "2rem",
            }}
          >
            {getGeoblockMessage()}
          </p>

          {/* Community links */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.75rem",
              justifyContent: "center",
            }}
          >
            <a
              href="https://discord.gg/mazelprotocol"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.625rem 1.25rem",
                borderRadius: "12px",
                background: "rgba(88, 101, 242, 0.12)",
                border: "1px solid rgba(88, 101, 242, 0.3)",
                color: "#a5b4fc",
                fontSize: "0.9rem",
                fontWeight: 500,
                textDecoration: "none",
                transition: "background 0.2s",
              }}
            >
              <MessageCircle size={18} />
              Join Discord
            </a>
            <a
              href="https://twitter.com/mazelprotocol"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.625rem 1.25rem",
                borderRadius: "12px",
                background: "rgba(29, 161, 242, 0.12)",
                border: "1px solid rgba(29, 161, 242, 0.3)",
                color: "#7dd3fc",
                fontSize: "0.9rem",
                fontWeight: 500,
                textDecoration: "none",
                transition: "background 0.2s",
              }}
            >
              <Twitter size={18} />
              Follow on X
            </a>
            <a
              href="https://mazelprotocol.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.625rem 1.25rem",
                borderRadius: "12px",
                background: "rgba(16, 185, 129, 0.12)",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                color: "#6ee7b7",
                fontSize: "0.9rem",
                fontWeight: 500,
                textDecoration: "none",
                transition: "background 0.2s",
              }}
            >
              <Globe size={18} />
              Visit Website
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
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
