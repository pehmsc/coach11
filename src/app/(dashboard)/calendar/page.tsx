"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  format,
  startOfWeek,
  addDays,
  addWeeks,
  subWeeks,
  isSameDay,
  isToday,
  parseISO,
} from "date-fns";
import { pt } from "date-fns/locale";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const DAY_NAMES = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

interface SessionEvent {
  id: string;
  type: "training" | "game";
  date: string;
  start_time?: string;
  notes?: string;
  status?: string;
  opponent_name?: string;
  location?: string;
  is_home?: boolean;
}

export default function CalendarPage() {
  const supabase = createClient();
  const [weekStart, setWeekStart] = useState(
    startOfWeek(new Date(), { weekStartsOn: 1 }),
  );
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [selected, setSelected] = useState<SessionEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [teamId, setTeamId] = useState<string | null>(null);

  useEffect(() => {
    loadTeam();
  }, []);
  useEffect(() => {
    if (teamId) loadEvents();
  }, [teamId, weekStart]);

  async function loadTeam() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data: ag } = await supabase
      .from("age_groups")
      .select("*, teams(*)")
      .eq("coordinator_id", user.id)
      .single();
    if (ag?.teams?.[0]) setTeamId(ag.teams[0].id);
    setLoading(false);
  }

  async function loadEvents() {
    if (!teamId) return;
    const from = format(weekStart, "yyyy-MM-dd");
    const to = format(addDays(weekStart, 6), "yyyy-MM-dd");

    const { data: sessions } = await supabase
      .from("training_sessions")
      .select("*")
      .eq("team_id", teamId)
      .gte("session_date", from)
      .lte("session_date", to);

    const { data: games } = await supabase
      .from("games")
      .select("*")
      .eq("team_id", teamId)
      .gte("game_datetime", `${from}T00:00:00`)
      .lte("game_datetime", `${to}T23:59:59`);

    const sessionEvents: SessionEvent[] = (sessions || []).map((s) => ({
      id: s.id,
      type: "training",
      date: s.session_date,
      start_time: s.start_time,
      notes: s.notes,
      status: s.status,
      location: undefined,
    }));

    const gameEvents: SessionEvent[] = (games || []).map((g) => ({
      id: g.id,
      type: "game",
      date: g.game_datetime.split("T")[0],
      start_time: g.game_datetime.split("T")[1]?.substring(0, 5),
      opponent_name: g.opponent_name,
      location: g.location,
      is_home: g.is_home,
      status: g.status,
    }));

    setEvents([...sessionEvents, ...gameEvents]);
  }

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const weekLabel = `${format(weekStart, "d 'de' MMM", { locale: pt })} — ${format(
    addDays(weekStart, 6),
    "d 'de' MMM yyyy",
    { locale: pt },
  )}`;

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto">
      {/* Header com navegação */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Calendário</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekStart((w) => subWeeks(w, 1))}
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <ChevronLeft size={20} className="text-slate-600" />
          </button>
          <button
            onClick={() =>
              setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))
            }
            className="text-xs font-medium text-emerald-600 hover:underline px-1"
          >
            Hoje
          </button>
          <button
            onClick={() => setWeekStart((w) => addWeeks(w, 1))}
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <ChevronRight size={20} className="text-slate-600" />
          </button>
        </div>
      </div>

      {/* Label da semana */}
      <p className="text-sm text-slate-500 mb-4 capitalize">{weekLabel}</p>

      {/* Grelha da semana */}
      <div className="space-y-2">
        {days.map((day, i) => {
          const dayStr = format(day, "yyyy-MM-dd");
          const dayEvents = events.filter((e) => e.date === dayStr);
          const isCurrentDay = isToday(day);

          return (
            <div
              key={dayStr}
              className={`rounded-xl border-2 overflow-hidden ${
                isCurrentDay ? "border-emerald-400" : "border-slate-100"
              }`}
            >
              {/* Cabeçalho do dia */}
              <div
                className={`flex items-center gap-3 px-4 py-2 ${
                  isCurrentDay ? "bg-emerald-50" : "bg-slate-50"
                }`}
              >
                <span
                  className={`text-sm font-semibold w-8 ${
                    isCurrentDay ? "text-emerald-700" : "text-slate-600"
                  }`}
                >
                  {DAY_NAMES[i]}
                </span>
                <span
                  className={`text-sm ${
                    isCurrentDay
                      ? "text-emerald-600 font-bold"
                      : "text-slate-500"
                  }`}
                >
                  {format(day, "d MMM", { locale: pt })}
                </span>
                {isCurrentDay && (
                  <span className="text-xs bg-emerald-500 text-white px-2 py-0.5 rounded-full ml-auto">
                    Hoje
                  </span>
                )}
              </div>

              {/* Eventos do dia */}
              {dayEvents.length === 0 ? (
                <div className="px-4 py-3 bg-white">
                  <p className="text-xs text-slate-300">Sem eventos</p>
                </div>
              ) : (
                <div className="bg-white divide-y divide-slate-50">
                  {dayEvents.map((event) => (
                    <button
                      key={event.id}
                      onClick={() => setSelected(event)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left"
                    >
                      {/* Indicador de tipo */}
                      <div
                        className={`w-2 h-8 rounded-full flex-shrink-0 ${
                          event.type === "game"
                            ? "bg-blue-500"
                            : "bg-emerald-500"
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-800 text-sm">
                          {event.type === "game"
                            ? `⚽ Jogo${event.opponent_name ? ` vs ${event.opponent_name}` : ""}`
                            : "🏃 Treino"}
                        </p>
                        <p className="text-xs text-slate-400">
                          {event.start_time && event.start_time.substring(0, 5)}
                          {event.location && ` · ${event.location}`}
                        </p>
                      </div>
                      {/* Estado */}
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
                          event.status === "completed"
                            ? "bg-slate-100 text-slate-500"
                            : event.status === "live"
                              ? "bg-red-100 text-red-600 font-semibold"
                              : "bg-emerald-50 text-emerald-600"
                        }`}
                      >
                        {event.status === "completed"
                          ? "Fechado"
                          : event.status === "live"
                            ? "● Live"
                            : "Agendado"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Popup de detalhes */}
      {selected && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4">
              <h3 className="font-bold text-lg text-slate-900">
                {selected.type === "game"
                  ? `⚽ Jogo${selected.opponent_name ? ` vs ${selected.opponent_name}` : ""}`
                  : "🏃 Treino"}
              </h3>
              <button onClick={() => setSelected(null)}>
                <X size={20} className="text-slate-400" />
              </button>
            </div>

            <div className="space-y-2 text-sm text-slate-600">
              <p>
                📅{" "}
                {format(parseISO(selected.date), "EEEE, d 'de' MMMM", {
                  locale: pt,
                })}
              </p>
              {selected.start_time && (
                <p>🕐 {selected.start_time.substring(0, 5)}</p>
              )}
              {selected.location && <p>📍 {selected.location}</p>}
              {selected.type === "game" && (
                <p>{selected.is_home ? "🏠 Casa" : "✈️ Fora"}</p>
              )}
              {selected.notes && <p>📝 {selected.notes}</p>}
              <p className="capitalize">
                Estado:{" "}
                <span className="font-medium text-slate-800">
                  {selected.status === "completed"
                    ? "Fechado"
                    : selected.status === "live"
                      ? "Em direto"
                      : "Agendado"}
                </span>
              </p>
            </div>

            <div className="flex gap-2 mt-6">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setSelected(null)}
              >
                Fechar
              </Button>
              <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700">
                Editar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
