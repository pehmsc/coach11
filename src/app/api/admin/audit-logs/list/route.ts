import { NextResponse } from "next/server";
import { getSuperUserAccess } from "@/lib/auth/super-user.server";
import { respondInternalError } from "@/lib/http/respond-internal-error";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const access = await getSuperUserAccess();
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const action = new URL(request.url).searchParams.get("action");
    let query = access.admin
      .from("audit_logs")
      .select("id, actor_id, action, game_id, payload, created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (action && action !== "all") {
      query = query.eq("action", action);
    }

    const { data: logs, error } = await query;

    if (error) {
      return NextResponse.json(
        { error: "Não foi possível carregar os logs de auditoria." },
        { status: 500 },
      );
    }

    const actorIds = Array.from(
      new Set((logs || []).map((row) => row.actor_id).filter(Boolean)),
    );

    const { data: actors, error: actorsError } = actorIds.length > 0
      ? await access.admin
          .from("profiles")
          .select("id, full_name, email")
          .in("id", actorIds)
      : { data: [], error: null };

    if (actorsError) {
      return NextResponse.json(
        { error: "Não foi possível enriquecer os logs de auditoria." },
        { status: 500 },
      );
    }

    const actorById = new Map((actors || []).map((row) => [row.id, row]));

    return NextResponse.json({
      success: true,
      logs: (logs || []).map((log) => ({
        ...log,
        actor: log.actor_id ? actorById.get(log.actor_id) || null : null,
      })),
    });
  } catch (error) {
    return respondInternalError("api.admin.audit-logs.list.get", error);
  }
}
