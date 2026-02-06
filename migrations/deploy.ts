/**
 * MazelProtocol – Deployment Migration Script
 *
 * This script performs the complete on-chain initialization sequence for both
 * the main lottery (SolanaLotto) and Quick Pick Express programs.
 *
 * Steps:
 *   1. Initialize main lottery  (state + 3 PDA token accounts)
 *   2. Fund main lottery seed   (transfer USDC into prize pool)
 *   3. Initialize Quick Pick    (state + 3 PDA token accounts)
 *   4. Fund Quick Pick seed     (transfer USDC into prize pool)
 *   5. Verify on-chain state
 *
 * Usage:
 *   # Against localnet (default):
 *   npx ts-node migrations/deploy.ts
 *
 *   # Against devnet:
 *   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
 *   ANCHOR_WALLET=~/.config/solana/id.json \
 *   npx ts-node migrations/deploy.ts
 *
 *   # Or via Anchor:
 *   anchor migrate --provider.cluster devnet
 *
 * Prerequisites:
 *   - Programs deployed (`anchor deploy`)
 *   - Authority wallet funded with SOL (for rent) and USDC (for seeds)
 *   - USDC mint address set correctly below (or via USDC_MINT env var)
 *   - Switchboard queue address set (or via SWITCHBOARD_QUEUE env var)
 *
 * Environment Variables (all optional – defaults work on localnet):
 *   USDC_MINT              – USDC mint public key
 *   SWITCHBOARD_QUEUE      – Switchboard randomness queue pubkey
 *   ANCHOR_PROVIDER_URL    – RPC endpoint
 *   ANCHOR_WALLET          – Path to authority keypair JSON
 *   DRY_RUN                – Set to "true" to derive PDAs / print plan only
 *   SKIP_MAIN_INIT         – "true" to skip main lottery init (already done)
 *   SKIP_MAIN_FUND         – "true" to skip main lottery fund_seed
 *   SKIP_QP_INIT           – "true" to skip Quick Pick init
 *   SKIP_QP_FUND           – "true" to skip Quick Pick fund_seed
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
  Connection,
  Commitment,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  createAccount,
  mintTo,
  getAccount,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";

// ---------------------------------------------------------------------------
// Configuration – adjust these for your deployment
// ---------------------------------------------------------------------------

/** Main lottery parameters */
const MAIN_LOTTERY_CONFIG = {
  ticketPrice: new BN(2_500_000), // $2.50
  houseFeeBps: 2800, // 28%
  jackpotCap: new BN(1_750_000_000_000), // $1,750,000
  seedAmount: new BN(500_000_000_000), // $500,000
  softCap: new BN(1_750_000_000_000), // $1,750,000
  hardCap: new BN(2_250_000_000_000), // $2,250,000
  drawInterval: new BN(86_400), // 24 hours
};

/** Quick Pick parameters (set in the program constants, only first_draw is configurable) */
const QP_SEED_AMOUNT = new BN(5_000_000_000); // $5,000

// ---------------------------------------------------------------------------
// PDA Seeds  (must mirror on-chain constants exactly)
// ---------------------------------------------------------------------------

// Main lottery
const LOTTERY_SEED = Buffer.from("lottery");
const MAIN_PRIZE_POOL_USDC_SEED = Buffer.from("prize_pool_usdc");
const MAIN_HOUSE_FEE_USDC_SEED = Buffer.from("house_fee_usdc");
const MAIN_INSURANCE_POOL_USDC_SEED = Buffer.from("insurance_pool_usdc");

// Quick Pick
const QUICK_PICK_SEED = Buffer.from("quick_pick");
const QP_PRIZE_POOL_USDC_SEED = Buffer.from("prize_pool_usdc");
const QP_HOUSE_FEE_USDC_SEED = Buffer.from("house_fee_usdc");
const QP_INSURANCE_POOL_USDC_SEED = Buffer.from("insurance_pool_usdc");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function env(key: string, fallback?: string): string | undefined {
  return process.env[key] ?? fallback;
}

function envBool(key: string): boolean {
  return env(key, "false")?.toLowerCase() === "true";
}

function deriveMainPDAs(programId: PublicKey) {
  const [lotteryState, lotteryBump] = PublicKey.findProgramAddressSync(
    [LOTTERY_SEED],
    programId,
  );
  const [prizePoolUsdc] = PublicKey.findProgramAddressSync(
    [MAIN_PRIZE_POOL_USDC_SEED],
    programId,
  );
  const [houseFeeUsdc] = PublicKey.findProgramAddressSync(
    [MAIN_HOUSE_FEE_USDC_SEED],
    programId,
  );
  const [insurancePoolUsdc] = PublicKey.findProgramAddressSync(
    [MAIN_INSURANCE_POOL_USDC_SEED],
    programId,
  );
  return {
    lotteryState,
    lotteryBump,
    prizePoolUsdc,
    houseFeeUsdc,
    insurancePoolUsdc,
  };
}

function deriveQPPDAs(programId: PublicKey) {
  const [quickPickState, qpBump] = PublicKey.findProgramAddressSync(
    [QUICK_PICK_SEED],
    programId,
  );
  const [prizePoolUsdc] = PublicKey.findProgramAddressSync(
    [QP_PRIZE_POOL_USDC_SEED],
    programId,
  );
  const [houseFeeUsdc] = PublicKey.findProgramAddressSync(
    [QP_HOUSE_FEE_USDC_SEED],
    programId,
  );
  const [insurancePoolUsdc] = PublicKey.findProgramAddressSync(
    [QP_INSURANCE_POOL_USDC_SEED],
    programId,
  );
  return {
    quickPickState,
    qpBump,
    prizePoolUsdc,
    houseFeeUsdc,
    insurancePoolUsdc,
  };
}

function formatUsdc(lamports: BN | bigint | number): string {
  const n =
    typeof lamports === "number" ? lamports : Number(lamports.toString());
  return `$${(n / 1_000_000).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function hr(label: string) {
  console.log(`\n${"=".repeat(72)}`);
  console.log(`  ${label}`);
  console.log(`${"=".repeat(72)}\n`);
}

async function accountExists(
  connection: Connection,
  pubkey: PublicKey,
): Promise<boolean> {
  const info = await connection.getAccountInfo(pubkey);
  return info !== null && info.data.length > 0;
}

// ---------------------------------------------------------------------------
// Main deployment function
// ---------------------------------------------------------------------------

async function deploy() {
  // ---- Provider / wallet setup ----
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const connection = provider.connection;
  const authority = (provider.wallet as anchor.Wallet).payer;
  const cluster = env("ANCHOR_PROVIDER_URL", "http://127.0.0.1:8899")!;

  hr("MazelProtocol Deployment");
  console.log(`  Cluster:    ${cluster}`);
  console.log(`  Authority:  ${authority.publicKey.toBase58()}`);
  console.log(`  Dry run:    ${envBool("DRY_RUN")}`);

  // ---- Load programs ----
  // Anchor workspace automatically reads Anchor.toml / target/idl
  const mainProgram =
    (anchor.workspace as any).mazelprotocol ??
    (anchor.workspace as any).solanaLotto;
  const qpProgram = (anchor.workspace as any).quickpick;

  if (!mainProgram) {
    throw new Error(
      "Could not load main lottery program from workspace. " +
        "Make sure `anchor build` has been run and the IDL exists.",
    );
  }
  if (!qpProgram) {
    throw new Error(
      "Could not load quickpick program from workspace. " +
        "Make sure `anchor build` has been run and the IDL exists.",
    );
  }

  const mainProgramId: PublicKey = mainProgram.programId;
  const qpProgramId: PublicKey = qpProgram.programId;

  console.log(`  Main program: ${mainProgramId.toBase58()}`);
  console.log(`  QP program:   ${qpProgramId.toBase58()}`);

  // ---- Derive PDAs ----
  const mainPDAs = deriveMainPDAs(mainProgramId);
  const qpPDAs = deriveQPPDAs(qpProgramId);

  console.log("\n  Main PDAs:");
  console.log(`    Lottery state:      ${mainPDAs.lotteryState.toBase58()}`);
  console.log(`    Prize pool USDC:    ${mainPDAs.prizePoolUsdc.toBase58()}`);
  console.log(`    House fee USDC:     ${mainPDAs.houseFeeUsdc.toBase58()}`);
  console.log(
    `    Insurance USDC:     ${mainPDAs.insurancePoolUsdc.toBase58()}`,
  );

  console.log("\n  Quick Pick PDAs:");
  console.log(`    QP state:           ${qpPDAs.quickPickState.toBase58()}`);
  console.log(`    QP prize pool USDC: ${qpPDAs.prizePoolUsdc.toBase58()}`);
  console.log(`    QP house fee USDC:  ${qpPDAs.houseFeeUsdc.toBase58()}`);
  console.log(`    QP insurance USDC:  ${qpPDAs.insurancePoolUsdc.toBase58()}`);

  if (envBool("DRY_RUN")) {
    console.log("\n✅ Dry run complete – no transactions sent.\n");
    return;
  }

  // ---- Resolve USDC mint ----
  let usdcMint: PublicKey;
  const usdcMintEnv = env("USDC_MINT");

  if (usdcMintEnv) {
    usdcMint = new PublicKey(usdcMintEnv);
    console.log(`\n  USDC mint (env): ${usdcMint.toBase58()}`);
  } else if (cluster.includes("mainnet")) {
    // Mainnet USDC (Circle)
    usdcMint = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
    console.log(`\n  USDC mint (mainnet): ${usdcMint.toBase58()}`);
  } else if (cluster.includes("devnet")) {
    // Devnet USDC – you may need to create / use a test mint
    usdcMint = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
    console.log(`\n  USDC mint (devnet): ${usdcMint.toBase58()}`);
    console.log(
      "  ⚠  If this is wrong, set USDC_MINT env var to your devnet USDC mint.",
    );
  } else {
    // Localnet – create a fresh USDC-like mint
    console.log("\n  Creating test USDC mint for localnet...");
    usdcMint = await createMint(
      connection,
      authority,
      authority.publicKey, // mint authority
      null, // freeze authority
      6, // decimals
    );
    console.log(`  USDC mint (local): ${usdcMint.toBase58()}`);
  }

  // ---- Authority USDC ATA ----
  const authorityAta = await getOrCreateAssociatedTokenAccount(
    connection,
    authority,
    usdcMint,
    authority.publicKey,
  );
  console.log(`  Authority USDC ATA: ${authorityAta.address.toBase58()}`);

  // On localnet, mint enough USDC to cover both seeds if balance is low
  const requiredUsdc =
    BigInt(MAIN_LOTTERY_CONFIG.seedAmount.toString()) +
    BigInt(QP_SEED_AMOUNT.toString()) +
    BigInt(10_000_000_000); // $10k buffer

  if (authorityAta.amount < requiredUsdc && !cluster.includes("mainnet")) {
    const deficit = requiredUsdc - authorityAta.amount;
    console.log(
      `  Minting ${formatUsdc(deficit)} test USDC to authority (non-mainnet)...`,
    );
    await mintTo(
      connection,
      authority,
      usdcMint,
      authorityAta.address,
      authority.publicKey, // mint authority
      deficit,
    );
    console.log("  ✅ Test USDC minted.");
  }

  // ---- Switchboard queue ----
  let switchboardQueue: PublicKey;
  const sbQueueEnv = env("SWITCHBOARD_QUEUE");
  if (sbQueueEnv) {
    switchboardQueue = new PublicKey(sbQueueEnv);
  } else {
    // Placeholder – on localnet tests mock this
    switchboardQueue = Keypair.generate().publicKey;
    console.log(
      `  Switchboard queue (placeholder): ${switchboardQueue.toBase58()}`,
    );
    console.log(
      "  ⚠  Set SWITCHBOARD_QUEUE env var for devnet/mainnet deployments.",
    );
  }

  // ========================================================================
  // STEP 1 — Initialize Main Lottery
  // ========================================================================
  if (!envBool("SKIP_MAIN_INIT")) {
    hr("Step 1: Initialize Main Lottery");

    const alreadyInit = await accountExists(connection, mainPDAs.lotteryState);
    if (alreadyInit) {
      console.log("  ⏭  Main lottery state already exists – skipping init.");
    } else {
      console.log("  Sending initialize transaction...");
      console.log(
        `    Ticket price:  ${formatUsdc(MAIN_LOTTERY_CONFIG.ticketPrice)}`,
      );
      console.log(
        `    Seed amount:   ${formatUsdc(MAIN_LOTTERY_CONFIG.seedAmount)}`,
      );
      console.log(
        `    Soft cap:      ${formatUsdc(MAIN_LOTTERY_CONFIG.softCap)}`,
      );
      console.log(
        `    Hard cap:      ${formatUsdc(MAIN_LOTTERY_CONFIG.hardCap)}`,
      );
      console.log(
        `    Draw interval: ${MAIN_LOTTERY_CONFIG.drawInterval.toNumber()}s`,
      );

      const tx = await mainProgram.methods
        .initialize({
          ticketPrice: MAIN_LOTTERY_CONFIG.ticketPrice,
          houseFeeBps: MAIN_LOTTERY_CONFIG.houseFeeBps,
          jackpotCap: MAIN_LOTTERY_CONFIG.jackpotCap,
          seedAmount: MAIN_LOTTERY_CONFIG.seedAmount,
          softCap: MAIN_LOTTERY_CONFIG.softCap,
          hardCap: MAIN_LOTTERY_CONFIG.hardCap,
          drawInterval: MAIN_LOTTERY_CONFIG.drawInterval,
          switchboardQueue,
        })
        .accounts({
          authority: authority.publicKey,
          lotteryState: mainPDAs.lotteryState,
          usdcMint,
          prizePoolUsdc: mainPDAs.prizePoolUsdc,
          houseFeeUsdc: mainPDAs.houseFeeUsdc,
          insurancePoolUsdc: mainPDAs.insurancePoolUsdc,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .rpc();

      console.log(`  ✅ Main lottery initialized.  tx: ${tx}`);
    }
  } else {
    console.log("\n  ⏭  Skipping main lottery init (SKIP_MAIN_INIT=true)");
  }

  // ========================================================================
  // STEP 2 — Fund Main Lottery Seed
  // ========================================================================
  if (!envBool("SKIP_MAIN_FUND")) {
    hr("Step 2: Fund Main Lottery Seed");

    // Check if already funded
    let mainState: any;
    try {
      mainState = await mainProgram.account.lotteryState.fetch(
        mainPDAs.lotteryState,
      );
    } catch {
      throw new Error(
        "Main lottery state does not exist. Run Step 1 first or unset SKIP_MAIN_INIT.",
      );
    }

    if (mainState.isFunded) {
      console.log(
        `  ⏭  Main lottery already funded (jackpot: ${formatUsdc(mainState.jackpotBalance)}) – skipping.`,
      );
    } else {
      console.log(
        `  Funding main lottery with ${formatUsdc(MAIN_LOTTERY_CONFIG.seedAmount)}...`,
      );

      const tx = await mainProgram.methods
        .fundSeed()
        .accounts({
          authority: authority.publicKey,
          lotteryState: mainPDAs.lotteryState,
          authorityUsdc: authorityAta.address,
          prizePoolUsdc: mainPDAs.prizePoolUsdc,
          usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      console.log(`  ✅ Main lottery funded.  tx: ${tx}`);

      // Verify
      mainState = await mainProgram.account.lotteryState.fetch(
        mainPDAs.lotteryState,
      );
      console.log(
        `    Jackpot balance: ${formatUsdc(mainState.jackpotBalance)}`,
      );
      console.log(`    Is funded:       ${mainState.isFunded}`);
      console.log(`    Is paused:       ${mainState.isPaused}`);
    }
  } else {
    console.log(
      "\n  ⏭  Skipping main lottery fund_seed (SKIP_MAIN_FUND=true)",
    );
  }

  // ========================================================================
  // STEP 3 — Initialize Quick Pick
  // ========================================================================
  if (!envBool("SKIP_QP_INIT")) {
    hr("Step 3: Initialize Quick Pick Express");

    const alreadyInit = await accountExists(connection, qpPDAs.quickPickState);
    if (alreadyInit) {
      console.log("  ⏭  QuickPick state already exists – skipping init.");
    } else {
      console.log("  Sending Quick Pick initialize transaction...");
      console.log("    Matrix:      5/35");
      console.log("    Ticket:      $1.50");
      console.log(`    Seed:        ${formatUsdc(QP_SEED_AMOUNT)}`);
      console.log("    Interval:    4 hours");

      const tx = await qpProgram.methods
        .initialize({ firstDrawTimestamp: null })
        .accounts({
          authority: authority.publicKey,
          lotteryState: mainPDAs.lotteryState,
          quickPickState: qpPDAs.quickPickState,
          usdcMint,
          prizePoolUsdc: qpPDAs.prizePoolUsdc,
          houseFeeUsdc: qpPDAs.houseFeeUsdc,
          insurancePoolUsdc: qpPDAs.insurancePoolUsdc,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .rpc();

      console.log(`  ✅ Quick Pick initialized.  tx: ${tx}`);
    }
  } else {
    console.log("\n  ⏭  Skipping Quick Pick init (SKIP_QP_INIT=true)");
  }

  // ========================================================================
  // STEP 4 — Fund Quick Pick Seed
  // ========================================================================
  if (!envBool("SKIP_QP_FUND")) {
    hr("Step 4: Fund Quick Pick Seed");

    let qpState: any;
    try {
      qpState = await qpProgram.account.quickPickState.fetch(
        qpPDAs.quickPickState,
      );
    } catch {
      throw new Error(
        "Quick Pick state does not exist. Run Step 3 first or unset SKIP_QP_INIT.",
      );
    }

    if (qpState.isFunded) {
      console.log(
        `  ⏭  Quick Pick already funded (jackpot: ${formatUsdc(qpState.jackpotBalance)}) – skipping.`,
      );
    } else {
      console.log(`  Funding Quick Pick with ${formatUsdc(QP_SEED_AMOUNT)}...`);

      const tx = await qpProgram.methods
        .fundSeed()
        .accounts({
          authority: authority.publicKey,
          lotteryState: mainPDAs.lotteryState,
          quickPickState: qpPDAs.quickPickState,
          authorityUsdc: authorityAta.address,
          prizePoolUsdc: qpPDAs.prizePoolUsdc,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      console.log(`  ✅ Quick Pick funded.  tx: ${tx}`);

      // Verify
      qpState = await qpProgram.account.quickPickState.fetch(
        qpPDAs.quickPickState,
      );
      console.log(`    Jackpot balance: ${formatUsdc(qpState.jackpotBalance)}`);
      console.log(`    Is funded:       ${qpState.isFunded}`);
      console.log(`    Is paused:       ${qpState.isPaused}`);
    }
  } else {
    console.log("\n  ⏭  Skipping Quick Pick fund_seed (SKIP_QP_FUND=true)");
  }

  // ========================================================================
  // STEP 5 — Post-Deployment Verification
  // ========================================================================
  hr("Step 5: Post-Deployment Verification");

  try {
    // Main lottery state
    const mainState = await mainProgram.account.lotteryState.fetch(
      mainPDAs.lotteryState,
    );
    const mainPool = await getAccount(connection, mainPDAs.prizePoolUsdc);
    const mainHouse = await getAccount(connection, mainPDAs.houseFeeUsdc);
    const mainIns = await getAccount(connection, mainPDAs.insurancePoolUsdc);

    console.log("  Main Lottery:");
    console.log(`    Authority:       ${mainState.authority.toBase58()}`);
    console.log(`    Draw ID:         ${mainState.currentDrawId.toNumber()}`);
    console.log(`    Jackpot:         ${formatUsdc(mainState.jackpotBalance)}`);
    console.log(`    Is funded:       ${mainState.isFunded}`);
    console.log(`    Is paused:       ${mainState.isPaused}`);
    console.log(`    Prize pool USDC: ${formatUsdc(mainPool.amount)}`);
    console.log(`    House fee USDC:  ${formatUsdc(mainHouse.amount)}`);
    console.log(`    Insurance USDC:  ${formatUsdc(mainIns.amount)}`);

    // Quick Pick state
    const qpState = await qpProgram.account.quickPickState.fetch(
      qpPDAs.quickPickState,
    );
    const qpPool = await getAccount(connection, qpPDAs.prizePoolUsdc);
    const qpHouse = await getAccount(connection, qpPDAs.houseFeeUsdc);
    const qpIns = await getAccount(connection, qpPDAs.insurancePoolUsdc);

    console.log("\n  Quick Pick Express:");
    console.log(`    Draw ID:         ${qpState.currentDraw.toNumber()}`);
    console.log(`    Jackpot:         ${formatUsdc(qpState.jackpotBalance)}`);
    console.log(`    Ticket price:    ${formatUsdc(qpState.ticketPrice)}`);
    console.log(
      `    Matrix:          ${qpState.pickCount}/${qpState.numberRange}`,
    );
    console.log(`    Is funded:       ${qpState.isFunded}`);
    console.log(`    Is paused:       ${qpState.isPaused}`);
    console.log(`    Prize pool USDC: ${formatUsdc(qpPool.amount)}`);
    console.log(`    House fee USDC:  ${formatUsdc(qpHouse.amount)}`);
    console.log(`    Insurance USDC:  ${formatUsdc(qpIns.amount)}`);

    // Sanity checks
    const errors: string[] = [];

    if (!mainState.isFunded) errors.push("Main lottery is NOT funded");
    if (mainState.isPaused && mainState.isFunded)
      errors.push("Main lottery is paused despite being funded");
    if (Number(mainPool.amount) === 0 && mainState.isFunded)
      errors.push("Main prize pool is empty despite being funded");

    if (!qpState.isFunded) errors.push("Quick Pick is NOT funded");
    if (qpState.isPaused && qpState.isFunded)
      errors.push("Quick Pick is paused despite being funded");
    if (Number(qpPool.amount) === 0 && qpState.isFunded)
      errors.push("QP prize pool is empty despite being funded");

    if (errors.length > 0) {
      console.log("\n  ⚠️  Warnings:");
      for (const e of errors) {
        console.log(`    - ${e}`);
      }
    } else {
      console.log("\n  ✅ All checks passed.");
    }
  } catch (err: any) {
    console.error("\n  ❌ Verification failed:", err.message ?? err);
    console.error(
      "     Some accounts may not exist yet. Re-run after completing all steps.",
    );
  }

  // ========================================================================
  // Summary
  // ========================================================================
  hr("Deployment Complete");

  console.log("  Next steps for the operator:");
  console.log(
    "    1. Secure the authority key (move to multi-sig / hardware wallet)",
  );
  console.log(
    "    2. Set up the operator bot (commit → execute → index → finalize)",
  );
  console.log(
    "    3. Configure the off-chain indexer to produce verification_hash + nonce",
  );
  console.log(
    "    4. Point the frontend to the correct program IDs and cluster",
  );
  console.log("    5. Run migrations/verify.ts periodically to check solvency");
  console.log("");
  console.log("  Program IDs:");
  console.log(`    Main lottery: ${mainProgramId.toBase58()}`);
  console.log(`    Quick Pick:   ${qpProgramId.toBase58()}`);
  console.log("");
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

deploy()
  .then(() => {
    console.log("Done.\n");
    process.exit(0);
  })
  .catch((err) => {
    console.error("\n❌ Deployment failed:\n");
    console.error(err);
    process.exit(1);
  });
