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
  // Todas as tabelas de presença são opcionais (schema pode variar) — paralelizar
  await Promise.all([
    deleteRows(admin, "attendance_records", {
      type: "eq",
      column: "training_session_id",
      value: trainingSessionId,
    }, { optional: true }),
    deleteRows(admin, "attendance_records", {
      type: "eq",
      column: "session_id",
      value: trainingSessionId,
    }, { optional: true }),
    deleteRows(admin, "training_attendance", {
      type: "eq",
      column: "training_session_id",
      value: trainingSessionId,
    }, { optional: true }),
    deleteRows(admin, "training_attendance", {
      type: "eq",
      column: "session_id",
      value: trainingSessionId,
    }, { optional: true }),
    deleteRows(admin, "pse_records", {
      type: "eq",
      column: "training_session_id",
      value: trainingSessionId,
    }, { optional: true }),
  ]);

  // Apagar sessão por último (garantir que os filhos já foram apagados)
  await deleteRows(admin, "training_sessions", {
    type: "eq",
    column: "id",
    value: trainingSessionId,
  });
}

export async function deleteGameCascade(admin: SupabaseClient, gameId: string) {
  // 1. Listar convocatórias antes de apagar (precisamos dos IDs)
  const convocationIds = await listConvocationsByGame(admin, gameId);

  // 2. Apagar convocation_players (dependentes das convocatórias)
  await Promise.all([
    deleteRows(admin, "convocation_players", {
      type: "in",
      column: "convocation_id",
      values: convocationIds,
    }, { optional: true }),
    deleteRows(admin, "convocation_players", {
      type: "eq",
      column: "game_id",
      value: gameId,
    }, { optional: true }),
  ]);

  // 3. Apagar convocações e todos os dados independentes do jogo em paralelo
  await Promise.all([
    deleteRows(admin, "convocations", {
      type: "eq",
      column: "game_id",
      value: gameId,
    }, { optional: true }),
    deleteRows(admin, "game_events", {
      type: "eq",
      column: "game_id",
      value: gameId,
    }, { optional: true }),
    deleteRows(admin, "game_stats_live", {
      type: "eq",
      column: "game_id",
      value: gameId,
    }, { optional: true }),
    deleteRows(admin, "game_final_stats", {
      type: "eq",
      column: "game_id",
      value: gameId,
    }, { optional: true }),
    deleteRows(admin, "game_live_checkpoints", {
      type: "eq",
      column: "game_id",
      value: gameId,
    }, { optional: true }),
    deleteRows(admin, "pse_records", {
      type: "eq",
      column: "game_id",
      value: gameId,
    }, { optional: true }),
  ]);

  // 4. Apagar o jogo por último (garantir integridade referencial)
  await deleteRows(admin, "games", {
    type: "eq",
    column: "id",
    value: gameId,
  });
}
