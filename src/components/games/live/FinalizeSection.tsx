"use client";

import { Loader2, Check, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MatchPhase, LivePlayer } from "./types";

interface FinalizeSectionProps {
  phase: MatchPhase;
  isFinalized: boolean;
  finalizing: boolean;
  exportingPDF: boolean;
  allRatingsFilled: boolean;
  score: { home: number; away: number };
  playersWhoNeedPersistentStats: LivePlayer[];
  playerRatings: Record<string, number>;
  finalizeGame: () => void;
  handleExportPDF: () => void;
}

export function FinalizeSection({
  phase,
  isFinalized,
  finalizing,
  exportingPDF,
  allRatingsFilled,
  score,
  playersWhoNeedPersistentStats,
  playerRatings,
  finalizeGame,
  handleExportPDF,
}: FinalizeSectionProps) {
  return (
    <>
      {!isFinalized && (
        <Button
          onClick={() => void finalizeGame()}
          disabled={finalizing || phase !== "review" || !allRatingsFilled}
          className="w-full bg-slate-900 hover:bg-slate-800"
        >
          {finalizing ? (
            <Loader2 size={16} className="animate-spin mr-2" />
          ) : (
            <Check size={16} className="mr-2" />
          )}
          {phase !== "review"
            ? "Termina a 2ª parte para finalizar"
            : !allRatingsFilled
              ? `Faltam notas (${playersWhoNeedPersistentStats.length - playersWhoNeedPersistentStats.filter(p => playerRatings[p.id] !== undefined).length} em falta)`
              : `Finalizar jogo (${score.home}–${score.away})`}
        </Button>
      )}

      {isFinalized && (
        <Button
          onClick={() => void handleExportPDF()}
          disabled={exportingPDF}
          variant="outline"
          className="w-full"
        >
          {exportingPDF ? (
            <Loader2 size={16} className="animate-spin mr-2" />
          ) : (
            <FileDown size={16} className="mr-2" />
          )}
          Exportar relatório PDF
        </Button>
      )}
    </>
  );
}
