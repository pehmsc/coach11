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

export type BetaAccessReason =
  | "super_email"
  | "legacy_access"
  | "invite_ok"
  | "no_invite"
  | "no_email"
  | "lookup_error";

export type BetaAccessResult = {
  allowed: boolean;
  reason: BetaAccessReason;
  invite: BetaInviteRow | null;
};

type BetaAccessParams = {
  profileId?: string | null;
  email: string | null | undefined;
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

async function findProfileIdByEmail(
  email: string | null | undefined,
  admin?: SupabaseClient,
) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  const db = getAdminClient(admin);
  const { data, error } = await db
    .from("profiles")
    .select("id")
    .eq("email", normalizedEmail)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`profile_email_lookup_failed:${error.message}`);
  }

  return typeof data?.id === "string" ? data.id : null;
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

export async function isLegacyUser(
  profileId: string | null | undefined,
  admin?: SupabaseClient,
) {
  const normalizedProfileId =
    typeof profileId === "string" ? profileId.trim() : "";
  if (!normalizedProfileId) return false;

  const db = getAdminClient(admin);

  // Legacy access is derived from existing ownership or membership rows.
  const [ownedAgeGroupRes, staffMembershipRes, clubMembershipRes] =
    await Promise.all([
      db
        .from("age_groups")
        .select("coordinator_id")
        .eq("coordinator_id", normalizedProfileId)
        .limit(1)
        .maybeSingle(),
      db
        .from("team_staff")
        .select("profile_id")
        .eq("profile_id", normalizedProfileId)
        .limit(1)
        .maybeSingle(),
      db
        .from("club_memberships")
        .select("profile_id")
        .eq("profile_id", normalizedProfileId)
        .limit(1)
        .maybeSingle(),
    ]);

  const firstError =
    ownedAgeGroupRes.error ??
    staffMembershipRes.error ??
    clubMembershipRes.error;

  if (firstError) {
    throw new Error(`legacy_user_lookup_failed:${firstError.message}`);
  }

  return !!(
    ownedAgeGroupRes.data ||
    staffMembershipRes.data ||
    clubMembershipRes.data
  );
}

export async function isBetaAllowed(
  params: BetaAccessParams,
  admin?: SupabaseClient,
) : Promise<BetaAccessResult> {
  const normalizedEmail = normalizeEmail(params.email);
  if (!normalizedEmail) {
    return {
      allowed: false,
      reason: "no_email",
      invite: null,
    };
  }

  if (isSuperCoordinatorEmail(normalizedEmail)) {
    return {
      allowed: true,
      reason: "super_email",
      invite: null,
    };
  }

  try {
    const normalizedProfileId =
      typeof params.profileId === "string" ? params.profileId.trim() : "";
    const resolvedProfileId =
      normalizedProfileId || (await findProfileIdByEmail(normalizedEmail, admin));

    if (resolvedProfileId) {
      const legacy = await isLegacyUser(resolvedProfileId, admin);
      if (legacy) {
        return {
          allowed: true,
          reason: "legacy_access",
          invite: null,
        };
      }
    }

    const invite = await getActiveBetaInviteForEmail(normalizedEmail, admin);
    if (invite) {
      return {
        allowed: true,
        reason: "invite_ok",
        invite,
      };
    }

    return {
      allowed: false,
      reason: "no_invite",
      invite: null,
    };
  } catch {
    return {
      allowed: false,
      reason: "lookup_error",
      invite: null,
    };
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
