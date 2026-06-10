"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import {
  DASHBOARD_PRIORITY_WINDOW_SIZE,
  getDashboardPriorityWindowStartIndex,
} from "@/lib/events/dashboard-priority";

export type DashboardEventItem = {
  id: string;
  type: "training" | "game";
  href: string;
  title: string;
  subtitle: string;
  sortTs: number;
  isPriority?: boolean;
  showPresenceCta?: boolean;
  presenceCtaMode?: "mark" | "close";
  presenceCtaHref?: string;
  needsConvocation?: boolean;
  convocationCtaMode?: "upcoming" | "overdue";
};

type Props = {
  events: DashboardEventItem[];
  anchorTs: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function DashboardEventsWindow({ events, anchorTs }: Props) {
  const maxStart = Math.max(0, events.length - DASHBOARD_PRIORITY_WINDOW_SIZE);
  const initialStartIndex = useMemo(() => {
    return getDashboardPriorityWindowStartIndex(events, anchorTs);
  }, [anchorTs, events]);
  const [startIndex, setStartIndex] = useState(initialStartIndex);

  useEffect(() => {
    setStartIndex(initialStartIndex);
  }, [initialStartIndex]);

  const visibleEvents = useMemo(() => {
    const nextVisible = events.slice(
      startIndex,
      startIndex + DASHBOARD_PRIORITY_WINDOW_SIZE,
    );
    while (nextVisible.length < DASHBOARD_PRIORITY_WINDOW_SIZE) {
        nextVisible.push({
          id: `placeholder-${nextVisible.length}`,
          type: "training",
          href: "",
          title: "Sem mais eventos",
          subtitle: "Não existem mais eventos nesta direção.",
          sortTs: Number.MAX_SAFE_INTEGER,
        });
    }
    return nextVisible;
  }, [events, startIndex]);

  return (
    <div className="space-y-3">
      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => setStartIndex((current) => clamp(current - 1, 0, maxStart))}
          disabled={startIndex <= 0}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronUp size={14} />
          Eventos anteriores
        </button>
      </div>

      {visibleEvents.map((event) => {
        if (!event.href) {
          return (
            <div
              key={event.id}
              className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-center"
            >
              <p className="text-sm font-medium text-slate-500">{event.title}</p>
              <p className="mt-1 text-xs text-slate-400">{event.subtitle}</p>
            </div>
          );
        }

        const isTraining = event.type === "training";
        const cardClasses = isTraining
          ? "bg-emerald-50 border-emerald-200 hover:border-emerald-300"
          : "bg-blue-50 border-blue-200 hover:border-blue-300";
        const chipClasses = isTraining ? "bg-emerald-500" : "bg-blue-500";
        const textClasses = isTraining ? "text-emerald-900" : "text-blue-900";
        const subtextClasses = isTraining ? "text-emerald-700" : "text-blue-700";
        const arrowClasses = isTraining ? "text-emerald-600" : "text-blue-600";

        return (
          <div key={event.id} className="space-y-1">
            <Link href={event.href}>
              <div className={`flex items-center gap-3 rounded-xl border p-4 transition-colors ${cardClasses}`}>
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${chipClasses}`}>
                  <span className="text-xs font-bold text-white">
                    {isTraining ? "T" : "J"}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm font-semibold ${textClasses}`}>
                    {event.title}
                  </p>
                  <p className={`truncate text-xs capitalize ${subtextClasses}`}>
                    {event.subtitle}
                  </p>
                </div>
                <span className={`text-xs font-medium ${arrowClasses}`}>→</span>
              </div>
            </Link>

            {event.showPresenceCta ? (
              <Link href={event.presenceCtaHref || "/attendance"}>
                <div className="ml-2 flex items-center gap-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-3 transition-colors hover:border-amber-400">
                  <AlertCircle size={16} className="shrink-0 text-amber-500" />
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-amber-900">
                      {event.presenceCtaMode === "close"
                        ? "Confirmar e fechar treino"
                        : "Marcar presenças"}
                    </p>
                    <p className="text-xs text-amber-700">
                      {event.presenceCtaMode === "close"
                        ? "O treino terminou. Revê o registo e fecha a sessão."
                        : "A janela para marcar presenças já está disponível."}
                    </p>
                  </div>
                  <span className="text-xs font-medium text-amber-600">→</span>
                </div>
              </Link>
            ) : null}

            {event.needsConvocation ? (
              <Link href={event.href}>
                <div className="ml-2 flex items-center gap-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-3 transition-colors hover:border-amber-400">
                  <AlertCircle size={16} className="shrink-0 text-amber-500" />
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-amber-900">
                      {event.convocationCtaMode === "overdue"
                        ? "Convocatória pendente"
                        : "Convocatória por criar"}
                    </p>
                    <p className="text-xs text-amber-700">
                      {event.convocationCtaMode === "overdue"
                        ? "A hora do evento já passou e a convocatória continua por resolver."
                        : "Jogo em menos de 48h. Define já os convocados."}
                    </p>
                  </div>
                  <span className="text-xs font-medium text-amber-600">→</span>
                </div>
              </Link>
            ) : null}
          </div>
        );
      })}

      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => setStartIndex((current) => clamp(current + 1, 0, maxStart))}
          disabled={startIndex >= maxStart}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Eventos seguintes
          <ChevronDown size={14} />
        </button>
      </div>
    </div>
  );
}
