"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { format, parseISO, isToday, isFuture } from "date-fns";
import { pt } from "date-fns/locale";
import { Loader2, Dumbbell, X, Users, Clock, MapPin } from "lucide-react";
import type { Player } from "@/types/database";

interface TrainingRow {
  id: string;
  session_date: string;
  start_time?: string;
  end_time?: string;
  title?: string;
  location?: string;
  status: string;
  age_group_id?: string;
  team_id?: string;
}

interface AttendanceSummary {
  session_id: string;
  present: number;
  absent: number;
  injured: number;
  total: number;
}

interface SessionDetail {
  session: TrainingRow;
  attendance: Record<string, { player: Player; status: string }>;
  summary: AttendanceSummary;
}

function groupByMonth(sessions: TrainingRow[]): { label: string; sessions: TrainingRow[] }[] {
  const map = new Map<string, TrainingRow[]>();
  for (const s of sessions) {
    const key = format(parseISO(s.session_date), "MMMM yyyy", { locale: pt });
    const bucket = map.get(key) ?? [];
    bucket.push(s);
    map.set(key, bucket);
  }
  return Array.from(map.entries()).map(([label, sessions]) => ({ label, sessions }));
}

export default function TrainingsPage() {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<TrainingRow[]>([]);
  const [attendance, setAttendance] = useState<AttendanceSummary[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [ageGroupId, setAgeGroupId] = useState<string | null>(null);

  const [selectedSession, setSelectedSession] = useState<SessionDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadData() {
    setLoading(true);

    const res = await fetch("/api/me/context", { cache: "no-store" });
    const ctx = await res.json().catch(() => ({}));
    if (!res.ok || !ctx?.ageGroup?.id) {
      setLoading(false);
      return;
    }

    const agId: string = (ctx.ageGroup as { id: string }).id;
    setAgeGroupId(agId);

    const [{ data: sessionData }, { data: playerData }] = await Promise.all([
      supabase
        .from("training_sessions")
        .select("id, session_date, start_time, end_time, title, location, status, age_group_id, team_id")
        .eq("age_group_id", agId)
        .order("session_date", { ascending: false })
        .order("start_time", { ascending: false }),
      supabase
        .from("players")
        .select("*")
        .eq("age_group_id", agId)
        .eq("status", "active"),
    ]);

    const rows = (sessionData as TrainingRow[]) || [];
    setSessions(rows);
    setPlayers((playerData as Player[]) || []);

    // Load attendance counts for all sessions
    if (rows.length > 0) {
      const sessionIds = rows.map((s) => s.id);
      const { data: attRows } = await supabase
        .from("attendance_records")
        .select("training_session_id, status")
        .in("training_session_id", sessionIds);

      // Build summary per session
      const summaryMap = new Map<string, AttendanceSummary>();
      const totalPlayers = (playerData as Player[])?.length ?? 0;

      for (const row of attRows || []) {
        const sid = (row as { training_session_id: string; status: string }).training_session_id;
        const st = (row as { training_session_id: string; status: string }).status;
        const s = summaryMap.get(sid) ?? { session_id: sid, present: 0, absent: 0, injured: 0, total: totalPlayers };
        if (st === "present") s.present++;
        else if (st === "absent") s.absent++;
        else if (st === "injured") s.injured++;
        summaryMap.set(sid, s);
      }

      setAttendance(Array.from(summaryMap.values()));
    }

    setLoading(false);
  }

  function getSummary(sessionId: string): AttendanceSummary | null {
    return attendance.find((a) => a.session_id === sessionId) ?? null;
  }

  async function handleSessionClick(session: TrainingRow) {
    setLoadingDetail(true);

    // Load attendance for this specific session
    const { data: attRows } = await supabase
      .from("attendance_records")
      .select("player_id, status")
      .eq("training_session_id", session.id);

    const attMap = new Map((attRows || []).map((r) => [
      (r as { player_id: string; status: string }).player_id,
      (r as { player_id: string; status: string }).status,
    ]));

    const playerMap: Record<string, { player: Player; status: string }> = {};
    for (const player of players) {
      playerMap[player.id] = {
        player,
        status: attMap.get(player.id) ?? "present",
      };
    }

    const summary: AttendanceSummary = {
      session_id: session.id,
      present: Object.values(playerMap).filter((p) => p.status === "present").length,
      absent: Object.values(playerMap).filter((p) => p.status === "absent").length,
      injured: Object.values(playerMap).filter((p) => p.status === "injured").length,
      total: players.length,
    };

    setSelectedSession({ session, attendance: playerMap, summary });
    setLoadingDetail(false);
  }

  const grouped = groupByMonth(sessions);

  if (loading) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto flex items-center justify-center py-16">
        <Loader2 size={28} className="animate-spin text-slate-400" />
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto text-center py-16">
        <Dumbbell size={40} className="text-slate-200 mx-auto mb-3" />
        <p className="text-slate-500 text-sm">Nenhum treino registado.</p>
        <p className="text-slate-400 text-xs mt-1">Adiciona treinos no Calendário.</p>
      </div>
    );
  }

  void ageGroupId; // suppress unused var warning

  return (
    <>
      <div className="p-4 md:p-8 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-slate-900 mb-6">Treinos</h1>

        <div className="space-y-6">
          {grouped.map(({ label, sessions: monthSessions }) => (
            <section key={label}>
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 capitalize">{label}</h2>
              <div className="space-y-2">
                {monthSessions.map((session) => {
                  const summary = getSummary(session.id);
                  const dt = parseISO(session.session_date);
                  const upcoming = isToday(dt) || isFuture(dt);

                  return (
                    <button
                      key={session.id}
                      onClick={() => void handleSessionClick(session)}
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
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {session.start_time && (
                            <span className="text-xs text-slate-400 flex items-center gap-0.5">
                              <Clock size={10} className="flex-shrink-0" />
                              {session.start_time.substring(0, 5)}
                            </span>
                          )}
                          {session.location && (
                            <span className="text-xs text-slate-400 flex items-center gap-0.5 truncate">
                              <MapPin size={10} className="flex-shrink-0" />
                              {session.location}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Attendance badge */}
                      {summary ? (
                        <div className="flex-shrink-0 text-right">
                          <p className="text-sm font-bold text-emerald-700">{summary.present}</p>
                          <p className="text-[10px] text-slate-400">presentes</p>
                        </div>
                      ) : (
                        <div className="flex-shrink-0">
                          <Users size={16} className="text-slate-300" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>

      {/* Detail Modal */}
      {selectedSession && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-4"
          onClick={() => setSelectedSession(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-md shadow-xl max-h-[calc(100dvh-1rem)] md:max-h-[85vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b">
              <div>
                <h3 className="font-bold text-slate-900">
                  {selectedSession.session.title || "Treino"} —{" "}
                  {format(parseISO(selectedSession.session.session_date), "d 'de' MMMM", { locale: pt })}
                </h3>
                {selectedSession.session.start_time && (
                  <p className="text-xs text-slate-500 mt-0.5">
                    {selectedSession.session.start_time.substring(0, 5)}
                    {selectedSession.session.end_time ? ` – ${selectedSession.session.end_time.substring(0, 5)}` : ""}
                    {selectedSession.session.location ? ` · ${selectedSession.session.location}` : ""}
                  </p>
                )}
              </div>
              <button onClick={() => setSelectedSession(null)}>
                <X size={20} className="text-slate-400" />
              </button>
            </div>

            {/* Summary row */}
            <div className="flex divide-x border-b">
              {[
                { label: "Presentes", value: selectedSession.summary.present, color: "text-emerald-600" },
                { label: "Ausentes", value: selectedSession.summary.absent, color: "text-red-500" },
                { label: "Lesionados", value: selectedSession.summary.injured, color: "text-orange-500" },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex-1 text-center py-3">
                  <p className={`text-xl font-bold ${color}`}>{value}</p>
                  <p className="text-xs text-slate-500">{label}</p>
                </div>
              ))}
            </div>

            {/* Player list */}
            {loadingDetail ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={20} className="animate-spin text-slate-400" />
              </div>
            ) : (
              <div className="overflow-y-auto flex-1 divide-y">
                {Object.values(selectedSession.attendance)
                  .sort((a, b) => a.player.first_name.localeCompare(b.player.first_name))
                  .map(({ player, status }) => (
                    <div key={player.id} className="flex items-center gap-3 px-5 py-3">
                      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                        status === "present" ? "bg-emerald-500" :
                        status === "absent" ? "bg-red-500" : "bg-orange-400"
                      }`} />
                      <p className="text-sm text-slate-800">
                        {player.first_name} {player.last_name}
                      </p>
                      <span className={`ml-auto text-xs font-medium ${
                        status === "present" ? "text-emerald-600" :
                        status === "absent" ? "text-red-500" : "text-orange-500"
                      }`}>
                        {status === "present" ? "Presente" : status === "absent" ? "Ausente" : "Lesionado"}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
