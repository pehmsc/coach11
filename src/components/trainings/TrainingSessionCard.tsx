"use client";

import Link from "next/link";
import { format, parseISO, isToday, isFuture } from "date-fns";
import { pt } from "date-fns/locale";
import { Clock, MapPin, Copy, Users } from "lucide-react";
import { resolveLocationLabel } from "@/lib/location";
import { getTrainingDisplayTitle } from "@/lib/trainings/ut-numbering";
import type { TrainingRow, AttendanceSummary } from "./types";

interface TrainingSessionCardProps {
  session: TrainingRow;
  summary: AttendanceSummary | null;
  variant: "open" | "closed";
  href: string;
  onNavigate?: () => void;
  onDuplicate?: (session: TrainingRow) => void;
}

export function TrainingSessionCard({
  session,
  summary,
  variant,
  href,
  onNavigate,
  onDuplicate,
}: TrainingSessionCardProps) {
  const dt = parseISO(session.session_date);
  const upcoming = isToday(dt) || isFuture(dt);
  const locationLabel = resolveLocationLabel(
    session.location,
    session.formatted_address,
  );
  const displayTitle = getTrainingDisplayTitle(session);

  // Linha navegavel: o <Link> cobre o cartao via pseudo-elemento (after:inset-0);
  // as accoes internas ficam como irmaos com z-10 para nao aninhar button em anchor.
  if (variant === "closed") {
    return (
      <div
        key={session.id}
        className="relative w-full flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-left transition-all hover:border-slate-200 hover:shadow-sm"
      >
        <div className="w-10 flex-shrink-0 text-center">
          <p className="text-base font-bold leading-none text-slate-900">{format(dt, "d")}</p>
          <p className="text-[10px] capitalize text-slate-400">{format(dt, "EEE", { locale: pt })}</p>
        </div>
        <Link
          href={href}
          onClick={onNavigate}
          className="min-w-0 flex-1 after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-emerald-500"
        >
          <p className="truncate text-sm font-semibold text-slate-800">
            {displayTitle}
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
        </Link>
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
      </div>
    );
  }

  return (
    <div
      key={session.id}
      className={`relative w-full flex items-center gap-3 p-4 rounded-2xl border text-left transition-all hover:shadow-sm ${
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
      <Link
        href={href}
        onClick={onNavigate}
        className="flex-1 min-w-0 after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-emerald-500"
      >
        <p className="text-sm font-semibold text-slate-800 truncate">
          {displayTitle}
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
      </Link>

      {/* Attendance badge */}
      <div className="flex flex-shrink-0 items-center gap-2">
        {onDuplicate && (
          /* Hit area 44px via before:-inset (26px visuais + 9px por lado) */
          <button
            type="button"
            onClick={() => onDuplicate(session)}
            className="relative z-10 rounded-full bg-white/80 p-1.5 text-slate-600 transition-colors hover:bg-white hover:text-slate-900 before:absolute before:-inset-[9px] before:content-['']"
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
    </div>
  );
}
