# Blockchain Integration - MazelProtocol Frontend

This document outlines the blockchain integration features implemented in the MazelProtocol frontend. The integration connects the React/TanStack frontend with the Solana blockchain, enabling real-time data fetching, wallet connection, and transaction capabilities.

## Overview

The frontend now includes complete blockchain integration with:
- **Real-time data fetching** from both Main Lottery and Quick Pick Express programs
- **Wallet connection** via Reown AppKit with Solana adapter
- **React Query hooks** for caching and state management
- **Anchor program clients** for TypeScript-safe blockchain interactions
- **PDA derivation utilities** for on-chain account addressing
- **Transaction signing** and sending capabilities

## Table of Contents

1. [Environment Configuration](#environment-configuration)
2. [PDA Derivation Utilities](#pda-derivation-utilities)
3. [Solana Connection Management](#solana-connection-management)
4. [Anchor Program Clients](#anchor-program-clients)
5. [React Query Hooks](#react-query-hooks)
6. [Wallet Integration](#wallet-integration)
7. [Real Components](#real-components)
8. [Usage Examples](#usage-examples)
9. [Deployment Notes](#deployment-notes)

## Environment Configuration

New environment variables have been added to `src/env.ts`:

```typescript
// Blockchain configuration
VITE_SOLANA_RPC_URL: z
  .string()
  .url()
  .default("https://api.mainnet-beta.solana.com"),
VITE_SOLANA_WS_URL: z.string().url().optional(),
VITE_MAIN_LOTTERY_PROGRAM_ID: z
  .string()
  .min(1)
  .default("7WyaHk2u8AgonsryMpnvbtp42CfLJFPQpyY5p9ys6FiF"),
VITE_QUICKPICK_PROGRAM_ID: z
  .string()
  .min(1)
  .default("7XC1KT5mvsHHXbR2mH6er138fu2tJ4L2fAgmpjLnnZK2"),
VITE_USDC_MINT: z
  .string()
  .min(1)
  .default("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
```

**Required Configuration:**
- `VITE_REOWN_PROJECT_ID`: Reown AppKit project ID for wallet connection
- `VITE_SOLANA_RPC_URL`: Solana RPC endpoint (defaults to mainnet)

**Optional Configuration:**
- `VITE_SOLANA_WS_URL`: WebSocket URL for real-time subscriptions
- Program IDs and USDC mint can be customized for different deployments

## PDA Derivation Utilities

Location: `src/lib/anchor/pda.ts`

This module provides program-derived address (PDA) derivation for all on-chain accounts. It mirrors the PDA seeds from the on-chain programs exactly.

### Key Features:
- **Main Lottery PDAs**: `lotteryState`, `prizePoolUsdc`, `houseFeeUsdc`, `insurancePoolUsdc`
- **Quick Pick PDAs**: `quickPickState`, `prizePoolUsdc`, `houseFeeUsdc`, `insurancePoolUsdc`
- **Ticket PDAs**: Derivation for individual tickets by draw ID and ticket index
- **Draw Result PDAs**: Derivation for draw result accounts
- **Pre-computed PDAs**: Cached PDAs for performance

### Usage:
```typescript
import { mainPDAs, quickPickPDAs, deriveTicketPDA } from "@/lib/anchor/pda";

// Access pre-computed PDAs
const lotteryState = mainPDAs.lotteryState;
const prizePool = mainPDAs.prizePoolUsdc;

// Derive specific PDAs
const [ticketPda] = deriveTicketPDA(drawId, ticketIndex);
```

## Solana Connection Management

Location: `src/lib/anchor/connection.ts`

Singleton connection manager with retry logic and error handling.

### Features:
- **Lazy initialization**: Connection created only when needed
- **WebSocket support**: Separate connection for real-time updates
- **Retry logic**: Automatic retry for failed transactions
- **Priority fees**: Configurable compute unit pricing
- **Account subscriptions**: WebSocket subscriptions for real-time updates

### Usage:
```typescript
import { getConnection, sendAndConfirmTransaction } from "@/lib/anchor/connection";

// Get the connection singleton
const connection = getConnection();

// Send transaction with retry logic
const signature = await sendAndConfirmTransaction(
  transaction,
  signers,
  connection,
  { maxRetries: 3 }
);
```

## Anchor Program Clients

Location: `src/lib/anchor/programs.ts`

TypeScript-safe Anchor program clients for both Main Lottery and Quick Pick Express.

### Features:
- **Read-only clients**: For data fetching without wallet connection
- **Connected clients**: For transaction signing with wallet
- **State fetching utilities**: Convenience functions for common queries
- **Error handling**: Graceful degradation for missing accounts

### Key Functions:
```typescript
import {
  createMainLotteryProgram,
  createQuickPickProgram,
  fetchMainLotteryState,
  fetchQuickPickState,
  fetchMainDrawResult,
} from "@/lib/anchor/programs";

// Read-only program client
const program = createMainLotteryProgram();

// Fetch lottery state
const lotteryState = await fetchMainLotteryState();

// Fetch specific draw result
const drawResult = await fetchMainDrawResult(drawId);
```

## React Query Hooks

Location: `src/lib/anchor/hooks.ts`

Comprehensive React Query hooks for data fetching with caching, polling, and real-time updates.

### Query Keys Structure:
```typescript
const lotteryKeys = {
  all: ["lottery"],
  main: {
    state: () => [...lotteryKeys.main.all(), "state"],
    draw: (drawId) => [...lotteryKeys.main.all(), "draw", { drawId }],
    userTickets: (user, drawId) => [...lotteryKeys.main.all(), "user-tickets", { user, drawId }],
  },
  quickPick: {
    // Similar structure for Quick Pick
  },
};
```

### Available Hooks:
- `useMainLotteryState()` - Fetch main lottery state
- `useQuickPickState()` - Fetch Quick Pick state
- `useMainDrawResult(drawId)` - Fetch specific draw result
- `useUserMainTicketsForDraw(user, drawId)` - Fetch user's tickets
- `useAllLotteryStates()` - Fetch both lottery states
- `useSubscribeToMainLotteryState()` - Real-time subscription with polling

### Usage:
```typescript
import { useMainLotteryState, useUserMainTicketsForDraw } from "@/lib/anchor/hooks";

function LotteryDisplay() {
  const { data: lotteryState, isLoading, error } = useMainLotteryState({
    refetchInterval: 10000, // Poll every 10 seconds
  });

  const { data: userTickets } = useUserMainTicketsForDraw(
    userPublicKey,
    currentDrawId
  );

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return <div>Jackpot: ${lotteryState.jackpot}</div>;
}
```

## Wallet Integration

Location: `src/lib/anchor/wallet.ts` and `src/lib/anchor/provider.ts`

Wallet integration using Reown AppKit with full transaction signing capabilities.

### Key Components:

1. **Wallet Hook** (`useWallet()`):
   - Transaction signing
   - Message signing
   - Connection management
   - Feature detection

2. **Anchor Provider Hook** (`useAnchorProvider()`):
   - Read-only and connected providers
   - Program clients with signer capability
   - Automatic provider selection based on wallet state

### Usage:
```typescript
import { useWallet, useAnchorProvider } from "@/lib/anchor/wallet";
import { useConnectedAnchorProvider } from "@/lib/anchor/provider";

function PurchaseTicket() {
  const wallet = useWallet();
  const { mainLotteryProgramWithSigner, canSign } = useAnchorProvider();

  const handlePurchase = async () => {
    if (!canSign) {
      wallet.connect();
      return;
    }

    // Build and sign transaction
    const instruction = await buildPurchaseTicketInstruction(
      mainLotteryProgramWithSigner,
      wallet.publicKey,
      numbers,
      drawId
    );

    const signature = await wallet.signAndSendTransaction(
      instruction,
      connection
    );
  };

  return <button onClick={handlePurchase}>Buy Ticket</button>;
}
```

## Real Components

### RealJackpotDisplay Component

Location: `src/components/RealJackpotDisplay.tsx`

A production-ready component that fetches and displays real jackpot data from the blockchain.

**Features:**
- Real-time jackpot amount from blockchain
- Rolldown status detection
- Automatic refresh with polling
- Loading and error states
- Blockchain connectivity indicator

**Usage:**
```tsx
import { RealJackpotDisplay, RealJackpotBadge } from "@/components/RealJackpotDisplay";

// Main display
<RealJackpotDisplay
  showRefresh={true}
  pollInterval={10000}
  size="lg"
  showRolldownStatus={true}
/>

// Compact badge for headers
<RealJackpotBadge
  showRefresh={false}
  pollInterval={30000}
/>
```

### Integration with Existing UI

The landing page (`src/routes/index.tsx`) has been updated to include:
- QueryClientProvider for React Query
- Real jackpot display integration points
- Wallet connection integration

## Usage Examples

### 1. Fetching and Displaying Lottery State

```tsx
import { useMainLotteryState } from "@/lib/anchor/hooks";

function LotteryOverview() {
  const { data: lotteryState, isLoading } = useMainLotteryState();

  if (isLoading) return <div>Loading lottery data...</div>;
  if (!lotteryState) return <div>No lottery data available</div>;

  return (
    <div>
      <h2>Current Jackpot: ${lotteryState.jackpot.toLocaleString()}</h2>
      <p>Tickets Sold: {lotteryState.totalTicketsSold}</p>
      <p>Next Draw: {formatDate(lotteryState.nextDrawTime)}</p>
    </div>
  );
}
```

### 2. Purchasing a Ticket

```tsx
import { useWallet } from "@/lib/anchor/wallet";
import { useMainLotteryState } from "@/lib/anchor/hooks";
import { buildPurchaseMainTicketInstruction } from "@/lib/anchor/programs";
import { getConnection } from "@/lib/anchor/connection";

function TicketPurchase() {
  const wallet = useWallet();
  const { data: lotteryState } = useMainLotteryState();
  const connection = getConnection();

  const handlePurchase = async (numbers: number[]) => {
    if (!wallet.isConnected) {
      wallet.connect();
      return;
    }

    try {
      const instruction = await buildPurchaseMainTicketInstruction(
        program,
        wallet.publicKey,
        numbers,
        lotteryState.currentDrawId
      );

      const transaction = new Transaction().add(instruction);
      transaction.feePayer = wallet.publicKey;

      const signedTx = await wallet.signTransaction(transaction);
      const signature = await connection.sendRawTransaction(
        signedTx.serialize()
      );

      console.log(`Ticket purchased: ${signature}`);
    } catch (error) {
      console.error("Failed to purchase ticket:", error);
    }
  };

  return <TicketForm onSubmit={handlePurchase} />;
}
```

### 3. Real-time Updates

```tsx
import { useSubscribeToMainLotteryState } from "@/lib/anchor/hooks";

function LiveJackpot() {
  const { data: lotteryState, refetch } = useSubscribeToMainLotteryState(
    true, // enabled
    (newData) => {
      // Callback for real-time updates
      console.log("Jackpot updated:", newData.jackpot);
    }
  );

  return (
    <div>
      <RealJackpotDisplay />
      <button onClick={refetch}>Manual Refresh</button>
    </div>
  );
}
```

## Deployment Notes

### 1. Environment Variables

Create a `.env.local` file with the following variables:

```bash
VITE_REOWN_PROJECT_ID=your_reown_project_id
VITE_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
# Optional:
VITE_SOLANA_WS_URL=wss://api.mainnet-beta.solana.com
VITE_MAIN_LOTTERY_PROGRAM_ID=7WyaHk2u8AgonsryMpnvbtp42CfLJFPQpyY5p9ys6FiF
VITE_QUICKPICK_PROGRAM_ID=7XC1KT5mvsHHXbR2mH6er138fu2tJ4L2fAgmpjLnnZK2
VITE_USDC_MINT=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
```

### 2. RPC Endpoints

**Recommended RPC Providers:**
- Mainnet: Helius, QuickNode, Triton
- Devnet: Solana Devnet RPC
- Local: http://localhost:8899

**Considerations:**
- Rate limiting and request quotas
- WebSocket support for real-time features
- Geographic distribution for latency

### 3. Performance Optimization

1. **Query Cache Configuration:**
   ```typescript
   const queryClient = new QueryClient({
     defaultOptions: {
       queries: {
         staleTime: 30000, // 30 seconds
         gcTime: 300000,   // 5 minutes
         retry: 2,
       },
     },
   });
   ```

2. **Batch Requests:** Use `getMultipleAccountsInfo` for batch account fetching.

3. **Subscription Management:** Unsubscribe from WebSocket connections on component unmount.

### 4. Error Handling

The integration includes comprehensive error handling:

- **Network errors:** Automatic retry with exponential backoff
- **Account not found:** Graceful degradation with null returns
- **Wallet errors:** User-friendly messages and reconnection prompts
- **Transaction errors:** Detailed error parsing and user feedback

## Next Steps

### Immediate Priorities:
1. **Transaction Building:** Implement complete transaction builders for all program instructions
2. **Real-time WebSockets:** Add true WebSocket subscriptions (currently using polling)
3. **Error UI:** Create error boundary components for blockchain errors
4. **Loading States:** Enhanced loading skeletons and progress indicators

### Short-term Goals:
1. **MEV Protection:** Implement commit-reveal pattern for ticket purchases
2. **Batch Operations:** Support for purchasing multiple tickets in one transaction
3. **Syndicate Integration:** Full syndicate creation and management
4. **Prize Claiming:** Complete prize claiming flow with automatic detection

### Long-term Vision:
1. **Indexer Integration:** Off-chain indexing for complex queries
2. **Analytics Dashboard:** Real-time analytics and monitoring
3. **Multi-chain Support:** Potential expansion to other chains
4. **API Layer:** REST/GraphQL API for third-party integrations

## Troubleshooting

### Common Issues:

1. **Wallet Not Connecting:**
   - Check `VITE_REOWN_PROJECT_ID` is set
   - Verify wallet adapter initialization in `src/lib/appkit.ts`
   - Check browser console for errors

2. **RPC Connection Failed:**
   - Verify `VITE_SOLANA_RPC_URL` is accessible
   - Check CORS settings on RPC endpoint
   - Try alternative RPC provider

3. **Account Data Not Loading:**
   - Verify program IDs match deployed programs
   - Check PDA derivation matches on-chain seeds
   - Confirm account exists on-chain

4. **Transaction Failures:**
   - Check wallet has sufficient SOL for fees
   - Verify token accounts exist for USDC transfers
   - Check transaction size and compute limits

### Debugging Tools:

1. **Browser Console:** All blockchain interactions are logged
2. **React Query DevTools:** Inspect query cache and state
3. **Solana Explorer:** Verify transactions and account state
4. **Anchor IDL:** Reference IDL files for correct data structures

## Support

For issues with blockchain integration:

1. **Code Issues:** Check the integration source files in `src/lib/anchor/`
2. **Configuration:** Verify environment variables and RPC endpoints
3. **Blockchain:** Use Solana Explorer to verify on-chain state
4. **Wallet:** Test with Phantom or other Solana wallets as alternative

Refer to the MazelProtocol program documentation for on-chain data structures and instruction formats.
```

This documentation provides a comprehensive guide to the blockchain integration implemented in the MazelProtocol frontend. It covers all aspects from environment setup to component usage, with practical examples and troubleshooting guidance.