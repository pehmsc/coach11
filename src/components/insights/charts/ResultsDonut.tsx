"use client";

import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

const COLOR_WIN = "#10b981"; // emerald-500
const COLOR_DRAW = "#f59e0b"; // amber-500
const COLOR_LOSS = "#f43f5e"; // rose-500

export function ResultsDonut({
  wins,
  draws,
  losses,
}: {
  wins: number;
  draws: number;
  losses: number;
}) {
  const total = wins + draws + losses;
  if (total === 0) {
    return (
      <p className="text-sm text-slate-500 text-center py-6">
        Sem jogos disputados.
      </p>
    );
  }

  const data = [
    { name: "Vitórias", value: wins, color: COLOR_WIN },
    { name: "Empates", value: draws, color: COLOR_DRAW },
    { name: "Derrotas", value: losses, color: COLOR_LOSS },
  ].filter((d) => d.value > 0);

  return (
    <div className="h-44 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="35%"
            innerRadius="55%"
            outerRadius="85%"
            paddingAngle={1}
            stroke="#fff"
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value, name) => {
              const n = Number(value);
              return [
                `${n} (${Math.round((n / total) * 100)}%)`,
                String(name ?? ""),
              ];
            }}
            contentStyle={{
              fontSize: 12,
              borderRadius: 8,
              border: "1px solid #e2e8f0",
            }}
          />
          <Legend
            layout="vertical"
            align="right"
            verticalAlign="middle"
            iconType="square"
            wrapperStyle={{ fontSize: 11, paddingLeft: 8 }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
