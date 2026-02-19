import {
  ArrowDown,
  AtSign,
  Crown,
  Hash,
  Image as ImageIcon,
  Loader2,
  MessageCircle,
  Pin,
  Send,
  SmilePlus,
  Wallet,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppKit, useAppKitAccount } from "@/lib/appkit-provider";
import { useChat } from "@/hooks/useChat";
import type {
  ChatMessage,
  ChatMember,
} from "@/integrations/trpc/routers/chatRouter";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export type { ChatMessage, ChatMember };

interface SyndicateChatProps {
  syndicateId: string;
  syndicateName: string;
  members: ChatMember[];
  className?: string;
}

// ----------------------------------------------------------------------------
// Utility Functions
// ----------------------------------------------------------------------------

function formatTimestamp(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;

  const date = new Date(timestamp);
  return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
}

// ----------------------------------------------------------------------------
// Subcomponents
// ----------------------------------------------------------------------------

interface MessageAvatarProps {
  address: string;
  role?: "manager" | "member";
  size?: number;
}

function MessageAvatar({ address, role, size = 28 }: MessageAvatarProps) {
  const gradient = `linear-gradient(135deg, hsl(${parseInt(address.slice(-6), 16) % 360}, 70%, 50%), hsl(${(parseInt(address.slice(-6), 16) + 30) % 360}, 70%, 50%))`;

  return (
    <div className="relative">
      <div
        className="rounded-full flex items-center justify-center text-white font-bold text-xs"
        style={{
          width: size,
          height: size,
          background: gradient,
        }}
      >
        {address.slice(0, 2)}
      </div>
      {role === "manager" && (
        <Crown
          size={size / 3}
          className="absolute -top-1 -right-1 text-gold bg-black/50 rounded-full p-0.5"
        />
      )}
    </div>
  );
}

interface ChatBubbleProps {
  message: ChatMessage;
  isOwn: boolean;
  currentUser?: string;
  onReact: (messageId: string, emoji: string) => void;
}

function ChatBubble({ message, isOwn, currentUser, onReact }: ChatBubbleProps) {
  const [showActions, setShowActions] = useState(false);

  const isAnnouncement = message.type === "announcement";
  const isSystem = message.type === "system";

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: <explanation>
    <div
      className={`px-4 ${isOwn ? "text-right" : ""}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div
        className={`inline-flex flex-col max-w-[85%] ${isOwn ? "items-end ml-auto" : "items-start"}`}
      >
        {/* Message header */}
        {!isOwn && !isSystem && (
          <div className="flex items-center gap-2 mb-1">
            <MessageAvatar
              address={message.sender}
              role={message.role}
              size={20}
            />
            <span className="text-[10px] font-mono text-muted-foreground">
              {message.senderShort}
            </span>
            {message.role === "manager" && (
              <span className="px-1.5 py-0.5 rounded text-[8px] bg-gold/10 text-gold font-semibold uppercase">
                Manager
              </span>
            )}
            <span className="text-[9px] text-muted-foreground/60">
              {formatTimestamp(message.timestamp)}
            </span>
          </div>
        )}

        {/* Message bubble */}
        <div
          className={`rounded-2xl px-4 py-3 ${
            isAnnouncement
              ? "bg-gold/10 border border-gold/20"
              : isSystem
                ? "bg-foreground/5 border border-foreground/10 text-muted-foreground"
                : isOwn
                  ? "bg-emerald/10 border border-emerald/20"
                  : "bg-foreground/3 border border-foreground/8"
          }`}
        >
          {isAnnouncement && (
            <div className="flex items-center gap-2 mb-2">
              <div className="w-5 h-5 rounded-full bg-gold/20 flex items-center justify-center">
                <Pin size={10} className="text-gold" />
              </div>
              <span className="text-xs font-semibold text-gold">
                Announcement
              </span>
            </div>
          )}

          <p className="text-sm whitespace-pre-wrap break-words">
            {message.text}
          </p>

          {/* Reactions */}
          {message.reactions && Object.keys(message.reactions).length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {Object.entries(message.reactions).map(([emoji, reactors]) => {
                const reactorsArray = reactors as string[];
                const hasReacted = reactorsArray.includes(currentUser || "");
                return (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => onReact(message.id, emoji)}
                    className={`px-2 py-0.5 rounded-full text-xs border ${
                      hasReacted
                        ? "bg-emerald/20 border-emerald/40 text-emerald-light"
                        : "bg-foreground/5 border-foreground/10 text-muted-foreground"
                    }`}
                  >
                    {emoji} {reactorsArray.length}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Message footer */}
        <div className="flex items-center gap-2 mt-1">
          {showActions && !isSystem && (
            <>
              <button
                type="button"
                onClick={() => onReact(message.id, "👍")}
                className="p-1 rounded-full hover:bg-foreground/5 text-muted-foreground hover:text-foreground transition-colors"
                title="React with 👍"
              >
                👍
              </button>
              <button
                type="button"
                onClick={() => onReact(message.id, "🔥")}
                className="p-1 rounded-full hover:bg-foreground/5 text-muted-foreground hover:text-foreground transition-colors"
                title="React with 🔥"
              >
                🔥
              </button>
              <button
                type="button"
                onClick={() => onReact(message.id, "🚀")}
                className="p-1 rounded-full hover:bg-foreground/5 text-muted-foreground hover:text-foreground transition-colors"
                title="React with 🚀"
              >
                🚀
              </button>
            </>
          )}
          {!isOwn && !isSystem && (
            <span className="text-[9px] text-muted-foreground/60">
              {formatTimestamp(message.timestamp)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

interface TypingIndicatorProps {
  names: string[];
}

function TypingIndicator({ names }: TypingIndicatorProps) {
  if (names.length === 0) return null;

  const text =
    names.length === 1
      ? `${names[0]} is typing...`
      : names.length === 2
        ? `${names[0]} and ${names[1]} are typing...`
        : `${names[0]} and ${names.length - 1} others are typing...`;

  return (
    <div className="px-4 py-2">
      <div className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-foreground/3 border border-foreground/8">
        <div className="flex gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald/60 animate-pulse" />
          <div className="w-1.5 h-1.5 rounded-full bg-emerald/60 animate-pulse delay-100" />
          <div className="w-1.5 h-1.5 rounded-full bg-emerald/60 animate-pulse delay-200" />
        </div>
        <span className="text-xs text-muted-foreground">{text}</span>
      </div>
    </div>
  );
}

function ConnectWalletPrompt() {
  const { open } = useAppKit();

  return (
    <div className="p-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-foreground/3 border border-foreground/6 flex items-center justify-center mx-auto mb-4">
        <Wallet size={24} className="text-muted-foreground" />
      </div>
      <h3 className="text-base font-bold text-foreground mb-2">
        Connect Wallet to Chat
      </h3>
      <p className="text-xs text-muted-foreground mb-6 max-w-sm mx-auto">
        Connect your wallet to join the conversation, coordinate ticket
        purchases, and discuss strategies with syndicate members.
      </p>
      <Button
        onClick={() => open()}
        className="h-10 px-6 text-xs font-bold bg-linear-to-r from-emerald to-emerald-dark hover:from-emerald-light hover:to-emerald text-white rounded-xl shadow-lg shadow-emerald/20"
      >
        <Wallet size={14} />
        Connect Wallet
      </Button>
    </div>
  );
}

interface OnlineDotProps {
  isOnline: boolean;
}

function OnlineDot({ isOnline }: OnlineDotProps) {
  return (
    <div className="relative">
      <div className="w-2 h-2 rounded-full bg-foreground/10" />
      {isOnline && (
        <div className="absolute inset-0 w-2 h-2 rounded-full bg-emerald animate-ping" />
      )}
      <div
        className={`absolute inset-0 w-2 h-2 rounded-full ${isOnline ? "bg-emerald" : "bg-muted-foreground/30"}`}
      />
    </div>
  );
}

const QUICK_EMOJIS = ["👍", "🔥", "🚀", "💸", "🎯", "💰", "💪", "👏"];

interface QuickEmojiBarProps {
  visible: boolean;
  onSelect: (emoji: string) => void;
}

function QuickEmojiBar({ visible, onSelect }: QuickEmojiBarProps) {
  if (!visible) return null;

  return (
    <div className="flex flex-wrap gap-1 p-2 rounded-lg bg-foreground/2 border border-foreground/6">
      {QUICK_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onSelect(emoji)}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-lg hover:bg-foreground/5 transition-colors"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main Component                                                            */
/* -------------------------------------------------------------------------- */

export default function SyndicateChat({
  syndicateId,
  syndicateName,
  members: _initialMembers,
  className = "",
}: SyndicateChatProps) {
  const { address, isConnected } = useAppKitAccount();
  const {
    messages,
    members,
    onlineCount,
    totalMembers,
    isLoadingMessages,
    isSendingMessage,
    sendMessage,
    reactToMessage,
    updateMemberStatus,
    refetchMessages,
    refetchMembers,
  } = useChat({
    syndicateId,
    sender: address,
    pollInterval: 10000,
    limit: 50,
  });

  const [inputValue, setInputValue] = useState("");
  const [showEmojiBar, setShowEmojiBar] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [typingUsers] = useState<string[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
  const handleSend = useCallback(async () => {
    if (!inputValue.trim() || !address) return;

    try {
      await sendMessage(inputValue.trim());
      setInputValue("");
      setShowEmojiBar(false);
      inputRef.current?.focus();
      refetchMessages();
    } catch (error) {
      console.error("Failed to send message:", error);
    }
  }, [inputValue, address, sendMessage, refetchMessages]);

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
    async (messageId: string, emoji: string) => {
      if (!address) return;
      try {
        // Determine action based on current reaction state
        const message = messages.find((msg) => msg.id === messageId);
        const reactions = message?.reactions?.[emoji] as string[] | undefined;
        const hasReacted = reactions?.includes(address);
        const action = hasReacted ? "remove" : "add";

        await reactToMessage(messageId, emoji, action);
        refetchMessages();
      } catch (error) {
        console.error("Failed to react to message:", error);
      }
    },
    [address, messages, reactToMessage, refetchMessages],
  );

  // Insert emoji into input
  const handleEmojiSelect = useCallback((emoji: string) => {
    setInputValue((prev) => prev + emoji);
    setShowEmojiBar(false);
    inputRef.current?.focus();
  }, []);

  // Update member status when component mounts/unmounts
  useEffect(() => {
    if (address && syndicateId) {
      updateMemberStatus(true).catch(console.error);

      return () => {
        updateMemberStatus(false).catch(console.error);
      };
    }
  }, [address, syndicateId, updateMemberStatus]);

  // Refresh members list periodically
  useEffect(() => {
    if (!syndicateId) return;

    const interval = setInterval(() => {
      refetchMembers();
    }, 30000); // Every 30 seconds

    return () => clearInterval(interval);
  }, [syndicateId, refetchMembers]);

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
              online &bull; {totalMembers} members
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
            {isLoadingMessages ? (
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
                  disabled={!inputValue.trim() || isSendingMessage}
                  className="h-9 w-9 p-0 rounded-xl bg-linear-to-r from-emerald to-emerald-dark hover:from-emerald-light hover:to-emerald text-white shadow-md shadow-emerald/20 disabled:opacity-30 disabled:shadow-none transition-all"
                >
                  {isSendingMessage ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Send size={14} />
                  )}
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
                Members — {totalMembers}
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
