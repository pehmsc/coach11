"use client";

import { PLAYER_STATUS_CONFIG } from "./status-config";

/**
 * Shape devolvido pela RPC get_player_season_stats. Apenas os campos
 * usados na UI; outros podem existir mas são ignorados.
 */
export interface PlayerSeasonStats {
  player_id: string;
  games_convoked: number | null;
  games_started: number | null;
  games_substitute: number | null;
  total_minutes: number | null;
  goals: number | null;
  assists: number | null;
  yellow_cards: number | null;
  red_cards: number | null;
  own_goals: number | null;
  avg_rating: number | null;
  attendance_total: number | null;
  attendance_present: number | null;
  attendance_rate: number | null;
}

interface PlayerStatsGroupProps {
  stats: PlayerSeasonStats | null;
  status: string;
}

function fmt(n: number | null | undefined, fallback = "0"): string {
  if (n === null || n === undefined) return fallback;
  return String(n);
}

function fmtRating(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toFixed(1);
}

function fmtRate(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  // attendance_rate da RPC vem em percentagem (0..100, numeric(5,2)).
  return `${Math.round(n)}%`;
}

interface TileProps {
  label: string;
  value: string | number;
  hint?: string;
}

function Tile({ label, value, hint }: TileProps) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

export function PlayerStatsGroup({ stats, status }: PlayerStatsGroupProps) {
  const statusConfig =
    PLAYER_STATUS_CONFIG[status] ?? PLAYER_STATUS_CONFIG.active;

  if (!stats) {
    return (
      <section>
        <h2 className="mb-3 text-sm font-bold text-slate-900">Estatísticas</h2>
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-6 text-center">
          <p className="text-sm text-slate-500">
            Sem dados para a época actual.
          </p>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-slate-500">Estado disciplinar:</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusConfig.color}`}
          >
            {statusConfig.label}
          </span>
        </div>
      </section>
    );
  }

  return (
    <section>
      <h2 className="mb-3 text-sm font-bold text-slate-900">Estatísticas</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        <Tile label="Convocatórias" value={fmt(stats.games_convoked)} />
        <Tile
          label="Titular / Suplente"
          value={`${fmt(stats.games_started)} / ${fmt(stats.games_substitute)}`}
        />
        <Tile
          label="Minutos"
          value={fmt(stats.total_minutes)}
          hint="totais"
        />
        <Tile label="Golos" value={fmt(stats.goals)} />
        <Tile label="Assistências" value={fmt(stats.assists)} />
        <Tile label="Amarelos" value={fmt(stats.yellow_cards)} />
        <Tile label="Vermelhos" value={fmt(stats.red_cards)} />
        <Tile label="Auto-golos" value={fmt(stats.own_goals)} />
        <Tile label="Avaliação média" value={fmtRating(stats.avg_rating)} />
        <Tile
          label="Presença em treinos"
          value={fmtRate(stats.attendance_rate)}
          hint={
            stats.attendance_total
              ? `${stats.attendance_present ?? 0} / ${stats.attendance_total}`
              : undefined
          }
        />
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span className="text-xs text-slate-500">Estado disciplinar:</span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusConfig.color}`}
        >
          {statusConfig.label}
        </span>
      </div>
    </section>
  );
}
