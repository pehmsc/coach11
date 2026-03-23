import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import { deleteAgeGroupCascade } from "@/lib/team/delete-age-group";

export const runtime = "nodejs";

type DeleteClubPayload = {
  confirmation?: string;
};

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as DeleteClubPayload | null;
    if (!body?.confirmation || typeof body.confirmation !== "string" || body.confirmation.trim().length < 2) {
      return NextResponse.json(
        { error: "Confirmação inválida. Escreve o nome do clube para confirmar." },
        { status: 400 },
      );
    }

    // Verificar que o utilizador é club_coordinator ou super_coordinator
    const { data: profile } = await admin
      .from("profiles")
      .select("is_super_coordinator")
      .eq("id", user.id)
      .maybeSingle();

    const isSuperCoordinator = profile?.is_super_coordinator === true;

    const { data: clubMembership } = await admin
      .from("club_memberships")
      .select("club_id")
      .eq("profile_id", user.id)
      .eq("role", "club_coordinator")
      .limit(1)
      .maybeSingle();

    if (!isSuperCoordinator && !clubMembership?.club_id) {
      return NextResponse.json(
        { error: "Apenas o coordenador de clube pode apagar todos os dados do clube." },
        { status: 403 },
      );
    }

    const clubId = clubMembership?.club_id ?? null;
    if (!clubId) {
      return NextResponse.json(
        { error: "Clube não encontrado para este utilizador." },
        { status: 404 },
      );
    }

    // Obter todos os escalões do clube
    const { data: ageGroups, error: ageGroupsError } = await admin
      .from("age_groups")
      .select("id, name, club_name, club_id")
      .eq("club_id", clubId)
      .order("created_at", { ascending: true });

    if (ageGroupsError) {
      return respondInternalError("api.club.delete.fetch-age-groups", ageGroupsError);
    }

    const groups = ageGroups || [];

    if (groups.length === 0) {
      return NextResponse.json(
        { error: "Nenhum escalão encontrado para este clube." },
        { status: 404 },
      );
    }

    // Verificar confirmação com o nome do clube
    const clubName = typeof groups[0]?.club_name === "string" ? groups[0].club_name : "";
    const confirmed = body.confirmation.trim().toLowerCase() === clubName.trim().toLowerCase();
    if (!confirmed) {
      return NextResponse.json(
        { error: "O nome do clube não coincide. Operação cancelada." },
        { status: 400 },
      );
    }

    // Apagar todos os escalões em cascata
    for (const group of groups) {
      if (typeof group.id === "string") {
        await deleteAgeGroupCascade(admin, group.id, {
          retainClubMembershipProfileIds: [],
        });
      }
    }

    // Apagar as club_memberships do clube
    await admin
      .from("club_memberships")
      .delete()
      .eq("club_id", clubId);

    return NextResponse.json({
      success: true,
      deletedAgeGroupCount: groups.length,
    });
  } catch (error) {
    return respondInternalError("api.club.delete", error);
  }
}
