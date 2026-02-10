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
    // // Application configuration
    // NODE_ENV: z
    //   .enum(["development", "test", "production"])
    //   .default("development"),

    // // Server URLs
    // SERVER_URL: z.string().url().optional(),
    // API_BASE_URL: z.string().url().optional(),

    // // Database and storage
    // DATABASE_URL: z.string().url().optional(),

    // // Authentication and API keys
    // API_KEY: z.string().min(1).optional(),
    // JWT_SECRET: z.string().min(32).optional(),

    // // Cloudflare-specific bindings (these will be provided by Cloudflare Workers)
    // // Note: These are defined here for type safety but will be populated by Cloudflare
    // KV_NAMESPACE: z.custom<KVNamespace>().optional(),
    // D1_DATABASE: z.custom<D1Database>().optional(),
    // R2_BUCKET: z.custom<R2Bucket>().optional(),

    // Third-party service credentials
    REOWN_PROJECT_ID: z.string().min(1).optional(),

    // // Feature flags
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
    // VITE_APP_DESCRIPTION: z.string().optional(),
    // VITE_APP_VERSION: z.string().default("1.0.0"),

    // // API endpoints (public URLs)
    // VITE_API_BASE_URL: z.string().url().optional(),
    // VITE_WS_URL: z.string().url().optional(),

    // Third-party services (public keys only)
    VITE_REOWN_PROJECT_ID: z.string().min(1).optional(),
    // VITE_GOOGLE_ANALYTICS_ID: z.string().optional(),

    // Feature flags for client-side
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
  REOWN_PROJECT_ID?: string;
};

// Client environment variables (from the client schema)
export type ClientEnv = {
  VITE_APP_TITLE: string;
  VITE_REOWN_PROJECT_ID?: string;
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
      // NODE_ENV: z
      //   .enum(["development", "test", "production"])
      //   .default("development"),
      // SERVER_URL: z.string().url().optional(),
      // API_BASE_URL: z.string().url().optional(),
      // DATABASE_URL: z.string().url().optional(),
      // API_KEY: z.string().min(1).optional(),
      // JWT_SECRET: z.string().min(32).optional(),
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

// /**
//  * Helper to check if we're running in development mode.
//  */
// export function isDevelopment(): boolean {
//   return env.NODE_ENV === "development";
// }

// /**
//  * Helper to check if we're running in production mode.
//  */
// export function isProduction(): boolean {
//   return env.NODE_ENV === "production";
// }

/**
 * Helper to get the appropriate API base URL.
 * Falls back to client-side URL if server URL is not available.
 */
// export function getApiBaseUrl(): string {
//   if (env.API_BASE_URL) {
//     return env.API_BASE_URL;
//   }

//   if (env.VITE_API_BASE_URL) {
//     return env.VITE_API_BASE_URL;
//   }

//   if (isDevelopment()) {
//     return "http://localhost:3000/api";
//   }

//   return "/api";
// }
