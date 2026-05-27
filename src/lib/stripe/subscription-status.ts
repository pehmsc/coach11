/**
 * Helpers para interpretar o estado da subscricao Stripe sincronizado em
 * clubs.subscription_status. Sem dependencias DB — apenas mapeamento puro.
 */

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "unpaid"
  | "paused";

export interface SubscriptionLike {
  subscription_status: SubscriptionStatus | null;
  trial_ends_at: string | null;
  subscription_current_period_end: string | null;
  subscription_cancel_at_period_end: boolean;
  plan_type: "individual" | "club";
}

/** Pode usar a app: total */
export function hasActiveAccess(sub: SubscriptionLike): boolean {
  // Clubes sales-led nao usam subscription_status — acesso e sempre permitido
  if (sub.plan_type === "club") return true;

  const s = sub.subscription_status;
  if (s === "trialing" || s === "active") return true;

  // past_due tem grace period de 3 dias (Stripe tenta cobrar varias vezes
  // antes de dar canceled). Read-only mas nao bloqueado totalmente.
  if (s === "past_due") return isWithinPastDueGracePeriod(sub);

  // canceled mas ainda dentro do periodo pago: acesso até current_period_end
  if (s === "canceled" && sub.subscription_current_period_end) {
    return new Date(sub.subscription_current_period_end) > new Date();
  }

  return false;
}

/** Estado de write durante past_due. */
export function isReadOnly(sub: SubscriptionLike): boolean {
  if (sub.plan_type === "club") return false;
  if (sub.subscription_status !== "past_due") return false;
  return !isWithinPastDueGracePeriod(sub);
}

/** Verifica se está dentro dos 3 dias de grace period após past_due. */
function isWithinPastDueGracePeriod(sub: SubscriptionLike): boolean {
  // Usamos current_period_end como proxy para o moment em que o pagamento
  // falhou (Stripe move para past_due quando a factura vence e nao paga).
  // Se nao temos current_period_end, assumimos fora de grace (seguro).
  if (!sub.subscription_current_period_end) return false;
  const periodEnd = new Date(sub.subscription_current_period_end);
  const now = new Date();
  const daysSinceFailure = Math.floor(
    (now.getTime() - periodEnd.getTime()) / 86_400_000,
  );
  return daysSinceFailure <= 3;
}

/** Numero de dias restantes do trial. 0 ou null se nao aplicavel. */
export function daysUntilTrialEnd(sub: SubscriptionLike): number | null {
  if (sub.subscription_status !== "trialing") return null;
  if (!sub.trial_ends_at) return null;
  const end = new Date(sub.trial_ends_at);
  const now = new Date();
  const diff = end.getTime() - now.getTime();
  if (diff <= 0) return 0;
  // Floor: 5d + 23h mostra "5 dias restantes" (mais natural que "6 dias").
  // Minimo 1 enquanto ha tempo (evita "0 dias" quando ainda ha umas horas).
  const floored = Math.floor(diff / 86_400_000);
  return floored > 0 ? floored : 1;
}

/** Label legivel para badge UI. */
export function subscriptionLabel(sub: SubscriptionLike): string {
  if (sub.plan_type === "club") return "Clube · sales-led";
  switch (sub.subscription_status) {
    case "trialing": {
      const days = daysUntilTrialEnd(sub);
      return days != null ? `Trial · ${days}d restantes` : "Trial";
    }
    case "active":
      return sub.subscription_cancel_at_period_end
        ? "Activo · cancelado no fim do período"
        : "Activo";
    case "past_due":
      return "Pagamento em atraso";
    case "canceled":
      return "Cancelado";
    case "incomplete":
    case "incomplete_expired":
      return "Subscrição incompleta";
    case "unpaid":
      return "Pagamento em falta";
    case "paused":
      return "Pausado";
    case null:
    default:
      return "Sem subscrição";
  }
}

/** Para onde redirigir quando o user nao tem acesso. */
export function blockedRedirectPath(sub: SubscriptionLike): string {
  // Sem subscription_status: ainda nao subscreveu — vai pra /precos
  if (sub.subscription_status === null) return "/precos";
  // incomplete: o checkout nao completou — vai pra /precos para tentar de novo
  if (
    sub.subscription_status === "incomplete" ||
    sub.subscription_status === "incomplete_expired"
  ) {
    return "/precos";
  }
  // canceled / past_due fora do grace / unpaid: pagina dedicada explicativa
  return "/billing/blocked";
}
