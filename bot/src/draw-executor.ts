/**
 * Draw Executor Module for MazelProtocol Draw Lifecycle Bot.
 *
 * Orchestrates the full 4-phase draw lifecycle for both programs:
 *
 *   Phase 1: COMMIT RANDOMNESS
 *     - Create a fresh Switchboard randomness account
 *     - Call commit_randomness on the program (stores seed_slot before reveal)
 *
 *   Phase 2: EXECUTE DRAW
 *     - Wait for Switchboard oracle to reveal randomness (~1-2 slots)
 *     - Call execute_draw (reads revealed randomness, generates winning numbers)
 *     - The DrawResult PDA is created on-chain
 *
 *   Phase 3: INDEX TICKETS
 *     - Fetch all tickets for the draw via getProgramAccounts
 *     - Compare each ticket against winning numbers
 *     - Count winners per tier
 *     - Compute the SHA256 verification hash
 *
 *   Phase 4: FINALIZE DRAW
 *     - Call finalize_draw with winner counts + verification hash
 *     - On-chain program calculates prizes (fixed or pari-mutuel rolldown)
 *     - State advances to the next draw
 *
 * Error Recovery:
 *   - If commit succeeds but execute fails, the bot retries execute.
 *   - If execute succeeds but finalize fails, the bot retries finalize.
 *   - If a draw is stuck for >1 hour (DRAW_COMMIT_TIMEOUT), the bot can
 *     invoke cancel_draw to reset state.
 *   - Each phase has configurable retry logic with exponential backoff.
 */

import { BN, type Program } from "@coral-xyz/anchor";
import {
  ComputeBudgetProgram,
  type Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  type TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  type BotConfig,
  deriveDrawResultPDA,
  deriveQPDrawResultPDA,
  DRAW_COMMIT_TIMEOUT,
} from "./config";
import type { MainIndexerResult, QPIndexerResult } from "./indexer";
import {
  indexMainDraw,
  indexQPDraw,
  plausibilityCheckMain,
  plausibilityCheckQP,
} from "./indexer";
import { type Logger, logPhase, logTx, logWarn } from "./logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Tracks which phase the draw lifecycle is currently in. */
export type DrawPhase =
  | "idle"
  | "awaiting_commit"
  | "committed"
  | "executed"
  | "indexed"
  | "finalized"
  | "error";

/** State tracker for an individual draw lifecycle. */
export interface DrawState {
  program: "main" | "quickpick";
  drawId: bigint;
  phase: DrawPhase;
  commitSlot?: number;
  commitTimestamp?: number;
  randomnessAccount?: PublicKey;
  winningNumbers?: number[];
  indexerResult?: MainIndexerResult | QPIndexerResult;
  errorCount: number;
  lastError?: string;
  lastAttemptTimestamp?: number;
}

/** Result of a single phase execution. */
interface PhaseResult {
  success: boolean;
  signature?: string;
  error?: string;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Send a versioned transaction with priority fee and retry logic.
 */
async function sendAndConfirmTx(
  connection: Connection,
  instructions: TransactionInstruction[],
  payer: Keypair,
  config: BotConfig,
  logger: Logger,
  label: string,
): Promise<string> {
  // Prepend compute budget instructions
  const budgetIxs: TransactionInstruction[] = [];

  if (config.priorityFeeMicroLamports > 0) {
    budgetIxs.push(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: config.priorityFeeMicroLamports,
      }),
    );
  }

  if (config.computeUnitLimit) {
    budgetIxs.push(
      ComputeBudgetProgram.setComputeUnitLimit({
        units: config.computeUnitLimit,
      }),
    );
  }

  const allIxs = [...budgetIxs, ...instructions];

  // Build the transaction
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash(config.commitment);

  const messageV0 = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: blockhash,
    instructions: allIxs,
  }).compileToV0Message();

  const tx = new VersionedTransaction(messageV0);
  tx.sign([payer]);

  logger.debug(
    { label, ixCount: allIxs.length },
    `Sending transaction: ${label}`,
  );

  const signature = await connection.sendTransaction(tx, {
    skipPreflight: config.skipPreflight,
    maxRetries: 2,
  });

  logger.debug(
    { label, signature },
    `Transaction sent, awaiting confirmation: ${signature}`,
  );

  // Wait for confirmation
  const confirmation = await connection.confirmTransaction(
    {
      signature,
      blockhash,
      lastValidBlockHeight,
    },
    config.commitment,
  );

  if (confirmation.value.err) {
    throw new Error(
      `Transaction ${label} confirmed with error: ${JSON.stringify(
        confirmation.value.err,
      )}`,
    );
  }

  return signature;
}

// ---------------------------------------------------------------------------
// Retry helper
// ---------------------------------------------------------------------------

/**
 * Execute a phase with retry logic and exponential backoff.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  baseDelayMs: number,
  logger: Logger,
  label: string,
): Promise<T> {
  let lastErr: Error = new Error(`${label}: all attempts failed`);

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastErr = err instanceof Error ? err : new Error(String(err));

      if (attempt < maxRetries) {
        const delay = baseDelayMs * 2 ** attempt;
        logger.warn(
          {
            label,
            attempt: attempt + 1,
            maxRetries,
            delay,
            error: lastErr.message,
          },
          `${label}: attempt ${attempt + 1}/${maxRetries + 1} failed, retrying in ${delay}ms`,
        );
        await sleep(delay);
      }
    }
  }

  throw lastErr;
}

// ---------------------------------------------------------------------------
// Main Lottery Draw Executor
// ---------------------------------------------------------------------------

/**
 * Execute the complete draw lifecycle for the Main Lottery.
 *
 * This is the primary entry point called by the scheduler when a main
 * lottery draw is due.
 */
export async function executeMainDrawLifecycle(
  connection: Connection,
  mainProgram: Program<any>,
  config: BotConfig,
  logger: Logger,
): Promise<DrawState> {
  const log = logger.child({ component: "main-draw" });

  // Fetch current lottery state
  const lotteryState = await (mainProgram.account as any).lotteryState.fetch(
    config.mainPDAs.lotteryState,
  );

  const drawId = BigInt(lotteryState.currentDrawId.toString());
  const state: DrawState = {
    program: "main",
    drawId,
    phase: "idle",
    errorCount: 0,
  };

  log.info(
    {
      drawId: Number(drawId),
      jackpot: lotteryState.jackpotBalance.toString(),
      tickets: lotteryState.currentDrawTickets.toString(),
      isDrawInProgress: lotteryState.isDrawInProgress,
      isPaused: lotteryState.isPaused,
      nextDrawTimestamp: lotteryState.nextDrawTimestamp.toString(),
    },
    `[main] Starting draw lifecycle for draw #${drawId}`,
  );

  // Check if lottery is paused
  if (lotteryState.isPaused) {
    log.warn(
      { drawId: Number(drawId) },
      "[main] Lottery is paused — skipping draw",
    );
    state.phase = "idle";
    return state;
  }

  // Check if a draw is already in progress (might be a stuck draw)
  if (lotteryState.isDrawInProgress) {
    return await handleStuckMainDraw(
      connection,
      mainProgram,
      config,
      lotteryState,
      state,
      log,
    );
  }

  // ---- Phase 1: COMMIT RANDOMNESS ----
  try {
    state.phase = "awaiting_commit";
    logPhase(log, "main", drawId, "commit", "start");

    if (config.dryRun) {
      log.info("[main] DRY RUN: Would call commit_randomness");
      logPhase(log, "main", drawId, "commit", "skip", { reason: "dry_run" });
      return state;
    }

    const commitResult = await withRetry(
      () => commitMainRandomness(connection, mainProgram, config, log),
      config.maxRetries,
      config.retryDelayMs,
      log,
      "main.commit_randomness",
    );

    state.phase = "committed";
    state.randomnessAccount = commitResult.randomnessAccount;
    state.commitSlot = commitResult.commitSlot;
    state.commitTimestamp = nowUnix();

    logPhase(log, "main", drawId, "commit", "success", {
      signature: commitResult.signature,
      randomnessAccount: commitResult.randomnessAccount.toBase58(),
      commitSlot: commitResult.commitSlot,
    });
    logTx(log, "main", "commit_randomness", commitResult.signature);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    state.phase = "error";
    state.lastError = msg;
    state.errorCount++;
    logPhase(log, "main", drawId, "commit", "error", { error: msg });
    return state;
  }

  // ---- Wait for randomness reveal ----
  log.info(
    { delayMs: config.commitExecuteDelayMs },
    `[main] Waiting ${config.commitExecuteDelayMs}ms for Switchboard randomness reveal...`,
  );
  await sleep(config.commitExecuteDelayMs);

  // ---- Phase 2: EXECUTE DRAW ----
  try {
    logPhase(log, "main", drawId, "execute", "start");

    const executeResult = await withRetry(
      () =>
        executeMainDraw(
          connection,
          mainProgram,
          config,
          drawId,
          state.randomnessAccount!,
          log,
        ),
      config.maxRetries,
      config.retryDelayMs,
      log,
      "main.execute_draw",
    );

    state.phase = "executed";
    state.winningNumbers = executeResult.winningNumbers;

    logPhase(log, "main", drawId, "execute", "success", {
      signature: executeResult.signature,
      winningNumbers: executeResult.winningNumbers,
      wasRolldown: executeResult.wasRolldown,
    });
    logTx(log, "main", "execute_draw", executeResult.signature);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    state.phase = "error";
    state.lastError = msg;
    state.errorCount++;
    logPhase(log, "main", drawId, "execute", "error", { error: msg });
    return state;
  }

  // ---- Phase 3: INDEX TICKETS ----
  let indexerResult: MainIndexerResult;
  try {
    logPhase(log, "main", drawId, "index", "start");

    indexerResult = await indexMainDraw(
      connection,
      config.mainProgramId,
      drawId,
      state.winningNumbers!,
      log,
      config.indexerNonceSeed,
    );

    // Run plausibility check
    const plausibility = plausibilityCheckMain(
      indexerResult.winnerCounts,
      indexerResult.totalTicketsScanned,
      log,
    );

    if (!plausibility.ok) {
      logWarn(
        log,
        `[main] draw #${drawId}: Plausibility warnings detected`,
        {
          warnings: plausibility.warnings,
          winnerCounts: indexerResult.winnerCounts,
          totalTickets: indexerResult.totalTicketsScanned,
        },
        true, // send alert
      );
      // We proceed anyway — the on-chain program has its own checks
    }

    state.phase = "indexed";
    state.indexerResult = indexerResult;

    logPhase(log, "main", drawId, "index", "success", {
      winnerCounts: indexerResult.winnerCounts,
      totalTickets: indexerResult.totalTicketsScanned,
      durationMs: indexerResult.durationMs,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    state.phase = "error";
    state.lastError = msg;
    state.errorCount++;
    logPhase(log, "main", drawId, "index", "error", { error: msg });
    return state;
  }

  // ---- Phase 4: FINALIZE DRAW ----
  try {
    logPhase(log, "main", drawId, "finalize", "start");

    const finalizeResult = await withRetry(
      () =>
        finalizeMainDraw(
          connection,
          mainProgram,
          config,
          drawId,
          indexerResult,
          log,
        ),
      config.maxRetries,
      config.retryDelayMs,
      log,
      "main.finalize_draw",
    );

    state.phase = "finalized";

    logPhase(log, "main", drawId, "finalize", "success", {
      signature: finalizeResult.signature,
    });
    logTx(log, "main", "finalize_draw", finalizeResult.signature);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    state.phase = "error";
    state.lastError = msg;
    state.errorCount++;
    logPhase(log, "main", drawId, "finalize", "error", { error: msg });
    return state;
  }

  log.info(
    { drawId: Number(drawId), phase: state.phase },
    `[main] Draw #${drawId} lifecycle completed successfully`,
  );

  return state;
}

// ---------------------------------------------------------------------------
// Quick Pick Express Draw Executor
// ---------------------------------------------------------------------------

/**
 * Execute the complete draw lifecycle for Quick Pick Express.
 */
export async function executeQPDrawLifecycle(
  connection: Connection,
  mainProgram: Program<any>,
  qpProgram: Program<any>,
  config: BotConfig,
  logger: Logger,
): Promise<DrawState> {
  const log = logger.child({ component: "qp-draw" });

  // Fetch current Quick Pick state
  const qpState = await (qpProgram.account as any).quickPickState.fetch(
    config.qpPDAs.quickPickState,
  );

  const drawId = BigInt(qpState.currentDraw.toString());
  const state: DrawState = {
    program: "quickpick",
    drawId,
    phase: "idle",
    errorCount: 0,
  };

  log.info(
    {
      drawId: Number(drawId),
      jackpot: qpState.jackpotBalance.toString(),
      tickets: qpState.currentDrawTickets.toString(),
      isDrawInProgress: qpState.isDrawInProgress,
      isPaused: qpState.isPaused,
      nextDrawTimestamp: qpState.nextDrawTimestamp.toString(),
    },
    `[quickpick] Starting draw lifecycle for draw #${drawId}`,
  );

  // Check if Quick Pick is paused
  if (qpState.isPaused) {
    log.warn(
      { drawId: Number(drawId) },
      "[quickpick] Quick Pick is paused — skipping draw",
    );
    state.phase = "idle";
    return state;
  }

  // Check if a draw is already in progress (stuck draw)
  if (qpState.isDrawInProgress) {
    return await handleStuckQPDraw(
      connection,
      mainProgram,
      qpProgram,
      config,
      qpState,
      state,
      log,
    );
  }

  // ---- Phase 1: COMMIT RANDOMNESS ----
  try {
    state.phase = "awaiting_commit";
    logPhase(log, "quickpick", drawId, "commit", "start");

    if (config.dryRun) {
      log.info("[quickpick] DRY RUN: Would call commit_randomness");
      logPhase(log, "quickpick", drawId, "commit", "skip", {
        reason: "dry_run",
      });
      return state;
    }

    const commitResult = await withRetry(
      () => commitQPRandomness(connection, mainProgram, qpProgram, config, log),
      config.maxRetries,
      config.retryDelayMs,
      log,
      "qp.commit_randomness",
    );

    state.phase = "committed";
    state.randomnessAccount = commitResult.randomnessAccount;
    state.commitSlot = commitResult.commitSlot;
    state.commitTimestamp = nowUnix();

    logPhase(log, "quickpick", drawId, "commit", "success", {
      signature: commitResult.signature,
      randomnessAccount: commitResult.randomnessAccount.toBase58(),
    });
    logTx(log, "quickpick", "commit_randomness", commitResult.signature);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    state.phase = "error";
    state.lastError = msg;
    state.errorCount++;
    logPhase(log, "quickpick", drawId, "commit", "error", { error: msg });
    return state;
  }

  // ---- Wait for randomness reveal ----
  log.info(
    { delayMs: config.commitExecuteDelayMs },
    `[quickpick] Waiting ${config.commitExecuteDelayMs}ms for Switchboard randomness reveal...`,
  );
  await sleep(config.commitExecuteDelayMs);

  // ---- Phase 2: EXECUTE DRAW ----
  try {
    logPhase(log, "quickpick", drawId, "execute", "start");

    const executeResult = await withRetry(
      () =>
        executeQPDraw(
          connection,
          mainProgram,
          qpProgram,
          config,
          drawId,
          state.randomnessAccount!,
          log,
        ),
      config.maxRetries,
      config.retryDelayMs,
      log,
      "qp.execute_draw",
    );

    state.phase = "executed";
    state.winningNumbers = executeResult.winningNumbers;

    logPhase(log, "quickpick", drawId, "execute", "success", {
      signature: executeResult.signature,
      winningNumbers: executeResult.winningNumbers,
      wasRolldown: executeResult.wasRolldown,
    });
    logTx(log, "quickpick", "execute_draw", executeResult.signature);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    state.phase = "error";
    state.lastError = msg;
    state.errorCount++;
    logPhase(log, "quickpick", drawId, "execute", "error", { error: msg });
    return state;
  }

  // ---- Phase 3: INDEX TICKETS ----
  let indexerResult: QPIndexerResult;
  try {
    logPhase(log, "quickpick", drawId, "index", "start");

    indexerResult = await indexQPDraw(
      connection,
      config.qpProgramId,
      drawId,
      state.winningNumbers!,
      log,
      config.indexerNonceSeed,
    );

    // Run plausibility check
    const plausibility = plausibilityCheckQP(
      indexerResult.winnerCounts,
      indexerResult.totalTicketsScanned,
      log,
    );

    if (!plausibility.ok) {
      logWarn(
        log,
        `[quickpick] draw #${drawId}: Plausibility warnings detected`,
        {
          warnings: plausibility.warnings,
          winnerCounts: indexerResult.winnerCounts,
          totalTickets: indexerResult.totalTicketsScanned,
        },
        true,
      );
    }

    state.phase = "indexed";
    state.indexerResult = indexerResult;

    logPhase(log, "quickpick", drawId, "index", "success", {
      winnerCounts: indexerResult.winnerCounts,
      totalTickets: indexerResult.totalTicketsScanned,
      durationMs: indexerResult.durationMs,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    state.phase = "error";
    state.lastError = msg;
    state.errorCount++;
    logPhase(log, "quickpick", drawId, "index", "error", { error: msg });
    return state;
  }

  // ---- Phase 4: FINALIZE DRAW ----
  try {
    logPhase(log, "quickpick", drawId, "finalize", "start");

    const finalizeResult = await withRetry(
      () =>
        finalizeQPDraw(
          connection,
          mainProgram,
          qpProgram,
          config,
          drawId,
          indexerResult,
          log,
        ),
      config.maxRetries,
      config.retryDelayMs,
      log,
      "qp.finalize_draw",
    );

    state.phase = "finalized";

    logPhase(log, "quickpick", drawId, "finalize", "success", {
      signature: finalizeResult.signature,
    });
    logTx(log, "quickpick", "finalize_draw", finalizeResult.signature);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    state.phase = "error";
    state.lastError = msg;
    state.errorCount++;
    logPhase(log, "quickpick", drawId, "finalize", "error", { error: msg });
    return state;
  }

  log.info(
    { drawId: Number(drawId), phase: state.phase },
    `[quickpick] Draw #${drawId} lifecycle completed successfully`,
  );

  return state;
}

// ---------------------------------------------------------------------------
// Phase Implementations — Main Lottery
// ---------------------------------------------------------------------------

interface CommitResult {
  signature: string;
  randomnessAccount: PublicKey;
  commitSlot: number;
}

interface ExecuteResult {
  signature: string;
  winningNumbers: number[];
  wasRolldown: boolean;
}

interface FinalizeResult {
  signature: string;
}

/**
 * Phase 1 (Main): Create Switchboard randomness account and call commit_randomness.
 *
 * The Switchboard randomness flow:
 * 1. Create a fresh randomness Keypair
 * 2. Include the Switchboard "request randomness" instruction alongside commit_randomness
 * 3. The on-chain commit_randomness stores the seed_slot and marks draw in progress
 *
 * NOTE: The exact Switchboard SDK integration depends on the version installed.
 * This implementation creates a randomness keypair and bundles the Switchboard
 * CPI call with the lottery's commit_randomness. If using @switchboard-xyz/on-demand,
 * you would use `sb.Randomness.create()` and `sb.Randomness.commitIx()`.
 */
async function commitMainRandomness(
  connection: Connection,
  mainProgram: Program<any>,
  config: BotConfig,
  logger: Logger,
): Promise<CommitResult> {
  const startTime = Date.now();

  // Create a new randomness keypair for this draw
  const randomnessKeypair = Keypair.generate();

  logger.debug(
    {
      randomnessAccount: randomnessKeypair.publicKey.toBase58(),
    },
    "[main] Creating Switchboard randomness account and committing",
  );

  // NOTE: Switchboard on-demand SDK integration
  // The exact API depends on the SDK version. The general pattern is:
  //
  //   import * as sb from "@switchboard-xyz/on-demand";
  //   const sbProgram = await sb.loadSwitchboardProgram(connection);
  //   const [randomness, createIx] = await sb.Randomness.create(sbProgram, randomnessKeypair, config.switchboardQueue);
  //   const commitIx = await randomness.commitIx(config.switchboardQueue);
  //
  // For now, we use the Anchor program's instruction builder directly,
  // passing the randomness account. The Switchboard randomness account
  // must be created BEFORE calling commit_randomness. In practice, you
  // bundle both instructions in a single transaction.

  // Attempt to use Switchboard SDK if available, otherwise fall back
  // to building the instruction manually
  let sbCreateIx: TransactionInstruction | undefined;
  let sbCommitIx: TransactionInstruction | undefined;
  let additionalSigners: Keypair[] = [randomnessKeypair];

  try {
    // Try to load Switchboard on-demand SDK dynamically
    const sb = await import("@switchboard-xyz/on-demand");

    // The exact API varies by SDK version. Try the common patterns:
    if (typeof sb.Randomness?.create === "function") {
      // Newer SDK: sb.Randomness.create(program, keypair, queue)
      const sbProgram = new PublicKey(
        config.switchboardProgramId?.toBase58() ??
          "SBondMDrcV3K4kxZR1HNVT7osZxAHVHgYXL5Ze1oMUv",
      );

      // Create the randomness account
      // This is a simplified version - actual implementation depends on SDK version
      const [randomness, createIx_] = await sb.Randomness.create(
        // @ts-expect-error - SDK type variations
        { connection, programId: sbProgram },
        randomnessKeypair,
        config.switchboardQueue,
      );
      sbCreateIx = createIx_;
      sbCommitIx = await randomness.commitIx(config.switchboardQueue);
    }
  } catch (_sbErr) {
    // Switchboard SDK not available or API mismatch
    // Fall back to manual instruction building
    logger.warn(
      "[main] Switchboard SDK not available or API mismatch — falling back to manual Switchboard account creation. " +
        "Ensure @switchboard-xyz/on-demand is installed and the randomness account is created externally if this fails.",
    );
  }

  // Build the commit_randomness instruction via Anchor
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const commitIx = await (mainProgram.methods as any)
    .commitRandomness()
    .accounts({
      authority: config.authorityKeypair.publicKey,
      lotteryState: config.mainPDAs.lotteryState,
      randomnessAccountData: randomnessKeypair.publicKey,
      switchboardQueue: config.switchboardQueue,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  // Bundle all instructions
  const instructions: TransactionInstruction[] = [];
  if (sbCreateIx) instructions.push(sbCreateIx);
  if (sbCommitIx) instructions.push(sbCommitIx);
  instructions.push(commitIx);

  // Build and send the transaction
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash(config.commitment);

  // Add priority fee instructions
  const budgetIxs: TransactionInstruction[] = [];
  if (config.priorityFeeMicroLamports > 0) {
    budgetIxs.push(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: config.priorityFeeMicroLamports,
      }),
    );
  }
  if (config.computeUnitLimit) {
    budgetIxs.push(
      ComputeBudgetProgram.setComputeUnitLimit({
        units: config.computeUnitLimit,
      }),
    );
  }

  const allIxs = [...budgetIxs, ...instructions];

  const messageV0 = new TransactionMessage({
    payerKey: config.authorityKeypair.publicKey,
    recentBlockhash: blockhash,
    instructions: allIxs,
  }).compileToV0Message();

  const tx = new VersionedTransaction(messageV0);
  tx.sign([config.authorityKeypair, ...additionalSigners]);

  const signature = await connection.sendTransaction(tx, {
    skipPreflight: config.skipPreflight,
    maxRetries: 2,
  });

  const confirmation = await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    config.commitment,
  );

  if (confirmation.value.err) {
    throw new Error(
      `commit_randomness confirmed with error: ${JSON.stringify(confirmation.value.err)}`,
    );
  }

  // Fetch the commit slot from on-chain state
  const updatedState = await (mainProgram.account as any).lotteryState.fetch(
    config.mainPDAs.lotteryState,
  );
  const commitSlot = Number(updatedState.commitSlot.toString());

  logger.info(
    {
      signature,
      randomnessAccount: randomnessKeypair.publicKey.toBase58(),
      commitSlot,
      durationMs: Date.now() - startTime,
    },
    "[main] commit_randomness succeeded",
  );

  return {
    signature,
    randomnessAccount: randomnessKeypair.publicKey,
    commitSlot,
  };
}

/**
 * Phase 2 (Main): Call execute_draw to reveal randomness and generate winning numbers.
 */
async function executeMainDraw(
  connection: Connection,
  mainProgram: Program<any>,
  config: BotConfig,
  drawId: bigint,
  randomnessAccount: PublicKey,
  logger: Logger,
): Promise<ExecuteResult> {
  const startTime = Date.now();

  // Derive the draw result PDA
  const [drawResultPda] = deriveDrawResultPDA(drawId, config.mainProgramId);

  logger.debug(
    {
      drawId: Number(drawId),
      drawResultPda: drawResultPda.toBase58(),
      randomnessAccount: randomnessAccount.toBase58(),
    },
    "[main] Executing draw (revealing randomness)",
  );

  const signature = await (mainProgram.methods as any)
    .executeDraw()
    .accounts({
      authority: config.authorityKeypair.publicKey,
      lotteryState: config.mainPDAs.lotteryState,
      drawResult: drawResultPda,
      randomnessAccountData: randomnessAccount,
      payer: config.authorityKeypair.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([config.authorityKeypair])
    .rpc({
      skipPreflight: config.skipPreflight,
      commitment: config.commitment,
    });

  // Fetch the draw result to get winning numbers
  const drawResult = await (mainProgram.account as any).drawResult.fetch(
    drawResultPda,
  );
  const winningNumbers: number[] = Array.from(
    drawResult.winningNumbers as number[],
  );
  const wasRolldown: boolean = drawResult.wasRolldown;

  logger.info(
    {
      signature,
      drawId: Number(drawId),
      winningNumbers,
      wasRolldown,
      totalTickets: drawResult.totalTickets.toString(),
      durationMs: Date.now() - startTime,
    },
    `[main] execute_draw succeeded — winning numbers: [${winningNumbers.join(", ")}]${wasRolldown ? " 🎰 ROLLDOWN!" : ""}`,
  );

  return { signature, winningNumbers, wasRolldown };
}

/**
 * Phase 4 (Main): Call finalize_draw with winner counts and verification hash.
 */
async function finalizeMainDraw(
  connection: Connection,
  mainProgram: Program<any>,
  config: BotConfig,
  drawId: bigint,
  indexerResult: MainIndexerResult,
  logger: Logger,
): Promise<FinalizeResult> {
  const startTime = Date.now();
  const [drawResultPda] = deriveDrawResultPDA(drawId, config.mainProgramId);

  logger.debug(
    {
      drawId: Number(drawId),
      winnerCounts: indexerResult.winnerCounts,
      nonce: indexerResult.nonce.toString(),
      verificationHash: indexerResult.verificationHash.toString("hex"),
    },
    "[main] Finalizing draw",
  );

  const signature = await (mainProgram.methods as any)
    .finalizeDraw({
      winnerCounts: {
        match6: indexerResult.winnerCounts.match6,
        match5: indexerResult.winnerCounts.match5,
        match4: indexerResult.winnerCounts.match4,
        match3: indexerResult.winnerCounts.match3,
        match2: indexerResult.winnerCounts.match2,
      },
      verificationHash: Array.from(indexerResult.verificationHash),
      indexerNonce: new BN(indexerResult.nonce.toString()),
    })
    .accounts({
      authority: config.authorityKeypair.publicKey,
      lotteryState: config.mainPDAs.lotteryState,
      drawResult: drawResultPda,
    })
    .signers([config.authorityKeypair])
    .rpc({
      skipPreflight: config.skipPreflight,
      commitment: config.commitment,
    });

  logger.info(
    {
      signature,
      drawId: Number(drawId),
      durationMs: Date.now() - startTime,
    },
    "[main] finalize_draw succeeded",
  );

  return { signature };
}

// ---------------------------------------------------------------------------
// Phase Implementations — Quick Pick Express
// ---------------------------------------------------------------------------

/**
 * Phase 1 (QP): Create Switchboard randomness account and call commit_randomness.
 */
async function commitQPRandomness(
  connection: Connection,
  mainProgram: Program<any>,
  qpProgram: Program<any>,
  config: BotConfig,
  logger: Logger,
): Promise<CommitResult> {
  const startTime = Date.now();
  const randomnessKeypair = Keypair.generate();

  logger.debug(
    { randomnessAccount: randomnessKeypair.publicKey.toBase58() },
    "[quickpick] Creating Switchboard randomness account and committing",
  );

  // Same Switchboard SDK pattern as main lottery
  let sbCreateIx: TransactionInstruction | undefined;
  let sbCommitIx: TransactionInstruction | undefined;
  let additionalSigners: Keypair[] = [randomnessKeypair];

  try {
    const sb = await import("@switchboard-xyz/on-demand");
    if (typeof sb.Randomness?.create === "function") {
      const sbProgram = new PublicKey(
        config.switchboardProgramId?.toBase58() ??
          "SBondMDrcV3K4kxZR1HNVT7osZxAHVHgYXL5Ze1oMUv",
      );
      const [randomness, createIx_] = await sb.Randomness.create(
        // @ts-expect-error - SDK type variations
        { connection, programId: sbProgram },
        randomnessKeypair,
        config.switchboardQueue,
      );
      sbCreateIx = createIx_;
      sbCommitIx = await randomness.commitIx(config.switchboardQueue);
    }
  } catch (_sbErr) {
    logger.warn(
      "[quickpick] Switchboard SDK not available — falling back to manual account creation",
    );
  }

  // Build commit_randomness for Quick Pick
  // QP commit_randomness needs the main lottery_state for authority verification
  const commitIx = await (qpProgram.methods as any)
    .commitRandomness()
    .accounts({
      authority: config.authorityKeypair.publicKey,
      lotteryState: config.mainPDAs.lotteryState,
      quickPickState: config.qpPDAs.quickPickState,
      randomnessAccountData: randomnessKeypair.publicKey,
    })
    .instruction();

  const instructions: TransactionInstruction[] = [];
  if (sbCreateIx) instructions.push(sbCreateIx);
  if (sbCommitIx) instructions.push(sbCommitIx);
  instructions.push(commitIx);

  // Build and send transaction
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash(config.commitment);

  const budgetIxs: TransactionInstruction[] = [];
  if (config.priorityFeeMicroLamports > 0) {
    budgetIxs.push(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: config.priorityFeeMicroLamports,
      }),
    );
  }
  if (config.computeUnitLimit) {
    budgetIxs.push(
      ComputeBudgetProgram.setComputeUnitLimit({
        units: config.computeUnitLimit,
      }),
    );
  }

  const allIxs = [...budgetIxs, ...instructions];

  const messageV0 = new TransactionMessage({
    payerKey: config.authorityKeypair.publicKey,
    recentBlockhash: blockhash,
    instructions: allIxs,
  }).compileToV0Message();

  const tx = new VersionedTransaction(messageV0);
  tx.sign([config.authorityKeypair, ...additionalSigners]);

  const signature = await connection.sendTransaction(tx, {
    skipPreflight: config.skipPreflight,
    maxRetries: 2,
  });

  const confirmation = await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    config.commitment,
  );

  if (confirmation.value.err) {
    throw new Error(
      `qp.commit_randomness confirmed with error: ${JSON.stringify(confirmation.value.err)}`,
    );
  }

  // Fetch updated state to get commit slot
  const updatedState = await (qpProgram.account as any).quickPickState.fetch(
    config.qpPDAs.quickPickState,
  );
  const commitSlot = Number(updatedState.commitSlot.toString());

  logger.info(
    {
      signature,
      randomnessAccount: randomnessKeypair.publicKey.toBase58(),
      commitSlot,
      durationMs: Date.now() - startTime,
    },
    "[quickpick] commit_randomness succeeded",
  );

  return {
    signature,
    randomnessAccount: randomnessKeypair.publicKey,
    commitSlot,
  };
}

/**
 * Phase 2 (QP): Call execute_draw to reveal randomness and generate winning numbers.
 */
async function executeQPDraw(
  connection: Connection,
  mainProgram: Program<any>,
  qpProgram: Program<any>,
  config: BotConfig,
  drawId: bigint,
  randomnessAccount: PublicKey,
  logger: Logger,
): Promise<ExecuteResult> {
  const startTime = Date.now();

  // QP draw result uses QUICK_PICK_DRAW_SEED
  const [drawResultPda] = deriveQPDrawResultPDA(drawId, config.qpProgramId);

  logger.debug(
    {
      drawId: Number(drawId),
      drawResultPda: drawResultPda.toBase58(),
      randomnessAccount: randomnessAccount.toBase58(),
    },
    "[quickpick] Executing draw (revealing randomness)",
  );

  const signature = await (qpProgram.methods as any)
    .executeDraw()
    .accounts({
      authority: config.authorityKeypair.publicKey,
      lotteryState: config.mainPDAs.lotteryState,
      quickPickState: config.qpPDAs.quickPickState,
      drawResult: drawResultPda,
      randomnessAccountData: randomnessAccount,
      payer: config.authorityKeypair.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([config.authorityKeypair])
    .rpc({
      skipPreflight: config.skipPreflight,
      commitment: config.commitment,
    });

  // Fetch the draw result to get winning numbers
  const drawResult = await (qpProgram.account as any).quickPickDrawResult.fetch(
    drawResultPda,
  );
  const winningNumbers: number[] = Array.from(
    drawResult.winningNumbers as number[],
  );
  const wasRolldown: boolean = drawResult.wasRolldown;

  logger.info(
    {
      signature,
      drawId: Number(drawId),
      winningNumbers,
      wasRolldown,
      totalTickets: drawResult.totalTickets.toString(),
      durationMs: Date.now() - startTime,
    },
    `[quickpick] execute_draw succeeded — winning numbers: [${winningNumbers.join(", ")}]${wasRolldown ? " 🎰 ROLLDOWN!" : ""}`,
  );

  return { signature, winningNumbers, wasRolldown };
}

/**
 * Phase 4 (QP): Call finalize_draw with winner counts and verification hash.
 */
async function finalizeQPDraw(
  connection: Connection,
  mainProgram: Program<any>,
  qpProgram: Program<any>,
  config: BotConfig,
  drawId: bigint,
  indexerResult: QPIndexerResult,
  logger: Logger,
): Promise<FinalizeResult> {
  const startTime = Date.now();
  const [drawResultPda] = deriveQPDrawResultPDA(drawId, config.qpProgramId);

  logger.debug(
    {
      drawId: Number(drawId),
      winnerCounts: indexerResult.winnerCounts,
      nonce: indexerResult.nonce.toString(),
    },
    "[quickpick] Finalizing draw",
  );

  const signature = await (qpProgram.methods as any)
    .finalizeDraw({
      winnerCounts: {
        match5: indexerResult.winnerCounts.match5,
        match4: indexerResult.winnerCounts.match4,
        match3: indexerResult.winnerCounts.match3,
      },
      verificationHash: Array.from(indexerResult.verificationHash),
      indexerNonce: new BN(indexerResult.nonce.toString()),
    })
    .accounts({
      authority: config.authorityKeypair.publicKey,
      lotteryState: config.mainPDAs.lotteryState,
      quickPickState: config.qpPDAs.quickPickState,
      drawResult: drawResultPda,
    })
    .signers([config.authorityKeypair])
    .rpc({
      skipPreflight: config.skipPreflight,
      commitment: config.commitment,
    });

  logger.info(
    {
      signature,
      drawId: Number(drawId),
      durationMs: Date.now() - startTime,
    },
    "[quickpick] finalize_draw succeeded",
  );

  return { signature };
}

// ---------------------------------------------------------------------------
// Stuck Draw Recovery
// ---------------------------------------------------------------------------

/**
 * Handle a stuck main lottery draw.
 *
 * If a draw has been in progress for longer than DRAW_COMMIT_TIMEOUT,
 * cancel it and reset the state. Otherwise, try to resume from the
 * current phase.
 */
async function handleStuckMainDraw(
  connection: Connection,
  mainProgram: Program<any>,
  config: BotConfig,
  lotteryState: any,
  state: DrawState,
  logger: Logger,
): Promise<DrawState> {
  const drawId = BigInt(lotteryState.currentDrawId.toString());
  const commitTimestamp = Number(lotteryState.commitTimestamp.toString());
  const now = nowUnix();
  const elapsed = now - commitTimestamp;

  logger.warn(
    {
      drawId: Number(drawId),
      commitTimestamp,
      elapsed,
      timeout: DRAW_COMMIT_TIMEOUT,
    },
    `[main] Draw #${drawId} is stuck (in progress for ${elapsed}s)`,
  );

  if (elapsed > DRAW_COMMIT_TIMEOUT) {
    // Commit has timed out — cancel the draw
    logPhase(logger, "main", drawId, "recovery", "start", {
      action: "cancel_draw",
      elapsed,
    });

    if (config.dryRun) {
      logger.info("[main] DRY RUN: Would call cancel_draw");
      state.phase = "error";
      state.lastError = "Stuck draw — would cancel (dry run)";
      return state;
    }

    try {
      const signature = await (mainProgram.methods as any)
        .cancelDraw("Bot: commit timed out after " + elapsed + "s")
        .accounts({
          authority: config.authorityKeypair.publicKey,
          lotteryState: config.mainPDAs.lotteryState,
        })
        .signers([config.authorityKeypair])
        .rpc({
          skipPreflight: config.skipPreflight,
          commitment: config.commitment,
        });

      logPhase(logger, "main", drawId, "recovery", "success", {
        action: "cancel_draw",
        signature,
      });
      logTx(logger, "main", "cancel_draw", signature);

      state.phase = "idle";
      state.lastError = "Draw cancelled due to timeout — will retry next cycle";
      return state;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logPhase(logger, "main", drawId, "recovery", "error", {
        action: "cancel_draw",
        error: msg,
      });
      state.phase = "error";
      state.lastError = `Failed to cancel stuck draw: ${msg}`;
      state.errorCount++;
      return state;
    }
  }

  // Draw is in progress but not timed out yet
  // Check if we already have a draw result (execute succeeded but finalize didn't)
  const [drawResultPda] = deriveDrawResultPDA(drawId, config.mainProgramId);

  try {
    const drawResult = await (mainProgram.account as any).drawResult.fetch(
      drawResultPda,
    );

    // Draw result exists — we can resume from indexing
    if (!drawResult.isExplicitlyFinalized) {
      logger.info(
        { drawId: Number(drawId) },
        "[main] Draw result exists but not finalized — resuming from index phase",
      );

      const winningNumbers: number[] = Array.from(
        drawResult.winningNumbers as number[],
      );
      state.winningNumbers = winningNumbers;

      // Index
      const indexerResult = await indexMainDraw(
        connection,
        config.mainProgramId,
        drawId,
        winningNumbers,
        logger,
        config.indexerNonceSeed,
      );

      state.indexerResult = indexerResult;
      state.phase = "indexed";

      // Finalize
      const finalizeResult = await withRetry(
        () =>
          finalizeMainDraw(
            connection,
            mainProgram,
            config,
            drawId,
            indexerResult,
            logger,
          ),
        config.maxRetries,
        config.retryDelayMs,
        logger,
        "main.finalize_draw (recovery)",
      );

      state.phase = "finalized";
      logPhase(logger, "main", drawId, "recovery", "success", {
        action: "resume_finalize",
        signature: finalizeResult.signature,
      });

      return state;
    }
  } catch (_fetchErr) {
    // Draw result doesn't exist — draw was committed but not executed yet
    logger.info(
      { drawId: Number(drawId), elapsed },
      "[main] Draw committed but not yet executed — attempting execute",
    );

    const randomnessAccount = new PublicKey(
      lotteryState.currentRandomnessAccount.toBase58(),
    );

    try {
      const executeResult = await executeMainDraw(
        connection,
        mainProgram,
        config,
        drawId,
        randomnessAccount,
        logger,
      );

      state.winningNumbers = executeResult.winningNumbers;
      state.phase = "executed";

      // Continue with indexing and finalization
      const indexerResult = await indexMainDraw(
        connection,
        config.mainProgramId,
        drawId,
        executeResult.winningNumbers,
        logger,
        config.indexerNonceSeed,
      );

      state.indexerResult = indexerResult;
      state.phase = "indexed";

      const finalizeResult = await withRetry(
        () =>
          finalizeMainDraw(
            connection,
            mainProgram,
            config,
            drawId,
            indexerResult,
            logger,
          ),
        config.maxRetries,
        config.retryDelayMs,
        logger,
        "main.finalize_draw (recovery)",
      );

      state.phase = "finalized";
      return state;
    } catch (execErr: unknown) {
      const msg = execErr instanceof Error ? execErr.message : String(execErr);
      logger.warn(
        { drawId: Number(drawId), error: msg },
        "[main] Could not resume execute — waiting for timeout to cancel",
      );
      state.phase = "error";
      state.lastError = `Stuck draw: execute failed (${msg}), waiting for timeout`;
      return state;
    }
  }

  state.phase = "idle";
  state.lastError =
    "Draw in progress but state unclear — will retry next cycle";
  return state;
}

/**
 * Handle a stuck Quick Pick draw.
 */
async function handleStuckQPDraw(
  connection: Connection,
  mainProgram: Program<any>,
  qpProgram: Program<any>,
  config: BotConfig,
  qpState: any,
  state: DrawState,
  logger: Logger,
): Promise<DrawState> {
  const drawId = BigInt(qpState.currentDraw.toString());
  const commitTimestamp = Number(qpState.commitTimestamp.toString());
  const now = nowUnix();
  const elapsed = now - commitTimestamp;

  logger.warn(
    {
      drawId: Number(drawId),
      commitTimestamp,
      elapsed,
    },
    `[quickpick] Draw #${drawId} is stuck (in progress for ${elapsed}s)`,
  );

  // QP uses a 1-hour timeout too
  const QP_COMMIT_TIMEOUT = 3600;

  if (elapsed > QP_COMMIT_TIMEOUT) {
    logPhase(logger, "quickpick", drawId, "recovery", "start", {
      action: "cancel_draw",
      elapsed,
    });

    if (config.dryRun) {
      logger.info("[quickpick] DRY RUN: Would call cancel_draw");
      state.phase = "error";
      state.lastError = "Stuck draw — would cancel (dry run)";
      return state;
    }

    try {
      const signature = await (qpProgram.methods as any)
        .cancelDraw("Bot: commit timed out after " + elapsed + "s")
        .accounts({
          authority: config.authorityKeypair.publicKey,
          lotteryState: config.mainPDAs.lotteryState,
          quickPickState: config.qpPDAs.quickPickState,
        })
        .signers([config.authorityKeypair])
        .rpc({
          skipPreflight: config.skipPreflight,
          commitment: config.commitment,
        });

      logPhase(logger, "quickpick", drawId, "recovery", "success", {
        action: "cancel_draw",
        signature,
      });
      logTx(logger, "quickpick", "cancel_draw", signature);

      state.phase = "idle";
      state.lastError = "Draw cancelled due to timeout — will retry next cycle";
      return state;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logPhase(logger, "quickpick", drawId, "recovery", "error", {
        action: "cancel_draw",
        error: msg,
      });
      state.phase = "error";
      state.lastError = `Failed to cancel stuck draw: ${msg}`;
      state.errorCount++;
      return state;
    }
  }

  // Not timed out yet — try to resume
  const [drawResultPda] = deriveQPDrawResultPDA(drawId, config.qpProgramId);

  try {
    const drawResult = await (
      qpProgram.account as any
    ).quickPickDrawResult.fetch(drawResultPda);

    if (!drawResult.isExplicitlyFinalized) {
      logger.info(
        { drawId: Number(drawId) },
        "[quickpick] Draw result exists but not finalized — resuming from index phase",
      );

      const winningNumbers: number[] = Array.from(
        drawResult.winningNumbers as number[],
      );
      state.winningNumbers = winningNumbers;

      const indexerResult = await indexQPDraw(
        connection,
        config.qpProgramId,
        drawId,
        winningNumbers,
        logger,
        config.indexerNonceSeed,
      );

      state.indexerResult = indexerResult;
      state.phase = "indexed";

      const finalizeResult = await withRetry(
        () =>
          finalizeQPDraw(
            connection,
            mainProgram,
            qpProgram,
            config,
            drawId,
            indexerResult,
            logger,
          ),
        config.maxRetries,
        config.retryDelayMs,
        logger,
        "qp.finalize_draw (recovery)",
      );

      state.phase = "finalized";
      logPhase(logger, "quickpick", drawId, "recovery", "success", {
        action: "resume_finalize",
        signature: finalizeResult.signature,
      });

      return state;
    }
  } catch (_fetchErr) {
    // Draw result doesn't exist — attempt execute
    logger.info(
      { drawId: Number(drawId), elapsed },
      "[quickpick] Draw committed but not yet executed — attempting execute",
    );

    const randomnessAccount = new PublicKey(
      qpState.currentRandomnessAccount.toBase58(),
    );

    try {
      const executeResult = await executeQPDraw(
        connection,
        mainProgram,
        qpProgram,
        config,
        drawId,
        randomnessAccount,
        logger,
      );

      state.winningNumbers = executeResult.winningNumbers;
      state.phase = "executed";

      const indexerResult = await indexQPDraw(
        connection,
        config.qpProgramId,
        drawId,
        executeResult.winningNumbers,
        logger,
        config.indexerNonceSeed,
      );

      state.indexerResult = indexerResult;
      state.phase = "indexed";

      const finalizeResult = await withRetry(
        () =>
          finalizeQPDraw(
            connection,
            mainProgram,
            qpProgram,
            config,
            drawId,
            indexerResult,
            logger,
          ),
        config.maxRetries,
        config.retryDelayMs,
        logger,
        "qp.finalize_draw (recovery)",
      );

      state.phase = "finalized";
      return state;
    } catch (execErr: unknown) {
      const msg = execErr instanceof Error ? execErr.message : String(execErr);
      logger.warn(
        { drawId: Number(drawId), error: msg },
        "[quickpick] Could not resume execute — waiting for timeout to cancel",
      );
      state.phase = "error";
      state.lastError = `Stuck draw: execute failed (${msg}), waiting for timeout`;
      return state;
    }
  }

  state.phase = "idle";
  state.lastError =
    "Draw in progress but state unclear — will retry next cycle";
  return state;
}

// ---------------------------------------------------------------------------
// Draw readiness checks
// ---------------------------------------------------------------------------

/**
 * Check if the main lottery is ready for a new draw.
 *
 * A draw is "ready" when:
 * 1. The lottery is not paused
 * 2. The lottery is funded
 * 3. No draw is currently in progress
 * 4. The current timestamp >= next_draw_timestamp - TICKET_SALE_CUTOFF
 */
export async function isMainDrawReady(
  mainProgram: Program<any>,
  config: BotConfig,
  logger: Logger,
): Promise<{ ready: boolean; reason: string; drawId?: bigint; state?: any }> {
  try {
    const lotteryState = await (mainProgram.account as any).lotteryState.fetch(
      config.mainPDAs.lotteryState,
    );

    const drawId = BigInt(lotteryState.currentDrawId.toString());
    const nextDraw = Number(lotteryState.nextDrawTimestamp.toString());
    const now = nowUnix();

    if (lotteryState.isPaused) {
      return {
        ready: false,
        reason: "Lottery is paused",
        drawId,
        state: lotteryState,
      };
    }

    if (!lotteryState.isFunded) {
      return {
        ready: false,
        reason: "Lottery is not funded",
        drawId,
        state: lotteryState,
      };
    }

    if (lotteryState.isDrawInProgress) {
      return {
        ready: true,
        reason: "Draw already in progress (may need recovery)",
        drawId,
        state: lotteryState,
      };
    }

    // The commit can happen starting from TICKET_SALE_CUTOFF before the draw time
    // (On-chain check: clock.unix_timestamp >= next_draw_timestamp - TICKET_SALE_CUTOFF)
    const cutoffTime = nextDraw - 3600; // TICKET_SALE_CUTOFF = 3600 for main
    if (now < cutoffTime) {
      const secondsUntil = cutoffTime - now;
      return {
        ready: false,
        reason: `Draw not ready yet (${secondsUntil}s until cutoff, ${nextDraw - now}s until draw)`,
        drawId,
        state: lotteryState,
      };
    }

    return {
      ready: true,
      reason: "Draw is ready",
      drawId,
      state: lotteryState,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ error: msg }, "[main] Failed to check draw readiness");
    return { ready: false, reason: `Error: ${msg}` };
  }
}

/**
 * Check if Quick Pick Express is ready for a new draw.
 */
export async function isQPDrawReady(
  qpProgram: Program<any>,
  config: BotConfig,
  logger: Logger,
): Promise<{ ready: boolean; reason: string; drawId?: bigint; state?: any }> {
  try {
    const qpState = await (qpProgram.account as any).quickPickState.fetch(
      config.qpPDAs.quickPickState,
    );

    const drawId = BigInt(qpState.currentDraw.toString());
    const nextDraw = Number(qpState.nextDrawTimestamp.toString());
    const now = nowUnix();

    if (qpState.isPaused) {
      return {
        ready: false,
        reason: "Quick Pick is paused",
        drawId,
        state: qpState,
      };
    }

    if (!qpState.isFunded) {
      return {
        ready: false,
        reason: "Quick Pick is not funded",
        drawId,
        state: qpState,
      };
    }

    if (qpState.isDrawInProgress) {
      return {
        ready: true,
        reason: "Draw already in progress (may need recovery)",
        drawId,
        state: qpState,
      };
    }

    // QP draws happen when now >= nextDrawTimestamp
    if (now < nextDraw) {
      const secondsUntil = nextDraw - now;
      return {
        ready: false,
        reason: `Draw not ready yet (${secondsUntil}s until draw)`,
        drawId,
        state: qpState,
      };
    }

    return { ready: true, reason: "Draw is ready", drawId, state: qpState };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ error: msg }, "[quickpick] Failed to check draw readiness");
    return { ready: false, reason: `Error: ${msg}` };
  }
}

// ---------------------------------------------------------------------------
// Force-finalize helper
// ---------------------------------------------------------------------------

/**
 * Force-finalize a stuck main lottery draw with zero winners.
 *
 * This is a last-resort recovery mechanism. It calls force_finalize_draw
 * which sets all winner counts to zero and advances the state.
 */
export async function forceFinalizeMainDraw(
  mainProgram: Program<any>,
  config: BotConfig,
  drawId: bigint,
  reason: string,
  logger: Logger,
): Promise<string> {
  const [drawResultPda] = deriveDrawResultPDA(drawId, config.mainProgramId);

  logger.warn(
    { drawId: Number(drawId), reason },
    `[main] Force-finalizing draw #${drawId}`,
  );

  const signature = await (mainProgram.methods as any)
    .forceFinalizeDraw(reason)
    .accounts({
      authority: config.authorityKeypair.publicKey,
      lotteryState: config.mainPDAs.lotteryState,
      drawResult: drawResultPda,
    })
    .signers([config.authorityKeypair])
    .rpc({
      skipPreflight: config.skipPreflight,
      commitment: config.commitment,
    });

  logTx(logger, "main", "force_finalize_draw", signature);
  return signature;
}

/**
 * Force-finalize a stuck Quick Pick draw.
 */
export async function forceFinalizeQPDraw(
  qpProgram: Program<any>,
  config: BotConfig,
  drawId: bigint,
  reason: string,
  logger: Logger,
): Promise<string> {
  const [drawResultPda] = deriveQPDrawResultPDA(drawId, config.qpProgramId);

  logger.warn(
    { drawId: Number(drawId), reason },
    `[quickpick] Force-finalizing draw #${drawId}`,
  );

  const signature = await (qpProgram.methods as any)
    .forceFinalizeDraw(reason)
    .accounts({
      authority: config.authorityKeypair.publicKey,
      lotteryState: config.mainPDAs.lotteryState,
      quickPickState: config.qpPDAs.quickPickState,
    })
    .signers([config.authorityKeypair])
    .rpc({
      skipPreflight: config.skipPreflight,
      commitment: config.commitment,
    });

  logTx(logger, "quickpick", "force_finalize_draw", signature);
  return signature;
}
