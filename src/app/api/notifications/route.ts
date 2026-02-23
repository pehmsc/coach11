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
      return NextResponse.json({ success: true, updated: 0, deleted: 0 });
    }

    const body = await request.json().catch(() => null);
    const action =
      typeof body?.action === "string" ? body.action : "mark_all_read";
    const type = typeof body?.type === "string" ? body.type : null;
    const onlyRead = body?.onlyRead === true;
    const onlyUnread = body?.onlyUnread === true;

    if (!["mark_all_read", "mark_all_unread", "delete_all"].includes(action)) {
      return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    }

    if (action === "delete_all") {
      let deleteQuery = admin
        .from("notifications")
        .delete()
        .eq("user_id", user.id)
        .in("team_id", context.accessibleTeamIds);

      if (type) {
        deleteQuery = deleteQuery.eq("type", type);
      }
      if (onlyRead) {
        deleteQuery = deleteQuery.not("read_at", "is", null);
      }
      if (onlyUnread) {
        deleteQuery = deleteQuery.is("read_at", null);
      }

      const { data, error } = await deleteQuery.select("id");
      if (error) {
        return NextResponse.json(
          { error: error.message || "Erro ao limpar notificações." },
          { status: 500 },
        );
      }

      return NextResponse.json({
        success: true,
        deleted: (data || []).length,
      });
    }

    const readAtValue =
      action === "mark_all_read" ? new Date().toISOString() : null;
    let updateQuery = admin
      .from("notifications")
      .update({ read_at: readAtValue })
      .eq("user_id", user.id)
      .in("team_id", context.accessibleTeamIds);

    if (action === "mark_all_read") {
      updateQuery = updateQuery.is("read_at", null);
    } else {
      updateQuery = updateQuery.not("read_at", "is", null);
    }
    if (type) {
      updateQuery = updateQuery.eq("type", type);
    }

    const { data, error } = await updateQuery.select("id");
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
