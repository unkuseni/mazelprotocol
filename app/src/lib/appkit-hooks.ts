// Client-safe AppKit hooks via React Context.
//
// AppKit uses Lit web components that reference `document` at import time,
// crashing in SSR. This module provides hooks that always return stable values:
// stubs during SSR / before init, real values after the client-side lazy provider mounts.
//
// Architecture:
//   - `AppKitContext` holds the current hook values (stubs or real).
//   - `AppKitProvider` renders children immediately with stub context on the
//     server. On the client it swaps in a `React.lazy`-loaded inner provider
//     (`appkit-client-provider.tsx`) that calls the real `@reown/appkit/react`
//     hooks and feeds their values into the same context.
//   - Exported hooks (`useAppKit`, `useAppKitAccount`, `useDisconnect`) simply
//     read from context — they never import `@reown/appkit/react` themselves.

import React, {
  createContext,
  Suspense,
  useContext,
  useEffect,
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
  // AppKit
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
/*  Stubs (used during SSR and before the client provider mounts)             */
/* -------------------------------------------------------------------------- */

const STUB_VALUE: AppKitContextValue = {
  ready: false,
  open: () => {},
  close: () => {},
  isConnected: false,
  disconnect: async () => {},
};

/* -------------------------------------------------------------------------- */
/*  Context (exported so the client provider can access it)                   */
/* -------------------------------------------------------------------------- */

export const AppKitContext = createContext<AppKitContextValue>(STUB_VALUE);

/* -------------------------------------------------------------------------- */
/*  Lazy-loaded client provider                                               */
/* -------------------------------------------------------------------------- */

const LazyClientProvider = React.lazy(() => import("./appkit-client-provider"));

/* -------------------------------------------------------------------------- */
/*  Provider                                                                  */
/* -------------------------------------------------------------------------- */

const isBrowser =
  typeof window !== "undefined" && typeof document !== "undefined";

/**
 * Wrap your component tree with this provider (typically in `__root.tsx`).
 *
 * On the server (and during the first client render before hydration) it
 * provides stub values so consuming hooks never throw. Once mounted on the
 * client it lazily loads the real provider which calls the actual AppKit
 * hooks and pushes live values into context.
 */
export function AppKitProvider({ children }: { children: React.ReactNode }) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    if (isBrowser) {
      setIsClient(true);
    }
  }, []);

  // Server or first client render — provide stubs so children can render.
  if (!isClient) {
    return React.createElement(
      AppKitContext.Provider,
      { value: STUB_VALUE },
      children,
    );
  }

  // Client — render the lazy provider inside Suspense. While the chunk loads,
  // the fallback still provides stubs so the UI doesn't break.
  return React.createElement(
    Suspense,
    {
      fallback: React.createElement(
        AppKitContext.Provider,
        { value: STUB_VALUE },
        children,
      ),
    },
    React.createElement(LazyClientProvider, null, children),
  );
}

/* -------------------------------------------------------------------------- */
/*  Exported hooks                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Client-safe replacement for `useAppKit` from `@reown/appkit/react`.
 */
export function useAppKit(): AppKitHook {
  const ctx = useContext(AppKitContext);
  return { open: ctx.open, close: ctx.close };
}

/**
 * Client-safe replacement for `useAppKitAccount`.
 */
export function useAppKitAccount(): AppKitAccountHook {
  const ctx = useContext(AppKitContext);
  return {
    address: ctx.address,
    isConnected: ctx.isConnected,
    caipAddress: ctx.caipAddress,
    status: ctx.status,
  };
}

/**
 * Client-safe replacement for `useDisconnect`.
 */
export function useDisconnect(): DisconnectHook {
  const ctx = useContext(AppKitContext);
  return { disconnect: ctx.disconnect };
}
