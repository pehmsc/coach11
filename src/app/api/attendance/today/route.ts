import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import {
  getPresencePromptState,
  shouldShowPresencePrompt,
} from "@/lib/events/presence-window";

type AttendanceStatus = "present" | "late" | "absent" | "injured";

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

type AttendanceSavePayload = {
  ok?: boolean;
  error_code?: string;
  sessionId?: string;
  attendanceTable?: string;
  savedCount?: number;
  sessionStatus?: string | null;
};

const VALID_STATUSES = new Set<AttendanceStatus>(["present", "late", "absent", "injured"]);

function isValidStatus(value: unknown): value is AttendanceStatus {
  return typeof value === "string" && VALID_STATUSES.has(value as AttendanceStatus);
}

function normalizeDateParam(raw: string | null): string {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return new Date().toISOString().slice(0, 10);
}

function toValidatedAttendance(input: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(input).filter(
      ([playerId, status]) => typeof playerId === "string" && isValidStatus(status),
    ),
  ) as Record<string, AttendanceStatus>;
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

    const date = normalizeDateParam(new URL(request.url).searchParams.get("date"));
    const rpcRes = await supabase.rpc("rpc_attendance_today_get", {
      p_date: date,
    });

    if (rpcRes.error) {
      return NextResponse.json(
        { error: "Erro ao carregar sessão de treino do dia." },
        { status: 500 },
      );
    }

    const payload = (rpcRes.data || null) as AttendanceGetPayload | null;
    if (payload?.ok === false && payload.error_code === "not_authenticated") {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
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
        return NextResponse.json({
          ...payload,
          noSession: true,
          session: null,
          presencePromptState: "hidden",
        });
      }

      return NextResponse.json({
        ...payload,
        presencePromptState,
      });
    }

    return NextResponse.json(
      { error: "Erro ao carregar sessão de treino do dia." },
      { status: 500 },
    );
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
    const finalize =
      body && typeof body === "object" && typeof body.finalize === "boolean"
        ? body.finalize
        : false;

    if (!sessionId || !attendanceInput) {
      return NextResponse.json(
        { error: "Dados inválidos para guardar presenças." },
        { status: 400 },
      );
    }

    const attendancePayload = toValidatedAttendance(attendanceInput);
    const entries = Object.entries(attendancePayload);
    if (entries.length === 0) {
      return NextResponse.json(
        { error: "Sem presenças válidas para guardar." },
        { status: 400 },
      );
    }

    const { data: sessionRow, error: sessionError } = await supabase
      .from("training_sessions")
      .select("id, session_date, start_time, end_time, status")
      .eq("id", sessionId)
      .maybeSingle();

    if (sessionError) {
      return NextResponse.json(
        { error: "Erro ao validar a sessão de treino." },
        { status: 500 },
      );
    }

    const session =
      sessionRow && typeof sessionRow === "object"
        ? (sessionRow as AttendanceGetSession)
        : null;

    if (!session?.id) {
      return NextResponse.json({ error: "Sessão não encontrada." }, { status: 404 });
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

    const rpcRes = await supabase.rpc("rpc_attendance_today_save", {
      p_session_id: sessionId,
      p_attendance: attendancePayload,
      p_finalize: finalize,
    });
    if (rpcRes.error) {
      return NextResponse.json(
        { error: "Erro ao guardar presenças na base de dados." },
        { status: 500 },
      );
    }

    const payload = (rpcRes.data || null) as AttendanceSavePayload | null;
    if (payload?.ok) {
      return NextResponse.json({
        success: true,
        sessionId: payload.sessionId || sessionId,
        attendanceTable: payload.attendanceTable || "training_attendance",
        savedCount: payload.savedCount ?? entries.length,
        sessionStatus:
          typeof payload.sessionStatus === "string"
            ? payload.sessionStatus
            : finalize
              ? "completed"
              : session.status ?? "scheduled",
      });
    }

    switch (payload?.error_code) {
      case "not_authenticated":
        return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
      case "invalid_payload":
        return NextResponse.json(
          { error: "Dados inválidos para guardar presenças." },
          { status: 400 },
        );
      case "session_not_found":
        return NextResponse.json({ error: "Sessão não encontrada." }, { status: 404 });
      case "forbidden":
        return NextResponse.json(
          { error: "Sem permissões para marcar presenças nesta sessão." },
          { status: 403 },
        );
      case "closed_requires_coordinator":
        return NextResponse.json(
          { error: "Só o coordenador pode corrigir presenças depois de fechar o treino." },
          { status: 403 },
        );
      case "finalize_before_end":
        return NextResponse.json(
          { error: "O treino ainda não chegou à hora de confirmação e fecho." },
          { status: 409 },
        );
      case "no_valid_entries":
        return NextResponse.json(
          { error: "Sem presenças válidas para guardar." },
          { status: 400 },
        );
      case "invalid_players":
        return NextResponse.json(
          { error: "Existem jogadores inválidos para esta sessão de treino." },
          { status: 400 },
        );
      default:
        return NextResponse.json(
          { error: "Erro ao guardar presenças na base de dados." },
          { status: 500 },
        );
    }
  } catch (error) {
    return respondInternalError("api.attendance.today.post", error);
  }
}
