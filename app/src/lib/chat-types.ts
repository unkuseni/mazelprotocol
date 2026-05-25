/**
 * Chat API shared types — used by both server (Functions) and client (hooks).
 * This file is import-safe for both environments (no runtime deps).
 */

export interface ChatMessage {
  id: string;
  syndicate_id: string;
  sender: string;
  sender_short: string;
  text: string;
  type: "message" | "system" | "announcement";
  role?: "manager" | "member";
  is_pinned: number; // SQLite stores booleans as 0/1
  reply_to?: string;
  created_at: number;
  reactions?: Record<string, string[]>;
}

export interface ChatMember {
  address: string;
  addressShort: string;
  role: "manager" | "member";
  isOnline: boolean;
  joinedAt: string;
  ticketsContributed: number;
}

export interface SendMessageBody {
  text: string;
  type?: "message" | "system" | "announcement";
  replyTo?: string;
  sender: string;
  senderShort: string;
}

export interface ReactBody {
  emoji: string;
  action: "add" | "remove";
  sender: string;
}

export interface PinBody {
  pinned: boolean;
}
