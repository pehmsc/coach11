"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { format, parseISO } from "date-fns";
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
import type { Game, Player, Convocation } from "@/types/database";

interface PlayerWithStatus extends Player {
  isConvocated: boolean;
  isBlocked: boolean; // já convocado noutro jogo de competição no mesmo dia
}

export default function GameDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [convocation, setConvocation] = useState<Convocation | null>(null);
  const [players, setPlayers] = useState<PlayerWithStatus[]>([]);
  const [ageGroupId, setAgeGroupId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function loadData() {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    // Buscar jogo
    const { data: gameData, error: gameErr } = await supabase
      .from("games")
      .select("*")
      .eq("id", id)
      .single();

    if (gameErr || !gameData) {
      setError("Jogo não encontrado.");
      setLoading(false);
      return;
    }

    setGame(gameData);

    const agId = gameData.age_group_id;
    setAgeGroupId(agId);

    // Buscar ou criar convocatória
    let conv: Convocation | null = null;
    const { data: existingConv } = await supabase
      .from("convocations")
      .select("*")
      .eq("game_id", id)
      .maybeSingle();

    if (existingConv) {
      conv = existingConv;
    } else {
      const { data: newConv } = await supabase
        .from("convocations")
        .insert({ game_id: id, status: "draft" })
        .select()
        .single();
      conv = newConv;
    }

    setConvocation(conv);

    if (!agId) {
      setLoading(false);
      return;
    }

    // Buscar jogadores ativos
    const { data: activePlayers } = await supabase
      .from("players")
      .select("*")
      .eq("age_group_id", agId)
      .eq("status", "active")
      .order("jersey_number", { ascending: true, nullsFirst: false });

    // Buscar convocados desta convocatória
    const convocatedIds = new Set<string>();
    if (conv) {
      const { data: cp } = await supabase
        .from("convocation_players")
        .select("player_id")
        .eq("convocation_id", conv.id);
      (cp || []).forEach((r) => convocatedIds.add(r.player_id));
    }

    // Verificar bloqueios: jogadores já convocados noutro jogo de competição no mesmo dia
    const blockedIds = new Set<string>();
    if (gameData.competition_id) {
      const gameDate = gameData.game_datetime?.split("T")[0];
      if (gameDate) {
        // Buscar outros jogos de competição no mesmo dia (excluindo este)
        const { data: sameDay } = await supabase
          .from("games")
          .select("id")
          .neq("id", id)
          .not("competition_id", "is", null)
          .gte("game_datetime", `${gameDate}T00:00:00`)
          .lte("game_datetime", `${gameDate}T23:59:59`);

        if (sameDay && sameDay.length > 0) {
          const otherGameIds = sameDay.map((g) => g.id);

          // Buscar convocatórias desses jogos
          const { data: otherConvs } = await supabase
            .from("convocations")
            .select("id")
            .in("game_id", otherGameIds);

          if (otherConvs && otherConvs.length > 0) {
            const otherConvIds = otherConvs.map((c) => c.id);
            const { data: blocked } = await supabase
              .from("convocation_players")
              .select("player_id")
              .in("convocation_id", otherConvIds);
            (blocked || []).forEach((r) => blockedIds.add(r.player_id));
          }
        }
      }
    }

    const enriched: PlayerWithStatus[] = (activePlayers || []).map((p) => ({
      ...p,
      isConvocated: convocatedIds.has(p.id),
      isBlocked: blockedIds.has(p.id) && !convocatedIds.has(p.id),
    }));

    setPlayers(enriched);
    setLoading(false);
  }

  async function togglePlayer(player: PlayerWithStatus) {
    if (!convocation || player.isBlocked) return;
    setSaving(player.id);
    setError(null);

    if (player.isConvocated) {
      // Remover da convocatória
      const { error } = await supabase
        .from("convocation_players")
        .delete()
        .eq("convocation_id", convocation.id)
        .eq("player_id", player.id);

      if (error) {
        setError("Erro ao remover jogador.");
      } else {
        setPlayers((prev) =>
          prev.map((p) =>
            p.id === player.id ? { ...p, isConvocated: false } : p,
          ),
        );
      }
    } else {
      // Adicionar à convocatória
      const { error } = await supabase.from("convocation_players").insert({
        convocation_id: convocation.id,
        player_id: player.id,
      });

      if (error) {
        setError("Erro ao convocar jogador.");
      } else {
        setPlayers((prev) =>
          prev.map((p) =>
            p.id === player.id ? { ...p, isConvocated: true } : p,
          ),
        );
      }
    }

    setSaving(null);
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
        <Button
          onClick={() => router.push(`/games/${id}/live`)}
          className="w-full mb-5 bg-emerald-600 hover:bg-emerald-700"
        >
          <Play size={16} className="mr-2" /> Iniciar jogo ao vivo
        </Button>
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

      {/* Convocatória */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Shield size={18} className="text-slate-600" />
          <h2 className="font-bold text-slate-900">Convocatória</h2>
        </div>
        <span className="text-sm text-slate-500">
          {convocatedCount} convocado{convocatedCount !== 1 ? "s" : ""}
        </span>
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
          {/* Convocados */}
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

          {/* Não convocados */}
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
