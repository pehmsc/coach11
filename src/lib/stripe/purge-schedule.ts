/**
 * Decisao pura do agendamento de purga RGPD a partir do estado da subscricao.
 * Sem dependencias DB — usada pelo webhook Stripe e pelo fallback de checkout
 * (/billing/success) para manter o set/clear consistente nos dois caminhos.
 *
 * Regras (desenho fechado Bloco E):
 * - Apenas clubes plan_type='individual'. Sales-led nunca agenda purga.
 * - Cancelamento explicito (cancel_at_period_end=true ou status canceled)
 *   agenda data_purge_scheduled_at = fim do periodo pago + 60 dias.
 * - O agendamento so e definido quando ainda nao existe (a data nunca se move
 *   em eventos repetidos — os avisos d30/d53 dependem de uma data estavel).
 * - Reactivacao (active/trialing sem cancel_at_period_end) limpa agendamento
 *   e flags de aviso.
 */

export const PURGE_GRACE_DAYS = 60;

const DAY_MS = 86_400_000;

export interface PurgeClubState {
  plan_type: "individual" | "club";
  data_purge_scheduled_at: string | null;
}

export interface PurgeSubscriptionSnapshot {
  status: string;
  cancel_at_period_end: boolean;
  /** ISO; fim do periodo pago (current_period_end do Stripe). */
  current_period_end: string | null;
}

export type PurgeScheduleUpdate =
  | { kind: "set"; data_purge_scheduled_at: string }
  | { kind: "clear" }
  | { kind: "none" };

export function computePurgeScheduleUpdate(
  club: PurgeClubState,
  subscription: PurgeSubscriptionSnapshot,
  now: Date,
): PurgeScheduleUpdate {
  if (club.plan_type !== "individual") return { kind: "none" };

  const isCancellation =
    subscription.cancel_at_period_end === true ||
    subscription.status === "canceled";
  const isActive =
    !subscription.cancel_at_period_end &&
    (subscription.status === "active" || subscription.status === "trialing");

  if (isCancellation) {
    if (club.data_purge_scheduled_at) return { kind: "none" };
    const periodEnd = subscription.current_period_end
      ? new Date(subscription.current_period_end)
      : now;
    const base = Number.isNaN(periodEnd.getTime()) ? now : periodEnd;
    return {
      kind: "set",
      data_purge_scheduled_at: new Date(
        base.getTime() + PURGE_GRACE_DAYS * DAY_MS,
      ).toISOString(),
    };
  }

  if (isActive && club.data_purge_scheduled_at) {
    return { kind: "clear" };
  }

  return { kind: "none" };
}

/** Campos a aplicar no UPDATE de clubs para uma decisao de clear. */
export const PURGE_CLEAR_FIELDS = {
  data_purge_scheduled_at: null,
  purge_warning_d30_sent_at: null,
  purge_warning_d53_sent_at: null,
} as const;
