"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { pt } from "date-fns/locale";
import {
  Loader2,
  Sword,
  Home,
  Plane,
  ChevronRight,
  AlertCircle,
  Plus,
  Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  type GameCompetitionOption,
  type SharedGameFormValues,
} from "@/components/games/game-form-fields";
import { GameFormModal } from "@/components/games/GameFormModal";
import {
  type LocationSource,
  resolveLocationLabel,
} from "@/lib/location";
import {
  normalizeManualShortName,
} from "@/lib/football/short-name";
import {
  formatFixtureOpponentLabel,
  isClosedGameStatus,
} from "@/lib/games/display";

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
  formatted_address?: string;
  latitude?: number | null;
  longitude?: number | null;
  osm_place_id?: string;
  location_source?: LocationSource | null;
  title?: string;
  competition_id?: string;
  team_id?: string;
  age_group_id?: string;
  end_time?: string | null;
  notes?: string | null;
  image_url?: string | null;
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
  if (isClosedGameStatus(game.status)) {
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

function groupByMonth(games: GameRow[]): { label: string; games: GameRow[] }[] {
  const map = new Map<string, GameRow[]>();

  for (const game of games) {
    const key = format(parseISO(game.game_datetime), "MMMM yyyy", { locale: pt });
    const bucket = map.get(key) ?? [];
    bucket.push(game);
    map.set(key, bucket);
  }

  return Array.from(map.entries()).map(([label, monthGames]) => ({
    label,
    games: monthGames,
  }));
}

export default function GamesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [games, setGames] = useState<GameRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasContext, setHasContext] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createMode, setCreateMode] = useState<"create" | "duplicate">("create");
  const [competitionOptions, setCompetitionOptions] = useState<GameCompetitionOption[]>([]);
  const [ageGroupId, setAgeGroupId] = useState<string | null>(null);
  const [closedGamesExpanded, setClosedGamesExpanded] = useState(false);
  const [duplicateInitialValues, setDuplicateInitialValues] = useState<
    Partial<SharedGameFormValues & { title: string; notes: string; image_url: string }> | undefined
  >(undefined);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const [gamesRes, compRes] = await Promise.all([
        fetch("/api/games").then((r) => r.json().catch(() => null)),
        fetch("/api/competitions").then((r) => r.json().catch(() => null)),
      ]);

      if (cancelled) return;

      // Games
      const gamesPayload = gamesRes as {
        success?: boolean;
        linked?: boolean;
        games?: GameRow[];
        ageGroupId?: string | null;
        error?: string;
      } | null;

      if (!gamesPayload) {
        setLoadError("Erro ao carregar jogos.");
      } else if (gamesPayload.linked === false) {
        setHasContext(false);
      } else {
        setGames(Array.isArray(gamesPayload.games) ? gamesPayload.games : []);
        setAgeGroupId(
          typeof gamesPayload.ageGroupId === "string"
            ? gamesPayload.ageGroupId
            : Array.isArray(gamesPayload.games) && gamesPayload.games.length > 0
              ? gamesPayload.games[0]?.age_group_id ?? null
              : null,
        );
      }

      // Competitions
      const compPayload = compRes as CompetitionsResponse | null;
      if (compPayload?.success) {
        setCompetitionOptions(
          (compPayload.competitions || [])
            .filter((c) => !!c.id)
            .map((c) => ({
              id: c.id as string,
              name: c.name || "Competição",
              season: c.season || null,
              team_label: c.team_label || null,
              inactive: c.is_active === false,
            })),
        );
      }

      setLoading(false);
    }

    void init();
    return () => { cancelled = true; };
  }, []);

  async function loadGames() {
    setLoading(true);
    setLoadError(null);
    setHasContext(true);

    const res = await fetch("/api/games");
    const payload = (await res.json().catch(() => null)) as
      | {
          success?: boolean;
          linked?: boolean;
          games?: GameRow[];
          ageGroupId?: string | null;
          error?: string;
        }
      | null;

    if (!res.ok || !payload) {
      setLoadError(payload?.error || "Erro ao carregar jogos.");
      setAgeGroupId(null);
      setLoading(false);
      return;
    }

    if (payload.linked === false) {
      setHasContext(false);
      setGames([]);
      setAgeGroupId(null);
      setLoading(false);
      return;
    }

    setGames(Array.isArray(payload.games) ? payload.games : []);
    setAgeGroupId(
      typeof payload.ageGroupId === "string"
        ? payload.ageGroupId
        : Array.isArray(payload.games) && payload.games.length > 0
          ? payload.games[0]?.age_group_id ?? null
          : null,
    );
    setLoading(false);
  }

  function resetCreateForm() {
    setCreateMode("create");
    setDuplicateInitialValues(undefined);
  }

  function openDuplicateGame(source: GameRow) {
    setCreateMode("duplicate");
    setDuplicateInitialValues({
      title: `Copia ${source.title?.trim() || formatFixtureOpponentLabel({
        isHome: source.is_home,
        opponentName: source.opponent_name,
        opponentShortName: source.opponent_short_name,
      })}`,
      opponent_name: source.opponent_name || "",
      opponent_short_name: normalizeManualShortName(
        source.opponent_short_name,
        5,
      ) || "",
      date: "",
      start_time: source.game_datetime
        ? source.game_datetime.split("T")[1]?.substring(0, 5) || "15:00"
        : "15:00",
      end_time: source.end_time?.slice(0, 5) || "",
      location: source.location || "",
      formatted_address: source.formatted_address || "",
      latitude: source.latitude ?? null,
      longitude: source.longitude ?? null,
      osm_place_id: source.osm_place_id || "",
      location_source: source.location_source ?? null,
      is_home: source.is_home,
      competition_id: source.competition_id || "",
      notes: source.notes || "",
      image_url: source.image_url || "",
    });
    setCreateModalOpen(true);
  }

  function handleGameSaved() {
    void loadGames();
  }

  // Split future vs past
  const upcoming = games
    .filter((g) => !isClosedGameStatus(g.status))
    .slice()
    .sort((a, b) => new Date(a.game_datetime).getTime() - new Date(b.game_datetime).getTime());
  const past = games
    .filter((g) => isClosedGameStatus(g.status))
    .slice()
    .sort((a, b) => new Date(b.game_datetime).getTime() - new Date(a.game_datetime).getTime());
  const groupedUpcomingGames = groupByMonth(upcoming);
  const groupedPastGames = groupByMonth(past);

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
      <>
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
        <GameFormModal
          open={createModalOpen}
          onOpenChange={setCreateModalOpen}
          ageGroupId={ageGroupId}
          competitionOptions={competitionOptions}
          mode={createMode}
          initialValues={duplicateInitialValues}
          onSaved={handleGameSaved}
        />
      </>
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

      <div className="space-y-6">
        {groupedUpcomingGames.map(({ label, games: monthGames }) => (
          <section key={label}>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 capitalize">
              {label}
            </h2>
            <div className="space-y-2">
              {monthGames.map((game) => (
                <GameCard
                  key={game.id}
                  game={game}
                  onDuplicate={() => openDuplicateGame(game)}
                  onClick={() =>
                    router.push(
                      game.status === "completed"
                        ? `/games/${game.id}/summary`
                        : `/games/${game.id}`,
                    )
                  }
                />
              ))}
            </div>
          </section>
        ))}

        <section className="rounded-2xl border border-slate-200 bg-white">
          <button
            type="button"
            onClick={() => setClosedGamesExpanded((current) => !current)}
            className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
          >
            <div>
              <p className="text-sm font-semibold text-slate-900">Jogos Terminados</p>
              <p className="mt-1 text-xs text-slate-500">
                {past.length} jogo{past.length !== 1 ? "s" : ""} terminado{past.length !== 1 ? "s" : ""}
              </p>
            </div>
            <span className="text-xs font-medium text-slate-500">
              {closedGamesExpanded ? "Fechar" : "Expandir"}
            </span>
          </button>

          {closedGamesExpanded && (
            <div className="space-y-6 border-t border-slate-100 px-4 py-4">
              {groupedPastGames.length === 0 ? (
                <p className="text-sm text-slate-500">Ainda não existem jogos terminados.</p>
              ) : (
                groupedPastGames.map(({ label, games: monthGames }) => (
                  <section key={`closed-${label}`}>
                    <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 capitalize">
                      {label}
                    </h2>
                    <div className="space-y-2">
                      {monthGames.map((game) => (
                        <GameCard
                          key={game.id}
                          game={game}
                          className="border-slate-100 bg-slate-50 hover:border-slate-200"
                          onDuplicate={() => openDuplicateGame(game)}
                          onClick={() =>
                            router.push(
                              game.status === "completed"
                                ? `/games/${game.id}/summary`
                                : `/games/${game.id}`,
                            )
                          }
                        />
                      ))}
                    </div>
                  </section>
                ))
              )}
            </div>
          )}
        </section>
      </div>

      <GameFormModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        ageGroupId={ageGroupId}
        competitionOptions={competitionOptions}
        mode={createMode}
        initialValues={duplicateInitialValues}
        onSaved={handleGameSaved}
      />
    </div>
  );
}

function GameCard({
  game,
  className,
  onClick,
  onDuplicate,
}: {
  game: GameRow;
  className?: string;
  onClick: () => void;
  onDuplicate: () => void;
}) {
  const dt = parseISO(game.game_datetime);
  const hasResult =
    isClosedGameStatus(game.status) && game.score_home != null && game.score_away != null;

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 rounded-2xl border p-4 text-left transition-all hover:shadow-sm ${className ?? "bg-white border-slate-100 hover:border-slate-200"}`}
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
          {formatFixtureOpponentLabel({
            isHome: game.is_home,
            opponentName: game.opponent_name,
            opponentShortName: game.opponent_short_name,
          })}
        </p>
        {resolveLocationLabel(
          game.location,
          game.formatted_address,
        ) && (
          <p className="text-xs text-slate-400 truncate">
            {resolveLocationLabel(
              game.location,
              game.formatted_address,
            )}
          </p>
        )}
      </div>

      {/* Score */}
      {hasResult ? (
        <div className="flex flex-shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDuplicate();
            }}
            className="rounded-full bg-slate-100 p-1.5 text-slate-600 transition-colors hover:bg-slate-200"
            title="Duplicar jogo"
          >
            <Copy size={14} />
          </button>
          <div className="text-right">
            <p className="text-lg font-bold text-slate-900 leading-none">
              {game.score_home}–{game.score_away}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDuplicate();
            }}
            className="rounded-full bg-slate-100 p-1.5 text-slate-600 transition-colors hover:bg-slate-200"
            title="Duplicar jogo"
          >
            <Copy size={14} />
          </button>
          <ChevronRight size={16} className="text-slate-300" />
        </div>
      )}
    </button>
  );
}
