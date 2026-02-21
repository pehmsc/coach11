"use client";

import { useState, useEffect, useMemo } from "react";
import { BarChart2, AlertTriangle, Users, Trophy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { Player } from "@/types/database";

// ── Types ──────────────────────────────────────────────────────────────────

interface AttendanceStats {
  player: Player;
  presencas: number;
  ausencias: number;
  lesionados: number;
  minutos: number; // presencas * 60
}

interface GameStats {
  player: Player;
  golos: number;
  autoGolos: number;
  assistencias: number;
  minutos: number;
  gs: number;
  titular: number;
  suplente: number;
  convocatorias: number;
  mvp: number;
  amarelos: number;
  vermelhos: number;
  totalJogos: number; // jogos com is_finalized
  mediaNotaSum: number;
  mediaNotaCount: number;
}

type Tab = "attendance" | "game";

// ── API helpers ──────────────────────────────────────────────────────────────

interface ContextResponse {
  ageGroupId?: string;
  ageGroup?: { id: string } | null;
  teamId?: string;
  error?: string;
}

interface AttendanceRow {
  player_id: string;
  status: string;
}

interface FinalStatRow {
  player_id: string;
  goals?: number;
  own_goals?: number;
  assists?: number;
  minutes_played?: number;
  lineup_type?: string;
  yellow_cards?: number;
  red_cards?: number;
  coach_rating?: number;
  is_mvp?: boolean;
  is_finalized?: boolean;
  game_id?: string;
}

interface ConvocationPlayerRow {
  player_id: string;
  convocation_id: string;
}

interface ConvocationRow {
  id: string;
  game_id: string;
}

interface GameEventRow {
  game_id: string;
  player_id: string | null;
  event_type: string;
  is_opponent_event: boolean;
}

function isGoalkeeper(player: Player | undefined) {
  if (!player?.preferred_position) return false;
  return /gr|gk|guarda/i.test(player.preferred_position);
}

// ── Component ────────────────────────────────────────────────────────────────

export default function StatisticsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("attendance");
  const [loading, setLoading] = useState(true);
  const [ageGroupId, setAgeGroupId] = useState<string | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [attendanceStats, setAttendanceStats] = useState<AttendanceStats[]>([]);
  const [gameStats, setGameStats] = useState<GameStats[]>([]);

  useEffect(() => {
    void loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      // Get age group context (works for both coordinators and coaches)
      const ctxRes = await fetch("/api/me/context", { cache: "no-store", credentials: "include" });
      const ctx = (await ctxRes.json().catch(() => ({}))) as ContextResponse;
      const agId = ctx.ageGroupId ?? ctx.ageGroup?.id ?? null;
      if (!agId) { setLoading(false); return; }
      setAgeGroupId(agId);

      // Fetch players
      const playersRes = await fetch(`/api/statistics/players?ageGroupId=${agId}`, {
        credentials: "include",
      });
      const playersData = await playersRes.json().catch(() => ({ players: [] })) as {
        players?: Player[];
        attendanceRows?: AttendanceRow[];
        finalStats?: FinalStatRow[];
        convocations?: ConvocationRow[];
        convocationPlayers?: ConvocationPlayerRow[];
        gameIds?: string[];
        gameEvents?: GameEventRow[];
      };

      const rawPlayers = playersData.players ?? [];
      setPlayers(rawPlayers);

      // ── Attendance ──
      const attRows = playersData.attendanceRows ?? [];
      const attMap = new Map<string, AttendanceStats>();
      rawPlayers.forEach((p) => {
        attMap.set(p.id, { player: p, presencas: 0, ausencias: 0, lesionados: 0, minutos: 0 });
      });
      attRows.forEach((r) => {
        const entry = attMap.get(r.player_id);
        if (!entry) return;
        if (r.status === "present") entry.presencas++;
        else if (r.status === "absent") entry.ausencias++;
        else if (r.status === "injured") entry.lesionados++;
      });
      attMap.forEach((entry) => { entry.minutos = entry.presencas * 60; });
      setAttendanceStats(Array.from(attMap.values()));

      // ── Game stats ──
      const finalStats = playersData.finalStats ?? [];
      const convocations = playersData.convocations ?? [];
      const convPlayers = playersData.convocationPlayers ?? [];

      // Build: player → set of game_ids convocated
      const convGameIdsByPlayer = new Map<string, Set<string>>();
      // convocation_id → game_id
      const convGameMap = new Map<string, string>();
      convocations.forEach((c) => convGameMap.set(c.id, c.game_id));

      convPlayers.forEach((cp) => {
        const gameId = convGameMap.get(cp.convocation_id);
        if (!gameId) return;
        if (!convGameIdsByPlayer.has(cp.player_id)) {
          convGameIdsByPlayer.set(cp.player_id, new Set());
        }
        convGameIdsByPlayer.get(cp.player_id)!.add(gameId);
      });

      const gsMap = new Map<string, GameStats>();
      rawPlayers.forEach((p) => {
        gsMap.set(p.id, {
          player: p,
          golos: 0,
          autoGolos: 0,
          assistencias: 0,
          minutos: 0,
          gs: 0,
          titular: 0,
          suplente: 0,
          convocatorias: convGameIdsByPlayer.get(p.id)?.size ?? 0,
          mvp: 0,
          amarelos: 0,
          vermelhos: 0,
          totalJogos: 0,
          mediaNotaSum: 0,
          mediaNotaCount: 0,
        });
      });

      finalStats
        .filter((s) => s.is_finalized)
        .forEach((s) => {
          const entry = gsMap.get(s.player_id);
          if (!entry) return;
          entry.golos += s.goals ?? 0;
          entry.autoGolos += s.own_goals ?? 0;
          entry.assistencias += s.assists ?? 0;
          entry.minutos += s.minutes_played ?? 0;
          entry.amarelos += s.yellow_cards ?? 0;
          entry.vermelhos += s.red_cards ?? 0;
          if (s.lineup_type === "starter") entry.titular++;
          else entry.suplente++;
          if (s.is_mvp) entry.mvp++;
          if (s.coach_rating !== null && s.coach_rating !== undefined) {
            entry.mediaNotaSum += s.coach_rating;
            entry.mediaNotaCount++;
          }
          entry.totalJogos++;
        });

      // GS (golos sofridos):
      // 1) Regra principal: usar player_id do evento adversário (is_opponent_event=true).
      // 2) Fallback: quando não há player_id, atribuir ao GR com mais minutos nesse jogo.
      const gameEvents = playersData.gameEvents ?? [];
      const playerById = new Map(rawPlayers.map((player) => [player.id, player]));

      // game_id -> goalkeeper with most minutes (fallback only)
      const fallbackGoalkeeperByGame = new Map<string, string>();
      const finalizedRows = finalStats.filter((row) => row.is_finalized);
      const rowsByGame = new Map<string, FinalStatRow[]>();
      finalizedRows.forEach((row) => {
        if (!row.game_id) return;
        if (!rowsByGame.has(row.game_id)) rowsByGame.set(row.game_id, []);
        rowsByGame.get(row.game_id)!.push(row);
      });
      rowsByGame.forEach((rows, gameId) => {
        const bestGk = [...rows]
          .filter((row) => {
            const player = playerById.get(row.player_id);
            return isGoalkeeper(player);
          })
          .sort((a, b) => (b.minutes_played ?? 0) - (a.minutes_played ?? 0))[0];
        if (bestGk?.player_id) {
          fallbackGoalkeeperByGame.set(gameId, bestGk.player_id);
        }
      });

      const isConcededEvent = (event: GameEventRow) =>
        event.is_opponent_event &&
        (event.event_type === "goal" || event.event_type === "penalty_goal");

      gameEvents.filter(isConcededEvent).forEach((event) => {
        const directPlayerId =
          typeof event.player_id === "string" && event.player_id.length > 0
            ? event.player_id
            : null;
        const targetPlayerId =
          directPlayerId ?? fallbackGoalkeeperByGame.get(event.game_id) ?? null;
        if (!targetPlayerId) return;
        const entry = gsMap.get(targetPlayerId);
        if (!entry) return;
        entry.gs += 1;
      });

      setGameStats(Array.from(gsMap.values()));
    } finally {
      setLoading(false);
    }
  }

  // Yellow card alerts
  const yellowAlerts = useMemo(
    () => gameStats.filter((s) => s.amarelos >= 3),
    [gameStats],
  );

  // ── Sorting for game stats ──
  const sortedGameStats = useMemo(
    () =>
      [...gameStats].sort(
        (a, b) => b.golos - a.golos || b.assistencias - a.assistencias || b.minutos - a.minutos,
      ),
    [gameStats],
  );

  const sortedAttendance = useMemo(
    () =>
      [...attendanceStats].sort(
        (a, b) => b.presencas - a.presencas || a.player.first_name.localeCompare(b.player.first_name),
      ),
    [attendanceStats],
  );

  // ── Render ──

  if (loading) {
    return (
      <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!ageGroupId || players.length === 0) {
    return (
      <div className="p-4 md:p-8 text-center py-16">
        <BarChart2 size={40} className="text-slate-300 mx-auto mb-3" />
        <p className="text-slate-700 font-semibold mb-2">Sem dados disponíveis</p>
        <p className="text-slate-500 text-sm">
          Adiciona jogadores ao plantel para ver estatísticas.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Estatísticas</h1>
      </div>

      {/* Yellow card alert — only shown in game tab */}
      {activeTab === "game" && yellowAlerts.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-3">
              <AlertTriangle size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-900 text-sm">Alerta de cartões amarelos</p>
                <p className="text-amber-700 text-xs mt-0.5">
                  {yellowAlerts
                    .map((s) => `${s.player.first_name} ${s.player.last_name} (${s.amarelos}🟨)`)
                    .join(", ")}{" "}
                  — próximo do limite de suspensão.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
        <button
          onClick={() => setActiveTab("attendance")}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
            activeTab === "attendance"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          <Users size={15} /> Mapa de Presenças
        </button>
        <button
          onClick={() => setActiveTab("game")}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
            activeTab === "game"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          <Trophy size={15} /> Estatísticas de Jogo
        </button>
      </div>

      {/* ── TAB: MAPA DE PRESENÇAS ── */}
      {activeTab === "attendance" && (
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
                  <th className="text-left pb-2 font-medium">Jogador</th>
                  <th className="text-center pb-2 font-medium px-2 whitespace-nowrap">Min</th>
                  <th className="text-center pb-2 font-medium px-2 whitespace-nowrap">✅ Pres.</th>
                  <th className="text-center pb-2 font-medium px-2 whitespace-nowrap">❌ Aus.</th>
                  <th className="text-center pb-2 font-medium px-2 whitespace-nowrap">🤕 Les.</th>
                </tr>
              </thead>
              <tbody>
                {sortedAttendance.map((s) => (
                  <tr key={s.player.id} className="border-b border-slate-50 last:border-0">
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
      )}

      {/* ── TAB: ESTATÍSTICAS DE JOGO ── */}
      {activeTab === "game" && (
        <>
          {/* Quick totals */}
          <div className="grid grid-cols-3 gap-3">
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <p className="text-2xl font-black text-slate-900">
                  {gameStats.reduce((s, p) => s + p.golos, 0)}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">Golos</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <p className="text-2xl font-black text-slate-900">
                  {gameStats.reduce((s, p) => s + p.assistencias, 0)}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">Assistências</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <p className="text-2xl font-black text-slate-900">
                  {gameStats.length > 0 ? Math.max(...gameStats.map((s) => s.totalJogos)) : 0}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">Jogos</p>
              </CardContent>
            </Card>
          </div>

          {/* Full stats table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Trophy size={16} className="text-amber-500" /> Plantel completo
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-100">
                    <th className="text-left pb-2 font-medium text-sm">Jogador</th>
                    <th className="text-center pb-2 font-medium px-1.5" title="Golos">⚽</th>
                    <th className="text-center pb-2 font-medium px-1.5" title="Golos Sofridos">GS</th>
                    <th className="text-center pb-2 font-medium px-1.5" title="Assistências">🅰️</th>
                    <th className="text-center pb-2 font-medium px-1.5 whitespace-nowrap" title="Minutos totais">Min</th>
                    <th className="text-center pb-2 font-medium px-1.5" title="Jogos como titular">T</th>
                    <th className="text-center pb-2 font-medium px-1.5" title="Jogos como suplente">S</th>
                    <th className="text-center pb-2 font-medium px-1.5" title="Convocatórias">Conv</th>
                    <th className="text-center pb-2 font-medium px-1.5" title="MVP">⭐</th>
                    <th className="text-center pb-2 font-medium px-1.5 whitespace-nowrap" title="Média MVP">%MVP</th>
                    <th className="text-center pb-2 font-medium px-1.5 whitespace-nowrap" title="Média Nota">Nota</th>
                    <th className="text-center pb-2 font-medium px-1.5 whitespace-nowrap" title="Média minutos/jogo">Min/J</th>
                    <th className="text-center pb-2 font-medium px-1.5" title="Cartões Amarelos">🟨</th>
                    <th className="text-center pb-2 font-medium px-1.5" title="Cartões Vermelhos">🟥</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedGameStats.map((s) => {
                    const mediaMVP =
                      s.totalJogos > 0
                        ? ((s.mvp / s.totalJogos) * 100).toFixed(0)
                        : "—";
                    const mediaNota =
                      s.mediaNotaCount > 0
                        ? (s.mediaNotaSum / s.mediaNotaCount).toFixed(1)
                        : "—";
                    const mediaMin =
                      s.totalJogos > 0
                        ? (s.minutos / s.totalJogos).toFixed(0)
                        : "—";

                    return (
                      <tr
                        key={s.player.id}
                        className="border-b border-slate-50 last:border-0"
                      >
                        <td className="py-2 font-medium text-slate-800 text-sm">
                          <span className="block truncate max-w-[100px]">
                            {s.player.first_name} {s.player.last_name}
                          </span>
                        </td>
                        <td className="py-2 text-center font-bold text-slate-900 px-1.5">
                          {s.golos || "—"}
                        </td>
                        <td className="py-2 text-center px-1.5">
                          {isGoalkeeper(s.player) ? (
                            <span className={s.gs > 0 ? "font-semibold text-rose-600" : "text-slate-400"}>
                              {s.gs || "0"}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="py-2 text-center text-slate-600 px-1.5">
                          {s.assistencias || "—"}
                        </td>
                        <td className="py-2 text-center text-slate-500 px-1.5 font-mono">
                          {s.minutos || "—"}
                        </td>
                        <td className="py-2 text-center text-emerald-600 px-1.5">
                          {s.titular || "—"}
                        </td>
                        <td className="py-2 text-center text-slate-500 px-1.5">
                          {s.suplente || "—"}
                        </td>
                        <td className="py-2 text-center text-slate-500 px-1.5">
                          {s.convocatorias || "—"}
                        </td>
                        <td className="py-2 text-center text-amber-500 px-1.5">
                          {s.mvp || "—"}
                        </td>
                        <td className="py-2 text-center text-slate-500 px-1.5">
                          {mediaMVP === "—" ? "—" : `${mediaMVP}%`}
                        </td>
                        <td className="py-2 text-center px-1.5">
                          <span
                            className={
                              mediaNota !== "—" && parseFloat(mediaNota) >= 7
                                ? "font-bold text-emerald-600"
                                : mediaNota !== "—" && parseFloat(mediaNota) < 5
                                  ? "text-red-500"
                                  : "text-slate-600"
                            }
                          >
                            {mediaNota}
                          </span>
                        </td>
                        <td className="py-2 text-center text-slate-500 px-1.5 font-mono">
                          {mediaMin}
                        </td>
                        <td
                          className={`py-2 text-center px-1.5 ${
                            s.amarelos >= 3 ? "font-bold text-amber-600" : "text-slate-500"
                          }`}
                        >
                          {s.amarelos || "—"}
                        </td>
                        <td className="py-2 text-center text-red-600 px-1.5">
                          {s.vermelhos || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
