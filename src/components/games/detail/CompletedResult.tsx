"use client";

import { Button } from "@/components/ui/button";
import type { Game } from "@/types/database";

interface CompletedResultProps {
  game: Game;
  onViewSummary: () => void;
}

export function CompletedResult({ game, onViewSummary }: CompletedResultProps) {
  return (
    <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-200 mb-5">
      <span className="text-slate-600 font-medium text-sm">Resultado</span>
      <span className="text-2xl font-bold text-slate-900">
        {game.score_home ?? "—"}–{game.score_away ?? "—"}
      </span>
      <Button variant="outline" size="sm" onClick={onViewSummary}>
        Ver sumário
      </Button>
    </div>
  );
}
