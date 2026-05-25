import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getSuperUserAccess } from "@/lib/auth/super-user.server";
import { ensureInviteAuthUser } from "@/lib/auth/invite-auth-user";
import { getCanonicalAppUrl } from "@/lib/config/canonical-app-url";
import { respondInternalError } from "@/lib/http/respond-internal-error";

export const runtime = "nodejs";

const INVITE_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const access = await getSuperUserAccess();
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const { id: clubId } = await context.params;

    const { data: club, error: clubError } = await access.admin
      .from("clubs")
      .select(
        "id, name, pending_coordinator_name, pending_coordinator_email",
      )
      .eq("id", clubId)
      .maybeSingle();

    if (clubError || !club) {
      return NextResponse.json(
        { error: "Clube nao encontrado." },
        { status: 404 },
      );
    }

    const pendingEmail = club.pending_coordinator_email;
    if (!pendingEmail) {
      return NextResponse.json(
        {
          error:
            "Sem coordenador pendente para este clube. Recolhe os dados no wizard primeiro.",
        },
        { status: 400 },
      );
    }

    const normalizedEmail = pendingEmail.toLowerCase().trim();

    // Reaproveita beta_invites com invite_type=beta_coordinator e metadata.club_id
    // para futuramente ligar redeem ao clube alvo.
    const expiresAt = new Date(Date.now() + INVITE_EXPIRY_MS).toISOString();
    const { error: upsertError } = await access.admin
      .from("beta_invites")
      .upsert(
        {
          email: normalizedEmail,
          invite_type: "beta_coordinator",
          target_age_group_id: null,
          created_by_profile_id: access.user.id,
          status: "sent",
          expires_at: expiresAt,
          accepted_at: null,
          revoked_at: null,
          metadata: { club_id: clubId, source: "admin_wizard" },
        },
        { onConflict: "email" },
      );

    if (upsertError) {
      return NextResponse.json(
        { error: `Nao foi possivel criar convite: ${upsertError.message}` },
        { status: 500 },
      );
    }

    try {
      await ensureInviteAuthUser(access.admin, {
        email: normalizedEmail,
        fullName:
          club.pending_coordinator_name ||
          normalizedEmail.split("@")[0] ||
          "Coordenador",
        role: "coordinator",
      });
    } catch (error) {
      return respondInternalError(
        "api.admin.clubs.invite-coordinator.ensure-auth-user",
        error,
      );
    }

    const appUrl = getCanonicalAppUrl();
    const onboardingUrl = `${appUrl}/beta-invite?email=${encodeURIComponent(normalizedEmail)}`;

    let emailSent = false;
    let warning: string | null = null;

    if (process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const fromEmail =
        process.env.RESEND_FROM_EMAIL || "Coach11 <noreply@coach11.app>";

      const { error: emailError } = await resend.emails.send({
        from: fromEmail,
        to: [normalizedEmail],
        subject: `Convite Coach11 — ${club.name}`,
        html: `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;padding:20px;">
            <div style="max-width:480px;margin:auto;background:#ffffff;border-radius:16px;overflow:hidden;">
              <div style="background:#0f172a;padding:28px;text-align:center;">
                <h1 style="color:#ffffff;margin:0;font-size:28px;font-weight:800;">
                  COACH<span style="color:#34d399;">11</span>
                </h1>
              </div>
              <div style="padding:32px;color:#0f172a;">
                <p>Olá ${club.pending_coordinator_name || ""}!</p>
                <p>Recebes este convite para acederes ao Coach11 como coordenador de <strong>${club.name}</strong>.</p>
                <p>Na primeira entrada, completas o teu perfil e começas a usar a plataforma.</p>
                <a href="${onboardingUrl}"
                  style="display:block;background:#059669;color:white;text-decoration:none;text-align:center;padding:12px;border-radius:10px;margin-top:20px;font-weight:600;">
                  Entrar no Coach11
                </a>
                <p style="color:#64748b;font-size:12px;margin-top:24px;">
                  Convite válido durante 30 dias.
                </p>
              </div>
            </div>
          </div>
        `,
      });

      if (!emailError) {
        emailSent = true;
      } else {
        warning = "Convite criado, mas o email nao foi enviado.";
      }
    } else {
      warning = "Convite criado sem envio de email (RESEND_API_KEY em falta).";
    }

    // Marca timestamp do envio (mesmo que email tenha falhado — o convite existe).
    await access.admin
      .from("clubs")
      .update({ pending_coordinator_invite_sent_at: new Date().toISOString() })
      .eq("id", clubId);

    return NextResponse.json({
      success: true,
      email: normalizedEmail,
      onboardingUrl,
      expiresAt,
      emailSent,
      warning,
    });
  } catch (error) {
    return respondInternalError("api.admin.clubs.invite-coordinator.post", error);
  }
}
