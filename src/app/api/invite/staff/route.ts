import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizeEmail } from "@/lib/auth/beta-access";
import { ensureInviteAuthUser } from "@/lib/auth/invite-auth-user";
import { sendStaffInviteEmail } from "@/lib/email/staff-invite";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import { captureServerProductEvent } from "@/lib/observability/posthog-server";
import { resolveUserTeamContext } from "@/lib/auth/team-context";
import {
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
  ageGroupIds: z.array(z.string().uuid()).min(1).max(20).optional(),
});

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

    // 📩 Ler body cedo para extrair ageGroupIds antes do lookup ao escalão
    const body = await request.json().catch(() => null);

    // 🏟 Buscar escalão ativo do coordenador
    // club_coordinator: pode convidar para qualquer escalão do seu clube
    // coordinator (age_group): só pode convidar para o seu próprio escalão
    // Quando ageGroupIds é fornecido pelo club_coordinator, usa o primeiro
    // como escalão de referência (nome no email + age_group_id no convite).
    const earlyAgeGroupIds = Array.isArray(body?.ageGroupIds)
      ? (body.ageGroupIds as unknown[]).filter((v): v is string => typeof v === "string")
      : null;
    const targetAgeGroupId =
      context.source === "club_coordinator" && earlyAgeGroupIds && earlyAgeGroupIds.length > 0
        ? earlyAgeGroupIds[0]
        : context.ageGroup.id;

    let ageGroupBaseQuery = admin
      .from("age_groups")
      .select("id, name, club_name, club_id")
      .eq("id", targetAgeGroupId);

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

    // 📩 Validar dados do convite
    const parsed = StaffInviteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos.", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const { firstName, lastName, email, phone, role, permissions, ageGroupIds } = parsed.data;

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

    // Quando club_coordinator passa ageGroupIds, usar o primeiro como age_group_id primário
    const primaryAgeGroupId = role === "club_coordinator"
      ? null
      : (ageGroupIds && ageGroupIds.length > 0 ? ageGroupIds[0] : ageGroup.id);
    const allAgeGroupIds = role === "club_coordinator"
      ? []
      : (ageGroupIds && ageGroupIds.length > 0 ? ageGroupIds : [ageGroup.id]);

    const { data: createdInvite, error: dbError } = await admin
      .from("staff_invites")
      .insert({
        club_id: ageGroup.club_id,
        // club_coordinator não precisa de age_group — âmbito é o clube inteiro
        // age_group_coordinator e staff técnico têm âmbito de escalão
        age_group_id: primaryAgeGroupId,
        age_group_ids: allAgeGroupIds,
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

    const emailResult = await sendStaffInviteEmail({
      to: normalizedEmail,
      firstName,
      inviteCode,
      role,
      clubName: ageGroup.club_name,
      ageGroupName: ageGroup.name,
      coordinatorName,
    });

    await captureServerProductEvent({
      distinctId: user.id,
      event: "staff_invited",
      properties: {
        age_group_id: ageGroup.id,
        invite_role: role,
        invite_id: createdInvite?.id ?? null,
        email_sent: emailResult.sent,
      },
    });

    if (!emailResult.sent) {
      const warning =
        emailResult.reason === "missing_api_key"
          ? "Convite criado mas email não enviado (API key em falta)."
          : "Convite criado mas email não enviado.";
      return NextResponse.json({
        success: true,
        inviteId: createdInvite?.id ?? null,
        inviteCode,
        emailSent: false,
        warning,
      });
    }

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
