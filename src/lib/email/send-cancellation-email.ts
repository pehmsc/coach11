import "server-only";

import { Resend } from "resend";
import { getCanonicalAppUrl } from "@/lib/config/canonical-app-url";

export interface CancellationEmailResult {
  sent: boolean;
  warning?: string;
}

function formatPtDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

/**
 * Email d0 — confirmacao de cancelamento da subscricao individual, com a
 * nota de retencao RGPD (dados disponiveis 60 dias, reactivacao a qualquer
 * momento). Soft-fail — nunca bloqueia o processamento do webhook.
 */
export async function sendCancellationEmail(params: {
  to: string;
  fullName?: string | null;
  /** ISO; fim do periodo pago (acesso mantem-se ate esta data). */
  accessUntil: string | null;
  /** ISO; data agendada da purga dos dados. */
  purgeScheduledAt: string;
}): Promise<CancellationEmailResult> {
  if (!process.env.RESEND_API_KEY) {
    return { sent: false, warning: "RESEND_API_KEY em falta" };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const fromEmail =
    process.env.RESEND_FROM_EMAIL || "Coach11 <noreply@coach11.app>";
  const appUrl = getCanonicalAppUrl();
  const greeting = params.fullName ? `Olá ${params.fullName},` : "Olá,";

  const accessUntilLabel = formatPtDate(params.accessUntil);
  const purgeLabel = formatPtDate(params.purgeScheduledAt) ?? "60 dias";

  const accessParagraph = accessUntilLabel
    ? `<p>A tua subscrição Coach11 foi cancelada. Continuas com acesso completo até <strong>${accessUntilLabel}</strong>.</p>`
    : `<p>A tua subscrição Coach11 foi cancelada.</p>`;

  const { error } = await resend.emails.send({
    from: fromEmail,
    to: [params.to],
    subject: "A tua subscrição Coach11 foi cancelada",
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;padding:20px;">
        <div style="max-width:520px;margin:auto;background:#ffffff;border-radius:16px;overflow:hidden;">
          <div style="background:#0f172a;padding:28px;text-align:center;">
            <h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:800;">
              COACH<span style="color:#34d399;">11</span>
            </h1>
          </div>
          <div style="padding:32px;color:#0f172a;line-height:1.55;">
            <p>${greeting}</p>
            ${accessParagraph}
            <p>Os teus dados (plantel, treinos, jogos, estatísticas) ficam disponíveis durante <strong>60 dias</strong> após o fim da subscrição — podes reactivar quando quiseres e retomar exactamente onde ficaste.</p>
            <p>Depois de <strong>${purgeLabel}</strong>, os dados são eliminados de forma definitiva, conforme o RGPD.</p>
            <a href="${appUrl}/settings?tab=subscription"
              style="display:block;background:#059669;color:white;text-decoration:none;text-align:center;padding:12px;border-radius:10px;margin-top:20px;font-weight:600;">
              Reactivar subscrição
            </a>
            <p style="color:#64748b;font-size:12px;margin-top:24px;">
              Cancelaste por algum problema? Responde a este email ou escreve para
              <a href="mailto:billing@coach11.app" style="color:#059669;">billing@coach11.app</a> — queremos ajudar.
            </p>
          </div>
        </div>
      </div>
    `,
  });

  if (error) {
    return { sent: false, warning: `Resend falhou: ${error.message}` };
  }
  return { sent: true };
}
