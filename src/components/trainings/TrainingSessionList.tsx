"use client";

import type { TrainingRow, AttendanceSummary } from "./types";
import { groupByMonth } from "./utils";
import { TrainingSessionCard } from "./TrainingSessionCard";

interface TrainingSessionListProps {
  sessions: TrainingRow[];
  getSummary: (sessionId: string) => AttendanceSummary | null;
  onSessionClick: (session: TrainingRow) => void;
  onDuplicate?: (session: TrainingRow) => void;
  variant?: "open" | "closed";
}

export function TrainingSessionList({
  sessions,
  getSummary,
  onSessionClick,
  onDuplicate,
  variant = "open",
}: TrainingSessionListProps) {
  const grouped = groupByMonth(sessions);

  if (grouped.length === 0) {
    return (
      <p className="text-sm text-slate-400 text-center py-8">
        {variant === "open"
          ? "Nenhum treino agendado."
          : "Nenhum treino fechado."}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {grouped.map(({ label, sessions: monthSessions }) => (
        <section key={label}>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 capitalize">
            {label}
          </h2>
          <div className="space-y-2">
            {monthSessions.map((session) => (
              <TrainingSessionCard
                key={session.id}
                session={session}
                summary={getSummary(session.id)}
                variant={variant}
                onSessionClick={onSessionClick}
                onDuplicate={onDuplicate}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
