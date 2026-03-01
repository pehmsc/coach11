import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

export const SUPER_COORDINATOR_EMAIL = "pedrohmscampos@gmail.com";

export type BetaInviteType = "staff" | "beta_coordinator";
export type BetaInviteStatus = "sent" | "accepted" | "revoked" | "expired";

export type BetaInviteRow = {
  id: string;
  email: string;
  invite_type: BetaInviteType;
  target_age_group_id: string | null;
  created_by_profile_id: string;
  status: BetaInviteStatus;
  expires_at: string | null;
  accepted_at: string | null;
  revoked_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

function getAdminClient(admin?: SupabaseClient) {
  return admin ?? createAdminClient();
}

export function normalizeEmail(email: string | null | undefined) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

export function isSuperCoordinatorEmail(email: string | null | undefined) {
  return normalizeEmail(email) === SUPER_COORDINATOR_EMAIL;
}

export async function getActiveBetaInviteForEmail(
  email: string | null | undefined,
  admin?: SupabaseClient,
): Promise<BetaInviteRow | null> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  const db = getAdminClient(admin);
  const nowIso = new Date().toISOString();

  const { data, error } = await db
    .from("beta_invites")
    .select(
      "id, email, invite_type, target_age_group_id, created_by_profile_id, status, expires_at, accepted_at, revoked_at, metadata, created_at",
    )
    .eq("email", normalizedEmail)
    .in("status", ["sent", "accepted"])
    .is("revoked_at", null)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .order("accepted_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`beta_invite_lookup_failed:${error.message}`);
  }

  return (data as BetaInviteRow | null) ?? null;
}

export async function isBetaAllowed(
  email: string | null | undefined,
  admin?: SupabaseClient,
) {
  try {
    const invite = await getActiveBetaInviteForEmail(email, admin);
    return !!invite;
  } catch {
    return false;
  }
}

export async function markBetaInviteAccepted(
  email: string | null | undefined,
  admin?: SupabaseClient,
) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return;

  const db = getAdminClient(admin);
  const nowIso = new Date().toISOString();
  const activeInvite = await getActiveBetaInviteForEmail(normalizedEmail, db);

  if (!activeInvite || activeInvite.status !== "sent") {
    return;
  }

  const { error } = await db
    .from("beta_invites")
    .update({
      status: "accepted",
      accepted_at: nowIso,
      revoked_at: null,
    })
    .eq("id", activeInvite.id);

  if (error) {
    throw new Error(`beta_invite_accept_failed:${error.message}`);
  }
}

export async function getBetaOnboardingState(
  userId: string,
  email: string | null | undefined,
  admin?: SupabaseClient,
) {
  const db = getAdminClient(admin);
  const activeInvite = await getActiveBetaInviteForEmail(email, db);
  const hasBetaCoordinatorInvite = activeInvite?.invite_type === "beta_coordinator";

  if (!hasBetaCoordinatorInvite) {
    return {
      hasBetaCoordinatorInvite: false,
      ownsAgeGroup: false,
      requiresOnboarding: false,
    };
  }

  const { data, error } = await db
    .from("age_groups")
    .select("id")
    .eq("coordinator_id", userId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`beta_onboarding_lookup_failed:${error.message}`);
  }

  return {
    hasBetaCoordinatorInvite: true,
    ownsAgeGroup: !!data,
    requiresOnboarding: !data,
  };
}

export async function countActiveBetaCoordinatorInvites(admin?: SupabaseClient) {
  const db = getAdminClient(admin);
  const nowIso = new Date().toISOString();
  const { count, error } = await db
    .from("beta_invites")
    .select("id", { count: "exact", head: true })
    .eq("invite_type", "beta_coordinator")
    .in("status", ["sent", "accepted"])
    .is("revoked_at", null)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`);

  if (error) {
    throw new Error(`beta_coordinator_invite_count_failed:${error.message}`);
  }

  return count ?? 0;
}
