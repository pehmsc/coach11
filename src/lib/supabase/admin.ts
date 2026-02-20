import { createClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase com service role key — bypassa todas as RLS policies.
 * Usar APENAS em API routes server-side para operações que requerem privilégios elevados.
 * NUNCA expor no cliente (browser).
 */
export function createAdminClient() {
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

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
