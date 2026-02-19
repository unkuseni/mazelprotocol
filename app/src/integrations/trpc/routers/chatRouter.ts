import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../init";
import type { TRPCRouterRecord } from "@trpc/server";
import { EventEmitter } from "events";

// ----------------------------------------------------------------------------
// Types & Schemas
// ----------------------------------------------------------------------------

const ChatMessageSchema = z.object({
  id: z.string(),
  sender: z.string(), // wallet address
  senderShort: z.string(),
  text: z.string().max(500),
  timestamp: z.number(),
  type: z.enum(["message", "system", "announcement"]),
  replyTo: z.string().optional(), // message id
  reactions: z.record(z.string(), z.array(z.string())).optional(), // emoji -> [addresses]
  role: z.enum(["manager", "member"]).optional(),
  isPinned: z.boolean().optional(),
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;

const ChatMemberSchema = z.object({
  address: z.string(),
  addressShort: z.string(),
  role: z.enum(["manager", "member"]),
  isOnline: z.boolean(),
  joinedAt: z.string(),
  ticketsContributed: z.number(),
});

export type ChatMember = z.infer<typeof ChatMemberSchema>;

// ----------------------------------------------------------------------------
// In-memory storage
// ----------------------------------------------------------------------------

type SyndicateChatStore = {
  messages: ChatMessage[];
  members: Record<string, ChatMember>; // key: wallet address
};

const chatStore = new Map<string, SyndicateChatStore>();

// Event emitter for real-time updates
const chatEventEmitter = new EventEmitter();

// Helper to ensure a syndicate chat exists
function ensureSyndicateChat(syndicateId: string): SyndicateChatStore {
  if (!chatStore.has(syndicateId)) {
    chatStore.set(syndicateId, {
      messages: [],
      members: {},
    });
  }
  const store = chatStore.get(syndicateId);
  if (!store) {
    throw new Error(
      `Failed to get or create store for syndicate ${syndicateId}`,
    );
  }
  return store;
}

// Helper to generate a short address
function truncateAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

// ----------------------------------------------------------------------------
// Initial mock data for testing
// ----------------------------------------------------------------------------

function initializeMockData() {
  const mockSyndicateIds = [
    "alpha-lottery-dao",
    "diamond-hands-club",
    "whale-pool-prime",
    "rolldown-raiders",
    "degen-lottery-squad",
    "solana-sharks",
    "lucky-7s-collective",
    "night-owls-syndicate",
  ];

  const mockAddresses = [
    "5B3Z...8H9J",
    "7C4X...2K1L",
    "9D5V...6M3N",
    "2E6B...4P7Q",
    "8F7C...1R0S",
    "3G8D...9T2U",
    "1H9E...5V4W",
    "4I0F...7X6Y",
  ];

  const mockMessages: Omit<ChatMessage, "id" | "senderShort">[] = [
    {
      sender: mockAddresses[0],
      text: "Welcome to the syndicate! Let's coordinate our ticket purchases for maximum +EV.",
      timestamp: Date.now() - 3600000,
      type: "announcement",
      role: "manager",
      isPinned: true,
    },
    {
      sender: mockAddresses[1],
      text: "Just bought 5 tickets for the next draw. Who's pooling with me?",
      timestamp: Date.now() - 1800000,
      type: "message",
      role: "member",
    },
    {
      sender: mockAddresses[2],
      text: "I'm in for 3 tickets. Let's target the 4-5 number matches.",
      timestamp: Date.now() - 900000,
      type: "message",
      role: "member",
    },
    {
      sender: mockAddresses[0],
      text: "Remember: rolldown happens when jackpot isn't hit. Our EV increases as we approach the deadline.",
      timestamp: Date.now() - 600000,
      type: "system",
      role: "manager",
    },
    {
      sender: mockAddresses[3],
      text: "Any analysis on the current pot size?",
      timestamp: Date.now() - 300000,
      type: "message",
      role: "member",
    },
  ];

  for (const syndicateId of mockSyndicateIds) {
    const store = ensureSyndicateChat(syndicateId);

    // Add mock messages
    store.messages = mockMessages.map((msg, idx) => ({
      ...msg,
      id: `msg-${syndicateId}-${idx}`,
      senderShort: truncateAddress(msg.sender),
    }));

    // Add mock members
    store.members = {};
    mockAddresses.forEach((addr, idx) => {
      store.members[addr] = {
        address: addr,
        addressShort: truncateAddress(addr),
        role: idx === 0 ? "manager" : "member",
        isOnline: idx < 4, // First 4 members are online
        joinedAt: new Date(Date.now() - 86400000 * (idx + 1)).toISOString(),
        ticketsContributed: Math.floor(Math.random() * 20) + 1,
      };
    });
  }
}

// Initialize mock data on server start
initializeMockData();

// ----------------------------------------------------------------------------
// tRPC Procedures
// ----------------------------------------------------------------------------

const chatRouterRecord = {
  // Send a message to a syndicate chat
  sendMessage: publicProcedure
    .input(
      z.object({
        syndicateId: z.string(),
        sender: z.string(),
        text: z.string().max(500),
        type: z.enum(["message", "system", "announcement"]).default("message"),
        replyTo: z.string().optional(),
      }),
    )
    .mutation(({ input }) => {
      const { syndicateId, sender, text, type, replyTo } = input;
      const store = ensureSyndicateChat(syndicateId);

      // Ensure sender is in members list
      if (!store.members[sender]) {
        store.members[sender] = {
          address: sender,
          addressShort: truncateAddress(sender),
          role: "member",
          isOnline: true,
          joinedAt: new Date().toISOString(),
          ticketsContributed: 0,
        };
      }

      const newMessage: ChatMessage = {
        id: `msg-${syndicateId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        sender,
        senderShort: truncateAddress(sender),
        text,
        timestamp: Date.now(),
        type,
        replyTo,
        role: store.members[sender].role,
      };

      store.messages.push(newMessage);

      // Limit messages to last 1000 per syndicate
      if (store.messages.length > 1000) {
        store.messages = store.messages.slice(-1000);
      }

      // Emit event for real-time updates
      chatEventEmitter.emit(`message:${syndicateId}`, newMessage);
      chatEventEmitter.emit(`messagesUpdated:${syndicateId}`);

      return newMessage;
    }),

  // Get messages for a syndicate with pagination
  getMessages: publicProcedure
    .input(
      z.object({
        syndicateId: z.string(),
        limit: z.number().min(1).max(100).default(50),
        cursor: z.string().optional(), // message id for pagination
      }),
    )
    .query(({ input }) => {
      const { syndicateId, limit, cursor } = input;
      const store = ensureSyndicateChat(syndicateId);
      const messages = [...store.messages].sort(
        (a, b) => b.timestamp - a.timestamp,
      ); // newest first

      let startIndex = 0;
      if (cursor) {
        const cursorIndex = messages.findIndex((msg) => msg.id === cursor);
        if (cursorIndex >= 0) {
          startIndex = cursorIndex + 1;
        }
      }

      const paginatedMessages = messages.slice(startIndex, startIndex + limit);
      const nextCursor =
        paginatedMessages.length > 0
          ? paginatedMessages[paginatedMessages.length - 1].id
          : null;

      return {
        messages: paginatedMessages,
        nextCursor,
        total: messages.length,
      };
    }),

  // React to a message (add or remove reaction)
  reactToMessage: publicProcedure
    .input(
      z.object({
        syndicateId: z.string(),
        messageId: z.string(),
        emoji: z.string(), // simple string validation instead of .emoji()
        reactor: z.string(), // wallet address
        action: z.enum(["add", "remove"]).default("add"),
      }),
    )
    .mutation(({ input }) => {
      const { syndicateId, messageId, emoji, reactor, action } = input;
      const store = ensureSyndicateChat(syndicateId);

      const message = store.messages.find((msg) => msg.id === messageId);
      if (!message) {
        throw new Error("Message not found");
      }

      // Initialize reactions object if needed
      if (!message.reactions) {
        message.reactions = {};
      }

      // Initialize emoji array if needed
      if (!message.reactions[emoji]) {
        message.reactions[emoji] = [];
      }

      const currentReactions: string[] = message.reactions[emoji] as string[];

      if (action === "add") {
        // Add reaction if not already present
        if (!currentReactions.includes(reactor)) {
          currentReactions.push(reactor);
        }
      } else {
        // Remove reaction
        message.reactions[emoji] = currentReactions.filter(
          (addr: string) => addr !== reactor,
        );
        // Clean up empty emoji arrays
        if ((message.reactions[emoji] as string[]).length === 0) {
          delete message.reactions[emoji];
        }
      }

      // Emit event for real-time updates
      chatEventEmitter.emit(`reaction:${syndicateId}`, {
        messageId,
        emoji,
        reactor,
        action,
      });
      chatEventEmitter.emit(`messagesUpdated:${syndicateId}`);

      return message;
    }),

  // Get members for a syndicate
  getMembers: publicProcedure
    .input(
      z.object({
        syndicateId: z.string(),
        onlineOnly: z.boolean().default(false),
      }),
    )
    .query(({ input }) => {
      const { syndicateId, onlineOnly } = input;
      const store = ensureSyndicateChat(syndicateId);

      let members = Object.values(store.members);

      if (onlineOnly) {
        members = members.filter((member) => member.isOnline);
      }

      // Sort: managers first, then by tickets contributed
      members.sort((a, b) => {
        if (a.role === "manager" && b.role !== "manager") return -1;
        if (a.role !== "manager" && b.role === "manager") return 1;
        return b.ticketsContributed - a.ticketsContributed;
      });

      return {
        members,
        onlineCount: Object.values(store.members).filter((m) => m.isOnline)
          .length,
        totalCount: Object.values(store.members).length,
      };
    }),

  // Update member online status
  updateMemberStatus: publicProcedure
    .input(
      z.object({
        syndicateId: z.string(),
        address: z.string(),
        isOnline: z.boolean(),
      }),
    )
    .mutation(({ input }) => {
      const { syndicateId, address, isOnline } = input;
      const store = ensureSyndicateChat(syndicateId);

      if (!store.members[address]) {
        // Auto-create member if not exists
        store.members[address] = {
          address,
          addressShort: truncateAddress(address),
          role: "member",
          isOnline,
          joinedAt: new Date().toISOString(),
          ticketsContributed: 0,
        };
      } else {
        store.members[address].isOnline = isOnline;
      }

      // Emit event for real-time updates
      chatEventEmitter.emit(`memberStatus:${syndicateId}`, {
        address,
        isOnline,
      });
      chatEventEmitter.emit(`membersUpdated:${syndicateId}`);

      return store.members[address];
    }),

  // Pin/unpin a message
  togglePinMessage: publicProcedure
    .input(
      z.object({
        syndicateId: z.string(),
        messageId: z.string(),
        pinned: z.boolean(),
      }),
    )
    .mutation(({ input }) => {
      const { syndicateId, messageId, pinned } = input;
      const store = ensureSyndicateChat(syndicateId);

      const message = store.messages.find((msg) => msg.id === messageId);
      if (!message) {
        throw new Error("Message not found");
      }

      message.isPinned = pinned;

      // Emit event for real-time updates
      chatEventEmitter.emit(`pin:${syndicateId}`, { messageId, pinned });
      chatEventEmitter.emit(`messagesUpdated:${syndicateId}`);

      return message;
    }),

  // Get pinned messages for a syndicate
  getPinnedMessages: publicProcedure
    .input(
      z.object({
        syndicateId: z.string(),
      }),
    )
    .query(({ input }) => {
      const { syndicateId } = input;
      const store = ensureSyndicateChat(syndicateId);

      const pinnedMessages = store.messages
        .filter((msg) => msg.isPinned)
        .sort((a, b) => b.timestamp - a.timestamp);

      return pinnedMessages;
    }),

  // Health check and stats
  stats: publicProcedure
    .input(
      z.object({
        syndicateId: z.string().optional(),
      }),
    )
    .query(({ input }) => {
      const { syndicateId } = input;

      if (syndicateId) {
        const store = ensureSyndicateChat(syndicateId);
        return {
          syndicateId,
          messageCount: store.messages.length,
          memberCount: Object.keys(store.members).length,
          onlineCount: Object.values(store.members).filter((m) => m.isOnline)
            .length,
          pinnedCount: store.messages.filter((m) => m.isPinned).length,
        };
      }

      // Global stats
      const allSyndicates = Array.from(chatStore.entries());
      return {
        totalSyndicates: allSyndicates.length,
        totalMessages: allSyndicates.reduce(
          (sum, [, store]) => sum + store.messages.length,
          0,
        ),
        totalMembers: allSyndicates.reduce(
          (sum, [, store]) => sum + Object.keys(store.members).length,
          0,
        ),
        syndicates: allSyndicates.map(([id, store]) => ({
          id,
          messageCount: store.messages.length,
          memberCount: Object.keys(store.members).length,
        })),
      };
    }),

  // Subscribe to message updates (using server-sent events or polling in real implementation)
  // Note: This is a placeholder. In a real implementation, you'd use WebSockets or SSE.
  // For now, clients can poll getMessages with a cursor.
} satisfies TRPCRouterRecord;

export const chatRouter = createTRPCRouter(chatRouterRecord);
export type ChatRouter = typeof chatRouter;
