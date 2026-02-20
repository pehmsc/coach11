import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const admin = createAdminClient();

    const { data: profile } = await admin
      .from("profiles")
      .select("id, full_name, role, email")
      .eq("id", user.id)
      .maybeSingle();

    let source: "coordinator" | "staff" | "none" = "none";
    let teamRole: string | null = null;
    let teamId: string | null = null;
    let ageGroup: Record<string, unknown> | null = null;

    const { data: managedAgeGroup } = await admin
      .from("age_groups")
      .select("*")
      .eq("coordinator_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (managedAgeGroup) {
      source = "coordinator";
      ageGroup = managedAgeGroup;

      const { data: firstTeam } = await admin
        .from("teams")
        .select("*")
        .eq("age_group_id", managedAgeGroup.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      teamId = firstTeam?.id ?? null;
    } else {
      const { data: staffLink } = await admin
        .from("team_staff")
        .select("team_id, role")
        .eq("profile_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (staffLink?.team_id) {
        source = "staff";
        teamRole = staffLink.role ?? null;
        teamId = staffLink.team_id;

        const { data: team } = await admin
          .from("teams")
          .select("age_group_id")
          .eq("id", staffLink.team_id)
          .maybeSingle();

        if (team?.age_group_id) {
          const { data: staffAgeGroup } = await admin
            .from("age_groups")
            .select("*")
            .eq("id", team.age_group_id)
            .maybeSingle();
          ageGroup = staffAgeGroup || null;
        }
      }
    }

    if (!ageGroup) {
      return NextResponse.json({
        success: true,
        linked: false,
        source,
        teamId: null,
        teamRole: null,
        ageGroup: null,
        kits: [],
        activeStaffProfileIds: [],
        staffInvites: [],
        profile: profile || null,
      });
    }

    const [kitsRes, staffRes, invitesRes] = await Promise.all([
      teamId
        ? admin
            .from("kit_pieces")
            .select("*")
            .eq("team_id", teamId)
            .order("kit_number")
            .order("player_type")
            .order("piece_type")
        : Promise.resolve({ data: [], error: null }),
      teamId
        ? admin
            .from("team_staff")
            .select("profile_id")
            .eq("team_id", teamId)
        : Promise.resolve({ data: [], error: null }),
      admin
        .from("staff_invites")
        .select("*")
        .eq("age_group_id", String((ageGroup as { id: string }).id))
        .order("created_at", { ascending: false }),
    ]);

    return NextResponse.json({
      success: true,
      linked: true,
      source,
      teamId,
      teamRole,
      ageGroup,
      kits: kitsRes.data || [],
      activeStaffProfileIds: (staffRes.data || []).map((row) => row.profile_id),
      staffInvites: invitesRes.data || [],
      profile: profile || null,
    });
  } catch (error) {
    console.error("Erro ao carregar contexto do utilizador:", error);
    const message =
      error instanceof Error ? error.message : "Erro interno ao carregar contexto.";

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
      { error: message || "Erro interno ao carregar contexto." },
      { status: 500 },
    );
  }
}
