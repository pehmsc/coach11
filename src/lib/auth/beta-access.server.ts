import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  type BetaAccessParams,
  type BetaAccessResult,
  type BetaInviteRow,
  isSuperCoordinatorEmail,
  normalizeEmail,
} from "@/lib/auth/beta-access";

function getAdminClient(admin?: SupabaseClient) {
  return admin ?? createAdminClient();
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

async function hasActiveStaffInviteForEmail(
  email: string | null | undefined,
  admin?: SupabaseClient,
) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return false;

  const db = getAdminClient(admin);
  const { data, error } = await db
    .from("staff_invites")
    .select("id")
    .eq("email", normalizedEmail)
    .order("accepted_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`staff_invite_lookup_failed:${error.message}`);
  }

  return !!data?.id;
}

export async function isLegacyUser(
  profileId: string | null | undefined,
  admin?: SupabaseClient,
) {
  const normalizedProfileId =
    typeof profileId === "string" ? profileId.trim() : "";
  if (!normalizedProfileId) return false;

  const db = getAdminClient(admin);
  const [ownedAgeGroupRes, staffMembershipRes] =
    await Promise.all([
      db
        .from("age_groups")
        .select("coordinator_id")
        .eq("coordinator_id", normalizedProfileId)
        .limit(1)
        .maybeSingle(),
      db
        .from("age_group_staff")
        .select("profile_id")
        .eq("profile_id", normalizedProfileId)
        .limit(1)
        .maybeSingle(),
    ]);

  const firstError = ownedAgeGroupRes.error ?? staffMembershipRes.error;

  if (firstError) {
    throw new Error(`legacy_user_lookup_failed:${firstError.message}`);
  }

  return !!(ownedAgeGroupRes.data || staffMembershipRes.data);
}

export async function isBetaAllowed(
  params: BetaAccessParams,
  admin?: SupabaseClient,
): Promise<BetaAccessResult> {
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

  // Feature flag: OPEN_REGISTRATION=true desliga o gate beta. Qualquer email
  // valido pode registar-se. Usado quando o produto sai de beta restrito para
  // auto-servico (Stripe Individual).
  if (process.env.OPEN_REGISTRATION === "true") {
    return {
      allowed: true,
      reason: "open_registration",
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

    const hasStaffInvite = await hasActiveStaffInviteForEmail(normalizedEmail, admin);
    if (hasStaffInvite) {
      return {
        allowed: true,
        reason: "staff_invite",
        invite: null,
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

const UUID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/u;

function extractClubIdFromInviteMetadata(
  metadata: unknown,
): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const candidate = (metadata as Record<string, unknown>).club_id;
  if (typeof candidate !== "string") return null;
  return UUID_PATTERN.test(candidate) ? candidate : null;
}

/**
 * Quando um beta_invite criado pelo wizard de admin (`/admin/clubs/new` +
 * `/admin/clubs/[id]/invite-coordinator`) tem `metadata.club_id`, este
 * helper liga automaticamente a conta autenticada ao clube como
 * `club_coordinator` e limpa o registo de coordenador pendente do clube.
 *
 * Idempotente — se ja existe `club_memberships(profile_id, club_id)`
 * para esse par, faz no-op.
 *
 * Chamar **depois** de `markBetaInviteAccepted` para garantir que o
 * status do invite ja esta 'accepted' (audit trail consistente).
 */
export async function linkInviteToClubMembership(
  userId: string,
  email: string | null | undefined,
  admin?: SupabaseClient,
) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return;

  const db = getAdminClient(admin);
  const activeInvite = await getActiveBetaInviteForEmail(normalizedEmail, db);

  if (
    !activeInvite ||
    activeInvite.invite_type !== "beta_coordinator"
  ) {
    return;
  }

  const clubId = extractClubIdFromInviteMetadata(activeInvite.metadata);
  if (!clubId) return;

  // Garante uma entry `club_memberships` para o (profile, club) — idempotente
  // via onConflict no par natural (assumindo que existe unique constraint;
  // caso contrario, primeiro fazemos lookup defensivo).
  const { data: existing, error: existingError } = await db
    .from("club_memberships")
    .select("club_id, role")
    .eq("profile_id", userId)
    .eq("club_id", clubId)
    .maybeSingle();

  if (existingError) {
    throw new Error(
      `club_membership_lookup_failed:${existingError.message}`,
    );
  }

  if (!existing) {
    const { error: insertError } = await db
      .from("club_memberships")
      .insert({
        profile_id: userId,
        club_id: clubId,
        role: "club_coordinator",
      });
    if (insertError) {
      throw new Error(
        `club_membership_insert_failed:${insertError.message}`,
      );
    }
  } else if (
    existing.role !== "club_coordinator" &&
    existing.role !== "owner" &&
    existing.role !== "admin"
  ) {
    // Upgrade role para club_coordinator se estiver com role inferior
    // (ex: 'staff' inicialmente). Mantem owner/admin sem alteracao.
    const { error: updateError } = await db
      .from("club_memberships")
      .update({ role: "club_coordinator" })
      .eq("profile_id", userId)
      .eq("club_id", clubId);
    if (updateError) {
      throw new Error(
        `club_membership_role_upgrade_failed:${updateError.message}`,
      );
    }
  }

  // Limpa os campos pending_coordinator_* — coordenador "real" entrou,
  // dados pendentes ja nao sao a fonte de verdade.
  await db
    .from("clubs")
    .update({
      pending_coordinator_name: null,
      pending_coordinator_email: null,
      pending_coordinator_phone: null,
      pending_coordinator_invite_sent_at: null,
    })
    .eq("id", clubId);
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
