/**
 * MazelProtocol Anchor Integration
 *
 * Barrel export for all blockchain integration modules.
 * Import everything from here:
 *
 * ```tsx
 * import { useMazelProtocol, useMainLotteryState, buyMainTicket } from "@/lib/anchor";
 * ```
 */

// Connection
export {
	getAccountInfo,
	getBalance,
	getConnection,
	getCurrentSlot,
	getTokenAccountBalance,
	getWsConnection,
	sendAndConfirmTransaction,
	sendInstruction,
	sendInstructions,
} from "./connection";

// React Query hooks
export {
	lotteryKeys,
	prefetchAllLotteryData,
	prefetchMainLotteryState,
	prefetchQuickPickState,
	useAllLotteryStates,
	useAllUserTickets,
	useConnection,
	useLotteryQueryClient,
	useMainDrawResult,
	useMainLotteryProgram,
	useMainLotteryState,
	useMultipleMainDrawResults,
	useMultipleQuickPickDrawResults,
	useQuickPickDrawResult,
	useQuickPickProgram,
	useQuickPickState,
	useSubscribeToMainLotteryState,
	useSubscribeToQuickPickState,
	useUserMainTicketsForDraw,
	useUserQuickPickTicketsForDraw,
} from "./hooks";
// Primary integration hook
export {
	type MazelProtocol,
	type MazelProtocolActions,
	type MazelProtocolQueries,
	type MazelProtocolState,
	useMazelProtocol,
} from "./integration";
// PDA derivation
export {
	DRAW_SEED,
	deriveDrawResultPDA,
	deriveHouseFeeUsdcPDA,
	deriveInsurancePoolUsdcPDA,
	deriveLotteryState,
	// PDA derivation
	deriveMainPDAs,
	derivePrizePoolUsdcPDA,
	deriveQuickPickDrawResultPDA,
	deriveQuickPickHouseFeeUsdcPDA,
	deriveQuickPickInsurancePoolUsdcPDA,
	deriveQuickPickPDAs,
	deriveQuickPickPrizePoolUsdcPDA,
	deriveQuickPickState,
	deriveQuickPickTicketPDA,
	deriveTicketPDA,
	deriveUnifiedTicketPDA,
	deriveUserPDA,
	generateMainLotteryNumbers,
	generateQuickPickNumbers,
	// Utility
	generateRandomNumbers,
	HOUSE_FEE_USDC_SEED,
	houseFeeUsdc,
	INSURANCE_POOL_USDC_SEED,
	insurancePoolUsdc,
	// Seeds
	LOTTERY_SEED,
	lotteryState,
	MAIN_LOTTERY_PROGRAM_ID,
	MAX_NUMBER,
	// Types
	type MainPDAs,
	// Pre-computed PDAs
	mainPDAs,
	NUMBERS_PER_TICKET,
	numberToU64Buffer,
	PRIZE_POOL_USDC_SEED,
	prizePoolUsdc,
	QP_MAX_NUMBER,
	QP_NUMBERS_PER_TICKET,
	QUICK_PICK_DRAW_SEED,
	QUICK_PICK_PROGRAM_ID,
	QUICK_PICK_SEED,
	QUICK_PICK_TICKET_SEED,
	type QuickPickPDAs,
	quickPickHouseFeeUsdc,
	quickPickInsurancePoolUsdc,
	quickPickPDAs,
	quickPickPrizePoolUsdc,
	quickPickState,
	TICKET_SEED,
	UNIFIED_TICKET_SEED,
	// Constants
	USDC_MINT,
	USER_SEED,
} from "./pda";
// Program clients
export {
	createMainLotteryProgram,
	createProgramClients,
	createQuickPickProgram,
	createReadOnlyProvider,
	fetchAllLotteryData,
	fetchMainDrawResult,
	fetchMainLotteryState,
	fetchQuickPickDrawResult,
	fetchQuickPickState,
	fetchUserMainTicketsForDraw,
	fetchUserQuickPickTicketsForDraw,
	type MainLotteryProgram,
	type ProgramClients,
	type QuickPickProgram,
} from "./programs";

// Provider
export {
	type AnchorProviderHookReturn,
	useAnchorProvider,
	useConnectedAnchorProvider,
	useProgramsWithProvider,
	useReadOnlyAnchorProvider,
	useSmartProgramClient,
} from "./provider";
// Transaction builders
export {
	type BuyMainTicketParams,
	// Types
	type BuyQuickPickTicketParams,
	type BuyTicketOptions,
	buildBuyMainTicketInstruction,
	buildBuyQuickPickTicketInstruction,
	buildClaimMainPrizeInstruction,
	buildClaimQuickPickPrizeInstruction,
	buildInitUserStatsInstruction,
	// Main lottery
	buyMainTicket,
	// Quick Pick
	buyQuickPickTicket,
	buyQuickPickTicketsBulk,
	checkUserMeetsGateRequirement,
	claimAllMainPrizes,
	claimMainPrize,
	claimQuickPickPrize,
	ensureUsdcTokenAccount,
	ensureUserStatsInitialized,
	fetchUserStats,
	generateRandomQuickPickNumbers,
	// User stats
	initUserStats,
	// Utilities
	validateQuickPickNumbers,
} from "./transactions";
// Wallet
export {
	useConnectedWallet,
	useWallet,
	useWalletForPublicKey,
	type WalletHookReturn,
} from "./wallet";
