import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { TanStackDevtools } from "@tanstack/react-devtools";

import Header from "../components/Header";

import TanStackQueryDevtools from "../integrations/tanstack-query/devtools";

// Initialize Reown AppKit (must be imported at module level, outside components)
import "../lib/appkit";
import { AppKitProvider } from "../lib/appkit-hooks";

import { ThemeProvider } from "@/lib/theme";

import appCss from "../styles.css?url";

import type { QueryClient } from "@tanstack/react-query";

import type { TRPCRouter } from "@/integrations/trpc/router";
import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query";

interface MyRouterContext {
  queryClient: QueryClient;

  trpc: TRPCOptionsProxy<TRPCRouter>;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
      },
      {
        name: "description",
        content:
          "MazelProtocol introduces positive expected value windows through mathematical rolldown mechanics. Play smart, win bigger on Solana.",
      },
      {
        title: "MazelProtocol | The First Intentionally Exploitable Lottery",
      },
      {
        name: "theme-color",
        content: "#0a0f1a",
      },
      {
        name: "color-scheme",
        content: "dark light",
      },
      {
        property: "og:title",
        content: "MazelProtocol | The First Intentionally Exploitable Lottery",
      },
      {
        property: "og:description",
        content:
          "MazelProtocol introduces positive expected value windows through mathematical rolldown mechanics. Play smart, win bigger on Solana.",
      },
      {
        property: "og:type",
        content: "website",
      },
      {
        name: "twitter:card",
        content: "summary_large_image",
      },
      {
        name: "twitter:title",
        content: "MazelProtocol",
      },
      {
        name: "twitter:description",
        content:
          "The first intentionally exploitable lottery on Solana. +EV rolldown mechanics for strategic players.",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "preconnect",
        href: "https://fonts.googleapis.com",
      },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap",
      },
    ],
  }),

  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ThemeProvider>
          <AppKitProvider>
            <Header />
            {children}
          </AppKitProvider>
          <TanStackDevtools
            config={{
              position: "bottom-right",
            }}
            plugins={[
              {
                name: "Tanstack Router",
                render: <TanStackRouterDevtoolsPanel />,
              },
              TanStackQueryDevtools,
            ]}
          />
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  );
}
