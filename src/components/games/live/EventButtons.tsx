"use client";

import type { ModalType } from "./types";

interface EventButtonsProps {
  /** Habilita golos — apenas durante 1ª/2ª parte (jogo activo). */
  canRegisterEvents: boolean;
  /** Habilita subs/cartões — 1ª/2ª parte + halftime. */
  canRegisterSubstitutionOrCard: boolean;
  openModal: (type: ModalType) => void;
  /** Abre o modal de captura de observação sobre o adversário. PR B1. */
  onOpenObservation: () => void;
  /** True quando o jogo não tem opponent_id — desactiva o botão de observação. */
  observationsDisabled?: boolean;
}

export function EventButtons({
  canRegisterEvents,
  canRegisterSubstitutionOrCard,
  openModal,
  onOpenObservation,
  observationsDisabled = false,
}: EventButtonsProps) {
  return (
    <div className="grid grid-cols-2 gap-2 mb-5">
      <button
        onClick={() => openModal("goal")}
        disabled={!canRegisterEvents}
        className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium hover:bg-emerald-100 transition-colors disabled:opacity-40"
      >
        ⚽ Golo
      </button>
      <button
        onClick={() => openModal("penalty_goal")}
        disabled={!canRegisterEvents}
        className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium hover:bg-emerald-100 transition-colors disabled:opacity-40"
      >
        🥅 Penálti
      </button>
      <button
        onClick={() => openModal("yellow_card")}
        disabled={!canRegisterSubstitutionOrCard}
        className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm font-medium hover:bg-amber-100 transition-colors disabled:opacity-40"
      >
        🟨 Amarelo
      </button>
      <button
        onClick={() => openModal("red_card")}
        disabled={!canRegisterSubstitutionOrCard}
        className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium hover:bg-red-100 transition-colors disabled:opacity-40"
      >
        🟥 Vermelho
      </button>
      <button
        onClick={() => openModal("substitution")}
        disabled={!canRegisterSubstitutionOrCard}
        className="col-span-2 p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 text-sm font-medium hover:bg-blue-100 transition-colors disabled:opacity-40"
      >
        🔄 Substituição
      </button>
      <button
        type="button"
        onClick={onOpenObservation}
        disabled={observationsDisabled}
        title={
          observationsDisabled
            ? "Jogo sem adversário associado — sem observações"
            : undefined
        }
        className="col-span-2 p-3 rounded-xl bg-sky-50 border border-sky-200 text-sky-700 text-sm font-medium hover:bg-sky-100 transition-colors disabled:opacity-40"
      >
        📝 Obs. ADV
      </button>
    </div>
  );
}
