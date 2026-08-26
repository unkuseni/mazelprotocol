// Consolidated AppKit provider — SSR-safe context, lazy-loaded client bridge,
// error boundary, and memoized hooks in a single file.
//
// Architecture:
//   - `AppKitContext` holds wallet state (stubs during SSR, real values on client).
//   - `AppKitProvider` renders stubs on the server. On the client it lazy-loads
//     `AppKitClientBridge` which calls the real `@reown/appkit/react` hooks and
//     feeds their values into context.
//   - Exported hooks (`useAppKit`, `useAppKitAccount`, `useDisconnect`) read
//     from context — they never import `@reown/appkit/react` directly.

import React, {
	Component,
	createContext,
	type ReactNode,
	Suspense,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";

import { requestWalletOpen } from "./appkit";

/* -------------------------------------------------------------------------- */
/*  Public types                                                              */
/* -------------------------------------------------------------------------- */

export interface AppKitHook {
	open: (options?: Record<string, unknown>) => void;
	close: () => void;
	/** True once the AppKit bridge is mounted and live */
	ready: boolean;
	/** True once wallet initialization was requested (click or auto-init) */
	requested: boolean;
}

export interface AppKitAccountHook {
	address?: string;
	isConnected: boolean;
	caipAddress?: string;
	status?: string;
}

export interface DisconnectHook {
	disconnect: () => Promise<void>;
}

/* -------------------------------------------------------------------------- */
/*  Context value                                                             */
/* -------------------------------------------------------------------------- */

export interface AppKitContextValue {
	ready: boolean;
	requested: boolean;
	// AppKit modal
	open: (options?: Record<string, unknown>) => void;
	close: () => void;
	// Account
	address?: string;
	isConnected: boolean;
	caipAddress?: string;
	status?: string;
	// Disconnect
	disconnect: () => Promise<void>;
}

/* -------------------------------------------------------------------------- */
/*  Stubs (SSR & pre-hydration)                                               */
/* -------------------------------------------------------------------------- */

const NOOP = () => {};
const NOOP_ASYNC = async () => {};

const STUB_VALUE: AppKitContextValue = {
	ready: false,
	requested: false,
	open: NOOP,
	close: NOOP,
	isConnected: false,
	disconnect: NOOP_ASYNC,
};

/* -------------------------------------------------------------------------- */
/*  Context                                                                   */
/* -------------------------------------------------------------------------- */

export const AppKitContext = createContext<AppKitContextValue>(STUB_VALUE);

/* -------------------------------------------------------------------------- */
/*  Lazy-loaded client bridge                                                 */
/* -------------------------------------------------------------------------- */

const LazyClientBridge = React.lazy(() => import("./appkit-client-provider"));

/* -------------------------------------------------------------------------- */
/*  Error boundary                                                            */
/* -------------------------------------------------------------------------- */

interface ErrorBoundaryProps {
	children: ReactNode;
	fallback: ReactNode;
}

interface ErrorBoundaryState {
	hasError: boolean;
}

class AppKitErrorBoundary extends Component<
	ErrorBoundaryProps,
	ErrorBoundaryState
> {
	constructor(props: ErrorBoundaryProps) {
		super(props);
		this.state = { hasError: false };
	}

	static getDerivedStateFromError(): ErrorBoundaryState {
		return { hasError: true };
	}

	componentDidCatch(error: unknown) {
		console.warn("[AppKit] Client provider failed to load:", error);
	}

	render() {
		if (this.state.hasError) {
			return this.props.fallback;
		}
		return this.props.children;
	}
}

/* -------------------------------------------------------------------------- */
/*  Provider                                                                  */
/* -------------------------------------------------------------------------- */

const isBrowser =
	typeof window !== "undefined" && typeof document !== "undefined";

/**
 * Delay before AppKit initializes on its own. Keeps the wallet stack (≈450 KB
 * gzip of AppKit/modal chunks) off the first paint, while still restoring a
 * previously connected wallet's session shortly after load. Any "Connect"
 * click initializes immediately, regardless.
 */
const WALLET_AUTO_INIT_DELAY_MS = 2_000;

/**
 * Wrap your component tree with `<AppKitProvider>` (typically in `__root.tsx`).
 *
 * - Server / first client render → provides stubs so consuming hooks never throw.
 * - The real AppKit bridge is lazy-loaded only after wallet initialization is
 *   requested (first "Connect" click, or a short auto-init delay for session
 *   restore). `open()` calls made before the bridge is ready are queued and
 *   replayed when initialization completes — they are never dropped.
 * - If the lazy chunk fails to load, the error boundary falls back to stubs
 *   so the rest of the app remains functional.
 */
export function AppKitProvider({ children }: { children: ReactNode }) {
	const [isClient, setIsClient] = useState(false);
	const [walletRequested, setWalletRequested] = useState(false);

	useEffect(() => {
		if (isBrowser) {
			setIsClient(true);
		}
	}, []);

	// Auto-initialize shortly after mount: restores a connected wallet's
	// session (header shows the address again) without competing with the
	// initial page load.
	useEffect(() => {
		if (!isClient) return;
		const timer = setTimeout(
			() => setWalletRequested(true),
			WALLET_AUTO_INIT_DELAY_MS,
		);
		return () => clearTimeout(timer);
	}, [isClient]);

	// Queue the open request; the bridge replays it once `createAppKit` is done.
	const requestOpen = useCallback((options?: Record<string, unknown>) => {
		setWalletRequested(true);
		requestWalletOpen(options);
	}, []);

	// Pre-bridge context: keeps consumers functional and records the intent so
	// a connect click is never silently dropped (even before auto-init fires).
	const makeStub = useCallback(
		(requested: boolean): AppKitContextValue => ({
			ready: false,
			requested,
			open: requestOpen,
			close: NOOP,
			isConnected: false,
			disconnect: NOOP_ASYNC,
		}),
		[requestOpen],
	);

	const idleStub = useMemo(() => makeStub(false), [makeStub]);
	const requestingStub = useMemo(() => makeStub(true), [makeStub]);

	const stubTree = (
		<AppKitContext.Provider value={requestingStub}>
			{children}
		</AppKitContext.Provider>
	);

	// Server, initial client render, or not yet requested — provide stubs.
	// The idle stub's `open` still records the intent (requesting the bridge).
	if (!isClient || !walletRequested) {
		return (
			<AppKitContext.Provider value={idleStub}>
				{children}
			</AppKitContext.Provider>
		);
	}

	// Client with wallet requested — lazy-load the real bridge inside
	// Suspense + ErrorBoundary. While the chunk loads (or if it fails), the
	// app still renders with stubs.
	return (
		<AppKitErrorBoundary fallback={stubTree}>
			<Suspense fallback={stubTree}>
				<LazyClientBridge>{children}</LazyClientBridge>
			</Suspense>
		</AppKitErrorBoundary>
	);
}

/* -------------------------------------------------------------------------- */
/*  Exported hooks (memoized to avoid unnecessary re-renders)                 */
/* -------------------------------------------------------------------------- */

/**
 * Client-safe replacement for `useAppKit` from `@reown/appkit/react`.
 */
export function useAppKit(): AppKitHook {
	const { open, close, ready, requested } = useContext(AppKitContext);
	return useMemo(
		() => ({ open, close, ready, requested }),
		[open, close, ready, requested],
	);
}

/**
 * Client-safe replacement for `useAppKitAccount`.
 */
export function useAppKitAccount(): AppKitAccountHook {
	const { address, isConnected, caipAddress, status } =
		useContext(AppKitContext);
	return useMemo(
		() => ({ address, isConnected, caipAddress, status }),
		[address, isConnected, caipAddress, status],
	);
}

/**
 * Client-safe replacement for `useDisconnect`.
 */
export function useDisconnect(): DisconnectHook {
	const { disconnect } = useContext(AppKitContext);
	return useMemo(() => ({ disconnect }), [disconnect]);
}
