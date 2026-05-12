import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveUserTeamContext } from "@/lib/auth/team-context";
import { respondInternalError } from "@/lib/http/respond-internal-error";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const VALID_STATUSES = new Set(["present", "absent", "injured", "late"]);
const VALID_SORTS = new Set(["date_desc", "date_asc"]);

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

function parseStatusFilter(value: string | null): string[] | null {
  if (!value) return null;
  const list = value
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => VALID_STATUSES.has(s));
  return list.length > 0 ? list : null;
}

function parseUtFilter(value: string | null): number | null {
  if (!value) return null;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseSort(value: string | null): "date_desc" | "date_asc" {
  if (value && VALID_SORTS.has(value)) {
    return value as "date_desc" | "date_asc";
  }
  return "date_desc";
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
    const statusFilter = parseStatusFilter(url.searchParams.get("status"));
    const utFilter = parseUtFilter(url.searchParams.get("ut"));
    const sort = parseSort(url.searchParams.get("sort"));

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

    let query = supabase
      .from("training_attendance")
      .select(
        `id, training_session_id, status, justification, marked_at,
         training_sessions:training_sessions!inner(
           id, session_date, start_time, end_time, title, status, focus, ut_number
         )`,
      )
      .eq("player_id", playerId)
      .eq("training_sessions.status", "completed");

    if (statusFilter) {
      query = query.in("status", statusFilter);
    }
    if (utFilter !== null) {
      query = query.eq("training_sessions.ut_number", utFilter);
    }

    // Top-level ORDER BY embedded column (PostgREST 11+ syntax).
    // `referencedTable: 'training_sessions'` apenas ordena dentro do embed
    // (no-op para m2o). `'training_sessions(session_date)'` ordena a query
    // pai pela coluna do embed.
    const { data, error } = await query
      .order("training_sessions(session_date)", {
        ascending: sort === "date_asc",
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
