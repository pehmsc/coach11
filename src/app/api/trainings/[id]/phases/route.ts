import { NextResponse } from "next/server";
import { z } from "zod";
import { checkPermission } from "@/lib/auth/require-permission";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondInternalError } from "@/lib/http/respond-internal-error";

const PHASE_TYPES = ["initial", "main", "final", "custom"] as const;

const PhaseExerciseSchema = z.object({
  exercise_id: z.string().uuid().nullish(),
  exercise_order: z.number().int().min(0),
  custom_name: z.string().nullish(),
  custom_description: z.string().nullish(),
  custom_objectives: z.string().nullish(),
  custom_game_format: z.string().nullish(),
  custom_duration_minutes: z.number().int().positive().nullish(),
  custom_rest_minutes: z.number().int().min(0).nullish(),
  custom_num_players: z.number().int().positive().nullish(),
  custom_field_dimensions: z.string().nullish(),
  custom_material: z.string().nullish(),
  custom_diagram_url: z.string().nullish(),
  planned_time_minutes: z.number().int().positive().nullish(),
  repetitions: z.number().int().min(1).default(1),
  total_athletes: z.number().int().positive().nullish(),
  notes: z.string().nullish(),
});

const BatchPhasesSchema = z.object({
  phases: z.array(
    z.object({
      phase_type: z.enum(PHASE_TYPES),
      phase_name: z.string().nullish(),
      phase_order: z.number().int().min(0),
      duration_minutes: z.number().int().positive().nullish(),
      notes: z.string().nullish(),
      exercises: z.array(PhaseExerciseSchema).default([]),
    }),
  ),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const check = await checkPermission("trainings", "read");
    if (!check.allowed) return check.response;

    const { id: trainingSessionId } = await params;
    const admin = createAdminClient();

    const { data: phases, error: phasesError } = await admin
      .from("training_phases")
      .select("id, training_session_id, club_id, phase_type, phase_name, phase_order, duration_minutes, notes, created_at, updated_at")
      .eq("training_session_id", trainingSessionId)
      .order("phase_order", { ascending: true });

    if (phasesError) {
      return NextResponse.json({ error: "Erro ao carregar fases." }, { status: 500 });
    }

    if (!phases || phases.length === 0) {
      return NextResponse.json({ success: true, phases: [] });
    }

    const phaseIds = phases.map((p) => p.id);

    const { data: exerciseRows, error: exError } = await admin
      .from("training_phase_exercises")
      .select(
        "id, phase_id, exercise_id, club_id, exercise_order, custom_name, custom_description, custom_objectives, custom_game_format, custom_duration_minutes, custom_rest_minutes, custom_num_players, custom_field_dimensions, custom_material, custom_diagram_url, planned_time_minutes, repetitions, total_athletes, notes, created_at",
      )
      .in("phase_id", phaseIds)
      .order("exercise_order", { ascending: true });

    if (exError) {
      return NextResponse.json({ error: "Erro ao carregar exercícios das fases." }, { status: 500 });
    }

    // Fetch exercise details for linked exercises
    const exerciseIds = (exerciseRows ?? [])
      .map((e) => e.exercise_id)
      .filter((eid): eid is string => !!eid);

    let exerciseMap = new Map<string, Record<string, unknown>>();
    if (exerciseIds.length > 0) {
      const uniqueIds = [...new Set(exerciseIds)];
      const { data: exercises } = await admin
        .from("exercises")
        .select(
          "id, name, description, objectives, success_criteria, category, game_format, duration_minutes, rest_minutes, min_players, max_players, field_dimensions, material, diagram_url",
        )
        .in("id", uniqueIds);

      exerciseMap = new Map(
        (exercises ?? []).map((ex) => [ex.id as string, ex]),
      );
    }

    const enrichedPhases = phases.map((phase) => ({
      ...phase,
      exercises: (exerciseRows ?? [])
        .filter((e) => e.phase_id === phase.id)
        .map((e) => ({
          ...e,
          exercise: e.exercise_id ? exerciseMap.get(e.exercise_id) ?? null : null,
        })),
    }));

    return NextResponse.json({ success: true, phases: enrichedPhases });
  } catch (error) {
    return respondInternalError("api.trainings.id.phases.get", error);
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const check = await checkPermission("trainings", "write");
    if (!check.allowed) return check.response;

    const { id: trainingSessionId } = await params;

    const body = await request.json().catch(() => null);
    const parsed = BatchPhasesSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos.", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const admin = createAdminClient();

    // Get club_id from the training session
    const { data: session } = await admin
      .from("training_sessions")
      .select("id, club_id, age_group_id")
      .eq("id", trainingSessionId)
      .single();

    if (!session) {
      return NextResponse.json({ error: "Treino não encontrado." }, { status: 404 });
    }

    // Delete existing phases (cascades to exercises)
    await admin
      .from("training_phases")
      .delete()
      .eq("training_session_id", trainingSessionId);

    // Insert new phases
    const createdPhases = [];
    for (const phase of parsed.data.phases) {
      const { data: createdPhase, error: phaseError } = await admin
        .from("training_phases")
        .insert({
          training_session_id: trainingSessionId,
          club_id: session.club_id,
          phase_type: phase.phase_type,
          phase_name: phase.phase_name ?? null,
          phase_order: phase.phase_order,
          duration_minutes: phase.duration_minutes ?? null,
          notes: phase.notes ?? null,
        })
        .select("id, phase_type, phase_name, phase_order, duration_minutes, notes")
        .single();

      if (phaseError || !createdPhase) {
        return NextResponse.json(
          { error: `Erro ao criar fase ${phase.phase_order}.` },
          { status: 500 },
        );
      }

      // Insert exercises for this phase
      const phaseExercises = [];
      for (const ex of phase.exercises) {
        const { data: createdEx, error: exError } = await admin
          .from("training_phase_exercises")
          .insert({
            phase_id: createdPhase.id,
            exercise_id: ex.exercise_id ?? null,
            club_id: session.club_id,
            exercise_order: ex.exercise_order,
            custom_name: ex.custom_name ?? null,
            custom_description: ex.custom_description ?? null,
            custom_objectives: ex.custom_objectives ?? null,
            custom_game_format: ex.custom_game_format ?? null,
            custom_duration_minutes: ex.custom_duration_minutes ?? null,
            custom_rest_minutes: ex.custom_rest_minutes ?? null,
            custom_num_players: ex.custom_num_players ?? null,
            custom_field_dimensions: ex.custom_field_dimensions ?? null,
            custom_material: ex.custom_material ?? null,
            custom_diagram_url: ex.custom_diagram_url ?? null,
            planned_time_minutes: ex.planned_time_minutes ?? null,
            repetitions: ex.repetitions,
            total_athletes: ex.total_athletes ?? null,
            notes: ex.notes ?? null,
          })
          .select("id, exercise_order")
          .single();

        if (exError || !createdEx) {
          return NextResponse.json(
            { error: `Erro ao criar exercício na fase ${phase.phase_order}.` },
            { status: 500 },
          );
        }
        phaseExercises.push(createdEx);
      }

      createdPhases.push({ ...createdPhase, exercises: phaseExercises });
    }

    return NextResponse.json({ success: true, phases: createdPhases }, { status: 201 });
  } catch (error) {
    return respondInternalError("api.trainings.id.phases.post", error);
  }
}
