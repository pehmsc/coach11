import type { SupabaseClient } from "@supabase/supabase-js";

export type TeamContextAgeGroup = {
  id: string;
  club_name: string;
  name: string;
  football_format: string | null;
};

export type TeamContextTeam = {
  id: string;
  age_group_id: string | null;
};

type StaffLinkRow = {
  team_id: string | null;
  role: string | null;
};

export type UserTeamContext = {
  source: "coordinator" | "staff" | "none";
  teamId: string | null;
  teamRole: string | null;
  ageGroup: TeamContextAgeGroup | null;
  accessibleTeamIds: string[];
  accessibleAgeGroupIds: string[];
  managedTeamIds: string[];
  staffTeamIds: string[];
  accessibleTeams: TeamContextTeam[];
};

async function pickPreferredTeamId(
  admin: SupabaseClient,
  teamIds: string[],
) {
  if (teamIds.length === 0) return null;

  const { data: latestGame } = await admin
    .from("games")
    .select("team_id")
    .in("team_id", teamIds)
    .order("game_datetime", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestGame?.team_id && teamIds.includes(latestGame.team_id)) {
    return latestGame.team_id;
  }

  const { data: latestCompetition } = await admin
    .from("competitions")
    .select("team_id")
    .in("team_id", teamIds)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestCompetition?.team_id && teamIds.includes(latestCompetition.team_id)) {
    return latestCompetition.team_id;
  }

  return teamIds[0] ?? null;
}

export async function resolveUserTeamContext(
  admin: SupabaseClient,
  userId: string,
): Promise<UserTeamContext> {
  const [managedAgeGroupsRes, staffLinksRes] = await Promise.all([
    admin
      .from("age_groups")
      .select("id, club_name, name, football_format")
      .eq("coordinator_id", userId)
      .order("created_at", { ascending: true })
      .limit(20),
    admin
      .from("team_staff")
      .select("team_id, role, created_at")
      .eq("profile_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  if (managedAgeGroupsRes.error) {
    throw new Error(`Erro ao carregar escalões geridos: ${managedAgeGroupsRes.error.message}`);
  }
  if (staffLinksRes.error) {
    throw new Error(`Erro ao carregar equipas técnicas: ${staffLinksRes.error.message}`);
  }

  const managedAgeGroups = (managedAgeGroupsRes.data || []) as TeamContextAgeGroup[];
  const managedAgeGroupMap = new Map(managedAgeGroups.map((row) => [row.id, row]));
  const managedAgeGroupIds = managedAgeGroups.map((row) => row.id);

  const staffLinks = (staffLinksRes.data || []) as StaffLinkRow[];
  const orderedStaffTeamIds = Array.from(
    new Set(
      staffLinks
        .map((row) => row.team_id)
        .filter((value): value is string => typeof value === "string"),
    ),
  );

  let managedTeams: TeamContextTeam[] = [];
  if (managedAgeGroupIds.length > 0) {
    const managedTeamsRes = await admin
      .from("teams")
      .select("id, age_group_id")
      .in("age_group_id", managedAgeGroupIds)
      .order("created_at", { ascending: true })
      .limit(200);
    if (managedTeamsRes.error) {
      throw new Error(`Erro ao carregar equipas do coordenador: ${managedTeamsRes.error.message}`);
    }
    managedTeams = (managedTeamsRes.data || []) as TeamContextTeam[];
  }

  let staffTeams: TeamContextTeam[] = [];
  if (orderedStaffTeamIds.length > 0) {
    const staffTeamsRes = await admin
      .from("teams")
      .select("id, age_group_id")
      .in("id", orderedStaffTeamIds);
    if (staffTeamsRes.error) {
      throw new Error(`Erro ao carregar equipas do staff: ${staffTeamsRes.error.message}`);
    }
    staffTeams = (staffTeamsRes.data || []) as TeamContextTeam[];
  }

  const managedTeamIds = managedTeams
    .map((row) => row.id)
    .filter((value): value is string => typeof value === "string");
  const staffTeamIds = orderedStaffTeamIds;

  const teamMap = new Map<string, TeamContextTeam>();
  [...managedTeams, ...staffTeams].forEach((row) => {
    if (typeof row.id === "string") {
      teamMap.set(row.id, row);
    }
  });

  const staffAgeGroupIds = staffTeams
    .map((row) => row.age_group_id)
    .filter((value): value is string => typeof value === "string");
  const missingAgeGroupIds = staffAgeGroupIds.filter((id) => !managedAgeGroupMap.has(id));
  if (missingAgeGroupIds.length > 0) {
    const missingAgeGroupsRes = await admin
      .from("age_groups")
      .select("id, club_name, name, football_format")
      .in("id", missingAgeGroupIds);
    if (missingAgeGroupsRes.error) {
      throw new Error(`Erro ao carregar escalões do staff: ${missingAgeGroupsRes.error.message}`);
    }
    ((missingAgeGroupsRes.data || []) as TeamContextAgeGroup[]).forEach((row) => {
      managedAgeGroupMap.set(row.id, row);
    });
  }

  const accessibleTeamIds = Array.from(
    new Set([...(managedTeamIds || []), ...(staffTeamIds || [])]),
  );
  const accessibleAgeGroupIds = Array.from(
    new Set(
      [...managedAgeGroupMap.keys()].filter((value): value is string => typeof value === "string"),
    ),
  );
  const accessibleTeams = accessibleTeamIds
    .map((teamId) => teamMap.get(teamId))
    .filter((team): team is TeamContextTeam => !!team);

  if (managedAgeGroups.length > 0) {
    const preferredManagedTeamId = await pickPreferredTeamId(admin, managedTeamIds);
    const resolvedTeam =
      (preferredManagedTeamId ? teamMap.get(preferredManagedTeamId) : null) ||
      managedTeams[0] ||
      null;
    const resolvedAgeGroup =
      (resolvedTeam?.age_group_id
        ? managedAgeGroupMap.get(resolvedTeam.age_group_id)
        : null) ||
      managedAgeGroups[0] ||
      null;

    return {
      source: "coordinator",
      teamId: resolvedTeam?.id ?? null,
      teamRole: "coordinator",
      ageGroup: resolvedAgeGroup,
      accessibleTeamIds,
      accessibleAgeGroupIds,
      managedTeamIds,
      staffTeamIds,
      accessibleTeams,
    };
  }

  if (orderedStaffTeamIds.length > 0) {
    const preferredStaffTeamId = await pickPreferredTeamId(admin, orderedStaffTeamIds);
    const candidateTeamIds = [
      ...(preferredStaffTeamId ? [preferredStaffTeamId] : []),
      ...orderedStaffTeamIds.filter((id) => id !== preferredStaffTeamId),
    ];

    let resolvedTeam: TeamContextTeam | null = null;
    let resolvedAgeGroup: TeamContextAgeGroup | null = null;
    for (const teamId of candidateTeamIds) {
      const teamRow = teamMap.get(teamId);
      if (!teamRow) continue;
      const ageGroupRow =
        teamRow.age_group_id && managedAgeGroupMap.has(teamRow.age_group_id)
          ? managedAgeGroupMap.get(teamRow.age_group_id) || null
          : null;
      if (!ageGroupRow) continue;
      resolvedTeam = teamRow;
      resolvedAgeGroup = ageGroupRow;
      break;
    }

    if (!resolvedTeam) {
      resolvedTeam = teamMap.get(candidateTeamIds[0] || "") || null;
    }

    const resolvedRole =
      staffLinks.find((row) => row.team_id === resolvedTeam?.id)?.role ?? null;

    return {
      source: "staff",
      teamId: resolvedTeam?.id ?? null,
      teamRole: typeof resolvedRole === "string" ? resolvedRole : null,
      ageGroup: resolvedAgeGroup,
      accessibleTeamIds,
      accessibleAgeGroupIds,
      managedTeamIds,
      staffTeamIds,
      accessibleTeams,
    };
  }

  return {
    source: "none",
    teamId: null,
    teamRole: null,
    ageGroup: null,
    accessibleTeamIds: [],
    accessibleAgeGroupIds: [],
    managedTeamIds: [],
    staffTeamIds: [],
    accessibleTeams: [],
  };
}
