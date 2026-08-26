"use client";

import {
	AlertTriangle,
	ArrowDown,
	AtSign,
	Crown,
	Hash,
	Image as ImageIcon,
	Loader2,
	MessageCircle,
	MessagesSquare,
	Pin,
	PinOff,
	Send,
	SmilePlus,
	Wallet,
	X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ChatMember, ChatMessage } from "@/hooks/useChat";
import { useChat } from "@/hooks/useChat";
import { useAppKit, useAppKitAccount } from "@/lib/appkit-provider";

/* -------------------------------------------------------------------------- */
/*  Re-exports                                                                 */
/* -------------------------------------------------------------------------- */

export type { ChatMessage, ChatMember };

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface SyndicateChatProps {
	syndicateId: string;
	syndicateName: string;
	members?: ChatMember[];
	className?: string;
}

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

const QUICK_EMOJIS = ["👍", "🔥", "🚀", "💸", "🎯", "💰", "💪", "👏"] as const;

const REACTION_BUTTONS = ["👍", "🔥", "🚀", "💰", "💪", "🎯"] as const;

const MAX_MESSAGE_LENGTH = 500;

const SCROLL_THRESHOLD = 150;

/* -------------------------------------------------------------------------- */
/*  Utility: formatTimestamp                                                  */
/* -------------------------------------------------------------------------- */

function formatTimestamp(timestamp: number): string {
	const now = Date.now();
	const diff = now - timestamp;
	const minutes = Math.floor(diff / 60_000);
	const hours = Math.floor(diff / 3_600_000);

	if (minutes < 1) return "Just now";
	if (minutes < 60) return `${minutes}m ago`;
	if (hours < 24) return `${hours}h ago`;

	const date = new Date(timestamp);
	const month = (date.getMonth() + 1).toString().padStart(2, "0");
	const day = date.getDate().toString().padStart(2, "0");
	const hrs = date.getHours().toString().padStart(2, "0");
	const mins = date.getMinutes().toString().padStart(2, "0");
	return `${month}/${day} ${hrs}:${mins}`;
}

/* -------------------------------------------------------------------------- */
/*  Utility: deterministic avatar gradient                                    */
/* -------------------------------------------------------------------------- */

function avatarGradient(address: string): string {
	const hue = parseInt(address.slice(-6), 16) % 360;
	return `linear-gradient(135deg, hsl(${hue}, 70%, 50%), hsl(${(hue + 40) % 360}, 70%, 45%))`;
}

/* -------------------------------------------------------------------------- */
/*  Subcomponent: MessageAvatar                                               */
/* -------------------------------------------------------------------------- */

interface MessageAvatarProps {
	address: string;
	role?: "manager" | "member";
	size?: number;
}

function MessageAvatar({ address, role, size = 28 }: MessageAvatarProps) {
	return (
		<div className="relative shrink-0" aria-hidden="true">
			<div
				className="rounded-full flex items-center justify-center text-white font-bold text-[10px] select-none"
				style={{
					width: size,
					height: size,
					background: avatarGradient(address),
				}}
			>
				{address.slice(0, 2).toUpperCase()}
			</div>
			{role === "manager" && (
				<Crown
					size={Math.max(size / 3, 8)}
					className="absolute -top-1 -right-1 text-gold-300 bg-background/80 rounded-full p-0.5"
					aria-label="Manager"
				/>
			)}
		</div>
	);
}

/* -------------------------------------------------------------------------- */
/*  Subcomponent: OnlineDot                                                   */
/* -------------------------------------------------------------------------- */

interface OnlineDotProps {
	isOnline: boolean;
}

function OnlineDot({ isOnline }: OnlineDotProps) {
	if (!isOnline) {
		return (
			<div className="w-2 h-2 rounded-full bg-muted-foreground/30 shrink-0" />
		);
	}

	return (
		<div
			className="relative w-2 h-2 shrink-0"
			role="status"
			aria-label="Online"
		>
			<div className="absolute inset-0 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(0,255,159,0.9)] animate-ping opacity-60" />
			<div className="absolute inset-0 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(0,255,159,0.9)]" />
		</div>
	);
}

/* -------------------------------------------------------------------------- */
/*  Subcomponent: TypingIndicator                                             */
/* -------------------------------------------------------------------------- */

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
		<div className="px-4 py-1.5">
			<div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-foreground/3 border border-foreground/8">
				<div className="flex gap-1" aria-hidden="true">
					<div className="w-1.5 h-1.5 rounded-full bg-emerald-400/60 animate-bounce shadow-[0_0_8px_rgba(0,255,159,0.9)] animation-duration-[800ms]" />
					<div className="w-1.5 h-1.5 rounded-full bg-emerald-400/60 animate-bounce shadow-[0_0_8px_rgba(0,255,159,0.9)] animation-delay-[150ms] animation-duration-[800ms]" />
					<div className="w-1.5 h-1.5 rounded-full bg-emerald-400/60 animate-bounce shadow-[0_0_8px_rgba(0,255,159,0.9)] animation-delay-[300ms] animation-duration-[800ms]" />
				</div>
				<span className="text-xs text-muted-foreground">{text}</span>
			</div>
		</div>
	);
}

/* -------------------------------------------------------------------------- */
/*  Subcomponent: QuickEmojiBar                                               */
/* -------------------------------------------------------------------------- */

interface QuickEmojiBarProps {
	visible: boolean;
	onSelect: (emoji: string) => void;
}

function QuickEmojiBar({ visible, onSelect }: QuickEmojiBarProps) {
	if (!visible) return null;

	return (
		<div
			className="flex flex-wrap gap-0.5 p-1.5 rounded-xl bg-foreground/2 border border-foreground/6"
			role="toolbar"
			aria-label="Quick emoji reactions"
		>
			{QUICK_EMOJIS.map((emoji) => (
				<button
					key={emoji}
					type="button"
					onClick={() => onSelect(emoji)}
					className="w-8 h-8 rounded-lg flex items-center justify-center text-lg hover:bg-foreground/5 active:scale-95 transition-transform"
					aria-label={`Insert emoji ${emoji}`}
				>
					{emoji}
				</button>
			))}
		</div>
	);
}

/* -------------------------------------------------------------------------- */
/*  Subcomponent: ConnectWalletPrompt                                         */
/* -------------------------------------------------------------------------- */

function ConnectWalletPrompt() {
	const { open } = useAppKit();

	return (
		<div className="p-6 sm:p-8 text-center">
			<div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-foreground/3 border border-foreground/6 flex items-center justify-center mx-auto mb-4">
				<Wallet size={22} className="text-muted-foreground sm:size-6" />
			</div>
			<h3 className="text-sm sm:text-base font-bold text-foreground mb-2">
				Connect Wallet to Chat
			</h3>
			<p className="text-xs text-muted-foreground mb-6 max-w-sm mx-auto px-4">
				Connect your wallet to join the conversation, coordinate ticket
				purchases, and discuss strategies with syndicate members.
			</p>
			<Button
				onClick={() => open()}
				className="h-10 px-6 text-xs font-bold bg-linear-to-r from-emerald-400 to-emerald-600 hover:from-emerald-300 hover:to-emerald-500 text-white rounded-xl shadow-lg shadow-emerald-500/20"
			>
				<Wallet size={14} aria-hidden="true" />
				Connect Wallet
			</Button>
		</div>
	);
}

/* -------------------------------------------------------------------------- */
/*  Subcomponent: ErrorBanner                                                 */
/* -------------------------------------------------------------------------- */

interface ErrorBannerProps {
	message: string;
	onRetry?: () => void;
}

function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
	return (
		<div className="flex flex-col items-center justify-center py-8 px-4 text-center">
			<div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-3">
				<AlertTriangle size={18} className="text-red-400" />
			</div>
			<p className="text-xs text-muted-foreground mb-3 max-w-xs">{message}</p>
			{onRetry && (
				<button
					type="button"
					onClick={onRetry}
					className="text-xs font-medium text-emerald-300 hover:text-emerald-300 transition-colors"
				>
					Try again
				</button>
			)}
		</div>
	);
}

/* -------------------------------------------------------------------------- */
/*  Subcomponent: LoadingSkeleton                                             */
/* -------------------------------------------------------------------------- */

function LoadingSkeleton() {
	return (
		<div
			className="px-4 py-6 space-y-5"
			role="status"
			aria-label="Loading messages"
		>
			{[80, 60, 75, 50, 70].map((width, i) => (
				<div
					key={`skeleton-${width}`}
					className={`flex gap-3 ${i % 2 === 1 ? "justify-end" : ""}`}
				>
					{i % 2 === 0 && (
						<div className="w-7 h-7 rounded-full bg-foreground/5 animate-pulse shrink-0" />
					)}
					<div
						className="rounded-2xl bg-foreground/3 animate-pulse"
						style={{ width: `${width}%`, height: i === 2 ? 52 : 36 }}
					/>
				</div>
			))}
		</div>
	);
}

/* -------------------------------------------------------------------------- */
/*  Subcomponent: EmptyState                                                  */
/* -------------------------------------------------------------------------- */

function EmptyState() {
	return (
		<div className="flex flex-col items-center justify-center py-12 px-6 text-center">
			<div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-foreground/3 border border-foreground/6 flex items-center justify-center mb-4">
				<MessagesSquare
					size={22}
					className="text-muted-foreground/60 sm:size-6"
				/>
			</div>
			<p className="text-sm font-medium text-foreground mb-1">
				No messages yet
			</p>
			<p className="text-xs text-muted-foreground max-w-xs">
				Be the first to start the conversation! Coordinate ticket purchases and
				discuss strategies with syndicate members.
			</p>
		</div>
	);
}

/* -------------------------------------------------------------------------- */
/*  Subcomponent: PinnedMessageBanner                                         */
/* -------------------------------------------------------------------------- */

interface PinnedMessageBannerProps {
	message: ChatMessage;
	onClick: () => void;
	onUnpin: () => void;
	isCurrentUserManager?: boolean;
}

function PinnedMessageBanner({
	message,
	onClick,
	onUnpin,
	isCurrentUserManager,
}: PinnedMessageBannerProps) {
	const preview =
		message.text.length > 80 ? `${message.text.slice(0, 80)}...` : message.text;

	return (
		<div className="shrink-0 px-3 py-1.5 border-b border-foreground/6 bg-gold-400/5">
			<div className="flex items-center gap-2 min-w-0">
				<Pin size={12} className="text-gold-300 shrink-0" aria-hidden="true" />
				<button
					type="button"
					onClick={onClick}
					className="flex-1 min-w-0 text-left text-[11px] text-muted-foreground hover:text-foreground truncate transition-colors"
					aria-label="Scroll to pinned message"
				>
					<span className="font-semibold text-gold-300/80">Pinned:</span>{" "}
					{preview}
				</button>
				{isCurrentUserManager && (
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onUnpin();
						}}
						className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors shrink-0"
						aria-label="Unpin message"
					>
						<PinOff size={12} />
					</button>
				)}
			</div>
		</div>
	);
}

/* -------------------------------------------------------------------------- */
/*  Subcomponent: ChatBubble                                                  */
/* -------------------------------------------------------------------------- */

interface ChatBubbleProps {
	message: ChatMessage;
	isOwn: boolean;
	currentUser?: string;
	onReact: (messageId: string, emoji: string) => void;
	onTogglePin?: (messageId: string, currentlyPinned: boolean) => void;
}

function ChatBubble({
	message,
	isOwn,
	currentUser,
	onReact,
	onTogglePin,
}: ChatBubbleProps) {
	const [showActions, setShowActions] = useState(false);
	const isAnnouncement = message.type === "announcement";
	const isSystem = message.type === "system";

	// System messages use a centered, simplified layout
	if (isSystem) {
		return (
			<div className="px-4 py-1 flex justify-center">
				<div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-foreground/3 border border-foreground/6 text-[11px] text-muted-foreground">
					<MessageCircle size={11} className="shrink-0" aria-hidden="true" />
					<span>{message.text}</span>
				</div>
			</div>
		);
	}

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: hover container that reveals interactive action buttons
		<div
			className={`group px-3 sm:px-4 py-0.5 ${isOwn ? "flex justify-end" : "flex gap-2 sm:gap-3"}`}
			onMouseEnter={() => setShowActions(true)}
			onMouseLeave={() => setShowActions(false)}
			onTouchStart={() => setShowActions(true)}
		>
			{/* Avatar for other users */}
			{!isOwn && (
				<MessageAvatar address={message.sender} role={message.role} size={28} />
			)}

			<div
				className={`flex flex-col max-w-[85%] sm:max-w-[75%] ${
					isOwn ? "items-end" : "items-start"
				}`}
			>
				{/* Sender header */}
				{!isOwn && (
					<div className="flex items-center gap-1.5 mb-1 ml-1 flex-wrap">
						<span className="text-[11px] font-mono text-muted-foreground">
							{message.senderShort}
						</span>
						{message.role === "manager" && (
							<span className="px-1.5 py-px rounded text-[9px] bg-gold-400/10 text-gold-300 font-semibold uppercase tracking-wide">
								Manager
							</span>
						)}
					</div>
				)}

				{/* Bubble */}
				<div
					className={`relative rounded-2xl px-3.5 py-2.5 ${
						isAnnouncement
							? "bg-gold-400/10 border border-gold-500/20"
							: isOwn
								? "bg-emerald-400/10 border border-emerald-500/20"
								: "bg-foreground/3 border border-foreground/8"
					}`}
				>
					{/* Announcement badge */}
					{isAnnouncement && (
						<div className="flex items-center gap-1.5 mb-1.5">
							<Pin
								size={10}
								className="text-gold-300 shrink-0"
								aria-hidden="true"
							/>
							<span className="text-[10px] font-semibold text-gold-300 uppercase tracking-wide">
								Announcement
							</span>
						</div>
					)}

					{/* Message text */}
					<p className="text-sm leading-relaxed whitespace-pre-wrap wrap-break-word">
						{message.text}
					</p>

					{/* Reactions pills */}
					{message.reactions && Object.keys(message.reactions).length > 0 && (
						<fieldset
							className="flex flex-wrap gap-1 mt-2"
							aria-label="Reactions"
						>
							{Object.entries(message.reactions).map(([emoji, reactors]) => {
								const reactorsArray = reactors as string[];
								const hasReacted = currentUser
									? reactorsArray.includes(currentUser)
									: false;

								return (
									<button
										key={emoji}
										type="button"
										onClick={() => onReact(message.id, emoji)}
										className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs border transition-all active:scale-95 ${
											hasReacted
												? "bg-emerald-400/20 border-emerald-500/40 text-emerald-300"
												: "bg-foreground/5 border-foreground/10 text-muted-foreground hover:border-foreground/20"
										}`}
										aria-label={`${emoji} reaction: ${reactorsArray.length} ${reactorsArray.length === 1 ? "person" : "people"}`}
									>
										<span aria-hidden="true">{emoji}</span>
										<span className="text-[10px]">{reactorsArray.length}</span>
									</button>
								);
							})}
						</fieldset>
					)}
				</div>

				{/* Timestamp + action buttons */}
				<div className="flex items-center gap-1 mt-0.5 ml-1">
					<span className="text-[10px] text-muted-foreground/50 select-none">
						{formatTimestamp(message.timestamp)}
					</span>

					{/* Quick reaction buttons (desktop hover / mobile touch) */}
					<div
						className={`flex items-center gap-0.5 transition-opacity duration-150 ${
							showActions ? "opacity-100" : "opacity-0"
						}`}
					>
						{REACTION_BUTTONS.map((emoji) => (
							<button
								key={emoji}
								type="button"
								onClick={() => onReact(message.id, emoji)}
								className="p-0.5 text-[13px] rounded hover:bg-foreground/5 transition-colors"
								aria-label={`React with ${emoji}`}
							>
								{emoji}
							</button>
						))}

						{/* Pin toggle for non-system messages */}
						{onTogglePin && (
							<button
								type="button"
								onClick={() => onTogglePin(message.id, !!message.isPinned)}
								className={`p-0.5 rounded transition-colors ${
									message.isPinned
										? "text-gold-300"
										: "text-muted-foreground/50 hover:text-foreground"
								}`}
								aria-label={message.isPinned ? "Unpin message" : "Pin message"}
							>
								<Pin size={11} />
							</button>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}

/* -------------------------------------------------------------------------- */
/*  Subcomponent: MembersSidebar / MembersDrawer                              */
/* -------------------------------------------------------------------------- */

interface MembersListProps {
	members: ChatMember[];
	totalMembers: number;
}

function MembersList({ members, totalMembers }: MembersListProps) {
	const onlineMembers = members.filter((m) => m.isOnline);
	const offlineMembers = members.filter((m) => !m.isOnline);

	return (
		<div className="p-3">
			<h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
				Members — {totalMembers}
			</h4>

			{/* Demo data notice: members shown here are mock/preview data */}
			<div className="flex items-start gap-1.5 p-2 mb-3 rounded-lg bg-gold-400/8 border border-gold-500/20">
				<AlertTriangle
					size={10}
					className="text-gold-300 shrink-0 mt-0.5"
					aria-hidden="true"
				/>
				<p className="text-[9px] leading-relaxed text-muted-foreground">
					<span className="font-bold text-gold-300 uppercase tracking-wider">
						Demo data
					</span>{" "}
					— member list is a preview, not live on-chain data.
				</p>
			</div>

			{/* Online members */}
			{onlineMembers.length > 0 && (
				<div className="mb-4">
					<p className="text-[10px] text-emerald-300/70 font-semibold uppercase tracking-wider mb-2">
						Online — {onlineMembers.length}
					</p>
					<div className="space-y-0.5">
						{onlineMembers.map((member) => (
							<div
								key={member.address}
								className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-foreground/4 transition-colors"
							>
								<OnlineDot isOnline />
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-1.5">
										<span className="text-[11px] font-mono text-muted-foreground truncate">
											{member.addressShort}
										</span>
										{member.role === "manager" && (
											<span
												className="px-1 py-px rounded text-[8px] bg-gold-400/10 text-gold-300/70 font-semibold uppercase tracking-wide"
												aria-label="Demo manager"
											>
												demo
											</span>
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

			{/* Offline members */}
			{offlineMembers.length > 0 && (
				<div>
					<p className="text-[10px] text-muted-foreground/50 font-semibold uppercase tracking-wider mb-2">
						Offline — {offlineMembers.length}
					</p>
					<div className="space-y-0.5">
						{offlineMembers.map((member) => (
							<div
								key={member.address}
								className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-foreground/4 transition-colors opacity-50"
							>
								<OnlineDot isOnline={false} />
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-1.5">
										<span className="text-[11px] font-mono text-muted-foreground truncate">
											{member.addressShort}
										</span>
										{member.role === "manager" && (
											<span
												className="px-1 py-px rounded text-[8px] bg-gold-400/10 text-gold-300/70 font-semibold uppercase tracking-wide"
												aria-label="Demo manager"
											>
												demo
											</span>
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

			{members.length === 0 && (
				<p className="text-[11px] text-muted-foreground/60 text-center py-4">
					No members to display.
				</p>
			)}
		</div>
	);
}

/* -------------------------------------------------------------------------- */
/*  Main Component                                                             */
/* -------------------------------------------------------------------------- */

export default function SyndicateChat({
	syndicateId,
	syndicateName,
	members: _membersProp,
	className = "",
}: SyndicateChatProps) {
	const { address, isConnected } = useAppKitAccount();
	const {
		messages,
		members,
		onlineCount,
		totalMembers,
		pinnedMessages,
		isLoadingMessages,
		isSendingMessage,
		messagesError,
		sendMessage,
		reactToMessage,
		updateMemberStatus,
		togglePinMessage,
		refetchMessages,
		refetchMembers,
		refetchPinned,
	} = useChat({
		syndicateId,
		sender: address,
		pollInterval: 10_000,
		limit: 50,
	});

	// UI state
	const [inputValue, setInputValue] = useState("");
	const [showEmojiBar, setShowEmojiBar] = useState(false);
	const [showScrollButton, setShowScrollButton] = useState(false);
	const [showMembers, setShowMembers] = useState(false);
	const [showPinnedBanner, setShowPinnedBanner] = useState(true);
	const [isAtBottom, setIsAtBottom] = useState(true);
	const [sendError, setSendError] = useState<string | null>(null);

	// SECURITY (review C2): manager status cannot be verified client-side —
	// member roles in the list are mock data, and pinning is now admin-only
	// server-side (CHAT_ADMIN_PUBKEYS). All pin controls are hidden; the
	// pinned-message banner is read-only for everyone.

	// Refs
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const inputWrapperRef = useRef<HTMLDivElement>(null);

	/* ---------------------------------------------------------------------- */
	/*  Scroll helpers                                                         */
	/* ---------------------------------------------------------------------- */

	const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
		messagesEndRef.current?.scrollIntoView({ behavior });
	}, []);

	const scrollToMessage = useCallback((messageId: string) => {
		const el = document.getElementById(`chat-msg-${messageId}`);
		el?.scrollIntoView({ behavior: "smooth", block: "center" });
	}, []);

	// Track scroll position
	const handleScroll = useCallback(() => {
		const el = scrollContainerRef.current;
		if (!el) return;
		const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
		setShowScrollButton(distanceFromBottom > SCROLL_THRESHOLD);
		setIsAtBottom(distanceFromBottom <= SCROLL_THRESHOLD);
	}, []);

	// Scroll to bottom on initial load and when new own message arrives
	useEffect(() => {
		if (isAtBottom || messages.length === 0) {
			scrollToBottom("instant");
		}
	}, [messages.length, isAtBottom, scrollToBottom]);

	// Scroll to bottom when user sends a message
	useEffect(() => {
		if (messages.length > 0) {
			const lastMsg = messages[messages.length - 1];
			if (lastMsg && lastMsg.sender === address) {
				scrollToBottom("smooth");
				setIsAtBottom(true);
			}
		}
	}, [messages, address, scrollToBottom]);

	/* ---------------------------------------------------------------------- */
	/*  Mobile keyboard handling (visualViewport API)                         */
	/* ---------------------------------------------------------------------- */

	useEffect(() => {
		if (typeof window === "undefined" || !window.visualViewport) return;

		const viewport = window.visualViewport;
		let initialHeight = viewport.height;

		const handleResize = () => {
			const currentHeight = viewport.height;
			const keyboardOpen = currentHeight < initialHeight - 100;
			const offset = initialHeight - currentHeight;

			if (scrollContainerRef.current) {
				if (keyboardOpen) {
					scrollContainerRef.current.style.paddingBottom = `${offset}px`;
				} else {
					scrollContainerRef.current.style.paddingBottom = "0px";
				}
			}

			// Also store the updated initial height on orientation changes
			if (!keyboardOpen) {
				initialHeight = currentHeight;
			}
		};

		viewport.addEventListener("resize", handleResize);
		return () => viewport.removeEventListener("resize", handleResize);
	}, []);

	/* ---------------------------------------------------------------------- */
	/*  Network status: update member presence                                */
	/* ---------------------------------------------------------------------- */

	useEffect(() => {
		if (!address || !syndicateId) return;

		updateMemberStatus(true).catch(console.error);

		const handleBeforeUnload = () => {
			// Use sendBeacon for reliable cleanup
			navigator.sendBeacon?.(
				"/api/members/offline",
				JSON.stringify({ address, syndicateId }),
			);
		};

		window.addEventListener("beforeunload", handleBeforeUnload);

		return () => {
			updateMemberStatus(false).catch(console.error);
			window.removeEventListener("beforeunload", handleBeforeUnload);
		};
	}, [address, syndicateId, updateMemberStatus]);

	// Periodic member list refresh
	useEffect(() => {
		if (!syndicateId) return;

		const interval = setInterval(() => {
			refetchMembers();
		}, 30_000);

		return () => clearInterval(interval);
	}, [syndicateId, refetchMembers]);

	// Close members panel on escape
	useEffect(() => {
		if (!showMembers) return;
		const handleKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setShowMembers(false);
		};
		window.addEventListener("keydown", handleKey);
		return () => window.removeEventListener("keydown", handleKey);
	}, [showMembers]);

	/* ---------------------------------------------------------------------- */
	/*  Message actions                                                        */
	/* ---------------------------------------------------------------------- */

	const handleSend = useCallback(async () => {
		const trimmed = inputValue.trim();
		if (!trimmed || !address || isSendingMessage) return;

		setSendError(null);

		try {
			await sendMessage(trimmed);
			setInputValue("");
			setShowEmojiBar(false);
			inputRef.current?.focus();
		} catch (error) {
			const msg =
				error instanceof Error ? error.message : "Failed to send message";
			setSendError(msg);
			setTimeout(() => setSendError(null), 4_000);
		}
	}, [inputValue, address, isSendingMessage, sendMessage]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLInputElement>) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				handleSend();
			}
		},
		[handleSend],
	);

	const handleReact = useCallback(
		async (messageId: string, emoji: string) => {
			if (!address) return;

			try {
				const message = messages.find((m) => m.id === messageId);
				const reactors = message?.reactions?.[emoji];
				const hasReacted = reactors?.includes(address);
				const action: "add" | "remove" = hasReacted ? "remove" : "add";

				await reactToMessage(messageId, emoji, action);
			} catch (error) {
				console.error("Failed to react to message:", error);
			}
		},
		[address, messages, reactToMessage],
	);

	const handleEmojiSelect = useCallback((emoji: string) => {
		setInputValue((prev) => prev + emoji);
		setShowEmojiBar(false);
		inputRef.current?.focus();
	}, []);

	const handleTogglePin = useCallback(
		async (messageId: string, currentlyPinned: boolean) => {
			try {
				await togglePinMessage(messageId, !currentlyPinned);
				refetchPinned();
			} catch (error) {
				console.error("Failed to toggle pin:", error);
			}
		},
		[togglePinMessage, refetchPinned],
	);

	/* ---------------------------------------------------------------------- */
	/*  Render                                                                 */
	/* ---------------------------------------------------------------------- */

	return (
		<section
			className={`flex flex-col h-full bg-background ${className}`}
			aria-label={`Chat for ${syndicateName}`}
		>
			{/* ================================================================ */}
			{/*  Pinned message banner                                           */}
			{/* ================================================================ */}
			{showPinnedBanner && pinnedMessages.length > 0 && (
				<PinnedMessageBanner
					message={pinnedMessages[0]}
					onClick={() => {
						scrollToMessage(pinnedMessages[0].id);
						setShowPinnedBanner(false);
						// Re-show after delay so user can scroll back up and see it
						setTimeout(() => setShowPinnedBanner(true), 10_000);
					}}
					onUnpin={() => handleTogglePin(pinnedMessages[0].id, true)}
					isCurrentUserManager={false}
				/>
			)}

			{/* ================================================================ */}
			{/*  Chat header                                                     */}
			{/* ================================================================ */}
			<div className="shrink-0 flex items-center justify-between gap-2 px-3 sm:px-4 py-2.5 sm:py-3 border-b border-foreground/6 bg-foreground/2">
				<div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
					<div className="p-1.5 rounded-lg bg-emerald-400/10 border border-emerald-500/15 shrink-0">
						<MessageCircle size={14} className="text-emerald-300 sm:size-4" />
					</div>
					<div className="min-w-0">
						<div className="flex items-center gap-1.5">
							<Hash
								size={11}
								className="text-muted-foreground shrink-0"
								aria-hidden="true"
							/>
							<h3 className="text-xs sm:text-sm font-bold text-foreground truncate">
								{syndicateName}
							</h3>
						</div>
						<p className="text-[10px] text-muted-foreground">
							<span className="text-emerald-300 font-semibold">
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
					className={`shrink-0 p-2 rounded-lg transition-colors ${
						showMembers
							? "bg-emerald-400/10 text-emerald-300 border border-emerald-500/20"
							: "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
					}`}
					aria-label={showMembers ? "Hide members list" : "Show members list"}
					aria-expanded={showMembers}
				>
					<AtSign size={15} className="sm:size-4" />
				</button>
			</div>

			{/* ================================================================ */}
			{/*  Body: messages + optional members sidebar                       */}
			{/* ================================================================ */}
			<div className="flex flex-1 min-h-0 relative">
				{/* Messages column */}
				<div className="flex-1 flex flex-col min-w-0 min-h-0">
					{/* Message list */}
					<div
						ref={scrollContainerRef}
						onScroll={handleScroll}
						className="flex-1 overflow-y-auto overflow-x-hidden py-3 space-y-0.5 scroll-smooth overscroll-contain transition-[padding-bottom] duration-200"
						role="log"
						aria-live="polite"
						aria-label="Chat messages"
					>
						{/* Loading state */}
						{isLoadingMessages && <LoadingSkeleton />}

						{/* Error state */}
						{!isLoadingMessages && messagesError && (
							<ErrorBanner
								message={messagesError.message || "Failed to load messages."}
								onRetry={() => refetchMessages()}
							/>
						)}

						{/* Empty state */}
						{!isLoadingMessages && !messagesError && messages.length === 0 && (
							<EmptyState />
						)}

						{/* Messages */}
						{!isLoadingMessages &&
							messages.map((msg) => (
								<div key={msg.id} id={`chat-msg-${msg.id}`}>
									<ChatBubble
										message={msg}
										isOwn={msg.sender === address}
										currentUser={address}
										onReact={handleReact}
										// SECURITY (review C2): pinning is restricted server-side
										// to the CHAT_ADMIN_PUBKEYS allow-list, which the client
										// cannot verify reliably — hide the pin button entirely
										// for now. onTogglePin is intentionally not passed.
										onTogglePin={undefined}
									/>
								</div>
							))}

						{/* Typing indicator */}
						{/* Note: typingUsers is empty for now; will be integrated with real-time events */}
						<TypingIndicator names={[]} />

						{/* Scroll anchor */}
						<div ref={messagesEndRef} className="h-px" />
					</div>

					{/* Scroll-to-bottom button */}
					{showScrollButton && (
						<button
							type="button"
							onClick={() => {
								scrollToBottom("smooth");
								setIsAtBottom(true);
							}}
							className="absolute bottom-18 right-4 z-10 w-8 h-8 rounded-full glass-strong border border-emerald-500/20 flex items-center justify-center text-emerald-300 hover:bg-emerald-400/10 transition-all shadow-lg shadow-black/20"
							aria-label="Scroll to latest messages"
						>
							<ArrowDown size={14} />
						</button>
					)}

					{/* ============================================================ */}
					{/*  Input area                                                   */}
					{/* ============================================================ */}
					{!isConnected ? (
						<div className="shrink-0 border-t border-foreground/6">
							<ConnectWalletPrompt />
						</div>
					) : (
						<div
							className="shrink-0 border-t border-foreground/6 bg-background"
							ref={inputWrapperRef}
						>
							<div className="p-2.5 sm:p-3 space-y-2">
								{/* Send error toast */}
								{sendError && (
									<div className="text-center">
										<span className="inline-block text-[10px] text-red-400 bg-red-500/5 border border-red-500/10 px-2 py-1 rounded-lg">
											{sendError}
										</span>
									</div>
								)}

								{/* Quick emoji bar */}
								<QuickEmojiBar
									visible={showEmojiBar}
									onSelect={handleEmojiSelect}
								/>

								{/* Input row */}
								<div className="flex items-end gap-1.5 sm:gap-2">
									{/* Emoji toggle */}
									<button
										type="button"
										onClick={() => setShowEmojiBar((v) => !v)}
										className={`shrink-0 p-2 rounded-lg transition-colors ${
											showEmojiBar
												? "bg-emerald-400/10 text-emerald-300"
												: "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
										}`}
										aria-label={
											showEmojiBar ? "Hide emoji picker" : "Show emoji picker"
										}
										aria-expanded={showEmojiBar}
									>
										<SmilePlus size={15} className="sm:size-4" />
									</button>

									{/* Attachment placeholder */}
									<button
										type="button"
										className="shrink-0 p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
										aria-label="Attach image (coming soon)"
										disabled
									>
										<ImageIcon size={15} className="sm:size-4" />
									</button>

									{/* Input field */}
									<div className="flex-1 min-w-0 relative">
										<input
											ref={inputRef}
											type="text"
											value={inputValue}
											onChange={(e) => setInputValue(e.target.value)}
											onKeyDown={handleKeyDown}
											placeholder="Type a message..."
											inputMode="text"
											enterKeyHint="send"
											autoComplete="off"
											maxLength={MAX_MESSAGE_LENGTH}
											aria-label="Chat message"
											className="w-full h-9 sm:h-10 px-3.5 rounded-xl bg-foreground/4 border border-foreground/8 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-emerald-500/30 focus:ring-1 focus:ring-emerald-500/15 transition-colors"
										/>
									</div>

									{/* Send button */}
									<Button
										onClick={handleSend}
										disabled={!inputValue.trim() || isSendingMessage}
										size="icon-sm"
										aria-label="Send message"
										className="shrink-0 rounded-xl bg-linear-to-r from-emerald-400 to-emerald-600 hover:from-emerald-300 hover:to-emerald-500 text-white shadow-md shadow-emerald-500/20 disabled:opacity-30 disabled:shadow-none transition-all h-9 w-9 sm:h-10 sm:w-10"
									>
										{isSendingMessage ? (
											<Loader2 size={14} className="animate-spin sm:size-4" />
										) : (
											<Send size={14} className="sm:size-4" />
										)}
									</Button>
								</div>

								{/* Character count */}
								{inputValue.length > 350 && (
									<div className="text-right">
										<span
											className={`text-[10px] transition-colors ${
												inputValue.length >= MAX_MESSAGE_LENGTH
													? "text-red-400 font-medium"
													: "text-muted-foreground/60"
											}`}
										>
											{inputValue.length}/{MAX_MESSAGE_LENGTH}
										</span>
									</div>
								)}
							</div>
						</div>
					)}
				</div>

				{/* ============================================================ */}
				{/*  Desktop members sidebar                                      */}
				{/* ============================================================ */}
				{showMembers && (
					<aside
						className="hidden md:block w-56 lg:w-60 shrink-0 border-l border-foreground/6 bg-foreground/1 overflow-y-auto"
						aria-label="Members list"
					>
						<MembersList members={members} totalMembers={totalMembers} />
					</aside>
				)}
			</div>

			{/* ================================================================ */}
			{/*  Mobile members drawer                                           */}
			{/* ================================================================ */}
			{/* Overlay */}
			{showMembers && (
				<div className="md:hidden fixed inset-0 z-40" aria-hidden="true">
					{/* Backdrop */}
					<button
						type="button"
						className="absolute inset-0 bg-black/50 backdrop-blur-sm border-none cursor-pointer"
						onClick={() => setShowMembers(false)}
						aria-label="Close members panel"
					/>

					{/* Drawer panel */}
					<div
						className="absolute right-0 top-0 bottom-0 w-64 max-w-[80vw] bg-background border-l border-foreground/6 shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-200"
						role="dialog"
						aria-modal="true"
						aria-label="Members list"
					>
						<div className="flex items-center justify-between px-3 py-3 border-b border-foreground/6">
							<h3 className="text-xs font-bold text-foreground">Members</h3>
							<button
								type="button"
								onClick={() => setShowMembers(false)}
								className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
								aria-label="Close members list"
							>
								<X size={14} />
							</button>
						</div>
						<MembersList members={members} totalMembers={totalMembers} />
					</div>
				</div>
			)}
		</section>
	);
}
