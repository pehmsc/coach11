import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import {
  bulkApplyNotificationAction,
  listUserNotifications,
} from "@/lib/notifications/store";
import { z } from "zod";

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
    const { searchParams } = new URL(request.url);
    const limit = normalizeLimit(searchParams.get("limit"));
    const unreadOnly = searchParams.get("unreadOnly") === "true";
    const type = typeof searchParams.get("type") === "string"
      ? searchParams.get("type")
      : null;
    const { notifications, unreadCount } = await listUserNotifications(admin, {
      userId: user.id,
      limit,
      unreadOnly,
      type,
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

    const NotificationActionSchema = z.object({
      action: z.enum(["mark_all_read", "mark_all_unread", "delete_all", "clear_all"]).default("mark_all_read"),
      type: z.string().nullable().optional(),
      onlyRead: z.boolean().optional().default(false),
      onlyUnread: z.boolean().optional().default(false),
    });

    const rawBody = await request.json().catch(() => ({}));
    const parsed = NotificationActionSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    }
    const { action, type, onlyRead, onlyUnread } = parsed.data;

    if (action === "delete_all" || action === "clear_all") {
      const deleted = await bulkApplyNotificationAction(admin, {
        userId: user.id,
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
