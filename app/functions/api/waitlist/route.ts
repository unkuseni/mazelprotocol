/// <reference path="../../env.d.ts" />

/**
 * MazelProtocol Prelaunch Waitlist API — Cloudflare Pages Function
 *
 *   POST /api/waitlist          — join the waitlist { email, wallet?, source? }
 *   GET  /api/waitlist/stats    — { count } (total entries)
 *
 * Storage: D1 `waitlist_entries` table (same `CHAT_DB` binding as chat).
 *
 * Security notes (web3 audit):
 * - Email is normalized + validated with a strict regex; length-capped.
 * - Wallet (optional) is validated as a base58 Solana address and length-capped.
 * - Source/referrer are length-capped and tag-stripped before storage.
 * - Rate limiting: a client (IP hash) may sign up at most once per 15 minutes,
 *   and the same email may only be re-added after 24h.
 * - Client IP is hashed (SHA-256) — raw IPs are never stored.
 */

interface Env {
  CHAT_DB: D1Database;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Max email length (prevents abuse). */
const MAX_EMAIL_LENGTH = 254;

/** Max wallet length (base58, 32-44 chars). */
const MAX_WALLET_LENGTH = 44;

/** Max source/referrer length. */
const MAX_SOURCE_LENGTH = 64;

/** Strict-ish email regex (RFC-5322 practical subset). */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Solana base58 address pattern (32-44 base58 chars). */
const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** Rate limit: one signup per client per 15 minutes. */
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

/** Re-signup cooldown for the same email: 24 hours. */
const EMAIL_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/**
 * Normalize + validate an email address.
 * Returns the normalized (lowercased, trimmed) email or null if invalid.
 */
function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length === 0 || email.length > MAX_EMAIL_LENGTH) return null;
  if (!EMAIL_RE.test(email)) return null;
  return email;
}

/** Validate an optional Solana wallet address. Returns it or null. */
function validateWallet(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string") return null;
  const wallet = raw.trim();
  if (wallet.length > MAX_WALLET_LENGTH) return null;
  if (!SOLANA_ADDRESS_RE.test(wallet)) return null;
  return wallet;
}

/** Sanitize a short free-text field (source/referrer). */
function sanitizeShortField(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const cleaned = raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .slice(0, MAX_SOURCE_LENGTH)
    .trim();
  return cleaned || fallback;
}

/** SHA-256 hash of a string (hex). Used for IP hashing. */
async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Client IP from the request (Cloudflare header first, then socket). */
function clientIp(request: Request): string {
  return (
    request.headers.get("CF-Connecting-IP") ??
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}

function error(message: string, status = 400): Response {
  return json({ error: message }, status);
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handlePost(request: Request, db: D1Database): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return error("Invalid JSON body", 400);
  }

  // Validate email
  const email = normalizeEmail(body.email);
  if (!email) return error("A valid email address is required", 400);

  // Validate optional fields
  const wallet = validateWallet(body.wallet);
  const source = sanitizeShortField(body.source, "landing");
  const referrer = sanitizeShortField(body.referrer, "");
  const now = Date.now();

  // Hash the client IP (never store the raw IP)
  const ipHash = await sha256Hex(clientIp(request));

  // ---- Rate limit: per-client window ----
  const recent = await db
    .prepare(
      "SELECT last_signup_at FROM waitlist_entries WHERE ip_hash = ? ORDER BY last_signup_at DESC LIMIT 1",
    )
    .bind(ipHash)
    .first<{ last_signup_at: number }>();
  if (recent && now - Number(recent.last_signup_at) < RATE_LIMIT_WINDOW_MS) {
    return error("Please wait a few minutes before signing up again", 429);
  }

  // ---- Existing email cooldown ----
  const existing = await db
    .prepare("SELECT created_at FROM waitlist_entries WHERE email = ?")
    .bind(email)
    .first<{ created_at: number }>();

  if (existing) {
    if (now - Number(existing.created_at) < EMAIL_COOLDOWN_MS) {
      return error("This email is already on the waitlist", 409);
    }
    // Re-signup after cooldown: refresh timestamps + optional wallet
    await db
      .prepare(
        `UPDATE waitlist_entries
           SET wallet = COALESCE(?, wallet),
               source = ?,
               referrer = COALESCE(?, referrer),
               ip_hash = ?,
               last_signup_at = ?
         WHERE email = ?`,
      )
      .bind(wallet, source, referrer, ipHash, now, email)
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO waitlist_entries (email, wallet, source, referrer, ip_hash, last_signup_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(email, wallet, source, referrer, ipHash, now, now)
      .run();
  }

  // Position = number of entries created before this one (+1)
  const before = await db
    .prepare(
      "SELECT COUNT(*) AS count FROM waitlist_entries WHERE created_at < ?",
    )
    .bind(now)
    .first<{ count: number }>();
  const position = (Number(before?.count ?? 0) + 1);

  return json({ success: true, position, email }, 201);
}

async function handleStats(db: D1Database): Promise<Response> {
  const row = await db
    .prepare("SELECT COUNT(*) AS count FROM waitlist_entries")
    .first<{ count: number }>();
  return json({ count: Number(row?.count ?? 0) });
}

export async function onRequest(context: {
  request: Request;
  env: Env;
}): Promise<Response> {
  const { request, env } = context;
  const db = env.CHAT_DB;

  if (request.method === "OPTIONS") return json(null, 204);

  try {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname.endsWith("/waitlist")) {
      return await handlePost(request, db);
    }

    if (request.method === "GET" && url.pathname.endsWith("/waitlist/stats")) {
      return await handleStats(db);
    }

    return error("Not found", 404);
  } catch (err) {
    console.error("Waitlist API error:", err);
    return error("Internal server error", 500);
  }
}
