import "server-only";

import { Resend } from "resend";
import { getCanonicalAppUrl } from "@/lib/config/canonical-app-url";

export interface PurgeWarningEmailResult {
  sent: boolean;
  warning?: string;
}

function formatPtDate(iso: string): string {
  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

function emailShell(inner: string): string {
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;padding:20px;">
      <div style="max-width:520px;margin:auto;background:#ffffff;border-radius:16px;overflow:hidden;">
        <div style="background:#0f172a;padding:28px;text-align:center;">
          <h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:800;">
            COACH<span style="color:#34d399;">11</span>
          </h1>
        </div>
        <div style="padding:32px;color:#0f172a;line-height:1.55;">
          ${inner}
        </div>
      </div>
    </div>
  `;
}

function getResendConfig() {
  if (!process.env.RESEND_API_KEY) return null;
  return {
    resend: new Resend(process.env.RESEND_API_KEY),
    fromEmail: process.env.RESEND_FROM_EMAIL || "Coach11 <noreply@coach11.app>",
    appUrl: getCanonicalAppUrl(),
  };
}

/**
 * d30 — lembrete a meio da janela de retencao, tom de win-back.
 */
export async function sendPurgeWarningD30(params: {
  to: string;
  fullName?: string | null;
  purgeScheduledAt: string;
}): Promise<PurgeWarningEmailResult> {
  const config = getResendConfig();
  if (!config) return { sent: false, warning: "RESEND_API_KEY em falta" };

  const greeting = params.fullName ? `Olá ${params.fullName},` : "Olá,";
  const purgeLabel = formatPtDate(params.purgeScheduledAt);

  const { error } = await config.resend.emails.send({
    from: config.fromEmail,
    to: [params.to],
    subject: "Os teus dados Coach11 ainda estão à tua espera",
    html: emailShell(`
      <p>${greeting}</p>
      <p>Já passou um mês desde que a tua subscrição Coach11 terminou — e está tudo como deixaste: plantel, treinos, jogos, presenças e estatísticas.</p>
      <p>Se voltares antes de <strong>${purgeLabel}</strong>, retomas a época exactamente onde ficou. Depois dessa data, os dados são eliminados de forma definitiva, conforme o RGPD.</p>
      <a href="${config.appUrl}/billing/start"
        style="display:block;background:#059669;color:white;text-decoration:none;text-align:center;padding:12px;border-radius:10px;margin-top:20px;font-weight:600;">
        Reactivar subscrição
      </a>
      <p style="color:#64748b;font-size:12px;margin-top:24px;">
        Saíste por algum motivo que possamos resolver? Responde a este email — lemos tudo.
      </p>
    `),
  });

  if (error) return { sent: false, warning: `Resend falhou: ${error.message}` };
  return { sent: true };
}

/**
 * d53 — aviso final: eliminacao definitiva em 7 dias. Assunto inequivoco.
 */
export async function sendPurgeWarningD53(params: {
  to: string;
  fullName?: string | null;
  purgeScheduledAt: string;
}): Promise<PurgeWarningEmailResult> {
  const config = getResendConfig();
  if (!config) return { sent: false, warning: "RESEND_API_KEY em falta" };

  const greeting = params.fullName ? `Olá ${params.fullName},` : "Olá,";
  const purgeLabel = formatPtDate(params.purgeScheduledAt);

  const { error } = await config.resend.emails.send({
    from: config.fromEmail,
    to: [params.to],
    subject: "Os teus dados Coach11 serão eliminados em 7 dias",
    html: emailShell(`
      <p>${greeting}</p>
      <p>Este é o último aviso: a <strong>${purgeLabel}</strong>, todos os dados da tua conta Coach11 (plantel, treinos, jogos, presenças, estatísticas) serão <strong>eliminados de forma definitiva</strong>, conforme o RGPD.</p>
      <p>Esta acção não é reversível. Para manter os teus dados, basta reactivar a subscrição antes dessa data.</p>
      <a href="${config.appUrl}/billing/start"
        style="display:block;background:#dc2626;color:white;text-decoration:none;text-align:center;padding:12px;border-radius:10px;margin-top:20px;font-weight:600;">
        Reactivar e manter os meus dados
      </a>
      <p style="color:#64748b;font-size:12px;margin-top:24px;">
        Dúvidas? Escreve para <a href="mailto:billing@coach11.app" style="color:#059669;">billing@coach11.app</a> antes do prazo.
      </p>
    `),
  });

  if (error) return { sent: false, warning: `Resend falhou: ${error.message}` };
  return { sent: true };
}
