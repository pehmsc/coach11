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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { exportMatchReportPDF } from "@/lib/pdf/matchReport";
import type { Game, Player, GameEvent, GameEventType } from "@/types/database";

interface LivePlayer extends Player {
  isOnField: boolean;
  isSubstitute: boolean;
}

interface EventModal {
  type: GameEventType | "substitution";
  isOpponent: boolean;
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
  penalty_goal: "⚽ Pénalti",
  own_goal: "⚽ Autogolo",
  yellow_card: "🟨 Cartão Amarelo",
  red_card: "🟥 Cartão Vermelho",
  substitution: "🔄 Substituição",
};

function formatClock(totalSeconds: number) {
  const min = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const sec = (totalSeconds % 60).toString().padStart(2, "0");
  return `${min}:${sec}`;
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
  const [eventModal, setEventModal] = useState<EventModal | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [selectedSubOutId, setSelectedSubOutId] = useState<string | null>(null);
  const [savingEvent, setSavingEvent] = useState(false);
  const [savingLineup, setSavingLineup] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

    // Buscar convocatórias (pode haver duplicados em ambientes antigos).
    const { data: convRows } = await supabase
      .from("convocations")
      .select("id, created_at")
      .eq("game_id", id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });

    let convPlayers: Player[] = [];
    const convIds = (convRows || []).map((row) => row.id);
    if (convIds.length > 0) {
      const { data: cp } = await supabase
        .from("convocation_players")
        .select("player_id, players(*)")
        .in("convocation_id", convIds);

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

    // Buscar stats live existentes para saber quem está em campo
    const { data: liveStats } = await supabase
      .from("game_stats_live")
      .select("*")
      .eq("game_id", id);

    const onFieldIds = new Set(
      (liveStats || [])
        .filter((s) => s.status === "on_field")
        .map((s) => s.player_id),
    );
    const subIds = new Set(
      (liveStats || [])
        .filter((s) => s.status === "substitute")
        .map((s) => s.player_id),
    );

    // Se não houver stats live ainda, todos os convocados começam como possíveis
    const enriched: LivePlayer[] = convPlayers.map((p) => ({
      ...p,
      isOnField: onFieldIds.size > 0 ? onFieldIds.has(p.id) : false,
      isSubstitute: subIds.has(p.id),
    }));

    setConvocatedPlayers(enriched);

    // Buscar eventos
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
    if (id) loadData();
  }, [id, loadData]);

  useEffect(() => {
    if (!clockRunning || phase === "completed") return;

    const interval = setInterval(() => {
      setClockSeconds((prev) => {
        const next = prev + 1;
        if (next % 60 === 0) {
          setMinute((m) => m + 1);
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [clockRunning, phase]);

  // Calcular marcador a partir dos eventos
  const score = useMemo(() => {
    let home = 0;
    let away = 0;
    events.forEach((e) => {
      if (e.event_type === "own_goal") {
        if (e.is_opponent_event) home++;
        else away++;
      } else if (
        e.event_type === "goal" ||
        e.event_type === "penalty_goal"
      ) {
        if (e.is_opponent_event) away++;
        else home++;
      }
    });
    return { home, away };
  }, [events]);

  async function addEvent(
    eventType: GameEventType,
    isOpponent: boolean,
    playerId?: string,
    relatedPlayerId?: string,
  ) {
    if (phase !== "first_half" && phase !== "second_half") {
      toast.error("Inicia a 1ª ou 2ª parte para registar eventos.");
      return;
    }

    setSavingEvent(true);
    const { data, error } = await supabase
      .from("game_events")
      .insert({
        game_id: id,
        event_type: eventType,
        player_id: playerId || null,
        related_player_id: relatedPlayerId || null,
        minute,
        is_opponent_event: isOpponent,
      })
      .select()
      .single();

    if (error) {
      toast.error("Erro ao registar evento.");
    } else if (data) {
      setEvents((prev) =>
        [...prev, data].sort((a, b) => a.minute - b.minute),
      );
      toast.success(`${EVENT_LABELS[eventType] || eventType} — min. ${minute}`);
    }

    setSavingEvent(false);
    setEventModal(null);
    setSelectedPlayerId(null);
    setSelectedSubOutId(null);
  }

  async function handleSubstitution() {
    if (phase !== "first_half" && phase !== "second_half") {
      toast.error("Apenas durante a 1ª/2ª parte podes registar substituições.");
      return;
    }

    if (!selectedPlayerId || !selectedSubOutId) return;
    setSavingEvent(true);

    // Registar evento de substituição
    const { data, error } = await supabase
      .from("game_events")
      .insert({
        game_id: id,
        event_type: "substitution",
        player_id: selectedPlayerId, // entra
        related_player_id: selectedSubOutId, // sai
        minute,
        is_opponent_event: false,
      })
      .select()
      .single();

    if (error) {
      toast.error("Erro ao registar substituição.");
      setSavingEvent(false);
      return;
    }

    // Atualizar stats live
    await supabase
      .from("game_stats_live")
      .upsert(
        { game_id: id, player_id: selectedSubOutId, status: "substituted", end_minute: minute },
        { onConflict: "game_id,player_id" },
      );
    await supabase
      .from("game_stats_live")
      .upsert(
        { game_id: id, player_id: selectedPlayerId, status: "on_field", start_minute: minute },
        { onConflict: "game_id,player_id" },
      );

    setConvocatedPlayers((prev) =>
      prev.map((p) => {
        if (p.id === selectedSubOutId)
          return { ...p, isOnField: false, isSubstitute: false };
        if (p.id === selectedPlayerId)
          return { ...p, isOnField: true, isSubstitute: false };
        return p;
      }),
    );

    if (data) {
      setEvents((prev) => [...prev, data].sort((a, b) => a.minute - b.minute));
    }

    toast.success(`Substituição — min. ${minute}`);
    setSavingEvent(false);
    setEventModal(null);
    setSelectedPlayerId(null);
    setSelectedSubOutId(null);
  }

  async function toggleLineup(playerId: string) {
    const player = convocatedPlayers.find((p) => p.id === playerId);
    if (!player) return;
    setSavingLineup(playerId);

    const newIsOnField = !player.isOnField;
    const newStatus = newIsOnField ? "on_field" : "substitute";

    await supabase.from("game_stats_live").upsert(
      {
        game_id: id,
        player_id: playerId,
        status: newStatus,
        start_minute: newIsOnField ? 0 : null,
      },
      { onConflict: "game_id,player_id" },
    );

    setConvocatedPlayers((prev) =>
      prev.map((p) =>
        p.id === playerId
          ? { ...p, isOnField: newIsOnField, isSubstitute: !newIsOnField }
          : p,
      ),
    );
    setSavingLineup(null);
  }

  async function deleteEvent(eventId: string) {
    const { error } = await supabase
      .from("game_events")
      .delete()
      .eq("id", eventId);
    if (!error) {
      setEvents((prev) => prev.filter((e) => e.id !== eventId));
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
        events: events.map((e) => {
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
            (e) =>
              e.player_id === p.id &&
              (e.event_type === "goal" || e.event_type === "penalty_goal"),
          ).length,
          assists: 0,
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

  async function persistFinalStats(finalMinute: number) {
    // Recriar estatísticas finais do jogo para manter consistência.
    await supabase.from("game_final_stats").delete().eq("game_id", id);

    const { data: liveStats } = await supabase
      .from("game_stats_live")
      .select("player_id, status, start_minute, end_minute")
      .eq("game_id", id);

    const liveMap = new Map<
      string,
      { status: string; start_minute: number | null; end_minute: number | null }
    >();

    (liveStats || []).forEach((row) => {
      liveMap.set(row.player_id, {
        status: row.status || "",
        start_minute: row.start_minute ?? null,
        end_minute: row.end_minute ?? null,
      });
    });

    const rows = convocatedPlayers.map((player) => {
      const liveRow = liveMap.get(player.id);
      const startMinute = liveRow?.start_minute ?? (player.isOnField ? 0 : null);
      const endMinute =
        liveRow?.end_minute ??
        (player.isOnField || liveRow?.status === "on_field" ? finalMinute : null);

      let minutesPlayed = 0;
      if (startMinute !== null && endMinute !== null) {
        minutesPlayed = Math.max(0, endMinute - startMinute);
      } else if (player.isOnField) {
        minutesPlayed = finalMinute;
      }

      const goals = events.filter(
        (e) =>
          e.player_id === player.id &&
          !e.is_opponent_event &&
          (e.event_type === "goal" || e.event_type === "penalty_goal"),
      ).length;

      const yellowCards = events.filter(
        (e) =>
          e.player_id === player.id &&
          !e.is_opponent_event &&
          e.event_type === "yellow_card",
      ).length;

      const redCards = events.filter(
        (e) =>
          e.player_id === player.id &&
          !e.is_opponent_event &&
          e.event_type === "red_card",
      ).length;

      return {
        game_id: id,
        player_id: player.id,
        lineup_type: startMinute === 0 ? "starter" : "substitute",
        minutes_played: minutesPlayed,
        goals,
        assists: 0,
        yellow_cards: yellowCards,
        red_cards: redCards,
        is_finalized: true,
      };
    });

    if (rows.length > 0) {
      const { error } = await supabase.from("game_final_stats").insert(rows);
      if (error) {
        throw error;
      }
    }
  }

  async function finalizeGame() {
    if (!game) return;
    if (phase !== "review") {
      toast.error("Termina a 2ª parte antes de finalizar o jogo.");
      return;
    }

    const confirmSave = window.confirm(
      "Confirmas que os eventos e o marcador estão corretos para guardar nas estatísticas?",
    );

    if (!confirmSave) return;

    setFinalizing(true);

    try {
      await persistFinalStats(minute);

      const { error } = await supabase
        .from("games")
        .update({
          status: "completed",
          score_home: score.home,
          score_away: score.away,
        })
        .eq("id", id);

      if (error) {
        throw error;
      }

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

  const playersOnField = convocatedPlayers.filter((p) => p.isOnField);
  const playersOnBench = convocatedPlayers.filter(
    (p) => !p.isOnField && !p.isSubstitute,
  );

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

  const isFinalized = game.status === "completed";
  const isLivePhase = phase === "first_half" || phase === "second_half";
  const gameStartAt = game.game_datetime ? parseISO(game.game_datetime) : null;
  const liveUnlocked = gameStartAt ? new Date() >= new Date(gameStartAt.getTime() - 10 * 60 * 1000) : true;

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

      {/* Marcador */}
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

      {/* ── Seleção de titulares (pré-jogo) ── */}
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
              {playersOnBench.length > 0 && (
                <>
                  <span className="text-slate-300 mx-1">·</span>
                  <span className="text-sm font-bold text-slate-500">{playersOnBench.length}</span>
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

      {/* Minuto */}
      {!isFinalized && (
        <div className="mb-5 p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-slate-600 flex-1">
              Minuto de jogo
            </span>
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
                onClick={() => {
                  setPhase("first_half");
                  setClockRunning(true);
                }}
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
                onClick={() => {
                  setClockRunning(false);
                  setPhase("halftime");
                }}
                className="w-full bg-amber-600 hover:bg-amber-700"
              >
                Terminar 1ª parte
              </Button>
            )}

            {phase === "halftime" && (
              <Button
                onClick={() => {
                  setClockRunning(true);
                  setPhase("second_half");
                }}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                Iniciar 2ª parte
              </Button>
            )}

            {phase === "second_half" && (
              <Button
                onClick={() => {
                  setClockRunning(false);
                  setPhase("review");
                }}
                className="w-full bg-slate-800 hover:bg-slate-700"
              >
                Terminar 2ª parte
              </Button>
            )}
          </div>

          {phase === "halftime" && (
            <p className="text-xs text-center text-amber-700">
              Intervalo ativo. Retoma o jogo para continuar a registar eventos.
            </p>
          )}
          {phase === "review" && (
            <p className="text-xs text-center text-slate-600">
              Revê os dados e finaliza para gravar estatísticas.
            </p>
          )}
        </div>
      )}

      {/* Botões de evento */}
      {!isFinalized && (
        <div className="grid grid-cols-2 gap-2 mb-5">
          <button
            onClick={() =>
              setEventModal({ type: "goal", isOpponent: false })
            }
            disabled={!isLivePhase}
            className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium hover:bg-emerald-100 transition-colors"
          >
            ⚽ Golo nosso
          </button>
          <button
            onClick={() =>
              setEventModal({ type: "goal", isOpponent: true })
            }
            disabled={!isLivePhase}
            className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium hover:bg-red-100 transition-colors"
          >
            ⚽ Golo adversário
          </button>
          <button
            onClick={() =>
              setEventModal({ type: "yellow_card", isOpponent: false })
            }
            disabled={!isLivePhase}
            className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm font-medium hover:bg-amber-100 transition-colors"
          >
            🟨 Amarelo
          </button>
          <button
            onClick={() =>
              setEventModal({ type: "red_card", isOpponent: false })
            }
            disabled={!isLivePhase}
            className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium hover:bg-red-100 transition-colors"
          >
            🟥 Vermelho
          </button>
          <button
            onClick={() =>
              setEventModal({ type: "substitution", isOpponent: false })
            }
            disabled={!isLivePhase}
            className="col-span-2 p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 text-sm font-medium hover:bg-blue-100 transition-colors"
          >
            🔄 Substituição
          </button>
        </div>
      )}

      {/* Jogadores em campo */}
      {convocatedPlayers.length > 0 && (
        <div className="mb-5">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
            Convocados ({convocatedPlayers.length})
          </h3>
          <div className="space-y-1">
            {convocatedPlayers.map((p) => (
              <div
                key={p.id}
                className={`flex items-center gap-3 p-2.5 rounded-xl text-sm ${
                  p.isOnField
                    ? "bg-emerald-50 border border-emerald-200"
                    : p.isSubstitute
                      ? "bg-slate-100 border border-slate-200 opacity-60"
                      : "bg-white border border-slate-100"
                }`}
              >
                <span
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    p.isOnField
                      ? "bg-emerald-500 text-white"
                      : "bg-slate-200 text-slate-500"
                  }`}
                >
                  {p.jersey_number || "—"}
                </span>
                <span className="flex-1 font-medium text-slate-800 truncate">
                  {p.first_name} {p.last_name}
                </span>
                <span className="text-xs text-slate-400">
                  {p.isOnField ? "Em campo" : p.isSubstitute ? "Saiu" : "Banco"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Eventos / Relatório */}
      {events.length > 0 && (
        <div className="mb-5">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
            Eventos
          </h3>
          <div className="space-y-1">
            {events.map((ev) => {
              const playerName = convocatedPlayers.find(
                (p) => p.id === ev.player_id,
              );
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
                    {playerName
                      ? ` — ${playerName.first_name} ${playerName.last_name}`
                      : ev.is_opponent_event
                        ? " — Adversário"
                        : ""}
                  </span>
                  {!isFinalized && (
                    <button
                      onClick={() => deleteEvent(ev.id)}
                      className="p-1 hover:bg-red-50 rounded-lg transition-colors group"
                    >
                      <X
                        size={14}
                        className="text-slate-300 group-hover:text-red-500"
                      />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Finalizar */}
      {!isFinalized && (
        <Button
          onClick={finalizeGame}
          disabled={finalizing || phase !== "review"}
          className="w-full bg-slate-900 hover:bg-slate-800"
        >
          {finalizing ? (
            <Loader2 size={16} className="animate-spin mr-2" />
          ) : (
            <Check size={16} className="mr-2" />
          )}
          Finalizar jogo ({score.home}–{score.away})
        </Button>
      )}

      {isFinalized && (
        <Button
          onClick={handleExportPDF}
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

      {/* ── MODAL DE EVENTO ── */}
      {eventModal && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center p-4"
          onClick={() => {
            setEventModal(null);
            setSelectedPlayerId(null);
            setSelectedSubOutId(null);
          }}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-md shadow-xl max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center p-4 border-b sticky top-0 bg-white">
              <h3 className="font-bold text-slate-900">
                {eventModal.type === "substitution"
                  ? "🔄 Substituição"
                  : eventModal.isOpponent
                    ? `${EVENT_LABELS[eventModal.type]} — Adversário`
                    : EVENT_LABELS[eventModal.type]}
              </h3>
              <button
                onClick={() => {
                  setEventModal(null);
                  setSelectedPlayerId(null);
                  setSelectedSubOutId(null);
                }}
              >
                <X size={20} className="text-slate-400" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              {eventModal.type === "substitution" ? (
                <>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
                      Sai (em campo)
                    </p>
                    {playersOnField.length === 0 ? (
                      <p className="text-xs text-slate-400">
                        Nenhum jogador marcado como em campo.
                      </p>
                    ) : (
                      playersOnField.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => setSelectedSubOutId(p.id)}
                          className={`w-full flex items-center gap-3 p-2.5 rounded-xl mb-1 transition-colors text-left ${
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
                            <ArrowLeftRight
                              size={14}
                              className="text-red-500 ml-auto"
                            />
                          )}
                        </button>
                      ))
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
                      Entra (banco)
                    </p>
                    {playersOnBench.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setSelectedPlayerId(p.id)}
                        className={`w-full flex items-center gap-3 p-2.5 rounded-xl mb-1 transition-colors text-left ${
                          selectedPlayerId === p.id
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
                        {selectedPlayerId === p.id && (
                          <Check size={14} className="text-emerald-500 ml-auto" />
                        )}
                      </button>
                    ))}
                  </div>
                  <Button
                    onClick={handleSubstitution}
                    disabled={
                      savingEvent || !selectedPlayerId || !selectedSubOutId
                    }
                    className="w-full bg-blue-600 hover:bg-blue-700"
                  >
                    {savingEvent ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      "Confirmar substituição"
                    )}
                  </Button>
                </>
              ) : (
                <>
                  {!eventModal.isOpponent && (
                    <>
                      <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
                        Seleciona o jogador
                      </p>
                      {convocatedPlayers.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => setSelectedPlayerId(p.id)}
                          className={`w-full flex items-center gap-3 p-2.5 rounded-xl mb-1 transition-colors text-left ${
                            selectedPlayerId === p.id
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
                          {selectedPlayerId === p.id && (
                            <Check size={14} className="text-emerald-500 ml-auto" />
                          )}
                        </button>
                      ))}
                    </>
                  )}

                  <div className="flex gap-2 pt-2">
                    <Button
                      onClick={() =>
                        addEvent(
                          eventModal.type as GameEventType,
                          eventModal.isOpponent,
                          selectedPlayerId || undefined,
                        )
                      }
                      disabled={
                        savingEvent ||
                        (!eventModal.isOpponent && !selectedPlayerId)
                      }
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                    >
                      {savingEvent ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        "Confirmar"
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setEventModal(null);
                        setSelectedPlayerId(null);
                      }}
                    >
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
