import { QueryClient } from "@tanstack/react-query";
import superjson from "superjson";
import { createTRPCClient, httpBatchStreamLink } from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";

import type { TRPCRouter } from "@/integrations/trpc/router";

import { TRPCProvider } from "@/integrations/trpc/react";
import { isDevelopment } from "@/env";

function getUrl() {
  // For Cloudflare Workers, we need to handle both client-side and server-side
  if (typeof window !== "undefined") {
    // Client-side: use relative URL
    return "/api/trpc";
  }

  // Server-side: use environment-aware URL
  if (isDevelopment()) {
    // In development, use localhost with appropriate port
    const port = process.env.PORT ?? 3000;
    return `http://localhost:${port}/api/trpc`;
  }

  // In production (Cloudflare Worker), use relative URL
  return "/api/trpc";
}

export const trpcClient = createTRPCClient<TRPCRouter>({
  links: [
    httpBatchStreamLink({
      transformer: superjson,
      url: getUrl(),
    }),
  ],
});

export function getContext() {
  const queryClient = new QueryClient({
    defaultOptions: {
      dehydrate: { serializeData: superjson.serialize },
      hydrate: { deserializeData: superjson.deserialize },
    },
  });

  const serverHelpers = createTRPCOptionsProxy({
    client: trpcClient,
    queryClient: queryClient,
  });
  return {
    queryClient,
    trpc: serverHelpers,
  };
}

export function Provider({
  children,
  queryClient,
}: {
  children: React.ReactNode;
  queryClient: QueryClient;
}) {
  return (
    <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
      {children}
    </TRPCProvider>
  );
}
