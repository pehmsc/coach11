import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { inviteCode } = await request.json();
  if (!inviteCode || typeof inviteCode !== "string") {
    return NextResponse.json(
      { error: "Código de convite em falta" },
      { status: 400 },
    );
  }

  const code = inviteCode.trim().toUpperCase();

  // 1. Buscar convite pendente
  const { data: invite, error: inviteError } = await supabase
    .from("staff_invites")
    .select("*")
    .eq("invite_code", code)
    .is("accepted_at", null)
    .single();

  if (inviteError || !invite) {
    return NextResponse.json(
      { error: "Código inválido ou já utilizado" },
      { status: 404 },
    );
  }

  // 2. Buscar o team_id real para o age_group (team_staff.team_id → teams.id)
  // Se não existir equipa, criar automaticamente (para coordenadores criados antes do auto-create)
  let { data: team } = await supabase
    .from("teams")
    .select("id")
    .eq("age_group_id", invite.age_group_id)
    .limit(1)
    .maybeSingle();

  if (!team) {
    const { data: ageGroupInfo } = await supabase
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

    const { data: newTeam, error: newTeamError } = await supabase
      .from("teams")
      .insert({
        age_group_id: invite.age_group_id,
        name: `${ageGroupInfo.club_name} ${ageGroupInfo.name}`,
        is_competitive: true,
      })
      .select("id")
      .single();

    if (newTeamError || !newTeam) {
      console.error("Erro ao criar equipa automaticamente:", newTeamError);
      return NextResponse.json(
        { error: "Erro ao processar convite. Tenta novamente." },
        { status: 500 },
      );
    }

    team = newTeam;
  }

  // 3. Verificar se já está associado
  const { data: existingStaff, error: existingError } = await supabase
    .from("team_staff")
    .select("id")
    .eq("profile_id", user.id)
    .eq("team_id", team.id)
    .maybeSingle();

  if (existingError) {
    console.error("Erro ao verificar associação existente:", existingError);
    return NextResponse.json(
      { error: "Erro ao processar convite. Tenta novamente." },
      { status: 500 },
    );
  }

  if (existingStaff) {
    return NextResponse.json(
      { error: "Já estás associado a este escalão" },
      { status: 409 },
    );
  }

  // 4. Criar associação em team_staff com o team_id correto
  // team_staff.role CHECK: head_coach | assistant_coach | coordinator
  // staff_invites.role usa: coach | assistant_coach | coordinator
  const teamStaffRole =
    invite.role === "coach" ? "head_coach" : invite.role;

  const { error: staffError } = await supabase.from("team_staff").insert({
    profile_id: user.id,
    team_id: team.id,
    role: teamStaffRole,
  });

  if (staffError) {
    console.error("Erro ao criar team_staff:", staffError);
    return NextResponse.json(
      { error: "Erro ao aceitar convite. Tenta novamente." },
      { status: 500 },
    );
  }

  // 5. Atualizar role do perfil (coach para coach/assistant_coach, coordinator mantém)
  const profileRole = invite.role === "coordinator" ? "coordinator" : "coach";
  await supabase
    .from("profiles")
    .update({ role: profileRole })
    .eq("id", user.id);

  // 6. Marcar convite como aceite
  await supabase
    .from("staff_invites")
    .update({
      accepted_at: new Date().toISOString(),
      accepted_by: user.id,
      status: "accepted",
    })
    .eq("id", invite.id);

  // 7. Atualizar nome do perfil se ainda não tiver
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  if (profile && !profile.full_name && invite.first_name) {
    await supabase
      .from("profiles")
      .update({
        full_name: `${invite.first_name} ${invite.last_name || ""}`.trim(),
      })
      .eq("id", user.id);
  }

  // 8. Buscar info do escalão para resposta
  const { data: ageGroup } = await supabase
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
}
