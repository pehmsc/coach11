"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { format, parseISO } from "date-fns";
import { pt } from "date-fns/locale";
import { AlertCircle, Loader2 } from "lucide-react";
import { StickyBackLink } from "@/components/navigation/StickyBackLink";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatFixtureOpponentLabel } from "@/lib/games/display";

interface CompetitionRef {
  name?: string | null;
}

interface GameRef {
  id: string;
  game_datetime: string;
  opponent_name?: string | null;
  opponent_short_name?: string | null;
  score_home?: number | null;
  score_away?: number | null;
  is_home: boolean;
  competition_id?: string | null;
  title?: string | null;
  competitions?: CompetitionRef | CompetitionRef[] | null;
}

interface GameHistoryRow {
  id: string;
  game_id: string;
  lineup_type: string;
  minutes_played?: number | null;
  goals?: number | null;
  assists?: number | null;
  yellow_cards?: number | null;
  red_cards?: number | null;
  own_goals?: number | null;
  coach_rating?: number | null;
  is_mvp?: boolean | null;
  games: GameRef | GameRef[] | null;
}

interface ApiResponse {
  success?: boolean;
  items?: GameHistoryRow[];
  hasMore?: boolean;
  error?: string;
}

const PAGE_SIZE = 20;

function unwrapGame(games: GameHistoryRow["games"]): GameRef | null {
  if (!games) return null;
  if (Array.isArray(games)) return games[0] ?? null;
  return games;
}

function unwrapCompetition(
  competitions: CompetitionRef | CompetitionRef[] | null | undefined,
): CompetitionRef | null {
  if (!competitions) return null;
  if (Array.isArray(competitions)) return competitions[0] ?? null;
  return competitions;
}

function fmtN(n: number | null | undefined, fallback = "0"): string {
  return n == null ? fallback : String(n);
}

function fmtRating(n: number | null | undefined): string {
  return n == null ? "—" : n.toFixed(1);
}

function lineupLabel(lineup: string): string {
  if (lineup === "starter") return "Titular";
  if (lineup === "substitute") return "Suplente";
  return lineup;
}

export default function PlayerHistoryGamesPage() {
  const { id } = useParams<{ id: string }>();
  const [items, setItems] = useState<GameHistoryRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(offset: number, append: boolean) {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/players/${id}/games?limit=${PAGE_SIZE}&offset=${offset}`,
      );
      const payload = (await res.json().catch(() => null)) as ApiResponse | null;
      if (!res.ok || !payload?.items) {
        setError(payload?.error || "Erro ao carregar jogos.");
        return;
      }
      setItems((prev) => (append ? [...prev, ...payload.items!] : payload.items!));
      setHasMore(Boolean(payload.hasMore));
    } catch {
      setError("Erro de ligação.");
    } finally {
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  }

  useEffect(() => {
    void load(0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-8">
      <StickyBackLink
        href={`/players/${id}`}
        label="Voltar ao perfil"
        wrapperClassName="-mx-4 mb-4 bg-slate-50/95 px-4 py-2 md:-mx-8 md:px-8"
      />

      <h1 className="mb-4 text-xl font-bold text-slate-900">
        Histórico de jogos
      </h1>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center">
          <AlertCircle
            size={24}
            className="mx-auto mb-2 text-red-400"
            aria-hidden="true"
          />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-6 text-center">
          <p className="text-sm text-slate-500">
            Sem jogos registados nesta época.
          </p>
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {items.map((row) => {
              const game = unwrapGame(row.games);
              const competition = unwrapCompetition(game?.competitions);
              const dt = game?.game_datetime
                ? parseISO(game.game_datetime)
                : null;
              const score =
                game && game.score_home != null && game.score_away != null
                  ? `${game.score_home}–${game.score_away}`
                  : "—";
              return (
                <li
                  key={row.id}
                  className="rounded-xl border border-slate-100 bg-white p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs text-slate-400">
                        {dt
                          ? format(dt, "d MMM yyyy", { locale: pt })
                          : "—"}
                        {competition?.name ? ` · ${competition.name}` : ""}
                      </p>
                      <p className="text-sm font-semibold text-slate-900">
                        {game
                          ? formatFixtureOpponentLabel({
                              isHome: game.is_home,
                              opponentName: game.opponent_name ?? undefined,
                              opponentShortName:
                                game.opponent_short_name ?? undefined,
                            })
                          : "—"}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {lineupLabel(row.lineup_type)} ·{" "}
                        {fmtN(row.minutes_played)}&apos;
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-slate-900">
                        {score}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        Rating {fmtRating(row.coach_rating)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                    {row.goals ? (
                      <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">
                        ⚽ {row.goals}
                      </span>
                    ) : null}
                    {row.assists ? (
                      <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">
                        A {row.assists}
                      </span>
                    ) : null}
                    {row.yellow_cards ? (
                      <span className="rounded bg-yellow-100 px-1.5 py-0.5 text-yellow-700">
                        AM {row.yellow_cards}
                      </span>
                    ) : null}
                    {row.red_cards ? (
                      <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-700">
                        VM {row.red_cards}
                      </span>
                    ) : null}
                    {row.own_goals ? (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">
                        AG {row.own_goals}
                      </span>
                    ) : null}
                    {row.is_mvp ? (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-700">
                        MVP
                      </span>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>

          {hasMore && (
            <div className="mt-4 flex justify-center">
              <Button
                type="button"
                variant="outline"
                onClick={() => void load(items.length, true)}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <>
                    <Loader2 size={14} className="mr-1.5 animate-spin" />
                    A carregar...
                  </>
                ) : (
                  "Carregar mais"
                )}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
