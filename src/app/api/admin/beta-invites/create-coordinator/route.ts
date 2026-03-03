import { NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  countActiveBetaCoordinatorInvites,
} from "@/lib/auth/beta-access.server";
import { normalizeEmail } from "@/lib/auth/beta-access";
import { ensureInviteAuthUser } from "@/lib/auth/invite-auth-user";
import { getCanonicalAppUrl } from "@/lib/config/canonical-app-url";
import { respondInternalError } from "@/lib/http/respond-internal-error";

export const runtime = "nodejs";

const CreateCoordinatorInviteSchema = z.object({
  email: z.string().email().max(254),
});

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id, is_super_coordinator, full_name")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      return NextResponse.json(
        { error: "Não foi possível validar permissões." },
        { status: 500 },
      );
    }

    if (!profile?.is_super_coordinator) {
      return NextResponse.json(
        { error: "Apenas o coordenador principal pode convidar coordenadores beta." },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = CreateCoordinatorInviteSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Email inválido.", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const email = normalizeEmail(parsed.data.email);
    const existingInviteCount = await countActiveBetaCoordinatorInvites(admin);

    const { data: existingInvite } = await admin
      .from("beta_invites")
      .select("id, email, invite_type, status, revoked_at, expires_at")
      .eq("email", email)
      .maybeSingle();

    const canReuseExisting =
      existingInvite?.invite_type === "beta_coordinator" &&
      (existingInvite.status === "sent" || existingInvite.status === "accepted") &&
      !existingInvite.revoked_at;

    if (!canReuseExisting && existingInviteCount >= 5) {
      return NextResponse.json(
        { error: "Já existem 5 convites beta_coordinator ativos." },
        { status: 409 },
      );
    }

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const { error: upsertError } = await admin.from("beta_invites").upsert({
      email,
      invite_type: "beta_coordinator",
      target_age_group_id: null,
      created_by_profile_id: user.id,
      status: "sent",
      expires_at: expiresAt,
      accepted_at: null,
      revoked_at: null,
      metadata: {},
    }, {
      onConflict: "email",
    });

    if (upsertError) {
      return NextResponse.json(
        { error: "Não foi possível criar o convite beta." },
        { status: 500 },
      );
    }

    try {
      await ensureInviteAuthUser(admin, {
        email,
        fullName: email.split("@")[0] || "Coordenador",
        role: "coordinator",
      });
    } catch (error) {
      return respondInternalError(
        "api.admin.beta-invites.create-coordinator.ensure-auth-user",
        error,
      );
    }

    const appUrl = getCanonicalAppUrl();
    const onboardingUrl = `${appUrl}/register?email=${encodeURIComponent(email)}`;

    let emailSent = false;
    let warning: string | null = null;

    if (process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const fromEmail =
        process.env.RESEND_FROM_EMAIL || "Coach11 <noreply@coach11.app>";

      const { error: emailError } = await resend.emails.send({
        from: fromEmail,
        to: [email],
        subject: "Convite Coach11 Beta",
        html: `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;padding:20px;">
            <div style="max-width:480px;margin:auto;background:#ffffff;border-radius:16px;overflow:hidden;">
              <div style="background:#0f172a;padding:28px;text-align:center;">
                <h1 style="color:#ffffff;margin:0;font-size:28px;font-weight:800;">
                  COACH<span style="color:#34d399;">11</span>
                </h1>
              </div>
              <div style="padding:32px;">
                <p>Olá!</p>
                <p>Recebeste um convite para entrares no beta privado do Coach11 como coordenador.</p>
                <p>Na primeira entrada vais criar o teu escalão e passar a ser o coordenador desse contexto.</p>
                <a href="${onboardingUrl}"
                  style="display:block;background:#059669;color:white;text-decoration:none;text-align:center;padding:12px;border-radius:10px;margin-top:20px;">
                  Entrar no beta
                </a>
              </div>
            </div>
          </div>
        `,
      });

      if (!emailError) {
        emailSent = true;
      } else {
        warning = "Convite criado, mas o email não foi enviado.";
      }
    } else {
      warning = "Convite criado sem envio de email (RESEND_API_KEY em falta).";
    }

    return NextResponse.json({
      success: true,
      email,
      onboardingUrl,
      expiresAt,
      emailSent,
      warning,
    });
  } catch (error) {
    return respondInternalError("api.admin.beta-invites.create-coordinator.post", error);
  }
}
