import { createFileRoute, Link } from "@tanstack/react-router";
import {
  TrendingUp,
  Shield,
  Users,
  Coins,
  Clock,
  Lock,
  Sparkles,
  Trophy,
  Zap,
  ArrowRight,
  CheckCircle,
  BarChart3,
  Target,
  Eye,
  Gem,
  Star,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { JackpotDisplay } from "@/components/JackpotDisplay";
import {
  CountdownTimer,
  QuickPickCountdown,
} from "@/components/CountdownTimer";
import { LotteryBallRow, FloatingBalls } from "@/components/LotteryBalls";
import Footer from "@/components/Footer";

export const Route = createFileRoute("/")({ component: LandingPage });

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                            */
/* -------------------------------------------------------------------------- */

interface FeatureCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  highlight?: boolean;
}

function FeatureCard({
  icon: Icon,
  title,
  description,
  highlight,
}: FeatureCardProps) {
  return (
    <div
      className={`
        group relative rounded-2xl p-6 transition-all duration-300
        hover:translate-y-[-2px]
        ${
          highlight
            ? "bg-gradient-to-br from-emerald/10 via-emerald/5 to-transparent border border-emerald/20 glow-emerald hover:border-emerald/40"
            : "bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.04]"
        }
      `}
    >
      {/* Subtle gradient accent line at top */}
      <div
        className={`absolute top-0 left-6 right-6 h-px ${
          highlight
            ? "bg-gradient-to-r from-transparent via-emerald/50 to-transparent"
            : "bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"
        }`}
      />

      <div className="mb-4">
        <div
          className={`inline-flex p-2.5 rounded-xl transition-colors duration-300 ${
            highlight
              ? "bg-emerald/15 text-emerald-light group-hover:bg-emerald/25"
              : "bg-white/5 text-gray-400 group-hover:text-emerald-light group-hover:bg-emerald/10"
          }`}
        >
          <Icon className="w-6 h-6" />
        </div>
      </div>
      <h3 className="text-lg font-bold text-white mb-2 tracking-tight">
        {title}
      </h3>
      <p className="text-sm text-gray-400 leading-relaxed">{description}</p>
    </div>
  );
}

interface StatItemProps {
  value: string;
  label: string;
  icon: LucideIcon;
  accent?: "emerald" | "gold" | "default";
}

function StatItem({
  value,
  label,
  icon: Icon,
  accent = "default",
}: StatItemProps) {
  const accentColors = {
    emerald: "text-emerald-light",
    gold: "text-gold",
    default: "text-white",
  };
  const iconColors = {
    emerald: "text-emerald/60",
    gold: "text-gold/60",
    default: "text-gray-500",
  };

  return (
    <div className="flex flex-col items-center text-center px-4 py-3">
      <Icon size={18} className={`mb-2 ${iconColors[accent]}`} />
      <div
        className={`text-xl sm:text-2xl font-bold tracking-tight ${accentColors[accent]}`}
      >
        {value}
      </div>
      <div className="text-[11px] text-gray-500 mt-1 uppercase tracking-wider font-medium">
        {label}
      </div>
    </div>
  );
}

interface StepCardProps {
  step: number;
  title: string;
  description: string;
  icon: LucideIcon;
  isLast?: boolean;
}

function StepCard({
  step,
  title,
  description,
  icon: Icon,
  isLast,
}: StepCardProps) {
  return (
    <div className="flex items-start gap-4 relative">
      {/* Vertical line connector */}
      {!isLast && (
        <div className="absolute left-5 top-12 bottom-0 w-px bg-gradient-to-b from-emerald/30 to-transparent" />
      )}

      {/* Step number circle */}
      <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-emerald/20 to-emerald/5 border border-emerald/20 flex items-center justify-center">
        <span className="text-sm font-bold text-emerald-light">{step}</span>
      </div>

      {/* Content */}
      <div className="flex-1 pb-8">
        <div className="flex items-center gap-2 mb-1.5">
          <Icon size={16} className="text-emerald/60" />
          <h4 className="text-base font-semibold text-white">{title}</h4>
        </div>
        <p className="text-sm text-gray-400 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main Page                                                                 */
/* -------------------------------------------------------------------------- */

function LandingPage() {
  const sampleNumbers = [7, 14, 22, 31, 38, 45];
  const quickPickNumbers = [3, 11, 19, 27, 33];

  const features: FeatureCardProps[] = [
    {
      icon: TrendingUp,
      title: "Positive-EV Rolldown",
      description:
        "When the jackpot hits $1.75M, prizes roll down to lower tiers creating +11.2% expected value per ticket. By design.",
      highlight: true,
    },
    {
      icon: Shield,
      title: "Provably Fair",
      description:
        "Switchboard VRF with TEE ensures verifiable randomness for every draw. All results and balances are fully transparent on-chain.",
    },
    {
      icon: Users,
      title: "Syndicate System",
      description:
        "Create or join pools with automatic prize splitting. Compete in Syndicate Wars for bonus rewards and leaderboard rankings.",
    },
    {
      icon: Coins,
      title: "More Money Back to You",
      description:
        "During rolldown windows, up to 72% of ticket revenue flows directly into player prizes. The math literally flips in your favor.",
    },
    {
      icon: Zap,
      title: "Quick Pick Express",
      description:
        "5/35 mini-lottery every 4 hours with +59% rolldown exploit. $1.50 tickets with a $50 lifetime spend gate.",
    },
    {
      icon: Lock,
      title: "Prizes Always Guaranteed",
      description:
        "5% of every ticket goes to reserve and insurance funds that back your winnings. Prizes are always paid — verified on-chain.",
    },
  ];

  const rolldownSteps: Omit<StepCardProps, "isLast">[] = [
    {
      step: 1,
      title: "Jackpot Accumulates",
      description:
        "Daily draws with $2.50 tickets. The jackpot grows with each draw that has no Match 6 winner, approaching the $1.75M soft cap.",
      icon: TrendingUp,
    },
    {
      step: 2,
      title: "Rolldown Triggers",
      description:
        "At $1.75M with no jackpot winner, the entire prize pool rolls down to lower tiers. Prizes switch from fixed to pari-mutuel.",
      icon: Target,
    },
    {
      step: 3,
      title: "+EV Window Opens",
      description:
        "Expected value per $2.50 ticket becomes +11.2% — that's +$0.28 profit per ticket on average. The odds flip in your favor.",
      icon: Sparkles,
    },
    {
      step: 4,
      title: "Strategic Play",
      description:
        "Sophisticated players buy tickets in volume during the rolldown window, collecting mathematically guaranteed profits.",
      icon: BarChart3,
    },
  ];

  const prizeTiers = [
    {
      match: "6 Numbers",
      prize: "Jackpot (55.6%)",
      odds: "1 in 9.37M",
      rolldown: "Entire pool cascades down",
      color: "gold" as const,
    },
    {
      match: "5 Numbers",
      prize: "$10,000 fixed",
      odds: "1 in 54,201",
      rolldown: "Pari-mutuel share",
      color: "emerald" as const,
    },
    {
      match: "4 Numbers",
      prize: "$100 fixed",
      odds: "1 in 1,032",
      rolldown: "Pari-mutuel share",
      color: "emerald" as const,
    },
    {
      match: "3 Numbers",
      prize: "$4 fixed",
      odds: "1 in 57",
      rolldown: "Pari-mutuel share",
      color: "emerald" as const,
    },
  ];

  const trustBadges = [
    {
      icon: Shield,
      title: "Open Source",
      description: "All smart contracts are publicly auditable on-chain",
    },
    {
      icon: Eye,
      title: "Fully Transparent",
      description:
        "Every draw, ticket, and payout is verifiable on Solana Explorer",
    },
    {
      icon: Lock,
      title: "Non-Custodial",
      description: "Your funds stay in your wallet until you buy a ticket",
    },
    {
      icon: Gem,
      title: "Switchboard VRF",
      description:
        "Randomness generated inside a Trusted Execution Environment",
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* ================================================================== */}
      {/*  HERO SECTION                                                      */}
      {/* ================================================================== */}
      <section className="relative py-16 sm:py-24 lg:py-32 px-4 sm:px-6 lg:px-8 overflow-hidden">
        {/* Background effects */}
        <div className="absolute inset-0 bg-glow-top-left" />
        <div className="absolute inset-0 bg-glow-bottom-right" />
        <div className="absolute inset-0 hero-grid" />
        <FloatingBalls count={10} />

        <div className="relative z-10 max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left: Copy */}
            <div className="text-center lg:text-left">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald/10 border border-emerald/20 mb-6 animate-slide-down">
                <Sparkles size={14} className="text-emerald-light" />
                <span className="text-xs font-semibold text-emerald-light">
                  Revolutionary Lottery Protocol on Solana
                </span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-black tracking-tight leading-[1.05] mb-6">
                <span className="block text-white">The First</span>
                <span className="block text-gradient-primary mt-1">
                  Intentionally Exploitable
                </span>
                <span className="block text-white mt-1">Lottery</span>
              </h1>

              <p className="text-base sm:text-lg text-gray-400 leading-relaxed max-w-xl mx-auto lg:mx-0 mb-8">
                SolanaLotto introduces{" "}
                <span className="text-emerald-light font-semibold">
                  positive expected value windows
                </span>{" "}
                through mathematical rolldown mechanics. When the jackpot hits
                the cap, the math flips in your favor.
              </p>

              {/* CTA buttons */}
              <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
                <Link
                  to="/play"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3.5 text-sm font-bold text-white bg-gradient-to-r from-emerald to-emerald-dark hover:from-emerald-light hover:to-emerald rounded-xl transition-all duration-300 shadow-lg shadow-emerald/25 hover:shadow-emerald/40 hover:scale-[1.02] active:scale-[0.98]"
                >
                  <Trophy size={18} />
                  <span>Start Playing</span>
                  <ArrowRight size={16} />
                </Link>
                <Link
                  to="/learn/rolldown"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3.5 text-sm font-semibold text-gray-300 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-xl transition-all duration-300"
                >
                  <span>Read the Docs</span>
                  <ChevronRight size={16} />
                </Link>
              </div>

              {/* Quick social proof */}
              <div className="mt-8 flex flex-wrap items-center gap-4 justify-center lg:justify-start">
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <CheckCircle size={13} className="text-emerald/60" />
                  <span>Provably fair</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <CheckCircle size={13} className="text-emerald/60" />
                  <span>Non-custodial</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <CheckCircle size={13} className="text-emerald/60" />
                  <span>On-chain transparent</span>
                </div>
              </div>
            </div>

            {/* Right: Jackpot + Countdown + Sample balls */}
            <div className="flex flex-col items-center gap-6">
              <JackpotDisplay
                amount={1_247_832}
                size="lg"
                glow
                showRolldownStatus
                rolldownActive={false}
                softCap={1_750_000}
                className="w-full max-w-md"
              />

              <div className="glass rounded-2xl px-6 py-5 w-full max-w-md">
                <CountdownTimer size="md" label="Next Draw" />
              </div>

              {/* Sample winning numbers */}
              <div className="flex flex-col items-center gap-2">
                <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                  Last Winning Numbers
                </span>
                <LotteryBallRow
                  numbers={sampleNumbers}
                  size="md"
                  variant="emerald"
                  animated
                  staggerDelay={100}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/*  LIVE STATS BAR                                                    */}
      {/* ================================================================== */}
      <section className="relative">
        <div className="section-divider" />
        <div className="bg-navy-deep/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <StatItem
                value="1 in 9.37M"
                label="Jackpot Odds"
                icon={Trophy}
                accent="gold"
              />
              <StatItem
                value="+11.2%"
                label="Rolldown EV"
                icon={TrendingUp}
                accent="emerald"
              />
              <StatItem value="$2.50" label="Ticket Price" icon={Coins} />
              <StatItem value="Daily" label="Draw Frequency" icon={Clock} />
            </div>
          </div>
        </div>
        <div className="section-divider" />
      </section>

      {/* ================================================================== */}
      {/*  TWO WAYS TO PLAY                                                  */}
      {/* ================================================================== */}
      <section className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 relative">
        <div className="absolute inset-0 bg-glow-emerald opacity-30" />

        <div className="relative z-10 max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">
              Two Ways to <span className="text-gradient-primary">Play</span>
            </h2>
            <p className="text-gray-400 text-base max-w-2xl mx-auto">
              Choose the main 6/46 lottery for massive jackpots or Quick Pick
              Express for faster action with even higher rolldown EV.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl mx-auto">
            {/* Main Lottery Card */}
            <div className="group relative rounded-2xl overflow-hidden transition-all duration-300 hover:translate-y-[-2px]">
              {/* Border gradient */}
              <div className="absolute inset-0 rounded-2xl p-px bg-gradient-to-br from-emerald/30 via-emerald/10 to-transparent">
                <div className="w-full h-full rounded-2xl bg-navy-light/90" />
              </div>

              <div className="relative p-7 sm:p-8">
                {/* Header */}
                <div className="flex items-start justify-between mb-5">
                  <div>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald/10 border border-emerald/20 text-xs font-semibold text-emerald-light mb-3">
                      <Trophy size={12} />
                      Main Game
                    </div>
                    <h3 className="text-2xl font-bold text-white">
                      6/46 Lottery
                    </h3>
                    <p className="text-sm text-gray-400 mt-1">
                      Pick 6 from 46 numbers
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-black text-gradient-gold">
                      $2.50
                    </div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider">
                      per ticket
                    </div>
                  </div>
                </div>

                {/* Sample balls */}
                <div className="mb-5">
                  <LotteryBallRow
                    numbers={sampleNumbers}
                    size="sm"
                    variant="emerald"
                    animated={false}
                  />
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-3 gap-3 mb-5">
                  <div className="text-center p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.04]">
                    <div className="text-sm font-bold text-white">Daily</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">
                      Draw Freq
                    </div>
                  </div>
                  <div className="text-center p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.04]">
                    <div className="text-sm font-bold text-gold">+11.2%</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">
                      Rolldown EV
                    </div>
                  </div>
                  <div className="text-center p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.04]">
                    <div className="text-sm font-bold text-white">$1.75M</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">
                      Soft Cap
                    </div>
                  </div>
                </div>

                {/* CTA */}
                <Link
                  to="/play"
                  className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-gradient-to-r from-emerald to-emerald-dark hover:from-emerald-light hover:to-emerald rounded-xl transition-all duration-300 shadow-md shadow-emerald/15 hover:shadow-emerald/25"
                >
                  <span>Play 6/46 Lottery</span>
                  <ArrowRight size={16} />
                </Link>
              </div>
            </div>

            {/* Quick Pick Card */}
            <div className="group relative rounded-2xl overflow-hidden transition-all duration-300 hover:translate-y-[-2px]">
              {/* Border gradient */}
              <div className="absolute inset-0 rounded-2xl p-px bg-gradient-to-br from-gold/30 via-gold/10 to-transparent">
                <div className="w-full h-full rounded-2xl bg-navy-light/90" />
              </div>

              <div className="relative p-7 sm:p-8">
                {/* Header */}
                <div className="flex items-start justify-between mb-5">
                  <div>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gold/10 border border-gold/20 text-xs font-semibold text-gold mb-3">
                      <Zap size={12} />
                      Express
                    </div>
                    <h3 className="text-2xl font-bold text-white">
                      Quick Pick
                    </h3>
                    <p className="text-sm text-gray-400 mt-1">
                      Pick 5 from 35 numbers
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-black text-gradient-gold">
                      $1.50
                    </div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider">
                      per ticket
                    </div>
                  </div>
                </div>

                {/* Sample balls */}
                <div className="mb-5">
                  <LotteryBallRow
                    numbers={quickPickNumbers}
                    size="sm"
                    variant="gold"
                    animated={false}
                  />
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-3 gap-3 mb-5">
                  <div className="text-center p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.04]">
                    <div className="text-sm font-bold text-white">4 hrs</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">
                      Draw Freq
                    </div>
                  </div>
                  <div className="text-center p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.04]">
                    <div className="text-sm font-bold text-gold">+59%</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">
                      Rolldown EV
                    </div>
                  </div>
                  <div className="text-center p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.04]">
                    <div className="text-sm font-bold text-white">$50</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">
                      Spend Gate
                    </div>
                  </div>
                </div>

                {/* Quick Pick countdown */}
                <div className="flex items-center justify-center mb-4 p-2 rounded-lg bg-white/[0.02] border border-white/[0.05]">
                  <QuickPickCountdown size="sm" />
                </div>

                {/* CTA */}
                <Link
                  to="/play/quick-pick"
                  className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-navy bg-gradient-to-r from-gold-light to-gold hover:from-gold-light hover:to-gold-dark rounded-xl transition-all duration-300 shadow-md shadow-gold/15 hover:shadow-gold/25"
                >
                  <span>Play Quick Pick</span>
                  <Zap size={16} />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/*  HOW THE ROLLDOWN WORKS                                            */}
      {/* ================================================================== */}
      <section className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 relative">
        <div className="absolute inset-0 bg-navy-deep/40" />
        <div className="section-divider absolute top-0 left-0 right-0" />

        <div className="relative z-10 max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">
              How the <span className="text-gradient-emerald">Rolldown</span>{" "}
              Works
            </h2>
            <p className="text-gray-400 text-base max-w-2xl mx-auto">
              The mathematical mechanism that creates guaranteed profit
              opportunities for strategic players.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-start">
            {/* Steps */}
            <div>
              {rolldownSteps.map((step, i) => (
                <StepCard
                  key={step.step}
                  {...step}
                  isLast={i === rolldownSteps.length - 1}
                />
              ))}
            </div>

            {/* EV Comparison Visual */}
            <div className="lg:sticky lg:top-24">
              <div className="rounded-2xl overflow-hidden">
                <div className="bg-gradient-to-br from-navy-light to-navy border border-white/[0.06] rounded-2xl p-6 sm:p-8">
                  <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                    <BarChart3 size={20} className="text-emerald" />
                    Economic Advantage
                  </h3>

                  {/* Normal EV bar */}
                  <div className="mb-5">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-gray-400">
                        Normal Draw EV
                      </span>
                      <span className="text-sm font-semibold text-red-400">
                        -28% to -40%
                      </span>
                    </div>
                    <div className="h-2.5 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-red-500/80 to-red-600/80 transition-all duration-1000"
                        style={{ width: "34%" }}
                      />
                    </div>
                    <p className="text-[11px] text-gray-600 mt-1.5">
                      You lose money on average — standard for most lotteries
                    </p>
                  </div>

                  {/* Rolldown EV bar */}
                  <div className="mb-6">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-gray-400">
                        Rolldown Draw EV
                      </span>
                      <span className="text-sm font-semibold text-emerald-light">
                        +11.2%
                      </span>
                    </div>
                    <div className="h-2.5 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald to-emerald-light transition-all duration-1000"
                        style={{ width: "100%" }}
                      />
                    </div>
                    <p className="text-[11px] text-gray-600 mt-1.5">
                      The math flips — you have the mathematical advantage
                    </p>
                  </div>

                  {/* Divider */}
                  <div className="section-divider my-6" />

                  {/* Profit highlight */}
                  <div className="text-center">
                    <div className="text-3xl sm:text-4xl font-black text-gradient-emerald tracking-tight">
                      +$0.28
                    </div>
                    <div className="text-sm text-gray-400 mt-1">
                      Average profit per $2.50 ticket during rolldown
                    </div>
                  </div>

                  {/* Quick comparison table */}
                  <div className="mt-6 grid grid-cols-2 gap-3">
                    <div className="text-center p-3 rounded-xl bg-red-500/5 border border-red-500/10">
                      <div className="text-xs text-gray-500 mb-1">
                        Buy 1,000 Normal
                      </div>
                      <div className="text-base font-bold text-red-400">
                        -$700 to -$1,000
                      </div>
                    </div>
                    <div className="text-center p-3 rounded-xl bg-emerald/5 border border-emerald/10">
                      <div className="text-xs text-gray-500 mb-1">
                        Buy 1,000 Rolldown
                      </div>
                      <div className="text-base font-bold text-emerald-light">
                        +$280
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="section-divider absolute bottom-0 left-0 right-0" />
      </section>

      {/* ================================================================== */}
      {/*  FEATURES                                                          */}
      {/* ================================================================== */}
      <section className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 relative">
        <div className="absolute inset-0 bg-glow-gold opacity-20" />

        <div className="relative z-10 max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">
              Built Different
            </h2>
            <p className="text-gray-400 text-base max-w-2xl mx-auto">
              Everything you need for a fair, transparent, and strategic lottery
              experience on Solana.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((feature) => (
              <FeatureCard key={feature.title} {...feature} />
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/*  PRIZE STRUCTURE                                                   */}
      {/* ================================================================== */}
      <section className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 relative">
        <div className="absolute inset-0 bg-navy-deep/40" />
        <div className="section-divider absolute top-0 left-0 right-0" />

        <div className="relative z-10 max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">
              Prize <span className="text-gradient-gold">Structure</span>
            </h2>
            <p className="text-gray-400 text-base max-w-2xl mx-auto">
              Four tiers of prizes with a hybrid fixed → pari-mutuel system.
              During rolldown, all prizes become pari-mutuel and scale with the
              pool.
            </p>
          </div>

          {/* Prize tier cards */}
          <div className="space-y-3">
            {prizeTiers.map((tier, i) => (
              <div
                key={tier.match}
                className={`
                  group flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 p-5 sm:p-6 rounded-xl
                  transition-all duration-300 hover:translate-x-1
                  ${
                    i === 0
                      ? "bg-gradient-to-r from-gold/10 via-gold/5 to-transparent border border-gold/15 hover:border-gold/30"
                      : "bg-white/[0.02] border border-white/[0.06] hover:border-emerald/20"
                  }
                `}
              >
                {/* Tier badge */}
                <div
                  className={`
                    flex-shrink-0 w-20 text-center
                  `}
                >
                  <div
                    className={`text-xs font-bold uppercase tracking-wider ${
                      i === 0 ? "text-gold" : "text-emerald"
                    }`}
                  >
                    Match
                  </div>
                  <div
                    className={`text-2xl font-black mt-0.5 ${
                      i === 0 ? "text-gold" : "text-white"
                    }`}
                  >
                    {tier.match.split(" ")[0]}
                  </div>
                </div>

                {/* Main info */}
                <div className="flex-1 min-w-0">
                  <div className="text-base font-semibold text-white">
                    {tier.prize}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    Rolldown: {tier.rolldown}
                  </div>
                </div>

                {/* Odds */}
                <div className="flex-shrink-0 text-right">
                  <div className="text-sm font-medium text-gray-300">
                    {tier.odds}
                  </div>
                  <div className="text-[10px] text-gray-600 mt-0.5">
                    Probability
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Game parameters summary */}
          <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Matrix", value: "6/46" },
              { label: "Ticket", value: "$2.50" },
              { label: "Seed", value: "$500K" },
              { label: "Hard Cap", value: "$2.25M" },
            ].map((param) => (
              <div
                key={param.label}
                className="text-center p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]"
              >
                <div className="text-xs text-gray-500 mb-0.5">
                  {param.label}
                </div>
                <div className="text-sm font-bold text-white">
                  {param.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="section-divider absolute bottom-0 left-0 right-0" />
      </section>

      {/* ================================================================== */}
      {/*  SYNDICATE TEASER                                                  */}
      {/* ================================================================== */}
      <section className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-glow-emerald opacity-20" />

        <div className="relative z-10 max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Left: Description */}
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald/10 border border-emerald/20 mb-5">
                <Users size={14} className="text-emerald-light" />
                <span className="text-xs font-semibold text-emerald-light">
                  Team Play
                </span>
              </div>

              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
                Stronger <span className="text-gradient-primary">Together</span>
              </h2>

              <p className="text-gray-400 text-base leading-relaxed mb-6">
                Form syndicates with other players to pool resources and buy
                tickets in bulk. Prizes are automatically split proportionally
                based on each member's contribution. No trust required — it's
                all on-chain.
              </p>

              <div className="space-y-3 mb-8">
                {[
                  "Automatic prize splitting via smart contracts",
                  "Up to 100 members per syndicate",
                  "Compete in monthly Syndicate Wars for bonus pools",
                  "Manager fee capped at 10% to protect members",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-2.5">
                    <CheckCircle
                      size={16}
                      className="text-emerald mt-0.5 flex-shrink-0"
                    />
                    <span className="text-sm text-gray-300">{item}</span>
                  </div>
                ))}
              </div>

              <Link
                to="/syndicates"
                className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-white/5 hover:bg-white/10 border border-white/10 hover:border-emerald/30 rounded-xl transition-all duration-300"
              >
                <Users size={16} />
                <span>Explore Syndicates</span>
                <ArrowRight size={16} />
              </Link>
            </div>

            {/* Right: Syndicate visual card */}
            <div className="flex justify-center">
              <div className="w-full max-w-sm rounded-2xl overflow-hidden">
                <div className="bg-gradient-to-br from-navy-light to-navy border border-white/[0.06] rounded-2xl p-6">
                  {/* Syndicate header */}
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald to-emerald-dark flex items-center justify-center">
                      <Star size={18} className="text-white" />
                    </div>
                    <div>
                      <div className="text-base font-bold text-white">
                        Diamond Hands DAO
                      </div>
                      <div className="text-xs text-gray-500">
                        23 members · Public
                      </div>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-3 mb-5">
                    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                      <div className="text-[10px] text-gray-500 uppercase tracking-wider">
                        Total Pooled
                      </div>
                      <div className="text-lg font-bold text-white mt-0.5">
                        $4,832
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                      <div className="text-[10px] text-gray-500 uppercase tracking-wider">
                        Wins This Month
                      </div>
                      <div className="text-lg font-bold text-emerald-light mt-0.5">
                        12
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                      <div className="text-[10px] text-gray-500 uppercase tracking-wider">
                        Total Won
                      </div>
                      <div className="text-lg font-bold text-gold mt-0.5">
                        $18,450
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                      <div className="text-[10px] text-gray-500 uppercase tracking-wider">
                        Wars Rank
                      </div>
                      <div className="text-lg font-bold text-white mt-0.5">
                        #3
                      </div>
                    </div>
                  </div>

                  {/* Member avatars placeholder */}
                  <div className="flex items-center gap-2">
                    <div className="flex -space-x-2">
                      {[
                        "from-purple-500 to-blue-500",
                        "from-emerald to-cyan-500",
                        "from-gold to-orange-500",
                        "from-pink-500 to-red-500",
                        "from-indigo-500 to-purple-500",
                      ].map((gradient, i) => (
                        <div
                          key={i}
                          className={`w-7 h-7 rounded-full bg-gradient-to-br ${gradient} border-2 border-navy-light flex items-center justify-center text-[10px] font-bold text-white`}
                        >
                          {String.fromCharCode(65 + i)}
                        </div>
                      ))}
                    </div>
                    <span className="text-xs text-gray-500">+18 more</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/*  TRUST & SECURITY                                                  */}
      {/* ================================================================== */}
      <section className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 relative">
        <div className="absolute inset-0 bg-navy-deep/40" />
        <div className="section-divider absolute top-0 left-0 right-0" />

        <div className="relative z-10 max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">
              Transparent by{" "}
              <span className="text-gradient-emerald">Design</span>
            </h2>
            <p className="text-gray-400 text-base max-w-2xl mx-auto">
              Every aspect of SolanaLotto is verifiable on-chain. No black
              boxes, no hidden mechanics, no trust required.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {trustBadges.map((badge) => (
              <div
                key={badge.title}
                className="group flex flex-col items-center text-center p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:border-emerald/20 transition-all duration-300"
              >
                <div className="w-12 h-12 rounded-xl bg-emerald/10 flex items-center justify-center mb-4 group-hover:bg-emerald/20 transition-colors">
                  <badge.icon size={22} className="text-emerald" />
                </div>
                <h3 className="text-sm font-bold text-white mb-1.5">
                  {badge.title}
                </h3>
                <p className="text-xs text-gray-500 leading-relaxed">
                  {badge.description}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="section-divider absolute bottom-0 left-0 right-0" />
      </section>

      {/* ================================================================== */}
      {/*  FINAL CTA                                                         */}
      {/* ================================================================== */}
      <section className="py-24 sm:py-32 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-glow-emerald opacity-25" />
        <div className="absolute inset-0 bg-glow-gold opacity-15" />
        <FloatingBalls count={6} />

        <div className="relative z-10 max-w-3xl mx-auto text-center">
          {/* Decorative icon */}
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald/20 to-gold/10 border border-emerald/20 mb-6 glow-emerald">
            <Trophy size={28} className="text-emerald-light" />
          </div>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight mb-4">
            Ready to Play <span className="text-gradient-primary">Smart</span>?
          </h2>

          <p className="text-base sm:text-lg text-gray-400 leading-relaxed mb-8 max-w-xl mx-auto">
            Join the revolution where mathematics gives players the edge.
            Monitor rolldown windows, maximize EV, and win bigger.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/play"
              className="inline-flex items-center justify-center gap-2 px-7 py-4 text-sm font-bold text-white bg-gradient-to-r from-emerald to-emerald-dark hover:from-emerald-light hover:to-emerald rounded-xl transition-all duration-300 shadow-xl shadow-emerald/25 hover:shadow-emerald/40 hover:scale-[1.02] active:scale-[0.98]"
            >
              <Trophy size={18} />
              <span>Connect Wallet & Play</span>
            </Link>
            <Link
              to="/learn/rolldown"
              className="inline-flex items-center justify-center gap-2 px-7 py-4 text-sm font-semibold text-emerald-light bg-transparent border-2 border-emerald/30 hover:border-emerald/50 hover:bg-emerald/5 rounded-xl transition-all duration-300"
            >
              <span>View Documentation</span>
            </Link>
          </div>

          <p className="text-gray-600 text-xs mt-8">
            SolanaLotto Protocol &bull; Built on Solana &bull; Fully transparent
            &bull; Non-custodial
          </p>
        </div>
      </section>

      {/* ================================================================== */}
      {/*  FOOTER                                                            */}
      {/* ================================================================== */}
      <Footer />
    </div>
  );
}
