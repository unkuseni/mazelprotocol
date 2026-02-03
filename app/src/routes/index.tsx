import { createFileRoute } from "@tanstack/react-router";
import {
  TrendingUp,
  Shield,
  Users,
  Coins,
  Clock,
  Gift,
  Lock,
  Sparkles,
  Trophy,
  LucideIcon,
} from "lucide-react";

export const Route = createFileRoute("/")({ component: LandingPage });

interface FeatureCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  highlight?: boolean;
}

interface StatCardProps {
  value: string;
  label: string;
  icon: LucideIcon;
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
      bg-gradient-to-br from-slate-800/50 to-slate-900/50
      backdrop-blur-sm border rounded-2xl p-6
      hover:border-purple-500/50 transition-all duration-300
      hover:shadow-xl hover:shadow-purple-500/10
      ${highlight ? "border-purple-500/30 shadow-lg shadow-purple-500/20" : "border-slate-700"}
    `}
    >
      <div className="mb-4">
        <div
          className={`inline-flex p-3 rounded-xl ${highlight ? "bg-purple-500/20" : "bg-slate-700/50"}`}
        >
          <Icon
            className={`w-8 h-8 ${highlight ? "text-purple-400" : "text-cyan-400"}`}
          />
        </div>
      </div>
      <h3 className="text-xl font-bold text-white mb-3">{title}</h3>
      <p className="text-gray-400 leading-relaxed">{description}</p>
    </div>
  );
}

function StatCard({ value, label, icon: Icon }: StatCardProps) {
  return (
    <div className="text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-purple-500/20 to-cyan-500/20 mb-4">
        <Icon className="w-8 h-8 text-purple-400" />
      </div>
      <div className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
        {value}
      </div>
      <div className="text-gray-400 mt-2">{label}</div>
    </div>
  );
}

function LandingPage() {
  const features = [
    {
      icon: TrendingUp,
      title: "Positive-EV Rolldown",
      description:
        "When jackpot hits $1.75M, prizes roll down to lower tiers creating +11.2% expected value per ticket. This isn't a bug—it's the feature.",
      highlight: true,
    },
    {
      icon: Shield,
      title: "Provably Fair",
      description:
        "Switchboard Randomness with TEE ensures verifiable randomness for every draw. All draws and balances fully transparent on-chain.",
      highlight: false,
    },
    {
      icon: Users,
      title: "Syndicate System",
      description:
        "Create or join pools with automatic prize splitting. Compete in Syndicate Wars for bonus rewards and leaderboard rankings.",
      highlight: false,
    },
    {
      icon: Coins,
      title: "Dynamic Fee Model",
      description:
        "House fee scales from 28-40% based on jackpot level. During rolldown, fee drops to minimum 28% to maximize player profits.",
      highlight: false,
    },
    {
      icon: Clock,
      title: "Quick Pick Express",
      description:
        "5/35 mini-lottery every 4 hours with +59% rolldown exploit. $1.50 tickets, $50 lifetime gate requirement.",
      highlight: false,
    },
    {
      icon: Lock,
      title: "Operator Protection",
      description:
        "Hybrid FIXED → PARI-MUTUEL system caps operator liability at jackpot amount. 5% safety buffer (3% reserve + 2% insurance).",
      highlight: false,
    },
  ];

  const stats = [
    {
      value: "1 in 9.37M",
      label: "Jackpot Odds (6/46)",
      icon: Trophy,
    },
    {
      value: "+11.2%",
      label: "Rolldown EV",
      icon: TrendingUp,
    },
    {
      value: "$2.50",
      label: "Ticket Price",
      icon: Coins,
    },
    {
      value: "Daily",
      label: "Draw Frequency",
      icon: Clock,
    },
  ];

  const gameParameters = [
    { parameter: "Matrix", value: "6/46 (Pick 6 from 46)" },
    { parameter: "Ticket Price", value: "$2.50 USDC" },
    { parameter: "Jackpot Seed", value: "$500,000" },
    { parameter: "Soft Cap (Rolldown Trigger)", value: "$1,750,000" },
    { parameter: "Hard Cap", value: "$2,250,000" },
    { parameter: "Draw Time", value: "Daily at 00:00 UTC" },
    { parameter: "House Fee Range", value: "28% - 40% (dynamic)" },
    { parameter: "Insurance Pool", value: "2% of every ticket" },
  ];

  const prizeTiers = [
    {
      match: "6 Numbers",
      prize: "Jackpot (55.6% of pool)",
      odds: "1 in 9.37M",
    },
    {
      match: "5 Numbers",
      prize: "$10,000 fixed → pari-mutuel",
      odds: "1 in 54,201",
    },
    {
      match: "4 Numbers",
      prize: "$100 fixed → pari-mutuel",
      odds: "1 in 1,032",
    },
    { match: "3 Numbers", prize: "$4 fixed → pari-mutuel", odds: "1 in 57" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* Hero Section */}
      <section className="relative py-20 px-4 sm:px-6 lg:px-8 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 via-cyan-500/10 to-purple-500/10"></div>
        <div className="relative max-w-7xl mx-auto">
          <div className="text-center">
            <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-gradient-to-r from-purple-500/20 to-cyan-500/20 border border-purple-500/30 mb-6">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <span className="text-sm font-medium text-cyan-300">
                Revolutionary Lottery Protocol
              </span>
            </div>

            <h1 className="text-5xl sm:text-6xl md:text-7xl font-black mb-6">
              <span className="block">The World's First</span>
              <span className="block mt-2">
                <span className="bg-gradient-to-r from-purple-400 via-cyan-400 to-purple-400 bg-clip-text text-transparent">
                  Intentionally Exploitable
                </span>
              </span>
              <span className="block mt-2">Lottery</span>
            </h1>

            <p className="text-xl sm:text-2xl text-gray-300 max-w-3xl mx-auto mb-8">
              SolanaLotto introduces{" "}
              <span className="text-cyan-400 font-semibold">
                positive expected value windows
              </span>
              through mathematical rolldown mechanics. Play smart, win bigger.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <button
                type="button"
                className="px-8 py-4 bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-700 hover:to-cyan-700 text-white font-bold rounded-xl transition-all duration-300 shadow-lg shadow-purple-500/50"
              >
                Start Playing Now
              </button>
              <button
                type="button"
                className="px-8 py-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-semibold rounded-xl transition-all duration-300"
              >
                Read Whitepaper
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat) => (
              <StatCard key={stat.label} {...stat} />
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              <span className="bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
                Revolutionary Features
              </span>
            </h2>
            <p className="text-gray-400 text-lg max-w-3xl mx-auto">
              Built on Solana for maximum transparency, security, and player
              advantage.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <FeatureCard key={feature.title} {...feature} />
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-slate-800/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              How the <span className="text-purple-400">Rolldown</span> Works
            </h2>
            <p className="text-gray-400 text-lg max-w-3xl mx-auto">
              The mathematical exploit that creates guaranteed profit
              opportunities.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-purple-500/20 to-cyan-500/20 flex items-center justify-center">
                    <span className="text-xl font-bold text-purple-400">1</span>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white mb-2">
                      Jackpot Accumulation
                    </h3>
                    <p className="text-gray-400">
                      Daily draws with $2.50 tickets. Jackpot grows until it
                      reaches $1.75M soft cap.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-purple-500/20 to-cyan-500/20 flex items-center justify-center">
                    <span className="text-xl font-bold text-purple-400">2</span>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white mb-2">
                      Rolldown Trigger
                    </h3>
                    <p className="text-gray-400">
                      At $1.75M with no Match 6 winner, entire prize pool rolls
                      down to lower tiers.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-purple-500/20 to-cyan-500/20 flex items-center justify-center">
                    <span className="text-xl font-bold text-purple-400">3</span>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white mb-2">
                      +EV Window Opens
                    </h3>
                    <p className="text-gray-400">
                      Prizes transition from FIXED to PARI-MUTUEL. Expected
                      value per ticket becomes +11.2%.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-purple-500/20 to-cyan-500/20 flex items-center justify-center">
                    <span className="text-xl font-bold text-purple-400">4</span>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white mb-2">
                      Strategic Play
                    </h3>
                    <p className="text-gray-400">
                      Sophisticated players buy tickets in volume, collecting
                      guaranteed profits.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-2xl p-8">
              <h3 className="text-2xl font-bold mb-6 text-center text-cyan-300">
                Economic Advantage
              </h3>
              <div className="space-y-6">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-gray-400">Normal Draw EV:</span>
                    <span className="text-red-400 font-semibold">
                      -28% to -40%
                    </span>
                  </div>
                  <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-red-500 to-red-600"
                      style={{ width: "34%" }}
                    ></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-gray-400">Rolldown Draw EV:</span>
                    <span className="text-green-400 font-semibold">+11.2%</span>
                  </div>
                  <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-green-500 to-cyan-500"
                      style={{ width: "100%" }}
                    ></div>
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-700">
                  <div className="text-center">
                    <div className="text-3xl font-bold bg-gradient-to-r from-green-400 to-cyan-400 bg-clip-text text-transparent">
                      +$0.28 Profit Per Ticket
                    </div>
                    <div className="text-gray-400 mt-2">
                      During rolldown events
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Game Details Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Game Parameters */}
            <div>
              <h3 className="text-2xl font-bold mb-6 text-purple-400">
                Game Parameters
              </h3>
              <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-slate-700 rounded-xl overflow-hidden">
                <div className="divide-y divide-slate-700">
                  {gameParameters.map((param) => (
                    <div
                      key={param.parameter}
                      className="flex justify-between items-center p-4 hover:bg-slate-800/30 transition-colors"
                    >
                      <span className="text-gray-300">{param.parameter}</span>
                      <span className="font-semibold text-cyan-300">
                        {param.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Prize Tiers */}
            <div>
              <h3 className="text-2xl font-bold mb-6 text-cyan-400">
                Prize Structure
              </h3>
              <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-slate-700 rounded-xl overflow-hidden">
                <div className="divide-y divide-slate-700">
                  {prizeTiers.map((tier) => (
                    <div
                      key={tier.match}
                      className="p-4 hover:bg-slate-800/30 transition-colors"
                    >
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-semibold text-white">
                          {tier.match}
                        </span>
                        <span className="text-sm text-gray-400">
                          {tier.odds}
                        </span>
                      </div>
                      <div className="text-cyan-300 font-medium">
                        {tier.prize}
                      </div>
                      {tier.match === "6 Numbers" && (
                        <div className="mt-2 text-xs text-gray-500">
                          * During rolldown: Jackpot transitions to pari-mutuel
                          shared among Match 5/4/3 winners
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-purple-900/20 via-slate-900/50 to-cyan-900/20">
        <div className="max-w-4xl mx-auto text-center">
          <Gift className="w-16 h-16 mx-auto mb-6 text-purple-400" />
          <h2 className="text-3xl sm:text-4xl font-bold mb-6">
            Ready to Play <span className="text-cyan-400">Smart</span>?
          </h2>
          <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
            Join the revolution where mathematics gives players the edge.
            Monitor rolldown windows, maximize EV, and win bigger.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              type="button"
              className="px-8 py-4 bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-700 hover:to-cyan-700 text-white font-bold rounded-xl transition-all duration-300 shadow-xl shadow-purple-500/30"
            >
              Connect Wallet & Play
            </button>
            <button
              type="button"
              className="px-8 py-4 bg-transparent border-2 border-cyan-500/50 hover:border-cyan-400 text-cyan-400 font-semibold rounded-xl transition-all duration-300 hover:bg-cyan-500/10"
            >
              View Documentation
            </button>
          </div>
          <p className="text-gray-500 text-sm mt-8">
            SolanaLotto Protocol v2.4 • Built on Solana • Fully transparent •
            Non-custodial
          </p>
        </div>
      </section>
    </div>
  );
}
