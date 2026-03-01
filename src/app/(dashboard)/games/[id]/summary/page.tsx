"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { pt } from "date-fns/locale";
import { ArrowLeft, Star, AlertCircle, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { resolveFixtureScoreboardShortNames } from "@/lib/games/display";
import type { Game, GameEvent, GameFinalStats } from "@/types/database";

type SummaryPlayer = {
  id: string;
  first_name: string;
  last_name: string;
  jersey_number: number | null;
  preferred_position: string | null;
};

type SummaryPayload = {
  game: Game;
  isCoordinator: boolean;
  events: GameEvent[];
  finalStats: GameFinalStats[];
  playersById: Record<string, SummaryPlayer>;
  totalMinutes: number;
  homeClubName: string | null;
  homeClubShortName: string | null;
};

const EVENT_LABELS: Record<string, string> = {
  goal: "Golo",
  penalty_goal: "Golo (penálti)",
  own_goal: "Autogolo",
  assist: "Assistência",
  yellow_card: "Cartão amarelo",
  red_card: "Cartão vermelho",
  substitution_in: "Substituição (entra)",
  substitution_out: "Substituição (sai)",
};

function playerDisplayName(player: SummaryPlayer | null | undefined) {
  if (!player) return "—";
  const jersey = player.jersey_number ? `#${player.jersey_number} ` : "";
  return `${jersey}${player.first_name} ${player.last_name}`.trim();
}

export default function GameSummaryPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [summary, setSummary] = useState<SummaryPayload | null>(null);
  const [editing, setEditing] = useState(false);
  const [savingRecalc, setSavingRecalc] = useState(false);
  const [ratingDraft, setRatingDraft] = useState<Record<string, string>>({});
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});
  const [mvpDraft, setMvpDraft] = useState<string | null>(null);
  const [starterDraft, setStarterDraft] = useState<Set<string>>(new Set());
  const [finalMinuteDraft, setFinalMinuteDraft] = useState<string>("90");

  const syncDraftsFromSummary = useCallback((payload: SummaryPayload) => {
    setRatingDraft(() => {
      const next: Record<string, string> = {};
      payload.finalStats.forEach((row) => {
        next[row.player_id] = typeof row.coach_rating === "number" ? String(row.coach_rating) : "";
      });
      return next;
    });
    setNotesDraft(() => {
      const next: Record<string, string> = {};
      payload.finalStats.forEach((row) => {
        next[row.player_id] = typeof row.notes === "string" ? row.notes : "";
      });
      return next;
    });
    setMvpDraft(payload.finalStats.find((row) => row.is_mvp)?.player_id ?? null);
    setStarterDraft(
      new Set(
        payload.finalStats
          .filter((row) => row.lineup_type === "starter")
          .map((row) => row.player_id),
      ),
    );
    setFinalMinuteDraft(String(payload.totalMinutes));
  }, []);

  const loadSummary = useCallback(async (options?: {
    keepLoading?: boolean;
    throwOnError?: boolean;
  }) => {
    const shouldSetLoading = options?.keepLoading !== false;
    if (shouldSetLoading) setLoading(true);
    setLoadError(null);

    try {
      const res = await fetch(`/api/games/${id}/summary`, { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as
        | (SummaryPayload & { error?: string })
        | null;

      if (!res.ok || !payload?.game) {
        throw new Error(payload?.error || "Erro ao carregar sumário do jogo.");
      }

      setSummary(payload);
      syncDraftsFromSummary(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao carregar sumário.";
      setLoadError(message);
      if (options?.throwOnError) {
        throw err;
      }
    } finally {
      if (shouldSetLoading) setLoading(false);
    }
  }, [id, syncDraftsFromSummary]);

  useEffect(() => {
    let active = true;

    const run = async () => {
      try {
        if (!active) return;
        await loadSummary();
      } catch {
        if (active) setLoading(false);
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [loadSummary]);

  useEffect(() => {
    if (summary?.game?.status && summary.game.status !== "completed") {
      router.replace(`/games/${id}`);
    }
  }, [summary?.game?.status, id, router]);

  const timeline = useMemo(() => {
    if (!summary) return [];
    return [...summary.events].sort((a, b) => {
      if (a.minute !== b.minute) return a.minute - b.minute;
      return (a.created_at || "").localeCompare(b.created_at || "");
    });
  }, [summary]);

  function toggleStarter(playerId: string) {
    setStarterDraft((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  }

  async function handleRecalculateStats() {
    if (!summary?.isCoordinator) return;

    const finalMinute = parseInt(finalMinuteDraft, 10);
    if (!Number.isFinite(finalMinute) || finalMinute < 1) {
      setActionError("Minuto final inválido.");
      return;
    }

    const ratingsPayload: Record<string, number | null> = {};
    Object.entries(ratingDraft).forEach(([playerId, value]) => {
      if (value.trim() === "") {
        ratingsPayload[playerId] = null;
        return;
      }
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 10) {
        ratingsPayload[playerId] = parsed;
      }
    });

    const notesPayload: Record<string, string | null> = {};
    Object.entries(notesDraft).forEach(([playerId, value]) => {
      const normalized = value.trim();
      notesPayload[playerId] = normalized.length > 0 ? normalized : null;
    });

    setSavingRecalc(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/games/${id}/summary/recalculate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          finalMinute,
          ratings: ratingsPayload,
          notes: notesPayload,
          mvpPlayerId: mvpDraft,
          starterIds: Array.from(starterDraft),
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (payload as { error?: string } | null)?.error ||
            "Erro ao recalcular estatísticas.",
        );
      }
      await loadSummary({ keepLoading: false, throwOnError: true });
      setEditing(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro ao recalcular estatísticas.";
      setActionError(message);
    } finally {
      setSavingRecalc(false);
    }
  }

  if (loading) {
    return (
      <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-56 w-full rounded-xl" />
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="p-4 md:p-8 max-w-3xl mx-auto text-center py-16">
        <AlertCircle size={40} className="text-red-400 mx-auto mb-3" />
        <p className="text-slate-700">{loadError || "Erro ao carregar sumário."}</p>
        <Button variant="outline" className="mt-4" onClick={() => router.back()}>
          Voltar
        </Button>
      </div>
    );
  }

  const game = summary.game;
  const mvp = summary.finalStats.find((row) => row.is_mvp);
  const matchDateTimeLabel = game.game_datetime
    ? format(parseISO(game.game_datetime), "d MMM · HH:mm", { locale: pt })
    : "Sem data";
  const matchMetaLabel = game.location
    ? `${matchDateTimeLabel} · ${game.location}`
    : matchDateTimeLabel;
  const { homeShortName, awayShortName } = resolveFixtureScoreboardShortNames({
    isHome: game.is_home,
    ourTeamPreferredShortName: summary.homeClubShortName,
    ourTeamName: summary.homeClubName,
    opponentPreferredShortName: game.opponent_short_name,
    opponentName: game.opponent_name || "Adversário",
  });

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto pb-16">
      <button
        onClick={() => router.push("/games")}
        className="flex items-center gap-2 text-slate-500 hover:text-slate-700 text-sm mb-4"
      >
        <ArrowLeft size={16} /> Jogos
      </button>

      {actionError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm px-3 py-2">
          {actionError}
        </div>
      )}

      {summary.isCoordinator && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-semibold text-amber-800 uppercase mb-2">
            Modo Coordenador
          </p>
          {!editing ? (
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => router.push(`/games/${id}?correction=1`)}
                variant="outline"
                className="border-amber-300 text-amber-900"
              >
                <RotateCcw size={14} className="mr-2" />
                Corrigir convocatória
              </Button>
              <Button
                onClick={() => {
                  setActionError(null);
                  setEditing(true);
                }}
                variant="outline"
                className="border-amber-300 text-amber-900"
              >
                <RotateCcw size={14} className="mr-2" />
                Refazer Final Stats
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <label className="text-sm text-amber-900 font-medium">
                  Minuto final
                </label>
                <input
                  type="number"
                  min={1}
                  value={finalMinuteDraft}
                  onChange={(event) => setFinalMinuteDraft(event.target.value)}
                  className="w-24 rounded-md border border-amber-300 bg-white px-2 py-1 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => void handleRecalculateStats()}
                  disabled={savingRecalc}
                  className="bg-amber-600 hover:bg-amber-700"
                >
                  {savingRecalc ? (
                    <Loader2 size={14} className="mr-2 animate-spin" />
                  ) : (
                    <RotateCcw size={14} className="mr-2" />
                  )}
                  Recalcular e Guardar
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setActionError(null);
                    syncDraftsFromSummary(summary);
                    setEditing(false);
                  }}
                  disabled={savingRecalc}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="rounded-2xl bg-slate-900 text-white p-5 mb-5 text-center">
        <p className="text-slate-300 text-sm">{matchMetaLabel}</p>
        <div className="text-3xl md:text-4xl font-black tracking-tight mt-1">
          {homeShortName} {game.score_home ?? 0} – {game.score_away ?? 0} {awayShortName}
        </div>
        <div className="mt-2 flex items-center justify-center gap-4 text-xs text-slate-300">
          <span>
            {String(summary.totalMinutes).padStart(2, "0")}:00 · {summary.totalMinutes}&apos;
          </span>
          {mvp && (
            <span className="inline-flex items-center gap-1 text-amber-300">
              <Star size={12} /> MVP:{" "}
              {playerDisplayName(summary.playersById[mvp.player_id])}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Timeline</p>
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {timeline.length === 0 && (
              <p className="text-sm text-slate-500">Sem eventos registados.</p>
            )}
            {timeline.map((event) => {
              const player = event.player_id ? summary.playersById[event.player_id] : null;
              const related = event.related_player_id
                ? summary.playersById[event.related_player_id]
                : null;
              const baseLabel = EVENT_LABELS[event.event_type] || event.event_type;
              const actorLabel = event.is_opponent_event
                ? player
                  ? `Adversário (associado: ${playerDisplayName(player)})`
                  : "Adversário"
                : playerDisplayName(player);
              const relationLabel =
                event.event_type === "substitution_out" && related
                  ? ` → entra ${playerDisplayName(related)}`
                  : event.event_type === "substitution_in" && related
                    ? ` ← sai ${playerDisplayName(related)}`
                    : event.event_type === "goal" && related
                      ? ` (assistência: ${playerDisplayName(related)})`
                      : "";

              return (
                <div
                  key={event.id}
                  className="flex items-start gap-3 p-2.5 rounded-lg border border-slate-100 bg-slate-50"
                >
                  <span className="w-10 text-xs text-slate-500 text-right mt-0.5">
                    {event.minute}&apos;
                  </span>
                  <span className="text-sm text-slate-700">
                    <strong>{baseLabel}</strong> · {actorLabel}
                    {relationLabel}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Resumo final</p>
          <div className="space-y-2 text-sm text-slate-700">
            <div className="flex items-center justify-between">
              <span>Estado</span>
              <span className="font-semibold text-emerald-700">Concluído</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Duração</span>
              <span className="font-semibold">{summary.totalMinutes}&apos;</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Eventos</span>
              <span className="font-semibold">{timeline.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Jogadores com stats</span>
              <span className="font-semibold">{summary.finalStats.length}</span>
            </div>
            {mvp && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-amber-900">
                <p className="text-xs font-semibold uppercase mb-0.5">MVP</p>
                <p className="font-semibold">{playerDisplayName(summary.playersById[mvp.player_id])}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
          <p className="font-bold text-slate-900 text-sm">Estatísticas finais dos jogadores</p>
        </div>
        {summary.finalStats.length === 0 ? (
          <div className="p-4 text-sm text-slate-500">
            Este jogo não tem linhas em <code>game_final_stats</code>.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {summary.finalStats.map((row) => {
              const player = summary.playersById[row.player_id];
              const isStarterDraft = starterDraft.has(row.player_id);
              const isMvpDraft = mvpDraft === row.player_id;
              return (
                <div key={row.id} className="px-4 py-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-slate-800">
                      {playerDisplayName(player)}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                        {isStarterDraft ? "Titular" : "Suplente"}
                      </span>
                      {isMvpDraft && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                          MVP
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-slate-600 flex flex-wrap gap-x-3 gap-y-1">
                    <span>{row.minutes_played ?? 0}&apos;</span>
                    <span>G: {row.goals ?? 0}</span>
                    <span>AG: {row.own_goals ?? 0}</span>
                    <span>A: {row.assists ?? 0}</span>
                    <span>CA: {row.yellow_cards ?? 0}</span>
                    <span>CV: {row.red_cards ?? 0}</span>
                    {!editing ? (
                      <span>Nota: {row.coach_rating ?? "—"}</span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        Nota:
                        <input
                          type="number"
                          min={0}
                          max={10}
                          step={0.5}
                          value={ratingDraft[row.player_id] ?? ""}
                          onChange={(event) =>
                            setRatingDraft((prev) => ({
                              ...prev,
                              [row.player_id]: event.target.value,
                            }))
                          }
                          className="w-16 rounded border border-slate-300 px-1.5 py-0.5 text-xs"
                        />
                      </span>
                    )}
                    {!editing ? (
                      <span className="w-full">Observações: {row.notes?.trim() ? row.notes : "—"}</span>
                    ) : (
                      <span className="w-full inline-flex items-center gap-1">
                        Observações:
                        <input
                          type="text"
                          value={notesDraft[row.player_id] ?? ""}
                          onChange={(event) =>
                            setNotesDraft((prev) => ({
                              ...prev,
                              [row.player_id]: event.target.value,
                            }))
                          }
                          className="flex-1 min-w-[220px] rounded border border-slate-300 px-1.5 py-0.5 text-xs"
                          placeholder="Sem observações"
                        />
                      </span>
                    )}
                  </div>
                  {editing && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleStarter(row.player_id)}
                        className={`text-xs px-2 py-1 rounded border ${
                          isStarterDraft
                            ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                            : "border-slate-300 bg-white text-slate-600"
                        }`}
                      >
                        {isStarterDraft ? "Titular" : "Suplente"}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setMvpDraft((prev) =>
                            prev === row.player_id ? null : row.player_id,
                          )
                        }
                        className={`text-xs px-2 py-1 rounded border ${
                          isMvpDraft
                            ? "border-amber-400 bg-amber-50 text-amber-700"
                            : "border-slate-300 bg-white text-slate-600"
                        }`}
                      >
                        {isMvpDraft ? "MVP ✓" : "Marcar MVP"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
