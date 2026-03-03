import {
  isValidManualShortName,
  normalizeManualShortName,
} from "@/lib/football/short-name";
import { createClient } from "@/lib/supabase/server";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import { normalizeLocationSource, normalizeNullableNumber } from "@/lib/location";
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const { id: gameId } = await params;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
    }

    // Verify game exists and get team/age_group
    const { data: game } = await supabase
      .from("games")
      .select("id, team_id, age_group_id, status")
      .eq("id", gameId)
      .maybeSingle();

    if (!game) {
      return NextResponse.json({ error: "Jogo não encontrado." }, { status: 404 });
    }

    // Check access: coordinator or staff
    let hasAccess = false;
    let isCoordinator = false;
    const ageGroupId = (game as unknown as { age_group_id?: string }).age_group_id ?? null;
    let teamId: string | null = (game as unknown as { team_id?: string }).team_id ?? null;

    if (ageGroupId) {
      const { data: ag } = await supabase
        .from("age_groups")
        .select("id")
        .eq("id", ageGroupId)
        .eq("coordinator_id", user.id)
        .maybeSingle();
      hasAccess = !!ag;
      isCoordinator = !!ag;
    }

    if (!teamId && ageGroupId) {
      const { data: ft } = await supabase
        .from("teams")
        .select("id")
        .eq("age_group_id", ageGroupId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      teamId = (ft as unknown as { id?: string } | null)?.id ?? null;
    }

    if (!hasAccess && teamId) {
      const { data: sl } = await supabase
        .from("team_staff")
        .select("id")
        .eq("team_id", teamId)
        .eq("profile_id", user.id)
        .maybeSingle();
      hasAccess = !!sl;
    }

    if (!hasAccess) {
      return NextResponse.json({ error: "Sem permissões." }, { status: 403 });
    }

    const gameStatus = (game as unknown as { status?: string }).status ?? null;
    if (gameStatus === "completed" && !isCoordinator) {
      return NextResponse.json(
        { error: "Só o coordenador pode editar jogos terminados." },
        { status: 403 },
      );
    }

    // Only allow safe fields to be updated
    const updates: Record<string, unknown> = {};
    if (typeof body.title === "string" || body.title === null) updates.title = body.title || null;
    if (typeof body.opponent_name === "string") updates.opponent_name = body.opponent_name;
    if (typeof body.opponent_short_name === "string" || body.opponent_short_name === null) {
      if (!isValidManualShortName(body.opponent_short_name, 2, 5)) {
        return NextResponse.json(
          { error: "A sigla do adversário deve ter entre 2 e 5 caracteres." },
          { status: 400 },
        );
      }
      updates.opponent_short_name =
        normalizeManualShortName(body.opponent_short_name, 5) || null;
    }
    if (typeof body.location === "string" || body.location === null) updates.location = body.location || null;
    if (typeof body.location_address === "string" || body.location_address === null) {
      updates.location_address = body.location_address || null;
    }
    if (
      typeof body.formatted_address === "string" ||
      body.formatted_address === null
    ) {
      updates.formatted_address = body.formatted_address || null;
    }
    if (typeof body.notes === "string" || body.notes === null) {
      updates.notes = body.notes || null;
    }
    if (typeof body.image_url === "string" || body.image_url === null) {
      updates.image_url = body.image_url || null;
    }
    if (body.latitude !== undefined || body.latitude === null) {
      updates.latitude = normalizeNullableNumber(body.latitude);
    }
    if (body.longitude !== undefined || body.longitude === null) {
      updates.longitude = normalizeNullableNumber(body.longitude);
    }
    if (typeof body.osm_place_id === "string" || body.osm_place_id === null) {
      updates.osm_place_id = body.osm_place_id || null;
    }
    if (body.location_source !== undefined || body.location_source === null) {
      updates.location_source = normalizeLocationSource(body.location_source);
    }
    if (typeof body.game_datetime === "string") updates.game_datetime = body.game_datetime;
    if (typeof body.end_time === "string" || body.end_time === null) {
      updates.end_time = body.end_time || null;
    }
    if (typeof body.is_home === "boolean") updates.is_home = body.is_home;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Sem campos para atualizar." }, { status: 400 });
    }

    const { data: updated, error: updateError } = await supabase
      .from("games")
      .update(updates)
      .eq("id", gameId)
      .select()
      .single();

    if (updateError) {
      console.error("Erro ao atualizar jogo:", updateError.message);
      return NextResponse.json({ error: "Erro ao atualizar jogo." }, { status: 500 });
    }

    return NextResponse.json({ success: true, game: updated });
  } catch (error) {
    return respondInternalError("api.games.id.patch", error);
  }
}
