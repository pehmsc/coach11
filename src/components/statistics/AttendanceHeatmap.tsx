"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface DayAttendance {
  date: string;
  present: number;
  late: number;
  absent: number;
  injured: number;
  total: number;
}

interface AttendanceHeatmapProps {
  dailyData: DayAttendance[];
}

const WEEKDAY_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const days: (string | null)[] = [];

  // Pad start (Monday = 0)
  let startPad = firstDay.getDay() - 1;
  if (startPad < 0) startPad = 6;
  for (let i = 0; i < startPad; i++) days.push(null);

  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    days.push(dateStr);
  }

  return days;
}

function getPresenceRate(day: DayAttendance | undefined): number | null {
  if (!day || day.total === 0) return null;
  return (day.present + day.late) / day.total;
}

function getCellColor(rate: number | null, hasData: boolean): string {
  if (!hasData || rate === null) return "bg-slate-50";
  if (rate >= 0.9) return "bg-emerald-500";
  if (rate >= 0.75) return "bg-emerald-400";
  if (rate >= 0.6) return "bg-amber-400";
  if (rate >= 0.4) return "bg-orange-400";
  return "bg-red-400";
}

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export function AttendanceHeatmap({ dailyData }: AttendanceHeatmapProps) {
  const today = useMemo(() => new Date(), []);
  const [monthOffset, setMonthOffset] = useState(0);

  const { year, month } = useMemo(() => {
    const d = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  }, [today, monthOffset]);

  const days = useMemo(() => getMonthDays(year, month), [year, month]);

  const dataByDate = useMemo(() => {
    const map = new Map<string, DayAttendance>();
    dailyData.forEach((d) => map.set(d.date, d));
    return map;
  }, [dailyData]);

  const monthLabel = `${MONTH_NAMES[month]} ${year}`;

  // Split days into weeks
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }
  // Pad last week
  const lastWeek = weeks[weeks.length - 1];
  while (lastWeek && lastWeek.length < 7) lastWeek.push(null);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Mapa Mensal de Presenças</CardTitle>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMonthOffset((o) => o - 1)}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-medium text-slate-700 min-w-[130px] text-center">
              {monthLabel}
            </span>
            <button
              type="button"
              onClick={() => setMonthOffset((o) => o + 1)}
              disabled={monthOffset >= 0}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 disabled:opacity-30"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="text-center text-[10px] font-medium text-slate-400">
              {label}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="space-y-1">
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 gap-1">
              {week.map((dateStr, di) => {
                if (!dateStr) {
                  return <div key={`empty-${wi}-${di}`} className="aspect-square rounded-md bg-transparent" />;
                }
                const dayData = dataByDate.get(dateStr);
                const rate = getPresenceRate(dayData);
                const hasData = !!dayData && dayData.total > 0;
                const dayNum = parseInt(dateStr.split("-")[2], 10);
                const isToday = dateStr === today.toISOString().slice(0, 10);

                return (
                  <div
                    key={dateStr}
                    className={`aspect-square rounded-md flex items-center justify-center text-[10px] font-medium relative ${getCellColor(rate, hasData)} ${
                      hasData ? "text-white" : "text-slate-400"
                    } ${isToday ? "ring-2 ring-slate-900 ring-offset-1" : ""}`}
                    title={
                      hasData && dayData
                        ? `${dateStr}: ${dayData.present} pres, ${dayData.late} atr, ${dayData.absent} aus, ${dayData.injured} les`
                        : dateStr
                    }
                  >
                    {dayNum}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 mt-3 text-[10px] text-slate-500">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-emerald-500" />
            <span>&gt;90%</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-emerald-400" />
            <span>75-90%</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-amber-400" />
            <span>60-75%</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-orange-400" />
            <span>40-60%</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-red-400" />
            <span>&lt;40%</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-slate-50 border border-slate-200" />
            <span>Sem treino</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
