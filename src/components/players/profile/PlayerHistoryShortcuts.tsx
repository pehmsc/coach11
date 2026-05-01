"use client";

import { Calendar, Dumbbell } from "lucide-react";

/**
 * Placeholders para as sub-rotas do Grupo B que entram no PR 3.
 * Estão `aria-disabled` e sem href — apenas fixam a estrutura visual da
 * página para o PR 3 não ter de re-arquitectar.
 */
export function PlayerHistoryShortcuts() {
  const items = [
    {
      label: "Histórico de jogos",
      description: "Lista cronológica de jogos com mini-stats por linha.",
      icon: Calendar,
    },
    {
      label: "Histórico de treinos",
      description: "Presença, falta, justificação por sessão.",
      icon: Dumbbell,
    },
  ];

  return (
    <section>
      <h2 className="mb-3 text-sm font-bold text-slate-900">Histórico</h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {items.map(({ label, description, icon: Icon }) => (
          <div
            key={label}
            aria-disabled="true"
            className="flex items-start gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 opacity-70"
          >
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-white text-slate-400">
              <Icon size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-slate-700">{label}</p>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                  Em breve
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">{description}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
