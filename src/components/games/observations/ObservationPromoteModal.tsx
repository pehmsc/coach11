"use client";

import { useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { AppModal } from "@/components/ui/app-modal";
import { Button } from "@/components/ui/button";
import type { GameOpponentObservation } from "@/types/database";
import {
  PROMOTE_TARGET_FIELDS,
  type PromoteTargetField,
} from "@/lib/schemas/observations";

interface ObservationPromoteModalProps {
  open: boolean;
  selectedObservations: GameOpponentObservation[];
  /** Texto actual de cada campo do opponent (para pré-visualização). Opcional. */
  currentFieldValues?: Partial<Record<PromoteTargetField, string | null>>;
  promoting: boolean;
  onClose: () => void;
  onConfirm: (targetField: PromoteTargetField) => void;
}

const FIELD_LABELS: Record<PromoteTargetField, string> = {
  pontos_fortes: "Pontos fortes",
  pontos_fracos: "Pontos fracos",
  atletas_chave: "Atletas-chave",
  notas_gerais: "Notas gerais",
};

const FIELD_DESCRIPTIONS: Record<PromoteTargetField, string> = {
  pontos_fortes: "O que faz bem (anexado em bullets)",
  pontos_fracos: "Vulnerabilidades para explorar",
  atletas_chave: "Jogadores importantes do adversário",
  notas_gerais: "Outras observações",
};

export function ObservationPromoteModal(props: ObservationPromoteModalProps) {
  if (!props.open) return null;
  return <ObservationPromoteModalInner {...props} />;
}

function ObservationPromoteModalInner({
  open,
  selectedObservations,
  currentFieldValues,
  promoting,
  onClose,
  onConfirm,
}: ObservationPromoteModalProps) {
  const [targetField, setTargetField] = useState<PromoteTargetField | null>(
    null,
  );

  const appended = selectedObservations
    .map((o) => `- ${o.observation}`)
    .join("\n");

  const existing =
    targetField && currentFieldValues
      ? (currentFieldValues[targetField] ?? "").trim()
      : "";

  const preview = !targetField
    ? ""
    : existing.length === 0
      ? appended
      : `${existing}\n${appended}`;

  const canConfirm = !!targetField && !promoting && selectedObservations.length > 0;

  return (
    <AppModal
      open={open}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <ArrowRight size={18} className="text-emerald-600" />
          Promover observações
        </span>
      }
      closeLabel="Fechar modal de promoção"
      bodyClassName="space-y-4"
      panelClassName="max-w-2xl"
    >
      <div>
        <p className="text-sm font-medium text-slate-700 mb-2">
          {selectedObservations.length} observ{selectedObservations.length === 1 ? "ação" : "ações"} a promover
        </p>
        <ul className="rounded-lg border border-slate-200 bg-slate-50 max-h-40 overflow-y-auto divide-y divide-slate-100">
          {selectedObservations.map((obs) => (
            <li key={obs.id} className="px-3 py-2 text-sm text-slate-700">
              {typeof obs.minute === "number" && (
                <span className="text-xs text-slate-400 mr-2">
                  Min {obs.minute}&apos;
                </span>
              )}
              <span className="whitespace-pre-wrap break-words">
                {obs.observation}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="text-sm font-medium text-slate-700 mb-2">
          Destino no perfil do adversário
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {PROMOTE_TARGET_FIELDS.map((field) => {
            const selected = targetField === field;
            return (
              <button
                key={field}
                type="button"
                onClick={() => setTargetField(field)}
                disabled={promoting}
                className={`text-left rounded-lg border px-3 py-2 transition-colors disabled:opacity-50 ${
                  selected
                    ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <p
                  className={`text-sm font-medium ${selected ? "text-emerald-700" : "text-slate-800"}`}
                >
                  {FIELD_LABELS[field]}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {FIELD_DESCRIPTIONS[field]}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {targetField && (
        <div>
          <p className="text-sm font-medium text-slate-700 mb-2">
            Pré-visualização (campo {FIELD_LABELS[targetField]})
          </p>
          <pre className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 whitespace-pre-wrap break-words max-h-48 overflow-y-auto font-sans">
            {preview || "(sem texto)"}
          </pre>
          {existing && (
            <p className="text-xs text-slate-400 mt-1">
              O texto existente é preservado — as observações são anexadas no fim.
            </p>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onClose} disabled={promoting}>
          Cancelar
        </Button>
        <Button
          onClick={() => targetField && onConfirm(targetField)}
          disabled={!canConfirm}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          {promoting ? (
            <>
              <Loader2 size={16} className="animate-spin mr-2" />A promover…
            </>
          ) : (
            "Promover"
          )}
        </Button>
      </div>
    </AppModal>
  );
}
