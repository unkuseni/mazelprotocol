/**
 * Shared on-chain syndicate helpers: borsh parsing + fetching.
 * Mirrors programs/mazelprotocol/src/state/syndicate.rs exactly.
 */

import { PublicKey } from "@solana/web3.js";
import { getConnection } from "./connection";
import { MAIN_LOTTERY_PROGRAM_ID } from "./pda";

/** Anchored account discriminator for `account:Syndicate`. */
const SYNDICATE_DISCRIMINATOR = "WTyogS6AQsF";

export interface OnChainSyndicateMember {
	wallet: string;
	contribution: number;
	shareBps: number;
	unclaimedPrize: number;
}

export interface OnChainSyndicate {
	pubkey: string;
	creator: string;
	originalCreator: string;
	syndicateId: number;
	name: string;
	isPublic: boolean;
	memberCount: number;
	totalContribution: number;
	managerFeeBps: number;
	usdcAccount: string;
	members: OnChainSyndicateMember[];
	pendingTickets: number;
	bump: number;
}

function readPubkey(data: Uint8Array, off: number): string {
	return new PublicKey(data.slice(off, off + 32)).toBase58();
}

function readU64(data: Uint8Array, off: number): number {
	return Number(
		new DataView(data.buffer, data.byteOffset, data.byteLength).getBigUint64(
			off,
			true,
		),
	);
}

function readU32(data: Uint8Array, off: number): number {
	return new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(
		off,
		true,
	);
}

function readU16(data: Uint8Array, off: number): number {
	return new DataView(data.buffer, data.byteOffset, data.byteLength).getUint16(
		off,
		true,
	);
}

function readU8(data: Uint8Array, off: number): number {
	return data[off];
}

export function parseSyndicateAccount(
	data: Uint8Array,
	pubkey: string,
): OnChainSyndicate {
	let off = 8; // skip account discriminator

	const creator = readPubkey(data, off);
	off += 32;
	const originalCreator = readPubkey(data, off);
	off += 32;
	const syndicateId = readU64(data, off);
	off += 8;

	const name = new TextDecoder()
		.decode(data.slice(off, off + 32))
		.replace(/\0+$/, "")
		.trim();
	off += 32;

	const isPublic = readU8(data, off) === 1;
	off += 1;
	const memberCount = readU32(data, off);
	off += 4;
	const totalContribution = readU64(data, off);
	off += 8;
	const managerFeeBps = readU16(data, off);
	off += 2;
	const usdcAccount = readPubkey(data, off);
	off += 32;

	const memberLen = readU32(data, off);
	off += 4;
	const members: OnChainSyndicateMember[] = [];
	for (let i = 0; i < memberLen; i++) {
		const wallet = readPubkey(data, off);
		off += 32;
		const contribution = readU64(data, off);
		off += 8;
		const shareBps = readU16(data, off);
		off += 2;
		const unclaimedPrize = readU64(data, off);
		off += 8;
		members.push({ wallet, contribution, shareBps, unclaimedPrize });
	}

	const pendingTickets = readU64(data, off);
	off += 8;
	off += 8; // pending_tickets_draw
	const bump = readU8(data, off);

	return {
		pubkey,
		creator,
		originalCreator,
		syndicateId,
		name,
		isPublic,
		memberCount,
		totalContribution,
		managerFeeBps,
		usdcAccount,
		members,
		pendingTickets,
		bump,
	};
}

/** Fetch all on-chain syndicates owned by the main lottery program. */
export async function fetchAllSyndicates(): Promise<OnChainSyndicate[]> {
	const conn = getConnection();
	const accounts = await conn.getProgramAccounts(MAIN_LOTTERY_PROGRAM_ID, {
		filters: [{ memcmp: { offset: 0, bytes: SYNDICATE_DISCRIMINATOR } }],
	});

	return accounts
		.filter((a) => a.account.data?.length > 0)
		.map((a) => {
			try {
				return parseSyndicateAccount(
					new Uint8Array(a.account.data),
					a.pubkey.toBase58(),
				);
			} catch {
				return null;
			}
		})
		.filter((s): s is OnChainSyndicate => s !== null);
}
