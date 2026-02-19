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
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/* -------------------------------------------------------------------------- */
/*  Public types                                                              */
/* -------------------------------------------------------------------------- */

export interface AppKitHook {
  open: (options?: Record<string, unknown>) => void;
  close: () => void;
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
 * Wrap your component tree with `<AppKitProvider>` (typically in `__root.tsx`).
 *
 * - Server / first client render → provides stubs so consuming hooks never throw.
 * - Client after hydration → lazy-loads the real AppKit bridge which pushes
 *   live wallet values into the same context.
 * - If the lazy chunk fails to load, the error boundary falls back to stubs
 *   so the rest of the app remains functional.
 */
export function AppKitProvider({ children }: { children: ReactNode }) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    if (isBrowser) {
      setIsClient(true);
    }
  }, []);

  const stubTree = (
    <AppKitContext.Provider value={STUB_VALUE}>
      {children}
    </AppKitContext.Provider>
  );

  // Server or initial client render — provide stubs
  if (!isClient) {
    return stubTree;
  }

  // Client — lazy-load the real bridge inside Suspense + ErrorBoundary.
  // While the chunk loads (or if it fails), the app still renders with stubs.
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
  const { open, close } = useContext(AppKitContext);
  return useMemo(() => ({ open, close }), [open, close]);
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
