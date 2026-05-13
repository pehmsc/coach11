import { NextResponse } from "next/server";
import { z } from "zod";
import { isMasterAdmin } from "@/lib/auth/permissions";
import { parseBody } from "@/lib/http/validate";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import { createClient } from "@/lib/supabase/server";
import { getNextUtNumber } from "@/lib/trainings/ut-numbering";
import { buildWeeklyDuplicatedTrainings } from "@/lib/trainings/weekly-duplication";

const DuplicateWeekSchema = z.object({
  sourceWeekStartDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "A semana fonte é obrigatória."),
  numberOfWeeks: z
    .number()
    .int("O número de semanas tem de ser inteiro.")
    .min(1, "O mínimo é 1 semana.")
    .max(20, "O máximo é 20 semanas."),
  ageGroupId: z.string().uuid("Escalão inválido."),
});

async function requireTrainingWritePermission(
  ageGroupId: string,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      allowed: false as const,
      supabase,
      response: NextResponse.json({ error: "Não autenticado." }, { status: 401 }),
    };
  }

  if (user.email && isMasterAdmin(user.email)) {
    return {
      allowed: true as const,
      supabase,
      userId: user.id,
    };
  }

  const { data: coordinatorRow, error: coordinatorError } = await supabase
    .from("age_groups")
    .select("id")
    .eq("id", ageGroupId)
    .eq("coordinator_id", user.id)
    .maybeSingle();

  if (coordinatorError) {
    throw coordinatorError;
  }

  if (coordinatorRow?.id) {
    return {
      allowed: true as const,
      supabase,
      userId: user.id,
    };
  }

  const { data: staffLink, error: staffLinkError } = await supabase
    .from("age_group_staff")
    .select("id, role")
    .eq("age_group_id", ageGroupId)
    .eq("profile_id", user.id)
    .maybeSingle();

  if (staffLinkError) {
    throw staffLinkError;
  }

  if (!staffLink?.id) {
    return {
      allowed: false as const,
      supabase,
      response: NextResponse.json(
        { error: "Sem permissão para duplicar treinos neste escalão." },
        { status: 403 },
      ),
    };
  }

  if (staffLink.role === "coach") {
    return {
      allowed: true as const,
      supabase,
      userId: user.id,
    };
  }

  const { data: permissionRow, error: permissionError } = await supabase
    .from("staff_permissions")
    .select("can_write")
    .eq("staff_id", staffLink.id)
    .eq("area", "trainings")
    .maybeSingle();

  if (permissionError) {
    throw permissionError;
  }

  if (permissionRow?.can_write !== true) {
    return {
      allowed: false as const,
      supabase,
      response: NextResponse.json(
        { error: "Sem permissão para duplicar treinos neste escalão." },
        { status: 403 },
      ),
    };
  }

  return {
    allowed: true as const,
    supabase,
    userId: user.id,
  };
}

export async function POST(request: Request) {
  let ageGroupId: string | null = null;

  try {
    const parsed = await parseBody(request, DuplicateWeekSchema);
    if (parsed.error) {
      return parsed.error;
    }

    ageGroupId = parsed.data.ageGroupId;
    const permission = await requireTrainingWritePermission(ageGroupId);
    if (!permission.allowed) {
      return permission.response;
    }
    const { supabase } = permission;

    const { data: ageGroup, error: ageGroupError } = await supabase
      .from("age_groups")
      .select("club_id")
      .eq("id", ageGroupId)
      .maybeSingle();

    if (ageGroupError || !ageGroup?.club_id) {
      return NextResponse.json(
        { error: "Não foi possível determinar o clube do escalão." },
        { status: 400 },
      );
    }

    const { data: sourceSessions, error: sourceError } = await supabase
      .from("training_sessions")
      .select(
        "age_group_id, team_id, session_date, start_time, end_time, location, formatted_address, latitude, longitude, osm_place_id, location_source, objective, focus, intensity, material, field_area, week_start_date",
      )
      .eq("age_group_id", ageGroupId)
      .eq("week_start_date", parsed.data.sourceWeekStartDate)
      .order("session_date", { ascending: true })
      .order("start_time", { ascending: true, nullsFirst: false });

    if (sourceError) {
      throw sourceError;
    }

    if (!sourceSessions || sourceSessions.length === 0) {
      return NextResponse.json(
        { error: "A semana fonte não tem treinos para duplicar." },
        { status: 404 },
      );
    }

    const nextUtNumber = await getNextUtNumber(supabase, ageGroup.club_id, ageGroupId);
    const duplicatedSessions = buildWeeklyDuplicatedTrainings({
      sourceSessions,
      numberOfWeeks: parsed.data.numberOfWeeks,
      nextUtNumber,
    });

    const { error: insertError } = await supabase
      .from("training_sessions")
      .insert(duplicatedSessions.sessions);

    if (insertError) {
      throw insertError;
    }

    return NextResponse.json({
      success: true,
      created: duplicatedSessions.created,
      utRange: duplicatedSessions.utRange,
    });
  } catch (error) {
    return respondInternalError("api.trainings.duplicate-week.post", error, {
      request,
      ageGroupId,
    });
  }
}
