import { env } from "@/env";
import { createFileRoute } from "@tanstack/react-router";
import {
  Coins,
  Key,
  Network,
  Route as RouteIcon,
  Server,
  Shield,
  Sparkles,
  Wallet,
  Waves,
  Zap,
} from "lucide-react";

export const Route = createFileRoute("/")({
  component: App,
});

function App() {
  const projectId = env.VITE_REOWN_PROJECT_ID;
  const appTitle = env.VITE_APP_TITLE;

  const web3Features = [
    {
      icon: <Wallet className="w-12 h-12 text-cyan-400" />,
      title: "Solana Wallet Integration",
      description:
        "Connect with Phantom, Solflare, and other Solana wallets seamlessly. Built with Reown AppKit for secure connections.",
    },
    {
      icon: <Coins className="w-12 h-12 text-cyan-400" />,
      title: "Multi-Network Support",
      description:
        "Connect to Solana Mainnet, Devnet, and Testnet. Switch between networks with a single click.",
    },
    {
      icon: <Network className="w-12 h-12 text-cyan-400" />,
      title: "Decentralized Transactions",
      description:
        "Send transactions, interact with smart contracts, and manage assets directly from your wallet.",
    },
    {
      icon: <Key className="w-12 h-12 text-cyan-400" />,
      title: "Secure Authentication",
      description:
        "Wallet-based authentication with cryptographic signatures. No passwords required.",
    },
    {
      icon: <Shield className="w-12 h-12 text-cyan-400" />,
      title: "End-to-End Security",
      description:
        "Private keys never leave your wallet. All transactions are signed client-side for maximum security.",
    },
    {
      icon: <Zap className="w-12 h-12 text-cyan-400" />,
      title: "Lightning Fast",
      description:
        "Built on Solana's high-performance blockchain with sub-second transaction finality.",
    },
  ];

  const frameworkFeatures = [
    {
      icon: <Server className="w-12 h-12 text-purple-400" />,
      title: "Powerful Server Functions",
      description:
        "Write server-side code that seamlessly integrates with your client components. Type-safe, secure, and simple.",
    },
    {
      icon: <RouteIcon className="w-12 h-12 text-purple-400" />,
      title: "API Routes",
      description:
        "Build type-safe API endpoints alongside your application. No separate backend needed.",
    },
    {
      icon: <Waves className="w-12 h-12 text-purple-400" />,
      title: "Full Streaming Support",
      description:
        "Stream data from server to client progressively. Perfect for AI applications and real-time updates.",
    },
    {
      icon: <Sparkles className="w-12 h-12 text-purple-400" />,
      title: "Next Generation Ready",
      description:
        "Built from the ground up for modern web applications. Deploy anywhere JavaScript runs.",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      <section className="relative py-20 px-6 text-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-purple-500/10"></div>
        <div className="relative max-w-5xl mx-auto">
          <div className="flex items-center justify-center gap-6 mb-6">
            <img
              src="/tanstack-circle-logo.png"
              alt="TanStack Logo"
              className="w-24 h-24 md:w-32 md:h-32"
            />
            <h1 className="text-6xl md:text-7xl font-black text-white [letter-spacing:-0.08em]">
              <span className="text-gray-300">MAZEL</span>{" "}
              <span className="bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
                PROTOCOL
              </span>
            </h1>
          </div>
          <p className="text-2xl md:text-3xl text-gray-300 mb-4 font-light">
            Web3 Application Built with TanStack Start & Solana
          </p>
          <p className="text-lg text-gray-400 max-w-3xl mx-auto mb-8">
            A modern full-stack application combining the power of TanStack
            Start with Solana blockchain integration. Build decentralized
            applications with type safety, streaming, and seamless wallet
            connectivity.
          </p>

          {/* Wallet Connection Section */}
          <div className="mb-12 max-w-2xl mx-auto">
            <div>Wallet info</div>
            <div className="mt-6 text-center">
              <p className="text-gray-400 text-sm mb-4">
                {projectId ? (
                  <span className="text-green-400">
                    ✓ Reown AppKit configured
                  </span>
                ) : (
                  <span className="text-yellow-400">
                    ⚠️ Set VITE_REOWN_PROJECT_ID in .env for full functionality
                  </span>
                )}
              </p>
              <p className="text-gray-500 text-xs">
                Connect your Solana wallet to interact with the application
              </p>
            </div>
          </div>

          <div className="flex flex-col items-center gap-4">
            <a
              href="https://tanstack.com/start"
              target="_blank"
              rel="noopener noreferrer"
              className="px-8 py-3 bg-cyan-500 hover:bg-cyan-600 text-white font-semibold rounded-lg transition-colors shadow-lg shadow-cyan-500/50"
            >
              TanStack Documentation
            </a>
            <a
              href="https://docs.reown.com/appkit"
              target="_blank"
              rel="noopener noreferrer"
              className="px-8 py-3 bg-purple-500 hover:bg-purple-600 text-white font-semibold rounded-lg transition-colors shadow-lg shadow-purple-500/50"
            >
              Reown AppKit Docs
            </a>
            <p className="text-gray-400 text-sm mt-2">
              Built with{" "}
              <code className="px-2 py-1 bg-slate-700 rounded text-cyan-400">
                @tanstack/react-start
              </code>{" "}
              and{" "}
              <code className="px-2 py-1 bg-slate-700 rounded text-purple-400">
                @reown/appkit
              </code>
            </p>
          </div>
        </div>
      </section>

      {/* Web3 Features Section */}
      <section className="py-16 px-6 max-w-7xl mx-auto">
        <h2 className="text-3xl font-bold text-white text-center mb-12">
          <span className="bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
            Web3 Features
          </span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
          {web3Features.map((feature, index) => (
            <div
              key={index}
              className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6 hover:border-cyan-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-cyan-500/10"
            >
              <div className="mb-4">{feature.icon}</div>
              <h3 className="text-xl font-semibold text-white mb-3">
                {feature.title}
              </h3>
              <p className="text-gray-400 leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>

        {/* Framework Features Section */}
        <h2 className="text-3xl font-bold text-white text-center mb-12">
          <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            Framework Features
          </span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
          {frameworkFeatures.map((feature, index) => (
            <div
              key={index}
              className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6 hover:border-purple-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/10"
            >
              <div className="mb-4">{feature.icon}</div>
              <h3 className="text-xl font-semibold text-white mb-3">
                {feature.title}
              </h3>
              <p className="text-gray-400 leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Getting Started Section */}
      <section className="py-16 px-6 max-w-4xl mx-auto border-t border-slate-700">
        <div className="text-center">
          <h3 className="text-2xl font-bold text-white mb-6">
            Getting Started
          </h3>
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6 text-left">
            <div className="space-y-4">
              <div>
                <h4 className="text-lg font-semibold text-cyan-400 mb-2">
                  1. Connect Your Wallet
                </h4>
                <p className="text-gray-400">
                  Click the "Connect Wallet" button in the header to connect
                  your Solana wallet. Supported wallets include Phantom,
                  Solflare, Backpack, and more.
                </p>
              </div>
              <div>
                <h4 className="text-lg font-semibold text-cyan-400 mb-2">
                  2. Switch Networks
                </h4>
                <p className="text-gray-400">
                  Use the wallet interface to switch between Solana Mainnet,
                  Devnet, or Testnet based on your needs.
                </p>
              </div>
              <div>
                <h4 className="text-lg font-semibold text-cyan-400 mb-2">
                  3. Start Building
                </h4>
                <p className="text-gray-400">
                  Explore the application features and start building your own
                  Web3 integration using the provided components and hooks.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
