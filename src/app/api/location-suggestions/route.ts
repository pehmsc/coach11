import { NextResponse } from "next/server";
import { resolveUserTeamContext } from "@/lib/auth/team-context";
import { SHORT_PRIVATE_CACHE_CONTROL } from "@/lib/http/cache";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function normalizeSuggestionValue(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function collectSuggestion(
  set: Set<string>,
  value: unknown,
) {
  const normalizedValue = normalizeSuggestionValue(value);
  if (!normalizedValue) return;
  set.add(normalizedValue);
}

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    let db = supabase;
    try {
      db = createAdminClient();
    } catch {
      db = supabase;
    }

    const context = await resolveUserTeamContext(db, user.id);
    if (context.accessibleAgeGroupIds.length === 0) {
      return NextResponse.json(
        { locations: [], addresses: [] },
        {
          headers: {
            "Cache-Control": SHORT_PRIVATE_CACHE_CONTROL,
          },
        },
      );
    }

    const [groundsRes, trainingsRes, gamesRes] = await Promise.all([
      db
        .from("grounds")
        .select("name, address")
        .in("age_group_id", context.accessibleAgeGroupIds)
        .order("created_at", { ascending: false })
        .limit(80),
      db
        .from("training_sessions")
        .select("location, location_address")
        .in("age_group_id", context.accessibleAgeGroupIds)
        .order("created_at", { ascending: false })
        .limit(120),
      db
        .from("games")
        .select("location, location_address")
        .in("age_group_id", context.accessibleAgeGroupIds)
        .order("created_at", { ascending: false })
        .limit(120),
    ]);

    const locationSuggestions = new Set<string>();
    const addressSuggestions = new Set<string>();

    for (const ground of groundsRes.data || []) {
      collectSuggestion(locationSuggestions, ground.name);
      collectSuggestion(addressSuggestions, ground.address);
    }

    for (const training of trainingsRes.data || []) {
      collectSuggestion(locationSuggestions, training.location);
      collectSuggestion(addressSuggestions, training.location_address);
    }

    for (const game of gamesRes.data || []) {
      collectSuggestion(locationSuggestions, game.location);
      collectSuggestion(addressSuggestions, game.location_address);
    }

    return NextResponse.json(
      {
        locations: Array.from(locationSuggestions).slice(0, 60),
        addresses: Array.from(addressSuggestions).slice(0, 60),
      },
      {
        headers: {
          "Cache-Control": SHORT_PRIVATE_CACHE_CONTROL,
        },
      },
    );
  } catch (error) {
    return respondInternalError("api.location-suggestions.get", error);
  }
}
