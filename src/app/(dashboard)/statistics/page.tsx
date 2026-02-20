"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { BarChart2, AlertTriangle, Trophy, Target } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { Player } from "@/types/database";

interface PlayerStats {
  player: Player;
  goals: number;
  assists: number;
  yellow_cards: number;
  red_cards: number;
  games_played: number;
  minutes_played: number;
}

type SortKey = "goals" | "assists" | "yellow_cards" | "games_played";

const SORT_LABELS: Record<SortKey, string> = {
  goals: "Golos",
  assists: "Assistências",
  yellow_cards: "Amarelos",
  games_played: "Jogos",
};

export default function StatisticsPage() {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<PlayerStats[]>([]);
  const [sortBy, setSortBy] = useState<SortKey>("goals");
  const [ageGroupId, setAgeGroupId] = useState<string | null>(null);
  const [noData, setNoData] = useState(false);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadData() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: ag } = await supabase
      .from("age_groups")
      .select("id")
      .eq("coordinator_id", user.id)
      .single();

    if (!ag) {
      setNoData(true);
      setLoading(false);
      return;
    }

    setAgeGroupId(ag.id);

    // Buscar jogadores ativos
    const { data: players } = await supabase
      .from("players")
      .select("*")
      .eq("age_group_id", ag.id)
      .eq("status", "active");

    if (!players || players.length === 0) {
      setNoData(true);
      setLoading(false);
      return;
    }

    // Buscar stats finais de todos os jogos
    const { data: finalStats } = await supabase
      .from("game_final_stats")
      .select("*")
      .in(
        "player_id",
        players.map((p) => p.id),
      );

    // Buscar eventos (para golos/assistências se não houver game_final_stats)
    const { data: gameEvents } = await supabase
      .from("game_events")
      .select("*")
      .in(
        "player_id",
        players.map((p) => p.id),
      )
      .eq("is_opponent_event", false);

    // Agregar estatísticas por jogador
    const statsMap = new Map<string, PlayerStats>();

    players.forEach((p) => {
      statsMap.set(p.id, {
        player: p,
        goals: 0,
        assists: 0,
        yellow_cards: 0,
        red_cards: 0,
        games_played: 0,
        minutes_played: 0,
      });
    });

    // Usar game_final_stats se disponível
    if (finalStats && finalStats.length > 0) {
      finalStats.forEach((s) => {
        const entry = statsMap.get(s.player_id);
        if (!entry) return;
        entry.goals += s.goals || 0;
        entry.assists += s.assists || 0;
        entry.yellow_cards += s.yellow_cards || 0;
        entry.red_cards += s.red_cards || 0;
        entry.games_played += 1;
        entry.minutes_played += s.minutes_played || 0;
      });
    } else if (gameEvents) {
      // Fallback: calcular a partir de game_events
      gameEvents.forEach((e) => {
        const entry = statsMap.get(e.player_id || "");
        if (!entry) return;
        if (e.event_type === "goal" || e.event_type === "penalty_goal") {
          entry.goals += 1;
        }
        if (e.event_type === "yellow_card") entry.yellow_cards += 1;
        if (e.event_type === "red_card") entry.red_cards += 1;
      });
    }

    const result = Array.from(statsMap.values()).filter(
      (s) =>
        s.goals > 0 ||
        s.assists > 0 ||
        s.yellow_cards > 0 ||
        s.red_cards > 0 ||
        s.games_played > 0,
    );

    setStats(result);
    setLoading(false);
  }

  const sorted = useMemo(
    () => [...stats].sort((a, b) => b[sortBy] - a[sortBy]),
    [stats, sortBy],
  );

  // Alertas: 3 cartões amarelos → provável suspensão
  const yellowAlert = stats.filter((s) => s.yellow_cards >= 3);

  if (loading) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (noData || !ageGroupId) {
    return (
      <div className="p-4 md:p-8 text-center py-16">
        <BarChart2 size={40} className="text-slate-300 mx-auto mb-3" />
        <p className="text-slate-700 font-semibold mb-2">Sem dados disponíveis</p>
        <p className="text-slate-500 text-sm">
          Regista jogos e estatísticas para ver os dados aqui.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Estatísticas</h1>
        <p className="text-slate-500 text-sm">Época 2025/2026</p>
      </div>

      {/* Alerta cartões amarelos */}
      {yellowAlert.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-3">
              <AlertTriangle size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-900 text-sm">
                  Alerta de cartões amarelos
                </p>
                <p className="text-amber-700 text-xs mt-0.5">
                  {yellowAlert
                    .map(
                      (s) =>
                        `${s.player.first_name} ${s.player.last_name} (${s.yellow_cards}🟨)`,
                    )
                    .join(", ")}{" "}
                  — próximo do limite de suspensão.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Totais rápidos */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-2xl font-black text-slate-900">
              {stats.reduce((s, p) => s + p.goals, 0)}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">Golos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-2xl font-black text-slate-900">
              {stats.reduce((s, p) => s + p.assists, 0)}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">Assistências</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-2xl font-black text-slate-900">
              {stats.reduce((s, p) => s + p.games_played, 0) > 0
                ? Math.max(...stats.map((s) => s.games_played))
                : 0}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">Jogos</p>
          </CardContent>
        </Card>
      </div>

      {/* Rankings */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Trophy size={16} className="text-amber-500" /> Rankings
            </CardTitle>
            <div className="flex gap-1">
              {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                <button
                  key={key}
                  onClick={() => setSortBy(key)}
                  className={`text-xs px-2 py-1 rounded-lg transition-colors ${
                    sortBy === key
                      ? "bg-slate-900 text-white"
                      : "text-slate-500 hover:bg-slate-100"
                  }`}
                >
                  {SORT_LABELS[key]}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {sorted.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">
              Sem estatísticas registadas ainda.
            </p>
          ) : (
            <div className="space-y-2">
              {sorted
                .filter((s) => s[sortBy] > 0)
                .slice(0, 10)
                .map((s, i) => (
                  <div
                    key={s.player.id}
                    className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-100"
                  >
                    <span className="text-sm font-bold text-slate-400 w-5 text-right">
                      {i + 1}
                    </span>
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                        i === 0
                          ? "bg-amber-400 text-white"
                          : i === 1
                            ? "bg-slate-300 text-white"
                            : i === 2
                              ? "bg-orange-400 text-white"
                              : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {s.player.jersey_number || "—"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800 text-sm truncate">
                        {s.player.first_name} {s.player.last_name}
                      </p>
                      <p className="text-xs text-slate-400">
                        {s.games_played} jogo{s.games_played !== 1 ? "s" : ""}
                        {s.yellow_cards > 0 ? ` · ${s.yellow_cards}🟨` : ""}
                        {s.red_cards > 0 ? ` · ${s.red_cards}🟥` : ""}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-lg font-black text-slate-900">
                        {s[sortBy]}
                      </p>
                      <p className="text-xs text-slate-400">
                        {SORT_LABELS[sortBy]}
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabela completa */}
      {stats.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Target size={16} /> Todos os jogadores
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-400 border-b border-slate-100">
                  <th className="text-left pb-2 font-medium">Jogador</th>
                  <th className="text-center pb-2 font-medium px-2">J</th>
                  <th className="text-center pb-2 font-medium px-2">⚽</th>
                  <th className="text-center pb-2 font-medium px-2">🅰️</th>
                  <th className="text-center pb-2 font-medium px-2">🟨</th>
                  <th className="text-center pb-2 font-medium px-2">🟥</th>
                </tr>
              </thead>
              <tbody>
                {stats
                  .sort((a, b) => b.goals - a.goals || b.assists - a.assists)
                  .map((s) => (
                    <tr
                      key={s.player.id}
                      className="border-b border-slate-50 last:border-0"
                    >
                      <td className="py-2 font-medium text-slate-800 truncate max-w-[120px]">
                        {s.player.first_name} {s.player.last_name}
                      </td>
                      <td className="py-2 text-center text-slate-500 px-2">
                        {s.games_played}
                      </td>
                      <td className="py-2 text-center font-bold text-slate-900 px-2">
                        {s.goals || "—"}
                      </td>
                      <td className="py-2 text-center text-slate-600 px-2">
                        {s.assists || "—"}
                      </td>
                      <td
                        className={`py-2 text-center px-2 ${
                          s.yellow_cards >= 3
                            ? "font-bold text-amber-600"
                            : "text-slate-500"
                        }`}
                      >
                        {s.yellow_cards || "—"}
                      </td>
                      <td className="py-2 text-center text-red-600 px-2">
                        {s.red_cards || "—"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
