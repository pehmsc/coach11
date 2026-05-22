"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GameOpponentObservation } from "@/types/database";
import type { PromoteTargetField } from "@/lib/schemas/observations";
import { ObservationPromoteModal } from "@/components/games/observations/ObservationPromoteModal";

interface ObservationsReviewSectionProps {
  observations: GameOpponentObservation[];
  onDelete: (obsId: string) => void;
  /** Quando definido, habilita selecção em lote + promoção. */
  onPromote?: (
    observationIds: string[],
    targetField: PromoteTargetField,
  ) => Promise<boolean>;
  /** Texto actual dos campos do opponent — para pré-visualização no modal. */
  currentOpponentFieldValues?: Partial<Record<PromoteTargetField, string | null>>;
  promoting?: boolean;
}

const FIELD_LABEL_SHORT: Record<PromoteTargetField, string> = {
  pontos_fortes: "Pontos fortes",
  pontos_fracos: "Pontos fracos",
  atletas_chave: "Atletas-chave",
  notas_gerais: "Notas gerais",
};

export function ObservationsReviewSection({
  observations,
  onDelete,
  onPromote,
  currentOpponentFieldValues,
  promoting = false,
}: ObservationsReviewSectionProps) {
  const [open, setOpen] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  // IDs marcados localmente como promovidos (durante esta sessão) para mostrar
  // badge sem precisar de reload do hook do live.
  const [recentlyPromotedIds, setRecentlyPromotedIds] = useState<Set<string>>(
    new Set(),
  );
  const [recentlyPromotedField, setRecentlyPromotedField] =
    useState<PromoteTargetField | null>(null);

  const canPromote = Boolean(onPromote);

  const isPromoted = (obs: GameOpponentObservation): boolean =>
    Boolean(obs.promoted_to_opponent_at) || recentlyPromotedIds.has(obs.id);

  function getPromotedField(
    obs: GameOpponentObservation,
  ): PromoteTargetField | null {
    if (obs.promoted_to_field) return obs.promoted_to_field;
    if (recentlyPromotedIds.has(obs.id)) return recentlyPromotedField;
    return null;
  }

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedObservations = useMemo(
    () =>
      observations.filter(
        (o) => selectedIds.has(o.id) && !isPromoted(o),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [observations, selectedIds, recentlyPromotedIds],
  );

  async function handleConfirm(targetField: PromoteTargetField) {
    if (!onPromote) return;
    const ids = selectedObservations.map((o) => o.id);
    const ok = await onPromote(ids, targetField);
    if (ok) {
      setRecentlyPromotedField(targetField);
      setRecentlyPromotedIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.add(id));
        return next;
      });
      setSelectedIds(new Set());
      setModalOpen(false);
    }
  }

  return (
    <div className="mb-5 rounded-xl border border-slate-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
      >
        <div className="text-left flex items-center gap-2">
          <ClipboardList size={16} className="text-sky-600" />
          <div>
            <p className="font-bold text-slate-900 text-sm">
              Observações do adversário
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {observations.length === 0
                ? "Sem observações capturadas neste jogo"
                : `${observations.length} ${observations.length === 1 ? "observação capturada" : "observações capturadas"}`}
            </p>
          </div>
        </div>
        {open ? (
          <ChevronUp size={18} className="text-slate-400" />
        ) : (
          <ChevronDown size={18} className="text-slate-400" />
        )}
      </button>

      {open && (
        <div className="border-t border-slate-200">
          {observations.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500 text-center">
              Sem observações capturadas neste jogo.
            </p>
          ) : (
            <>
              <ul className="divide-y divide-slate-100">
                {observations.map((obs) => {
                  const promoted = isPromoted(obs);
                  const promotedField = getPromotedField(obs);
                  const selected = selectedIds.has(obs.id);
                  return (
                    <li
                      key={obs.id}
                      className="px-4 py-3 flex items-start gap-3"
                    >
                      {canPromote && (
                        <input
                          type="checkbox"
                          checked={selected && !promoted}
                          disabled={promoted}
                          onChange={() => toggle(obs.id)}
                          aria-label={
                            promoted
                              ? "Já promovida"
                              : "Seleccionar para promover"
                          }
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 disabled:opacity-50"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-800 whitespace-pre-wrap break-words">
                          {obs.observation}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <p className="text-xs text-slate-400">
                            {typeof obs.minute === "number"
                              ? `Minuto ${obs.minute}' · capturada`
                              : "Capturada"}
                          </p>
                          {promoted && promotedField && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                              <CheckCircle2 size={10} />
                              Promovida → {FIELD_LABEL_SHORT[promotedField]}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onDelete(obs.id)}
                        aria-label="Apagar observação"
                        className="flex-shrink-0 rounded-md p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </li>
                  );
                })}
              </ul>
              {canPromote && (
                <div className="border-t border-slate-100 px-4 py-3 flex items-center justify-between gap-3 bg-slate-50">
                  <p className="text-xs text-slate-500">
                    {selectedObservations.length === 0
                      ? "Selecciona observações para promover ao perfil do adversário"
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
              )}
            </>
          )}
        </div>
      )}

      <ObservationPromoteModal
        open={modalOpen}
        selectedObservations={selectedObservations}
        currentFieldValues={currentOpponentFieldValues}
        promoting={promoting}
        onClose={() => setModalOpen(false)}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
