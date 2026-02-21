"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO, isToday, isFuture, isPast } from "date-fns";
import { pt } from "date-fns/locale";
import { Loader2, Sword, Home, Plane, ChevronRight, AlertCircle } from "lucide-react";

interface GameRow {
  id: string;
  game_datetime: string;
  opponent_name?: string;
  is_home: boolean;
  status: string;
  score_home?: number;
  score_away?: number;
  location?: string;
  title?: string;
  competition_id?: string;
}

function groupByMonth(games: GameRow[]): { label: string; games: GameRow[] }[] {
  const map = new Map<string, GameRow[]>();
  for (const game of games) {
    const key = format(parseISO(game.game_datetime), "MMMM yyyy", { locale: pt });
    const bucket = map.get(key) ?? [];
    bucket.push(game);
    map.set(key, bucket);
  }
  return Array.from(map.entries()).map(([label, games]) => ({ label, games }));
}

function statusBadge(game: GameRow) {
  const dt = parseISO(game.game_datetime);
  if (game.status === "completed") {
    return <span className="text-[10px] font-bold bg-slate-100 text-slate-500 rounded px-1.5 py-0.5">Concluído</span>;
  }
  if (game.status === "cancelled") {
    return <span className="text-[10px] font-bold bg-red-100 text-red-500 rounded px-1.5 py-0.5">Cancelado</span>;
  }
  if (isToday(dt)) {
    return <span className="text-[10px] font-bold bg-amber-100 text-amber-700 rounded px-1.5 py-0.5 animate-pulse">Hoje</span>;
  }
  if (isFuture(dt)) {
    return <span className="text-[10px] font-bold bg-blue-100 text-blue-700 rounded px-1.5 py-0.5">Agendado</span>;
  }
  return null;
}

export default function GamesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [games, setGames] = useState<GameRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasContext, setHasContext] = useState(true);

  useEffect(() => {
    void loadGames();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadGames() {
    setLoading(true);
    setLoadError(null);
    setHasContext(true);

    const res = await fetch("/api/games", { cache: "no-store" });
    const payload = (await res.json().catch(() => null)) as
      | { success?: boolean; linked?: boolean; games?: GameRow[]; error?: string }
      | null;

    if (!res.ok || !payload) {
      setLoadError(payload?.error || "Erro ao carregar jogos.");
      setLoading(false);
      return;
    }

    if (payload.linked === false) {
      setHasContext(false);
      setGames([]);
      setLoading(false);
      return;
    }

    setGames(Array.isArray(payload.games) ? payload.games : []);
    setLoading(false);
  }

  const grouped = groupByMonth(games);

  // Split future vs past
  const upcoming = games.filter((g) => isFuture(parseISO(g.game_datetime)) || isToday(parseISO(g.game_datetime)));
  const past = games.filter((g) => isPast(parseISO(g.game_datetime)) && !isToday(parseISO(g.game_datetime)));

  if (loading) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto flex items-center justify-center py-16">
        <Loader2 size={28} className="animate-spin text-slate-400" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto text-center py-16">
        <AlertCircle size={40} className="text-red-300 mx-auto mb-3" />
        <p className="text-slate-700 text-sm">{loadError}</p>
      </div>
    );
  }

  if (!hasContext) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto text-center py-16">
        <Sword size={40} className="text-slate-200 mx-auto mb-3" />
        <p className="text-slate-700 font-semibold mb-2">Sem escalão configurado</p>
        <p className="text-slate-500 text-sm">
          Configura o teu escalão em Configurações antes de gerir jogos.
        </p>
      </div>
    );
  }

  if (games.length === 0) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto text-center py-16">
        <Sword size={40} className="text-slate-200 mx-auto mb-3" />
        <p className="text-slate-500 text-sm">Nenhum jogo registado.</p>
        <p className="text-slate-400 text-xs mt-1">Adiciona jogos em Competições ou no Calendário.</p>
      </div>
    );
  }

  void grouped; // suppress unused var (we use upcoming/past sections instead)

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Jogos</h1>

      {/* Próximos */}
      {upcoming.length > 0 && (
        <section className="mb-6">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Próximos</h2>
          <div className="space-y-2">
            {upcoming
              .slice()
              .sort((a, b) => new Date(a.game_datetime).getTime() - new Date(b.game_datetime).getTime())
              .map((game) => <GameCard key={game.id} game={game} onClick={() => router.push(`/games/${game.id}`)} />)}
          </div>
        </section>
      )}

      {/* Jogados */}
      {past.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Jogados</h2>
          <div className="space-y-2">
            {past.map((game) => <GameCard key={game.id} game={game} onClick={() => router.push(`/games/${game.id}`)} />)}
          </div>
        </section>
      )}
    </div>
  );
}

function GameCard({ game, onClick }: { game: GameRow; onClick: () => void }) {
  const dt = parseISO(game.game_datetime);
  const hasResult = game.status === "completed" && game.score_home != null && game.score_away != null;

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-4 bg-white border border-slate-100 rounded-2xl hover:border-slate-200 hover:shadow-sm transition-all text-left"
    >
      {/* Date column */}
      <div className="flex-shrink-0 w-12 text-center">
        <p className="text-lg font-bold text-slate-900 leading-none">{format(dt, "d")}</p>
        <p className="text-xs text-slate-400 capitalize">{format(dt, "MMM", { locale: pt })}</p>
        <p className="text-[10px] text-slate-300">{format(dt, "HH:mm")}</p>
      </div>

      {/* VS */}
      <div className="flex-shrink-0 flex flex-col items-center gap-0.5">
        {game.is_home ? (
          <Home size={12} className="text-emerald-500" />
        ) : (
          <Plane size={12} className="text-blue-500" />
        )}
        <span className="text-[9px] text-slate-400">{game.is_home ? "Casa" : "Fora"}</span>
      </div>

      {/* Opponent + badges */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {game.title && (
            <span className="text-[10px] font-bold bg-blue-100 text-blue-700 rounded px-1.5 py-0.5">
              {game.title.replace("Jornada ", "J")}
            </span>
          )}
          {game.competition_id && !game.title && (
            <span className="text-[10px] font-bold bg-amber-100 text-amber-700 rounded px-1.5 py-0.5">Copa</span>
          )}
          {statusBadge(game)}
        </div>
        <p className="text-sm font-semibold text-slate-800 truncate mt-0.5">
          {game.is_home ? "vs" : "@"} {game.opponent_name || "Adversário"}
        </p>
        {game.location && (
          <p className="text-xs text-slate-400 truncate">{game.location}</p>
        )}
      </div>

      {/* Score */}
      {hasResult ? (
        <div className="flex-shrink-0 text-right">
          <p className="text-lg font-bold text-slate-900 leading-none">
            {game.score_home}–{game.score_away}
          </p>
        </div>
      ) : (
        <ChevronRight size={16} className="text-slate-300 flex-shrink-0" />
      )}
    </button>
  );
}
