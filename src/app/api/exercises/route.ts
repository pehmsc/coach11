import { NextResponse } from "next/server";
import { z } from "zod";
import { checkPermission } from "@/lib/auth/require-permission";
import { createAdminClient } from "@/lib/supabase/admin";
import { SHORT_PRIVATE_CACHE_CONTROL } from "@/lib/http/cache";
import { respondInternalError } from "@/lib/http/respond-internal-error";

const EXERCISE_CATEGORIES = [
  "warmup",
  "technical",
  "tactical",
  "formal_game",
  "finishing",
  "defensive_org",
  "offensive_org",
  "transition",
  "physical",
  "set_pieces",
  "strategy",
  "cooldown",
  "other",
] as const;

const CreateExerciseSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  category: z.enum(EXERCISE_CATEGORIES),
  description: z.string().nullish(),
  objectives: z.string().nullish(),
  success_criteria: z.string().nullish(),
  subcategory: z.string().nullish(),
  game_format: z.string().nullish(),
  duration_minutes: z.number().int().positive().nullish(),
  rest_minutes: z.number().int().min(0).default(0),
  min_players: z.number().int().positive().nullish(),
  max_players: z.number().int().positive().nullish(),
  field_dimensions: z.string().nullish(),
  material: z.string().nullish(),
  diagram_url: z.string().url().nullish(),
});

const SELECT_FIELDS =
  "id, club_id, age_group_id, created_by, name, description, objectives, success_criteria, category, subcategory, game_format, duration_minutes, rest_minutes, min_players, max_players, field_dimensions, material, diagram_url, is_shared, created_at, updated_at";

export async function GET(request: Request) {
  try {
    const check = await checkPermission("exercises", "read");
    if (!check.allowed) return check.response;

    const { ageGroupId } = check;
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const search = searchParams.get("search");

    const admin = createAdminClient();

    let query = admin
      .from("exercises")
      .select(SELECT_FIELDS)
      .eq("age_group_id", ageGroupId)
      .order("updated_at", { ascending: false });

    if (category) {
      query = query.eq("category", category);
    }

    if (search) {
      query = query.ilike("name", `%${search}%`);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { error: "Erro ao carregar exercícios." },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { success: true, exercises: data ?? [] },
      { headers: { "Cache-Control": SHORT_PRIVATE_CACHE_CONTROL } },
    );
  } catch (error) {
    return respondInternalError("api.exercises.get", error);
  }
}

export async function POST(request: Request) {
  try {
    const check = await checkPermission("exercises", "write");
    if (!check.allowed) return check.response;

    const { userId, ageGroupId } = check;

    const body = await request.json().catch(() => null);
    const parsed = CreateExerciseSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Dados inválidos.",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const admin = createAdminClient();

    const { data: ageGroup } = await admin
      .from("age_groups")
      .select("club_id")
      .eq("id", ageGroupId)
      .single();

    if (!ageGroup) {
      return NextResponse.json(
        { error: "Escalão não encontrado." },
        { status: 404 },
      );
    }

    const { data, error } = await admin
      .from("exercises")
      .insert({
        ...parsed.data,
        age_group_id: ageGroupId,
        club_id: ageGroup.club_id,
        created_by: userId,
      })
      .select(SELECT_FIELDS)
      .single();

    if (error) {
      return NextResponse.json(
        { error: "Erro ao criar exercício." },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, exercise: data }, { status: 201 });
  } catch (error) {
    return respondInternalError("api.exercises.post", error);
  }
}
