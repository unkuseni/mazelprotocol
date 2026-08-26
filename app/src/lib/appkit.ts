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

let initPromise: Promise<boolean> | null = null;
let solanaAdapter: SolanaAdapter | null = null;

/**
 * Lazily initialize AppKit exactly once.
 *
 * Resolves `true` if AppKit was successfully created (i.e. `createAppKit`
 * was called), or `false` if initialization was skipped (server, missing
 * project ID, or failure). On the server it resolves immediately.
 *
 * Safe to call multiple times — only the first call triggers initialization.
 */
export function initAppKit(): Promise<boolean> {
	if (!isBrowser) return Promise.resolve(false);
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

			const { solana } = networks;

			const solanaWeb3JsAdapter = new SolanaAdapter();
			solanaAdapter = solanaWeb3JsAdapter;

			console.log("[AppKit] Environment check:", {
				hasEnv: !!env,
				hasViteReownProjectId: !!env?.VITE_REOWN_PROJECT_ID,
				envKeys: env ? Object.keys(env).filter((k) => k.includes("VITE")) : [],
			});

			const projectId = env.VITE_REOWN_PROJECT_ID;
			// SECURITY (review C2): never log the raw project ID — only its
			// presence, so credentials don't leak into browser console output.
			console.log("[AppKit] Project ID:", projectId ? "configured" : "missing");

			if (!projectId) {
				console.warn(
					"[AppKit] Missing VITE_REOWN_PROJECT_ID — wallet connection will not work.\n" +
						"Get one at https://dashboard.reown.com",
				);
				return false;
			}

			const metadata = {
				name: "MazelProtocol",
				description:
					"A provably fair lottery protocol on Solana. Transparent rolldown mechanics with publicly verifiable randomness.",
				url: window.location.origin,
				icons: ["https://avatars.githubusercontent.com/u/179229932"],
			};

			createAppKit({
				adapters: [solanaWeb3JsAdapter],
				// SECURITY (review M4): only mainnet is exposed. The app's program IDs,
				// USDC mint, and RPC are mainnet-only. Previously testnet/devnet were
				// listed too, letting users build mainnet PDAs against a devnet
				// connection (or vice-versa) — a fund-loss class of footgun.
				networks: [solana],
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

			return true;
		} catch (error) {
			console.error("[AppKit] Initialization failed:", error);
			return false;
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

/* ---------------------------------------------------------------------------
 * Pending "open wallet modal" request
 *
 * AppKit is initialized lazily (after the first render, or on the first
 * "Connect" click). If the user clicks Connect before initialization has
 * finished, the stub context queues the request here and the client bridge
 * replays it as soon as `createAppKit` has completed — so a click is never
 * silently dropped during the (short) initialization window.
 * ------------------------------------------------------------------------- */

interface PendingOpenRequest {
	/** `undefined` means "open the default modal view" */
	options: Record<string, unknown> | undefined;
}

let pendingOpenRequest: PendingOpenRequest | null = null;

/** Queue a wallet-modal open request (safe to call before init completes). */
export function requestWalletOpen(options?: Record<string, unknown>) {
	pendingOpenRequest = { options };
}

/**
 * Take (and clear) the queued open request, if any.
 * Returns `null` when nothing was queued, otherwise the options
 * (`undefined` = open the default modal view).
 */
export function consumePendingOpen():
	| Record<string, unknown>
	| undefined
	| null {
	if (!pendingOpenRequest) return null;
	const { options } = pendingOpenRequest;
	pendingOpenRequest = null;
	return options;
}
