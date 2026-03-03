import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import { shouldShowPresencePrompt } from "@/lib/events/presence-window";

type AttendanceStatus = "present" | "absent" | "injured";

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
};

const VALID_STATUSES = new Set<AttendanceStatus>(["present", "absent", "injured"]);

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

      if (
        session &&
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
        });
      }

      return NextResponse.json(payload);
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

    const rpcRes = await supabase.rpc("rpc_attendance_today_save", {
      p_session_id: sessionId,
      p_attendance: attendancePayload,
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
