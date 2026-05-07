import { type AnchorProvider } from "@coral-xyz/anchor";
import {
  PublicKey,
  type TransactionInstruction,
  type Signer,
  SystemProgram,
} from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

import {
  createQuickPickProgramWithProvider,
  createMainLotteryProgramWithProvider,
  fetchMainLotteryState,
} from "./programs";
import {
  deriveQuickPickState,
  deriveQuickPickTicketPDA,
  deriveQuickPickPrizePoolUsdcPDA,
  deriveQuickPickHouseFeeUsdcPDA,
  deriveQuickPickInsurancePoolUsdcPDA,
  deriveLotteryState,
  deriveTicketPDA,
  deriveDrawResultPDA,
  derivePrizePoolUsdcPDA,
  deriveHouseFeeUsdcPDA,
  deriveInsurancePoolUsdcPDA,
  deriveUserPDA,
  MAIN_LOTTERY_PROGRAM_ID,
  USDC_MINT,
} from "./pda";
import { sendInstruction, sendInstructions } from "./connection";
import { fetchQuickPickState } from "./programs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Parameters for buying a Quick Pick ticket */
export interface BuyQuickPickTicketParams {
  /** 5 unique numbers between 1 and 35 */
  numbers: number[];
}

/** Options for buying a ticket */
export interface BuyTicketOptions {
  /** Skip preflight checks (default: false) */
  skipPreflight?: boolean;
  /** Commitment level for confirmation (default: "confirmed") */
  commitment?: "processed" | "confirmed" | "finalized";
  /** Maximum number of retries (optional) */
  maxRetries?: number;
  /** Delay between retries in milliseconds (optional) */
  retryDelayMs?: number;
}

/**
 * Convert BuyTicketOptions to SendAndConfirmTransactionOptions
 */
function convertBuyTicketOptions(
  options: BuyTicketOptions = {},
): import("./connection").SendAndConfirmTransactionOptions {
  return {
    skipPreflight: options.skipPreflight,
    confirmationCommitment: options.commitment,
    maxRetries: options.maxRetries,
    retryDelayMs: options.retryDelayMs,
  };
}

// ---------------------------------------------------------------------------
// Token Constants
// ---------------------------------------------------------------------------

/** Token program ID */
const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);

/** Associated Token Program ID */
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);

// ---------------------------------------------------------------------------
// Buy Quick Pick Ticket
// ---------------------------------------------------------------------------

/**
 * Build the instruction to buy a Quick Pick ticket
 *
 * @param provider - Anchor provider with connected wallet
 * @param params - Ticket parameters (5 numbers from 1-35)
 * @param userStats - User statistics account from main lottery (for $50 gate)
 * @param playerUsdc - Player's USDC token account (must be owned by player)
 * @returns Transaction instruction ready to send
 */
export async function buildBuyQuickPickTicketInstruction(
  provider: AnchorProvider,
  params: BuyQuickPickTicketParams,
  userStats: PublicKey,
  playerUsdc: PublicKey,
): Promise<TransactionInstruction> {
  // Validate input
  if (!params.numbers || params.numbers.length !== 5) {
    throw new Error("Exactly 5 numbers are required for Quick Pick ticket");
  }

  // Validate numbers are within range 1-35 and unique
  const seen = new Set<number>();
  for (const num of params.numbers) {
    if (num < 1 || num > 35) {
      throw new Error(`Number ${num} is out of range (must be 1-35)`);
    }
    if (seen.has(num)) {
      throw new Error(`Duplicate number ${num} found`);
    }
    seen.add(num);
  }

  // Create program client
  const program = createQuickPickProgramWithProvider(provider);

  // Fetch current Quick Pick state to get draw ID and ticket count
  const quickPickState = await fetchQuickPickState(provider.connection);
  if (!quickPickState) {
    throw new Error("Quick Pick state not found");
  }

  // Extract current draw ID and ticket count from state
  const currentDrawId = (quickPickState.current_draw as BN).toNumber();
  const currentDrawTickets = (
    quickPickState.current_draw_tickets as BN
  ).toNumber();

  // Derive PDAs
  const [quickPickStatePda] = deriveQuickPickState();
  const [ticket] = deriveQuickPickTicketPDA(currentDrawId, currentDrawTickets);
  const [prizePoolUsdc] = deriveQuickPickPrizePoolUsdcPDA();
  const [houseFeeUsdc] = deriveQuickPickHouseFeeUsdcPDA();
  const [insurancePoolUsdc] = deriveQuickPickInsurancePoolUsdcPDA();

  // Build instruction using the correct account names from IDL
  const instruction = await program.methods
    .buyTicket({
      numbers: params.numbers as [number, number, number, number, number],
    })
    .accounts({
      player: provider.wallet.publicKey,
      quickPickState: quickPickStatePda, // IDL uses quick_pick_state but Anchor converts to camelCase
      ticket,
      playerUsdc,
      prizePoolUsdc,
      houseFeeUsdc,
      insurancePoolUsdc,
      usdcMint: USDC_MINT,
      userStats,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  return instruction;
}

/**
 * Buy a Quick Pick ticket
 *
 * @param provider - Anchor provider with connected wallet
 * @param params - Ticket parameters (5 numbers from 1-35)
 * @param userStats - User statistics account from main lottery (for $50 gate)
 * @param playerUsdc - Player's USDC token account (must be owned by player)
 * @param options - Transaction options
 * @returns Transaction signature
 */
export async function buyQuickPickTicket(
  provider: AnchorProvider,
  params: BuyQuickPickTicketParams,
  userStats: PublicKey,
  playerUsdc: PublicKey,
  options: BuyTicketOptions = {},
): Promise<string> {
  // Build the instruction
  const instruction = await buildBuyQuickPickTicketInstruction(
    provider,
    params,
    userStats,
    playerUsdc,
  );

  // Get payer from provider wallet
  const payer = {
    publicKey: provider.wallet.publicKey,
    signTransaction: provider.wallet.signTransaction,
    signAllTransactions: provider.wallet.signAllTransactions,
  } as unknown as Signer;

  // Send the transaction
  const signature = await sendInstruction(
    instruction,
    payer,
    [], // No additional signers needed
    provider.connection,
    convertBuyTicketOptions(options),
  );

  return signature;
}

// ---------------------------------------------------------------------------
// Token Account Utilities
// ---------------------------------------------------------------------------

/**
 * Get or create a user's USDC token account
 * Note: This is a simplified version - in production you'd want to handle
 * the creation separately or use a more robust approach
 */
export async function ensureUsdcTokenAccount(
  provider: AnchorProvider,
  owner: PublicKey,
): Promise<PublicKey> {
  const [tokenAccount] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), USDC_MINT.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  // Check if account exists
  const accountInfo = await provider.connection.getAccountInfo(tokenAccount);
  if (!accountInfo) {
    // In a real implementation, you'd create the associated token account here
    // This would require additional logic and a separate transaction
    throw new Error(
      `USDC token account ${tokenAccount.toString()} does not exist. ` +
      "Please create it first or ensure you have USDC in your wallet.",
    );
  }

  return tokenAccount;
}

// ---------------------------------------------------------------------------
// Bulk Purchase
// ---------------------------------------------------------------------------

/**
 * Buy multiple Quick Pick tickets in a single transaction
 *
 * @param provider - Anchor provider with connected wallet
 * @param tickets - Array of ticket parameters
 * @param userStats - User statistics account from main lottery
 * @param playerUsdc - Player's USDC token account
 * @param options - Transaction options
 * @returns Transaction signature
 */
export async function buyQuickPickTicketsBulk(
  provider: AnchorProvider,
  tickets: BuyQuickPickTicketParams[],
  userStats: PublicKey,
  playerUsdc: PublicKey,
  options: BuyTicketOptions = {},
): Promise<string> {
  if (tickets.length === 0) {
    throw new Error("At least one ticket is required");
  }

  if (tickets.length > 10) {
    // Arbitrary limit to avoid transaction size limits
    throw new Error("Maximum 10 tickets per transaction");
  }

  // Fetch current state once for all tickets
  const quickPickState = await fetchQuickPickState(provider.connection);
  if (!quickPickState) {
    throw new Error("Quick Pick state not found");
  }

  const currentDrawId = (quickPickState.current_draw as BN).toNumber();
  let currentTicketIndex = (
    quickPickState.current_draw_tickets as BN
  ).toNumber();

  // Build all instructions
  const instructions: TransactionInstruction[] = [];
  const program = createQuickPickProgramWithProvider(provider);

  // Derive common PDAs once
  const [quickPickStatePda] = deriveQuickPickState();
  const [prizePoolUsdc] = deriveQuickPickPrizePoolUsdcPDA();
  const [houseFeeUsdc] = deriveQuickPickHouseFeeUsdcPDA();
  const [insurancePoolUsdc] = deriveQuickPickInsurancePoolUsdcPDA();

  for (const ticketParams of tickets) {
    // Validate ticket numbers
    validateQuickPickNumbers(ticketParams.numbers);

    // Derive ticket PDA with current index
    const [ticket] = deriveQuickPickTicketPDA(
      currentDrawId,
      currentTicketIndex,
    );

    // Build instruction
    const instruction = await program.methods
      .buyTicket({
        numbers: ticketParams.numbers as [
          number,
          number,
          number,
          number,
          number,
        ],
      })
      .accounts({
        player: provider.wallet.publicKey,
        quickPickState: quickPickStatePda,
        ticket,
        playerUsdc,
        prizePoolUsdc,
        houseFeeUsdc,
        insurancePoolUsdc,
        usdcMint: USDC_MINT,
        userStats,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    instructions.push(instruction);
    currentTicketIndex++; // Increment for next ticket
  }

  // Get payer
  const payer = {
    publicKey: provider.wallet.publicKey,
    signTransaction: provider.wallet.signTransaction,
    signAllTransactions: provider.wallet.signAllTransactions,
  } as unknown as Signer;

  // Send all instructions in one transaction
  const signature = await sendInstructions(
    instructions,
    payer,
    [], // No additional signers
    provider.connection,
    convertBuyTicketOptions(options),
  );

  return signature;
}

// ---------------------------------------------------------------------------
// Error Types
// ---------------------------------------------------------------------------

export class TicketPurchaseError extends Error {
  constructor(
    message: string,
    public readonly originalError?: Error,
  ) {
    super(message);
    this.name = "TicketPurchaseError";
  }
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Validate Quick Pick ticket numbers
 *
 * @param numbers - Array of numbers to validate
 * @throws Error if numbers are invalid
 */
export function validateQuickPickNumbers(numbers: number[]): void {
  if (!numbers || numbers.length !== 5) {
    throw new TicketPurchaseError("Exactly 5 numbers are required");
  }

  const seen = new Set<number>();
  for (const num of numbers) {
    if (!Number.isInteger(num)) {
      throw new TicketPurchaseError(`Number ${num} must be an integer`);
    }
    if (num < 1 || num > 35) {
      throw new TicketPurchaseError(
        `Number ${num} is out of range (must be 1-35)`,
      );
    }
    if (seen.has(num)) {
      throw new TicketPurchaseError(`Duplicate number ${num} found`);
    }
    seen.add(num);
  }
}

/**
 * Generate random Quick Pick numbers
 *
 * @returns Array of 5 unique numbers between 1 and 35
 */
export function generateRandomQuickPickNumbers(): number[] {
  const numbers: number[] = [];
  while (numbers.length < 5) {
    const num = Math.floor(Math.random() * 35) + 1;
    if (!numbers.includes(num)) {
      numbers.push(num);
    }
  }
  return numbers.sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// User Stats Utilities
// ---------------------------------------------------------------------------

/**
 * Fetch user statistics from the main lottery program
 *
 * @param provider - Anchor provider with connected wallet
 * @param user - User's public key
 * @returns User stats account data or null if not found
 */
export async function fetchUserStats(
  provider: AnchorProvider,
  user: PublicKey,
): Promise<Record<string, unknown> | null> {
  try {
    // Import main lottery program client
    const { createMainLotteryProgramWithProvider } = await import("./programs");
    const program = createMainLotteryProgramWithProvider(provider);

    // Derive user stats PDA
    const { deriveUserPDA } = await import("./pda");
    const [userStatsPda] = deriveUserPDA(user);

    // Fetch account using dynamic access (AccountNamespace<Idl> doesn't expose typed names)
    const ns = program.account as Record<string, { fetch: (addr: PublicKey) => Promise<unknown> } | undefined>;
    const accessor = ns["userStats"];
    if (!accessor) return null;
    const account = await accessor.fetch(userStatsPda);
    return account as Record<string, unknown>;
  } catch (error) {
    console.warn("Failed to fetch user stats:", error);
    return null;
  }
}

/**
 * Check if user meets the $50 gate requirement
 * Note: This is a placeholder - you'll need to implement proper user stats fetching
 * from the main lottery program
 *
 * @param provider - Anchor provider with connected wallet
 * @param userStats - User statistics account
 * @returns boolean indicating if user meets the requirement
 */
export async function checkUserMeetsGateRequirement(
  provider: AnchorProvider,
  userStats: PublicKey,
): Promise<boolean> {
  try {
    // Import main lottery program client
    const { createMainLotteryProgramWithProvider } = await import("./programs");
    const program = createMainLotteryProgramWithProvider(provider);

    // Fetch user stats account using dynamic access
    const ns = program.account as Record<string, { fetch: (addr: PublicKey) => Promise<unknown> } | undefined>;
    const accessor = ns["userStats"];
    if (!accessor) return false;
    const account = await accessor.fetch(userStats);

    // Check if total_spent >= $50 (in USDC lamports)
    // $50 in USDC lamports = 50 * 1,000,000 (USDC has 6 decimals) = 50,000,000
    const FIFTY_DOLLARS_LAMPORTS = 50_000_000;

    // Extract total_spent from user stats
    // The field name might be different - adjust based on actual IDL
    const totalSpent =
      (account as any).totalSpent || (account as any).total_spent || BigInt(0);

    return BigInt(totalSpent) >= BigInt(FIFTY_DOLLARS_LAMPORTS);
  } catch (error) {
    console.warn("Failed to check $50 gate requirement:", error);
    // If we can't fetch the stats, fail closed for security
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main Lottery Ticket Purchase
// ---------------------------------------------------------------------------

/** Parameters for buying a main lottery ticket */
export interface BuyMainTicketParams {
  /** 6 unique numbers between 1 and 46, sorted ascending */
  numbers: number[];
  /** Whether to use a free ticket credit */
  useFreeTicket?: boolean;
}

/**
 * Build the instruction to buy a main lottery ticket (6/46)
 */
export async function buildBuyMainTicketInstruction(
  provider: AnchorProvider,
  params: BuyMainTicketParams,
  playerUsdc: PublicKey,
): Promise<TransactionInstruction> {
  validateMainLotteryNumbers(params.numbers);

  const program = createMainLotteryProgramWithProvider(provider);

  // Fetch current lottery state
  const state = await fetchMainLotteryState(provider.connection);
  if (!state) throw new Error("Lottery state not found");

  const currentDrawId =
    (state.current_draw_id as any).toNumber?.() ??
    Number(state.current_draw_id);
  const currentDrawTickets =
    (state.current_draw_tickets as any).toNumber?.() ??
    Number(state.current_draw_tickets);

  // Derive PDAs
  const [lotteryStatePda] = deriveLotteryState(MAIN_LOTTERY_PROGRAM_ID);
  const [ticket] = deriveTicketPDA(currentDrawId, currentDrawTickets);
  const [prizePoolUsdc] = derivePrizePoolUsdcPDA();
  const [houseFeeUsdc] = deriveHouseFeeUsdcPDA();
  const [insurancePoolUsdc] = deriveInsurancePoolUsdcPDA();
  const [userStats] = deriveUserPDA(provider.wallet.publicKey);

  const instruction = await program.methods
    .buyTicket({
      numbers: params.numbers as [
        number,
        number,
        number,
        number,
        number,
        number,
      ],
      useFreeTicket: params.useFreeTicket ?? false,
    })
    .accounts({
      player: provider.wallet.publicKey,
      lotteryState: lotteryStatePda,
      ticket,
      playerUsdc,
      prizePoolUsdc,
      houseFeeUsdc,
      insurancePoolUsdc,
      usdcMint: USDC_MINT,
      userStats,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  return instruction;
}

/**
 * Buy a main lottery ticket
 */
export async function buyMainTicket(
  provider: AnchorProvider,
  params: BuyMainTicketParams,
  playerUsdc: PublicKey,
  options: BuyTicketOptions = {},
): Promise<string> {
  const instruction = await buildBuyMainTicketInstruction(
    provider,
    params,
    playerUsdc,
  );

  const payer = {
    publicKey: provider.wallet.publicKey,
    signTransaction: provider.wallet.signTransaction,
    signAllTransactions: provider.wallet.signAllTransactions,
  } as unknown as Signer;

  return sendInstruction(
    instruction,
    payer,
    [],
    provider.connection,
    convertBuyTicketOptions(options),
  );
}

function validateMainLotteryNumbers(numbers: number[]): void {
  if (!numbers || numbers.length !== 6)
    throw new TicketPurchaseError("Exactly 6 numbers required");
  const seen = new Set<number>();
  for (const num of numbers) {
    if (num < 1 || num > 46)
      throw new TicketPurchaseError(`Number ${num} out of range (1-46)`);
    if (seen.has(num))
      throw new TicketPurchaseError(`Duplicate number ${num}`);
    seen.add(num);
  }
}

// ---------------------------------------------------------------------------
// Prize Claiming
// ---------------------------------------------------------------------------

/**
 * Build instruction to claim a prize for a single main lottery ticket
 */
export async function buildClaimMainPrizeInstruction(
  provider: AnchorProvider,
  drawId: number,
  ticketIndex: number,
  playerUsdc: PublicKey,
): Promise<TransactionInstruction> {
  const program = createMainLotteryProgramWithProvider(provider);

  const [lotteryStatePda] = deriveLotteryState();
  const [ticket] = deriveTicketPDA(drawId, ticketIndex);
  const [drawResult] = deriveDrawResultPDA(drawId);
  const [prizePoolUsdc] = derivePrizePoolUsdcPDA();
  const [userStats] = deriveUserPDA(provider.wallet.publicKey);

  const instruction = await program.methods
    .claimPrize()
    .accounts({
      player: provider.wallet.publicKey,
      lotteryState: lotteryStatePda,
      ticket,
      drawResult,
      playerUsdc,
      prizePoolUsdc,
      usdcMint: USDC_MINT,
      userStats,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();

  return instruction;
}

/**
 * Claim a prize for a single main lottery ticket
 */
export async function claimMainPrize(
  provider: AnchorProvider,
  drawId: number,
  ticketIndex: number,
  playerUsdc: PublicKey,
  options: BuyTicketOptions = {},
): Promise<string> {
  const instruction = await buildClaimMainPrizeInstruction(
    provider,
    drawId,
    ticketIndex,
    playerUsdc,
  );
  const payer = {
    publicKey: provider.wallet.publicKey,
    signTransaction: provider.wallet.signTransaction,
    signAllTransactions: provider.wallet.signAllTransactions,
  } as unknown as Signer;
  return sendInstruction(
    instruction,
    payer,
    [],
    provider.connection,
    convertBuyTicketOptions(options),
  );
}

/**
 * Claim all unclaimed prizes for a user across multiple tickets
 */
export async function claimAllMainPrizes(
  provider: AnchorProvider,
  tickets: Array<{ drawId: number; ticketIndex: number }>,
  playerUsdc: PublicKey,
  options: BuyTicketOptions = {},
): Promise<string[]> {
  const instructions = await Promise.all(
    tickets.map((t) =>
      buildClaimMainPrizeInstruction(
        provider,
        t.drawId,
        t.ticketIndex,
        playerUsdc,
      ),
    ),
  );

  const payer = {
    publicKey: provider.wallet.publicKey,
    signTransaction: provider.wallet.signTransaction,
    signAllTransactions: provider.wallet.signAllTransactions,
  } as unknown as Signer;

  // Send in batches of 5 to avoid transaction size limits
  const signatures: string[] = [];
  for (let i = 0; i < instructions.length; i += 5) {
    const batch = instructions.slice(i, i + 5);
    const sig = await sendInstructions(
      batch,
      payer,
      [],
      provider.connection,
      convertBuyTicketOptions(options),
    );
    signatures.push(sig);
  }
  return signatures;
}

// ---------------------------------------------------------------------------
// Quick Pick Prize Claiming
// ---------------------------------------------------------------------------

/**
 * Build instruction to claim a prize for a Quick Pick ticket
 */
export async function buildClaimQuickPickPrizeInstruction(
  provider: AnchorProvider,
  drawId: number,
  ticketIndex: number,
  playerUsdc: PublicKey,
): Promise<TransactionInstruction> {
  const program = createQuickPickProgramWithProvider(provider);

  const [quickPickStatePda] = deriveQuickPickState();
  const [ticket] = deriveQuickPickTicketPDA(drawId, ticketIndex);
  const [drawResult] = PublicKey.findProgramAddressSync(
    [Buffer.from("quick_pick_draw"), new BN(drawId).toArrayLike(Buffer, "le", 8)],
    program.programId,
  );
  const [prizePoolUsdc] = deriveQuickPickPrizePoolUsdcPDA();

  const instruction = await program.methods
    .claimPrize()
    .accounts({
      player: provider.wallet.publicKey,
      quickPickState: quickPickStatePda,
      ticket,
      drawResult,
      playerUsdc,
      prizePoolUsdc,
      usdcMint: USDC_MINT,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();

  return instruction;
}

/**
 * Claim a Quick Pick prize for a single ticket
 */
export async function claimQuickPickPrize(
  provider: AnchorProvider,
  drawId: number,
  ticketIndex: number,
  playerUsdc: PublicKey,
  options: BuyTicketOptions = {},
): Promise<string> {
  const instruction = await buildClaimQuickPickPrizeInstruction(
    provider,
    drawId,
    ticketIndex,
    playerUsdc,
  );
  const payer = {
    publicKey: provider.wallet.publicKey,
    signTransaction: provider.wallet.signTransaction,
    signAllTransactions: provider.wallet.signAllTransactions,
  } as unknown as Signer;
  return sendInstruction(
    instruction,
    payer,
    [],
    provider.connection,
    convertBuyTicketOptions(options),
  );
}

// ---------------------------------------------------------------------------
// Initialize User Stats
// ---------------------------------------------------------------------------

/**
 * Build instruction to initialize a user's statistics account.
 * Must be called once per wallet before buying tickets.
 */
export async function buildInitUserStatsInstruction(
  provider: AnchorProvider,
): Promise<TransactionInstruction> {
  const program = createMainLotteryProgramWithProvider(provider);

  const [userStats] = deriveUserPDA(provider.wallet.publicKey);

  const instruction = await program.methods
    .initUserStats()
    .accounts({
      player: provider.wallet.publicKey,
      userStats,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  return instruction;
}

/**
 * Initialize user stats account.
 * This is a one-time setup required before purchasing tickets.
 */
export async function initUserStats(
  provider: AnchorProvider,
  options: BuyTicketOptions = {},
): Promise<string> {
  const instruction = await buildInitUserStatsInstruction(provider);
  const payer = {
    publicKey: provider.wallet.publicKey,
    signTransaction: provider.wallet.signTransaction,
    signAllTransactions: provider.wallet.signAllTransactions,
  } as unknown as Signer;
  return sendInstruction(
    instruction,
    payer,
    [],
    provider.connection,
    convertBuyTicketOptions(options),
  );
}

/**
 * Ensure a user has an initialized UserStats account.
 * Checks if account exists first; if not, initializes it.
 * Returns true if the account already existed, false if it was just created.
 */
export async function ensureUserStatsInitialized(
  provider: AnchorProvider,
): Promise<{ existed: boolean; signature?: string }> {
  const [userStatsPda] = deriveUserPDA(provider.wallet.publicKey);

  // Check if account already exists
  const accountInfo = await provider.connection.getAccountInfo(userStatsPda);
  if (accountInfo && accountInfo.lamports > 0) {
    return { existed: true };
  }

  // Initialize it
  const signature = await initUserStats(provider);
  return { existed: false, signature };
}
