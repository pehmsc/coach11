import { createClient } from "@/lib/supabase/server";
import {
  assertConvocationWriteAllowed,
  insertConvocationAuditLog,
} from "@/lib/games/convocation-guard";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import { captureServerProductEvent } from "@/lib/observability/posthog-server";
import { createNotificationForTeamOnce } from "@/lib/notifications/service";
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

// Confirma convocatória: passa `games.convocation_status` de 'draft' a
// 'published'. Antes do refactor usava convocations.status='confirmed'.
// Modelo unificado: game_squads é fonte de verdade da lista; games.convocation_status
// é apenas a flag de publicação.
export async function POST(_request: Request, { params }: RouteContext) {
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
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    userId = user.id;

    const body = await _request.json().catch(() => null);
    const correctionReason =
      typeof body?.correctionReason === "string" ? body.correctionReason : null;

    const writeGuard = await assertConvocationWriteAllowed(
      supabase,
      gameId,
      correctionReason,
    );
    if (!writeGuard.ok) {
      return writeGuard.response;
    }

    // Contar squads no jogo (internos + externos via game_squads)
    const { count: squadCount, error: squadCountError } = await supabase
      .from("game_squads")
      .select("id", { head: true, count: "exact" })
      .eq("game_id", gameId);

    if (squadCountError) {
      return NextResponse.json(
        { error: "Erro ao validar jogadores convocados." },
        { status: 500 },
      );
    }

    const playersCount = squadCount ?? 0;

    if (playersCount <= 0) {
      return NextResponse.json(
        { error: "Seleciona pelo menos 1 jogador antes de guardar." },
        { status: 400 },
      );
    }

    // Garantir game_stats_live tem row para cada jogador interno convocado.
    // TODO: remove after game_stats_live.status drop.
    const { data: internalSquads, error: internalSquadsError } = await supabase
      .from("game_squads")
      .select("player_id")
      .eq("game_id", gameId)
      .not("player_id", "is", null);

    if (internalSquadsError) {
      return NextResponse.json(
        { error: "Erro ao validar squads internos." },
        { status: 500 },
      );
    }

    const internalPlayerIds = (internalSquads || [])
      .map((row) => row.player_id)
      .filter((id): id is string => typeof id === "string");

    if (internalPlayerIds.length > 0) {
      const { data: existingLiveRows, error: existingLiveRowsError } = await supabase
        .from("game_stats_live")
        .select("player_id")
        .eq("game_id", gameId);

      if (existingLiveRowsError) {
        return NextResponse.json(
          { error: "Erro ao preparar estados live dos convocados." },
          { status: 500 },
        );
      }

      const existingLiveIds = new Set(
        (existingLiveRows || []).map((row) => row.player_id),
      );
      const missingLiveRows = internalPlayerIds
        .filter((playerId) => !existingLiveIds.has(playerId))
        .map((playerId) => ({
          game_id: gameId,
          player_id: playerId,
          status: "on_bench",
          start_minute: null,
          end_minute: null,
        }));

      if (missingLiveRows.length > 0) {
        const { error: insertLiveRowsError } = await supabase
          .from("game_stats_live")
          .insert(missingLiveRows);

        if (insertLiveRowsError) {
          console.error(
            "[convocation/confirm] game_stats_live insert falhou (não-bloqueante):",
            insertLiveRowsError.message,
          );
        }
      }
    }

    const { error: updateError } = await supabase
      .from("games")
      .update({ convocation_status: "published" })
      .eq("id", gameId);

    if (updateError) {
      return NextResponse.json(
        { error: "Erro ao guardar convocatória." },
        { status: 500 },
      );
    }

    // Defesa em profundidade: garantir que existe sempre uma row em `convocations`
    // para este jogo. A página pública lê `notes` daqui (legacy). Sem esta row,
    // um utilizador que adicione notas à convocatória não teria onde escrever, então
    // pre-criamos a row vazia no momento da confirmação.
    // Não-bloqueante: se falhar, log e segue. O gate principal está em
    // games.convocation_status === "published".
    try {
      const { data: existingConvocation } = await supabase
        .from("convocations")
        .select("id")
        .eq("game_id", gameId)
        .limit(1)
        .maybeSingle();

      if (!existingConvocation) {
        const { data: gameForClub } = await supabase
          .from("games")
          .select("age_group_id")
          .eq("id", gameId)
          .maybeSingle();

        if (gameForClub?.age_group_id) {
          const { data: ageGroupForClub } = await supabase
            .from("age_groups")
            .select("club_id")
            .eq("id", gameForClub.age_group_id)
            .maybeSingle();

          if (ageGroupForClub?.club_id) {
            const { error: insertConvocationError } = await supabase
              .from("convocations")
              .insert({
                game_id: gameId,
                club_id: ageGroupForClub.club_id,
                status: "confirmed",
              });

            if (insertConvocationError) {
              console.error(
                "[convocation/confirm] insert legacy convocations row falhou (não-bloqueante):",
                insertConvocationError.message,
              );
            }
          }
        }
      }
    } catch (legacyConvocationError) {
      console.error(
        "[convocation/confirm] defesa em profundidade da convocations row falhou (não-bloqueante):",
        legacyConvocationError,
      );
    }

    if (writeGuard.requiresAudit && writeGuard.correctionReason) {
      await insertConvocationAuditLog({
        actorId: user.id,
        gameId,
        action: "convocation_confirmed_after_completed",
        correctionReason: writeGuard.correctionReason,
      });
    }

    const { data: gameRow } = await supabase
      .from("games")
      .select("id, title, opponent_name, team_id, age_group_id")
      .eq("id", gameId)
      .maybeSingle();
    ageGroupIdForError = gameRow?.age_group_id ?? null;
    teamIdForError = gameRow?.team_id ?? null;

    if (gameRow?.team_id && gameRow?.age_group_id) {
      await captureServerProductEvent({
        distinctId: user.id,
        event: "convocation_created",
        properties: {
          game_id: gameId,
          age_group_id: gameRow.age_group_id,
          team_id: gameRow.team_id,
          players_count: playersCount,
        },
      });

      try {
        await createNotificationForTeamOnce(supabase, {
          teamId: gameRow.team_id,
          ageGroupId: gameRow.age_group_id,
          actorId: user.id,
          type: "convocation_confirmed",
          entityId: gameId,
          title: "Convocatória confirmada",
          body: gameRow.title || gameRow.opponent_name || "Jogo atualizado",
          linkPath: `/games/${gameId}`,
          excludeActor: true,
        });
      } catch (notificationError) {
        console.error(
          "Erro ao gerar notificação operacional da convocatória:",
          notificationError,
        );
      }
    }

    return NextResponse.json({
      success: true,
      status: "published",
      players: playersCount,
    });
  } catch (error) {
    return respondInternalError("api.games.id.convocation.confirm.post", error, {
      request: _request,
      userId,
      gameId: gameIdForError,
      ageGroupId: ageGroupIdForError,
      teamId: teamIdForError,
    });
  }
}
