import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendStaffInviteEmail } from "@/lib/email/staff-invite";
import { getPlanEntitlements } from "@/lib/billing/plan-entitlements";
import { respondInternalError } from "@/lib/http/respond-internal-error";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, { params }: RouteContext) {
  try {
    const { id: inviteId } = await params;
    if (!inviteId) {
      return NextResponse.json({ error: "Convite inválido." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const admin = createAdminClient();

    const { data: invite, error: inviteError } = await admin
      .from("staff_invites")
      .select(
        "id, first_name, last_name, email, role, invite_code, accepted_at, age_group_id, club_id",
      )
      .eq("id", inviteId)
      .maybeSingle();

    if (inviteError || !invite) {
      return NextResponse.json({ error: "Convite não encontrado." }, { status: 404 });
    }

    if (invite.accepted_at) {
      return NextResponse.json(
        { error: "Este convite já foi aceite — não pode ser reenviado." },
        { status: 400 },
      );
    }

    // Autorizar: age_group coordinator OU club coordinator do mesmo clube
    let authorized = false;
    if (invite.age_group_id) {
      const { data: managedAgeGroup } = await admin
        .from("age_groups")
        .select("id")
        .eq("id", invite.age_group_id)
        .eq("coordinator_id", user.id)
        .maybeSingle();
      if (managedAgeGroup) authorized = true;
    }

    if (!authorized && invite.club_id) {
      const { data: clubMembership } = await admin
        .from("club_memberships")
        .select("role")
        .eq("profile_id", user.id)
        .eq("club_id", invite.club_id)
        .in("role", ["coordinator", "club_coordinator", "owner", "admin"])
        .maybeSingle();
      if (clubMembership) authorized = true;
    }

    if (!authorized) {
      return NextResponse.json(
        { error: "Apenas o coordenador pode reenviar convites." },
        { status: 403 },
      );
    }

    // 🚧 Fronteira de entitlement: o plano individual nao reenvia convites de
    // staff (rota equivalente a criar staff). Fonte canonica: getPlanEntitlements.
    const { data: clubPlan } = await admin
      .from("clubs")
      .select("plan_type")
      .eq("id", invite.club_id)
      .maybeSingle();
    if (!getPlanEntitlements(clubPlan?.plan_type ?? null).canInviteStaff) {
      return NextResponse.json(
        { error: "O teu plano não inclui equipa técnica. Add-on em breve." },
        { status: 403 },
      );
    }

    // Buscar dados para o email: clube + escalão + nome do coordenador
    const [clubRes, ageGroupRes, coordProfileRes] = await Promise.all([
      invite.club_id
        ? admin.from("clubs").select("name").eq("id", invite.club_id).maybeSingle()
        : Promise.resolve({ data: null }),
      invite.age_group_id
        ? admin
            .from("age_groups")
            .select("name, club_name")
            .eq("id", invite.age_group_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      admin.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    ]);

    const clubName =
      ageGroupRes.data?.club_name ?? clubRes.data?.name ?? "o teu clube";
    const ageGroupName = ageGroupRes.data?.name ?? null;
    const coordinatorName =
      coordProfileRes.data?.full_name ??
      (typeof user.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name
        : "O coordenador");

    const emailResult = await sendStaffInviteEmail({
      to: invite.email,
      firstName: invite.first_name,
      inviteCode: invite.invite_code,
      role: invite.role,
      clubName,
      ageGroupName,
      coordinatorName,
    });

    if (!emailResult.sent) {
      const reason =
        emailResult.reason === "missing_api_key"
          ? "Serviço de email não configurado (RESEND_API_KEY em falta)."
          : `Falha ao enviar email: ${emailResult.error ?? "erro desconhecido"}`;
      return NextResponse.json({ error: reason }, { status: 500 });
    }

    await admin
      .from("staff_invites")
      .update({ invite_sent_at: new Date().toISOString() })
      .eq("id", invite.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    return respondInternalError("api.invite.staff.id.resend", error);
  }
}
