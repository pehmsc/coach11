"use client";

import type { LivePlayer } from "./types";

interface PreMatchLineupProps {
  convocatedPlayers: LivePlayer[];
  playersOnField: LivePlayer[];
  playersAvailableToEnter: LivePlayer[];
  hasExternalConvocatedPlayers: boolean;
  savingLineup: string | null;
  startingFirstHalf: boolean;
  toggleLineup: (playerId: string) => void;
}

export function PreMatchLineup({
  convocatedPlayers,
  playersOnField,
  playersAvailableToEnter,
  hasExternalConvocatedPlayers,
  savingLineup,
  startingFirstHalf,
  toggleLineup,
}: PreMatchLineupProps) {
  return (
    <>
      {hasExternalConvocatedPlayers && (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          Os jogadores &quot;Outro&quot; entram normalmente na live e nos eventos do jogo, mas
          não geram estatísticas individuais persistentes no escalão.
        </div>
      )}
      <div className="mb-5 rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div>
            <p className="font-bold text-slate-900 text-sm">Escalação inicial</p>
            <p className="text-xs text-slate-500">Toca para alternar Titular / Banco</p>
          </div>
          <div className="text-right">
            <span className="text-sm font-bold text-emerald-600">{playersOnField.length}</span>
            <span className="text-xs text-slate-400"> titulares</span>
            {playersAvailableToEnter.length > 0 && (
              <>
                <span className="text-slate-300 mx-1">·</span>
                <span className="text-sm font-bold text-slate-500">
                  {playersAvailableToEnter.length}
                </span>
                <span className="text-xs text-slate-400"> banco</span>
              </>
            )}
          </div>
        </div>
        <div className="divide-y divide-slate-50">
          {convocatedPlayers.map((player) => (
            <button
              key={player.id}
              onClick={() => toggleLineup(player.id)}
              disabled={savingLineup === player.id || startingFirstHalf}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                player.isOnField
                  ? "bg-emerald-50 hover:bg-emerald-100"
                  : "bg-white hover:bg-slate-50"
              }`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  player.isOnField ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-400"
                }`}
              >
                {player.jersey_number || "—"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">
                  {player.first_name} {player.last_name}
                </p>
                {player.preferred_position && (
                  <p className="text-xs text-slate-400">{player.preferred_position}</p>
                )}
                {player.isExternal && (
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-600">
                    Outro
                  </p>
                )}
              </div>
              <span
                className={`text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${
                  player.isOnField
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {savingLineup === player.id ? "..." : player.isOnField ? "Titular" : "Banco"}
              </span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
