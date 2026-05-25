import { useState, useCallback, useEffect, useRef } from "react";

// ---------------------------------------------------------------------------
// Types (mirrors the chat API)
// ---------------------------------------------------------------------------

export interface ChatMessage {
  id: string;
  syndicate_id?: string;
  sender: string;
  senderShort: string;
  text: string;
  timestamp: number;
  type: "message" | "system" | "announcement";
  role?: "manager" | "member";
  isPinned?: boolean;
  replyTo?: string;
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

interface UseChatOptions {
  syndicateId: string;
  sender?: string;
  pollInterval?: number;
  limit?: number;
}

interface UseChatReturn {
  messages: ChatMessage[];
  members: ChatMember[];
  onlineCount: number;
  totalMembers: number;
  pinnedMessages: ChatMessage[];
  isLoadingMessages: boolean;
  isLoadingMembers: boolean;
  isLoadingPinned: boolean;
  isSendingMessage: boolean;
  messagesError: Error | null;
  membersError: Error | null;
  sendMessageError: Error | null;
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
  loadMoreMessages: () => Promise<void>;
  hasMoreMessages: boolean;
  refetchMessages: () => Promise<void>;
  refetchMembers: () => Promise<void>;
  refetchPinned: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

function apiUrl(syndicateId: string): string {
  return `/api/chat/${syndicateId}/messages`;
}

function reactUrl(messageId: string): string {
  return `/api/chat/messages/${messageId}/react`;
}

function pinUrl(messageId: string): string {
  return `/api/chat/messages/${messageId}/pin`;
}

/** Map the API response (snake_case) to our camelCase ChatMessage */
function mapApiMessage(raw: Record<string, unknown>): ChatMessage {
  return {
    id: raw.id as string,
    sender: raw.sender as string,
    senderShort: raw.sender_short as string,
    text: raw.text as string,
    timestamp: raw.created_at as number,
    type: (raw.type as ChatMessage["type"]) ?? "message",
    role: raw.role as ChatMessage["role"] | undefined,
    isPinned: (raw.is_pinned as number) === 1,
    replyTo: raw.reply_to as string | undefined,
    reactions: raw.reactions as Record<string, string[]> | undefined,
  };
}

// ---------------------------------------------------------------------------
// Mock members (still client-side — no per-user online status in D1 yet)
// ---------------------------------------------------------------------------

function generateMockMembers(): ChatMember[] {
  const addresses = [
    "7xKXabc123456789def9fGh",
    "3mNPabc123456789def2wVd",
    "9bQRabc123456789def5tLe",
    "4jWSabc123456789def8kMn",
    "6cYTabc123456789def1pAo",
    "8dZUabc123456789def7rBq",
  ];
  return addresses.map((addr, i) => ({
    address: addr,
    addressShort: `${addr.slice(0, 4)}...${addr.slice(-4)}`,
    role: i === 0 ? "manager" : "member",
    isOnline: i < 4,
    joinedAt: new Date(Date.now() - 86_400_000 * (i + 1)).toISOString(),
    ticketsContributed: Math.floor(Math.random() * 20) + 1,
  }));
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useChat({
  syndicateId,
  sender,
  pollInterval = 5_000,
  limit = 50,
}: UseChatOptions): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [members] = useState<ChatMember[]>(generateMockMembers);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [isLoadingPinned, setIsLoadingPinned] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [messagesError, setMessagesError] = useState<Error | null>(null);
  const [sendMessageError, setSendMessageError] = useState<Error | null>(null);

  const isFetchingRef = useRef(false);
  const oldestTimestampRef = useRef<number | null>(null);

  const onlineCount = members.filter((m) => m.isOnline).length;
  const totalMembers = members.length;
  const pinnedMessages = messages.filter((m) => m.isPinned);

  // ---- Fetch messages ----
  const fetchMessages = useCallback(
    async (loadMore = false) => {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;

      try {
        const params = new URLSearchParams({ limit: String(limit) });
        if (loadMore && oldestTimestampRef.current) {
          params.set("before", String(oldestTimestampRef.current));
        }
        const url = `${apiUrl(syndicateId)}?${params}`;

        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        const data = await res.json();
        const apiMessages: ChatMessage[] = (
          data.messages as Record<string, unknown>[]
        ).map(mapApiMessage);

        if (loadMore) {
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const newMsgs = apiMessages.filter(
              (m) => !existingIds.has(m.id),
            );
            return [...newMsgs, ...prev];
          });
        } else {
          // For fresh fetch (poll), only replace if there are new messages
          setMessages((prev) => {
            if (apiMessages.length === 0) return prev;
            // Add only new messages
            const existingIds = new Set(prev.map((m) => m.id));
            const newMsgs = apiMessages.filter(
              (m) => !existingIds.has(m.id),
            );
            if (newMsgs.length === 0) return prev;
            return [...prev, ...newMsgs].slice(-limit * 2); // Keep last 2x limit
          });
        }

        // Track oldest message for pagination
        if (apiMessages.length > 0) {
          oldestTimestampRef.current = apiMessages[0].timestamp;
          setHasMoreMessages(apiMessages.length >= limit);
        }

        setMessagesError(null);
      } catch (err) {
        setMessagesError(
          err instanceof Error ? err : new Error("Failed to fetch messages"),
        );
      } finally {
        setIsLoadingMessages(false);
        isFetchingRef.current = false;
      }
    },
    [syndicateId, limit],
  );

  // Initial fetch
  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Polling
  useEffect(() => {
    if (pollInterval <= 0) return;
    const interval = setInterval(() => {
      fetchMessages();
    }, pollInterval);
    return () => clearInterval(interval);
  }, [fetchMessages, pollInterval]);

  // ---- Send message ----
  const sendMessage = useCallback(
    async (
      text: string,
      type: "message" | "system" | "announcement" = "message",
      replyTo?: string,
    ): Promise<ChatMessage> => {
      if (!sender) throw new Error("Sender address is required");

      setIsSendingMessage(true);
      setSendMessageError(null);

      try {
        const res = await fetch(apiUrl(syndicateId), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            type,
            replyTo,
            sender,
            senderShort: `${sender.slice(0, 4)}...${sender.slice(-4)}`,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(
            (err as { error?: string }).error ?? "Failed to send message",
          );
        }

        const data = await res.json();
        const newMsg = mapApiMessage(data.message as Record<string, unknown>);

        // Optimistically add to local state
        setMessages((prev) => [...prev, newMsg]);

        return newMsg;
      } catch (err) {
        const error =
          err instanceof Error ? err : new Error("Failed to send message");
        setSendMessageError(error);
        throw error;
      } finally {
        setIsSendingMessage(false);
      }
    },
    [syndicateId, sender],
  );

  // ---- React to message ----
  const reactToMessage = useCallback(
    async (
      messageId: string,
      emoji: string,
      action: "add" | "remove",
    ) => {
      if (!sender) return;

      // Optimistic update
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id !== messageId) return msg;
          const reactions = { ...msg.reactions };
          const current = reactions[emoji] ?? [];
          if (action === "add") {
            if (!current.includes(sender))
              reactions[emoji] = [...current, sender];
          } else {
            reactions[emoji] = current.filter((a) => a !== sender);
            if (reactions[emoji].length === 0) delete reactions[emoji];
          }
          return { ...msg, reactions };
        }),
      );

      try {
        await fetch(reactUrl(messageId), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ emoji, action, sender }),
        });
      } catch {
        // Revert on error by re-fetching
        fetchMessages();
      }
    },
    [sender, fetchMessages],
  );

  // ---- Toggle pin ----
  const togglePinMessage = useCallback(
    async (messageId: string, pinned: boolean) => {
      // Optimistic update
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? { ...msg, isPinned: pinned } : msg,
        ),
      );

      try {
        await fetch(pinUrl(messageId), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pinned }),
        });
      } catch {
        fetchMessages();
      }
    },
    [fetchMessages],
  );

  // ---- Load more (pagination) ----
  const loadMoreMessages = useCallback(async () => {
    await fetchMessages(true);
  }, [fetchMessages]);

  // ---- Member status (placeholder) ----
  const updateMemberStatus = useCallback(async (_isOnline: boolean) => {
    // In a production app, this would update a presence table in D1
  }, []);

  // ---- Refetch helpers ----
  const refetchMessages = useCallback(async () => {
    setIsLoadingMessages(true);
    await fetchMessages();
  }, [fetchMessages]);

  const refetchMembers = useCallback(async () => {
    setIsLoadingMembers(true);
    setTimeout(() => setIsLoadingMembers(false), 300);
  }, []);

  const refetchPinned = useCallback(async () => {
    setIsLoadingPinned(true);
    setTimeout(() => setIsLoadingPinned(false), 200);
  }, []);

  return {
    messages,
    members,
    onlineCount,
    totalMembers,
    pinnedMessages,
    isLoadingMessages,
    isLoadingMembers,
    isLoadingPinned,
    isSendingMessage,
    messagesError,
    membersError: null,
    sendMessageError,
    sendMessage,
    reactToMessage,
    updateMemberStatus,
    togglePinMessage,
    loadMoreMessages,
    hasMoreMessages,
    refetchMessages,
    refetchMembers,
    refetchPinned,
  };
}
