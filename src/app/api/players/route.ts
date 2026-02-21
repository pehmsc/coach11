import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { resolveUserTeamContext } from "@/lib/auth/team-context";
import { NextResponse } from "next/server";

function normalizeOptionalText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeOptionalInt(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return null;
  const intValue = Math.floor(parsed);
  return intValue >= 0 ? intValue : null;
}

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

  const admin = createAdminClient();
  const context = await resolveUserTeamContext(admin, user.id);

  if (context.accessibleAgeGroupIds.length === 0) {
    return {
      error: NextResponse.json(
        { error: "Sem escalão associado para gerir plantel." },
        { status: 403 },
      ),
    };
  }

  return { userId: user.id, admin, context };
}

function resolveTargetAgeGroupId(
  context: Awaited<ReturnType<typeof resolveUserTeamContext>>,
  requestedAgeGroupId: unknown,
) {
  if (
    typeof requestedAgeGroupId === "string" &&
    context.accessibleAgeGroupIds.includes(requestedAgeGroupId)
  ) {
    return requestedAgeGroupId;
  }
  return context.ageGroup?.id ?? context.accessibleAgeGroupIds[0] ?? null;
}

export async function GET(request: Request) {
  try {
    const routeContext = await getRouteContext();
    if ("error" in routeContext) return routeContext.error;
    const { admin, context } = routeContext;

    const { searchParams } = new URL(request.url);
    const requestedAgeGroupId = searchParams.get("ageGroupId");
    const targetAgeGroupId = resolveTargetAgeGroupId(context, requestedAgeGroupId);

    if (!targetAgeGroupId) {
      return NextResponse.json({ error: "Escalão inválido." }, { status: 422 });
    }

    const [{ data: players, error: playersError }, ageGroupRes] = await Promise.all([
      admin
        .from("players")
        .select("*")
        .eq("age_group_id", targetAgeGroupId)
        .order("first_name", { ascending: true })
        .order("last_name", { ascending: true }),
      targetAgeGroupId === context.ageGroup?.id && context.ageGroup
        ? Promise.resolve({
            data: context.ageGroup,
            error: null,
          })
        : admin
            .from("age_groups")
            .select("*")
            .eq("id", targetAgeGroupId)
            .maybeSingle(),
    ]);

    if (playersError) {
      return NextResponse.json(
        { error: "Erro ao carregar plantel." },
        { status: 500 },
      );
    }
    if (ageGroupRes.error || !ageGroupRes.data) {
      return NextResponse.json(
        { error: "Erro ao carregar escalão." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      ageGroup: ageGroupRes.data,
      players: players || [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const routeContext = await getRouteContext();
    if ("error" in routeContext) return routeContext.error;
    const { admin, context } = routeContext;

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
    }

    const firstName = normalizeOptionalText((body as Record<string, unknown>).first_name);
    const lastName = normalizeOptionalText((body as Record<string, unknown>).last_name);
    const targetAgeGroupId = resolveTargetAgeGroupId(
      context,
      (body as Record<string, unknown>).age_group_id,
    );

    if (!firstName || !lastName || !targetAgeGroupId) {
      return NextResponse.json(
        { error: "Primeiro nome, apelido e escalão são obrigatórios." },
        { status: 400 },
      );
    }

    if (!context.accessibleAgeGroupIds.includes(targetAgeGroupId)) {
      return NextResponse.json({ error: "Sem permissões neste escalão." }, { status: 403 });
    }

    const insertPayload = {
      age_group_id: targetAgeGroupId,
      first_name: firstName,
      last_name: lastName,
      preferred_position: normalizeOptionalText((body as Record<string, unknown>).preferred_position),
      birth_date: normalizeOptionalText((body as Record<string, unknown>).birth_date),
      phone: normalizeOptionalText((body as Record<string, unknown>).phone),
      email: normalizeOptionalText((body as Record<string, unknown>).email),
      jersey_number: normalizeOptionalInt((body as Record<string, unknown>).jersey_number),
      status:
        normalizeOptionalText((body as Record<string, unknown>).status) || "active",
    };

    const { data, error } = await admin
      .from("players")
      .insert(insertPayload)
      .select("*")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || "Erro ao criar atleta." },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, player: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
