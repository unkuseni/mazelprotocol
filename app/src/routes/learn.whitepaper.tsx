import { createFileRoute, Link } from "@tanstack/react-router";
import {
  TrendingUp,
  ChevronRight,
  Zap,
  Trophy,
  Target,
  Shield,
  BarChart3,
  DollarSign,
  Users,
  Sparkles,
  CheckCircle,
  BookOpen,
  Gem,
  Clock,
  Star,
  Eye,
  Lock,
  FileText,
  Layers,
  RefreshCw,
  AlertTriangle,
  Server,
  Code,
  Database,
  Hash,
  Cpu,
  Globe,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { FloatingBalls } from "@/components/LotteryBalls";
import Footer from "@/components/Footer";

export const Route = createFileRoute("/learn/whitepaper")({
  component: WhitepaperPage,
});

/* -------------------------------------------------------------------------- */
/*  Shared sub-components                                                     */
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
    <div className="flex items-start gap-3 mb-6" id={`section-${number}`}>
      <div className="shrink-0 w-10 h-10 rounded-xl bg-linear-to-br from-emerald/20 to-emerald-dark/10 border border-emerald/20 flex items-center justify-center text-sm font-black text-emerald-light">
        {number}
      </div>
      <div>
        <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
          {title}
          <Icon size={20} className="text-emerald/60" />
        </h2>
        {subtitle && <p className="text-sm text-gray-400 mt-1">{subtitle}</p>}
      </div>
    </div>
  );
}

function Callout({
  variant = "info",
  title,
  children,
}: {
  variant?: "info" | "warning" | "success";
  title?: string;
  children: React.ReactNode;
}) {
  const colors = {
    info: {
      bg: "bg-emerald/[0.03]",
      border: "border-emerald/10",
      icon: <Gem size={14} className="text-emerald-light" />,
      titleColor: "text-emerald-light",
    },
    warning: {
      bg: "bg-gold/[0.03]",
      border: "border-gold/10",
      icon: <AlertTriangle size={14} className="text-gold" />,
      titleColor: "text-gold",
    },
    success: {
      bg: "bg-emerald/[0.05]",
      border: "border-emerald/20",
      icon: <CheckCircle size={14} className="text-emerald" />,
      titleColor: "text-emerald-light",
    },
  };

  const c = colors[variant];

  return (
    <div className={`rounded-xl p-4 ${c.bg} border ${c.border}`}>
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5">{c.icon}</div>
        <div>
          {title && (
            <p className={`text-xs font-bold ${c.titleColor} mb-1`}>{title}</p>
          )}
          <div className="text-[11px] sm:text-xs text-gray-400 leading-relaxed">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

function DataTable({
  headers,
  rows,
  highlightCol,
}: {
  headers: string[];
  rows: string[][];
  highlightCol?: number;
}) {
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-[11px] sm:text-xs">
        <thead>
          <tr className="border-b border-white/10">
            {headers.map((h, i) => (
              <th
                key={h}
                className={`text-left py-2 px-2 font-bold ${
                  i === highlightCol ? "text-emerald-light" : "text-gray-300"
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.join("|")}
              className="border-b border-white/5 hover:bg-white/2 transition-colors"
            >
              {row.map((cell, ci) => (
                <td
                  key={`${row[0]}-${ci}`}
                  className={`py-2 px-2 ${
                    ci === highlightCol
                      ? "text-emerald-light font-semibold"
                      : "text-gray-400"
                  }`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: LucideIcon;
}) {
  return (
    <div className="glass rounded-xl p-4 text-center">
      <Icon size={18} className="text-emerald mx-auto mb-2 opacity-60" />
      <p className="text-lg sm:text-xl font-black text-white">{value}</p>
      <p className="text-[11px] font-semibold text-gray-300 mt-1">{label}</p>
      {sub && <p className="text-[10px] text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-xl bg-[#0a0f1a]/80 border border-white/5 p-4 text-[10px] sm:text-[11px] leading-relaxed text-gray-300 font-mono">
      <code>{children}</code>
    </pre>
  );
}

interface TocItemProps {
  number: string;
  title: string;
  icon: LucideIcon;
}

function TocItem({ number, title, icon: Icon }: TocItemProps) {
  return (
    <a
      href={`#section-${number}`}
      className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-white/5 transition-colors group"
    >
      <span className="shrink-0 w-6 h-6 rounded-md bg-white/5 group-hover:bg-emerald/10 flex items-center justify-center text-[10px] font-bold text-gray-500 group-hover:text-emerald-light transition-colors">
        {number}
      </span>
      <Icon
        size={12}
        className="text-gray-600 group-hover:text-emerald/60 transition-colors"
      />
      <span>{title}</span>
    </a>
  );
}

/* -------------------------------------------------------------------------- */
/*  Architecture Diagram                                                      */
/* -------------------------------------------------------------------------- */

function ArchitectureDiagram() {
  return (
    <div className="glass rounded-2xl p-5 sm:p-6 space-y-4">
      <h4 className="text-sm font-bold text-white flex items-center gap-2">
        <Layers size={14} className="text-emerald" />
        System Architecture
      </h4>

      {/* Application Layer */}
      <div className="rounded-xl border border-white/10 p-3">
        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">
          Application Layer
        </p>
        <div className="flex flex-wrap gap-2">
          {["Web App", "Mobile App", "API / SDK", "Bots"].map((item) => (
            <span
              key={item}
              className="px-2.5 py-1 rounded-md bg-white/5 text-[10px] font-medium text-gray-300 border border-white/5"
            >
              {item}
            </span>
          ))}
        </div>
      </div>

      <div className="flex justify-center">
        <div className="w-px h-4 bg-emerald/30" />
      </div>

      {/* Programs */}
      <div className="rounded-xl border border-emerald/20 bg-emerald/[0.02] p-3 space-y-3">
        <p className="text-[10px] font-bold text-emerald-light uppercase tracking-wider">
          Main Lottery Program (solana_lotto)
        </p>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {[
            "Ticket",
            "Draw",
            "Prize",
            "Admin",
            "Syndicate",
            "Syndicate Wars",
          ].map((mod) => (
            <div
              key={mod}
              className="rounded-lg bg-emerald/5 border border-emerald/10 px-2 py-1.5 text-center"
            >
              <p className="text-[9px] font-bold text-emerald-light/80">
                {mod}
              </p>
            </div>
          ))}
        </div>

        <div className="border-t border-white/5 pt-3">
          <p className="text-[10px] font-bold text-emerald-light/70 uppercase tracking-wider mb-2">
            Quick Pick Express Program
          </p>
          <div className="grid grid-cols-4 gap-2">
            {["Admin", "Ticket", "Draw", "Prize"].map((mod) => (
              <div
                key={`qp-${mod}`}
                className="rounded-lg bg-emerald/5 border border-emerald/10 px-2 py-1.5 text-center"
              >
                <p className="text-[9px] font-bold text-emerald-light/70">
                  {mod}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-center">
        <div className="w-px h-4 bg-emerald/30" />
      </div>

      {/* Infrastructure */}
      <div className="rounded-xl border border-white/10 p-3">
        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">
          Infrastructure Layer
        </p>
        <div className="flex flex-wrap gap-2">
          {[
            "Solana Runtime",
            "Switchboard Randomness (TEE)",
            "USDC (Circle)",
          ].map((item) => (
            <span
              key={item}
              className="px-2.5 py-1 rounded-md bg-white/5 text-[10px] font-medium text-gray-300 border border-white/5"
            >
              {item}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Randomness Flow Diagram                                                   */
/* -------------------------------------------------------------------------- */

function RandomnessFlow() {
  const steps = [
    {
      step: "1",
      title: "Draw Time Reached",
      desc: "The scheduled draw timestamp is met",
    },
    {
      step: "2",
      title: "Create Randomness Account",
      desc: "Keypair generated, initialized via Switchboard",
    },
    {
      step: "3",
      title: "Commit Phase",
      desc: "Commit to current Solana slothash; store commit slot",
    },
    {
      step: "4",
      title: "Oracle Generates (TEE)",
      desc: "Randomness generated in secure enclave — oracle cannot bias it",
    },
    {
      step: "5",
      title: "Reveal Phase",
      desc: "Reveal on-chain, verify commit slot, convert to winning numbers",
    },
    {
      step: "6",
      title: "Settlement",
      desc: "Calculate winners, distribute prizes, check rolldown conditions",
    },
  ];

  return (
    <div className="glass rounded-2xl p-5 sm:p-6">
      <h4 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
        <Hash size={14} className="text-emerald" />
        Switchboard Commit-Reveal Flow
      </h4>
      <div className="space-y-0">
        {steps.map((s, i) => (
          <div key={s.step} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black ${
                  i === 3
                    ? "bg-emerald/20 text-emerald-light border border-emerald/30"
                    : "bg-white/5 text-gray-500 border border-white/10"
                }`}
              >
                {s.step}
              </div>
              {i < steps.length - 1 && (
                <div className="w-px flex-1 bg-white/10 my-1" />
              )}
            </div>
            <div className="pb-4">
              <p className="text-xs font-bold text-white">{s.title}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">{s.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Rolldown Distribution Diagram                                             */
/* -------------------------------------------------------------------------- */

function RolldownDistributionDiagram() {
  const tiers = [
    {
      label: "Match 5",
      share: "25%",
      color: "from-purple-500 to-purple-600",
      width: "w-[25%]",
    },
    {
      label: "Match 4",
      share: "35%",
      color: "from-blue-500 to-blue-600",
      width: "w-[35%]",
    },
    {
      label: "Match 3",
      share: "40%",
      color: "from-emerald to-emerald-dark",
      width: "w-[40%]",
    },
  ];

  return (
    <div className="glass rounded-2xl p-5 sm:p-6">
      <h4 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
        <BarChart3 size={14} className="text-emerald" />
        Rolldown Pari-Mutuel Distribution
      </h4>

      <div className="mb-4 text-center">
        <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">
          Jackpot Pool
        </p>
        <p className="text-2xl font-black text-emerald-light">$1,750,000</p>
        <p className="text-[10px] text-gray-500">
          Distributed to lower-tier winners
        </p>
      </div>

      <div className="space-y-3">
        {tiers.map((t) => (
          <div key={t.label}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold text-gray-300">
                {t.label}
              </span>
              <span className="text-[11px] font-bold text-gray-400">
                {t.share}
              </span>
            </div>
            <div className="h-3 rounded-full bg-white/5 overflow-hidden">
              <div
                className={`h-full rounded-full bg-linear-to-r ${t.color} ${t.width}`}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 p-3 rounded-lg bg-emerald/[0.03] border border-emerald/10">
        <p className="text-[10px] text-gray-400 text-center">
          <span className="font-bold text-emerald-light">
            Prize per winner = (Pool × Share%) ÷ Number of Winners
          </span>
          <br />
          More winners → smaller individual prize. Fewer winners → bigger prize.
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main Component                                                            */
/* -------------------------------------------------------------------------- */

function WhitepaperPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* ================================================================ */}
      {/*  HERO                                                            */}
      {/* ================================================================ */}
      <section className="relative pt-24 pb-10 sm:pt-28 sm:pb-14 px-4 sm:px-6 lg:px-8 overflow-hidden">
        <div className="absolute inset-0 hero-grid opacity-30" />
        <div className="absolute inset-0 bg-glow-emerald opacity-20" />
        <div className="absolute inset-0 bg-glow-bottom-right opacity-15" />
        <FloatingBalls count={6} />

        <div className="relative z-10 max-w-4xl mx-auto">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-xs text-gray-500 mb-8">
            <Link to="/" className="hover:text-white transition-colors">
              Home
            </Link>
            <ChevronRight size={12} />
            <span className="text-gray-500">Learn</span>
            <ChevronRight size={12} />
            <span className="text-emerald-light font-medium">Whitepaper</span>
          </nav>

          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-linear-to-br from-emerald/20 to-emerald-dark/10 border border-emerald/20 mb-6 glow-emerald">
              <FileText size={32} className="text-emerald-light" />
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white mb-4">
              SolanaLotto{" "}
              <span className="text-gradient-primary">Whitepaper</span>
            </h1>

            <p className="text-sm sm:text-base text-gray-400 leading-relaxed max-w-2xl mx-auto mb-2">
              Technical Whitepaper v3.0
            </p>
            <p className="text-base sm:text-lg text-gray-400 leading-relaxed max-w-2xl mx-auto mb-6">
              A Provably Fair Decentralized Lottery with Intentional Positive
              Expected Value Windows
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald/10 border border-emerald/20">
                <Shield size={12} className="text-emerald-light" />
                <span className="text-xs font-semibold text-emerald-light">
                  Provably Fair
                </span>
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald/10 border border-emerald/20">
                <TrendingUp size={12} className="text-emerald-light" />
                <span className="text-xs font-semibold text-emerald-light">
                  Intentional +EV Windows
                </span>
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gold/10 border border-gold/20">
                <Lock size={12} className="text-gold" />
                <span className="text-xs font-semibold text-gold">
                  On-Chain Verified
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/*  ABSTRACT + TOC                                                  */}
      {/* ================================================================ */}
      <section className="relative px-4 sm:px-6 lg:px-8 pb-12">
        <div className="max-w-4xl mx-auto">
          {/* Abstract */}
          <div className="glass rounded-2xl p-5 sm:p-6 mb-8">
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <BookOpen size={14} className="text-emerald" />
              Abstract
            </h3>
            <p className="text-xs sm:text-sm text-gray-400 leading-relaxed">
              SolanaLotto introduces a novel lottery mechanism that
              intentionally creates windows of positive expected value (+EV) for
              players while maintaining long-term protocol sustainability. By
              implementing a rolldown mechanism inspired by the Massachusetts
              Cash WinFall lottery (2004–2012), the protocol creates a two-phase
              economic cycle: negative-EV normal operation that builds the prize
              pool, followed by positive-EV rolldown events that distribute
              accumulated value to lower-tier winners. This paper presents the
              mathematical foundations, economic sustainability proofs, and
              technical implementation details of the SolanaLotto protocol.
            </p>
          </div>

          {/* Table of Contents */}
          <div className="glass rounded-2xl p-5 sm:p-6">
            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <Layers size={14} className="text-emerald" />
              Table of Contents
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              <TocItem number="1" title="Introduction" icon={Gem} />
              <TocItem
                number="2"
                title="Background & Prior Art"
                icon={BookOpen}
              />
              <TocItem
                number="3"
                title="Mathematical Foundations"
                icon={Target}
              />
              <TocItem
                number="4"
                title="Prize & Rolldown Economics"
                icon={DollarSign}
              />
              <TocItem number="5" title="Game Theory Analysis" icon={Users} />
              <TocItem
                number="6"
                title="Technical Implementation"
                icon={Code}
              />
              <TocItem
                number="7"
                title="Insurance & Fund Protection"
                icon={Shield}
              />
              <TocItem number="8" title="Security Considerations" icon={Lock} />
              <TocItem number="9" title="Conclusion" icon={Star} />
              <TocItem
                number="10"
                title="References & Appendices"
                icon={FileText}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/*  CONTENT                                                         */}
      {/* ================================================================ */}
      <section className="relative px-4 sm:px-6 lg:px-8 pb-16">
        <div className="max-w-4xl mx-auto space-y-16">
          {/* ------------------------------------------------------------ */}
          {/*  Section 1: Introduction                                      */}
          {/* ------------------------------------------------------------ */}
          <div>
            <SectionHeading
              number="1"
              title="Introduction"
              subtitle="The problem with traditional lotteries and how SolanaLotto solves it"
              icon={Gem}
            />

            <div className="space-y-6">
              {/* 1.1 The Problem */}
              <div className="glass rounded-2xl p-5 sm:p-6">
                <h3 className="text-sm font-bold text-white mb-3">
                  1.1 The Problem with Traditional Lotteries
                </h3>
                <p className="text-xs sm:text-sm text-gray-400 leading-relaxed mb-4">
                  Traditional lotteries operate on a simple principle: the house
                  always wins. With typical house edges ranging from 40–60%,
                  players face overwhelming negative expected value on every
                  ticket purchased. While jackpot dreams attract players, the
                  mathematical reality ensures consistent losses over time.
                </p>
                <p className="text-xs sm:text-sm text-gray-400 leading-relaxed mb-4">
                  This creates a paradox: lotteries depend on player
                  participation, yet rational economic actors should avoid
                  negative-EV propositions. Traditional lotteries resolve this
                  through:
                </p>
                <ul className="space-y-1.5 ml-1">
                  {[
                    "Psychological manipulation (jackpot marketing)",
                    "Regulatory monopolies (no competition)",
                    "Information asymmetry (hidden odds)",
                  ].map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2 text-xs text-gray-400"
                    >
                      <span className="shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full bg-red-500/40" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* 1.2 The Solution */}
              <div className="glass rounded-2xl p-5 sm:p-6">
                <h3 className="text-sm font-bold text-white mb-3">
                  1.2 The SolanaLotto Solution
                </h3>
                <p className="text-xs sm:text-sm text-gray-400 leading-relaxed mb-4">
                  SolanaLotto proposes an alternative model that aligns
                  incentives between the protocol and sophisticated players
                  while maintaining sustainability:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    {
                      icon: Eye,
                      title: "Transparent Normal Operation",
                      desc: "Negative-EV phase builds the prize pool openly",
                    },
                    {
                      icon: TrendingUp,
                      title: "Intentional +EV Rolldown Events",
                      desc: "Reward engagement with mathematically provable player edge",
                    },
                    {
                      icon: Clock,
                      title: "Predictable Cycles",
                      desc: "Enable strategic participation for informed players",
                    },
                    {
                      icon: Lock,
                      title: "On-Chain Verification",
                      desc: "All parameters, odds, and balances verifiable on Solana",
                    },
                  ].map((item) => (
                    <div
                      key={item.title}
                      className="flex items-start gap-2.5 p-3 rounded-lg bg-white/[0.02] border border-white/5"
                    >
                      <item.icon
                        size={14}
                        className="text-emerald shrink-0 mt-0.5"
                      />
                      <div>
                        <p className="text-[11px] font-bold text-white">
                          {item.title}
                        </p>
                        <p className="text-[10px] text-gray-500 mt-0.5">
                          {item.desc}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 1.3 Design Principles */}
              <div className="glass rounded-2xl p-5 sm:p-6">
                <h3 className="text-sm font-bold text-white mb-3">
                  1.3 Design Principles
                </h3>
                <DataTable
                  headers={["Principle", "Implementation"]}
                  rows={[
                    [
                      "Transparency",
                      "All parameters, odds, and balances on-chain",
                    ],
                    [
                      "Fairness",
                      "Switchboard Randomness with TEE for verifiable randomness",
                    ],
                    [
                      "Sustainability",
                      "Dynamic fee structure guarantees long-term viability",
                    ],
                    ["Accessibility", "$2.50 ticket price on low-fee Solana"],
                    [
                      "Intentional Exploitability",
                      "Rolldown mechanism creates +EV windows for players",
                    ],
                    [
                      "Player Protection",
                      "Fixed → Pari-Mutuel prize transition caps liability",
                    ],
                  ]}
                />

                <Callout
                  variant="warning"
                  title="Critical Design Feature: Prize Transition System"
                >
                  All prizes START as FIXED amounts during normal operation,
                  then TRANSITION to PARI-MUTUEL (shared pool) distribution
                  during rolldown events, high-volume draws, and multiple winner
                  scenarios. This hybrid system ensures protocol liability is
                  always capped while maintaining attractive +EV windows for
                  players.
                </Callout>
              </div>
            </div>
          </div>

          {/* ------------------------------------------------------------ */}
          {/*  Section 2: Background & Prior Art                            */}
          {/* ------------------------------------------------------------ */}
          <div>
            <SectionHeading
              number="2"
              title="Background & Prior Art"
              subtitle="Historical precedent and why this model works"
              icon={BookOpen}
            />

            <div className="space-y-6">
              {/* Cash WinFall */}
              <div className="glass rounded-2xl p-5 sm:p-6">
                <h3 className="text-sm font-bold text-white mb-3">
                  2.1 The Massachusetts Cash WinFall Case Study
                </h3>
                <p className="text-xs sm:text-sm text-gray-400 leading-relaxed mb-4">
                  From 2004 to 2012, the Massachusetts State Lottery operated
                  Cash WinFall, a 6/46 lottery with a unique rolldown provision.
                  When the jackpot exceeded $2 million and no one matched all
                  six numbers, the prize money &quot;rolled down&quot; to lower
                  tiers.
                </p>
                <div className="space-y-2 mb-4">
                  {[
                    "Sophisticated players (including MIT students) identified the positive-EV opportunity",
                    "During rolldown events, expected value exceeded ticket cost by 15–20%",
                    "Players purchased tickets in bulk (100,000+ tickets per rolldown)",
                    "Total ticket sales increased dramatically during rolldowns",
                    "Cash WinFall was profitable for both the state and strategic players until discontinued in 2012 due to media controversy, not economic failure",
                  ].map((item) => (
                    <div
                      key={item}
                      className="flex items-start gap-2 text-xs text-gray-400"
                    >
                      <CheckCircle
                        size={12}
                        className="text-emerald shrink-0 mt-0.5"
                      />
                      {item}
                    </div>
                  ))}
                </div>

                <Callout variant="info" title="Inspired by Real History">
                  SolanaLotto takes the proven Cash WinFall mechanics and makes
                  them transparent, decentralized, and intentional. We
                  <em> want</em> players to exploit the rolldown.
                </Callout>
              </div>

              {/* Lessons */}
              <div className="glass rounded-2xl p-5 sm:p-6">
                <h3 className="text-sm font-bold text-white mb-3">
                  2.2 Lessons for Protocol Design
                </h3>
                <DataTable
                  headers={["Cash WinFall Issue", "SolanaLotto Solution"]}
                  rows={[
                    [
                      "Opaque odds calculation",
                      "All math published in smart contracts",
                    ],
                    [
                      "Manual prize claiming",
                      "Automatic on-chain distribution",
                    ],
                    ["Geographic restriction", "Global access via Solana"],
                    [
                      "No player governance",
                      "Timelocked config changes (24h delay) with permissionless solvency checks",
                    ],
                    [
                      "Single operator risk",
                      "Multi-sig authority recommended; all state verifiable on-chain",
                    ],
                  ]}
                />
              </div>

              {/* Existing Protocols */}
              <div className="glass rounded-2xl p-5 sm:p-6">
                <h3 className="text-sm font-bold text-white mb-3">
                  2.3 Existing Crypto Lottery Protocols
                </h3>
                <DataTable
                  headers={["Protocol", "Mechanism", "Limitation"]}
                  rows={[
                    [
                      "PoolTogether",
                      "No-loss savings game",
                      "Low yields, no jackpot excitement",
                    ],
                    [
                      "Standard VRF Lotteries",
                      "Standard negative-EV",
                      "No differentiation from traditional",
                    ],
                    [
                      "Various NFT lotteries",
                      "Random NFT distribution",
                      "Illiquid prizes, opaque odds",
                    ],
                  ]}
                />
                <p className="text-xs text-emerald-light font-semibold mt-3">
                  SolanaLotto is the first protocol to implement intentional +EV
                  windows in a decentralized lottery.
                </p>
              </div>
            </div>
          </div>

          {/* ------------------------------------------------------------ */}
          {/*  Section 3: Mathematical Foundations                          */}
          {/* ------------------------------------------------------------ */}
          <div>
            <SectionHeading
              number="3"
              title="Mathematical Foundations"
              subtitle="Combinatorics, probability, and expected value calculations"
              icon={Target}
            />

            <div className="space-y-6">
              {/* 3.1 Combinatorial Basis */}
              <div className="glass rounded-2xl p-5 sm:p-6">
                <h3 className="text-sm font-bold text-white mb-3">
                  3.1 Combinatorial Basis
                </h3>
                <p className="text-xs sm:text-sm text-gray-400 leading-relaxed mb-4">
                  SolanaLotto uses a{" "}
                  <strong className="text-white">6/46 matrix</strong>: players
                  select 6 numbers from a pool of 46.
                </p>
                <div className="p-4 rounded-xl bg-[#0a0f1a]/80 border border-white/5 text-center mb-4">
                  <p className="text-[10px] text-gray-500 mb-1">
                    Total possible combinations
                  </p>
                  <p className="text-lg sm:text-xl font-black text-emerald-light font-mono">
                    C(46, 6) = 9,366,819
                  </p>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed">
                  For matching exactly <em>k</em> numbers out of 6 drawn, the
                  probability formula is:{" "}
                  <span className="font-mono text-emerald-light/80">
                    P(k) = C(6,k) × C(40, 6-k) / C(46, 6)
                  </span>
                </p>
              </div>

              {/* 3.2 Probability Table */}
              <div className="glass rounded-2xl p-5 sm:p-6">
                <h3 className="text-sm font-bold text-white mb-3">
                  3.2 Probability Calculations
                </h3>
                <DataTable
                  headers={["Match", "Probability", "Odds (1 in X)"]}
                  highlightCol={2}
                  rows={[
                    ["6 of 6", "0.00000010676", "9,366,819"],
                    ["5 of 6", "0.00002562", "39,028"],
                    ["4 of 6", "0.001249", "800.6"],
                    ["3 of 6", "0.02109", "47.42"],
                    ["2 of 6", "0.14635", "6.833"],
                    ["1 of 6", "0.42153", "2.372"],
                    ["0 of 6", "0.40982", "2.440"],
                  ]}
                />
                <p className="text-[10px] text-gray-500 mt-3 text-center">
                  Verification: Σ P(k) for k=0..6 = 1.000 ✓
                </p>
              </div>

              {/* 3.3 Expected Value — Normal Mode */}
              <div className="glass rounded-2xl p-5 sm:p-6">
                <h3 className="text-sm font-bold text-white mb-3">
                  3.3 Expected Value — Normal Mode (Fixed Prizes)
                </h3>
                <Callout variant="info" title="Prize Mode: FIXED">
                  During normal operation, prizes are predetermined fixed
                  amounts. This provides predictable player value.
                </Callout>

                <div className="mt-4 mb-4">
                  <p className="text-xs font-bold text-gray-300 mb-2">
                    Fixed Prize Schedule:
                  </p>
                  <DataTable
                    headers={["Match", "Prize", "EV Contribution"]}
                    highlightCol={1}
                    rows={[
                      [
                        "6 (Jackpot)",
                        "Variable (J = current jackpot)",
                        "J / 9,366,819",
                      ],
                      ["5", "$4,000", "$0.1025"],
                      ["4", "$150", "$0.1874"],
                      ["3", "$5", "$0.1054"],
                      ["2", "$2.50 (free ticket)", "$0.3659"],
                    ]}
                  />
                </div>

                <div className="p-3 rounded-xl bg-[#0a0f1a]/80 border border-white/5 mb-3">
                  <p className="text-xs text-gray-400 leading-relaxed">
                    For J = $1,000,000:
                  </p>
                  <p className="text-sm font-mono font-bold text-white mt-1">
                    EV<sub>normal</sub> = $0.1068 + $0.7612 ={" "}
                    <span className="text-red-400">$0.868</span>
                  </p>
                  <p className="text-[10px] text-gray-500 mt-1">
                    Ticket costs $2.50 — negative EV in normal mode
                  </p>
                </div>
              </div>

              {/* 3.3 Expected Value — Rolldown Mode */}
              <div className="glass rounded-2xl p-5 sm:p-6">
                <h3 className="text-sm font-bold text-white mb-3">
                  3.3 Expected Value — Rolldown Mode (Pari-Mutuel Prizes)
                </h3>
                <Callout
                  variant="warning"
                  title="Prize Mode Transition: FIXED → PARI-MUTUEL"
                >
                  During rolldown events, ALL prizes transition from fixed
                  amounts to pari-mutuel (shared pool) distribution. This
                  ensures protocol liability is capped at exactly the jackpot
                  amount.
                </Callout>

                <div className="mt-4 mb-4">
                  <p className="text-xs text-gray-400 leading-relaxed mb-3">
                    During rolldown, a jackpot{" "}
                    <strong className="text-white">J</strong> (where $1.75M ≤ J
                    ≤ $2.25M) distributes to lower tiers using pari-mutuel
                    pools:
                  </p>
                  <DataTable
                    headers={["Tier", "Pool Share", "Prize Formula"]}
                    highlightCol={1}
                    rows={[
                      ["Match 5", "25%", "0.25J ÷ Winners"],
                      ["Match 4", "35%", "0.35J ÷ Winners"],
                      ["Match 3", "40%", "0.40J ÷ Winners"],
                    ]}
                  />
                </div>

                <div className="p-3 rounded-xl bg-[#0a0f1a]/80 border border-white/5 mb-4">
                  <p className="text-xs text-gray-400 leading-relaxed mb-2">
                    The EV formula simplifies beautifully:
                  </p>
                  <p className="text-sm font-mono font-bold text-white">
                    EV<sub>rolldown</sub> ={" "}
                    <span className="text-emerald-light">J / N</span> + $0.3659
                  </p>
                  <p className="text-[10px] text-gray-500 mt-1">
                    where J = jackpot amount, N = total tickets sold
                  </p>
                </div>

                <p className="text-xs font-bold text-gray-300 mb-2">
                  Player Edge Examples (Pari-Mutuel):
                </p>
                <DataTable
                  headers={["Jackpot (J)", "Tickets (N)", "EV", "Player Edge"]}
                  highlightCol={3}
                  rows={[
                    ["$1,750,000", "700,000", "$2.87", "+14.8%"],
                    ["$1,750,000", "475,000", "$4.05", "+62%"],
                    ["$2,250,000", "475,000", "$5.11", "+104%"],
                    ["$2,250,000", "1,000,000", "$2.62", "+4.8%"],
                  ]}
                />

                <Callout variant="success" title="Key Insight">
                  Higher ticket volume reduces per-winner prizes but NEVER
                  causes unbounded liability. The pari-mutuel system scales
                  automatically.
                </Callout>
              </div>

              {/* 3.4 Break-Even Analysis */}
              <div className="glass rounded-2xl p-5 sm:p-6">
                <h3 className="text-sm font-bold text-white mb-3">
                  3.4 Break-Even Analysis
                </h3>
                <p className="text-xs sm:text-sm text-gray-400 leading-relaxed mb-3">
                  For positive expected value during pari-mutuel rolldown:
                </p>
                <div className="p-3 rounded-xl bg-[#0a0f1a]/80 border border-white/5 mb-4">
                  <p className="text-sm font-mono text-white">
                    J/N + 0.3659 &gt; 2.50 →{" "}
                    <span className="text-emerald-light">N &lt; J / 2.134</span>
                  </p>
                </div>

                <p className="text-xs text-gray-400 mb-3">
                  The pari-mutuel system creates a natural volume-based
                  equilibrium. If fewer than J/2.134 tickets are sold during
                  rolldown, players have +EV.
                </p>

                <DataTable
                  headers={["Jackpot (J)", "Break-Even Volume (N)"]}
                  highlightCol={1}
                  rows={[
                    ["$1,750,000", "820,056 tickets"],
                    ["$2,000,000", "937,207 tickets"],
                    ["$2,250,000", "1,054,358 tickets"],
                  ]}
                />

                <div className="mt-4 p-3 rounded-xl bg-emerald/[0.03] border border-emerald/10">
                  <p className="text-[11px] text-gray-300 leading-relaxed">
                    <strong className="text-emerald-light">
                      Theorem 3.1 (Pari-Mutuel +EV Threshold):
                    </strong>{" "}
                    For rolldown events with jackpot J and fewer than J/2.509
                    tickets sold, players achieve ≥15% expected profit per
                    ticket.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ------------------------------------------------------------ */}
          {/*  Section 4: Prize & Rolldown Economics                        */}
          {/* ------------------------------------------------------------ */}
          <div>
            <SectionHeading
              number="4"
              title="Prize & Rolldown Economics"
              subtitle="Revenue flow, prize modes, and the rolldown distribution model"
              icon={DollarSign}
            />

            <div className="space-y-6">
              {/* Revenue Flow */}
              <div className="glass rounded-2xl p-5 sm:p-6">
                <h3 className="text-sm font-bold text-white mb-3">
                  4.1 Revenue Flow Architecture
                </h3>
                <p className="text-xs sm:text-sm text-gray-400 leading-relaxed mb-4">
                  Every $2.50 ticket is split between a dynamic house fee
                  (28–40%) and the prize pool (60–72%). The prize pool is
                  further allocated:
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  <StatCard
                    label="Jackpot"
                    value="55.6%"
                    sub="Growing pool"
                    icon={Trophy}
                  />
                  <StatCard
                    label="Fixed Prizes"
                    value="39.4%"
                    sub="Match 5/4/3"
                    icon={DollarSign}
                  />
                  <StatCard
                    label="Reserve"
                    value="3%"
                    sub="Buffer fund"
                    icon={Shield}
                  />
                  <StatCard
                    label="Insurance"
                    value="2%"
                    sub="Solvency protection"
                    icon={Lock}
                  />
                </div>

                <Callout variant="info" title="Dynamic House Fee">
                  The house fee adjusts based on the current jackpot tier — 28%
                  during rolldown (lowest), up to 40% at higher tiers. This
                  incentivizes participation during rolldown windows.
                </Callout>
              </div>

              {/* Prize Mode Transition */}
              <div className="glass rounded-2xl p-5 sm:p-6">
                <h3 className="text-sm font-bold text-white mb-3">
                  4.2 Prize Mode Transition System
                </h3>
                <DataTable
                  headers={["Mode", "When Active", "Prize Calculation"]}
                  rows={[
                    [
                      "FIXED",
                      "Normal draws, moderate volume",
                      "Predetermined amounts",
                    ],
                    [
                      "PARI-MUTUEL",
                      "Rolldown events, high-volume draws",
                      "Pool ÷ Winner Count (capped)",
                    ],
                  ]}
                />
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-bold text-gray-300">
                    Automatic Transition Triggers:
                  </p>
                  {[
                    "Rolldown event → All prizes become pari-mutuel",
                    "High-volume draw → (Winners × Fixed Prize) exceeds pool → transition",
                    "Multiple winners → Automatic pool sharing",
                  ].map((item) => (
                    <div
                      key={item}
                      className="flex items-start gap-2 text-xs text-gray-400"
                    >
                      <CheckCircle
                        size={12}
                        className="text-emerald shrink-0 mt-0.5"
                      />
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              {/* Rolldown Distribution */}
              <RolldownDistributionDiagram />

              {/* Rolldown Pari-Mutuel Example */}
              <div className="glass rounded-2xl p-5 sm:p-6">
                <h3 className="text-sm font-bold text-white mb-3">
                  4.3 Pari-Mutuel Distribution Example
                </h3>
                <p className="text-xs text-gray-400 leading-relaxed mb-4">
                  With a $1,750,000 jackpot and 700,000 tickets sold during
                  rolldown:
                </p>
                <DataTable
                  headers={[
                    "Tier",
                    "Pool Share",
                    "Pool Amount",
                    "Est. Winners",
                    "Est. Prize/Winner",
                  ]}
                  highlightCol={4}
                  rows={[
                    ["Match 5", "25%", "$437,500", "~18", "~$24,306"],
                    ["Match 4", "35%", "$612,500", "~875", "~$700"],
                    ["Match 3", "40%", "$700,000", "~14,763", "~$47"],
                  ]}
                />
                <p className="text-[10px] text-gray-500 mt-3">
                  Compare normal mode: Match 5 = $4,000, Match 4 = $150, Match 3
                  = $5. Rolldown prizes can be{" "}
                  <span className="font-bold text-emerald-light">
                    6× to 9× larger
                  </span>{" "}
                  than normal mode.
                </p>
              </div>

              {/* Risk Scenarios */}
              <div className="glass rounded-2xl p-5 sm:p-6">
                <h3 className="text-sm font-bold text-white mb-3">
                  4.4 Cycle Scenarios
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    {
                      title: "Jackpot Won Early",
                      desc: "If someone wins the jackpot before the cap, the jackpot is paid from the accumulated pool. No rolldown occurs — the cycle simply extends until the next cap is reached.",
                      icon: Trophy,
                    },
                    {
                      title: "Multiple Jackpot Winners",
                      desc: "If multiple players match all 6 numbers in one draw, the jackpot is split evenly among them. This is a dramatic but mathematically rare event.",
                      icon: Users,
                    },
                    {
                      title: "Extreme Rolldown Volume",
                      desc: "If a rolldown attracts very high ticket sales, per-winner prizes decrease via pari-mutuel — but the total payout is always capped at the jackpot.",
                      icon: BarChart3,
                    },
                    {
                      title: "Low Volume Period",
                      desc: "If daily volume drops significantly, cycles extend. The reserve fund and insurance pool provide a buffer while marketing drives recovery.",
                      icon: AlertTriangle,
                    },
                  ].map((s) => (
                    <div
                      key={s.title}
                      className="p-3 rounded-lg bg-white/[0.02] border border-white/5"
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <s.icon size={13} className="text-emerald-light/60" />
                        <p className="text-[11px] font-bold text-white">
                          {s.title}
                        </p>
                      </div>
                      <p className="text-[10px] text-gray-400 leading-relaxed">
                        {s.desc}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ------------------------------------------------------------ */}
          {/*  Section 5: Game Theory Analysis                              */}
          {/* ------------------------------------------------------------ */}
          <div>
            <SectionHeading
              number="5"
              title="Game Theory Analysis"
              subtitle="Player segmentation, Nash equilibrium, and mechanism design"
              icon={Users}
            />

            <div className="space-y-6">
              {/* Player Segmentation */}
              <div className="glass rounded-2xl p-5 sm:p-6">
                <h3 className="text-sm font-bold text-white mb-3">
                  5.1 Player Segmentation
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles size={14} className="text-gold" />
                      <p className="text-xs font-bold text-white">
                        Casual Players (70% of normal volume)
                      </p>
                    </div>
                    <ul className="space-y-1.5">
                      {[
                        "Motivation: Entertainment, jackpot dreams",
                        "Behavior: Play regardless of EV",
                        "Strategy: Quick picks, consistent participation",
                        "Outcome: Net negative (entertainment cost)",
                      ].map((item) => (
                        <li
                          key={item}
                          className="text-[10px] text-gray-400 flex items-start gap-1.5"
                        >
                          <span className="shrink-0 mt-1 w-1 h-1 rounded-full bg-gold/40" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="p-4 rounded-xl bg-emerald/[0.02] border border-emerald/10">
                    <div className="flex items-center gap-2 mb-2">
                      <Target size={14} className="text-emerald-light" />
                      <p className="text-xs font-bold text-white">
                        Sophisticated Players (30% normal, 80% rolldown)
                      </p>
                    </div>
                    <ul className="space-y-1.5">
                      {[
                        "Motivation: Profit maximization",
                        "Behavior: Heavy participation during +EV windows",
                        "Strategy: Wait for rolldowns, buy in volume",
                        "Outcome: Net positive during rolldowns",
                      ].map((item) => (
                        <li
                          key={item}
                          className="text-[10px] text-gray-400 flex items-start gap-1.5"
                        >
                          <CheckCircle
                            size={10}
                            className="shrink-0 mt-0.5 text-emerald/60"
                          />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              {/* Nash Equilibrium */}
              <div className="glass rounded-2xl p-5 sm:p-6">
                <h3 className="text-sm font-bold text-white mb-3">
                  5.2 Nash Equilibrium Analysis
                </h3>
                <p className="text-xs text-gray-400 leading-relaxed mb-3">
                  At equilibrium, the marginal entrant earns zero economic
                  profit. The equilibrium condition:
                </p>
                <div className="p-3 rounded-xl bg-[#0a0f1a]/80 border border-white/5 mb-4">
                  <p className="text-sm font-mono text-white text-center">
                    1,750,000 / N* + 0.3659 = 2.50 →{" "}
                    <span className="text-emerald-light">
                      N* ≈ 820,000 tickets
                    </span>
                  </p>
                </div>

                <p className="text-xs font-bold text-gray-300 mb-2">
                  Practical Implications:
                </p>
                <div className="space-y-2">
                  {[
                    "If current participation < 820k: More strategic players enter → approaching equilibrium",
                    "If current participation > 820k: Some strategic players exit → back toward equilibrium",
                    "System naturally gravitates toward equilibrium",
                  ].map((item) => (
                    <div
                      key={item}
                      className="flex items-start gap-2 text-[11px] text-gray-400"
                    >
                      <ArrowRight
                        size={11}
                        className="text-emerald/60 shrink-0 mt-0.5"
                      />
                      {item}
                    </div>
                  ))}
                </div>

                <div className="mt-4">
                  <p className="text-xs text-gray-400 leading-relaxed">
                    Several factors prevent perfect equilibrium: information
                    asymmetry (not all players calculate EV), transaction costs,
                    capital constraints, and risk aversion (EV ≠ certainty).
                  </p>
                </div>
              </div>

              {/* Mechanism Design */}
              <div className="glass rounded-2xl p-5 sm:p-6">
                <h3 className="text-sm font-bold text-white mb-3">
                  5.3 Mechanism Design Properties
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    {
                      title: "Incentive Compatibility",
                      desc: "Players are incentivized to reveal true preferences (buy when EV > 0)",
                    },
                    {
                      title: "Individual Rationality",
                      desc: "Participation is voluntary and beneficial for both parties in equilibrium",
                    },
                    {
                      title: "Budget Balance",
                      desc: "Protocol fees cover operational costs plus sustainability margin",
                    },
                    {
                      title: "Sybil Resistance",
                      desc: "Volume-based pari-mutuel pricing automatically adjusts to participation levels",
                    },
                  ].map((item) => (
                    <div
                      key={item.title}
                      className="flex items-start gap-2.5 p-3 rounded-lg bg-white/[0.02] border border-white/5"
                    >
                      <CheckCircle
                        size={13}
                        className="text-emerald shrink-0 mt-0.5"
                      />
                      <div>
                        <p className="text-[11px] font-bold text-white">
                          {item.title}
                        </p>
                        <p className="text-[10px] text-gray-500 mt-0.5">
                          {item.desc}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ------------------------------------------------------------ */}
          {/*  Section 6: Technical Implementation                          */}
          {/* ------------------------------------------------------------ */}
          <div>
            <SectionHeading
              number="6"
              title="Technical Implementation"
              subtitle="Smart contracts, randomness, and system architecture"
              icon={Code}
            />

            <div className="space-y-6">
              {/* Architecture */}
              <div>
                <h3 className="text-sm font-bold text-white mb-3">
                  6.1 System Architecture
                </h3>
                <Callout variant="info" title="Protocol Structure (v3.0)">
                  The protocol consists of two Anchor programs — the main
                  lottery (solana_lotto) and Quick Pick Express (quickpick).
                  There is no on-chain Governance DAO; the authority is a single
                  signer (multi-sig recommended) with an inline 24-hour config
                  timelock.
                </Callout>
                <div className="mt-4">
                  <ArchitectureDiagram />
                </div>
              </div>

              {/* Smart Contract: Ticket Module */}
              <div className="glass rounded-2xl p-5 sm:p-6">
                <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                  <Code size={14} className="text-emerald/60" />
                  6.2 Smart Contract — Ticket Module
                </h3>
                <p className="text-xs text-gray-400 leading-relaxed mb-3">
                  Handles all ticket purchases, validation, and storage. Key
                  validations include number range [1, 46], no duplicates, and
                  USDC transfer.
                </p>
                <CodeBlock>{`pub fn buy_ticket(
    ctx: Context<BuyTicket>,
    numbers: [u8; 6],
) -> Result<()> {
    // Validate numbers are in range [1, 46]
    require!(numbers.iter().all(|&n| n >= 1 && n <= 46), InvalidNumbers);

    // Validate no duplicates
    let mut sorted = numbers;
    sorted.sort();
    require!(sorted.windows(2).all(|w| w[0] != w[1]), DuplicateNumbers);

    // Transfer USDC from player to prize pool
    transfer_usdc(
        ctx.accounts.player_usdc,
        ctx.accounts.prize_pool_usdc,
        TICKET_PRICE, // 2,500,000 (2.5 USDC in 6 decimals)
    )?;

    // Allocate funds (dynamic fee based on jackpot tier)
    let house_fee_bps = calculate_house_fee_bps(
        lottery_state.jackpot_balance, false
    );
    // ... prize pool split & state updates
    Ok(())
}`}</CodeBlock>
              </div>

              {/* Account Structures */}
              <div className="glass rounded-2xl p-5 sm:p-6">
                <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                  <Database size={14} className="text-emerald/60" />
                  6.2.1 Core Account Structures
                </h3>
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-bold text-emerald-light mb-2">
                      LotteryState
                    </p>
                    <CodeBlock>{`#[account]
pub struct LotteryState {
    pub authority: Pubkey,        // Admin multi-sig
    pub current_draw_id: u64,     // Incrementing draw counter
    pub jackpot_balance: u64,     // Current jackpot (USDC lamports)
    pub reserve_balance: u64,     // Reserve fund
    pub insurance_balance: u64,   // Insurance pool
    pub ticket_price: u64,        // Price in USDC lamports (2,500,000)
    pub house_fee_bps: u16,       // Dynamic house fee (2800-4000)
    pub jackpot_cap: u64,         // Rolldown trigger ($1.75M)
    pub seed_amount: u64,         // Post-rolldown seed ($500k)
    pub total_tickets_sold: u64,  // Lifetime counter
    pub total_prizes_paid: u64,   // Lifetime payouts
    pub next_draw_timestamp: i64, // Scheduled next draw
    pub is_paused: bool,          // Emergency pause flag
    pub bump: u8,                 // PDA bump seed
}`}</CodeBlock>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-emerald-light mb-2">
                      Ticket
                    </p>
                    <CodeBlock>{`#[account]
pub struct Ticket {
    pub owner: Pubkey,             // Player wallet
    pub draw_id: u64,              // Which draw this ticket is for
    pub numbers: [u8; 6],          // Selected numbers (sorted)
    pub purchase_timestamp: i64,   // When purchased
    pub is_claimed: bool,          // Whether prize claimed
    pub prize_amount: u64,         // Prize won (0 if not calculated)
    pub match_count: u8,           // Numbers matched (0-6)
    pub syndicate: Option<Pubkey>, // Syndicate pool (if applicable)
}`}</CodeBlock>
                  </div>
                </div>
              </div>

              {/* Draw Module */}
              <div className="glass rounded-2xl p-5 sm:p-6">
                <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                  <Zap size={14} className="text-emerald/60" />
                  6.3 Smart Contract — Draw Module
                </h3>
                <p className="text-xs text-gray-400 leading-relaxed mb-3">
                  Executes draws using Switchboard&apos;s commit-reveal pattern
                  with TEE (Trusted Execution Environment) randomness.
                </p>
                <CodeBlock>{`pub fn execute_draw(ctx: Context<ExecuteDraw>) -> Result<()> {
    // Parse Switchboard randomness data
    let randomness_data = RandomnessAccountData::parse(
        ctx.accounts.randomness_account_data.data.borrow()
    )?;

    // Verify seed_slot matches commit
    require!(
        randomness_data.seed_slot == lottery_state.commit_slot,
        RandomnessExpired
    );

    // Get the revealed random value (32 bytes)
    let revealed = randomness_data
        .get_value(clock.slot)
        .map_err(|_| RandomnessNotResolved)?;

    // Convert 32 random bytes to 6 unique numbers [1, 46]
    // ... deterministic, verifiable number derivation

    // Check for rolldown condition
    let is_rolldown = state.jackpot_balance >= state.jackpot_cap;
    draw_result.was_rolldown = is_rolldown;

    Ok(())
}`}</CodeBlock>
              </div>

              {/* Rolldown Implementation */}
              <div className="glass rounded-2xl p-5 sm:p-6">
                <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                  <RefreshCw size={14} className="text-emerald/60" />
                  6.4 Rolldown Distribution Implementation
                </h3>
                <CodeBlock>{`fn trigger_rolldown_internal(
    state: &mut LotteryState,
    draw_result: &mut DrawResult,
    winner_counts: WinnerCounts,
) -> Result<()> {
    let jackpot = state.jackpot_balance;

    // Distribute jackpot to lower tiers (pari-mutuel)
    let match_5_pool = jackpot * 25 / 100; // 25%
    let match_4_pool = jackpot * 35 / 100; // 35%
    let match_3_pool = jackpot * 40 / 100; // 40%

    // Per-winner prizes (pool / winners)
    if winner_counts.match_5 > 0 {
        draw_result.match_5_prize =
            match_5_pool / winner_counts.match_5 as u64;
    }
    if winner_counts.match_4 > 0 {
        draw_result.match_4_prize =
            match_4_pool / winner_counts.match_4 as u64;
    }
    if winner_counts.match_3 > 0 {
        draw_result.match_3_prize =
            match_3_pool / winner_counts.match_3 as u64;
    }

    // Reset jackpot to seed
    state.jackpot_balance = state.seed_amount;
    Ok(())
}`}</CodeBlock>
              </div>

              {/* Prize Claim */}
              <div className="glass rounded-2xl p-5 sm:p-6">
                <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                  <Trophy size={14} className="text-emerald/60" />
                  6.5 Prize Claim Module
                </h3>
                <CodeBlock>{`pub fn claim_prize(ctx: Context<ClaimPrize>) -> Result<()> {
    let ticket = &mut ctx.accounts.ticket;
    let draw_result = &ctx.accounts.draw_result;

    require!(ticket.draw_id == draw_result.draw_id, WrongDraw);
    require!(!ticket.is_claimed, AlreadyClaimed);

    let matches = count_matches(
        &ticket.numbers,
        &draw_result.winning_numbers
    );

    let prize = match matches {
        6 => draw_result.match_6_prize,
        5 => draw_result.match_5_prize,
        4 => draw_result.match_4_prize,
        3 => draw_result.match_3_prize,
        2 => draw_result.match_2_prize, // Free ticket
        _ => 0,
    };

    ticket.prize_amount = prize;
    ticket.is_claimed = true;

    if prize > 0 {
        transfer_usdc(
            ctx.accounts.prize_pool_usdc,
            ctx.accounts.player_usdc,
            prize,
        )?;
    }
    Ok(())
}`}</CodeBlock>
              </div>

              {/* Randomness */}
              <div>
                <h3 className="text-sm font-bold text-white mb-3">
                  6.6 Randomness Generation
                </h3>
                <RandomnessFlow />
                <div className="mt-4 space-y-2">
                  {[
                    "Neither protocol nor oracle can predict randomness before commit",
                    "Commit-reveal pattern prevents selective revelation attacks",
                    "TEE ensures oracle cannot see or alter randomness inside the enclave",
                    "All proofs verifiable on-chain by anyone",
                  ].map((item) => (
                    <div
                      key={item}
                      className="flex items-start gap-2 text-xs text-gray-400"
                    >
                      <Shield
                        size={12}
                        className="text-emerald shrink-0 mt-0.5"
                      />
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              {/* Number Derivation */}
              <div className="glass rounded-2xl p-5 sm:p-6">
                <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                  <Hash size={14} className="text-emerald/60" />
                  6.7 Number Derivation Algorithm
                </h3>
                <CodeBlock>{`fn derive_lottery_numbers(random_words: [u64; 6]) -> [u8; 6] {
    let mut numbers: [u8; 6] = [0; 6];
    let mut available: Vec<u8> = (1..=46).collect();

    for i in 0..6 {
        // Use modulo to select from remaining numbers
        let index = (random_words[i]
            % available.len() as u64) as usize;
        numbers[i] = available.remove(index);
    }

    numbers.sort();
    numbers
}`}</CodeBlock>
                <div className="mt-3 space-y-1">
                  {[
                    "Each number is unique (no duplicates)",
                    "Each number is equally likely (uniform distribution)",
                    "Process is deterministic and verifiable",
                  ].map((item) => (
                    <div
                      key={item}
                      className="flex items-start gap-2 text-[11px] text-gray-400"
                    >
                      <CheckCircle
                        size={11}
                        className="text-emerald/60 shrink-0 mt-0.5"
                      />
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              {/* Data Indexing */}
              <div className="glass rounded-2xl p-5 sm:p-6">
                <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                  <Database size={14} className="text-emerald/60" />
                  6.8 Data Indexing Architecture
                </h3>
                <p className="text-xs text-gray-400 leading-relaxed mb-3">
                  An off-chain indexer service provides real-time data for the
                  application layer:
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                  {[
                    { label: "Solana Node", icon: Globe },
                    { label: "Geyser Plugin", icon: Cpu },
                    { label: "PostgreSQL", icon: Database },
                    { label: "GraphQL API", icon: Server },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center gap-1.5 p-2 rounded-lg bg-white/[0.02] border border-white/5"
                    >
                      <item.icon size={12} className="text-emerald/40" />
                      <span className="text-[10px] font-medium text-gray-300">
                        {item.label}
                      </span>
                    </div>
                  ))}
                </div>
                <CodeBlock>{`interface IndexerService {
    getTicketsForDraw(drawId: number): Promise<Ticket[]>;
    countWinners(
        drawId: number,
        winningNumbers: number[]
    ): Promise<WinnerCounts>;
    getPlayerTickets(wallet: PublicKey): Promise<Ticket[]>;
    getCurrentJackpot(): Promise<number>;
    getRolldownProbability(): Promise<number>;
}`}</CodeBlock>
              </div>
            </div>
          </div>

          {/* ------------------------------------------------------------ */}
          {/*  Section 7: Insurance & Fund Protection                       */}
          {/* ------------------------------------------------------------ */}
          <div>
            <SectionHeading
              number="7"
              title="Insurance & Fund Protection"
              subtitle="Multi-layered fund protection and solvency guarantees"
              icon={Shield}
            />

            <div className="space-y-6">
              {/* Overview */}
              <div className="glass rounded-2xl p-5 sm:p-6">
                <h3 className="text-sm font-bold text-white mb-3">
                  7.1 Overview
                </h3>
                <p className="text-xs sm:text-sm text-gray-400 leading-relaxed mb-4">
                  The SolanaLotto protocol implements a multi-layered fund
                  protection system designed to ensure prize pool solvency and
                  protect player funds during edge cases and emergencies:
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatCard
                    label="Reserve Fund"
                    value="3%"
                    sub="Jackpot seeding & shortfalls"
                    icon={Shield}
                  />
                  <StatCard
                    label="Insurance Pool"
                    value="2%"
                    sub="Emergency protection"
                    icon={Lock}
                  />
                  <StatCard
                    label="Total Buffer"
                    value="5%"
                    sub="Of all ticket sales"
                    icon={Star}
                  />
                  <StatCard
                    label="Coverage"
                    value="111%"
                    sub="Of max jackpot exposure"
                    icon={CheckCircle}
                  />
                </div>
              </div>

              {/* Fund Allocation */}
              <div className="glass rounded-2xl p-5 sm:p-6">
                <h3 className="text-sm font-bold text-white mb-3">
                  7.2 Fund Allocation Structure
                </h3>
                <CodeBlock>{`Ticket Price ($2.50 USDC)
├── House Fee (28-40%): Protocol operations
└── Prize Pool (60-72%):
    ├── Jackpot (55.6%): Main prize accumulation
    ├── Fixed Prizes (39.4%): Match 5/4/3 prizes
    ├── Reserve Fund (3.0%): Jackpot seeding buffer
    └── Insurance Pool (2.0%): Emergency protection`}</CodeBlock>
              </div>

              {/* Automatic Solvency */}
              <div className="glass rounded-2xl p-5 sm:p-6">
                <h3 className="text-sm font-bold text-white mb-3">
                  7.3 Automatic Solvency Protection
                </h3>
                <p className="text-xs text-gray-400 leading-relaxed mb-3">
                  During draw finalization, the protocol automatically checks
                  prize pool solvency and scales prizes if needed:
                </p>
                <DataTable
                  headers={["Priority", "Source", "Purpose"]}
                  rows={[
                    ["1st", "Jackpot Balance", "Primary prize fund"],
                    ["2nd", "Reserve Balance", "Auto-used for shortfalls"],
                    ["3rd", "Insurance Balance", "Emergency buffer"],
                    ["Last Resort", "Scale Prizes", "Proportional reduction"],
                  ]}
                />
              </div>

              {/* Emergency Transfer */}
              <div className="glass rounded-2xl p-5 sm:p-6">
                <h3 className="text-sm font-bold text-white mb-3">
                  7.4 Emergency Fund Transfer
                </h3>
                <p className="text-xs text-gray-400 leading-relaxed mb-3">
                  For catastrophic scenarios requiring manual intervention:
                </p>
                <div className="space-y-2 mb-3">
                  {[
                    "Multi-Sig Control: Emergency transfers require multi-sig authority signatures",
                    "Timelock Delay: 72-hour delay for transparency and community oversight",
                    "Audit Trail: All transfers emit on-chain events with detailed reasoning",
                    "Transparency: Transfer amounts and reasons are publicly visible",
                  ].map((item) => (
                    <div
                      key={item}
                      className="flex items-start gap-2 text-xs text-gray-400"
                    >
                      <Lock
                        size={11}
                        className="text-emerald/60 shrink-0 mt-0.5"
                      />
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              {/* Insurance Scenarios */}
              <div className="glass rounded-2xl p-5 sm:p-6">
                <h3 className="text-sm font-bold text-white mb-3">
                  7.5 Insurance Pool Usage Scenarios
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    {
                      title: "Catastrophic Prize Shortfall",
                      desc: "When combined jackpot + reserve is insufficient",
                    },
                    {
                      title: "Protocol Bug Recovery",
                      desc: "Funds needed to compensate players after bugs",
                    },
                    {
                      title: "Oracle Failure",
                      desc: "Randomness oracle failure requiring manual resolution",
                    },
                    {
                      title: "Extreme Market Conditions",
                      desc: "Black swan events affecting prize pool stability",
                    },
                  ].map((s) => (
                    <div
                      key={s.title}
                      className="p-3 rounded-lg bg-white/[0.02] border border-white/5"
                    >
                      <p className="text-[11px] font-bold text-white mb-1">
                        {s.title}
                      </p>
                      <p className="text-[10px] text-gray-500">{s.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Player Protection Guarantees */}
              <div className="glass rounded-2xl p-5 sm:p-6">
                <h3 className="text-sm font-bold text-white mb-3">
                  7.6 Player Protection Guarantees
                </h3>
                <div className="space-y-2">
                  {[
                    "Fund Segregation: Player funds are never commingled with protocol funds",
                    "Transparent Accounting: All balances are publicly verifiable on-chain",
                    "Emergency Safeguards: Multi-sig control prevents unilateral fund movement",
                    "Automatic Protection: Prize scaling prevents complete insolvency",
                    "Audit Trail: All fund movements are permanently recorded",
                  ].map((item) => (
                    <div
                      key={item}
                      className="flex items-start gap-2 text-xs text-gray-400"
                    >
                      <CheckCircle
                        size={12}
                        className="text-emerald shrink-0 mt-0.5"
                      />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ------------------------------------------------------------ */}
          {/*  Section 8: Security Considerations                           */}
          {/* ------------------------------------------------------------ */}
          <div>
            <SectionHeading
              number="8"
              title="Security Considerations"
              subtitle="Threat model, access control, and protocol invariants"
              icon={Lock}
            />

            <div className="space-y-6">
              {/* Threat Model */}
              <div className="glass rounded-2xl p-5 sm:p-6">
                <h3 className="text-sm font-bold text-white mb-3">
                  8.1 Threat Model
                </h3>
                <DataTable
                  headers={["Threat", "Attack Vector", "Mitigation"]}
                  rows={[
                    [
                      "RNG Manipulation",
                      "Compromised oracle",
                      "Switchboard TEE ensures oracle cannot see/alter randomness",
                    ],
                    [
                      "Selective Revelation",
                      "Only reveal favorable outcomes",
                      "Commit-reveal pattern — must commit before randomness known",
                    ],
                    [
                      "Front-Running",
                      "MEV bots see winning numbers",
                      "Ticket sales close before commit; 10-slot reveal window",
                    ],
                    [
                      "Smart Contract Exploit",
                      "Code vulnerability",
                      "Multiple audits, formal verification, bug bounty",
                    ],
                    [
                      "Authority Abuse",
                      "Malicious config change",
                      "24-hour config timelock; two-step authority transfer; permissionless solvency checks",
                    ],
                    [
                      "Oracle Manipulation",
                      "Fake winner counts",
                      "SHA256 verification hash; statistical plausibility checks",
                    ],
                    [
                      "Sybil Attack",
                      "Fake volume inflation",
                      "USDC payment requirement, per-user ticket limits (5000/draw)",
                    ],
                    [
                      "Denial of Service",
                      "Transaction spam",
                      "Priority fee market, rate limiting",
                    ],
                  ]}
                />
              </div>

              {/* Access Control */}
              <div className="glass rounded-2xl p-5 sm:p-6">
                <h3 className="text-sm font-bold text-white mb-3">
                  8.2 Access Control Matrix
                </h3>
                <Callout variant="info">
                  There is no on-chain DAO. Authority is a single signer
                  (multi-sig wallet recommended).
                </Callout>
                <div className="mt-3">
                  <DataTable
                    headers={[
                      "Function",
                      "Public",
                      "Ticket Holder",
                      "Authority",
                    ]}
                    rows={[
                      ["Buy ticket", "✓", "✓", "✓"],
                      ["Claim prize", "", "✓", ""],
                      ["Check solvency", "✓", "✓", "✓"],
                      ["Commit/execute draw", "", "", "✓"],
                      ["Finalize draw", "", "", "✓"],
                      ["Propose config (24h timelock)", "", "", "✓"],
                      ["Execute config (after timelock)", "", "", "✓"],
                      ["Emergency pause", "", "", "✓"],
                      ["Emergency fund transfer", "", "", "✓ (daily cap)"],
                    ]}
                  />
                </div>
              </div>

              {/* Invariants */}
              <div className="glass rounded-2xl p-5 sm:p-6">
                <h3 className="text-sm font-bold text-white mb-3">
                  8.3 Protocol Invariants
                </h3>
                <p className="text-xs text-gray-400 leading-relaxed mb-3">
                  The protocol maintains these invariants at all times:
                </p>
                <div className="space-y-3">
                  {[
                    {
                      title: "Conservation of Value",
                      formula:
                        "Total_Deposits = Jackpot + Reserve + Insurance + Prizes_Paid + House_Fees_Withdrawn",
                    },
                    {
                      title: "Ticket Uniqueness",
                      formula: "∀ ticket: ticket.draw_id ≤ current_draw_id",
                    },
                    {
                      title: "Prize Bounds",
                      formula: "∀ ticket: ticket.prize_amount ≤ jackpot_cap",
                    },
                    {
                      title: "Temporal Ordering",
                      formula:
                        "ticket.purchase_timestamp < draw.execution_timestamp",
                    },
                  ].map((inv) => (
                    <div
                      key={inv.title}
                      className="p-3 rounded-lg bg-[#0a0f1a]/60 border border-white/5"
                    >
                      <p className="text-[11px] font-bold text-white mb-1">
                        {inv.title}
                      </p>
                      <p className="text-[10px] font-mono text-emerald-light/70">
                        {inv.formula}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Audit Checklist */}
              <div className="glass rounded-2xl p-5 sm:p-6">
                <h3 className="text-sm font-bold text-white mb-3">
                  8.4 Audit Checklist
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    "Reentrancy protection on all external calls",
                    "Integer overflow/underflow checks",
                    "Access control on privileged functions",
                    "Proper PDA derivation and validation",
                    "Account ownership verification",
                    "Signer verification",
                    "Rent exemption handling",
                    "CPI (Cross-Program Invocation) validation",
                    "Event emission for all state changes",
                    "Emergency pause functionality",
                  ].map((item) => (
                    <div
                      key={item}
                      className="flex items-start gap-2 text-[11px] text-gray-400"
                    >
                      <div className="shrink-0 mt-0.5 w-3.5 h-3.5 rounded border border-white/10 flex items-center justify-center">
                        <CheckCircle size={9} className="text-emerald/40" />
                      </div>
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ------------------------------------------------------------ */}
          {/*  Section 9: Conclusion                                        */}
          {/* ------------------------------------------------------------ */}
          <div>
            <SectionHeading
              number="9"
              title="Conclusion"
              subtitle="Summary, key innovations, and future directions"
              icon={Star}
            />

            <div className="space-y-6">
              <div className="glass rounded-2xl p-5 sm:p-6">
                <h3 className="text-sm font-bold text-white mb-3">
                  9.1 Summary
                </h3>
                <p className="text-xs sm:text-sm text-gray-400 leading-relaxed">
                  SolanaLotto represents a paradigm shift in lottery design by
                  embracing, rather than hiding, the mathematical realities of
                  probability games. The rolldown mechanism creates a unique
                  value proposition: for casual players, entertainment with
                  transparent odds and the excitement of rolldown events; for
                  sophisticated players, predictable +EV windows for strategic
                  participation.
                </p>
              </div>

              <div className="glass rounded-2xl p-5 sm:p-6">
                <h3 className="text-sm font-bold text-white mb-3">
                  9.2 Key Innovations
                </h3>
                <DataTable
                  headers={["Innovation", "Impact"]}
                  rows={[
                    [
                      "Intentional +EV Windows",
                      "Attracts sophisticated capital, increases volume",
                    ],
                    [
                      "On-Chain Transparency",
                      "Builds trust, enables verification",
                    ],
                    [
                      "Rolldown Mechanism",
                      "Creates unique game dynamics unavailable elsewhere",
                    ],
                    ["Syndicate System", "Community pooling and collaboration"],
                    [
                      "MEV Protection",
                      "Fair participation for all players via commit-reveal",
                    ],
                    [
                      "Pari-Mutuel Transition",
                      "Automatic liability capping during high-volume events",
                    ],
                  ]}
                />
              </div>

              <div className="glass rounded-2xl p-5 sm:p-6">
                <h3 className="text-sm font-bold text-white mb-3">
                  9.3 Future Directions
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    "Cross-chain expansion (Arbitrum, Base, other L2s)",
                    "Additional game modes beyond Quick Pick",
                    "Prediction market integration",
                    "Insurance products for players",
                    "White-label platform for other projects",
                  ].map((item) => (
                    <div
                      key={item}
                      className="flex items-start gap-2 text-xs text-gray-400"
                    >
                      <ArrowRight
                        size={12}
                        className="text-emerald/60 shrink-0 mt-0.5"
                      />
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              {/* CTA */}
              <div className="glass rounded-2xl p-5 sm:p-6 border border-emerald/10">
                <h3 className="text-sm font-bold text-white mb-3">
                  9.4 Get Involved
                </h3>
                <p className="text-xs text-gray-400 leading-relaxed mb-4">
                  SolanaLotto invites participation from:
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    {
                      icon: Code,
                      title: "Developers",
                      desc: "Contribute to open-source protocol",
                    },
                    {
                      icon: Shield,
                      title: "Auditors",
                      desc: "Review and improve security",
                    },
                    {
                      icon: Sparkles,
                      title: "Players",
                      desc: "Participate in fair, transparent lottery",
                    },
                    {
                      icon: Users,
                      title: "Syndicates",
                      desc: "Pool resources for strategic play",
                    },
                    {
                      icon: BookOpen,
                      title: "Researchers",
                      desc: "Study novel mechanism design",
                    },
                    {
                      icon: Globe,
                      title: "Community",
                      desc: "Help shape the protocol's future",
                    },
                  ].map((item) => (
                    <div
                      key={item.title}
                      className="p-3 rounded-lg bg-white/[0.02] border border-white/5 text-center"
                    >
                      <item.icon
                        size={16}
                        className="text-emerald mx-auto mb-1.5 opacity-60"
                      />
                      <p className="text-[11px] font-bold text-white">
                        {item.title}
                      </p>
                      <p className="text-[9px] text-gray-500 mt-0.5">
                        {item.desc}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ------------------------------------------------------------ */}
          {/*  Section 10: References & Appendices                          */}
          {/* ------------------------------------------------------------ */}
          <div>
            <SectionHeading
              number="10"
              title="References & Appendices"
              subtitle="Academic references, probability tables, and glossary"
              icon={FileText}
            />

            <div className="space-y-6">
              {/* References */}
              <div className="glass rounded-2xl p-5 sm:p-6">
                <h3 className="text-sm font-bold text-white mb-3">
                  10.1 References
                </h3>
                <ol className="space-y-2 list-decimal list-inside">
                  {[
                    'Selbee, G. (2018). "Cracking the Lottery Code: How a Retired Couple Won $26 Million." 60 Minutes Interview.',
                    'Massachusetts State Lottery Commission. (2012). "Cash WinFall Game Rules and Procedures."',
                    'Switchboard Labs. (2024). "Switchboard Randomness Documentation." docs.switchboard.xyz',
                    'Solana Foundation. (2024). "Solana Program Library (SPL) Specification."',
                    'Buterin, V. et al. (2014). "A Next-Generation Smart Contract and Decentralized Application Platform."',
                    "Malkiel, B. (2019). A Random Walk Down Wall Street. W. W. Norton & Company.",
                    "von Neumann, J. & Morgenstern, O. (1944). Theory of Games and Economic Behavior.",
                    "Thaler, R. & Sunstein, C. (2008). Nudge: Improving Decisions About Health, Wealth, and Happiness.",
                  ].map((ref) => (
                    <li
                      key={ref}
                      className="text-[11px] text-gray-400 leading-relaxed"
                    >
                      {ref}
                    </li>
                  ))}
                </ol>
              </div>

              {/* Appendix A: Probability Tables */}
              <div className="glass rounded-2xl p-5 sm:p-6">
                <h3 className="text-sm font-bold text-white mb-3">
                  Appendix A: Full Probability Tables (6/46 Matrix)
                </h3>
                <DataTable
                  headers={[
                    "Match",
                    "Combinations",
                    "Probability",
                    "Cumulative",
                  ]}
                  highlightCol={2}
                  rows={[
                    ["6", "1", "0.000000107", "0.000000107"],
                    ["5", "240", "0.0000256", "0.0000257"],
                    ["4", "11,700", "0.00125", "0.00128"],
                    ["3", "197,600", "0.02110", "0.02238"],
                    ["2", "1,370,850", "0.14634", "0.16872"],
                    ["1", "3,948,048", "0.42153", "0.59025"],
                    ["0", "3,838,380", "0.40982", "1.000"],
                  ]}
                />
                <p className="text-[10px] text-gray-500 mt-3 text-center font-bold">
                  Total: 9,366,819 combinations
                </p>
              </div>

              {/* Appendix B: Contract Addresses */}
              <div className="glass rounded-2xl p-5 sm:p-6">
                <h3 className="text-sm font-bold text-white mb-3">
                  Appendix B: Smart Contract Addresses
                </h3>
                <DataTable
                  headers={["Program", "Address", "Network"]}
                  rows={[
                    ["Main Lottery (solana_lotto)", "7WyaH...6FiF", "Devnet"],
                    ["Quick Pick Express", "7XC1K...nZK2", "Devnet"],
                  ]}
                />
                <p className="text-[10px] text-gray-500 mt-3">
                  Mainnet addresses TBD after audit and deployment. All logic
                  lives within these two programs — no separate contracts.
                </p>
              </div>

              {/* Appendix C: Glossary */}
              <div className="glass rounded-2xl p-5 sm:p-6">
                <h3 className="text-sm font-bold text-white mb-3">
                  Appendix C: Glossary
                </h3>
                <DataTable
                  headers={["Term", "Definition"]}
                  rows={[
                    [
                      "EV (Expected Value)",
                      "The average outcome of a bet if repeated infinitely",
                    ],
                    [
                      "Rolldown",
                      "Distribution of jackpot to lower tiers when unclaimed",
                    ],
                    [
                      "Pari-Mutuel",
                      "Prize pool divided equally among all winners in a tier",
                    ],
                    [
                      "TEE",
                      "Trusted Execution Environment — secure hardware enclave",
                    ],
                    [
                      "Commit-Reveal",
                      "Pattern where user commits before randomness is known",
                    ],
                    [
                      "Matrix",
                      "The lottery format (e.g., 6/46 = pick 6 from 46)",
                    ],
                    [
                      "Seed",
                      "The initial jackpot amount after reset ($500,000)",
                    ],
                    [
                      "Cap",
                      "Maximum jackpot before rolldown triggers ($1.75M–$2.25M)",
                    ],
                    [
                      "PDA",
                      "Program Derived Address — deterministic Solana account address",
                    ],
                    [
                      "BPS",
                      "Basis points — 1/100th of a percent (10000 = 100%)",
                    ],
                  ]}
                />
              </div>
            </div>
          </div>

          {/* ------------------------------------------------------------ */}
          {/*  Version & Authoring                                          */}
          {/* ------------------------------------------------------------ */}
          <div className="text-center pt-8 border-t border-white/5">
            <p className="text-xs text-gray-600">
              Document Version: 3.0 • Last Updated: 2025
            </p>
            <p className="text-xs text-gray-600 mt-1">
              SolanaLotto Protocol Team
            </p>
            <p className="text-[10px] text-gray-700 mt-3">
              © 2025 SolanaLotto Protocol — Building the future of fair,
              transparent, and mathematically sound lotteries.
            </p>
          </div>

          {/* ------------------------------------------------------------ */}
          {/*  Navigation                                                    */}
          {/* ------------------------------------------------------------ */}
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <Link
              to="/learn/rolldown"
              className="flex-1 glass rounded-xl p-4 hover:border-emerald/20 transition-all group text-center"
            >
              <p className="text-[10px] text-gray-500 mb-1">← Learn More</p>
              <p className="text-sm font-bold text-white group-hover:text-emerald-light transition-colors">
                How Rolldown Works
              </p>
            </Link>
            <Link
              to="/play/quick-pick"
              className="flex-1 glass rounded-xl p-4 hover:border-emerald/20 transition-all group text-center"
            >
              <p className="text-[10px] text-gray-500 mb-1">Try It →</p>
              <p className="text-sm font-bold text-white group-hover:text-emerald-light transition-colors">
                Quick Pick Express
              </p>
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
