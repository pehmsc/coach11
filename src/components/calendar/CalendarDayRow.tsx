"use client";

import Image from "next/image";
import { format, isToday } from "date-fns";
import { pt } from "date-fns/locale";
import { Plus, Clock, MapPin } from "lucide-react";
import { resolveLocationLabel } from "@/lib/location";
import { type CalEvent, DAY_NAMES, compareEventsByDateTime } from "./types";

interface CalendarDayRowProps {
  day: Date;
  dayIndex: number;
  events: CalEvent[];
  onAddTraining: (date: string) => void;
  onAddGame: (date: string) => void;
  onEditEvent: (event: CalEvent) => void;
}

export function CalendarDayRow({
  day,
  dayIndex,
  events,
  onAddTraining,
  onAddGame,
  onEditEvent,
}: CalendarDayRowProps) {
  const dayStr = format(day, "yyyy-MM-dd");
  const dayEvents = events
    .filter((e) => e.date === dayStr)
    .sort(compareEventsByDateTime);
  const isCurrentDay = isToday(day);

  return (
    <div
      className={`rounded-xl border-2 overflow-hidden ${
        isCurrentDay ? "border-emerald-400" : "border-slate-100"
      }`}
    >
      {/* Cabeçalho do dia */}
      <div
        className={`flex items-center gap-3 px-4 py-2 ${isCurrentDay ? "bg-emerald-50" : "bg-slate-50"}`}
      >
        <span
          className={`text-sm font-semibold w-8 ${isCurrentDay ? "text-emerald-700" : "text-slate-600"}`}
        >
          {DAY_NAMES[dayIndex]}
        </span>
        <span
          className={`text-sm ${isCurrentDay ? "text-emerald-600 font-bold" : "text-slate-500"}`}
        >
          {format(day, "d MMM", { locale: pt })}
        </span>
        {isCurrentDay && (
          <span className="text-xs bg-emerald-500 text-white px-2 py-0.5 rounded-full">
            Hoje
          </span>
        )}
        <div className="ml-auto flex gap-1">
          <button
            onClick={() => onAddTraining(dayStr)}
            className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs text-emerald-600 hover:bg-emerald-100 transition-colors"
          >
            <Plus size={12} /> Treino
          </button>
          <button
            onClick={() => onAddGame(dayStr)}
            className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs text-blue-600 hover:bg-blue-50 transition-colors"
          >
            <Plus size={12} /> Jogo
          </button>
        </div>
      </div>

      {/* Eventos do dia */}
      <div className="bg-white">
        {dayEvents.length === 0 ? (
          <p className="px-4 py-2.5 text-xs text-slate-300">
            Sem eventos
          </p>
        ) : (
          <div className="divide-y divide-slate-50">
            {dayEvents.map((event) => (
              <button
                key={event.id}
                onClick={() => onEditEvent(event)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left"
              >
                {event.image_url ? (
                  <Image
                    src={event.image_url}
                    alt=""
                    width={40}
                    height={40}
                    className="h-10 w-10 rounded-lg object-cover flex-shrink-0"
                  />
                ) : (
                  <div
                    className={`w-2 h-10 rounded-full flex-shrink-0 ${
                      event.type === "game"
                        ? "bg-blue-500"
                        : "bg-emerald-500"
                    }`}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-800 text-sm truncate">
                    {event.type === "game" ? "⚽" : "🏃"} {event.title}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {event.start_time && (
                      <span className="text-xs text-slate-400 flex items-center gap-0.5">
                        <Clock size={10} />{" "}
                        {event.start_time.substring(0, 5)}
                      </span>
                    )}
                    {resolveLocationLabel(
                      event.location,
                      event.formatted_address,
                      event.location_address,
                    ) && (
                      <span className="text-xs text-slate-400 flex items-center gap-0.5 truncate">
                        <MapPin size={10} />
                        {resolveLocationLabel(
                          event.location,
                          event.formatted_address,
                          event.location_address,
                        )}
                      </span>
                    )}
                  </div>
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
                    event.status === "completed"
                      ? "bg-slate-100 text-slate-500"
                      : "bg-emerald-50 text-emerald-600"
                  }`}
                >
                  {event.status === "completed"
                    ? "Fechado"
                    : "Agendado"}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
