/**
 * SQL backend abstraction for the MazelProtocol Pages Functions (chat +
 * waitlist).
 *
 * The same SQLite schema runs on either backend — Cloudflare **D1** (native
 * binding, zero latency) or **Turso/libSQL** (external HTTP database reachable
 * from the Rust bots and anything outside Cloudflare).
 *
 * Selection is by env vars: if `TURSO_DATABASE_URL` is set, the Turso client
 * is used; otherwise the `CHAT_DB` D1 binding is used. Only one is ever
 * active per function invocation, so there is no dual-write divergence.
 *
 * Every SQL statement here is portable SQLite and identical on both.
 */

import { createClient, type Client as TursoClient } from "@libsql/client/web";

/** Environment surface shared by the chat + waitlist functions. */
export interface SqlEnv {
  /** Cloudflare D1 binding (used when Turso is not configured). */
  CHAT_DB?: D1Database;
  /** Turso/libSQL database URL (e.g. `libsql://mazel.turso.io`). */
  TURSO_DATABASE_URL?: string;
  /** Turso auth token (required for hosted Turso databases). */
  TURSO_AUTH_TOKEN?: string;
}

/** Values accepted as SQL bindings (subset both backends support). */
export type SqlValue = string | number | bigint | null | Uint8Array;

/** Minimal SQL API shared by D1 and Turso. */
export interface SqlBackend {
  /** Execute a statement that returns no rows (CREATE/INSERT/UPDATE/DELETE). */
  run(sql: string, args: SqlValue[]): Promise<void>;
  /** Execute a query and return the first row (or null). */
  first<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    args: SqlValue[],
  ): Promise<T | null>;
  /** Execute a query and return all rows. */
  all<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    args: SqlValue[],
  ): Promise<T[]>;
}

/** D1 implementation — wraps the Workers `D1Database` binding. */
export function createD1Backend(db: D1Database): SqlBackend {
  return {
    async run(sql: string, args: SqlValue[]): Promise<void> {
      await db.prepare(sql).bind(...args).run();
    },
    async first<T extends Record<string, unknown>>(
      sql: string,
      args: SqlValue[],
    ): Promise<T | null> {
      const row = await db.prepare(sql).bind(...args).first();
      return (row as T | null) ?? null;
    },
    async all<T extends Record<string, unknown>>(
      sql: string,
      args: SqlValue[],
    ): Promise<T[]> {
      const { results } = await db.prepare(sql).bind(...args).all();
      return (results ?? []) as T[];
    },
  };
}

/** Turso/libSQL implementation — speaks the Hrana protocol over HTTP. */
export function createTursoBackend(
  url: string,
  authToken?: string,
): SqlBackend {
  const client: TursoClient = createClient({ url, authToken });

  const rowsOf = (res: { rows: unknown[] }): Record<string, unknown>[] =>
    (res.rows as Record<string, unknown>[]) ?? [];

  return {
    async run(sql: string, args: SqlValue[]): Promise<void> {
      await client.execute({ sql, args });
    },
    async first<T extends Record<string, unknown>>(
      sql: string,
      args: SqlValue[],
    ): Promise<T | null> {
      const rows = rowsOf(await client.execute({ sql, args }));
      return (rows[0] as T | null) ?? null;
    },
    async all<T extends Record<string, unknown>>(
      sql: string,
      args: SqlValue[],
    ): Promise<T[]> {
      return rowsOf(await client.execute({ sql, args })) as T[];
    },
  };
}

/**
 * Pick the backend: Turso when configured, otherwise D1. Throws when neither
 * is available so a misconfigured function fails fast at request time.
 */
export function createBackend(env: SqlEnv): SqlBackend {
  if (env.TURSO_DATABASE_URL) {
    return createTursoBackend(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);
  }
  if (!env.CHAT_DB) {
    throw new Error(
      "No database configured: set TURSO_DATABASE_URL or bind the CHAT_DB D1 database",
    );
  }
  return createD1Backend(env.CHAT_DB);
}
