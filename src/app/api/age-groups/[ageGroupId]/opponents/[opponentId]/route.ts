import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveUserTeamContext } from "@/lib/auth/team-context";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import { opponentUpdateSchema } from "@/lib/validations/opponent";

type RouteContext = {
  params: Promise<{ ageGroupId: string; opponentId: string }>;
};

const OPPONENT_COLUMNS =
  "id, name, short_name, logo_url, age_group_id, club_id, competition_id, " +
  "tactical_formation, pontos_fortes, pontos_fracos, atletas_chave, notas_gerais, " +
  "home_ground, home_ground_address, home_ground_lat, home_ground_lng, " +
  "coach_name, phone, contact_info, youth_academy_notes, created_at, updated_at";

async function authorize(ageGroupId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error: NextResponse.json({ error: "Nao autenticado." }, { status: 401 }),
    } as const;
  }
  const context = await resolveUserTeamContext(supabase, user.id);
  if (!context.accessibleAgeGroupIds.includes(ageGroupId)) {
    return {
      error: NextResponse.json(
        { error: "Sem permissoes para este escalao." },
        { status: 403 },
      ),
    } as const;
  }
  return { supabase, userId: user.id } as const;
}

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { ageGroupId, opponentId } = await params;
    const auth = await authorize(ageGroupId);
    if ("error" in auth) return auth.error;

    const { data, error } = await auth.supabase
      .from("opponents")
      .select(OPPONENT_COLUMNS)
      .eq("id", opponentId)
      .eq("age_group_id", ageGroupId)
      .maybeSingle();

    if (error) {
      return respondInternalError(
        "api.age-groups.opponents.id.get",
        error,
        { request, userId: auth.userId, ageGroupId },
      );
    }
    if (!data) {
      return NextResponse.json(
        { error: "Adversario nao encontrado." },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, opponent: data });
  } catch (error) {
    return respondInternalError("api.age-groups.opponents.id.get", error, {
      request,
    });
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const { ageGroupId, opponentId } = await params;
    const auth = await authorize(ageGroupId);
    if ("error" in auth) return auth.error;

    const body = await request.json().catch(() => null);
    const parsed = opponentUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Payload invalido.", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    // Strings vazias -> null para textos opcionais (mantem schema limpo)
    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parsed.data)) {
      if (typeof value === "string") {
        const trimmed = value.trim();
        updates[key] = trimmed === "" ? null : trimmed;
      } else {
        updates[key] = value;
      }
    }

    const { data, error } = await auth.supabase
      .from("opponents")
      .update(updates)
      .eq("id", opponentId)
      .eq("age_group_id", ageGroupId)
      .select(OPPONENT_COLUMNS)
      .maybeSingle();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "Ja existe um adversario com este nome neste escalao." },
          { status: 409 },
        );
      }
      return respondInternalError(
        "api.age-groups.opponents.id.patch",
        error,
        { request, userId: auth.userId, ageGroupId },
      );
    }
    if (!data) {
      return NextResponse.json(
        { error: "Adversario nao encontrado." },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, opponent: data });
  } catch (error) {
    return respondInternalError("api.age-groups.opponents.id.patch", error, {
      request,
    });
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    const { ageGroupId, opponentId } = await params;
    const auth = await authorize(ageGroupId);
    if ("error" in auth) return auth.error;

    // Contar jogos antes (audit + resposta)
    const { count: gamesAffected } = await auth.supabase
      .from("games")
      .select("id", { count: "exact", head: true })
      .eq("opponent_id", opponentId);

    const { error } = await auth.supabase
      .from("opponents")
      .delete()
      .eq("id", opponentId)
      .eq("age_group_id", ageGroupId);

    if (error) {
      return respondInternalError(
        "api.age-groups.opponents.id.delete",
        error,
        { request, userId: auth.userId, ageGroupId },
      );
    }

    return NextResponse.json({
      success: true,
      games_affected: gamesAffected ?? 0,
    });
  } catch (error) {
    return respondInternalError(
      "api.age-groups.opponents.id.delete",
      error,
      { request },
    );
  }
}
