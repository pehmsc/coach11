import { NextResponse } from "next/server";
import type { Player } from "@/types/database";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveUserTeamContext } from "@/lib/auth/team-context";
import { SHORT_PRIVATE_CACHE_CONTROL } from "@/lib/http/cache";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import type { LocationSource } from "@/lib/location";

type TrainingRow = {
  id: string;
  session_date: string;
  start_time?: string | null;
  end_time?: string | null;
  title?: string | null;
  location?: string | null;
  location_address?: string | null;
  formatted_address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  osm_place_id?: string | null;
  location_source?: LocationSource | null;
  notes?: string | null;
  image_url?: string | null;
  status: string;
  age_group_id?: string | null;
  team_id?: string | null;
};

type AttendanceStatus = "present" | "absent" | "injured";

type AttendanceSummary = {
  session_id: string;
  present: number;
  absent: number;
  injured: number;
  total: number;
};

type AttendanceDetail = {
  player: Player;
  status: AttendanceStatus;
};

const VALID_ATTENDANCE_STATUSES = new Set<AttendanceStatus>([
  "present",
  "absent",
  "injured",
]);

function isAttendanceStatus(value: unknown): value is AttendanceStatus {
  return typeof value === "string" && VALID_ATTENDANCE_STATUSES.has(value as AttendanceStatus);
}

function buildSummary(sessionId: string, rows: Array<{ status: AttendanceStatus }>): AttendanceSummary {
  const summary: AttendanceSummary = {
    session_id: sessionId,
    present: 0,
    absent: 0,
    injured: 0,
    total: rows.length,
  };

  for (const row of rows) {
    if (row.status === "present") summary.present += 1;
    else if (row.status === "absent") summary.absent += 1;
    else if (row.status === "injured") summary.injured += 1;
  }

  return summary;
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

    let db = supabase;
    try {
      db = createAdminClient();
    } catch {
      db = supabase;
    }

    const context = await resolveUserTeamContext(db, user.id);
    if (!context.ageGroup?.id) {
      return NextResponse.json(
        {
          success: true,
          linked: false,
          sessions: [],
          summaries: [],
        },
        {
          headers: {
            "Cache-Control": SHORT_PRIVATE_CACHE_CONTROL,
          },
        },
      );
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("sessionId");

    if (sessionId) {
      const { data: session, error: sessionError } = await db
        .from("training_sessions")
        .select(
          "id, session_date, start_time, end_time, title, location, location_address, formatted_address, latitude, longitude, osm_place_id, location_source, notes, image_url, status, age_group_id, team_id",
        )
        .eq("id", sessionId)
        .eq("age_group_id", context.ageGroup.id)
        .maybeSingle();

      if (sessionError) {
        throw sessionError;
      }

      if (!session) {
        return NextResponse.json({ error: "Treino não encontrado." }, { status: 404 });
      }

      const { data: rawAttendanceRows, error: attendanceError } = await db
        .from("training_attendance")
        .select("player_id, status")
        .eq("training_session_id", sessionId);

      if (attendanceError) {
        throw attendanceError;
      }

      const attendanceRows = ((rawAttendanceRows || []) as Array<{
        player_id: string | null;
        status: string | null;
      }>)
        .filter(
          (row): row is { player_id: string; status: AttendanceStatus } =>
            typeof row.player_id === "string" && isAttendanceStatus(row.status),
        );

      const isCompletedSession = session.status === "completed";
      const hasRecordedAttendance = attendanceRows.length > 0;
      const recordedPlayerIds = Array.from(
        new Set(attendanceRows.map((row) => row.player_id)),
      );

      let playerRows: Player[] = [];
      if (isCompletedSession) {
        if (recordedPlayerIds.length > 0) {
          const { data: playersData, error: playersError } = await db
            .from("players")
            .select("*")
            .in("id", recordedPlayerIds)
            .order("first_name")
            .order("last_name");

          if (playersError) {
            throw playersError;
          }

          playerRows = (playersData as Player[]) || [];
        }
      } else {
        const { data: playersData, error: playersError } = await db
          .from("players")
          .select("*")
          .eq("age_group_id", context.ageGroup.id)
          .eq("status", "active")
          .order("first_name")
          .order("last_name");

        if (playersError) {
          throw playersError;
        }

        playerRows = (playersData as Player[]) || [];
      }

      const playerById = new Map(playerRows.map((player) => [player.id, player]));
      const detailEntries: AttendanceDetail[] = [];

      if (isCompletedSession) {
        for (const row of attendanceRows) {
          const player = playerById.get(row.player_id);
          if (!player) continue;
          detailEntries.push({
            player,
            status: row.status,
          });
        }
      } else {
        const attendanceByPlayerId = new Map(
          attendanceRows.map((row) => [row.player_id, row.status]),
        );

        for (const player of playerRows) {
          detailEntries.push({
            player,
            status: attendanceByPlayerId.get(player.id) ?? "present",
          });
        }
      }

      const summary = buildSummary(
        sessionId,
        detailEntries.map((entry) => ({ status: entry.status })),
      );

      return NextResponse.json(
        {
          success: true,
          linked: true,
          session,
          attendance: detailEntries,
          summary,
          hasRecordedAttendance,
        },
        {
          headers: {
            "Cache-Control": SHORT_PRIVATE_CACHE_CONTROL,
          },
        },
      );
    }

    const { data: sessionsData, error: sessionsError } = await db
      .from("training_sessions")
      .select(
        "id, session_date, start_time, end_time, title, location, location_address, formatted_address, latitude, longitude, osm_place_id, location_source, notes, image_url, status, age_group_id, team_id",
      )
      .eq("age_group_id", context.ageGroup.id)
      .order("session_date", { ascending: true })
      .order("start_time", { ascending: true, nullsFirst: false });

    if (sessionsError) {
      throw sessionsError;
    }

    const sessions = (sessionsData as TrainingRow[]) || [];
    const sessionIds = sessions.map((session) => session.id);
    const summaryMap = new Map<string, AttendanceSummary>();

    if (sessionIds.length > 0) {
      const { data: rawAttendanceRows, error: attendanceError } = await db
        .from("training_attendance")
        .select("training_session_id, status")
        .in("training_session_id", sessionIds);

      if (attendanceError) {
        throw attendanceError;
      }

      for (const row of (rawAttendanceRows || []) as Array<{
        training_session_id: string | null;
        status: string | null;
      }>) {
        if (
          typeof row.training_session_id !== "string" ||
          !isAttendanceStatus(row.status)
        ) {
          continue;
        }

        const current = summaryMap.get(row.training_session_id) ?? {
          session_id: row.training_session_id,
          present: 0,
          absent: 0,
          injured: 0,
          total: 0,
        };

        if (row.status === "present") current.present += 1;
        else if (row.status === "absent") current.absent += 1;
        else if (row.status === "injured") current.injured += 1;
        current.total += 1;
        summaryMap.set(row.training_session_id, current);
      }
    }

    return NextResponse.json(
      {
        success: true,
        linked: true,
        sessions,
        summaries: Array.from(summaryMap.values()),
      },
      {
        headers: {
          "Cache-Control": SHORT_PRIVATE_CACHE_CONTROL,
        },
      },
    );
  } catch (error) {
    return respondInternalError("api.trainings.get", error);
  }
}
