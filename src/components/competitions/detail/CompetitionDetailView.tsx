"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { pt } from "date-fns/locale";
import { AlertCircle, Loader2, Pencil, Plus, Trash2, Trophy } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CompetitionFormModal } from "@/components/competitions/CompetitionFormModal";
import { GameFormModal } from "@/components/games/GameFormModal";
import { useAgeGroupMeta } from "@/hooks/useAgeGroupName";
import {
  formatFixtureOpponentLabel,
  isClosedGameStatus,
} from "@/lib/games/display";
import type { TeamLabel } from "@/types/database";

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
};

type GameRow = {
  id: string;
  game_datetime: string;
  opponent_name: string | null;
  opponent_short_name: string | null;
  is_home: boolean | null;
  status: string | null;
  score_home: number | null;
  score_away: number | null;
  title: string | null;
};

type FetchState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "success";
      competition: CompetitionRow;
      games: GameRow[];
    };

type Props = {
  competitionId: string;
  /** ageGroupId do contexto — usado para construir URLs dos jogos. */
  ageGroupId: string;
};

export function CompetitionDetailView({ competitionId, ageGroupId }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { football_format: footballFormat } = useAgeGroupMeta(ageGroupId);
  const [state, setState] = useState<FetchState>({ status: "loading" });
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAddGameModal, setShowAddGameModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadCompetition = useCallback(async () => {
    const [compRes, gamesRes] = await Promise.all([
      supabase
        .from("competitions")
        .select(
          "id, team_id, name, season, phase, team_label, num_opponents, total_rounds, has_two_legs",
        )
        .eq("id", competitionId)
        .maybeSingle(),
      supabase
        .from("games")
        .select(
          "id, game_datetime, opponent_name, opponent_short_name, is_home, status, score_home, score_away, title",
        )
        .eq("competition_id", competitionId)
        .order("game_datetime", { ascending: false }),
    ]);

    if (compRes.error || !compRes.data) {
      setState({
        status: "error",
        message: compRes.error?.message ?? "Competição não encontrada.",
      });
      return;
    }
    if (gamesRes.error) {
      setState({
        status: "error",
        message: gamesRes.error.message,
      });
      return;
    }

    setState({
      status: "success",
      competition: compRes.data as CompetitionRow,
      games: (gamesRes.data ?? []) as GameRow[],
    });
  }, [competitionId, supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch, setState corre dentro do callback
    void loadCompetition();
  }, [loadCompetition]);

  async function handleDelete() {
    setDeleting(true);
    const { error } = await supabase
      .from("competitions")
      .delete()
      .eq("id", competitionId);
    if (error) {
      toast.error("Erro ao apagar competição: " + error.message);
      setDeleting(false);
      return;
    }
    toast.success("Competição apagada com sucesso.");
    router.replace(`/teams/${ageGroupId}/competitions`);
    router.refresh();
  }

  if (state.status === "loading") {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={24} className="animate-spin text-slate-400" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center">
        <AlertCircle
          size={28}
          className="mx-auto mb-2 text-red-400"
          aria-hidden="true"
        />
        <p className="text-sm text-red-700">{state.message}</p>
      </div>
    );
  }

  const { competition, games } = state;

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <Card>
        <CardContent className="py-4 px-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-amber-50 p-2 flex-shrink-0">
              <Trophy size={22} className="text-amber-600" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-slate-900 truncate">
                  {competition.name}
                </h2>
                {competition.team_label && (
                  <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 rounded px-1.5 py-0.5">
                    Equipa {competition.team_label}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {competition.season ?? "—"}
                {competition.phase ? ` · ${competition.phase}` : ""}
              </p>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div>
                  <p className="text-[10px] uppercase text-slate-400 tracking-wider">
                    Adversários
                  </p>
                  <p className="font-medium text-slate-800">
                    {competition.num_opponents ?? "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-slate-400 tracking-wider">
                    Jornadas
                  </p>
                  <p className="font-medium text-slate-800">
                    {competition.total_rounds ?? "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-slate-400 tracking-wider">
                    Duas mãos
                  </p>
                  <p className="font-medium text-slate-800">
                    {competition.has_two_legs ? "Sim" : "Não"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-slate-400 tracking-wider">
                    Jogos
                  </p>
                  <p className="font-medium text-slate-800">{games.length}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 sm:flex sm:justify-end sm:gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowEditModal(true)}
            >
              <Pencil size={14} className="mr-1" /> Editar
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={deleting}
              className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              {deleting ? (
                <Loader2 size={14} className="mr-1 animate-spin" />
              ) : (
                <Trash2 size={14} className="mr-1" />
              )}
              Apagar
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddGameModal(true)}
            >
              <Plus size={14} className="mr-1" /> Adicionar jogo
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Lista de jogos */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
          Jogos
        </h3>
        {games.length === 0 ? (
          <Card>
            <CardContent className="pt-8 pb-8 text-center text-slate-400 text-sm">
              Esta competição ainda não tem jogos registados.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {games.map((game) => {
              const closed = isClosedGameStatus(game.status);
              const href = `/teams/${ageGroupId}/games/${game.id}`;
              const dt = game.game_datetime ? parseISO(game.game_datetime) : null;
              const hasResult =
                closed && game.score_home != null && game.score_away != null;
              return (
                <Link key={game.id} href={href} className="block">
                  <Card className="hover:shadow-sm transition-shadow">
                    <CardContent className="py-3 px-4 flex items-center gap-3">
                      <div className="w-12 text-center flex-shrink-0">
                        {dt ? (
                          <>
                            <p className="text-lg font-bold text-slate-900 leading-none">
                              {format(dt, "d")}
                            </p>
                            <p className="text-xs text-slate-400 capitalize">
                              {format(dt, "MMM", { locale: pt })}
                            </p>
                          </>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {game.title && (
                            <span className="text-[10px] font-bold bg-blue-100 text-blue-700 rounded px-1.5 py-0.5">
                              {game.title.replace("Jornada ", "J")}
                            </span>
                          )}
                          <span
                            className={`text-[10px] font-bold rounded px-1.5 py-0.5 ${
                              closed
                                ? "bg-slate-100 text-slate-500"
                                : "bg-blue-100 text-blue-700"
                            }`}
                          >
                            {closed ? "Fechado" : "Agendado"}
                          </span>
                        </div>
                        <p className="text-sm font-semibold text-slate-800 truncate mt-0.5">
                          {formatFixtureOpponentLabel({
                            isHome: game.is_home ?? false,
                            opponentName: game.opponent_name,
                            opponentShortName: game.opponent_short_name,
                          })}
                        </p>
                      </div>
                      {hasResult && (
                        <p className="text-lg font-bold text-slate-900 leading-none">
                          {game.score_home}–{game.score_away}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <CompetitionFormModal
        open={showEditModal}
        onOpenChange={setShowEditModal}
        teamId={competition.team_id}
        footballFormat={footballFormat}
        competitionId={competition.id}
        initialValues={{
          name: competition.name,
          season: competition.season ?? "2025/2026",
          phase: competition.phase ?? "",
          team_label: (competition.team_label as TeamLabel) ?? "A",
          total_rounds: competition.total_rounds?.toString() ?? "",
          has_two_legs: competition.has_two_legs ?? false,
        }}
        onSaved={() => {
          void loadCompetition();
        }}
      />

      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title="Apagar competição?"
        description="Os jogos associados não serão apagados — apenas desligados desta competição. Esta acção é irreversível."
        confirmLabel="Apagar"
        cancelLabel="Cancelar"
        destructive
        onConfirm={() => void handleDelete()}
      />

      <GameFormModal
        open={showAddGameModal}
        onOpenChange={setShowAddGameModal}
        ageGroupId={ageGroupId}
        teamId={competition.team_id}
        initialCompetitionId={competition.id}
        footballFormat={footballFormat}
        onSaved={() => {
          setShowAddGameModal(false);
          void loadCompetition();
        }}
      />
    </div>
  );
}
