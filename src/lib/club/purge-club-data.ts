import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteClubDataCascade } from "@/lib/club/delete-club-data";
import {
  optionalDeleteByEq,
  isSchemaCompatibilityError,
} from "@/lib/team/delete-age-group";

/**
 * Operacao de purga RGPD de um clube individual — usada APENAS pelo cron
 * /api/maintenance/purge. O DELETE /api/club manual usa deleteClubDataCascade
 * directamente e nao passa por aqui.
 *
 * Alem da cascata partilhada, a purga varre residuos club-level que a
 * cascata por escalao nao cobre (FK ON DELETE CASCADE so dispararia se a
 * linha de clubs fosse apagada — e nunca e: invoices.club_id e RESTRICT,
 * retencao legal de faturacao):
 * - linhas com club_id sem escalao (exercises de clube, opponents,
 *   age_group_categories, notifications — notification_inbox e uma VIEW
 *   sobre notification_recipients JOIN notifications, nao aceita DELETE;
 *   apagar notifications limpa recipients via FK ON DELETE CASCADE)
 * - storage por prefixo {ageGroupId}: exercise-images e opponent-logos
 *   (players-photos/event-images/club-logos ja saem na cascata partilhada)
 *
 * NUNCA tocado: linha de clubs, invoices (tabela e bucket), profiles,
 * contas auth, qualquer objecto no Stripe.
 */

/**
 * Tabelas com coluna club_id (inventario de producao 2026-06-10), excepto
 * invoices (retencao legal — nunca purgada). Novas tabelas com club_id
 * devem ser acrescentadas aqui para os counts do audit log.
 */
const CLUB_SCOPED_TABLES = [
  "age_group_categories",
  "age_group_staff",
  "age_groups",
  "club_memberships",
  "competitions",
  "convocation_players",
  "convocations",
  "exercises",
  "external_player_convocations",
  "game_events",
  "game_final_stats",
  "game_live_checkpoints",
  "game_opponent_observations",
  "game_squads",
  "game_stats_live",
  "games",
  "kit_pieces",
  "lineup_corrections_log",
  "microciclos",
  "notifications",
  "opponents",
  "player_age_group_eligibility",
  "player_behavioral_assessments",
  "player_documents",
  "player_registrations",
  "players",
  "pse_records",
  "season_objectives",
  "staff_invites",
  "staff_permissions",
  "team_staff",
  "teams",
  "training_attendance",
  "training_phase_exercises",
  "training_phases",
  "training_sessions",
] as const;

// Tabelas sem club_id apagadas pela cascata via escalao tem counts
// explicitos no snapshot: cada count replica EXACTAMENTE o filtro do delete
// correspondente em deleteAgeGroupCascade — counts e eliminacao tem de
// contar a mesma coisa (schema verificado em producao 2026-06-11):
// - public_share_tokens: delete por age_group_id
// - beta_invites:        delete por target_age_group_id
// - matchdays:           delete por competition_id (competicoes do clube)
// - grounds:             delete por age_group_id, coluna que NAO existe no
//   schema actual (grounds so tem created_by) — no-op tolerado nos dois lados

/**
 * Residuos club-level que a cascata por escalao nao cobre. Apenas TABELAS
 * base — notification_inbox e uma view (DELETE impossivel); o sweep de
 * notifications por club_id limpa-a indirectamente (recipients caem por
 * FK ON DELETE CASCADE).
 */
const CLUB_LEVEL_SWEEP_TABLES = [
  "exercises",
  "opponents",
  "age_group_categories",
  "notifications",
] as const;

const PURGE_STORAGE_BUCKETS_BY_AGE_GROUP = [
  "exercise-images",
  "opponent-logos",
] as const;

export async function listClubAgeGroupIds(
  admin: SupabaseClient,
  clubId: string,
): Promise<string[]> {
  const { data, error } = await admin
    .from("age_groups")
    .select("id")
    .eq("club_id", clubId);
  if (error) {
    throw new Error(
      `Erro ao listar escaloes para purga: ${error.message || "falha desconhecida"}`,
    );
  }
  return (data || [])
    .map((row) => (typeof row.id === "string" ? row.id : null))
    .filter((id): id is string => !!id);
}

/**
 * Conta com GET + limit(1) em vez de HEAD: respostas HEAD nao tem corpo,
 * pelo que um erro de coluna/tabela inexistente chegava ao cliente sem
 * code/message e nao era reconhecido por isSchemaCompatibilityError — o
 * fail-closed disparava onde o delete correspondente faz skip tolerado.
 * Devolve null quando o filtro nao existe no schema (mesmo no-op do delete);
 * qualquer outro erro lanca (fail-closed: clube nao e purgado sem snapshot).
 */
async function resolveCount(
  pending: PromiseLike<{ count: number | null; error: unknown }>,
  table: string,
): Promise<number | null> {
  const { count, error } = await pending;
  if (error) {
    if (isSchemaCompatibilityError(error)) return null;
    const message =
      typeof error === "object" && error !== null && "message" in error
        ? String((error as { message?: string }).message || "")
        : "";
    throw new Error(
      `Erro ao contar ${table} para audit: ${message || "falha desconhecida"}`,
    );
  }
  return count ?? 0;
}

/**
 * O select usa a PROPRIA coluna de filtro, nunca "id": club_memberships
 * (PK composta) e game_live_checkpoints nao tem coluna id — com select=id
 * o 42703 era tolerado como erro de schema e essas tabelas saiam
 * silenciosamente do audit. A coluna de filtro existe por construcao
 * (e a mesma do eq/in aplicado a seguir).
 */
function countQuery(admin: SupabaseClient, table: string, filterColumn: string) {
  return admin.from(table).select(filterColumn, { count: "exact" }).limit(1);
}

/**
 * Snapshot de counts por tabela ANTES da purga — e isto que vai para o
 * audit log (counts-only, zero PII). Counts por club_id; linhas legacy com
 * club_id NULL podem ficar fora do count mas sao apagadas na mesma pela
 * cascata (o count e prova de conformidade, nao inventario transaccional).
 */
export async function snapshotClubDataCounts(
  admin: SupabaseClient,
  clubId: string,
  ageGroupIds: string[],
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};

  for (const table of CLUB_SCOPED_TABLES) {
    const count = await resolveCount(
      countQuery(admin, table, "club_id").eq("club_id", clubId),
      table,
    );
    if (count !== null) counts[table] = count;
  }

  // Sem club_id: replicar o filtro exacto do delete correspondente.
  if (ageGroupIds.length === 0) {
    counts.public_share_tokens = 0;
    counts.beta_invites = 0;
    counts.grounds = 0;
  } else {
    const pstCount = await resolveCount(
      countQuery(admin, "public_share_tokens", "age_group_id").in(
        "age_group_id",
        ageGroupIds,
      ),
      "public_share_tokens",
    );
    if (pstCount !== null) counts.public_share_tokens = pstCount;

    const betaCount = await resolveCount(
      countQuery(admin, "beta_invites", "target_age_group_id").in(
        "target_age_group_id",
        ageGroupIds,
      ),
      "beta_invites",
    );
    if (betaCount !== null) counts.beta_invites = betaCount;

    // No schema actual, grounds nao tem age_group_id — resolve a null
    // (omitido do audit), tal como o delete e um no-op tolerado.
    const groundsCount = await resolveCount(
      countQuery(admin, "grounds", "age_group_id").in(
        "age_group_id",
        ageGroupIds,
      ),
      "grounds",
    );
    if (groundsCount !== null) counts.grounds = groundsCount;
  }

  // matchdays: o delete vai por competition_id; usar as competicoes do clube.
  const { data: comps, error: compsError } = await admin
    .from("competitions")
    .select("id")
    .eq("club_id", clubId);
  if (compsError && !isSchemaCompatibilityError(compsError)) {
    throw new Error(
      `Erro ao listar competicoes para audit: ${compsError.message || "falha desconhecida"}`,
    );
  }
  const competitionIds = (comps || [])
    .map((row) => (typeof row.id === "string" ? row.id : null))
    .filter((id): id is string => !!id);

  if (compsError) {
    // competitions inexistente: o delete de matchdays tambem seria no-op — omitir.
  } else if (competitionIds.length === 0) {
    counts.matchdays = 0;
  } else {
    const matchdaysCount = await resolveCount(
      countQuery(admin, "matchdays", "competition_id").in(
        "competition_id",
        competitionIds,
      ),
      "matchdays",
    );
    if (matchdaysCount !== null) counts.matchdays = matchdaysCount;
  }

  return counts;
}

async function removeStoragePrefixTolerant(
  admin: SupabaseClient,
  bucket: string,
  prefix: string,
): Promise<void> {
  const { data, error } = await admin.storage.from(bucket).list(prefix, {
    limit: 100,
  });
  if (error || !data) return; // bucket/prefixo ausente: nada a limpar

  let batch = data;
  while (batch.length > 0) {
    const paths = batch
      .filter((item) => !!item?.name && !!item.id)
      .map((item) => `${prefix}/${item.name}`);
    if (paths.length === 0) return;
    const { error: removeErr } = await admin.storage.from(bucket).remove(paths);
    if (removeErr) return; // soft-fail: storage nao bloqueia a purga de dados
    const { data: next, error: nextErr } = await admin.storage
      .from(bucket)
      .list(prefix, { limit: 100 });
    if (nextErr || !next) return;
    batch = next;
  }
}

export interface PurgeClubDataResult {
  deletedAgeGroupCount: number;
}

/**
 * Executa a purga definitiva. O chamador (cron) e responsavel por:
 * 1) verificar a elegibilidade (computePurgeAction) E re-verificar as regras
 *    de seguranca dentro da operacao;
 * 2) tirar o snapshot de counts ANTES de chamar;
 * 3) escrever o audit log e limpar o agendamento depois.
 */
export async function purgeClubData(
  admin: SupabaseClient,
  clubId: string,
  ageGroupIds: string[],
  opts?: {
    /**
     * Mantem as club_memberships do clube (ver deleteClubDataCascade). Usado na
     * eliminacao de conta individual; o cron de purga RGPD nao passa nada e
     * mantem o comportamento original (apaga memberships, mantem linha clubs).
     */
    skipClubMembershipsDelete?: boolean;
  },
): Promise<PurgeClubDataResult> {
  // Storage so atingivel via prefixo de escalao — limpar ANTES da cascata
  // apagar as linhas de age_groups (depois ja nao ha como derivar prefixos).
  for (const ageGroupId of ageGroupIds) {
    for (const bucket of PURGE_STORAGE_BUCKETS_BY_AGE_GROUP) {
      await removeStoragePrefixTolerant(admin, bucket, ageGroupId);
    }
  }

  const { deletedAgeGroupCount } = await deleteClubDataCascade(admin, clubId, opts);

  for (const table of CLUB_LEVEL_SWEEP_TABLES) {
    await optionalDeleteByEq(admin, table, "club_id", clubId);
  }

  return { deletedAgeGroupCount };
}
