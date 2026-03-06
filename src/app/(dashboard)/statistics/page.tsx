"use client";

import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  BarChart2,
  AlertTriangle,
  Users,
  Trophy,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { Player } from "@/types/database";
import { apiFetch } from "@/lib/http/apiFetch";
import { useMeContext } from "@/lib/hooks/useMeContext";
import { queryKeys } from "@/lib/query/keys";

// ── Types ──────────────────────────────────────────────────────────────────

interface AttendanceStats {
  player: Player;
  presencas: number;
  atrasados: number;
  ausencias: number;
  lesionados: number;
  minutos: number; // (presencas + atrasados) * 60
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
type SortDir = "asc" | "desc";
type AttendanceSortKey =
  | "player"
  | "minutos"
  | "presencas"
  | "atrasados"
  | "ausencias"
  | "lesionados";
type GameSortKey =
  | "player"
  | "golos"
  | "gs"
  | "assistencias"
  | "minutos"
  | "titular"
  | "suplente"
  | "convocatorias"
  | "mvp"
  | "mediaMVP"
  | "mediaNota"
  | "mediaMin"
  | "amarelos"
  | "vermelhos";

// ── API helpers ──────────────────────────────────────────────────────────────

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

interface StatisticsPlayersResponse {
  success?: boolean;
  players?: Player[];
  attendanceRows?: AttendanceRow[];
  finalStats?: FinalStatRow[];
  convocations?: ConvocationRow[];
  convocationPlayers?: ConvocationPlayerRow[];
  gameIds?: string[];
  gameEvents?: GameEventRow[];
}

function isGoalkeeper(player: Player | undefined) {
  if (!player?.preferred_position) return false;
  return /gr|gk|guarda/i.test(player.preferred_position);
}

function comparePlayersByFirstName(a: Player, b: Player) {
  const firstNameComparison = a.first_name.localeCompare(b.first_name, "pt");
  if (firstNameComparison !== 0) return firstNameComparison;

  const lastNameComparison = a.last_name.localeCompare(b.last_name, "pt");
  if (lastNameComparison !== 0) return lastNameComparison;

  return a.id.localeCompare(b.id);
}

function defaultSortDirForAttendance(key: AttendanceSortKey): SortDir {
  return key === "player" ? "asc" : "desc";
}

function defaultSortDirForGame(key: GameSortKey): SortDir {
  return key === "player" ? "asc" : "desc";
}

function compareNullableNumber(a: number | null, b: number | null, dir: SortDir) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return dir === "asc" ? a - b : b - a;
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown size={12} className="opacity-40" />;
  return dir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function StatisticsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("attendance");
  const [attendanceSort, setAttendanceSort] = useState<{
    key: AttendanceSortKey;
    dir: SortDir;
  }>({ key: "player", dir: "asc" });
  const [gameSort, setGameSort] = useState<{
    key: GameSortKey;
    dir: SortDir;
  }>({ key: "player", dir: "asc" });
  const meContextQuery = useMeContext();
  const ageGroupId = meContextQuery.data?.ageGroup?.id ?? null;

  const statisticsQuery = useQuery({
    queryKey: ageGroupId
      ? queryKeys.statistics.players(ageGroupId)
      : [...queryKeys.statistics.root(), "players", "none"],
    queryFn: () =>
      apiFetch<StatisticsPlayersResponse>(
        `/api/statistics/players?ageGroupId=${ageGroupId}`,
      ),
    enabled: Boolean(ageGroupId),
    placeholderData: keepPreviousData,
  });

  const players = useMemo(
    () => statisticsQuery.data?.players ?? [],
    [statisticsQuery.data?.players],
  );

  const attendanceStats = useMemo(() => {
    const attRows = statisticsQuery.data?.attendanceRows ?? [];
    const attMap = new Map<string, AttendanceStats>();

    players.forEach((player) => {
      attMap.set(player.id, {
        player,
        presencas: 0,
        atrasados: 0,
        ausencias: 0,
        lesionados: 0,
        minutos: 0,
      });
    });

    attRows.forEach((row) => {
      const entry = attMap.get(row.player_id);
      if (!entry) return;
      if (row.status === "present") entry.presencas += 1;
      else if (row.status === "late") entry.atrasados += 1;
      else if (row.status === "absent") entry.ausencias += 1;
      else if (row.status === "injured") entry.lesionados += 1;
    });

    attMap.forEach((entry) => {
      entry.minutos = (entry.presencas + entry.atrasados) * 60;
    });

    return Array.from(attMap.values());
  }, [players, statisticsQuery.data?.attendanceRows]);

  const gameStats = useMemo(() => {
    const finalStats = statisticsQuery.data?.finalStats ?? [];
    const convocations = statisticsQuery.data?.convocations ?? [];
    const convocationPlayers = statisticsQuery.data?.convocationPlayers ?? [];
    const gameEvents = statisticsQuery.data?.gameEvents ?? [];

    const convGameIdsByPlayer = new Map<string, Set<string>>();
    const convocationToGame = new Map<string, string>();
    convocations.forEach((convocation) =>
      convocationToGame.set(convocation.id, convocation.game_id),
    );

    convocationPlayers.forEach((entry) => {
      const gameId = convocationToGame.get(entry.convocation_id);
      if (!gameId) return;
      if (!convGameIdsByPlayer.has(entry.player_id)) {
        convGameIdsByPlayer.set(entry.player_id, new Set());
      }
      convGameIdsByPlayer.get(entry.player_id)?.add(gameId);
    });

    const gameStatsMap = new Map<string, GameStats>();
    players.forEach((player) => {
      gameStatsMap.set(player.id, {
        player,
        golos: 0,
        autoGolos: 0,
        assistencias: 0,
        minutos: 0,
        gs: 0,
        titular: 0,
        suplente: 0,
        convocatorias: convGameIdsByPlayer.get(player.id)?.size ?? 0,
        mvp: 0,
        amarelos: 0,
        vermelhos: 0,
        totalJogos: 0,
        mediaNotaSum: 0,
        mediaNotaCount: 0,
      });
    });

    finalStats
      .filter((entry) => entry.is_finalized)
      .forEach((entry) => {
        const playerStats = gameStatsMap.get(entry.player_id);
        if (!playerStats) return;
        playerStats.golos += entry.goals ?? 0;
        playerStats.autoGolos += entry.own_goals ?? 0;
        playerStats.assistencias += entry.assists ?? 0;
        playerStats.minutos += entry.minutes_played ?? 0;
        playerStats.amarelos += entry.yellow_cards ?? 0;
        playerStats.vermelhos += entry.red_cards ?? 0;
        if (entry.lineup_type === "starter") playerStats.titular += 1;
        else playerStats.suplente += 1;
        if (entry.is_mvp) playerStats.mvp += 1;
        if (entry.coach_rating !== null && entry.coach_rating !== undefined) {
          playerStats.mediaNotaSum += entry.coach_rating;
          playerStats.mediaNotaCount += 1;
        }
        playerStats.totalJogos += 1;
      });

    const playerById = new Map(players.map((player) => [player.id, player]));
    const fallbackGoalkeeperByGame = new Map<string, string>();
    const finalizedRows = finalStats.filter((row) => row.is_finalized);
    const rowsByGame = new Map<string, FinalStatRow[]>();

    finalizedRows.forEach((row) => {
      if (!row.game_id) return;
      if (!rowsByGame.has(row.game_id)) rowsByGame.set(row.game_id, []);
      rowsByGame.get(row.game_id)?.push(row);
    });

    rowsByGame.forEach((rows, gameId) => {
      const bestGoalkeeper = [...rows]
        .filter((row) => isGoalkeeper(playerById.get(row.player_id)))
        .sort((a, b) => (b.minutes_played ?? 0) - (a.minutes_played ?? 0))[0];

      if (bestGoalkeeper?.player_id) {
        fallbackGoalkeeperByGame.set(gameId, bestGoalkeeper.player_id);
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
      const entry = gameStatsMap.get(targetPlayerId);
      if (!entry) return;
      entry.gs += 1;
    });

    return Array.from(gameStatsMap.values());
  }, [
    players,
    statisticsQuery.data?.convocationPlayers,
    statisticsQuery.data?.convocations,
    statisticsQuery.data?.finalStats,
    statisticsQuery.data?.gameEvents,
  ]);

  const loading =
    meContextQuery.isPending ||
    (Boolean(ageGroupId) && statisticsQuery.isPending && !statisticsQuery.data);

  // Yellow card alerts
  const yellowAlerts = useMemo(
    () => gameStats.filter((s) => s.amarelos >= 3),
    [gameStats],
  );

  function toggleAttendanceSort(key: AttendanceSortKey) {
    setAttendanceSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: defaultSortDirForAttendance(key) },
    );
  }

  function toggleGameSort(key: GameSortKey) {
    setGameSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: defaultSortDirForGame(key) },
    );
  }

  const sortedGameStats = useMemo(
    () => {
      const dir = gameSort.dir;
      return [...gameStats].sort((a, b) => {
        switch (gameSort.key) {
          case "player":
            return comparePlayersByFirstName(a.player, b.player);
          case "golos":
            return (dir === "asc" ? a.golos - b.golos : b.golos - a.golos) ||
              comparePlayersByFirstName(a.player, b.player);
          case "gs":
            return (dir === "asc" ? a.gs - b.gs : b.gs - a.gs) ||
              comparePlayersByFirstName(a.player, b.player);
          case "assistencias":
            return (dir === "asc"
              ? a.assistencias - b.assistencias
              : b.assistencias - a.assistencias) ||
              comparePlayersByFirstName(a.player, b.player);
          case "minutos":
            return (dir === "asc" ? a.minutos - b.minutos : b.minutos - a.minutos) ||
              comparePlayersByFirstName(a.player, b.player);
          case "titular":
            return (dir === "asc" ? a.titular - b.titular : b.titular - a.titular) ||
              comparePlayersByFirstName(a.player, b.player);
          case "suplente":
            return (dir === "asc" ? a.suplente - b.suplente : b.suplente - a.suplente) ||
              comparePlayersByFirstName(a.player, b.player);
          case "convocatorias":
            return (dir === "asc"
              ? a.convocatorias - b.convocatorias
              : b.convocatorias - a.convocatorias) ||
              comparePlayersByFirstName(a.player, b.player);
          case "mvp":
            return (dir === "asc" ? a.mvp - b.mvp : b.mvp - a.mvp) ||
              comparePlayersByFirstName(a.player, b.player);
          case "mediaMVP":
            return compareNullableNumber(
              a.totalJogos > 0 ? a.mvp / a.totalJogos : null,
              b.totalJogos > 0 ? b.mvp / b.totalJogos : null,
              dir,
            ) || comparePlayersByFirstName(a.player, b.player);
          case "mediaNota":
            return compareNullableNumber(
              a.mediaNotaCount > 0 ? a.mediaNotaSum / a.mediaNotaCount : null,
              b.mediaNotaCount > 0 ? b.mediaNotaSum / b.mediaNotaCount : null,
              dir,
            ) || comparePlayersByFirstName(a.player, b.player);
          case "mediaMin":
            return compareNullableNumber(
              a.totalJogos > 0 ? a.minutos / a.totalJogos : null,
              b.totalJogos > 0 ? b.minutos / b.totalJogos : null,
              dir,
            ) || comparePlayersByFirstName(a.player, b.player);
          case "amarelos":
            return (dir === "asc" ? a.amarelos - b.amarelos : b.amarelos - a.amarelos) ||
              comparePlayersByFirstName(a.player, b.player);
          case "vermelhos":
            return (dir === "asc" ? a.vermelhos - b.vermelhos : b.vermelhos - a.vermelhos) ||
              comparePlayersByFirstName(a.player, b.player);
          default:
            return 0;
        }
      });
    },
    [gameStats, gameSort],
  );

  const sortedAttendance = useMemo(
    () => {
      const dir = attendanceSort.dir;
      return [...attendanceStats].sort((a, b) => {
        switch (attendanceSort.key) {
          case "player":
            return comparePlayersByFirstName(a.player, b.player);
          case "minutos":
            return (dir === "asc" ? a.minutos - b.minutos : b.minutos - a.minutos) ||
              comparePlayersByFirstName(a.player, b.player);
          case "presencas":
            return (dir === "asc" ? a.presencas - b.presencas : b.presencas - a.presencas) ||
              comparePlayersByFirstName(a.player, b.player);
          case "atrasados":
            return (dir === "asc" ? a.atrasados - b.atrasados : b.atrasados - a.atrasados) ||
              comparePlayersByFirstName(a.player, b.player);
          case "ausencias":
            return (dir === "asc" ? a.ausencias - b.ausencias : b.ausencias - a.ausencias) ||
              comparePlayersByFirstName(a.player, b.player);
          case "lesionados":
            return (dir === "asc" ? a.lesionados - b.lesionados : b.lesionados - a.lesionados) ||
              comparePlayersByFirstName(a.player, b.player);
          default:
            return 0;
        }
      });
    },
    [attendanceStats, attendanceSort],
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
                    <th className="text-left pb-2 font-medium text-sm">
                      <button
                        type="button"
                        onClick={() => toggleGameSort("player")}
                        className="inline-flex items-center gap-1"
                      >
                        Jogador
                        <SortIcon active={gameSort.key === "player"} dir={gameSort.dir} />
                      </button>
                    </th>
                    <th className="text-center pb-2 font-medium px-1.5" title="Golos">
                      <button
                        type="button"
                        onClick={() => toggleGameSort("golos")}
                        className="inline-flex items-center gap-1"
                      >
                        ⚽
                        <SortIcon active={gameSort.key === "golos"} dir={gameSort.dir} />
                      </button>
                    </th>
                    <th className="text-center pb-2 font-medium px-1.5" title="Golos Sofridos">
                      <button
                        type="button"
                        onClick={() => toggleGameSort("gs")}
                        className="inline-flex items-center gap-1"
                      >
                        GS
                        <SortIcon active={gameSort.key === "gs"} dir={gameSort.dir} />
                      </button>
                    </th>
                    <th className="text-center pb-2 font-medium px-1.5" title="Assistências">
                      <button
                        type="button"
                        onClick={() => toggleGameSort("assistencias")}
                        className="inline-flex items-center gap-1"
                      >
                        🅰️
                        <SortIcon active={gameSort.key === "assistencias"} dir={gameSort.dir} />
                      </button>
                    </th>
                    <th className="text-center pb-2 font-medium px-1.5 whitespace-nowrap" title="Minutos totais">
                      <button
                        type="button"
                        onClick={() => toggleGameSort("minutos")}
                        className="inline-flex items-center gap-1"
                      >
                        Min
                        <SortIcon active={gameSort.key === "minutos"} dir={gameSort.dir} />
                      </button>
                    </th>
                    <th className="text-center pb-2 font-medium px-1.5" title="Jogos como titular">
                      <button
                        type="button"
                        onClick={() => toggleGameSort("titular")}
                        className="inline-flex items-center gap-1"
                      >
                        T
                        <SortIcon active={gameSort.key === "titular"} dir={gameSort.dir} />
                      </button>
                    </th>
                    <th className="text-center pb-2 font-medium px-1.5" title="Jogos como suplente">
                      <button
                        type="button"
                        onClick={() => toggleGameSort("suplente")}
                        className="inline-flex items-center gap-1"
                      >
                        S
                        <SortIcon active={gameSort.key === "suplente"} dir={gameSort.dir} />
                      </button>
                    </th>
                    <th className="text-center pb-2 font-medium px-1.5" title="Convocatórias">
                      <button
                        type="button"
                        onClick={() => toggleGameSort("convocatorias")}
                        className="inline-flex items-center gap-1"
                      >
                        Conv
                        <SortIcon active={gameSort.key === "convocatorias"} dir={gameSort.dir} />
                      </button>
                    </th>
                    <th className="text-center pb-2 font-medium px-1.5" title="MVP">
                      <button
                        type="button"
                        onClick={() => toggleGameSort("mvp")}
                        className="inline-flex items-center gap-1"
                      >
                        ⭐
                        <SortIcon active={gameSort.key === "mvp"} dir={gameSort.dir} />
                      </button>
                    </th>
                    <th className="text-center pb-2 font-medium px-1.5 whitespace-nowrap" title="Média MVP">
                      <button
                        type="button"
                        onClick={() => toggleGameSort("mediaMVP")}
                        className="inline-flex items-center gap-1"
                      >
                        %MVP
                        <SortIcon active={gameSort.key === "mediaMVP"} dir={gameSort.dir} />
                      </button>
                    </th>
                    <th className="text-center pb-2 font-medium px-1.5 whitespace-nowrap" title="Média Nota">
                      <button
                        type="button"
                        onClick={() => toggleGameSort("mediaNota")}
                        className="inline-flex items-center gap-1"
                      >
                        Nota
                        <SortIcon active={gameSort.key === "mediaNota"} dir={gameSort.dir} />
                      </button>
                    </th>
                    <th className="text-center pb-2 font-medium px-1.5 whitespace-nowrap" title="Média minutos/jogo">
                      <button
                        type="button"
                        onClick={() => toggleGameSort("mediaMin")}
                        className="inline-flex items-center gap-1"
                      >
                        Min/J
                        <SortIcon active={gameSort.key === "mediaMin"} dir={gameSort.dir} />
                      </button>
                    </th>
                    <th className="text-center pb-2 font-medium px-1.5" title="Cartões Amarelos">
                      <button
                        type="button"
                        onClick={() => toggleGameSort("amarelos")}
                        className="inline-flex items-center gap-1"
                      >
                        🟨
                        <SortIcon active={gameSort.key === "amarelos"} dir={gameSort.dir} />
                      </button>
                    </th>
                    <th className="text-center pb-2 font-medium px-1.5" title="Cartões Vermelhos">
                      <button
                        type="button"
                        onClick={() => toggleGameSort("vermelhos")}
                        className="inline-flex items-center gap-1"
                      >
                        🟥
                        <SortIcon active={gameSort.key === "vermelhos"} dir={gameSort.dir} />
                      </button>
                    </th>
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
