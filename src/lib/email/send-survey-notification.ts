import "server-only";

import { Resend } from "resend";

export interface SurveyNotificationResult {
  sent: boolean;
  warning?: string;
}

/**
 * Notificacao interna ao receber uma resposta do questionario de validacao.
 * Soft-fail — nunca bloqueia a resposta (o insert no Supabase e o que importa).
 * Reutiliza o wrapper Resend e a convencao de remetente dos restantes helpers
 * (RESEND_FROM_EMAIL || dominio verificado coach11.app).
 */
export async function sendSurveyNotification(args: {
  payload: Record<string, unknown>;
  email?: string | null;
}): Promise<SurveyNotificationResult> {
  if (!process.env.RESEND_API_KEY) {
    return { sent: false, warning: "RESEND_API_KEY em falta" };
  }

  const to =
    process.env.SURVEY_NOTIFY_EMAIL?.trim() ||
    process.env.SUPER_COORDINATOR_EMAIL?.trim() ||
    null;

  if (!to) {
    return { sent: false, warning: "Destinatario de notificacao em falta" };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const fromEmail =
    process.env.RESEND_FROM_EMAIL || "Coach11 <noreply@coach11.app>";

  const lead = args.email?.trim();
  const rows = Object.entries(args.payload)
    .map(([key, value]) => {
      const text = Array.isArray(value)
        ? value.join(", ")
        : value == null
          ? ""
          : String(value);
      return `<tr>
        <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:13px;vertical-align:top;white-space:nowrap;">${escapeHtml(
          key,
        )}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;color:#0f172a;font-size:13px;">${escapeHtml(
          text,
        )}</td>
      </tr>`;
    })
    .join("");

  const { error } = await resend.emails.send({
    from: fromEmail,
    to: [to],
    subject: "Nova resposta — Questionário Treinadores",
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;padding:20px;">
        <div style="max-width:640px;margin:auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
          <div style="background:#0f172a;padding:20px 28px;">
            <h1 style="color:#ffffff;margin:0;font-size:18px;font-weight:700;">
              Nova resposta ao questionário
            </h1>
          </div>
          <div style="padding:20px 28px;color:#0f172a;line-height:1.55;">
            ${
              lead
                ? `<p style="margin:0 0 16px;font-size:15px;"><strong>Lead:</strong> <a href="mailto:${escapeHtml(
                    lead,
                  )}" style="color:#059669;">${escapeHtml(lead)}</a></p>`
                : `<p style="margin:0 0 16px;font-size:13px;color:#94a3b8;">Sem email (resposta anónima).</p>`
            }
            <table style="width:100%;border-collapse:collapse;">${rows}</table>
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
