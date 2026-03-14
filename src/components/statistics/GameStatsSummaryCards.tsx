"use client";

import { Card, CardContent } from "@/components/ui/card";
import type { GameStats } from "./types";

interface GameStatsSummaryCardsProps {
  gameStats: GameStats[];
}

export function GameStatsSummaryCards({ gameStats }: GameStatsSummaryCardsProps) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <Card>
        <CardContent className="pt-4 pb-3 text-center">
          <p className="text-2xl font-black text-slate-900">
            {gameStats.reduce((s, p) => s + p.golos, 0)}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">Golos</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4 pb-3 text-center">
          <p className="text-2xl font-black text-slate-900">
            {gameStats.reduce((s, p) => s + p.assistencias, 0)}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">Assistências</p>
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
