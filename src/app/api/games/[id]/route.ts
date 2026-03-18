import {
  isValidManualShortName,
  normalizeManualShortName,
} from "@/lib/football/short-name";
import { createClient } from "@/lib/supabase/server";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import { fetchGameAccessContext } from "@/lib/games/access";
import { normalizeLocationSource, normalizeNullableNumber } from "@/lib/location";
import { NextResponse } from "next/server";
import { z } from "zod";

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

    const GamePatchSchema = z.object({
      title: z.string().nullable().optional(),
      opponent_name: z.string().optional(),
      opponent_short_name: z.string().nullable().optional(),
      location: z.string().nullable().optional(),
      location_address: z.string().nullable().optional(),
      formatted_address: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
      image_url: z.string().nullable().optional(),
      latitude: z.number().nullable().optional(),
      longitude: z.number().nullable().optional(),
      osm_place_id: z.string().nullable().optional(),
      location_source: z.string().nullable().optional(),
      game_datetime: z.string().optional(),
      end_time: z.string().nullable().optional(),
      is_home: z.boolean().optional(),
    }).strict();

    const rawBody = await request.json().catch(() => null);
    const parsed = GamePatchSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos.", details: parsed.error.issues }, { status: 400 });
    }
    const body = parsed.data;

    const { data: game } = await supabase
      .from("games")
      .select("id")
      .eq("id", gameId)
      .maybeSingle();

    if (!game) {
      return NextResponse.json({ error: "Jogo não encontrado." }, { status: 404 });
    }

    let access = null;
    try {
      access = await fetchGameAccessContext(supabase, gameId);
    } catch (error) {
      console.error("[api.games.access]", { gameId, error });
      return NextResponse.json({ error: "Erro ao validar jogo." }, { status: 500 });
    }

    if (!access?.exists || !access.canAccess) {
      return NextResponse.json({ error: "Sem permissões." }, { status: 403 });
    }

    if (access.status === "completed" && !access.isCoordinator) {
      return NextResponse.json(
        { error: "Só o coordenador pode editar jogos terminados." },
        { status: 403 },
      );
    }

    // Build update payload from validated body
    const updates: Record<string, unknown> = {};
    if (body.title !== undefined) updates.title = body.title || null;
    if (body.opponent_name !== undefined) updates.opponent_name = body.opponent_name;
    if (body.opponent_short_name !== undefined) {
      if (body.opponent_short_name !== null && !isValidManualShortName(body.opponent_short_name, 2, 5)) {
        return NextResponse.json(
          { error: "A sigla do adversário deve ter entre 2 e 5 caracteres." },
          { status: 400 },
        );
      }
      updates.opponent_short_name =
        normalizeManualShortName(body.opponent_short_name, 5) || null;
    }
    if (body.location !== undefined) updates.location = body.location || null;
    if (body.location_address !== undefined) updates.location_address = body.location_address || null;
    if (body.formatted_address !== undefined) updates.formatted_address = body.formatted_address || null;
    if (body.notes !== undefined) updates.notes = body.notes || null;
    if (body.image_url !== undefined) updates.image_url = body.image_url || null;
    if (body.latitude !== undefined) updates.latitude = normalizeNullableNumber(body.latitude);
    if (body.longitude !== undefined) updates.longitude = normalizeNullableNumber(body.longitude);
    if (body.osm_place_id !== undefined) updates.osm_place_id = body.osm_place_id || null;
    if (body.location_source !== undefined) updates.location_source = normalizeLocationSource(body.location_source);
    if (body.game_datetime !== undefined) updates.game_datetime = body.game_datetime;
    if (body.end_time !== undefined) updates.end_time = body.end_time || null;
    if (body.is_home !== undefined) updates.is_home = body.is_home;

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
