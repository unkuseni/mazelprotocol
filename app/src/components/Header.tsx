import { Link } from "@tanstack/react-router";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Home,
  Menu,
  Trophy,
  Zap,
  Users,
  BookOpen,
  BarChart3,
  Wallet,
  X,
  Sparkles,
} from "lucide-react";

export default function Header() {
  const [isOpen, setIsOpen] = useState(false);
  const [groupedExpanded, setGroupedExpanded] = useState<
    Record<string, boolean>
  >({});

  return (
    <>
      <header className="p-4 flex items-center bg-linear-to-r from-slate-900 via-slate-800 to-slate-900 text-white shadow-lg border-b border-slate-700">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
          aria-label="Open menu"
        >
          <Menu size={24} />
        </button>
        <div className="ml-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-linear-to-br from-purple-500 to-cyan-500 flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold bg-linear-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
              SolanaLotto
            </h1>
            <p className="text-xs text-gray-400">Protocol v2.4</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-4">
          <button
            type="button"
            className="px-4 py-2 bg-linear-to-r from-purple-600 to-cyan-600 hover:from-purple-700 hover:to-cyan-700 text-white font-semibold rounded-lg transition-all duration-300 shadow-lg shadow-purple-500/50"
          >
            Connect Wallet
          </button>
        </div>
      </header>

      <aside
        className={`fixed top-0 left-0 h-full w-80 bg-linear-to-b from-slate-900 to-slate-800 text-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${isOpen ? "translate-x-0" : "-translate-x-full"
          }`}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-linear-to-br from-purple-500 to-cyan-500 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold">SolanaLotto</h2>
              <p className="text-xs text-gray-400">Navigation</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
            aria-label="Close menu"
          >
            <X size={24} />
          </button>
        </div>

        <nav className="flex-1 p-4 overflow-y-auto">
          <Link
            to="/"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-800 transition-colors mb-2"
            activeProps={{
              className:
                "flex items-center gap-3 p-3 rounded-lg bg-gradient-to-r from-purple-600/30 to-cyan-600/30 border border-purple-500/30 hover:border-purple-500/50 transition-colors mb-2",
            }}
          >
            <Home size={20} />
            <span className="font-medium">Home</span>
          </Link>

          {/* Main Lottery Navigation */}
          <div className="flex flex-row justify-between">
            <Link
              to="/demo/tanstack-query"
              onClick={() => setIsOpen(false)}
              className="flex-1 flex items-center gap-3 p-3 rounded-lg hover:bg-slate-800 transition-colors mb-2"
              activeProps={{
                className:
                  "flex-1 flex items-center gap-3 p-3 rounded-lg bg-gradient-to-r from-purple-600/30 to-cyan-600/30 border border-purple-500/30 hover:border-purple-500/50 transition-colors mb-2",
              }}
            >
              <Trophy size={20} />
              <span className="font-medium">Play Lottery</span>
            </Link>
            <button
              type="button"
              className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
              onClick={() =>
                setGroupedExpanded((prev) => ({
                  ...prev,
                  Lottery: !prev.Lottery,
                }))
              }
            >
              {groupedExpanded.Lottery ? (
                <ChevronDown size={20} />
              ) : (
                <ChevronRight size={20} />
              )}
            </button>
          </div>
          {groupedExpanded.Lottery && (
            <div className="flex flex-col ml-4 mb-2">
              <Link
                to="/demo/table"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-800 transition-colors mb-2 text-sm"
                activeProps={{
                  className:
                    "flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700 hover:border-cyan-500/50 transition-colors mb-2 text-sm",
                }}
              >
                <span className="ml-2">• 6/46 Main Lottery</span>
              </Link>
              <Link
                to="/demo/form/simple"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-800 transition-colors mb-2 text-sm"
                activeProps={{
                  className:
                    "flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700 hover:border-cyan-500/50 transition-colors mb-2 text-sm",
                }}
              >
                <span className="ml-2">• Quick Pick Express</span>
              </Link>
            </div>
          )}

          {/* Syndicate System */}
          <Link
            to="/demo/start/server-funcs"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-800 transition-colors mb-2"
            activeProps={{
              className:
                "flex items-center gap-3 p-3 rounded-lg bg-gradient-to-r from-purple-600/30 to-cyan-600/30 border border-purple-500/30 hover:border-purple-500/50 transition-colors mb-2",
            }}
          >
            <Users size={20} />
            <span className="font-medium">Syndicates</span>
          </Link>

          {/* Dashboard */}
          <Link
            to="/demo/db-chat"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-800 transition-colors mb-2"
            activeProps={{
              className:
                "flex items-center gap-3 p-3 rounded-lg bg-gradient-to-r from-purple-600/30 to-cyan-600/30 border border-purple-500/30 hover:border-purple-500/50 transition-colors mb-2",
            }}
          >
            <BarChart3 size={20} />
            <span className="font-medium">My Dashboard</span>
          </Link>

          {/* My Wallet/Tickets */}
          <Link
            to="/demo/trpc-todo"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-800 transition-colors mb-2"
            activeProps={{
              className:
                "flex items-center gap-3 p-3 rounded-lg bg-gradient-to-r from-purple-600/30 to-cyan-600/30 border border-purple-500/30 hover:border-purple-500/50 transition-colors mb-2",
            }}
          >
            <Wallet size={20} />
            <span className="font-medium">My Tickets</span>
          </Link>

          {/* Documentation */}
          <div className="flex flex-row justify-between mt-8">
            <Link
              to="/demo/start/ssr"
              onClick={() => setIsOpen(false)}
              className="flex-1 flex items-center gap-3 p-3 rounded-lg hover:bg-slate-800 transition-colors mb-2"
              activeProps={{
                className:
                  "flex-1 flex items-center gap-3 p-3 rounded-lg bg-gradient-to-r from-purple-600/30 to-cyan-600/30 border border-purple-500/30 hover:border-purple-500/50 transition-colors mb-2",
              }}
            >
              <BookOpen size={20} />
              <span className="font-medium">Documentation</span>
            </Link>
            <button
              type="button"
              className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
              onClick={() =>
                setGroupedExpanded((prev) => ({
                  ...prev,
                  Docs: !prev.Docs,
                }))
              }
            >
              {groupedExpanded.Docs ? (
                <ChevronDown size={20} />
              ) : (
                <ChevronRight size={20} />
              )}
            </button>
          </div>
          {groupedExpanded.Docs && (
            <div className="flex flex-col ml-4 mb-2">
              <a
                href="https://docs.solanalotto.io/whitepaper"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-800 transition-colors mb-2 text-sm"
              >
                <span className="ml-2">• Whitepaper</span>
              </a>
              <a
                href="https://docs.solanalotto.io/technical"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-800 transition-colors mb-2 text-sm"
              >
                <span className="ml-2">• Technical Specs</span>
              </a>
              <a
                href="https://docs.solanalotto.io/quick-start"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-800 transition-colors mb-2 text-sm"
              >
                <span className="ml-2">• Quick Start Guide</span>
              </a>
            </div>
          )}

          {/* About */}
          <Link
            to="/demo/start/api-request"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-800 transition-colors mb-2"
            activeProps={{
              className:
                "flex items-center gap-3 p-3 rounded-lg bg-gradient-to-r from-purple-600/30 to-cyan-600/30 border border-purple-500/30 hover:border-purple-500/50 transition-colors mb-2",
            }}
          >
            <Zap size={20} />
            <span className="font-medium">About Rolldown</span>
          </Link>

          {/* Demo Section (Keep for reference but collapse by default) */}
          <div className="mt-8 pt-6 border-t border-slate-700">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs text-gray-500 font-medium">
                DEMO CONTENT
              </span>
            </div>
            <div className="flex flex-row justify-between">
              <button
                type="button"
                className="flex-1 flex items-center gap-3 p-3 rounded-lg hover:bg-slate-800 transition-colors mb-2 text-sm"
                onClick={() =>
                  setGroupedExpanded((prev) => ({
                    ...prev,
                    Demo: !prev.Demo,
                  }))
                }
              >
                <span className="font-medium">Show Demo Routes</span>
              </button>
              <button
                type="button"
                className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
                onClick={() =>
                  setGroupedExpanded((prev) => ({
                    ...prev,
                    Demo: !prev.Demo,
                  }))
                }
              >
                {groupedExpanded.Demo ? (
                  <ChevronDown size={20} />
                ) : (
                  <ChevronRight size={20} />
                )}
              </button>
            </div>
            {groupedExpanded.Demo && (
              <div className="flex flex-col ml-4 mb-2">
                <Link
                  to="/demo/tanstack-query"
                  onClick={() => setIsOpen(false)}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-800 transition-colors mb-2 text-sm"
                >
                  <span className="ml-2">• TanStack Query Demo</span>
                </Link>
                <Link
                  to="/demo/table"
                  onClick={() => setIsOpen(false)}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-800 transition-colors mb-2 text-sm"
                >
                  <span className="ml-2">• TanStack Table Demo</span>
                </Link>
                <Link
                  to="/demo/form/simple"
                  onClick={() => setIsOpen(false)}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-800 transition-colors mb-2 text-sm"
                >
                  <span className="ml-2">• Form Demo</span>
                </Link>
              </div>
            )}
          </div>
        </nav>

        <div className="p-4 border-t border-slate-700">
          <div className="text-center text-sm text-gray-500">
            <p>Built on Solana • Fully transparent • Non-custodial</p>
          </div>
        </div>
      </aside>
    </>
  );
}
