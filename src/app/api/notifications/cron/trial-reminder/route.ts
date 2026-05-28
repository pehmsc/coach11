import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Cron: envia email "trial a terminar" no dia 5 (2 dias antes do fim do trial 7d).
 *
 * Corre diariamente as 09:00 UTC via Vercel Cron.
 *
 * Selecciona clubes com:
 * - subscription_status = 'trialing'
 * - trial_ends_at entre amanha e depois de amanha (>= now+1d, < now+2d)
 * - trial_reminder_sent_at IS NULL (idempotencia)
 *
 * Envia email Resend e marca trial_reminder_sent_at.
 */
export async function GET(request: NextRequest) {
  const secret = request.headers.get("authorization");
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json(
      { sent: 0, warning: "RESEND_API_KEY em falta" },
      { status: 200 },
    );
  }

  const admin = createAdminClient();
  const now = new Date();
  const tomorrowStart = new Date(now);
  tomorrowStart.setUTCHours(0, 0, 0, 0);
  tomorrowStart.setUTCDate(tomorrowStart.getUTCDate() + 1);
  const dayAfterStart = new Date(tomorrowStart);
  dayAfterStart.setUTCDate(dayAfterStart.getUTCDate() + 2);

  // Janela: trial_ends_at no intervalo [tomorrow, day+2) -> reminders 2 dias antes
  const { data: clubs, error } = await admin
    .from("clubs")
    .select(
      "id, name, billing_email, pending_coordinator_email, pending_coordinator_name, trial_ends_at",
    )
    .eq("subscription_status", "trialing")
    .gte("trial_ends_at", tomorrowStart.toISOString())
    .lt("trial_ends_at", dayAfterStart.toISOString())
    .is("trial_reminder_sent_at", null);

  if (error) {
    return NextResponse.json(
      { error: `Erro a carregar clubes: ${error.message}` },
      { status: 500 },
    );
  }

  if (!clubs || clubs.length === 0) {
    return NextResponse.json({ sent: 0 });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const fromEmail =
    process.env.RESEND_FROM_EMAIL || "Coach11 <noreply@coach11.app>";

  let sent = 0;
  let failed = 0;

  for (const club of clubs) {
    const recipient =
      club.billing_email || club.pending_coordinator_email || null;
    if (!recipient) {
      failed += 1;
      continue;
    }

    const greeting = club.pending_coordinator_name
      ? `Olá ${club.pending_coordinator_name},`
      : "Olá,";
    const trialEndLabel = club.trial_ends_at
      ? new Intl.DateTimeFormat("pt-PT", {
          day: "2-digit",
          month: "long",
        }).format(new Date(club.trial_ends_at))
      : "em breve";

    const { error: emailErr } = await resend.emails.send({
      from: fromEmail,
      to: [recipient],
      subject: `O teu trial Coach11 termina em 2 dias`,
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
              <p>O teu trial termina em <strong>${trialEndLabel}</strong>. A partir daí cobramos <strong>€7,99/mês</strong> automaticamente — podes cancelar até essa data sem pagares nada.</p>
              <p>Se queres continuar, não precisas de fazer nada. Se preferes cancelar:</p>
              <a href="https://coach11.app/settings?tab=subscription"
                style="display:block;background:#059669;color:white;text-decoration:none;text-align:center;padding:12px;border-radius:10px;margin-top:20px;font-weight:600;">
                Gerir subscrição
              </a>
              <p style="color:#64748b;font-size:12px;margin-top:24px;">
                Em caso de dúvidas: <a href="mailto:billing@coach11.app" style="color:#059669;">billing@coach11.app</a>.
              </p>
            </div>
          </div>
        </div>
      `,
    });

    if (emailErr) {
      failed += 1;
      continue;
    }

    await admin
      .from("clubs")
      .update({ trial_reminder_sent_at: new Date().toISOString() })
      .eq("id", club.id);
    sent += 1;
  }

  return NextResponse.json({ sent, failed, total: clubs.length });
}
