/**
 * Entitlements por plano — fonte unica do que cada tier inclui.
 *
 * Modelado como VALORES (nao `if individual` espalhado) para que add-ons
 * futuros (equipa extra, staff) subam os limites NUM SO sitio. Consumidores:
 * - criacao de escalao (limite maxAgeGroups) — ver POST /api/age-groups.
 * - convites de staff (canInviteStaff) — consumido pelo gating de paginas.
 */
export type PlanType = "individual" | "club";

export interface PlanEntitlements {
  /** Numero maximo de escaloes que o plano permite criar. */
  maxAgeGroups: number;
  /** Se o plano permite convidar equipa tecnica. */
  canInviteStaff: boolean;
}

/**
 * Resolve os entitlements a partir do plan_type do clube. Qualquer valor que
 * nao seja explicitamente 'individual' (incluindo null/missing e tiers futuros
 * como 'club_pro') comporta-se como 'club' — o modelo dominante e o default
 * conservador.
 */
export function getPlanEntitlements(planType: string | null | undefined): PlanEntitlements {
  if (planType === "individual") {
    return { maxAgeGroups: 1, canInviteStaff: false };
  }
  return { maxAgeGroups: Number.POSITIVE_INFINITY, canInviteStaff: true };
}
