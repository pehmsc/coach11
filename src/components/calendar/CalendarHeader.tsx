"use client";

import { format, addDays } from "date-fns";
import { pt } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface CalendarHeaderProps {
  weekStart: Date;
  ageGroupName: string;
  goToPreviousWeek: () => void;
  goToNextWeek: () => void;
  goToCurrentWeek: () => void;
}

export function CalendarHeader({
  weekStart,
  ageGroupName,
  goToPreviousWeek,
  goToNextWeek,
  goToCurrentWeek,
}: CalendarHeaderProps) {
  const weekLabel = `${format(weekStart, "d 'de' MMM", { locale: pt })} — ${format(
    addDays(weekStart, 6),
    "d 'de' MMM yyyy",
    { locale: pt },
  )}`;

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Calendário</h1>
          <p className="text-slate-500 text-sm">{ageGroupName}</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={goToPreviousWeek}
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <ChevronLeft size={20} className="text-slate-600" />
          </button>
          <button
            onClick={goToCurrentWeek}
            className="text-xs font-medium text-emerald-600 hover:underline px-2"
          >
            Hoje
          </button>
          <button
            onClick={goToNextWeek}
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <ChevronRight size={20} className="text-slate-600" />
          </button>
        </div>
      </div>

      <p className="text-xs text-slate-400 mb-4 capitalize">{weekLabel}</p>

      <div className="flex gap-4 mb-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />{" "}
          Treino
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />{" "}
          Jogo
        </span>
      </div>
    </>
  );
}
