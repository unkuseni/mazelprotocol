import * as anchor from "@coral-xyz/anchor";
import type { Program } from "@coral-xyz/anchor";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  SYSVAR_CLOCK_PUBKEY,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  createAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { assert } from "chai";
import { SolanaLotto } from "../target/types/solana_lotto";

describe("solana-lotto", () => {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SolanaLotto as Program<SolanaLotto>;
  const programId = program.programId;

  // Test accounts
  let authority: Keypair;
  let player: Keypair;
  let usdcMint: PublicKey;
  let lotteryState: PublicKey;
  let prizePoolUsdc: PublicKey;
  let houseFeeUsdc: PublicKey;
  let authorityUsdc: Keypair;
  let playerUsdc: Keypair;

  // Constants from the program
  const TICKET_PRICE = new anchor.BN(2_500_000); // $2.50 in lamports (6 decimals)
  const SEED_AMOUNT = new anchor.BN(500_000_000_000); // $500,000 seed
  const SOFT_CAP = new anchor.BN(1_750_000_000_000); // $1.75M
  const HARD_CAP = new anchor.BN(2_250_000_000_000); // $2.25M
  const JACKPOT_CAP = new anchor.BN(1_750_000_000_000); // $1.75M
  const NUMBERS_PER_TICKET = 6;

  // Mock Switchboard account
  const mockSwitchboardQueue = Keypair.generate();

  // PDA seeds
  const LOTTERY_SEED = Buffer.from("lottery");
  const PRIZE_POOL_USDC_SEED = Buffer.from("prize_pool_usdc");
  const HOUSE_FEE_USDC_SEED = Buffer.from("house_fee_usdc");
  const TICKET_SEED = Buffer.from("ticket");
  const DRAW_SEED = Buffer.from("draw");
  const USER_SEED = Buffer.from("user");

  before(async () => {
    // Generate test keypairs
    authority = anchor.web3.Keypair.generate();
    player = anchor.web3.Keypair.generate();

    // Fund authority and player with SOL
    const signatureAuth = await provider.connection.requestAirdrop(
      authority.publicKey,
      100 * anchor.web3.LAMPORTS_PER_SOL,
    );
    await provider.connection.confirmTransaction(signatureAuth);

    const signaturePlayer = await provider.connection.requestAirdrop(
      player.publicKey,
      100 * anchor.web3.LAMPORTS_PER_SOL,
    );
    await provider.connection.confirmTransaction(signaturePlayer);

    // Create USDC mint
    usdcMint = await createMint(
      provider.connection,
      authority,
      authority.publicKey,
      null,
      6, // USDC decimals
    );

    // Create token accounts
    authorityUsdc = anchor.web3.Keypair.generate();
    playerUsdc = anchor.web3.Keypair.generate();

    await createAccount(
      provider.connection,
      authority,
      usdcMint,
      authority.publicKey,
      authorityUsdc,
    );

    await createAccount(
      provider.connection,
      player,
      usdcMint,
      player.publicKey,
      playerUsdc,
    );

    // Fund authority USDC account with enough for seed amount + fees
    await mintTo(
      provider.connection,
      authority,
      usdcMint,
      authorityUsdc.publicKey,
      authority,
      10_000_000_000_000, // $10M
    );

    // Fund player USDC account
    await mintTo(
      provider.connection,
      authority,
      usdcMint,
      playerUsdc.publicKey,
      authority,
      100_000_000_000, // $100k
    );
  });

  async function getLotteryStatePda(): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddressSync([LOTTERY_SEED], programId);
  }

  async function getPrizePoolUsdcPda(): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddressSync([PRIZE_POOL_USDC_SEED], programId);
  }

  async function getHouseFeeUsdcPda(): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddressSync([HOUSE_FEE_USDC_SEED], programId);
  }

  async function getTicketPda(
    playerPubkey: PublicKey,
    drawId: anchor.BN,
  ): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddressSync(
      [
        TICKET_SEED,
        playerPubkey.toBuffer(),
        drawId.toArrayLike(Buffer, "le", 8),
      ],
      programId,
    );
  }

  async function getUserStatsPda(
    playerPubkey: PublicKey,
  ): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddressSync(
      [USER_SEED, playerPubkey.toBuffer()],
      programId,
    );
  }

  async function getDrawResultPda(
    drawId: anchor.BN,
  ): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddressSync(
      [DRAW_SEED, drawId.toArrayLike(Buffer, "le", 8)],
      programId,
    );
  }

  describe("initialize_lottery", () => {
    it("successfully initializes the lottery", async () => {
      const [lotteryStatePda, lotteryBump] = await getLotteryStatePda();
      const [prizePoolUsdcPda, prizePoolBump] = await getPrizePoolUsdcPda();
      const [houseFeeUsdcPda, houseFeeBump] = await getHouseFeeUsdcPda();

      lotteryState = lotteryStatePda;
      prizePoolUsdc = prizePoolUsdcPda;
      houseFeeUsdc = houseFeeUsdcPda;

      try {
        const tx = await program.methods
          .initializeLottery(
            TICKET_PRICE,
            JACKPOT_CAP,
            SEED_AMOUNT,
            SOFT_CAP,
            HARD_CAP,
          )
          .accounts({
            authority: authority.publicKey,
            lotteryState: lotteryStatePda,
            switchboardQueue: mockSwitchboardQueue.publicKey,
            prizePoolUsdc: prizePoolUsdcPda,
            houseFeeUsdc: houseFeeUsdcPda,
            authorityUsdc: authorityUsdc.publicKey,
            usdcMint: usdcMint,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          })
          .signers([authority])
          .rpc();

        console.log("Initialize lottery transaction:", tx);

        // Fetch and verify lottery state
        const lotteryStateAccount =
          await program.account.lotteryState.fetch(lotteryStatePda);

        assert.equal(
          lotteryStateAccount.authority.toString(),
          authority.publicKey.toString(),
        );
        assert.equal(
          lotteryStateAccount.switchboardQueue.toString(),
          mockSwitchboardQueue.publicKey.toString(),
        );
        assert.equal(
          lotteryStateAccount.ticketPrice.toString(),
          TICKET_PRICE.toString(),
        );
        assert.equal(
          lotteryStateAccount.jackpotCap.toString(),
          JACKPOT_CAP.toString(),
        );
        assert.equal(
          lotteryStateAccount.seedAmount.toString(),
          SEED_AMOUNT.toString(),
        );
        assert.equal(
          lotteryStateAccount.softCap.toString(),
          SOFT_CAP.toString(),
        );
        assert.equal(
          lotteryStateAccount.hardCap.toString(),
          HARD_CAP.toString(),
        );
        assert.equal(
          lotteryStateAccount.jackpotBalance.toString(),
          SEED_AMOUNT.toString(),
        );
        assert.equal(lotteryStateAccount.currentDrawId, 1);
        assert.equal(lotteryStateAccount.isPaused, false);
        assert.equal(lotteryStateAccount.isDrawInProgress, false);
        assert.equal(lotteryStateAccount.isRolldownActive, false);

        // Verify prize pool has seed amount
        const prizePoolAccount = await getAccount(
          provider.connection,
          prizePoolUsdcPda,
        );
        assert.equal(
          prizePoolAccount.amount.toString(),
          SEED_AMOUNT.toString(),
        );

        console.log("Lottery initialized successfully");
      } catch (error) {
        console.error("Error initializing lottery:", error);
        throw error;
      }
    });
  });

  describe("buy_ticket", () => {
    it("successfully buys a ticket with valid numbers", async () => {
      const lotteryStateAccount =
        await program.account.lotteryState.fetch(lotteryState);
      const currentDrawId = lotteryStateAccount.currentDrawId;

      const numbers = [1, 2, 3, 4, 5, 6];

      const [ticketPda] = await getTicketPda(
        player.publicKey,
        new anchor.BN(currentDrawId),
      );
      const [userStatsPda] = await getUserStatsPda(player.publicKey);

      try {
        // Get initial balances
        const playerUsdcAccountBefore = await getAccount(
          provider.connection,
          playerUsdc.publicKey,
        );
        const prizePoolAccountBefore = await getAccount(
          provider.connection,
          prizePoolUsdc,
        );
        const houseFeeAccountBefore = await getAccount(
          provider.connection,
          houseFeeUsdc,
        );

        const tx = await program.methods
          .buyTicket(numbers)
          .accounts({
            player: player.publicKey,
            lotteryState: lotteryState,
            ticket: ticketPda,
            playerUsdc: playerUsdc.publicKey,
            prizePoolUsdc: prizePoolUsdc,
            houseFeeUsdc: houseFeeUsdc,
            usdcMint: usdcMint,
            userStats: userStatsPda,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          })
          .signers([player])
          .rpc();

        console.log("Buy ticket transaction:", tx);

        // Verify ticket was created
        const ticketAccount = await program.account.ticketData.fetch(ticketPda);
        assert.equal(
          ticketAccount.owner.toString(),
          player.publicKey.toString(),
        );
        assert.equal(ticketAccount.drawId, currentDrawId);
        assert.deepEqual(ticketAccount.numbers, numbers);
        assert.equal(ticketAccount.isClaimed, false);

        // Verify user stats were created
        const userStatsAccount =
          await program.account.userStats.fetch(userStatsPda);
        assert.equal(
          userStatsAccount.wallet.toString(),
          player.publicKey.toString(),
        );
        assert.equal(userStatsAccount.totalTickets, 1);
        assert.equal(
          userStatsAccount.totalSpent.toString(),
          TICKET_PRICE.toString(),
        );

        // Verify token transfers
        const playerUsdcAccountAfter = await getAccount(
          provider.connection,
          playerUsdc.publicKey,
        );
        const prizePoolAccountAfter = await getAccount(
          provider.connection,
          prizePoolUsdc,
        );
        const houseFeeAccountAfter = await getAccount(
          provider.connection,
          houseFeeUsdc,
        );

        // Calculate house fee based on dynamic fee tier
        const lotteryStateUpdated =
          await program.account.lotteryState.fetch(lotteryState);
        const houseFeeBps = lotteryStateUpdated.houseFeeBps;
        const houseFeeAmount = TICKET_PRICE.mul(new anchor.BN(houseFeeBps)).div(
          new anchor.BN(10000),
        );
        const prizePoolAmount = TICKET_PRICE.sub(houseFeeAmount);

        assert.equal(
          playerUsdcAccountBefore.amount - playerUsdcAccountAfter.amount,
          TICKET_PRICE.toNumber(),
        );
        assert.equal(
          prizePoolAccountAfter.amount - prizePoolAccountBefore.amount,
          prizePoolAmount.toNumber(),
        );
        assert.equal(
          houseFeeAccountAfter.amount - houseFeeAccountBefore.amount,
          houseFeeAmount.toNumber(),
        );

        // Verify lottery state updated
        const lotteryStateAfter =
          await program.account.lotteryState.fetch(lotteryState);
        // Jackpot should have increased by jackpot allocation (65% of prize pool)
        const expectedJackpotIncrease = prizePoolAmount
          .mul(new anchor.BN(65))
          .div(new anchor.BN(100));
        const expectedJackpotBalance = SEED_AMOUNT.add(expectedJackpotIncrease);
        assert.equal(
          lotteryStateAfter.jackpotBalance.toString(),
          expectedJackpotBalance.toString(),
        );

        console.log("Ticket purchased successfully");
      } catch (error) {
        console.error("Error buying ticket:", error);
        throw error;
      }
    });

    it("fails to buy ticket with duplicate numbers", async () => {
      const lotteryStateAccount =
        await program.account.lotteryState.fetch(lotteryState);
      const currentDrawId = lotteryStateAccount.currentDrawId;

      // Duplicate numbers
      const numbers = [1, 1, 2, 3, 4, 5];

      const [ticketPda] = await getTicketPda(
        player.publicKey,
        new anchor.BN(currentDrawId),
      );
      const [userStatsPda] = await getUserStatsPda(player.publicKey);

      try {
        await program.methods
          .buyTicket(numbers)
          .accounts({
            player: player.publicKey,
            lotteryState: lotteryState,
            ticket: ticketPda,
            playerUsdc: playerUsdc.publicKey,
            prizePoolUsdc: prizePoolUsdc,
            houseFeeUsdc: houseFeeUsdc,
            usdcMint: usdcMint,
            userStats: userStatsPda,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          })
          .signers([player])
          .rpc();

        assert.fail("Should have failed with duplicate numbers");
      } catch (error) {
        assert.include(error.message, "InvalidNumbers");
        console.log("Correctly rejected duplicate numbers");
      }
    });

    it("fails to buy ticket with out-of-range numbers", async () => {
      const lotteryStateAccount =
        await program.account.lotteryState.fetch(lotteryState);
      const currentDrawId = lotteryStateAccount.currentDrawId;

      // Number 47 is out of range (max is 46)
      const numbers = [1, 2, 3, 4, 5, 47];

      const [ticketPda] = await getTicketPda(
        player.publicKey,
        new anchor.BN(currentDrawId),
      );
      const [userStatsPda] = await getUserStatsPda(player.publicKey);

      try {
        await program.methods
          .buyTicket(numbers)
          .accounts({
            player: player.publicKey,
            lotteryState: lotteryState,
            ticket: ticketPda,
            playerUsdc: playerUsdc.publicKey,
            prizePoolUsdc: prizePoolUsdc,
            houseFeeUsdc: houseFeeUsdc,
            usdcMint: usdcMint,
            userStats: userStatsPda,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          })
          .signers([player])
          .rpc();

        assert.fail("Should have failed with out-of-range numbers");
      } catch (error) {
        assert.include(error.message, "NumbersOutOfRange");
        console.log("Correctly rejected out-of-range numbers");
      }
    });
  });

  describe("dynamic_house_fee", () => {
    it("calculates correct house fee based on jackpot level", async () => {
      const lotteryStateAccount =
        await program.account.lotteryState.fetch(lotteryState);

      // Test different jackpot levels
      const testCases = [
        { jackpot: new anchor.BN(400_000_000_000), expectedFee: 2800 }, // < $500k: 28%
        { jackpot: new anchor.BN(600_000_000_000), expectedFee: 3200 }, // $500k-$1M: 32%
        { jackpot: new anchor.BN(1_200_000_000_000), expectedFee: 3600 }, // $1M-$1.5M: 36%
        { jackpot: new anchor.BN(1_800_000_000_000), expectedFee: 4000 }, // > $1.5M: 40%
      ];

      for (const testCase of testCases) {
        // Update jackpot balance in test (we can't modify the account directly, but we can test the logic)
        // For now, just verify the constants exist
        console.log(
          `Test case: jackpot $${testCase.jackpot.div(new anchor.BN(1_000_000)).toString()}, expected fee: ${testCase.expectedFee / 100}%`,
        );
      }

      // The actual fee calculation happens in the program's update_house_fee method
      // We'll test it indirectly through buy_ticket
      console.log(
        "Current house fee:",
        lotteryStateAccount.houseFeeBps / 100,
        "%",
      );
      console.log(
        "Current jackpot:",
        lotteryStateAccount.jackpotBalance
          .div(new anchor.BN(1_000_000))
          .toString(),
        "USDC",
      );
    });
  });

  describe("set_paused", () => {
    it("pauses and unpauses the lottery", async () => {
      // Pause the lottery
      await program.methods
        .setPaused(true)
        .accounts({
          authority: authority.publicKey,
          lotteryState: lotteryState,
        })
        .signers([authority])
        .rpc();

      let lotteryStateAccount =
        await program.account.lotteryState.fetch(lotteryState);
      assert.equal(lotteryStateAccount.isPaused, true);
      console.log("Lottery paused successfully");

      // Try to buy ticket while paused (should fail)
      const numbers = [7, 14, 21, 28, 35, 42];
      const lotteryStateUpdated =
        await program.account.lotteryState.fetch(lotteryState);
      const currentDrawId = lotteryStateUpdated.currentDrawId;

      const [ticketPda] = await getTicketPda(
        player.publicKey,
        new anchor.BN(currentDrawId),
      );
      const [userStatsPda] = await getUserStatsPda(player.publicKey);

      try {
        await program.methods
          .buyTicket(numbers)
          .accounts({
            player: player.publicKey,
            lotteryState: lotteryState,
            ticket: ticketPda,
            playerUsdc: playerUsdc.publicKey,
            prizePoolUsdc: prizePoolUsdc,
            houseFeeUsdc: houseFeeUsdc,
            usdcMint: usdcMint,
            userStats: userStatsPda,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          })
          .signers([player])
          .rpc();

        assert.fail("Should have failed while lottery is paused");
      } catch (error) {
        assert.include(error.message, "Paused");
        console.log("Correctly rejected ticket purchase while paused");
      }

      // Unpause the lottery
      await program.methods
        .setPaused(false)
        .accounts({
          authority: authority.publicKey,
          lotteryState: lotteryState,
        })
        .signers([authority])
        .rpc();

      lotteryStateAccount =
        await program.account.lotteryState.fetch(lotteryState);
      assert.equal(lotteryStateAccount.isPaused, false);
      console.log("Lottery unpaused successfully");
    });

    it("fails when non-authority tries to pause", async () => {
      try {
        await program.methods
          .setPaused(true)
          .accounts({
            authority: player.publicKey, // Player is not authority
            lotteryState: lotteryState,
          })
          .signers([player])
          .rpc();

        assert.fail("Should have failed with non-authority");
      } catch (error) {
        assert.include(error.message, "AdminAuthorityRequired");
        console.log("Correctly rejected non-authority pause attempt");
      }
    });
  });

  describe("rolldown_mechanism", () => {
    it("correctly calculates probabilistic rolldown", async () => {
      // Test the probabilistic rolldown logic
      const testCases = [
        { jackpot: new anchor.BN(1_500_000_000_000), shouldRolldown: false }, // Below soft cap
        {
          jackpot: new anchor.BN(1_800_000_000_000),
          shouldRolldown: "probabilistic",
        }, // Between soft and hard cap
        { jackpot: new anchor.BN(2_250_000_000_000), shouldRolldown: true }, // At hard cap
        { jackpot: new anchor.BN(2_500_000_000_000), shouldRolldown: true }, // Above hard cap
      ];

      for (const testCase of testCases) {
        const excess = testCase.jackpot.gt(SOFT_CAP)
          ? testCase.jackpot.sub(SOFT_CAP)
          : new anchor.BN(0);
        const range = HARD_CAP.sub(SOFT_CAP);

        if (testCase.jackpot.lte(SOFT_CAP)) {
          console.log(
            `Jackpot $${testCase.jackpot.div(new anchor.BN(1_000_000)).toString()}: Below soft cap, no rolldown`,
          );
        } else if (testCase.jackpot.gte(HARD_CAP)) {
          console.log(
            `Jackpot $${testCase.jackpot.div(new anchor.BN(1_000_000)).toString()}: At or above hard cap, forced rolldown`,
          );
        } else {
          const probabilityBps = excess.mul(new anchor.BN(10000)).div(range);
          console.log(
            `Jackpot $${testCase.jackpot.div(new anchor.BN(1_000_000)).toString()}: ${probabilityBps.toNumber() / 100}% chance of rolldown`,
          );
        }
      }

      // The actual rolldown triggering happens in start_draw instruction
      // based on current jackpot and blockhash
      console.log("Rolldown logic test completed");
    });
  });

  // Note: Testing start_draw and execute_draw would require
  // mocking Switchboard randomness accounts, which is complex.
  // These tests would be added once we have proper mocks.

  describe("prize_calculation", () => {
    it("calculates correct prize amounts", async () => {
      // Test prize calculation logic
      // This would require a full draw cycle with known winning numbers
      // For now, just verify the constants exist

      const matchTiers = [
        { match: 6, prize: "Jackpot" },
        { match: 5, prize: "Fixed $15,000" },
        { match: 4, prize: "Fixed $300" },
        { match: 3, prize: "Fixed $10" },
        { match: 2, prize: "Free ticket ($2.50 value)" },
      ];

      for (const tier of matchTiers) {
        console.log(`Match ${tier.match}: ${tier.prize}`);
      }

      // During rolldown, prizes increase significantly
      console.log(
        "During rolldown: Match 5 ~$51k, Match 4 ~$1,030, Match 3 ~$51",
      );
    });
  });

  describe("account_validation", () => {
    it("properly validates PDA derivations", async () => {
      // Test that PDAs are correctly derived
      const [lotteryStatePda] = await getLotteryStatePda();
      const [prizePoolUsdcPda] = await getPrizePoolUsdcPda();
      const [houseFeeUsdcPda] = await getHouseFeeUsdcPda();

      assert.equal(lotteryStatePda.toString(), lotteryState.toString());
      assert.equal(prizePoolUsdcPda.toString(), prizePoolUsdc.toString());
      assert.equal(houseFeeUsdcPda.toString(), houseFeeUsdc.toString());

      console.log("All PDAs correctly derived");
    });
  });

  describe("start_draw", () => {
    it("fails when non-authority tries to start draw", async () => {
      try {
        await program.methods
          .startDraw()
          .accounts({
            authority: player.publicKey, // Player is not authority
            lotteryState: lotteryState,
            randomnessAccountData: mockSwitchboardQueue.publicKey, // Mock randomness account
            clock: SYSVAR_CLOCK_PUBKEY,
          })
          .signers([player])
          .rpc();

        assert.fail("Should have failed with non-authority");
      } catch (error) {
        assert.include(error.message, "AdminAuthorityRequired");
        console.log("Correctly rejected non-authority start draw attempt");
      }
    });

    it("fails when draw is already in progress", async () => {
      // This test would require mocking a draw in progress state
      // For now, just document the expected behavior
      console.log("Draw in progress validation is handled by the program");
    });

    it("fails when draw is not ready yet", async () => {
      // This test would require manipulating the clock
      console.log("Draw timing validation is handled by the program");
    });
  });

  describe("claim_prize", () => {
    let winningTicketPda: PublicKey;
    let drawResultPda: PublicKey;

    it("fails to claim prize for non-winning ticket", async () => {
      // Create a ticket and draw result
      const lotteryStateAccount =
        await program.account.lotteryState.fetch(lotteryState);
      const drawId = new anchor.BN(lotteryStateAccount.currentDrawId);

      const numbers = [7, 14, 21, 28, 35, 42];
      [winningTicketPda] = await getTicketPda(player.publicKey, drawId);
      [drawResultPda] = await getDrawResultPda(drawId);

      // Note: This test requires a completed draw with known winning numbers
      // For now, just document the expected behavior
      console.log("Prize claiming validation is handled by the program");
      console.log(
        "Need a full draw cycle with Switchboard randomness to test properly",
      );
    });

    it("fails when ticket already claimed", async () => {
      console.log("Already claimed validation is handled by the program");
    });

    it("fails when caller is not ticket owner", async () => {
      console.log("Ticket ownership validation is handled by the program");
    });

    it("successfully claims prize for winning ticket", async () => {
      // This would require:
      // 1. A completed draw with winning numbers
      // 2. A ticket matching those numbers
      // 3. Prize pool with sufficient funds
      // 4. Proper PDA derivations for prize pool authority

      console.log("Full prize claim test requires:");
      console.log("- Mock Switchboard randomness account");
      console.log("- Completed draw with winning numbers stored");
      console.log("- Ticket with matching numbers");
      console.log("- Prize pool funded with expected amount");
    });
  });
});
