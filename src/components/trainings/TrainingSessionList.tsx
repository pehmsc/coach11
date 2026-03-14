"use client";

import { useState } from "react";
import type { TrainingRow, AttendanceSummary } from "./types";
import { groupByMonth, isTrainingClosed } from "./utils";
import { TrainingSessionCard } from "./TrainingSessionCard";

interface TrainingSessionListProps {
  sessions: TrainingRow[];
  getSummary: (sessionId: string) => AttendanceSummary | null;
  onSessionClick: (session: TrainingRow) => void;
  onDuplicate: (session: TrainingRow) => void;
}

export function TrainingSessionList({
  sessions,
  getSummary,
  onSessionClick,
  onDuplicate,
}: TrainingSessionListProps) {
  const [closedSessionsExpanded, setClosedSessionsExpanded] = useState(false);

  const openSessions = sessions.filter((session) => !isTrainingClosed(session));
  const closedSessions = sessions.filter((session) => isTrainingClosed(session));
  const groupedOpenSessions = groupByMonth(openSessions);
  const groupedClosedSessions = groupByMonth(closedSessions);

  return (
    <div className="space-y-6">
      {groupedOpenSessions.map(({ label, sessions: monthSessions }) => (
        <section key={label}>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 capitalize">{label}</h2>
          <div className="space-y-2">
            {monthSessions.map((session) => (
              <TrainingSessionCard
                key={session.id}
                session={session}
                summary={getSummary(session.id)}
                variant="open"
                onSessionClick={onSessionClick}
                onDuplicate={onDuplicate}
              />
            ))}
          </div>
        </section>
      ))}

      <section className="rounded-2xl border border-slate-200 bg-white">
        <button
          type="button"
          onClick={() => setClosedSessionsExpanded((current) => !current)}
          className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
        >
          <div>
            <p className="text-sm font-semibold text-slate-900">
              Treinos Fechados
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {closedSessions.length} treino{closedSessions.length !== 1 ? "s" : ""} fechado{closedSessions.length !== 1 ? "s" : ""}
            </p>
          </div>
          <span className="text-xs font-medium text-slate-500">
            {closedSessionsExpanded ? "Fechar" : "Expandir"}
          </span>
        </button>

        {closedSessionsExpanded && (
          <div className="space-y-6 border-t border-slate-100 px-4 py-4">
            {groupedClosedSessions.length === 0 ? (
              <p className="text-sm text-slate-500">Ainda não existem treinos fechados.</p>
            ) : (
              groupedClosedSessions.map(({ label, sessions: monthSessions }) => (
                <section key={`closed-${label}`}>
                  <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 capitalize">
                    {label}
                  </h2>
                  <div className="space-y-2">
                    {monthSessions.map((session) => (
                      <TrainingSessionCard
                        key={session.id}
                        session={session}
                        summary={getSummary(session.id)}
                        variant="closed"
                        onSessionClick={onSessionClick}
                      />
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>
        )}
      </section>
    </div>
  );
}
