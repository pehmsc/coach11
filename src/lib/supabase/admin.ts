import "server-only";

import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase com service role key — bypassa todas as RLS policies.
 * NUNCA expor no cliente (browser).
 *
 * USAR APENAS NOS FICHEIROS DA ALLOWLIST (scripts/guard-domain-boundaries.mjs):
 * - AUTH_MGMT: auth.admin.createUser/deleteUser/updateUser (service_role obrigatório)
 * - PUBLIC_SSR: SSR sem sessão auth (service_role obrigatório)
 * - CRON/SERVICE: jobs sem sessão de utilizador
 *
 * PARA TODOS OS OUTROS CASOS: usar session client (createClient) + RLS policies.
 * O guard de arquitectura bloqueia novos usos não autorizados.
 */

let _cached: SupabaseClient | null = null;

export function createAdminClient(): SupabaseClient {
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
