import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveUserTeamContext } from "@/lib/auth/team-context";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import {
  bulkApplyNotificationAction,
  listUserNotifications,
} from "@/lib/notifications/store";

function normalizeLimit(value: string | null) {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed)) return 30;
  return Math.max(10, Math.min(100, parsed));
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
    const { notifications, unreadCount } = await listUserNotifications(admin, {
      userId: user.id,
      context,
      limit,
      unreadOnly,
    });

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
    return respondInternalError("api.notifications.get", error);
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

    if (!["mark_all_read", "mark_all_unread", "delete_all", "clear_all"].includes(action)) {
      return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    }

    if (action === "delete_all" || action === "clear_all") {
      const deleted = await bulkApplyNotificationAction(admin, {
        userId: user.id,
        teamIds: context.accessibleTeamIds,
        ageGroupIds: context.accessibleAgeGroupIds,
        type,
        onlyRead,
        onlyUnread,
        action: "clear",
      });
      return NextResponse.json({
        success: true,
        deleted,
      });
    }

    const updated = await bulkApplyNotificationAction(admin, {
      userId: user.id,
      teamIds: context.accessibleTeamIds,
      ageGroupIds: context.accessibleAgeGroupIds,
      type,
      onlyRead,
      onlyUnread,
      action: action === "mark_all_read" ? "mark_read" : "mark_unread",
    });

    return NextResponse.json({
      success: true,
      updated,
    });
  } catch (error) {
    return respondInternalError("api.notifications.post", error);
  }
}
