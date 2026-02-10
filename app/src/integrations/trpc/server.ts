import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { createContext } from "./context";
import { trpcRouter } from "./router";
import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { env } from "@/env";

export const createTRPCServerHandler = (
  cfEnv: Record<string, unknown> = {},
) => {
  return async (request: Request): Promise<Response> => {
    // Handle CORS preflight requests
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods":
            "GET, POST, PUT, PATCH, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    const response = await fetchRequestHandler({
      endpoint: "/api/trpc",
      req: request,
      router: trpcRouter,
      createContext: (opts: FetchCreateContextFnOptions) =>
        createContext({ ...opts, env: { ...env, ...cfEnv } }),
      onError: ({ error, path }) => {
        console.error(`tRPC Error on path ${path ?? "<no-path>"}:`, error);
      },
    });

    // Add CORS headers to the response
    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    );
    response.headers.set(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization",
    );

    return response;
  };
};

export type AppRouter = typeof trpcRouter;
