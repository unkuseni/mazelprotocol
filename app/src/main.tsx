import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "@/App";
import { AppKitProvider } from "@/lib/appkit-provider";
import { ThemeProvider } from "@/lib/theme";

import "@/styles.css";

// Create QueryClient
const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 30_000,
			gcTime: 5 * 60_000,
			retry: 2,
			refetchOnWindowFocus: false,
			refetchOnMount: true,
			refetchOnReconnect: true,
		},
	},
});

// AppKit is initialized lazily by the AppKitProvider's client bridge (loaded
// after the first render), so the wallet stack never blocks the first paint.

// Mount the app
createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<BrowserRouter>
			<QueryClientProvider client={queryClient}>
				<ThemeProvider>
					<AppKitProvider>
						<App />
					</AppKitProvider>
				</ThemeProvider>
				{import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
			</QueryClientProvider>
		</BrowserRouter>
	</StrictMode>,
);
