/**
 * Simple JSON file-based store for user wallet state.
 *
 * Tracks:
 *  - Registered wallet addresses per Telegram user
 *  - USDC balance deposited with the bot
 *  - Ticket purchase history
 *
 * Thread-safe for single-process use. For multi-process, swap with SQLite.
 */

import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UserRecord {
  /** Telegram user ID */
  telegramId: number;
  /** Telegram username */
  username: string;
  /** Registered Solana wallet address */
  walletAddress: string;
  /** USDC balance held by the bot (in lamports, 6 decimals) */
  balanceLamports: bigint;
  /** Total deposited (lifetime) */
  totalDeposited: bigint;
  /** Total spent on tickets (lifetime) */
  totalSpent: bigint;
  /** Last deposit transaction signature */
  lastDepositTx: string | null;
  /** Tickets purchased count */
  ticketsPurchased: number;
  /** When the user registered */
  registeredAt: string;
  /** Last activity timestamp */
  lastActivity: string;
}

export interface TicketRecord {
  telegramId: number;
  lottery: "main" | "qp";
  drawId: number;
  numbers: number[];
  txSignature: string;
  purchasedAt: string;
}

interface StoreData {
  users: Record<number, UserRecord>; // keyed by telegramId
  tickets: TicketRecord[];
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const STORE_FILE = path.join(process.cwd(), "data", "store.json");

let _data: StoreData | null = null;

function ensureDir(): void {
  const dir = path.dirname(STORE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function load(): StoreData {
  if (_data) return _data;
  ensureDir();
  try {
    if (fs.existsSync(STORE_FILE)) {
      const raw = fs.readFileSync(STORE_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      // Convert balance fields back to BigInt
      _data = {
        users: {},
        tickets: parsed.tickets || [],
      };
      for (const [id, user] of Object.entries(parsed.users || {})) {
        const u = user as any;
        _data.users[Number(id)] = {
          ...u,
          balanceLamports: BigInt(u.balanceLamports || "0"),
          totalDeposited: BigInt(u.totalDeposited || "0"),
          totalSpent: BigInt(u.totalSpent || "0"),
        };
      }
      return _data;
    }
  } catch (err) {
    console.error(`[store] Error loading ${STORE_FILE}:`, err);
  }
  _data = { users: {}, tickets: [] };
  return _data;
}

function save(): void {
  if (!_data) return;
  ensureDir();
  // Convert BigInts to strings for JSON serialization
  const serializable = {
    users: {} as Record<string, any>,
    tickets: _data.tickets,
  };
  for (const [id, user] of Object.entries(_data.users)) {
    serializable.users[id] = {
      ...user,
      balanceLamports: user.balanceLamports.toString(),
      totalDeposited: user.totalDeposited.toString(),
      totalSpent: user.totalSpent.toString(),
    };
  }
  fs.writeFileSync(STORE_FILE, JSON.stringify(serializable, null, 2), "utf-8");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getUser(telegramId: number): UserRecord | null {
  const data = load();
  return data.users[telegramId] || null;
}

export function registerUser(
  telegramId: number,
  username: string,
  walletAddress: string,
): UserRecord {
  const data = load();
  const now = new Date().toISOString();

  const existing = data.users[telegramId];
  if (existing) {
    // Update wallet address if re-registering
    existing.walletAddress = walletAddress;
    existing.username = username;
    existing.lastActivity = now;
    save();
    return existing;
  }

  const user: UserRecord = {
    telegramId,
    username,
    walletAddress,
    balanceLamports: 0n,
    totalDeposited: 0n,
    totalSpent: 0n,
    lastDepositTx: null,
    ticketsPurchased: 0,
    registeredAt: now,
    lastActivity: now,
  };

  data.users[telegramId] = user;
  save();
  return user;
}

export function creditBalance(telegramId: number, amountLamports: bigint, txSig: string): UserRecord | null {
  const data = load();
  const user = data.users[telegramId];
  if (!user) return null;

  user.balanceLamports = user.balanceLamports + amountLamports;
  user.totalDeposited = user.totalDeposited + amountLamports;
  user.lastDepositTx = txSig;
  user.lastActivity = new Date().toISOString();
  save();
  return user;
}

export function debitBalance(telegramId: number, amountLamports: bigint): UserRecord | null {
  const data = load();
  const user = data.users[telegramId];
  if (!user) return null;
  if (user.balanceLamports < amountLamports) return null; // insufficient funds

  user.balanceLamports = user.balanceLamports - amountLamports;
  user.totalSpent = user.totalSpent + amountLamports;
  user.ticketsPurchased += 1;
  user.lastActivity = new Date().toISOString();
  save();
  return user;
}

export function recordTicketPurchase(
  telegramId: number,
  lottery: "main" | "qp",
  drawId: number,
  numbers: number[],
  txSignature: string,
): void {
  const data = load();
  data.tickets.push({
    telegramId,
    lottery,
    drawId,
    numbers,
    txSignature,
    purchasedAt: new Date().toISOString(),
  });
  // Keep only last 1000 tickets
  if (data.tickets.length > 1000) {
    data.tickets = data.tickets.slice(-1000);
  }
  save();
}

export function getUserTickets(telegramId: number, limit = 10): TicketRecord[] {
  const data = load();
  return data.tickets
    .filter((t) => t.telegramId === telegramId)
    .slice(-limit)
    .reverse();
}
