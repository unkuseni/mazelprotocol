/**
 * Solana RPC helpers for the customer-facing bot.
 *
 * All functions are read-only — they fetch on-chain account data
 * but never submit transactions. No keypair required.
 *
 * Uses MANUAL binary deserialization (no @coral-xyz/anchor dependency)
 * so it works reliably in Cloudflare Workers runtime.
 */

import { Connection, PublicKey } from "@solana/web3.js";
import type { BotConfig } from "./config";
import {
  deriveMainPDAs,
  deriveQPPDAs,
  deriveDrawResultPDA,
  deriveQPDrawResultPDA,
  deriveUserStatsPDA,
} from "./config";

// ============================================================================
// MINIMAL BORSH DESERIALIZER
// ============================================================================
// Cloudflare Workers don't reliably support @coral-xyz/anchor's BorshCoder
// due to Node.js Buffer compatibility issues. Instead we manually parse
// the binary layouts matching the exact Rust struct definitions.

class BorshReader {
  private buf: Uint8Array;
  private offset: number;

  constructor(buf: Uint8Array, offset: number = 0) {
    this.buf = buf;
    this.offset = offset;
  }

  readU8(): number {
    return this.buf[this.offset++];
  }

  readU16(): number {
    const lo = this.buf[this.offset++];
    const hi = this.buf[this.offset++];
    return lo | (hi << 8);
  }

  readU32(): number {
    const b0 = this.buf[this.offset++];
    const b1 = this.buf[this.offset++];
    const b2 = this.buf[this.offset++];
    const b3 = this.buf[this.offset++];
    return (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0;
  }

  readU64(): bigint {
    let lo = 0n;
    let hi = 0n;
    for (let i = 0; i < 4; i++) {
      lo |= BigInt(this.buf[this.offset++]) << BigInt(i * 8);
    }
    for (let i = 0; i < 4; i++) {
      hi |= BigInt(this.buf[this.offset++]) << BigInt(i * 8);
    }
    return lo | (hi << 32n);
  }

  readI64(): bigint {
    const unsigned = this.readU64();
    // Sign-extend
    if (unsigned & (1n << 63n)) {
      return unsigned - (1n << 64n);
    }
    return unsigned;
  }

  readBool(): boolean {
    return this.buf[this.offset++] !== 0;
  }

  readPubkey(): PublicKey {
    const bytes = this.buf.slice(this.offset, this.offset + 32);
    this.offset += 32;
    return new PublicKey(bytes);
  }

  readOptionPubkey(): PublicKey | null {
    const discriminant = this.readU8();
    if (discriminant === 0) return null;
    return this.readPubkey();
  }

  readFixedBytes(len: number): Uint8Array {
    const bytes = this.buf.slice(this.offset, this.offset + len);
    this.offset += len;
    return bytes;
  }

  readU8Array(len: number): number[] {
    const arr: number[] = [];
    for (let i = 0; i < len; i++) {
      arr.push(this.readU8());
    }
    return arr;
  }

  skip(bytes: number): void {
    this.offset += bytes;
  }
}

// ============================================================================
// ACCOUNT DESERIALIZERS — exact field-order matches Rust #[account] structs
// ============================================================================

const ANCHOR_DISCRIMINATOR_LEN = 8;

// --- LotteryState (mazelprotocol) ---
// See: programs/mazelprotocol/src/state.rs
function decodeLotteryState(data: Uint8Array): MainLotteryState {
  const r = new BorshReader(data, ANCHOR_DISCRIMINATOR_LEN);

  return {
    authority: r.readPubkey().toBase58(),
    pendingAuthority: r.readOptionPubkey()?.toBase58() ?? null,
    switchboardQueue: r.readPubkey().toBase58(),
    currentRandomnessAccount: r.readPubkey().toBase58(),
    currentDrawId: r.readU64(),
    jackpotBalance: r.readU64(),
    reserveBalance: r.readU64(),
    insuranceBalance: r.readU64(),
    fixedPrizeBalance: r.readU64(),
    ticketPrice: r.readU64(),
    houseFeeBps: r.readU16(),
    jackpotCap: r.readU64(),
    seedAmount: r.readU64(),
    softCap: r.readU64(),
    hardCap: r.readU64(),
    nextDrawTimestamp: r.readI64(),
    drawInterval: r.readI64(),
    commitSlot: r.readU64(),
    commitTimestamp: r.readI64(),
    currentDrawTickets: r.readU64(),
    totalTicketsSold: r.readU64(),
    totalPrizesPaid: r.readU64(),
    totalPrizesCommitted: r.readU64(),
    isDrawInProgress: r.readBool(),
    isAwaitingFinalization: r.readBool(),
    isRolldownActive: r.readBool(),
    isPaused: r.readBool(),
    isFunded: r.readBool(),
    version: r.readU8(),
    bump: r.readU8(),
    configTimelockEnd: r.readI64(),
    pendingConfigHash: r.readFixedBytes(32),
    emergencyTransferTotal: r.readU64(),
    emergencyTransferWindowStart: r.readI64(),
    maxRolldownTickets: r.readU64(),
  };
}

// --- DrawResult (mazelprotocol) ---
// See: programs/mazelprotocol/src/state.rs
function decodeDrawResult(data: Uint8Array): MainDrawResult {
  const r = new BorshReader(data, ANCHOR_DISCRIMINATOR_LEN);

  return {
    drawId: r.readU64(),
    winningNumbers: r.readU8Array(6),
    randomnessProof: r.readFixedBytes(32),
    timestamp: r.readI64(),
    totalTickets: r.readU64(),
    wasRolldown: r.readBool(),
    match6Winners: r.readU32(),
    match5Winners: r.readU32(),
    match4Winners: r.readU32(),
    match3Winners: r.readU32(),
    match2Winners: r.readU32(),
    match6PrizePerWinner: r.readU64(),
    match5PrizePerWinner: r.readU64(),
    match4PrizePerWinner: r.readU64(),
    match3PrizePerWinner: r.readU64(),
    match2PrizePerWinner: r.readU64(),
    isExplicitlyFinalized: r.readBool(),
    totalCommitted: r.readU64(),
    totalReclaimed: r.readU64(),
    bump: r.readU8(),
  };
}

// --- UserStats (mazelprotocol) ---
// See: programs/mazelprotocol/src/state.rs
function decodeUserStats(data: Uint8Array): UserStats {
  const r = new BorshReader(data, ANCHOR_DISCRIMINATOR_LEN);

  return {
    wallet: r.readPubkey().toBase58(),
    totalTickets: r.readU64(),
    totalSpent: r.readU64(),
    totalWon: r.readU64(),
    currentStreak: r.readU32(),
    bestStreak: r.readU32(),
    jackpotWins: r.readU32(),
    lastDrawParticipated: r.readU64(),
    ticketsThisDraw: r.readU64(),
    freeTicketsAvailable: r.readU32(),
    bump: r.readU8(),
  };
}

// --- QuickPickState (quickpick) ---
// See: programs/quickpick/src/state.rs
function decodeQuickPickState(data: Uint8Array): QPLotteryState {
  const r = new BorshReader(data, ANCHOR_DISCRIMINATOR_LEN);

  const state: QPLotteryState = {
    currentDraw: r.readU64(),
    ticketPrice: r.readU64(),
    pickCount: r.readU8(),
    numberRange: r.readU8(),
    houseFeeBps: r.readU16(),
    drawInterval: r.readI64(),
    nextDrawTimestamp: r.readI64(),
    jackpotBalance: r.readU64(),
    softCap: r.readU64(),
    hardCap: r.readU64(),
    seedAmount: r.readU64(),
    match4Prize: r.readU64(),
    match3Prize: r.readU64(),
    currentDrawTickets: r.readU64(),
    prizePoolBalance: r.readU64(),
    insuranceBalance: r.readU64(),
    reserveBalance: r.readU64(),
    totalTicketsSold: r.readU64(),
    totalPrizesPaid: r.readU64(),
    currentRandomnessAccount: r.readPubkey().toBase58(),
    commitSlot: r.readU64(),
    commitTimestamp: r.readI64(),
    isDrawInProgress: r.readBool(),
    isAwaitingFinalization: r.readBool(),
    isRolldownPending: r.readBool(),
    isPaused: r.readBool(),
    isFunded: r.readBool(),
    bump: r.readU8(),
    configTimelockEnd: r.readI64(),
    pendingConfigHash: r.readFixedBytes(32),
    emergencyTransferTotal: r.readU64(),
    emergencyTransferWindowStart: r.readI64(),
  };

  return state;
}

// --- QuickPickDrawResult (quickpick) ---
// See: programs/quickpick/src/state.rs
function decodeQPDrawResult(data: Uint8Array): QPDrawResult {
  const r = new BorshReader(data, ANCHOR_DISCRIMINATOR_LEN);

  return {
    drawId: r.readU64(),
    winningNumbers: r.readU8Array(5),
    randomnessProof: r.readFixedBytes(32),
    timestamp: r.readI64(),
    totalTickets: r.readU64(),
    wasRolldown: r.readBool(),
    match5Winners: r.readU32(),
    match4Winners: r.readU32(),
    match3Winners: r.readU32(),
    match5PrizePerWinner: r.readU64(),
    match4PrizePerWinner: r.readU64(),
    match3PrizePerWinner: r.readU64(),
    isExplicitlyFinalized: r.readBool(),
    bump: r.readU8(),
  };
}

// ============================================================================
// TYPES
// ============================================================================

export interface MainLotteryState {
  authority: string;
  pendingAuthority: string | null;
  switchboardQueue: string;
  currentRandomnessAccount: string;
  currentDrawId: bigint;
  jackpotBalance: bigint;
  reserveBalance: bigint;
  insuranceBalance: bigint;
  fixedPrizeBalance: bigint;
  ticketPrice: bigint;
  houseFeeBps: number;
  jackpotCap: bigint;
  seedAmount: bigint;
  softCap: bigint;
  hardCap: bigint;
  nextDrawTimestamp: bigint;
  drawInterval: bigint;
  commitSlot: bigint;
  commitTimestamp: bigint;
  currentDrawTickets: bigint;
  totalTicketsSold: bigint;
  totalPrizesPaid: bigint;
  totalPrizesCommitted: bigint;
  isDrawInProgress: boolean;
  isAwaitingFinalization: boolean;
  isRolldownActive: boolean;
  isPaused: boolean;
  isFunded: boolean;
  version: number;
  bump: number;
  configTimelockEnd: bigint;
  pendingConfigHash: Uint8Array;
  emergencyTransferTotal: bigint;
  emergencyTransferWindowStart: bigint;
  maxRolldownTickets: bigint;
}

export interface MainDrawResult {
  drawId: bigint;
  winningNumbers: number[];
  randomnessProof: Uint8Array;
  timestamp: bigint;
  totalTickets: bigint;
  wasRolldown: boolean;
  match6Winners: number;
  match5Winners: number;
  match4Winners: number;
  match3Winners: number;
  match2Winners: number;
  match6PrizePerWinner: bigint;
  match5PrizePerWinner: bigint;
  match4PrizePerWinner: bigint;
  match3PrizePerWinner: bigint;
  match2PrizePerWinner: bigint;
  isExplicitlyFinalized: boolean;
  totalCommitted: bigint;
  totalReclaimed: bigint;
  bump: number;
}

export interface UserStats {
  wallet: string;
  totalTickets: bigint;
  totalSpent: bigint;
  totalWon: bigint;
  currentStreak: number;
  bestStreak: number;
  jackpotWins: number;
  lastDrawParticipated: bigint;
  ticketsThisDraw: bigint;
  freeTicketsAvailable: number;
  bump: number;
}

export interface QPLotteryState {
  currentDraw: bigint;
  ticketPrice: bigint;
  pickCount: number;
  numberRange: number;
  houseFeeBps: number;
  drawInterval: bigint;
  nextDrawTimestamp: bigint;
  jackpotBalance: bigint;
  softCap: bigint;
  hardCap: bigint;
  seedAmount: bigint;
  match4Prize: bigint;
  match3Prize: bigint;
  currentDrawTickets: bigint;
  prizePoolBalance: bigint;
  insuranceBalance: bigint;
  reserveBalance: bigint;
  totalTicketsSold: bigint;
  totalPrizesPaid: bigint;
  currentRandomnessAccount: string;
  commitSlot: bigint;
  commitTimestamp: bigint;
  isDrawInProgress: boolean;
  isAwaitingFinalization: boolean;
  isRolldownPending: boolean;
  isPaused: boolean;
  isFunded: boolean;
  bump: number;
  configTimelockEnd: bigint;
  pendingConfigHash: Uint8Array;
  emergencyTransferTotal: bigint;
  emergencyTransferWindowStart: bigint;
}

export interface QPDrawResult {
  drawId: bigint;
  winningNumbers: number[];
  randomnessProof: Uint8Array;
  timestamp: bigint;
  totalTickets: bigint;
  wasRolldown: boolean;
  match5Winners: number;
  match4Winners: number;
  match3Winners: number;
  match5PrizePerWinner: bigint;
  match4PrizePerWinner: bigint;
  match3PrizePerWinner: bigint;
  isExplicitlyFinalized: boolean;
  bump: number;
}

// ============================================================================
// CONNECTION MANAGEMENT
// ============================================================================

let _connection: Connection | undefined;
let _config: BotConfig | undefined;

export function initSolana(config: BotConfig): void {
  _config = config;
  _connection = new Connection(config.rpcUrl, {
    commitment: config.commitment,
    confirmTransactionInitialTimeout: 30_000,
  });
}

function getConnection(): Connection {
  if (!_connection) throw new Error("Solana not initialized. Call initSolana().");
  return _connection;
}

function getConfig(): BotConfig {
  if (!_config) throw new Error("Solana not initialized. Call initSolana().");
  return _config;
}

// ============================================================================
// PUBLIC FETCHERS
// ============================================================================

export async function fetchMainLotteryState(): Promise<MainLotteryState> {
  const config = getConfig();
  const connection = getConnection();
  const { lotteryState } = deriveMainPDAs(config.mainProgramId);
  const accountInfo = await connection.getAccountInfo(lotteryState, config.commitment);

  if (!accountInfo) {
    throw new Error("Main lottery state account not found. Program may not be initialized.");
  }

  return decodeLotteryState(new Uint8Array(accountInfo.data));
}

export async function fetchQPLotteryState(): Promise<QPLotteryState> {
  const config = getConfig();
  const connection = getConnection();
  const { quickPickState } = deriveQPPDAs(config.qpProgramId);
  const accountInfo = await connection.getAccountInfo(quickPickState, config.commitment);

  if (!accountInfo) {
    throw new Error("Quick Pick state account not found. Program may not be initialized.");
  }

  return decodeQuickPickState(new Uint8Array(accountInfo.data));
}

export async function fetchMainDrawResult(
  drawId: number | bigint,
): Promise<MainDrawResult | null> {
  const config = getConfig();
  const connection = getConnection();
  const [drawResultPDA] = deriveDrawResultPDA(drawId, config.mainProgramId);
  const accountInfo = await connection.getAccountInfo(drawResultPDA, config.commitment);

  if (!accountInfo) return null;

  return decodeDrawResult(new Uint8Array(accountInfo.data));
}

export async function fetchQPDrawResult(
  drawId: number | bigint,
): Promise<QPDrawResult | null> {
  const config = getConfig();
  const connection = getConnection();
  const [drawResultPDA] = deriveQPDrawResultPDA(drawId, config.qpProgramId);
  const accountInfo = await connection.getAccountInfo(drawResultPDA, config.commitment);

  if (!accountInfo) return null;

  return decodeQPDrawResult(new Uint8Array(accountInfo.data));
}

export async function fetchUserStats(
  walletAddress: string,
): Promise<UserStats | null> {
  const config = getConfig();
  const connection = getConnection();
  const wallet = new PublicKey(walletAddress);
  const [userStatsPDA] = deriveUserStatsPDA(wallet, config.mainProgramId);
  const accountInfo = await connection.getAccountInfo(userStatsPDA, config.commitment);

  if (!accountInfo) return null;

  return decodeUserStats(new Uint8Array(accountInfo.data));
}
