import {
  Connection,
  type PublicKey,
  type Signer,
  Transaction,
  type TransactionInstruction,
  type Commitment,
} from "@solana/web3.js";
import { env } from "@/env";

// ---------------------------------------------------------------------------
// Connection configuration
// ---------------------------------------------------------------------------

/** Default commitment level for read operations */
export const DEFAULT_COMMITMENT: Commitment = "confirmed";

/** Commitment level for sending transactions */
export const SEND_COMMITMENT: Commitment = "processed";

/** Commitment level for confirming transactions */
export const CONFIRM_COMMITMENT: Commitment = "confirmed";

/** Maximum number of retries for failed transactions */
export const MAX_TRANSACTION_RETRIES = 3;

/** Delay between retries in milliseconds */
export const RETRY_DELAY_MS = 1000;

/** Priority fee micro-lamports (optional) */
export const PRIORITY_FEE_MICRO_LAMPORTS = 1000;

/** Compute unit limit for transactions */
export const COMPUTE_UNIT_LIMIT = 200_000;

// ---------------------------------------------------------------------------
// Connection singleton
// ---------------------------------------------------------------------------

let connectionSingleton: Connection | null = null;
let wsConnectionSingleton: Connection | null = null;

/**
 * Get the main RPC connection singleton.
 * Lazily initializes the connection if it doesn't exist.
 */
export function getConnection(): Connection {
  if (!connectionSingleton) {
    const rpcUrl = env.VITE_SOLANA_RPC_URL;

    if (!rpcUrl) {
      throw new Error("VITE_SOLANA_RPC_URL environment variable is not set");
    }

    // WebSocket URL for subscriptions (optional)
    const wsUrl = env.VITE_SOLANA_WS_URL;

    connectionSingleton = new Connection(rpcUrl, {
      commitment: DEFAULT_COMMITMENT,
      wsEndpoint: wsUrl,
      disableRetryOnRateLimit: false,
      confirmTransactionInitialTimeout: 60_000, // 60 seconds
    });

    console.log(`[Solana] Connection initialized to ${rpcUrl}`);

    // Test the connection
    testConnection(connectionSingleton).catch((error) => {
      console.warn(`[Solana] Connection test failed: ${error.message}`);
    });
  }

  return connectionSingleton;
}

/**
 * Get a WebSocket connection for real-time updates.
 * This uses a separate connection instance to avoid mixing RPC and WS operations.
 */
export function getWsConnection(): Connection {
  if (!wsConnectionSingleton) {
    const wsUrl =
      env.VITE_SOLANA_WS_URL ||
      env.VITE_SOLANA_RPC_URL.replace("https://", "wss://").replace(
        "http://",
        "ws://",
      );

    wsConnectionSingleton = new Connection(wsUrl, {
      commitment: DEFAULT_COMMITMENT,
      wsEndpoint: wsUrl,
    });

    console.log(`[Solana] WebSocket connection initialized to ${wsUrl}`);
  }

  return wsConnectionSingleton;
}

/**
 * Test the connection by fetching the latest slot.
 */
async function testConnection(conn: Connection): Promise<void> {
  try {
    const slot = await conn.getSlot();
    console.log(`[Solana] Connection test successful. Latest slot: ${slot}`);
  } catch (error) {
    console.error(`[Solana] Connection test failed:`, error);
    throw error;
  }
}

/**
 * Get a fresh connection with custom configuration.
 * Useful for specific operations that need different settings.
 */
export function createCustomConnection(
  commitment: Commitment = DEFAULT_COMMITMENT,
  wsEndpoint?: string,
): Connection {
  const rpcUrl = env.VITE_SOLANA_RPC_URL;

  if (!rpcUrl) {
    throw new Error("VITE_SOLANA_RPC_URL environment variable is not set");
  }

  return new Connection(rpcUrl, {
    commitment,
    wsEndpoint: wsEndpoint || env.VITE_SOLANA_WS_URL,
    disableRetryOnRateLimit: false,
  });
}

// ---------------------------------------------------------------------------
// Transaction utilities
// ---------------------------------------------------------------------------

export interface SendAndConfirmTransactionOptions
  extends SendTransactionOption {
  /** Maximum number of retries (default: MAX_TRANSACTION_RETRIES) */
  maxRetries?: number;
  /** Delay between retries in milliseconds (default: RETRY_DELAY_MS) */
  retryDelayMs?: number;
  /** Skip preflight checks (default: false) */
  skipPreflight?: boolean;
  /** Commitment level for confirmation (default: CONFIRM_COMMITMENT) */
  confirmationCommitment?: Commitment;
}

/**
 * Send and confirm a transaction with retry logic.
 *
 * @param transaction - The transaction to send
 * @param signers - Array of signers (includes fee payer)
 * @param connection - Optional connection (uses singleton if not provided)
 * @param options - Additional options for sending and confirmation
 * @returns Transaction signature
 */
export async function sendAndConfirmTransaction(
  transaction: Transaction,
  signers: Signer[],
  connection?: Connection,
  options: SendAndConfirmTransactionOptions = {},
): Promise<string> {
  const conn = connection || getConnection();
  const {
    maxRetries = MAX_TRANSACTION_RETRIES,
    retryDelayMs = RETRY_DELAY_MS,
    skipPreflight = false,
    confirmationCommitment = CONFIRM_COMMITMENT,
    ...sendOptions
  } = options;

  // Sign the transaction
  if (signers.length > 0) {
    transaction.sign(...signers);
  }

  const rawTransaction = transaction.serialize();
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const signature = await conn.sendRawTransaction(rawTransaction, {
        skipPreflight,
        preflightCommitment: SEND_COMMITMENT,
        ...sendOptions,
      });

      console.log(
        `[Solana] Transaction sent (attempt ${attempt + 1}/${maxRetries}): ${signature}`,
      );

      // Wait for confirmation
      const confirmation = await conn.confirmTransaction(
        {
          signature,
          abortSignal: AbortSignal.timeout(120_000), // 2 minute timeout
        },
        confirmationCommitment,
      );

      if (confirmation.value.err) {
        throw new Error(
          `Transaction failed: ${JSON.stringify(confirmation.value.err)}`,
        );
      }

      console.log(`[Solana] Transaction confirmed: ${signature}`);
      return signature;
    } catch (error) {
      lastError = error as Error;
      console.warn(
        `[Solana] Transaction attempt ${attempt + 1} failed:`,
        error,
      );

      if (attempt < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }
  }

  throw new Error(
    `Failed to send transaction after ${maxRetries} attempts. Last error: ${lastError?.message}`,
  );
}

/**
 * Build and send a transaction with a single instruction.
 *
 * @param instruction - The instruction to include in the transaction
 * @param payer - The fee payer (must sign)
 * @param signers - Additional signers (optional)
 * @param connection - Optional connection (uses singleton if not provided)
 * @returns Transaction signature
 */
export async function sendInstruction(
  instruction: TransactionInstruction,
  payer: Signer,
  signers: Signer[] = [],
  connection?: Connection,
): Promise<string> {
  const transaction = new Transaction();
  transaction.add(instruction);
  transaction.feePayer = payer.publicKey;

  const allSigners = [payer, ...signers];
  return sendAndConfirmTransaction(transaction, allSigners, connection);
}

/**
 * Build and send a transaction with multiple instructions.
 *
 * @param instructions - Array of instructions to include
 * @param payer - The fee payer (must sign)
 * @param signers - Additional signers (optional)
 * @param connection - Optional connection (uses singleton if not provided)
 * @returns Transaction signature
 */
export async function sendInstructions(
  instructions: TransactionInstruction[],
  payer: Signer,
  signers: Signer[] = [],
  connection?: Connection,
): Promise<string> {
  const transaction = new Transaction();
  instructions.forEach((instruction) => transaction.add(instruction));
  transaction.feePayer = payer.publicKey;

  const allSigners = [payer, ...signers];
  return sendAndConfirmTransaction(transaction, allSigners, connection);
}

// ---------------------------------------------------------------------------
// Account utilities
// ---------------------------------------------------------------------------

/**
 * Get account info with retry logic.
 *
 * @param publicKey - The public key of the account
 * @param commitment - Commitment level (default: DEFAULT_COMMITMENT)
 * @param connection - Optional connection (uses singleton if not provided)
 * @returns Account info or null if account doesn't exist
 */
export async function getAccountInfo<T>(
  publicKey: PublicKey,
  commitment: Commitment = DEFAULT_COMMITMENT,
  connection?: Connection,
): Promise<{
  pubkey: PublicKey;
  account: { data: T; owner: PublicKey; lamports: number; executable: boolean };
} | null> {
  const conn = connection || getConnection();

  try {
    const accountInfo = await conn.getAccountInfo(publicKey, commitment);

    if (!accountInfo) {
      return null;
    }

    return {
      pubkey: publicKey,
      account: {
        data: accountInfo.data as T,
        owner: accountInfo.owner,
        lamports: accountInfo.lamports,
        executable: accountInfo.executable,
      },
    };
  } catch (error) {
    console.error(
      `[Solana] Failed to get account info for ${publicKey.toBase58()}:`,
      error,
    );
    throw error;
  }
}

/**
 * Get multiple account infos in a single request.
 *
 * @param publicKeys - Array of public keys
 * @param commitment - Commitment level (default: DEFAULT_COMMITMENT)
 * @param connection - Optional connection (uses singleton if not provided)
 * @returns Array of account infos (null for non-existent accounts)
 */
export async function getMultipleAccountsInfo(
  publicKeys: PublicKey[],
  commitment: Commitment = DEFAULT_COMMITMENT,
  connection?: Connection,
): Promise<
  (ReturnType<typeof getAccountInfo> extends Promise<infer T> ? T : never)[]
> {
  const conn = connection || getConnection();

  try {
    const accounts = await conn.getMultipleAccountsInfo(publicKeys, commitment);

    return accounts.map((account, index) => {
      if (!account) {
        return null;
      }

      return {
        pubkey: publicKeys[index],
        account: {
          data: account.data,
          owner: account.owner,
          lamports: account.lamports,
          executable: account.executable,
        },
      };
    });
  } catch (error) {
    console.error(`[Solana] Failed to get multiple account infos:`, error);
    throw error;
  }
}

/**
 * Get program accounts with optional filters.
 *
 * @param programId - The program ID
 * @param filters - Optional filters
 * @param commitment - Commitment level (default: DEFAULT_COMMITMENT)
 * @param connection - Optional connection (uses singleton if not provided)
 * @returns Array of program accounts
 */
export async function getProgramAccounts(
  programId: PublicKey,
  filters?: any[],
  commitment: Commitment = DEFAULT_COMMITMENT,
  connection?: Connection,
): Promise<
  Array<{
    pubkey: PublicKey;
    account: {
      data: Buffer;
      owner: PublicKey;
      lamports: number;
      executable: boolean;
    };
  }>
> {
  const conn = connection || getConnection();

  try {
    const accounts = await conn.getProgramAccounts(programId, {
      filters,
      commitment,
    });

    return accounts.map(({ pubkey, account }) => ({
      pubkey,
      account: {
        data: account.data,
        owner: account.owner,
        lamports: account.lamports,
        executable: account.executable,
      },
    }));
  } catch (error) {
    console.error(
      `[Solana] Failed to get program accounts for ${programId.toBase58()}:`,
      error,
    );
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Subscription utilities
// ---------------------------------------------------------------------------

/**
 * Subscribe to account changes.
 *
 * @param publicKey - The public key to subscribe to
 * @param callback - Function called when account changes
 * @param commitment - Commitment level (default: DEFAULT_COMMITMENT)
 * @param connection - Optional connection (uses WS singleton by default)
 * @returns Subscription ID that can be used to unsubscribe
 */
export function subscribeToAccountChanges(
  publicKey: PublicKey,
  callback: (
    accountInfo: {
      data: Buffer;
      owner: PublicKey;
      lamports: number;
      executable: boolean;
    } | null,
  ) => void,
  commitment: Commitment = DEFAULT_COMMITMENT,
  connection?: Connection,
): number {
  const conn = connection || getWsConnection();

  return conn.onAccountChange(
    publicKey,
    (accountInfo) => {
      callback(accountInfo);
    },
    commitment,
  );
}

/**
 * Unsubscribe from account changes.
 *
 * @param subscriptionId - The subscription ID returned by subscribeToAccountChanges
 * @param connection - Optional connection (uses WS singleton by default)
 */
export function unsubscribeFromAccountChanges(
  subscriptionId: number,
  connection?: Connection,
): Promise<void> {
  const conn = connection || getWsConnection();
  return conn.removeAccountChangeListener(subscriptionId);
}

/**
 * Subscribe to slot changes.
 *
 * @param callback - Function called when slot changes
 * @param connection - Optional connection (uses WS singleton by default)
 * @returns Subscription ID that can be used to unsubscribe
 */
export function subscribeToSlotChanges(
  callback: (slotInfo: { slot: number; parent: number; root: number }) => void,
  connection?: Connection,
): number {
  const conn = connection || getWsConnection();

  return conn.onSlotChange((slotInfo) => {
    callback(slotInfo);
  });
}

/**
 * Unsubscribe from slot changes.
 *
 * @param subscriptionId - The subscription ID returned by subscribeToSlotChanges
 * @param connection - Optional connection (uses WS singleton by default)
 */
export function unsubscribeFromSlotChanges(
  subscriptionId: number,
  connection?: Connection,
): Promise<void> {
  const conn = connection || getWsConnection();
  return conn.removeSlotChangeListener(subscriptionId);
}

// ---------------------------------------------------------------------------
// Balance utilities
// ---------------------------------------------------------------------------

/**
 * Get SOL balance for an account.
 *
 * @param publicKey - The public key of the account
 * @param commitment - Commitment level (default: DEFAULT_COMMITMENT)
 * @param connection - Optional connection (uses singleton if not provided)
 * @returns Balance in lamports
 */
export async function getBalance(
  publicKey: PublicKey,
  commitment: Commitment = DEFAULT_COMMITMENT,
  connection?: Connection,
): Promise<number> {
  const conn = connection || getConnection();

  try {
    return await conn.getBalance(publicKey, commitment);
  } catch (error) {
    console.error(
      `[Solana] Failed to get balance for ${publicKey.toBase58()}:`,
      error,
    );
    throw error;
  }
}

/**
 * Get token account balance.
 *
 * @param tokenAccount - The token account public key
 * @param commitment - Commitment level (default: DEFAULT_COMMITMENT)
 * @param connection - Optional connection (uses singleton if not provided)
 * @returns Token account balance information
 */
export async function getTokenAccountBalance(
  tokenAccount: PublicKey,
  commitment: Commitment = DEFAULT_COMMITMENT,
  connection?: Connection,
): Promise<{
  amount: string;
  decimals: number;
  uiAmount: number | null;
  uiAmountString?: string;
}> {
  const conn = connection || getConnection();

  try {
    return await conn.getTokenAccountBalance(tokenAccount, commitment);
  } catch (error) {
    console.error(
      `[Solana] Failed to get token account balance for ${tokenAccount.toBase58()}:`,
      error,
    );
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Network utilities
// ---------------------------------------------------------------------------

/**
 * Get the current slot.
 *
 * @param connection - Optional connection (uses singleton if not provided)
 * @returns Current slot number
 */
export async function getCurrentSlot(connection?: Connection): Promise<number> {
  const conn = connection || getConnection();
  return conn.getSlot();
}

/**
 * Get the recent performance samples.
 *
 * @param limit - Number of samples to return (max: 720)
 * @param connection - Optional connection (uses singleton if not provided)
 * @returns Array of performance samples
 */
export async function getRecentPerformanceSamples(
  limit: number = 5,
  connection?: Connection,
): Promise<
  Array<{
    slot: number;
    numTransactions: number;
    numSlots: number;
    samplePeriodSecs: number;
  }>
> {
  const conn = connection || getConnection();
  return conn.getRecentPerformanceSamples(limit);
}

/**
 * Get the version of the Solana node.
 *
 * @param connection - Optional connection (uses singleton if not provided)
 * @returns Node version information
 */
export async function getVersion(
  connection?: Connection,
): Promise<{ "solana-core": string; "feature-set"?: number }> {
  const conn = connection || getConnection();
  return conn.getVersion();
}
