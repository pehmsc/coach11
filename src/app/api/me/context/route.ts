import { createClient } from "@/lib/supabase/server";
import { resolveUserTeamContext } from "@/lib/auth/team-context";
import { getTeamMembersDetailed } from "@/lib/team/members";
import { NextResponse } from "next/server";
import { PRIVATE_SWR_CACHE_CONTROL } from "@/lib/http/cache";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import { getAgeGroupTechnicalStaffUsage } from "@/lib/team/technical-staff-limit";

function normalizeKitRowForUi(row: Record<string, unknown>) {
  const playerType =
    typeof row.player_type === "string" && row.player_type === "field_player"
      ? "field"
      : row.player_type;
  const pieceType =
    typeof row.piece_type === "string" && row.piece_type === "jersey"
      ? "shirt"
      : row.piece_type;

  return {
    ...row,
    player_type: playerType,
    piece_type: pieceType,
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

    const db = supabase;

    const { data: profile } = await db
      .from("profiles")
      .select("id, full_name, role, email, phone, avatar_url, is_super_coordinator")
      .eq("id", user.id)
      .maybeSingle();
    const metadataAvatarUrl =
      typeof user.user_metadata?.avatar_url === "string"
        ? user.user_metadata.avatar_url
        : typeof user.user_metadata?.picture === "string"
          ? user.user_metadata.picture
          : null;
    const resolvedProfile =
      profile && typeof profile === "object"
        ? {
            ...profile,
            avatar_url:
              "avatar_url" in profile &&
              typeof profile.avatar_url === "string" &&
              profile.avatar_url.length > 0
                ? profile.avatar_url
                : metadataAvatarUrl,
          }
        : profile;

    const context = await resolveUserTeamContext(db, user.id);

    if (!context.ageGroup) {
      return NextResponse.json(
        {
          success: true,
          linked: false,
          source: context.source,
          teamId: context.teamId,
          teamRole: context.teamRole,
          canManageStaff: false,
          ageGroup: null,
          accessibleTeamIds: context.accessibleTeamIds,
          kits: [],
          staffMembers: [],
          activeStaffProfileIds: [],
          staffInvites: [],
          technicalStaffUsage: null,
          profile: resolvedProfile || null,
        },
        {
          headers: {
            "Cache-Control": PRIVATE_SWR_CACHE_CONTROL,
          },
        },
      );
    }

    const { data: ageGroupMeta } = await db
      .from("age_groups")
      .select("coordinator_id")
      .eq("id", context.ageGroup.id)
      .maybeSingle();
    const canManageStaff =
      ageGroupMeta?.coordinator_id === user.id ||
      resolvedProfile?.is_super_coordinator === true;

    const staffContext = context.teamId
      ? await getTeamMembersDetailed(db, {
          teamId: context.teamId,
          ageGroupId: context.ageGroup.id,
        })
      : { coordinatorId: null, members: [] };

    const [kitsRes, invitesRes, technicalStaffUsageRes] = await Promise.all([
      context.teamId
        ? db
            .from("kit_pieces")
            // Perf: campos específicos — exclui club_id, updated_at e outros
            // campos internos que a UI não consome directamente.
            .select("id, team_id, club_id, kit_number, player_type, piece_type, color_hex, color_name, image_url, created_at")
            .eq("team_id", context.teamId)
            .order("kit_number")
            .order("player_type")
            .order("piece_type")
        : Promise.resolve({ data: [], error: null }),
      canManageStaff
        ? db
            .from("staff_invites")
            .select("id, age_group_id, club_id, email, role, first_name, last_name, invite_code, invited_by, status, accepted_at, accepted_by, created_at")
            .eq("age_group_id", context.ageGroup.id)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      canManageStaff
        ? getAgeGroupTechnicalStaffUsage(db, context.ageGroup.id).catch(() => null)
        : Promise.resolve(null),
    ]);

    // Detectar quais membros são club_coordinators (para label correcto na UI)
    const clubCoordinatorProfileIds = new Set<string>();
    if (staffContext.members.length > 0) {
      const memberProfileIds = staffContext.members.map((m) => m.profileId);
      const { data: clubCoordRows } = await db
        .from("club_memberships")
        .select("profile_id")
        .in("profile_id", memberProfileIds)
        .eq("role", "club_coordinator");
      if (clubCoordRows) {
        for (const row of clubCoordRows as Array<{ profile_id: string }>) {
          clubCoordinatorProfileIds.add(row.profile_id);
        }
      }
    }

    const missingAvatarProfileIds = Array.from(
      new Set(
        staffContext.members
          .filter(
            (member) =>
              (!member.avatarUrl || member.avatarUrl.length === 0) &&
              member.profileId !== user.id,
          )
          .map((member) => member.profileId),
      ),
    );

    const authAvatarUrlByProfileId = new Map<string, string>();

    // Buscar avatares em falta via profiles (não auth.admin.getUserById).
    // Eliminado: N+1 getUserById que causou spinner infinito em produção (19/03).
    if (missingAvatarProfileIds.length > 0) {
      const { data: avatarProfiles } = await db
        .from("profiles")
        .select("id, avatar_url")
        .in("id", missingAvatarProfileIds.slice(0, 20));

      if (avatarProfiles) {
        for (const p of avatarProfiles) {
          if (typeof p.avatar_url === "string" && p.avatar_url.length > 0) {
            authAvatarUrlByProfileId.set(p.id, p.avatar_url);
          }
        }
      }
    }

    const staffMembers = staffContext.members.map((member) => ({
      id: member.staffLinkId || `coordinator-${member.profileId}`,
      profile_id: member.profileId,
      role: member.role,
      is_coordinator: member.isCoordinator,
      is_club_coordinator: clubCoordinatorProfileIds.has(member.profileId),
      full_name: member.fullName,
      email: member.email,
      phone: member.phone,
      avatar_url:
        member.avatarUrl ||
        (member.profileId === user.id
          ? metadataAvatarUrl
          : authAvatarUrlByProfileId.get(member.profileId) || null),
    }));
    const staffProfileIds = staffContext.members.map((member) => member.profileId);

    return NextResponse.json(
      {
        success: true,
        linked: true,
        source: context.source,
        teamId: context.teamId,
        teamRole: context.teamRole,
        canManageStaff,
        ageGroup: context.ageGroup,
        accessibleTeamIds: context.accessibleTeamIds,
        kits: ((kitsRes.data || []) as Record<string, unknown>[]).map((row) =>
          normalizeKitRowForUi(row),
        ),
        activeStaffProfileIds: staffProfileIds,
        staffMembers,
        staffInvites: invitesRes.data || [],
        technicalStaffUsage: technicalStaffUsageRes,
        profile: resolvedProfile || null,
      },
      {
        headers: {
          "Cache-Control": PRIVATE_SWR_CACHE_CONTROL,
        },
      },
    );
  } catch (error) {
    return respondInternalError("api.me.context.get", error);
  }
}
