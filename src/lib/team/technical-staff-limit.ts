import type { SupabaseClient } from "@supabase/supabase-js";

export const TECHNICAL_STAFF_LIMIT = 1;
export const TECHNICAL_STAFF_LIMIT_ERROR_CODE = "technical_staff_limit_reached";
export const TECHNICAL_STAFF_LIMIT_ERROR_MESSAGE =
  "Este escalão já atingiu o limite atual de 1 membro de equipa técnica convidado.";

const TECHNICAL_TEAM_STAFF_ROLES = ["coach", "head_coach", "assistant_coach"];
const TECHNICAL_INVITE_ROLES = ["coach", "assistant_coach"];

export type AgeGroupTechnicalStaffUsage = {
  coordinatorId: string | null;
  activeTechnicalStaffCount: number;
  pendingTechnicalInviteCount: number;
  totalUsed: number;
  remainingSlots: number;
  overLimit: boolean;
};

export function isTechnicalStaffLimitError(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const code = "code" in error ? String((error as { code?: string }).code || "") : "";
  const message =
    "message" in error ? String((error as { message?: string }).message || "") : "";

  return (
    code === TECHNICAL_STAFF_LIMIT_ERROR_CODE ||
    message.includes(TECHNICAL_STAFF_LIMIT_ERROR_CODE)
  );
}

export async function getAgeGroupTechnicalStaffUsage(
  admin: SupabaseClient,
  ageGroupId: string,
): Promise<AgeGroupTechnicalStaffUsage> {
  const [{ data: ageGroup, error: ageGroupError }, { data: teams, error: teamsError }] =
    await Promise.all([
      admin
        .from("age_groups")
        .select("id, coordinator_id")
        .eq("id", ageGroupId)
        .maybeSingle(),
      admin
        .from("teams")
        .select("id")
        .eq("age_group_id", ageGroupId),
    ]);

  if (ageGroupError) {
    throw new Error(
      `technical_staff_usage_age_group_failed:${ageGroupError.message || "falha desconhecida"}`,
    );
  }

  if (teamsError) {
    throw new Error(
      `technical_staff_usage_teams_failed:${teamsError.message || "falha desconhecida"}`,
    );
  }

  const coordinatorId =
    ageGroup && typeof ageGroup.coordinator_id === "string"
      ? ageGroup.coordinator_id
      : null;

  const teamIds = (teams || [])
    .map((team) => (typeof team.id === "string" ? team.id : null))
    .filter((teamId): teamId is string => !!teamId);

  const [staffMembersRes, pendingInvitesRes] = await Promise.all([
    teamIds.length > 0
      ? admin
          .from("team_staff")
          .select("id, profile_id, role")
          .in("team_id", teamIds)
          .in("role", TECHNICAL_TEAM_STAFF_ROLES)
      : Promise.resolve({ data: [], error: null }),
    admin
      .from("staff_invites")
      .select("id, role")
      .eq("age_group_id", ageGroupId)
      .is("accepted_at", null)
      .in("role", TECHNICAL_INVITE_ROLES),
  ]);

  if (staffMembersRes.error) {
    throw new Error(
      `technical_staff_usage_team_staff_failed:${staffMembersRes.error.message || "falha desconhecida"}`,
    );
  }

  if (pendingInvitesRes.error) {
    throw new Error(
      `technical_staff_usage_staff_invites_failed:${pendingInvitesRes.error.message || "falha desconhecida"}`,
    );
  }

  const activeTechnicalStaffCount = new Set(
    (staffMembersRes.data || [])
      .map((row) =>
        row &&
        typeof row === "object" &&
        "profile_id" in row &&
        typeof row.profile_id === "string"
          ? row.profile_id
          : null,
      )
      .filter((profileId): profileId is string => !!profileId && profileId !== coordinatorId),
  ).size;

  const pendingTechnicalInviteCount = (pendingInvitesRes.data || []).length;
  const totalUsed = activeTechnicalStaffCount + pendingTechnicalInviteCount;

  return {
    coordinatorId,
    activeTechnicalStaffCount,
    pendingTechnicalInviteCount,
    totalUsed,
    remainingSlots: Math.max(0, TECHNICAL_STAFF_LIMIT - totalUsed),
    overLimit: totalUsed > TECHNICAL_STAFF_LIMIT,
  };
}
