import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function assertGameAccess(
  admin: ReturnType<typeof createAdminClient>,
  gameId: string,
  userId: string,
) {
  const { data: game, error: gameError } = await admin
    .from("games")
    .select("id, team_id, age_group_id")
    .eq("id", gameId)
    .maybeSingle();

  if (gameError) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Erro ao validar jogo." }, { status: 500 }),
    };
  }

  if (!game) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Jogo não encontrado." }, { status: 404 }),
    };
  }

  let hasAccess = false;
  let isCoordinator = false;
  let teamId: string | null = (game as { team_id?: string }).team_id ?? null;
  const ageGroupId = (game as { age_group_id?: string }).age_group_id ?? null;

  if (ageGroupId) {
    const { data: ageGroupOwner } = await admin
      .from("age_groups")
      .select("id")
      .eq("id", ageGroupId)
      .eq("coordinator_id", userId)
      .maybeSingle();
    hasAccess = !!ageGroupOwner;
    isCoordinator = !!ageGroupOwner;
  }

  if (!teamId && ageGroupId) {
    const { data: fallbackTeam } = await admin
      .from("teams")
      .select("id")
      .eq("age_group_id", ageGroupId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    teamId = (fallbackTeam as { id?: string } | null)?.id ?? null;
  }

  if (!hasAccess && teamId) {
    const { data: staffLink } = await admin
      .from("team_staff")
      .select("id")
      .eq("team_id", teamId)
      .eq("profile_id", userId)
      .maybeSingle();
    hasAccess = !!staffLink;
  }

  if (!hasAccess) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Sem permissões." }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    isCoordinator,
  };
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { id: gameId } = await params;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const admin = createAdminClient();
    const access = await assertGameAccess(admin, gameId, user.id);
    if (!access.ok) return access.response;

    const { data: game, error: gameError } = await admin
      .from("games")
      .select(
        "id, team_id, age_group_id, status, title, opponent_name, opponent_short_name, game_datetime, location, is_home, score_home, score_away, notes",
      )
      .eq("id", gameId)
      .maybeSingle();

    if (gameError) {
      return NextResponse.json({ error: "Erro ao carregar jogo." }, { status: 500 });
    }
    if (!game) {
      return NextResponse.json({ error: "Jogo não encontrado." }, { status: 404 });
    }

    const [{ data: events, error: eventsError }, { data: finalStats, error: finalStatsError }] =
      await Promise.all([
        admin
          .from("game_events")
          .select("id, game_id, event_type, player_id, related_player_id, minute, is_opponent_event, created_at")
          .eq("game_id", gameId)
          .order("minute", { ascending: true })
          .order("created_at", { ascending: true }),
        admin
          .from("game_final_stats")
          .select(
            "id, game_id, player_id, lineup_type, minutes_played, goals, own_goals, assists, yellow_cards, red_cards, coach_rating, notes, is_mvp, is_finalized, finalized_at, created_at",
          )
          .eq("game_id", gameId)
          .order("lineup_type", { ascending: true })
          .order("minutes_played", { ascending: false })
          .order("created_at", { ascending: true }),
      ]);

    let homeClubName: string | null = null;
    let homeClubShortName: string | null = null;
    let ageGroupId: string | null = game.age_group_id ?? null;
    if (!ageGroupId && game.team_id) {
      const { data: team } = await admin
        .from("teams")
        .select("age_group_id")
        .eq("id", game.team_id)
        .maybeSingle();
      ageGroupId = team?.age_group_id ?? null;
    }
    if (ageGroupId) {
      const { data: ageGroup } = await admin
        .from("age_groups")
        .select("club_name, club_short_name")
        .eq("id", ageGroupId)
        .maybeSingle();
      homeClubName = ageGroup?.club_name ?? null;
      homeClubShortName = ageGroup?.club_short_name ?? null;
    }

    if (eventsError) {
      return NextResponse.json({ error: "Erro ao carregar timeline do jogo." }, { status: 500 });
    }
    if (finalStatsError) {
      return NextResponse.json({ error: "Erro ao carregar estatísticas finais." }, { status: 500 });
    }

    const playerIds = new Set<string>();
    (events || []).forEach((event) => {
      if (event.player_id) playerIds.add(event.player_id);
      if (event.related_player_id) playerIds.add(event.related_player_id);
    });
    (finalStats || []).forEach((stat) => {
      if (stat.player_id) playerIds.add(stat.player_id);
    });

    const playersById: Record<
      string,
      { id: string; first_name: string; last_name: string; jersey_number: number | null; preferred_position: string | null }
    > = {};

    if (playerIds.size > 0) {
      const { data: playerRows, error: playersError } = await admin
        .from("players")
        .select("id, first_name, last_name, jersey_number, preferred_position")
        .in("id", Array.from(playerIds));

      if (playersError) {
        return NextResponse.json({ error: "Erro ao carregar jogadores do sumário." }, { status: 500 });
      }

      (playerRows || []).forEach((player) => {
        playersById[player.id] = {
          id: player.id,
          first_name: player.first_name,
          last_name: player.last_name,
          jersey_number: player.jersey_number ?? null,
          preferred_position: player.preferred_position ?? null,
        };
      });
    }

    const { data: checkpoint } = await admin
      .from("game_live_checkpoints")
      .select("phase, base_seconds")
      .eq("game_id", gameId)
      .maybeSingle();

    const maxEventMinute = (events || []).reduce((max, row) => Math.max(max, row.minute || 0), 0);
    const maxMinutesPlayed = (finalStats || []).reduce(
      (max, row) => Math.max(max, row.minutes_played || 0),
      0,
    );
    const checkpointMinute =
      typeof checkpoint?.base_seconds === "number"
        ? Math.floor(Math.max(0, checkpoint.base_seconds) / 60) + 1
        : 0;
    const totalMinutes = Math.max(1, maxEventMinute, maxMinutesPlayed, checkpointMinute);

    return NextResponse.json(
      {
        success: true,
        game,
        isCoordinator: access.isCoordinator,
        events: events || [],
        finalStats: finalStats || [],
        playersById,
        totalMinutes,
        homeClubName,
        homeClubShortName,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
