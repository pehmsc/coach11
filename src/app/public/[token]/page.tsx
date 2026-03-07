import Link from "next/link";
import { unstable_cache } from "next/cache";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { format, parseISO } from "date-fns";
import { pt } from "date-fns/locale";
import { CalendarDays, Clock3, Dumbbell, MapPin, ShieldCheck, Swords } from "lucide-react";
import { hasPublicConvocationContent } from "@/lib/games/public-convocation";
import { buildDateTimeFromDateAndTime } from "@/lib/events/time";
import { resolveLocationLabel } from "@/lib/location";
import { PublicRateLimitedState } from "@/components/public/PublicRateLimitedState";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildPublicGameRef,
  buildPublicTrainingRef,
  resolvePublicAccessGate,
} from "@/lib/public-share";

export const dynamic = "force-dynamic";
export const revalidate = 30;

type PublicPageParams = {
  params: Promise<{ token: string }>;
};

type PublicGameRow = {
  id: string;
  game_datetime: string;
  opponent_name: string | null;
  opponent_short_name: string | null;
  location: string | null;
  location_address: string | null;
  formatted_address: string | null;
  is_home: boolean;
  status: string | null;
  score_home: number | null;
  score_away: number | null;
  hasPublicConvocation?: boolean;
};

type PublicTrainingRow = {
  id: string;
  title: string | null;
  session_date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  location_address: string | null;
  formatted_address: string | null;
  status: string | null;
};

type PublicCalendarItem =
  | {
      kind: "game";
      id: string;
      startsAt: string;
      location: string | null;
      status: string | null;
      href: string;
      title: string;
      meta: string;
      hasPublicConvocation?: boolean;
    }
  | {
      kind: "training";
      id: string;
      startsAt: string;
      location: string | null;
      status: string | null;
      href: string;
      title: string;
      meta: string;
      hasPublicConvocation?: boolean;
    };

function formatGameDate(value: string | null | undefined) {
  if (!value) return "Data por definir";

  try {
    return format(parseISO(value), "d MMM yyyy · HH:mm", { locale: pt });
  } catch {
    return value;
  }
}

function buildTrainingDateTime(
  sessionDate: string | null | undefined,
  startTime: string | null | undefined,
) {
  return buildDateTimeFromDateAndTime(sessionDate, startTime);
}

function gameStatusLabel(status: string | null | undefined) {
  switch (status) {
    case "live":
      return "Ao vivo";
    case "completed":
      return "Terminado";
    case "cancelled":
      return "Cancelado";
    default:
      return "Agendado";
  }
}

function gameStatusBadgeProps(status: string | null | undefined) {
  if (status === "live") {
    return {
      label: "Ao vivo",
      className: "bg-red-100 text-red-700 ring-1 ring-red-200",
      showPulse: true,
    };
  }

  return {
    label: gameStatusLabel(status),
    className: "bg-white/80 text-blue-700",
    showPulse: false,
  };
}

function trainingStatusLabel(status: string | null | undefined) {
  switch (status) {
    case "completed":
      return "Concluído";
    case "cancelled":
      return "Cancelado";
    case "live":
      return "A decorrer";
    default:
      return "Agendado";
  }
}

function trainingStatusBadgeProps(status: string | null | undefined) {
  return {
    label: trainingStatusLabel(status),
    className: "bg-white/80 text-emerald-700",
  };
}

function eventToneClasses(kind: "game" | "training") {
  if (kind === "game") {
    return {
      card: "border-blue-200 bg-blue-50 hover:border-blue-300",
      typeBadge: "bg-blue-100 text-blue-700",
      infoBadge: "bg-emerald-100 text-emerald-700",
    };
  }

  return {
    card: "border-emerald-200 bg-emerald-50 hover:border-emerald-300",
    typeBadge: "bg-emerald-100 text-emerald-700",
    infoBadge: "bg-white/80 text-emerald-700",
  };
}

function gameTitle(game: PublicGameRow) {
  const opponent = game.opponent_name || "Adversário";
  return game.is_home ? `vs ${opponent}` : `@ ${opponent}`;
}

function isMissingRelationError(
  message: string | null | undefined,
  relationName: string,
) {
  if (!message) return false;

  return (
    message.includes(relationName) &&
    (message.includes("does not exist") || message.includes("relation"))
  );
}

async function getPublicConvocationAvailabilityByGameId(
  admin: ReturnType<typeof createAdminClient>,
  gameIds: string[],
) {
  const availabilityByGameId = new Map<string, boolean>();
  const uniqueGameIds = Array.from(
    new Set(gameIds.filter((value): value is string => typeof value === "string" && value.length > 0)),
  );

  uniqueGameIds.forEach((gameId) => {
    availabilityByGameId.set(gameId, false);
  });

  if (uniqueGameIds.length === 0) {
    return availabilityByGameId;
  }

  const { data: convocationRows, error: convocationError } = await admin
    .from("convocations")
    .select("id, game_id, created_at, notes")
    .in("game_id", uniqueGameIds)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (convocationError) {
    return availabilityByGameId;
  }

  const latestConvocationByGameId = new Map<
    string,
    { id: string; notes: string | null }
  >();
  (convocationRows || []).forEach((row) => {
    if (row.game_id && row.id && !latestConvocationByGameId.has(row.game_id)) {
      latestConvocationByGameId.set(row.game_id, {
        id: row.id,
        notes: typeof row.notes === "string" ? row.notes : null,
      });
    }
  });

  const latestConvocationIds = Array.from(
    latestConvocationByGameId.values(),
    (row) => row.id,
  );

  const [{ data: convocationPlayers }, externalPlayersRes] = await Promise.all([
    latestConvocationIds.length > 0
      ? admin
          .from("convocation_players")
          .select("convocation_id")
          .in("convocation_id", latestConvocationIds)
      : Promise.resolve({ data: [], error: null }),
    admin
      .from("external_player_convocations")
      .select("game_id")
      .in("game_id", uniqueGameIds),
  ]);

  const convocationIdsWithPlayers = new Set(
    ((convocationPlayers || []) as Array<{ convocation_id: string | null }>)
      .map((row) => row.convocation_id)
      .filter((value): value is string => typeof value === "string"),
  );
  const gameIdsWithExternalPlayers =
    externalPlayersRes.error &&
    !isMissingRelationError(
      externalPlayersRes.error.message,
      "external_player_convocations",
    )
      ? new Set<string>()
      : new Set(
          (((externalPlayersRes.data || []) as Array<{ game_id: string | null }>)
            .map((row) => row.game_id)
            .filter((value): value is string => typeof value === "string")),
        );

  latestConvocationByGameId.forEach((convocation, gameId) => {
    availabilityByGameId.set(
      gameId,
      hasPublicConvocationContent({
        playerCount:
          (convocationIdsWithPlayers.has(convocation.id) ? 1 : 0) +
          (gameIdsWithExternalPlayers.has(gameId) ? 1 : 0),
        notes: convocation.notes,
      }),
    );
  });

  return availabilityByGameId;
}

const getPublicCalendarPayload = unstable_cache(
  async (ageGroupId: string) => {
    const admin = createAdminClient();
    const todayIsoDate = new Date().toISOString().slice(0, 10);
    const nowIso = new Date().toISOString();

    const [
      { data: ageGroup },
      liveGamesRes,
      upcomingGamesRes,
      upcomingTrainingsRes,
      recentRes,
    ] = await Promise.all([
      admin
        .from("age_groups")
        .select("club_name, name")
        .eq("id", ageGroupId)
        .maybeSingle(),
      admin
        .from("games")
        .select(
          "id, game_datetime, opponent_name, opponent_short_name, location, location_address, formatted_address, is_home, status, score_home, score_away",
        )
        .eq("age_group_id", ageGroupId)
        .eq("status", "live")
        .order("game_datetime", { ascending: true })
        .limit(4),
      admin
        .from("games")
        .select(
          "id, game_datetime, opponent_name, opponent_short_name, location, location_address, formatted_address, is_home, status, score_home, score_away",
        )
        .eq("age_group_id", ageGroupId)
        .gte("game_datetime", nowIso)
        .neq("status", "live")
        .order("game_datetime", { ascending: true })
        .limit(12),
      admin
        .from("training_sessions")
        .select(
          "id, title, session_date, start_time, end_time, location, location_address, formatted_address, status",
        )
        .eq("age_group_id", ageGroupId)
        .gte("session_date", todayIsoDate)
        .order("session_date", { ascending: true })
        .order("start_time", { ascending: true, nullsFirst: false })
        .limit(12),
      admin
        .from("games")
        .select(
          "id, game_datetime, opponent_name, opponent_short_name, location, location_address, formatted_address, is_home, status, score_home, score_away",
        )
        .eq("age_group_id", ageGroupId)
        .lt("game_datetime", nowIso)
        .neq("status", "live")
        .order("game_datetime", { ascending: false })
        .limit(6),
    ]);

    const liveGames = (liveGamesRes.data || []) as PublicGameRow[];
    const upcomingGames = (upcomingGamesRes.data || []) as PublicGameRow[];
    const mergedUpcomingGames = Array.from(
      new Map(
        [...liveGames, ...upcomingGames].map((game) => [game.id, game]),
      ).values(),
    );

    const convocationAvailabilityByGameId =
      await getPublicConvocationAvailabilityByGameId(admin, [
        ...mergedUpcomingGames.map((game) => game.id),
        ...((recentRes.data || []) as PublicGameRow[]).map((game) => game.id),
      ]);

    return {
      ageGroup,
      upcomingGames: mergedUpcomingGames.map((game) => ({
        ...game,
        hasPublicConvocation: convocationAvailabilityByGameId.get(game.id) === true,
      })),
      upcomingTrainings: (upcomingTrainingsRes.data || []) as PublicTrainingRow[],
      recentGames: ((recentRes.data || []) as PublicGameRow[]).map((game) => ({
        ...game,
        hasPublicConvocation: convocationAvailabilityByGameId.get(game.id) === true,
      })),
    };
  },
  ["public-calendar-page-v2"],
  { revalidate: 30 },
);

export default async function PublicCalendarPage({ params }: PublicPageParams) {
  const { token: publicIdentifier } = await params;
  const admin = createAdminClient();
  const gate = await resolvePublicAccessGate(admin, publicIdentifier, await headers());

  if (gate.status === 404) {
    notFound();
  }

  if (gate.status === 429) {
    return <PublicRateLimitedState />;
  }

  const access = gate.access;
  const { ageGroup, upcomingGames, upcomingTrainings, recentGames } =
    await getPublicCalendarPayload(access.ageGroupId);
  const upcomingEvents = [
    ...upcomingGames.map((game) => ({
      kind: "game" as const,
      id: game.id,
      startsAt: game.game_datetime,
      location: resolveLocationLabel(
        game.location,
        game.formatted_address,
        game.location_address,
      ),
      status: game.status,
      href: `/public/${access.identifier}/games/${buildPublicGameRef(access.identifier, game.id)}`,
      title: gameTitle(game),
      meta: formatGameDate(game.game_datetime),
      hasPublicConvocation: game.hasPublicConvocation === true,
    })),
    ...upcomingTrainings.map((training) => {
      const startsAt = buildTrainingDateTime(
        training.session_date,
        training.start_time,
      );
      return {
        kind: "training" as const,
        id: training.id,
        startsAt: startsAt || training.session_date,
        location: resolveLocationLabel(
          training.location,
          training.formatted_address,
          training.location_address,
        ),
        status: training.status,
        href: `/public/${access.identifier}/trainings/${buildPublicTrainingRef(access.identifier, training.id)}`,
        title: training.title?.trim() || "Treino",
        meta: formatGameDate(startsAt),
      };
    }),
  ]
    .sort((a, b) => {
      const aIsLive = a.kind === "game" && a.status === "live";
      const bIsLive = b.kind === "game" && b.status === "live";
      if (aIsLive !== bIsLive) {
        return aIsLive ? -1 : 1;
      }

      return a.startsAt.localeCompare(b.startsAt);
    })
    .slice(0, 16) as PublicCalendarItem[];

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <section className="rounded-3xl bg-slate-900 px-6 py-8 text-white">
          <p className="text-sm uppercase tracking-[0.2em] text-emerald-300">
            Calendário
          </p>
          <h1 className="mt-3 text-3xl font-black">
            {ageGroup?.club_name || "Coach11"} ·{" "}
            {ageGroup?.name || "Calendário"}
          </h1>
        </section>

        <section className="space-y-3">
          <div className="flex items-center gap-2 text-slate-700">
            <CalendarDays size={18} />
            <h2 className="text-lg font-semibold">Próximos eventos</h2>
          </div>

          {upcomingEvents.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
              Sem jogos ou treinos agendados.
            </div>
          ) : (
            upcomingEvents.map((event) => {
              const tone = eventToneClasses(event.kind);
              const statusBadge =
                event.kind === "game"
                  ? gameStatusBadgeProps(event.status)
                  : trainingStatusBadgeProps(event.status);
              const content = (
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${tone.typeBadge}`}>
                        {event.kind === "game" ? (
                          <Swords size={12} />
                        ) : (
                          <Dumbbell size={12} />
                        )}
                        {event.kind === "game" ? "Jogo" : "Treino"}
                      </span>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${statusBadge.className}`}>
                        {"showPulse" in statusBadge && statusBadge.showPulse ? (
                          <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                          </span>
                        ) : null}
                        {statusBadge.label}
                      </span>
                      {event.kind === "game" && event.hasPublicConvocation ? (
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${tone.infoBadge}`}>
                          <ShieldCheck size={12} />
                          Convocatória disponível
                        </span>
                      ) : null}
                    </div>
                    <p className="text-lg font-semibold text-slate-900">
                      {event.title}
                    </p>
                    <div className="flex flex-wrap gap-3 text-sm text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <Clock3 size={14} />
                        {event.meta}
                      </span>
                      {event.location && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin size={14} />
                          {event.location}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );

              return (
                <Link
                  key={event.id}
                  href={event.href}
                  className={`block rounded-2xl border p-4 transition-colors ${tone.card}`}
                >
                  {content}
                </Link>
              );
            })
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">
            Últimos resultados
          </h2>
          {recentGames.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
              Sem resultados recentes.
            </div>
          ) : (
            recentGames.map((game) => (
              <Link
                key={game.id}
                href={`/public/${access.identifier}/games/${buildPublicGameRef(access.identifier, game.id)}`}
                className="block rounded-2xl border border-blue-200 bg-blue-50 p-4 transition-colors hover:border-blue-300"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {gameTitle(game)}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {formatGameDate(game.game_datetime)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-slate-900">
                      {game.score_home ?? "-"} - {game.score_away ?? "-"}
                    </p>
                    <p className="text-xs text-slate-500">
                      {gameStatusLabel(game.status)}
                    </p>
                  </div>
                </div>
              </Link>
            ))
          )}
        </section>
      </div>
    </main>
  );
}
