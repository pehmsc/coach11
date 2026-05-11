"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DeleteGameModalProps {
  deletingGame: boolean;
  gameStatus: string;
  gameTitle: string | null | undefined;
  onDelete: () => void;
  onClose: () => void;
}

export function DeleteGameModal({
  deletingGame,
  gameStatus,
  gameTitle,
  onDelete,
  onClose,
}: DeleteGameModalProps) {
  const isCompleted = gameStatus === "completed";
  const requiredText = isCompleted ? "APAGAR JOGO CONCLUÍDO" : "APAGAR";
  const [typed, setTyped] = useState("");
  const canConfirm = typed === requiredText && !deletingGame;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-4"
      onClick={() => {
        if (deletingGame) return;
        onClose();
      }}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-md shadow-xl p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2">
          <AlertTriangle
            size={20}
            className="mt-0.5 flex-shrink-0 text-red-600"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-red-700">
              {isCompleted ? "Apagar jogo concluído?" : "Apagar jogo?"}
            </h3>
            <p className="text-sm text-slate-600 mt-1">
              Estás prestes a apagar{" "}
              {gameTitle ? <strong>{gameTitle}</strong> : "este jogo"} e todos
              os dados associados:
            </p>
            <ul className="mt-2 text-xs text-slate-700 list-disc list-inside space-y-0.5">
              <li>Convocatória e jogadores externos</li>
              <li>Eventos do jogo (golos, cartões, substituições)</li>
              {isCompleted && (
                <>
                  <li>Estatísticas finais dos jogadores</li>
                  <li>Avaliações e MVP</li>
                  <li>
                    As estatísticas da época do atleta são recalculadas
                  </li>
                </>
              )}
            </ul>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700">
            Para confirmar, escreve{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-900">
              {requiredText}
            </code>
          </label>
          <input
            type="text"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            disabled={deletingGame}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            className="mt-1.5 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            aria-label={`Escreve ${requiredText} para confirmar`}
          />
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={onClose}
            disabled={deletingGame}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className="flex-1 bg-red-600 hover:bg-red-700"
            onClick={onDelete}
            disabled={!canConfirm}
          >
            {deletingGame ? (
              <Loader2 size={15} className="mr-2 animate-spin" />
            ) : (
              <Trash2 size={15} className="mr-2" />
            )}
            Apagar definitivamente
          </Button>
        </div>
      </div>
    </div>
  );
}
