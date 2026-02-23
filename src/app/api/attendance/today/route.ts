import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondInternalError } from "@/lib/http/respond-internal-error";

type AttendanceStatus = "present" | "absent" | "injured";

type StaffContext = {
  ageGroup: {
    id: string;
    name: string;
    club_name: string;
    club_logo_url: string | null;
  } | null;
  teamId: string | null;
};

const VALID_STATUSES: AttendanceStatus[] = ["present", "absent", "injured"];

function isValidStatus(value: unknown): value is AttendanceStatus {
  return typeof value === "string" && VALID_STATUSES.includes(value as AttendanceStatus);
}

function isRelationMissing(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String((error as { code?: string }).code || "") : "";
  const message =
    "message" in error ? String((error as { message?: string }).message || "") : "";
  const lowered = message.toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST204" ||
    code === "PGRST205" ||
    lowered.includes("relation") ||
    lowered.includes("does not exist") ||
    lowered.includes("could not find the table") ||
    lowered.includes("schema cache")
  );
}

function isMissingColumn(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String((error as { code?: string }).code || "") : "";
  return code === "42703";
}

function isOnConflictUnsupported(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String((error as { code?: string }).code || "") : "";
  const message =
    "message" in error ? String((error as { message?: string }).message || "") : "";
  return (
    code === "42P10" ||
    message.toLowerCase().includes("no unique") ||
    message.toLowerCase().includes("on conflict")
  );
}

function normalizeDateParam(raw: string | null) {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return new Date().toISOString().slice(0, 10);
}

function toAgeGroupPayload(data: Record<string, unknown> | null) {
  if (!data) return null;
  const id = typeof data.id === "string" ? data.id : null;
  const name = typeof data.name === "string" ? data.name : null;
  const clubName = typeof data.club_name === "string" ? data.club_name : null;
  if (!id || !name || !clubName) return null;

  return {
    id,
    name,
    club_name: clubName,
    club_logo_url:
      typeof data.club_logo_url === "string" ? data.club_logo_url : null,
  };
}

async function getAgeGroupByCoordinator(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
) {
  const primary = await admin
    .from("age_groups")
    .select("id, name, club_name, club_logo_url")
    .eq("coordinator_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!primary.error) {
    return toAgeGroupPayload((primary.data ?? null) as Record<string, unknown> | null);
  }

  // Compatibilidade com schemas sem coluna club_logo_url.
  if (isMissingColumn(primary.error)) {
    const fallback = await admin
      .from("age_groups")
      .select("id, name, club_name")
      .eq("coordinator_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!fallback.error) {
      return toAgeGroupPayload((fallback.data ?? null) as Record<string, unknown> | null);
    }
  }

  return null;
}

async function getAgeGroupById(
  admin: ReturnType<typeof createAdminClient>,
  ageGroupId: string,
) {
  const primary = await admin
    .from("age_groups")
    .select("id, name, club_name, club_logo_url")
    .eq("id", ageGroupId)
    .maybeSingle();

  if (!primary.error) {
    return toAgeGroupPayload((primary.data ?? null) as Record<string, unknown> | null);
  }

  if (isMissingColumn(primary.error)) {
    const fallback = await admin
      .from("age_groups")
      .select("id, name, club_name")
      .eq("id", ageGroupId)
      .maybeSingle();

    if (!fallback.error) {
      return toAgeGroupPayload((fallback.data ?? null) as Record<string, unknown> | null);
    }
  }

  return null;
}

async function resolveStaffContext(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const context: StaffContext = { ageGroup: null, teamId: null };

  const managedAgeGroup = await getAgeGroupByCoordinator(admin, userId);

  if (managedAgeGroup) {
    context.ageGroup = managedAgeGroup;

    const teamResult = await admin
      .from("teams")
      .select("id")
      .eq("age_group_id", managedAgeGroup.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const team = (teamResult.data ?? null) as { id: string } | null;
    context.teamId = typeof team?.id === "string" ? team.id : null;
    return context;
  }

  const { data: staffLink } = await admin
    .from("team_staff")
    .select("team_id")
    .eq("profile_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!staffLink?.team_id) return context;

  context.teamId = staffLink.team_id;

  const { data: team } = await admin
    .from("teams")
    .select("age_group_id")
    .eq("id", staffLink.team_id)
    .maybeSingle();

  if (!team?.age_group_id) return context;

  const ageGroup = await getAgeGroupById(admin, team.age_group_id);

  context.ageGroup = ageGroup ?? null;
  return context;
}

async function readAttendance(
  admin: ReturnType<typeof createAdminClient>,
  sessionId: string,
) {
  const tablePriority = ["attendance_records", "training_attendance"] as const;
  const fkColumns = ["training_session_id", "session_id"] as const;
  let criticalError: unknown = null;

  for (const table of tablePriority) {
    for (const fkColumn of fkColumns) {
      const { data, error } = await admin
        .from(table)
        .select("*")
        .eq(fkColumn, sessionId);

      if (!error) {
        const rows = (data || [])
          .map((rawRow) => {
            const row = rawRow as Record<string, unknown>;
            const playerId =
              typeof row.player_id === "string"
                ? row.player_id
                : typeof row.athlete_id === "string"
                  ? row.athlete_id
                  : null;
            const status =
              typeof row.status === "string"
                ? row.status
                : typeof row.attendance_status === "string"
                  ? row.attendance_status
                  : null;

            return {
              player_id: playerId,
              status,
            };
          })
          .filter((row) => typeof row.player_id === "string");

        return { table, rows };
      }

      const schemaCompatError = isRelationMissing(error) || isMissingColumn(error);
      if (!schemaCompatError && !criticalError) {
        criticalError = error;
      }

      // Se for erro estrutural esperado, tenta próxima variação (FK/tabela).
      if (schemaCompatError) {
        continue;
      }

      // Erro inesperado: tentar próxima tabela, mas guardar para retorno final.
      break;
    }
  }

  if (criticalError) {
    return { table: null, rows: [], error: criticalError };
  }

  return { table: null, rows: [] };
}

async function writeAttendanceInTable(
  admin: ReturnType<typeof createAdminClient>,
  table: "attendance_records" | "training_attendance",
  sessionId: string,
  rows: Array<{
    training_session_id: string;
    player_id: string;
    status: AttendanceStatus;
    marked_by: string;
    marked_at: string;
  }>,
) {
  const minimalRows = rows.map(({ training_session_id, player_id, status }) => ({
    training_session_id,
    player_id,
    status,
  }));

  const withMetaUpsert = await admin
    .from(table)
    .upsert(rows, { onConflict: "training_session_id,player_id" });

  if (!withMetaUpsert.error) return { success: true as const };
  if (isRelationMissing(withMetaUpsert.error)) return { relationMissing: true as const };

  let currentError = withMetaUpsert.error;

  if (isMissingColumn(currentError)) {
    const minimalUpsert = await admin
      .from(table)
      .upsert(minimalRows, { onConflict: "training_session_id,player_id" });
    if (!minimalUpsert.error) return { success: true as const };
    if (isRelationMissing(minimalUpsert.error)) return { relationMissing: true as const };
    currentError = minimalUpsert.error;
  }

  if (isOnConflictUnsupported(currentError)) {
    const { error: deleteError } = await admin
      .from(table)
      .delete()
      .eq("training_session_id", sessionId);
    if (deleteError) return { error: deleteError };

    const insertResult = await admin.from(table).insert(minimalRows);
    if (!insertResult.error) return { success: true as const };
    return { error: insertResult.error };
  }

  return { error: currentError };
}

async function writeAttendance(
  admin: ReturnType<typeof createAdminClient>,
  sessionId: string,
  rows: Array<{
    training_session_id: string;
    player_id: string;
    status: AttendanceStatus;
    marked_by: string;
    marked_at: string;
  }>,
) {
  const tablePriority = ["attendance_records", "training_attendance"] as const;

  for (const table of tablePriority) {
    const result = await writeAttendanceInTable(admin, table, sessionId, rows);
    if ("success" in result && result.success) {
      return { success: true as const, table };
    }
    if ("relationMissing" in result && result.relationMissing) {
      continue;
    }
    if ("error" in result && result.error) {
      return { success: false as const, error: result.error };
    }
  }

  return {
    success: false as const,
    error: new Error("Nenhuma tabela de presenças disponível (attendance_records/training_attendance)."),
  };
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const admin = createAdminClient();
    const context = await resolveStaffContext(admin, user.id);

    if (!context.ageGroup) {
      return NextResponse.json({
        success: true,
        linked: false,
        noSession: true,
        ageGroup: null,
        players: [],
        session: null,
        attendance: {},
      });
    }

    const date = normalizeDateParam(new URL(request.url).searchParams.get("date"));

    const { data: players, error: playersError } = await admin
      .from("players")
      .select("*")
      .eq("age_group_id", context.ageGroup.id)
      .eq("status", "active")
      .order("first_name", { ascending: true })
      .order("last_name", { ascending: true });

    if (playersError) {
      return NextResponse.json(
        { error: "Erro ao carregar jogadores para presenças." },
        { status: 500 },
      );
    }

    let sessionsQuery = admin
      .from("training_sessions")
      .select("id, age_group_id, team_id, session_date, start_time, status, created_at")
      .eq("session_date", date)
      .order("start_time", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });

    if (context.teamId) {
      sessionsQuery = sessionsQuery.eq("team_id", context.teamId);
    } else {
      sessionsQuery = sessionsQuery.eq("age_group_id", context.ageGroup.id);
    }

    const { data: sessions, error: sessionsError } = await sessionsQuery;

    if (sessionsError) {
      return NextResponse.json(
        { error: "Erro ao carregar sessão de treino do dia." },
        { status: 500 },
      );
    }

    const todaysSessions = sessions || [];
    const selectedSession =
      todaysSessions.find((session) => session.status !== "completed") ||
      todaysSessions[0] ||
      null;

    if (!selectedSession) {
      const defaultAttendance: Record<string, AttendanceStatus> = {};
      (players || []).forEach((player) => {
        defaultAttendance[player.id] = "present";
      });

      return NextResponse.json({
        success: true,
        linked: true,
        noSession: true,
        date,
        ageGroup: context.ageGroup,
        players: players || [],
        session: null,
        attendance: defaultAttendance,
      });
    }

    const attendanceResult = await readAttendance(admin, selectedSession.id);
    if ("error" in attendanceResult && attendanceResult.error) {
      return NextResponse.json(
        { error: "Erro ao carregar presenças guardadas." },
        { status: 500 },
      );
    }

    const attendanceMap: Record<string, AttendanceStatus> = {};
    (players || []).forEach((player) => {
      attendanceMap[player.id] = "present";
    });

    (attendanceResult.rows || []).forEach((row) => {
      if (row?.player_id && isValidStatus(row.status)) {
        attendanceMap[row.player_id] = row.status;
      }
    });

    return NextResponse.json({
      success: true,
      linked: true,
      noSession: false,
      date,
      ageGroup: context.ageGroup,
      players: players || [],
      session: selectedSession,
      attendance: attendanceMap,
      attendanceTable: attendanceResult.table,
    });
  } catch (error) {
    return respondInternalError("api.attendance.today.get", error);
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const sessionId =
      body && typeof body === "object" && typeof body.sessionId === "string"
        ? body.sessionId
        : null;
    const attendanceInput =
      body && typeof body === "object" && typeof body.attendance === "object"
        ? (body.attendance as Record<string, unknown>)
        : null;

    if (!sessionId || !attendanceInput) {
      return NextResponse.json(
        { error: "Dados inválidos para guardar presenças." },
        { status: 400 },
      );
    }

    const admin = createAdminClient();

    const { data: session, error: sessionError } = await admin
      .from("training_sessions")
      .select("id, age_group_id, team_id")
      .eq("id", sessionId)
      .maybeSingle();

    if (sessionError) {
      return NextResponse.json(
        { error: "Erro ao validar sessão de treino." },
        { status: 500 },
      );
    }

    if (!session) {
      return NextResponse.json({ error: "Sessão não encontrada." }, { status: 404 });
    }

    let hasAccess = false;

    if (session.age_group_id) {
      const { data: managedAgeGroup } = await admin
        .from("age_groups")
        .select("id")
        .eq("id", session.age_group_id)
        .eq("coordinator_id", user.id)
        .maybeSingle();
      hasAccess = !!managedAgeGroup;
    }

    if (!hasAccess && session.team_id) {
      const { data: staffLink } = await admin
        .from("team_staff")
        .select("id")
        .eq("team_id", session.team_id)
        .eq("profile_id", user.id)
        .maybeSingle();
      hasAccess = !!staffLink;
    }

    if (!hasAccess) {
      return NextResponse.json(
        { error: "Sem permissões para marcar presenças nesta sessão." },
        { status: 403 },
      );
    }

    const entries = Object.entries(attendanceInput).filter(
      ([playerId, status]) => typeof playerId === "string" && isValidStatus(status),
    ) as Array<[string, AttendanceStatus]>;

    if (entries.length === 0) {
      return NextResponse.json(
        { error: "Sem presenças válidas para guardar." },
        { status: 400 },
      );
    }

    if (session.age_group_id) {
      const playerIds = entries.map(([playerId]) => playerId);
      const { data: validPlayers, error: validPlayersError } = await admin
        .from("players")
        .select("id")
        .eq("age_group_id", session.age_group_id)
        .in("id", playerIds);

      if (validPlayersError) {
        return NextResponse.json(
          { error: "Erro ao validar jogadores das presenças." },
          { status: 500 },
        );
      }

      const validSet = new Set((validPlayers || []).map((player) => player.id));
      const hasInvalid = playerIds.some((id) => !validSet.has(id));

      if (hasInvalid) {
        return NextResponse.json(
          { error: "Existem jogadores inválidos para esta sessão de treino." },
          { status: 400 },
        );
      }
    }

    const markedAt = new Date().toISOString();
    const rows = entries.map(([player_id, status]) => ({
      training_session_id: session.id,
      player_id,
      status,
      marked_by: user.id,
      marked_at: markedAt,
    }));

    const writeResult = await writeAttendance(admin, session.id, rows);
    if (!writeResult.success) {
      return NextResponse.json(
        { error: "Erro ao guardar presenças na base de dados." },
        { status: 500 },
      );
    }

    await admin
      .from("training_sessions")
      .update({ status: "completed" })
      .eq("id", session.id);

    return NextResponse.json({
      success: true,
      sessionId: session.id,
      attendanceTable: writeResult.table,
      savedCount: rows.length,
    });
  } catch (error) {
    return respondInternalError("api.attendance.today.post", error);
  }
}
