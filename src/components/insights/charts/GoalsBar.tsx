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

const COLOR_FOR = "#10b981"; // emerald-500
const COLOR_AGAINST = "#f43f5e"; // rose-500

/**
 * Comparação de golos marcados vs golos sofridos (para o escopo seleccionado).
 * Para "Todas as equipas" mostra os totais do clube; para um escalão concreto,
 * mostra os totais desse escalão.
 */
export function GoalsBar({
  goalsFor,
  goalsAgainst,
  label,
}: {
  goalsFor: number;
  goalsAgainst: number;
  label: string;
}) {
  const data = [
    { kind: "Marcados", value: goalsFor, fill: COLOR_FOR },
    { kind: "Sofridos", value: goalsAgainst, fill: COLOR_AGAINST },
  ];

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
            formatter={(value) => [`${Number(value)} golos`, label]}
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
