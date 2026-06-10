"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  extractTimeFromDateTime,
  formatGameDateTime,
  formatGameDateTimeParts,
  parseGameDateTime,
} from "@/lib/events/time";
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
import { normalizeManualShortName } from "@/lib/football/short-name";
import {
  formatFixtureOpponentLabel,
  isClosedGameStatus,
} from "@/lib/games/display";
import { useListStateSync } from "@/hooks/useListStateSync";
import { useReturnTo } from "@/hooks/useReturnTo";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";
import { useAgeGroupMeta } from "@/hooks/useAgeGroupName";
import { useAgeGroup } from "@/contexts/AgeGroupContext";

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
    const key = formatGameDateTime(game.game_datetime, "monthYear");
    const bucket = map.get(key) ?? [];
    bucket.push(game);
    map.set(key, bucket);
  }
  return Array.from(map.entries()).map(([label, monthGames]) => ({
    label,
    games: monthGames,
  }));
}

type Props = {
  /**
   * Quando definido, filtra games por este age_group_id (client-side).
   * Sub-rota passa ageGroupId da URL; global deixa undefined.
   */
  overrideAgeGroupId?: string;
  /** Chave para useReturnTo/useScrollRestoration. */
  returnToKey?: string;
};

export function GamesSection({
  overrideAgeGroupId,
  returnToKey = "games",
}: Props) {
  const { saveReturnTo } = useReturnTo(returnToKey);
  useScrollRestoration(returnToKey);
  // overrideAgeGroupId forca um escalao (sub-rota /teams/[id]).
  // Quando undefined, segue a escolha do <ScopeToggle> via AgeGroupContext.
  const { selectedAgeGroupId: contextAgeGroupId } = useAgeGroup();
  const effectiveAgeGroupId = overrideAgeGroupId ?? contextAgeGroupId;
  const [loading, setLoading] = useState(true);
  const [games, setGames] = useState<GameRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasContext, setHasContext] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createMode, setCreateMode] = useState<"create" | "duplicate">("create");
  const [competitionOptions, setCompetitionOptions] = useState<
    GameCompetitionOption[]
  >([]);
  const [ageGroupId, setAgeGroupId] = useState<string | null>(null);
  const { football_format: footballFormat } = useAgeGroupMeta(ageGroupId);
  const [closedFlag, setClosedFlag] = useListStateSync<"yes" | "no">(
    "closed",
    "no",
  );
  const closedGamesExpanded = closedFlag === "yes";
  const setClosedGamesExpanded = (v: boolean) => setClosedFlag(v ? "yes" : "no");
  const [duplicateInitialValues, setDuplicateInitialValues] = useState<
    | Partial<
        SharedGameFormValues & {
          title: string;
          notes: string;
          image_url: string;
        }
      >
    | undefined
  >(undefined);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      // /api/competitions filtra por escalao quando recebe ageGroupId; sem
      // o param mostra todas as competicoes acessiveis (multi-escalao).
      const competitionsUrl = effectiveAgeGroupId
        ? `/api/competitions?ageGroupId=${effectiveAgeGroupId}`
        : "/api/competitions";
      const [gamesRes, compRes] = await Promise.all([
        fetch("/api/games").then((r) => r.json().catch(() => null)),
        fetch(competitionsUrl).then((r) => r.json().catch(() => null)),
      ]);

      if (cancelled) return;

      const gamesPayload = gamesRes as
        | {
            success?: boolean;
            linked?: boolean;
            games?: GameRow[];
            ageGroupId?: string | null;
            error?: string;
          }
        | null;

      if (!gamesPayload) {
        setLoadError("Erro ao carregar jogos.");
      } else if (gamesPayload.linked === false) {
        setHasContext(false);
      } else {
        const allGames = Array.isArray(gamesPayload.games)
          ? gamesPayload.games
          : [];
        // Filtro client-side respeita sub-rota (overrideAgeGroupId) ou
        // escolha global via <ScopeToggle> (contextAgeGroupId).
        const filteredGames = effectiveAgeGroupId
          ? allGames.filter((g) => g.age_group_id === effectiveAgeGroupId)
          : allGames;
        setGames(filteredGames);
        setAgeGroupId(
          effectiveAgeGroupId ??
            (typeof gamesPayload.ageGroupId === "string"
              ? gamesPayload.ageGroupId
              : filteredGames.length > 0
                ? filteredGames[0]?.age_group_id ?? null
                : null),
        );
      }

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
    return () => {
      cancelled = true;
    };
  }, [effectiveAgeGroupId]);

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

    const allGames = Array.isArray(payload.games) ? payload.games : [];
    const filteredGames = effectiveAgeGroupId
      ? allGames.filter((g) => g.age_group_id === effectiveAgeGroupId)
      : allGames;
    setGames(filteredGames);
    setAgeGroupId(
      effectiveAgeGroupId ??
        (typeof payload.ageGroupId === "string"
          ? payload.ageGroupId
          : filteredGames.length > 0
            ? filteredGames[0]?.age_group_id ?? null
            : null),
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
      title: `Copia ${
        source.title?.trim() ||
        formatFixtureOpponentLabel({
          isHome: source.is_home,
          opponentName: source.opponent_name,
          opponentShortName: source.opponent_short_name,
        })
      }`,
      opponent_name: source.opponent_name || "",
      opponent_short_name:
        normalizeManualShortName(source.opponent_short_name, 5) || "",
      date: "",
      start_time:
        extractTimeFromDateTime(source.game_datetime) || "15:00",
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

  // game_datetime e wall-clock PT — parseGameDateTime converte para instante
  // UTC correcto para ordenacao consistente.
  const upcoming = games
    .filter((g) => !isClosedGameStatus(g.status))
    .slice()
    .sort(
      (a, b) =>
        (parseGameDateTime(a.game_datetime)?.getTime() ?? 0) -
        (parseGameDateTime(b.game_datetime)?.getTime() ?? 0),
    );
  const past = games
    .filter((g) => isClosedGameStatus(g.status))
    .slice()
    .sort(
      (a, b) =>
        (parseGameDateTime(b.game_datetime)?.getTime() ?? 0) -
        (parseGameDateTime(a.game_datetime)?.getTime() ?? 0),
    );
  const groupedUpcomingGames = groupByMonth(upcoming);
  const groupedPastGames = groupByMonth(past);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={28} className="animate-spin text-slate-400" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="text-center py-16">
        <AlertCircle size={40} className="text-red-300 mx-auto mb-3" />
        <p className="text-slate-700 text-sm">{loadError}</p>
      </div>
    );
  }

  if (!hasContext) {
    return (
      <div className="text-center py-16">
        <Sword size={40} className="text-slate-200 mx-auto mb-3" />
        <p className="text-slate-700 font-semibold mb-2">
          Sem escalão configurado
        </p>
        <p className="text-slate-500 text-sm">
          Configura o teu escalão em Configurações antes de gerir jogos.
        </p>
      </div>
    );
  }

  if (games.length === 0) {
    return (
      <>
        <div className="text-center py-16">
          <Sword size={40} className="text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">Nenhum jogo registado.</p>
          <p className="text-slate-400 text-xs mt-1">
            Cria o primeiro jogo aqui.
          </p>
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
          footballFormat={footballFormat}
          competitionOptions={competitionOptions}
          mode={createMode}
          initialValues={duplicateInitialValues}
          onSaved={handleGameSaved}
        />
      </>
    );
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
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
                  href={
                    overrideAgeGroupId
                      ? `/teams/${overrideAgeGroupId}/games/${game.id}`
                      : `/games/${game.id}`
                  }
                  onNavigate={saveReturnTo}
                />
              ))}
            </div>
          </section>
        ))}

        <section className="rounded-2xl border border-slate-200 bg-white">
          <button
            type="button"
            aria-expanded={closedGamesExpanded}
            aria-controls="closed-games-panel"
            onClick={() => setClosedGamesExpanded(!closedGamesExpanded)}
            className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
          >
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Jogos Terminados
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {past.length} jogo{past.length !== 1 ? "s" : ""} terminado
                {past.length !== 1 ? "s" : ""}
              </p>
            </div>
            <span className="text-xs font-medium text-slate-500">
              {closedGamesExpanded ? "Fechar" : "Expandir"}
            </span>
          </button>

          {closedGamesExpanded && (
            <div
              id="closed-games-panel"
              className="space-y-6 border-t border-slate-100 px-4 py-4"
            >
              {groupedPastGames.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Ainda não existem jogos terminados.
                </p>
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
                          href={
                            overrideAgeGroupId
                              ? `/teams/${overrideAgeGroupId}/games/${game.id}`
                              : `/games/${game.id}`
                          }
                          onNavigate={saveReturnTo}
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
        footballFormat={footballFormat}
        competitionOptions={competitionOptions}
        mode={createMode}
        initialValues={duplicateInitialValues}
        onSaved={handleGameSaved}
      />
    </>
  );
}

function GameCard({
  game,
  className,
  href,
  onNavigate,
  onDuplicate,
}: {
  game: GameRow;
  className?: string;
  href: string;
  onNavigate: () => void;
  onDuplicate: () => void;
}) {
  const parts = formatGameDateTimeParts(game.game_datetime);
  const hasResult =
    isClosedGameStatus(game.status) &&
    game.score_home != null &&
    game.score_away != null;

  // Linha navegavel: o <Link> cobre o cartao via pseudo-elemento (after:inset-0);
  // as accoes internas ficam como irmaos com z-10 para nao aninhar button em anchor.
  return (
    <div
      className={`relative w-full flex items-center gap-3 rounded-2xl border p-4 text-left transition-all hover:shadow-sm ${className ?? "bg-white border-slate-100 hover:border-slate-200"}`}
    >
      <div className="flex-shrink-0 w-12 text-center">
        <p className="text-lg font-bold text-slate-900 leading-none">
          {parts?.day ?? "—"}
        </p>
        <p className="text-xs text-slate-400 capitalize">
          {parts?.monthShort ?? "—"}
        </p>
        <p className="text-[10px] text-slate-300">{parts?.time ?? "--:--"}</p>
      </div>

      <div className="flex-shrink-0 flex flex-col items-center gap-0.5">
        {game.is_home ? (
          <Home size={12} className="text-emerald-500" />
        ) : (
          <Plane size={12} className="text-blue-500" />
        )}
        <span className="text-[9px] text-slate-400">
          {game.is_home ? "Casa" : "Fora"}
        </span>
      </div>

      <Link
        href={href}
        onClick={onNavigate}
        className="flex-1 min-w-0 after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-emerald-500"
      >
        <div className="flex items-center gap-1.5 flex-wrap">
          {game.title && (
            <span className="text-[10px] font-bold bg-blue-100 text-blue-700 rounded px-1.5 py-0.5">
              {game.title.replace("Jornada ", "J")}
            </span>
          )}
          {game.competition_id && !game.title && (
            <span className="text-[10px] font-bold bg-amber-100 text-amber-700 rounded px-1.5 py-0.5">
              Copa
            </span>
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
        {resolveLocationLabel(game.location, game.formatted_address) && (
          <p className="text-xs text-slate-400 truncate">
            {resolveLocationLabel(game.location, game.formatted_address)}
          </p>
        )}
      </Link>

      {hasResult ? (
        <div className="flex flex-shrink-0 items-center gap-2">
          {/* Hit area 44px via before:-inset (26px visuais + 9px por lado) */}
          <button
            type="button"
            onClick={onDuplicate}
            className="relative z-10 rounded-full bg-slate-100 p-1.5 text-slate-600 transition-colors hover:bg-slate-200 before:absolute before:-inset-[9px] before:content-['']"
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
          {/* Hit area 44px via before:-inset (26px visuais + 9px por lado) */}
          <button
            type="button"
            onClick={onDuplicate}
            className="relative z-10 rounded-full bg-slate-100 p-1.5 text-slate-600 transition-colors hover:bg-slate-200 before:absolute before:-inset-[9px] before:content-['']"
            title="Duplicar jogo"
          >
            <Copy size={14} />
          </button>
          <ChevronRight size={16} className="text-slate-300" />
        </div>
      )}
    </div>
  );
}
