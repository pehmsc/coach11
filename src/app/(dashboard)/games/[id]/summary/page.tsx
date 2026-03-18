"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { pt } from "date-fns/locale";
import {
  AlertCircle,
  BarChart3,
  Download,
  FileText,
  Loader2,
  Pencil,
  RotateCcw,
  Save,
  Star,
  ThumbsDown,
  ThumbsUp,
  Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { StickyBackLink } from "@/components/navigation/StickyBackLink";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { resolveFixtureScoreboardShortNames } from "@/lib/games/display";
import { toast } from "sonner";
import { captureClientProductEvent } from "@/lib/observability/posthog-client";
import {
  exportMatchAttendancePDF,
  exportMatchReportPDF,
  exportMatchStatisticsPDF,
} from "@/lib/pdf/matchReport";
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

type ConvocationExportPlayer = {
  id: string;
  first_name: string;
  last_name: string;
  jersey_number: number | null;
  isConvocated: boolean;
  isExternal?: boolean;
};

type ConvocationExportPayload = {
  game: Game;
  players: ConvocationExportPlayer[];
  lineupStatuses: Record<string, string>;
  starterIds?: string[];
  convocationSelections?: Record<
    string,
    { responseStatus: string | null; isPresent: boolean | null }
  >;
};

type ExportKind = "report" | "attendance" | "statistics";

const EVENT_LABELS: Record<string, string> = {
  goal: "Golo",
  penalty_goal: "Golo (penálti)",
  own_goal: "Autogolo",
  assist: "Assistência",
  yellow_card: "Cartão amarelo",
  red_card: "Cartão vermelho",
  substitution_in: "Substituição",
  substitution_out: "Substituição",
};

function playerDisplayName(player: SummaryPlayer | null | undefined) {
  if (!player) return "—";
  const jersey = player.jersey_number ? `#${player.jersey_number} ` : "";
  return `${jersey}${player.first_name} ${player.last_name}`.trim();
}

function playerFullName(player: SummaryPlayer | null | undefined) {
  if (!player) return "Jogador";
  return `${player.first_name} ${player.last_name}`.trim();
}

function convocationPlayerDisplayName(player: ConvocationExportPlayer) {
  return `${player.first_name} ${player.last_name}`.trim();
}

function getGameStatusLabel(status: string | null | undefined) {
  switch (status) {
    case "completed":
      return "Concluído";
    case "live":
      return "Ao vivo";
    case "cancelled":
      return "Cancelado";
    default:
      return "Agendado";
  }
}

function getResponseStatusLabel(value: string | null | undefined) {
  switch (value) {
    case "confirmed":
    case "accepted":
      return "Confirmado";
    case "declined":
    case "rejected":
      return "Indisponível";
    case "pending":
      return "Por confirmar";
    default:
      return "—";
  }
}

function getPresenceLabel(value: boolean | null | undefined) {
  if (value === true) return "Presente";
  if (value === false) return "Ausente";
  return "—";
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
  const [exportingPdf, setExportingPdf] = useState<ExportKind | null>(null);
  const [convocationExport, setConvocationExport] =
    useState<ConvocationExportPayload | null>(null);

  // Post-match analysis
  const [positiveAspects, setPositiveAspects] = useState("");
  const [negativeAspects, setNegativeAspects] = useState("");
  const [coachNotes, setCoachNotes] = useState("");
  const [editingAnalysis, setEditingAnalysis] = useState(false);
  const [savingAnalysis, setSavingAnalysis] = useState(false);

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
      setPositiveAspects(payload.game.positive_aspects ?? "");
      setNegativeAspects(payload.game.negative_aspects ?? "");
      setCoachNotes(payload.game.coach_notes ?? "");
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
    const sorted = [...summary.events].sort((a, b) => {
      if (a.minute !== b.minute) return a.minute - b.minute;
      return (a.created_at || "").localeCompare(b.created_at || "");
    });
    return sorted.filter((event) => {
      if (event.event_type !== "substitution_in") return true;
      return !sorted.some(
        (other) =>
          other.event_type === "substitution_out" &&
          other.minute === event.minute &&
          other.player_id === event.related_player_id &&
          other.related_player_id === event.player_id,
      );
    });
  }, [summary]);

  const loadConvocationExport = useCallback(async () => {
    if (convocationExport) return convocationExport;

    const res = await fetch(`/api/games/${id}/convocation`, { cache: "no-store" });
    const payload = (await res.json().catch(() => null)) as
      | (ConvocationExportPayload & { error?: string })
      | null;

    if (!res.ok || !payload?.game) {
      throw new Error(payload?.error || "Erro ao carregar convocatória para exportação.");
    }

    setConvocationExport(payload);
    return payload;
  }, [convocationExport, id]);

  const capturePdfGenerated = useCallback(
    (source: string) => {
      if (!summary) return;

      captureClientProductEvent("pdf_generated", {
        game_id: summary.game.id,
        age_group_id: summary.game.age_group_id ?? null,
        team_id: summary.game.team_id ?? null,
        source,
      });
    },
    [summary],
  );

  function toggleStarter(playerId: string) {
    setStarterDraft((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  }

  async function handleExportReportPdf() {
    if (!summary) return;

    setExportingPdf("report");
    try {
      let squad:
        | Array<{
            jersey_number?: number;
            name: string;
            lineupLabel?: string;
          }>
        | undefined;

      try {
        const convocation = await loadConvocationExport();
        const starterIdSet = new Set(convocation.starterIds ?? []);
        squad = convocation.players
          .filter((player) => player.isConvocated)
          .map((player) => ({
            jersey_number: player.jersey_number ?? undefined,
            name: convocationPlayerDisplayName(player),
            lineupLabel: starterIdSet.has(player.id)
              ? "Titular"
              : convocation.lineupStatuses[player.id]
                ? "Suplente"
                : "Convocado",
          }))
          .sort((a, b) =>
            a.name.localeCompare(b.name, "pt", { sensitivity: "base" }),
          );
      } catch {
        squad = undefined;
      }

      const goalsConcededByPlayer = new Map<string, number>();
      summary.events.forEach((event) => {
        if (!event.player_id || !event.is_opponent_event) return;
        if (event.event_type !== "goal" && event.event_type !== "penalty_goal") return;
        goalsConcededByPlayer.set(event.player_id, (goalsConcededByPlayer.get(event.player_id) ?? 0) + 1);
      });

      await exportMatchReportPDF({
        gameDatetime: summary.game.game_datetime,
        opponentName: summary.game.opponent_name || "Adversário",
        ourTeamName: summary.homeClubShortName || summary.homeClubName || "Nós",
        isHome: summary.game.is_home,
        scoreHome: summary.game.score_home ?? 0,
        scoreAway: summary.game.score_away ?? 0,
        location: summary.game.location,
        title: summary.game.title,
        statusLabel: getGameStatusLabel(summary.game.status),
        events: timeline.map((event) => ({
          minute: event.minute,
          event_type: event.event_type,
          playerName: event.player_id
            ? playerFullName(summary.playersById[event.player_id])
            : undefined,
          relatedPlayerName: event.related_player_id
            ? playerFullName(summary.playersById[event.related_player_id])
            : undefined,
          is_opponent_event: event.is_opponent_event,
        })),
        players: summary.finalStats.map((row) => ({
          jersey_number: summary.playersById[row.player_id]?.jersey_number ?? undefined,
          name: playerFullName(summary.playersById[row.player_id]),
          lineupLabel: row.lineup_type === "starter" ? "Titular" : "Suplente",
          minutes_played: row.minutes_played ?? undefined,
          goals: row.goals ?? 0,
          own_goals: row.own_goals ?? 0,
          assists: row.assists ?? 0,
          goals_conceded: goalsConcededByPlayer.get(row.player_id) ?? 0,
          yellow_cards: row.yellow_cards ?? 0,
          red_cards: row.red_cards ?? 0,
        })),
        squad,
      });

      capturePdfGenerated("match_report_post_game");
      toast.success("Relatório de jogo exportado em PDF.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro ao exportar relatório do jogo.";
      toast.error(message);
    } finally {
      setExportingPdf(null);
    }
  }

  async function handleExportAttendancePdf() {
    if (!summary) return;

    setExportingPdf("attendance");
    try {
      const convocation = await loadConvocationExport();
      const starterIdSet = new Set(convocation.starterIds ?? []);
      const entries = convocation.players
        .filter((player) => player.isConvocated)
        .map((player) => ({
          jersey_number: player.jersey_number ?? undefined,
          name: convocationPlayerDisplayName(player),
          lineupLabel: starterIdSet.has(player.id)
            ? "Titular"
            : convocation.lineupStatuses[player.id]
              ? "Suplente"
              : "Convocado",
          confirmationLabel: player.isExternal
            ? "—"
            : getResponseStatusLabel(
                convocation.convocationSelections?.[player.id]?.responseStatus,
              ),
          presenceLabel: player.isExternal
            ? "—"
            : getPresenceLabel(convocation.convocationSelections?.[player.id]?.isPresent),
        }))
        .sort((a, b) => {
          const aStarter = a.lineupLabel === "Titular";
          const bStarter = b.lineupLabel === "Titular";
          if (aStarter !== bStarter) return aStarter ? -1 : 1;
          return a.name.localeCompare(b.name, "pt", { sensitivity: "base" });
        });

      await exportMatchAttendancePDF({
        gameDatetime: summary.game.game_datetime,
        opponentName: summary.game.opponent_name || "Adversário",
        ourTeamName: summary.homeClubShortName || summary.homeClubName || "Nós",
        isHome: summary.game.is_home,
        scoreHome: summary.game.score_home ?? 0,
        scoreAway: summary.game.score_away ?? 0,
        location: summary.game.location,
        title: summary.game.title,
        statusLabel: getGameStatusLabel(summary.game.status),
        entries,
      });

      capturePdfGenerated("attendance_map_post_game");
      toast.success("Mapa de presenças exportado em PDF.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro ao exportar mapa de presenças.";
      toast.error(message);
    } finally {
      setExportingPdf(null);
    }
  }

  async function handleExportStatisticsPdf() {
    if (!summary) return;

    setExportingPdf("statistics");
    try {
      const statsConcededByPlayer = new Map<string, number>();
      summary.events.forEach((event) => {
        if (!event.player_id || !event.is_opponent_event) return;
        if (event.event_type !== "goal" && event.event_type !== "penalty_goal") return;
        statsConcededByPlayer.set(event.player_id, (statsConcededByPlayer.get(event.player_id) ?? 0) + 1);
      });

      await exportMatchStatisticsPDF({
        gameDatetime: summary.game.game_datetime,
        opponentName: summary.game.opponent_name || "Adversário",
        ourTeamName: summary.homeClubShortName || summary.homeClubName || "Nós",
        isHome: summary.game.is_home,
        scoreHome: summary.game.score_home ?? 0,
        scoreAway: summary.game.score_away ?? 0,
        location: summary.game.location,
        title: summary.game.title,
        statusLabel: getGameStatusLabel(summary.game.status),
        players: summary.finalStats.map((row) => ({
          jersey_number: summary.playersById[row.player_id]?.jersey_number ?? undefined,
          name: playerFullName(summary.playersById[row.player_id]),
          lineupLabel: row.lineup_type === "starter" ? "Titular" : "Suplente",
          minutes_played: row.minutes_played ?? undefined,
          goals: row.goals ?? 0,
          own_goals: row.own_goals ?? 0,
          assists: row.assists ?? 0,
          goals_conceded: statsConcededByPlayer.get(row.player_id) ?? 0,
          yellow_cards: row.yellow_cards ?? 0,
          red_cards: row.red_cards ?? 0,
        })),
      });

      capturePdfGenerated("match_statistics_post_game");
      toast.success("Estatísticas finais exportadas em PDF.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro ao exportar estatísticas finais.";
      toast.error(message);
    } finally {
      setExportingPdf(null);
    }
  }

  async function handleSaveAnalysis() {
    setSavingAnalysis(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("games")
        .update({
          positive_aspects: positiveAspects || null,
          negative_aspects: negativeAspects || null,
          coach_notes: coachNotes || null,
        })
        .eq("id", id);
      if (error) {
        toast.error("Erro ao guardar análise.");
      } else {
        toast.success("Análise pós-jogo guardada");
        setEditingAnalysis(false);
      }
    } catch {
      toast.error("Erro ao guardar análise.");
    } finally {
      setSavingAnalysis(false);
    }
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
        <div className="mt-4 flex justify-center">
          <StickyBackLink
            href="/games"
            label="Voltar aos jogos"
            sticky={false}
            wrapperClassName="bg-transparent px-0 py-0"
          />
        </div>
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
      <StickyBackLink
        href="/games"
        label="Voltar aos jogos"
        wrapperClassName="-mx-4 mb-4 bg-slate-50/95 px-4 py-2 md:-mx-8 md:px-8"
      />

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

      <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700">
            <Download size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Exportações PDF
            </p>
            <h2 className="mt-1 text-base font-bold text-slate-900">
              Documentos pós-jogo
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Exporta o relatório final, o mapa de presenças e as estatísticas
              reais deste jogo concluído.
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleExportReportPdf()}
            disabled={exportingPdf !== null}
            className="justify-start"
          >
            {exportingPdf === "report" ? (
              <Loader2 size={16} className="mr-2 animate-spin" />
            ) : (
              <FileText size={16} className="mr-2" />
            )}
            Relatório do jogo
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={() => void handleExportAttendancePdf()}
            disabled={exportingPdf !== null}
            className="justify-start"
          >
            {exportingPdf === "attendance" ? (
              <Loader2 size={16} className="mr-2 animate-spin" />
            ) : (
              <Users size={16} className="mr-2" />
            )}
            Mapa de presenças
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={() => void handleExportStatisticsPdf()}
            disabled={exportingPdf !== null}
            className="justify-start"
          >
            {exportingPdf === "statistics" ? (
              <Loader2 size={16} className="mr-2 animate-spin" />
            ) : (
              <BarChart3 size={16} className="mr-2" />
            )}
            Estatísticas do jogo
          </Button>
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
                : event.event_type === "substitution_out"
                  ? playerDisplayName(related)
                  : playerDisplayName(player);
              const relationLabel =
                event.event_type === "substitution_out" && player
                  ? ` ➜ ${playerDisplayName(player)}`
                  : event.event_type === "substitution_in" && related
                    ? ` ➜ ${playerDisplayName(related)}`
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

      {/* Análise pós-jogo */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 mb-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-slate-500 uppercase">Análise Pós-Jogo</p>
          {summary.isCoordinator && !editingAnalysis && (
            <button
              type="button"
              onClick={() => setEditingAnalysis(true)}
              className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
            >
              <Pencil size={12} /> Editar
            </button>
          )}
          {editingAnalysis && (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditingAnalysis(false);
                  setPositiveAspects(summary.game.positive_aspects ?? "");
                  setNegativeAspects(summary.game.negative_aspects ?? "");
                  setCoachNotes(summary.game.coach_notes ?? "");
                }}
                disabled={savingAnalysis}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={() => void handleSaveAnalysis()}
                disabled={savingAnalysis}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {savingAnalysis ? <Loader2 size={13} className="mr-1 animate-spin" /> : <Save size={13} className="mr-1" />}
                Guardar
              </Button>
            </div>
          )}
        </div>

        {game.opponent_tactical_system && (
          <div className="mb-3 text-sm text-slate-600">
            <span className="font-medium">Sistema táctico adversário:</span>{" "}
            <span className="font-semibold text-slate-800">{game.opponent_tactical_system}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <ThumbsUp size={14} className="text-emerald-600" />
              <p className="text-xs font-semibold text-emerald-700">Aspectos Positivos</p>
            </div>
            {editingAnalysis ? (
              <textarea
                className="w-full rounded-md border border-emerald-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-emerald-300 focus:outline-none focus:ring-1 focus:ring-emerald-300 min-h-[80px] resize-y"
                value={positiveAspects}
                onChange={(e) => setPositiveAspects(e.target.value)}
                placeholder="O que correu bem..."
              />
            ) : (
              <p className="text-sm text-slate-700 whitespace-pre-wrap">
                {positiveAspects || <span className="text-slate-400 italic">Sem registos</span>}
              </p>
            )}
          </div>

          <div className="rounded-lg border border-red-200 bg-red-50/50 p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <ThumbsDown size={14} className="text-red-600" />
              <p className="text-xs font-semibold text-red-700">Aspectos a Melhorar</p>
            </div>
            {editingAnalysis ? (
              <textarea
                className="w-full rounded-md border border-red-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-red-300 focus:outline-none focus:ring-1 focus:ring-red-300 min-h-[80px] resize-y"
                value={negativeAspects}
                onChange={(e) => setNegativeAspects(e.target.value)}
                placeholder="O que pode melhorar..."
              />
            ) : (
              <p className="text-sm text-slate-700 whitespace-pre-wrap">
                {negativeAspects || <span className="text-slate-400 italic">Sem registos</span>}
              </p>
            )}
          </div>
        </div>

        {(editingAnalysis || coachNotes) && (
          <div className="mt-3">
            <p className="text-xs font-semibold text-slate-500 mb-1.5">Notas do Treinador</p>
            {editingAnalysis ? (
              <textarea
                className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-300 min-h-[60px] resize-y"
                value={coachNotes}
                onChange={(e) => setCoachNotes(e.target.value)}
                placeholder="Notas adicionais..."
              />
            ) : (
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{coachNotes}</p>
            )}
          </div>
        )}
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
