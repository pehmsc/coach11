import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveUserTeamContext } from "@/lib/auth/team-context";
import { respondInternalError } from "@/lib/http/respond-internal-error";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function parseLimit(value: string | null): number {
  const n = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

function parseOffset(value: string | null): number {
  const n = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { id: playerId } = await params;
    if (!playerId) {
      return NextResponse.json({ error: "ID inválido." }, { status: 400 });
    }

    const url = new URL(request.url);
    const limit = parseLimit(url.searchParams.get("limit"));
    const offset = parseOffset(url.searchParams.get("offset"));

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }
    const context = await resolveUserTeamContext(supabase, user.id);

    const { data: player } = await supabase
      .from("players")
      .select("id, age_group_id")
      .eq("id", playerId)
      .maybeSingle();
    if (!player) {
      return NextResponse.json(
        { error: "Atleta não encontrado." },
        { status: 404 },
      );
    }
    if (!context.accessibleAgeGroupIds.includes(player.age_group_id)) {
      return NextResponse.json(
        { error: "Sem permissões para ver este atleta." },
        { status: 403 },
      );
    }

    const { data, error } = await supabase
      .from("training_attendance")
      .select(
        `id, training_session_id, status, justification, marked_at,
         training_sessions:training_sessions(
           id, session_date, start_time, end_time, title, status, focus
         )`,
      )
      .eq("player_id", playerId)
      .eq("training_sessions.status", "completed")
      .order("session_date", {
        referencedTable: "training_sessions",
        ascending: false,
      })
      .range(offset, offset + limit);

    if (error) {
      return respondInternalError("api.players.id.trainings.get", error);
    }

    const rows = data ?? [];
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    return NextResponse.json({ success: true, items, hasMore });
  } catch (error) {
    return respondInternalError("api.players.id.trainings.get", error);
  }
}
