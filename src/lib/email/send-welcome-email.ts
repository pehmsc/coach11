import "server-only";

import { Resend } from "resend";
import { getCanonicalAppUrl } from "@/lib/config/canonical-app-url";

export interface WelcomeEmailResult {
  sent: boolean;
  warning?: string;
}

/**
 * Email de boas-vindas ao criar conta. Soft-fail — nunca bloqueia o registo.
 */
export async function sendWelcomeEmail(
  to: string,
  fullName?: string | null,
): Promise<WelcomeEmailResult> {
  if (!process.env.RESEND_API_KEY) {
    return { sent: false, warning: "RESEND_API_KEY em falta" };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const fromEmail =
    process.env.RESEND_FROM_EMAIL || "Coach11 <noreply@coach11.app>";
  const appUrl = getCanonicalAppUrl();
  const greeting = fullName ? `Olá ${fullName},` : "Olá,";

  const { error } = await resend.emails.send({
    from: fromEmail,
    to: [to],
    subject: "Bem-vindo ao Coach11",
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
            <p>A tua conta Coach11 foi criada com sucesso. Já podes começar a gerir a tua equipa: convocatórias, treinos, jogos e presenças — tudo a partir do telemóvel.</p>
            <a href="${appUrl}/dashboard"
              style="display:block;background:#059669;color:white;text-decoration:none;text-align:center;padding:12px;border-radius:10px;margin-top:20px;font-weight:600;">
              Entrar no Coach11
            </a>
            <p style="color:#64748b;font-size:12px;margin-top:24px;">
              Precisas de ajuda? Responde a este email ou escreve para
              <a href="mailto:ola@coach11.app" style="color:#059669;">ola@coach11.app</a>.
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
