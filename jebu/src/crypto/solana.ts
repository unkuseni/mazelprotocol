/**
 * Solana on-chain watcher — detects SOL and USDC payments to the treasury
 * wallet by scanning parsed transactions for the treasury's signatures.
 */
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  type ParsedTransactionWithMeta,
  type TransactionSignature,
} from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';

export interface TransferEvent {
  signature: string;
  /** Sender wallet (owner of the source token account, or the SOL payer). */
  wallet: string;
  asset: 'SOL' | 'USDC';
  /** Raw units: SOL lamports or USDC base units. */
  rawAmount: number;
  /** Converted to 6-decimal USDC units. */
  amountUsdc: number;
  slot: number;
}

export class SolanaWatcher {
  readonly connection: Connection;
  readonly treasuryPubkey: PublicKey;
  readonly treasuryAta: PublicKey;
  readonly usdcMint: PublicKey;
  readonly solUsdPrice: number;
  readonly keypair: Keypair | null;

  constructor(opts: {
    rpcUrl: string;
    treasuryPubkey: string;
    usdcMint: string;
    solUsdPrice: number;
    treasuryKeypair?: string;
  }) {
    this.connection = new Connection(opts.rpcUrl, 'confirmed');
    this.treasuryPubkey = new PublicKey(opts.treasuryPubkey);
    this.usdcMint = new PublicKey(opts.usdcMint);
    this.treasuryAta = getAssociatedTokenAddressSync(this.usdcMint, this.treasuryPubkey);
    this.solUsdPrice = opts.solUsdPrice;
    this.keypair = opts.treasuryKeypair ? Keypair.fromSecretKey(Uint8Array.from(JSON.parse(opts.treasuryKeypair))) : null;
  }

  /** Newest-first signatures involving the treasury. */
  async getSignatures(since: string | null, limit = 50): Promise<TransactionSignature[]> {
    const rs = await this.connection.getSignaturesForAddress(this.treasuryPubkey, { limit });
    const sigs = rs.map((r) => r.signature);
    if (since && sigs.length > 0) {
      // `since` is the most recent processed signature; keep everything older (below it).
      const idx = sigs.indexOf(since);
      if (idx === -1) return sigs; // missed some — rescan from newest
      return sigs.slice(idx + 1);
    }
    return sigs;
  }

  /** Fetch parsed transactions and extract SOL/USDC transfers to the treasury. */
  async fetchTransfers(signatures: TransactionSignature[]): Promise<TransferEvent[]> {
    const events: TransferEvent[] = [];
    for (const sig of signatures) {
      let tx: ParsedTransactionWithMeta | null = null;
      try {
        tx = await this.connection.getParsedTransaction(sig, {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0,
        });
      } catch {
        continue; // skip unparseable (e.g. failed/vote txs)
      }
      if (!tx?.meta) continue;
      const found = await this.transfersFromTx(sig, tx);
      events.push(...found);
    }
    return events;
  }

  private async transfersFromTx(
    signature: string,
    tx: ParsedTransactionWithMeta,
  ): Promise<TransferEvent[]> {
    const events: TransferEvent[] = [];
    const meta = tx.meta!;
    const message = tx.transaction.message;
    const accountKeys = message.accountKeys.map((k) => k.pubkey.toString());

    // --- native SOL: balance diff of the treasury account -------------------
    const treasuryIdx = accountKeys.indexOf(this.treasuryPubkey.toString());
    if (treasuryIdx !== -1) {
      const pre = meta.preBalances[treasuryIdx] ?? 0;
      const post = meta.postBalances[treasuryIdx] ?? 0;
      const deltaLamports = post - pre;
      if (deltaLamports > 0) {
        const sender = findSolSender(accountKeys, meta.preBalances, meta.postBalances, treasuryIdx);
        if (sender) {
          events.push({
            signature,
            wallet: sender,
            asset: 'SOL',
            rawAmount: deltaLamports,
            amountUsdc: Math.floor((deltaLamports / LAMPORTS_PER_SOL) * this.solUsdPrice * 1e6),
            slot: tx.slot,
          });
        }
      }
    }

    // --- SPL USDC: parsed transfer instructions into the treasury ATA -------
    const instructions = collectParsedInstructions(tx);
    for (const ix of instructions) {
      const info = ix.parsed?.info;
      if (!info) continue;
      const type = ix.parsed?.type;
      if (type !== 'transfer' && type !== 'transferChecked') continue;
      if (!info.destination || info.destination !== this.treasuryAta.toString()) continue;
      if (info.mint && info.mint !== this.usdcMint.toString()) continue;
      const raw = info.tokenAmount?.amount;
      if (raw === undefined || Number(raw) <= 0) continue;

      // Resolve the wallet that owns the source token account.
      const wallet = await this.ownerOfTokenAccount(info.source);
      if (!wallet) continue;
      events.push({
        signature,
        wallet,
        asset: 'USDC',
        rawAmount: Number(raw),
        amountUsdc: Number(raw),
        slot: tx.slot,
      });
    }

    return events;
  }

  /** Owner of an SPL token account (one extra RPC call per transfer). */
  private async ownerOfTokenAccount(tokenAccount: string): Promise<string | null> {
    try {
      const acc = await this.connection.getAccountInfo(new PublicKey(tokenAccount));
      return acc?.owner?.toString() ?? null;
    } catch {
      return null;
    }
  }

  /** Basic health probe: does the treasury exist on-chain? */
  async probe(): Promise<{ treasuryExists: boolean; ataExists: boolean; treasuryLamports: number }> {
    const [treasury, ata] = await Promise.all([
      this.connection.getAccountInfo(this.treasuryPubkey),
      this.connection.getAccountInfo(this.treasuryAta),
    ]);
    return {
      treasuryExists: treasury !== null,
      ataExists: ata !== null,
      treasuryLamports: treasury?.lamports ?? 0,
    };
  }
}

/** Heuristic SOL sender: first non-treasury account whose balance decreased. */
function findSolSender(
  accountKeys: string[],
  pre: number[],
  post: number[],
  treasuryIdx: number,
): string | null {
  for (let i = 0; i < accountKeys.length; i++) {
    if (i === treasuryIdx) continue;
    if ((pre[i] ?? 0) > (post[i] ?? 0)) return accountKeys[i];
  }
  return null;
}

interface ParsedIx {
  parsed?: { type?: string; info?: Record<string, unknown> };
}

function collectParsedInstructions(tx: ParsedTransactionWithMeta): ParsedIx[] {
  const out: ParsedIx[] = [];
  const top = tx.transaction.message.instructions as ParsedIx[];
  out.push(...top);
  for (const inner of tx.meta?.innerInstructions ?? []) {
    out.push(...(inner.instructions as ParsedIx[]));
  }
  return out;
}
