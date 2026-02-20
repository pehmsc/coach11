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

  // 2. Verificar se já está associado
  // team_staff usa: team_id (= age_group_id) e profile_id (= auth.uid)
  const { data: existingStaff, error: existingError } = await supabase
    .from("team_staff")
    .select("id")
    .eq("profile_id", user.id)
    .eq("team_id", invite.age_group_id)
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

  // 3. Criar associação em team_staff
  const { error: staffError } = await supabase.from("team_staff").insert({
    profile_id: user.id,
    team_id: invite.age_group_id,
    role: invite.role,
  });

  if (staffError) {
    console.error("Erro ao criar team_staff:", staffError);
    return NextResponse.json(
      { error: "Erro ao aceitar convite. Tenta novamente." },
      { status: 500 },
    );
  }

  // 4. Marcar convite como aceite
  await supabase
    .from("staff_invites")
    .update({
      accepted_at: new Date().toISOString(),
      accepted_by: user.id,
      status: "accepted",
    })
    .eq("id", invite.id);

  // 5. Atualizar perfil com nome do convite (se perfil não tiver nome)
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

  // 6. Buscar info do escalão
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
