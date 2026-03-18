"use client";

import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import type { GameStats, FinalStatRow } from "./types";

interface GameStatsSummaryCardsProps {
  gameStats: GameStats[];
  finalStats?: FinalStatRow[];
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const width = 80;
  const height = 28;
  const padding = 2;

  const points = values.map((v, i) => {
    const x = padding + (i / (values.length - 1)) * (width - padding * 2);
    const y = height - padding - ((v - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  });

  return (
    <svg width={width} height={height} className="mt-1">
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function GameStatsSummaryCards({
  gameStats,
  finalStats,
}: GameStatsSummaryCardsProps) {
  // Build per-game aggregates for sparklines
  const perGameData = useMemo(() => {
    if (!finalStats || finalStats.length === 0) return null;

    const byGame = new Map<string, { goals: number; assists: number }>();
    finalStats
      .filter((row) => row.is_finalized && row.game_id)
      .forEach((row) => {
        const gid = row.game_id!;
        if (!byGame.has(gid)) byGame.set(gid, { goals: 0, assists: 0 });
        const agg = byGame.get(gid)!;
        agg.goals += row.goals ?? 0;
        agg.assists += row.assists ?? 0;
      });

    if (byGame.size < 2) return null;

    const entries = Array.from(byGame.values());
    return {
      goals: entries.map((e) => e.goals),
      assists: entries.map((e) => e.assists),
    };
  }, [finalStats]);

  return (
    <div className="grid grid-cols-3 gap-3">
      <Card>
        <CardContent className="pt-4 pb-3 text-center">
          <p className="text-2xl font-black text-slate-900">
            {gameStats.reduce((s, p) => s + p.golos, 0)}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">Golos</p>
          {perGameData && (
            <div className="flex justify-center">
              <Sparkline values={perGameData.goals} color="#22c55e" />
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4 pb-3 text-center">
          <p className="text-2xl font-black text-slate-900">
            {gameStats.reduce((s, p) => s + p.assistencias, 0)}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">Assistências</p>
          {perGameData && (
            <div className="flex justify-center">
              <Sparkline values={perGameData.assists} color="#3b82f6" />
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4 pb-3 text-center">
          <p className="text-2xl font-black text-slate-900">
            {gameStats.length > 0 ? Math.max(...gameStats.map((s) => s.totalJogos)) : 0}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">Jogos</p>
        </CardContent>
      </Card>
    </div>
  );
}
