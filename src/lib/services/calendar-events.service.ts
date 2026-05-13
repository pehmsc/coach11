import { NextResponse } from "next/server";
import { parseISO } from "date-fns";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveUserTeamContext } from "@/lib/auth/team-context";
import { parseBody } from "@/lib/http/validate";
import { deleteGameCascade, deleteTrainingSessionCascade } from "@/lib/events/delete-cascade";
import {
  isValidManualShortName,
  normalizeManualShortName,
} from "@/lib/football/short-name";
import { formatFixtureOpponentLabel } from "@/lib/games/display";
import { SHORT_PRIVATE_CACHE_CONTROL } from "@/lib/http/cache";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import {
  type LocationSource,
  normalizeLocationSource,
  normalizeNullableNumber,
  resolveFormattedAddress,
} from "@/lib/location";
import { createNotificationsForTeam } from "@/lib/notifications/service";
import {
  getAgeGroupFromTeamId,
  getAgeGroupLabelById,
  getCompetitionForTeam,
  getGameAccessRow,
  getTrainingSessionAccessRow,
  insertGame,
  insertTrainingSession,
  isCoordinatorForAgeGroup,
  listGamesInRange,
  listTrainingSessionsInRange,
  updateGame,
  updateTrainingSession,
} from "@/lib/repositories/calendar-events.repository";
import { createClient } from "@/lib/supabase/server";
import {
  getNextUtNumber,
  getWeekStartDate,
  toIsoDate,
} from "@/lib/trainings/ut-numbering";

type CalendarPayload = {
  title?: string | null;
  ut_number?: number | null;
  date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  opponent_id?: string | null;
  opponent_name?: string | null;
  opponent_short_name?: string | null;
  competition_id?: string | null;
  location?: string | null;
  formatted_address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  osm_place_id?: string | null;
  location_source?: LocationSource | null;
  is_home?: boolean;
  notes?: string | null;
  image_url?: string | null;
  // UT metadata fields
  microcycle_number?: number | null;
  mesocycle_number?: number | null;
  period_type?: string | null;
  focus?: string | null;
  intensity?: string | null;
  field_area?: string | null;
  objective?: string | null;
  complementary_objectives?: string | null;
  initial_instruction?: string | null;
  material?: string | null;
};

type RouteContextData = {
  userId: string;
  db: SupabaseClient;
  context: Awaited<ReturnType<typeof resolveUserTeamContext>>;
};

const CalendarLocationSchema = z.object({
  location: z.string().nullable().optional(),
  formatted_address: z.string().nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  osm_place_id: z.string().nullable().optional(),
  location_source: z.string().nullable().optional(),
});

const CalendarPayloadSchema = CalendarLocationSchema.extend({
  title: z.string().nullable().optional(),
  ut_number: z.number().int().positive().nullable().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.").nullable().optional(),
  start_time: z.string().nullable().optional(),
  end_time: z.string().nullable().optional(),
  opponent_id: z.string().uuid().nullable().optional(),
  opponent_name: z.string().nullable().optional(),
  opponent_short_name: z.string().nullable().optional(),
  competition_id: z.string().nullable().optional(),
  is_home: z.boolean().optional(),
  notes: z.string().nullable().optional(),
  image_url: z.string().nullable().optional(),
  // UT metadata fields
  microcycle_number: z.number().int().positive().nullable().optional(),
  mesocycle_number: z.number().int().positive().nullable().optional(),
  period_type: z.string().nullable().optional(),
  focus: z.string().nullable().optional(),
  intensity: z.string().nullable().optional(),
  field_area: z.string().nullable().optional(),
  objective: z.string().nullable().optional(),
  complementary_objectives: z.string().nullable().optional(),
  initial_instruction: z.string().nullable().optional(),
  material: z.string().nullable().optional(),
});

const CalendarCreateSchema = z.object({
  type: z.enum(["training", "game"]),
  payload: CalendarPayloadSchema,
  ageGroupId: z.string().optional(),
  teamId: z.string().optional(),
});

const CalendarUpdateSchema = CalendarCreateSchema.extend({
  id: z.string().min(1, "ID do evento obrigatório."),
});

const CalendarDeleteSchema = z.object({
  id: z.string().min(1, "ID do evento obrigatório."),
  type: z.enum(["training", "game"]),
});

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
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(trimmed);
  if (!match) return null;
  return `${match[1]}:${match[2]}`;
}

function normalizeOptionalId(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeOptionalUtNumber(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return null;
  }

  return parsed;
}

function normalizeOptionalLocationSource(value: unknown) {
  return normalizeLocationSource(value);
}

function inferLocationSource(
  explicitSource: LocationSource | null | undefined,
  placeId: string | null | undefined,
  hasCoordinates: boolean,
  hasSignal: boolean,
): LocationSource | null {
  if (explicitSource) return explicitSource;
  if (!hasSignal) return null;
  if (!hasCoordinates) return "manual";
  if (typeof placeId === "string" && placeId.trim().startsWith("GOOGLE:")) {
    return "google";
  }
  return "osm";
}

function normalizePayload(value: unknown): CalendarPayload {
  if (!value || typeof value !== "object") return {};
  const row = value as Record<string, unknown>;
  const opponentShortNameRaw = normalizeOptionalText(row.opponent_short_name);
  return {
    title: normalizeOptionalText(row.title),
    ut_number: normalizeOptionalUtNumber(row.ut_number),
    date: normalizeDate(row.date),
    start_time: normalizeTime(row.start_time),
    end_time: normalizeTime(row.end_time),
    opponent_id: normalizeOptionalId(row.opponent_id),
    opponent_name: normalizeOptionalText(row.opponent_name),
    opponent_short_name: normalizeManualShortName(opponentShortNameRaw, 5),
    competition_id: normalizeOptionalId(row.competition_id),
    location: normalizeOptionalText(row.location),
    formatted_address: normalizeOptionalText(row.formatted_address),
    latitude: normalizeNullableNumber(row.latitude),
    longitude: normalizeNullableNumber(row.longitude),
    osm_place_id: normalizeOptionalId(row.osm_place_id),
    location_source: normalizeOptionalLocationSource(row.location_source),
    is_home: typeof row.is_home === "boolean" ? row.is_home : undefined,
    notes: normalizeOptionalText(row.notes),
    image_url: normalizeOptionalText(row.image_url),
  };
}

function normalizeLocationPayload(payload: CalendarPayload): CalendarPayload {
  const hasCoordinates =
    typeof payload.latitude === "number" && Number.isFinite(payload.latitude) &&
    typeof payload.longitude === "number" && Number.isFinite(payload.longitude);
  const formattedAddress = resolveFormattedAddress(
    payload.formatted_address,
  );

  return {
    ...payload,
    formatted_address: formattedAddress,
    latitude: hasCoordinates ? payload.latitude ?? null : null,
    longitude: hasCoordinates ? payload.longitude ?? null : null,
    osm_place_id: hasCoordinates ? payload.osm_place_id ?? null : null,
    location_source: inferLocationSource(
      payload.location_source,
      payload.osm_place_id ?? null,
      hasCoordinates,
      Boolean(payload.location || formattedAddress),
    ),
  };
}

function resolveGameTitle(payload: CalendarPayload) {
  if (payload.title) return payload.title;
  if (payload.opponent_name || payload.opponent_short_name) {
    return formatFixtureOpponentLabel({
      isHome: payload.is_home ?? true,
      opponentName: payload.opponent_name,
      opponentShortName: payload.opponent_short_name,
    });
  }
  return "Jogo";
}

async function buildRouteContext(): Promise<RouteContextData | NextResponse> {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const context = await resolveUserTeamContext(db, user.id);

  if (context.accessibleAgeGroupIds.length === 0 || context.accessibleTeamIds.length === 0) {
    return NextResponse.json(
      { error: "Sem equipa/escalão associado para gerir calendário." },
      { status: 403 },
    );
  }

  return {
    userId: user.id,
    db,
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

async function resolveCompetitionId(
  db: SupabaseClient,
  teamId: string,
  requestedCompetitionId: string | null | undefined,
) {
  if (!requestedCompetitionId) return { id: null as string | null, error: null as string | null };

  const { data, error } = await getCompetitionForTeam(db, requestedCompetitionId, teamId);

  if (error || !data?.id) {
    return {
      id: null as string | null,
      error: "Competição inválida para esta equipa.",
    };
  }

  return { id: data.id as string, error: null as string | null };
}

async function resolveAgeGroupClubId(
  db: SupabaseClient,
  ageGroupId: string,
) {
  const { data, error } = await db
    .from("age_groups")
    .select("club_id")
    .eq("id", ageGroupId)
    .maybeSingle();

  if (error) {
    return {
      clubId: null as string | null,
      error: "Não foi possível determinar o clube do escalão.",
    };
  }

  if (!data?.club_id) {
    return {
      clubId: null as string | null,
      error: "O escalão não tem clube associado.",
    };
  }

  return {
    clubId: data.club_id as string,
    error: null as string | null,
  };
}

function hasAccessToEvent(
  context: Awaited<ReturnType<typeof resolveUserTeamContext>>,
  teamId: string | null | undefined,
  ageGroupId: string | null | undefined,
) {
  if (teamId && context.accessibleTeamIds.includes(teamId)) return true;
  if (ageGroupId && context.accessibleAgeGroupIds.includes(ageGroupId)) return true;
  return false;
}

async function resolveExistingAgeGroupId(
  db: SupabaseClient,
  teamId: string | null | undefined,
  ageGroupId: string | null | undefined,
) {
  if (ageGroupId) return ageGroupId;
  if (!teamId) return null;

  const { data } = await getAgeGroupFromTeamId(db, teamId);
  return data?.age_group_id ?? null;
}

export async function handleCalendarEventsGet(request: Request) {
  try {
    const routeContext = await buildRouteContext();
    if (routeContext instanceof NextResponse) return routeContext;

    const { userId, db, context } = routeContext;
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
      const { data: ageGroup } = await getAgeGroupLabelById(db, targetAgeGroupId);
      if (ageGroup) {
        ageGroupName = `${ageGroup.club_name} · ${ageGroup.name}`;
      }
    }

    const [{ data: sessions, error: sessionsError }, { data: games, error: gamesError }] =
      await Promise.all([
        listTrainingSessionsInRange(db, targetAgeGroupId, from, to),
        listGamesInRange(db, targetAgeGroupId, from, to),
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

    const coordinatorRes = await isCoordinatorForAgeGroup(db, targetAgeGroupId, userId);
    const canDeleteEvents = !!coordinatorRes.data;

    return NextResponse.json(
      {
        success: true,
        linked: true,
        ageGroupId: targetAgeGroupId,
        ageGroupName,
        teamId: targetTeamId,
        canDeleteEvents,
        sessions: sessions || [],
        games: games || [],
      },
      {
        headers: {
          "Cache-Control": SHORT_PRIVATE_CACHE_CONTROL,
        },
      },
    );
  } catch (error) {
    return respondInternalError("api.calendar.events.get", error);
  }
}

export async function handleCalendarEventsPost(request: Request) {
  try {
    const routeContext = await buildRouteContext();
    if (routeContext instanceof NextResponse) return routeContext;

    const { userId, db, context } = routeContext;
    const parsed = await parseBody(request, CalendarCreateSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;
    const eventType = body.type;
    const payload = normalizeLocationPayload(normalizePayload(body.payload));
    if (eventType === "game" && !isValidManualShortName(payload.opponent_short_name, 2, 5)) {
      return NextResponse.json(
        { error: "A sigla do adversário deve ter entre 2 e 5 caracteres." },
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

    const competitionResult =
      eventType === "game"
        ? await resolveCompetitionId(db, targetTeamId, payload.competition_id)
        : { id: null as string | null, error: null as string | null };
    if (competitionResult.error) {
      return NextResponse.json({ error: competitionResult.error }, { status: 400 });
    }

    if (eventType === "training") {
      const { clubId, error: clubError } = await resolveAgeGroupClubId(db, targetAgeGroupId);
      if (clubError || !clubId) {
        return NextResponse.json({ error: clubError }, { status: 400 });
      }

      const utNumber =
        payload.ut_number ?? await getNextUtNumber(db, clubId, targetAgeGroupId);
      const weekStartDate = toIsoDate(getWeekStartDate(parseISO(payload.date!)));

      const { data, error } = await insertTrainingSession(db, {
        age_group_id: targetAgeGroupId,
        team_id: targetTeamId,
        title: payload.title || "Treino",
        ut_number: utNumber,
        week_start_date: weekStartDate,
        session_date: payload.date!,
        start_time: payload.start_time || "00:00",
        end_time: payload.end_time,
        location: payload.location,
        formatted_address: payload.formatted_address,
        latitude: payload.latitude,
        longitude: payload.longitude,
        osm_place_id: payload.osm_place_id,
        location_source: payload.location_source,
        notes: payload.notes,
        image_url: payload.image_url,
        microcycle_number: payload.microcycle_number,
        mesocycle_number: payload.mesocycle_number,
        period_type: payload.period_type,
        focus: payload.focus,
        intensity: payload.intensity,
        field_area: payload.field_area,
        objective: payload.objective,
        complementary_objectives: payload.complementary_objectives,
        initial_instruction: payload.initial_instruction,
        material: payload.material,
      });

      if (error) {
        return respondInternalError("api.calendar.events.post.create_training", error);
      }

      try {
        await createNotificationsForTeam(db, {
          teamId: targetTeamId,
          ageGroupId: targetAgeGroupId,
          actorId: userId,
          type: "new_training",
          entityId: data.id,
          title: "Novo treino agendado",
          body: `${payload.title || "Treino"} · ${payload.date}${payload.start_time ? ` às ${payload.start_time}` : ""}`,
          linkPath: "/calendar",
          excludeActor: true,
        });
      } catch (notificationError) {
        console.error("Erro ao gerar notificações de treino:", notificationError);
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
    const { data, error } = await insertGame(db, {
      age_group_id: targetAgeGroupId,
      team_id: targetTeamId,
      title: resolveGameTitle(payload),
      game_datetime: gameDatetime,
      end_time: payload.end_time,
      competition_id: competitionResult.id,
      opponent_id: payload.opponent_id ?? null,
      opponent_name: payload.opponent_name,
      opponent_short_name: payload.opponent_short_name,
      location: payload.location,
      formatted_address: payload.formatted_address,
      latitude: payload.latitude,
      longitude: payload.longitude,
      osm_place_id: payload.osm_place_id,
      location_source: payload.location_source,
      is_home: payload.is_home ?? true,
      notes: payload.notes,
      image_url: payload.image_url,
    });

    if (error) {
      return respondInternalError("api.calendar.events.post.create_game", error);
    }

    try {
      await createNotificationsForTeam(db, {
        teamId: targetTeamId,
        ageGroupId: targetAgeGroupId,
        actorId: userId,
        type: "new_game",
        entityId: data.id,
        title: "Novo jogo adicionado",
        body: `${payload.opponent_name || "Adversário"} · ${payload.date}${payload.start_time ? ` às ${payload.start_time}` : ""}`,
        linkPath: `/games/${data.id}`,
        excludeActor: true,
      });
    } catch (notificationError) {
      console.error("Erro ao gerar notificações de jogo:", notificationError);
    }

    return NextResponse.json({
      success: true,
      type: "game",
      event: data,
      ageGroupId: targetAgeGroupId,
      teamId: targetTeamId,
    });
  } catch (error) {
    return respondInternalError("api.calendar.events.post", error);
  }
}

export async function handleCalendarEventsPatch(request: Request) {
  try {
    const routeContext = await buildRouteContext();
    if (routeContext instanceof NextResponse) return routeContext;

    const { userId, db, context } = routeContext;
    const parsed = await parseBody(request, CalendarUpdateSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;
    const id = body.id;
    const eventType = body.type;
    const payload = normalizeLocationPayload(normalizePayload(body.payload));
    if (eventType === "game" && !isValidManualShortName(payload.opponent_short_name, 2, 5)) {
      return NextResponse.json(
        { error: "A sigla do adversário deve ter entre 2 e 5 caracteres." },
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

    const competitionResult =
      eventType === "game"
        ? await resolveCompetitionId(db, targetTeamId, payload.competition_id)
        : { id: null as string | null, error: null as string | null };
    if (competitionResult.error) {
      return NextResponse.json({ error: competitionResult.error }, { status: 400 });
    }

    if (eventType === "training") {
      const { data: existing } = await getTrainingSessionAccessRow(db, id);

      if (!existing) {
        return NextResponse.json({ error: "Treino não encontrado." }, { status: 404 });
      }

      const existingAgeGroupId = await resolveExistingAgeGroupId(
        db,
        existing.team_id,
        existing.age_group_id,
      );
      const hasAccess = hasAccessToEvent(context, existing.team_id, existingAgeGroupId);
      if (!hasAccess) {
        return NextResponse.json({ error: "Sem permissões para este treino." }, { status: 403 });
      }

      const { data, error } = await updateTrainingSession(db, id, {
        age_group_id: targetAgeGroupId,
        team_id: targetTeamId,
        title: payload.title || "Treino",
        ut_number: payload.ut_number ?? null,
        week_start_date: toIsoDate(getWeekStartDate(parseISO(payload.date!))),
        session_date: payload.date!,
        start_time: payload.start_time || "00:00",
        end_time: payload.end_time,
        location: payload.location,
        formatted_address: payload.formatted_address,
        latitude: payload.latitude,
        longitude: payload.longitude,
        osm_place_id: payload.osm_place_id,
        location_source: payload.location_source,
        notes: payload.notes,
        image_url: payload.image_url,
        microcycle_number: payload.microcycle_number,
        mesocycle_number: payload.mesocycle_number,
        period_type: payload.period_type,
        focus: payload.focus,
        intensity: payload.intensity,
        field_area: payload.field_area,
        objective: payload.objective,
        complementary_objectives: payload.complementary_objectives,
        initial_instruction: payload.initial_instruction,
        material: payload.material,
      });

      if (error) {
        return respondInternalError("api.calendar.events.patch.update_training", error);
      }

      return NextResponse.json({
        success: true,
        type: "training",
        event: data,
        ageGroupId: targetAgeGroupId,
        teamId: targetTeamId,
      });
    }

    const { data: existingGame } = await getGameAccessRow(db, id);

    if (!existingGame) {
      return NextResponse.json({ error: "Jogo não encontrado." }, { status: 404 });
    }

    const existingAgeGroupId = await resolveExistingAgeGroupId(
      db,
      existingGame.team_id,
      existingGame.age_group_id,
    );
    const hasAccess = hasAccessToEvent(context, existingGame.team_id, existingAgeGroupId);
    if (!hasAccess) {
      return NextResponse.json({ error: "Sem permissões para este jogo." }, { status: 403 });
    }

    if (existingGame.status === "completed") {
      if (!existingAgeGroupId) {
        return NextResponse.json({ error: "Sem permissões para este jogo." }, { status: 403 });
      }

      const coordinator = await isCoordinatorForAgeGroup(db, existingAgeGroupId, userId);
      if (!coordinator.data) {
        return NextResponse.json(
          { error: "Só o coordenador pode editar jogos terminados." },
          { status: 403 },
        );
      }
    }

    const gameDatetime = `${payload.date}T${payload.start_time || "00:00"}:00`;
    const { data, error } = await updateGame(db, id, {
      age_group_id: targetAgeGroupId,
      team_id: targetTeamId,
      title: payload.title ?? null,
      game_datetime: gameDatetime,
      end_time: payload.end_time,
      competition_id: competitionResult.id,
      opponent_id: payload.opponent_id ?? null,
      opponent_name: payload.opponent_name,
      opponent_short_name: payload.opponent_short_name,
      location: payload.location,
      formatted_address: payload.formatted_address,
      latitude: payload.latitude,
      longitude: payload.longitude,
      osm_place_id: payload.osm_place_id,
      location_source: payload.location_source,
      is_home: payload.is_home ?? true,
      notes: payload.notes,
      image_url: payload.image_url,
    });

    if (error) {
      return respondInternalError("api.calendar.events.patch.update_game", error);
    }

    return NextResponse.json({
      success: true,
      type: "game",
      event: data,
      ageGroupId: targetAgeGroupId,
      teamId: targetTeamId,
    });
  } catch (error) {
    return respondInternalError("api.calendar.events.patch", error);
  }
}

export async function handleCalendarEventsDelete(request: Request) {
  try {
    const routeContext = await buildRouteContext();
    if (routeContext instanceof NextResponse) return routeContext;

    const { userId, db, context } = routeContext;
    const parsed = await parseBody(request, CalendarDeleteSchema);
    if (parsed.error) return parsed.error;
    const { id, type: eventType } = parsed.data;

    if (eventType === "training") {
      const { data: existing } = await getTrainingSessionAccessRow(db, id);

      if (!existing) {
        return NextResponse.json({ error: "Treino não encontrado." }, { status: 404 });
      }

      const existingAgeGroupId = await resolveExistingAgeGroupId(
        db,
        existing.team_id,
        existing.age_group_id,
      );
      const hasAccess = hasAccessToEvent(context, existing.team_id, existingAgeGroupId);
      if (!hasAccess) {
        return NextResponse.json({ error: "Sem permissões para este treino." }, { status: 403 });
      }

      if (!existingAgeGroupId) {
        return NextResponse.json(
          { error: "Só o coordenador pode apagar treinos." },
          { status: 403 },
        );
      }

      const coordinator = await isCoordinatorForAgeGroup(db, existingAgeGroupId, userId);
      if (!coordinator.data) {
        return NextResponse.json(
          { error: "Só o coordenador pode apagar treinos." },
          { status: 403 },
        );
      }

      try {
        await deleteTrainingSessionCascade(db, id);
      } catch (deleteError) {
        return respondInternalError("api.calendar.events.delete.training_cascade", deleteError);
      }

      return NextResponse.json({ success: true, type: "training", id });
    }

    const { data: existingGame } = await getGameAccessRow(db, id);

    if (!existingGame) {
      return NextResponse.json({ error: "Jogo não encontrado." }, { status: 404 });
    }

    const existingAgeGroupId = await resolveExistingAgeGroupId(
      db,
      existingGame.team_id,
      existingGame.age_group_id,
    );
    const hasAccess = hasAccessToEvent(context, existingGame.team_id, existingAgeGroupId);
    if (!hasAccess) {
      return NextResponse.json({ error: "Sem permissões para este jogo." }, { status: 403 });
    }

    if (!existingAgeGroupId) {
      return NextResponse.json(
        { error: "Só o coordenador pode apagar jogos." },
        { status: 403 },
      );
    }

    const coordinator = await isCoordinatorForAgeGroup(db, existingAgeGroupId, userId);
    if (!coordinator.data) {
      return NextResponse.json(
        { error: "Só o coordenador pode apagar jogos." },
        { status: 403 },
      );
    }

    try {
      await deleteGameCascade(db, id);
    } catch (deleteError) {
      return respondInternalError("api.calendar.events.delete.game_cascade", deleteError);
    }

    return NextResponse.json({ success: true, type: "game", id });
  } catch (error) {
    return respondInternalError("api.calendar.events.delete", error);
  }
}
