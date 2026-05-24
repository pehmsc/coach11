"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { pt } from "date-fns/locale";
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Loader2,
  Plus,
  PlusCircle,
  Trophy,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CompetitionFormModal } from "@/components/competitions/CompetitionFormModal";
import { GameFormModal } from "@/components/games/GameFormModal";
import {
  formatFixtureOpponentLabel,
  isClosedGameStatus,
} from "@/lib/games/display";
import { resolveLocationLabel } from "@/lib/location";
import { useAgeGroupMeta } from "@/hooks/useAgeGroupName";

type GameRow = {
  id: string;
  competition_id: string;
  game_datetime: string;
  opponent_name: string | null;
  opponent_short_name: string | null;
  is_home: boolean;
  status: string;
  score_home: number | null;
  score_away: number | null;
  title: string | null;
  location: string | null;
  formatted_address: string | null;
};

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
  games: GameRow[];
};

type FetchState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; competitions: CompetitionRow[] };

type Props = {
  /** AgeGroupId para filtro. Sub-rota escalão passa este valor. */
  ageGroupId: string;
};

const COMPETITION_GAMES_WINDOW_SIZE = 5;

function compareCompetitionGames(a: GameRow, b: GameRow) {
  return new Date(b.game_datetime).getTime() - new Date(a.game_datetime).getTime();
}

function getDefaultCompetitionWindowStart(games: GameRow[]) {
  if (games.length <= COMPETITION_GAMES_WINDOW_SIZE) return 0;

  let anchorIndex = -1;
  for (let index = games.length - 1; index >= 0; index -= 1) {
    if (!isClosedGameStatus(games[index].status)) {
      anchorIndex = index;
      break;
    }
  }

  if (anchorIndex === -1) {
    anchorIndex = 0;
  }

  const maxStart = Math.max(0, games.length - COMPETITION_GAMES_WINDOW_SIZE);
  return Math.min(Math.max(anchorIndex - 2, 0), maxStart);
}

function gameResultLabel(game: GameRow) {
  if (game.status !== "completed") return null;
  if (game.score_home == null || game.score_away == null) return null;
  return `${game.score_home}–${game.score_away}`;
}

export function CompetitionsSection({ ageGroupId }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { football_format: footballFormat } = useAgeGroupMeta(ageGroupId);
  const [state, setState] = useState<FetchState>({ status: "loading" });
  const [teamId, setTeamId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [addingGameToCompId, setAddingGameToCompId] = useState<string | null>(
    null,
  );
  const [windowOverrides, setWindowOverrides] = useState<
    Record<string, number>
  >({});

  const loadCompetitions = useCallback(async () => {
    setState({ status: "loading" });

    const { data: teamsData, error: teamsError } = await supabase
      .from("teams")
      .select("id")
      .eq("age_group_id", ageGroupId);

    if (teamsError) {
      setState({
        status: "error",
        message: "Erro ao carregar equipas do escalão.",
      });
      return;
    }

    const teamIds = (teamsData ?? []).map((t) => t.id);
    setTeamId(teamIds[0] ?? null);

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

    if (compError) {
      setState({
        status: "error",
        message: "Erro ao carregar competições.",
      });
      return;
    }

    const competitionRows = (competitions ?? []) as Omit<
      CompetitionRow,
      "games"
    >[];

    if (competitionRows.length === 0) {
      setState({ status: "success", competitions: [] });
      return;
    }

    const competitionIds = competitionRows.map((c) => c.id);
    const { data: gamesData, error: gamesError } = await supabase
      .from("games")
      .select(
        "id, competition_id, game_datetime, opponent_name, opponent_short_name, is_home, status, score_home, score_away, title, location, formatted_address",
      )
      .in("competition_id", competitionIds)
      .order("game_datetime", { ascending: false });

    if (gamesError) {
      setState({
        status: "error",
        message: "Erro ao carregar jogos.",
      });
      return;
    }

    const gamesByComp = new Map<string, GameRow[]>();
    for (const row of (gamesData ?? []) as GameRow[]) {
      const list = gamesByComp.get(row.competition_id) ?? [];
      list.push(row);
      gamesByComp.set(row.competition_id, list);
    }

    const rows: CompetitionRow[] = competitionRows.map((c) => ({
      ...c,
      games: gamesByComp.get(c.id) ?? [],
    }));

    setState({ status: "success", competitions: rows });
  }, [ageGroupId, supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch, setState corre dentro do callback
    void loadCompetitions();
  }, [loadCompetitions]);

  const competitionWindowStarts = useMemo(() => {
    if (state.status !== "success") return {} as Record<string, number>;
    const result: Record<string, number> = {};
    state.competitions.forEach((competition) => {
      const games = competition.games.slice().sort(compareCompetitionGames);
      const maxStart = Math.max(
        0,
        games.length - COMPETITION_GAMES_WINDOW_SIZE,
      );
      const override = windowOverrides[competition.id];
      result[competition.id] =
        typeof override === "number"
          ? Math.min(Math.max(override, 0), maxStart)
          : getDefaultCompetitionWindowStart(games);
    });
    return result;
  }, [state, windowOverrides]);

  const isLoading = state.status === "loading";
  const hasCompetitions =
    state.status === "success" && state.competitions.length > 0;

  function shiftCompetitionWindow(
    competitionId: string,
    direction: "up" | "down",
  ) {
    if (state.status !== "success") return;
    const competition = state.competitions.find(
      (item) => item.id === competitionId,
    );
    if (!competition) return;
    const games = competition.games.slice().sort(compareCompetitionGames);
    const maxStart = Math.max(0, games.length - COMPETITION_GAMES_WINDOW_SIZE);
    const currentStart =
      competitionWindowStarts[competitionId] ??
      getDefaultCompetitionWindowStart(games);
    const nextStart =
      direction === "up"
        ? Math.max(0, currentStart - 1)
        : Math.min(maxStart, currentStart + 1);
    if (nextStart === currentStart) return;
    setWindowOverrides((prev) => ({ ...prev, [competitionId]: nextStart }));
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button
          onClick={() => setShowCreateModal(true)}
          disabled={!teamId || isLoading}
          className="bg-emerald-600 hover:bg-emerald-700"
          size="sm"
        >
          <Plus size={16} className="mr-1" /> Nova competição
        </Button>
      </div>

      {state.status === "loading" && (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-slate-400" />
        </div>
      )}

      {state.status === "error" && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center text-sm text-red-700">
          {state.message}
        </div>
      )}

      {state.status === "success" && !hasCompetitions && (
        <div className="text-center py-16">
          <Trophy size={40} className="text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">
            Nenhuma competição registada neste escalão.
          </p>
          <p className="text-slate-400 text-xs mt-1">
            Cria a primeira competição aqui.
          </p>
        </div>
      )}

      {hasCompetitions && state.status === "success" && (
        <div className="space-y-4">
          {state.competitions.map((comp) => {
            const games = comp.games.slice().sort(compareCompetitionGames);
            const windowStart =
              competitionWindowStarts[comp.id] ??
              getDefaultCompetitionWindowStart(games);
            const visibleGames = games.slice(
              windowStart,
              windowStart + COMPETITION_GAMES_WINDOW_SIZE,
            );
            const canMoveUp = windowStart > 0;
            const canMoveDown =
              windowStart + COMPETITION_GAMES_WINDOW_SIZE < games.length;

            return (
              <Card key={comp.id}>
                <Link
                  href={`/teams/${ageGroupId}/competitions/${comp.id}`}
                  className="block hover:bg-slate-50 transition-colors"
                >
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
                            ? ` · ${games.length}/${comp.total_rounds} jogos`
                            : ` · ${games.length} jogo${games.length !== 1 ? "s" : ""}`}
                          {comp.has_two_legs ? " · 2 mãos" : ""}
                        </p>
                      </div>
                      <Trophy size={18} className="text-slate-300 flex-shrink-0" />
                    </div>
                  </CardContent>
                </Link>

                <CardContent className="pt-0 pb-3 px-4 space-y-1">
                  {games.length > 0 && (
                    <div className="space-y-1">
                      <div className="flex justify-center pb-1">
                        <button
                          type="button"
                          onClick={() => shiftCompetitionWindow(comp.id, "up")}
                          disabled={!canMoveUp}
                          aria-label="Ver jogos acima"
                          className={`flex h-7 w-7 items-center justify-center rounded-full border transition-colors ${
                            canMoveUp
                              ? "border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
                              : "border-slate-100 text-slate-300 opacity-50"
                          }`}
                        >
                          <ChevronUp size={14} />
                        </button>
                      </div>

                      {visibleGames.map((game) => {
                        const isClosed = isClosedGameStatus(game.status);
                        const gameLocationLabel = resolveLocationLabel(
                          game.location ?? undefined,
                          game.formatted_address ?? undefined,
                        );
                        return (
                          <button
                            key={game.id}
                            type="button"
                            onClick={() =>
                              router.push(`/teams/${ageGroupId}/games/${game.id}`)
                            }
                            className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors text-left ${
                              isClosed
                                ? "bg-white border border-slate-100 hover:bg-slate-50"
                                : "bg-slate-50 hover:bg-slate-100"
                            }`}
                          >
                            {isClosed ? (
                              <span className="text-xs text-slate-400 w-4 text-center">
                                ✓
                              </span>
                            ) : (
                              <Calendar
                                size={14}
                                className="text-blue-500 flex-shrink-0"
                              />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                {game.title && (
                                  <span
                                    className={`text-[10px] font-bold rounded px-1 py-0.5 flex-shrink-0 ${
                                      isClosed
                                        ? "bg-slate-100 text-slate-500"
                                        : "bg-blue-100 text-blue-700"
                                    }`}
                                  >
                                    {game.title.replace("Jornada ", "J")}
                                  </span>
                                )}
                                <p
                                  className={`text-sm font-medium truncate ${
                                    isClosed
                                      ? "text-slate-600"
                                      : "text-slate-800"
                                  }`}
                                >
                                  {formatFixtureOpponentLabel({
                                    isHome: game.is_home,
                                    opponentName: game.opponent_name ?? undefined,
                                    opponentShortName:
                                      game.opponent_short_name ?? undefined,
                                  })}
                                </p>
                              </div>
                              <p className="text-xs text-slate-400">
                                {format(
                                  parseISO(game.game_datetime),
                                  isClosed ? "d MMM" : "d MMM · HH:mm",
                                  { locale: pt },
                                )}
                                {!isClosed && gameLocationLabel
                                  ? ` · ${gameLocationLabel}`
                                  : ""}
                              </p>
                            </div>
                            {gameResultLabel(game) && (
                              <span className="text-sm font-bold text-slate-700">
                                {gameResultLabel(game)}
                              </span>
                            )}
                            <ChevronRight size={14} className="text-slate-300" />
                          </button>
                        );
                      })}

                      <div className="flex justify-center pt-1">
                        <button
                          type="button"
                          onClick={() => shiftCompetitionWindow(comp.id, "down")}
                          disabled={!canMoveDown}
                          aria-label="Ver jogos abaixo"
                          className={`flex h-7 w-7 items-center justify-center rounded-full border transition-colors ${
                            canMoveDown
                              ? "border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
                              : "border-slate-100 text-slate-300 opacity-50"
                          }`}
                        >
                          <ChevronDown size={14} />
                        </button>
                      </div>
                    </div>
                  )}

                  {games.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-2">
                      Ainda sem jogos nesta competição.
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={() => setAddingGameToCompId(comp.id)}
                    className="w-full flex items-center justify-center gap-2 p-2.5 rounded-xl border-2 border-dashed border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 transition-colors text-slate-400 hover:text-emerald-600 mt-1"
                  >
                    <PlusCircle size={14} />
                    <span className="text-xs font-medium">Adicionar jogo</span>
                  </button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <GameFormModal
        open={addingGameToCompId !== null}
        onOpenChange={(open) => {
          if (!open) setAddingGameToCompId(null);
        }}
        ageGroupId={ageGroupId}
        teamId={teamId}
        initialCompetitionId={addingGameToCompId}
        footballFormat={footballFormat}
        onSaved={() => {
          setAddingGameToCompId(null);
          void loadCompetitions();
        }}
      />

      {teamId && (
        <CompetitionFormModal
          open={showCreateModal}
          onOpenChange={setShowCreateModal}
          teamId={teamId}
          footballFormat={footballFormat}
          onSaved={() => {
            void loadCompetitions();
          }}
        />
      )}
    </>
  );
}
