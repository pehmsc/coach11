import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { resolveUserTeamContext } from "@/lib/auth/team-context";

type NotificationRow = {
  id: string;
  user_id: string;
  team_id: string | null;
  age_group_id: string;
  actor_id: string | null;
  type: "new_game" | "new_training" | "message";
  entity_id: string | null;
  title: string;
  body: string | null;
  link_path: string | null;
  created_at: string;
  read_at: string | null;
};

function normalizeLimit(value: string | null) {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed)) return 30;
  return Math.max(10, Math.min(100, parsed));
}

function normalizeLinkPath(row: NotificationRow) {
  if (row.link_path && row.link_path.startsWith("/")) {
    return row.link_path;
  }
  if (row.type === "new_game" && row.entity_id) return `/games/${row.entity_id}`;
  if (row.type === "new_training") return "/calendar";
  return "/messages";
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const admin = createAdminClient();
    const context = await resolveUserTeamContext(admin, user.id);
    if (context.accessibleTeamIds.length === 0 || !context.ageGroup) {
      return NextResponse.json(
        {
          success: true,
          linked: false,
          notifications: [],
          unreadCount: 0,
          currentUserId: user.id,
        },
        {
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = normalizeLimit(searchParams.get("limit"));
    const unreadOnly = searchParams.get("unreadOnly") === "true";

    let listQuery = admin
      .from("notifications")
      .select(
        "id, user_id, team_id, age_group_id, actor_id, type, entity_id, title, body, link_path, created_at, read_at",
      )
      .eq("user_id", user.id)
      .in("team_id", context.accessibleTeamIds)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (unreadOnly) {
      listQuery = listQuery.is("read_at", null);
    }

    const [{ data: rows, error: listError }, unreadRes] = await Promise.all([
      listQuery,
      admin
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .in("team_id", context.accessibleTeamIds)
        .is("read_at", null),
    ]);

    if (listError) {
      return NextResponse.json(
        { error: listError.message || "Erro ao carregar notificações." },
        { status: 500 },
      );
    }

    const unreadCount = unreadRes.count ?? 0;
    const notifications = ((rows || []) as NotificationRow[]).map((row) => ({
      ...row,
      link_path: normalizeLinkPath(row),
    }));

    return NextResponse.json(
      {
        success: true,
        linked: true,
        currentUserId: user.id,
        notifications,
        unreadCount,
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
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const admin = createAdminClient();
    const context = await resolveUserTeamContext(admin, user.id);
    if (context.accessibleTeamIds.length === 0) {
      return NextResponse.json({ success: true, updated: 0 });
    }

    const body = await request.json().catch(() => null);
    const action = typeof body?.action === "string" ? body.action : "mark_all_read";
    const type = typeof body?.type === "string" ? body.type : null;

    if (action !== "mark_all_read") {
      return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    }

    let query = admin
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .in("team_id", context.accessibleTeamIds)
      .is("read_at", null);

    if (type) {
      query = query.eq("type", type);
    }

    const { data, error } = await query.select("id");
    if (error) {
      return NextResponse.json(
        { error: error.message || "Erro ao atualizar notificações." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      updated: (data || []).length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
