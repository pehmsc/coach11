import "server-only";

import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase com service role key — bypassa todas as RLS policies.
 * Usar APENAS em API routes server-side para operações que requerem privilégios elevados.
 * NUNCA expor no cliente (browser).
 *
 * Cached at module level: the admin client is stateless (uses a static key),
 * so a single instance per warm serverless execution is safe and avoids
 * repeated initialization overhead.
 */

let _cached: SupabaseClient | null = null;

export function createAdminClient(): SupabaseClient {
  if (_cached) return _cached;

  const url = (
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  )?.trim();
  // Canonical name: SUPABASE_SERVICE_ROLE_KEY
  // Legacy fallbacks kept for backward compatibility
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const legacyKey = (
    process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE
  )?.trim();

  const resolvedKey = key || legacyKey;
  if (legacyKey && !key) {
    console.warn(
      "[supabase.admin] Using legacy env var name. Please rename to SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  if (!url || !resolvedKey) {
    throw new Error(
      "Configuração em falta: SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  _cached = createClient(url, resolvedKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return _cached;
}
