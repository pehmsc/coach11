"use client";

import { Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AttendanceSortKey, AttendanceStats, SortDir } from "./types";
import { SortIcon } from "./SortIcon";

interface AttendanceTableProps {
  sortedAttendance: AttendanceStats[];
  attendanceSort: { key: AttendanceSortKey; dir: SortDir };
  toggleAttendanceSort: (key: AttendanceSortKey) => void;
  allCurrentTabSelected: boolean;
  toggleSelectAllCurrentTab: () => void;
  selectedPlayerIds: Set<string>;
  toggleSelectedPlayer: (playerId: string) => void;
}

export function AttendanceTable({
  sortedAttendance,
  attendanceSort,
  toggleAttendanceSort,
  allCurrentTabSelected,
  toggleSelectAllCurrentTab,
  selectedPlayerIds,
  toggleSelectedPlayer,
}: AttendanceTableProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Users size={16} className="text-slate-500" /> Mapa de Presenças
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-400 border-b border-slate-100">
              <th className="pb-2 pr-2 text-center font-medium">
                <input
                  type="checkbox"
                  checked={allCurrentTabSelected}
                  onChange={toggleSelectAllCurrentTab}
                  aria-label="Selecionar todos os atletas do mapa de presenças"
                  className="h-4 w-4 rounded border-slate-300 text-slate-900"
                />
              </th>
              <th className="text-left pb-2 font-medium">
                <button
                  type="button"
                  onClick={() => toggleAttendanceSort("player")}
                  className="inline-flex items-center gap-1"
                >
                  Jogador
                  <SortIcon
                    active={attendanceSort.key === "player"}
                    dir={attendanceSort.dir}
                  />
                </button>
              </th>
              <th className="text-center pb-2 font-medium px-2 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => toggleAttendanceSort("minutos")}
                  className="inline-flex items-center gap-1"
                >
                  Min
                  <SortIcon
                    active={attendanceSort.key === "minutos"}
                    dir={attendanceSort.dir}
                  />
                </button>
              </th>
              <th className="text-center pb-2 font-medium px-2 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => toggleAttendanceSort("presencas")}
                  className="inline-flex items-center gap-1"
                >
                  ✅ Pres.
                  <SortIcon
                    active={attendanceSort.key === "presencas"}
                    dir={attendanceSort.dir}
                  />
                </button>
              </th>
              <th className="text-center pb-2 font-medium px-2 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => toggleAttendanceSort("atrasados")}
                  className="inline-flex items-center gap-1"
                >
                  ⏰ Atr.
                  <SortIcon
                    active={attendanceSort.key === "atrasados"}
                    dir={attendanceSort.dir}
                  />
                </button>
              </th>
              <th className="text-center pb-2 font-medium px-2 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => toggleAttendanceSort("ausencias")}
                  className="inline-flex items-center gap-1"
                >
                  ❌ Aus.
                  <SortIcon
                    active={attendanceSort.key === "ausencias"}
                    dir={attendanceSort.dir}
                  />
                </button>
              </th>
              <th className="text-center pb-2 font-medium px-2 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => toggleAttendanceSort("lesionados")}
                  className="inline-flex items-center gap-1"
                >
                  🤕 Les.
                  <SortIcon
                    active={attendanceSort.key === "lesionados"}
                    dir={attendanceSort.dir}
                  />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedAttendance.map((s) => (
              <tr key={s.player.id} className="border-b border-slate-50 last:border-0">
                <td className="py-2 pr-2 text-center">
                  <input
                    type="checkbox"
                    checked={selectedPlayerIds.has(s.player.id)}
                    onChange={() => toggleSelectedPlayer(s.player.id)}
                    aria-label={`Selecionar ${s.player.first_name} ${s.player.last_name}`}
                    className="h-4 w-4 rounded border-slate-300 text-slate-900"
                  />
                </td>
                <td className="py-2 font-medium text-slate-800 truncate max-w-[130px]">
                  <span className="block truncate">
                    {s.player.first_name} {s.player.last_name}
                  </span>
                  {s.player.preferred_position && (
                    <span className="text-xs text-slate-400">{s.player.preferred_position}</span>
                  )}
                </td>
                <td className="py-2 text-center text-slate-500 px-2 font-mono text-xs">
                  {s.minutos}
                </td>
                <td className="py-2 text-center font-bold text-emerald-600 px-2">
                  {s.presencas || "—"}
                </td>
                <td className="py-2 text-center text-amber-600 px-2">
                  {s.atrasados || "—"}
                </td>
                <td className="py-2 text-center text-red-500 px-2">
                  {s.ausencias || "—"}
                </td>
                <td className="py-2 text-center text-orange-500 px-2">
                  {s.lesionados || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
