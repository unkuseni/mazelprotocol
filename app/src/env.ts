import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/**
 * Environment variable schema for the application.
 *
 * This schema defines all environment variables that can be used in the application,
 * both on the client and server. It provides type safety and runtime validation.
 *
 * Client variables must be prefixed with VITE_ and are exposed to the browser.
 * Server variables are only available in server-side code (Cloudflare Workers).
 */
export const env = createEnv({
  /**
   * Server-side environment variables.
   * These are only available in Cloudflare Workers and server-side functions.
   */
  server: {
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),

    // TODO: Server URLs — needed when API layer moves to dedicated endpoint
    // SERVER_URL: z.string().url().optional(),
    // API_BASE_URL: z.string().url().optional(),

    // TODO: Database URL — needed when D1 or another DB is integrated
    // DATABASE_URL: z.string().url().optional(),

    // TODO: Cloudflare-specific bindings — provided by Cloudflare Workers runtime
    // KV_NAMESPACE: z.custom<KVNamespace>().optional(),
    // D1_DATABASE: z.custom<D1Database>().optional(),
    // R2_BUCKET: z.custom<R2Bucket>().optional(),

    // Third-party service credentials
    REOWN_PROJECT_ID: z.string().min(1).optional(),

    // TODO: Feature flags — enable when analytics and debug tooling are added
    // ENABLE_ANALYTICS: z
    //   .enum(["true", "false"])
    //   .default("false")
    //   .transform((val) => val === "true"),
    // DEBUG_MODE: z
    //   .enum(["true", "false"])
    //   .default("false")
    //   .transform((val) => val === "true"),
  },

  /**
   * Client-side environment variables.
   * These are exposed to the browser and must be prefixed with VITE_.
   */
  clientPrefix: "VITE_",

  client: {
    // Application metadata
    VITE_APP_TITLE: z.string().min(1).default("mazelProtocol"),
    // TODO: Add when SEO metadata needs are defined
    // VITE_APP_DESCRIPTION: z.string().optional(),
    // VITE_APP_VERSION: z.string().default("1.0.0"),

    // TODO: API endpoints — needed when API layer is separated from frontend
    // VITE_API_BASE_URL: z.string().url().optional(),
    // VITE_WS_URL: z.string().url().optional(),

    // Third-party services (public keys only)
    // Optional so the app still renders (with wallet features disabled) when
    // the project ID is missing — appkit.ts already handles this gracefully.
    VITE_REOWN_PROJECT_ID: z.string().min(1).optional(),

    // Blockchain configuration
    VITE_SOLANA_RPC_URL: z
      .string()
      .url()
      .default("https://api.mainnet-beta.solana.com"),
    VITE_SOLANA_WS_URL: z.string().url().optional(),
    VITE_MAIN_LOTTERY_PROGRAM_ID: z
      .string()
      .min(1)
      .default("7WyaHk2u8AgonsryMpnvbtp42CfLJFPQpyY5p9ys6FiF"),
    VITE_QUICKPICK_PROGRAM_ID: z
      .string()
      .min(1)
      .default("7XC1KT5mvsHHXbR2mH6er138fu2tJ4L2fAgmpjLnnZK2"),
    VITE_USDC_MINT: z
      .string()
      .min(1)
      .default("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),

    // TODO: Client feature flags — enable when dev tooling is expanded
    // VITE_ENABLE_DEV_TOOLS: z
    //   .enum(["true", "false"])
    //   .default("false")
    //   .transform((val) => val === "true"),
    // VITE_LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  },

  /**
   * Runtime environment detection.
   * In the browser: uses import.meta.env (Vite)
   * In Node.js/Cloudflare Worker: uses process.env
   */
  runtimeEnv:
    typeof import.meta !== "undefined" ? import.meta.env : process.env,

  /**
   * Treat empty strings as undefined.
   * This prevents validation errors for optional variables with empty values.
   */
  emptyStringAsUndefined: true,

  /**
   * Skip validation of client variables on the server.
   * This is important because server-side code shouldn't validate client-only variables.
   */
  skipValidation: typeof import.meta === "undefined",
});

/**
 * Type exports for use in other parts of the application.
 */
export type EnvSchema = typeof env;

// Server environment variables (from the server schema)
export type ServerEnv = {
  NODE_ENV: string;
  REOWN_PROJECT_ID?: string;
};

// Client environment variables (from the client schema)
export type ClientEnv = {
  VITE_APP_TITLE: string;
  VITE_REOWN_PROJECT_ID?: string;
  VITE_SOLANA_RPC_URL: string;
  VITE_SOLANA_WS_URL?: string;
  VITE_MAIN_LOTTERY_PROGRAM_ID: string;
  VITE_QUICKPICK_PROGRAM_ID: string;
  VITE_USDC_MINT: string;
};

/**
 * Helper function to get environment variables in Cloudflare Worker context.
 * This bridges the gap between local validation and Cloudflare's runtime environment.
 */
export function getCloudflareEnv(
  cfEnv: Record<string, string | number | boolean | undefined>,
): ServerEnv {
  // Merge Cloudflare env with process.env for server-side validation
  const mergedEnv = {
    ...process.env,
    ...cfEnv,
  };

  // Create a server-only env validation
  const serverEnv = createEnv({
    server: {
      NODE_ENV: z
        .enum(["development", "test", "production"])
        .default("development"),
      // TODO: Add when these env vars are activated in the main schema above
      // SERVER_URL: z.string().url().optional(),
      // API_BASE_URL: z.string().url().optional(),
      // DATABASE_URL: z.string().url().optional(),
      REOWN_PROJECT_ID: z.string().min(1).optional(),
      // ENABLE_ANALYTICS: z
      //   .enum(["true", "false"])
      //   .default("false")
      //   .transform((val) => val === "true"),
      // DEBUG_MODE: z
      //   .enum(["true", "false"])
      //   .default("false")
      //   .transform((val) => val === "true"),
    },
    runtimeEnv: mergedEnv,
    emptyStringAsUndefined: true,
    skipValidation: false,
  });

  return serverEnv;
}

/**
 * Helper to check if we're running in a Cloudflare Worker.
 */
export function isCloudflareWorker(): boolean {
  return (
    typeof globalThis !== "undefined" &&
    "Cloudflare" in globalThis &&
    typeof (globalThis as { Cloudflare?: unknown }).Cloudflare === "object"
  );
}

/**
 * Helper to check if we're running in development mode.
 */
export function isDevelopment(): boolean {
  return env.NODE_ENV === "development";
}

/**
 * Helper to check if we're running in production mode.
 */
export function isProduction(): boolean {
  return env.NODE_ENV === "production";
}
