import { useState, useCallback, useEffect } from "react";
import type {
  ChatMessage,
  ChatMember,
} from "@/integrations/trpc/routers/chatRouter";

interface UseChatOptions {
  syndicateId: string;
  sender?: string; // wallet address of current user
  pollInterval?: number; // milliseconds between polls, 0 to disable
  limit?: number; // messages per page
}

interface UseChatReturn {
  // Data
  messages: ChatMessage[];
  members: ChatMember[];
  onlineCount: number;
  totalMembers: number;
  pinnedMessages: ChatMessage[];

  // Loading states
  isLoadingMessages: boolean;
  isLoadingMembers: boolean;
  isLoadingPinned: boolean;
  isSendingMessage: boolean;

  // Errors
  messagesError: Error | null;
  membersError: Error | null;
  sendMessageError: Error | null;

  // Actions
  sendMessage: (
    text: string,
    type?: "message" | "system" | "announcement",
    replyTo?: string,
  ) => Promise<ChatMessage>;
  reactToMessage: (
    messageId: string,
    emoji: string,
    action: "add" | "remove",
  ) => Promise<void>;
  updateMemberStatus: (isOnline: boolean) => Promise<void>;
  togglePinMessage: (messageId: string, pinned: boolean) => Promise<void>;

  // Pagination
  loadMoreMessages: () => Promise<void>;
  hasMoreMessages: boolean;

  // Refresh
  refetchMessages: () => Promise<void>;
  refetchMembers: () => Promise<void>;
  refetchPinned: () => Promise<void>;
}

// Helper to generate mock members
function generateMockMembers(): ChatMember[] {
  const mockAddresses = [
    "7xKXabc123456789def9fGh",
    "3mNPabc123456789def2wVd",
    "9bQRabc123456789def5tLe",
    "4jWSabc123456789def8kMn",
    "6cYTabc123456789def1pAo",
    "8dZUabc123456789def7rBq",
  ];

  const mockShortAddresses = [
    "7xKX...9fGh",
    "3mNP...2wVd",
    "9bQR...5tLe",
    "4jWS...8kMn",
    "6cYT...1pAo",
    "8dZU...7rBq",
  ];

  return mockAddresses.map((address, index) => ({
    address,
    addressShort: mockShortAddresses[index],
    role: index === 0 ? ("manager" as const) : ("member" as const),
    isOnline: index < 4, // First 4 members are online
    joinedAt: new Date(Date.now() - 86400000 * (index + 1)).toISOString(),
    ticketsContributed: Math.floor(Math.random() * 20) + 1,
  }));
}

// Helper to generate mock messages
function generateMockMessages(): ChatMessage[] {
  const now = Date.now();
  const mockAddresses = [
    "7xKXabc123456789def9fGh",
    "3mNPabc123456789def2wVd",
    "9bQRabc123456789def5tLe",
    "4jWSabc123456789def8kMn",
    "6cYTabc123456789def1pAo",
    "8dZUabc123456789def7rBq",
  ];

  const mockShortAddresses = [
    "7xKX...9fGh",
    "3mNP...2wVd",
    "9bQR...5tLe",
    "4jWS...8kMn",
    "6cYT...1pAo",
    "8dZU...7rBq",
  ];

  return [
    {
      id: "sys-1",
      sender: "system",
      senderShort: "System",
      text: "Welcome to the syndicate chat! Coordinate your strategy and discuss plays here.",
      timestamp: now - 7_200_000,
      type: "system" as const,
    },
    {
      id: "msg-1",
      sender: mockAddresses[0],
      senderShort: mockShortAddresses[0],
      text: "Hey team! Rolldown window is getting close — the prize pool is at $47k with no jackpot hit in 8 draws.",
      timestamp: now - 5_400_000,
      type: "message" as const,
      role: "manager" as const,
      reactions: { "🔥": [mockAddresses[1], mockAddresses[2]] },
    },
    {
      id: "msg-2",
      sender: mockAddresses[1],
      senderShort: mockShortAddresses[1],
      text: "Nice catch. I think we should increase our ticket allocation for the next draw. The EV is getting spicy.",
      timestamp: now - 4_800_000,
      type: "message" as const,
      role: "member" as const,
    },
    {
      id: "msg-3",
      sender: mockAddresses[2],
      senderShort: mockShortAddresses[2],
      text: "Agreed. I can contribute an extra 5 USDC this round. How many tickets does that get us?",
      timestamp: now - 3_600_000,
      type: "message" as const,
      role: "member" as const,
    },
    {
      id: "msg-4",
      sender: mockAddresses[0],
      senderShort: mockShortAddresses[0],
      text: "That gives us another 5 tickets at current pricing. With our pooled 47 tickets we'd cover about 0.15% of the number space — small individually, but way better than solo.",
      timestamp: now - 3_000_000,
      type: "message" as const,
      role: "manager" as const,
      isPinned: true,
    },
    {
      id: "sys-2",
      sender: "system",
      senderShort: "System",
      text: `${mockShortAddresses[3]} joined the syndicate`,
      timestamp: now - 2_400_000,
      type: "system" as const,
    },
    {
      id: "msg-5",
      sender: mockAddresses[3],
      senderShort: mockShortAddresses[3],
      text: "Hey everyone! Excited to join. Saw the win rate stats and had to get in. What's the strategy for the next draw?",
      timestamp: now - 2_100_000,
      type: "message" as const,
      role: "member" as const,
    },
    {
      id: "msg-6",
      sender: mockAddresses[4],
      senderShort: mockShortAddresses[4],
      text: "Welcome! We're targeting the upcoming rolldown window. The manager posts a buy plan before each draw.",
      timestamp: now - 1_800_000,
      type: "message" as const,
      role: "member" as const,
      reactions: { "👋": [mockAddresses[3]] },
    },
    {
      id: "ann-1",
      sender: mockAddresses[0],
      senderShort: mockShortAddresses[0],
      text: "📢 DRAW STRATEGY: Buying 52 tickets for Draw #347. Rolldown threshold approaching — EV is estimated +12%. Contributions due by 6pm UTC.",
      timestamp: now - 900_000,
      type: "announcement" as const,
      role: "manager" as const,
      isPinned: true,
      reactions: {
        "🚀": [
          mockAddresses[1],
          mockAddresses[2],
          mockAddresses[3],
          mockAddresses[4],
        ],
        "💰": [mockAddresses[2], mockAddresses[5]],
      },
    },
    {
      id: "msg-7",
      sender: mockAddresses[5],
      senderShort: mockShortAddresses[5],
      text: "LFG! Sending my 10 USDC now. That +12% EV is too good to pass up.",
      timestamp: now - 600_000,
      type: "message" as const,
      role: "member" as const,
      reactions: { "💪": [mockAddresses[0]] },
    },
    {
      id: "msg-8",
      sender: mockAddresses[1],
      senderShort: mockShortAddresses[1],
      text: "Just sent 8 USDC. Let's go team 🎯",
      timestamp: now - 180_000,
      type: "message" as const,
      role: "member" as const,
    },
  ];
}

export function useChat({
  syndicateId,
  sender,
  pollInterval = 10000,
  limit = 50,
}: UseChatOptions): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>(generateMockMessages);
  const [members] = useState<ChatMember[]>(generateMockMembers);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [isLoadingPinned, setIsLoadingPinned] = useState(false);
  const [hasMoreMessages] = useState(false);

  const onlineCount = members.filter((m) => m.isOnline).length;
  const totalMembers = members.length;
  const pinnedMessages = messages.filter((msg) => msg.isPinned);

  // Simulate polling for messages
  useEffect(() => {
    if (pollInterval <= 0) return;

    const interval = setInterval(() => {
      // In a real implementation, this would fetch new messages
      // For mock, we just update timestamps to make it feel live
      setMessages((prev) =>
        prev.map((msg) => ({
          ...msg,
          timestamp: msg.type === "system" ? Date.now() - 1000 : msg.timestamp,
        })),
      );
    }, pollInterval);

    return () => clearInterval(interval);
  }, [pollInterval]);

  const sendMessage = useCallback(
    async (
      text: string,
      type: "message" | "system" | "announcement" = "message",
      replyTo?: string,
    ): Promise<ChatMessage> => {
      if (!sender) {
        throw new Error("Sender address is required to send messages");
      }

      setIsSendingMessage(true);

      // Simulate network delay
      await new Promise((resolve) => setTimeout(resolve, 300));

      const newMessage: ChatMessage = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        sender,
        senderShort: `${sender.slice(0, 4)}...${sender.slice(-4)}`,
        text,
        timestamp: Date.now(),
        type,
        replyTo,
        role: "member" as const,
      };

      setMessages((prev) => [...prev, newMessage]);
      setIsSendingMessage(false);

      return newMessage;
    },
    [sender],
  );

  const reactToMessage = useCallback(
    async (
      messageId: string,
      emoji: string,
      action: "add" | "remove" = "add",
    ) => {
      if (!sender) {
        throw new Error("Sender address is required to react to messages");
      }

      // Simulate network delay
      await new Promise((resolve) => setTimeout(resolve, 200));

      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id !== messageId) return msg;

          const reactions = { ...msg.reactions };
          const currentReactions = reactions[emoji] || [];

          if (action === "add") {
            if (!currentReactions.includes(sender)) {
              reactions[emoji] = [...currentReactions, sender];
            }
          } else {
            reactions[emoji] = currentReactions.filter(
              (addr) => addr !== sender,
            );
            if (reactions[emoji].length === 0) {
              delete reactions[emoji];
            }
          }

          return { ...msg, reactions };
        }),
      );
    },
    [sender],
  );

  const updateMemberStatus = useCallback(async (isOnline: boolean) => {
    // In mock implementation, we don't track individual user status
    // This would be handled by the server in a real implementation
    await new Promise((resolve) => setTimeout(resolve, 100));
  }, []);

  const togglePinMessage = useCallback(
    async (messageId: string, pinned: boolean) => {
      // Simulate network delay
      await new Promise((resolve) => setTimeout(resolve, 200));

      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id === messageId) {
            return { ...msg, isPinned: pinned };
          }
          return msg;
        }),
      );
    },
    [],
  );

  const loadMoreMessages = useCallback(async () => {
    setIsLoadingMessages(true);
    // Simulate loading more messages
    await new Promise((resolve) => setTimeout(resolve, 500));
    setIsLoadingMessages(false);
  }, []);

  const refetchMessages = useCallback(async () => {
    setIsLoadingMessages(true);
    // Simulate refetching messages
    await new Promise((resolve) => setTimeout(resolve, 300));
    setIsLoadingMessages(false);
  }, []);

  const refetchMembers = useCallback(async () => {
    setIsLoadingMembers(true);
    // Simulate refetching members
    await new Promise((resolve) => setTimeout(resolve, 300));
    setIsLoadingMembers(false);
  }, []);

  const refetchPinned = useCallback(async () => {
    setIsLoadingPinned(true);
    // Simulate refetching pinned messages
    await new Promise((resolve) => setTimeout(resolve, 200));
    setIsLoadingPinned(false);
  }, []);

  return {
    // Data
    messages,
    members,
    onlineCount,
    totalMembers,
    pinnedMessages,

    // Loading states
    isLoadingMessages,
    isLoadingMembers,
    isLoadingPinned,
    isSendingMessage,

    // Errors
    messagesError: null,
    membersError: null,
    sendMessageError: null,

    // Actions
    sendMessage,
    reactToMessage,
    updateMemberStatus,
    togglePinMessage,

    // Pagination
    loadMoreMessages,
    hasMoreMessages,

    // Refresh
    refetchMessages,
    refetchMembers,
    refetchPinned,
  };
}
