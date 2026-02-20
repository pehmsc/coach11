import { createClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase com service role key — bypassa todas as RLS policies.
 * Usar APENAS em API routes server-side para operações que requerem privilégios elevados.
 * NUNCA expor no cliente (browser).
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY não está definida nas variáveis de ambiente.",
    );
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
