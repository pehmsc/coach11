/**
 * Decisao pura do cron de purga RGPD: dado o estado de um clube e um
 * momento simulavel, devolve a accao devida. Sem dependencias DB.
 *
 * Linha temporal (data_purge_scheduled_at = fim da subscricao + 60 dias):
 * - d30 (warn_d30): [agendado-30d, agendado-7d) — lembrete a meio da janela
 * - d53 (warn_d53): [agendado-7d, agendado)     — aviso final de 7 dias
 * - purge:          [agendado, ...)             — purga vencida
 *
 * As janelas sao disjuntas: se o d30 nunca foi enviado e ja estamos na
 * janela d53, o d30 e silenciosamente saltado (enviar "30 dias" a 5 dias
 * do fim seria enganador).
 *
 * Regras de seguranca (replicadas DENTRO da operacao de purga na route):
 * - Apenas plan_type='individual'. Sales-led NUNCA e elegivel.
 * - Subscricao activa (active/trialing) nunca e elegivel — defesa em
 *   profundidade caso o webhook de reactivacao nao tenha limpo o agendamento.
 */

export type PurgeAction = "purge" | "warn_d53" | "warn_d30" | "none";

export const PURGE_WARN_D30_DAYS_BEFORE = 30;
export const PURGE_WARN_D53_DAYS_BEFORE = 7;

const DAY_MS = 86_400_000;

export interface PurgeDecisionInput {
  plan_type: string;
  subscription_status: string | null;
  data_purge_scheduled_at: string | null;
  purge_warning_d30_sent_at: string | null;
  purge_warning_d53_sent_at: string | null;
}

export function computePurgeAction(
  club: PurgeDecisionInput,
  now: Date,
): PurgeAction {
  if (club.plan_type !== "individual") return "none";
  if (!club.data_purge_scheduled_at) return "none";

  const status = club.subscription_status;
  if (status === "active" || status === "trialing") return "none";

  const scheduled = new Date(club.data_purge_scheduled_at).getTime();
  if (Number.isNaN(scheduled)) return "none";

  const t = now.getTime();
  if (t >= scheduled) return "purge";

  if (t >= scheduled - PURGE_WARN_D53_DAYS_BEFORE * DAY_MS) {
    return club.purge_warning_d53_sent_at ? "none" : "warn_d53";
  }
  if (t >= scheduled - PURGE_WARN_D30_DAYS_BEFORE * DAY_MS) {
    return club.purge_warning_d30_sent_at ? "none" : "warn_d30";
  }
  return "none";
}

/**
 * Kill-switch PURGE_DRY_RUN: so o valor literal "false" desliga o dry-run.
 * Ausente, vazio ou qualquer outro valor => dry-run (default seguro no
 * primeiro deploy; a passagem a false e decisao manual).
 */
export function isPurgeDryRun(rawEnvValue: string | undefined): boolean {
  return rawEnvValue?.trim().toLowerCase() !== "false";
}
