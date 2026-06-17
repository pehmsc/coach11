import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUserTeamContext } from "@/lib/auth/team-context";
import {
  getPlanEntitlements,
  type PlanEntitlements,
} from "@/lib/billing/plan-entitlements";

/**
 * Gates de acesso por entitlement de plano, para Server Components (layout/page).
 *
 * Porque existe: o RLS isola DADOS (um individual nunca ve outro clube), mas nao
 * cobre o TIER — o RLS scope por posse, nao por plano. E o proxy (src/proxy.ts)
 * redirige por COOKIE (best-effort, intermitente). Este gate le o plan_type da
 * SESSAO (auth.getUser -> clube), pelo que e a garantia "nem por navegacao
 * directa", independente do cookie.
 *
 * Fonte canonica dos limites: getPlanEntitlements (plan-entitlements.ts).
 */
async function redirectUnlessEntitled(
  allows: (entitlements: PlanEntitlements) => boolean,
  redirectTo: string,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Sem sessao: o (dashboard) layout ja trata disto, mas fechamos por seguranca.
  if (!user) redirect("/login");

  // Super-coordinator (admin de plataforma) nunca e barrado por tier de plano.
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_super_coordinator")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.is_super_coordinator === true) return;

  const context = await getCachedUserTeamContext(user.id);
  // Default conservador 'individual' quando o clube nao resolve (onboarding
  // incompleto): um gate fecha por omissao, nunca abre.
  const planType = context.club?.plan_type ?? "individual";

  if (!allows(getPlanEntitlements(planType))) {
    redirect(redirectTo);
  }
}

/**
 * Superficies multi-team (ex. /teams). Indisponiveis ao individual (1 escalao).
 */
export async function assertMultiTeamAccessOrRedirect(
  redirectTo = "/dashboard",
): Promise<void> {
  await redirectUnlessEntitled((e) => e.maxAgeGroups > 1, redirectTo);
}

/**
 * Gestao de equipa tecnica (ex. /club?tab=members). Indisponivel ao individual.
 */
export async function assertStaffManagementAccessOrRedirect(
  redirectTo = "/dashboard",
): Promise<void> {
  await redirectUnlessEntitled((e) => e.canInviteStaff, redirectTo);
}
