import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { resolveUserTeamContext } from "@/lib/auth/team-context";
import { respondInternalError } from "@/lib/http/respond-internal-error";

type RouteContext = {
  params: Promise<{ ageGroupId: string }>;
};

const querySchema = z
  .object({
    q: z.string().trim().max(120).optional(),
    limit: z.coerce.number().int().min(1).max(20).optional(),
  })
  .strict();

const DEFAULT_LIMIT = 8;

type OpponentRow = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  tactical_formation: string | null;
};

type GameRow = {
  opponent_id: string | null;
  game_datetime: string | null;
};

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { ageGroupId } = await params;
    if (!ageGroupId) {
      return NextResponse.json({ error: "Escalao invalido." }, { status: 400 });
    }

    const url = new URL(request.url);
    const parsedQuery = querySchema.safeParse({
      q: url.searchParams.get("q") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: "Parametros invalidos." },
        { status: 400 },
      );
    }
    const q = parsedQuery.data.q?.trim() || null;
    const limit = parsedQuery.data.limit ?? DEFAULT_LIMIT;

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

    let opponentsQuery = supabase
      .from("opponents")
      .select("id, name, short_name, logo_url, tactical_formation")
      .eq("age_group_id", ageGroupId);

    if (q) {
      const pattern = `%${q}%`;
      opponentsQuery = opponentsQuery.or(
        `name.ilike.${pattern},short_name.ilike.${pattern}`,
      );
    }

    const { data: opponentsData, error: opponentsError } = await opponentsQuery;
    if (opponentsError) {
      return respondInternalError(
        "api.age-groups.opponents.typeahead.get",
        opponentsError,
        { request, userId: user.id, ageGroupId },
      );
    }

    const opponents = (opponentsData ?? []) as OpponentRow[];
    if (opponents.length === 0) {
      return NextResponse.json({ success: true, opponents: [] });
    }

    const opponentIds = opponents.map((o) => o.id);
    const { data: gamesData, error: gamesError } = await supabase
      .from("games")
      .select("opponent_id, game_datetime")
      .eq("age_group_id", ageGroupId)
      .in("opponent_id", opponentIds);

    if (gamesError) {
      return respondInternalError(
        "api.age-groups.opponents.typeahead.get.games",
        gamesError,
        { request, userId: user.id, ageGroupId },
      );
    }

    const counts = new Map<string, number>();
    const lastDates = new Map<string, string>();
    for (const g of (gamesData ?? []) as GameRow[]) {
      if (!g.opponent_id) continue;
      counts.set(g.opponent_id, (counts.get(g.opponent_id) ?? 0) + 1);
      if (g.game_datetime) {
        const prev = lastDates.get(g.opponent_id);
        if (!prev || g.game_datetime > prev) {
          lastDates.set(g.opponent_id, g.game_datetime);
        }
      }
    }

    const enriched = opponents
      .map((o) => ({
        id: o.id,
        name: o.name,
        short_name: o.short_name,
        logo_url: o.logo_url,
        tactical_formation: o.tactical_formation,
        games_count: counts.get(o.id) ?? 0,
        last_game_at: lastDates.get(o.id) ?? null,
      }))
      .sort((a, b) => {
        if (b.games_count !== a.games_count) {
          return b.games_count - a.games_count;
        }
        return a.name.localeCompare(b.name, "pt", { sensitivity: "base" });
      })
      .slice(0, limit);

    return NextResponse.json({ success: true, opponents: enriched });
  } catch (error) {
    return respondInternalError(
      "api.age-groups.opponents.typeahead.get",
      error,
      { request },
    );
  }
}
