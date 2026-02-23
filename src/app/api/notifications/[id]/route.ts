import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { respondInternalError } from "@/lib/http/respond-internal-error";

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

    const body = await request.json().catch(() => null);
    const action =
      typeof body?.action === "string" ? body.action : "mark_read";

    if (!["mark_read", "mark_unread"].includes(action)) {
      return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    }

    const admin = createAdminClient();
    const readAtValue = action === "mark_read" ? new Date().toISOString() : null;
    const { data, error } = await admin
      .from("notifications")
      .update({ read_at: readAtValue })
      .eq("id", id)
      .eq("user_id", user.id)
      .select(
        "id, user_id, team_id, age_group_id, actor_id, type, entity_id, title, body, link_path, created_at, read_at",
      )
      .maybeSingle();

    if (error) {
      return respondInternalError("api.notifications.id.patch.update", error);
    }
    if (!data) {
      return NextResponse.json(
        { error: "Notificação não encontrada." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      notification: data,
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
    const { data, error } = await admin
      .from("notifications")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();

    if (error) {
      return respondInternalError("api.notifications.id.delete.remove", error);
    }
    if (!data?.id) {
      return NextResponse.json(
        { error: "Notificação não encontrada." },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, id: data.id });
  } catch (error) {
    return respondInternalError("api.notifications.id.delete", error);
  }
}
