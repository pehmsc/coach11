"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  Dumbbell,
  Trophy,
  Users,
  Clock,
  Target,
  Shield,
  ChevronDown,
  TrendingUp,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { ClubInsights } from "@/types/database";

type Tab = "trainings" | "games";

type ClubOption = { id: string; name: string };

function formatMinutes(mins: number) {
  if (!mins || mins <= 0) return "0";
  if (mins < 60) return `${mins}`;
  const hours = Math.floor(mins / 60);
  const rem = Math.round(mins % 60);
  return rem === 0 ? `${hours}h` : `${hours}h${rem.toString().padStart(2, "0")}`;
}

function KpiCard({
  icon: Icon,
  label,
  value,
  helper,
}: {
  icon: typeof Users;
  label: string;
  value: string | number;
  helper?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-3">
        <div className="flex items-center gap-2 text-slate-500 mb-1">
          <Icon size={14} />
          <span className="text-[11px] uppercase tracking-wide font-semibold">{label}</span>
        </div>
        <p className="text-2xl font-black text-slate-900 leading-tight">{value}</p>
        {helper ? <p className="text-[11px] text-slate-500 mt-0.5">{helper}</p> : null}
      </CardContent>
    </Card>
  );
}

export default function InsightsPage() {
  const supabase = useMemo(() => createClient(), []);

  const [clubs, setClubs] = useState<ClubOption[]>([]);
  const [clubsLoading, setClubsLoading] = useState(true);
  const [selectedClubId, setSelectedClubId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<Tab>("trainings");

  useEffect(() => {
    let cancelled = false;
    async function loadClubs() {
      setClubsLoading(true);
      try {
        const { data: clubIds, error: idsErr } = await supabase.rpc("user_club_ids");
        if (idsErr) throw idsErr;
        const ids = (clubIds as string[] | null) ?? [];

        if (ids.length === 0) {
          if (!cancelled) {
            setClubs([]);
            setSelectedClubId("");
          }
          return;
        }

        const [{ data: clubRows, error: clubsErr }, { data: defaultClubId }] = await Promise.all([
          supabase.from("clubs").select("id, name").in("id", ids).order("name"),
          supabase.rpc("user_default_club_id"),
        ]);

        if (clubsErr) throw clubsErr;
        const list = ((clubRows as ClubOption[] | null) ?? []).map((c) => ({
          id: c.id,
          name: c.name,
        }));

        if (cancelled) return;
        setClubs(list);

        const defId = (defaultClubId as string | null) ?? null;
        const initial =
          (defId && list.some((c) => c.id === defId) ? defId : null) ?? list[0]?.id ?? "";
        setSelectedClubId(initial);
      } catch {
        if (!cancelled) {
          setClubs([]);
          setSelectedClubId("");
        }
      } finally {
        if (!cancelled) setClubsLoading(false);
      }
    }
    void loadClubs();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const fetchInsights = useCallback(async (): Promise<ClubInsights | null> => {
    if (!selectedClubId) return null;
    const { data, error } = await supabase
      .rpc("get_club_insights", { p_club_id: selectedClubId })
      .single();
    if (error) throw error;
    return (data as ClubInsights | null) ?? null;
  }, [supabase, selectedClubId]);

  const insightsQuery = useQuery({
    queryKey: ["insights", "club", selectedClubId],
    queryFn: fetchInsights,
    enabled: Boolean(selectedClubId),
    placeholderData: keepPreviousData,
  });

  const insights = insightsQuery.data ?? null;
  const loading = insightsQuery.isLoading || insightsQuery.isFetching;

  const trainingsCompletionPct = useMemo(() => {
    if (!insights || insights.trainings_total === 0) return 0;
    return Math.round((insights.trainings_completed / insights.trainings_total) * 100);
  }, [insights]);

  const gamesTotal = insights?.games_played ?? 0;
  const vedTotals = useMemo(() => {
    if (!insights || gamesTotal === 0) return { w: 0, d: 0, l: 0 };
    return {
      w: (insights.games_won / gamesTotal) * 100,
      d: (insights.games_drawn / gamesTotal) * 100,
      l: (insights.games_lost / gamesTotal) * 100,
    };
  }, [insights, gamesTotal]);

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center gap-2">
        <TrendingUp className="text-emerald-600" size={22} />
        <h1 className="text-2xl font-bold text-slate-900">Insights</h1>
      </div>

      <Card>
        <CardContent className="pt-4 pb-4 space-y-2">
          <label
            htmlFor="insights-club-select"
            className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold"
          >
            Clube
          </label>
          <div className="relative">
            <select
              id="insights-club-select"
              aria-label="Selecionar clube"
              value={selectedClubId}
              onChange={(e) => setSelectedClubId(e.target.value)}
              disabled={clubsLoading || clubs.length === 0}
              className="w-full appearance-none bg-white border border-slate-300 rounded-lg px-3 py-2 pr-8 text-sm text-slate-900 focus:outline-none focus:border-emerald-500 disabled:bg-slate-50 disabled:text-slate-400 cursor-pointer"
            >
              {clubsLoading ? (
                <option value="">A carregar clubes…</option>
              ) : clubs.length === 0 ? (
                <option value="">Sem clubes acessíveis</option>
              ) : (
                clubs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))
              )}
            </select>
            <ChevronDown
              size={14}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
          </div>
          {insights ? (
            <p className="text-xs text-slate-500">
              Agrega {insights.age_groups_count}{" "}
              {insights.age_groups_count === 1 ? "escalão" : "escalões"} deste clube
              {insights.players_count > 0 ? ` · ${insights.players_count} atletas` : ""}.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "trainings"}
          onClick={() => setActiveTab("trainings")}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
            activeTab === "trainings"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          <Dumbbell size={15} /> Treinos
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "games"}
          onClick={() => setActiveTab("games")}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
            activeTab === "games"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          <Trophy size={15} /> Jogos
        </button>
      </div>

      {loading && !insights ? (
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : !selectedClubId ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-slate-500">
            Selecione um clube para ver os insights.
          </CardContent>
        </Card>
      ) : !insights ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-slate-500">
            Sem dados para este clube.
          </CardContent>
        </Card>
      ) : activeTab === "trainings" ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <KpiCard
              icon={Dumbbell}
              label="Treinos concluídos"
              value={insights.trainings_completed}
              helper={
                insights.trainings_total > 0
                  ? `de ${insights.trainings_total} planeados`
                  : undefined
              }
            />
            <KpiCard
              icon={Users}
              label="Presenças"
              value={insights.trainings_present}
              helper="Total de marcações"
            />
            <KpiCard
              icon={Clock}
              label="Minutos de treino"
              value={formatMinutes(insights.training_minutes)}
              helper="Sessões concluídas"
            />
            <KpiCard
              icon={Users}
              label="Atletas"
              value={insights.players_count}
              helper={
                insights.age_groups_count > 0
                  ? `${insights.age_groups_count} ${insights.age_groups_count === 1 ? "escalão" : "escalões"}`
                  : undefined
              }
            />
          </div>

          <Card>
            <CardContent className="pt-4 pb-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">
                  Taxa de conclusão
                </p>
                <p className="text-xs text-slate-700 font-medium">{trainingsCompletionPct}%</p>
              </div>
              <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all"
                  style={{ width: `${trainingsCompletionPct}%` }}
                  aria-label={`${trainingsCompletionPct}% das sessões concluídas`}
                />
              </div>
              <p className="text-[11px] text-slate-500">
                {insights.trainings_completed} concluídas / {insights.trainings_total} planeadas
              </p>
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <KpiCard
              icon={Trophy}
              label="Jogos disputados"
              value={insights.games_played}
              helper={`${insights.games_won}V · ${insights.games_drawn}E · ${insights.games_lost}D`}
            />
            <KpiCard
              icon={Target}
              label="Golos marcados"
              value={insights.goals_for}
              helper={insights.assists > 0 ? `${insights.assists} assistências` : undefined}
            />
            <KpiCard
              icon={Shield}
              label="Golos sofridos"
              value={insights.goals_against}
              helper={
                gamesTotal > 0
                  ? `${(insights.goals_against / gamesTotal).toFixed(1)} por jogo`
                  : undefined
              }
            />
            <KpiCard
              icon={Clock}
              label="Minutos de jogo"
              value={formatMinutes(insights.game_minutes)}
              helper="Soma dos jogadores"
            />
          </div>

          <Card>
            <CardContent className="pt-4 pb-4 space-y-3">
              <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">
                Resultados (V-E-D)
              </p>
              {gamesTotal === 0 ? (
                <p className="text-sm text-slate-500">Sem jogos disputados.</p>
              ) : (
                <>
                  <div className="flex h-3 rounded-full overflow-hidden bg-slate-100">
                    <div
                      className="h-full bg-emerald-500"
                      style={{ width: `${vedTotals.w}%` }}
                      aria-label={`${insights.games_won} vitórias`}
                    />
                    <div
                      className="h-full bg-amber-400"
                      style={{ width: `${vedTotals.d}%` }}
                      aria-label={`${insights.games_drawn} empates`}
                    />
                    <div
                      className="h-full bg-rose-500"
                      style={{ width: `${vedTotals.l}%` }}
                      aria-label={`${insights.games_lost} derrotas`}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-500">
                    <span>
                      <span className="inline-block w-2 h-2 rounded-sm bg-emerald-500 mr-1 align-middle" />
                      {insights.games_won} Vitórias
                    </span>
                    <span>
                      <span className="inline-block w-2 h-2 rounded-sm bg-amber-400 mr-1 align-middle" />
                      {insights.games_drawn} Empates
                    </span>
                    <span>
                      <span className="inline-block w-2 h-2 rounded-sm bg-rose-500 mr-1 align-middle" />
                      {insights.games_lost} Derrotas
                    </span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
