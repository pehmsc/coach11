import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondInternalError } from "@/lib/http/respond-internal-error";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const admin = createAdminClient();

    // Resolver club_id + super_coordinator status em paralelo
    const [profileRes, membershipRes] = await Promise.all([
      admin.from("profiles").select("is_super_coordinator").eq("id", user.id).maybeSingle(),
      admin
        .from("club_memberships")
        .select("club_id")
        .eq("profile_id", user.id)
        .limit(1)
        .maybeSingle(),
    ]);

    const isSuperCoord = profileRes.data?.is_super_coordinator === true;
    const clubId = membershipRes.data?.club_id ?? null;

    if (!clubId && !isSuperCoord) {
      return NextResponse.json({ error: "Sem acesso ao clube." }, { status: 403 });
    }

    if (!clubId) {
      return NextResponse.json({ members: [] });
    }

    // Buscar todos os membros do clube via club_memberships
    const { data: memberships, error: membError } = await admin
      .from("club_memberships")
      .select("profile_id, role")
      .eq("club_id", clubId);

    if (membError) {
      return respondInternalError("api.club.members.get.memberships", membError);
    }

    if (!memberships?.length) {
      return NextResponse.json({ members: [] });
    }

    const profileIds = memberships.map((m) => m.profile_id);

    // Buscar perfis + escalões deste clube em paralelo
    const [profilesRes, ageGroupsRes] = await Promise.all([
      admin
        .from("profiles")
        .select("id, full_name, email, phone, avatar_url")
        .in("id", profileIds),
      admin
        .from("age_groups")
        .select("id, name, coordinator_id")
        .eq("club_id", clubId),
    ]);

    const profileMap = new Map((profilesRes.data ?? []).map((p) => [p.id, p]));

    // Mapear escalão por coordinator_id (um coordinator pode ter um escalão)
    const ageGroupByCoord = new Map(
      (ageGroupsRes.data ?? [])
        .filter((ag) => ag.coordinator_id != null)
        .map((ag) => [ag.coordinator_id as string, ag]),
    );

    const members = memberships.map((m) => {
      const p = profileMap.get(m.profile_id);
      const ag = ageGroupByCoord.get(m.profile_id);
      return {
        id: `club-member-${m.profile_id}`,
        profile_id: m.profile_id,
        role: m.role,
        full_name: p?.full_name ?? null,
        email: p?.email ?? null,
        phone: p?.phone ?? null,
        avatar_url: p?.avatar_url ?? null,
        is_coordinator: m.role === "club_coordinator",
        is_club_coordinator: m.role === "club_coordinator",
        age_group_name: ag?.name ?? null,
      };
    });

    return NextResponse.json({ members });
  } catch (error) {
    return respondInternalError("api.club.members.get", error);
  }
}
