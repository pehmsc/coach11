"use client";

import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GameEditorState } from "@/lib/hooks/useGameEditor";

interface ExternalPlayerModalProps {
  editor: GameEditorState;
  onSubmit: (e: { preventDefault(): void }) => void;
}

export function ExternalPlayerModal({
  editor,
  onSubmit,
}: ExternalPlayerModalProps) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 px-4 pt-4 pb-[calc(var(--mobile-footer-height)+env(safe-area-inset-bottom)+0.75rem)] md:items-center md:p-4"
      onClick={editor.closeExternalPlayerModal}
    >
      <div
        className="min-w-0 overflow-x-hidden bg-white rounded-2xl w-full max-w-md shadow-xl h-[calc(100dvh-var(--mobile-footer-height)-env(safe-area-inset-bottom)-1rem)] md:h-auto md:max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="font-bold text-slate-900">Adicionar jogador externo</h3>
          <button onClick={editor.closeExternalPlayerModal} disabled={editor.savingExternalPlayer}>
            <X size={20} className="text-slate-400" />
          </button>
        </div>
        <form onSubmit={onSubmit} className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div
            className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-5 space-y-3 [overflow-wrap:anywhere]"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Nome *</label>
              <input
                type="text"
                value={editor.externalPlayerName}
                onChange={(event) => editor.setExternalPlayerName(event.target.value)}
                placeholder="Nome do jogador"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Número *</label>
                <input
                  type="number"
                  min={0}
                  max={99}
                  value={editor.externalPlayerNumber}
                  onChange={(event) => editor.setExternalPlayerNumber(event.target.value)}
                  placeholder="0-99"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Posição *</label>
                <input
                  type="text"
                  value={editor.externalPlayerPosition}
                  onChange={(event) => editor.setExternalPlayerPosition(event.target.value)}
                  placeholder="Ex: Médio"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  required
                />
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Este jogador fica apenas nesta convocatória e não é adicionado ao plantel.
            </p>
          </div>
          <div className="flex gap-2 border-t bg-white p-5 pt-3 shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Button
              type="submit"
              disabled={editor.savingExternalPlayer}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              {editor.savingExternalPlayer ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                "Guardar"
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={editor.closeExternalPlayerModal}
              disabled={editor.savingExternalPlayer}
            >
              Cancelar
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
