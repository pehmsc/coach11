"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";

type CompetitionRow = {
  id: string;
  team_id: string;
  name: string;
  season: string | null;
  phase: string | null;
  team_label: string | null;
  num_opponents: number | null;
  total_rounds: number | null;
  has_two_legs: boolean | null;
  games_count?: number;
};

type FetchState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; competitions: CompetitionRow[] };

type Props = {
  /** AgeGroupId para filtro. Sub-rota escalão passa este valor. */
  ageGroupId: string;
};

export function CompetitionsSection({ ageGroupId }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<FetchState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      // Resolver team_ids deste escalão (relação indirecta competitions.team_id → teams.age_group_id)
      const { data: teamsData, error: teamsError } = await supabase
        .from("teams")
        .select("id")
        .eq("age_group_id", ageGroupId);

      if (cancelled) return;
      if (teamsError) {
        setState({
          status: "error",
          message: "Erro ao carregar equipas do escalão.",
        });
        return;
      }

      const teamIds = (teamsData ?? []).map((t) => t.id);
      if (teamIds.length === 0) {
        setState({ status: "success", competitions: [] });
        return;
      }

      const { data: competitions, error: compError } = await supabase
        .from("competitions")
        .select(
          "id, team_id, name, season, phase, team_label, num_opponents, total_rounds, has_two_legs",
        )
        .in("team_id", teamIds)
        .order("created_at", { ascending: false });

      if (cancelled) return;
      if (compError) {
        setState({
          status: "error",
          message: "Erro ao carregar competições.",
        });
        return;
      }

      const rows = (competitions ?? []) as CompetitionRow[];

      // Contagem de jogos por competição (uma query agregada).
      if (rows.length > 0) {
        const competitionIds = rows.map((c) => c.id);
        const { data: gamesData } = await supabase
          .from("games")
          .select("competition_id")
          .in("competition_id", competitionIds);
        if (cancelled) return;
        const countByComp = new Map<string, number>();
        for (const row of gamesData ?? []) {
          const key = row.competition_id;
          if (typeof key !== "string") continue;
          countByComp.set(key, (countByComp.get(key) ?? 0) + 1);
        }
        for (const row of rows) {
          row.games_count = countByComp.get(row.id) ?? 0;
        }
      }

      setState({ status: "success", competitions: rows });
    })();

    return () => {
      cancelled = true;
    };
  }, [ageGroupId, supabase]);

  if (state.status === "loading") {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={24} className="animate-spin text-slate-400" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center text-sm text-red-700">
        {state.message}
      </div>
    );
  }

  if (state.competitions.length === 0) {
    return (
      <div className="text-center py-16">
        <Trophy size={40} className="text-slate-200 mx-auto mb-3" />
        <p className="text-slate-500 text-sm">
          Nenhuma competição registada neste escalão.
        </p>
        <p className="text-slate-400 text-xs mt-1">
          Para criar uma nova competição, usa o menu Competições no global.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {state.competitions.map((comp) => (
        <Link
          key={comp.id}
          href={`/teams/${ageGroupId}/competitions/${comp.id}`}
          className="block"
        >
          <Card className="hover:shadow-sm transition-shadow">
            <CardContent className="py-3 px-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-slate-900 truncate">
                      {comp.name}
                    </p>
                    {comp.team_label && (
                      <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 rounded px-1.5 py-0.5">
                        Equipa {comp.team_label}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {comp.season ?? "—"}
                    {comp.phase ? ` · ${comp.phase}` : ""}
                    {comp.total_rounds
                      ? ` · ${comp.games_count ?? 0}/${comp.total_rounds} jogos`
                      : ` · ${comp.games_count ?? 0} jogo${(comp.games_count ?? 0) !== 1 ? "s" : ""}`}
                    {comp.has_two_legs ? " · 2 mãos" : ""}
                  </p>
                </div>
                <Trophy size={18} className="text-slate-300 flex-shrink-0" />
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
