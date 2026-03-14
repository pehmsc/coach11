"use client";

import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DeleteGameModalProps {
  deletingGame: boolean;
  onDelete: () => void;
  onClose: () => void;
}

export function DeleteGameModal({
  deletingGame,
  onDelete,
  onClose,
}: DeleteGameModalProps) {
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
        <div>
          <h3 className="text-base font-bold text-slate-900">Apagar jogo?</h3>
          <p className="text-sm text-slate-600 mt-1">
            Esta ação é irreversível e remove convocatória, eventos, estatísticas
            live/finais e restantes dados associados.
          </p>
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
            disabled={deletingGame}
          >
            {deletingGame ? (
              <Loader2 size={15} className="mr-2 animate-spin" />
            ) : (
              <Trash2 size={15} className="mr-2" />
            )}
            Apagar jogo
          </Button>
        </div>
      </div>
    </div>
  );
}
