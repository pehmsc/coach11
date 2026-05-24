"use client";

import Link from "next/link";
import { Calendar, ChevronRight, Dumbbell } from "lucide-react";

export type PlayerHistoryHrefs = {
  games: string;
  trainings: string;
};

interface PlayerHistoryShortcutsProps {
  playerId: string;
  hrefs?: PlayerHistoryHrefs;
}

function defaultHrefs(playerId: string): PlayerHistoryHrefs {
  return {
    games: `/players/${playerId}/games`,
    trainings: `/players/${playerId}/trainings`,
  };
}

export function PlayerHistoryShortcuts({
  playerId,
  hrefs,
}: PlayerHistoryShortcutsProps) {
  const resolved = hrefs ?? defaultHrefs(playerId);
  const items = [
    {
      label: "Histórico de jogos",
      description: "Lista cronológica com mini-stats por linha.",
      icon: Calendar,
      href: resolved.games,
    },
    {
      label: "Histórico de treinos",
      description: "Presença, falta, justificação por sessão.",
      icon: Dumbbell,
      href: resolved.trainings,
    },
  ];

  return (
    <section>
      <h2 className="mb-3 text-sm font-bold text-slate-900">Histórico</h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {items.map(({ label, description, icon: Icon, href }) => (
          <Link
            key={label}
            href={href}
            className="flex items-start gap-3 rounded-xl border border-slate-100 bg-white p-3 transition-colors hover:border-slate-200 hover:bg-slate-50"
          >
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
              <Icon size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">{label}</p>
              <p className="mt-0.5 text-xs text-slate-500">{description}</p>
            </div>
            <ChevronRight
              size={16}
              className="mt-1 flex-shrink-0 text-slate-300"
              aria-hidden="true"
            />
          </Link>
        ))}
      </div>
    </section>
  );
}
