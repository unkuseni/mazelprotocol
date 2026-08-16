/// <reference path="../../env.d.ts" />

/**
 * MazelProtocol Chat API — Cloudflare Pages Function
 *
 * Handles all /api/chat/* requests:
 *   GET    /api/chat/:syndicateId/messages  — list messages (with ?before=&limit=)
 *   POST   /api/chat/:syndicateId/messages  — send a message
 *   POST   /api/chat/messages/:messageId/react — toggle reaction
 *   POST   /api/chat/messages/:messageId/pin   — toggle pin
 */

interface Env {
  CHAT_DB: D1Database;
  /**
   * Comma-separated list of base58 Solana pubkeys allowed to send
   * "announcement" messages and toggle message pins. When unset or empty,
   * no wallet is an admin and both actions are rejected with 403.
   */
  CHAT_ADMIN_PUBKEYS?: string;
}

// ---------------------------------------------------------------------------
// Validation & Sanitization
// ---------------------------------------------------------------------------

/** Max message text length (prevents abuse) */
const MAX_TEXT_LENGTH = 2000;

/** Solana base58 address pattern (32-44 base58 chars) */
const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** Safe ID pattern: alphanumeric + underscore + hyphen, max 64 chars */
const SAFE_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

/**
 * Strip HTML tags and dangerous content from user-provided text.
 * Converts < > & " to safe equivalents and removes any remaining tags.
 */
function sanitizeText(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .slice(0, MAX_TEXT_LENGTH);
}

/**
 * Validate an ID parameter is safe (alphanumeric, underscores, hyphens).
 * Returns the ID if valid, null otherwise.
 */
function validateSafeId(id: string): string | null {
  if (!id || id.length > 64) return null;
  if (!SAFE_ID_RE.test(id)) return null;
  return id;
}

/**
 * Validate a Solana wallet address (base58).
 * Returns the address if valid, null otherwise.
 */
function validateSolanaAddress(address: string): string | null {
  if (!address || !SOLANA_ADDRESS_RE.test(address)) return null;
  return address;
}

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

function generateId(): string {
  const ts = Date.now().toString(36);
  const rand = crypto.randomUUID().slice(0, 8);
  return `msg_${ts}_${rand}`;
}

function formatSenderShort(address: string): string {
  if (address === "system") return "System";
  if (address.length <= 12) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// Admin allow-list (security review C2)
//
// Announcements and pins are privileged actions. Previously any wallet with a
// valid signature could post styled "announcements" and toggle pins. Now both
// are restricted to the CHAT_ADMIN_PUBKEYS allow-list (comma-separated base58
// Solana pubkeys). When the env var is unset or empty, no wallet is an admin
// and both actions are rejected with 403.
// ---------------------------------------------------------------------------

/** Parse the CHAT_ADMIN_PUBKEYS env var into a set of base58 pubkeys. */
function getAdminPubkeys(env: Env): Set<string> {
  const raw = env.CHAT_ADMIN_PUBKEYS;
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/** Whether a sender is on the chat admin allow-list. */
function isChatAdmin(env: Env, sender: string): boolean {
  if (!validateSolanaAddress(sender)) return false;
  return getAdminPubkeys(env).has(sender);
}

/**
 * Read and parse a JSON request body, returning null (instead of throwing)
 * when the body is empty or malformed so callers can respond with 400.
 */
async function parseJsonBody(request: Request): Promise<unknown | null> {
  const text = await request.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Authenticated chat actions (security review H6)
//
// Previously the `sender` field was taken from the request body with only a
// base58 regex check — anyone could impersonate any wallet, post styled
// "announcements", and toggle pins. Now every mutating action must prove
// ownership of the sender address by signing a canonical message:
//
//     "mazelprotocol:chat:{syndicateId}:{timestamp}:{nonce}"
//
// with the wallet's Ed25519 `signMessage`. The server verifies the signature
// (accepting both raw and "solana offscreen"-prefixed variants for legacy
// wallets), enforces a 5-minute timestamp window, and rejects replayed nonces.
// ---------------------------------------------------------------------------

/** Domain separator for chat signatures. */
const CHAT_SIGN_PREFIX = "mazelprotocol:chat:";

/** Maximum allowed age of a signed request (milliseconds). */
const AUTH_WINDOW_MS = 5 * 60 * 1000;

/** Maximum length of a base64 signature (64-byte sig -> 88 chars + slack). */
const MAX_SIGNATURE_LENGTH = 128;

/** Nonce pattern: alphanumeric + hyphen (UUIDs pass). */
const NONCE_RE = /^[a-zA-Z0-9-]{8,64}$/;

/** Build the canonical message a client must sign for a given request. */
function buildSignedMessage(
  syndicateId: string,
  timestamp: number,
  nonce: string,
): string {
  return `${CHAT_SIGN_PREFIX}${syndicateId}:${timestamp}:${nonce}`;
}

/** Base58 decode (Solana addresses). Throws on invalid characters. */
function base58Decode(input: string): Uint8Array {
  const ALPHABET =
    "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const map = new Map<string, number>();
  for (let i = 0; i < ALPHABET.length; i++) map.set(ALPHABET[i], i);

  const bytes: number[] = [0];
  for (const ch of input) {
    let carry = map.get(ch);
    if (carry === undefined) throw new Error("invalid base58 character");
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  // Leading '1' characters represent leading zero bytes.
  for (const ch of input) {
    if (ch === "1") bytes.push(0);
    else break;
  }
  bytes.reverse();
  return new Uint8Array(bytes);
}

/** Decode a base58 Solana pubkey into exactly 32 bytes. */
function decodePublicKey(address: string): Uint8Array {
  const bytes = base58Decode(address);
  if (bytes.length === 32) return bytes;
  if (bytes.length < 32) {
    const padded = new Uint8Array(32);
    padded.set(bytes, 32 - bytes.length);
    return padded;
  }
  throw new Error("public key too long");
}

/** Decode a base64 string into bytes. */
function base64ToBytes(input: string): Uint8Array {
  const bin = atob(input);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Verify an Ed25519 signature over `message` for `publicKeyB58`.
 * Accepts the raw message (Solana Wallet Standard) and the legacy
 * "solana offscreen" prefixed variant used by older wallets.
 */
async function verifyEd25519Signature(
  publicKeyB58: string,
  signatureB64: string,
  message: string,
): Promise<boolean> {
  try {
    const sigBytes = base64ToBytes(signatureB64);
    if (sigBytes.length !== 64) return false;
    const pubBytes = decodePublicKey(publicKeyB58);
    const key = await crypto.subtle.importKey(
      "raw",
      pubBytes as BufferSource,
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    const rawMsg = new TextEncoder().encode(message);
    // TS 5.7+ lib.dom types `BufferSource` against `ArrayBuffer`; a generic
    // `Uint8Array<ArrayBufferLike>` is not assignable, so we cast explicitly.
    if (
      await crypto.subtle.verify(
        "Ed25519",
        key,
        sigBytes as BufferSource,
        rawMsg as BufferSource,
      )
    ) {
      return true;
    }
    const prefixedMsg = new TextEncoder().encode(
      "solana offscreen" + message,
    );
    return await crypto.subtle.verify(
      "Ed25519",
      key,
      sigBytes as BufferSource,
      prefixedMsg as BufferSource,
    );
  } catch {
    return false;
  }
}

/**
 * Verify the signed-auth fields common to all mutating chat actions.
 * Returns an error string on failure, or null when the request is authentic.
 * Also records the nonce (replay protection) on success.
 */
async function verifyChatAuth(
  db: D1Database,
  sender: string,
  signature: string,
  timestamp: number,
  nonce: string,
  syndicateId: string,
): Promise<string | null> {
  if (!validateSolanaAddress(sender)) return "Invalid sender address";
  if (
    !signature ||
    typeof signature !== "string" ||
    signature.length > MAX_SIGNATURE_LENGTH
  ) {
    return "Signature is required";
  }
  if (!nonce || typeof nonce !== "string" || !NONCE_RE.test(nonce)) {
    return "Invalid nonce";
  }
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
    return "Invalid timestamp";
  }
  // Freshness window (prevents long-lived replay of captured requests).
  if (Math.abs(Date.now() - timestamp) > AUTH_WINDOW_MS) {
    return "Signature expired — please try again";
  }

  const message = buildSignedMessage(syndicateId, timestamp, nonce);
  const valid = await verifyEd25519Signature(sender, signature, message);
  if (!valid) return "Signature verification failed";

  // Replay protection: each nonce may be used exactly once.
  await db
    .prepare(
      "CREATE TABLE IF NOT EXISTS chat_auth_nonces (nonce TEXT PRIMARY KEY, created_at INTEGER NOT NULL)",
    )
    .run();
  const existing = await db
    .prepare("SELECT nonce FROM chat_auth_nonces WHERE nonce = ?")
    .bind(nonce)
    .first();
  if (existing) return "Request already used — please try again";

  // Opportunistic pruning of nonces older than 1 hour.
  await db
    .prepare("DELETE FROM chat_auth_nonces WHERE created_at < ?")
    .bind(Date.now() - 3_600_000)
    .run();
  await db
    .prepare("INSERT INTO chat_auth_nonces (nonce, created_at) VALUES (?, ?)")
    .bind(nonce, Date.now())
    .run();

  return null;
}

// ---------------------------------------------------------------------------
// Rate limiting (security review M6)
//
// Previously mutating actions (send / react / pin) had no throttle: an
// attacker could spam thousands of messages or reactions per second, burning
// D1 writes and degrading the chat for everyone. Now every mutating action
// is rate-limited per wallet using a simple sliding window in D1.
//
// Limits (generous for real users, effective against spam):
//   - Sending messages:       10 per 60 seconds per wallet
//   - Reactions / pins:       20 per 60 seconds per wallet
// ---------------------------------------------------------------------------

/** Rate-limit window length in milliseconds. */
const RATE_WINDOW_MS = 60_000;

/** Max message sends per window per wallet. */
const MAX_MESSAGES_PER_WINDOW = 10;

/** Max reacts+pins per window per wallet. */
const MAX_REACTS_PER_WINDOW = 20;

/**
 * Enforce a per-wallet sliding-window rate limit using D1.
 *
 * Returns an error string when the wallet has exceeded the limit, or null
 * when the action may proceed. The action is recorded AFTER the check via
 * `recordRateLimit` (two-step so the first call isn't blocked).
 */
async function checkRateLimit(
  db: D1Database,
  sender: string,
  action: "message" | "interaction",
): Promise<string | null> {
  const table =
    action === "message" ? "chat_msg_rate" : "chat_react_rate";
  const max =
    action === "message" ? MAX_MESSAGES_PER_WINDOW : MAX_REACTS_PER_WINDOW;

  // Ensure the rate table exists.
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS ${table} (
        sender TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`,
    )
    .run();

  // Count actions in the current window.
  const cutoff = Date.now() - RATE_WINDOW_MS;
  const { results } = await db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM ${table}
       WHERE sender = ? AND created_at > ?`,
    )
    .bind(sender, cutoff)
    .all();
  const cnt = Number(
    (results as Array<{ cnt: number }>)[0]?.cnt ?? 0,
  );

  if (cnt >= max) {
    const secs = Math.ceil(
      (cutoff + RATE_WINDOW_MS - Date.now()) / 1000,
    );
    return `Rate limit reached — please wait ${Math.max(1, secs)}s before trying again.`;
  }

  return null;
}

/** Record a rate-limited action (called after the check passes). */
async function recordRateLimit(
  db: D1Database,
  sender: string,
  action: "message" | "interaction",
): Promise<void> {
  const table =
    action === "message" ? "chat_msg_rate" : "chat_react_rate";
  await db
    .prepare(
      `INSERT INTO ${table} (sender, created_at) VALUES (?, ?)`,
    )
    .bind(sender, Date.now())
    .run();

  // Opportunistic pruning of old rows (keep the table small).
  await db
    .prepare(`DELETE FROM ${table} WHERE created_at < ?`)
    .bind(Date.now() - RATE_WINDOW_MS)
    .run();
}

function rowToMessage(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    syndicate_id: row.syndicate_id,
    sender: row.sender,
    sender_short: row.sender_short,
    text: row.text,
    type: row.type,
    role: row.role ?? undefined,
    is_pinned: row.is_pinned,
    reply_to: row.reply_to ?? undefined,
    created_at: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function onRequest(context: {
  request: Request;
  env: Env;
  params: { route?: string[] };
}): Promise<Response> {
  const { request, env, params } = context;
  const route = params.route ?? [];

  // CORS preflight
  if (request.method === "OPTIONS") {
    return json(null, 204);
  }

  const db = env.CHAT_DB;

  try {
    // ---- GET /api/chat/:syndicateId/messages ----
    if (
      request.method === "GET" &&
      route.length === 2 &&
      route[1] === "messages"
    ) {
      const syndicateId = validateSafeId(route[0]);
      if (!syndicateId) return error("Invalid syndicate ID");

      const url = new URL(request.url);
      const limit = Math.min(
        parseInt(url.searchParams.get("limit") ?? "50", 10),
        100,
      );
      const beforeRaw = url.searchParams.get("before");

      // Robustness: a non-numeric or NaN "before" must not reach D1 — reject
      // the request instead of silently binding NaN.
      let beforeTs: number | null = null;
      if (beforeRaw !== null) {
        const parsed = Number(beforeRaw);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          return error("Invalid 'before' timestamp");
        }
        beforeTs = parsed;
      }

      let query = "SELECT * FROM messages WHERE syndicate_id = ?";
      const bindings: (string | number)[] = [syndicateId];

      if (beforeTs !== null) {
        query += " AND created_at < ?";
        bindings.push(beforeTs);
      }

      query += " ORDER BY created_at DESC LIMIT ?";
      bindings.push(limit);

      const { results: messages } = await db
        .prepare(query)
        .bind(...bindings)
        .all();

      // Fetch reactions for all returned messages
      const messageIds = (messages as Array<{ id: string }>).map(
        (m) => m.id,
      );
      const reactionsMap: Record<string, Record<string, string[]>> = {};

      if (messageIds.length > 0) {
        const placeholders = messageIds.map(() => "?").join(",");
        const { results: allReactions } = await db
          .prepare(
            `SELECT message_id, emoji, sender FROM reactions WHERE message_id IN (${placeholders})`,
          )
          .bind(...messageIds)
          .all();

        for (const r of allReactions as Array<{
          message_id: string;
          emoji: string;
          sender: string;
        }>) {
          if (!reactionsMap[r.message_id]) reactionsMap[r.message_id] = {};
          if (!reactionsMap[r.message_id][r.emoji])
            reactionsMap[r.message_id][r.emoji] = [];
          reactionsMap[r.message_id][r.emoji].push(r.sender);
        }
      }

      // Attach reactions to messages
      const enriched = (messages as Array<Record<string, unknown>>).map(
        (m) => ({
          ...rowToMessage(m),
          reactions: reactionsMap[m.id as string] ?? {},
        }),
      );

      // Reverse to return oldest-first (client expects this order)
      enriched.reverse();

      return json({ messages: enriched });
    }

    // ---- POST /api/chat/:syndicateId/messages ----
    if (
      request.method === "POST" &&
      route.length === 2 &&
      route[1] === "messages"
    ) {
      const syndicateId = validateSafeId(route[0]);
      if (!syndicateId) return error("Invalid syndicate ID");

      const parsedBody = await parseJsonBody(request);
      if (!parsedBody) return error("Request body is required", 400);
      const body = parsedBody as {
        text?: string;
        type?: string;
        replyTo?: string;
        sender?: string;
        senderShort?: string;
        signature?: string;
        timestamp?: number;
        nonce?: string;
      };

      if (!body.text?.trim()) return error("Text is required");
      if (!body.sender) return error("Sender address is required");

      // SECURITY (review H6): prove ownership of `sender` before accepting.
      const authError = await verifyChatAuth(
        db,
        body.sender,
        body.signature ?? "",
        body.timestamp ?? NaN,
        body.nonce ?? "",
        syndicateId,
      );
      if (authError) return error(authError, 401);

      // SECURITY (review M6): throttle message sends per wallet.
      const rateError = await checkRateLimit(db, body.sender, "message");
      if (rateError) return error(rateError, 429);

      // Validate replyTo if present
      if (body.replyTo && !validateSafeId(body.replyTo)) return error("Invalid reply target");

      // Validate message type
      const validTypes = new Set(["message", "system", "announcement"]);
      const msgType = body.type && validTypes.has(body.type) ? body.type : "message";

      const id = generateId();
      const now = Date.now();
      const sanitizedText = sanitizeText(body.text.trim());
      const senderShort = body.senderShort
        ? sanitizeText(body.senderShort).slice(0, 16)
        : formatSenderShort(body.sender);

      // Only allow "system" type messages from the system sender
      if (msgType === "system" && body.sender !== "system") {
        return error("Only the system account can send system messages", 403);
      }

      // SECURITY (review C2): announcements are a privileged channel — only
      // senders on the CHAT_ADMIN_PUBKEYS allow-list may post them. If the
      // env var is unset, ALL announcement messages are rejected (403).
      if (msgType === "announcement" && !isChatAdmin(env, body.sender)) {
        return error("Only chat admins can send announcements", 403);
      }

      await db
        .prepare(
          `INSERT INTO messages (id, syndicate_id, sender, sender_short, text, type, role, is_pinned, reply_to, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        )
        .bind(
          id,
          syndicateId,
          body.sender,
          senderShort,
          sanitizedText,
          msgType,
          null,
          body.replyTo ?? null,
          now,
        )
        .run();

      // SECURITY (review M6): record this send against the wallet's limit.
      await recordRateLimit(db, body.sender, "message");

      const message = {
        id,
        syndicate_id: syndicateId,
        sender: body.sender,
        sender_short: senderShort,
        text: sanitizedText,
        type: msgType,
        role: null,
        is_pinned: 0,
        reply_to: body.replyTo ?? undefined,
        created_at: now,
        reactions: {},
      };

      return json({ message }, 201);
    }

    // ---- POST /api/chat/messages/:messageId/react ----
    if (
      request.method === "POST" &&
      route.length === 3 &&
      route[1] === "react"
    ) {
      const messageId = validateSafeId(route[0]);
      if (!messageId) return error("Invalid message ID");

      const parsedBody = await parseJsonBody(request);
      if (!parsedBody) return error("Request body is required", 400);
      const body = parsedBody as {
        emoji?: string;
        action?: string;
        sender?: string;
        signature?: string;
        timestamp?: number;
        nonce?: string;
      };

      if (!body.emoji) return error("Emoji is required");
      if (!body.sender) return error("Sender address is required");

      // SECURITY (review H6): reactions must be authenticated too.
      const authError = await verifyChatAuth(
        db,
        body.sender,
        body.signature ?? "",
        body.timestamp ?? NaN,
        body.nonce ?? "",
        messageId,
      );
      if (authError) return error(authError, 401);

      // SECURITY (review M6): throttle reacts per wallet.
      const rateError = await checkRateLimit(db, body.sender, "interaction");
      if (rateError) return error(rateError, 429);

      if (body.action !== "add" && body.action !== "remove")
        return error("Action must be 'add' or 'remove'");

      // Validate emoji is a single character (or simple emoji sequence)
      if (body.emoji.length > 8) return error("Invalid emoji");

      if (body.action === "add") {
        await db
          .prepare(
            "INSERT OR IGNORE INTO reactions (message_id, emoji, sender) VALUES (?, ?, ?)",
          )
          .bind(messageId, body.emoji, body.sender)
          .run();
      } else {
        await db
          .prepare(
            "DELETE FROM reactions WHERE message_id = ? AND emoji = ? AND sender = ?",
          )
          .bind(messageId, body.emoji, body.sender)
          .run();
      }

      // SECURITY (review M6): record this interaction against the wallet's limit.
      await recordRateLimit(db, body.sender, "interaction");

      // Return updated reactions for this message
      const { results } = await db
        .prepare(
          "SELECT emoji, sender FROM reactions WHERE message_id = ?",
        )
        .bind(messageId)
        .all();

      const reactions: Record<string, string[]> = {};
      for (const r of results as Array<{ emoji: string; sender: string }>) {
        if (!reactions[r.emoji]) reactions[r.emoji] = [];
        reactions[r.emoji].push(r.sender);
      }

      return json({ reactions });
    }

    // ---- POST /api/chat/messages/:messageId/pin ----
    if (
      request.method === "POST" &&
      route.length === 3 &&
      route[1] === "pin"
    ) {
      const messageId = validateSafeId(route[0]);
      if (!messageId) return error("Invalid message ID");

      const parsedBody = await parseJsonBody(request);
      if (!parsedBody) return error("Request body is required", 400);
      const body = parsedBody as {
        pinned?: boolean;
        sender?: string;
        signature?: string;
        timestamp?: number;
        nonce?: string;
      };

      if (typeof body.pinned !== "boolean")
        return error("pinned (boolean) is required");
      if (!body.sender) return error("Sender address is required");

      // SECURITY (review H6): pins must be authenticated.
      const authError = await verifyChatAuth(
        db,
        body.sender,
        body.signature ?? "",
        body.timestamp ?? NaN,
        body.nonce ?? "",
        messageId,
      );
      if (authError) return error(authError, 401);

      // SECURITY (review C2): pinning is restricted to the CHAT_ADMIN_PUBKEYS
      // allow-list. When the env var is unset, ALL pin requests are rejected
      // (403) — a wallet signature alone no longer authorizes pin changes.
      if (!isChatAdmin(env, body.sender)) {
        return error("Only chat admins can pin messages", 403);
      }

      // SECURITY (review M6): throttle pin toggles per wallet.
      const rateError = await checkRateLimit(db, body.sender, "interaction");
      if (rateError) return error(rateError, 429);

      await db
        .prepare("UPDATE messages SET is_pinned = ? WHERE id = ?")
        .bind(body.pinned ? 1 : 0, messageId)
        .run();

      // SECURITY (review M6): record this interaction against the wallet's limit.
      await recordRateLimit(db, body.sender, "interaction");

      return json({ pinned: body.pinned });
    }

    // ---- 404 ----
    return error("Not found", 404);
  } catch (err) {
    console.error("[chat-api]", err);
    return error(
      err instanceof Error ? err.message : "Internal server error",
      500,
    );
  }
}
