import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { respondInternalError } from "@/lib/http/respond-internal-error";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const VALID_STATUSES = ["starter", "substitute"] as const;

const CorrectionsSchema = z.object({
  corrections: z
    .array(
      z.object({
        game_squad_id: z.string().uuid(),
        new_status: z.enum(VALID_STATUSES),
      }),
    )
    .min(1),
  reason: z.string().min(5).max(500),
});

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { id: gameId } = await params;
    if (!gameId) {
      return NextResponse.json({ error: "ID inválido." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const parsed = CorrectionsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Payload inválido.", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { data, error } = await supabase.rpc("rpc_correct_initial_lineup", {
      p_game_id: gameId,
      p_corrections: parsed.data.corrections,
      p_reason: parsed.data.reason,
    });

    if (error) {
      // P0001 = RAISE EXCEPTION (validacao da RPC: nao-Coordenador, razao curta).
      // Devolvemos 400 com a mensagem original em vez de 500.
      const message = error.message || "Erro ao aplicar correccoes.";
      const status = error.code === "P0001" ? 400 : 500;
      if (status === 500) {
        return respondInternalError(
          "api.games.id.lineup-corrections.post",
          error,
          { request, userId: user.id },
        );
      }
      return NextResponse.json({ error: message }, { status });
    }

    return NextResponse.json({ success: true, result: data });
  } catch (error) {
    return respondInternalError(
      "api.games.id.lineup-corrections.post",
      error,
      { request },
    );
  }
}

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { id: gameId } = await params;
    if (!gameId) {
      return NextResponse.json({ error: "ID inválido." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const [{ data: corrections, error: correctionsError }, squadResult] =
      await Promise.all([
        supabase
          .from("lineup_corrections_log")
          .select(
            "id, game_squad_id, player_id, old_status, new_status, reason, corrected_at, corrected_by",
          )
          .eq("game_id", gameId)
          .order("corrected_at", { ascending: false }),
        supabase
          .from("game_squads")
          .select(
            `id, player_id, initial_lineup_status, external_name, external_jersey_number,
             players:players(id, first_name, last_name, jersey_number)`,
          )
          .eq("game_id", gameId)
          .order("initial_lineup_status", { ascending: true }),
      ]);

    if (correctionsError) {
      return respondInternalError(
        "api.games.id.lineup-corrections.get",
        correctionsError,
        { request, userId: user.id },
      );
    }
    if (squadResult.error) {
      return respondInternalError(
        "api.games.id.lineup-corrections.get",
        squadResult.error,
        { request, userId: user.id },
      );
    }

    return NextResponse.json({
      success: true,
      corrections: corrections ?? [],
      squad: squadResult.data ?? [],
    });
  } catch (error) {
    return respondInternalError(
      "api.games.id.lineup-corrections.get",
      error,
      { request },
    );
  }
}
