import type { SupabaseClient } from "@supabase/supabase-js";

type DeleteFilter =
  | { type: "eq"; column: string; value: string }
  | { type: "in"; column: string; values: string[] };

function isRelationMissing(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String((error as { code?: string }).code || "") : "";
  const message =
    "message" in error ? String((error as { message?: string }).message || "") : "";
  const lowered = message.toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST204" ||
    code === "PGRST205" ||
    lowered.includes("relation") ||
    lowered.includes("does not exist") ||
    lowered.includes("could not find the table") ||
    lowered.includes("schema cache")
  );
}

function isMissingColumn(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String((error as { code?: string }).code || "") : "";
  return code === "42703";
}

function isSchemaCompatibilityError(error: unknown) {
  return isRelationMissing(error) || isMissingColumn(error);
}

async function deleteRows(
  admin: SupabaseClient,
  table: string,
  filter: DeleteFilter,
  options?: { optional?: boolean },
) {
  let query = admin.from(table).delete();
  if (filter.type === "eq") {
    query = query.eq(filter.column, filter.value);
  } else {
    if (filter.values.length === 0) return;
    query = query.in(filter.column, filter.values);
  }

  const { error } = await query;
  if (!error) return;
  if (options?.optional && isSchemaCompatibilityError(error)) return;
  throw new Error(
    `Erro ao apagar dados em ${table}.${filter.column}: ${
      error.message || "falha desconhecida"
    }`,
  );
}

async function listConvocationsByGame(
  admin: SupabaseClient,
  gameId: string,
) {
  const { data, error } = await admin
    .from("convocations")
    .select("id")
    .eq("game_id", gameId);

  if (error) {
    if (isSchemaCompatibilityError(error)) return [] as string[];
    throw new Error(
      `Erro ao listar convocatórias para apagar jogo: ${error.message || "falha desconhecida"}`,
    );
  }

  return (data || [])
    .map((row) => (typeof row.id === "string" ? row.id : null))
    .filter((id): id is string => !!id);
}

export async function deleteTrainingSessionCascade(
  admin: SupabaseClient,
  trainingSessionId: string,
) {
  await deleteRows(admin, "attendance_records", {
    type: "eq",
    column: "training_session_id",
    value: trainingSessionId,
  }, { optional: true });

  await deleteRows(admin, "attendance_records", {
    type: "eq",
    column: "session_id",
    value: trainingSessionId,
  }, { optional: true });

  await deleteRows(admin, "training_attendance", {
    type: "eq",
    column: "training_session_id",
    value: trainingSessionId,
  }, { optional: true });

  await deleteRows(admin, "training_attendance", {
    type: "eq",
    column: "session_id",
    value: trainingSessionId,
  }, { optional: true });

  await deleteRows(admin, "pse_records", {
    type: "eq",
    column: "training_session_id",
    value: trainingSessionId,
  }, { optional: true });

  await deleteRows(admin, "training_sessions", {
    type: "eq",
    column: "id",
    value: trainingSessionId,
  });
}

export async function deleteGameCascade(admin: SupabaseClient, gameId: string) {
  const convocationIds = await listConvocationsByGame(admin, gameId);

  await deleteRows(admin, "convocation_players", {
    type: "in",
    column: "convocation_id",
    values: convocationIds,
  }, { optional: true });

  await deleteRows(admin, "convocation_players", {
    type: "eq",
    column: "game_id",
    value: gameId,
  }, { optional: true });

  await deleteRows(admin, "convocations", {
    type: "eq",
    column: "game_id",
    value: gameId,
  }, { optional: true });

  await deleteRows(admin, "game_events", {
    type: "eq",
    column: "game_id",
    value: gameId,
  }, { optional: true });

  await deleteRows(admin, "game_stats_live", {
    type: "eq",
    column: "game_id",
    value: gameId,
  }, { optional: true });

  await deleteRows(admin, "game_final_stats", {
    type: "eq",
    column: "game_id",
    value: gameId,
  }, { optional: true });

  await deleteRows(admin, "game_live_checkpoints", {
    type: "eq",
    column: "game_id",
    value: gameId,
  }, { optional: true });

  await deleteRows(admin, "pse_records", {
    type: "eq",
    column: "game_id",
    value: gameId,
  }, { optional: true });

  await deleteRows(admin, "games", {
    type: "eq",
    column: "id",
    value: gameId,
  });
}

