"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { pt } from "date-fns/locale";
import {
  AlertCircle,
  BarChart3,
  Download,
  FileText,
  Loader2,
  Pencil,
  Star,
  Users,
} from "lucide-react";
import { StickyBackLink } from "@/components/navigation/StickyBackLink";
import { Breadcrumb, type BreadcrumbItem } from "@/components/navigation/Breadcrumb";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DeleteGameModal } from "@/components/games/detail/DeleteGameModal";
import { LineupCorrectionModal } from "@/components/games/summary/LineupCorrectionModal";
import { SummaryActionsMenu } from "@/components/games/summary/SummaryActionsMenu";
import { Skeleton } from "@/components/ui/skeleton";
import { resolveFixtureScoreboardShortNames } from "@/lib/games/display";
import { formatCardEventLabel } from "@/lib/games/format-card-event-label";
import type { PlayerOverride } from "@/lib/schemas/game-recalculate";
import { toast } from "sonner";
import { captureClientProductEvent } from "@/lib/observability/posthog-client";
import {
  exportMatchAttendancePDF,
  exportMatchReportPDF,
  exportMatchStatisticsPDF,
} from "@/lib/pdf/matchReport";
import { sortSquadForReport } from "@/lib/games/sort-squad-for-report";
import { useAgeGroupMeta } from "@/hooks/useAgeGroupName";
import { MatchSheetSummarySection } from "./MatchSheetSummarySection";
import type { Game, GameEvent, GameFinalStats } from "@/types/database";

type SummaryPlayer = {
  id: string;
  first_name: string;
  last_name: string;
  jersey_number: number | null;
  preferred_position: string | null;
};

type GameStatus = "scheduled" | "live" | "completed" | "cancelled";

type SummaryPayload = {
  game: Game;
  isCoordinator: boolean;
  canEdit: boolean;
  gameStatus: GameStatus;
  events: GameEvent[];
  finalStats: GameFinalStats[];
  playersById: Record<string, SummaryPlayer>;
  totalMinutes: number;
  homeClubName: string | null;
  homeClubShortName: string | null;
};

type NumericDraft = {
  minutes_played?: number;
  goals?: number;
  own_goals?: number;
  assists?: number;
  yellow_cards?: number;
  red_cards?: number;
};

type ConvocationExportPlayer = {
  id: string;
  first_name: string;
  last_name: string;
  jersey_number: number | null;
  preferred_position: string | null;
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

export type GameSummaryScope = {
  /** Items que prefixam o breadcrumb (último — "Sumário" — é injectado automaticamente). */
  breadcrumbItemsPrefix: BreadcrumbItem[];
  /** URL de fallback para "Voltar ao jogo". */
  detailHref: string;
  /** URL da lista de jogos do scope (usado quando o jogo é apagado). */
  gamesListHref: string;
  /** Chave do useReturnTo. */
  returnToKey: string;
  /** Label do StickyBackLink. */
  backLabel: string;
};

interface Props {
  gameId: string;
  /** Quando omitido, usa scope global. */
  scope?: GameSummaryScope;
}

export function GameSummaryView({ gameId, scope }: Props) {
  const id = gameId;
  const effectiveScope: GameSummaryScope = scope ?? {
    breadcrumbItemsPrefix: [{ label: "Jogos", href: "/games" }],
    detailHref: `/games/${id}`,
    gamesListHref: "/games",
    returnToKey: "games",
    backLabel: "Voltar ao jogo",
  };
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [summary, setSummary] = useState<SummaryPayload | null>(null);
  const { football_format: footballFormat } = useAgeGroupMeta(
    summary?.game?.age_group_id ?? null,
  );
  const [editing, setEditing] = useState(false);
  const [savingRecalc, setSavingRecalc] = useState(false);
  const [ratingDraft, setRatingDraft] = useState<Record<string, string>>({});
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});
  const [mvpDraft, setMvpDraft] = useState<string | null>(null);
  const [starterDraft, setStarterDraft] = useState<Set<string>>(new Set());
  const [finalMinuteDraft, setFinalMinuteDraft] = useState<string>("90");
  const [numericDrafts, setNumericDrafts] = useState<Record<string, NumericDraft>>({});
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [exportingPdf, setExportingPdf] = useState<ExportKind | null>(null);
  const [convocationExport, setConvocationExport] =
    useState<ConvocationExportPayload | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingGame, setDeletingGame] = useState(false);
  const [showLineupCorrection, setShowLineupCorrection] = useState(false);

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
    setNumericDrafts({});
  }, []);

  const updateNumericDraft = useCallback(
    (playerId: string, field: keyof NumericDraft, raw: string) => {
      setNumericDrafts((prev) => {
        const trimmed = raw.trim();
        if (trimmed === "") {
          // Limpar o draft volta ao valor original do servidor (sem override).
          const current = { ...(prev[playerId] ?? {}) };
          delete current[field];
          if (Object.keys(current).length === 0) {
            const next = { ...prev };
            delete next[playerId];
            return next;
          }
          return { ...prev, [playerId]: current };
        }
        const value = Number(trimmed);
        if (!Number.isFinite(value) || value < 0) return prev;
        return {
          ...prev,
          [playerId]: { ...(prev[playerId] ?? {}), [field]: Math.floor(value) },
        };
      });
    },
    [],
  );

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
      router.replace(effectiveScope.detailHref);
    }
  }, [summary?.game?.status, router, effectiveScope.detailHref]);

  const hasAnyManualRow = useMemo(
    () => summary?.finalStats?.some((row) => row.edited_manually === true) ?? false,
    [summary?.finalStats],
  );

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
            preferred_position?: string | null;
          }>
        | undefined;

      try {
        const convocation = await loadConvocationExport();
        const starterIdSet = new Set(convocation.starterIds ?? []);
        const squadRaw = convocation.players
          .filter((player) => player.isConvocated)
          .map((player) => ({
            jersey_number: player.jersey_number ?? undefined,
            name: convocationPlayerDisplayName(player),
            lineupLabel: starterIdSet.has(player.id)
              ? "Titular"
              : convocation.lineupStatuses[player.id]
                ? "Suplente"
                : "Convocado",
            preferred_position: player.preferred_position ?? null,
          }));
        squad = sortSquadForReport(squadRaw);
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
        players: sortSquadForReport(
          summary.finalStats.map((row) => ({
            jersey_number: summary.playersById[row.player_id]?.jersey_number ?? undefined,
            name: playerFullName(summary.playersById[row.player_id]),
            lineupLabel: row.lineup_type === "starter" ? "Titular" : "Suplente",
            preferred_position:
              summary.playersById[row.player_id]?.preferred_position ?? null,
            minutes_played: row.minutes_played ?? undefined,
            goals: row.goals ?? 0,
            own_goals: row.own_goals ?? 0,
            assists: row.assists ?? 0,
            goals_conceded: goalsConcededByPlayer.get(row.player_id) ?? 0,
            yellow_cards: row.yellow_cards ?? 0,
            red_cards: row.red_cards ?? 0,
          })),
        ),
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
      const entriesRaw = convocation.players
        .filter((player) => player.isConvocated)
        .map((player) => ({
          jersey_number: player.jersey_number ?? undefined,
          name: convocationPlayerDisplayName(player),
          lineupLabel: starterIdSet.has(player.id)
            ? "Titular"
            : convocation.lineupStatuses[player.id]
              ? "Suplente"
              : "Convocado",
          preferred_position: player.preferred_position ?? null,
          confirmationLabel: player.isExternal
            ? "—"
            : getResponseStatusLabel(
                convocation.convocationSelections?.[player.id]?.responseStatus,
              ),
          presenceLabel: player.isExternal
            ? "—"
            : getPresenceLabel(convocation.convocationSelections?.[player.id]?.isPresent),
        }));
      const entries = sortSquadForReport(entriesRaw);

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
        players: sortSquadForReport(
          summary.finalStats.map((row) => ({
            jersey_number: summary.playersById[row.player_id]?.jersey_number ?? undefined,
            name: playerFullName(summary.playersById[row.player_id]),
            lineupLabel: row.lineup_type === "starter" ? "Titular" : "Suplente",
            preferred_position:
              summary.playersById[row.player_id]?.preferred_position ?? null,
            minutes_played: row.minutes_played ?? undefined,
            goals: row.goals ?? 0,
            own_goals: row.own_goals ?? 0,
            assists: row.assists ?? 0,
            goals_conceded: statsConcededByPlayer.get(row.player_id) ?? 0,
            yellow_cards: row.yellow_cards ?? 0,
            red_cards: row.red_cards ?? 0,
          })),
        ),
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

  async function submitRecalculate(opts: { forceAuto?: boolean } = {}) {
    if (!summary?.canEdit) return;

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

    // Construir overrides em modo normal apenas. Em force_auto, ignoramos
    // tudo o que o user tenha em drafts numéricos — voltamos a auto-cálculo.
    const overrides: Record<string, PlayerOverride> = {};
    if (!opts.forceAuto) {
      summary.finalStats.forEach((row) => {
        const playerId = row.player_id;
        const draft = numericDrafts[playerId];
        const override: PlayerOverride = {};

        if (draft) {
          if (
            draft.minutes_played !== undefined &&
            draft.minutes_played !== row.minutes_played
          ) {
            override.minutes_played = draft.minutes_played;
          }
          if (draft.goals !== undefined && draft.goals !== row.goals) {
            override.goals = draft.goals;
          }
          if (draft.own_goals !== undefined && draft.own_goals !== row.own_goals) {
            override.own_goals = draft.own_goals;
          }
          if (draft.assists !== undefined && draft.assists !== row.assists) {
            override.assists = draft.assists;
          }
          if (
            draft.yellow_cards !== undefined &&
            draft.yellow_cards !== row.yellow_cards
          ) {
            override.yellow_cards = draft.yellow_cards;
          }
          if (draft.red_cards !== undefined && draft.red_cards !== row.red_cards) {
            override.red_cards = draft.red_cards;
          }
        }

        if (Object.keys(override).length > 0) {
          overrides[playerId] = override;
        }
      });
    }

    setSavingRecalc(true);
    setActionError(null);
    try {
      const body: Record<string, unknown> = {
        finalMinute,
        ratings: ratingsPayload,
        notes: notesPayload,
        mvpPlayerId: mvpDraft,
        starterIds: Array.from(starterDraft),
      };
      if (Object.keys(overrides).length > 0) {
        body.overrides = overrides;
      }
      if (opts.forceAuto) {
        body.force_auto = true;
      }

      const res = await fetch(`/api/games/${id}/summary/recalculate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (payload as { error?: string } | null)?.error ||
            "Erro ao guardar estatísticas.",
        );
      }
      await loadSummary({ keepLoading: false, throwOnError: true });
      setEditing(false);
      if (opts.forceAuto) {
        toast.success("Stats recalculadas a partir dos eventos do jogo.");
      } else {
        toast.success("Estatísticas atualizadas.");
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro ao guardar estatísticas.";
      setActionError(message);
    } finally {
      setSavingRecalc(false);
    }
  }

  async function handleDeleteGame() {
    if (!summary?.isCoordinator) return;
    setDeletingGame(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/games/${id}`, { method: "DELETE" });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !(payload as { success?: boolean })?.success) {
        setActionError(
          (payload as { error?: string })?.error || "Erro ao apagar jogo.",
        );
        return;
      }
      toast.success("Jogo apagado com sucesso.");
      router.replace(effectiveScope.gamesListHref);
      router.refresh();
    } catch {
      setActionError("Erro de ligação ao apagar jogo.");
    } finally {
      setDeletingGame(false);
      setShowDeleteConfirm(false);
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
        href={effectiveScope.detailHref}
        label={effectiveScope.backLabel}
        wrapperClassName="-mx-4 mb-4 bg-slate-50/95 px-4 py-2 md:-mx-8 md:px-8"
      >
        <Breadcrumb
          items={[
            ...effectiveScope.breadcrumbItemsPrefix,
            {
              label: game.opponent_name ? `vs ${game.opponent_name}` : "Jogo",
              href: effectiveScope.detailHref,
            },
            { label: "Sumário" },
          ]}
        />
      </StickyBackLink>

      {actionError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm px-3 py-2">
          {actionError}
        </div>
      )}

      {summary.gameStatus === "live" && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">Jogo em curso</p>
            <p className="mt-0.5 text-amber-800">
              A edição de stats finais está bloqueada enquanto o jogo está em curso. Termina o jogo primeiro.
            </p>
          </div>
        </div>
      )}

      {summary.gameStatus === "scheduled" && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">Jogo ainda não terminado</p>
            <p className="mt-0.5 text-amber-800">
              Os stats finais só podem ser editados após o jogo ser marcado como terminado.
            </p>
          </div>
        </div>
      )}

      {summary.canEdit && (
        <div className="-mt-2 mb-4 flex justify-end">
          <SummaryActionsMenu
            canEdit={summary.canEdit}
            isCoordinator={summary.isCoordinator}
            gameStatus={summary.gameStatus}
            hasAnyManualRow={hasAnyManualRow}
            detailHref={effectiveScope.detailHref}
            onEditStats={() => {
              setActionError(null);
              setEditing(true);
            }}
            onResetAuto={() => setResetConfirmOpen(true)}
            onCorrectLineup={() => {
              setActionError(null);
              setShowLineupCorrection(true);
            }}
            onDelete={() => {
              setActionError(null);
              setShowDeleteConfirm(true);
            }}
            disabled={editing}
          />
        </div>
      )}

      {editing && (
        <div className="mb-4 space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-semibold uppercase text-amber-800">
            A editar estatísticas finais
          </p>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-amber-900">
              Minuto final
            </label>
            <input
              type="number"
              min={1}
              max={200}
              value={finalMinuteDraft}
              onChange={(event) => setFinalMinuteDraft(event.target.value)}
              className="w-24 rounded-md border border-amber-300 bg-white px-2 py-1 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => void submitRecalculate()}
              disabled={savingRecalc}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {savingRecalc ? (
                <Loader2 size={14} className="mr-2 animate-spin" />
              ) : (
                <Pencil size={14} className="mr-2" />
              )}
              Guardar
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
              const baseLabel =
                event.event_type === "yellow_card" || event.event_type === "red_card"
                  ? formatCardEventLabel(event, summary.events)
                  : EVENT_LABELS[event.event_type] || event.event_type;
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

      <MatchSheetSummarySection
        game={summary.game}
        canEdit={summary.canEdit}
        footballFormat={footballFormat ?? null}
        onSaved={() => {
          void loadSummary({ keepLoading: false });
        }}
      />

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
                    <p className="font-semibold text-slate-800 inline-flex items-center gap-1.5">
                      {playerDisplayName(player)}
                      {row.edited_manually && (
                        <span
                          className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700"
                          title="Stats deste jogador foram editadas manualmente"
                        >
                          Manual
                        </span>
                      )}
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
                    {!editing ? (
                      <>
                        <span>{row.minutes_played ?? 0}&apos;</span>
                        <span>G: {row.goals ?? 0}</span>
                        <span>AG: {row.own_goals ?? 0}</span>
                        <span>A: {row.assists ?? 0}</span>
                        <span>CA: {row.yellow_cards ?? 0}</span>
                        <span>CV: {row.red_cards ?? 0}</span>
                      </>
                    ) : (
                      <>
                        <span className="inline-flex items-center gap-1">
                          Min:
                          <input
                            type="number"
                            min={0}
                            max={200}
                            value={
                              numericDrafts[row.player_id]?.minutes_played ??
                              row.minutes_played ?? 0
                            }
                            onChange={(event) =>
                              updateNumericDraft(
                                row.player_id,
                                "minutes_played",
                                event.target.value,
                              )
                            }
                            className="w-14 rounded border border-slate-300 px-1.5 py-0.5 text-xs"
                          />
                        </span>
                        <span className="inline-flex items-center gap-1">
                          G:
                          <input
                            type="number"
                            min={0}
                            max={20}
                            value={
                              numericDrafts[row.player_id]?.goals ??
                              row.goals ?? 0
                            }
                            onChange={(event) =>
                              updateNumericDraft(
                                row.player_id,
                                "goals",
                                event.target.value,
                              )
                            }
                            className="w-12 rounded border border-slate-300 px-1.5 py-0.5 text-xs"
                          />
                        </span>
                        <span className="inline-flex items-center gap-1">
                          AG:
                          <input
                            type="number"
                            min={0}
                            max={5}
                            value={
                              numericDrafts[row.player_id]?.own_goals ??
                              row.own_goals ?? 0
                            }
                            onChange={(event) =>
                              updateNumericDraft(
                                row.player_id,
                                "own_goals",
                                event.target.value,
                              )
                            }
                            className="w-12 rounded border border-slate-300 px-1.5 py-0.5 text-xs"
                          />
                        </span>
                        <span className="inline-flex items-center gap-1">
                          A:
                          <input
                            type="number"
                            min={0}
                            max={20}
                            value={
                              numericDrafts[row.player_id]?.assists ??
                              row.assists ?? 0
                            }
                            onChange={(event) =>
                              updateNumericDraft(
                                row.player_id,
                                "assists",
                                event.target.value,
                              )
                            }
                            className="w-12 rounded border border-slate-300 px-1.5 py-0.5 text-xs"
                          />
                        </span>
                        <span className="inline-flex items-center gap-1">
                          CA:
                          <input
                            type="number"
                            min={0}
                            max={2}
                            value={
                              numericDrafts[row.player_id]?.yellow_cards ??
                              row.yellow_cards ?? 0
                            }
                            onChange={(event) =>
                              updateNumericDraft(
                                row.player_id,
                                "yellow_cards",
                                event.target.value,
                              )
                            }
                            className="w-12 rounded border border-slate-300 px-1.5 py-0.5 text-xs"
                          />
                        </span>
                        <span className="inline-flex items-center gap-1">
                          CV:
                          <input
                            type="number"
                            min={0}
                            max={2}
                            value={
                              numericDrafts[row.player_id]?.red_cards ??
                              row.red_cards ?? 0
                            }
                            onChange={(event) =>
                              updateNumericDraft(
                                row.player_id,
                                "red_cards",
                                event.target.value,
                              )
                            }
                            className="w-12 rounded border border-slate-300 px-1.5 py-0.5 text-xs"
                          />
                        </span>
                      </>
                    )}
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

      <ConfirmDialog
        open={resetConfirmOpen}
        onOpenChange={setResetConfirmOpen}
        title="Repor stats automáticas?"
        description="Vais perder todos os ajustes manuais nesta partida. Os stats serão recalculados a partir dos eventos do jogo."
        confirmLabel="Sim, repor"
        cancelLabel="Cancelar"
        destructive
        onConfirm={() => {
          setResetConfirmOpen(false);
          void submitRecalculate({ forceAuto: true });
        }}
      />

      {showDeleteConfirm && (
        <DeleteGameModal
          deletingGame={deletingGame}
          gameStatus={summary.gameStatus}
          gameTitle={
            game.title ||
            (game.opponent_name ? `vs ${game.opponent_name}` : null)
          }
          onDelete={() => void handleDeleteGame()}
          onClose={() => setShowDeleteConfirm(false)}
        />
      )}

      <LineupCorrectionModal
        gameId={id}
        open={showLineupCorrection}
        onClose={() => setShowLineupCorrection(false)}
        onApplied={() => {
          void loadSummary({ keepLoading: false });
        }}
      />
    </div>
  );
}
