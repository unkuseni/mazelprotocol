import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "./init";
import { chatRouter } from "./routers/chatRouter";

import type { TRPCRouterRecord } from "@trpc/server";
import { env } from "@/env";

const todosRouter = {
  list: publicProcedure.query(() => []),
  add: publicProcedure.input(z.object({ name: z.string() })).mutation(() => {
    // Placeholder implementation
    return { id: 1, name: "Todo placeholder" };
  }),
} satisfies TRPCRouterRecord;

export const trpcRouter = createTRPCRouter({
  todos: todosRouter,
  chat: chatRouter,
  health: publicProcedure.query(() => ({
    status: "ok",
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV || "development",
  })),
});
export type TRPCRouter = typeof trpcRouter;
