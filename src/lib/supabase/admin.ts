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

let _cached: SupabaseClient<any> | null = null;

export function createAdminClient(): SupabaseClient<any> {
  if (_cached) return _cached;

  const url = (
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  )?.trim();
  const key = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE
  )?.trim();

  if (!url || !key) {
    throw new Error(
      "Configuração em falta: SUPABASE_SERVICE_ROLE_KEY (ou alias SUPABASE_SERVICE_KEY / SUPABASE_SERVICE_ROLE).",
    );
  }

  _cached = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return _cached;
}
