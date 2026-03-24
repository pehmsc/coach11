import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondInternalError } from "@/lib/http/respond-internal-error";

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
      .select("id, age_group_id, club_id, accepted_by")
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

    // Verificar autorização: age_group coordinator OU club_coordinator do mesmo clube
    let authorized = false;

    if (invite.age_group_id) {
      const { data: managedAgeGroup } = await admin
        .from("age_groups")
        .select("id")
        .eq("id", invite.age_group_id)
        .eq("coordinator_id", user.id)
        .maybeSingle();
      if (managedAgeGroup) authorized = true;
    }

    if (!authorized && invite.club_id) {
      const { data: clubMembership } = await admin
        .from("club_memberships")
        .select("role")
        .eq("profile_id", user.id)
        .eq("club_id", invite.club_id)
        .in("role", ["coordinator", "club_coordinator", "owner", "admin"])
        .maybeSingle();
      if (clubMembership) authorized = true;
    }

    if (!authorized) {
      return NextResponse.json(
        { error: "Apenas o coordenador pode gerir a equipa técnica." },
        { status: 403 },
      );
    }

    if (invite.accepted_by && invite.age_group_id) {
      await admin
        .from("age_group_staff")
        .delete()
        .eq("age_group_id", invite.age_group_id)
        .eq("profile_id", invite.accepted_by);
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
    return respondInternalError("api.invite.staff.id.delete", error);
  }
}
