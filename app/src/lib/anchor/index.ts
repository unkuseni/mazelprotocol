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

// Primary integration hook
export {
  useMazelProtocol,
  type MazelProtocol,
  type MazelProtocolState,
  type MazelProtocolActions,
  type MazelProtocolQueries,
} from "./integration";

// React Query hooks
export {
  useMainLotteryState,
  useQuickPickState,
  useMainDrawResult,
  useQuickPickDrawResult,
  useAllLotteryStates,
  useUserMainTicketsForDraw,
  useUserQuickPickTicketsForDraw,
  useAllUserTickets,
  useMultipleMainDrawResults,
  useMultipleQuickPickDrawResults,
  useSubscribeToMainLotteryState,
  useSubscribeToQuickPickState,
  useLotteryQueryClient,
  useConnection,
  useMainLotteryProgram,
  useQuickPickProgram,
  prefetchMainLotteryState,
  prefetchQuickPickState,
  prefetchAllLotteryData,
  lotteryKeys,
} from "./hooks";

// Transaction builders
export {
  // Main lottery
  buyMainTicket,
  buildBuyMainTicketInstruction,
  claimMainPrize,
  claimAllMainPrizes,
  buildClaimMainPrizeInstruction,

  // Quick Pick
  buyQuickPickTicket,
  buyQuickPickTicketsBulk,
  buildBuyQuickPickTicketInstruction,
  claimQuickPickPrize,
  buildClaimQuickPickPrizeInstruction,

  // User stats
  initUserStats,
  buildInitUserStatsInstruction,
  ensureUserStatsInitialized,
  fetchUserStats,
  checkUserMeetsGateRequirement,

  // Utilities
  validateQuickPickNumbers,
  generateRandomQuickPickNumbers,
  ensureUsdcTokenAccount,

  // Types
  type BuyQuickPickTicketParams,
  type BuyMainTicketParams,
  type BuyTicketOptions,
} from "./transactions";

// Program clients
export {
  createMainLotteryProgram,
  createQuickPickProgram,
  createReadOnlyProvider,
  createProgramClients,
  fetchMainLotteryState,
  fetchQuickPickState,
  fetchMainDrawResult,
  fetchQuickPickDrawResult,
  fetchUserMainTicketsForDraw,
  fetchUserQuickPickTicketsForDraw,
  fetchAllLotteryData,
  type MainLotteryProgram,
  type QuickPickProgram,
  type ProgramClients,
} from "./programs";

// Wallet
export {
  useWallet,
  useWalletForPublicKey,
  useConnectedWallet,
  type WalletHookReturn,
} from "./wallet";

// Provider
export {
  useAnchorProvider,
  useReadOnlyAnchorProvider,
  useConnectedAnchorProvider,
  useSmartProgramClient,
  useProgramsWithProvider,
  type AnchorProviderHookReturn,
} from "./provider";

// Connection
export {
  getConnection,
  getWsConnection,
  sendAndConfirmTransaction,
  sendInstruction,
  sendInstructions,
  getAccountInfo,
  getBalance,
  getTokenAccountBalance,
  getCurrentSlot,
} from "./connection";

// PDA derivation
export {
  // Seeds
  LOTTERY_SEED,
  TICKET_SEED,
  DRAW_SEED,
  USER_SEED,
  UNIFIED_TICKET_SEED,
  PRIZE_POOL_USDC_SEED,
  HOUSE_FEE_USDC_SEED,
  INSURANCE_POOL_USDC_SEED,
  QUICK_PICK_SEED,
  QUICK_PICK_TICKET_SEED,
  QUICK_PICK_DRAW_SEED,

  // Constants
  USDC_MINT,
  MAIN_LOTTERY_PROGRAM_ID,
  QUICK_PICK_PROGRAM_ID,
  NUMBERS_PER_TICKET,
  MAX_NUMBER,
  QP_NUMBERS_PER_TICKET,
  QP_MAX_NUMBER,

  // PDA derivation
  deriveMainPDAs,
  deriveQuickPickPDAs,
  deriveLotteryState,
  deriveDrawResultPDA,
  deriveTicketPDA,
  deriveUnifiedTicketPDA,
  deriveUserPDA,
  derivePrizePoolUsdcPDA,
  deriveHouseFeeUsdcPDA,
  deriveInsurancePoolUsdcPDA,
  deriveQuickPickState,
  deriveQuickPickDrawResultPDA,
  deriveQuickPickTicketPDA,
  deriveQuickPickPrizePoolUsdcPDA,
  deriveQuickPickHouseFeeUsdcPDA,
  deriveQuickPickInsurancePoolUsdcPDA,

  // Pre-computed PDAs
  mainPDAs,
  quickPickPDAs,
  lotteryState,
  quickPickState,
  prizePoolUsdc,
  houseFeeUsdc,
  insurancePoolUsdc,
  quickPickPrizePoolUsdc,
  quickPickHouseFeeUsdc,
  quickPickInsurancePoolUsdc,

  // Utility
  generateRandomNumbers,
  generateMainLotteryNumbers,
  generateQuickPickNumbers,
  numberToU64Buffer,

  // Types
  type MainPDAs,
  type QuickPickPDAs,
} from "./pda";
