import type { SupabaseClient } from "@supabase/supabase-js";

export type TeamMemberProfile = {
  profileId: string;
  role: string;
  staffLinkId: string | null;
  isCoordinator: boolean;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
};

type TeamRow = {
  id: string;
  age_group_id: string | null;
};

type AgeGroupRow = {
  id: string;
  coordinator_id: string | null;
};

type AgeGroupStaffRow = {
  id: string;
  profile_id: string;
  role: string | null;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
};

const ROLE_ORDER: Record<string, number> = {
  coordinator: 0,
  coach: 1,
  assistant_coach: 2,
  staff: 3,
};

export async function getTeamMemberProfileIds(
  admin: SupabaseClient,
  teamId: string,
) {
  const { data: team } = await admin
    .from("teams")
    .select("id, age_group_id")
    .eq("id", teamId)
    .maybeSingle();
  const teamRow = (team as TeamRow | null) || null;

  if (!teamRow?.id || !teamRow.age_group_id) {
    return {
      ageGroupId: null as string | null,
      coordinatorId: null as string | null,
      memberIds: [] as string[],
    };
  }

  const [ageGroupRes, staffRes] = await Promise.all([
    admin
      .from("age_groups")
      .select("id, coordinator_id")
      .eq("id", teamRow.age_group_id)
      .maybeSingle(),
    admin
      .from("age_group_staff")
      .select("profile_id")
      .eq("age_group_id", teamRow.age_group_id),
  ]);

  const ageGroup = (ageGroupRes.data as AgeGroupRow | null) || null;
  const coordinatorId = ageGroup?.coordinator_id ?? null;
  const staffIds = ((staffRes.data || []) as Array<{ profile_id: string | null }>)
    .map((row) => row.profile_id)
    .filter((value): value is string => typeof value === "string");

  const memberIds = Array.from(
    new Set([...(coordinatorId ? [coordinatorId] : []), ...staffIds]),
  );

  return {
    ageGroupId: teamRow.age_group_id,
    coordinatorId,
    memberIds,
  };
}

export async function getTeamMembersDetailed(
  admin: SupabaseClient,
  options: {
    teamId: string | null;
    ageGroupId: string | null;
  },
) {
  const { teamId, ageGroupId } = options;
  let resolvedAgeGroupId = ageGroupId;

  if (!resolvedAgeGroupId && teamId) {
    const { data: team } = await admin
      .from("teams")
      .select("age_group_id")
      .eq("id", teamId)
      .maybeSingle();

    resolvedAgeGroupId =
      team && typeof team.age_group_id === "string" ? team.age_group_id : null;
  }

  if (!resolvedAgeGroupId) {
    return {
      coordinatorId: null as string | null,
      members: [] as TeamMemberProfile[],
    };
  }

  const [ageGroupRes, staffRes] = await Promise.all([
    admin
      .from("age_groups")
      .select("id, coordinator_id")
      .eq("id", resolvedAgeGroupId)
      .maybeSingle(),
    admin
      .from("age_group_staff")
      .select("id, profile_id, role")
      .eq("age_group_id", resolvedAgeGroupId),
  ]);

  const ageGroup = (ageGroupRes.data as AgeGroupRow | null) || null;
  const coordinatorId = ageGroup?.coordinator_id ?? null;
  const staffRows = (staffRes.data || []) as AgeGroupStaffRow[];

  const ids = Array.from(
    new Set([
      ...(coordinatorId ? [coordinatorId] : []),
      ...staffRows.map((row) => row.profile_id),
    ]),
  );

  const profileRows =
    ids.length > 0
      ? (
          (
            await admin
              .from("profiles")
              .select("id, full_name, email, phone, avatar_url")
              .in("id", ids)
          ).data || []
        )
      : [];

  const profileMap = new Map(
    (profileRows as ProfileRow[]).map((row) => [row.id, row]),
  );
  const staffByProfileId = new Map(staffRows.map((row) => [row.profile_id, row]));

  const members = ids
    .map((profileId) => {
      const profile = profileMap.get(profileId);
      const staff = staffByProfileId.get(profileId);
      const isCoordinator = coordinatorId === profileId;
      const role = isCoordinator ? "coordinator" : (staff?.role || "staff");

      return {
        profileId,
        role,
        staffLinkId: staff?.id || null,
        isCoordinator,
        fullName: profile?.full_name || null,
        email: profile?.email || null,
        phone: profile?.phone || null,
        avatarUrl: profile?.avatar_url || null,
      } satisfies TeamMemberProfile;
    })
    .sort((a, b) => {
      const roleDelta =
        (ROLE_ORDER[a.role] ?? Number.MAX_SAFE_INTEGER) -
        (ROLE_ORDER[b.role] ?? Number.MAX_SAFE_INTEGER);
      if (roleDelta !== 0) return roleDelta;
      return (a.fullName || "").localeCompare(b.fullName || "", "pt");
    });

  return {
    coordinatorId,
    members,
  };
}
