import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveUserTeamContext } from "@/lib/auth/team-context";
import { PRIVATE_SWR_CACHE_CONTROL } from "@/lib/http/cache";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import { captureServerProductEvent } from "@/lib/observability/posthog-server";
import { NextResponse } from "next/server";
import { z } from "zod";

const PLAYER_FIELDS =
  "id, age_group_id, first_name, last_name, preferred_position, birth_date, phone, email, jersey_number, status, avatar_url, invite_code, invite_method, invite_sent_at, profile_id";

const PlayerCreateSchema = z.object({
  // QC-04: mínimo 2 caracteres para nomes de jogadores.
  first_name: z.string().trim().min(2, "O primeiro nome deve ter pelo menos 2 caracteres.").max(100),
  last_name: z.string().trim().min(2, "O apelido deve ter pelo menos 2 caracteres.").max(100),
  preferred_position: z.string().max(10).nullable().optional(),
  birth_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  phone: z.string().max(20).nullable().optional(),
  email: z.string().email().max(254).nullable().optional(),
  jersey_number: z.number().int().min(0).max(99).nullable().optional(),
  status: z.enum(["active", "injured", "suspended", "inactive"]).optional(),
  age_group_id: z.string().uuid().optional(),
});

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

  let db = supabase;
  try {
    db = createAdminClient();
  } catch {
    db = supabase;
  }

  const context = await resolveUserTeamContext(db, user.id);

  if (context.accessibleAgeGroupIds.length === 0) {
    return {
      error: NextResponse.json(
        { error: "Sem escalão associado para gerir plantel." },
        { status: 403 },
      ),
    };
  }

  return { userId: user.id, supabase: db, context };
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
  let userId: string | null = null;
  let targetAgeGroupId: string | null = null;

  try {
    const routeContext = await getRouteContext();
    if ("error" in routeContext) return routeContext.error;
    const { supabase, context, userId: resolvedUserId } = routeContext;
    userId = resolvedUserId;

    const { searchParams } = new URL(request.url);
    const requestedAgeGroupId = searchParams.get("ageGroupId");
    targetAgeGroupId = resolveTargetAgeGroupId(context, requestedAgeGroupId);

    if (!targetAgeGroupId) {
      return NextResponse.json({ error: "Escalão inválido." }, { status: 422 });
    }

    const [{ data: players, error: playersError }, ageGroupRes] = await Promise.all([
      supabase
        .from("players")
        .select(PLAYER_FIELDS)
        .eq("age_group_id", targetAgeGroupId)
        .order("first_name", { ascending: true })
        .order("last_name", { ascending: true }),
      targetAgeGroupId === context.ageGroup?.id && context.ageGroup
        ? Promise.resolve({
            data: context.ageGroup,
            error: null,
          })
        : supabase
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

    return NextResponse.json(
      {
        success: true,
        ageGroup: ageGroupRes.data,
        players: players || [],
      },
      {
        headers: {
          "Cache-Control": PRIVATE_SWR_CACHE_CONTROL,
        },
      },
    );
  } catch (error) {
    return respondInternalError("api.players.get", error, {
      request,
      userId,
      ageGroupId: targetAgeGroupId,
    });
  }
}

export async function POST(request: Request) {
  let userId: string | null = null;
  let targetAgeGroupId: string | null = null;

  try {
    const routeContext = await getRouteContext();
    if ("error" in routeContext) return routeContext.error;
    const { supabase, context, userId: resolvedUserId } = routeContext;
    userId = resolvedUserId;

    const body = await request.json().catch(() => null);
    const parsed = PlayerCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos.", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const {
      first_name,
      last_name,
      preferred_position,
      birth_date,
      phone,
      email,
      jersey_number,
      status,
      age_group_id: requestedAgeGroupId,
    } = parsed.data;

    targetAgeGroupId = resolveTargetAgeGroupId(context, requestedAgeGroupId);

    if (!targetAgeGroupId) {
      return NextResponse.json(
        { error: "Escalão é obrigatório." },
        { status: 400 },
      );
    }

    if (!context.accessibleAgeGroupIds.includes(targetAgeGroupId)) {
      return NextResponse.json({ error: "Sem permissões neste escalão." }, { status: 403 });
    }

    const insertPayload = {
      age_group_id: targetAgeGroupId,
      first_name,
      last_name,
      preferred_position: preferred_position ?? null,
      birth_date: birth_date ?? null,
      phone: phone ?? null,
      email: email ?? null,
      jersey_number: jersey_number ?? null,
      status: status ?? "active",
    };

    const { data, error } = await supabase
      .from("players")
      .insert(insertPayload)
      .select(PLAYER_FIELDS)
      .single();

    if (error || !data) {
      console.error("Erro ao criar atleta:", error);
      return NextResponse.json(
        { error: "Erro ao criar atleta." },
        { status: 500 },
      );
    }

    await captureServerProductEvent({
      distinctId: userId,
      event: "player_added",
      properties: {
        age_group_id: targetAgeGroupId,
        player_id: data.id,
        player_status: data.status,
      },
    });

    return NextResponse.json({ success: true, player: data });
  } catch (error) {
    return respondInternalError("api.players.post", error, {
      request,
      userId,
      ageGroupId: targetAgeGroupId,
    });
  }
}
