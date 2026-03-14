"use client";

import { format, parseISO, isToday, isFuture } from "date-fns";
import { pt } from "date-fns/locale";
import { Clock, MapPin, Copy, Users } from "lucide-react";
import { resolveLocationLabel } from "@/lib/location";
import type { TrainingRow, AttendanceSummary } from "./types";

interface TrainingSessionCardProps {
  session: TrainingRow;
  summary: AttendanceSummary | null;
  variant: "open" | "closed";
  onSessionClick: (session: TrainingRow) => void;
  onDuplicate?: (session: TrainingRow) => void;
}

export function TrainingSessionCard({
  session,
  summary,
  variant,
  onSessionClick,
  onDuplicate,
}: TrainingSessionCardProps) {
  const dt = parseISO(session.session_date);
  const upcoming = isToday(dt) || isFuture(dt);
  const locationLabel = resolveLocationLabel(
    session.location,
    session.formatted_address,
    session.location_address,
  );

  if (variant === "closed") {
    return (
      <button
        key={session.id}
        onClick={() => void onSessionClick(session)}
        className="w-full flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-left transition-all hover:border-slate-200 hover:shadow-sm"
      >
        <div className="w-10 flex-shrink-0 text-center">
          <p className="text-base font-bold leading-none text-slate-900">{format(dt, "d")}</p>
          <p className="text-[10px] capitalize text-slate-400">{format(dt, "EEE", { locale: pt })}</p>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-800">
            {session.title || "Treino"}
            <span className="ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold bg-slate-100 text-slate-500">
              Fechado
            </span>
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            {session.start_time && (
              <span className="flex items-center gap-0.5 text-xs text-slate-400">
                <Clock size={10} className="flex-shrink-0" />
                {session.start_time.substring(0, 5)}
              </span>
            )}
            {locationLabel && (
              <span className="flex items-center gap-0.5 truncate text-xs text-slate-400">
                <MapPin size={10} className="flex-shrink-0" />
                {locationLabel}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          {summary ? (
            <div className="text-right">
              <p className="text-sm font-bold text-slate-700">
                {summary.present + summary.late}
              </p>
              <p className="text-[10px] text-slate-400">presentes</p>
            </div>
          ) : (
            <Users size={16} className="text-slate-300" />
          )}
        </div>
      </button>
    );
  }

  return (
    <button
      key={session.id}
      onClick={() => void onSessionClick(session)}
      className={`w-full flex items-center gap-3 p-4 rounded-2xl border text-left transition-all hover:shadow-sm ${
        upcoming
          ? "bg-emerald-50 border-emerald-200 hover:border-emerald-300"
          : "bg-white border-slate-100 hover:border-slate-200"
      }`}
    >
      {/* Date */}
      <div className="flex-shrink-0 w-10 text-center">
        <p className="text-base font-bold text-slate-900 leading-none">{format(dt, "d")}</p>
        <p className="text-[10px] text-slate-400 capitalize">{format(dt, "EEE", { locale: pt })}</p>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800 truncate">
          {session.title || "Treino"}
          {isToday(dt) && (
            <span className="ml-2 text-[10px] font-bold bg-amber-100 text-amber-700 rounded px-1.5 py-0.5">Hoje</span>
          )}
          <span
            className={`ml-2 text-[10px] font-bold rounded px-1.5 py-0.5 ${
              session.status === "completed"
                ? "bg-slate-100 text-slate-500"
                : "bg-blue-100 text-blue-700"
            }`}
          >
            {session.status === "completed" ? "Fechado" : "Agendado"}
          </span>
        </p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {session.start_time && (
            <span className="text-xs text-slate-400 flex items-center gap-0.5">
              <Clock size={10} className="flex-shrink-0" />
              {session.start_time.substring(0, 5)}
            </span>
          )}
          {locationLabel && (
            <span className="text-xs text-slate-400 flex items-center gap-0.5 truncate">
              <MapPin size={10} className="flex-shrink-0" />
              {locationLabel}
            </span>
          )}
        </div>
      </div>

      {/* Attendance badge */}
      <div className="flex flex-shrink-0 items-center gap-2">
        {onDuplicate && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDuplicate(session);
            }}
            className="rounded-full bg-white/80 p-1.5 text-slate-600 transition-colors hover:bg-white hover:text-slate-900"
            title="Duplicar treino"
          >
            <Copy size={14} />
          </button>
        )}
        {summary ? (
          <div className="text-right">
            <p className="text-sm font-bold text-emerald-700">
              {summary.present + summary.late}
            </p>
            <p className="text-[10px] text-slate-400">presentes</p>
          </div>
        ) : (
          <div>
            <Users size={16} className="text-slate-300" />
          </div>
        )}
      </div>
    </button>
  );
}
