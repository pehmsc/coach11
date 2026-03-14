import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import { parseBody } from "@/lib/http/validate";
import {
  clearNotificationForUser,
  getUserNotification,
  setNotificationReadState,
} from "@/lib/notifications/store";

const NotificationPatchSchema = z.object({
  action: z.enum(["mark_read", "mark_unread"]).default("mark_read"),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { error: "Identificador da notificação em falta." },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const admin = createAdminClient();

    const parsed = await parseBody(request, NotificationPatchSchema);
    if (parsed.error) return parsed.error;
    const { action } = parsed.data;

    const updatedId = await setNotificationReadState(admin, {
      userId: user.id,
      notificationId: id,
      readAt: action === "mark_read" ? new Date().toISOString() : null,
    });
    if (!updatedId) {
      return NextResponse.json(
        { error: "Notificação não encontrada." },
        { status: 404 },
      );
    }

    const notification = await getUserNotification(admin, {
      userId: user.id,
      notificationId: id,
    });
    if (!notification) {
      return NextResponse.json(
        { error: "Notificação não encontrada." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      notification,
    });
  } catch (error) {
    return respondInternalError("api.notifications.id.patch", error);
  }
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { error: "Identificador da notificação em falta." },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const admin = createAdminClient();
    const clearedId = await clearNotificationForUser(admin, {
      userId: user.id,
      notificationId: id,
      clearedAt: new Date().toISOString(),
    });

    if (!clearedId) {
      return NextResponse.json(
        { error: "Notificação não encontrada." },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, id: clearedId });
  } catch (error) {
    return respondInternalError("api.notifications.id.delete", error);
  }
}
