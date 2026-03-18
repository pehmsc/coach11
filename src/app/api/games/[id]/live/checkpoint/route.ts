import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import { parseBody } from "@/lib/http/validate";
import { captureServerProductEvent } from "@/lib/observability/posthog-server";
import { fetchGameAccessContext } from "@/lib/games/access";
import { createNotificationForTeamOnce } from "@/lib/notifications/service";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

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

const CheckpointPatchSchema = z.object({
  phase: z.enum(["pre_match", "first_half", "halftime", "second_half", "review", "completed"]),
  baseSeconds: z.number().int().min(0),
  runningSinceMs: z.number().int().min(0).nullable(),
});

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
  db: SupabaseClient,
  gameId: string,
) {
  const { data: game, error: gameError } = await db
    .from("games")
    .select("id, status, title, opponent_name")
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

  const gameStatus = (game as unknown as { status?: string }).status ?? null;
  const gameTitle = (game as unknown as { title?: string | null }).title ?? null;
  const opponentName =
    (game as unknown as { opponent_name?: string | null }).opponent_name ?? null;

  let access = null;
  try {
    access = await fetchGameAccessContext(db, gameId);
  } catch (error) {
    console.error("[api.games.live.checkpoint.access]", { gameId, error });
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Erro ao validar jogo." }, { status: 500 }),
    };
  }

  if (!access?.exists || !access.canAccess) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Sem permissões." }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    isCoordinator: access.isCoordinator,
    gameStatus,
    teamId: access.teamId,
    ageGroupId: access.ageGroupId,
    gameTitle,
    opponentName,
  };
}

export async function GET(_: Request, { params }: RouteContext) {
  let userId: string | null = null;
  let gameIdForError: string | null = null;

  try {
    const { id: gameId } = await params;
    gameIdForError = gameId;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }
    userId = user.id;

    const access = await assertGameAccess(supabase, gameId);
    if (!access.ok) return access.response;
    if (access.gameStatus === "completed" && !access.isCoordinator) {
      return NextResponse.json(
        { error: "Só o coordenador pode editar jogos terminados." },
        { status: 403 },
      );
    }

    const { data, error } = await supabase
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
    return respondInternalError("api.games.id.live.checkpoint.get", error, {
      userId,
      gameId: gameIdForError,
    });
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  let userId: string | null = null;
  let gameIdForError: string | null = null;
  let ageGroupIdForError: string | null = null;
  let teamIdForError: string | null = null;

  try {
    const { id: gameId } = await params;
    gameIdForError = gameId;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }
    userId = user.id;

    const parsed = await parseBody(request, CheckpointPatchSchema);
    if (parsed.error) return parsed.error;
    const { phase, baseSeconds, runningSinceMs: runningSinceMsRaw } = parsed.data;

    const access = await assertGameAccess(supabase, gameId);
    if (!access.ok) return access.response;
    ageGroupIdForError = access.ageGroupId;
    teamIdForError = access.teamId;

    const runningSinceMs = isRunningPhase(phase) ? runningSinceMsRaw : null;

    const { error } = await supabase
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

    const { data: gameRow } = await supabase
      .from("games")
      .select("status")
      .eq("id", gameId)
      .maybeSingle();

    const currentStatus = (gameRow as { status?: string } | null)?.status ?? null;
    if (currentStatus !== "completed" && currentStatus !== "cancelled") {
      const nextStatus = isRunningPhase(phase) ? "live" : "scheduled";
      await supabase.from("games").update({ status: nextStatus }).eq("id", gameId);

      if (
        currentStatus !== "live" &&
        nextStatus === "live" &&
        access.teamId &&
        access.ageGroupId
      ) {
        await captureServerProductEvent({
          distinctId: user.id,
          event: "game_started",
          properties: {
            game_id: gameId,
            age_group_id: access.ageGroupId,
            team_id: access.teamId,
            phase,
          },
        });

        try {
          await createNotificationForTeamOnce(supabase, {
            teamId: access.teamId,
            ageGroupId: access.ageGroupId,
            actorId: user.id,
            type: "game_live_started",
            entityId: gameId,
            title: "Jogo entrou em live",
            body: access.gameTitle || access.opponentName || "O live do jogo foi iniciado.",
            linkPath: `/games/${gameId}/live`,
            excludeActor: true,
          });
        } catch (notificationError) {
          console.error(
            "Erro ao gerar notificação operacional de início de live:",
            notificationError,
          );
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return respondInternalError("api.games.id.live.checkpoint.patch", error, {
      request,
      userId,
      gameId: gameIdForError,
      ageGroupId: ageGroupIdForError,
      teamId: teamIdForError,
    });
  }
}
