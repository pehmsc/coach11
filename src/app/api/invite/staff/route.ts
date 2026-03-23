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
import { captureServerProductEvent } from "@/lib/observability/posthog-server";
import { resolveUserTeamContext } from "@/lib/auth/team-context";
import {
  getAgeGroupTechnicalStaffUsage,
  isTechnicalStaffLimitError,
  TECHNICAL_STAFF_LIMIT_ERROR_MESSAGE,
} from "@/lib/team/technical-staff-limit";

export const runtime = "nodejs";

function generateCode(length = 8): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => chars[b % chars.length]).join("");
}

const AreaPermissionsSchema = z.object({
  area: z.string().max(50),
  can_read: z.boolean().optional(),
  can_write: z.boolean().optional(),
  can_edit: z.boolean().optional(),
  can_delete: z.boolean().optional(),
});

const StaffInviteSchema = z.object({
  // QC-04: mínimo 2 caracteres para prevenir nomes triviais (ex: "A").
  firstName: z.string().trim().min(2, "O primeiro nome deve ter pelo menos 2 caracteres.").max(100),
  lastName: z.string().trim().min(2, "O apelido deve ter pelo menos 2 caracteres.").max(100),
  email: z.string().email().max(254),
  phone: z.string().max(20).nullable().optional(),
  role: z.enum([
    "club_coordinator",
    "age_group_coordinator",
    "head_coach",
    "assistant_coach",
    "intern_coach",
    "goalkeeper_coach",
    "fitness_coach",
    "physiotherapist",
    "doctor",
    "analyst",
    "team_manager",
  ]),
  permissions: z.array(AreaPermissionsSchema).max(20).optional(),
});

const roleLabel: Record<string, string> = {
  club_coordinator: "Coordenador de Clube",
  age_group_coordinator: "Coordenador de Escalão",
  head_coach: "Treinador Principal",
  assistant_coach: "Treinador Adjunto",
  intern_coach: "Treinador Estagiário",
  goalkeeper_coach: "Treinador de Guarda-Redes",
  fitness_coach: "Preparador Físico",
  physiotherapist: "Fisioterapeuta",
  doctor: "Médico",
  analyst: "Analista / Observador",
  team_manager: "Team Manager",
};

export async function POST(request: Request) {
  let userId: string | null = null;
  let ageGroupId: string | null = null;

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
    userId = user.id;

    // TODO: re-enable rate limiting when beta phase ends (BUG-4 removed for beta)
    // const rateLimitExceeded = await checkInviteSendLimit(supabase, user.id);
    // if (rateLimitExceeded) {
    //   return NextResponse.json(
    //     { error: "Demasiados pedidos. Tenta mais tarde." },
    //     { status: 429 },
    //   );
    // }

    const context = await resolveUserTeamContext(admin, user.id);
    if ((context.source !== "coordinator" && context.source !== "club_coordinator") || !context.ageGroup?.id) {
      return NextResponse.json(
        { error: "Apenas o coordenador pode enviar convites." },
        { status: 403 },
      );
    }

    // 🏟 Buscar escalão ativo do coordenador
    // club_coordinator: pode convidar para qualquer escalão do seu clube
    // coordinator (age_group): só pode convidar para o seu próprio escalão
    let ageGroupBaseQuery = admin
      .from("age_groups")
      .select("id, name, club_name, club_id")
      .eq("id", context.ageGroup.id);

    if (context.source === "club_coordinator") {
      if (!context.club?.id) {
        return NextResponse.json(
          { error: "Clube não encontrado para este coordenador." },
          { status: 404 },
        );
      }
      ageGroupBaseQuery = ageGroupBaseQuery.eq("club_id", context.club.id);
    } else {
      ageGroupBaseQuery = ageGroupBaseQuery.eq("coordinator_id", user.id);
    }

    const { data: ageGroup, error: ageGroupError } = await ageGroupBaseQuery.maybeSingle();

    if (ageGroupError || !ageGroup) {
      return NextResponse.json(
        { error: "Escalão não encontrado" },
        { status: 404 },
      );
    }
    ageGroupId = ageGroup.id;

    try {
      const usage = await getAgeGroupTechnicalStaffUsage(admin, ageGroup.id);

      if (usage.limitEnforced && (usage.remainingSlots ?? 0) <= 0) {
        return NextResponse.json(
          {
            error: `${TECHNICAL_STAFF_LIMIT_ERROR_MESSAGE} Remove o membro atual ou um convite pendente antes de enviar outro.`,
          },
          { status: 409 },
        );
      }
    } catch {
      return NextResponse.json(
        { error: "Não foi possível validar o limite de convites." },
        { status: 500 },
      );
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
    const { firstName, lastName, email, phone, role, permissions } = parsed.data;

    // Validação server-side de quem pode convidar quem
    const STAFF_ROLES = [
      "head_coach", "assistant_coach", "intern_coach", "goalkeeper_coach",
      "fitness_coach", "physiotherapist", "doctor", "analyst", "team_manager",
    ];
    if (role === "club_coordinator") {
      // Só club_coordinator pode convidar outro club_coordinator
      if (context.source !== "club_coordinator") {
        return NextResponse.json(
          { error: "Apenas o coordenador de clube pode convidar coordenadores de clube." },
          { status: 403 },
        );
      }
    } else if (role === "age_group_coordinator") {
      // club_coordinator e age_group coordinator podem delegar coordenação de escalão
      if (context.source !== "club_coordinator" && context.source !== "coordinator") {
        return NextResponse.json(
          { error: "Apenas um coordenador pode convidar coordenadores de escalão." },
          { status: 403 },
        );
      }
    } else if (!STAFF_ROLES.includes(role)) {
      return NextResponse.json(
        { error: "Cargo inválido para convite." },
        { status: 400 },
      );
    }

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
    // Normalizar permissões: can_read é sempre true
    const initialPermissions = permissions && permissions.length > 0
      ? permissions.map((p) => ({
          area: p.area,
          can_read: true,
          can_write: p.can_write ?? false,
          can_edit: p.can_edit ?? false,
          can_delete: p.can_delete ?? false,
        }))
      : null;

    const { data: createdInvite, error: dbError } = await admin
      .from("staff_invites")
      .insert({
        club_id: ageGroup.club_id,
        // club_coordinator não precisa de age_group — âmbito é o clube inteiro
        // age_group_coordinator e staff técnico têm âmbito de escalão
        age_group_id: role === "club_coordinator" ? null : ageGroup.id,
        invited_by: user.id,
        first_name: firstName,
        last_name: lastName,
        email: normalizedEmail,
        phone: phone || null,
        role,
        invite_code: inviteCode,
        initial_permissions: initialPermissions,
      })
      .select("id")
      .maybeSingle();

    if (dbError) {
      console.error("Erro ao criar convite:", dbError);
      if (isTechnicalStaffLimitError(dbError)) {
        return NextResponse.json(
          {
            error: `${TECHNICAL_STAFF_LIMIT_ERROR_MESSAGE} Remove o membro atual ou um convite pendente antes de enviar outro.`,
          },
          { status: 409 },
        );
      }
      return NextResponse.json(
        { error: "Erro ao criar convite" },
        { status: 500 },
      );
    }

    // club_coordinator → profiles.role = "coordinator" (umbrella correcto)
    // staff técnico → profiles.role = "coach"
    const profileRole: "coordinator" | "coach" =
      role === "club_coordinator" ? "coordinator" : "coach";

    try {
      const profileRole: "coordinator" | "coach" =
        role === "club_coordinator" || role === "age_group_coordinator" ? "coordinator" : "coach";
      await ensureInviteAuthUser(admin, {
        email: normalizedEmail,
        fullName: `${firstName} ${lastName}`.trim(),
        role: profileRole,
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
      await captureServerProductEvent({
        distinctId: user.id,
        event: "staff_invited",
        properties: {
          age_group_id: ageGroup.id,
          invite_role: role,
          invite_id: createdInvite?.id ?? null,
          email_sent: false,
        },
      });
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
      await captureServerProductEvent({
        distinctId: user.id,
        event: "staff_invited",
        properties: {
          age_group_id: ageGroup.id,
          invite_role: role,
          invite_id: createdInvite?.id ?? null,
          email_sent: false,
        },
      });
      return NextResponse.json({
        success: true,
        inviteId: createdInvite?.id ?? null,
        inviteCode,
        emailSent: false,
        warning: "Convite criado mas email não enviado.",
      });
    }
    await captureServerProductEvent({
      distinctId: user.id,
      event: "staff_invited",
      properties: {
        age_group_id: ageGroup.id,
        invite_role: role,
        invite_id: createdInvite?.id ?? null,
        email_sent: true,
      },
    });
    return NextResponse.json({
      success: true,
      inviteId: createdInvite?.id ?? null,
      inviteCode,
      emailSent: true,
    });
  } catch (error) {
    return respondInternalError("api.invite.staff.post", error, {
      request,
      userId,
      ageGroupId,
    });
  }
}
