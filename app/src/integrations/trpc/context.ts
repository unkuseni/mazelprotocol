import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';

export type CreateContextOptions = FetchCreateContextFnOptions & {
  env?: Record<string, unknown>;
};

export const createContext = (opts: CreateContextOptions) => {
  return {
    req: opts.req,
    resHeaders: opts.resHeaders,
    env: opts.env || {},
  };
};

export type Context = Awaited<ReturnType<typeof createContext>>;
