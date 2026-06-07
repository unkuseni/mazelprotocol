import {
  ArrowRight,
  BarChart3,
  CheckCircle,
  Eye,
  Lock,
  type LucideIcon,
  Shield,
  Sparkles,
  TrendingUp,
  Trophy,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import { Link } from "react-router-dom";
import { CountdownTimer } from "@/components/CountdownTimer";
import { EVBadge, EVCalculator } from "@/components/EVCalculator";
import { JackpotDisplay } from "@/components/JackpotDisplay";
import { FloatingBalls, LotteryBallRow } from "@/components/LotteryBalls";
import { ProbabilityTimeline } from "@/components/ProbabilityTimeline";
import { RolldownGauge } from "@/components/RolldownGauge";
import { useLotteryState } from "@/hooks/use-lottery-state";
import { useAppKit, useAppKitAccount } from "@/lib/appkit-provider";

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

const features = [
  {
    icon: TrendingUp,
    title: "Predictable +EV Windows",
    description:
      "Our probabilistic rolldown system creates mathematically provable positive expected value windows. When the jackpot reaches the soft cap, the edge flips in your favor.",
    highlight: true,
  },
  {
    icon: Shield,
    title: "Provably Fair",
    description:
      "Switchboard TEE-based randomness with commit-reveal pattern. Every draw is verifiable on-chain — no black boxes, no trust required.",
  },
  {
    icon: Users,
    title: "Syndicate System",
    description:
      "Pool capital with other players to reduce variance. On-chain syndicates with automatic prize splitting and monthly Syndicate Wars competition.",
  },
  {
    icon: BarChart3,
    title: "Pari-Mutuel Protection",
    description:
      "Fixed prizes during normal mode transition to pari-mutuel during rolldowns. Operator liability is always capped — the protocol is mathematically sustainable.",
  },
  {
    icon: Wallet,
    title: "Non-Custodial",
    description:
      "Funds stay in your wallet. Tickets, prizes, and claims are all on-chain. No deposits, no withdrawals — just direct wallet-to-protocol interaction.",
  },
  {
    icon: Zap,
    title: "Quick Pick Express",
    description:
      "A faster 5/35 game with draws every 4 hours. Lower stakes ($1.50/ticket), faster cycles, and a separate rolldown system with its own +EV windows.",
  },
];

const prizeTiers = [
  { match: "Match 5", prize: "$28,000", odds: "1 in 39,028", rolldown: "~$46,000*", color: "gold" as const },
  { match: "Match 4", prize: "$800", odds: "1 in 800", rolldown: "~$1,330*", color: "emerald" as const },
  { match: "Match 3", prize: "$18", odds: "1 in 47", rolldown: "~$90*", color: "muted" as const },
  { match: "Match 2", prize: "Free Ticket", odds: "1 in 6.8", rolldown: "Free Ticket", color: "muted" as const },
];

const trustBadges = [
  { icon: Eye, title: "On-Chain Verification", description: "Every ticket, draw, and prize distribution is recorded on Solana and publicly auditable." },
  { icon: Shield, title: "Switchboard VRF", description: "Trusted Execution Environment randomness — even oracle operators cannot manipulate results." },
  { icon: CheckCircle, title: "Solvency Checks", description: "Permissionless solvency verification — anyone can confirm the protocol has funds to pay all prizes." },
  { icon: Lock, title: "Timelock Security", description: "24-hour timelock on all configuration changes. Two-step authority transfer prevents accidental control loss." },
];

const rolldownSteps = [
  { step: "01", title: "Jackpot Builds", description: "Every $2.50 ticket grows the jackpot. 55.6% goes to prizes, 39.4% to fixed payouts, 5% to safety reserves." },
  { step: "02", title: "Soft Cap Reached ($1.75M)", description: "Probabilistic rolldown becomes possible. Each draw has a chance to trigger full jackpot distribution." },
  { step: "03", title: "Probability Rises", description: "The chance increases linearly as the jackpot grows. At $2M, there's a ~50% chance of rolldown each draw." },
  { step: "04", title: "Hard Cap ($2.25M) — Forced Rolldown", description: "100% guaranteed. The entire jackpot distributes via pari-mutuel. Player edge reaches +104% under optimal conditions." },
];

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                            */
/* -------------------------------------------------------------------------- */

function FeatureCard({
  icon: Icon,
  title,
  description,
  highlight,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`group relative rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1 ${highlight
        ? "bg-linear-to-br from-gold-500/8 via-gold-500/3 to-transparent border border-gold-500/15 glow-gold hover:border-gold-500/30"
        : "bg-surface-1/50 border border-border hover:border-gold-500/15 hover:bg-surface-2/50"
        }`}
    >
      <div
        className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 transition-colors ${highlight
          ? "bg-gold-500/15 text-gold-400"
          : "bg-surface-2 text-muted-foreground group-hover:text-gold-400 group-hover:bg-gold-500/10"
          }`}
      >
        <Icon size={20} />
      </div>
      <h3 className="text-sm sm:text-base font-bold mb-2 text-foreground">{title}</h3>
      <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
        {description}
      </p>
      {highlight && (
        <div className="absolute top-4 right-4">
          <Sparkles size={16} className="text-gold-400 animate-pulse" />
        </div>
      )}
    </div>
  );
}

function HeroSection({
  jackpotDollars,
  rolldownActive,
  loading,
}: {
  jackpotDollars: number;
  rolldownActive: boolean;
  loading: boolean;
}) {
  const { open } = useAppKit();
  const { isConnected } = useAppKitAccount();

  return (
    <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 bg-linear-to-b from-background via-transparent to-background pointer-events-none" />
      <FloatingBalls count={12} className="opacity-30" />
      <div className="absolute top-1/4 left-1/4 w-125 h-125 bg-gold-500/3 rounded-full blur-[150px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-125 h-125 bg-emerald-500/3 rounded-full blur-[150px] pointer-events-none" />
      {/* Hero grid pattern */}
      <div className="absolute inset-0 hero-grid opacity-50 pointer-events-none" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-gold-500/8 border border-gold-500/15 mb-8 animate-pulse-glow">
          <div className="w-2 h-2 rounded-full bg-gold-400" />
          <span className="text-xs font-bold text-gold-400 uppercase tracking-[0.2em]">
            Live on Solana
          </span>
        </div>

        {/* Main heading */}
        <h1
          className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-black tracking-tight text-foreground leading-none mb-6 font-display"
        >
          The First{" "}
          <span className="text-gradient-gold">+EV Lottery</span>
          <br />
          <span className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-medium text-muted-foreground">
            Built on Solana
          </span>
        </h1>

        <p className="max-w-2xl mx-auto text-base sm:text-lg text-muted-foreground leading-relaxed mb-10">
          MazelProtocol creates predictable windows of{" "}
          <span className="text-emerald-light font-semibold">
            positive expected value
          </span>{" "}
          through mathematical rolldown mechanics. When the jackpot reaches the
          soft cap, the edge flips — the math works in your favor.
        </p>

        {/* Live jackpot */}
        <div className="max-w-lg mx-auto mb-10">
          <JackpotDisplay
            amount={jackpotDollars}
            animated
            size="lg"
            glow={jackpotDollars >= 1_575_000}
            showRolldownStatus
            rolldownActive={rolldownActive}
            softCap={1_750_000}
          />
          {rolldownActive && (
            <div className="mt-3">
              <EVBadge
                jackpotAmount={jackpotDollars}
                rolldownActive={rolldownActive}
                loading={loading}
              />
            </div>
          )}
        </div>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
          <button
            type="button"
            onClick={() => (isConnected ? null : open?.())}
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-linear-to-b from-gold-400 to-gold-600 text-black font-bold text-lg shadow-lg shadow-gold-500/25 hover:shadow-gold-500/40 transition-all hover:-translate-y-0.5 active:translate-y-0"
          >
            {isConnected ? (
              <Link to="/play" className="flex items-center gap-2">
                Play Now <ArrowRight size={20} />
              </Link>
            ) : (
              <>
                <Wallet size={20} />
                Connect Wallet
                <ArrowRight size={20} />
              </>
            )}
          </button>

          <Link
            to="/learn/rolldown"
            className="inline-flex items-center gap-2 px-6 py-4 rounded-xl border border-gold-500/20 hover:border-gold-500/40 text-muted-foreground hover:text-foreground font-semibold transition-all"
          >
            How It Works
            <ArrowRight size={18} />
          </Link>
        </div>

        {/* Countdown */}
        <CountdownTimer size="sm" showUrgency />
      </div>
    </section>
  );
}

function PrizeTiersSection() {
  return (
    <section className="py-16 sm:py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-foreground mb-4 font-display">
              Prize Structure
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground max-w-xl mx-auto">
              Fixed prizes during normal mode transition to pari-mutuel during
              rolldown events. Estimated rolldown prizes assume ~475k tickets.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {prizeTiers.map((tier) => (
              <div
                key={tier.match}
                className="relative rounded-2xl p-6 card-premium text-center hover:border-gold-500/15 transition-colors"
              >
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  {tier.match}
                </p>
                <div className="mb-3">
                  <LotteryBallRow
                    numbers={Array.from(
                      { length: tier.match === "Match 5" ? 5 : tier.match === "Match 4" ? 4 : tier.match === "Match 3" ? 3 : 2 },
                      (_, i) => i + 1,
                    )}
                    size="sm"
                    variant={tier.color}
                    animated={false}
                    className="justify-center"
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-lg font-bold text-foreground">
                    {tier.prize}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Rolldown: <span className="text-gold-400 font-semibold">{tier.rolldown}</span>
                  </p>
                  <p className="text-[10px] text-muted-foreground/60">
                    {tier.odds}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <p className="text-center text-[10px] sm:text-xs text-muted-foreground/50 mt-4">
            *Rolldown prizes are pari-mutuel estimates. Actual = Pool ÷ Winners.
          </p>
        </div>
      </div>
    </section>
  );
}

function HowItWorksSection() {
  return (
    <section className="py-16 sm:py-20 bg-muted/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-foreground mb-4 font-display">
              How Rolldown Works
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground max-w-xl mx-auto">
              A four-phase cycle that turns the lottery math in your favor.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {rolldownSteps.map((step, i) => (
              <div
                key={step.step}
                className="relative rounded-2xl p-6 card-premium"
              >
                <div className="text-2xl font-black text-gold-400/20 mb-3">
                  {step.step}
                </div>
                <h3 className="text-sm font-bold text-foreground mb-2">
                  {step.title}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {step.description}
                </p>
                {i < rolldownSteps.length - 1 && (
                  <div className="hidden md:block absolute -right-3 top-1/2 -translate-y-1/2 text-gold-400/20">
                    <ArrowRight size={20} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function RolldownLiveSection({
  jackpotDollars,
  rolldownActive,
  loading,
}: {
  jackpotDollars: number;
  rolldownActive: boolean;
  loading: boolean;
}) {
  return (
    <section className="py-16 sm:py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-foreground mb-4">
              Live Rolldown Monitor
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground">
              Track the jackpot's progress toward rolldown in real-time.
            </p>
          </div>

          <RolldownGauge
            jackpotAmount={jackpotDollars}
            rolldownActive={rolldownActive}
            loading={loading}
          />
        </div>
      </div>
    </section>
  );
}

function EVSection({
  jackpotDollars,
  rolldownActive,
  loading,
}: {
  jackpotDollars: number;
  rolldownActive: boolean;
  loading: boolean;
}) {
  return (
    <section className="py-16 sm:py-20 bg-muted/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-foreground mb-4">
              Calculate Your Edge
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground max-w-xl mx-auto">
              Use the interactive calculator to see your expected value based on
              current jackpot and estimated ticket volume.
            </p>
          </div>

          <EVCalculator
            jackpotAmount={jackpotDollars}
            rolldownActive={rolldownActive}
            loading={loading}
          />
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section className="py-16 sm:py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-foreground mb-4">
            Why MazelProtocol?
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground max-w-xl mx-auto">
            A fundamentally different approach to lottery economics.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((f) => (
            <FeatureCard key={f.title} {...f} />
          ))}
        </div>
      </div>
    </section>
  );
}

function TrustSection() {
  return (
    <section className="py-16 sm:py-20 bg-muted/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-foreground mb-4">
            Trust Through Transparency
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground max-w-xl mx-auto">
            Every aspect of the protocol is verifiable on-chain. No trust required.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {trustBadges.map((badge) => {
            const Icon = badge.icon;
            return (
              <div
                key={badge.title}
                className="flex gap-4 p-5 rounded-2xl card-premium"
              >
                <div className="w-10 h-10 rounded-xl bg-gold-500/10 flex items-center justify-center shrink-0">
                  <Icon size={20} className="text-gold-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground mb-1">
                    {badge.title}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {badge.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function TimelineSection({ jackpotDollars, loading }: { jackpotDollars: number; loading: boolean }) {
  return (
    <section className="py-16 sm:py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-foreground mb-4">
              The Rolldown Timeline
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground">
              See how probability evolves as the jackpot grows.
            </p>
          </div>

          <ProbabilityTimeline currentJackpot={jackpotDollars} loading={loading} />
        </div>
      </div>
    </section>
  );
}

function CtaSection({ rolldownActive }: { rolldownActive: boolean }) {
  const { open } = useAppKit();
  const { isConnected } = useAppKitAccount();

  return (
    <section className="py-16 sm:py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto text-center">
          <div className="rounded-3xl p-6 sm:p-10 lg:p-14 bg-linear-to-br from-gold-500/8 via-surface-1/50 to-emerald-500/5 border border-gold-500/15 glow-gold">
            <Trophy size={32} className="mx-auto mb-4 text-gold-400 sm:size-10 lg:size-12" />
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-foreground mb-4 font-display">
              {rolldownActive
                ? "The +EV Window Is Open"
                : "Ready to Play?"}
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground mb-8 max-w-md mx-auto">
              {rolldownActive
                ? "The rolldown window is open — a mathematically proven advantage for players. Play now while conditions are optimal."
                : "Every ticket brings the jackpot closer to rolldown. Start playing and be ready when the edge flips."}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              {isConnected ? (
                <Link
                  to="/play"
                  className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-linear-to-b from-gold-400 to-gold-600 text-black font-bold text-lg shadow-lg shadow-gold-500/25 hover:shadow-gold-500/40 transition-all hover:-translate-y-0.5"
                >
                  <Trophy size={20} />
                  Buy Tickets
                  <ArrowRight size={20} />
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => open?.()}
                  className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-linear-to-b from-gold-400 to-gold-600 text-black font-bold text-lg shadow-lg shadow-gold-500/25 hover:shadow-gold-500/40 transition-all hover:-translate-y-0.5"
                >
                  <Wallet size={20} />
                  Connect Wallet
                  <ArrowRight size={20} />
                </button>
              )}
              <Link
                to="/learn/whitepaper"
                className="inline-flex items-center gap-2 px-6 py-4 rounded-xl border border-gold-500/20 hover:border-gold-500/40 text-muted-foreground hover:text-foreground font-semibold transition-all"
              >
                Read the Whitepaper
                <ArrowRight size={18} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main Page                                                                 */
/* -------------------------------------------------------------------------- */

export default function LandingPage() {
  const { jackpotDollars, rolldownActive, loading } = useLotteryState();

  return (
    <div className="min-h-screen">
      <HeroSection
        jackpotDollars={jackpotDollars}
        rolldownActive={rolldownActive}
        loading={loading}
      />

      <PrizeTiersSection />

      <HowItWorksSection />

      <RolldownLiveSection
        jackpotDollars={jackpotDollars}
        rolldownActive={rolldownActive}
        loading={loading}
      />

      <EVSection
        jackpotDollars={jackpotDollars}
        rolldownActive={rolldownActive}
        loading={loading}
      />

      <TimelineSection jackpotDollars={jackpotDollars} loading={loading} />

      <FeaturesSection />

      <TrustSection />

      <CtaSection rolldownActive={rolldownActive} />

    </div>
  );
}
