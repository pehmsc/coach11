import { NextResponse } from "next/server";
import { z } from "zod";
import { checkPermission } from "@/lib/auth/require-permission";
import { createAdminClient } from "@/lib/supabase/admin";
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

const UpdateExerciseSchema = z.object({
  name: z.string().min(1).optional(),
  category: z.enum(EXERCISE_CATEGORIES).optional(),
  description: z.string().nullish(),
  objectives: z.string().nullish(),
  success_criteria: z.string().nullish(),
  subcategory: z.string().nullish(),
  game_format: z.string().nullish(),
  duration_minutes: z.number().int().positive().nullish(),
  rest_minutes: z.number().int().min(0).optional(),
  min_players: z.number().int().positive().nullish(),
  max_players: z.number().int().positive().nullish(),
  field_dimensions: z.string().nullish(),
  material: z.string().nullish(),
  diagram_url: z.string().url().nullish(),
});

const SELECT_FIELDS =
  "id, club_id, age_group_id, created_by, name, description, objectives, success_criteria, category, subcategory, game_format, duration_minutes, rest_minutes, min_players, max_players, field_dimensions, material, diagram_url, is_shared, created_at, updated_at";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const check = await checkPermission("exercises", "read");
    if (!check.allowed) return check.response;

    const { id } = await params;
    const admin = createAdminClient();

    const { data, error } = await admin
      .from("exercises")
      .select(SELECT_FIELDS)
      .eq("id", id)
      .eq("age_group_id", check.ageGroupId)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "Exercício não encontrado." },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, exercise: data });
  } catch (error) {
    return respondInternalError("api.exercises.id.get", error);
  }
}

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const check = await checkPermission("exercises", "edit");
    if (!check.allowed) return check.response;

    const { id } = await params;
    const body = await request.json().catch(() => null);
    const parsed = UpdateExerciseSchema.safeParse(body);

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

    const { data, error } = await admin
      .from("exercises")
      .update(parsed.data)
      .eq("id", id)
      .eq("age_group_id", check.ageGroupId)
      .select(SELECT_FIELDS)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "Erro ao atualizar exercício." },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, exercise: data });
  } catch (error) {
    return respondInternalError("api.exercises.id.put", error);
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const check = await checkPermission("exercises", "delete");
    if (!check.allowed) return check.response;

    const { id } = await params;
    const admin = createAdminClient();

    const { error } = await admin
      .from("exercises")
      .delete()
      .eq("id", id)
      .eq("age_group_id", check.ageGroupId);

    if (error) {
      return NextResponse.json(
        { error: "Erro ao apagar exercício." },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return respondInternalError("api.exercises.id.delete", error);
  }
}
