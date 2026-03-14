import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import { parseBody } from "@/lib/http/validate";
import { createNotificationForTeamOnce } from "@/lib/notifications/service";
import { captureServerProductEvent } from "@/lib/observability/posthog-server";
import {
  getPresencePromptState,
  shouldShowPresencePrompt,
} from "@/lib/events/presence-window";

type AttendanceStatus = "present" | "late" | "absent" | "injured";

type DatabaseWriteError = {
  code?: string;
  message?: string;
};

type AttendanceGetPayload = {
  success?: boolean;
  linked?: boolean;
  noSession?: boolean;
  date?: string;
  ageGroup?: unknown;
  players?: unknown[];
  session?: unknown;
  attendance?: Record<string, AttendanceStatus>;
  attendanceTable?: string | null;
  presencePromptState?: "hidden" | "mark" | "close" | "closed";
  ok?: boolean;
  error_code?: string;
};

type AttendanceGetSession = {
  id: string;
  status?: string | null;
  session_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
};

type TrainingSessionAccessContext = {
  exists: boolean;
  canAccess: boolean;
  isCoordinator: boolean;
  status: string | null;
  teamId: string | null;
  ageGroupId: string | null;
  clubId: string | null;
  sessionDate: string | null;
  startTime: string | null;
  endTime: string | null;
};

const AttendancePostSchema = z.object({
  sessionId: z.string().min(1, "ID da sessão obrigatório."),
  attendance: z.record(z.string(), z.enum(["present", "late", "absent", "injured"])).refine(
    (obj) => Object.keys(obj).length > 0,
    "Sem presenças válidas para guardar.",
  ),
  finalize: z.boolean().optional().default(false),
});

function normalizeDateParam(raw: string | null): string {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return new Date().toISOString().slice(0, 10);
}

function getAttendanceWriteErrorMessage(error: unknown): string {
  const dbError = error as DatabaseWriteError | null;
  if (
    dbError?.code === "23514" &&
    typeof dbError.message === "string" &&
    dbError.message.includes("training_attendance_status_check")
  ) {
    return 'A base de dados ainda não aceita o estado "Atrasado". Falta aplicar a migration de presenças.';
  }

  return "Erro ao guardar presenças na base de dados.";
}

function jsonNoStore(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "Cache-Control": "private, no-store",
    },
  });
}

function parseTrainingSessionAccessContext(value: unknown): TrainingSessionAccessContext | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;

  return {
    exists: row.exists === true,
    canAccess: row.canAccess === true,
    isCoordinator: row.isCoordinator === true,
    status: typeof row.status === "string" ? row.status : null,
    teamId: typeof row.teamId === "string" ? row.teamId : null,
    ageGroupId: typeof row.ageGroupId === "string" ? row.ageGroupId : null,
    clubId: typeof row.clubId === "string" ? row.clubId : null,
    sessionDate: typeof row.sessionDate === "string" ? row.sessionDate : null,
    startTime: typeof row.startTime === "string" ? row.startTime : null,
    endTime: typeof row.endTime === "string" ? row.endTime : null,
  };
}

export async function GET(request: Request) {
  let userId: string | null = null;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return jsonNoStore({ error: "Não autenticado" }, { status: 401 });
    }
    userId = user.id;

    const date = normalizeDateParam(new URL(request.url).searchParams.get("date"));
    const rpcRes = await supabase.rpc("rpc_attendance_today_get", {
      p_date: date,
    });

    if (rpcRes.error) {
      return jsonNoStore(
        { error: "Erro ao carregar sessão de treino do dia." },
        { status: 500 },
      );
    }

    const payload = (rpcRes.data || null) as AttendanceGetPayload | null;
    if (payload?.ok === false && payload.error_code === "not_authenticated") {
      return jsonNoStore({ error: "Não autenticado" }, { status: 401 });
    }

    if (payload?.success) {
      const session =
        payload.session && typeof payload.session === "object"
          ? (payload.session as AttendanceGetSession)
          : null;
      const presencePromptState = session
        ? getPresencePromptState(
            session.session_date,
            session.start_time,
            session.end_time,
            session.status ?? null,
          )
        : "hidden";

      if (
        session &&
        session.status !== "completed" &&
        !shouldShowPresencePrompt(
          session.session_date,
          session.start_time,
          session.end_time,
          session.status ?? null,
        )
      ) {
        return jsonNoStore({
          ...payload,
          noSession: true,
          session: null,
          presencePromptState: "hidden",
        });
      }

      if (
        session?.id &&
        (presencePromptState === "mark" || presencePromptState === "close")
      ) {
        const { data: sessionMeta } = await supabase
          .from("training_sessions")
          .select("id, title, age_group_id, team_id, session_date, start_time")
          .eq("id", session.id)
          .maybeSingle();

        if (sessionMeta?.team_id && sessionMeta?.age_group_id) {
          try {
            await createNotificationForTeamOnce(supabase, {
              teamId: sessionMeta.team_id,
              ageGroupId: sessionMeta.age_group_id,
              actorId: user.id,
              type: "attendance_pending",
              entityId: sessionMeta.id,
              title:
                presencePromptState === "close"
                  ? "Fechar presenças do treino"
                  : "Presenças por marcar",
              body: `${sessionMeta.title || "Treino"} · ${sessionMeta.session_date || date}${sessionMeta.start_time ? ` às ${sessionMeta.start_time}` : ""}`,
              linkPath: "/attendance",
              excludeActor: false,
            });
          } catch (notificationError) {
            console.error(
              "Erro ao gerar notificação operacional de presenças pendentes:",
              notificationError,
            );
          }
        }
      }

      return jsonNoStore({
        ...payload,
        presencePromptState,
      });
    }

    return jsonNoStore(
      { error: "Erro ao carregar sessão de treino do dia." },
      { status: 500 },
    );
  } catch (error) {
    return respondInternalError("api.attendance.today.get", error, {
      request,
      userId,
    });
  }
}

export async function POST(request: Request) {
  let userId: string | null = null;
  let sessionIdForError: string | null = null;
  let sessionAgeGroupIdForError: string | null = null;
  let sessionTeamIdForError: string | null = null;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    userId = user.id;

    const parsed = await parseBody(request, AttendancePostSchema);
    if (parsed.error) return parsed.error;
    const { sessionId, attendance: attendancePayload, finalize } = parsed.data;
    sessionIdForError = sessionId;
    const entries = Object.entries(attendancePayload);

    let db = supabase;
    try {
      db = createAdminClient();
    } catch {
      db = supabase;
    }

    const sessionAccessRpc = await supabase.rpc("rpc_training_session_access_context", {
      p_training_session_id: sessionId,
    });

    if (sessionAccessRpc.error) {
      return NextResponse.json(
        { error: "Erro ao validar a sessão de treino." },
        { status: 500 },
      );
    }

    const sessionAccess = parseTrainingSessionAccessContext(sessionAccessRpc.data);
    if (!sessionAccess?.exists) {
      return NextResponse.json({ error: "Sessão não encontrada." }, { status: 404 });
    }

    if (!sessionAccess.canAccess) {
      return NextResponse.json(
        { error: "Sem permissões para marcar presenças nesta sessão." },
        { status: 403 },
      );
    }

    const session: AttendanceGetSession = {
      id: sessionId,
      status: sessionAccess.status,
      session_date: sessionAccess.sessionDate,
      start_time: sessionAccess.startTime,
      end_time: sessionAccess.endTime,
    };
    const sessionAgeGroupId = sessionAccess.ageGroupId;
    const sessionTeamId = sessionAccess.teamId;
    sessionAgeGroupIdForError = sessionAgeGroupId;
    sessionTeamIdForError = sessionTeamId;

    if (!sessionAgeGroupId) {
      return NextResponse.json(
        { error: "Sessão de treino sem escalão associado." },
        { status: 500 },
      );
    }

    const isCoordinator = sessionAccess.isCoordinator;

    if (session.status === "completed" && !isCoordinator) {
      return NextResponse.json(
        { error: "Só o coordenador pode corrigir presenças depois de fechar o treino." },
        { status: 403 },
      );
    }

    if (
      finalize &&
      session.status !== "completed" &&
      getPresencePromptState(
        session.session_date,
        session.start_time,
        session.end_time,
        session.status ?? null,
      ) !== "close"
    ) {
      return NextResponse.json(
        { error: "O treino ainda não chegou à hora de confirmação e fecho." },
        { status: 409 },
      );
    }

    const playerIds = entries.map(([playerId]) => playerId);
    const { data: validPlayers, error: validPlayersError } = await db
      .from("players")
      .select("id")
      .eq("age_group_id", sessionAgeGroupId)
      .in("id", playerIds);

    if (validPlayersError) {
      return NextResponse.json(
        { error: "Erro ao validar jogadores da sessão." },
        { status: 500 },
      );
    }

    const validPlayerIds = new Set((validPlayers || []).map((row) => String(row.id)));
    if (validPlayerIds.size !== playerIds.length) {
      return NextResponse.json(
        { error: "Existem jogadores inválidos para esta sessão de treino." },
        { status: 400 },
      );
    }

    const markedAt = new Date().toISOString();
    const rowsToSave = entries.map(([playerId, status]) => ({
      training_session_id: sessionId,
      player_id: playerId,
      status,
      marked_by: user.id,
      marked_at: markedAt,
    }));

    const upsertRes = await db
      .from("training_attendance")
      .upsert(rowsToSave, { onConflict: "training_session_id,player_id" });

    if (upsertRes.error) {
      console.error("attendance.upsert.failed", upsertRes.error);
      const deleteRes = await db
        .from("training_attendance")
        .delete()
        .eq("training_session_id", sessionId);

      if (deleteRes.error) {
        console.error("attendance.delete-fallback.failed", deleteRes.error);
        return NextResponse.json(
          { error: getAttendanceWriteErrorMessage(upsertRes.error) },
          { status: 500 },
        );
      }

      const insertRes = await db.from("training_attendance").insert(rowsToSave);
      if (insertRes.error) {
        console.error("attendance.insert-fallback.failed", insertRes.error);
        return NextResponse.json(
          { error: getAttendanceWriteErrorMessage(insertRes.error) },
          { status: 500 },
        );
      }
    }

    let sessionStatus = session.status ?? "scheduled";
    if (finalize && session.status !== "completed") {
      const { error: finalizeError } = await db
        .from("training_sessions")
        .update({ status: "completed" })
        .eq("id", sessionId);

      if (finalizeError) {
        return NextResponse.json(
          { error: "Erro ao fechar o treino depois de guardar presenças." },
          { status: 500 },
        );
      }

      sessionStatus = "completed";
    }

    if (finalize && sessionTeamId && sessionAgeGroupId) {
      try {
        await createNotificationForTeamOnce(db, {
          teamId: sessionTeamId,
          ageGroupId: sessionAgeGroupId,
          actorId: user.id,
          type: "attendance_closed",
          entityId: sessionId,
          title: "Presenças confirmadas",
          body: `${session.session_date || ""}${session.start_time ? ` · ${session.start_time}` : ""}`,
          linkPath: "/attendance",
          excludeActor: true,
        });
      } catch (notificationError) {
        console.error(
          "Erro ao gerar notificação operacional de presenças confirmadas:",
          notificationError,
        );
      }
    }

    await captureServerProductEvent({
      distinctId: user.id,
      event: "attendance_marked",
      properties: {
        age_group_id: sessionAgeGroupId,
        team_id: sessionTeamId,
        training_session_id: sessionId,
        saved_count: entries.length,
        finalized: finalize,
        session_status: sessionStatus,
      },
    });

    return NextResponse.json({
      success: true,
      sessionId,
      attendanceTable: "training_attendance",
      savedCount: entries.length,
      sessionStatus,
    });
  } catch (error) {
    return respondInternalError("api.attendance.today.post", error, {
      request,
      userId,
      ageGroupId: sessionAgeGroupIdForError,
      teamId: sessionTeamIdForError,
      extra: {
        training_session_id: sessionIdForError,
      },
    });
  }
}
