import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { format, parseISO } from "date-fns";
import { pt } from "date-fns/locale";
import { CalendarDays, Clock3, Dumbbell, MapPin, Swords } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildPublicGameRef,
  buildPublicTrainingRef,
  resolvePublicShareRequest,
} from "@/lib/public-share";

export const dynamic = "force-dynamic";

type PublicPageParams = {
  params: Promise<{ token: string }>;
};

type PublicGameRow = {
  id: string;
  game_datetime: string;
  opponent_name: string | null;
  opponent_short_name: string | null;
  location: string | null;
  is_home: boolean;
  status: string | null;
  score_home: number | null;
  score_away: number | null;
};

type PublicTrainingRow = {
  id: string;
  title: string | null;
  session_date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  location_address: string | null;
  notes: string | null;
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
  if (!sessionDate) return null;
  return `${sessionDate}T${startTime || "00:00"}:00`;
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

function gameTitle(game: PublicGameRow) {
  const opponent = game.opponent_name || "Adversário";
  return game.is_home ? `vs ${opponent}` : `@ ${opponent}`;
}

export default async function PublicCalendarPage({ params }: PublicPageParams) {
  const { token } = await params;
  const admin = createAdminClient();

  let share;
  try {
    const resolved = await resolvePublicShareRequest(
      admin,
      token,
      await headers(),
    );
    share = resolved?.share ?? null;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "public_share_rate_limited"
    ) {
      return (
        <main className="min-h-screen bg-slate-50 px-4 py-8">
          <div className="mx-auto max-w-3xl rounded-3xl border border-amber-200 bg-white p-8 text-center">
            <h1 className="text-2xl font-bold text-slate-900">
              Demasiados pedidos
            </h1>
            <p className="mt-3 text-sm text-slate-600">
              Este link público está temporariamente limitado. Tenta novamente
              dentro de instantes.
            </p>
          </div>
        </main>
      );
    }

    notFound();
  }

  if (!share) {
    notFound();
  }

  const todayIsoDate = new Date().toISOString().slice(0, 10);

  const [
    { data: ageGroup },
    upcomingGamesRes,
    upcomingTrainingsRes,
    recentRes,
  ] = await Promise.all([
    admin
      .from("age_groups")
      .select("club_name, name")
      .eq("id", share.age_group_id)
      .maybeSingle(),
    admin
      .from("games")
      .select(
        "id, game_datetime, opponent_name, opponent_short_name, location, is_home, status, score_home, score_away",
      )
      .eq("age_group_id", share.age_group_id)
      .gte("game_datetime", new Date().toISOString())
      .order("game_datetime", { ascending: true })
      .limit(12),
    admin
      .from("training_sessions")
      .select(
        "id, title, session_date, start_time, end_time, location, location_address, notes, status",
      )
      .eq("age_group_id", share.age_group_id)
      .gte("session_date", todayIsoDate)
      .order("session_date", { ascending: true })
      .order("start_time", { ascending: true, nullsFirst: false })
      .limit(12),
    admin
      .from("games")
      .select(
        "id, game_datetime, opponent_name, opponent_short_name, location, is_home, status, score_home, score_away",
      )
      .eq("age_group_id", share.age_group_id)
      .lt("game_datetime", new Date().toISOString())
      .order("game_datetime", { ascending: false })
      .limit(6),
  ]);

  const upcomingGames = (upcomingGamesRes.data || []) as PublicGameRow[];
  const upcomingTrainings = (upcomingTrainingsRes.data ||
    []) as PublicTrainingRow[];
  const recentGames = (recentRes.data || []) as PublicGameRow[];
  const upcomingEvents = [
    ...upcomingGames.map((game) => ({
      kind: "game" as const,
      id: game.id,
      startsAt: game.game_datetime,
      location: game.location,
      status: game.status,
      href: `/public/${token}/games/${buildPublicGameRef(token, game.id)}`,
      title: gameTitle(game),
      meta: formatGameDate(game.game_datetime),
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
        location: training.location || training.location_address,
        status: training.status,
        href: `/public/${token}/trainings/${buildPublicTrainingRef(token, training.id)}`,
        title: training.title?.trim() || "Treino",
        meta: formatGameDate(startsAt),
      };
    }),
  ]
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
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
              const content = (
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                        {event.kind === "game" ? (
                          <Swords size={12} />
                        ) : (
                          <Dumbbell size={12} />
                        )}
                        {event.kind === "game" ? "Jogo" : "Treino"}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                        {event.kind === "game"
                          ? gameStatusLabel(event.status)
                          : trainingStatusLabel(event.status)}
                      </span>
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
                  className="block rounded-2xl border border-slate-200 bg-white p-4 transition-colors hover:border-emerald-300"
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
                href={`/public/${token}/games/${buildPublicGameRef(token, game.id)}`}
                className="block rounded-2xl border border-slate-200 bg-white p-4 transition-colors hover:border-emerald-300"
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
