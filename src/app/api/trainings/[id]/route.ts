import { NextResponse } from "next/server";
import { z } from "zod";
import { checkPermission } from "@/lib/auth/require-permission";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondInternalError } from "@/lib/http/respond-internal-error";

const TrainingMetadataSchema = z.object({
  focus: z.string().nullable().optional(),
  intensity: z.string().nullable().optional(),
  period_type: z.string().nullable().optional(),
  field_area: z.string().nullable().optional(),
  objective: z.string().nullable().optional(),
  complementary_objectives: z.string().nullable().optional(),
  initial_instruction: z.string().nullable().optional(),
  material: z.string().nullable().optional(),
  microcycle_number: z.number().int().positive().nullable().optional(),
  mesocycle_number: z.number().int().positive().nullable().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const check = await checkPermission("trainings", "write");
    if (!check.allowed) return check.response;

    const { id } = await params;

    const body = await request.json().catch(() => null);
    const parsed = TrainingMetadataSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos.", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const admin = createAdminClient();

    const { data, error } = await admin
      .from("training_sessions")
      .update(parsed.data)
      .eq("id", id)
      .select("id, focus, intensity, period_type, field_area, objective, complementary_objectives, initial_instruction, material, microcycle_number, mesocycle_number")
      .single();

    if (error) {
      return NextResponse.json(
        { error: "Erro ao guardar planeamento." },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, session: data });
  } catch (error) {
    return respondInternalError("api.trainings.id.put", error);
  }
}
