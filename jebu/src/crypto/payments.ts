/**
 * Payment processor — turns crypto transfers into wallet balances and
 * auto-fulfills matching deposit orders.
 *
 * Flow:
 *   1. Watcher detects SOL/USDC payment to the treasury.
 *   2. If an open, unexpired order from the same wallet exists with an amount
 *      within tolerance → fulfill it: credit the full payment, debit the
 *      ticket cost, issue tickets. Overpayment stays as wallet balance.
 *   3. Otherwise the payment is credited to the wallet balance (usable for
 *      future orders).
 */
import type { AppConfig } from '../config';
import type { Store } from '../db/store';
import type { GameId } from '../types';
import type { SolanaWatcher, TransferEvent } from './solana';
import { deriveWinningNumbers } from '../engine/rng';

export class PaymentProcessor {
  private timer: NodeJS.Timeout | null = null;
  private processing = false;

  constructor(
    private readonly store: Store,
    private readonly watcher: SolanaWatcher,
    private readonly cfg: AppConfig,
  ) { }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.processNewTransfers().catch((err) => console.error('[payments] tick failed:', err));
    }, this.cfg.watchMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Poll for new transfers and process them. Returns number of payments handled. */
  async processNewTransfers(): Promise<number> {
    if (this.processing) return 0;
    this.processing = true;
    try {
      const last = await this.store.getWatcherState('last_signature');
      const signatures = await this.watcher.getSignatures(last, this.cfg.pollSignaturesLimit);
      if (signatures.length === 0) return 0;

      // Newest-first → process oldest first so order matching is FIFO-fair.
      const events: TransferEvent[] = [];
      for (const sig of [...signatures].reverse()) {
        const [ev] = await this.watcher.fetchTransfers([sig]);
        if (ev) events.push(ev);
      }

      let handled = 0;
      for (const event of events) {
        if (event.amountUsdc < this.cfg.minPaymentUsdc) continue;
        // Idempotency: process each on-chain transaction exactly once. The
        // watcher cursor is only advanced after this batch, so a crash can
        // re-poll the same signatures.
        if (!(await this.store.claimPaymentSignature(event.signature))) {
          continue;
        }
        try {
          await this.handleTransfer(event);
          handled++;
        } catch (err) {
          console.error('[payments] failed to process transfer', event.signature, err);
        }
      }

      if (signatures.length > 0) {
        await this.store.setWatcherState('last_signature', signatures[0]);
      }
      return handled;
    } finally {
      this.processing = false;
    }
  }

  private async handleTransfer(event: TransferEvent): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const order = await this.store.findOpenOrderForPayment(
      event.wallet,
      event.amountUsdc,
      this.cfg.orderToleranceUsdc,
      now,
    );

    if (order) {
      await this.fulfillOrder(order, event);
      console.log(
        `[payments] ✅ fulfilled order ${order.id} for ${short(event.wallet)} ` +
        `(${event.asset} ${(event.rawAmount / (event.asset === 'SOL' ? 1e9 : 1e6)).toFixed(4)})`,
      );
    } else {
      await this.store.credit(event.wallet, event.amountUsdc, 'deposit', event.signature, `crypto deposit (${event.asset})`);
      console.log(`[payments] 💰 credited ${event.amountUsdc / 1e6} USDC → ${short(event.wallet)} (${event.asset})`);
    }
  }

  /** Fulfill a deposit order: credit payment, debit ticket cost, issue tickets. */
  private async fulfillOrder(order: { id: string; wallet: string; game: GameId; numbers: number[] | null; count: number; amountUsdc: number }, event: TransferEvent): Promise<void> {
    const cfg = await this.store.getConfig(order.game);
    const state = await this.store.getState(order.game);
    if (!state) throw new Error(`No state for ${order.game}`);

    // Claim the order before mutating any balances or tickets so that a
    // concurrent processor (or re-entrant poll) cannot fulfill it twice.
    const claimed = await this.store.markOrderFulfilled(order.id, Math.floor(Date.now() / 1000));
    if (!claimed) {
      console.warn(`[payments] order ${order.id} already fulfilled — skipping`);
      return;
    }

    // Regenerate numbers if the order didn't specify them.
    const numbersList: number[][] = [];
    for (let i = 0; i < order.count; i++) {
      numbersList.push(
        order.numbers ?? deriveWinningNumbers(randomHex(), cfg.numbersPerTicket, cfg.maxNumber),
      );
    }

    await this.store.credit(order.wallet, event.amountUsdc, 'deposit', event.signature, `crypto deposit (${event.asset})`);

    const tickets = await this.store.issueTickets({
      game: order.game,
      drawId: state.currentDrawId,
      wallet: order.wallet,
      numbersList,
      paidUsdc: order.amountUsdc,
      method: event.asset === 'SOL' ? 'sol' : 'usdc',
      isFree: false,
      ledgerKind: 'purchase',
      ledgerRef: order.id,
      ledgerMemo: `fulfilled order ${order.id}`,
      debitFromBalance: false,
    });

    const leftover = event.amountUsdc - order.amountUsdc;
    if (leftover > 0) {
      await this.store.credit(order.wallet, leftover, 'adjustment', event.signature, 'overpayment kept as balance');
    }
    console.log(
      `[payments] 🎫 issued ${tickets.length} ticket(s) → ${short(order.wallet)} ` +
      `for draw #${state.currentDrawId} (${order.game})`,
    );
  }
}

function randomHex(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function short(wallet: string): string {
  return wallet.length > 12 ? `${wallet.slice(0, 4)}…${wallet.slice(-4)}` : wallet;
}
