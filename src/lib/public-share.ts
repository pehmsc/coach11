import "server-only";

import { createHash, createHmac, randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCanonicalAppUrl } from "@/lib/config/canonical-app-url";

type HeaderBag = {
  get(name: string): string | null;
};

export type PublicShareRow = {
  id: string;
  token_hash: string;
  age_group_id: string;
  created_by: string;
  expires_at: string | null;
  revoked_at: string | null;
  last_accessed_at: string | null;
  access_count: number;
  created_at: string;
};

export function generatePublicShareToken() {
  return randomBytes(32).toString("base64url");
}

export function hashPublicShareToken(rawToken: string) {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function hashPublicIp(ip: string) {
  return createHash("sha256").update(ip).digest("hex");
}

export function buildPublicShareUrl(rawToken: string) {
  return `${getCanonicalAppUrl()}/public/${rawToken}`;
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
