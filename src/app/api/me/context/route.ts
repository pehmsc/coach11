import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveUserTeamContext } from "@/lib/auth/team-context";
import { getTeamMembersDetailed } from "@/lib/team/members";
import { NextResponse } from "next/server";
import { SHORT_PRIVATE_CACHE_CONTROL } from "@/lib/http/cache";
import { respondInternalError } from "@/lib/http/respond-internal-error";

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

    let db = supabase;
    try {
      db = createAdminClient();
    } catch {
      db = supabase;
    }

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
          profile: resolvedProfile || null,
        },
        {
          headers: {
            "Cache-Control": SHORT_PRIVATE_CACHE_CONTROL,
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

    const [kitsRes, invitesRes] = await Promise.all([
      context.teamId
        ? db
            .from("kit_pieces")
            .select("*")
            .eq("team_id", context.teamId)
            .order("kit_number")
            .order("player_type")
            .order("piece_type")
        : Promise.resolve({ data: [], error: null }),
      canManageStaff
        ? db
            .from("staff_invites")
            .select("*")
            .eq("age_group_id", context.ageGroup.id)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);

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

    if (missingAvatarProfileIds.length > 0) {
      const authUsers = await Promise.allSettled(
        missingAvatarProfileIds.map(async (profileId) => {
          const { data, error } = await db.auth.admin.getUserById(profileId);
          if (error || !data.user) {
            return {
              profileId,
              avatarUrl: null as string | null,
            };
          }

          const metadata = (data.user.user_metadata ?? {}) as Record<string, unknown>;
          const avatarUrl =
            (typeof metadata.avatar_url === "string" && metadata.avatar_url) ||
            (typeof metadata.picture === "string" && metadata.picture) ||
            null;

          return {
            profileId,
            avatarUrl,
          };
        }),
      );

      for (const result of authUsers) {
        if (result.status !== "fulfilled" || !result.value.avatarUrl) {
          continue;
        }

        authAvatarUrlByProfileId.set(result.value.profileId, result.value.avatarUrl);
      }
    }

    const staffMembers = staffContext.members.map((member) => ({
      id: member.teamStaffId || `coordinator-${member.profileId}`,
      profile_id: member.profileId,
      role: member.role,
      is_coordinator: member.isCoordinator,
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
        profile: resolvedProfile || null,
      },
      {
        headers: {
          "Cache-Control": SHORT_PRIVATE_CACHE_CONTROL,
        },
      },
    );
  } catch (error) {
    return respondInternalError("api.me.context.get", error);
  }
}
