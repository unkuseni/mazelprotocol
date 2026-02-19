import { TanStackDevtools } from "@tanstack/react-devtools";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { useMemo } from "react";
import { Provider as TRPCProvider } from "@/integrations/tanstack-query/root-provider";
import { AppKitProvider } from "@/lib/appkit-provider";
import { ThemeProvider } from "@/lib/theme";
import Header from "../components/Header";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
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
  const queryClient = useMemo(() => new QueryClient(), []);

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <QueryClientProvider client={queryClient}>
          <TRPCProvider queryClient={queryClient}>
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
                ]}
              />
            </ThemeProvider>
          </TRPCProvider>
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  );
}
