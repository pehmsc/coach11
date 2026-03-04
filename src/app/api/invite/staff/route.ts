import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Resend } from "resend";
import { NextResponse } from "next/server";
import { z } from "zod";
import { checkInviteSendLimit } from "@/lib/rate-limit";
import { normalizeEmail } from "@/lib/auth/beta-access";
import { ensureInviteAuthUser } from "@/lib/auth/invite-auth-user";
import { getCanonicalAppUrl } from "@/lib/config/canonical-app-url";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import { resolveUserTeamContext } from "@/lib/auth/team-context";

export const runtime = "nodejs";

function generateCode(length = 8): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => chars[b % chars.length]).join("");
}

const StaffInviteSchema = z.object({
  // QC-04: mínimo 2 caracteres para prevenir nomes triviais (ex: "A").
  firstName: z.string().trim().min(2, "O primeiro nome deve ter pelo menos 2 caracteres.").max(100),
  lastName: z.string().trim().min(2, "O apelido deve ter pelo menos 2 caracteres.").max(100),
  email: z.string().email().max(254),
  phone: z.string().max(20).nullable().optional(),
  role: z.enum(["coach", "assistant_coach"]),
});

const roleLabel: Record<string, string> = {
  coach: "Treinador Principal",
  assistant_coach: "Treinador Adjunto",
};

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();

    // 🔐 Autenticação
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    // 🚦 Rate limiting: máx 5 convites por utilizador em 15 minutos
    const rateLimitExceeded = await checkInviteSendLimit(supabase, user.id);
    if (rateLimitExceeded) {
      return NextResponse.json(
        { error: "Demasiados pedidos. Tenta mais tarde." },
        { status: 429 },
      );
    }

    const context = await resolveUserTeamContext(admin, user.id);
    if (context.source !== "coordinator" || !context.ageGroup?.id) {
      return NextResponse.json(
        { error: "Apenas o coordenador pode enviar convites." },
        { status: 403 },
      );
    }

    const { data: requesterProfile, error: requesterProfileError } = await admin
      .from("profiles")
      .select("id, is_super_coordinator")
      .eq("id", user.id)
      .maybeSingle();

    if (requesterProfileError) {
      return NextResponse.json(
        { error: "Não foi possível validar as permissões do convite." },
        { status: 500 },
      );
    }

    const isSuperCoordinator = requesterProfile?.is_super_coordinator === true;

    // 🏟 Buscar escalão ativo do coordenador
    let ageGroupQuery = admin
      .from("age_groups")
      .select("id, name, club_name, club_id")
      .eq("id", context.ageGroup.id);

    if (!isSuperCoordinator) {
      ageGroupQuery = ageGroupQuery.eq("coordinator_id", user.id);
    }

    const { data: ageGroup, error: ageGroupError } = await ageGroupQuery.maybeSingle();

    if (ageGroupError || !ageGroup) {
      return NextResponse.json(
        { error: "Escalão não encontrado" },
        { status: 404 },
      );
    }

    if (!isSuperCoordinator) {
      const { data: ageGroupTeams, error: teamsError } = await admin
        .from("teams")
        .select("id")
        .eq("age_group_id", ageGroup.id);

      if (teamsError) {
        return NextResponse.json(
          { error: "Não foi possível validar o limite de convites." },
          { status: 500 },
        );
      }

      const teamIds = (ageGroupTeams || [])
        .map((team) => team.id)
        .filter((teamId): teamId is string => typeof teamId === "string");

      const [staffMembersRes, pendingInvitesRes] = await Promise.all([
        teamIds.length > 0
          ? admin.from("team_staff").select("id").in("team_id", teamIds)
          : Promise.resolve({ data: [], error: null }),
        admin
          .from("staff_invites")
          .select("id")
          .eq("age_group_id", ageGroup.id)
          .is("accepted_at", null),
      ]);

      if (staffMembersRes.error || pendingInvitesRes.error) {
        return NextResponse.json(
          { error: "Não foi possível validar o limite de convites." },
          { status: 500 },
        );
      }

      const activeTechnicalStaffCount = (staffMembersRes.data || []).length;
      const pendingTechnicalInviteCount = (pendingInvitesRes.data || []).length;

      if (activeTechnicalStaffCount + pendingTechnicalInviteCount >= 1) {
        return NextResponse.json(
          {
            error:
              "Este escalão já atingiu o limite atual de 1 membro de equipa técnica convidado. Remove o convite atual ou fala com o coordenador principal.",
          },
          { status: 409 },
        );
      }
    }

    // 📩 Validar dados do convite
    const body = await request.json().catch(() => null);
    const parsed = StaffInviteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos.", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const { firstName, lastName, email, phone, role } = parsed.data;
    const normalizedEmail = normalizeEmail(email);

    // 🔑 Gerar código único
    let inviteCode = generateCode();
    let attempts = 0;

    while (attempts < 5) {
      const { data: existing } = await admin
        .from("staff_invites")
        .select("id")
        .eq("invite_code", inviteCode)
        .maybeSingle();

      if (!existing) break;

      inviteCode = generateCode();
      attempts++;
    }

    // 💾 Guardar convite na DB
    const { data: createdInvite, error: dbError } = await admin
      .from("staff_invites")
      .insert({
        club_id: ageGroup.club_id,
        age_group_id: ageGroup.id,
        invited_by: user.id,
        first_name: firstName,
        last_name: lastName,
        email: normalizedEmail,
        phone: phone || null,
        role,
        invite_code: inviteCode,
      })
      .select("id")
      .maybeSingle();

    if (dbError) {
      console.error("Erro ao criar convite:", dbError);
      return NextResponse.json(
        { error: "Erro ao criar convite" },
        { status: 500 },
      );
    }

    try {
      await ensureInviteAuthUser(admin, {
        email: normalizedEmail,
        fullName: `${firstName} ${lastName}`.trim(),
        role: "coach",
      });
    } catch (error) {
      await admin.from("staff_invites").delete().eq("id", createdInvite?.id ?? "");
      return respondInternalError("api.invite.staff.post.ensure-auth-user", error);
    }

    // 👤 Nome do coordenador
    let coordinatorName = "O coordenador";

    const { data: profile } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.full_name) {
      coordinatorName = profile.full_name;
    } else if (user.user_metadata?.full_name) {
      coordinatorName = user.user_metadata.full_name;
    }

    // 🔗 URL registo (base canónica, sem host headers)
    const appUrl = getCanonicalAppUrl();
    const inviteUrl = `${appUrl}/invite?code=${inviteCode}&email=${encodeURIComponent(normalizedEmail)}`;

    // 📧 Configuração Resend
    if (!process.env.RESEND_API_KEY) {
      console.error("RESEND_API_KEY não definida.");
      return NextResponse.json({
        success: true,
        inviteId: createdInvite?.id ?? null,
        inviteCode,
        emailSent: false,
        warning: "Convite criado mas email não enviado (API key em falta).",
      });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);

    const fromEmail =
      process.env.RESEND_FROM_EMAIL || "Coach11 <noreply@coach11.app>";

    // ✉️ Enviar email
    const { error: emailError } = await resend.emails.send({
      from: fromEmail,
      to: [normalizedEmail],
      subject: `Convite para juntar ao ${ageGroup.club_name} — ${ageGroup.name}`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;padding:20px;">
          <div style="max-width:480px;margin:auto;background:#ffffff;border-radius:16px;overflow:hidden;">
            <div style="background:#0f172a;padding:28px;text-align:center;">
              <h1 style="color:#ffffff;margin:0;font-size:28px;font-weight:800;">
                COACH<span style="color:#34d399;">11</span>
              </h1>
            </div>
            <div style="padding:32px;">
              <p>Olá, <strong>${firstName}</strong>!</p>
              <p><strong>${coordinatorName}</strong> convidou-te para:</p>
              <p style="font-weight:600;">${ageGroup.club_name} · ${ageGroup.name}</p>
              <p>Função: ${roleLabel[role] || role}</p>
              <div style="margin:20px 0;padding:16px;border:2px dashed #cbd5e1;border-radius:12px;text-align:center;">
                <span style="font-size:24px;font-weight:800;letter-spacing:6px;">
                  ${inviteCode}
                </span>
              </div>
              <a href="${inviteUrl}"
                style="display:block;background:#059669;color:white;text-decoration:none;text-align:center;padding:12px;border-radius:10px;">
                Criar conta e aceitar convite →
              </a>
            </div>
          </div>
        </div>
      `,
    });

    if (emailError) {
      console.error("Resend error:", emailError);
      return NextResponse.json({
        success: true,
        inviteId: createdInvite?.id ?? null,
        inviteCode,
        emailSent: false,
        warning: "Convite criado mas email não enviado.",
      });
    }
    return NextResponse.json({
      success: true,
      inviteId: createdInvite?.id ?? null,
      inviteCode,
      emailSent: true,
    });
  } catch (error) {
    return respondInternalError("api.invite.staff.post", error);
  }
}
