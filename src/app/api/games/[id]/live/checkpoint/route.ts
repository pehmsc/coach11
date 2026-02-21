import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type MatchPhase =
  | "pre_match"
  | "first_half"
  | "halftime"
  | "second_half"
  | "review"
  | "completed";

const VALID_PHASES = new Set<MatchPhase>([
  "pre_match",
  "first_half",
  "halftime",
  "second_half",
  "review",
  "completed",
]);

function parsePhase(value: unknown): MatchPhase | null {
  if (typeof value !== "string") return null;
  return VALID_PHASES.has(value as MatchPhase) ? (value as MatchPhase) : null;
}

function isRunningPhase(phase: MatchPhase) {
  return phase === "first_half" || phase === "second_half";
}

function isMissingCheckpointTableError(errorMessage: string | null | undefined) {
  if (!errorMessage) return false;
  return (
    errorMessage.includes("game_live_checkpoints") &&
    (errorMessage.includes("does not exist") || errorMessage.includes("relation"))
  );
}

async function assertGameAccess(
  admin: ReturnType<typeof createAdminClient>,
  gameId: string,
  userId: string,
) {
  const { data: game, error: gameError } = await admin
    .from("games")
    .select("id, team_id, age_group_id, status")
    .eq("id", gameId)
    .maybeSingle();

  if (gameError) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Erro ao validar jogo." }, { status: 500 }),
    };
  }

  if (!game) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Jogo não encontrado." }, { status: 404 }),
    };
  }

  let hasAccess = false;
  let isCoordinator = false;
  let teamId: string | null = (game as unknown as { team_id?: string }).team_id ?? null;
  const ageGroupId = (game as unknown as { age_group_id?: string }).age_group_id ?? null;
  const gameStatus = (game as unknown as { status?: string }).status ?? null;

  if (ageGroupId) {
    const { data: ageGroupOwner } = await admin
      .from("age_groups")
      .select("id")
      .eq("id", ageGroupId)
      .eq("coordinator_id", userId)
      .maybeSingle();
    hasAccess = !!ageGroupOwner;
    isCoordinator = !!ageGroupOwner;
  }

  if (!teamId && ageGroupId) {
    const { data: fallbackTeam } = await admin
      .from("teams")
      .select("id")
      .eq("age_group_id", ageGroupId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    teamId = (fallbackTeam as unknown as { id?: string } | null)?.id ?? null;
  }

  if (!hasAccess && teamId) {
    const { data: staffLink } = await admin
      .from("team_staff")
      .select("id")
      .eq("team_id", teamId)
      .eq("profile_id", userId)
      .maybeSingle();
    hasAccess = !!staffLink;
  }

  if (!hasAccess) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Sem permissões." }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    isCoordinator,
    gameStatus,
  };
}

export async function GET(_: Request, { params }: RouteContext) {
  try {
    const { id: gameId } = await params;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const admin = createAdminClient();
    const access = await assertGameAccess(admin, gameId, user.id);
    if (!access.ok) return access.response;
    if (access.gameStatus === "completed" && !access.isCoordinator) {
      return NextResponse.json(
        { error: "Só o coordenador pode editar jogos terminados." },
        { status: 403 },
      );
    }

    const { data, error } = await admin
      .from("game_live_checkpoints")
      .select("phase, base_seconds, running_since_ms, updated_at")
      .eq("game_id", gameId)
      .maybeSingle();

    if (error) {
      if (isMissingCheckpointTableError(error.message)) {
        return NextResponse.json({ checkpoint: null, missingTable: true });
      }
      return NextResponse.json({ error: "Erro ao carregar checkpoint live." }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ checkpoint: null });
    }

    const checkpoint = {
      phase: parsePhase(data.phase) ?? "pre_match",
      baseSeconds:
        typeof data.base_seconds === "number" ? Math.max(0, Math.floor(data.base_seconds)) : 0,
      runningSinceMs:
        typeof data.running_since_ms === "number" ? data.running_since_ms : null,
      savedAt:
        typeof data.updated_at === "string" ? new Date(data.updated_at).getTime() : Date.now(),
    };

    return NextResponse.json({ checkpoint });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const { id: gameId } = await params;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const phase = parsePhase(body?.phase);
    const baseSeconds =
      typeof body?.baseSeconds === "number" && Number.isFinite(body.baseSeconds)
        ? Math.max(0, Math.floor(body.baseSeconds))
        : null;
    const runningSinceMsRaw =
      typeof body?.runningSinceMs === "number" && Number.isFinite(body.runningSinceMs)
        ? Math.floor(body.runningSinceMs)
        : body?.runningSinceMs === null
          ? null
          : undefined;

    if (!phase || baseSeconds === null || runningSinceMsRaw === undefined) {
      return NextResponse.json({ error: "Dados inválidos para checkpoint." }, { status: 400 });
    }

    if (runningSinceMsRaw !== null && runningSinceMsRaw < 0) {
      return NextResponse.json(
        { error: "runningSinceMs deve ser null ou >= 0." },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    const access = await assertGameAccess(admin, gameId, user.id);
    if (!access.ok) return access.response;

    const runningSinceMs = isRunningPhase(phase) ? runningSinceMsRaw : null;

    const { error } = await admin
      .from("game_live_checkpoints")
      .upsert(
        {
          game_id: gameId,
          phase,
          base_seconds: baseSeconds,
          running_since_ms: runningSinceMs,
          updated_at: new Date().toISOString(),
          updated_by: user.id,
        },
        { onConflict: "game_id" },
      );

    if (error) {
      if (isMissingCheckpointTableError(error.message)) {
        return NextResponse.json({ success: false, missingTable: true });
      }
      return NextResponse.json({ error: "Erro ao guardar checkpoint live." }, { status: 500 });
    }

    const { data: gameRow } = await admin
      .from("games")
      .select("status")
      .eq("id", gameId)
      .maybeSingle();

    const currentStatus = (gameRow as { status?: string } | null)?.status ?? null;
    if (currentStatus !== "completed" && currentStatus !== "cancelled") {
      const nextStatus = isRunningPhase(phase) ? "live" : "scheduled";
      await admin.from("games").update({ status: nextStatus }).eq("id", gameId);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
