// Reown AppKit initialization — client-only singleton
//
// AppKit uses Lit web components internally which require `document`.
// We guard all initialization behind a browser check for SSR compatibility.
//
// This module is imported at the top level in `__root.tsx` to trigger
// initialization as early as possible during client hydration.

import { env } from "@/env";

// Safe browser detection for SSR compatibility
const isBrowser =
  typeof window !== "undefined" && typeof document !== "undefined";

let initialized = false;
let initPromise: Promise<void> | null = null;

/**
 * Lazily initialize AppKit exactly once.
 * Returns a promise that resolves when the modal is ready (or immediately on
 * the server where it no-ops).
 */
export function initAppKit(): Promise<void> {
  if (!isBrowser) return Promise.resolve();
  if (initPromise) return initPromise;

  initialized = true;

  initPromise = (async () => {
    const [{ createAppKit }, { SolanaAdapter }, networks] = await Promise.all([
      import("@reown/appkit/react"),
      import("@reown/appkit-adapter-solana/react"),
      import("@reown/appkit/networks"),
    ]);

    const { solana, solanaTestnet, solanaDevnet } = networks;

    // Solana adapter
    const solanaWeb3JsAdapter = new SolanaAdapter();

    // Project ID from Reown Dashboard
    const projectId = env.VITE_REOWN_PROJECT_ID;

    if (!projectId) {
      console.warn(
        "[AppKit] Missing VITE_REOWN_PROJECT_ID — wallet connection will not work.\n" +
          "Get one at https://dashboard.reown.com",
      );
      // Return early if no project ID to avoid initialization errors
      return;
    }

    // Metadata — origin must match your domain & subdomain
    const metadata = {
      name: "MazelProtocol",
      description:
        "The first intentionally exploitable lottery on Solana. Positive expected value rolldown mechanics for strategic players.",
      url:
        typeof window !== "undefined"
          ? window.location.origin
          : "https://mazelprotocol.elimarko024.workers.dev",
      icons: ["https://avatars.githubusercontent.com/u/179229932"],
    };

    // Create AppKit singleton — must be called once, outside React components
    createAppKit({
      adapters: [solanaWeb3JsAdapter],
      networks: [solana, solanaTestnet, solanaDevnet],
      metadata,
      projectId,
      features: {
        email: true,
        socials: ["google", "x", "discord", "github", "apple", "facebook"],
        emailShowWallets: true,
        analytics: true,
      },
      allWallets: "SHOW",
      themeMode: "dark" as const,
      themeVariables: {
        "--w3m-color-mix": "#00BB7F",
        "--w3m-color-mix-strength": 15,
        "--w3m-border-radius-master": "2px",
        "--w3m-accent": "#00BB7F",
        "--w3m-font-family": "Inter, sans-serif",
      },
    });
  })();

  return initPromise;
}

/**
 * Whether `initAppKit()` has already been called.
 */
export function isAppKitInitialized(): boolean {
  return initialized;
}

// Fire immediately on import — the async function no-ops on the server
// Only attempt initialization in browser environment
if (isBrowser) {
  try {
    initAppKit();
  } catch (error) {
    // Silently catch initialization errors during import
    console.debug("[AppKit] Initialization error during import:", error);
  }
}
