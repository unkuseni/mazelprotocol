/**
 * Shared domain types for the JEBU offchain lottery.
 *
 * Money convention: every USD amount is an integer count of "USDC lamports"
 * (6 decimal places), mirroring the on-chain USDC convention.
 *   $1.00  = 1_000_000
 *   $2.50  = 2_500_000
 */

export type GameId = 'main' | 'quickpick';

export type DrawStatus =
  | 'scheduled'
  | 'closed'
  | 'committed'
  | 'revealed'
  | 'finalized'
  | 'skipped';

export type ClaimStatus = 'pending' | 'processing' | 'paid' | 'expired' | 'reclaimed';

export type LedgerKind =
  | 'deposit'
  | 'purchase'
  | 'free_credit'
  | 'payout'
  | 'reclaim'
  | 'adjustment';

export type OrderStatus = 'open' | 'fulfilled' | 'expired' | 'cancelled';

export interface FeeTier {
  /** Jackpot threshold in USDC lamports; first tier where jackpot < threshold applies, else last tier. */
  thresholdUsdc: number;
  bps: number;
}

export interface Allocations {
  jackpotBps: number;
  fixedBps: number;
  reserveBps: number;
  insuranceBps: number;
}

export interface FixedPrize {
  /** Cash prize in USDC lamports. 0 means no cash (e.g. Match 2 free ticket). */
  amountUsdc: number;
  /** Free tickets credited per winning ticket (main lottery Match 2). */
  freeTickets?: number;
}

/** Full game configuration (persisted per game in `game_config`). */
export interface GameConfig {
  game: GameId;
  ticketPriceUsdc: number;
  numbersPerTicket: number;
  maxNumber: number;
  drawIntervalS: number;
  saleCutoffS: number;
  minDrawIntervalS: number;
  /** 0 = time-only mode (draws on schedule only). */
  saleTargetTickets: number;
  seedAmountUsdc: number;
  softCapUsdc: number;
  hardCapUsdc: number;
  feeTiers: FeeTier[];
  feeRolldownBps: number;
  allocations: Allocations;
  /** Matched-count → FixedPrize. Jackpot tier (numbersPerTicket) is variable and handled separately. */
  fixedPrizes: Record<number, FixedPrize>;
  /** Matched-count → share of jackpot (bps) during rolldown, top tier excluded. */
  rolldownAllocationBps: Record<number, number>;
  /** 0 = unlimited. */
  maxTicketsPerWallet: number;
  claimExpirationS: number;
}

/** Runtime game state (persisted per game in `game_state`). */
export interface GameState {
  game: GameId;
  currentDrawId: number;
  nextDrawTimestamp: number;
  jackpotBalanceUsdc: number;
  fixedPrizePoolUsdc: number;
  reserveBalanceUsdc: number;
  insuranceBalanceUsdc: number;
  houseFeeCollectedUsdc: number;
  currentDrawTickets: number;
  totalTicketsSold: number;
  totalPrizesPaidUsdc: number;
  status: DrawStatus;
  isPaused: boolean;
  pendingCommitment: string | null;
  revealSeed: string | null;
  commitAt: number | null;
  revealAt: number | null;
  finalizeAt: number | null;
}

export interface DrawRow {
  game: GameId;
  drawId: number;
  status: DrawStatus;
  scheduledAt: number;
  salesOpenedAt: number;
  salesClosedAt: number | null;
  committedAt: number | null;
  revealedAt: number | null;
  finalizedAt: number | null;
  commitment: string | null;
  revealSeed: string | null;
  winningNumbers: number[] | null;
  /** 1 if a rolldown actually distributed the jackpot, else 0. */
  wasRolldown: number;
  /** 1 if the rolldown decision rolled true at reveal (or hard cap forced). */
  rolldownDecided: number;
  rolldownProbabilityBps: number | null;
  ticketCount: number;
  winnerCounts: Record<number, number> | null;
  prizePerWinnerUsdc: Record<number, number> | null;
  jackpotBeforeUsdc: number | null;
  jackpotAfterUsdc: number | null;
  totalCommittedUsdc: number;
  totalPaidUsdc: number;
}

export interface TicketRow {
  id: number;
  game: GameId;
  drawId: number;
  wallet: string;
  numbers: number[];
  paidUsdc: number;
  paymentMethod: 'usdc' | 'sol' | 'balance' | 'free';
  isFree: number;
  createdAt: number;
}

export interface ClaimRow {
  id: number;
  wallet: string;
  game: GameId;
  drawId: number;
  ticketId: number;
  tier: number;
  amountUsdc: number;
  status: ClaimStatus;
  createdAt: number;
  paidAt: number | null;
}

export interface DepositOrder {
  id: string;
  wallet: string;
  game: GameId;
  numbers: number[] | null;
  count: number;
  amountUsdc: number;
  status: OrderStatus;
  createdAt: number;
  expiresAt: number;
  fulfilledAt: number | null;
}

export interface LedgerEntry {
  id: number;
  wallet: string;
  amountUsdc: number;
  kind: LedgerKind;
  ref: string | null;
  memo: string | null;
  createdAt: number;
}

export interface WalletSummary {
  wallet: string;
  balanceUsdc: number;
  freeTickets: number;
}

export interface PayoutResult {
  claimId: number;
  wallet: string;
  amountUsdc: number;
  status: ClaimStatus;
}
