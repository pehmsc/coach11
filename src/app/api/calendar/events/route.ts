import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { resolveUserTeamContext } from "@/lib/auth/team-context";
import { NextResponse } from "next/server";

type CalendarEventType = "training" | "game";

type CalendarPayload = {
  title?: string | null;
  date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  opponent_name?: string | null;
  opponent_short_name?: string | null;
  location?: string | null;
  location_address?: string | null;
  is_home?: boolean;
  notes?: string | null;
  image_url?: string | null;
};

type RouteContextData = {
  userId: string;
  admin: ReturnType<typeof createAdminClient>;
  context: Awaited<ReturnType<typeof resolveUserTeamContext>>;
};

function normalizeOptionalText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeDate(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function normalizeTime(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^\d{2}:\d{2}$/.test(trimmed) ? trimmed : null;
}

function normalizeEventType(value: unknown): CalendarEventType | null {
  if (value === "training" || value === "game") return value;
  return null;
}

function normalizePayload(value: unknown): CalendarPayload {
  if (!value || typeof value !== "object") return {};
  const row = value as Record<string, unknown>;
  return {
    title: normalizeOptionalText(row.title),
    date: normalizeDate(row.date),
    start_time: normalizeTime(row.start_time),
    end_time: normalizeTime(row.end_time),
    opponent_name: normalizeOptionalText(row.opponent_name),
    opponent_short_name: normalizeOptionalText(row.opponent_short_name),
    location: normalizeOptionalText(row.location),
    location_address: normalizeOptionalText(row.location_address),
    is_home: typeof row.is_home === "boolean" ? row.is_home : undefined,
    notes: normalizeOptionalText(row.notes),
    image_url: normalizeOptionalText(row.image_url),
  };
}

async function buildRouteContext(): Promise<RouteContextData | NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const admin = createAdminClient();
  const context = await resolveUserTeamContext(admin, user.id);

  if (context.accessibleAgeGroupIds.length === 0 || context.accessibleTeamIds.length === 0) {
    return NextResponse.json(
      { error: "Sem equipa/escalão associado para gerir calendário." },
      { status: 403 },
    );
  }

  return {
    userId: user.id,
    admin,
    context,
  };
}

function resolveTargetAgeGroupId(
  context: Awaited<ReturnType<typeof resolveUserTeamContext>>,
  requestedAgeGroupId: unknown,
) {
  if (
    typeof requestedAgeGroupId === "string" &&
    context.accessibleAgeGroupIds.includes(requestedAgeGroupId)
  ) {
    return requestedAgeGroupId;
  }
  return context.ageGroup?.id ?? context.accessibleAgeGroupIds[0] ?? null;
}

function resolveTargetTeamId(
  context: Awaited<ReturnType<typeof resolveUserTeamContext>>,
  targetAgeGroupId: string,
  requestedTeamId: unknown,
) {
  const ageGroupTeamIds = context.accessibleTeams
    .filter((team) => team.age_group_id === targetAgeGroupId)
    .map((team) => team.id);

  if (
    typeof requestedTeamId === "string" &&
    ageGroupTeamIds.includes(requestedTeamId)
  ) {
    return requestedTeamId;
  }

  if (context.teamId && ageGroupTeamIds.includes(context.teamId)) {
    return context.teamId;
  }

  return ageGroupTeamIds[0] ?? null;
}

async function isCoordinatorForAgeGroup(
  admin: ReturnType<typeof createAdminClient>,
  ageGroupId: string | null | undefined,
  userId: string,
) {
  if (!ageGroupId) return false;
  const { data } = await admin
    .from("age_groups")
    .select("id")
    .eq("id", ageGroupId)
    .eq("coordinator_id", userId)
    .maybeSingle();
  return !!data;
}

async function getAgeGroupFromTeam(
  admin: ReturnType<typeof createAdminClient>,
  teamId: string | null | undefined,
) {
  if (!teamId) return null;
  const { data } = await admin
    .from("teams")
    .select("age_group_id")
    .eq("id", teamId)
    .maybeSingle();
  return data?.age_group_id ?? null;
}

export async function GET(request: Request) {
  try {
    const routeContext = await buildRouteContext();
    if (routeContext instanceof NextResponse) return routeContext;

    const { admin, context } = routeContext;
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const requestedAgeGroupId = searchParams.get("ageGroupId");

    if (!from || !to) {
      return NextResponse.json(
        { error: "Parâmetros from e to são obrigatórios." },
        { status: 400 },
      );
    }

    const targetAgeGroupId = resolveTargetAgeGroupId(context, requestedAgeGroupId);
    if (!targetAgeGroupId) {
      return NextResponse.json(
        { error: "Não foi possível determinar o escalão alvo." },
        { status: 422 },
      );
    }

    let ageGroupName = "";
    if (targetAgeGroupId === context.ageGroup?.id && context.ageGroup) {
      ageGroupName = `${context.ageGroup.club_name} · ${context.ageGroup.name}`;
    } else {
      const { data: ageGroup } = await admin
        .from("age_groups")
        .select("club_name, name")
        .eq("id", targetAgeGroupId)
        .maybeSingle();
      if (ageGroup) {
        ageGroupName = `${ageGroup.club_name} · ${ageGroup.name}`;
      }
    }

    const [{ data: sessions, error: sessionsError }, { data: games, error: gamesError }] =
      await Promise.all([
        admin
          .from("training_sessions")
          .select("*")
          .eq("age_group_id", targetAgeGroupId)
          .gte("session_date", from)
          .lte("session_date", to)
          .order("session_date", { ascending: true })
          .order("start_time", { ascending: true, nullsFirst: false })
          .order("created_at", { ascending: true }),
        admin
          .from("games")
          .select("*")
          .eq("age_group_id", targetAgeGroupId)
          .gte("game_datetime", `${from}T00:00:00`)
          .lte("game_datetime", `${to}T23:59:59`)
          .order("game_datetime", { ascending: true })
          .order("created_at", { ascending: true }),
      ]);

    if (sessionsError) {
      return NextResponse.json(
        { error: "Erro ao carregar treinos do calendário." },
        { status: 500 },
      );
    }
    if (gamesError) {
      return NextResponse.json(
        { error: "Erro ao carregar jogos do calendário." },
        { status: 500 },
      );
    }

    const currentTeamAgeGroupId =
      context.teamId && context.accessibleTeams.find((row) => row.id === context.teamId)
        ? context.accessibleTeams.find((row) => row.id === context.teamId)?.age_group_id
        : null;
    const fallbackTeamId =
      context.accessibleTeams.find((row) => row.age_group_id === targetAgeGroupId)?.id ?? null;
    const targetTeamId =
      currentTeamAgeGroupId === targetAgeGroupId ? context.teamId : fallbackTeamId;

    return NextResponse.json(
      {
        success: true,
        linked: true,
        ageGroupId: targetAgeGroupId,
        ageGroupName,
        teamId: targetTeamId,
        sessions: sessions || [],
        games: games || [],
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

export async function POST(request: Request) {
  try {
    const routeContext = await buildRouteContext();
    if (routeContext instanceof NextResponse) return routeContext;

    const { admin, context } = routeContext;
    const body = await request.json().catch(() => null);
    const eventType = normalizeEventType(body?.type);
    const payload = normalizePayload(body?.payload);

    if (!eventType || !payload.date) {
      return NextResponse.json({ error: "Dados inválidos para criar evento." }, { status: 400 });
    }

    const targetAgeGroupId = resolveTargetAgeGroupId(context, body?.ageGroupId);
    if (!targetAgeGroupId) {
      return NextResponse.json(
        { error: "Não foi possível determinar o escalão." },
        { status: 422 },
      );
    }

    const targetTeamId = resolveTargetTeamId(context, targetAgeGroupId, body?.teamId);
    if (!targetTeamId) {
      return NextResponse.json(
        { error: "Não foi possível determinar a equipa para o evento." },
        { status: 422 },
      );
    }

    if (eventType === "training") {
      const { data, error } = await admin
        .from("training_sessions")
        .insert({
          age_group_id: targetAgeGroupId,
          team_id: targetTeamId,
          title: payload.title || "Treino",
          session_date: payload.date,
          start_time: payload.start_time || "00:00",
          end_time: payload.end_time,
          location: payload.location,
          location_address: payload.location_address,
          notes: payload.notes,
          image_url: payload.image_url,
          status: "scheduled",
        })
        .select("*")
        .single();

      if (error) {
        return NextResponse.json(
          { error: error.message || "Erro ao criar treino." },
          { status: 500 },
        );
      }

      return NextResponse.json({
        success: true,
        type: "training",
        event: data,
        ageGroupId: targetAgeGroupId,
        teamId: targetTeamId,
      });
    }

    const gameDatetime = `${payload.date}T${payload.start_time || "00:00"}:00`;
    const { data, error } = await admin
      .from("games")
      .insert({
        age_group_id: targetAgeGroupId,
        team_id: targetTeamId,
        title: payload.title || (payload.opponent_name ? `vs ${payload.opponent_name}` : "Jogo"),
        game_datetime: gameDatetime,
        opponent_name: payload.opponent_name,
        opponent_short_name: payload.opponent_short_name,
        location: payload.location,
        location_address: payload.location_address,
        is_home: payload.is_home ?? true,
        notes: payload.notes,
        image_url: payload.image_url,
        status: "scheduled",
        game_type: "league",
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message || "Erro ao criar jogo." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      type: "game",
      event: data,
      ageGroupId: targetAgeGroupId,
      teamId: targetTeamId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const routeContext = await buildRouteContext();
    if (routeContext instanceof NextResponse) return routeContext;

    const { userId, admin, context } = routeContext;
    const body = await request.json().catch(() => null);
    const id = typeof body?.id === "string" ? body.id : null;
    const eventType = normalizeEventType(body?.type);
    const payload = normalizePayload(body?.payload);

    if (!id || !eventType || !payload.date) {
      return NextResponse.json(
        { error: "Dados inválidos para editar evento." },
        { status: 400 },
      );
    }

    const targetAgeGroupId = resolveTargetAgeGroupId(context, body?.ageGroupId);
    if (!targetAgeGroupId) {
      return NextResponse.json(
        { error: "Não foi possível determinar o escalão." },
        { status: 422 },
      );
    }

    const targetTeamId = resolveTargetTeamId(context, targetAgeGroupId, body?.teamId);
    if (!targetTeamId) {
      return NextResponse.json(
        { error: "Não foi possível determinar a equipa para o evento." },
        { status: 422 },
      );
    }

    if (eventType === "training") {
      const { data: existing } = await admin
        .from("training_sessions")
        .select("id, age_group_id, team_id")
        .eq("id", id)
        .maybeSingle();

      if (!existing) {
        return NextResponse.json({ error: "Treino não encontrado." }, { status: 404 });
      }

      const existingAgeGroupId =
        existing.age_group_id || (await getAgeGroupFromTeam(admin, existing.team_id));
      const hasAccess =
        !!existing.team_id && context.accessibleTeamIds.includes(existing.team_id)
          ? true
          : !!existingAgeGroupId && context.accessibleAgeGroupIds.includes(existingAgeGroupId);
      if (!hasAccess) {
        return NextResponse.json({ error: "Sem permissões para este treino." }, { status: 403 });
      }

      const { data, error } = await admin
        .from("training_sessions")
        .update({
          age_group_id: targetAgeGroupId,
          team_id: targetTeamId,
          title: payload.title || "Treino",
          session_date: payload.date,
          start_time: payload.start_time || "00:00",
          end_time: payload.end_time,
          location: payload.location,
          location_address: payload.location_address,
          notes: payload.notes,
          image_url: payload.image_url,
        })
        .eq("id", id)
        .select("*")
        .single();

      if (error) {
        return NextResponse.json(
          { error: error.message || "Erro ao editar treino." },
          { status: 500 },
        );
      }

      return NextResponse.json({
        success: true,
        type: "training",
        event: data,
        ageGroupId: targetAgeGroupId,
        teamId: targetTeamId,
      });
    }

    const { data: existingGame } = await admin
      .from("games")
      .select("id, age_group_id, team_id, status")
      .eq("id", id)
      .maybeSingle();

    if (!existingGame) {
      return NextResponse.json({ error: "Jogo não encontrado." }, { status: 404 });
    }

    const existingAgeGroupId =
      existingGame.age_group_id || (await getAgeGroupFromTeam(admin, existingGame.team_id));
    const hasAccess =
      !!existingGame.team_id && context.accessibleTeamIds.includes(existingGame.team_id)
        ? true
        : !!existingAgeGroupId && context.accessibleAgeGroupIds.includes(existingAgeGroupId);
    if (!hasAccess) {
      return NextResponse.json({ error: "Sem permissões para este jogo." }, { status: 403 });
    }

    if (existingGame.status === "completed") {
      const coordinator = await isCoordinatorForAgeGroup(admin, existingAgeGroupId, userId);
      if (!coordinator) {
        return NextResponse.json(
          { error: "Só o coordenador pode editar jogos terminados." },
          { status: 403 },
        );
      }
    }

    const gameDatetime = `${payload.date}T${payload.start_time || "00:00"}:00`;
    const { data, error } = await admin
      .from("games")
      .update({
        age_group_id: targetAgeGroupId,
        team_id: targetTeamId,
        title: payload.title || (payload.opponent_name ? `vs ${payload.opponent_name}` : "Jogo"),
        game_datetime: gameDatetime,
        opponent_name: payload.opponent_name,
        opponent_short_name: payload.opponent_short_name,
        location: payload.location,
        location_address: payload.location_address,
        is_home: payload.is_home ?? true,
        notes: payload.notes,
        image_url: payload.image_url,
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message || "Erro ao editar jogo." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      type: "game",
      event: data,
      ageGroupId: targetAgeGroupId,
      teamId: targetTeamId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const routeContext = await buildRouteContext();
    if (routeContext instanceof NextResponse) return routeContext;

    const { userId, admin, context } = routeContext;
    const body = await request.json().catch(() => null);
    const id = typeof body?.id === "string" ? body.id : null;
    const eventType = normalizeEventType(body?.type);

    if (!id || !eventType) {
      return NextResponse.json(
        { error: "Dados inválidos para apagar evento." },
        { status: 400 },
      );
    }

    if (eventType === "training") {
      const { data: existing } = await admin
        .from("training_sessions")
        .select("id, age_group_id, team_id")
        .eq("id", id)
        .maybeSingle();

      if (!existing) {
        return NextResponse.json({ error: "Treino não encontrado." }, { status: 404 });
      }

      const existingAgeGroupId =
        existing.age_group_id || (await getAgeGroupFromTeam(admin, existing.team_id));
      const hasAccess =
        !!existing.team_id && context.accessibleTeamIds.includes(existing.team_id)
          ? true
          : !!existingAgeGroupId && context.accessibleAgeGroupIds.includes(existingAgeGroupId);
      if (!hasAccess) {
        return NextResponse.json({ error: "Sem permissões para este treino." }, { status: 403 });
      }

      const { error } = await admin.from("training_sessions").delete().eq("id", id);
      if (error) {
        return NextResponse.json(
          { error: error.message || "Erro ao apagar treino." },
          { status: 500 },
        );
      }
      return NextResponse.json({ success: true, type: "training", id });
    }

    const { data: existingGame } = await admin
      .from("games")
      .select("id, age_group_id, team_id, status")
      .eq("id", id)
      .maybeSingle();

    if (!existingGame) {
      return NextResponse.json({ error: "Jogo não encontrado." }, { status: 404 });
    }

    const existingAgeGroupId =
      existingGame.age_group_id || (await getAgeGroupFromTeam(admin, existingGame.team_id));
    const hasAccess =
      !!existingGame.team_id && context.accessibleTeamIds.includes(existingGame.team_id)
        ? true
        : !!existingAgeGroupId && context.accessibleAgeGroupIds.includes(existingAgeGroupId);
    if (!hasAccess) {
      return NextResponse.json({ error: "Sem permissões para este jogo." }, { status: 403 });
    }

    if (existingGame.status === "completed") {
      const coordinator = await isCoordinatorForAgeGroup(admin, existingAgeGroupId, userId);
      if (!coordinator) {
        return NextResponse.json(
          { error: "Só o coordenador pode editar jogos terminados." },
          { status: 403 },
        );
      }
    }

    const { error } = await admin.from("games").delete().eq("id", id);
    if (error) {
      return NextResponse.json(
        { error: error.message || "Erro ao apagar jogo." },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, type: "game", id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
