import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import {
  clearNotificationForUser,
  getUserNotification,
  setNotificationReadState,
} from "@/lib/notifications/store";

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

    const body = await request.json().catch(() => null);
    const action =
      typeof body?.action === "string" ? body.action : "mark_read";

    if (!["mark_read", "mark_unread"].includes(action)) {
      return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    }

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
