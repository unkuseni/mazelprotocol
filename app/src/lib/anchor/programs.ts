// NOTE: This file is designed for Cloudflare Workers SSR compatibility.
// @coral-xyz/anchor uses CommonJS patterns (`exports`) that the Workers runtime
// does not support, so all Anchor usage is deferred until client-side execution
// via dynamic import().  @solana/web3.js and the global `Buffer` polyfill (provided
// by web3.js) are safe for both environments.

import type { Connection, PublicKey } from "@solana/web3.js";
import type { Idl, BN } from "@coral-xyz/anchor";

// IDL files — pure JSON, always safe
import mainLotteryIdl from "./idl/mazelprotocol.json";
import quickPickIdl from "./idl/quickpick.json";

// Local modules — no problematic Node.js dependencies
import { getConnection } from "./connection";
import { MAIN_LOTTERY_PROGRAM_ID, QUICK_PICK_PROGRAM_ID, USDC_MINT, mainPDAs, quickPickPDAs, type MainPDAs, type QuickPickPDAs } from "./pda";

// ---------------------------------------------------------------------------
// Guards & lazy module holder
// ---------------------------------------------------------------------------

const isClient = typeof window !== "undefined";

/** Lazily-initialised Anchor module handle (client-side only). */
let _anchor: typeof import("@coral-xyz/anchor") | null = null;
let _solana: typeof import("@solana/web3.js") | null = null;

async function ensureDeps() {
  if (!isClient) return null;
  if (!_anchor) {
    _anchor = await import("@coral-xyz/anchor");
    _solana = await import("@solana/web3.js");
  }
  return { anchor: _anchor!, solana: _solana! };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MainLotteryProgram {
  programId: PublicKey;
  account: Record<
    string,
    {
      fetch: (addr: PublicKey) => Promise<unknown>;
      all: (filters?: unknown[]) => Promise<
        Array<{ publicKey: PublicKey; account: Record<string, unknown> }>
      >;
    }
  >;
}

export interface QuickPickProgram {
  programId: PublicKey;
  account: Record<
    string,
    {
      fetch: (addr: PublicKey) => Promise<unknown>;
      all: (filters?: unknown[]) => Promise<
        Array<{ publicKey: PublicKey; account: Record<string, unknown> }>
      >;
    }
  >;
}

export interface ProgramClients {
  mainLottery: MainLotteryProgram;
  quickPick: QuickPickProgram;
}

// ---------------------------------------------------------------------------
// IDL helpers
// ---------------------------------------------------------------------------

export function getMainLotteryIdl(): Idl {
  return mainLotteryIdl as unknown as Idl;
}

export function getQuickPickIdl(): Idl {
  return quickPickIdl as unknown as Idl;
}

// ---------------------------------------------------------------------------
// Anchor-program creation (client-only)
// ---------------------------------------------------------------------------

/** Create a read-only Anchor provider. Returns `null` during SSR. */
export async function createReadOnlyProvider(
  connection?: Connection,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any | null> {
  const deps = await ensureDeps();
  if (!deps) return null;
  const { anchor, solana } = deps;

  const conn = connection || getConnection();
  const dummyWallet = {
    publicKey: solana.Keypair.generate().publicKey,
    signTransaction: () =>
      Promise.reject(new Error("Read-only wallet cannot sign")),
    signAllTransactions: () =>
      Promise.reject(new Error("Read-only wallet cannot sign")),
  };

  return new anchor.AnchorProvider(conn, dummyWallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
    skipPreflight: false,
  });
}

/** Create a Main Lottery program client. Returns `null` during SSR. */
export async function createMainLotteryProgram(
  connection?: Connection,
): Promise<MainLotteryProgram | null> {
  const deps = await ensureDeps();
  if (!deps) return null;
  const provider = await createReadOnlyProvider(connection);
  const program = new deps.anchor.Program(getMainLotteryIdl(), provider);
  return {
    programId: program.programId as unknown as PublicKey,
    account: program.account as unknown as MainLotteryProgram["account"],
  };
}

/** Create a Quick Pick program client. Returns `null` during SSR. */
export async function createQuickPickProgram(
  connection?: Connection,
): Promise<QuickPickProgram | null> {
  const deps = await ensureDeps();
  if (!deps) return null;
  const provider = await createReadOnlyProvider(connection);
  const program = new deps.anchor.Program(getQuickPickIdl(), provider);
  return {
    programId: program.programId as unknown as PublicKey,
    account: program.account as unknown as QuickPickProgram["account"],
  };
}

/**
 * Create a Main Lottery program from an already-initialized provider.
 * Only works on the client side.
 */
export async function createMainLotteryProgramWithProvider(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  provider: any,
): Promise<MainLotteryProgram | null> {
  const deps = await ensureDeps();
  if (!deps) return null;
  const program = new deps.anchor.Program(getMainLotteryIdl(), provider);
  return {
    programId: program.programId as unknown as PublicKey,
    account: program.account as unknown as MainLotteryProgram["account"],
  };
}

/**
 * Create a Quick Pick program from an already-initialized provider.
 * Only works on the client side.
 */
export async function createQuickPickProgramWithProvider(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  provider: any,
): Promise<QuickPickProgram | null> {
  const deps = await ensureDeps();
  if (!deps) return null;
  const program = new deps.anchor.Program(getQuickPickIdl(), provider);
  return {
    programId: program.programId as unknown as PublicKey,
    account: program.account as unknown as QuickPickProgram["account"],
  };
}

export async function createProgramClients(
  connection?: Connection,
): Promise<ProgramClients | null> {
  const [main, qp] = await Promise.all([
    createMainLotteryProgram(connection),
    createQuickPickProgram(connection),
  ]);
  if (!main || !qp) return null;
  return { mainLottery: main, quickPick: qp };
}

// ---------------------------------------------------------------------------
// Low-level account helpers
// ---------------------------------------------------------------------------

async function fetchAccount(
  program: MainLotteryProgram | QuickPickProgram,
  accountName: string,
  address: PublicKey,
): Promise<Record<string, unknown> | null> {
  try {
    const acc = program.account[accountName];
    if (!acc) return null;
    return (await acc.fetch(address)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function fetchAllAccounts(
  program: MainLotteryProgram | QuickPickProgram,
  accountName: string,
  filters?: Array<{ memcmp: { offset: number; bytes: string } }>,
): Promise<Array<{ publicKey: PublicKey; account: Record<string, unknown> }>> {
  try {
    const acc = program.account[accountName];
    if (!acc) return [];
    return (await acc.all(filters)) as Array<{
      publicKey: PublicKey;
      account: Record<string, unknown>;
    }>;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Safe 8-byte little-endian helpers (no Buffer import needed)
// ---------------------------------------------------------------------------

/** Write a number as 8-byte little-endian into a Uint8Array. */
function writeU64LE(value: number | bigint): Uint8Array {
  const buf = new Uint8Array(8);
  const v = BigInt(value);
  for (let i = 0; i < 8; i++) {
    buf[i] = Number((v >> BigInt(i * 8)) & 0xffn);
  }
  return buf;
}

/**
 * Convert a number to a base64-encoded 8-byte LE string, matching
 * `new BN(n).toArrayLike(Buffer, "le", 8).toString("base64")`.
 */
function bnToBase64LE(value: number | bigint | string): string {
  const buf = writeU64LE(typeof value === "string" ? BigInt(value) : value);
  // base64-encode the Uint8Array using btoa
  const binary = Array.from(buf, (b) => String.fromCharCode(b)).join("");
  return btoa(binary);
}

// ---------------------------------------------------------------------------
// Main Lottery fetchers
// ---------------------------------------------------------------------------

export async function fetchMainLotteryState(
  connection?: Connection,
): Promise<Record<string, unknown> | null> {
  if (!isClient) return null;
  try {
    const program = await createMainLotteryProgram(connection);
    if (!program) return null;
    return await fetchAccount(program, "lotteryState", mainPDAs.lotteryState);
  } catch (error) {
    console.warn("Failed to fetch main lottery state:", error);
    return null;
  }
}

export async function fetchMainDrawResult(
  drawId: number | BN,
  connection?: Connection,
): Promise<Record<string, unknown> | null> {
  if (!isClient) return null;
  try {
    const program = await createMainLotteryProgram(connection);
    if (!program) return null;

    const deps = await ensureDeps();
    if (!deps) return null;

    const [pda] = deps.solana.PublicKey.findProgramAddressSync(
      [Buffer.from("draw"), writeU64LE(BigInt(drawId.toString()))],
      program.programId,
    );
    return await fetchAccount(program, "drawResult", pda);
  } catch (error) {
    console.warn(`Failed to fetch main draw result for draw ${drawId}:`, error);
    return null;
  }
}

export async function fetchUserMainTicketsForDraw(
  user: PublicKey,
  drawId: number | BN,
  connection?: Connection,
): Promise<Array<{ publicKey: PublicKey; account: Record<string, unknown> }>> {
  if (!isClient) return [];
  try {
    const program = await createMainLotteryProgram(connection);
    if (!program) return [];

    const filters = [
      { memcmp: { offset: 8, bytes: user.toBase58() } },
      {
        memcmp: {
          offset: 40,
          bytes: bnToBase64LE(drawId.toString()),
        },
      },
    ];

    const tickets = await fetchAllAccounts(program, "ticket", filters);
    // SECURITY (review H5): preserve the on-chain ticket pubkey. Claims must
    // target the real ticket PDA (seeded by the draw-time ticket counter), not
    // a re-derived index from an array position.
    return tickets.map((t) => ({ publicKey: t.publicKey, account: t.account }));
  } catch (error) {
    console.warn(`Failed to fetch user tickets for draw ${drawId}:`, error);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Quick Pick fetchers
// ---------------------------------------------------------------------------

export async function fetchQuickPickState(
  connection?: Connection,
): Promise<Record<string, unknown> | null> {
  if (!isClient) return null;
  try {
    const program = await createQuickPickProgram(connection);
    if (!program) return null;
    return await fetchAccount(program, "quickPickState", quickPickPDAs.quickPickState);
  } catch (error) {
    console.warn("Failed to fetch Quick Pick state:", error);
    return null;
  }
}

export async function fetchQuickPickDrawResult(
  drawId: number | BN,
  connection?: Connection,
): Promise<Record<string, unknown> | null> {
  if (!isClient) return null;
  try {
    const program = await createQuickPickProgram(connection);
    if (!program) return null;

    const deps = await ensureDeps();
    if (!deps) return null;

    const [pda] = deps.solana.PublicKey.findProgramAddressSync(
      [Buffer.from("quick_pick_draw"), writeU64LE(BigInt(drawId.toString()))],
      program.programId,
    );
    return await fetchAccount(program, "drawResult", pda);
  } catch (error) {
    console.warn(`Failed to fetch Quick Pick draw result for draw ${drawId}:`, error);
    return null;
  }
}

export async function fetchUserQuickPickTicketsForDraw(
  user: PublicKey,
  drawId: number | BN,
  connection?: Connection,
): Promise<Array<{ publicKey: PublicKey; account: Record<string, unknown> }>> {
  if (!isClient) return [];
  try {
    const program = await createQuickPickProgram(connection);
    if (!program) return [];

    const filters = [
      { memcmp: { offset: 8, bytes: user.toBase58() } },
      {
        memcmp: {
          offset: 40,
          bytes: bnToBase64LE(drawId.toString()),
        },
      },
    ];

    const tickets = await fetchAllAccounts(program, "ticket", filters);
    // SECURITY (review H5): preserve the on-chain ticket pubkey (see
    // fetchUserMainTicketsForDraw).
    return tickets.map((t) => ({ publicKey: t.publicKey, account: t.account }));
  } catch (error) {
    console.warn(`Failed to fetch user Quick Pick tickets for draw ${drawId}:`, error);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Combined
// ---------------------------------------------------------------------------

export async function fetchAllLotteryData(
  connection?: Connection,
): Promise<{
  mainState: Record<string, unknown> | null;
  quickPickState: Record<string, unknown> | null;
}> {
  const [mainState, quickPickState] = await Promise.all([
    fetchMainLotteryState(connection),
    fetchQuickPickState(connection),
  ]);
  return { mainState, quickPickState };
}

export async function fetchUserActiveTickets(
  _user: PublicKey,
  _connection?: Connection,
): Promise<{
  mainTickets: Record<string, unknown>[];
  quickPickTickets: Record<string, unknown>[];
}> {
  return { mainTickets: [], quickPickTickets: [] };
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export {
  MAIN_LOTTERY_PROGRAM_ID,
  QUICK_PICK_PROGRAM_ID,
  USDC_MINT,
  mainPDAs,
  quickPickPDAs,
};

export type { MainPDAs, QuickPickPDAs };
