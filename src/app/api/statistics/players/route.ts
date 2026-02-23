import { createClient } from "@/lib/supabase/server";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import { NextResponse } from "next/server";

type StatisticsRpcPayload = {
  ok?: boolean;
  error_code?: string;
  players?: unknown[];
  attendanceRows?: unknown[];
  finalStats?: unknown[];
  convocations?: unknown[];
  convocationPlayers?: unknown[];
  gameIds?: unknown[];
  gameEvents?: unknown[];
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const ageGroupId = searchParams.get("ageGroupId");

    if (!ageGroupId) {
      return NextResponse.json({ error: "ageGroupId obrigatório" }, { status: 400 });
    }

    if (!isUuid(ageGroupId)) {
      return NextResponse.json({ error: "Sem permissões" }, { status: 403 });
    }

    const rpcRes = await supabase.rpc("rpc_statistics_players", {
      p_age_group_id: ageGroupId,
    });

    if (rpcRes.error) {
      return NextResponse.json({ error: "Erro ao carregar jogadores" }, { status: 500 });
    }

    const payload = (rpcRes.data || null) as StatisticsRpcPayload | null;
    if (!payload?.ok) {
      if (payload?.error_code === "forbidden") {
        return NextResponse.json({ error: "Sem permissões" }, { status: 403 });
      }
      if (payload?.error_code === "missing_age_group_id") {
        return NextResponse.json({ error: "ageGroupId obrigatório" }, { status: 400 });
      }
      return NextResponse.json({ error: "Sem permissões" }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      players: asArray(payload.players),
      attendanceRows: asArray(payload.attendanceRows),
      finalStats: asArray(payload.finalStats),
      convocations: asArray(payload.convocations),
      convocationPlayers: asArray(payload.convocationPlayers),
      gameIds: asArray(payload.gameIds),
      gameEvents: asArray(payload.gameEvents),
    });
  } catch (error) {
    console.error("Erro ao carregar estatísticas:", error);
    return respondInternalError("api.statistics.players.get", error);
  }
}
