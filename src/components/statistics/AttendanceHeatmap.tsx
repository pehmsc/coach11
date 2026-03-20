"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { format, parse } from "date-fns";
import { pt } from "date-fns/locale";

type Session = { id: string; date: string; time: string | null };
type AttendanceRow = { sessionId: string; playerId: string; status: string };
type Player = { id: string; name: string; number: number | null };

const STATUS_COLORS: Record<string, string> = {
  present: "bg-emerald-500 text-white",
  late: "bg-amber-400 text-white",
  absent: "bg-red-500 text-white",
  injured: "bg-orange-400 text-white",
};

const STATUS_LABELS: Record<string, string> = {
  present: "P",
  late: "AT",
  absent: "A",
  injured: "L",
};

export function AttendanceHeatmap({ ageGroupId }: { ageGroupId: string | null }) {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);

  const fetchData = useCallback(async () => {
    if (!ageGroupId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/statistics/attendance-daily?ageGroupId=${ageGroupId}&month=${month}`,
      );
      if (!res.ok) {
        setLoading(false);
        return;
      }
      const data = await res.json();
      setSessions(data.sessions ?? []);
      setAttendance(data.attendance ?? []);
      setPlayers(data.players ?? []);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [ageGroupId, month]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  function changeMonth(delta: number) {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  const monthLabel = format(
    parse(month + "-01", "yyyy-MM-dd", new Date()),
    "MMMM yyyy",
    { locale: pt },
  );

  // Build lookup: playerId → sessionId → status
  const lookup = new Map<string, Map<string, string>>();
  for (const row of attendance) {
    if (!lookup.has(row.playerId)) lookup.set(row.playerId, new Map());
    lookup.get(row.playerId)!.set(row.sessionId, row.status);
  }

  // Calculate attendance rate per player
  function getRate(playerId: string): number {
    const playerMap = lookup.get(playerId);
    if (!playerMap || sessions.length === 0) return 0;
    const present = sessions.filter((s) => {
      const st = playerMap.get(s.id);
      return st === "present" || st === "late";
    }).length;
    return Math.round((present / sessions.length) * 100);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Mapa de Presenças</CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => changeMonth(-1)}>
              <ChevronLeft size={16} />
            </Button>
            <span className="text-sm font-medium text-slate-700 min-w-[120px] text-center capitalize">
              {monthLabel}
            </span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => changeMonth(1)}>
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 size={24} className="animate-spin text-slate-400" />
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">
            Sem treinos neste mês.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-xs border-collapse min-w-[400px]">
                <thead>
                  <tr>
                    <th className="text-left py-1.5 pr-2 text-slate-500 font-medium sticky left-0 bg-white z-10 min-w-[100px]">
                      Atleta
                    </th>
                    {sessions.map((s) => (
                      <th key={s.id} className="text-center py-1.5 px-0.5 text-slate-400 font-medium w-8">
                        {parseInt(s.date.split("-")[2], 10)}
                      </th>
                    ))}
                    <th className="text-center py-1.5 px-1 text-slate-500 font-medium w-12">%</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((player) => (
                    <tr key={player.id} className="border-t border-slate-50">
                      <td className="py-1 pr-2 text-slate-700 font-medium truncate max-w-[120px] sticky left-0 bg-white z-10">
                        {player.number != null && (
                          <span className="text-slate-400 mr-1">{player.number}</span>
                        )}
                        {player.name}
                      </td>
                      {sessions.map((s) => {
                        const status = lookup.get(player.id)?.get(s.id);
                        return (
                          <td key={s.id} className="text-center py-1 px-0.5">
                            {status ? (
                              <span
                                className={`inline-flex h-5 w-5 items-center justify-center rounded text-[9px] font-bold ${STATUS_COLORS[status] ?? "bg-slate-100 text-slate-400"}`}
                              >
                                {STATUS_LABELS[status] ?? "?"}
                              </span>
                            ) : (
                              <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-slate-50 text-[9px] text-slate-300">
                                -
                              </span>
                            )}
                          </td>
                        );
                      })}
                      <td className="text-center py-1 px-1">
                        <span className={`text-xs font-semibold ${getRate(player.id) >= 80 ? "text-emerald-600" : getRate(player.id) >= 50 ? "text-amber-600" : "text-red-600"}`}>
                          {getRate(player.id)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Legenda */}
            <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-slate-100">
              {Object.entries(STATUS_LABELS).map(([key, label]) => (
                <div key={key} className="flex items-center gap-1">
                  <span className={`inline-flex h-4 w-4 items-center justify-center rounded text-[8px] font-bold ${STATUS_COLORS[key]}`}>
                    {label}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {key === "present" ? "Presente" : key === "late" ? "Atrasado" : key === "absent" ? "Ausente" : "Lesionado"}
                  </span>
                </div>
              ))}
              <div className="flex items-center gap-1">
                <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-slate-50 text-[8px] text-slate-300">-</span>
                <span className="text-[10px] text-slate-500">Sem treino</span>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
