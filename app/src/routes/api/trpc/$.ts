import { createFileRoute } from "@tanstack/react-router";
import { createTRPCServerHandler } from "@/integrations/trpc/server";
import { env } from "@/env";

export const Route = createFileRoute("/api/trpc/$")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const handler = createTRPCServerHandler(env);
        return handler(request);
      },
      POST: async ({ request }) => {
        const handler = createTRPCServerHandler(env);
        return handler(request);
      },
      PUT: async ({ request }) => {
        const handler = createTRPCServerHandler(env);
        return handler(request);
      },
      PATCH: async ({ request }) => {
        const handler = createTRPCServerHandler(env);
        return handler(request);
      },
      DELETE: async ({ request }) => {
        const handler = createTRPCServerHandler(env);
        return handler(request);
      },
      OPTIONS: async ({ request }) => {
        const handler = createTRPCServerHandler(env);
        return handler(request);
      },
    },
  },
});
