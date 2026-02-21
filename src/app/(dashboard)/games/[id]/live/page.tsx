"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { format, parseISO } from "date-fns";
import { pt } from "date-fns/locale";
import {
  ArrowLeft,
  Plus,
  Minus,
  X,
  Check,
  Loader2,
  AlertCircle,
  ArrowLeftRight,
  FileDown,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { exportMatchReportPDF } from "@/lib/pdf/matchReport";
import type { Game, Player, GameEvent, GameEventType } from "@/types/database";

interface LivePlayer extends Player {
  isOnField: boolean;
  isInitialBench: boolean; // was set as bench in pre-match
}

type MatchPhase =
  | "pre_match"
  | "first_half"
  | "halftime"
  | "second_half"
  | "review"
  | "completed";

const EVENT_LABELS: Record<string, string> = {
  goal: "⚽ Golo",
  assist: "🅰️ Assistência",
  own_goal: "⚽ Autogolo",
  yellow_card: "🟨 Cartão Amarelo",
  red_card: "🟥 Cartão Vermelho",
  substitution_in: "🔄 Substituição (entra)",
  substitution_out: "🔄 Substituição (sai)",
};

type LiveStatus = "on_field" | "substitute" | "substituted";

function normalizeLiveStatus(value: string | null | undefined): LiveStatus | null {
  if (!value) return null;
  if (
    value === "on_field" ||
    value === "starter" ||
    value === "titular" ||
    value === "playing"
  ) {
    return "on_field";
  }
  if (
    value === "substitute" ||
    value === "bench" ||
    value === "suplente" ||
    value === "on_bench"
  ) {
    return "substitute";
  }
  if (value === "substituted" || value === "substituted_out") return "substituted";
  return null;
}

function toDbLiveStatus(status: LiveStatus, startMinute: number | null | undefined) {
  if (status === "substituted") return "substituted_out";
  if (status === "substitute") return "on_bench";
  return startMinute === 0 ? "starter" : "playing";
}

function isGoalEventType(eventType: string | null | undefined) {
  return eventType === "goal" || eventType === "penalty_goal";
}

function formatClock(totalSeconds: number) {
  const min = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const sec = (totalSeconds % 60).toString().padStart(2, "0");
  return `${min}:${sec}`;
}

/** Calculates minutes played per player from game_events substitution events */
function computeMinutesPlayed(
  players: LivePlayer[],
  events: GameEvent[],
  starterIds: Set<string>,
  finalMinute: number,
): Map<string, number> {
  const substitutions = events
    .filter((e) => !e.is_opponent_event)
    .flatMap((e) => {
      if (
        e.event_type === "substitution_out" &&
        typeof e.player_id === "string" &&
        typeof e.related_player_id === "string"
      ) {
        return [{ minute: e.minute, outPlayerId: e.player_id, inPlayerId: e.related_player_id }];
      }
      // Compatibilidade com registos antigos.
      if (
        (e.event_type as string) === "substitution" &&
        typeof e.player_id === "string" &&
        typeof e.related_player_id === "string"
      ) {
        return [{ minute: e.minute, outPlayerId: e.related_player_id, inPlayerId: e.player_id }];
      }
      return [];
    })
    .sort((a, b) => a.minute - b.minute);

  const result = new Map<string, number>();

  for (const player of players) {
    const periods: [number, number][] = [];
    let currentStart: number | null = starterIds.has(player.id) ? 0 : null;

    for (const ev of substitutions) {
      if (ev.inPlayerId === player.id) {
        // Player entered
        currentStart = ev.minute;
      } else if (ev.outPlayerId === player.id) {
        // Player exited
        if (currentStart !== null) {
          periods.push([currentStart, ev.minute]);
          currentStart = null;
        }
      }
    }

    // Still on field at end
    if (currentStart !== null) {
      periods.push([currentStart, finalMinute]);
    }

    const total = periods.reduce((acc, [s, e]) => acc + Math.max(0, e - s), 0);
    result.set(player.id, total);
  }

  return result;
}

export default function LiveGamePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [game, setGame] = useState<Game | null>(null);
  const [convocatedPlayers, setConvocatedPlayers] = useState<LivePlayer[]>([]);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [minute, setMinute] = useState(0);
  const [clockSeconds, setClockSeconds] = useState(0);
  const [phase, setPhase] = useState<MatchPhase>("pre_match");
  const [clockRunning, setClockRunning] = useState(false);
  const [savingEvent, setSavingEvent] = useState(false);
  const [savingLineup, setSavingLineup] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Event modal state
  type ModalType = GameEventType | "substitution";
  const [modalType, setModalType] = useState<ModalType | null>(null);
  const [modalIsOpponent, setModalIsOpponent] = useState(false);
  // Goal flow: step 1 = scorer, step 2 = assist
  const [goalStep, setGoalStep] = useState<"scorer" | "assist">("scorer");
  const [selectedScorerID, setSelectedScorerID] = useState<string | null>(null);
  const [selectedAssistID, setSelectedAssistID] = useState<string | null>(null);
  // Substitution
  const [selectedSubOutId, setSelectedSubOutId] = useState<string | null>(null);
  const [selectedSubInId, setSelectedSubInId] = useState<string | null>(null);

  // Review phase
  const [playerRatings, setPlayerRatings] = useState<Record<string, number>>({});
  const [mvpPlayerId, setMvpPlayerId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const { data: gameData } = await supabase
      .from("games")
      .select("*")
      .eq("id", id)
      .single();

    if (!gameData) {
      setError("Jogo não encontrado.");
      setLoading(false);
      return;
    }
    setGame(gameData);
    if (gameData.status === "completed") {
      setPhase("completed");
      setClockRunning(false);
    } else {
      setPhase("pre_match");
      setClockRunning(false);
    }

    // Fetch convocated players
    const { data: convRows } = await supabase
      .from("convocations")
      .select("id, created_at")
      .eq("game_id", id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });

    let convPlayers: Player[] = [];
    const latestConvocationId = convRows?.[0]?.id ?? null;
    if (latestConvocationId) {
      const { data: cp } = await supabase
        .from("convocation_players")
        .select("player_id, players(*)")
        .eq("convocation_id", latestConvocationId);

      const byPlayerId = new Map<string, Player>();
      (cp || []).forEach((row) => {
        const player = row.players as unknown as Player;
        if (!player?.id) return;
        byPlayerId.set(player.id, player);
      });

      convPlayers = Array.from(byPlayerId.values()).sort(
        (a, b) =>
          a.first_name.localeCompare(b.first_name, "pt", { sensitivity: "base" }) ||
          a.last_name.localeCompare(b.last_name, "pt", { sensitivity: "base" }),
      );
    }

    // Fetch live stats to restore field status
    const { data: liveStats } = await supabase
      .from("game_stats_live")
      .select("*")
      .eq("game_id", id);

    const normalizedStats = (liveStats || []).map((row) => ({
      player_id: row.player_id,
      status: normalizeLiveStatus(row.status),
    }));

    const onFieldIds = new Set(
      normalizedStats
        .filter((s) => s.status === "on_field")
        .map((s) => s.player_id),
    );
    const benchIds = new Set(
      normalizedStats
        .filter((s) => s.status === "substitute" || s.status === "substituted")
        .map((s) => s.player_id),
    );

    const enriched: LivePlayer[] = convPlayers.map((p) => ({
      ...p,
      isOnField: onFieldIds.has(p.id),
      isInitialBench: benchIds.has(p.id),
    }));
    setConvocatedPlayers(enriched);

    // Fetch events
    const { data: evts } = await supabase
      .from("game_events")
      .select("*")
      .eq("game_id", id)
      .order("minute", { ascending: true });

    const orderedEvents = evts || [];
    setEvents(orderedEvents);
    const lastMinute = orderedEvents.length
      ? Math.max(...orderedEvents.map((e) => e.minute || 0))
      : 0;
    setMinute(lastMinute);
    setClockSeconds(lastMinute * 60);
    setLoading(false);
  }, [id, supabase]);

  useEffect(() => {
    if (id) void loadData();
  }, [id, loadData]);

  const saveLivePlayerStatus = useCallback(
    async (
      playerId: string,
      status: LiveStatus,
      options?: { startMinute?: number | null; endMinute?: number | null },
    ) => {
      const startMinute = options?.startMinute ?? null;
      const endMinute = options?.endMinute ?? null;
      const payload = {
        status: toDbLiveStatus(status, startMinute),
        start_minute: startMinute,
        end_minute: endMinute,
      };

      const { data: existingRows, error: existingRowsError } = await supabase
        .from("game_stats_live")
        .select("id")
        .eq("game_id", id)
        .eq("player_id", playerId);

      if (existingRowsError) throw existingRowsError;

      if ((existingRows || []).length > 0) {
        const { error: updateError } = await supabase
          .from("game_stats_live")
          .update(payload)
          .eq("game_id", id)
          .eq("player_id", playerId);

        if (updateError) throw updateError;
        return;
      }

      const { error: insertError } = await supabase
        .from("game_stats_live")
        .insert({
          game_id: id,
          player_id: playerId,
          ...payload,
        });

      if (insertError) throw insertError;
    },
    [id, supabase],
  );

  useEffect(() => {
    if (!clockRunning || phase === "completed") return;
    const interval = setInterval(() => {
      setClockSeconds((prev) => {
        const next = prev + 1;
        if (next % 60 === 0) setMinute((m) => m + 1);
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [clockRunning, phase]);

  // Score from events
  const score = useMemo(() => {
    let home = 0;
    let away = 0;
    events.forEach((e) => {
      if (e.event_type === "own_goal") {
        if (e.is_opponent_event) home++;
        else away++;
      } else if (isGoalEventType(e.event_type)) {
        if (e.is_opponent_event) away++;
        else home++;
      }
    });
    return { home, away };
  }, [events]);

  const displayEvents = useMemo(() => {
    const sorted = [...events].sort((a, b) => a.minute - b.minute);
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
  }, [events]);

  const playersOnField = convocatedPlayers.filter((p) => p.isOnField);
  // ALL not-on-field players are available to enter (revolving subs)
  const playersAvailableToEnter = convocatedPlayers.filter((p) => !p.isOnField);

  const isLivePhase = phase === "first_half" || phase === "second_half";
  const isFinalized = game?.status === "completed";

  // Review: players who actually played (minutes > 0 or on field)
  const starterIds = useMemo(() => {
    const s = new Set<string>();
    convocatedPlayers.forEach((p) => { if (p.isOnField) s.add(p.id); });
    return s;
  }, [convocatedPlayers]);

  const computedMinutes = useMemo(
    () => computeMinutesPlayed(convocatedPlayers, events, starterIds, minute),
    [convocatedPlayers, events, starterIds, minute],
  );

  const playersWhoPlayed = useMemo(
    () => convocatedPlayers.filter((p) => (computedMinutes.get(p.id) ?? 0) > 0),
    [convocatedPlayers, computedMinutes],
  );

  const allRatingsFilled = useMemo(
    () => playersWhoPlayed.every((p) => playerRatings[p.id] !== undefined),
    [playersWhoPlayed, playerRatings],
  );

  // ── Event handlers ──

  function openModal(type: ModalType, isOpponent: boolean) {
    if (phase !== "first_half" && phase !== "second_half") {
      toast.error("Inicia a 1ª ou 2ª parte para registar eventos.");
      return;
    }
    setModalType(type);
    setModalIsOpponent(isOpponent);
    setGoalStep("scorer");
    setSelectedScorerID(null);
    setSelectedAssistID(null);
    setSelectedSubOutId(null);
    setSelectedSubInId(null);
  }

  function closeModal() {
    setModalType(null);
    setGoalStep("scorer");
    setSelectedScorerID(null);
    setSelectedAssistID(null);
    setSelectedSubOutId(null);
    setSelectedSubInId(null);
  }

  async function confirmGoal() {
    const goalEventType: GameEventType = modalType === "own_goal" ? "own_goal" : "goal";
    setSavingEvent(true);
    const { data, error: evErr } = await supabase
      .from("game_events")
      .insert({
        game_id: id,
        event_type: goalEventType,
        player_id: selectedScorerID || null,
        related_player_id: selectedAssistID || null,
        minute,
        is_opponent_event: modalIsOpponent,
      })
      .select()
      .single();

    if (evErr) {
      toast.error("Erro ao registar golo.");
    } else if (data) {
      setEvents((prev) => [...prev, data].sort((a, b) => a.minute - b.minute));
      toast.success(`${EVENT_LABELS[goalEventType] ?? goalEventType} — min. ${minute}`);
    }
    setSavingEvent(false);
    closeModal();
  }

  async function confirmCard(eventType: "yellow_card" | "red_card") {
    if (!selectedScorerID && !modalIsOpponent) return;
    setSavingEvent(true);
    const { data, error: evErr } = await supabase
      .from("game_events")
      .insert({
        game_id: id,
        event_type: eventType,
        player_id: selectedScorerID || null,
        minute,
        is_opponent_event: modalIsOpponent,
      })
      .select()
      .single();

    if (evErr) {
      toast.error("Erro ao registar cartão.");
    } else if (data) {
      setEvents((prev) => [...prev, data].sort((a, b) => a.minute - b.minute));
      toast.success(`${EVENT_LABELS[eventType]} — min. ${minute}`);
    }
    setSavingEvent(false);
    closeModal();
  }

  async function confirmSubstitution() {
    if (!selectedSubInId || !selectedSubOutId) return;
    setSavingEvent(true);

    const { data, error: evErr } = await supabase
      .from("game_events")
      .insert([
        {
          game_id: id,
          event_type: "substitution_out",
          player_id: selectedSubOutId,
          related_player_id: selectedSubInId,
          minute,
          is_opponent_event: false,
        },
        {
          game_id: id,
          event_type: "substitution_in",
          player_id: selectedSubInId,
          related_player_id: selectedSubOutId,
          minute,
          is_opponent_event: false,
        },
      ])
      .select()
      .order("created_at", { ascending: true });

    if (evErr) {
      toast.error("Erro ao registar substituição.");
      setSavingEvent(false);
      return;
    }

    try {
      // Update live stats (current status only — minutes calc uses events)
      await saveLivePlayerStatus(selectedSubOutId, "substituted", {
        startMinute: null,
        endMinute: minute,
      });
      await saveLivePlayerStatus(selectedSubInId, "on_field", {
        startMinute: minute,
        endMinute: null,
      });
    } catch {
      toast.error("Erro ao atualizar estado dos jogadores.");
      setSavingEvent(false);
      return;
    }

    setConvocatedPlayers((prev) =>
      prev.map((p) => {
        if (p.id === selectedSubOutId) return { ...p, isOnField: false };
        if (p.id === selectedSubInId) return { ...p, isOnField: true };
        return p;
      }),
    );

    if ((data || []).length > 0) {
      setEvents((prev) => [...prev, ...(data as GameEvent[])].sort((a, b) => a.minute - b.minute));
    }

    toast.success(`Substituição — min. ${minute}`);
    setSavingEvent(false);
    closeModal();
  }

  async function toggleLineup(playerId: string) {
    const player = convocatedPlayers.find((p) => p.id === playerId);
    if (!player) return;
    setSavingLineup(playerId);

    const newIsOnField = !player.isOnField;
    const newStatus: LiveStatus = newIsOnField ? "on_field" : "substitute";

    try {
      await saveLivePlayerStatus(playerId, newStatus, {
        startMinute: newIsOnField ? 0 : null,
        endMinute: null,
      });

      setConvocatedPlayers((prev) =>
        prev.map((p) =>
          p.id === playerId
            ? { ...p, isOnField: newIsOnField, isInitialBench: !newIsOnField }
            : p,
        ),
      );
    } catch {
      toast.error("Erro ao guardar titular/banco.");
    }
    setSavingLineup(null);
  }

  async function deleteEvent(eventId: string) {
    const eventToDelete = events.find((event) => event.id === eventId);
    const idsToDelete = new Set<string>([eventId]);

    if (eventToDelete?.event_type === "substitution_out") {
      const pair = events.find(
        (event) =>
          event.event_type === "substitution_in" &&
          event.minute === eventToDelete.minute &&
          event.player_id === eventToDelete.related_player_id &&
          event.related_player_id === eventToDelete.player_id,
      );
      if (pair?.id) idsToDelete.add(pair.id);
    }

    if (eventToDelete?.event_type === "substitution_in") {
      const pair = events.find(
        (event) =>
          event.event_type === "substitution_out" &&
          event.minute === eventToDelete.minute &&
          event.player_id === eventToDelete.related_player_id &&
          event.related_player_id === eventToDelete.player_id,
      );
      if (pair?.id) idsToDelete.add(pair.id);
    }

    const { error: delErr } = await supabase
      .from("game_events")
      .delete()
      .in("id", Array.from(idsToDelete));
    if (!delErr) {
      setEvents((prev) => prev.filter((event) => !idsToDelete.has(event.id)));
    }
  }

  async function persistFinalStats(finalMinute: number) {
    await supabase.from("game_final_stats").delete().eq("game_id", id);

    // Determine starters from game_stats_live (start_minute = 0)
    const { data: liveStats } = await supabase
      .from("game_stats_live")
      .select("player_id, status, start_minute")
      .eq("game_id", id);

    const starterIdsFromDB = new Set(
      (liveStats || [])
        .filter(
          (s) =>
            s.start_minute === 0 ||
            s.status === "starter" ||
            s.status === "playing" ||
            s.status === "on_field",
        )
        .map((s) => s.player_id),
    );

    // Also include anyone currently marked on field in state
    convocatedPlayers.forEach((p) => { if (p.isOnField) starterIdsFromDB.add(p.id); });

    const minutesMap = computeMinutesPlayed(
      convocatedPlayers,
      events,
      starterIdsFromDB,
      finalMinute,
    );

    const rows = convocatedPlayers.map((player) => {
      const minutesPlayed = minutesMap.get(player.id) ?? 0;
      const isStarter = starterIdsFromDB.has(player.id);

      const goals = events.filter(
        (e) =>
          e.player_id === player.id &&
          !e.is_opponent_event &&
          isGoalEventType(e.event_type),
      ).length;

      const assists = events.filter(
        (e) =>
          e.related_player_id === player.id &&
          !e.is_opponent_event &&
          isGoalEventType(e.event_type),
      ).length;

      const yellowCards = events.filter(
        (e) => e.player_id === player.id && !e.is_opponent_event && e.event_type === "yellow_card",
      ).length;

      const redCards = events.filter(
        (e) => e.player_id === player.id && !e.is_opponent_event && e.event_type === "red_card",
      ).length;

      return {
        game_id: id,
        player_id: player.id,
        lineup_type: isStarter ? "starter" : "substitute",
        minutes_played: minutesPlayed,
        goals,
        assists,
        yellow_cards: yellowCards,
        red_cards: redCards,
        coach_rating: playerRatings[player.id] ?? null,
        is_mvp: player.id === mvpPlayerId,
        is_finalized: true,
      };
    });

    if (rows.length > 0) {
      const { error: insertErr } = await supabase.from("game_final_stats").insert(rows);
      if (insertErr) throw insertErr;
    }
  }

  async function finalizeGame() {
    if (!game || phase !== "review") {
      toast.error("Termina a 2ª parte antes de finalizar o jogo.");
      return;
    }

    if (!allRatingsFilled) {
      toast.error("Preenche a nota (0–10) de todos os jogadores que participaram.");
      return;
    }

    const confirmSave = window.confirm(
      "Confirmas que os eventos, notas e MVP estão corretos para gravar as estatísticas?",
    );
    if (!confirmSave) return;

    setFinalizing(true);
    try {
      await persistFinalStats(minute);

      const { error: updateErr } = await supabase
        .from("games")
        .update({ status: "completed", score_home: score.home, score_away: score.away })
        .eq("id", id);

      if (updateErr) throw updateErr;

      setClockRunning(false);
      setPhase("completed");
      toast.success("Jogo finalizado e estatísticas guardadas!");
      router.push(`/games/${id}`);
    } catch {
      toast.error("Erro ao finalizar jogo.");
    } finally {
      setFinalizing(false);
    }
  }

  async function handleExportPDF() {
    if (!game) return;
    setExportingPDF(true);
    try {
      await exportMatchReportPDF({
        gameDatetime: game.game_datetime,
        opponentName: game.opponent_name || "Adversário",
        isHome: game.is_home,
        scoreHome: score.home,
        scoreAway: score.away,
        location: game.location,
        events: displayEvents.map((e) => {
          const pl = convocatedPlayers.find((p) => p.id === e.player_id);
          return {
            minute: e.minute,
            event_type: e.event_type,
            playerName: pl ? `${pl.first_name} ${pl.last_name}` : undefined,
            is_opponent_event: e.is_opponent_event,
          };
        }),
        players: convocatedPlayers.map((p) => ({
          jersey_number: p.jersey_number,
          name: `${p.first_name} ${p.last_name}`,
          goals: events.filter(
            (e) => e.player_id === p.id && isGoalEventType(e.event_type),
          ).length,
          assists: events.filter(
            (e) => e.related_player_id === p.id && isGoalEventType(e.event_type),
          ).length,
          yellow_cards: events.filter(
            (e) => e.player_id === p.id && e.event_type === "yellow_card",
          ).length,
          red_cards: events.filter(
            (e) => e.player_id === p.id && e.event_type === "red_card",
          ).length,
        })),
      });
    } catch {
      toast.error("Erro ao exportar PDF.");
    }
    setExportingPDF(false);
  }

  // ── Loading / error states ──

  if (loading) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-32 w-full rounded-xl" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (error || !game) {
    return (
      <div className="p-4 text-center py-16">
        <AlertCircle size={40} className="text-red-400 mx-auto mb-3" />
        <p className="text-slate-700">{error || "Erro ao carregar jogo."}</p>
      </div>
    );
  }

  const gameStartAt = game.game_datetime ? parseISO(game.game_datetime) : null;
  const liveUnlocked = gameStartAt
    ? new Date() >= new Date(gameStartAt.getTime() - 10 * 60 * 1000)
    : true;

  if (!isFinalized && !liveUnlocked) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-700 text-sm mb-4"
        >
          <ArrowLeft size={16} /> Voltar
        </button>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
          O live deste jogo só fica disponível 10 minutos antes do início.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto pb-24">
      {/* Back */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-slate-500 hover:text-slate-700 text-sm mb-4"
      >
        <ArrowLeft size={16} /> Voltar
      </button>

      {/* Scoreboard */}
      <div className="rounded-2xl bg-slate-900 text-white p-5 mb-5 text-center">
        <p className="text-slate-400 text-sm mb-1">
          {game.opponent_name ? `vs ${game.opponent_name}` : "Jogo"}
          {game.game_datetime &&
            ` · ${format(parseISO(game.game_datetime), "d MMM", { locale: pt })}`}
        </p>
        <div className="text-5xl font-black tracking-tight">
          {score.home} – {score.away}
        </div>
        <p className="text-slate-300 text-sm mt-2">
          Relógio: {formatClock(clockSeconds)} · Minuto {minute}&apos;
        </p>
        {isFinalized && (
          <span className="mt-2 inline-block text-xs bg-emerald-500 text-white px-3 py-0.5 rounded-full">
            Finalizado
          </span>
        )}
      </div>

      {/* ── PRE-MATCH: Lineup selection ── */}
      {phase === "pre_match" && convocatedPlayers.length > 0 && (
        <div className="mb-5 rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            <div>
              <p className="font-bold text-slate-900 text-sm">Escalação inicial</p>
              <p className="text-xs text-slate-500">Toca para alternar Titular / Banco</p>
            </div>
            <div className="text-right">
              <span className="text-sm font-bold text-emerald-600">{playersOnField.length}</span>
              <span className="text-xs text-slate-400"> titulares</span>
              {playersAvailableToEnter.length > 0 && (
                <>
                  <span className="text-slate-300 mx-1">·</span>
                  <span className="text-sm font-bold text-slate-500">
                    {playersAvailableToEnter.length}
                  </span>
                  <span className="text-xs text-slate-400"> banco</span>
                </>
              )}
            </div>
          </div>
          <div className="divide-y divide-slate-50">
            {convocatedPlayers.map((player) => (
              <button
                key={player.id}
                onClick={() => toggleLineup(player.id)}
                disabled={savingLineup === player.id}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                  player.isOnField
                    ? "bg-emerald-50 hover:bg-emerald-100"
                    : "bg-white hover:bg-slate-50"
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    player.isOnField ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {player.jersey_number || "—"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">
                    {player.first_name} {player.last_name}
                  </p>
                  {player.preferred_position && (
                    <p className="text-xs text-slate-400">{player.preferred_position}</p>
                  )}
                </div>
                <span
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${
                    player.isOnField
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {savingLineup === player.id ? "..." : player.isOnField ? "Titular" : "Banco"}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Clock + Phase controls ── */}
      {!isFinalized && (
        <div className="mb-5 p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-slate-600 flex-1">Minuto de jogo</span>
            <button
              onClick={() => setMinute((m) => Math.max(0, m - 1))}
              className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center"
            >
              <Minus size={14} />
            </button>
            <span className="w-10 text-center font-bold text-lg text-slate-900">
              {minute}&apos;
            </span>
            <button
              onClick={() => setMinute((m) => m + 1)}
              className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center"
            >
              <Plus size={14} />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-2">
            {phase === "pre_match" && (
              <Button
                onClick={() => { setPhase("first_half"); setClockRunning(true); }}
                disabled={playersOnField.length === 0}
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-500"
              >
                {playersOnField.length === 0
                  ? "Seleciona pelo menos 1 titular"
                  : `Iniciar 1ª parte (${playersOnField.length} titulares)`}
              </Button>
            )}
            {phase === "first_half" && (
              <Button
                onClick={() => { setClockRunning(false); setPhase("halftime"); }}
                className="w-full bg-amber-600 hover:bg-amber-700"
              >
                Terminar 1ª parte
              </Button>
            )}
            {phase === "halftime" && (
              <Button
                onClick={() => { setClockRunning(true); setPhase("second_half"); }}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                Iniciar 2ª parte
              </Button>
            )}
            {phase === "second_half" && (
              <Button
                onClick={() => { setClockRunning(false); setPhase("review"); }}
                className="w-full bg-slate-800 hover:bg-slate-700"
              >
                Terminar 2ª parte
              </Button>
            )}
          </div>

          {phase === "halftime" && (
            <p className="text-xs text-center text-amber-700">
              Intervalo. Retoma o jogo para continuar a registar eventos.
            </p>
          )}
          {phase === "review" && (
            <p className="text-xs text-center text-slate-600">
              Revê os dados, preenche notas e MVP, depois finaliza.
            </p>
          )}
        </div>
      )}

      {/* ── Event buttons ── */}
      {!isFinalized && (
        <div className="grid grid-cols-2 gap-2 mb-5">
          <button
            onClick={() => openModal("goal", false)}
            disabled={!isLivePhase}
            className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium hover:bg-emerald-100 transition-colors disabled:opacity-40"
          >
            ⚽ Golo nosso
          </button>
          <button
            onClick={() => openModal("goal", true)}
            disabled={!isLivePhase}
            className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium hover:bg-red-100 transition-colors disabled:opacity-40"
          >
            ⚽ Golo adversário
          </button>
          <button
            onClick={() => openModal("yellow_card", false)}
            disabled={!isLivePhase}
            className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm font-medium hover:bg-amber-100 transition-colors disabled:opacity-40"
          >
            🟨 Amarelo
          </button>
          <button
            onClick={() => openModal("red_card", false)}
            disabled={!isLivePhase}
            className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium hover:bg-red-100 transition-colors disabled:opacity-40"
          >
            🟥 Vermelho
          </button>
          <button
            onClick={() => openModal("substitution", false)}
            disabled={!isLivePhase}
            className="col-span-2 p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 text-sm font-medium hover:bg-blue-100 transition-colors disabled:opacity-40"
          >
            🔄 Substituição
          </button>
        </div>
      )}

      {/* ── Players list (mid-game / completed) ── */}
      {phase !== "pre_match" && convocatedPlayers.length > 0 && (
        <div className="mb-5">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
            Convocados ({convocatedPlayers.length})
          </h3>
          <div className="space-y-1">
            {convocatedPlayers.map((p) => {
              const mins = computedMinutes.get(p.id) ?? 0;
              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-3 p-2.5 rounded-xl text-sm ${
                    p.isOnField
                      ? "bg-emerald-50 border border-emerald-200"
                      : "bg-white border border-slate-100"
                  }`}
                >
                  <span
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                      p.isOnField ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500"
                    }`}
                  >
                    {p.jersey_number || "—"}
                  </span>
                  <span className="flex-1 font-medium text-slate-800 truncate">
                    {p.first_name} {p.last_name}
                  </span>
                  <span className="text-xs text-slate-400">
                    {p.isOnField ? "Em campo" : "Banco"}
                  </span>
                  {mins > 0 && (
                    <span className="text-xs text-slate-500 font-mono">{mins}&apos;</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Events log ── */}
      {displayEvents.length > 0 && (
        <div className="mb-5">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
            Eventos
          </h3>
          <div className="space-y-1">
            {displayEvents.map((ev) => {
              const pl = convocatedPlayers.find((p) => p.id === ev.player_id);
              const assist = convocatedPlayers.find((p) => p.id === ev.related_player_id);
              return (
                <div
                  key={ev.id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100"
                >
                  <span className="text-xs text-slate-400 w-8 text-right flex-shrink-0">
                    {ev.minute}&apos;
                  </span>
                  <span className="text-sm flex-1">
                    {EVENT_LABELS[ev.event_type] || ev.event_type}
                    {pl ? ` — ${pl.first_name} ${pl.last_name}` : ev.is_opponent_event ? " — Adversário" : ""}
                    {assist && ev.event_type === "goal" ? ` (🅰️ ${assist.first_name} ${assist.last_name})` : ""}
                    {ev.event_type === "substitution_out" && assist ? ` → ${assist.first_name} ${assist.last_name}` : ""}
                    {ev.event_type === "substitution_in" && assist ? ` ← ${assist.first_name} ${assist.last_name}` : ""}
                  </span>
                  {!isFinalized && (
                    <button
                      onClick={() => void deleteEvent(ev.id)}
                      className="p-1 hover:bg-red-50 rounded-lg transition-colors group"
                    >
                      <X size={14} className="text-slate-300 group-hover:text-red-500" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── REVIEW: Ratings + MVP ── */}
      {phase === "review" && playersWhoPlayed.length > 0 && (
        <>
          {/* Notas */}
          <div className="mb-5 rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
              <p className="font-bold text-slate-900 text-sm">Notas dos jogadores</p>
              <p className="text-xs text-slate-500">
                Obrigatório para todos que participaram · {playersWhoPlayed.filter(p => playerRatings[p.id] !== undefined).length}/{playersWhoPlayed.length} preenchidos
              </p>
            </div>
            <div className="divide-y divide-slate-50">
              {playersWhoPlayed.map((p) => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500 flex-shrink-0">
                    {p.jersey_number || "—"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">
                      {p.first_name} {p.last_name}
                    </p>
                    <p className="text-xs text-slate-400">{computedMinutes.get(p.id) ?? 0} min</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <input
                      type="number"
                      min="0"
                      max="10"
                      step="0.5"
                      placeholder="—"
                      value={playerRatings[p.id] ?? ""}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val) && val >= 0 && val <= 10) {
                          setPlayerRatings((prev) => ({ ...prev, [p.id]: val }));
                        } else if (e.target.value === "") {
                          setPlayerRatings((prev) => {
                            const next = { ...prev };
                            delete next[p.id];
                            return next;
                          });
                        }
                      }}
                      className="w-16 text-center border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <span className="text-xs text-slate-400">/10</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* MVP */}
          <div className="mb-5 rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
              <p className="font-bold text-slate-900 text-sm">MVP do jogo</p>
              <p className="text-xs text-slate-500">Seleciona o melhor jogador</p>
            </div>
            <div className="divide-y divide-slate-50">
              {playersWhoPlayed.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setMvpPlayerId((prev) => (prev === p.id ? null : p.id))}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                    mvpPlayerId === p.id
                      ? "bg-amber-50 hover:bg-amber-100"
                      : "bg-white hover:bg-slate-50"
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                      mvpPlayerId === p.id ? "bg-amber-400 text-white" : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    {mvpPlayerId === p.id ? <Star size={14} /> : (p.jersey_number || "—")}
                  </div>
                  <span className="flex-1 text-sm font-medium text-slate-800 truncate">
                    {p.first_name} {p.last_name}
                  </span>
                  {mvpPlayerId === p.id && (
                    <span className="text-xs font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">
                      MVP
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Finalize button ── */}
      {!isFinalized && (
        <Button
          onClick={() => void finalizeGame()}
          disabled={finalizing || phase !== "review" || !allRatingsFilled}
          className="w-full bg-slate-900 hover:bg-slate-800"
        >
          {finalizing ? (
            <Loader2 size={16} className="animate-spin mr-2" />
          ) : (
            <Check size={16} className="mr-2" />
          )}
          {phase !== "review"
            ? "Termina a 2ª parte para finalizar"
            : !allRatingsFilled
              ? `Faltam notas (${playersWhoPlayed.length - playersWhoPlayed.filter(p => playerRatings[p.id] !== undefined).length} em falta)`
              : `Finalizar jogo (${score.home}–${score.away})`}
        </Button>
      )}

      {isFinalized && (
        <Button
          onClick={() => void handleExportPDF()}
          disabled={exportingPDF}
          variant="outline"
          className="w-full"
        >
          {exportingPDF ? (
            <Loader2 size={16} className="animate-spin mr-2" />
          ) : (
            <FileDown size={16} className="mr-2" />
          )}
          Exportar relatório PDF
        </Button>
      )}

      {/* ── EVENT MODAL ── */}
      {modalType && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center p-4"
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-md shadow-xl max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center p-4 border-b sticky top-0 bg-white">
              <h3 className="font-bold text-slate-900">
                {modalType === "substitution"
                  ? "🔄 Substituição"
                  : modalIsOpponent
                    ? `${EVENT_LABELS[modalType]} — Adversário`
                    : EVENT_LABELS[modalType] ?? modalType}
                {modalType === "goal" && !modalIsOpponent && goalStep === "assist"
                  ? " — Assistência?"
                  : ""}
              </h3>
              <button onClick={closeModal}>
                <X size={20} className="text-slate-400" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              {/* SUBSTITUTION */}
              {modalType === "substitution" && (
                <>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
                      Sai (em campo)
                    </p>
                    {playersOnField.length === 0 ? (
                      <p className="text-xs text-slate-400">Nenhum jogador em campo.</p>
                    ) : (
                      playersOnField.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => setSelectedSubOutId(p.id)}
                          className={`w-full flex items-center gap-3 p-2.5 rounded-xl mb-1 text-left transition-colors ${
                            selectedSubOutId === p.id
                              ? "bg-red-50 border-2 border-red-300"
                              : "bg-slate-50 border border-slate-100"
                          }`}
                        >
                          <span className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold flex-shrink-0">
                            {p.jersey_number || "—"}
                          </span>
                          <span className="text-sm font-medium">
                            {p.first_name} {p.last_name}
                          </span>
                          {selectedSubOutId === p.id && (
                            <ArrowLeftRight size={14} className="text-red-500 ml-auto" />
                          )}
                        </button>
                      ))
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
                      Entra (banco)
                    </p>
                    {playersAvailableToEnter.length === 0 ? (
                      <p className="text-xs text-slate-400">Todos os jogadores estão em campo.</p>
                    ) : (
                      playersAvailableToEnter.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => setSelectedSubInId(p.id)}
                          className={`w-full flex items-center gap-3 p-2.5 rounded-xl mb-1 text-left transition-colors ${
                            selectedSubInId === p.id
                              ? "bg-emerald-50 border-2 border-emerald-300"
                              : "bg-slate-50 border border-slate-100"
                          }`}
                        >
                          <span className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold flex-shrink-0">
                            {p.jersey_number || "—"}
                          </span>
                          <span className="text-sm font-medium">
                            {p.first_name} {p.last_name}
                          </span>
                          {selectedSubInId === p.id && (
                            <Check size={14} className="text-emerald-500 ml-auto" />
                          )}
                        </button>
                      ))
                    )}
                  </div>
                  <Button
                    onClick={() => void confirmSubstitution()}
                    disabled={savingEvent || !selectedSubInId || !selectedSubOutId}
                    className="w-full bg-blue-600 hover:bg-blue-700"
                  >
                    {savingEvent ? <Loader2 size={16} className="animate-spin" /> : "Confirmar substituição"}
                  </Button>
                </>
              )}

              {/* GOAL (own team) — 2-step: scorer → assist */}
              {modalType === "goal" && !modalIsOpponent && (
                <>
                  {goalStep === "scorer" && (
                    <>
                      <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
                        Marcador
                      </p>
                      {convocatedPlayers.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => setSelectedScorerID(p.id)}
                          className={`w-full flex items-center gap-3 p-2.5 rounded-xl mb-1 text-left transition-colors ${
                            selectedScorerID === p.id
                              ? "bg-emerald-50 border-2 border-emerald-300"
                              : "bg-slate-50 border border-slate-100"
                          }`}
                        >
                          <span className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold flex-shrink-0">
                            {p.jersey_number || "—"}
                          </span>
                          <span className="text-sm font-medium truncate">
                            {p.first_name} {p.last_name}
                          </span>
                          {selectedScorerID === p.id && (
                            <Check size={14} className="text-emerald-500 ml-auto" />
                          )}
                        </button>
                      ))}
                      <div className="flex gap-2 pt-1">
                        <Button
                          onClick={() => setGoalStep("assist")}
                          disabled={!selectedScorerID}
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                        >
                          Seguinte →
                        </Button>
                        <Button variant="outline" onClick={closeModal}>
                          Cancelar
                        </Button>
                      </div>
                    </>
                  )}

                  {goalStep === "assist" && (
                    <>
                      <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
                        Assistência (opcional)
                      </p>
                      {convocatedPlayers
                        .filter((p) => p.id !== selectedScorerID)
                        .map((p) => (
                          <button
                            key={p.id}
                            onClick={() =>
                              setSelectedAssistID((prev) => (prev === p.id ? null : p.id))
                            }
                            className={`w-full flex items-center gap-3 p-2.5 rounded-xl mb-1 text-left transition-colors ${
                              selectedAssistID === p.id
                                ? "bg-blue-50 border-2 border-blue-300"
                                : "bg-slate-50 border border-slate-100"
                            }`}
                          >
                            <span className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold flex-shrink-0">
                              {p.jersey_number || "—"}
                            </span>
                            <span className="text-sm font-medium truncate">
                              {p.first_name} {p.last_name}
                            </span>
                            {selectedAssistID === p.id && (
                              <Check size={14} className="text-blue-500 ml-auto" />
                            )}
                          </button>
                        ))}
                      <div className="flex gap-2 pt-1">
                        <Button
                          onClick={() => void confirmGoal()}
                          disabled={savingEvent}
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                        >
                          {savingEvent ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            "Confirmar golo"
                          )}
                        </Button>
                        <Button variant="outline" onClick={() => setGoalStep("scorer")}>
                          ← Voltar
                        </Button>
                      </div>
                    </>
                  )}
                </>
              )}

              {/* GOAL (opponent) / own_goal */}
              {((modalType === "goal" && modalIsOpponent) || modalType === "own_goal") && (
                <>
                  {modalType === "own_goal" && (
                    <>
                      <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
                        Jogador (autogolo)
                      </p>
                      {convocatedPlayers.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => setSelectedScorerID(p.id)}
                          className={`w-full flex items-center gap-3 p-2.5 rounded-xl mb-1 text-left transition-colors ${
                            selectedScorerID === p.id
                              ? "bg-emerald-50 border-2 border-emerald-300"
                              : "bg-slate-50 border border-slate-100"
                          }`}
                        >
                          <span className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold flex-shrink-0">
                            {p.jersey_number || "—"}
                          </span>
                          <span className="text-sm font-medium truncate">
                            {p.first_name} {p.last_name}
                          </span>
                          {selectedScorerID === p.id && (
                            <Check size={14} className="text-emerald-500 ml-auto" />
                          )}
                        </button>
                      ))}
                    </>
                  )}
                  <div className="flex gap-2 pt-2">
                    <Button
                      onClick={() => void confirmGoal()}
                      disabled={savingEvent}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                    >
                      {savingEvent ? <Loader2 size={16} className="animate-spin" /> : "Confirmar"}
                    </Button>
                    <Button variant="outline" onClick={closeModal}>
                      Cancelar
                    </Button>
                  </div>
                </>
              )}

              {/* YELLOW / RED CARD */}
              {(modalType === "yellow_card" || modalType === "red_card") && (
                <>
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
                    Jogador
                  </p>
                  {convocatedPlayers.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setSelectedScorerID(p.id)}
                      className={`w-full flex items-center gap-3 p-2.5 rounded-xl mb-1 text-left transition-colors ${
                        selectedScorerID === p.id
                          ? "bg-emerald-50 border-2 border-emerald-300"
                          : "bg-slate-50 border border-slate-100"
                      }`}
                    >
                      <span className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold flex-shrink-0">
                        {p.jersey_number || "—"}
                      </span>
                      <span className="text-sm font-medium truncate">
                        {p.first_name} {p.last_name}
                      </span>
                      {selectedScorerID === p.id && (
                        <Check size={14} className="text-emerald-500 ml-auto" />
                      )}
                    </button>
                  ))}
                  <div className="flex gap-2 pt-2">
                    <Button
                      onClick={() => void confirmCard(modalType)}
                      disabled={savingEvent || !selectedScorerID}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                    >
                      {savingEvent ? <Loader2 size={16} className="animate-spin" /> : "Confirmar"}
                    </Button>
                    <Button variant="outline" onClick={closeModal}>
                      Cancelar
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
