import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
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
      .update({ read_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id)
      .select(
        "id, user_id, team_id, age_group_id, actor_id, type, entity_id, title, body, link_path, created_at, read_at",
      )
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: error.message || "Erro ao atualizar notificação." },
        { status: 500 },
      );
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
    const message = error instanceof Error ? error.message : "Erro interno.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
