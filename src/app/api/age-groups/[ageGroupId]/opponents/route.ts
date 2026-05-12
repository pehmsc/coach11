import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveUserTeamContext } from "@/lib/auth/team-context";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import { opponentCreateSchema } from "@/lib/validations/opponent";

type RouteContext = {
  params: Promise<{ ageGroupId: string }>;
};

const OPPONENT_COLUMNS =
  "id, name, short_name, logo_url, age_group_id, club_id, competition_id, " +
  "tactical_formation, pontos_fortes, pontos_fracos, atletas_chave, notas_gerais, " +
  "home_ground, home_ground_address, home_ground_lat, home_ground_lng, " +
  "coach_name, phone, contact_info, youth_academy_notes, created_at, updated_at";

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { ageGroupId } = await params;
    if (!ageGroupId) {
      return NextResponse.json({ error: "Escalao invalido." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
    }

    const context = await resolveUserTeamContext(supabase, user.id);
    if (!context.accessibleAgeGroupIds.includes(ageGroupId)) {
      return NextResponse.json(
        { error: "Sem permissoes para este escalao." },
        { status: 403 },
      );
    }

    const { data, error } = await supabase
      .from("opponents")
      .select(OPPONENT_COLUMNS)
      .eq("age_group_id", ageGroupId)
      .order("name", { ascending: true });

    if (error) {
      return respondInternalError("api.age-groups.opponents.get", error, {
        request,
        userId: user.id,
        ageGroupId,
      });
    }

    return NextResponse.json({ success: true, opponents: data ?? [] });
  } catch (error) {
    return respondInternalError("api.age-groups.opponents.get", error, {
      request,
    });
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { ageGroupId } = await params;
    if (!ageGroupId) {
      return NextResponse.json({ error: "Escalao invalido." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
    }

    const context = await resolveUserTeamContext(supabase, user.id);
    if (!context.accessibleAgeGroupIds.includes(ageGroupId)) {
      return NextResponse.json(
        { error: "Sem permissoes para este escalao." },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = opponentCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Payload invalido.", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { data: ageGroup, error: agError } = await supabase
      .from("age_groups")
      .select("id, club_id")
      .eq("id", ageGroupId)
      .maybeSingle();

    if (agError || !ageGroup?.club_id) {
      return NextResponse.json(
        { error: "Escalao nao encontrado ou sem clube." },
        { status: 404 },
      );
    }

    const { data, error } = await supabase
      .from("opponents")
      .insert({
        name: parsed.data.name,
        short_name: parsed.data.short_name?.trim() || null,
        age_group_id: ageGroupId,
        club_id: ageGroup.club_id,
      })
      .select(OPPONENT_COLUMNS)
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "Ja existe um adversario com este nome neste escalao." },
          { status: 409 },
        );
      }
      return respondInternalError("api.age-groups.opponents.post", error, {
        request,
        userId: user.id,
        ageGroupId,
      });
    }

    return NextResponse.json({ success: true, opponent: data }, { status: 201 });
  } catch (error) {
    return respondInternalError("api.age-groups.opponents.post", error, {
      request,
    });
  }
}
