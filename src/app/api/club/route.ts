import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import { deleteAgeGroupCascade } from "@/lib/team/delete-age-group";

export const runtime = "nodejs";

const CLUB_EDITABLE_FIELDS = [
  "name",
  "morada",
  "telefone",
  "email_contacto",
  "website",
  "cor_primaria",
  "cor_secundaria",
  "distrito",
  "associacao",
] as const;

async function resolveClubAccess(userId: string) {
  const admin = createAdminClient();
  const [profileRes, membershipRes] = await Promise.all([
    admin.from("profiles").select("is_super_coordinator").eq("id", userId).maybeSingle(),
    admin
      .from("club_memberships")
      .select("club_id")
      .eq("profile_id", userId)
      .limit(1)
      .maybeSingle(),
  ]);
  return {
    admin,
    isSuperCoord: profileRes.data?.is_super_coordinator === true,
    clubId: membershipRes.data?.club_id ?? null,
  };
}

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const { admin, isSuperCoord, clubId } = await resolveClubAccess(user.id);

    if (!clubId && !isSuperCoord) {
      return NextResponse.json({ error: "Sem acesso ao clube." }, { status: 403 });
    }
    if (!clubId) {
      return NextResponse.json({ club: null });
    }

    const { data: club, error } = await admin
      .from("clubs")
      .select(
        "id, name, logo_url, slug, morada, telefone, email_contacto, website, cor_primaria, cor_secundaria, distrito, associacao",
      )
      .eq("id", clubId)
      .maybeSingle();

    if (error) return respondInternalError("api.club.get", error);

    return NextResponse.json({ club: club ?? null });
  } catch (error) {
    return respondInternalError("api.club.get", error);
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const { admin, isSuperCoord, clubId } = await resolveClubAccess(user.id);

    if (!clubId && !isSuperCoord) {
      return NextResponse.json({ error: "Sem permissões." }, { status: 403 });
    }
    if (!clubId) {
      return NextResponse.json({ error: "Clube não encontrado." }, { status: 404 });
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
    }

    const updates: Record<string, string | null> = {};
    for (const key of CLUB_EDITABLE_FIELDS) {
      if (key in body) {
        const val = body[key];
        updates[key] = typeof val === "string" ? val.trim() || null : null;
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nenhum campo para actualizar." }, { status: 400 });
    }

    const { error } = await admin.from("clubs").update(updates).eq("id", clubId);
    if (error) return respondInternalError("api.club.patch", error);

    return NextResponse.json({ success: true });
  } catch (error) {
    return respondInternalError("api.club.patch", error);
  }
}

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
