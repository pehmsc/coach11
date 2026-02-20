import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type StaffInviteRow = {
  id: string;
  age_group_id: string;
  role: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  accepted_at: string | null;
  accepted_by: string | null;
};

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const admin = createAdminClient();

    const { data: existingStaff } = await admin
      .from("team_staff")
      .select("id")
      .eq("profile_id", user.id)
      .limit(1)
      .maybeSingle();

    if (existingStaff) {
      return NextResponse.json({ success: true, linked: true, source: "team_staff" });
    }

    let invite: StaffInviteRow | null = null;

    if (user.email) {
      const latestByEmail = await admin
        .from("staff_invites")
        .select("id, age_group_id, role, email, first_name, last_name, accepted_at, accepted_by")
        .ilike("email", user.email)
        .order("accepted_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!latestByEmail.error && latestByEmail.data) {
        invite = latestByEmail.data as StaffInviteRow;
      }
    }

    if (!invite) {
      const acceptedByUser = await admin
        .from("staff_invites")
        .select("id, age_group_id, role, email, first_name, last_name, accepted_at, accepted_by")
        .eq("accepted_by", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!acceptedByUser.error && acceptedByUser.data) {
        invite = acceptedByUser.data as StaffInviteRow;
      }
    }

    if (!invite) {
      return NextResponse.json({ success: true, linked: false });
    }

    const inviteEmail =
      typeof invite.email === "string" ? invite.email.trim().toLowerCase() : null;
    const userEmail = user.email?.trim().toLowerCase() ?? null;
    if (inviteEmail && userEmail && inviteEmail !== userEmail) {
      return NextResponse.json(
        { error: "O convite encontrado pertence a outro email." },
        { status: 403 },
      );
    }

    let { data: team } = await admin
      .from("teams")
      .select("id")
      .eq("age_group_id", invite.age_group_id)
      .limit(1)
      .maybeSingle();

    if (!team) {
      const { data: ageGroupInfo } = await admin
        .from("age_groups")
        .select("club_name, name")
        .eq("id", invite.age_group_id)
        .maybeSingle();

      if (!ageGroupInfo) {
        return NextResponse.json(
          { error: "Escalão do convite não encontrado." },
          { status: 422 },
        );
      }

      const { data: newTeam, error: createTeamError } = await admin
        .from("teams")
        .insert({
          age_group_id: invite.age_group_id,
          name: `${ageGroupInfo.club_name} ${ageGroupInfo.name}`,
          is_competitive: true,
        })
        .select("id")
        .single();

      if (createTeamError || !newTeam) {
        return NextResponse.json(
          { error: "Não foi possível criar equipa para o convite." },
          { status: 500 },
        );
      }

      team = newTeam;
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("id, full_name")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile) {
      const fullName =
        `${invite.first_name || ""} ${invite.last_name || ""}`.trim() ||
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        user.email?.split("@")[0] ||
        "Utilizador";

      await admin.from("profiles").insert({
        id: user.id,
        full_name: fullName,
        role: invite.role === "coordinator" ? "coordinator" : "coach",
      });
    }

    const roleCandidates =
      invite.role === "coach" ? ["head_coach", "coach"] : [invite.role];
    let insertStaffError: { code?: string } | null = null;

    for (let i = 0; i < roleCandidates.length; i += 1) {
      const roleCandidate = roleCandidates[i];
      const { error } = await admin.from("team_staff").insert({
        profile_id: user.id,
        team_id: team.id,
        role: roleCandidate,
      });

      if (!error || error.code === "23505") {
        insertStaffError = null;
        break;
      }

      insertStaffError = error;
      const isLast = i === roleCandidates.length - 1;
      if (error.code !== "23514" || isLast) {
        break;
      }
    }

    if (insertStaffError) {
      return NextResponse.json(
        { error: "Não foi possível associar à equipa técnica." },
        { status: 500 },
      );
    }

    if (!invite.accepted_at || invite.accepted_by !== user.id) {
      await admin
        .from("staff_invites")
        .update({
          accepted_at: invite.accepted_at || new Date().toISOString(),
          accepted_by: user.id,
          status: "accepted",
        })
        .eq("id", invite.id);
    }

    return NextResponse.json({ success: true, linked: true, source: "invite_sync" });
  } catch (error) {
    console.error("Erro ao sincronizar convite:", error);

    const message =
      error instanceof Error ? error.message : "Erro interno ao sincronizar convite.";

    if (message.includes("SUPABASE_SERVICE_ROLE_KEY")) {
      return NextResponse.json(
        {
          error:
            "Configuração do servidor incompleta: falta SUPABASE_SERVICE_ROLE_KEY no ambiente de produção.",
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { error: message || "Erro interno ao sincronizar convite." },
      { status: 500 },
    );
  }
}
