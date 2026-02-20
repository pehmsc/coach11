"use client";

import { useState, useEffect } from "react";
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
import type { Game, Player } from "@/types/database";

interface PlayerWithStatus extends Player {
  isConvocated: boolean;
  isBlocked: boolean; // já convocado noutro jogo de competição no mesmo dia
}

interface KitPieceRow {
  id: string;
  kit_number: number;
  player_type: "field" | "goalkeeper";
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

export default function GameDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [confirmingConvocation, setConfirmingConvocation] = useState(false);
  const [convocationStatus, setConvocationStatus] = useState<"draft" | "confirmed" | "closed">(
    "draft",
  );
  const [now, setNow] = useState(() => new Date());
  const [game, setGame] = useState<Game | null>(null);
  const [players, setPlayers] = useState<PlayerWithStatus[]>([]);
  const [teamKits, setTeamKits] = useState<KitPieceRow[]>([]);
  const [kitSelection, setKitSelection] = useState<KitSelection>(EMPTY_KIT_SELECTION);
  const [savingKitField, setSavingKitField] = useState<keyof KitSelection | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      const res = await fetch(`/api/games/${id}/convocation`, { cache: "no-store" });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok || !payload?.game) {
        setGame(null);
        setPlayers([]);
        setTeamKits([]);
        setKitSelection(EMPTY_KIT_SELECTION);
        setConvocationStatus("draft");
        setError(payload?.error || "Erro ao carregar jogo.");
        return;
      }

      setGame(payload.game as Game);

      if (
        payload.convocationStatus === "confirmed" ||
        payload.convocationStatus === "closed"
      ) {
        setConvocationStatus(payload.convocationStatus);
      } else {
        setConvocationStatus("draft");
      }

      setPlayers((Array.isArray(payload.players) ? payload.players : []) as PlayerWithStatus[]);
      setTeamKits((Array.isArray(payload.kits) ? payload.kits : []) as KitPieceRow[]);
      setKitSelection({
        ...EMPTY_KIT_SELECTION,
        ...(typeof payload.kitSelection === "object" && payload.kitSelection
          ? (payload.kitSelection as Partial<KitSelection>)
          : {}),
      });
    } catch {
      setGame(null);
      setPlayers([]);
      setTeamKits([]);
      setKitSelection(EMPTY_KIT_SELECTION);
      setConvocationStatus("draft");
      setError("Erro de ligação ao carregar jogo.");
    } finally {
      setLoading(false);
    }
  }

  function getKitOptions(
    playerType: KitPieceRow["player_type"],
    pieceType: (typeof UI_PIECE_TYPES)[number],
  ) {
    return teamKits.filter(
      (piece) => piece.player_type === playerType && samePieceType(piece.piece_type, pieceType),
    );
  }

  async function handleKitChange(field: keyof KitSelection, value: string) {
    const normalizedValue = value === "__none__" ? null : value;
    const previousSelection = kitSelection;
    const nextSelection: KitSelection = {
      ...kitSelection,
      [field]: normalizedValue,
    };

    setSavingKitField(field);
    setError(null);
    setKitSelection(nextSelection);

    try {
      const res = await fetch(`/api/games/${id}/convocation/kits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextSelection),
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        setKitSelection(previousSelection);
        setError(payload?.error || "Erro ao guardar equipamentos da convocatória.");
        return;
      }

      const responseSelection =
        typeof payload?.kitSelection === "object" && payload.kitSelection
          ? (payload.kitSelection as Partial<KitSelection>)
          : null;

      setKitSelection({
        ...nextSelection,
        ...(responseSelection || {}),
      });
      setConvocationStatus("draft");
    } catch {
      setKitSelection(previousSelection);
      setError("Erro de ligação ao guardar equipamentos da convocatória.");
    } finally {
      setSavingKitField(null);
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
        setPlayers((prev) =>
          prev.map((p) =>
            p.id === player.id
              ? { ...p, isConvocated: payload.isConvocated as boolean }
              : p,
          ),
        );
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

  const convocatedCount = players.filter((p) => p.isConvocated).length;

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
        <Button variant="outline" size="sm" className="mt-4" onClick={() => router.back()}>
          Voltar
        </Button>
      </div>
    );
  }

  if (!game) return null;

  const gameDate = game.game_datetime
    ? format(parseISO(game.game_datetime), "EEEE, d 'de' MMMM · HH:mm", { locale: pt })
    : "—";

  const isCompetition = !!game.competition_id;
  const gameDateTime = game.game_datetime ? parseISO(game.game_datetime) : null;
  const liveUnlockAt = gameDateTime ? subMinutes(gameDateTime, 10) : null;
  const canStartLive = !liveUnlockAt || now >= liveUnlockAt;
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
      <div className="rounded-2xl bg-blue-600 text-white p-5 mb-5">
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
        </div>
        <h1 className="text-xl font-bold mt-1">
          {game.opponent_name ? `vs ${game.opponent_name}` : "Jogo"}
        </h1>
        <div className="flex items-center gap-4 mt-2 text-blue-100 text-sm">
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

      {/* Live stats button — só disponível se jogo agendado */}
      {game.status === "scheduled" && (
        <div className="mb-5 space-y-2">
          <Button
            onClick={() => router.push(`/games/${id}/live`)}
            disabled={!canStartLive}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-500"
          >
            <Play size={16} className="mr-2" />
            {canStartLive
              ? "Iniciar jogo ao vivo"
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
            onClick={() => router.push(`/games/${id}/live`)}
          >
            Ver detalhes
          </Button>
        </div>
      )}

      {/* Equipamento por jogo */}
      <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 space-y-4">
        <div>
          <h2 className="font-bold text-slate-900">Equipamento do jogo</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Seleciona camisola, calções e meias de forma independente.
          </p>
        </div>

        {[
          { title: "Jogadores de campo", playerType: "field" as const, prefix: "fp" as const },
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
                const field = `${section.prefix}_${pieceType === "shirt" ? "jersey" : pieceType}_kit_id` as keyof KitSelection;
                const options = getKitOptions(section.playerType, pieceType);
                const selectedValue = kitSelection[field];
                const hasSelectedOption = !selectedValue
                  ? true
                  : options.some((option) => option.id === selectedValue);

                return (
                  <div key={pieceType} className="space-y-1">
                    <label className="text-xs text-slate-500">{PIECE_LABEL[pieceType]}</label>
                    <Select
                      value={selectedValue ?? "__none__"}
                      onValueChange={(value) => void handleKitChange(field, value)}
                      disabled={savingKitField === field}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Sem seleção" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Sem seleção</SelectItem>
                        {!hasSelectedOption && selectedValue && (
                          <SelectItem value={selectedValue}>Seleção atual (indisponível)</SelectItem>
                        )}
                        {options.map((piece) => {
                          const pieceColor = (piece.color_hex || piece.color_name || "Sem cor")
                            .toUpperCase();
                          return (
                            <SelectItem key={piece.id} value={piece.id}>
                              Kit {piece.kit_number} · {pieceColor}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
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
          <p className="text-slate-400 text-sm">Sem jogadores ativos no escalão.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {players.filter((p) => p.isConvocated).length > 0 && (
            <div>
              <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-2">
                Convocados ({players.filter((p) => p.isConvocated).length})
              </p>
              {players
                .filter((p) => p.isConvocated)
                .map((player) => (
                  <PlayerRow
                    key={player.id}
                    player={player}
                    saving={saving === player.id}
                    onToggle={() => togglePlayer(player)}
                  />
                ))}
            </div>
          )}

          {players.filter((p) => !p.isConvocated).length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                Não convocados
              </p>
              {players
                .filter((p) => !p.isConvocated)
                .map((player) => (
                  <PlayerRow
                    key={player.id}
                    player={player}
                    saving={saving === player.id}
                    onToggle={() => togglePlayer(player)}
                  />
                ))}
            </div>
          )}
        </div>
      )}

      {isCompetition && (
        <p className="text-xs text-slate-400 text-center mt-6">
          Jogadores com jogo de competição no mesmo dia não podem ser convocados.
        </p>
      )}

      <Button
        onClick={handleConfirmConvocation}
        disabled={confirmingConvocation || convocatedCount === 0 || convocationStatus === "closed"}
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

function PlayerRow({
  player,
  saving,
  onToggle,
}: {
  player: PlayerWithStatus;
  saving: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      disabled={saving || player.isBlocked}
      className={`w-full flex items-center gap-3 p-3 rounded-xl mb-1.5 transition-colors text-left border-2 ${
        player.isConvocated
          ? "border-emerald-300 bg-emerald-50"
          : player.isBlocked
            ? "border-slate-100 bg-slate-50 opacity-50 cursor-not-allowed"
            : "border-slate-100 bg-white hover:border-emerald-200 hover:bg-emerald-50"
      }`}
    >
      {/* Número */}
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
          player.isConvocated
            ? "bg-emerald-500 text-white"
            : "bg-slate-100 text-slate-500"
        }`}
      >
        {player.jersey_number || "—"}
      </div>

      {/* Nome */}
      <div className="flex-1 min-w-0">
        <p
          className={`font-medium text-sm truncate ${
            player.isConvocated ? "text-emerald-900" : "text-slate-800"
          }`}
        >
          {player.first_name} {player.last_name}
        </p>
        {player.preferred_position && (
          <p className="text-xs text-slate-400">{player.preferred_position}</p>
        )}
        {player.isBlocked && (
          <p className="text-xs text-orange-500">Jogo de competição no mesmo dia</p>
        )}
      </div>

      {/* Estado */}
      <div className="flex-shrink-0">
        {saving ? (
          <Loader2 size={18} className="text-slate-400 animate-spin" />
        ) : player.isConvocated ? (
          <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center">
            <Check size={14} className="text-white" />
          </div>
        ) : player.isBlocked ? (
          <AlertCircle size={18} className="text-orange-400" />
        ) : (
          <div className="w-6 h-6 rounded-full border-2 border-slate-200" />
        )}
      </div>
    </button>
  );
}
