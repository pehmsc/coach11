"use client";

import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LiveButtonSectionProps {
  canStartLive: boolean;
  isLiveInProgress: boolean;
  minutesUntilLive: number;
  onNavigate: () => void;
}

export function LiveButtonSection({
  canStartLive,
  isLiveInProgress,
  minutesUntilLive,
  onNavigate,
}: LiveButtonSectionProps) {
  return (
    <div className="mb-5 space-y-2">
      <Button
        onClick={onNavigate}
        disabled={!canStartLive}
        className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-500"
      >
        <Play size={16} className="mr-2" />
        {canStartLive
          ? isLiveInProgress
            ? "Continuar jogo ao vivo"
            : "Iniciar jogo ao vivo"
          : `Disponível em ${minutesUntilLive} min`}
      </Button>
      {!canStartLive && (
        <p className="text-xs text-slate-500 text-center">
          O live fica disponível 10 minutos antes da hora do jogo.
        </p>
      )}
    </div>
  );
}
