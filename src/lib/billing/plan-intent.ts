/**
 * Intencao de plano persistida em cookie (client-side).
 *
 * Problema que resolve: a intencao "treinador individual" precisa de sobreviver
 * desde o clique em /precos ate o onboarding criar o clube. Query params perdem-se
 * em OAuth redirects, refreshes e navegacao directa. Um cookie sobrevive a tudo isto.
 *
 * Fluxo:
 * - /precos: botao Individual escreve o cookie antes de navegar (setPlanIntent)
 * - /onboarding: le o cookie (readPlanIntent) para decidir plan_type
 * - apos criar o clube: limpa o cookie (clearPlanIntent)
 */

export const PLAN_INTENT_COOKIE = "coach11_intended_plan";

export type PlanIntent = "individual";

/** Escreve o cookie de intencao de plano (1h, lax). Client-only. */
export function setPlanIntent(plan: PlanIntent): void {
  if (typeof document === "undefined") return;
  document.cookie = `${PLAN_INTENT_COOKIE}=${plan}; path=/; max-age=3600; samesite=lax`;
}

/** Le o cookie de intencao de plano. Client-only. */
export function readPlanIntent(): PlanIntent | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${PLAN_INTENT_COOKIE}=([^;]+)`),
  );
  const value = match?.[1];
  return value === "individual" ? "individual" : null;
}

/** Limpa o cookie de intencao de plano. Client-only. */
export function clearPlanIntent(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${PLAN_INTENT_COOKIE}=; path=/; max-age=0; samesite=lax`;
}
