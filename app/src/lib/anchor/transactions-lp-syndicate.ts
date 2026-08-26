/**
 * Transaction builders for the remaining user-facing instructions:
 *   - Main lottery bulk buy (buy_bulk)
 *   - Permissionless safety: advance_draw, check_solvency, challenge_draw
 *   - LP pool: deposit_lp, withdraw_lp, claim_lp_rewards
 *   - Syndicates: create, join, leave, buy_syndicate_tickets,
 *     create_syndicate_ticket, claim_syndicate_member_prize
 *
 * Account layouts are mirrored EXACTLY from the on-chain Anchor structs.
 * See programs/mazelprotocol/src/instructions/{buy_bulk,admin,deposit_lp,
 * withdraw_lp,claim_lp_rewards,syndicate}.rs for the source of truth.
 */

import { type AnchorProvider, BN } from "@coral-xyz/anchor";
import {
	PublicKey,
	type Signer,
	SystemProgram,
	type TransactionInstruction,
} from "@solana/web3.js";
import { sendInstruction } from "./connection";
import {
	deriveChallengePDA,
	deriveDrawResultPDA,
	deriveHouseFeeUsdcPDA,
	deriveInsurancePoolUsdcPDA,
	deriveLotteryState,
	deriveLpPoolPDA,
	deriveLpPoolUsdcPDA,
	deriveLpPositionPDA,
	derivePrizePoolUsdcPDA,
	deriveSyndicatePDA,
	deriveSyndicateUsdcPDA,
	deriveTicketPDA,
	deriveUnifiedTicketPDA,
	deriveUserPDA,
	USDC_MINT,
} from "./pda";
import {
	createMainLotteryProgramWithProvider,
	fetchMainLotteryState,
} from "./programs";
import type { BuyTicketOptions } from "./transactions";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const TOKEN_PROGRAM_ID = new PublicKey(
	"TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);

/** Build a pseudo-Signer from a wallet provider (matches the pattern used
 *  throughout transactions.ts). */
function payerFromProvider(provider: AnchorProvider): Signer {
	return {
		publicKey: provider.wallet.publicKey,
		signTransaction: provider.wallet.signTransaction,
		signAllTransactions: provider.wallet.signAllTransactions,
	} as unknown as Signer;
}

/** Convert BuyTicketOptions to the connection-layer options. */
function toSendOptions(
	options: BuyTicketOptions = {},
): import("./connection").SendAndConfirmTransactionOptions {
	return {
		skipPreflight: options.skipPreflight,
		confirmationCommitment: options.commitment,
		maxRetries: options.maxRetries,
		retryDelayMs: options.retryDelayMs,
	};
}

/** Encode a string into a fixed [u8; 32] array (zero-padded). */
function encodeName32(name: string): number[] {
	const bytes = new TextEncoder().encode(name).slice(0, 32);
	return Array.from(bytes).concat(new Array(32 - bytes.length).fill(0));
}

// ---------------------------------------------------------------------------
// Main Lottery — Bulk Buy (buy_bulk)
// ---------------------------------------------------------------------------

export interface BuyBulkMainTicketParams {
	/** Up to 50 tickets, each with 6 numbers from 1-46 */
	tickets: number[][];
	/** Number of free tickets to redeem (0 = none) */
	freeTicketsToUse?: number;
}

function validateMainLotteryNumbers(numbers: number[]): void {
	if (numbers?.length !== 6) throw new Error("Exactly 6 numbers required");
	const seen = new Set<number>();
	for (const num of numbers) {
		if (num < 1 || num > 46)
			throw new Error(`Number ${num} out of range (1-46)`);
		if (seen.has(num)) throw new Error(`Duplicate number ${num}`);
		seen.add(num);
	}
}

export async function buildBuyBulkMainTicketInstruction(
	provider: AnchorProvider,
	params: BuyBulkMainTicketParams,
	playerUsdc: PublicKey,
): Promise<TransactionInstruction> {
	for (const t of params.tickets) validateMainLotteryNumbers(t);

	const program = await createMainLotteryProgramWithProvider(provider);
	if (!program) throw new Error("Main lottery program failed to load");

	const state = await fetchMainLotteryState(provider.connection);
	if (!state) throw new Error("Lottery state not found");

	const currentDrawId =
		(state.current_draw_id as { toNumber?: () => number }).toNumber?.() ??
		Number(state.current_draw_id);
	const currentDrawTickets =
		(state.current_draw_tickets as { toNumber?: () => number }).toNumber?.() ??
		Number(state.current_draw_tickets);

	const [lotteryStatePda] = deriveLotteryState();
	const [unifiedTicket] = deriveUnifiedTicketPDA(
		provider.wallet.publicKey,
		currentDrawId,
		currentDrawTickets,
	);
	const [prizePoolUsdc] = derivePrizePoolUsdcPDA();
	const [houseFeeUsdc] = deriveHouseFeeUsdcPDA();
	const [insurancePoolUsdc] = deriveInsurancePoolUsdcPDA();
	const [userStats] = deriveUserPDA(provider.wallet.publicKey);
	const [lpPool] = deriveLpPoolPDA();
	const [lpPoolUsdc] = deriveLpPoolUsdcPDA();

	const instruction = await program.methods
		.buyBulk({
			tickets: params.tickets,
			freeTicketsToUse: params.freeTicketsToUse ?? 0,
		})
		.accounts({
			player: provider.wallet.publicKey,
			lotteryState: lotteryStatePda,
			unifiedTicket,
			playerUsdc,
			prizePoolUsdc,
			houseFeeUsdc,
			insurancePoolUsdc,
			lpPool,
			lpPoolUsdc,
			usdcMint: USDC_MINT,
			userStats,
			tokenProgram: TOKEN_PROGRAM_ID,
			systemProgram: SystemProgram.programId,
		})
		.instruction();

	return instruction;
}

export async function buyBulkMainTickets(
	provider: AnchorProvider,
	params: BuyBulkMainTicketParams,
	playerUsdc: PublicKey,
	options: BuyTicketOptions = {},
): Promise<string> {
	const instruction = await buildBuyBulkMainTicketInstruction(
		provider,
		params,
		playerUsdc,
	);
	return sendInstruction(
		instruction,
		payerFromProvider(provider),
		[],
		provider.connection,
		toSendOptions(options),
	);
}

// ---------------------------------------------------------------------------
// Permissionless Safety Instructions
// ---------------------------------------------------------------------------

/** Build the advance_draw instruction (permissionless, 30-min timeout fallback). */
export async function buildAdvanceDrawInstruction(
	provider: AnchorProvider,
): Promise<TransactionInstruction> {
	const program = await createMainLotteryProgramWithProvider(provider);
	if (!program) throw new Error("Main lottery program failed to load");

	const [lotteryStatePda] = deriveLotteryState();

	return program.methods
		.advanceDraw()
		.accounts({
			caller: provider.wallet.publicKey,
			lotteryState: lotteryStatePda,
		})
		.instruction();
}

export async function advanceDraw(
	provider: AnchorProvider,
	options: BuyTicketOptions = {},
): Promise<string> {
	const instruction = await buildAdvanceDrawInstruction(provider);
	return sendInstruction(
		instruction,
		payerFromProvider(provider),
		[],
		provider.connection,
		toSendOptions(options),
	);
}

/** Build the check_solvency instruction (permissionless watchdog). */
export async function buildCheckSolvencyInstruction(
	provider: AnchorProvider,
): Promise<TransactionInstruction> {
	const program = await createMainLotteryProgramWithProvider(provider);
	if (!program) throw new Error("Main lottery program failed to load");

	const [lotteryStatePda] = deriveLotteryState();
	const [prizePoolUsdc] = derivePrizePoolUsdcPDA();
	const [insurancePoolUsdc] = deriveInsurancePoolUsdcPDA();

	return program.methods
		.checkSolvency()
		.accounts({
			caller: provider.wallet.publicKey,
			lotteryState: lotteryStatePda,
			prizePoolUsdc,
			insurancePoolUsdc,
		})
		.instruction();
}

export async function checkSolvency(
	provider: AnchorProvider,
	options: BuyTicketOptions = {},
): Promise<string> {
	const instruction = await buildCheckSolvencyInstruction(provider);
	return sendInstruction(
		instruction,
		payerFromProvider(provider),
		[],
		provider.connection,
		toSendOptions(options),
	);
}

/** Parameters for challenging a draw's winner counts. */
export interface ChallengeDrawParams {
	drawId: number;
	/** The challenger's corrected winner counts */
	alternativeWinnerCounts: {
		match6: number;
		match5: number;
		match4: number;
		match3: number;
		match2: number;
	};
	/** SHA-256 hash (32 bytes) of supporting off-chain evidence */
	evidenceHash: Uint8Array;
}

/** Build the challenge_draw instruction (permissionless, bonded $500 USDC). */
export async function buildChallengeDrawInstruction(
	provider: AnchorProvider,
	params: ChallengeDrawParams,
	challengerUsdc: PublicKey,
): Promise<TransactionInstruction> {
	const program = await createMainLotteryProgramWithProvider(provider);
	if (!program) throw new Error("Main lottery program failed to load");

	const [lotteryStatePda] = deriveLotteryState();
	const [drawResult] = deriveDrawResultPDA(params.drawId);
	const [challengeRecord] = deriveChallengePDA(
		params.drawId,
		provider.wallet.publicKey,
	);
	const [insurancePoolUsdc] = deriveInsurancePoolUsdcPDA();

	return program.methods
		.challengeDraw(
			new BN(params.drawId),
			params.alternativeWinnerCounts,
			Buffer.from(params.evidenceHash),
		)
		.accounts({
			challenger: provider.wallet.publicKey,
			lotteryState: lotteryStatePda,
			drawResult,
			challengeRecord,
			challengerUsdc,
			insurancePoolUsdc,
			tokenProgram: TOKEN_PROGRAM_ID,
			systemProgram: SystemProgram.programId,
		})
		.instruction();
}

export async function challengeDraw(
	provider: AnchorProvider,
	params: ChallengeDrawParams,
	challengerUsdc: PublicKey,
	options: BuyTicketOptions = {},
): Promise<string> {
	const instruction = await buildChallengeDrawInstruction(
		provider,
		params,
		challengerUsdc,
	);
	return sendInstruction(
		instruction,
		payerFromProvider(provider),
		[],
		provider.connection,
		toSendOptions(options),
	);
}

// ---------------------------------------------------------------------------
// LP Pool — deposit, withdraw, claim rewards
// ---------------------------------------------------------------------------

/** Build the deposit_lp instruction. */
export async function buildDepositLpInstruction(
	provider: AnchorProvider,
	amount: number,
	depositorUsdc: PublicKey,
): Promise<TransactionInstruction> {
	const program = await createMainLotteryProgramWithProvider(provider);
	if (!program) throw new Error("Main lottery program failed to load");

	const [lpPool] = deriveLpPoolPDA();
	const [lpPosition] = deriveLpPositionPDA(provider.wallet.publicKey);
	const [lotteryStatePda] = deriveLotteryState();
	const [lpPoolUsdc] = deriveLpPoolUsdcPDA();

	return program.methods
		.depositLp(new BN(amount))
		.accounts({
			depositor: provider.wallet.publicKey,
			lpPool,
			lpPosition,
			lotteryState: lotteryStatePda,
			depositorUsdc,
			lpPoolUsdc,
			usdcMint: USDC_MINT,
			tokenProgram: TOKEN_PROGRAM_ID,
			systemProgram: SystemProgram.programId,
		})
		.instruction();
}

export async function depositLp(
	provider: AnchorProvider,
	amount: number,
	depositorUsdc: PublicKey,
	options: BuyTicketOptions = {},
): Promise<string> {
	const instruction = await buildDepositLpInstruction(
		provider,
		amount,
		depositorUsdc,
	);
	return sendInstruction(
		instruction,
		payerFromProvider(provider),
		[],
		provider.connection,
		toSendOptions(options),
	);
}

/** Build the withdraw_lp instruction (burn shares, receive USDC). */
export async function buildWithdrawLpInstruction(
	provider: AnchorProvider,
	shares: number,
	destinationUsdc: PublicKey,
): Promise<TransactionInstruction> {
	const program = await createMainLotteryProgramWithProvider(provider);
	if (!program) throw new Error("Main lottery program failed to load");

	const [lpPool] = deriveLpPoolPDA();
	const [lpPosition] = deriveLpPositionPDA(provider.wallet.publicKey);
	const [lotteryStatePda] = deriveLotteryState();
	const [lpPoolUsdc] = deriveLpPoolUsdcPDA();

	return program.methods
		.withdrawLp(new BN(shares))
		.accounts({
			withdrawer: provider.wallet.publicKey,
			lpPool,
			lpPosition,
			lotteryState: lotteryStatePda,
			lpPoolUsdc,
			destinationUsdc,
			tokenProgram: TOKEN_PROGRAM_ID,
		})
		.instruction();
}

export async function withdrawLp(
	provider: AnchorProvider,
	shares: number,
	destinationUsdc: PublicKey,
	options: BuyTicketOptions = {},
): Promise<string> {
	const instruction = await buildWithdrawLpInstruction(
		provider,
		shares,
		destinationUsdc,
	);
	return sendInstruction(
		instruction,
		payerFromProvider(provider),
		[],
		provider.connection,
		toSendOptions(options),
	);
}

/** Build the claim_lp_rewards instruction. */
export async function buildClaimLpRewardsInstruction(
	provider: AnchorProvider,
	destinationUsdc: PublicKey,
): Promise<TransactionInstruction> {
	const program = await createMainLotteryProgramWithProvider(provider);
	if (!program) throw new Error("Main lottery program failed to load");

	const [lpPool] = deriveLpPoolPDA();
	const [lpPosition] = deriveLpPositionPDA(provider.wallet.publicKey);
	const [lpPoolUsdc] = deriveLpPoolUsdcPDA();

	return program.methods
		.claimLpRewards()
		.accounts({
			claimer: provider.wallet.publicKey,
			lpPool,
			lpPosition,
			lpPoolUsdc,
			destinationUsdc,
			tokenProgram: TOKEN_PROGRAM_ID,
		})
		.instruction();
}

export async function claimLpRewards(
	provider: AnchorProvider,
	destinationUsdc: PublicKey,
	options: BuyTicketOptions = {},
): Promise<string> {
	const instruction = await buildClaimLpRewardsInstruction(
		provider,
		destinationUsdc,
	);
	return sendInstruction(
		instruction,
		payerFromProvider(provider),
		[],
		provider.connection,
		toSendOptions(options),
	);
}

// ---------------------------------------------------------------------------
// Syndicates — create, join, leave, buy, create ticket, claim member prize
// ---------------------------------------------------------------------------

/** Parameters for creating a syndicate */
export interface CreateSyndicateParams {
	/** Unique ID for this syndicate (chosen by creator) */
	syndicateId: number;
	/** Human-readable name (max 32 bytes) */
	name: string;
	/** Whether anyone can join (true) or only the creator (false) */
	isPublic: boolean;
	/** Manager fee in basis points (max 500 = 5%) */
	managerFeeBps: number;
}

/** Build the create_syndicate instruction. */
export async function buildCreateSyndicateInstruction(
	provider: AnchorProvider,
	params: CreateSyndicateParams,
): Promise<TransactionInstruction> {
	const program = await createMainLotteryProgramWithProvider(provider);
	if (!program) throw new Error("Main lottery program failed to load");

	const [syndicate] = deriveSyndicatePDA(
		provider.wallet.publicKey,
		params.syndicateId,
	);
	const [syndicateUsdc] = deriveSyndicateUsdcPDA(syndicate);

	return program.methods
		.createSyndicate({
			syndicateId: new BN(params.syndicateId),
			name: encodeName32(params.name),
			isPublic: params.isPublic,
			managerFeeBps: params.managerFeeBps,
		})
		.accounts({
			creator: provider.wallet.publicKey,
			syndicate,
			syndicateUsdc,
			usdcMint: USDC_MINT,
			tokenProgram: TOKEN_PROGRAM_ID,
			systemProgram: SystemProgram.programId,
		})
		.instruction();
}

export async function createSyndicate(
	provider: AnchorProvider,
	params: CreateSyndicateParams,
	options: BuyTicketOptions = {},
): Promise<string> {
	const instruction = await buildCreateSyndicateInstruction(provider, params);
	return sendInstruction(
		instruction,
		payerFromProvider(provider),
		[],
		provider.connection,
		toSendOptions(options),
	);
}

/** Build the join_syndicate instruction. */
export async function buildJoinSyndicateInstruction(
	provider: AnchorProvider,
	syndicatePubkey: PublicKey,
	originalCreator: PublicKey,
	syndicateId: number,
	contribution: number,
	memberUsdc: PublicKey,
): Promise<TransactionInstruction> {
	const program = await createMainLotteryProgramWithProvider(provider);
	if (!program) throw new Error("Main lottery program failed to load");

	// Verify the syndicate PDA matches the provided key
	const [expectedSyndicate] = deriveSyndicatePDA(originalCreator, syndicateId);
	if (syndicatePubkey && !syndicatePubkey.equals(expectedSyndicate)) {
		throw new Error("Syndicate PDA mismatch");
	}
	const [syndicateUsdc] = deriveSyndicateUsdcPDA(expectedSyndicate);
	const [userStats] = deriveUserPDA(provider.wallet.publicKey);

	return program.methods
		.joinSyndicate({
			contribution: new BN(contribution),
		})
		.accounts({
			member: provider.wallet.publicKey,
			syndicate: expectedSyndicate,
			memberUsdc,
			syndicateUsdc,
			userStats,
			tokenProgram: TOKEN_PROGRAM_ID,
			systemProgram: SystemProgram.programId,
		})
		.instruction();
}

export async function joinSyndicate(
	provider: AnchorProvider,
	syndicatePubkey: PublicKey,
	originalCreator: PublicKey,
	syndicateId: number,
	contribution: number,
	memberUsdc: PublicKey,
	options: BuyTicketOptions = {},
): Promise<string> {
	const instruction = await buildJoinSyndicateInstruction(
		provider,
		syndicatePubkey,
		originalCreator,
		syndicateId,
		contribution,
		memberUsdc,
	);
	return sendInstruction(
		instruction,
		payerFromProvider(provider),
		[],
		provider.connection,
		toSendOptions(options),
	);
}

/** Build the leave_syndicate instruction. */
export async function buildLeaveSyndicateInstruction(
	provider: AnchorProvider,
	syndicatePubkey: PublicKey,
	memberUsdc: PublicKey,
): Promise<TransactionInstruction> {
	const program = await createMainLotteryProgramWithProvider(provider);
	if (!program) throw new Error("Main lottery program failed to load");

	const [syndicateUsdc] = deriveSyndicateUsdcPDA(syndicatePubkey);

	return program.methods
		.leaveSyndicate()
		.accounts({
			member: provider.wallet.publicKey,
			syndicate: syndicatePubkey,
			memberUsdc,
			syndicateUsdc,
			tokenProgram: TOKEN_PROGRAM_ID,
			systemProgram: SystemProgram.programId,
		})
		.instruction();
}

export async function leaveSyndicate(
	provider: AnchorProvider,
	syndicatePubkey: PublicKey,
	memberUsdc: PublicKey,
	options: BuyTicketOptions = {},
): Promise<string> {
	const instruction = await buildLeaveSyndicateInstruction(
		provider,
		syndicatePubkey,
		memberUsdc,
	);
	return sendInstruction(
		instruction,
		payerFromProvider(provider),
		[],
		provider.connection,
		toSendOptions(options),
	);
}

/** Build the buy_syndicate_tickets instruction (creator-only). */
export async function buildBuySyndicateTicketsInstruction(
	provider: AnchorProvider,
	syndicatePubkey: PublicKey,
	tickets: number[][],
	syndicateUsdc: PublicKey,
): Promise<TransactionInstruction> {
	for (const t of tickets) validateMainLotteryNumbers(t);

	const program = await createMainLotteryProgramWithProvider(provider);
	if (!program) throw new Error("Main lottery program failed to load");

	const [lotteryStatePda] = deriveLotteryState();
	const [prizePoolUsdc] = derivePrizePoolUsdcPDA();
	const [houseFeeUsdc] = deriveHouseFeeUsdcPDA();
	const [insurancePoolUsdc] = deriveInsurancePoolUsdcPDA();

	return program.methods
		.buySyndicateTickets({
			tickets,
		})
		.accounts({
			creator: provider.wallet.publicKey,
			syndicate: syndicatePubkey,
			lotteryState: lotteryStatePda,
			syndicateUsdc,
			prizePoolUsdc,
			houseFeeUsdc,
			insurancePoolUsdc,
			usdcMint: USDC_MINT,
			tokenProgram: TOKEN_PROGRAM_ID,
			systemProgram: SystemProgram.programId,
		})
		.instruction();
}

export async function buySyndicateTickets(
	provider: AnchorProvider,
	syndicatePubkey: PublicKey,
	tickets: number[][],
	syndicateUsdc: PublicKey,
	options: BuyTicketOptions = {},
): Promise<string> {
	const instruction = await buildBuySyndicateTicketsInstruction(
		provider,
		syndicatePubkey,
		tickets,
		syndicateUsdc,
	);
	return sendInstruction(
		instruction,
		payerFromProvider(provider),
		[],
		provider.connection,
		toSendOptions(options),
	);
}

/** Build the create_syndicate_ticket instruction (creator-only).
 *  Called after buy_syndicate_tickets to materialize individual ticket accounts.
 *  Must be called once per ticket. */
export async function buildCreateSyndicateTicketInstruction(
	provider: AnchorProvider,
	syndicatePubkey: PublicKey,
	numbers: number[],
): Promise<TransactionInstruction> {
	validateMainLotteryNumbers(numbers);

	const program = await createMainLotteryProgramWithProvider(provider);
	if (!program) throw new Error("Main lottery program failed to load");

	const state = await fetchMainLotteryState(provider.connection);
	if (!state) throw new Error("Lottery state not found");

	const currentDrawId =
		(state.current_draw_id as { toNumber?: () => number }).toNumber?.() ??
		Number(state.current_draw_id);
	const currentDrawTickets =
		(state.current_draw_tickets as { toNumber?: () => number }).toNumber?.() ??
		Number(state.current_draw_tickets);

	const [lotteryStatePda] = deriveLotteryState();
	const [ticket] = deriveTicketPDA(currentDrawId, currentDrawTickets);

	return program.methods
		.createSyndicateTicket(numbers)
		.accounts({
			payer: provider.wallet.publicKey,
			syndicate: syndicatePubkey,
			lotteryState: lotteryStatePda,
			ticket,
			systemProgram: SystemProgram.programId,
		})
		.instruction();
}

/** Create all syndicate ticket accounts for a bulk purchase.
 *  Sends multiple instructions in batches of 5. */
export async function createSyndicateTickets(
	provider: AnchorProvider,
	syndicatePubkey: PublicKey,
	allNumbers: number[][],
	options: BuyTicketOptions = {},
): Promise<string[]> {
	// Build all instructions; each must be built sequentially because each
	// create_syndicate_ticket increments current_draw_tickets on-chain, so
	// the next ticket's PDA depends on the prior one having landed.
	// We send them one at a time to ensure correct PDA derivation.
	const signatures: string[] = [];
	for (const numbers of allNumbers) {
		const instruction = await buildCreateSyndicateTicketInstruction(
			provider,
			syndicatePubkey,
			numbers,
		);
		const sig = await sendInstruction(
			instruction,
			payerFromProvider(provider),
			[],
			provider.connection,
			toSendOptions(options),
		);
		signatures.push(sig);
	}
	return signatures;
}

/** Build the claim_syndicate_member_prize instruction. */
export async function buildClaimSyndicateMemberPrizeInstruction(
	provider: AnchorProvider,
	syndicatePubkey: PublicKey,
	amount: number,
	memberUsdc: PublicKey,
): Promise<TransactionInstruction> {
	const program = await createMainLotteryProgramWithProvider(provider);
	if (!program) throw new Error("Main lottery program failed to load");

	const [syndicateUsdc] = deriveSyndicateUsdcPDA(syndicatePubkey);

	return program.methods
		.claimSyndicateMemberPrize({
			amount: new BN(amount),
		})
		.accounts({
			member: provider.wallet.publicKey,
			syndicate: syndicatePubkey,
			memberUsdc,
			syndicateUsdc,
			usdcMint: USDC_MINT,
			tokenProgram: TOKEN_PROGRAM_ID,
		})
		.instruction();
}

export async function claimSyndicateMemberPrize(
	provider: AnchorProvider,
	syndicatePubkey: PublicKey,
	amount: number,
	memberUsdc: PublicKey,
	options: BuyTicketOptions = {},
): Promise<string> {
	const instruction = await buildClaimSyndicateMemberPrizeInstruction(
		provider,
		syndicatePubkey,
		amount,
		memberUsdc,
	);
	return sendInstruction(
		instruction,
		payerFromProvider(provider),
		[],
		provider.connection,
		toSendOptions(options),
	);
}
