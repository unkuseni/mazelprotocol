// Client-only provider that calls the real AppKit React hooks.
//
// This file is loaded via React.lazy() so it is NEVER imported on the server.
// It is safe to statically import `@reown/appkit/react` here because this
// module only executes in the browser after hydration.

import {
  useAppKit as useRealAppKit,
  useAppKitAccount as useRealAppKitAccount,
  useDisconnect as useRealDisconnect,
} from "@reown/appkit/react";
import { type ReactNode, useMemo } from "react";

import { AppKitContext, type AppKitContextValue } from "./appkit-provider";

/**
 * Inner provider that bridges real AppKit hook values into our shared context.
 *
 * Because this component is rendered only on the client (behind a
 * `React.lazy` + `Suspense` boundary), the hooks execute in a valid
 * browser environment with full access to the AppKit singleton created
 * in `appkit.ts`.
 */
export default function AppKitClientProvider({
  children,
}: {
  children: ReactNode;
}) {
  console.log("[AppKitClientProvider] Initializing client provider");
  const appKit = useRealAppKit();
  const account = useRealAppKitAccount();
  const { disconnect } = useRealDisconnect();

  console.log("[AppKitClientProvider] Account state:", {
    address: account.address,
    isConnected: account.isConnected,
    status: account.status,
    caipAddress: account.caipAddress,
  });
  console.log("[AppKitClientProvider] AppKit:", {
    hasOpen: typeof appKit.open === "function",
    hasClose: typeof appKit.close === "function",
  });

  const value = useMemo<AppKitContextValue>(() => {
    console.log("[AppKitClientProvider] Creating context value");
    return {
      ready: true,
      open: appKit.open ?? (() => {}),
      close: appKit.close ?? (() => {}),
      address: account.address,
      isConnected: account.isConnected ?? false,
      caipAddress: account.caipAddress,
      status: account.status,
      disconnect: disconnect ?? (async () => {}),
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
