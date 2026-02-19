import {
  Program,
  AnchorProvider,
  type Idl,
  type Wallet,
} from "@coral-xyz/anchor";
import { type Connection, PublicKey, Keypair } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

// Import IDLs
import mainLotteryIdl from "./idl/solana_lotto.json";
import quickPickIdl from "./idl/quickpick.json";

// Import utilities
import { getConnection } from "./connection";
import {
  MAIN_LOTTERY_PROGRAM_ID,
  QUICK_PICK_PROGRAM_ID,
  USDC_MINT,
  mainPDAs,
  quickPickPDAs,
  type MainPDAs,
  type QuickPickPDAs,
} from "./pda";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Main lottery program type (inferred from IDL) */
export type MainLotteryProgram = Program<Idl>;

/** Quick Pick program type (inferred from IDL) */
export type QuickPickProgram = Program<Idl>;

/** Combined program clients */
export interface ProgramClients {
  mainLottery: MainLotteryProgram;
  quickPick: QuickPickProgram;
}

// ---------------------------------------------------------------------------
// IDL loading
// ---------------------------------------------------------------------------

/** Get the main lottery IDL */
export function getMainLotteryIdl(): Idl {
  return mainLotteryIdl as Idl;
}

/** Get the Quick Pick IDL */
export function getQuickPickIdl(): Idl {
  return quickPickIdl as Idl;
}

// ---------------------------------------------------------------------------
// Provider creation (read-only)
// ---------------------------------------------------------------------------

/**
 * Create a read-only Anchor provider for querying data
 *
 * @param connection - Optional connection (uses singleton if not provided)
 * @returns Read-only Anchor provider
 */
export function createReadOnlyProvider(
  connection?: Connection,
): AnchorProvider {
  const conn = connection || getConnection();

  // Dummy wallet for read-only operations
  const readOnlyWallet = {
    publicKey: Keypair.generate().publicKey,
    signTransaction: () =>
      Promise.reject(new Error("Read-only wallet cannot sign")),
    signAllTransactions: () =>
      Promise.reject(new Error("Read-only wallet cannot sign")),
  } as Wallet;

  return new AnchorProvider(conn, readOnlyWallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
    skipPreflight: false,
  });
}

// ---------------------------------------------------------------------------
// Program client factories (read-only)
// ---------------------------------------------------------------------------

/**
 * Create a read-only Main Lottery program client
 *
 * @param connection - Optional connection (uses singleton if not provided)
 * @returns Read-only Main Lottery program client
 */
export function createMainLotteryProgram(
  connection?: Connection,
): MainLotteryProgram {
  const provider = createReadOnlyProvider(connection);
  const idl = getMainLotteryIdl();
  return new Program(idl, MAIN_LOTTERY_PROGRAM_ID, provider);
}

export function createMainLotteryProgramWithProvider(
  provider: AnchorProvider,
  programId: PublicKey = MAIN_LOTTERY_PROGRAM_ID,
): MainLotteryProgram {
  const idl = getMainLotteryIdl();
  return new Program(idl, programId, provider);
}

/**
 * Create a read-only Quick Pick program client
 *
 * @param connection - Optional connection (uses singleton if not provided)
 * @returns Read-only Quick Pick program client
 */
export function createQuickPickProgram(
  connection?: Connection,
): QuickPickProgram {
  const provider = createReadOnlyProvider(connection);
  const idl = getQuickPickIdl();
  return new Program(idl, QUICK_PICK_PROGRAM_ID, provider);
}

export function createQuickPickProgramWithProvider(
  provider: AnchorProvider,
  programId: PublicKey = QUICK_PICK_PROGRAM_ID,
): QuickPickProgram {
  const idl = getQuickPickIdl();
  return new Program(idl, programId, provider);
}

/**
 * Create both read-only program clients
 *
 * @param connection - Optional connection (uses singleton if not provided)
 * @returns Both read-only program clients
 */
export function createProgramClients(connection?: Connection): ProgramClients {
  return {
    mainLottery: createMainLotteryProgram(connection),
    quickPick: createQuickPickProgram(connection),
  };
}

// ---------------------------------------------------------------------------
// State fetching utilities (Main Lottery)
// ---------------------------------------------------------------------------

/**
 * Fetch the main lottery state account
 *
 * @param connection - Optional connection (uses singleton if not provided)
 * @returns Lottery state account data or null if not found
 */
export async function fetchMainLotteryState(
  connection?: Connection,
): Promise<any> {
  try {
    const program = createMainLotteryProgram(connection);
    const [lotteryStatePda] = mainPDAs.lotteryState;
    return await program.account.lotteryState.fetch(lotteryStatePda);
  } catch (error) {
    console.warn("Failed to fetch main lottery state:", error);
    return null;
  }
}

/**
 * Fetch a specific main lottery draw result
 *
 * @param drawId - Draw ID
 * @param connection - Optional connection (uses singleton if not provided)
 * @returns Draw result account data or null if not found
 */
export async function fetchMainDrawResult(
  drawId: number | BN,
  connection?: Connection,
): Promise<any> {
  try {
    const program = createMainLotteryProgram(connection);
    const drawIdBuf = Buffer.alloc(8);
    drawIdBuf.writeBigUInt64LE(BigInt(drawId.toString()));

    const [drawResultPda] = await PublicKey.findProgramAddressSync(
      [Buffer.from("draw"), drawIdBuf],
      program.programId,
    );

    return await program.account.drawResult.fetch(drawResultPda);
  } catch (error) {
    console.warn(`Failed to fetch main draw result for draw ${drawId}:`, error);
    return null;
  }
}

/**
 * Fetch all tickets for a user in a specific main lottery draw
 *
 * @param user - User's public key
 * @param drawId - Draw ID
 * @param connection - Optional connection (uses singleton if not provided)
 * @returns Array of user's tickets for the draw
 */
export async function fetchUserMainTicketsForDraw(
  user: PublicKey,
  drawId: number | BN,
  connection?: Connection,
): Promise<any[]> {
  try {
    const program = createMainLotteryProgram(connection);

    const filters = [
      {
        memcmp: {
          offset: 8, // Skip discriminator (user field is typically at offset 8)
          bytes: user.toBase58(),
        },
      },
      {
        memcmp: {
          offset: 40, // Position of draw_id in Ticket struct (adjust if needed)
          bytes: new BN(drawId).toArrayLike(Buffer, "le", 8).toString("base64"),
        },
      },
    ];

    const tickets = await program.account.ticket.all(filters);
    return tickets.map((t) => t.account);
  } catch (error) {
    console.warn(`Failed to fetch user tickets for draw ${drawId}:`, error);
    return [];
  }
}

// ---------------------------------------------------------------------------
// State fetching utilities (Quick Pick)
// ---------------------------------------------------------------------------

/**
 * Fetch the Quick Pick state account
 *
 * @param connection - Optional connection (uses singleton if not provided)
 * @returns Quick Pick state account data or null if not found
 */
export async function fetchQuickPickState(
  connection?: Connection,
): Promise<any> {
  try {
    const program = createQuickPickProgram(connection);
    const [quickPickStatePda] = quickPickPDAs.quickPickState;
    return await program.account.quickPickState.fetch(quickPickStatePda);
  } catch (error) {
    console.warn("Failed to fetch Quick Pick state:", error);
    return null;
  }
}

/**
 * Fetch a specific Quick Pick draw result
 *
 * @param drawId - Draw ID
 * @param connection - Optional connection (uses singleton if not provided)
 * @returns Draw result account data or null if not found
 */
export async function fetchQuickPickDrawResult(
  drawId: number | BN,
  connection?: Connection,
): Promise<any> {
  try {
    const program = createQuickPickProgram(connection);
    const drawIdBuf = Buffer.alloc(8);
    drawIdBuf.writeBigUInt64LE(BigInt(drawId.toString()));

    const [drawResultPda] = await PublicKey.findProgramAddressSync(
      [Buffer.from("quick_pick_draw"), drawIdBuf],
      program.programId,
    );

    return await program.account.drawResult.fetch(drawResultPda);
  } catch (error) {
    console.warn(
      `Failed to fetch Quick Pick draw result for draw ${drawId}:`,
      error,
    );
    return null;
  }
}

/**
 * Fetch all tickets for a user in a specific Quick Pick draw
 *
 * @param user - User's public key
 * @param drawId - Draw ID
 * @param connection - Optional connection (uses singleton if not provided)
 * @returns Array of user's tickets for the draw
 */
export async function fetchUserQuickPickTicketsForDraw(
  user: PublicKey,
  drawId: number | BN,
  connection?: Connection,
): Promise<any[]> {
  try {
    const program = createQuickPickProgram(connection);

    const filters = [
      {
        memcmp: {
          offset: 8, // Skip discriminator
          bytes: user.toBase58(),
        },
      },
      {
        memcmp: {
          offset: 40, // Position of draw_id in Ticket struct
          bytes: new BN(drawId).toArrayLike(Buffer, "le", 8).toString("base64"),
        },
      },
    ];

    const tickets = await program.account.ticket.all(filters);
    return tickets.map((t) => t.account);
  } catch (error) {
    console.warn(
      `Failed to fetch user Quick Pick tickets for draw ${drawId}:`,
      error,
    );
    return [];
  }
}

// ---------------------------------------------------------------------------
// Combined queries
// ---------------------------------------------------------------------------

/**
 * Fetch all lottery data (both main and Quick Pick states)
 *
 * @param connection - Optional connection (uses singleton if not provided)
 * @returns Object containing both lottery states
 */
export async function fetchAllLotteryData(connection?: Connection): Promise<{
  mainState: any;
  quickPickState: any;
}> {
  const [mainState, quickPickState] = await Promise.all([
    fetchMainLotteryState(connection),
    fetchQuickPickState(connection),
  ]);

  return { mainState, quickPickState };
}

/**
 * Fetch user's active tickets across all draws
 *
 * @param user - User's public key
 * @param connection - Optional connection (uses singleton if not provided)
 * @returns Object containing user's tickets for both lotteries
 */
export async function fetchUserActiveTickets(
  user: PublicKey,
  connection?: Connection,
): Promise<{
  mainTickets: any[];
  quickPickTickets: any[];
}> {
  // Note: This would need to fetch all draws and filter by active status
  // For now, returns empty arrays - implement based on your needs
  return {
    mainTickets: [],
    quickPickTickets: [],
  };
}

// ---------------------------------------------------------------------------
// Export constants and types
// ---------------------------------------------------------------------------

export {
  MAIN_LOTTERY_PROGRAM_ID,
  QUICK_PICK_PROGRAM_ID,
  USDC_MINT,
  mainPDAs,
  quickPickPDAs,
};

export type { MainPDAs, QuickPickPDAs };
