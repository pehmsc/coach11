import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type AgeGroupContext = {
  id: string;
  club_name: string;
  name: string;
  football_format: string | null;
};

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

async function pickPreferredTeamId(
  admin: ReturnType<typeof createAdminClient>,
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

async function resolveManagedContext(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
) {
  const { data: managedAgeGroups } = await admin
    .from("age_groups")
    .select("id, club_name, name, football_format")
    .eq("coordinator_id", userId)
    .order("created_at", { ascending: true })
    .limit(20);

  if (!managedAgeGroups || managedAgeGroups.length === 0) {
    return null;
  }

  const ageGroups = managedAgeGroups as AgeGroupContext[];
  const ageGroupIds = ageGroups.map((row) => row.id);

  const { data: teams } = await admin
    .from("teams")
    .select("id, age_group_id")
    .in("age_group_id", ageGroupIds)
    .order("created_at", { ascending: true })
    .limit(100);

  const teamRows = teams || [];
  const teamIds = teamRows
    .map((row) => row.id)
    .filter((value): value is string => typeof value === "string");
  const preferredTeamId = await pickPreferredTeamId(admin, teamIds);
  const preferredTeam =
    teamRows.find((row) => row.id === preferredTeamId) || teamRows[0] || null;
  const preferredAgeGroup =
    ageGroups.find((row) => row.id === preferredTeam?.age_group_id) ||
    ageGroups[0] ||
    null;

  return {
    source: "coordinator" as const,
    teamId: preferredTeam?.id ?? null,
    teamRole: "coordinator" as const,
    ageGroup: preferredAgeGroup,
    accessibleTeamIds: teamIds,
  };
}

async function resolveStaffContext(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
) {
  const { data: staffLinks } = await admin
    .from("team_staff")
    .select("team_id, role, created_at")
    .eq("profile_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (!staffLinks || staffLinks.length === 0) {
    return null;
  }

  const orderedTeamIds = Array.from(
    new Set(
      staffLinks
        .map((row) => row.team_id)
        .filter((value): value is string => typeof value === "string"),
    ),
  );
  if (orderedTeamIds.length === 0) {
    return null;
  }

  const { data: teams } = await admin
    .from("teams")
    .select("id, age_group_id")
    .in("id", orderedTeamIds);

  const teamsById = new Map(
    (teams || [])
      .filter((row) => typeof row.id === "string")
      .map((row) => [row.id, row]),
  );
  const preferredTeamId = await pickPreferredTeamId(admin, orderedTeamIds);
  const candidateTeamIds = [
    ...(preferredTeamId ? [preferredTeamId] : []),
    ...orderedTeamIds.filter((id) => id !== preferredTeamId),
  ];

  const ageGroupIds = Array.from(
    new Set(
      (teams || [])
        .map((row) => row.age_group_id)
        .filter((value): value is string => typeof value === "string"),
    ),
  );
  let ageGroupsById = new Map<string, AgeGroupContext>();
  if (ageGroupIds.length > 0) {
    const { data: ageGroupRows } = await admin
      .from("age_groups")
      .select("id, club_name, name, football_format")
      .in("id", ageGroupIds);
    ageGroupsById = new Map(
      ((ageGroupRows || []) as AgeGroupContext[]).map((row) => [row.id, row]),
    );
  }

  let resolvedTeamId: string | null = null;
  let resolvedAgeGroup: AgeGroupContext | null = null;
  for (const teamId of candidateTeamIds) {
    const teamRow = teamsById.get(teamId);
    if (!teamRow?.age_group_id) continue;
    const ageGroupRow = ageGroupsById.get(teamRow.age_group_id);
    if (!ageGroupRow) continue;
    resolvedTeamId = teamId;
    resolvedAgeGroup = ageGroupRow;
    break;
  }

  if (!resolvedTeamId) {
    resolvedTeamId = candidateTeamIds[0] ?? null;
  }

  const resolvedRole =
    staffLinks.find((row) => row.team_id === resolvedTeamId)?.role ?? null;

  return {
    source: "staff" as const,
    teamId: resolvedTeamId,
    teamRole: typeof resolvedRole === "string" ? resolvedRole : null,
    ageGroup: resolvedAgeGroup,
    accessibleTeamIds: orderedTeamIds,
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

    const admin = createAdminClient();

    const { data: profile } = await admin
      .from("profiles")
      .select("id, full_name, role, email")
      .eq("id", user.id)
      .maybeSingle();

    const managedContext = await resolveManagedContext(admin, user.id);
    const staffContext = managedContext
      ? null
      : await resolveStaffContext(admin, user.id);

    const source = managedContext?.source ?? staffContext?.source ?? "none";
    const teamRole = managedContext?.teamRole ?? staffContext?.teamRole ?? null;
    const teamId = managedContext?.teamId ?? staffContext?.teamId ?? null;
    const ageGroup = managedContext?.ageGroup ?? staffContext?.ageGroup ?? null;
    const accessibleTeamIds = managedContext?.accessibleTeamIds ??
      staffContext?.accessibleTeamIds ??
      [];

    if (!ageGroup) {
      return NextResponse.json({
        success: true,
        linked: false,
        source,
        teamId,
        teamRole,
        ageGroup: null,
        accessibleTeamIds,
        kits: [],
        activeStaffProfileIds: [],
        staffInvites: [],
        profile: profile || null,
      });
    }

    const [kitsRes, staffRes, invitesRes] = await Promise.all([
      teamId
        ? admin
            .from("kit_pieces")
            .select("*")
            .eq("team_id", teamId)
            .order("kit_number")
            .order("player_type")
            .order("piece_type")
        : Promise.resolve({ data: [], error: null }),
      teamId
        ? admin
            .from("team_staff")
            .select("id, profile_id, role")
            .eq("team_id", teamId)
        : Promise.resolve({ data: [], error: null }),
      admin
        .from("staff_invites")
        .select("*")
        .eq("age_group_id", ageGroup.id)
        .order("created_at", { ascending: false }),
    ]);

    const rawStaffRows = (staffRes.data || []) as Array<{
      id: string;
      profile_id: string;
      role: string | null;
    }>;
    const staffProfileIds = rawStaffRows.map((row) => row.profile_id);

    let staffProfilesData: Array<{
      id: string;
      full_name: string | null;
      email: string | null;
      avatar_url: string | null;
    }> = [];
    if (staffProfileIds.length > 0) {
      const { data: pData } = await admin
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .in("id", staffProfileIds);
      staffProfilesData = (pData || []) as typeof staffProfilesData;
    }

    const staffProfileMap = new Map(staffProfilesData.map((p) => [p.id, p]));
    const staffMembers = rawStaffRows.map((row) => ({
      id: row.id,
      profile_id: row.profile_id,
      role: row.role || "staff",
      full_name: staffProfileMap.get(row.profile_id)?.full_name || null,
      email: staffProfileMap.get(row.profile_id)?.email || null,
      avatar_url: staffProfileMap.get(row.profile_id)?.avatar_url || null,
    }));

    return NextResponse.json({
      success: true,
      linked: true,
      source,
      teamId,
      teamRole,
      ageGroup,
      accessibleTeamIds,
      kits: ((kitsRes.data || []) as Record<string, unknown>[]).map((row) =>
        normalizeKitRowForUi(row),
      ),
      activeStaffProfileIds: staffProfileIds,
      staffMembers,
      staffInvites: invitesRes.data || [],
      profile: profile || null,
    });
  } catch (error) {
    console.error("Erro ao carregar contexto do utilizador:", error);
    const message =
      error instanceof Error ? error.message : "Erro interno ao carregar contexto.";

    if (message.includes("SUPABASE_SERVICE_ROLE_KEY")) {
      return NextResponse.json(
        {
          error:
            "Configuração do servidor incompleta: falta SUPABASE_SERVICE_ROLE_KEY no ambiente de produção.",
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { error: message || "Erro interno ao carregar contexto." },
      { status: 500 },
    );
  }
}
