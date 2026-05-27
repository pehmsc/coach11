import "server-only";

import { Resend } from "resend";
import { formatCents, formatShortDate } from "@/lib/billing/invoice-helpers";
import { getCanonicalAppUrl } from "@/lib/config/canonical-app-url";

export interface InvoiceEmailPayload {
  to: string;
  clubName: string;
  recipientName?: string | null;
  invoiceNumber: string;
  amountCents: number;
  currency: string;
  issuedAt: string;
  dueDate: string;
}

export interface InvoiceEmailResult {
  sent: boolean;
  warning?: string;
}

/**
 * Envia email a notificar a emissao de uma nova factura.
 * Falha em soft-fail (devolve warning) — nao bloqueia a criacao da factura
 * se o Resend estiver indisponivel.
 */
export async function sendInvoiceIssuedEmail(
  payload: InvoiceEmailPayload,
): Promise<InvoiceEmailResult> {
  if (!process.env.RESEND_API_KEY) {
    return {
      sent: false,
      warning: "RESEND_API_KEY em falta — email nao enviado.",
    };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const fromEmail =
    process.env.RESEND_FROM_EMAIL || "Coach11 <noreply@coach11.app>";

  const appUrl = getCanonicalAppUrl();
  const billingUrl = `${appUrl}/club?tab=facturacao`;

  const greeting = payload.recipientName
    ? `Olá ${payload.recipientName},`
    : "Olá,";
  const amount = formatCents(payload.amountCents, payload.currency);
  const issuedAtLabel = formatShortDate(payload.issuedAt);
  const dueLabel = formatShortDate(payload.dueDate);

  const { error } = await resend.emails.send({
    from: fromEmail,
    to: [payload.to],
    subject: `Nova factura Coach11 · ${payload.invoiceNumber} · ${payload.clubName}`,
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;padding:20px;">
        <div style="max-width:520px;margin:auto;background:#ffffff;border-radius:16px;overflow:hidden;">
          <div style="background:#0f172a;padding:28px;text-align:center;">
            <h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:800;">
              COACH<span style="color:#34d399;">11</span>
            </h1>
            <p style="color:#94a3b8;margin:6px 0 0;font-size:12px;letter-spacing:0.05em;">FACTURA EMITIDA</p>
          </div>
          <div style="padding:32px;color:#0f172a;line-height:1.55;">
            <p>${greeting}</p>
            <p>Foi emitida uma nova factura para <strong>${payload.clubName}</strong>:</p>

            <table style="width:100%;margin:20px 0;border-collapse:collapse;font-size:14px;">
              <tr>
                <td style="padding:6px 0;color:#64748b;">N.º factura</td>
                <td style="padding:6px 0;text-align:right;font-family:monospace;">${payload.invoiceNumber}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#64748b;">Emissão</td>
                <td style="padding:6px 0;text-align:right;">${issuedAtLabel}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#64748b;">Vencimento</td>
                <td style="padding:6px 0;text-align:right;font-weight:600;">${dueLabel}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#64748b;">Valor</td>
                <td style="padding:6px 0;text-align:right;font-size:18px;font-weight:700;">${amount}</td>
              </tr>
            </table>

            <a href="${billingUrl}"
              style="display:block;background:#059669;color:white;text-decoration:none;text-align:center;padding:12px;border-radius:10px;margin-top:20px;font-weight:600;">
              Ver factura no Coach11
            </a>

            <p style="color:#64748b;font-size:12px;margin-top:24px;">
              Podes consultar e descarregar o PDF na secção "Facturação" da página do clube.
              Para questões: <a href="mailto:billing@coach11.app" style="color:#059669;">billing@coach11.app</a>.
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
