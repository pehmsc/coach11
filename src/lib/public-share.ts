import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCanonicalAppUrl } from "@/lib/config/canonical-app-url";

type HeaderBag = {
  get(name: string): string | null;
};

export type PublicShareRow = {
  id: string;
  token_hash: string;
  token_encrypted?: string | null;
  age_group_id: string;
  created_by: string;
  expires_at: string | null;
  revoked_at: string | null;
  last_accessed_at: string | null;
  access_count: number;
  created_at: string;
};

export type PublicAccessAgeGroupRow = {
  id: string;
  public_slug: string | null;
  public_access_enabled: boolean | null;
  public_access_count?: number | null;
  public_last_accessed_at?: string | null;
};

export type PublicAccessStats = {
  accessCount: number;
  lastAccessedAt: string | null;
};

type PublicAccessStatsAgeGroupRow = {
  id: string;
  public_access_count: number | null;
  public_last_accessed_at: string | null;
};

type PublicAccessStatsLegacyRow = {
  age_group_id: string;
  access_count: number | null;
  last_accessed_at: string | null;
};

function isMissingPublicAccessStatsSchemaError(message: string | undefined) {
  if (!message) return false;

  return (
    message.includes("public_access_count") ||
    message.includes("public_last_accessed_at") ||
    message.includes("register_public_age_group_access")
  );
}

export function generatePublicShareToken() {
  return randomBytes(32).toString("base64url");
}

function getPublicShareEncryptionKey() {
  const secret = (
    process.env.PUBLIC_SHARE_TOKEN_ENCRYPTION_KEY ??
    process.env.APP_SECRET ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE
  )?.trim();

  if (!secret) {
    throw new Error("public_share_encryption_secret_missing");
  }

  return createHash("sha256").update(secret).digest();
}

export function hashPublicShareToken(rawToken: string) {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function encryptPublicShareToken(rawToken: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getPublicShareEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(rawToken, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]).toString("base64url");
}

export function decryptPublicShareToken(tokenEncrypted: string) {
  const payload = Buffer.from(tokenEncrypted, "base64url");
  if (payload.length <= 28) {
    throw new Error("public_share_encrypted_token_invalid");
  }

  const iv = payload.subarray(0, 12);
  const authTag = payload.subarray(12, 28);
  const encrypted = payload.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", getPublicShareEncryptionKey(), iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString("utf8");
}

export function hashPublicIp(ip: string) {
  return createHash("sha256").update(ip).digest("hex");
}

export function buildPublicShareUrl(rawToken: string) {
  return buildPublicAccessUrl(rawToken);
}

export function buildPublicAccessUrl(identifier: string) {
  return `${getCanonicalAppUrl()}/public/${identifier}`;
}

export function getPublicShareUrlFromEncryptedToken(
  tokenEncrypted: string | null | undefined,
) {
  if (!tokenEncrypted) return null;

  try {
    return buildPublicShareUrl(decryptPublicShareToken(tokenEncrypted));
  } catch {
    return null;
  }
}

export function sanitizePublicPlayerName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
) {
  const first = typeof firstName === "string" ? firstName.trim() : "";
  const last = typeof lastName === "string" ? lastName.trim() : "";

  if (!first) return "Jogador";
  if (!last) return first;

  return `${first} ${last[0]?.toUpperCase() || ""}.`;
}

export function extractRequestIp(headers: HeaderBag) {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const cfIp = headers.get("cf-connecting-ip")?.trim();
  if (cfIp) return cfIp;

  return "unknown";
}

export function buildPublicGameRef(rawToken: string, gameId: string) {
  return createHmac("sha256", rawToken).update(gameId).digest("base64url").slice(0, 24);
}

export function resolvePublicGameId(
  rawToken: string,
  publicGameRef: string,
  gameIds: string[],
) {
  for (const gameId of gameIds) {
    if (buildPublicGameRef(rawToken, gameId) === publicGameRef) {
      return gameId;
    }
  }

  return null;
}

export function buildPublicTrainingRef(rawToken: string, trainingId: string) {
  return createHmac("sha256", rawToken).update(trainingId).digest("base64url").slice(0, 24);
}

export function resolvePublicTrainingId(
  rawToken: string,
  publicTrainingRef: string,
  trainingIds: string[],
) {
  for (const trainingId of trainingIds) {
    if (buildPublicTrainingRef(rawToken, trainingId) === publicTrainingRef) {
      return trainingId;
    }
  }

  return null;
}

export async function validatePublicShareToken(
  admin: SupabaseClient,
  rawToken: string,
) {
  const tokenHash = hashPublicShareToken(rawToken);
  const nowIso = new Date().toISOString();

  const { data, error } = await admin
    .from("public_share_tokens")
    .select(
      "id, token_hash, age_group_id, created_by, expires_at, revoked_at, last_accessed_at, access_count, created_at",
    )
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .maybeSingle();

  if (error) {
    throw new Error(`public_share_lookup_failed:${error.message}`);
  }

  return {
    tokenHash,
    share: (data as PublicShareRow | null) ?? null,
  };
}

export async function consumePublicShareRateLimit(
  admin: SupabaseClient,
  tokenHash: string,
  ip: string,
) {
  const { data, error } = await admin.rpc("consume_public_share_rate_limit", {
    p_token_hash: tokenHash,
    p_ip_hash: hashPublicIp(ip),
    p_ip_limit: 60,
    p_token_limit: 300,
  });

  if (error) {
    throw new Error(`public_share_rate_limit_failed:${error.message}`);
  }

  const result =
    data && typeof data === "object" ? (data as Record<string, unknown>) : null;

  return {
    ok: result?.ok === true,
    ipCount: typeof result?.ipCount === "number" ? result.ipCount : null,
    tokenCount: typeof result?.tokenCount === "number" ? result.tokenCount : null,
  };
}

export async function registerPublicShareAccess(
  admin: SupabaseClient,
  share: PublicShareRow,
) {
  const { error } = await admin
    .from("public_share_tokens")
    .update({
      access_count: Math.max(0, share.access_count) + 1,
      last_accessed_at: new Date().toISOString(),
    })
    .eq("id", share.id);

  if (error) {
    throw new Error(`public_share_access_update_failed:${error.message}`);
  }
}

export async function registerPublicAgeGroupAccess(
  admin: SupabaseClient,
  ageGroupId: string,
) {
  const { error } = await admin.rpc("register_public_age_group_access", {
    p_age_group_id: ageGroupId,
  });

  if (error) {
    if (isMissingPublicAccessStatsSchemaError(error.message)) {
      return;
    }

    throw new Error(`public_age_group_access_update_failed:${error.message}`);
  }
}

function mergeLastAccessedAt(current: string | null, next: string | null) {
  if (!current) return next;
  if (!next) return current;
  return current > next ? current : next;
}

export async function getPublicAccessStatsForAgeGroups(
  admin: SupabaseClient,
  ageGroupIds: string[],
) {
  const uniqueAgeGroupIds = Array.from(
    new Set(
      ageGroupIds
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const statsByAgeGroup = new Map<string, PublicAccessStats>();

  for (const ageGroupId of uniqueAgeGroupIds) {
    statsByAgeGroup.set(ageGroupId, {
      accessCount: 0,
      lastAccessedAt: null,
    });
  }

  if (uniqueAgeGroupIds.length === 0) {
    return statsByAgeGroup;
  }

  const { data: ageGroups, error: ageGroupsError } = await admin
    .from("age_groups")
    .select("id, public_access_count, public_last_accessed_at")
    .in("id", uniqueAgeGroupIds);
  const { data: legacyShares, error: legacyError } = await admin
    .from("public_share_tokens")
    .select("age_group_id, access_count, last_accessed_at")
    .in("age_group_id", uniqueAgeGroupIds);

  if (legacyError) {
    throw new Error(`public_access_stats_legacy_failed:${legacyError.message}`);
  }

  if (ageGroupsError && !isMissingPublicAccessStatsSchemaError(ageGroupsError.message)) {
    throw new Error(`public_access_stats_age_groups_failed:${ageGroupsError.message}`);
  }

  for (const row of ((ageGroupsError ? [] : ageGroups) || []) as PublicAccessStatsAgeGroupRow[]) {
    statsByAgeGroup.set(row.id, {
      accessCount: Math.max(0, row.public_access_count ?? 0),
      lastAccessedAt: row.public_last_accessed_at ?? null,
    });
  }

  for (const row of (legacyShares || []) as PublicAccessStatsLegacyRow[]) {
    const current = statsByAgeGroup.get(row.age_group_id) ?? {
      accessCount: 0,
      lastAccessedAt: null,
    };

    statsByAgeGroup.set(row.age_group_id, {
      accessCount: current.accessCount + Math.max(0, row.access_count ?? 0),
      lastAccessedAt: mergeLastAccessedAt(
        current.lastAccessedAt,
        row.last_accessed_at ?? null,
      ),
    });
  }

  return statsByAgeGroup;
}

export async function resolvePublicShareRequest(
  admin: SupabaseClient,
  rawToken: string,
  headers: HeaderBag,
) {
  const { tokenHash, share } = await validatePublicShareToken(admin, rawToken);

  if (!share) {
    return null;
  }

  const ip = extractRequestIp(headers);
  await registerPublicShareAccess(admin, share);

  return {
    share,
    tokenHash,
    ip,
  };
}

export function slugifyPublicAccessSegment(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .trim();
}

export async function resolvePublicAccessRequest(
  admin: SupabaseClient,
  identifier: string,
  headers: HeaderBag,
) {
  const normalizedIdentifier = identifier.trim();
  const normalizedSlug = slugifyPublicAccessSegment(normalizedIdentifier);

  if (normalizedSlug) {
    const { data: ageGroupBySlug, error: ageGroupError } = await admin
      .from("age_groups")
      .select("id, public_slug, public_access_enabled")
      .eq("public_slug", normalizedSlug)
      .maybeSingle();

    if (ageGroupError) {
      throw new Error(`public_share_slug_lookup_failed:${ageGroupError.message}`);
    }

    if (ageGroupBySlug) {
      const ageGroup = ageGroupBySlug as PublicAccessAgeGroupRow;
      await registerPublicAgeGroupAccess(admin, ageGroup.id);

      return {
        source: "slug" as const,
        identifier: ageGroup.public_slug || normalizedSlug,
        ageGroupId: ageGroup.id,
        paused: ageGroup.public_access_enabled === false,
        share: null,
      };
    }
  }

  const tokenAccess = await resolvePublicShareRequest(admin, normalizedIdentifier, headers);
  if (!tokenAccess?.share) {
    return null;
  }

  const { data: tokenAgeGroup, error: tokenAgeGroupError } = await admin
    .from("age_groups")
    .select("id, public_slug, public_access_enabled")
    .eq("id", tokenAccess.share.age_group_id)
    .maybeSingle();

  if (tokenAgeGroupError) {
    throw new Error(`public_share_age_group_lookup_failed:${tokenAgeGroupError.message}`);
  }

  if (tokenAgeGroup?.public_slug) {
    return null;
  }

  return {
    source: "token" as const,
    identifier: normalizedIdentifier,
    ageGroupId: tokenAccess.share.age_group_id,
    paused: tokenAgeGroup?.public_access_enabled === false,
    share: tokenAccess.share,
  };
}
