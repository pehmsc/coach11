import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const { id: inviteId } = await params;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    if (!inviteId) {
      return NextResponse.json({ error: "Convite inválido." }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: invite, error: inviteError } = await admin
      .from("staff_invites")
      .select("id, age_group_id, accepted_by")
      .eq("id", inviteId)
      .maybeSingle();

    if (inviteError) {
      return NextResponse.json(
        { error: "Erro ao validar convite." },
        { status: 500 },
      );
    }

    if (!invite) {
      return NextResponse.json({ error: "Convite não encontrado." }, { status: 404 });
    }

    const { data: managedAgeGroup } = await admin
      .from("age_groups")
      .select("id")
      .eq("id", invite.age_group_id)
      .eq("coordinator_id", user.id)
      .maybeSingle();

    if (!managedAgeGroup) {
      return NextResponse.json(
        { error: "Apenas o coordenador pode gerir a equipa técnica." },
        { status: 403 },
      );
    }

    if (invite.accepted_by) {
      const { data: teams } = await admin
        .from("teams")
        .select("id")
        .eq("age_group_id", invite.age_group_id);

      const teamIds = (teams || []).map((team) => team.id);
      if (teamIds.length > 0) {
        await admin
          .from("team_staff")
          .delete()
          .in("team_id", teamIds)
          .eq("profile_id", invite.accepted_by);
      }
    }

    const { error: deleteInviteError } = await admin
      .from("staff_invites")
      .delete()
      .eq("id", invite.id);

    if (deleteInviteError) {
      return NextResponse.json(
        { error: "Erro ao remover convite." },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erro ao remover convite de staff:", error);
    const message =
      error instanceof Error ? error.message : "Erro interno ao remover convite.";

    return NextResponse.json(
      { error: message || "Erro interno ao remover convite." },
      { status: 500 },
    );
  }
}

