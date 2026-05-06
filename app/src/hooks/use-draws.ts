import { useMemo } from "react";
import { useMainLotteryState, useMultipleMainDrawResults } from "@/lib/anchor/hooks";

export interface DrawResultData {
  drawId: number;
  winningNumbers: number[];
  totalTickets: number;
  jackpotAtDraw: bigint;
  wasRolldown: boolean;
  timestamp: bigint;
  matchCounts: { match6: number; match5: number; match4: number; match3: number; match2: number };
  prizesPerWinner: { match6: bigint; match5: bigint; match4: bigint; match3: bigint; match2: bigint };
}

export interface UseDrawsReturn {
  draws: DrawResultData[];
  currentDrawId: number;
  loading: boolean;
  error: string | null;
}

function toNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  if (v && typeof v === "object" && "toNumber" in (v as object)) return (v as { toNumber(): number }).toNumber();
  return Number(v ?? 0);
}

function toBigInt(v: unknown): bigint {
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return BigInt(Math.trunc(v));
  if (v && typeof v === "object" && "toNumber" in (v as object)) return BigInt((v as { toNumber(): number }).toNumber());
  return 0n;
}

function mapDrawResult(raw: Record<string, unknown> | null): DrawResultData | null {
  if (!raw) return null;
  const g = (snake: string, camel: string) => raw[snake] ?? raw[camel];
  return {
    drawId: toNumber(g("draw_id", "drawId")),
    winningNumbers: (g("winning_numbers", "winningNumbers") as number[]) ?? [],
    totalTickets: toNumber(g("total_tickets", "totalTickets")),
    jackpotAtDraw: toBigInt(g("jackpot_at_draw", "jackpotAtDraw") ?? g("jackpot_balance", "jackpotBalance")),
    wasRolldown: Boolean(g("was_rolldown", "wasRolldown")),
    timestamp: toBigInt(g("timestamp", "timestamp")),
    matchCounts: {
      match6: toNumber(g("match_6_winners", "match6Winners")),
      match5: toNumber(g("match_5_winners", "match5Winners")),
      match4: toNumber(g("match_4_winners", "match4Winners")),
      match3: toNumber(g("match_3_winners", "match3Winners")),
      match2: toNumber(g("match_2_winners", "match2Winners")),
    },
    prizesPerWinner: {
      match6: toBigInt(g("match_6_prize_per_winner", "match6PrizePerWinner")),
      match5: toBigInt(g("match_5_prize_per_winner", "match5PrizePerWinner")),
      match4: toBigInt(g("match_4_prize_per_winner", "match4PrizePerWinner")),
      match3: toBigInt(g("match_3_prize_per_winner", "match3PrizePerWinner")),
      match2: toBigInt(g("match_2_prize_per_winner", "match2PrizePerWinner")),
    },
  };
}

export function useDraws(): UseDrawsReturn {
  const { data: lotteryState, isLoading: stateLoading } = useMainLotteryState();

  const currentDrawId = useMemo(() => {
    if (!lotteryState) return 0;
    return toNumber((lotteryState as Record<string, unknown>).current_draw_id ?? (lotteryState as Record<string, unknown>).currentDrawId);
  }, [lotteryState]);

  const drawIds = useMemo(() => {
    if (currentDrawId === 0) return [];
    const ids: number[] = [];
    for (let i = 0; i < 20; i++) {
      const id = currentDrawId - 1 - i; // Past draws
      if (id >= 0) ids.push(id);
    }
    return ids;
  }, [currentDrawId]);

  const drawQueries = useMultipleMainDrawResults(drawIds);

  const draws = useMemo(() => {
    return drawQueries
      .map((q) => mapDrawResult(q.data as Record<string, unknown> | null))
      .filter((d): d is DrawResultData => d !== null && d.winningNumbers.length > 0);
  }, [drawQueries]);

  return {
    draws,
    currentDrawId,
    loading: stateLoading || drawQueries.some((q) => q.isLoading),
    error: null,
  };
}
