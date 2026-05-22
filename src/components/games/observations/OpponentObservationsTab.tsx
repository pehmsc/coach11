"use client";

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { pt } from "date-fns/locale";
import { ClipboardList, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOpponentObservations } from "@/lib/hooks/useOpponentObservations";
import { ObservationPromoteModal } from "./ObservationPromoteModal";
import type { Opponent } from "@/types/database";
import type { PromoteTargetField } from "@/lib/schemas/observations";

interface OpponentObservationsTabProps {
  opponent: Opponent;
  /** Quando a promoção é confirmada com sucesso, chama o callback para
   *  reagir (ex: refetch do opponent na página pai). */
  onPromoted?: () => void;
}

export function OpponentObservationsTab({
  opponent,
  onPromoted,
}: OpponentObservationsTabProps) {
  const { observations, loading, promoting, promote, reload } =
    useOpponentObservations({
      opponentId: opponent.id,
      onlyUnpromoted: true,
      autoLoad: true,
    });

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedObservations = useMemo(
    () => observations.filter((o) => selectedIds.has(o.id)),
    [observations, selectedIds],
  );

  const currentFieldValues = {
    pontos_fortes: opponent.pontos_fortes ?? null,
    pontos_fracos: opponent.pontos_fracos ?? null,
    atletas_chave: opponent.atletas_chave ?? null,
    notas_gerais: opponent.notas_gerais ?? null,
  } as const;

  async function handleConfirm(targetField: PromoteTargetField) {
    const ok = await promote(
      selectedObservations.map((o) => o.id),
      targetField,
    );
    if (ok) {
      setSelectedIds(new Set());
      setModalOpen(false);
      await reload();
      onPromoted?.();
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-500">
        <Loader2 className="animate-spin mr-2" size={16} />
        A carregar observações…
      </div>
    );
  }

  if (observations.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center">
        <ClipboardList size={32} className="mx-auto text-slate-300" />
        <p className="mt-3 text-sm font-medium text-slate-700">
          Sem observações por rever
        </p>
        <p className="mt-1 text-xs text-slate-500">
          As observações capturadas durante o jogo aparecem aqui até serem
          promovidas para os campos do perfil.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
          <ClipboardList size={16} className="text-sky-600" />
          <div className="flex-1">
            <p className="font-bold text-slate-900 text-sm">
              Observações por rever
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {observations.length} pendente
              {observations.length === 1 ? "" : "s"} de jogos anteriores
            </p>
          </div>
        </div>
        <ul className="divide-y divide-slate-100">
          {observations.map((obs) => {
            const selected = selectedIds.has(obs.id);
            const createdAt = obs.created_at
              ? format(parseISO(obs.created_at), "d MMM yyyy", { locale: pt })
              : null;
            return (
              <li key={obs.id} className="px-4 py-3 flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggle(obs.id)}
                  aria-label="Seleccionar para promover"
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-800 whitespace-pre-wrap break-words">
                    {obs.observation}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {typeof obs.minute === "number" && (
                      <>Min {obs.minute}&apos; · </>
                    )}
                    {createdAt ?? "Capturada"}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="border-t border-slate-100 px-4 py-3 flex items-center justify-between gap-3 bg-slate-50">
          <p className="text-xs text-slate-500">
            {selectedObservations.length === 0
              ? "Selecciona observações para promover"
              : `${selectedObservations.length} seleccionada${selectedObservations.length === 1 ? "" : "s"}`}
          </p>
          <Button
            type="button"
            onClick={() => setModalOpen(true)}
            disabled={selectedObservations.length === 0 || promoting}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            Promover seleccionadas
          </Button>
        </div>
      </div>

      <ObservationPromoteModal
        open={modalOpen}
        selectedObservations={selectedObservations}
        currentFieldValues={currentFieldValues}
        promoting={promoting}
        onClose={() => setModalOpen(false)}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
