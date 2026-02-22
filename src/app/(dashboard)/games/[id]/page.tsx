"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { differenceInMinutes, format, parseISO, subMinutes } from "date-fns";
import { pt } from "date-fns/locale";
import {
  ArrowLeft,
  Users,
  MapPin,
  Clock,
  Shield,
  AlertCircle,
  Check,
  Play,
  Loader2,
  Pencil,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { Game, Player } from "@/types/database";

interface PlayerWithStatus extends Player {
  isConvocated: boolean;
  isBlocked: boolean; // já convocado noutro jogo de competição no mesmo dia
}

const FORMATIONS_BY_FORMAT: Record<string, string[]> = {
  "5": ["1-2-2", "1-1-3", "1-3-1"],
  "7": ["1-2-3-1", "1-3-2-1", "1-2-2-2", "1-1-3-2", "1-2-1-3"],
  "9": ["1-3-3-2", "1-4-3-1", "1-3-4-1", "1-2-4-2", "1-2-5-1", "1-3-2-3"],
  "11": ["4-4-2", "4-3-3", "3-5-2", "4-2-3-1", "3-4-3", "4-5-1", "5-3-2"],
};

interface KitPieceRow {
  id: string;
  kit_number: number;
  player_type: "field" | "field_player" | "goalkeeper";
  piece_type: "shirt" | "jersey" | "shorts" | "socks";
  color_name: string | null;
  color_hex: string | null;
}

type KitSelection = {
  fp_jersey_kit_id: string | null;
  fp_shorts_kit_id: string | null;
  fp_socks_kit_id: string | null;
  gk_jersey_kit_id: string | null;
  gk_shorts_kit_id: string | null;
  gk_socks_kit_id: string | null;
};

const EMPTY_KIT_SELECTION: KitSelection = {
  fp_jersey_kit_id: null,
  fp_shorts_kit_id: null,
  fp_socks_kit_id: null,
  gk_jersey_kit_id: null,
  gk_shorts_kit_id: null,
  gk_socks_kit_id: null,
};

const UI_PIECE_TYPES = ["shirt", "shorts", "socks"] as const;

const PIECE_LABEL: Record<(typeof UI_PIECE_TYPES)[number], string> = {
  shirt: "Camisola",
  shorts: "Calções",
  socks: "Meias",
};

function samePieceType(
  dbPieceType: KitPieceRow["piece_type"],
  requestedPieceType: (typeof UI_PIECE_TYPES)[number],
) {
  if (requestedPieceType === "shirt") {
    return dbPieceType === "shirt" || dbPieceType === "jersey";
  }
  return dbPieceType === requestedPieceType;
}

function samePlayerType(
  dbPlayerType: KitPieceRow["player_type"],
  requestedPlayerType: "field" | "goalkeeper",
) {
  if (requestedPlayerType === "field") {
    return dbPlayerType === "field" || dbPlayerType === "field_player";
  }
  return dbPlayerType === requestedPlayerType;
}

export default function GameDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [confirmingConvocation, setConfirmingConvocation] = useState(false);
  const [convocationStatus, setConvocationStatus] = useState<
    "draft" | "confirmed" | "closed"
  >("draft");
  const [now, setNow] = useState(() => new Date());
  const [game, setGame] = useState<Game | null>(null);
  const [players, setPlayers] = useState<PlayerWithStatus[]>([]);
  const [teamKits, setTeamKits] = useState<KitPieceRow[]>([]);
  const [kitSelection, setKitSelection] =
    useState<KitSelection>(EMPTY_KIT_SELECTION);
  const [kitDraftSelection, setKitDraftSelection] =
    useState<KitSelection>(EMPTY_KIT_SELECTION);
  const [kitEditorOpen, setKitEditorOpen] = useState(false);
  const [savingKitSelection, setSavingKitSelection] = useState(false);
  const [footballFormat, setFootballFormat] = useState<string | null>(null);
  const [tacticalSystem, setTacticalSystem] = useState<string | null>(null);
  const [lineupStatuses, setLineupStatuses] = useState<
    Record<string, "on_field" | "substitute">
  >({});
  const [canEditCompleted, setCanEditCompleted] = useState(false);
  const [livePhase, setLivePhase] = useState<
    "first_half" | "second_half" | null
  >(null);
  const [savingTactical, setSavingTactical] = useState(false);
  const [savingLineupPlayer, setSavingLineupPlayer] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  // Game edit state
  const [editingGame, setEditingGame] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editOpponent, setEditOpponent] = useState("");
  const [editOpponentShortName, setEditOpponentShortName] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [savingGameEdit, setSavingGameEdit] = useState(false);

  useEffect(() => {
    if (id) loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(interval);
  }, []);

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/games/${id}/convocation`, {
        cache: "no-store",
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok || !payload?.game) {
        setGame(null);
        setPlayers([]);
        setTeamKits([]);
        setKitSelection(EMPTY_KIT_SELECTION);
        setConvocationStatus("draft");
        setLivePhase(null);
        setCanEditCompleted(false);
        setError(payload?.error || "Erro ao carregar jogo.");
        return;
      }

      const coordinatorCanEdit = payload?.isCoordinator === true;
      setCanEditCompleted(coordinatorCanEdit);

      const loadedGame = payload.game as Game;
      if (loadedGame.status === "completed" && !coordinatorCanEdit) {
        router.replace(`/games/${id}/summary`);
        return;
      }

      setGame(loadedGame);

      if (
        payload.convocationStatus === "confirmed" ||
        payload.convocationStatus === "closed"
      ) {
        setConvocationStatus(payload.convocationStatus);
      } else {
        setConvocationStatus("draft");
      }

      const sortedPlayers = (
        Array.isArray(payload.players) ? [...payload.players] : []
      ).sort(
        (a: PlayerWithStatus, b: PlayerWithStatus) =>
          a.first_name.localeCompare(b.first_name, "pt", {
            sensitivity: "base",
          }) ||
          a.last_name.localeCompare(b.last_name, "pt", { sensitivity: "base" }),
      );
      setPlayers(sortedPlayers as PlayerWithStatus[]);
      setTeamKits(
        (Array.isArray(payload.kits) ? payload.kits : []) as KitPieceRow[],
      );
      const loadedKitSelection: KitSelection = {
        ...EMPTY_KIT_SELECTION,
        ...(typeof payload.kitSelection === "object" && payload.kitSelection
          ? (payload.kitSelection as Partial<KitSelection>)
          : {}),
      };
      setKitSelection(loadedKitSelection);
      setKitDraftSelection(loadedKitSelection);
      setKitEditorOpen(false);
      setFootballFormat(
        typeof payload.footballFormat === "string"
          ? payload.footballFormat
          : null,
      );
      setTacticalSystem(
        typeof payload.tacticalSystem === "string"
          ? payload.tacticalSystem
          : null,
      );
      const rawLineup =
        typeof payload.lineupStatuses === "object" && payload.lineupStatuses
          ? (payload.lineupStatuses as Record<string, string>)
          : {};
      const normalizedLineup: Record<string, "on_field" | "substitute"> = {};
      for (const [pid, status] of Object.entries(rawLineup)) {
        if (status === "on_field" || status === "substitute") {
          normalizedLineup[pid] = status;
        }
      }
      setLineupStatuses(normalizedLineup);
      const checkpointPhase =
        typeof payload?.liveCheckpoint?.phase === "string"
          ? payload.liveCheckpoint.phase
          : null;
      if (
        checkpointPhase === "first_half" ||
        checkpointPhase === "second_half"
      ) {
        setLivePhase(checkpointPhase);
      } else {
        setLivePhase(null);
      }
    } catch {
      setGame(null);
      setPlayers([]);
      setTeamKits([]);
      setKitSelection(EMPTY_KIT_SELECTION);
      setConvocationStatus("draft");
      setLivePhase(null);
      setCanEditCompleted(false);
      setError("Erro de ligação ao carregar jogo.");
    } finally {
      setLoading(false);
    }
  }

  async function handleTacticalChange(formation: string) {
    setSavingTactical(true);
    setError(null);
    setTacticalSystem(formation || null);

    try {
      const res = await fetch(`/api/games/${id}/convocation/tactical`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tacticalSystem: formation }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setError(
          (payload as { error?: string })?.error ||
            "Erro ao guardar sistema táctico.",
        );
      }
    } catch {
      setError("Erro de ligação ao guardar sistema táctico.");
    } finally {
      setSavingTactical(false);
    }
  }

  async function handleLineupToggle(playerId: string) {
    const current = lineupStatuses[playerId];
    const newStatus: "on_field" | "substitute" =
      current === "on_field" ? "substitute" : "on_field";

    // Guard: don't exceed the format's starter count
    if (newStatus === "on_field" && footballFormat) {
      const format = parseInt(footballFormat);
      const currentStarters = Object.values(lineupStatuses).filter(
        (s) => s === "on_field",
      ).length;
      if (currentStarters >= format) {
        toast.error(`Futebol ${footballFormat} só tem ${format} titulares`);
        return;
      }
    }

    setSavingLineupPlayer(playerId);
    setError(null);
    setLineupStatuses((prev) => ({ ...prev, [playerId]: newStatus }));

    try {
      const res = await fetch(`/api/games/${id}/convocation/lineup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, lineupStatus: newStatus }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setLineupStatuses((prev) => ({
          ...prev,
          [playerId]: current ?? "substitute",
        }));
        setError(
          (payload as { error?: string })?.error || "Erro ao guardar lineup.",
        );
      }
    } catch {
      setLineupStatuses((prev) => ({
        ...prev,
        [playerId]: current ?? "substitute",
      }));
      setError("Erro de ligação ao guardar lineup.");
    } finally {
      setSavingLineupPlayer(null);
    }
  }

  function getKitOptions(
    playerType: "field" | "goalkeeper",
    pieceType: (typeof UI_PIECE_TYPES)[number],
  ) {
    return teamKits.filter(
      (piece) =>
        samePlayerType(piece.player_type, playerType) &&
        samePieceType(piece.piece_type, pieceType),
    );
  }

  const kitById = useMemo(
    () => new Map(teamKits.map((piece) => [piece.id, piece])),
    [teamKits],
  );

  const hasKitDraftChanges = useMemo(
    () => JSON.stringify(kitDraftSelection) !== JSON.stringify(kitSelection),
    [kitDraftSelection, kitSelection],
  );

  function getKitColor(piece: KitPieceRow | null | undefined) {
    const hex = piece?.color_hex?.trim() || "";
    return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex) ? hex : "#e2e8f0";
  }

  function handleKitDraftChange(field: keyof KitSelection, value: string) {
    const normalizedValue = value === "__none__" ? null : value;
    setKitDraftSelection((prev) => ({
      ...prev,
      [field]: normalizedValue,
    }));
  }

  function closeKitEditor() {
    setKitDraftSelection(kitSelection);
    setKitEditorOpen(false);
  }

  async function saveKitSelection() {
    const nextSelection = { ...kitDraftSelection };
    setSavingKitSelection(true);
    setError(null);

    try {
      const res = await fetch(`/api/games/${id}/convocation/kits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextSelection),
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(
          payload?.error || "Erro ao guardar equipamentos da convocatória.",
        );
        return;
      }

      const responseSelection =
        typeof payload?.kitSelection === "object" && payload.kitSelection
          ? (payload.kitSelection as Partial<KitSelection>)
          : null;

      const savedSelection: KitSelection = {
        ...nextSelection,
        ...(responseSelection || {}),
      };

      setKitSelection(savedSelection);
      setKitDraftSelection(savedSelection);
      setKitEditorOpen(false);
      setConvocationStatus("draft");
    } catch {
      setError("Erro de ligação ao guardar equipamentos da convocatória.");
    } finally {
      setSavingKitSelection(false);
    }
  }

  async function togglePlayer(player: PlayerWithStatus) {
    if (player.isBlocked) return;
    setSaving(player.id);
    setError(null);

    try {
      const res = await fetch(`/api/games/${id}/convocation/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: player.id }),
      });

      const payload = await res.json().catch(() => ({}));

      if (!res.ok || typeof payload?.isConvocated !== "boolean") {
        setError(payload?.error || "Erro ao atualizar convocatória.");
      } else {
        setConvocationStatus("draft");
        const newIsConvocated = payload.isConvocated as boolean;
        setPlayers((prev) =>
          prev.map((p) =>
            p.id === player.id ? { ...p, isConvocated: newIsConvocated } : p,
          ),
        );
        void autoAssignLineup(player.id, newIsConvocated);
      }
    } catch {
      setError("Erro de ligação ao atualizar convocatória.");
    } finally {
      setSaving(null);
    }
  }

  async function handleConfirmConvocation() {
    setConfirmingConvocation(true);
    setError(null);

    try {
      const res = await fetch(`/api/games/${id}/convocation/confirm`, {
        method: "POST",
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok || payload?.status !== "confirmed") {
        setError(payload?.error || "Erro ao guardar convocatória.");
        return;
      }

      setConvocationStatus("confirmed");
    } catch {
      setError("Erro de ligação ao guardar convocatória.");
    } finally {
      setConfirmingConvocation(false);
    }
  }

  async function handleSaveGameEdit(e: { preventDefault(): void }) {
    e.preventDefault();
    setSavingGameEdit(true);
    setError(null);

    const res = await fetch(`/api/games/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: editTitle.trim() || null,
        opponent_name: editOpponent.trim(),
        opponent_short_name: editOpponentShortName.trim() || null,
        location: editLocation.trim() || null,
      }),
    });
    const payload = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(
        (payload as { error?: string }).error || "Erro ao guardar jogo.",
      );
    } else {
      setGame((prev) =>
        prev ? { ...prev, ...(payload as { game: Game }).game } : prev,
      );
      setEditingGame(false);
    }
    setSavingGameEdit(false);
  }

  function openEditGame() {
    if (!game) return;
    setEditTitle(game.title ?? "");
    setEditOpponent(game.opponent_name ?? "");
    setEditOpponentShortName(game.opponent_short_name ?? "");
    setEditLocation(game.location ?? "");
    setEditingGame(true);
  }

  // Auto-assign lineup when player is convocated: fills starters up to format number
  async function autoAssignLineup(playerId: string, isConvocated: boolean) {
    if (!isConvocated) {
      // Remove from lineup
      setLineupStatuses((prev) => {
        const next = { ...prev };
        delete next[playerId];
        return next;
      });
      await fetch(`/api/games/${id}/convocation/lineup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, lineupStatus: "substitute" }),
      }).catch(() => null);
      return;
    }

    const format = footballFormat ? parseInt(footballFormat) : 0;
    const currentStarters = Object.values(lineupStatuses).filter(
      (s) => s === "on_field",
    ).length;
    const newStatus: "on_field" | "substitute" =
      currentStarters < format ? "on_field" : "substitute";

    setLineupStatuses((prev) => ({ ...prev, [playerId]: newStatus }));
    await fetch(`/api/games/${id}/convocation/lineup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId, lineupStatus: newStatus }),
    }).catch(() => null);
  }

  const convocatedCount = players.filter((p) => p.isConvocated).length;

  // Helpers for display
  const isGkPlayer = (p: PlayerWithStatus) =>
    p.preferred_position != null && /gr|gk|guarda/i.test(p.preferred_position);

  const convocatedPlayers = players.filter((p) => p.isConvocated);

  const starters = convocatedPlayers
    .filter((p) => lineupStatuses[p.id] === "on_field")
    .sort((a, b) => {
      // GK always first in starters list
      const aGk = isGkPlayer(a);
      const bGk = isGkPlayer(b);
      if (aGk && !bGk) return -1;
      if (!aGk && bGk) return 1;
      return a.first_name.localeCompare(b.first_name, "pt", {
        sensitivity: "base",
      });
    });

  const subs = convocatedPlayers.filter(
    (p) => lineupStatuses[p.id] === "substitute" || !lineupStatuses[p.id],
  );

  const notConvocated = players.filter((p) => !p.isConvocated);

  const showGkWarning =
    starters.length > 0 && !starters.some((p) => isGkPlayer(p));

  if (loading) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-10 w-full rounded-xl" />
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (error && !game) {
    return (
      <div className="p-4 md:p-8 text-center py-16">
        <AlertCircle size={40} className="text-red-400 mx-auto mb-3" />
        <p className="text-slate-700 font-semibold">{error}</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => router.back()}
        >
          Voltar
        </Button>
      </div>
    );
  }

  if (!game) return null;

  const gameDate = game.game_datetime
    ? format(parseISO(game.game_datetime), "EEEE, d 'de' MMMM · HH:mm", {
        locale: pt,
      })
    : "—";

  const isCompetition = !!game.competition_id;
  const gameDateTime = game.game_datetime ? parseISO(game.game_datetime) : null;
  const liveUnlockAt = gameDateTime ? subMinutes(gameDateTime, 10) : null;
  const canStartLive = !liveUnlockAt || now >= liveUnlockAt;
  const isLiveInProgress =
    livePhase === "first_half" || livePhase === "second_half";
  const minutesUntilLive = liveUnlockAt
    ? Math.max(0, differenceInMinutes(liveUnlockAt, now))
    : 0;

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto">
      {/* Back */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-slate-500 hover:text-slate-700 text-sm mb-4 transition-colors"
      >
        <ArrowLeft size={16} /> Voltar
      </button>

      {/* Game header */}
      <div className="rounded-2xl bg-blue-600 text-white p-5 mb-5 relative">
        {(game.status !== "completed" || canEditCompleted) && (
          <button
            onClick={openEditGame}
            className="absolute top-3 right-3 p-1.5 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
            title="Editar jogo"
          >
            <Pencil size={14} />
          </button>
        )}
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium bg-white/20 px-2 py-0.5 rounded-full">
            {game.is_home ? "Casa" : "Fora"}
          </span>
          {isCompetition && (
            <span className="text-xs font-medium bg-white/20 px-2 py-0.5 rounded-full">
              Competição
            </span>
          )}
          {!isCompetition && (
            <span className="text-xs font-medium bg-white/20 px-2 py-0.5 rounded-full">
              Amigável
            </span>
          )}
          {game.title && (
            <span className="text-xs font-medium bg-white/20 px-2 py-0.5 rounded-full">
              {game.title}
            </span>
          )}
        </div>
        <h1 className="text-xl font-bold mt-1">
          {game.opponent_name
            ? `vs ${game.opponent_name}${game.opponent_short_name ? ` (${game.opponent_short_name})` : ""}`
            : "Jogo"}
        </h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-blue-100 text-sm">
          <span className="flex items-center gap-1">
            <Clock size={13} /> <span className="capitalize">{gameDate}</span>
          </span>
          {game.location && (
            <span className="flex items-center gap-1">
              <MapPin size={13} /> {game.location}
            </span>
          )}
        </div>
      </div>

      {/* Edit game modal */}
      {editingGame && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-4"
          onClick={() => setEditingGame(false)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-md shadow-xl max-h-[calc(100dvh-1rem)] md:max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b">
              <h3 className="font-bold text-slate-900">Editar jogo</h3>
              <button onClick={() => setEditingGame(false)}>
                <X size={20} className="text-slate-400" />
              </button>
            </div>
            <form
              onSubmit={handleSaveGameEdit}
              className="p-5 space-y-4 overflow-y-auto flex-1 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">
                  Jornada / Título
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="ex: Jornada 3, Taça, Final"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">
                  Adversário *
                </label>
                <input
                  type="text"
                  value={editOpponent}
                  onChange={(e) => setEditOpponent(e.target.value)}
                  placeholder="Nome do adversário"
                  required
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">
                  Sigla adversário
                </label>
                <input
                  type="text"
                  value={editOpponentShortName}
                  onChange={(e) =>
                    setEditOpponentShortName(
                      e.target.value
                        .toUpperCase()
                        .replace(/[^A-Z0-9]/g, "")
                        .slice(0, 5),
                    )
                  }
                  placeholder="ex: SCP"
                  maxLength={5}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">
                  Local
                </label>
                <input
                  type="text"
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                  placeholder="Nome do campo ou local"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={savingGameEdit}
                  className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-1"
                >
                  {savingGameEdit ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    "Guardar"
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingGame(false)}
                  className="px-4 border border-slate-200 rounded-lg py-2 text-sm text-slate-600 hover:bg-slate-50"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Live stats button — só disponível se jogo agendado */}
      {game.status !== "completed" && game.status !== "cancelled" && (
        <div className="mb-5 space-y-2">
          <Button
            onClick={() => router.push(`/games/${id}/live`)}
            disabled={!canStartLive}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-500"
          >
            <Play size={16} className="mr-2" />
            {canStartLive
              ? isLiveInProgress
                ? "Continuar jogo ao vivo"
                : "Iniciar jogo ao vivo"
              : `Disponível em ${minutesUntilLive} min`}
          </Button>
          {!canStartLive && (
            <p className="text-xs text-slate-500 text-center">
              O live fica disponível 10 minutos antes da hora do jogo.
            </p>
          )}
        </div>
      )}
      {game.status === "completed" && (
        <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-200 mb-5">
          <span className="text-slate-600 font-medium text-sm">Resultado</span>
          <span className="text-2xl font-bold text-slate-900">
            {game.score_home ?? "—"}–{game.score_away ?? "—"}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/games/${id}/summary`)}
          >
            Ver sumário
          </Button>
        </div>
      )}

      {/* Equipamento por jogo */}
      <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-slate-900">Equipamento do jogo</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Seleciona camisola, calções e meias de forma independente.
            </p>
          </div>
          {kitEditorOpen ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={closeKitEditor}
              disabled={savingKitSelection}
            >
              Fechar
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setKitDraftSelection(kitSelection);
                setKitEditorOpen(true);
              }}
            >
              Editar kit
            </Button>
          )}
        </div>

        {!kitEditorOpen && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              {
                title: "Jogadores de campo",
                prefix: "fp" as const,
              },
              {
                title: "Guarda-redes",
                prefix: "gk" as const,
              },
            ].map((section) => (
              <div
                key={section.prefix}
                className="rounded-lg border border-slate-100 bg-slate-50 p-3"
              >
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {section.title}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  {UI_PIECE_TYPES.map((pieceType) => {
                    const field =
                      `${section.prefix}_${pieceType === "shirt" ? "jersey" : pieceType}_kit_id` as keyof KitSelection;
                    const selectedPiece = kitById.get(
                      kitSelection[field] || "",
                    );

                    return (
                      <span
                        key={`${section.prefix}-${pieceType}`}
                        className="inline-flex items-center gap-1.5 text-xs text-slate-600"
                      >
                        <span
                          className="inline-block h-3 w-3 rounded-full border border-slate-300"
                          style={{
                            backgroundColor: getKitColor(selectedPiece),
                          }}
                        />
                        {PIECE_LABEL[pieceType]}
                        {selectedPiece
                          ? ` · Kit ${selectedPiece.kit_number}`
                          : ""}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {kitEditorOpen &&
          [
            {
              title: "Jogadores de campo",
              playerType: "field" as const,
              prefix: "fp" as const,
            },
            {
              title: "Guarda-redes",
              playerType: "goalkeeper" as const,
              prefix: "gk" as const,
            },
          ].map((section) => (
            <div key={section.prefix} className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {section.title}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {UI_PIECE_TYPES.map((pieceType) => {
                  const field =
                    `${section.prefix}_${pieceType === "shirt" ? "jersey" : pieceType}_kit_id` as keyof KitSelection;
                  const options = getKitOptions(section.playerType, pieceType);
                  const selectedValue = kitDraftSelection[field];
                  const hasSelectedOption = !selectedValue
                    ? true
                    : options.some((option) => option.id === selectedValue);

                  return (
                    <div key={pieceType} className="space-y-1">
                      <label className="text-xs text-slate-500">
                        {PIECE_LABEL[pieceType]}
                      </label>
                      <Select
                        value={selectedValue ?? "__none__"}
                        onValueChange={(value) =>
                          handleKitDraftChange(field, value)
                        }
                        disabled={savingKitSelection}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Sem seleção" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Sem seleção</SelectItem>
                          {!hasSelectedOption && selectedValue && (
                            <SelectItem value={selectedValue}>
                              Seleção atual (indisponível)
                            </SelectItem>
                          )}
                          {options.map((piece) => (
                            <SelectItem key={piece.id} value={piece.id}>
                              <span className="inline-flex items-center gap-2">
                                <span
                                  className="inline-block h-3 w-3 rounded-full border border-slate-300"
                                  style={{
                                    backgroundColor: getKitColor(piece),
                                  }}
                                />
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

        {kitEditorOpen && (
          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              className="bg-slate-900 hover:bg-slate-800"
              onClick={() => void saveKitSelection()}
              disabled={savingKitSelection || !hasKitDraftChanges}
            >
              {savingKitSelection ? (
                <Loader2 size={15} className="mr-2 animate-spin" />
              ) : (
                <Check size={15} className="mr-2" />
              )}
              Guardar equipamento
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={closeKitEditor}
              disabled={savingKitSelection}
            >
              Cancelar
            </Button>
          </div>
        )}
      </div>

      {/* Convocatória */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Shield size={18} className="text-slate-600" />
          <h2 className="font-bold text-slate-900">Convocatória</h2>
        </div>
        <div className="text-right">
          <span className="text-sm text-slate-500 block">
            {convocatedCount} convocado{convocatedCount !== 1 ? "s" : ""}
          </span>
          <span
            className={`text-[11px] font-semibold ${
              convocationStatus === "confirmed"
                ? "text-emerald-600"
                : convocationStatus === "closed"
                  ? "text-slate-500"
                  : "text-amber-600"
            }`}
          >
            {convocationStatus === "confirmed"
              ? "Guardada"
              : convocationStatus === "closed"
                ? "Fechada"
                : "Rascunho"}
          </span>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg mb-3 border border-red-200">
          {error}
        </div>
      )}

      {players.length === 0 ? (
        <div className="text-center py-10">
          <Users size={36} className="text-slate-200 mx-auto mb-2" />
          <p className="text-slate-400 text-sm">
            Sem jogadores ativos no escalão.
          </p>
        </div>
      ) : (
        <>
          {/* Titulares */}
          {starters.length > 0 && (
            <div className="mb-1">
              <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide px-1 mb-2">
                Titulares · {starters.length}
                {footballFormat ? `/${footballFormat}` : ""}
              </p>
              {starters.map((player) => (
                <ConvocatedRow
                  key={player.id}
                  player={player}
                  isGk={isGkPlayer(player)}
                  isStarter={true}
                  onToggleLineup={() => void handleLineupToggle(player.id)}
                  onRemove={() => void togglePlayer(player)}
                  savingToggle={saving === player.id}
                  savingLineup={savingLineupPlayer === player.id}
                  disabled={game.status === "completed"}
                />
              ))}
            </div>
          )}

          {/* GK warning */}
          {showGkWarning && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
              <AlertCircle size={14} className="text-amber-600 flex-shrink-0" />
              <p className="text-xs text-amber-700 font-medium">
                Nenhum GR no onze inicial
              </p>
            </div>
          )}

          {/* Suplentes */}
          {subs.length > 0 && (
            <div className="mb-1 mt-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide px-1 mb-2">
                Suplentes · {subs.length}
              </p>
              {subs.map((player) => (
                <ConvocatedRow
                  key={player.id}
                  player={player}
                  isGk={false}
                  isStarter={false}
                  onToggleLineup={() => void handleLineupToggle(player.id)}
                  onRemove={() => void togglePlayer(player)}
                  savingToggle={saving === player.id}
                  savingLineup={savingLineupPlayer === player.id}
                  disabled={game.status === "completed"}
                />
              ))}
            </div>
          )}

          {/* Sistema Táctico (only when there are starters) */}
          {starters.length > 0 &&
            footballFormat &&
            (FORMATIONS_BY_FORMAT[footballFormat] ?? []).length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-100">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  Sistema Táctico · Futebol {footballFormat}
                </p>
                <Select
                  value={tacticalSystem ?? "__none__"}
                  onValueChange={(v) =>
                    void handleTacticalChange(v === "__none__" ? "" : v)
                  }
                  disabled={savingTactical || game.status === "completed"}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Seleciona a formação" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">
                      Sem formação definida
                    </SelectItem>
                    {(FORMATIONS_BY_FORMAT[footballFormat] ?? []).map((f) => (
                      <SelectItem key={f} value={f}>
                        {f}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

          {/* Disponíveis (not yet convocated) */}
          {notConvocated.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide px-1 mb-2">
                Disponíveis · {notConvocated.length}
              </p>
              {notConvocated.map((player) => (
                <button
                  key={player.id}
                  onClick={() => void togglePlayer(player)}
                  disabled={
                    saving === player.id ||
                    player.isBlocked ||
                    game.status === "completed"
                  }
                  className={`w-full flex items-center gap-3 p-3 rounded-xl mb-1.5 text-left border-2 transition-colors ${
                    player.isBlocked
                      ? "border-slate-100 bg-slate-50 opacity-50 cursor-not-allowed"
                      : "border-slate-100 bg-white hover:border-emerald-200 hover:bg-emerald-50"
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {player.jersey_number || "—"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-600 truncate">
                      {player.first_name} {player.last_name}
                    </p>
                    {player.preferred_position && (
                      <p className="text-xs text-slate-400">
                        {player.preferred_position}
                      </p>
                    )}
                    {player.isBlocked && (
                      <p className="text-xs text-orange-500">
                        Jogo de competição no mesmo dia
                      </p>
                    )}
                  </div>
                  {saving === player.id ? (
                    <Loader2
                      size={16}
                      className="text-slate-400 animate-spin flex-shrink-0"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full border-2 border-slate-200 flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}

          {isCompetition && (
            <p className="text-xs text-slate-400 text-center mt-4">
              Jogadores com jogo de competição no mesmo dia não podem ser
              convocados.
            </p>
          )}
        </>
      )}

      <Button
        onClick={handleConfirmConvocation}
        disabled={
          confirmingConvocation ||
          convocatedCount === 0 ||
          convocationStatus === "closed"
        }
        className="w-full mt-5 bg-slate-900 hover:bg-slate-800"
      >
        {confirmingConvocation ? (
          <Loader2 size={16} className="mr-2 animate-spin" />
        ) : (
          <Check size={16} className="mr-2" />
        )}
        Guardar convocatória
      </Button>
    </div>
  );
}

function ConvocatedRow({
  player,
  isGk,
  isStarter,
  onToggleLineup,
  onRemove,
  savingToggle,
  savingLineup,
  disabled,
}: {
  player: PlayerWithStatus;
  isGk: boolean;
  isStarter: boolean;
  onToggleLineup: () => void;
  onRemove: () => void;
  savingToggle: boolean;
  savingLineup: boolean;
  disabled: boolean;
}) {
  const badgeLabel = isGk ? "GR" : isStarter ? "Titular" : "Suplente";

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-xl mb-1.5 border-2 ${
        isStarter ? "border-blue-200 bg-blue-50" : "border-slate-100 bg-white"
      }`}
    >
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
          isGk
            ? "bg-yellow-500 text-white"
            : isStarter
              ? "bg-blue-500 text-white"
              : "bg-slate-200 text-slate-500"
        }`}
      >
        {player.jersey_number || "—"}
      </div>
      <div className="flex-1 min-w-0">
        <p
          className={`font-medium text-sm truncate ${isStarter ? "text-blue-900" : "text-slate-700"}`}
        >
          {player.first_name} {player.last_name}
        </p>
        {player.preferred_position && (
          <p className="text-xs text-slate-400">{player.preferred_position}</p>
        )}
      </div>
      {/* Toggle lineup badge */}
      <button
        onClick={onToggleLineup}
        disabled={savingLineup || disabled}
        className={`text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0 transition-colors ${
          isGk
            ? "bg-yellow-100 text-yellow-700 hover:bg-yellow-200"
            : isStarter
              ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
              : "bg-slate-100 text-slate-500 hover:bg-slate-200"
        }`}
      >
        {savingLineup ? "..." : badgeLabel}
      </button>
      {/* Remove from convocatória */}
      <button
        onClick={onRemove}
        disabled={savingToggle || disabled}
        className="p-1 hover:bg-red-50 rounded-lg group flex-shrink-0"
        title="Remover da convocatória"
      >
        {savingToggle ? (
          <Loader2 size={14} className="text-slate-300 animate-spin" />
        ) : (
          <X
            size={14}
            className="text-slate-200 group-hover:text-red-400 transition-colors"
          />
        )}
      </button>
    </div>
  );
}
