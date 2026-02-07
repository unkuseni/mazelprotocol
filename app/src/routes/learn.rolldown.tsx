import { createFileRoute, Link } from "@tanstack/react-router";
import {
  TrendingUp,
  ChevronRight,
  Zap,
  Trophy,
  Target,
  ArrowDown,
  Shield,
  BarChart3,
  DollarSign,
  Users,
  Sparkles,
  AlertTriangle,
  CheckCircle,
  BookOpen,
  Gem,
  Clock,
  Star,
  Eye,
  type LucideIcon,
} from "lucide-react";
import { FloatingBalls } from "@/components/LotteryBalls";
import Footer from "@/components/Footer";

export const Route = createFileRoute("/learn/rolldown")({
  component: LearnRolldownPage,
});

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                            */
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
    <div className="flex items-start gap-3 mb-6">
      <div className="shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-emerald/20 to-emerald-dark/10 border border-emerald/20 flex items-center justify-center text-sm font-black text-emerald-light">
        {number}
      </div>
      <div>
        <h2 className="text-xl sm:text-2xl font-black text-foreground flex items-center gap-2">
          {title}
          <Icon size={20} className="text-emerald/60" />
        </h2>
        {subtitle && (
          <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
        )}
      </div>
    </div>
  );
}

interface FlowStepProps {
  step: string;
  title: string;
  description: string;
  icon: LucideIcon;
  highlight?: boolean;
  isLast?: boolean;
}

function FlowStep({
  step,
  title,
  description,
  icon: Icon,
  highlight,
  isLast,
}: FlowStepProps) {
  return (
    <div className="relative">
      <div
        className={`glass rounded-xl p-4 sm:p-5 transition-all ${
          highlight ? "border-emerald/20 shadow-sm shadow-emerald/5" : ""
        }`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black ${
              highlight
                ? "bg-emerald/20 border border-emerald/30 text-emerald-light"
                : "bg-foreground/[0.04] border border-foreground/[0.06] text-muted-foreground"
            }`}
          >
            {step}
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-bold text-foreground">{title}</h3>
              <Icon
                size={14}
                className={
                  highlight ? "text-emerald-light" : "text-muted-foreground"
                }
              />
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {description}
            </p>
          </div>
        </div>
      </div>
      {!isLast && (
        <div className="flex justify-center py-1.5">
          <ArrowDown size={16} className="text-muted-foreground/60" />
        </div>
      )}
    </div>
  );
}

interface ComparisonRowProps {
  label: string;
  normal: string;
  rolldown: string;
  rolldownHighlight?: boolean;
}

function ComparisonRow({
  label,
  normal,
  rolldown,
  rolldownHighlight,
}: ComparisonRowProps) {
  return (
    <div className="grid grid-cols-3 gap-3 py-2.5 border-b border-foreground/[0.03] last:border-0">
      <div className="text-xs text-muted-foreground font-medium">{label}</div>
      <div className="text-xs text-muted-foreground text-center font-semibold">
        {normal}
      </div>
      <div
        className={`text-xs text-center font-bold ${
          rolldownHighlight ? "text-emerald-light" : "text-muted-foreground"
        }`}
      >
        {rolldown}
      </div>
    </div>
  );
}

interface EVBarProps {
  label: string;
  ev: number;
  maxEv: number;
  isPositive: boolean;
}

function EVBar({ label, ev, maxEv, isPositive }: EVBarProps) {
  const absEv = Math.abs(ev);
  const width = Math.min((absEv / maxEv) * 100, 100);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span
          className={`font-bold ${
            isPositive ? "text-emerald-light" : "text-red-400"
          }`}
        >
          {isPositive ? "+" : ""}
          {ev.toFixed(1)}%
        </span>
      </div>
      <div className="h-2.5 bg-foreground/5 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${
            isPositive
              ? "bg-gradient-to-r from-emerald-dark to-emerald-light"
              : "bg-gradient-to-r from-red-600 to-red-400"
          }`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

function VisualDiagram() {
  return (
    <div className="glass-strong rounded-2xl p-5 sm:p-8 border-gradient-emerald overflow-hidden relative">
      <div className="absolute top-0 right-0 w-64 h-64 bg-glow-emerald opacity-10" />

      <h3 className="text-base font-bold text-foreground mb-6 flex items-center gap-2 relative z-10">
        <BarChart3 size={18} className="text-emerald" />
        Rolldown Prize Distribution Flow
      </h3>

      <div className="relative z-10 space-y-4">
        {/* Jackpot Pool */}
        <div className="text-center">
          <div className="inline-flex flex-col items-center">
            <div className="px-6 py-3 rounded-xl bg-gradient-to-br from-gold/20 to-gold-dark/10 border border-gold/30 glow-gold">
              <div className="text-[10px] text-gold/80 uppercase tracking-wider font-semibold mb-0.5">
                Jackpot Pool
              </div>
              <div className="text-2xl font-black text-gradient-gold">
                $1,750,000
              </div>
              <div className="text-[10px] text-gold/60 mt-0.5">
                Soft Cap Reached — No Match 6 Winner
              </div>
            </div>
            <div className="w-px h-6 bg-emerald/30" />
            <div className="flex items-center gap-1 px-3 py-1 rounded-full bg-emerald/15 border border-emerald/30">
              <Zap size={10} className="text-emerald-light" />
              <span className="text-[10px] font-bold text-emerald-light uppercase tracking-wider">
                Rolldown Triggered
              </span>
            </div>
            <div className="w-px h-6 bg-emerald/30" />
          </div>
        </div>

        {/* Distribution split */}
        <div className="grid grid-cols-3 gap-3">
          {/* Match 5 */}
          <div className="glass rounded-xl p-3 text-center border border-gold/10">
            <div className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">
              20% → Match 5
            </div>
            <div className="text-lg font-black text-gold">$350,000</div>
            <div className="h-px bg-foreground/5 my-2" />
            <div className="text-[10px] text-muted-foreground">
              ~5 winners ={" "}
              <span className="font-bold text-gold">$70,000 each</span>
            </div>
            <div className="text-[9px] text-muted-foreground/60 mt-1">
              Normal: $1,000 fixed
            </div>
          </div>

          {/* Match 4 */}
          <div className="glass rounded-xl p-3 text-center border border-emerald/10">
            <div className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">
              40% → Match 4
            </div>
            <div className="text-lg font-black text-emerald-light">
              $700,000
            </div>
            <div className="h-px bg-foreground/5 my-2" />
            <div className="text-[10px] text-muted-foreground">
              ~210 winners ={" "}
              <span className="font-bold text-emerald-light">$3,333 each</span>
            </div>
            <div className="text-[9px] text-muted-foreground/60 mt-1">
              Normal: $50 fixed
            </div>
          </div>

          {/* Match 3 */}
          <div className="glass rounded-xl p-3 text-center border border-emerald/10">
            <div className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">
              40% → Match 3
            </div>
            <div className="text-lg font-black text-emerald-light">
              $700,000
            </div>
            <div className="h-px bg-foreground/5 my-2" />
            <div className="text-[10px] text-muted-foreground">
              ~3,100 winners ={" "}
              <span className="font-bold text-emerald-light">$225 each</span>
            </div>
            <div className="text-[9px] text-muted-foreground/60 mt-1">
              Normal: $5 fixed
            </div>
          </div>
        </div>

        {/* Result callout */}
        <div className="flex items-center justify-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald/10 border border-emerald/20">
            <TrendingUp size={14} className="text-emerald-light" />
            <span className="text-xs font-bold text-emerald-light">
              Total Distributed: $1,750,000 — Player EV: +47.2%
            </span>
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground text-center">
          All prizes are pari-mutuel (Pool ÷ Winners) — fewer winners means
          bigger prizes for you. After rolldown, the jackpot resets to the
          $500,000 seed and the cycle begins again.
        </p>
      </div>
    </div>
  );
}

function QuickPickExpressDiagram() {
  return (
    <div className="glass rounded-2xl p-5 sm:p-6 border border-emerald/10">
      <h4 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
        <Zap size={14} className="text-emerald-light" />
        Quick Pick Express (5/35) Rolldown
      </h4>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="p-3 rounded-xl bg-emerald/[0.03] border border-emerald/10 text-center">
          <div className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">
            60% → Match 4
          </div>
          <div className="text-base font-black text-emerald-light">~$3,247</div>
          <div className="text-[9px] text-muted-foreground/60 mt-0.5">
            Normal: $100 fixed
          </div>
        </div>
        <div className="p-3 rounded-xl bg-emerald/[0.03] border border-emerald/10 text-center">
          <div className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">
            40% → Match 3
          </div>
          <div className="text-base font-black text-emerald-light">~$75</div>
          <div className="text-[9px] text-muted-foreground/60 mt-0.5">
            Normal: $4 fixed
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center mb-3">
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald/15 border border-emerald/30">
          <TrendingUp size={12} className="text-emerald-light" />
          <span className="text-[10px] font-bold text-emerald-light">
            Player EV: +66.7% during rolldown!
          </span>
        </div>
      </div>

      <div className="space-y-1.5 text-[10px] text-muted-foreground">
        <p>
          <span className="font-semibold text-muted-foreground">Soft Cap:</span>{" "}
          $30,000 &bull;{" "}
          <span className="font-semibold text-muted-foreground">Hard Cap:</span>{" "}
          $50,000
        </p>
        <p>
          Draws every 4 hours. At $1.50/ticket with 1-in-324,632 jackpot odds,
          the smaller pool rolls down much faster — creating more frequent +EV
          windows.
        </p>
      </div>
    </div>
  );
}

function MathCallout({
  title,
  formula,
  result,
  explanation,
}: {
  title: string;
  formula: string;
  result: string;
  explanation: string;
}) {
  return (
    <div className="glass rounded-xl p-4 border border-foreground/[0.06]">
      <div className="text-xs font-bold text-foreground mb-2 flex items-center gap-1.5">
        <Target size={12} className="text-gold" />
        {title}
      </div>
      <div className="p-3 rounded-lg bg-card/50 dark:bg-navy-deep/50 border border-foreground/[0.04] mb-2">
        <div className="text-xs text-muted-foreground font-mono text-center">
          {formula}
        </div>
      </div>
      <div className="flex items-center justify-center mb-2">
        <span className="text-sm font-black text-gradient-gold">{result}</span>
      </div>
      <p className="text-[10px] text-muted-foreground text-center">
        {explanation}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main Component                                                            */
/* -------------------------------------------------------------------------- */

function LearnRolldownPage() {
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
          <nav className="flex items-center gap-2 text-xs text-muted-foreground mb-8">
            <Link to="/" className="hover:text-foreground transition-colors">
              Home
            </Link>
            <ChevronRight size={12} />
            <span className="text-muted-foreground">Learn</span>
            <ChevronRight size={12} />
            <span className="text-emerald-light font-medium">
              How Rolldown Works
            </span>
          </nav>

          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald/20 to-emerald-dark/10 border border-emerald/20 mb-6 glow-emerald">
              <TrendingUp size={32} className="text-emerald-light" />
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-foreground mb-4">
              How the <span className="text-gradient-primary">Rolldown</span>{" "}
              Works
            </h1>

            <p className="text-base sm:text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto mb-6">
              The rolldown mechanism is what makes MazelProtocol unique — it
              creates{" "}
              <span className="font-semibold text-emerald-light">
                intentional positive expected value (+EV) windows
              </span>{" "}
              where the math favors players over the house.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald/10 border border-emerald/20">
                <TrendingUp size={12} className="text-emerald-light" />
                <span className="text-xs font-semibold text-emerald-light">
                  6/46: +47% EV during rolldown
                </span>
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald/10 border border-emerald/20">
                <Zap size={12} className="text-emerald-light" />
                <span className="text-xs font-semibold text-emerald-light">
                  5/35: +66.7% EV during rolldown
                </span>
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gold/10 border border-gold/20">
                <Shield size={12} className="text-gold" />
                <span className="text-xs font-semibold text-gold">
                  Your prizes are always guaranteed
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/*  CONTENT                                                         */}
      {/* ================================================================ */}
      <section className="relative px-4 sm:px-6 lg:px-8 pb-16">
        <div className="max-w-4xl mx-auto space-y-16">
          {/* -------------------------------------------------------------- */}
          {/*  Section 1: The Big Idea                                       */}
          {/* -------------------------------------------------------------- */}
          <div>
            <SectionHeading
              number="1"
              title="The Big Idea"
              subtitle="Why MazelProtocol is fundamentally different from traditional lotteries"
              icon={Gem}
            />

            <div className="space-y-4">
              <div className="glass rounded-2xl p-5 sm:p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {/* Traditional */}
                  <div>
                    <h3 className="text-sm font-bold text-red-400 mb-3 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-red-400" />
                      Traditional Lotteries
                    </h3>
                    <ul className="space-y-2">
                      {[
                        "You always lose on average (–50% EV or worse)",
                        "Jackpot rolls forever — you never see that money",
                        "Opaque randomness — no way to verify fairness",
                        "Fixed prizes that never change",
                        "No strategic advantage for smart play",
                      ].map((item) => (
                        <li
                          key={item}
                          className="flex items-start gap-2 text-xs text-muted-foreground"
                        >
                          <span className="shrink-0 mt-1 w-1.5 h-1.5 rounded-full bg-red-500/40" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* MazelProtocol */}
                  <div>
                    <h3 className="text-sm font-bold text-emerald-light mb-3 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald" />
                      MazelProtocol Rolldown
                    </h3>
                    <ul className="space-y-2">
                      {[
                        "Positive EV (+47%) during rolldown windows",
                        "Jackpot capped — excess flows to players",
                        "Verifiable randomness (Switchboard TEE)",
                        "Pari-mutuel prizes that scale with the pool",
                        "Strategic players can time purchases for max EV",
                      ].map((item) => (
                        <li
                          key={item}
                          className="flex items-start gap-2 text-xs text-muted-foreground"
                        >
                          <CheckCircle
                            size={12}
                            className="shrink-0 mt-0.5 text-emerald"
                          />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              <div className="glass rounded-xl p-4 border border-gold/10">
                <div className="flex items-start gap-3">
                  <div className="p-1.5 rounded-lg bg-gold/10 shrink-0 mt-0.5">
                    <BookOpen size={14} className="text-gold" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gold mb-1">
                      Inspired by Real History
                    </p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      MazelProtocol&apos;s rolldown mechanism is inspired by the
                      Massachusetts Cash WinFall lottery (2004–2012), where
                      strategic syndicates discovered that the rolldown created
                      consistent +EV opportunities. MazelProtocol makes this
                      transparent and <em>intentional</em> — we want players to
                      exploit it.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* -------------------------------------------------------------- */}
          {/*  Section 2: How It Works Step by Step                          */}
          {/* -------------------------------------------------------------- */}
          <div>
            <SectionHeading
              number="2"
              title="How It Works"
              subtitle="Step-by-step walkthrough of the rolldown mechanism"
              icon={Target}
            />

            <div className="space-y-0">
              <FlowStep
                step="1"
                title="Jackpot Accumulates"
                description="With each draw, 55.6% of ticket revenue is allocated to the jackpot. If no one matches all 6 numbers, the jackpot grows. Daily draws with ~14,000 tickets add approximately $19,500 to the jackpot per draw."
                icon={DollarSign}
              />
              <FlowStep
                step="2"
                title="Soft Cap Reached ($1.75M)"
                description="When the jackpot reaches the soft cap of $1,750,000, the protocol enters 'rolldown-eligible' mode. A probabilistic trigger determines if this draw will be a rolldown: probability = (jackpot - softCap) / (hardCap - softCap). The closer to the hard cap, the more likely a rolldown."
                icon={Target}
              />
              <FlowStep
                step="3"
                title="Draw Occurs — No Match 6 Winner"
                description="If the draw happens and no one matches all 6 numbers (1 in 9.37 million odds), the rolldown is triggered. The entire jackpot becomes the rolldown prize pool, distributed among lower-tier winners using pari-mutuel division."
                icon={Zap}
                highlight
              />
              <FlowStep
                step="4"
                title="Pari-Mutuel Distribution"
                description="The jackpot is split: 20% to Match 5, 40% to Match 4, and 40% to Match 3 winners. Each tier's prize = (Pool × Share%) ÷ Number of Winners. This means Match 3 winners might get $225 instead of the normal $5 — a 45× increase!"
                icon={Users}
                highlight
              />
              <FlowStep
                step="5"
                title="Jackpot Resets"
                description="After the rolldown, the jackpot resets to the $500,000 seed amount. The cycle begins again, building towards the next rolldown window. A full cycle typically takes ~15 days."
                icon={Clock}
                isLast
              />
            </div>
          </div>

          {/* -------------------------------------------------------------- */}
          {/*  Section 3: Visual Diagram                                     */}
          {/* -------------------------------------------------------------- */}
          <div>
            <SectionHeading
              number="3"
              title="Prize Distribution"
              subtitle="Visual breakdown of how the jackpot flows to winners during rolldown"
              icon={BarChart3}
            />

            <VisualDiagram />

            <div className="mt-6">
              <QuickPickExpressDiagram />
            </div>
          </div>

          {/* -------------------------------------------------------------- */}
          {/*  Section 4: The Math                                           */}
          {/* -------------------------------------------------------------- */}
          <div>
            <SectionHeading
              number="4"
              title="The Math Behind +EV"
              subtitle="Understanding expected value and why rolldown creates player edge"
              icon={Target}
            />

            <div className="space-y-4">
              {/* EV Comparison */}
              <div className="glass rounded-2xl p-5 sm:p-6">
                <h3 className="text-sm font-bold text-foreground mb-5 flex items-center gap-2">
                  <BarChart3 size={14} className="text-emerald" />
                  Expected Value Comparison
                </h3>

                <div className="space-y-4">
                  <EVBar
                    label="Traditional Lottery (e.g. Powerball)"
                    ev={-50}
                    maxEv={70}
                    isPositive={false}
                  />
                  <EVBar
                    label="MazelProtocol Normal Mode (6/46)"
                    ev={-28}
                    maxEv={70}
                    isPositive={false}
                  />
                  <EVBar
                    label="MazelProtocol Rolldown Mode (6/46)"
                    ev={47.2}
                    maxEv={70}
                    isPositive={true}
                  />
                  <EVBar
                    label="Quick Pick Express Rolldown (5/35)"
                    ev={66.7}
                    maxEv={70}
                    isPositive={true}
                  />
                </div>

                <div className="mt-5 p-3 rounded-xl bg-emerald/[0.03] border border-emerald/10">
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    <span className="font-bold text-emerald-light">
                      Positive EV means the math favors players.
                    </span>{" "}
                    For every $1 wagered during a 6/46 rolldown, the average
                    return is $1.47. For Quick Pick Express, it&apos;s $1.67.
                    This is unprecedented in lottery design — most lotteries
                    return $0.50 or less per dollar.
                  </p>
                </div>
              </div>

              {/* Math formulas */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <MathCallout
                  title="Normal Mode EV (6/46)"
                  formula="EV = Σ(P(match) × Prize) - $2.50"
                  result="–$0.70 per ticket"
                  explanation="In normal mode, the house has a 28% edge. This is still better than most lotteries."
                />
                <MathCallout
                  title="Rolldown Mode EV (6/46)"
                  formula="EV = Σ(P(match) × PoolShare/Winners) - $2.50"
                  result="+$1.18 per ticket"
                  explanation="During rolldown, expected return exceeds ticket cost. Players have a +47.2% mathematical edge."
                />
              </div>

              {/* Break-even analysis */}
              <div className="glass rounded-xl p-5 sm:p-6">
                <h4 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
                  <DollarSign size={14} className="text-gold" />
                  Break-Even Point
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="text-center p-3 rounded-xl bg-foreground/[0.02]">
                    <div className="text-lg font-black text-gold tabular-nums">
                      $1.75M
                    </div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">
                      6/46 Soft Cap
                    </div>
                    <div className="text-[10px] text-muted-foreground/60 mt-0.5">
                      Rolldown eligible
                    </div>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-foreground/[0.02]">
                    <div className="text-lg font-black text-gold tabular-nums">
                      $2.25M
                    </div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">
                      6/46 Hard Cap
                    </div>
                    <div className="text-[10px] text-muted-foreground/60 mt-0.5">
                      Forced rolldown
                    </div>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-foreground/[0.02]">
                    <div className="text-lg font-black text-emerald-light tabular-nums">
                      ~15 days
                    </div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">
                      Avg Cycle Length
                    </div>
                    <div className="text-[10px] text-muted-foreground/60 mt-0.5">
                      From seed to rolldown
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* -------------------------------------------------------------- */}
          {/*  Section 5: Normal vs Rolldown Comparison                      */}
          {/* -------------------------------------------------------------- */}
          <div>
            <SectionHeading
              number="5"
              title="Prize Comparison"
              subtitle="See exactly how much more you can win during rolldown events"
              icon={Trophy}
            />

            <div className="glass rounded-2xl p-5 sm:p-6">
              <h3 className="text-sm font-bold text-foreground mb-4">
                6/46 Main Lottery Prizes
              </h3>

              {/* Table header */}
              <div className="grid grid-cols-3 gap-3 pb-2 border-b border-foreground/[0.06]">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                  Tier
                </div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold text-center">
                  Normal (Fixed)
                </div>
                <div className="text-[10px] text-emerald-light/70 uppercase tracking-wider font-semibold text-center">
                  Rolldown (Pari-Mutuel)
                </div>
              </div>

              <ComparisonRow
                label="Match 6 (Jackpot)"
                normal="$500K–$2.25M"
                rolldown="No winner → pool flows down"
              />
              <ComparisonRow
                label="Match 5"
                normal="$1,000"
                rolldown="~$70,000"
                rolldownHighlight
              />
              <ComparisonRow
                label="Match 4"
                normal="$50"
                rolldown="~$3,333"
                rolldownHighlight
              />
              <ComparisonRow
                label="Match 3"
                normal="$5"
                rolldown="~$225"
                rolldownHighlight
              />
              <ComparisonRow
                label="Match 2"
                normal="Free Ticket"
                rolldown="Free Ticket"
              />

              <div className="mt-4 flex items-start gap-2 p-3 rounded-xl bg-emerald/[0.03] border border-emerald/10">
                <Sparkles
                  size={12}
                  className="text-emerald-light mt-0.5 shrink-0"
                />
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  <span className="font-bold text-emerald-light">
                    Match 5 rolldown prize is ~70× normal.
                  </span>{" "}
                  Match 4 is ~67×. Match 3 is ~45×. The largest group of winners
                  (Match 3 at 1:54 odds) gets 40% of the pool, making the
                  rolldown valuable even for common outcomes. This is
                  intentional — we want the benefit to reach the widest number
                  of players.
                </p>
              </div>
            </div>
          </div>

          {/* -------------------------------------------------------------- */}
          {/*  Section 6: Strategy Guide                                     */}
          {/* -------------------------------------------------------------- */}
          <div>
            <SectionHeading
              number="6"
              title="Strategic Play"
              subtitle="How to maximize your edge during rolldown windows"
              icon={Star}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                {
                  title: "Monitor the Jackpot",
                  description:
                    "Watch the jackpot tracker on the Dashboard. When it approaches the $1.75M soft cap, a rolldown becomes increasingly likely. The probability meter shows you the exact trigger chance.",
                  icon: Eye,
                  tip: "Bookmark the Dashboard for daily checks",
                },
                {
                  title: "Buy More During Rolldown",
                  description:
                    "When the rolldown is active, every ticket has positive expected value. Strategic players increase their ticket purchases during these windows. Even Match 3 (1:54 odds) pays ~$225 instead of $5.",
                  icon: TrendingUp,
                  tip: "Use bulk buy (up to 20 tickets) for max coverage",
                },
                {
                  title: "Join a Syndicate",
                  description:
                    "Pool resources with other players to buy more tickets. During rolldown, a syndicate's combined buying power means more winners and more prizes distributed among members.",
                  icon: Users,
                  tip: "Syndicates are most effective during rolldown",
                },
                {
                  title: "Use Quick Pick Express",
                  description:
                    "With draws every 4 hours and a $30K soft cap, Quick Pick Express reaches rolldown faster. The +66.7% EV is even higher than the main lottery's +47%. At $1.50/ticket, it's low-risk, high-frequency.",
                  icon: Zap,
                  tip: "Requires $50 lifetime spend in main lottery",
                },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="glass rounded-xl p-4 sm:p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-1.5 rounded-lg bg-emerald/10 border border-emerald/20">
                        <Icon size={14} className="text-emerald-light" />
                      </div>
                      <h3 className="text-sm font-bold text-foreground">
                        {item.title}
                      </h3>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                      {item.description}
                    </p>
                    <div className="flex items-center gap-1.5 text-[10px] text-gold/70">
                      <Star size={9} className="text-gold" />
                      <span className="font-semibold">Tip:</span>{" "}
                      <span>{item.tip}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 glass rounded-xl p-4 border border-gold/10">
              <div className="flex items-start gap-3">
                <div className="p-1.5 rounded-lg bg-gold/10 shrink-0 mt-0.5">
                  <AlertTriangle size={14} className="text-gold" />
                </div>
                <div>
                  <p className="text-xs font-bold text-gold mb-1">
                    Important: Responsible Gaming
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Even during +EV windows, lottery outcomes are still
                    probabilistic. Positive expected value means the{" "}
                    <em>average</em> return is favorable over many plays, not
                    that every individual ticket will win. Never wager more than
                    you can afford to lose. MazelProtocol is designed to be fun
                    and transparent, not a guaranteed income source.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* -------------------------------------------------------------- */}
          {/*  Section 7: Why Your Odds Are Better                           */}
          {/* -------------------------------------------------------------- */}
          <div>
            <SectionHeading
              number="7"
              title="Why Your Odds Are Better Here"
              subtitle="How the rolldown gives you a real mathematical edge over every other lottery"
              icon={TrendingUp}
            />

            <div className="glass rounded-2xl p-5 sm:p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-xs font-bold text-foreground mb-2 flex items-center gap-1.5">
                    <TrendingUp size={11} className="text-emerald" />
                    The Rolldown Is Your Edge
                  </h4>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Every other lottery keeps the unclaimed jackpot and rolls it
                    forward forever — you never see that money. MazelProtocol{" "}
                    <strong>
                      caps the jackpot and forces it back to players
                    </strong>
                    . When no one hits the top prize, the entire pool flows down
                    to lower tiers. Your Match 3 ticket that normally pays $5
                    can suddenly pay{" "}
                    <span className="text-emerald-light font-semibold">
                      $225
                    </span>
                    .
                  </p>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-foreground mb-2 flex items-center gap-1.5">
                    <DollarSign size={11} className="text-gold" />
                    Pari-Mutuel = Fewer Winners, Bigger Prizes
                  </h4>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    During rolldown, prizes are <strong>pari-mutuel</strong>{" "}
                    (Pool ÷ Winners). This means{" "}
                    <span className="text-gold font-semibold">
                      the fewer people who play, the more each winner gets
                    </span>
                    . Time your purchases when you spot a rolldown window
                    forming and you&apos;re splitting a massive pool with fewer
                    players. That&apos;s the exploit.
                  </p>
                </div>
              </div>

              {/* Odds comparison with other lotteries */}
              <div>
                <h4 className="text-xs font-bold text-foreground mb-3 flex items-center gap-1.5">
                  <Target size={11} className="text-emerald" />
                  Your Odds vs Other Lotteries
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    {
                      name: "Powerball",
                      odds: "1 in 292M",
                      ev: "-50%",
                      color: "text-red-400",
                    },
                    {
                      name: "Mega Millions",
                      odds: "1 in 302M",
                      ev: "-55%",
                      color: "text-red-400",
                    },
                    {
                      name: "EuroMillions",
                      odds: "1 in 139M",
                      ev: "-50%",
                      color: "text-red-400",
                    },
                    {
                      name: "MazelProtocol",
                      odds: "1 in 9.37M",
                      ev: "+47%",
                      color: "text-emerald-light",
                    },
                  ].map((lottery) => (
                    <div
                      key={lottery.name}
                      className={`p-2.5 rounded-lg text-center ${
                        lottery.name === "MazelProtocol"
                          ? "bg-emerald/[0.06] border border-emerald/20"
                          : "bg-foreground/[0.02]"
                      }`}
                    >
                      <div className="text-[10px] text-muted-foreground mb-0.5">
                        {lottery.name}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {lottery.odds}
                      </div>
                      <div
                        className={`text-sm font-black mt-0.5 ${lottery.color}`}
                      >
                        {lottery.ev} EV
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Why this matters for YOU */}
              <div>
                <h4 className="text-xs font-bold text-foreground mb-3 flex items-center gap-1.5">
                  <Sparkles size={11} className="text-gold" />
                  What This Means For You
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 rounded-xl bg-emerald/[0.04] border border-emerald/10">
                    <div className="text-sm font-black text-emerald-light">
                      31× Better
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      Jackpot Odds vs Powerball
                    </div>
                    <div className="text-[9px] text-muted-foreground/60 mt-0.5">
                      1:9.37M vs 1:292M
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-emerald/[0.04] border border-emerald/10">
                    <div className="text-sm font-black text-emerald-light">
                      1 in 54
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      Match 3 Odds
                    </div>
                    <div className="text-[9px] text-muted-foreground/60 mt-0.5">
                      Pays ~$225 during rolldown
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-gold/[0.04] border border-gold/10">
                    <div className="text-sm font-black text-gold">~15 Days</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      Average Rolldown Cycle
                    </div>
                    <div className="text-[9px] text-muted-foreground/60 mt-0.5">
                      Regular +EV windows to exploit
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-emerald/[0.03] border border-emerald/10">
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  <span className="font-bold text-emerald-light">
                    The rolldown is designed for you to exploit.
                  </span>{" "}
                  Every ~15 days, the jackpot caps and the entire pool
                  redistributes to lower-tier winners. Smart players monitor the
                  jackpot tracker, increase their ticket purchases when the soft
                  cap approaches, and let the math work in their favor. Your
                  prizes are always backed by on-chain reserves — 5% of every
                  ticket goes to reserve and insurance funds that guarantee
                  payouts.
                </p>
              </div>
            </div>
          </div>

          {/* -------------------------------------------------------------- */}
          {/*  Section 8: FAQ                                                */}
          {/* -------------------------------------------------------------- */}
          <div>
            <SectionHeading
              number="8"
              title="Frequently Asked Questions"
              subtitle="Common questions about the rolldown mechanism"
              icon={BookOpen}
            />

            <div className="space-y-3">
              {[
                {
                  q: "What happens if someone wins the jackpot during a rolldown-eligible draw?",
                  a: "If a player matches all 6 numbers (or all 5 in Quick Pick Express), they win the full jackpot at its current amount — there is no rolldown. The rolldown only triggers when the top prize goes unclaimed. The jackpot then resets to the seed amount and the cycle begins again.",
                },
                {
                  q: "Can anyone prevent or delay the rolldown?",
                  a: "No. Rolldowns are triggered automatically by the smart contract based on on-chain jackpot balance and verifiable randomness. Nobody can interfere with, delay, or manipulate the rolldown. The code is open, the logic is transparent, and every draw is verifiable on-chain.",
                },
                {
                  q: "When should I buy tickets for maximum advantage?",
                  a: "Watch the jackpot tracker on the Dashboard. When it approaches the $1.75M soft cap, rolldown probability increases linearly. At the $2.25M hard cap, a rolldown is guaranteed. The closer to the hard cap, the better your expected value. Strategic players load up on tickets during these windows.",
                },
                {
                  q: "Does the +EV guarantee I'll make money?",
                  a: "Positive EV is a statistical edge over many plays — not a guarantee on any single ticket. But consider this: traditional lotteries have -50% EV (you lose half on average). During rolldown, MazelProtocol has +47% EV. Over time, that mathematical edge compounds in your favor. It's the same principle professional gamblers use.",
                },
                {
                  q: "Why are the odds so much better than Powerball or Mega Millions?",
                  a: "MazelProtocol uses a 6/46 matrix (1 in 9.37 million for the jackpot) versus Powerball's 5/69+1/26 (1 in 292 million). That's 31× better odds. And during rolldown, even matching just 3 numbers (1 in 54 odds) pays ~$225 instead of $5. No traditional lottery offers anything close to this.",
                },
                {
                  q: "How does pari-mutuel pricing benefit me?",
                  a: "During rolldown, prizes are Pool ÷ Winners. Fewer players in a draw means each winner gets a bigger share of the jackpot. If you time your purchases when fewer people are buying — say, a rolldown that triggers mid-week — you're splitting a massive pool with fewer competitors. That's how you maximize your edge.",
                },
                {
                  q: "How long between rolldown windows?",
                  a: "At average volumes (~14,000 tickets/day for 6/46), the jackpot grows from the $500K seed to the $1.75M soft cap in roughly 15 days. Quick Pick Express cycles are much faster due to the smaller $30K soft cap and 4-hour draw frequency — you get rolldown opportunities multiple times per week.",
                },
                {
                  q: "How do I know the draws are fair?",
                  a: "MazelProtocol uses Switchboard's Trusted Execution Environment (TEE) randomness with a commit-reveal pattern. The randomness is committed before ticket purchases close, then revealed to execute the draw. Everything is on-chain and verifiable. You can audit every single draw yourself.",
                },
              ].map((faq) => (
                <div key={faq.q} className="glass rounded-xl p-4 sm:p-5">
                  <h3 className="text-xs font-bold text-foreground mb-2">
                    {faq.q}
                  </h3>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {faq.a}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* -------------------------------------------------------------- */}
          {/*  CTA                                                           */}
          {/* -------------------------------------------------------------- */}
          <div className="relative glass-strong rounded-2xl p-8 sm:p-12 text-center overflow-hidden border-gradient-emerald">
            <div className="absolute inset-0 bg-glow-emerald opacity-15" />
            <div className="absolute inset-0 bg-glow-gold opacity-10" />

            <div className="relative z-10">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald/20 to-gold/10 border border-emerald/20 mb-5 glow-emerald">
                <Trophy size={24} className="text-emerald-light" />
              </div>

              <h2 className="text-2xl sm:text-3xl font-black text-foreground mb-3">
                Ready to Play{" "}
                <span className="text-gradient-primary">Smart</span>?
              </h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
                Monitor the jackpot, time your purchases during rolldown
                windows, and let the math work in your favor.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  to="/play"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 text-sm font-bold text-white bg-gradient-to-r from-emerald to-emerald-dark hover:from-emerald-light hover:to-emerald rounded-xl transition-all duration-300 shadow-xl shadow-emerald/25 hover:shadow-emerald/40 hover:scale-[1.02] active:scale-[0.98]"
                >
                  <Trophy size={16} />
                  Play 6/46 Lottery
                </Link>
                <Link
                  to="/play/quick-pick"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 text-sm font-bold text-emerald-light bg-transparent border-2 border-emerald/30 hover:border-emerald/50 hover:bg-emerald/5 rounded-xl transition-all duration-300"
                >
                  <Zap size={16} />
                  Quick Pick Express
                </Link>
                <Link
                  to="/dashboard"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 text-sm font-semibold text-muted-foreground bg-transparent border border-foreground/10 hover:border-foreground/20 hover:bg-foreground/[0.03] rounded-xl transition-all duration-300"
                >
                  <BarChart3 size={16} />
                  Monitor Rolldown
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
