import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    // Cliente regular apenas para autenticar o utilizador
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    let inviteCode: string | undefined;
    try {
      const body = await request.json();
      inviteCode = body?.inviteCode;
    } catch {
      return NextResponse.json(
        { error: "Payload inválido no pedido." },
        { status: 400 },
      );
    }

    if (!inviteCode || typeof inviteCode !== "string") {
      return NextResponse.json(
        { error: "Código de convite em falta" },
        { status: 400 },
      );
    }

    const code = inviteCode.trim().toUpperCase();

    // Admin client: bypassa RLS para todas as operações de escrita
    const admin = createAdminClient();

    // 1. Buscar convite (aceite ou pendente)
    const { data: invite, error: inviteError } = await admin
      .from("staff_invites")
      .select("*")
      .eq("invite_code", code)
      .maybeSingle();

    if (inviteError) {
      console.error("Erro ao buscar convite:", code, inviteError.message);
      return NextResponse.json(
        { error: "Erro ao validar o código de convite." },
        { status: 500 },
      );
    }

    if (!invite) {
      return NextResponse.json(
        { error: "Código inválido ou já utilizado" },
        { status: 404 },
      );
    }

    // Idempotência: se já foi aceite por este utilizador, considerar sucesso lógico
    if (invite.accepted_at) {
      if (invite.accepted_by === user.id) {
        return NextResponse.json(
          { error: "Já estás associado a este escalão" },
          { status: 409 },
        );
      }

      return NextResponse.json(
        { error: "Este código já foi utilizado por outro utilizador." },
        { status: 409 },
      );
    }

    // 2. Buscar o team_id real para o age_group
    let { data: team } = await admin
      .from("teams")
      .select("id")
      .eq("age_group_id", invite.age_group_id)
      .limit(1)
      .maybeSingle();

    // Se não existir equipa, criar automaticamente
    if (!team) {
      const { data: ageGroupInfo } = await admin
        .from("age_groups")
        .select("club_name, name")
        .eq("id", invite.age_group_id)
        .single();

      if (!ageGroupInfo) {
        return NextResponse.json(
          { error: "Escalão não encontrado. Contacta o coordenador." },
          { status: 422 },
        );
      }

      const { data: newTeam, error: newTeamError } = await admin
        .from("teams")
        .insert({
          age_group_id: invite.age_group_id,
          name: `${ageGroupInfo.club_name} ${ageGroupInfo.name}`,
          is_competitive: true,
        })
        .select("id")
        .single();

      if (newTeamError || !newTeam) {
        console.error("Erro ao criar equipa:", newTeamError?.message);
        return NextResponse.json(
          { error: "Erro ao processar convite. Tenta novamente." },
          { status: 500 },
        );
      }
      team = newTeam;
    }

    // 3. Garantir que o perfil existe (email/password signup não passa pelo auth callback)
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id, full_name")
      .eq("id", user.id)
      .maybeSingle();

    if (!existingProfile) {
      const fullName =
        `${invite.first_name || ""} ${invite.last_name || ""}`.trim() ||
        user.email?.split("@")[0] ||
        "Utilizador";
      await admin.from("profiles").insert({
        id: user.id,
        full_name: fullName,
        role: invite.role === "coordinator" ? "coordinator" : "coach",
      });
    }

    // 4. Verificar se já está associado
    const { data: existingStaff } = await admin
      .from("team_staff")
      .select("id")
      .eq("profile_id", user.id)
      .eq("team_id", team.id)
      .maybeSingle();

    if (existingStaff) {
      // Marcar como aceite na mesma
      await admin
        .from("staff_invites")
        .update({
          accepted_at: new Date().toISOString(),
          accepted_by: user.id,
          status: "accepted",
        })
        .eq("id", invite.id);
      return NextResponse.json(
        { error: "Já estás associado a este escalão" },
        { status: 409 },
      );
    }

    // 5. Criar associação em team_staff
    // team_staff.role CHECK: head_coach | assistant_coach | coordinator
    const teamStaffRole = invite.role === "coach" ? "head_coach" : invite.role;

    const { error: staffError } = await admin.from("team_staff").insert({
      profile_id: user.id,
      team_id: team.id,
      role: teamStaffRole,
    });

    if (staffError) {
      console.error("Erro ao criar team_staff:", staffError.message);
      return NextResponse.json(
        { error: `Erro ao aceitar convite: ${staffError.message}` },
        { status: 500 },
      );
    }

    // 6. Atualizar role do perfil
    const profileRole = invite.role === "coordinator" ? "coordinator" : "coach";
    await admin.from("profiles").update({ role: profileRole }).eq("id", user.id);

    // 7. Marcar convite como aceite
    await admin
      .from("staff_invites")
      .update({
        accepted_at: new Date().toISOString(),
        accepted_by: user.id,
        status: "accepted",
      })
      .eq("id", invite.id);

    // 8. Atualizar nome do perfil se ainda não tiver
    if (existingProfile && !existingProfile.full_name && invite.first_name) {
      await admin
        .from("profiles")
        .update({
          full_name: `${invite.first_name} ${invite.last_name || ""}`.trim(),
        })
        .eq("id", user.id);
    }

    // 9. Buscar info do escalão para resposta
    const { data: ageGroup } = await admin
      .from("age_groups")
      .select("id, name, club_name")
      .eq("id", invite.age_group_id)
      .single();

    return NextResponse.json({
      success: true,
      ageGroup: ageGroup
        ? { name: ageGroup.name, clubName: ageGroup.club_name }
        : null,
      role: invite.role,
    });
  } catch (error) {
    console.error("Erro inesperado ao aceitar convite:", error);
    return NextResponse.json(
      { error: "Erro interno ao aceitar o convite." },
      { status: 500 },
    );
  }
}
