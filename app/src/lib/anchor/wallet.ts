import React, { useCallback } from "react";
import {
  type Connection,
  PublicKey,
  type Transaction,
  type VersionedTransaction,
  type SendOptions,
} from "@solana/web3.js";
import { useAppKitAccount, useAppKit } from "@/lib/appkit-provider";
import { getSolanaAdapter } from "@/lib/appkit";

/**
 * Wallet hook for signing transactions using Reown AppKit adapter
 * Provides functions to sign transactions, sign messages, and get wallet state
 */
export function useWallet() {
  const { address, isConnected } = useAppKitAccount();
  const { open: openWalletModal } = useAppKit();
  const solanaAdapter = getSolanaAdapter();

  /**
   * Get the user's public key
   * Returns null if wallet is not connected
   */
  const publicKey = React.useMemo(() => {
    if (!address) return null;
    try {
      return new PublicKey(address);
    } catch (error) {
      console.error("Invalid wallet address:", error);
      return null;
    }
  }, [address]);

  /**
   * Sign a transaction using the connected wallet
   * @param transaction - Transaction or VersionedTransaction to sign
   * @returns Signed transaction
   * @throws {Error} If wallet is not connected or signing fails
   */
  const signTransaction = useCallback(
    async <T extends Transaction | VersionedTransaction>(
      transaction: T,
    ): Promise<T> => {
      if (!isConnected || !publicKey || !solanaAdapter) {
        throw new Error("Wallet not connected");
      }

      if (!("signTransaction" in solanaAdapter)) {
        throw new Error("Wallet adapter does not support signing");
      }

      try {
        // Type assertion for the adapter's signTransaction method
        const signedTx = await (solanaAdapter as any).signTransaction(
          transaction,
        );
        return signedTx;
      } catch (error) {
        console.error("Failed to sign transaction:", error);
        throw new Error(`Transaction signing failed: ${error}`);
      }
    },
    [isConnected, publicKey, solanaAdapter],
  );

  /**
   * Sign multiple transactions using the connected wallet
   * @param transactions - Array of transactions to sign
   * @returns Array of signed transactions
   * @throws {Error} If wallet is not connected or signing fails
   */
  const signAllTransactions = useCallback(
    async <T extends Transaction | VersionedTransaction>(
      transactions: T[],
    ): Promise<T[]> => {
      if (!isConnected || !publicKey || !solanaAdapter) {
        throw new Error("Wallet not connected");
      }

      if (!("signAllTransactions" in solanaAdapter)) {
        throw new Error("Wallet adapter does not support batch signing");
      }

      try {
        const signedTxs = await (solanaAdapter as any).signAllTransactions(
          transactions,
        );
        return signedTxs;
      } catch (error) {
        console.error("Failed to sign transactions:", error);
        throw new Error(`Batch transaction signing failed: ${error}`);
      }
    },
    [isConnected, publicKey, solanaAdapter],
  );

  /**
   * Sign a message using the connected wallet
   * @param message - Message to sign (string or Uint8Array)
   * @returns Signature as Uint8Array
   * @throws {Error} If wallet is not connected or signing fails
   */
  const signMessage = useCallback(
    async (message: Uint8Array | string): Promise<Uint8Array> => {
      if (!isConnected || !publicKey || !solanaAdapter) {
        throw new Error("Wallet not connected");
      }

      if (!("signMessage" in solanaAdapter)) {
        throw new Error("Wallet adapter does not support message signing");
      }

      try {
        // Convert string message to Uint8Array if needed
        const messageBytes =
          typeof message === "string"
            ? new TextEncoder().encode(message)
            : message;

        const signature = await (solanaAdapter as any).signMessage(
          messageBytes,
        );
        return signature;
      } catch (error) {
        console.error("Failed to sign message:", error);
        throw new Error(`Message signing failed: ${error}`);
      }
    },
    [isConnected, publicKey, solanaAdapter],
  );

  /**
   * Send a signed transaction to the network
   * @param signedTransaction - Signed transaction to send
   * @param connection - Solana connection instance
   * @param options - Send options
   * @returns Transaction signature
   */
  const sendTransaction = useCallback(
    async (
      signedTransaction: Transaction | VersionedTransaction,
      connection: Connection,
      options: SendOptions = {},
    ): Promise<string> => {
      if (!isConnected || !publicKey) {
        throw new Error("Wallet not connected");
      }

      try {
        const signature = await connection.sendRawTransaction(
          signedTransaction.serialize(),
          options,
        );
        return signature;
      } catch (error) {
        console.error("Failed to send transaction:", error);
        throw new Error(`Transaction sending failed: ${error}`);
      }
    },
    [isConnected, publicKey],
  );

  /**
   * Sign and send a transaction in one operation
   * @param transaction - Transaction to sign and send
   * @param connection - Solana connection instance
   * @param options - Send options
   * @returns Transaction signature
   */
  const signAndSendTransaction = useCallback(
    async (
      transaction: Transaction | VersionedTransaction,
      connection: Connection,
      options: SendOptions = {},
    ): Promise<string> => {
      const signedTx = await signTransaction(transaction);
      return sendTransaction(signedTx, connection, options);
    },
    [signTransaction, sendTransaction],
  );

  /**
   * Connect wallet if not already connected
   * Opens the wallet modal for connection
   */
  const connect = useCallback(() => {
    if (!isConnected) {
      openWalletModal();
    }
  }, [isConnected, openWalletModal]);

  /**
   * Check if the wallet adapter supports a specific feature
   */
  const supports = useCallback(
    (feature: string): boolean => {
      if (!solanaAdapter) return false;
      return feature in solanaAdapter;
    },
    [solanaAdapter],
  );

  return {
    // Wallet state
    publicKey,
    address,
    isConnected,
    isDisconnected: !isConnected,

    // Signing functions
    signTransaction,
    signAllTransactions,
    signMessage,
    sendTransaction,
    signAndSendTransaction,

    // Connection management
    connect,
    openWalletModal,

    // Feature detection
    supports,

    // Adapter instance (use with caution)
    adapter: solanaAdapter,
  };
}

/**
 * Type for the wallet hook return value
 */
export type WalletHookReturn = ReturnType<typeof useWallet>;

/**
 * Hook to get a wallet instance for a specific public key
 * Useful for multi-wallet scenarios or impersonation in development
 */
export function useWalletForPublicKey(
  targetPublicKey?: PublicKey | string | null,
) {
  const wallet = useWallet();
  const { publicKey: connectedPublicKey } = wallet;

  const targetKey = React.useMemo(() => {
    if (!targetPublicKey) return null;
    try {
      return typeof targetPublicKey === "string"
        ? new PublicKey(targetPublicKey)
        : targetPublicKey;
    } catch (error) {
      console.error("Invalid target public key:", error);
      return null;
    }
  }, [targetPublicKey]);

  // Check if the requested public key matches the connected wallet
  const isTargetWallet = React.useMemo(() => {
    if (!targetKey || !connectedPublicKey) return false;
    return targetKey.equals(connectedPublicKey);
  }, [targetKey, connectedPublicKey]);

  return {
    ...wallet,
    targetPublicKey: targetKey,
    isTargetWallet,
    canSignForTarget: isTargetWallet && wallet.isConnected,
  };
}

/**
 * Higher-order hook that requires wallet connection
 * Throws an error if wallet is not connected when attempting to sign
 */
export function useConnectedWallet() {
  const wallet = useWallet();

  const ensureConnected = useCallback(() => {
    if (!wallet.isConnected) {
      throw new Error("Wallet must be connected to perform this operation");
    }
    if (!wallet.publicKey) {
      throw new Error("Wallet public key not available");
    }
  }, [wallet.isConnected, wallet.publicKey]);

  const signTransactionWithCheck = useCallback(
    async <T extends Transaction | VersionedTransaction>(transaction: T) => {
      ensureConnected();
      return wallet.signTransaction(transaction);
    },
    [wallet.signTransaction, ensureConnected],
  );

  const signAllTransactionsWithCheck = useCallback(
    async <T extends Transaction | VersionedTransaction>(transactions: T[]) => {
      ensureConnected();
      return wallet.signAllTransactions(transactions);
    },
    [wallet.signAllTransactions, ensureConnected],
  );

  const signMessageWithCheck = useCallback(
    async (message: Uint8Array | string) => {
      ensureConnected();
      return wallet.signMessage(message);
    },
    [wallet.signMessage, ensureConnected],
  );

  return {
    ...wallet,
    signTransaction: signTransactionWithCheck,
    signAllTransactions: signAllTransactionsWithCheck,
    signMessage: signMessageWithCheck,
    ensureConnected,
  };
}
