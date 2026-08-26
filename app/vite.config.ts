import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import viteTsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  plugins: [
    viteTsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    tailwindcss(),
    viteReact(),
  ],
  build: {
    rollupOptions: {
      output: {
        // Split rarely-changing vendor code into stable, cacheable chunks and
        // keep route chunks (React.lazy) free of duplicate copies. The AppKit
        // graph is intentionally left alone: it is already dynamically
        // imported only after the app mounts.
        manualChunks: {
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          "query-vendor": ["@tanstack/react-query"],
          "icons-vendor": ["lucide-react"],
          "chain-vendor": ["@solana/web3.js", "@coral-xyz/anchor"],
        },
      },
    },
  },
});
