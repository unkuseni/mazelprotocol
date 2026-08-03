/**
 * MazelProtocol Integration Hook
 *
 * This is the PRIMARY integration hook for the frontend. It bundles
 * wallet connection, program clients, lottery state, React Query hooks,
 * and transaction builders into a single easy-to-use hook.
 *
 * Usage:
 * ```tsx
 * function MyComponent() {
 *   const mazel = useMazelProtocol();
 *
 *   // Lottery state
 *   const { mainState, qpState, isLoading } = mazel.useAllStates();
 *
 *   // Buy a ticket
 *   await mazel.buyMainTicket({ numbers: [1,2,3,4,5,6] });
 *
 *   // Claim a prize
 *   await mazel.claimMainPrize(drawId, ticketIndex);
 * }
 * ```
 */

import { AnchorProvider } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { useMemo } from "react";
// Connection
import { getConnection } from "./connection";
// React Query hooks
import {
	type MainLotteryProgram,
	prefetchAllLotteryData,
	type QuickPickProgram,
	useAllLotteryStates,
	useLotteryQueryClient,
	useMainDrawResult,
	useMainLotteryState,
	useQuickPickDrawResult,
	useQuickPickState,
	useUserMainTicketsForDraw,
	useUserQuickPickTicketsForDraw,
} from "./hooks";
// PDA
import { mainPDAs, quickPickPDAs, USDC_MINT } from "./pda";
// Provider
import { useReadOnlyAnchorProvider } from "./provider";
// Transaction builders
import {
	type BuyMainTicketParams,
	type BuyQuickPickTicketParams,
	type BuyTicketOptions,
	buyMainTicket,
	buyQuickPickTicket,
	buyQuickPickTicketsBulk,
	claimMainPrize,
	claimQuickPickPrize,
	ensureUserStatsInitialized,
} from "./transactions";
// Wallet
import { useConnectedWallet, useWallet } from "./wallet";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** State returned by the integration hook */
export interface MazelProtocolState {
	/** Whether the wallet is connected */
	isConnected: boolean;
	/** User's public key (null if not connected) */
	publicKey: PublicKey | null;
	/** User's wallet address string */
	address: string | undefined;

	/** Whether user stats are initialized */
	userStatsInitialized: boolean;
	/** Whether user meets the $50 Quick Pick gate */
	meetsQuickPickGate: boolean;

	/** Read-only main lottery program client (async — lazily imports the IDL) */
	mainProgram: Promise<MainLotteryProgram | null>;
	/** Read-only Quick Pick program client (async — lazily imports the IDL) */
	qpProgram: Promise<QuickPickProgram | null>;

	/** Main lottery state PDA */
	mainStatePda: PublicKey;
	/** Quick Pick state PDA */
	qpStatePda: PublicKey;
	/** Prize pool USDC PDA */
	prizePoolUsdc: PublicKey;
}

/** Actions returned by the integration hook */
export interface MazelProtocolActions {
	/** Connect wallet */
	connect: () => void;
	/** Initialize user stats (one-time setup) */
	initUserStats: () => Promise<{ existed: boolean; signature?: string }>;
	/** Get or derive user's USDC token account */
	getUserUsdcAccount: () => PublicKey;

	// Ticket purchasing
	/** Buy a main lottery ticket (6/46) */
	buyMainTicket: (params: BuyMainTicketParams) => Promise<string>;
	/** Buy a Quick Pick ticket (5/35) */
	buyQuickPickTicket: (params: BuyQuickPickTicketParams) => Promise<string>;
	/** Buy multiple Quick Pick tickets in one tx */
	buyQuickPickTicketsBulk: (
		tickets: BuyQuickPickTicketParams[],
	) => Promise<string>;

	// Prize claiming
	/** Claim a main lottery prize */
	claimMainPrize: (drawId: number, ticketIndex: number) => Promise<string>;
	/** Claim a Quick Pick prize */
	claimQuickPickPrize: (drawId: number, ticketIndex: number) => Promise<string>;

	// Query invalidation
	/** Refresh all lottery states */
	refreshAll: () => void;
	/** Refresh main lottery state only */
	refreshMain: () => void;
	/** Refresh Quick Pick state only */
	refreshQuickPick: () => void;

	// Prefetching
	/** Prefetch all lottery data */
	prefetch: () => Promise<void>;
}

/** Query hooks exposed by the integration */
export interface MazelProtocolQueries {
	useAllStates: typeof useAllLotteryStates;
	useMainState: typeof useMainLotteryState;
	useQuickPickState: typeof useQuickPickState;
	useMainDraw: typeof useMainDrawResult;
	useQuickPickDraw: typeof useQuickPickDrawResult;
	useUserMainTickets: typeof useUserMainTicketsForDraw;
	useUserQuickPickTickets: typeof useUserQuickPickTicketsForDraw;
}

/** Complete integration return type */
export interface MazelProtocol {
	state: MazelProtocolState;
	actions: MazelProtocolActions;
	queries: MazelProtocolQueries;
}

// ---------------------------------------------------------------------------
// Hook implementation
// ---------------------------------------------------------------------------

/**
 * Primary integration hook for MazelProtocol.
 *
 * Provides EVERYTHING a component needs:
 * - Wallet state (connected, publicKey)
 * - Program clients (read-only + with signer)
 * - Lottery state queries (React Query)
 * - Transaction actions (buy, claim, init)
 * - Query invalidation (refresh, prefetch)
 *
 * @example
 * ```tsx
 * function LotteryPage() {
 *   const mazel = useMazelProtocol();
 *   const { data: mainState } = mazel.queries.useMainState();
 *
 *   const handleBuy = async () => {
 *     if (!mazel.state.isConnected) {
 *       mazel.actions.connect();
 *       return;
 *     }
 *     await mazel.actions.buyMainTicket({ numbers: [1,2,3,4,5,6] });
 *   };
 *
 *   return (
 *     <div>
 *       <p>Jackpot: ${mainState?.jackpot_balance}</p>
 *       <button onClick={handleBuy}>Buy Ticket</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useMazelProtocol(): MazelProtocol {
	const wallet = useWallet();
	const connectedWallet = useConnectedWallet();

	// Program clients
	const { mainLotteryProgram: mainProgram, quickPickProgram: qpProgram } =
		useReadOnlyAnchorProvider();

	// Query invalidation
	const {
		invalidateAll: refreshAll,
		invalidateMainLottery: refreshMain,
		invalidateQuickPick: refreshQuickPick,
	} = useLotteryQueryClient();

	// Query client for prefetching
	const { queryClient } = useLotteryQueryClient();

	// -------------------------------------------------------------------------
	// State
	// -------------------------------------------------------------------------

	const state: MazelProtocolState = useMemo(
		() => ({
			isConnected: wallet.isConnected,
			publicKey: wallet.publicKey,
			address: wallet.address,

			// These are lazy-loaded when needed
			userStatsInitialized: false, // Set after init check
			meetsQuickPickGate: false, // Set after gate check

			mainProgram,
			qpProgram,

			mainStatePda: mainPDAs.lotteryState,
			qpStatePda: quickPickPDAs.quickPickState,
			prizePoolUsdc: mainPDAs.prizePoolUsdc,
		}),
		[
			wallet.isConnected,
			wallet.publicKey,
			wallet.address,
			mainProgram,
			qpProgram,
		],
	);

	// -------------------------------------------------------------------------
	// Actions
	// -------------------------------------------------------------------------

	const actions: MazelProtocolActions = useMemo(() => {
		/** Get or derive the user's USDC associated token account */
		const getUserUsdcAccount = (): PublicKey => {
			if (!wallet.publicKey) {
				throw new Error("Wallet not connected");
			}
			const TOKEN_PROGRAM_ID = new PublicKey(
				"TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
			);
			const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
				"ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
			);
			const [ata] = PublicKey.findProgramAddressSync(
				[
					wallet.publicKey.toBuffer(),
					TOKEN_PROGRAM_ID.toBuffer(),
					USDC_MINT.toBuffer(),
				],
				ASSOCIATED_TOKEN_PROGRAM_ID,
			);
			return ata;
		};

		/** Create an AnchorProvider from the connected wallet */
		const getProvider = (): AnchorProvider => {
			if (!wallet.isConnected || !wallet.publicKey) {
				throw new Error("Wallet must be connected for this action");
			}
			return new AnchorProvider(
				getConnection(),
				{
					publicKey: wallet.publicKey,
					signTransaction: connectedWallet.signTransaction,
					signAllTransactions: connectedWallet.signAllTransactions,
				},
				{ commitment: "confirmed" },
			);
		};

		return {
			connect: wallet.connect,

			initUserStats: async () => {
				const provider = getProvider();
				return ensureUserStatsInitialized(provider);
			},

			getUserUsdcAccount,

			// Ticket purchasing
			buyMainTicket: async (params: BuyMainTicketParams) => {
				const provider = getProvider();
				const playerUsdc = getUserUsdcAccount();
				return buyMainTicket(provider, params, playerUsdc);
			},

			buyQuickPickTicket: async (params: BuyQuickPickTicketParams) => {
				const provider = getProvider();
				const userStats = deriveUserStatsPDA(wallet.publicKey!);
				const playerUsdc = getUserUsdcAccount();
				return buyQuickPickTicket(provider, params, userStats, playerUsdc);
			},

			buyQuickPickTicketsBulk: async (tickets: BuyQuickPickTicketParams[]) => {
				const provider = getProvider();
				const userStats = deriveUserStatsPDA(wallet.publicKey!);
				const playerUsdc = getUserUsdcAccount();
				return buyQuickPickTicketsBulk(
					provider,
					tickets,
					userStats,
					playerUsdc,
				);
			},

			// Prize claiming
			claimMainPrize: async (drawId: number, ticketIndex: number) => {
				const provider = getProvider();
				const playerUsdc = getUserUsdcAccount();
				return claimMainPrize(provider, drawId, ticketIndex, playerUsdc);
			},

			claimQuickPickPrize: async (drawId: number, ticketIndex: number) => {
				const provider = getProvider();
				const playerUsdc = getUserUsdcAccount();
				return claimQuickPickPrize(provider, drawId, ticketIndex, playerUsdc);
			},

			// Query management
			refreshAll,
			refreshMain,
			refreshQuickPick,

			prefetch: async () => {
				await prefetchAllLotteryData(queryClient);
			},
		};
	}, [
		wallet,
		connectedWallet,
		refreshAll,
		refreshMain,
		refreshQuickPick,
		queryClient,
	]);

	// -------------------------------------------------------------------------
	// Queries (exposed React Query hooks)
	// -------------------------------------------------------------------------

	const queries: MazelProtocolQueries = useMemo(
		() => ({
			useAllStates: useAllLotteryStates,
			useMainState: useMainLotteryState,
			useQuickPickState: useQuickPickState,
			useMainDraw: useMainDrawResult,
			useQuickPickDraw: useQuickPickDrawResult,
			useUserMainTickets: useUserMainTicketsForDraw,
			useUserQuickPickTickets: useUserQuickPickTicketsForDraw,
		}),
		[],
	);

	return { state, actions, queries };
}

// ---------------------------------------------------------------------------
// Utility: derive user stats PDA
// ---------------------------------------------------------------------------

function deriveUserStatsPDA(user: PublicKey): PublicKey {
	const USER_SEED = Buffer.from("user");
	const MAIN_LOTTERY_PROGRAM_ID = new PublicKey(
		"7WyaHk2u8AgonsryMpnvbtp42CfLJFPQpyY5p9ys6FiF",
	);
	const [pda] = PublicKey.findProgramAddressSync(
		[USER_SEED, user.toBuffer()],
		MAIN_LOTTERY_PROGRAM_ID,
	);
	return pda;
}

// ---------------------------------------------------------------------------
// Re-exports for convenience
// ---------------------------------------------------------------------------

export type {
	BuyMainTicketParams,
	BuyQuickPickTicketParams,
	BuyTicketOptions,
	MainLotteryProgram,
	QuickPickProgram,
};

export { mainPDAs, quickPickPDAs, USDC_MINT };
