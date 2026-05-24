"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const COLOR_DONE = "#10b981"; // emerald-500
const COLOR_REMAINING = "#cbd5e1"; // slate-300

/**
 * Sessões de treino concluídas vs planeadas (gap visual rápido).
 */
export function TrainingsBar({
  completed,
  total,
}: {
  completed: number;
  total: number;
}) {
  const remaining = Math.max(0, total - completed);
  const data = [
    { kind: "Concluídos", value: completed, fill: COLOR_DONE },
    { kind: "Por realizar", value: remaining, fill: COLOR_REMAINING },
  ];

  if (total === 0) {
    return (
      <p className="text-sm text-slate-500 text-center py-6">
        Sem treinos planeados.
      </p>
    );
  }

  return (
    <div className="h-44 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey="kind"
            tick={{ fontSize: 11, fill: "#64748b" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11, fill: "#64748b" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "rgba(148, 163, 184, 0.08)" }}
            contentStyle={{
              fontSize: 12,
              borderRadius: 8,
              border: "1px solid #e2e8f0",
            }}
            formatter={(value, name) => [
              `${Number(value)} sessões`,
              String(name ?? ""),
            ]}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={64}>
            {data.map((d) => (
              <Cell key={d.kind} fill={d.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
