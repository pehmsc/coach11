import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { resolveUserTeamContext } from "@/lib/auth/team-context";
import { NextResponse } from "next/server";

function normalizeKitRowForUi(row: Record<string, unknown>) {
  const playerType =
    typeof row.player_type === "string" && row.player_type === "field_player"
      ? "field"
      : row.player_type;
  const pieceType =
    typeof row.piece_type === "string" && row.piece_type === "jersey"
      ? "shirt"
      : row.piece_type;

  return {
    ...row,
    player_type: playerType,
    piece_type: pieceType,
  };
}

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

    const context = await resolveUserTeamContext(admin, user.id);

    if (!context.ageGroup) {
      return NextResponse.json({
        success: true,
        linked: false,
        source: context.source,
        teamId: context.teamId,
        teamRole: context.teamRole,
        ageGroup: null,
        accessibleTeamIds: context.accessibleTeamIds,
        kits: [],
        activeStaffProfileIds: [],
        staffInvites: [],
        profile: profile || null,
      });
    }

    const [kitsRes, staffRes, invitesRes] = await Promise.all([
      context.teamId
        ? admin
            .from("kit_pieces")
            .select("*")
            .eq("team_id", context.teamId)
            .order("kit_number")
            .order("player_type")
            .order("piece_type")
        : Promise.resolve({ data: [], error: null }),
      context.teamId
        ? admin
            .from("team_staff")
            .select("id, profile_id, role")
            .eq("team_id", context.teamId)
        : Promise.resolve({ data: [], error: null }),
      admin
        .from("staff_invites")
        .select("*")
        .eq("age_group_id", context.ageGroup.id)
        .order("created_at", { ascending: false }),
    ]);

    const rawStaffRows = (staffRes.data || []) as Array<{
      id: string;
      profile_id: string;
      role: string | null;
    }>;
    const staffProfileIds = rawStaffRows.map((row) => row.profile_id);

    let staffProfilesData: Array<{
      id: string;
      full_name: string | null;
      email: string | null;
      avatar_url: string | null;
    }> = [];
    if (staffProfileIds.length > 0) {
      const { data: pData } = await admin
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .in("id", staffProfileIds);
      staffProfilesData = (pData || []) as typeof staffProfilesData;
    }

    const staffProfileMap = new Map(staffProfilesData.map((p) => [p.id, p]));
    const staffMembers = rawStaffRows.map((row) => ({
      id: row.id,
      profile_id: row.profile_id,
      role: row.role || "staff",
      full_name: staffProfileMap.get(row.profile_id)?.full_name || null,
      email: staffProfileMap.get(row.profile_id)?.email || null,
      avatar_url: staffProfileMap.get(row.profile_id)?.avatar_url || null,
    }));

    return NextResponse.json({
      success: true,
      linked: true,
      source: context.source,
      teamId: context.teamId,
      teamRole: context.teamRole,
      ageGroup: context.ageGroup,
      accessibleTeamIds: context.accessibleTeamIds,
      kits: ((kitsRes.data || []) as Record<string, unknown>[]).map((row) =>
        normalizeKitRowForUi(row),
      ),
      activeStaffProfileIds: staffProfileIds,
      staffMembers,
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
