import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

import { resolveUserTeamContext } from "@/lib/auth/team-context";
import { deletePlayerCascade } from "@/lib/events/delete-cascade";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import { parseBody } from "@/lib/http/validate";
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const PlayerUpdateSchema = z.object({
  first_name: z.string().trim().min(2, "O primeiro nome deve ter pelo menos 2 caracteres.").max(100).optional(),
  last_name: z.string().trim().min(2, "O apelido deve ter pelo menos 2 caracteres.").max(100).optional(),
  preferred_position: z.string().max(10).nullable().optional(),
  birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  phone: z.string().max(20).nullable().optional(),
  email: z.string().email().max(254).nullable().optional(),
  jersey_number: z.number().int().min(0).max(99).nullable().optional(),
  status: z.enum(["active", "injured", "suspended", "inactive"]).optional(),
  invite_code: z.string().nullable().optional(),
  invite_method: z.string().nullable().optional(),
  invite_sent_at: z.string().nullable().optional(),
  invite_accepted_at: z.string().nullable().optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  "Sem campos para atualizar.",
);

async function getRouteContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: NextResponse.json({ error: "Não autenticado." }, { status: 401 }),
    };
  }

  const db = supabase;

  const context = await resolveUserTeamContext(db, user.id);

  if (context.accessibleAgeGroupIds.length === 0) {
    return {
      error: NextResponse.json(
        { error: "Sem escalão associado para gerir plantel." },
        { status: 403 },
      ),
    };
  }

  return { supabase: db, context };
}

const PLAYER_DETAIL_FIELDS =
  "id, age_group_id, first_name, last_name, preferred_position, secondary_position, birth_date, phone, email, parent_email, parent_phone, notes, jersey_number, status, avatar_url, photo_consent_given, invite_code, invite_method, invite_sent_at, invite_accepted_at, profile_id, created_at, updated_at";

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "ID inválido." }, { status: 400 });
    }

    const routeContext = await getRouteContext();
    if ("error" in routeContext) return routeContext.error;
    const { supabase, context } = routeContext;

    const { data: player, error } = await supabase
      .from("players")
      .select(PLAYER_DETAIL_FIELDS)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      return respondInternalError("api.players.id.get", error);
    }
    if (!player) {
      return NextResponse.json(
        { error: "Atleta não encontrado." },
        { status: 404 },
      );
    }
    if (!context.accessibleAgeGroupIds.includes(player.age_group_id)) {
      return NextResponse.json(
        { error: "Sem permissões para ver este atleta." },
        { status: 403 },
      );
    }

    return NextResponse.json({ success: true, player });
  } catch (error) {
    return respondInternalError("api.players.id.get", error);
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "ID inválido." }, { status: 400 });
    }

    const routeContext = await getRouteContext();
    if ("error" in routeContext) return routeContext.error;
    const { supabase, context } = routeContext;

    const { data: existingPlayer, error: existingError } = await supabase
      .from("players")
      .select("id, age_group_id")
      .eq("id", id)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json(
        { error: "Erro ao validar atleta." },
        { status: 500 },
      );
    }
    if (!existingPlayer) {
      return NextResponse.json({ error: "Atleta não encontrado." }, { status: 404 });
    }
    if (!context.accessibleAgeGroupIds.includes(existingPlayer.age_group_id)) {
      return NextResponse.json(
        { error: "Sem permissões para editar este atleta." },
        { status: 403 },
      );
    }

    const parsed = await parseBody(request, PlayerUpdateSchema);
    if (parsed.error) return parsed.error;
    const updates = parsed.data;

    const { data, error } = await supabase
      .from("players")
      .update(updates)
      .eq("id", id)
      // Perf: campos específicos — mesmo conjunto que PLAYER_FIELDS em /api/players.
      .select("id, age_group_id, first_name, last_name, preferred_position, birth_date, phone, email, jersey_number, status, avatar_url, invite_code, invite_method, invite_sent_at, profile_id")
      .single();

    if (error || !data) {
      return respondInternalError("api.players.id.patch.update", error ?? new Error("PLAYER_UPDATE_EMPTY"));
    }

    return NextResponse.json({ success: true, player: data });
  } catch (error) {
    return respondInternalError("api.players.id.patch", error);
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "ID inválido." }, { status: 400 });
    }

    const routeContext = await getRouteContext();
    if ("error" in routeContext) return routeContext.error;
    const { supabase, context } = routeContext;

    const { data: existingPlayer, error: existingError } = await supabase
      .from("players")
      .select("id, age_group_id, first_name, last_name")
      .eq("id", id)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json(
        { error: "Erro ao validar atleta." },
        { status: 500 },
      );
    }
    if (!existingPlayer) {
      return NextResponse.json({ error: "Atleta não encontrado." }, { status: 404 });
    }
    if (!context.accessibleAgeGroupIds.includes(existingPlayer.age_group_id)) {
      return NextResponse.json(
        { error: "Sem permissões para apagar este atleta." },
        { status: 403 },
      );
    }

    await deletePlayerCascade(supabase, id);

    return NextResponse.json({
      success: true,
      player: {
        id: existingPlayer.id,
        first_name: existingPlayer.first_name,
        last_name: existingPlayer.last_name,
      },
    });
  } catch (error) {
    return respondInternalError("api.players.id.delete", error);
  }
}
