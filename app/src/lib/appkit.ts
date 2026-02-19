// Reown AppKit initialization — client-only singleton
//
// Provides a single `initAppKit()` function that lazily creates the AppKit
// instance exactly once. Safe to call from SSR (no-ops on the server).
//
// Call this from your root route loader (client-only guard) so AppKit is
// ready before any wallet UI renders.

import type { SolanaAdapter } from "@reown/appkit-adapter-solana/react";
import { env } from "@/env";

const isBrowser =
  typeof window !== "undefined" && typeof document !== "undefined";

let initPromise: Promise<void> | null = null;
let solanaAdapter: SolanaAdapter | null = null;

/**
 * Lazily initialize AppKit exactly once.
 *
 * Returns a promise that resolves when the modal is ready, or resolves
 * immediately on the server (no-op).
 *
 * Safe to call multiple times — only the first call triggers initialization.
 */
export function initAppKit(): Promise<void> {
  if (!isBrowser) return Promise.resolve();
  if (initPromise) return initPromise;

  initPromise = (async () => {
    console.log("[AppKit] Initializing...");
    try {
      const [{ createAppKit }, { SolanaAdapter }, networks] = await Promise.all(
        [
          import("@reown/appkit/react"),
          import("@reown/appkit-adapter-solana/react"),
          import("@reown/appkit/networks"),
        ],
      );

      const { solana, solanaTestnet, solanaDevnet } = networks;

      const solanaWeb3JsAdapter = new SolanaAdapter();
      solanaAdapter = solanaWeb3JsAdapter;

      console.log("[AppKit] Environment check:", {
        hasEnv: !!env,
        hasViteReownProjectId: !!env?.VITE_REOWN_PROJECT_ID,
        envKeys: env ? Object.keys(env).filter((k) => k.includes("VITE")) : [],
      });

      const projectId = env.VITE_REOWN_PROJECT_ID;
      console.log(
        "[AppKit] Project ID:",
        projectId ? "present" : "missing",
        projectId,
      );

      if (!projectId) {
        console.warn(
          "[AppKit] Missing VITE_REOWN_PROJECT_ID — wallet connection will not work.\n" +
            "Get one at https://dashboard.reown.com",
        );
        return;
      }

      const metadata = {
        name: "MazelProtocol",
        description:
          "The first intentionally exploitable lottery on Solana. Positive expected value rolldown mechanics for strategic players.",
        url: window.location.origin,
        icons: ["https://avatars.githubusercontent.com/u/179229932"],
      };

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
    } catch (error) {
      console.error("[AppKit] Initialization failed:", error);
      throw error;
    }
  })();

  return initPromise;
}

/**
 * Get the Solana adapter instance for transaction signing
 * Note: Only available after `initAppKit()` has been called
 */
export function getSolanaAdapter() {
  return solanaAdapter;
}
