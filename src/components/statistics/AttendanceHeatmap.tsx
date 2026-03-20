"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { format, parse } from "date-fns";
import { pt } from "date-fns/locale";

type Session = { id: string; date: string; time: string | null };
type AttendanceRow = { sessionId: string; playerId: string; status: string };
type Player = { id: string; name: string; number: number | null };

const STATUS_STYLES: Record<string, string> = {
  present: "bg-green-100 text-green-700",
  late: "bg-yellow-100 text-yellow-700",
  absent: "bg-red-100 text-red-700",
  injured: "bg-orange-100 text-orange-700",
};

const STATUS_LABELS: Record<string, string> = {
  present: "✓",
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

  function getPlayerRate(playerId: string): number {
    const playerMap = lookup.get(playerId);
    if (!playerMap || sessions.length === 0) return 0;
    const present = sessions.filter((s) => {
      const st = playerMap.get(s.id);
      return st === "present" || st === "late";
    }).length;
    return Math.round((present / sessions.length) * 100);
  }

  function getSessionRate(sessionId: string): number {
    if (players.length === 0) return 0;
    const present = players.filter((p) => {
      const st = lookup.get(p.id)?.get(sessionId);
      return st === "present" || st === "late";
    }).length;
    return Math.round((present / players.length) * 100);
  }

  return (
    <div className="space-y-3">
      {/* Navegação de mês */}
      <div className="flex items-center justify-center gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => changeMonth(-1)}>
          <ChevronLeft size={16} />
        </Button>
        <span className="text-sm font-semibold text-slate-800 min-w-[140px] text-center capitalize">
          {monthLabel}
        </span>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => changeMonth(1)}>
          <ChevronRight size={16} />
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 size={24} className="animate-spin text-slate-400" />
        </div>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">
          Sem treinos neste mês.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  <th className="text-left py-2 px-3 text-slate-600 font-semibold sticky left-0 bg-slate-50 z-10 min-w-[120px] border-b border-slate-200">
                    Atleta
                  </th>
                  {sessions.map((s) => {
                    const d = parse(s.date, "yyyy-MM-dd", new Date());
                    return (
                      <th key={s.id} className="text-center py-2 px-1 text-slate-500 font-medium min-w-[40px] border-b border-slate-200">
                        <div className="text-[10px] leading-tight">
                          {format(d, "d")}
                        </div>
                        <div className="text-[8px] text-slate-400 uppercase">
                          {format(d, "MMM", { locale: pt })}
                        </div>
                      </th>
                    );
                  })}
                  <th className="text-center py-2 px-2 text-slate-600 font-semibold min-w-[44px] border-b border-slate-200">
                    %
                  </th>
                </tr>
              </thead>
              <tbody>
                {players.map((player, i) => (
                  <tr key={player.id} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                    <td className="py-1.5 px-3 text-slate-700 font-medium truncate max-w-[140px] sticky left-0 z-10" style={{ backgroundColor: i % 2 === 0 ? "white" : "rgb(248 250 252 / 0.5)" }}>
                      {player.number != null && (
                        <span className="text-slate-400 tabular-nums mr-1.5">{player.number}</span>
                      )}
                      {player.name}
                    </td>
                    {sessions.map((s) => {
                      const status = lookup.get(player.id)?.get(s.id);
                      return (
                        <td key={s.id} className="text-center py-1.5 px-0.5">
                          {status ? (
                            <span
                              className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-bold ${STATUS_STYLES[status] ?? "bg-slate-100 text-slate-400"}`}
                            >
                              {STATUS_LABELS[status] ?? "?"}
                            </span>
                          ) : (
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-slate-50 text-[10px] text-slate-300">
                              —
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="text-center py-1.5 px-2">
                      {(() => {
                        const rate = getPlayerRate(player.id);
                        return (
                          <span className={`text-xs font-bold ${rate >= 80 ? "text-green-600" : rate >= 50 ? "text-amber-600" : "text-red-600"}`}>
                            {rate}%
                          </span>
                        );
                      })()}
                    </td>
                  </tr>
                ))}

                {/* Linha de totais por sessão */}
                <tr className="border-t-2 border-slate-200 bg-slate-50">
                  <td className="py-2 px-3 text-slate-600 font-semibold text-[10px] uppercase sticky left-0 bg-slate-50 z-10">
                    % Sessão
                  </td>
                  {sessions.map((s) => {
                    const rate = getSessionRate(s.id);
                    return (
                      <td key={s.id} className="text-center py-2 px-0.5">
                        <span className={`text-[10px] font-bold ${rate >= 80 ? "text-green-600" : rate >= 50 ? "text-amber-600" : "text-red-600"}`}>
                          {rate}%
                        </span>
                      </td>
                    );
                  })}
                  <td />
                </tr>
              </tbody>
            </table>
          </div>

          {/* Legenda */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1">
            {(["present", "late", "absent", "injured"] as const).map((key) => (
              <div key={key} className="flex items-center gap-1.5">
                <span className={`inline-flex h-4 w-4 items-center justify-center rounded text-[8px] font-bold ${STATUS_STYLES[key]}`}>
                  {STATUS_LABELS[key]}
                </span>
                <span className="text-[10px] text-slate-500">
                  {key === "present" ? "Presente" : key === "late" ? "Atrasado" : key === "absent" ? "Ausente" : "Lesionado"}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
