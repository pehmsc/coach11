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
 *   age_group_categories, notification_inbox)
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
  "notification_inbox",
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

/** Tabelas sem club_id mas apagadas pela cascata via escalao. */
const AGE_GROUP_SCOPED_TABLES = [
  "matchdays",
  "grounds",
  "public_share_tokens",
  "beta_invites",
] as const;

/** Residuos club-level que a cascata por escalao nao cobre. */
const CLUB_LEVEL_SWEEP_TABLES = [
  "exercises",
  "opponents",
  "age_group_categories",
  "notification_inbox",
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
    const { count, error } = await admin
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("club_id", clubId);
    if (error) {
      if (isSchemaCompatibilityError(error)) continue;
      throw new Error(
        `Erro ao contar ${table} para audit: ${error.message || "falha desconhecida"}`,
      );
    }
    counts[table] = count ?? 0;
  }

  for (const table of AGE_GROUP_SCOPED_TABLES) {
    if (ageGroupIds.length === 0) {
      counts[table] = 0;
      continue;
    }
    const { count, error } = await admin
      .from(table)
      .select("*", { count: "exact", head: true })
      .in("age_group_id", ageGroupIds);
    if (error) {
      if (isSchemaCompatibilityError(error)) continue;
      throw new Error(
        `Erro ao contar ${table} para audit: ${error.message || "falha desconhecida"}`,
      );
    }
    counts[table] = count ?? 0;
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
): Promise<PurgeClubDataResult> {
  // Storage so atingivel via prefixo de escalao — limpar ANTES da cascata
  // apagar as linhas de age_groups (depois ja nao ha como derivar prefixos).
  for (const ageGroupId of ageGroupIds) {
    for (const bucket of PURGE_STORAGE_BUCKETS_BY_AGE_GROUP) {
      await removeStoragePrefixTolerant(admin, bucket, ageGroupId);
    }
  }

  const { deletedAgeGroupCount } = await deleteClubDataCascade(admin, clubId);

  for (const table of CLUB_LEVEL_SWEEP_TABLES) {
    await optionalDeleteByEq(admin, table, "club_id", clubId);
  }

  return { deletedAgeGroupCount };
}
