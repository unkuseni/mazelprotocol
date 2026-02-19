import React from "react";
import { AnchorProvider, type Wallet } from "@coral-xyz/anchor";
import { Keypair } from "@solana/web3.js";

import { getConnection } from "./connection";
import { useWallet } from "./wallet";
import {
  createMainLotteryProgram,
  createQuickPickProgram,
  createMainLotteryProgramWithProvider,
  createQuickPickProgramWithProvider,
  type MainLotteryProgram,
  type QuickPickProgram,
} from "./programs";

/**
 * Create a read-only wallet stub that satisfies Anchor's Wallet interface.
 * Uses a dummy Keypair so that `publicKey` is never null (Anchor requires it),
 * but all signing methods reject immediately.
 */
function createReadOnlyWallet(): Wallet {
  const dummyKeypair = Keypair.generate();
  return {
    publicKey: dummyKeypair.publicKey,
    payer: dummyKeypair,
    signTransaction: () =>
      Promise.reject(new Error("Read-only wallet cannot sign")),
    signAllTransactions: () =>
      Promise.reject(new Error("Read-only wallet cannot sign")),
  } as unknown as Wallet;
}

/**
 * Anchor provider hook using connected wallet
 * Provides both read-only and connected providers based on wallet state
 */
export function useAnchorProvider() {
  const wallet = useWallet();
  const connection = getConnection();

  // Create a dummy wallet for read-only operations
  const readOnlyWallet = React.useMemo(() => createReadOnlyWallet(), []);

  // Create user wallet object for when wallet is connected
  const userWallet = React.useMemo((): Wallet | null => {
    if (!wallet.isConnected || !wallet.publicKey) {
      return null;
    }

    return {
      publicKey: wallet.publicKey,
      payer: { publicKey: wallet.publicKey } as unknown as Keypair,
      signTransaction: wallet.signTransaction,
      signAllTransactions: wallet.signAllTransactions,
    } as unknown as Wallet;
  }, [
    wallet.isConnected,
    wallet.publicKey,
    wallet.signTransaction,
    wallet.signAllTransactions,
  ]);

  // Create read-only provider (always available)
  const readOnlyProvider = React.useMemo(() => {
    return new AnchorProvider(connection, readOnlyWallet, {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
      skipPreflight: false,
    });
  }, [connection, readOnlyWallet]);

  // Create connected provider (only when wallet is connected)
  const connectedProvider = React.useMemo(() => {
    if (!userWallet) {
      return null;
    }

    return new AnchorProvider(connection, userWallet, {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
      skipPreflight: false,
    });
  }, [connection, userWallet]);

  // Current provider (connected if available, otherwise read-only)
  const currentProvider = connectedProvider || readOnlyProvider;

  // Program clients using current provider (read-only)
  const mainLotteryProgram = React.useMemo(() => {
    return createMainLotteryProgram();
  }, []);

  const quickPickProgram = React.useMemo(() => {
    return createQuickPickProgram();
  }, []);

  // Program clients using connected provider (only when wallet is connected)
  const mainLotteryProgramWithSigner = React.useMemo(() => {
    if (!connectedProvider) {
      return null;
    }
    return createMainLotteryProgramWithProvider(connectedProvider);
  }, [connectedProvider]);

  const quickPickProgramWithSigner = React.useMemo(() => {
    if (!connectedProvider) {
      return null;
    }
    return createQuickPickProgramWithProvider(connectedProvider);
  }, [connectedProvider]);

  // Check if we can sign transactions
  const canSign = wallet.isConnected && wallet.publicKey !== null;

  return {
    // Providers
    readOnlyProvider,
    connectedProvider,
    provider: currentProvider,

    // Program clients (always available, read-only)
    mainLotteryProgram,
    quickPickProgram,

    // Program clients with signer (only when wallet is connected)
    mainLotteryProgramWithSigner,
    quickPickProgramWithSigner,

    // Wallet state
    wallet,
    canSign,
    isConnected: wallet.isConnected,
    publicKey: wallet.publicKey,

    // Connection
    connection,

    // Helper functions
    withProvider: <T>(
      callback: (
        provider: AnchorProvider,
        program: MainLotteryProgram | QuickPickProgram,
      ) => Promise<T>,
    ): Promise<T> => {
      if (!connectedProvider) {
        throw new Error("Wallet must be connected to perform this operation");
      }
      return callback(connectedProvider, mainLotteryProgram);
    },
  };
}

/**
 * Type for the anchor provider hook return value
 */
export type AnchorProviderHookReturn = ReturnType<typeof useAnchorProvider>;

/**
 * Hook to get a read-only Anchor provider
 * Useful for querying data without requiring wallet connection
 */
export function useReadOnlyAnchorProvider() {
  const connection = getConnection();

  const readOnlyProvider = React.useMemo(() => {
    const readOnlyWallet = createReadOnlyWallet();

    return new AnchorProvider(connection, readOnlyWallet, {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
      skipPreflight: false,
    });
  }, [connection]);

  const mainLotteryProgram = React.useMemo(() => {
    return createMainLotteryProgram();
  }, []);

  const quickPickProgram = React.useMemo(() => {
    return createQuickPickProgram();
  }, []);

  return {
    provider: readOnlyProvider,
    mainLotteryProgram,
    quickPickProgram,
    connection,
  };
}

/**
 * Hook that requires wallet connection
 * Throws an error if wallet is not connected
 */
export function useConnectedAnchorProvider() {
  const anchorProvider = useAnchorProvider();

  React.useEffect(() => {
    if (!anchorProvider.canSign) {
      console.warn(
        "useConnectedAnchorProvider used without wallet connection. " +
          "Some operations will fail. Use useAnchorProvider() for read-only operations.",
      );
    }
  }, [anchorProvider.canSign]);

  const ensureConnected = React.useCallback(() => {
    if (!anchorProvider.canSign) {
      throw new Error("Wallet must be connected to perform this operation");
    }
    if (!anchorProvider.connectedProvider) {
      throw new Error("Connected provider not available");
    }
  }, [anchorProvider.canSign, anchorProvider.connectedProvider]);

  return {
    ...anchorProvider,
    ensureConnected,
  };
}

/**
 * Hook to create program clients with a specific provider
 * Useful for testing or custom provider scenarios
 */
export function useProgramsWithProvider(provider: AnchorProvider) {
  const mainLotteryProgram = React.useMemo(() => {
    return createMainLotteryProgramWithProvider(provider);
  }, [provider]);

  const quickPickProgram = React.useMemo(() => {
    return createQuickPickProgramWithProvider(provider);
  }, [provider]);

  return {
    mainLotteryProgram,
    quickPickProgram,
    provider,
  };
}

/**
 * Hook to get the appropriate program client based on whether signing is needed
 * Returns the read-only program if wallet is not connected,
 * otherwise returns the program with signer capability
 */
export function useSmartProgramClient() {
  const anchorProvider = useAnchorProvider();

  const mainLotteryProgram = React.useMemo(() => {
    return (
      anchorProvider.mainLotteryProgramWithSigner ||
      anchorProvider.mainLotteryProgram
    );
  }, [
    anchorProvider.mainLotteryProgramWithSigner,
    anchorProvider.mainLotteryProgram,
  ]);

  const quickPickProgram = React.useMemo(() => {
    return (
      anchorProvider.quickPickProgramWithSigner ||
      anchorProvider.quickPickProgram
    );
  }, [
    anchorProvider.quickPickProgramWithSigner,
    anchorProvider.quickPickProgram,
  ]);

  return {
    mainLotteryProgram,
    quickPickProgram,
    canSign: anchorProvider.canSign,
    isConnected: anchorProvider.isConnected,
    provider: anchorProvider.provider,
    connectedProvider: anchorProvider.connectedProvider,
  };
}
