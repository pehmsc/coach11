// Email do super-coordenador lido da variável de ambiente (nunca hardcoded).
// Definir SUPER_COORDINATOR_EMAIL no .env.local e nas env vars de produção.
const _superCoordinatorEmail = process.env.SUPER_COORDINATOR_EMAIL?.trim().toLowerCase() ?? "";
if (!_superCoordinatorEmail && process.env.NODE_ENV === "production") {
  throw new Error("SUPER_COORDINATOR_EMAIL env var é obrigatória em produção.");
}
export const SUPER_COORDINATOR_EMAIL = _superCoordinatorEmail;

export type BetaInviteType = "beta_coordinator";
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
  | "staff_invite"
  | "no_invite"
  | "no_email"
  | "lookup_error";

export type BetaAccessResult = {
  allowed: boolean;
  reason: BetaAccessReason;
  invite: BetaInviteRow | null;
};

export type BetaAccessParams = {
  profileId?: string | null;
  email: string | null | undefined;
};

export function normalizeEmail(email: string | null | undefined) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

export function isSuperCoordinatorEmail(email: string | null | undefined) {
  return normalizeEmail(email) === SUPER_COORDINATOR_EMAIL;
}
