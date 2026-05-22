"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, ClipboardList, Trash2 } from "lucide-react";
import type { GameOpponentObservation } from "@/types/database";

interface ObservationsReviewSectionProps {
  observations: GameOpponentObservation[];
  onDelete: (obsId: string) => void;
}

export function ObservationsReviewSection({
  observations,
  onDelete,
}: ObservationsReviewSectionProps) {
  const [open, setOpen] = useState(true);

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
            <ul className="divide-y divide-slate-100">
              {observations.map((obs) => (
                <li
                  key={obs.id}
                  className="px-4 py-3 flex items-start gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-800 whitespace-pre-wrap break-words">
                      {obs.observation}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      {typeof obs.minute === "number"
                        ? `Minuto ${obs.minute}' · capturada`
                        : "Capturada"}
                    </p>
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
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
