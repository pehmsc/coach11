import { createClient } from "@/lib/supabase/server";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import { fetchGameAccessContext } from "@/lib/games/access";
import { deleteGameCascade } from "@/lib/events/delete-cascade";
import { gameUpdateSchema } from "@/lib/schemas/games";
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const { id: gameId } = await params;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
    }

    const parsed = gameUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "validation", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    if (Object.keys(parsed.data).length === 0) {
      return NextResponse.json(
        { error: "Sem campos para atualizar." },
        { status: 400 },
      );
    }

    let access = null;
    try {
      access = await fetchGameAccessContext(supabase, gameId);
    } catch {
      return NextResponse.json({ error: "Erro ao validar jogo." }, { status: 500 });
    }

    if (!access?.exists || !access.canAccess) {
      return NextResponse.json({ error: "Sem permissões." }, { status: 403 });
    }

    if (access.status === "completed" && !access.isCoordinator) {
      return NextResponse.json(
        { error: "Só o coordenador pode editar jogos terminados." },
        { status: 403 },
      );
    }

    const { data: updated, error: updateError } = await supabase
      .from("games")
      .update(parsed.data)
      .eq("id", gameId)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: "Erro ao atualizar jogo." },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, game: updated });
  } catch (error) {
    return respondInternalError("api.games.id.patch", error);
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const { id: gameId } = await params;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    let access = null;
    try {
      access = await fetchGameAccessContext(supabase, gameId);
    } catch {
      return NextResponse.json({ error: "Erro ao validar jogo." }, { status: 500 });
    }

    if (!access?.exists) {
      return NextResponse.json({ error: "Jogo não encontrado." }, { status: 404 });
    }
    if (!access.canAccess) {
      return NextResponse.json({ error: "Sem permissões." }, { status: 403 });
    }
    if (!access.isCoordinator) {
      return NextResponse.json(
        { error: "Só o coordenador pode apagar jogos." },
        { status: 403 },
      );
    }

    await deleteGameCascade(supabase, gameId);

    return NextResponse.json({ success: true });
  } catch (error) {
    return respondInternalError("api.games.id.delete", error);
  }
}
