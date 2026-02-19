// Client-only provider that calls the real AppKit React hooks.
//
// This file is loaded via React.lazy() so it is NEVER imported on the server.
// It is safe to statically import `@reown/appkit/react` here because this
// module only executes in the browser after hydration.
//
// Architecture:
//   1. `AppKitClientProvider` (default export) acts as a "gate" — it calls
//      `initAppKit()` and waits for the promise to resolve before rendering
//      any AppKit hooks. This eliminates the race condition where the
//      `shellComponent` renders before the route loader completes.
//   2. `AppKitClientBridge` is the inner component that actually calls the
//      real `@reown/appkit/react` hooks and feeds their values into context.
//      It only mounts after `createAppKit` has been called successfully.

import {
  useAppKit as useRealAppKit,
  useAppKitAccount as useRealAppKitAccount,
  useDisconnect as useRealDisconnect,
} from "@reown/appkit/react";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import { initAppKit } from "./appkit";
import { AppKitContext, type AppKitContextValue } from "./appkit-provider";

// Kick off initialization immediately when this module is first imported.
// Because this file is loaded via React.lazy(), it only runs in the browser.
// This means `initAppKit()` starts as early as possible — potentially before
// the component even mounts.
const appKitReadyPromise = initAppKit();

/* -------------------------------------------------------------------------- */
/*  Stubs (shown while waiting for initialization)                            */
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
/*  Gate component (default export)                                           */
/* -------------------------------------------------------------------------- */

/**
 * Waits for `initAppKit()` to complete, then renders the real hook bridge.
 *
 * While initialization is in progress the children are wrapped in the stub
 * context so the rest of the app can render without errors.
 *
 * If initialization fails the component remains in stub mode — the error
 * boundary in `AppKitProvider` will also catch any throw, but this avoids
 * an unnecessary unmount/remount cycle.
 */
export default function AppKitClientProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    appKitReadyPromise
      .then(() => {
        if (!cancelled) {
          console.log(
            "[AppKitClientProvider] AppKit initialized, mounting bridge",
          );
          setReady(true);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error(
            "[AppKitClientProvider] AppKit initialization failed:",
            error,
          );
          setFailed(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Still initializing or failed — provide stubs so the app remains functional
  if (!ready || failed) {
    return (
      <AppKitContext.Provider value={STUB_VALUE}>
        {children}
      </AppKitContext.Provider>
    );
  }

  // AppKit is ready — safe to call hooks
  return <AppKitClientBridge>{children}</AppKitClientBridge>;
}

/* -------------------------------------------------------------------------- */
/*  Bridge component (calls the real hooks)                                   */
/* -------------------------------------------------------------------------- */

/**
 * Inner provider that bridges real AppKit hook values into our shared context.
 *
 * This component is ONLY rendered after `createAppKit` has been called
 * successfully, so all `@reown/appkit/react` hooks are safe to use here.
 */
function AppKitClientBridge({ children }: { children: ReactNode }) {
  const appKit = useRealAppKit();
  const account = useRealAppKitAccount();
  const { disconnect } = useRealDisconnect();

  const value = useMemo<AppKitContextValue>(() => {
    return {
      ready: true,
      open: appKit.open ?? NOOP,
      close: appKit.close ?? NOOP,
      address: account.address,
      isConnected: account.isConnected ?? false,
      caipAddress: account.caipAddress,
      status: account.status,
      disconnect: disconnect ?? NOOP_ASYNC,
    };
  }, [
    appKit.open,
    appKit.close,
    account.address,
    account.isConnected,
    account.caipAddress,
    account.status,
    disconnect,
  ]);

  return (
    <AppKitContext.Provider value={value}>{children}</AppKitContext.Provider>
  );
}
