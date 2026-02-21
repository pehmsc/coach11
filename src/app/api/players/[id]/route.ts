import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { resolveUserTeamContext } from "@/lib/auth/team-context";
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

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

  return { admin, context };
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "ID inválido." }, { status: 400 });
    }

    const routeContext = await getRouteContext();
    if ("error" in routeContext) return routeContext.error;
    const { admin, context } = routeContext;

    const { data: existingPlayer, error: existingError } = await admin
      .from("players")
      .select("id, age_group_id")
      .eq("id", id)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json(
        { error: "Erro ao validar atleta." },
        { status: 500 },
      );
    }
    if (!existingPlayer) {
      return NextResponse.json({ error: "Atleta não encontrado." }, { status: 404 });
    }
    if (!context.accessibleAgeGroupIds.includes(existingPlayer.age_group_id)) {
      return NextResponse.json(
        { error: "Sem permissões para editar este atleta." },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    const row = body as Record<string, unknown>;

    if ("first_name" in row) {
      const value = normalizeOptionalText(row.first_name);
      if (!value) {
        return NextResponse.json({ error: "Primeiro nome inválido." }, { status: 400 });
      }
      updates.first_name = value;
    }
    if ("last_name" in row) {
      const value = normalizeOptionalText(row.last_name);
      if (!value) {
        return NextResponse.json({ error: "Apelido inválido." }, { status: 400 });
      }
      updates.last_name = value;
    }
    if ("preferred_position" in row) {
      updates.preferred_position = normalizeOptionalText(row.preferred_position);
    }
    if ("birth_date" in row) {
      updates.birth_date = normalizeOptionalText(row.birth_date);
    }
    if ("phone" in row) {
      updates.phone = normalizeOptionalText(row.phone);
    }
    if ("email" in row) {
      updates.email = normalizeOptionalText(row.email);
    }
    if ("jersey_number" in row) {
      updates.jersey_number = normalizeOptionalInt(row.jersey_number);
    }
    if ("status" in row) {
      const status = normalizeOptionalText(row.status);
      if (
        status &&
        !["active", "injured", "suspended", "inactive"].includes(status)
      ) {
        return NextResponse.json({ error: "Estado inválido." }, { status: 400 });
      }
      updates.status = status;
    }
    if ("invite_code" in row) {
      updates.invite_code = normalizeOptionalText(row.invite_code);
    }
    if ("invite_method" in row) {
      updates.invite_method = normalizeOptionalText(row.invite_method);
    }
    if ("invite_sent_at" in row) {
      updates.invite_sent_at = normalizeOptionalText(row.invite_sent_at);
    }
    if ("invite_accepted_at" in row) {
      updates.invite_accepted_at = normalizeOptionalText(row.invite_accepted_at);
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "Sem campos para atualizar." },
        { status: 400 },
      );
    }

    const { data, error } = await admin
      .from("players")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || "Erro ao atualizar atleta." },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, player: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
