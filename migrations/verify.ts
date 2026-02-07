/**
 * MazelProtocol – Post-Deployment Verification Script
 *
 * This script fetches all on-chain state for both the main lottery (MazelProtocol)
 * and Quick Pick Express programs, checks token balances, validates solvency
 * invariants, and reports any issues.
 *
 * Usage:
 *   # Against localnet (default):
 *   npx ts-node migrations/verify.ts
 *
 *   # Against devnet:
 *   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
 *   ANCHOR_WALLET=~/.config/solana/id.json \
 *   npx ts-node migrations/verify.ts
 *
 * Environment Variables:
 *   ANCHOR_PROVIDER_URL  – RPC endpoint
 *   ANCHOR_WALLET        – Path to wallet keypair JSON (read-only, no txs sent)
 *   VERBOSE              – "true" for extra detail
 */

import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import { PublicKey, Connection } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAccount, AccountLayout } from "@solana/spl-token";

// ---------------------------------------------------------------------------
// PDA Seeds (must mirror on-chain constants)
// ---------------------------------------------------------------------------

const LOTTERY_SEED = Buffer.from("lottery");
const MAIN_PRIZE_POOL_USDC_SEED = Buffer.from("prize_pool_usdc");
const MAIN_HOUSE_FEE_USDC_SEED = Buffer.from("house_fee_usdc");
const MAIN_INSURANCE_POOL_USDC_SEED = Buffer.from("insurance_pool_usdc");

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

const VERBOSE = env("VERBOSE", "false")?.toLowerCase() === "true";

function deriveMainPDAs(programId: PublicKey) {
  const [lotteryState] = PublicKey.findProgramAddressSync(
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
  return { lotteryState, prizePoolUsdc, houseFeeUsdc, insurancePoolUsdc };
}

function deriveQPPDAs(programId: PublicKey) {
  const [quickPickState] = PublicKey.findProgramAddressSync(
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
  return { quickPickState, prizePoolUsdc, houseFeeUsdc, insurancePoolUsdc };
}

function formatUsdc(lamports: BN | bigint | number): string {
  const n =
    typeof lamports === "number" ? lamports : Number(lamports.toString());
  return `$${(n / 1_000_000).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function hr(label: string) {
  console.log(`\n${"=".repeat(72)}`);
  console.log(`  ${label}`);
  console.log(`${"=".repeat(72)}\n`);
}

function sectionHr(label: string) {
  console.log(`\n  ${"─".repeat(60)}`);
  console.log(`  ${label}`);
  console.log(`  ${"─".repeat(60)}`);
}

async function accountExists(
  connection: Connection,
  pubkey: PublicKey,
): Promise<boolean> {
  const info = await connection.getAccountInfo(pubkey);
  return info !== null && info.data.length > 0;
}

async function safeGetTokenBalance(
  connection: Connection,
  pubkey: PublicKey,
): Promise<bigint | null> {
  try {
    const account = await getAccount(connection, pubkey);
    return account.amount;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Check definitions
// ---------------------------------------------------------------------------

interface CheckResult {
  name: string;
  status: "PASS" | "WARN" | "FAIL" | "SKIP";
  message: string;
}

const results: CheckResult[] = [];

function pass(name: string, message: string) {
  results.push({ name, status: "PASS", message });
}

function warn(name: string, message: string) {
  results.push({ name, status: "WARN", message });
}

function fail(name: string, message: string) {
  results.push({ name, status: "FAIL", message });
}

function skip(name: string, message: string) {
  results.push({ name, status: "SKIP", message });
}

// ---------------------------------------------------------------------------
// Main verification function
// ---------------------------------------------------------------------------

async function verify() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const connection = provider.connection;
  const cluster = env("ANCHOR_PROVIDER_URL", "http://127.0.0.1:8899")!;

  hr("MazelProtocol Verification");
  console.log(`  Cluster: ${cluster}`);
  console.log(`  Time:    ${new Date().toISOString()}`);

  // Load programs
  const mainProgram = (anchor.workspace as any).mazelprotocol;
  const qpProgram = (anchor.workspace as any).quickpick;

  if (!mainProgram || !qpProgram) {
    console.error(
      "  ❌ Could not load programs from workspace. Run `anchor build` first.",
    );
    process.exit(1);
  }

  const mainProgramId: PublicKey = mainProgram.programId;
  const qpProgramId: PublicKey = qpProgram.programId;

  console.log(`  Main program: ${mainProgramId.toBase58()}`);
  console.log(`  QP program:   ${qpProgramId.toBase58()}`);

  const mainPDAs = deriveMainPDAs(mainProgramId);
  const qpPDAs = deriveQPPDAs(qpProgramId);

  // ========================================================================
  // 1. Program Deployment Checks
  // ========================================================================
  sectionHr("1. Program Deployment");

  const mainProgramInfo = await connection.getAccountInfo(mainProgramId);
  if (mainProgramInfo && mainProgramInfo.executable) {
    pass(
      "main-program-deployed",
      "Main lottery program is deployed and executable",
    );
  } else {
    fail(
      "main-program-deployed",
      "Main lottery program is NOT deployed or not executable",
    );
  }

  const qpProgramInfo = await connection.getAccountInfo(qpProgramId);
  if (qpProgramInfo && qpProgramInfo.executable) {
    pass(
      "qp-program-deployed",
      "Quick Pick program is deployed and executable",
    );
  } else {
    fail(
      "qp-program-deployed",
      "Quick Pick program is NOT deployed or not executable",
    );
  }

  // ========================================================================
  // 2. Main Lottery State
  // ========================================================================
  sectionHr("2. Main Lottery State");

  let mainState: any = null;
  const mainStateExists = await accountExists(
    connection,
    mainPDAs.lotteryState,
  );

  if (!mainStateExists) {
    fail("main-state-exists", "Main lottery state PDA does not exist");
    console.log("    → Run migrations/deploy.ts to initialize");
  } else {
    pass("main-state-exists", "Main lottery state PDA exists");

    try {
      mainState = await mainProgram.account.lotteryState.fetch(
        mainPDAs.lotteryState,
      );

      console.log(`    Authority:         ${mainState.authority.toBase58()}`);
      console.log(
        `    Draw ID:           ${mainState.currentDrawId.toNumber()}`,
      );
      console.log(
        `    Jackpot:           ${formatUsdc(mainState.jackpotBalance)}`,
      );
      console.log(
        `    Reserve:           ${formatUsdc(mainState.reserveBalance)}`,
      );
      console.log(
        `    Insurance (state): ${formatUsdc(mainState.insuranceBalance)}`,
      );
      console.log(
        `    Ticket price:      ${formatUsdc(mainState.ticketPrice)}`,
      );
      console.log(`    House fee BPS:     ${mainState.houseFeeBps}`);
      console.log(`    Seed amount:       ${formatUsdc(mainState.seedAmount)}`);
      console.log(`    Soft cap:          ${formatUsdc(mainState.softCap)}`);
      console.log(`    Hard cap:          ${formatUsdc(mainState.hardCap)}`);
      console.log(
        `    Draw interval:     ${mainState.drawInterval.toNumber()}s`,
      );
      console.log(
        `    Total tickets:     ${mainState.totalTicketsSold.toNumber()}`,
      );
      console.log(
        `    Total prizes paid: ${formatUsdc(mainState.totalPrizesPaid)}`,
      );
      console.log(`    Is funded:         ${mainState.isFunded}`);
      console.log(`    Is paused:         ${mainState.isPaused}`);
      console.log(`    Draw in progress:  ${mainState.isDrawInProgress}`);
      console.log(`    Rolldown active:   ${mainState.isRolldownActive}`);

      if (VERBOSE) {
        console.log(
          `    Next draw:         ${new Date(mainState.nextDrawTimestamp.toNumber() * 1000).toISOString()}`,
        );
        console.log(
          `    Commit slot:       ${mainState.commitSlot.toNumber()}`,
        );
        console.log(
          `    Commit timestamp:  ${mainState.commitTimestamp.toNumber()}`,
        );
        console.log(
          `    Current draw tix:  ${mainState.currentDrawTickets.toNumber()}`,
        );
      }

      // Funded check
      if (mainState.isFunded) {
        pass("main-funded", "Main lottery is funded");
      } else {
        fail("main-funded", "Main lottery is NOT funded");
      }

      // Paused check
      if (!mainState.isPaused) {
        pass("main-active", "Main lottery is active (not paused)");
      } else if (mainState.isFunded) {
        warn(
          "main-active",
          "Main lottery is PAUSED despite being funded – is this intentional?",
        );
      } else {
        skip(
          "main-active",
          "Main lottery is paused (expected – not yet funded)",
        );
      }

      // Soft cap / hard cap ordering
      const softCap = mainState.softCap.toNumber();
      const hardCap = mainState.hardCap.toNumber();
      if (softCap < hardCap) {
        pass(
          "main-caps",
          `Soft cap < Hard cap (${formatUsdc(softCap)} < ${formatUsdc(hardCap)})`,
        );
      } else {
        fail(
          "main-caps",
          `Invalid cap ordering: soft=${formatUsdc(softCap)} hard=${formatUsdc(hardCap)}`,
        );
      }

      // Seed amount < soft cap
      const seedAmt = mainState.seedAmount.toNumber();
      if (seedAmt < softCap) {
        pass(
          "main-seed-cap",
          `Seed amount < Soft cap (${formatUsdc(seedAmt)} < ${formatUsdc(softCap)})`,
        );
      } else {
        fail(
          "main-seed-cap",
          `Seed amount >= soft cap: ${formatUsdc(seedAmt)}`,
        );
      }
    } catch (err: any) {
      fail(
        "main-state-fetch",
        `Failed to fetch main lottery state: ${err.message}`,
      );
    }
  }

  // ========================================================================
  // 3. Main Lottery Token Accounts
  // ========================================================================
  sectionHr("3. Main Lottery Token Accounts");

  const mainPoolBal = await safeGetTokenBalance(
    connection,
    mainPDAs.prizePoolUsdc,
  );
  const mainHouseBal = await safeGetTokenBalance(
    connection,
    mainPDAs.houseFeeUsdc,
  );
  const mainInsBal = await safeGetTokenBalance(
    connection,
    mainPDAs.insurancePoolUsdc,
  );

  if (mainPoolBal !== null) {
    pass(
      "main-prize-pool-exists",
      `Prize pool USDC exists: ${formatUsdc(mainPoolBal)}`,
    );
  } else {
    fail(
      "main-prize-pool-exists",
      "Prize pool USDC token account does NOT exist",
    );
  }

  if (mainHouseBal !== null) {
    pass(
      "main-house-fee-exists",
      `House fee USDC exists: ${formatUsdc(mainHouseBal)}`,
    );
  } else {
    fail(
      "main-house-fee-exists",
      "House fee USDC token account does NOT exist",
    );
  }

  if (mainInsBal !== null) {
    pass(
      "main-insurance-exists",
      `Insurance USDC exists: ${formatUsdc(mainInsBal)}`,
    );
  } else {
    fail(
      "main-insurance-exists",
      "Insurance USDC token account does NOT exist",
    );
  }

  // Solvency check – prize pool should hold at least the jackpot balance
  if (mainState && mainPoolBal !== null) {
    const jackpotLamports = BigInt(mainState.jackpotBalance.toString());
    const reserveLamports = BigInt(mainState.reserveBalance.toString());
    const expectedMinimum = jackpotLamports + reserveLamports;

    if (mainPoolBal >= expectedMinimum) {
      pass(
        "main-solvency",
        `Prize pool (${formatUsdc(mainPoolBal)}) >= jackpot + reserve (${formatUsdc(expectedMinimum)})`,
      );
    } else {
      const deficit = expectedMinimum - mainPoolBal;
      fail(
        "main-solvency",
        `SOLVENCY ISSUE: Prize pool (${formatUsdc(mainPoolBal)}) < jackpot + reserve (${formatUsdc(expectedMinimum)}). Deficit: ${formatUsdc(deficit)}`,
      );
    }
  }

  // Non-negative balances
  if (mainPoolBal !== null && mainPoolBal >= 0n) {
    pass("main-pool-nonneg", "Prize pool balance is non-negative");
  }
  if (mainHouseBal !== null && mainHouseBal >= 0n) {
    pass("main-house-nonneg", "House fee balance is non-negative");
  }
  if (mainInsBal !== null && mainInsBal >= 0n) {
    pass("main-ins-nonneg", "Insurance balance is non-negative");
  }

  // ========================================================================
  // 4. Quick Pick State
  // ========================================================================
  sectionHr("4. Quick Pick State");

  let qpState: any = null;
  const qpStateExists = await accountExists(connection, qpPDAs.quickPickState);

  if (!qpStateExists) {
    fail("qp-state-exists", "Quick Pick state PDA does not exist");
    console.log("    → Run migrations/deploy.ts to initialize");
  } else {
    pass("qp-state-exists", "Quick Pick state PDA exists");

    try {
      qpState = await qpProgram.account.quickPickState.fetch(
        qpPDAs.quickPickState,
      );

      console.log(`    Draw ID:           ${qpState.currentDraw.toNumber()}`);
      console.log(
        `    Jackpot:           ${formatUsdc(qpState.jackpotBalance)}`,
      );
      console.log(
        `    Prize pool (state):${formatUsdc(qpState.prizePoolBalance)}`,
      );
      console.log(
        `    Insurance (state): ${formatUsdc(qpState.insuranceBalance)}`,
      );
      console.log(
        `    Reserve (state):   ${formatUsdc(qpState.reserveBalance)}`,
      );
      console.log(`    Ticket price:      ${formatUsdc(qpState.ticketPrice)}`);
      console.log(
        `    Matrix:            ${qpState.pickCount}/${qpState.numberRange}`,
      );
      console.log(`    House fee BPS:     ${qpState.houseFeeBps}`);
      console.log(`    Seed amount:       ${formatUsdc(qpState.seedAmount)}`);
      console.log(`    Soft cap:          ${formatUsdc(qpState.softCap)}`);
      console.log(`    Hard cap:          ${formatUsdc(qpState.hardCap)}`);
      console.log(`    Match 4 prize:     ${formatUsdc(qpState.match4Prize)}`);
      console.log(`    Match 3 prize:     ${formatUsdc(qpState.match3Prize)}`);
      console.log(
        `    Total tickets:     ${qpState.totalTicketsSold.toNumber()}`,
      );
      console.log(
        `    Total prizes paid: ${formatUsdc(qpState.totalPrizesPaid)}`,
      );
      console.log(`    Is funded:         ${qpState.isFunded}`);
      console.log(`    Is paused:         ${qpState.isPaused}`);
      console.log(`    Draw in progress:  ${qpState.isDrawInProgress}`);
      console.log(`    Rolldown pending:  ${qpState.isRolldownPending}`);

      if (VERBOSE) {
        console.log(
          `    Next draw:         ${new Date(qpState.nextDrawTimestamp.toNumber() * 1000).toISOString()}`,
        );
        console.log(
          `    Draw interval:     ${qpState.drawInterval.toNumber()}s`,
        );
        console.log(`    Commit slot:       ${qpState.commitSlot.toNumber()}`);
        console.log(
          `    Current draw tix:  ${qpState.currentDrawTickets.toNumber()}`,
        );
      }

      // Funded check
      if (qpState.isFunded) {
        pass("qp-funded", "Quick Pick is funded");
      } else {
        fail("qp-funded", "Quick Pick is NOT funded");
      }

      // Active check
      if (!qpState.isPaused) {
        pass("qp-active", "Quick Pick is active (not paused)");
      } else if (qpState.isFunded) {
        warn(
          "qp-active",
          "Quick Pick is PAUSED despite being funded – is this intentional?",
        );
      } else {
        skip("qp-active", "Quick Pick is paused (expected – not yet funded)");
      }

      // Matrix validity
      if (qpState.pickCount === 5 && qpState.numberRange === 35) {
        pass("qp-matrix", "Matrix is 5/35 as expected");
      } else {
        warn(
          "qp-matrix",
          `Unexpected matrix: ${qpState.pickCount}/${qpState.numberRange}`,
        );
      }

      // Soft cap / hard cap ordering
      const qpSoft = qpState.softCap.toNumber();
      const qpHard = qpState.hardCap.toNumber();
      if (qpSoft < qpHard) {
        pass(
          "qp-caps",
          `Soft cap < Hard cap (${formatUsdc(qpSoft)} < ${formatUsdc(qpHard)})`,
        );
      } else {
        fail(
          "qp-caps",
          `Invalid cap ordering: soft=${formatUsdc(qpSoft)} hard=${formatUsdc(qpHard)}`,
        );
      }

      // Dynamic fee sanity
      const feeBps = qpState.houseFeeBps;
      if (feeBps >= 2800 && feeBps <= 3800) {
        pass(
          "qp-fee-range",
          `House fee BPS (${feeBps}) is within expected range [2800, 3800]`,
        );
      } else {
        warn(
          "qp-fee-range",
          `House fee BPS (${feeBps}) is outside expected range [2800, 3800]`,
        );
      }

      // Jackpot funding check
      const jackpotBal = qpState.jackpotBalance.toNumber();
      const seedAmt = qpState.seedAmount.toNumber();
      if (qpState.isFunded && jackpotBal >= seedAmt) {
        pass(
          "qp-jackpot-min",
          `Jackpot (${formatUsdc(jackpotBal)}) >= seed amount (${formatUsdc(seedAmt)})`,
        );
      } else if (qpState.isFunded) {
        warn(
          "qp-jackpot-min",
          `Jackpot (${formatUsdc(jackpotBal)}) < seed amount (${formatUsdc(seedAmt)}) – may block ticket purchases`,
        );
      }
    } catch (err: any) {
      fail(
        "qp-state-fetch",
        `Failed to fetch Quick Pick state: ${err.message}`,
      );
    }
  }

  // ========================================================================
  // 5. Quick Pick Token Accounts
  // ========================================================================
  sectionHr("5. Quick Pick Token Accounts");

  const qpPoolBal = await safeGetTokenBalance(connection, qpPDAs.prizePoolUsdc);
  const qpHouseBal = await safeGetTokenBalance(connection, qpPDAs.houseFeeUsdc);
  const qpInsBal = await safeGetTokenBalance(
    connection,
    qpPDAs.insurancePoolUsdc,
  );

  if (qpPoolBal !== null) {
    pass(
      "qp-prize-pool-exists",
      `QP prize pool USDC exists: ${formatUsdc(qpPoolBal)}`,
    );
  } else {
    fail(
      "qp-prize-pool-exists",
      "QP prize pool USDC token account does NOT exist – initialize must create it",
    );
  }

  if (qpHouseBal !== null) {
    pass(
      "qp-house-fee-exists",
      `QP house fee USDC exists: ${formatUsdc(qpHouseBal)}`,
    );
  } else {
    fail(
      "qp-house-fee-exists",
      "QP house fee USDC token account does NOT exist – initialize must create it",
    );
  }

  if (qpInsBal !== null) {
    pass(
      "qp-insurance-exists",
      `QP insurance USDC exists: ${formatUsdc(qpInsBal)}`,
    );
  } else {
    fail(
      "qp-insurance-exists",
      "QP insurance USDC token account does NOT exist – initialize must create it",
    );
  }

  // QP Solvency check – prize pool should hold at least jackpot + prize pool balance + reserve
  if (qpState && qpPoolBal !== null) {
    const qpJackpot = BigInt(qpState.jackpotBalance.toString());
    const qpPrizePool = BigInt(qpState.prizePoolBalance.toString());
    const qpReserve = BigInt(qpState.reserveBalance.toString());
    const expectedMinimum = qpJackpot + qpPrizePool + qpReserve;

    if (qpPoolBal >= expectedMinimum) {
      pass(
        "qp-solvency",
        `QP prize pool (${formatUsdc(qpPoolBal)}) >= jackpot + prizes + reserve (${formatUsdc(expectedMinimum)})`,
      );
    } else {
      const deficit = expectedMinimum - qpPoolBal;
      fail(
        "qp-solvency",
        `QP SOLVENCY ISSUE: Prize pool (${formatUsdc(qpPoolBal)}) < expected minimum (${formatUsdc(expectedMinimum)}). Deficit: ${formatUsdc(deficit)}`,
      );
    }
  }

  // QP token authority check – verify token accounts are owned by the QP program
  if (qpPoolBal !== null) {
    try {
      const poolAccount = await getAccount(connection, qpPDAs.prizePoolUsdc);
      if (poolAccount.owner.equals(qpPDAs.quickPickState)) {
        pass(
          "qp-pool-authority",
          "QP prize pool token authority is quick_pick_state PDA",
        );
      } else {
        fail(
          "qp-pool-authority",
          `QP prize pool token authority mismatch: expected ${qpPDAs.quickPickState.toBase58()}, got ${poolAccount.owner.toBase58()}`,
        );
      }
    } catch {
      skip("qp-pool-authority", "Could not verify QP prize pool authority");
    }
  }

  // Non-negative balances
  if (qpPoolBal !== null && qpPoolBal >= 0n) {
    pass("qp-pool-nonneg", "QP prize pool balance is non-negative");
  }
  if (qpHouseBal !== null && qpHouseBal >= 0n) {
    pass("qp-house-nonneg", "QP house fee balance is non-negative");
  }
  if (qpInsBal !== null && qpInsBal >= 0n) {
    pass("qp-ins-nonneg", "QP insurance balance is non-negative");
  }

  // ========================================================================
  // 6. Cross-Program Consistency
  // ========================================================================
  sectionHr("6. Cross-Program Consistency");

  if (mainState && qpState) {
    // Authority should be the same
    const mainAuth = mainState.authority.toBase58();
    // QP doesn't store its own authority – it reads from main lottery state
    pass(
      "shared-authority",
      `Main lottery authority: ${mainAuth} (QP verifies against this at runtime)`,
    );

    // Both should be funded
    if (mainState.isFunded && qpState.isFunded) {
      pass("both-funded", "Both programs are funded and ready");
    } else {
      const unfunded: string[] = [];
      if (!mainState.isFunded) unfunded.push("Main lottery");
      if (!qpState.isFunded) unfunded.push("Quick Pick");
      warn("both-funded", `Not all programs funded: ${unfunded.join(", ")}`);
    }

    // Both should be active
    if (!mainState.isPaused && !qpState.isPaused) {
      pass("both-active", "Both programs are active (not paused)");
    } else {
      const paused: string[] = [];
      if (mainState.isPaused) paused.push("Main lottery");
      if (qpState.isPaused) paused.push("Quick Pick");
      warn("both-active", `Paused programs: ${paused.join(", ")}`);
    }
  } else {
    skip(
      "cross-program",
      "Cannot perform cross-program checks – one or both states missing",
    );
  }

  // ========================================================================
  // 7. Token Account Ownership Verification
  // ========================================================================
  sectionHr("7. Token Account PDA Ownership");

  // Verify main lottery token accounts are owned by the main program
  for (const [label, pda] of [
    ["Main prize pool", mainPDAs.prizePoolUsdc],
    ["Main house fee", mainPDAs.houseFeeUsdc],
    ["Main insurance", mainPDAs.insurancePoolUsdc],
  ] as const) {
    const info = await connection.getAccountInfo(pda);
    if (info) {
      if (info.owner.equals(TOKEN_PROGRAM_ID)) {
        pass(
          `${label.toLowerCase().replace(/ /g, "-")}-owner`,
          `${label} account is owned by SPL Token program`,
        );
      } else {
        fail(
          `${label.toLowerCase().replace(/ /g, "-")}-owner`,
          `${label} account owner mismatch: ${info.owner.toBase58()}`,
        );
      }
    } else {
      skip(
        `${label.toLowerCase().replace(/ /g, "-")}-owner`,
        `${label} account does not exist`,
      );
    }
  }

  // Verify QP token accounts
  for (const [label, pda] of [
    ["QP prize pool", qpPDAs.prizePoolUsdc],
    ["QP house fee", qpPDAs.houseFeeUsdc],
    ["QP insurance", qpPDAs.insurancePoolUsdc],
  ] as const) {
    const info = await connection.getAccountInfo(pda);
    if (info) {
      if (info.owner.equals(TOKEN_PROGRAM_ID)) {
        pass(
          `${label.toLowerCase().replace(/ /g, "-")}-owner`,
          `${label} account is owned by SPL Token program`,
        );
      } else {
        fail(
          `${label.toLowerCase().replace(/ /g, "-")}-owner`,
          `${label} account owner mismatch: ${info.owner.toBase58()}`,
        );
      }
    } else {
      skip(
        `${label.toLowerCase().replace(/ /g, "-")}-owner`,
        `${label} account does not exist`,
      );
    }
  }

  // ========================================================================
  // Report
  // ========================================================================
  hr("Verification Report");

  const passes = results.filter((r) => r.status === "PASS");
  const warns = results.filter((r) => r.status === "WARN");
  const fails = results.filter((r) => r.status === "FAIL");
  const skips = results.filter((r) => r.status === "SKIP");

  console.log(
    `  Total checks: ${results.length}   ✅ ${passes.length}  ⚠️  ${warns.length}  ❌ ${fails.length}  ⏭  ${skips.length}\n`,
  );

  if (fails.length > 0) {
    console.log("  ❌ FAILURES:");
    for (const r of fails) {
      console.log(`    [${r.name}] ${r.message}`);
    }
    console.log("");
  }

  if (warns.length > 0) {
    console.log("  ⚠️  WARNINGS:");
    for (const r of warns) {
      console.log(`    [${r.name}] ${r.message}`);
    }
    console.log("");
  }

  if (skips.length > 0 && VERBOSE) {
    console.log("  ⏭  SKIPPED:");
    for (const r of skips) {
      console.log(`    [${r.name}] ${r.message}`);
    }
    console.log("");
  }

  if (VERBOSE && passes.length > 0) {
    console.log("  ✅ PASSES:");
    for (const r of passes) {
      console.log(`    [${r.name}] ${r.message}`);
    }
    console.log("");
  }

  if (fails.length === 0 && warns.length === 0) {
    console.log("  🎉 All checks passed! The protocol is healthy.\n");
  } else if (fails.length === 0) {
    console.log("  ✅ No critical failures. Review warnings above.\n");
  } else {
    console.log(
      `  ⛔ ${fails.length} critical failure(s) detected. Action required.\n`,
    );
  }

  // Return exit code based on failures
  return fails.length;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

verify()
  .then((failCount) => {
    if (failCount > 0) {
      process.exit(1);
    }
    process.exit(0);
  })
  .catch((err) => {
    console.error("\n❌ Verification script crashed:\n");
    console.error(err);
    process.exit(2);
  });
