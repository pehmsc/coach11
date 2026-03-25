import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

export type TeamContextClub = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
};

export type TeamContextAgeGroup = {
  id: string;
  club_name: string;
  club_short_name?: string | null;
  club_logo_url?: string | null;
  name: string;
  football_format: string | null;
  tactical_system?: string | null;
  season?: string | null;
};

export type TeamContextTeam = {
  id: string;
  age_group_id: string | null;
};

type StaffLinkRow = {
  age_group_id: string | null;
  linked_team_id: string | null;
  role: string | null;
};

export type UserTeamContext = {
  source: "club_coordinator" | "coordinator" | "staff" | "none";
  teamId: string | null;
  teamRole: string | null;
  ageGroup: TeamContextAgeGroup | null;
  accessibleTeamIds: string[];
  accessibleAgeGroupIds: string[];
  managedTeamIds: string[];
  staffTeamIds: string[];
  accessibleTeams: TeamContextTeam[];
  /** Clube principal do utilizador (resolvido via club_memberships ou age_group.club_id). */
  club: TeamContextClub | null;
  /** Role do utilizador no contexto de clube. */
  clubRole: "club_coordinator" | "age_coordinator" | "staff" | null;
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
  const [managedAgeGroupsRes, staffLinksRes, clubMembershipRes] = await Promise.all([
    admin
      .from("age_groups")
      .select("id, club_name, club_short_name, club_logo_url, name, football_format, tactical_system, season, club_id")
      .eq("coordinator_id", userId)
      .order("created_at", { ascending: true })
      .limit(20),
    admin
      .from("age_group_staff")
      .select("age_group_id, linked_team_id, role, created_at, club_id")
      .eq("profile_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),
    admin
      .from("club_memberships")
      .select("club_id, role")
      .eq("profile_id", userId)
      .limit(1)
      .maybeSingle(),
  ]);

  if (managedAgeGroupsRes.error) {
    throw new Error(`Erro ao carregar escalões geridos: ${managedAgeGroupsRes.error.message}`);
  }
  if (staffLinksRes.error) {
    throw new Error(`Erro ao carregar equipas técnicas: ${staffLinksRes.error.message}`);
  }

  let managedAgeGroups = (managedAgeGroupsRes.data || []) as TeamContextAgeGroup[];

  // Para club_coordinator: garantir visibilidade de TODOS os escalões do clube,
  // independentemente de coordinator_id (evita perda de acesso por hijack de coordinator_id).
  const clubMembershipEarly = clubMembershipRes.data;
  const isClubCoordinatorEarly = clubMembershipEarly != null &&
    ["coordinator", "club_coordinator", "owner", "admin"].includes(clubMembershipEarly.role);

  if (isClubCoordinatorEarly && clubMembershipEarly?.club_id) {
    const { data: allClubAgeGroups } = await admin
      .from("age_groups")
      .select("id, club_name, club_short_name, club_logo_url, name, football_format, tactical_system, season, club_id")
      .eq("club_id", clubMembershipEarly.club_id)
      .order("created_at", { ascending: true })
      .limit(20);

    if (allClubAgeGroups) {
      const existingIds = new Set(managedAgeGroups.map((ag) => ag.id));
      for (const ag of allClubAgeGroups) {
        if (!existingIds.has(ag.id)) {
          managedAgeGroups = [...managedAgeGroups, ag as TeamContextAgeGroup];
        }
      }
    }
  }

  const managedAgeGroupMap = new Map(managedAgeGroups.map((row) => [row.id, row]));
  const managedAgeGroupIds = managedAgeGroups.map((row) => row.id);

  const staffLinks = (staffLinksRes.data || []) as StaffLinkRow[];
  const orderedStaffTeamIds = Array.from(
    new Set(
      staffLinks
        .map((row) => row.linked_team_id)
        .filter((value): value is string => typeof value === "string"),
    ),
  );
  const orderedStaffAgeGroupIds = Array.from(
    new Set(
      staffLinks
        .map((row) => row.age_group_id)
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

  const missingAgeGroupIds = orderedStaffAgeGroupIds.filter((id) => !managedAgeGroupMap.has(id));
  if (missingAgeGroupIds.length > 0) {
    const missingAgeGroupsRes = await admin
      .from("age_groups")
      .select("id, club_name, club_short_name, club_logo_url, name, football_format, tactical_system, season")
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

  // Resolver clube: club_memberships > age_group.club_id > staff.club_id
  let club: TeamContextClub | null = null;
  let clubRole: UserTeamContext["clubRole"] = null;

  const clubMembership = clubMembershipRes.data;
  const managedClubId: string | null = (managedAgeGroups[0] as (TeamContextAgeGroup & { club_id?: string }) | undefined)?.club_id ?? null;
  const staffClubId: string | null = (staffLinksRes.data?.[0] as Record<string, unknown>)?.club_id as string ?? null;

  const targetClubId = clubMembership?.club_id ?? managedClubId ?? staffClubId ?? null;

  if (targetClubId) {
    const { data: clubData } = await admin
      .from("clubs")
      .select("id, name, slug, logo_url")
      .eq("id", targetClubId)
      .maybeSingle();
    if (clubData) {
      club = clubData as TeamContextClub;
    }
  }

  if (clubMembership) {
    const memberRole = clubMembership.role;
    clubRole = memberRole === "coordinator" || memberRole === "club_coordinator" || memberRole === "owner" || memberRole === "admin"
      ? "club_coordinator"
      : "staff";
  } else if (managedAgeGroups.length > 0) {
    clubRole = "age_coordinator";
  } else if (staffLinks.length > 0) {
    clubRole = "staff";
  }

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
      source: clubRole === "club_coordinator" ? "club_coordinator" : "coordinator",
      teamId: resolvedTeam?.id ?? null,
      teamRole: "coordinator",
      ageGroup: resolvedAgeGroup,
      accessibleTeamIds,
      accessibleAgeGroupIds,
      managedTeamIds,
      staffTeamIds,
      accessibleTeams,
      club,
      clubRole,
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
      staffLinks.find((row) => row.linked_team_id === resolvedTeam?.id)?.role ??
      staffLinks.find((row) => row.age_group_id === resolvedAgeGroup?.id)?.role ??
      null;

    return {
      source: clubRole === "club_coordinator" ? "club_coordinator" : "staff",
      teamId: resolvedTeam?.id ?? null,
      teamRole: typeof resolvedRole === "string" ? resolvedRole : null,
      ageGroup: resolvedAgeGroup,
      accessibleTeamIds,
      accessibleAgeGroupIds,
      managedTeamIds,
      staffTeamIds,
      accessibleTeams,
      club,
      clubRole,
    };
  }

  return {
    source: clubRole === "club_coordinator" ? "club_coordinator" : "none",
    teamId: null,
    teamRole: null,
    ageGroup: null,
    accessibleTeamIds: [],
    accessibleAgeGroupIds: [],
    managedTeamIds: [],
    staffTeamIds: [],
    accessibleTeams: [],
    club,
    clubRole,
  };
}

/** Verifica se o source indica um coordenador (de clube ou de escalão). */
export function isCoordinatorSource(source: UserTeamContext["source"]): boolean {
  return source === "club_coordinator" || source === "coordinator";
}

/**
 * Versão com cache por request para Server Components (React `cache()`).
 *
 * Deduplica chamadas com o mesmo `userId` dentro da mesma render tree.
 * Cria o seu próprio Supabase client (user-scoped via cookies).
 *
 * Usar APENAS em Server Components (layout, page).
 * API routes devem continuar a usar `resolveUserTeamContext()` directamente
 * para controlar qual client (user vs admin) é passado.
 */
export const getCachedUserTeamContext = cache(async (userId: string) => {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  return resolveUserTeamContext(supabase, userId);
});
