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
}

// ---------------------------------------------------------------------------
// Helpers
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
      const syndicateId = route[0];
      const url = new URL(request.url);
      const limit = Math.min(
        parseInt(url.searchParams.get("limit") ?? "50"),
        100,
      );
      const before = url.searchParams.get("before");

      let query = "SELECT * FROM messages WHERE syndicate_id = ?";
      const bindings: (string | number)[] = [syndicateId];

      if (before) {
        query += " AND created_at < ?";
        bindings.push(parseInt(before, 10));
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
      const syndicateId = route[0];
      const body: {
        text?: string;
        type?: string;
        replyTo?: string;
        sender?: string;
        senderShort?: string;
      } = await request.json();

      if (!body.text?.trim()) return error("Text is required");
      if (!body.sender) return error("Sender address is required");

      const id = generateId();
      const now = Date.now();
      const senderShort =
        body.senderShort || formatSenderShort(body.sender);

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
          body.text.trim(),
          body.type ?? "message",
          null,
          body.replyTo ?? null,
          now,
        )
        .run();

      const message = {
        id,
        syndicate_id: syndicateId,
        sender: body.sender,
        sender_short: senderShort,
        text: body.text.trim(),
        type: body.type ?? "message",
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
      const messageId = route[0];
      const body: {
        emoji?: string;
        action?: string;
        sender?: string;
      } = await request.json();

      if (!body.emoji) return error("Emoji is required");
      if (!body.sender) return error("Sender address is required");
      if (body.action !== "add" && body.action !== "remove")
        return error("Action must be 'add' or 'remove'");

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
      const messageId = route[0];
      const body: { pinned?: boolean } = await request.json();

      if (typeof body.pinned !== "boolean")
        return error("pinned (boolean) is required");

      await db
        .prepare("UPDATE messages SET is_pinned = ? WHERE id = ?")
        .bind(body.pinned ? 1 : 0, messageId)
        .run();

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
