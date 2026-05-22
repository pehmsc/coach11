import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondInternalError } from "@/lib/http/respond-internal-error";

export const runtime = "nodejs";

// Roles in club_memberships that represent a club-level coordinator
// (mirrors resolveUserTeamContext logic)
const CLUB_COORDINATOR_ROLES = new Set(["club_coordinator", "owner", "admin"]);

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

    // Buscar perfis, escalões, ligações de staff e TODOS os convites do clube em paralelo.
    // Os convites incluem pendentes, aceites com user vivo e "orfaos" (aceites cujo
    // accepted_by ja nao existe em auth.users) para a gestao de convites na pagina do clube.
    const [profilesRes, ageGroupsRes, ageGroupStaffRes, invitesRes] = await Promise.all([
      admin
        .from("profiles")
        .select("id, full_name, email, phone, avatar_url")
        .in("id", profileIds),
      admin
        .from("age_groups")
        .select("id, name, coordinator_id")
        .eq("club_id", clubId),
      admin
        .from("age_group_staff")
        .select("profile_id, age_group_id, role")
        .in("profile_id", profileIds)
        .eq("club_id", clubId),
      admin
        .from("staff_invites")
        .select(
          "id, first_name, last_name, email, role, invite_code, created_at, invite_sent_at, accepted_at, accepted_by, age_group_id",
        )
        .eq("club_id", clubId)
        .order("created_at", { ascending: false }),
    ]);

    const profileMap = new Map((profilesRes.data ?? []).map((p) => [p.id, p]));

    // age_group_id → name lookup
    const ageGroupIdToName = new Map(
      (ageGroupsRes.data ?? []).map((ag) => [ag.id, ag.name]),
    );

    // coordinator_id → age_group_name (for age_group coordinators)
    const ageGroupByCoord = new Map(
      (ageGroupsRes.data ?? [])
        .filter((ag) => ag.coordinator_id != null)
        .map((ag) => [ag.coordinator_id as string, ag.name]),
    );

    // profile_id → age_group_name (via age_group_staff)
    const ageGroupByStaff = new Map(
      (ageGroupStaffRes.data ?? [])
        .filter((s) => s.age_group_id != null)
        .map((s) => [s.profile_id, ageGroupIdToName.get(s.age_group_id!) ?? null]),
    );

    // profile_id → age_group_staff.role (prefere age_group_coordinator sobre outros)
    const staffRoleByProfile = new Map<string, string>();
    for (const s of ageGroupStaffRes.data ?? []) {
      if (!s.role) continue;
      const existing = staffRoleByProfile.get(s.profile_id);
      if (!existing || s.role === "age_group_coordinator") {
        staffRoleByProfile.set(s.profile_id, s.role);
      }
    }

    const members = memberships.map((m) => {
      const p = profileMap.get(m.profile_id);
      const isClubCoord = CLUB_COORDINATOR_ROLES.has(m.role);
      const ageGroupName = isClubCoord
        ? null
        : (ageGroupByCoord.get(m.profile_id) ?? ageGroupByStaff.get(m.profile_id) ?? null);
      // Para membros não-coordenadores de clube, usar o role de age_group_staff (mais específico)
      const displayRole = isClubCoord ? m.role : (staffRoleByProfile.get(m.profile_id) ?? m.role);

      return {
        id: `club-member-${m.profile_id}`,
        profile_id: m.profile_id,
        role: displayRole,
        full_name: p?.full_name ?? null,
        email: p?.email ?? null,
        phone: p?.phone ?? null,
        avatar_url: p?.avatar_url ?? null,
        is_coordinator: isClubCoord,
        is_club_coordinator: isClubCoord,
        age_group_name: ageGroupName,
      };
    });

    // Estado deriva-se de accepted_at + accepted_by.
    // accepted_by passa a NULL automaticamente quando o auth.user e apagado
    // (FK ON DELETE SET NULL, migration 20260522222107) — esse e o sinal de "orfao".
    const invites = (invitesRes.data ?? []).map((inv) => {
      const hasLiveUser = inv.accepted_by != null;
      let status: "pending" | "accepted" | "orphan";
      if (!inv.accepted_at) {
        status = "pending";
      } else if (hasLiveUser) {
        status = "accepted";
      } else {
        status = "orphan";
      }
      return {
        id: inv.id,
        first_name: inv.first_name,
        last_name: inv.last_name,
        email: inv.email,
        role: inv.role,
        invite_code: inv.invite_code,
        created_at: inv.created_at,
        invite_sent_at: inv.invite_sent_at,
        accepted_at: inv.accepted_at,
        status,
        has_live_user: hasLiveUser,
        age_group_name: inv.age_group_id ? (ageGroupIdToName.get(inv.age_group_id) ?? null) : null,
      };
    });

    return NextResponse.json({ members, invites });
  } catch (error) {
    return respondInternalError("api.club.members.get", error);
  }
}
