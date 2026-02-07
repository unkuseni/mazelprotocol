import { Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  Menu,
  X,
  Trophy,
  Zap,
  Users,
  BookOpen,
  Wallet,
  ChevronDown,
  ExternalLink,
  Ticket,
  BarChart3,
  Gem,
  LogOut,
  Copy,
  Check,
} from "lucide-react";
import { useAppKit, useAppKitAccount, useDisconnect } from "@/lib/appkit-hooks";
import { ThemeToggleCompact } from "@/components/ThemeToggle";

const navLinks = [
  {
    label: "Play",
    icon: Trophy,
    children: [
      {
        to: "/play",
        label: "6/46 Main Lottery",
        description: "Daily draws with rolldown mechanics",
        icon: Trophy,
      },
      {
        to: "/play/quick-pick",
        label: "Quick Pick Express",
        description: "5/35 mini-lottery every 4 hours",
        icon: Zap,
      },
    ],
  },
  {
    to: "/syndicates",
    label: "Syndicates",
    icon: Users,
  },
  {
    to: "/results",
    label: "Results",
    icon: BarChart3,
  },
  {
    to: "/tickets",
    label: "My Tickets",
    icon: Ticket,
  },
  {
    label: "Learn",
    icon: BookOpen,
    children: [
      {
        to: "/learn/rolldown",
        label: "How Rolldown Works",
        description: "The math behind positive-EV windows",
        icon: Zap,
      },
      {
        to: "/learn/whitepaper",
        label: "Whitepaper",
        description: "Full protocol specification",
        icon: BookOpen,
      },
      {
        href: "https://github.com/solanalotto",
        label: "GitHub",
        description: "Open-source smart contracts",
        icon: Gem,
      },
    ],
  },
];

function LogoMark() {
  return (
    <div className="relative w-9 h-9 rounded-lg overflow-hidden flex items-center justify-center bg-gradient-to-br from-emerald to-emerald-dark">
      <svg
        viewBox="0 0 32 32"
        className="w-5 h-5"
        fill="none"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="16" cy="16" r="10" />
        <path d="M16 6v20" />
        <path d="M6 16h20" />
        <circle
          cx="16"
          cy="16"
          r="4"
          fill="white"
          fillOpacity="0.3"
          stroke="none"
        />
      </svg>
      <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-white/20 pointer-events-none" />
    </div>
  );
}

interface DropdownProps {
  label: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  children: Array<{
    to?: string;
    href?: string;
    label: string;
    description?: string;
    icon: React.ComponentType<{ className?: string; size?: number }>;
  }>;
}

function DesktopDropdown({ label, icon: Icon, children }: DropdownProps) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-foreground/5"
        onClick={() => setOpen(!open)}
      >
        <Icon size={16} className="opacity-70" />
        <span>{label}</span>
        <ChevronDown
          size={14}
          className={`opacity-50 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute top-full left-0 pt-2 z-50">
          <div className="w-72 rounded-xl glass-strong p-2 shadow-2xl shadow-black/20 dark:shadow-black/40 animate-slide-down">
            {children.map((child) => {
              const ChildIcon = child.icon;

              if (child.href) {
                return (
                  <a
                    key={child.label}
                    href={child.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-3 p-3 rounded-lg hover:bg-foreground/5 transition-colors group"
                    onClick={() => setOpen(false)}
                  >
                    <div className="mt-0.5 p-1.5 rounded-md bg-emerald/10 text-emerald group-hover:bg-emerald/20 transition-colors">
                      <ChildIcon size={16} />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-foreground flex items-center gap-1.5">
                        {child.label}
                        <ExternalLink size={11} className="opacity-40" />
                      </div>
                      {child.description && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {child.description}
                        </div>
                      )}
                    </div>
                  </a>
                );
              }

              return (
                <Link
                  key={child.label}
                  to={child.to!}
                  className="flex items-start gap-3 p-3 rounded-lg hover:bg-foreground/5 transition-colors group"
                  onClick={() => setOpen(false)}
                >
                  <div className="mt-0.5 p-1.5 rounded-md bg-emerald/10 text-emerald group-hover:bg-emerald/20 transition-colors">
                    <ChildIcon size={16} />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-foreground">
                      {child.label}
                    </div>
                    {child.description && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {child.description}
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function WalletButton() {
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount();
  const { disconnect } = useDisconnect();
  const [copied, setCopied] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const truncatedAddress = address
    ? `${address.slice(0, 4)}...${address.slice(-4)}`
    : "";

  const handleCopy = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (isConnected && address) {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowDropdown((p) => !p)}
          className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-foreground bg-emerald/10 border border-emerald/20 hover:border-emerald/40 rounded-lg transition-all duration-200"
        >
          <div className="w-2 h-2 rounded-full bg-emerald animate-pulse" />
          <span className="font-mono text-xs">{truncatedAddress}</span>
          <ChevronDown
            size={14}
            className={`opacity-60 transition-transform duration-200 ${showDropdown ? "rotate-180" : ""}`}
          />
        </button>

        {showDropdown && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setShowDropdown(false)}
            />
            <div className="absolute right-0 mt-2 w-56 z-50 rounded-xl bg-card/95 backdrop-blur-xl border border-border shadow-xl shadow-black/10 dark:shadow-black/30 p-2 space-y-1">
              <button
                type="button"
                onClick={handleCopy}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-foreground/5 rounded-lg transition-colors"
              >
                {copied ? (
                  <Check size={14} className="text-emerald" />
                ) : (
                  <Copy size={14} className="opacity-60" />
                )}
                <span>{copied ? "Copied!" : "Copy Address"}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  open({ view: "Account" });
                  setShowDropdown(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-foreground/5 rounded-lg transition-colors"
              >
                <Wallet size={14} className="opacity-60" />
                <span>Wallet Details</span>
              </button>
              <div className="h-px bg-border my-1" />
              <button
                type="button"
                onClick={() => {
                  disconnect();
                  setShowDropdown(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/5 rounded-lg transition-colors"
              >
                <LogOut size={14} />
                <span>Disconnect</span>
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => open({ view: "Connect", namespace: "solana" })}
      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-emerald to-emerald-dark hover:from-emerald-light hover:to-emerald rounded-lg transition-all duration-300 shadow-lg shadow-emerald/20 hover:shadow-emerald/30 hover:scale-[1.02] active:scale-[0.98]"
    >
      <Wallet size={16} />
      <span>Connect Wallet</span>
    </button>
  );
}

function MobileWalletButton() {
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount();
  const { disconnect } = useDisconnect();

  const truncatedAddress = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : "";

  if (isConnected && address) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald/10 border border-emerald/20">
          <div className="w-2 h-2 rounded-full bg-emerald animate-pulse" />
          <span className="font-mono text-xs text-emerald-light">
            {truncatedAddress}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => open({ view: "Account" })}
            className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-muted-foreground bg-foreground/5 hover:bg-foreground/10 rounded-lg transition-colors"
          >
            <Wallet size={13} />
            <span>Details</span>
          </button>
          <button
            type="button"
            onClick={() => disconnect()}
            className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-red-400 bg-red-500/5 hover:bg-red-500/10 rounded-lg transition-colors"
          >
            <LogOut size={13} />
            <span>Disconnect</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => open({ view: "Connect", namespace: "solana" })}
      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-emerald to-emerald-dark rounded-lg shadow-lg shadow-emerald/20"
    >
      <Wallet size={16} />
      <span>Connect Wallet</span>
    </button>
  );
}

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState<Record<string, boolean>>(
    {},
  );

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <>
      {/* Main Header */}
      <header
        className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 ${
          scrolled
            ? "glass-strong shadow-lg shadow-black/10 dark:shadow-black/20"
            : "bg-transparent"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2.5 group">
              <LogoMark />
              <div className="flex flex-col">
                <span className="text-base font-bold text-foreground tracking-tight leading-none group-hover:text-emerald-light transition-colors">
                  SolanaLotto
                </span>
                <span className="text-[10px] text-muted-foreground font-medium tracking-wider uppercase leading-none mt-0.5">
                  Protocol
                </span>
              </div>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden lg:flex items-center gap-1">
              {navLinks.map((link) => {
                if ("children" in link && link.children) {
                  return (
                    <DesktopDropdown
                      key={link.label}
                      label={link.label}
                      icon={link.icon}
                      children={link.children}
                    />
                  );
                }

                return (
                  <Link
                    key={link.label}
                    to={(link as { to: string }).to}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-foreground/5"
                    activeProps={{
                      className:
                        "flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-emerald-light bg-emerald/10 rounded-lg",
                    }}
                  >
                    <link.icon size={16} className="opacity-70" />
                    <span>{link.label}</span>
                  </Link>
                );
              })}
            </nav>

            {/* Right side: Wallet + Mobile menu */}
            <div className="flex items-center gap-3">
              {/* Theme Toggle */}
              <div className="hidden sm:block">
                <ThemeToggleCompact />
              </div>

              {/* Live Jackpot Badge (Desktop only) */}
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-gold/10 border border-gold/20">
                <div className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse" />
                <span className="text-xs font-semibold text-gold">
                  Jackpot: $1.2M
                </span>
              </div>

              {/* Wallet Connect Button */}
              <div className="hidden sm:block">
                <WalletButton />
              </div>

              {/* Mobile Menu Toggle */}
              <button
                type="button"
                onClick={() => setMobileOpen(!mobileOpen)}
                className="lg:hidden p-2 text-muted-foreground hover:text-foreground hover:bg-foreground/5 rounded-lg transition-colors"
                aria-label={mobileOpen ? "Close menu" : "Open menu"}
              >
                {mobileOpen ? <X size={22} /> : <Menu size={22} />}
              </button>
            </div>
          </div>
        </div>

        {/* Gradient border at bottom when scrolled */}
        {scrolled && <div className="section-divider" />}
      </header>

      {/* Mobile Menu Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile Menu Panel */}
      <aside
        className={`fixed top-0 right-0 h-full w-80 max-w-[85vw] z-50 lg:hidden transform transition-transform duration-300 ease-in-out ${
          mobileOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="h-full flex flex-col bg-card/95 dark:bg-navy-deep/95 backdrop-blur-xl border-l border-border">
          {/* Mobile header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-2.5">
              <LogoMark />
              <span className="font-bold text-foreground">SolanaLotto</span>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggleCompact />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="p-2 text-muted-foreground hover:text-foreground hover:bg-foreground/5 rounded-lg transition-colors"
                aria-label="Close menu"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Mobile wallet connect */}
          <div className="px-4 pt-4">
            <MobileWalletButton />
          </div>

          {/* Jackpot badge mobile */}
          <div className="mx-4 mt-3 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-gold/10 border border-gold/20">
            <div className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse" />
            <span className="text-xs font-semibold text-gold">
              Live Jackpot: $1,247,832
            </span>
          </div>

          {/* Mobile nav links */}
          <nav className="flex-1 overflow-y-auto p-4 space-y-1">
            <Link
              to="/"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-foreground/5 rounded-lg transition-colors"
              activeProps={{
                className:
                  "flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-emerald-light bg-emerald/10 rounded-lg",
              }}
            >
              <Trophy size={18} className="opacity-70" />
              <span>Home</span>
            </Link>

            {navLinks.map((link) => {
              if ("children" in link && link.children) {
                const isExpanded = mobileExpanded[link.label];
                return (
                  <div key={link.label}>
                    <button
                      type="button"
                      onClick={() =>
                        setMobileExpanded((prev) => ({
                          ...prev,
                          [link.label]: !prev[link.label],
                        }))
                      }
                      className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-foreground/5 rounded-lg transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <link.icon size={18} className="opacity-70" />
                        <span>{link.label}</span>
                      </div>
                      <ChevronDown
                        size={16}
                        className={`opacity-50 transition-transform duration-200 ${
                          isExpanded ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                    {isExpanded && (
                      <div className="ml-4 mt-1 space-y-1 border-l border-border pl-3">
                        {link.children.map((child) => {
                          const ChildIcon = child.icon;

                          if ("href" in child && child.href) {
                            return (
                              <a
                                key={child.label}
                                href={child.href as string}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={() => setMobileOpen(false)}
                                className="flex items-center gap-2.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-foreground/5 rounded-lg transition-colors"
                              >
                                <ChildIcon size={15} className="opacity-60" />
                                <span>{child.label}</span>
                                <ExternalLink
                                  size={11}
                                  className="ml-auto opacity-30"
                                />
                              </a>
                            );
                          }

                          return (
                            <Link
                              key={child.label}
                              to={child.to!}
                              onClick={() => setMobileOpen(false)}
                              className="flex items-center gap-2.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-foreground/5 rounded-lg transition-colors"
                              activeProps={{
                                className:
                                  "flex items-center gap-2.5 px-3 py-2 text-sm text-emerald-light bg-emerald/10 rounded-lg",
                              }}
                            >
                              <ChildIcon size={15} className="opacity-60" />
                              <span>{child.label}</span>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <Link
                  key={link.label}
                  to={(link as { to: string }).to}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-foreground/5 rounded-lg transition-colors"
                  activeProps={{
                    className:
                      "flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-emerald-light bg-emerald/10 rounded-lg",
                  }}
                >
                  <link.icon size={18} className="opacity-70" />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Mobile footer */}
          <div className="p-4 border-t border-border">
            <div className="flex items-center justify-center gap-4 text-muted-foreground text-xs">
              <span>Built on Solana</span>
              <span className="w-1 h-1 rounded-full bg-muted-foreground/40" />
              <span>Non-custodial</span>
              <span className="w-1 h-1 rounded-full bg-muted-foreground/40" />
              <span>Provably Fair</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Spacer for fixed header */}
      <div className="h-16" />
    </>
  );
}
