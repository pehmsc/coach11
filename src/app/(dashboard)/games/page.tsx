"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO, isToday, isFuture, isPast } from "date-fns";
import { pt } from "date-fns/locale";
import {
  Loader2,
  Sword,
  Home,
  Plane,
  ChevronRight,
  AlertCircle,
  Plus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  GameFormFields,
  type GameCompetitionOption,
  type SharedGameFormValues,
} from "@/components/games/game-form-fields";
import {
  isValidManualShortName,
  normalizeManualShortName,
} from "@/lib/football/short-name";

interface GameRow {
  id: string;
  game_datetime: string;
  opponent_name?: string;
  opponent_short_name?: string;
  is_home: boolean;
  status: string;
  score_home?: number;
  score_away?: number;
  location?: string;
  title?: string;
  competition_id?: string;
}

type CompetitionsResponse = {
  success?: boolean;
  competitions?: Array<{
    id?: string;
    name?: string;
    season?: string | null;
    team_label?: string | null;
    is_active?: boolean;
  }>;
};

function statusBadge(game: GameRow) {
  if (game.status === "completed" || game.status === "cancelled") {
    return (
      <span className="text-[10px] font-bold bg-slate-100 text-slate-500 rounded px-1.5 py-0.5">
        Fechado
      </span>
    );
  }
  return (
    <span className="text-[10px] font-bold bg-blue-100 text-blue-700 rounded px-1.5 py-0.5">
      Agendado
    </span>
  );
}

export default function GamesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [games, setGames] = useState<GameRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasContext, setHasContext] = useState(true);
  const [creatingGame, setCreatingGame] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [competitionOptions, setCompetitionOptions] = useState<GameCompetitionOption[]>([]);
  const [gameForm, setGameForm] = useState<SharedGameFormValues>({
    opponent_name: "",
    opponent_short_name: "",
    date: "",
    start_time: "15:00",
    location: "",
    is_home: true,
    competition_id: "",
  });

  useEffect(() => {
    void Promise.all([loadGames(), loadCompetitions()]);
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

  async function loadCompetitions() {
    const res = await fetch("/api/competitions", { cache: "no-store" });
    const payload = (await res.json().catch(() => null)) as CompetitionsResponse | null;
    if (!res.ok || !payload?.success) {
      setCompetitionOptions([]);
      return;
    }

    const options = (payload.competitions || [])
      .filter((competition) => !!competition.id && competition.is_active !== false)
      .map((competition) => ({
        id: competition.id as string,
        name: competition.name || "Competição",
        season: competition.season || null,
        team_label: competition.team_label || null,
      }));

    setCompetitionOptions(options);
  }

  function resetCreateForm() {
    const today = new Date();
    setGameForm({
      opponent_name: "",
      opponent_short_name: "",
      date: format(today, "yyyy-MM-dd"),
      start_time: "15:00",
      location: "",
      is_home: true,
      competition_id: "",
    });
    setCreateError(null);
  }

  function handleGameFormFieldChange(
    field: keyof SharedGameFormValues,
    value: string | boolean,
  ) {
    setGameForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  async function handleCreateGame(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!gameForm.opponent_name.trim() || !gameForm.date || !gameForm.start_time) {
      setCreateError("Preenche adversário, data e hora.");
      return;
    }
    if (!isValidManualShortName(gameForm.opponent_short_name, 2, 5)) {
      setCreateError("A sigla do adversário deve ter entre 2 e 5 caracteres.");
      return;
    }

    setCreatingGame(true);
    setCreateError(null);
    const normalizedOpponentShortName = normalizeManualShortName(
      gameForm.opponent_short_name,
      5,
    );
    try {
      const res = await fetch("/api/calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "game",
          payload: {
            opponent_name: gameForm.opponent_name.trim(),
            opponent_short_name: normalizedOpponentShortName || null,
            competition_id: gameForm.competition_id || null,
            date: gameForm.date,
            start_time: gameForm.start_time,
            location: gameForm.location.trim() || null,
            is_home: gameForm.is_home,
          },
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.event?.id) {
        setCreateError(
          (payload as { error?: string } | null)?.error || "Erro ao criar jogo.",
        );
        return;
      }
      setCreateModalOpen(false);
      resetCreateForm();
      await loadGames();
    } catch {
      setCreateError("Erro de ligação ao criar jogo.");
    } finally {
      setCreatingGame(false);
    }
  }

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
        <p className="text-slate-400 text-xs mt-1">Cria o primeiro jogo aqui.</p>
        <Button
          className="mt-4 bg-indigo-600 hover:bg-indigo-700"
          onClick={() => {
            resetCreateForm();
            setCreateModalOpen(true);
          }}
        >
          <Plus size={16} className="mr-2" />
          Adicionar jogo
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Jogos</h1>
        <Button
          className="bg-indigo-600 hover:bg-indigo-700"
          onClick={() => {
            resetCreateForm();
            setCreateModalOpen(true);
          }}
        >
          <Plus size={16} className="mr-2" />
          Adicionar jogo
        </Button>
      </div>

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

      {createModalOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-4"
          onClick={() => setCreateModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-md shadow-xl max-h-[calc(100dvh-1rem)] md:max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b">
              <h3 className="font-bold text-slate-900">Adicionar jogo</h3>
              <button onClick={() => setCreateModalOpen(false)}>
                <X size={20} className="text-slate-400" />
              </button>
            </div>
            <form
              onSubmit={handleCreateGame}
              className="p-5 space-y-3 overflow-y-auto flex-1 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              <GameFormFields
                values={gameForm}
                onFieldChange={handleGameFormFieldChange}
                competitionOptions={competitionOptions}
                showCompetitionSelect
              />
              {createError && <p className="text-sm text-red-600">{createError}</p>}
              <div className="flex gap-2 pt-1">
                <Button
                  type="submit"
                  disabled={creatingGame}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                >
                  {creatingGame ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    "Criar jogo"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCreateModalOpen(false)}
                  disabled={creatingGame}
                >
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
          {game.opponent_short_name ? ` (${game.opponent_short_name})` : ""}
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
