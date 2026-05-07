/**
 * Transaction builder for custodial ticket purchases.
 *
 * Builds, signs, and submits buy_ticket / buy_bulk transactions
 * using the bot's authority keypair. Users deposit USDC with the
 * bot and the bot purchases tickets on their behalf.
 */

import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  ComputeBudgetProgram,
  type Commitment,
} from "@solana/web3.js";
import {
  deriveMainPDAs,
  deriveQPPDAs,
  deriveTicketPDA,
  deriveQPTicketPDA,
  MAIN_TICKET_PRICE_LAMPORTS,
  QP_TICKET_PRICE_LAMPORTS,
  MAIN_PICK_COUNT,
  QP_PICK_COUNT,
} from "./config";
import type { BotConfig } from "./config";

// ============================================================================
// TYPES
// ============================================================================

export interface BuyTicketResult {
  success: boolean;
  signature?: string;
  error?: string;
  ticketPDA?: PublicKey;
}

// ============================================================================
// TRANSACTION BUILDER
// ============================================================================

// Anchor instruction discriminator: first 8 bytes of SHA256("global:<ix_name>")
// We pre-compute these so we don't need the full Anchor library.
const IX_DISCRIMINATORS: Record<string, number[]> = {
  buyTicket: [154, 220, 175, 96, 252, 50, 89, 250],
  buyBulk: [19, 255, 77, 173, 232, 142, 32, 182],
  initUserStats: [45, 170, 118, 191, 93, 199, 242, 78],
};

/**
 * Build and submit a single ticket purchase.
 *
 * The bot signs with its authority keypair but the ticket is assigned
 * to the user's wallet. USDC is transferred from the user's deposited
 * balance held in the bot's custody.
 */
export async function buyTicket(
  config: BotConfig,
  connection: Connection,
  userWallet: PublicKey,
  numbers: number[],
  lottery: "main" | "qp",
): Promise<BuyTicketResult> {
  if (!config.authorityKeypair) {
    return { success: false, error: "Custodial mode not enabled. Set AUTHORITY_KEYPAIR_JSON in .env" };
  }

  const programId = lottery === "main" ? config.mainProgramId : config.qpProgramId;
  const price = lottery === "main" ? MAIN_TICKET_PRICE_LAMPORTS : QP_TICKET_PRICE_LAMPORTS;

  try {
    // Fetch lottery state to get current draw ID and ticket index
    const pdas = lottery === "main"
      ? deriveMainPDAs(programId)
      : deriveQPPDAs(programId);

    const stateKey = lottery === "main" ? pdas.lotteryState : pdas.quickPickState;
    const accountInfo = await connection.getAccountInfo(stateKey, config.commitment);
    if (!accountInfo) {
      return { success: false, error: "Lottery state not found. Program may not be initialized." };
    }

    // Decode minimal state: we need current_draw_id and current_draw_tickets
    // Layout (after 8-byte discriminator): ... current_draw_id at offset varies
    // For main: currentDrawId is at position after: Pubkey(32) + Option<Pubkey>(33) + Pubkey(32) + Pubkey(32) = 129
    // For QP: current_draw is first field after discriminator
    const data = new Uint8Array(accountInfo.data);
    const reader = new DataView(data.buffer, data.byteOffset, data.byteLength);

    let drawId: bigint;
    let currentTickets: bigint;

    if (lottery === "main") {
      // LotteryState layout offset for current_draw_id: 8 + 32 + 33 + 32 + 32 = 137
      drawId = reader.getBigUint64(137, true);
      // current_draw_tickets is much further... let's use a simpler approach
      // Instead of parsing full struct, just fetch the state via getAccountInfo and use known offsets
      // Actually, let's just use a fresh connection and the existing solana.ts fetchers
      const { fetchMainLotteryState, fetchQPLotteryState } = await import("./solana");
      const state = lottery === "main"
        ? await fetchMainLotteryState()
        : await fetchQPLotteryState();

      drawId = lottery === "main" ? state.currentDrawId : state.currentDraw;
      currentTickets = lottery === "main" ? state.currentDrawTickets : state.currentDrawTickets;
    } else {
      const { fetchQPLotteryState } = await import("./solana");
      const state = await fetchQPLotteryState();
      drawId = state.currentDraw;
      currentTickets = state.currentDrawTickets;
    }

    // Derive ticket PDA
    const [ticketPDA] = lottery === "main"
      ? deriveTicketPDA(drawId, currentTickets, programId)
      : deriveQPTicketPDA(drawId, currentTickets, programId);

    // Build numbers buffer (sorted u8 array)
    const numbersSorted = [...numbers].sort((a, b) => a - b);
    const numbersBuf = Buffer.alloc(lottery === "main" ? 6 : 5);
    numbersSorted.forEach((n, i) => { numbersBuf[i] = n; });

    // Build buy_ticket instruction data manually
    // Anchor format: [8-byte discriminator] + [Borsh-serialized params]
    const discriminator = Buffer.from(IX_DISCRIMINATORS.buyTicket);

    // BuyTicketParams: { numbers: [u8; 6], use_free_ticket: bool }
    const paramsBuf = Buffer.alloc(numbersBuf.length + 1);
    numbersBuf.copy(paramsBuf);
    paramsBuf[numbersBuf.length] = 0; // use_free_ticket = false

    const ixData = Buffer.concat([discriminator, paramsBuf]);

    // Build accounts list
    const accounts = lottery === "main"
      ? [
        { pubkey: config.authorityKeypair.publicKey, isSigner: true, isWritable: true },   // player
        { pubkey: pdas.lotteryState, isSigner: false, isWritable: true },                    // lottery_state
        { pubkey: ticketPDA, isSigner: false, isWritable: true },                            // ticket
        { pubkey: userWallet, isSigner: false, isWritable: true },                           // player_usdc
        { pubkey: pdas.prizePoolUsdc, isSigner: false, isWritable: true },                   // prize_pool_usdc
        { pubkey: pdas.houseFeeUsdc, isSigner: false, isWritable: true },                    // house_fee_usdc
        { pubkey: pdas.insurancePoolUsdc, isSigner: false, isWritable: true },               // insurance_pool_usdc
        { pubkey: config.usdcMint, isSigner: false, isWritable: false },                     // usdc_mint
        { pubkey: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"), isSigner: false, isWritable: false }, // token_program
        { pubkey: new PublicKey("11111111111111111111111111111111"), isSigner: false, isWritable: false },             // system_program
      ]
      : [
        { pubkey: config.authorityKeypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: pdas.quickPickState, isSigner: false, isWritable: true },
        { pubkey: ticketPDA, isSigner: false, isWritable: true },
        { pubkey: userWallet, isSigner: false, isWritable: true },
        { pubkey: pdas.prizePoolUsdc, isSigner: false, isWritable: true },
        { pubkey: pdas.houseFeeUsdc, isSigner: false, isWritable: true },
        { pubkey: pdas.insurancePoolUsdc, isSigner: false, isWritable: true },
        { pubkey: config.usdcMint, isSigner: false, isWritable: false },
        { pubkey: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"), isSigner: false, isWritable: false },
        { pubkey: new PublicKey("11111111111111111111111111111111"), isSigner: false, isWritable: false },
      ];

    const instruction = {
      programId,
      keys: accounts,
      data: ixData,
    };

    // Build transaction
    const tx = new Transaction();
    // Add compute budget for priority
    tx.add(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 1000,
      }),
    );
    tx.add(instruction);

    // Get latest blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash(config.commitment);
    tx.recentBlockhash = blockhash;
    tx.lastValidBlockHeight = lastValidBlockHeight;
    tx.feePayer = config.authorityKeypair.publicKey;

    // Sign with authority
    tx.sign(config.authorityKeypair);

    // Submit
    const signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      preflightCommitment: config.commitment,
    });

    // Confirm
    const confirmation = await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    }, config.commitment);

    if (confirmation.value.err) {
      return { success: false, error: `Transaction failed: ${JSON.stringify(confirmation.value.err)}` };
    }

    return { success: true, signature, ticketPDA };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}
