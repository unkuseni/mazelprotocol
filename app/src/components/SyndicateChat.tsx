import {
  ArrowDown,
  AtSign,
  Crown,
  Hash,
  Image as ImageIcon,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Pin,
  Reply,
  Send,
  Shield,
  SmilePlus,
  Wallet,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppKit, useAppKitAccount } from "@/lib/appkit-provider";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export interface ChatMessage {
  id: string;
  sender: string; // wallet address
  senderShort: string;
  text: string;
  timestamp: number;
  type: "message" | "system" | "announcement";
  replyTo?: string; // message id
  reactions?: Record<string, string[]>; // emoji -> [addresses]
  role?: "manager" | "member";
  isPinned?: boolean;
}

export interface ChatMember {
  address: string;
  addressShort: string;
  role: "manager" | "member";
  isOnline: boolean;
  joinedAt: string;
  ticketsContributed: number;
}

interface SyndicateChatProps {
  syndicateId: string;
  syndicateName: string;
  members: ChatMember[];
  className?: string;
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

const AVATAR_COLORS = [
  "from-emerald/60 to-emerald-dark/80",
  "from-purple-500/60 to-purple-700/80",
  "from-blue-500/60 to-blue-700/80",
  "from-pink-500/60 to-pink-700/80",
  "from-orange-500/60 to-orange-700/80",
  "from-teal-500/60 to-teal-700/80",
  "from-rose-500/60 to-rose-700/80",
  "from-gold/60 to-gold-dark/80",
  "from-indigo-500/60 to-indigo-700/80",
  "from-cyan-500/60 to-cyan-700/80",
];

function getAvatarGradient(address: string): string {
  const hash = address
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function formatTimestamp(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;

  const date = new Date(ts);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

/* -------------------------------------------------------------------------- */
/*  Mock data generator                                                       */
/* -------------------------------------------------------------------------- */

const MOCK_ADDRESSES = [
  "7xKX...9fGh",
  "3mNP...2wVd",
  "9bQR...5tLe",
  "4jWS...8kMn",
  "6cYT...1pAo",
  "8dZU...7rBq",
];

const MOCK_FULL_ADDRESSES = [
  "7xKXabc123456789def9fGh",
  "3mNPabc123456789def2wVd",
  "9bQRabc123456789def5tLe",
  "4jWSabc123456789def8kMn",
  "6cYTabc123456789def1pAo",
  "8dZUabc123456789def7rBq",
];

function generateMockMessages(): ChatMessage[] {
  const now = Date.now();
  return [
    {
      id: "sys-1",
      sender: "system",
      senderShort: "System",
      text: "Welcome to the syndicate chat! Coordinate your strategy and discuss plays here.",
      timestamp: now - 7_200_000,
      type: "system",
    },
    {
      id: "msg-1",
      sender: MOCK_FULL_ADDRESSES[0],
      senderShort: MOCK_ADDRESSES[0],
      text: "Hey team! Rolldown window is getting close — the prize pool is at $47k with no jackpot hit in 8 draws.",
      timestamp: now - 5_400_000,
      type: "message",
      role: "manager",
      reactions: { "🔥": [MOCK_FULL_ADDRESSES[1], MOCK_FULL_ADDRESSES[2]] },
    },
    {
      id: "msg-2",
      sender: MOCK_FULL_ADDRESSES[1],
      senderShort: MOCK_ADDRESSES[1],
      text: "Nice catch. I think we should increase our ticket allocation for the next draw. The EV is getting spicy.",
      timestamp: now - 4_800_000,
      type: "message",
      role: "member",
    },
    {
      id: "msg-3",
      sender: MOCK_FULL_ADDRESSES[2],
      senderShort: MOCK_ADDRESSES[2],
      text: "Agreed. I can contribute an extra 5 USDC this round. How many tickets does that get us?",
      timestamp: now - 3_600_000,
      type: "message",
      role: "member",
    },
    {
      id: "msg-4",
      sender: MOCK_FULL_ADDRESSES[0],
      senderShort: MOCK_ADDRESSES[0],
      text: "That gives us another 5 tickets at current pricing. With our pooled 47 tickets we'd cover about 0.15% of the number space — small individually, but way better than solo.",
      timestamp: now - 3_000_000,
      type: "message",
      role: "manager",
      isPinned: true,
    },
    {
      id: "sys-2",
      sender: "system",
      senderShort: "System",
      text: `${MOCK_ADDRESSES[3]} joined the syndicate`,
      timestamp: now - 2_400_000,
      type: "system",
    },
    {
      id: "msg-5",
      sender: MOCK_FULL_ADDRESSES[3],
      senderShort: MOCK_ADDRESSES[3],
      text: "Hey everyone! Excited to join. Saw the win rate stats and had to get in. What's the strategy for the next draw?",
      timestamp: now - 2_100_000,
      type: "message",
      role: "member",
    },
    {
      id: "msg-6",
      sender: MOCK_FULL_ADDRESSES[4],
      senderShort: MOCK_ADDRESSES[4],
      text: "Welcome! We're targeting the upcoming rolldown window. The manager posts a buy plan before each draw.",
      timestamp: now - 1_800_000,
      type: "message",
      role: "member",
      reactions: { "👋": [MOCK_FULL_ADDRESSES[3]] },
    },
    {
      id: "ann-1",
      sender: MOCK_FULL_ADDRESSES[0],
      senderShort: MOCK_ADDRESSES[0],
      text: "📢 DRAW STRATEGY: Buying 52 tickets for Draw #347. Rolldown threshold approaching — EV is estimated +12%. Contributions due by 6pm UTC.",
      timestamp: now - 900_000,
      type: "announcement",
      role: "manager",
      isPinned: true,
      reactions: {
        "🚀": [
          MOCK_FULL_ADDRESSES[1],
          MOCK_FULL_ADDRESSES[2],
          MOCK_FULL_ADDRESSES[3],
          MOCK_FULL_ADDRESSES[4],
        ],
        "💰": [MOCK_FULL_ADDRESSES[2], MOCK_FULL_ADDRESSES[5]],
      },
    },
    {
      id: "msg-7",
      sender: MOCK_FULL_ADDRESSES[5],
      senderShort: MOCK_ADDRESSES[5],
      text: "LFG! Sending my 10 USDC now. That +12% EV is too good to pass up.",
      timestamp: now - 600_000,
      type: "message",
      role: "member",
      reactions: { "💪": [MOCK_FULL_ADDRESSES[0]] },
    },
    {
      id: "msg-8",
      sender: MOCK_FULL_ADDRESSES[1],
      senderShort: MOCK_ADDRESSES[1],
      text: "Just sent 8 USDC. Let's go team 🎯",
      timestamp: now - 180_000,
      type: "message",
      role: "member",
    },
  ];
}

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                            */
/* -------------------------------------------------------------------------- */

function MessageAvatar({
  address,
  role,
}: {
  address: string;
  role?: "manager" | "member";
}) {
  const gradient = getAvatarGradient(address);
  return (
    <div className="relative shrink-0">
      <div
        className={`w-8 h-8 rounded-lg bg-linear-to-br ${gradient} flex items-center justify-center text-white text-xs font-bold shadow-md`}
      >
        {address.slice(0, 2).toUpperCase()}
      </div>
      {role === "manager" && (
        <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-gold/90 flex items-center justify-center border border-gold-dark/50">
          <Crown size={8} className="text-black" />
        </div>
      )}
    </div>
  );
}

function SystemMessage({ message }: { message: ChatMessage }) {
  return (
    <div className="flex items-center justify-center gap-2 py-2">
      <div className="h-px flex-1 bg-foreground/5" />
      <span className="text-[10px] text-muted-foreground px-3 flex items-center gap-1.5">
        {message.type === "system" && (
          <Shield size={10} className="text-muted-foreground/60" />
        )}
        {message.text}
      </span>
      <div className="h-px flex-1 bg-foreground/5" />
    </div>
  );
}

function ReactionBadge({
  emoji,
  addresses,
  currentUser,
  onToggle,
}: {
  emoji: string;
  addresses: string[];
  currentUser?: string;
  onToggle: () => void;
}) {
  const isReacted = currentUser ? addresses.includes(currentUser) : false;
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] transition-all ${
        isReacted
          ? "bg-emerald/15 border border-emerald/25 text-emerald-light"
          : "bg-foreground/4 border border-foreground/6 text-muted-foreground hover:bg-foreground/8"
      }`}
    >
      <span>{emoji}</span>
      <span className="font-semibold">{addresses.length}</span>
    </button>
  );
}

function ChatBubble({
  message,
  isOwn,
  currentUser,
  onReact,
}: {
  message: ChatMessage;
  isOwn: boolean;
  currentUser?: string;
  onReact: (messageId: string, emoji: string) => void;
}) {
  const [showActions, setShowActions] = useState(false);

  if (message.type === "system") {
    return <SystemMessage message={message} />;
  }

  const isAnnouncement = message.type === "announcement";

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: <ignore static element>
    <div
      className={`group flex gap-2.5 px-4 py-1.5 transition-colors hover:bg-foreground/2 ${
        isOwn ? "flex-row-reverse" : ""
      }`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Avatar */}
      {!isOwn && <MessageAvatar address={message.sender} role={message.role} />}

      {/* Content */}
      <div
        className={`flex flex-col max-w-[75%] ${isOwn ? "items-end" : "items-start"}`}
      >
        {/* Sender name + time */}
        {!isOwn && (
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[11px] font-semibold text-muted-foreground">
              {message.senderShort}
            </span>
            {message.role === "manager" && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gold/15 text-gold border border-gold/20 uppercase tracking-wider">
                Manager
              </span>
            )}
            <span className="text-[10px] text-muted-foreground/60">
              {formatTimestamp(message.timestamp)}
            </span>
            {message.isPinned && <Pin size={9} className="text-gold/60" />}
          </div>
        )}

        {/* Bubble */}
        <div
          className={`relative rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
            isAnnouncement
              ? "bg-linear-to-br from-emerald/10 to-gold/5 border border-emerald/20 text-gray-200 rounded-xl"
              : isOwn
                ? "bg-linear-to-br from-emerald/20 to-emerald-dark/15 text-gray-100 rounded-br-md border border-emerald/15"
                : "bg-foreground/5 text-gray-200 rounded-bl-md border border-foreground/6"
          }`}
        >
          {message.text}
        </div>

        {/* Own message timestamp */}
        {isOwn && (
          <span className="text-[10px] text-muted-foreground/60 mt-0.5 mr-1">
            {formatTimestamp(message.timestamp)}
          </span>
        )}

        {/* Reactions */}
        {message.reactions && Object.keys(message.reactions).length > 0 && (
          <div className="flex items-center gap-1 mt-1">
            {Object.entries(message.reactions).map(([emoji, addresses]) => (
              <ReactionBadge
                key={emoji}
                emoji={emoji}
                addresses={addresses}
                currentUser={currentUser}
                onToggle={() => onReact(message.id, emoji)}
              />
            ))}
            <button
              type="button"
              className="w-5 h-5 rounded-full bg-foreground/3 border border-foreground/6 flex items-center justify-center text-muted-foreground/60 hover:text-muted-foreground hover:bg-foreground/6 transition-colors"
              onClick={() => onReact(message.id, "👍")}
            >
              <SmilePlus size={10} />
            </button>
          </div>
        )}
      </div>

      {/* Hover actions */}
      {showActions && (
        <div
          className={`flex items-center gap-0.5 self-start mt-1 opacity-0 group-hover:opacity-100 transition-opacity ${
            isOwn ? "mr-1" : "ml-1"
          }`}
        >
          <button
            type="button"
            className="p-1 rounded-md text-muted-foreground/60 hover:text-muted-foreground hover:bg-foreground/5 transition-colors"
            title="React"
            onClick={() => onReact(message.id, "👍")}
          >
            <SmilePlus size={12} />
          </button>
          <button
            type="button"
            className="p-1 rounded-md text-muted-foreground/60 hover:text-muted-foreground hover:bg-foreground/5 transition-colors"
            title="Reply"
          >
            <Reply size={12} />
          </button>
          <button
            type="button"
            className="p-1 rounded-md text-muted-foreground/60 hover:text-muted-foreground hover:bg-foreground/5 transition-colors"
            title="More"
          >
            <MoreHorizontal size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

function TypingIndicator({ names }: { names: string[] }) {
  if (names.length === 0) return null;
  const text =
    names.length === 1
      ? `${names[0]} is typing`
      : names.length === 2
        ? `${names[0]} and ${names[1]} are typing`
        : `${names[0]} and ${names.length - 1} others are typing`;

  return (
    <div className="flex items-center gap-2 px-4 py-2">
      <div className="flex gap-0.5">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald/50 animate-bounce [animation-delay:0ms]" />
        <span className="w-1.5 h-1.5 rounded-full bg-emerald/50 animate-bounce [animation-delay:150ms]" />
        <span className="w-1.5 h-1.5 rounded-full bg-emerald/50 animate-bounce [animation-delay:300ms]" />
      </div>
      <span className="text-[10px] text-muted-foreground">{text}</span>
    </div>
  );
}

function ConnectWalletPrompt() {
  const { open } = useAppKit();

  return (
    <div className="flex flex-col items-center justify-center py-8 px-4">
      <div className="w-14 h-14 rounded-2xl bg-foreground/3 border border-foreground/6 flex items-center justify-center mb-4">
        <Wallet size={24} className="text-muted-foreground" />
      </div>
      <h3 className="text-sm font-bold text-foreground mb-1">
        Connect to Chat
      </h3>
      <p className="text-xs text-muted-foreground text-center max-w-xs mb-4">
        Connect your wallet to send messages and coordinate with your syndicate
        members.
      </p>
      <Button
        onClick={() => open()}
        className="h-9 px-5 text-xs font-bold bg-linear-to-r from-emerald to-emerald-dark hover:from-emerald-light hover:to-emerald text-white rounded-xl shadow-lg shadow-emerald/20"
      >
        <Wallet size={14} />
        Connect Wallet
      </Button>
    </div>
  );
}

function OnlineDot({ isOnline }: { isOnline: boolean }) {
  return (
    <span
      className={`w-2 h-2 rounded-full shrink-0 ${
        isOnline
          ? "bg-emerald-light shadow-sm shadow-emerald/50"
          : "bg-gray-600"
      }`}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*  Quick Emoji Picker                                                        */
/* -------------------------------------------------------------------------- */

const QUICK_EMOJIS = [
  "👍",
  "🔥",
  "🚀",
  "💰",
  "🎯",
  "💪",
  "👋",
  "😂",
  "❤️",
  "🎉",
];

function QuickEmojiBar({
  onSelect,
  visible,
}: {
  onSelect: (emoji: string) => void;
  visible: boolean;
}) {
  if (!visible) return null;

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 glass rounded-xl animate-slide-up">
      {QUICK_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onSelect(emoji)}
          className="w-7 h-7 rounded-lg hover:bg-foreground/10 flex items-center justify-center text-sm transition-colors"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main Chat Component                                                       */
/* -------------------------------------------------------------------------- */

export default function SyndicateChat({
  syndicateId: _syndicateId,
  syndicateName,
  members,
  className = "",
}: SyndicateChatProps) {
  const { address, isConnected } = useAppKitAccount();
  const [messages, setMessages] = useState<ChatMessage[]>(generateMockMessages);
  const [inputValue, setInputValue] = useState("");
  const [showEmojiBar, setShowEmojiBar] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isLoading] = useState(false);
  const [showMembers, setShowMembers] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Mock typing indicators
  const [typingUsers] = useState<string[]>([]);

  // Auto-scroll to bottom on new messages
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  useEffect(() => {
    scrollToBottom("instant");
  }, [scrollToBottom]);

  useEffect(() => {
    if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.sender === address || !showScrollButton) {
        scrollToBottom();
      }
    }
  }, [messages, address, showScrollButton, scrollToBottom]);

  // Track scroll position for "scroll to bottom" button
  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current) return;
    const el = scrollContainerRef.current;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollButton(distanceFromBottom > 150);
  }, []);

  // Send message
  const handleSend = useCallback(() => {
    if (!inputValue.trim() || !address) return;

    const newMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: address,
      senderShort: truncateAddress(address),
      text: inputValue.trim(),
      timestamp: Date.now(),
      type: "message",
      role: "member",
    };

    setMessages((prev) => [...prev, newMessage]);
    setInputValue("");
    setShowEmojiBar(false);
    inputRef.current?.focus();
  }, [inputValue, address]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  // Toggle reaction
  const handleReact = useCallback(
    (messageId: string, emoji: string) => {
      if (!address) return;
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id !== messageId) return msg;
          const reactions = { ...(msg.reactions || {}) };
          const current = reactions[emoji] || [];
          if (current.includes(address)) {
            reactions[emoji] = current.filter((a) => a !== address);
            if (reactions[emoji].length === 0) delete reactions[emoji];
          } else {
            reactions[emoji] = [...current, address];
          }
          return { ...msg, reactions };
        }),
      );
    },
    [address],
  );

  // Insert emoji into input
  const handleEmojiSelect = useCallback((emoji: string) => {
    setInputValue((prev) => prev + emoji);
    setShowEmojiBar(false);
    inputRef.current?.focus();
  }, []);

  const onlineCount = members.filter((m) => m.isOnline).length;

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* ================================================================ */}
      {/*  Chat Header                                                     */}
      {/* ================================================================ */}
      <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-foreground/6 bg-foreground/2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-1.5 rounded-lg bg-emerald/10 border border-emerald/15">
            <MessageCircle size={16} className="text-emerald-light" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Hash size={12} className="text-muted-foreground" />
              <h3 className="text-sm font-bold text-foreground truncate">
                {syndicateName}
              </h3>
            </div>
            <p className="text-[10px] text-muted-foreground">
              <span className="text-emerald-light font-semibold">
                {onlineCount}
              </span>{" "}
              online &bull; {members.length} members
            </p>
          </div>
        </div>

        {/* Members toggle */}
        <button
          type="button"
          onClick={() => setShowMembers((v) => !v)}
          className={`p-2 rounded-lg transition-colors ${
            showMembers
              ? "bg-emerald/10 text-emerald-light border border-emerald/20"
              : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
          }`}
          title="Toggle members"
        >
          <AtSign size={16} />
        </button>
      </div>

      {/* ================================================================ */}
      {/*  Body: Messages + Optional Members sidebar                       */}
      {/* ================================================================ */}
      <div className="flex flex-1 min-h-0">
        {/* Messages area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Message list */}
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto overflow-x-hidden py-3 space-y-1 scroll-smooth"
          >
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={20} className="text-emerald/60 animate-spin" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4">
                <div className="w-12 h-12 rounded-2xl bg-foreground/3 border border-foreground/6 flex items-center justify-center mb-3">
                  <MessageCircle
                    size={20}
                    className="text-muted-foreground/60"
                  />
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  No messages yet. Start the conversation!
                </p>
              </div>
            ) : (
              messages.map((msg) => (
                <ChatBubble
                  key={msg.id}
                  message={msg}
                  isOwn={msg.sender === address}
                  currentUser={address}
                  onReact={handleReact}
                />
              ))
            )}

            <TypingIndicator names={typingUsers} />
            <div ref={messagesEndRef} />
          </div>

          {/* Scroll to bottom button */}
          {showScrollButton && (
            <div className="relative">
              <button
                type="button"
                onClick={() => scrollToBottom()}
                className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 w-8 h-8 rounded-full glass-strong border border-emerald/20 flex items-center justify-center text-emerald-light hover:bg-emerald/10 transition-colors shadow-lg shadow-black/30"
              >
                <ArrowDown size={14} />
              </button>
            </div>
          )}

          {/* ============================================================ */}
          {/*  Input area                                                   */}
          {/* ============================================================ */}
          {!isConnected ? (
            <div className="shrink-0 border-t border-foreground/6">
              <ConnectWalletPrompt />
            </div>
          ) : (
            <div className="shrink-0 border-t border-foreground/6 p-3 space-y-2">
              {/* Emoji bar */}
              <QuickEmojiBar
                visible={showEmojiBar}
                onSelect={handleEmojiSelect}
              />

              <div className="flex items-center gap-2">
                {/* Emoji toggle */}
                <button
                  type="button"
                  onClick={() => setShowEmojiBar((v) => !v)}
                  className={`p-2 rounded-lg transition-colors ${
                    showEmojiBar
                      ? "bg-emerald/10 text-emerald-light"
                      : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                  }`}
                  title="Emoji"
                >
                  <SmilePlus size={16} />
                </button>

                {/* Attachment placeholder */}
                <button
                  type="button"
                  className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
                  title="Attach image"
                >
                  <ImageIcon size={16} />
                </button>

                {/* Input */}
                <div className="flex-1 relative">
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a message..."
                    className="w-full h-9 px-4 rounded-xl bg-foreground/4 border border-foreground/8 text-sm text-foreground placeholder-gray-600 focus:outline-none focus:border-emerald/30 focus:ring-1 focus:ring-emerald/15 transition-colors"
                    maxLength={500}
                  />
                </div>

                {/* Send */}
                <Button
                  onClick={handleSend}
                  disabled={!inputValue.trim()}
                  className="h-9 w-9 p-0 rounded-xl bg-linear-to-r from-emerald to-emerald-dark hover:from-emerald-light hover:to-emerald text-white shadow-md shadow-emerald/20 disabled:opacity-30 disabled:shadow-none transition-all"
                >
                  <Send size={14} />
                </Button>
              </div>

              {/* Character count */}
              {inputValue.length > 400 && (
                <div className="text-right">
                  <span
                    className={`text-[10px] ${
                      inputValue.length >= 500
                        ? "text-red-400"
                        : "text-muted-foreground"
                    }`}
                  >
                    {inputValue.length}/500
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ============================================================ */}
        {/*  Members sidebar                                              */}
        {/* ============================================================ */}
        {showMembers && (
          <div className="w-56 shrink-0 border-l border-foreground/6 bg-foreground/1 overflow-y-auto hidden md:block">
            <div className="p-3">
              <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Members — {members.length}
              </h4>

              {/* Online */}
              {members.filter((m) => m.isOnline).length > 0 && (
                <div className="mb-4">
                  <p className="text-[10px] text-emerald/60 font-semibold uppercase tracking-wider mb-2">
                    Online — {members.filter((m) => m.isOnline).length}
                  </p>
                  <div className="space-y-1">
                    {members
                      .filter((m) => m.isOnline)
                      .map((member) => (
                        <div
                          key={member.address}
                          className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-foreground/4 transition-colors"
                        >
                          <OnlineDot isOnline />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-mono text-muted-foreground truncate">
                                {member.addressShort}
                              </span>
                              {member.role === "manager" && (
                                <Crown
                                  size={9}
                                  className="text-gold shrink-0"
                                />
                              )}
                            </div>
                            <span className="text-[9px] text-muted-foreground/60">
                              {member.ticketsContributed} tickets
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Offline */}
              {members.filter((m) => !m.isOnline).length > 0 && (
                <div>
                  <p className="text-[10px] text-muted-foreground/60 font-semibold uppercase tracking-wider mb-2">
                    Offline — {members.filter((m) => !m.isOnline).length}
                  </p>
                  <div className="space-y-1">
                    {members
                      .filter((m) => !m.isOnline)
                      .map((member) => (
                        <div
                          key={member.address}
                          className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-foreground/4 transition-colors opacity-60"
                        >
                          <OnlineDot isOnline={false} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-mono text-muted-foreground truncate">
                                {member.addressShort}
                              </span>
                              {member.role === "manager" && (
                                <Crown
                                  size={9}
                                  className="text-gold/60 shrink-0"
                                />
                              )}
                            </div>
                            <span className="text-[9px] text-muted-foreground/60">
                              {member.ticketsContributed} tickets
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
