import { defineConfig } from "vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import viteTsConfigPaths from "vite-tsconfig-paths";
import { fileURLToPath, URL } from "url";

import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

const config = defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  // Prevent AppKit / WalletConnect packages (which reference `document` and
  // other browser globals at import time) from being bundled into the SSR
  // entry that runs inside Cloudflare Workers.
  ssr: {
    noExternal: [],
    external: [
      "@reown/appkit",
      "@reown/appkit-adapter-solana",
      "@reown/appkit/react",
      "@reown/appkit-adapter-solana/react",
      "@reown/appkit/networks",
      "@walletconnect/sign-client",
      "@walletconnect/universal-provider",
    ],
  },
  // Ensure Node.js globals that WalletConnect dependencies may reference in
  // the client bundle are shimmed.
  define: {
    "process.env": "{}",
    global: "globalThis",
  },
  plugins: [
    devtools(),
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    // this is the plugin that enables path aliases
    viteTsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact({
      babel: {
        plugins: ["babel-plugin-react-compiler"],
      },
    }),
  ],
});

export default config;
