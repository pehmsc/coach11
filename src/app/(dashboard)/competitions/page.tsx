"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { format, parseISO } from "date-fns";
import { pt } from "date-fns/locale";
import {
  Plus,
  Trophy,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  X,
  Loader2,
  Trash2,
  Calendar,
  PlusCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GameFormModal } from "@/components/games/GameFormModal";
import { resolveLocationLabel } from "@/lib/location";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatFixtureOpponentLabel,
  isClosedGameStatus,
} from "@/lib/games/display";
import type { Competition, Game, TeamLabel } from "@/types/database";

interface CompetitionWithGames extends Competition {
  games?: Game[];
  is_active?: boolean;
}

interface CompetitionForm {
  name: string;
  season: string;
  phase: string;
  team_label: TeamLabel;
  total_rounds: string;
  has_two_legs: boolean;
}

type CompetitionsPayload = {
  success: boolean;
  teamId: string | null;
  ageGroup?: {
    id?: string;
    football_format?: string | null;
  } | null;
  competitions?: CompetitionWithGames[];
  error?: string;
};

const EMPTY_COMP_FORM: CompetitionForm = {
  name: "",
  season: "2025/2026",
  phase: "",
  team_label: "A",
  total_rounds: "",
  has_two_legs: false,
};

const COMPETITION_GAMES_WINDOW_SIZE = 5;

function extractRoundNumber(title: string | null | undefined) {
  if (!title) return null;
  const match = title.match(/\b(?:jornada|j)\s*(\d+)\b/i);
  if (!match) return null;
  const round = Number.parseInt(match[1], 10);
  return Number.isFinite(round) ? round : null;
}

function compareCompetitionGames(a: Game, b: Game) {
  const roundA = extractRoundNumber(a.title);
  const roundB = extractRoundNumber(b.title);

  if (roundA !== null || roundB !== null) {
    if (roundA === null) return 1;
    if (roundB === null) return -1;
    if (roundA !== roundB) return roundB - roundA;
  }

  return new Date(b.game_datetime).getTime() - new Date(a.game_datetime).getTime();
}

function getDefaultCompetitionWindowStart(games: Game[]) {
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

export default function CompetitionsPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [competitions, setCompetitions] = useState<CompetitionWithGames[]>([]);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [ageGroupId, setAgeGroupId] = useState<string | null>(null);
  const [footballFormat, setFootballFormat] = useState<string | null>(null);

  // Competição form
  const [showCompForm, setShowCompForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [compForm, setCompForm] = useState(EMPTY_COMP_FORM);
  const [savingComp, setSavingComp] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Jogo modal
  const [addingGameToCompId, setAddingGameToCompId] = useState<string | null>(null);
  const [competitionWindowStarts, setCompetitionWindowStarts] = useState<Record<string, number>>(
    {},
  );

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    setCompetitionWindowStarts((prev) => {
      const next: Record<string, number> = {};

      competitions.forEach((competition) => {
        const games = (competition.games || []).slice().sort(compareCompetitionGames);
        const maxStart = Math.max(0, games.length - COMPETITION_GAMES_WINDOW_SIZE);
        const defaultStart = getDefaultCompetitionWindowStart(games);
        const previousStart = prev[competition.id];

        next[competition.id] =
          typeof previousStart === "number"
            ? Math.min(Math.max(previousStart, 0), maxStart)
            : defaultStart;
      });

      return next;
    });
  }, [competitions]);

  async function loadData() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/competitions");
      const payload = (await res.json().catch(() => null)) as CompetitionsPayload | null;

      if (!res.ok || !payload?.success) {
        throw new Error(payload?.error || "Erro ao carregar competições.");
      }

      const resolvedTeamId = payload.teamId ?? null;
      const resolvedAgeGroupId = payload.ageGroup?.id ?? null;
      const resolvedFootballFormat = payload.ageGroup?.football_format ?? null;

      setTeamId(resolvedTeamId);
      setAgeGroupId(resolvedAgeGroupId);
      setFootballFormat(resolvedFootballFormat);
      setCompetitions(Array.isArray(payload.competitions) ? payload.competitions : []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao carregar competições.";
      setError(message);
      setTeamId(null);
      setAgeGroupId(null);
      setFootballFormat(null);
      setCompetitions([]);
    } finally {
      setLoading(false);
    }
  }

  function openCreateComp() {
    setEditingId(null);
    setCompForm(EMPTY_COMP_FORM);
    setError(null);
    setShowCompForm(true);
  }

  function openEditComp(comp: CompetitionWithGames) {
    setEditingId(comp.id);
    setCompForm({
      name: comp.name,
      season: comp.season,
      phase: comp.phase || "",
      team_label: comp.team_label || "A",
      total_rounds: comp.total_rounds?.toString() || "",
      has_two_legs: comp.has_two_legs || false,
    });
    setError(null);
    setShowCompForm(true);
  }

  function closeCompForm() {
    setShowCompForm(false);
    setEditingId(null);
    setCompForm(EMPTY_COMP_FORM);
    setError(null);
  }

  async function handleSaveComp(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!teamId) return;
    setSavingComp(true);
    setError(null);

    const payload = {
      team_id: teamId,
      name: compForm.name,
      season: compForm.season,
      phase: compForm.phase || null,
      team_label: compForm.team_label,
      total_rounds: compForm.total_rounds ? parseInt(compForm.total_rounds) : null,
      has_two_legs: compForm.has_two_legs,
    };

    if (editingId) {
      const { error } = await supabase
        .from("competitions")
        .update(payload)
        .eq("id", editingId);
      if (error) {
        setError("Erro ao guardar: " + error.message);
        setSavingComp(false);
        return;
      }
    } else {
      const { error } = await supabase.from("competitions").insert(payload);
      if (error) {
        setError("Erro ao criar: " + error.message);
        setSavingComp(false);
        return;
      }
    }

    setSavingComp(false);
    closeCompForm();
    loadData();
  }

  async function handleDeleteComp(id: string) {
    setDeletingId(id);
    setConfirmDeleteId(null);

    const { error } = await supabase
      .from("competitions")
      .delete()
      .eq("id", id);

    if (error) {
      setError("Erro ao eliminar: " + error.message);
    } else {
      setCompetitions((prev) => prev.filter((c) => c.id !== id));
    }
    setDeletingId(null);
  }

  function openAddGame(compId: string) {
    setAddingGameToCompId(compId);
    setError(null);
  }

  function closeGameForm() {
    setAddingGameToCompId(null);
    setError(null);
  }

  function handleGameSaved() {
    closeGameForm();
    loadData();
  }

  function gameResultLabel(game: Game) {
    if (game.status !== "completed") return null;
    if (game.score_home == null || game.score_away == null) return null;
    return `${game.score_home}–${game.score_away}`;
  }

  function shiftCompetitionWindow(competitionId: string, direction: "up" | "down") {
    setCompetitionWindowStarts((prev) => {
      const competition = competitions.find((item) => item.id === competitionId);
      if (!competition) return prev;

      const games = (competition.games || []).slice().sort(compareCompetitionGames);
      const maxStart = Math.max(0, games.length - COMPETITION_GAMES_WINDOW_SIZE);
      const currentStart =
        typeof prev[competitionId] === "number"
          ? prev[competitionId]
          : getDefaultCompetitionWindowStart(games);
      const nextStart =
        direction === "up"
          ? Math.max(0, currentStart - 1)
          : Math.min(maxStart, currentStart + 1);

      if (nextStart === currentStart) return prev;

      return {
        ...prev,
        [competitionId]: nextStart,
      };
    });
  }

  if (loading) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  if (!teamId) {
    return (
      <div className="p-4 md:p-8 text-center py-16">
        <Trophy size={40} className="text-slate-300 mx-auto mb-3" />
        <p className="text-slate-700 font-semibold mb-2">
          Sem equipa configurada
        </p>
        <p className="text-slate-500 text-sm">
          Configura o teu escalão em Configurações antes de gerir competições.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Competições</h1>
          <p className="text-slate-500 text-sm">
            Época 2025/2026
            {footballFormat && (
              <span className="ml-2 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2 py-0.5">
                Futebol {footballFormat}
              </span>
            )}
          </p>
        </div>
        <Button
          onClick={openCreateComp}
          className="bg-emerald-600 hover:bg-emerald-700"
          size="sm"
        >
          <Plus size={16} className="mr-1" /> Nova
        </Button>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg mb-4 border border-red-200">
          {error}
        </div>
      )}

      {/* Lista de competições */}
      {competitions.length === 0 ? (
        <div className="text-center py-16">
          <Trophy size={40} className="text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">Nenhuma competição criada.</p>
          <Button
            onClick={openCreateComp}
            variant="outline"
            size="sm"
            className="mt-4"
          >
            Criar primeira competição
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {competitions.map((comp) => {
            const games = (comp.games || []).slice().sort(compareCompetitionGames);
            const windowStart =
              competitionWindowStarts[comp.id] ?? getDefaultCompetitionWindowStart(games);
            const visibleGames = games.slice(
              windowStart,
              windowStart + COMPETITION_GAMES_WINDOW_SIZE,
            );
            const canMoveUp = windowStart > 0;
            const canMoveDown =
              windowStart + COMPETITION_GAMES_WINDOW_SIZE < games.length;

            return (
              <Card key={comp.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base">{comp.name}</CardTitle>
                        {comp.team_label && (
                          <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 rounded px-1.5 py-0.5">
                            Equipa {comp.team_label}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {comp.season}
                        {comp.phase ? ` · ${comp.phase}` : ""}
                        {comp.total_rounds
                          ? ` · ${games.length}/${comp.total_rounds} jogos`
                          : ` · ${games.length} jogo${games.length !== 1 ? "s" : ""}`}
                        {comp.has_two_legs ? " · 2 mãos" : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditComp(comp)}
                        className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1 rounded-lg hover:bg-slate-100 transition-colors"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() =>
                          setConfirmDeleteId(
                            confirmDeleteId === comp.id ? null : comp.id,
                          )
                        }
                        disabled={deletingId === comp.id}
                        className="p-1.5 hover:bg-red-50 rounded-lg transition-colors group"
                      >
                        {deletingId === comp.id ? (
                          <Loader2
                            size={14}
                            className="text-slate-300 animate-spin"
                          />
                        ) : (
                          <Trash2
                            size={14}
                            className="text-slate-300 group-hover:text-red-500 transition-colors"
                          />
                        )}
                      </button>
                    </div>
                  </div>

                  {confirmDeleteId === comp.id && (
                    <div className="flex items-center gap-2 mt-2">
                      <p className="text-xs text-red-600 flex-1">
                        Eliminar esta competição e todos os jogos?
                      </p>
                      <button
                        onClick={() => handleDeleteComp(comp.id)}
                        className="text-xs font-semibold text-white bg-red-500 hover:bg-red-600 px-3 py-1 rounded-lg"
                      >
                        Eliminar
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="text-xs font-semibold text-slate-500 hover:text-slate-700 px-2 py-1 rounded-lg"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                </CardHeader>

                <CardContent className="pt-0 space-y-1">
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
                          game.location,
                          game.formatted_address,
                          game.location_address,
                        );
                        return (
                          <button
                            key={game.id}
                            onClick={() => router.push(`/games/${game.id}`)}
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
                                    isClosed ? "text-slate-600" : "text-slate-800"
                                  }`}
                                >
                                  {formatFixtureOpponentLabel({
                                    isHome: game.is_home,
                                    opponentName: game.opponent_name,
                                    opponentShortName: game.opponent_short_name,
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

                  {/* Adicionar jogo */}
                  {games.length === 0 && addingGameToCompId !== comp.id && (
                    <p className="text-xs text-slate-400 text-center py-2">
                      Ainda sem jogos nesta competição.
                    </p>
                  )}

                  {/* Adicionar jogo */}
                  <button
                    onClick={() => openAddGame(comp.id)}
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
          if (!open) closeGameForm();
        }}
        ageGroupId={ageGroupId}
        teamId={teamId}
        initialCompetitionId={addingGameToCompId}
        onSaved={handleGameSaved}
      />

      {/* ── MODAL: COMPETIÇÃO FORM ── */}
      {showCompForm && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-4"
          onClick={closeCompForm}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-md shadow-xl max-h-[calc(100dvh-1rem)] md:max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center p-5 border-b bg-white shrink-0">
              <h3 className="font-bold text-slate-900">
                {editingId ? "Editar competição" : "Nova competição"}
              </h3>
              <button onClick={closeCompForm}>
                <X size={20} className="text-slate-400" />
              </button>
            </div>

            <form
              onSubmit={handleSaveComp}
              className="p-5 space-y-4 overflow-y-auto flex-1 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              {error && (
                <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg border border-red-200">
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <Label>Nome da competição *</Label>
                <Input
                  value={compForm.name}
                  onChange={(e) =>
                    setCompForm((f) => ({ ...f, name: e.target.value }))
                  }
                  placeholder="ex: Campeonato Distrital"
                  required
                />
              </div>

              {footballFormat && (
                <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800">
                  <span className="font-semibold">Modalidade:</span>
                  <span>Futebol {footballFormat}</span>
                  <span className="text-blue-500 text-xs ml-auto">
                    (altera em Configurações → Escalão)
                  </span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Equipa</Label>
                  <select
                    value={compForm.team_label}
                    onChange={(e) =>
                      setCompForm((f) => ({
                        ...f,
                        team_label: (e.target.value as TeamLabel) || "A",
                      }))
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 bg-white text-sm text-slate-700"
                  >
                    <option value="A">Equipa A</option>
                    <option value="B">Equipa B</option>
                    <option value="C">Equipa C</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Fase / Série</Label>
                  <Input
                    value={compForm.phase}
                    onChange={(e) =>
                      setCompForm((f) => ({ ...f, phase: e.target.value }))
                    }
                    placeholder="ex: Série B"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Época</Label>
                  <Input
                    value={compForm.season}
                    onChange={(e) =>
                      setCompForm((f) => ({ ...f, season: e.target.value }))
                    }
                    placeholder="2025/2026"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Total de jornadas</Label>
                <Input
                  type="number"
                  min="1"
                  value={compForm.total_rounds}
                  onChange={(e) =>
                    setCompForm((f) => ({ ...f, total_rounds: e.target.value }))
                  }
                  placeholder="ex: 22"
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setCompForm((f) => ({
                      ...f,
                      has_two_legs: !f.has_two_legs,
                    }))
                  }
                  className={`w-10 h-6 rounded-full transition-colors flex-shrink-0 ${
                    compForm.has_two_legs ? "bg-emerald-500" : "bg-slate-200"
                  }`}
                >
                  <span
                    className={`block w-4 h-4 bg-white rounded-full shadow transition-transform mx-1 ${
                      compForm.has_two_legs ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
                <Label className="cursor-pointer">Jogo em casa e fora</Label>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="submit"
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                  disabled={savingComp}
                >
                  {savingComp ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : editingId ? (
                    "Guardar"
                  ) : (
                    "Criar competição"
                  )}
                </Button>
                <Button type="button" variant="outline" onClick={closeCompForm}>
                  Cancelar
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
