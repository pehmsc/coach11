import type { SupabaseClient } from "@supabase/supabase-js";
import { AGE_GROUP_STAFF_ROLES } from "@/lib/team/staff-role";

export const TECHNICAL_STAFF_LIMIT = 1;
export const TECHNICAL_STAFF_LIMIT_ERROR_CODE = "technical_staff_limit_reached";
export const TECHNICAL_STAFF_LIMIT_ERROR_MESSAGE =
  "Este escalão já atingiu o limite atual de 1 membro de equipa técnica convidado.";

const TECHNICAL_INVITE_ROLES = [...AGE_GROUP_STAFF_ROLES];

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
  const { data: ageGroup, error: ageGroupError } = await admin
    .from("age_groups")
    .select("id, coordinator_id")
    .eq("id", ageGroupId)
    .maybeSingle();

  if (ageGroupError) {
    throw new Error(
      `technical_staff_usage_age_group_failed:${ageGroupError.message || "falha desconhecida"}`,
    );
  }

  const coordinatorId =
    ageGroup && typeof ageGroup.coordinator_id === "string"
      ? ageGroup.coordinator_id
      : null;

  const [staffMembersRes, pendingInvitesRes] = await Promise.all([
    admin
      .from("age_group_staff")
      .select("id, profile_id, role")
      .eq("age_group_id", ageGroupId)
      .in("role", AGE_GROUP_STAFF_ROLES),
    admin
      .from("staff_invites")
      .select("id, role")
      .eq("age_group_id", ageGroupId)
      .is("accepted_at", null)
      .in("role", TECHNICAL_INVITE_ROLES),
  ]);

  if (staffMembersRes.error) {
    throw new Error(
      `technical_staff_usage_age_group_staff_failed:${staffMembersRes.error.message || "falha desconhecida"}`,
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
