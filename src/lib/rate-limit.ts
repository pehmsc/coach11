/**
 * Rate limiting utilities for Coach11 API routes.
 *
 * Staff invite uses DB-based counting (accurate, leverages existing table).
 * Player invite and redeem use in-memory stores — effective for burst protection
 * within a warm serverless instance. For distributed rate limiting across instances,
 * upgrade to Vercel KV or Upstash Redis.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// ─── In-memory stores ────────────────────────────────────────────────────────
//
// NOTA ARQUITETURAL: estes stores são por-instância em Vercel serverless.
// Em deploy distribuído (múltiplas instâncias quentes) o rate limiting
// é best-effort, não garantido. Para proteção global, migrar para
// Upstash Redis ou Vercel KV adicionando @upstash/ratelimit.

type RateLimitEntry = { count: number; resetAt: number };

const playerInviteStore = new Map<string, RateLimitEntry>();
const redeemStore = new Map<string, RateLimitEntry>();
const locationAutocompleteStore = new Map<string, RateLimitEntry>();
const locationResolveStore = new Map<string, RateLimitEntry>();

/**
 * Remove entradas expiradas do store para evitar acumulação de memória
 * em instâncias serverless de longa duração.
 * Executado de forma lazy a cada inserção (sem overhead em leituras).
 */
function pruneExpiredEntries(store: Map<string, RateLimitEntry>) {
  const now = Date.now();
  // Limitar o trabalho por chamada para evitar bloqueios em stores grandes.
  let pruned = 0;
  for (const [key, entry] of store) {
    if (now >= entry.resetAt) {
      store.delete(key);
      if (++pruned >= 50) break; // máximo 50 entradas por limpeza lazy
    }
  }
}

function checkInMemory(
  store: Map<string, RateLimitEntry>,
  key: string,
  limit: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now >= entry.resetAt) {
    // Limpeza lazy ao inserir nova entrada
    pruneExpiredEntries(store);
    store.set(key, { count: 1, resetAt: now + windowMs });
    return false; // not limited
  }

  if (entry.count >= limit) {
    return true; // limited
  }

  entry.count += 1;
  return false;
}

// ─── Staff invite: DB-based (5 per 15 min per user) ──────────────────────────

export async function checkInviteSendLimit(
  client: SupabaseClient,
  userId: string,
  limit = 5,
  windowMinutes = 15,
): Promise<boolean> {
  try {
    const windowStart = new Date(
      Date.now() - windowMinutes * 60 * 1000,
    ).toISOString();

    const { count, error } = await client
      .from("staff_invites")
      .select("id", { count: "exact", head: true })
      .eq("invited_by", userId)
      .gte("created_at", windowStart);

    if (error) {
      // On DB error, fail open (allow the request) to avoid blocking legitimate users
      console.warn("Rate limit DB check failed (staff invite):", error.message);
      return false;
    }

    return (count ?? 0) >= limit;
  } catch {
    return false; // fail open
  }
}

// ─── Player invite: in-memory (5 per 15 min per user) ────────────────────────

export function checkPlayerInviteLimit(
  userId: string,
  limit = 5,
  windowMs = 15 * 60 * 1000,
): boolean {
  return checkInMemory(playerInviteStore, userId, limit, windowMs);
}

// ─── Redeem: in-memory (10 per hour per user) ────────────────────────────────

export function checkRedeemLimit(
  userId: string,
  limit = 10,
  windowMs = 60 * 60 * 1000,
): boolean {
  return checkInMemory(redeemStore, userId, limit, windowMs);
}

export function checkLocationAutocompleteLimit(
  key: string,
  limit = 12,
  windowMs = 60 * 1000,
): boolean {
  return checkInMemory(locationAutocompleteStore, key, limit, windowMs);
}

export function checkLocationResolveLimit(
  key: string,
  limit = 24,
  windowMs = 5 * 60 * 1000,
): boolean {
  return checkInMemory(locationResolveStore, key, limit, windowMs);
}
