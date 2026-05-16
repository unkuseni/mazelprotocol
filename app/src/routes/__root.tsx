import { TanStackDevtools } from "@tanstack/react-devtools";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { useEffect, useMemo, useState } from "react";
import { Provider as TRPCProvider } from "@/integrations/tanstack-query/root-provider";
import { AppKitProvider } from "@/lib/appkit-provider";
import { ThemeProvider } from "@/lib/theme";
import { isGeoblocked, getGeoblockMessage } from "@/lib/geoblock";
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
        title: "MazelProtocol | A Provably Fair Lottery",
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
        content: "MazelProtocol | A Provably Fair Lottery",
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
          "A provably fair lottery on Solana. Transparent rolldown mechanics with publicly verifiable randomness.",
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

  // Geoblocking: controlled by VITE_ENABLE_GEOBLOCK feature flag.
  // Requires Cloudflare Workers to set the cf_country cookie.
  const [geoblocked, setGeoblocked] = useState(false);

  useEffect(() => {
    if (import.meta.env.VITE_ENABLE_GEOBLOCK !== "true") return;
    const match = document.cookie.match(/(?:^|;\s*)cf_country=([^;]*)/);
    const country = match?.[1];
    if (isGeoblocked(country, undefined)) {
      setGeoblocked(true);
    }
  }, []);

  if (geoblocked) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          padding: "2rem",
          textAlign: "center",
          fontFamily: "Inter, system-ui, sans-serif",
          background: "#0a0f1a",
          color: "#fff",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>
            Access Restricted
          </h1>
          <p style={{ color: "#94a3b8", maxWidth: "480px" }}>
            {getGeoblockMessage()}
          </p>
        </div>
      </div>
    );
  }

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
              {process.env.NODE_ENV === "development" && (
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
              )}
            </ThemeProvider>
          </TRPCProvider>
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  );
}
