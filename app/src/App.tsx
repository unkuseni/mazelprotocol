import { useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import { isGeoblocked, getGeoblockMessage } from "@/lib/geoblock";
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
  const [geoblocked, setGeoblocked] = useState(false);

  useEffect(() => {
    if (import.meta.env.VITE_ENABLE_GEOBLOCK !== "true") return;
    const match = document.cookie.match(/(?:^|;\s*)cf_country=([^;]*)/);
    const country = match?.[1];
    if (isGeoblocked(country, undefined)) {
      setGeoblocked(true);
    }
  }, []);

  if (geoblocked) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          padding: "2rem",
          textAlign: "center",
          fontFamily: "Inter, system-ui, sans-serif",
          background: "#0a0f1a",
          color: "#fff",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>
            Access Restricted
          </h1>
          <p style={{ color: "#94a3b8", maxWidth: "480px" }}>
            {getGeoblockMessage()}
          </p>
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
