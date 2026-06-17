import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deleteGameCascade,
  deleteTrainingSessionCascade,
} from "@/lib/events/delete-cascade";

export type ManagedAgeGroupRecord = {
  id: string;
  name: string | null;
  club_id?: string | null;
  coordinator_id?: string | null;
};

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

function isStorageBucketMissing(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const message =
    "message" in error ? String((error as { message?: string }).message || "") : "";
  const lowered = message.toLowerCase();
  return lowered.includes("bucket") && lowered.includes("not");
}

export function isSchemaCompatibilityError(error: unknown) {
  return isRelationMissing(error) || isMissingColumn(error);
}

export async function optionalDeleteByEq(
  admin: SupabaseClient,
  table: string,
  column: string,
  value: string,
) {
  const { error } = await admin.from(table).delete().eq(column, value);
  if (!error) return;
  if (isSchemaCompatibilityError(error)) return;
  throw new Error(`Erro ao limpar ${table}.${column}: ${error.message || "falha desconhecida"}`);
}

export async function optionalDeleteByIn(
  admin: SupabaseClient,
  table: string,
  column: string,
  values: string[],
) {
  if (values.length === 0) return;
  const { error } = await admin.from(table).delete().in(column, values);
  if (!error) return;
  if (isSchemaCompatibilityError(error)) return;
  throw new Error(`Erro ao limpar ${table}.${column}: ${error.message || "falha desconhecida"}`);
}

export async function optionalUpdateByEq(
  admin: SupabaseClient,
  table: string,
  column: string,
  value: string,
  patch: Record<string, unknown>,
) {
  const { error } = await admin.from(table).update(patch).eq(column, value);
  if (!error) return;
  if (isSchemaCompatibilityError(error)) return;
  throw new Error(
    `Erro ao atualizar ${table}.${column}: ${error.message || "falha desconhecida"}`,
  );
}

export async function listManagedAgeGroups(
  admin: SupabaseClient,
  userId: string,
): Promise<ManagedAgeGroupRecord[]> {
  const { data, error } = await admin
    .from("age_groups")
    .select("id, name, club_id, coordinator_id")
    .eq("coordinator_id", userId)
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) {
    throw new Error(
      `Erro ao validar escalões coordenados: ${error.message || "falha desconhecida"}`,
    );
  }

  return (data || []) as ManagedAgeGroupRecord[];
}

async function listStoragePaths(
  admin: SupabaseClient,
  bucket: string,
  prefix: string,
) {
  const queue = [prefix];
  const paths: string[] = [];

  while (queue.length > 0) {
    const currentPrefix = queue.shift() || "";
    let offset = 0;

    while (true) {
      const { data, error } = await admin.storage.from(bucket).list(currentPrefix, {
        limit: 100,
        offset,
        sortBy: { column: "name", order: "asc" },
      });

      if (error) {
        if (isStorageBucketMissing(error)) return paths;
        throw new Error(
          `Erro ao listar bucket ${bucket}/${currentPrefix}: ${error.message || "falha desconhecida"}`,
        );
      }

      const items = data || [];
      if (items.length === 0) break;

      for (const item of items) {
        if (!item?.name) continue;
        const path = currentPrefix ? `${currentPrefix}/${item.name}` : item.name;

        if (item.id) {
          paths.push(path);
          continue;
        }

        queue.push(path);
      }

      if (items.length < 100) break;
      offset += items.length;
    }
  }

  return paths;
}

async function removeStoragePaths(
  admin: SupabaseClient,
  bucket: string,
  paths: string[],
) {
  if (paths.length === 0) return;

  for (let index = 0; index < paths.length; index += 100) {
    const chunk = paths.slice(index, index + 100);
    const { error } = await admin.storage.from(bucket).remove(chunk);
    if (!error) continue;
    if (isStorageBucketMissing(error)) return;
    throw new Error(
      `Erro ao apagar ficheiros de ${bucket}: ${error.message || "falha desconhecida"}`,
    );
  }
}

async function removeStoragePrefix(
  admin: SupabaseClient,
  bucket: string,
  prefix: string,
) {
  const paths = await listStoragePaths(admin, bucket, prefix);
  await removeStoragePaths(admin, bucket, paths);
}

async function cleanupClubMembershipsAfterAgeGroupDelete(
  admin: SupabaseClient,
  clubId: string | null,
  candidateProfileIds: string[],
  retainedProfileIds: string[],
) {
  // club_memberships remains only as technical compatibility metadata.
  if (!clubId || candidateProfileIds.length === 0) return;

  const retained = new Set(retainedProfileIds);

  for (const profileId of candidateProfileIds) {
    if (retained.has(profileId)) continue;

    const [managedAgeGroupRes, ageGroupStaffRes] = await Promise.all([
      admin
        .from("age_groups")
        .select("id")
        .eq("club_id", clubId)
        .eq("coordinator_id", profileId)
        .limit(1)
        .maybeSingle(),
      admin
        .from("age_group_staff")
        .select("id")
        .eq("club_id", clubId)
        .eq("profile_id", profileId)
        .limit(1)
        .maybeSingle(),
    ]);

    const firstError =
      managedAgeGroupRes.error && !isSchemaCompatibilityError(managedAgeGroupRes.error)
        ? managedAgeGroupRes.error
        : ageGroupStaffRes.error && !isSchemaCompatibilityError(ageGroupStaffRes.error)
          ? ageGroupStaffRes.error
          : null;

    if (firstError) {
      throw new Error(
        `Erro ao validar memberships residuais do perfil ${profileId}: ${
          firstError.message || "falha desconhecida"
        }`,
      );
    }

    if (managedAgeGroupRes.data || ageGroupStaffRes.data) {
      continue;
    }

    const { error } = await admin
      .from("club_memberships")
      .delete()
      .eq("club_id", clubId)
      .eq("profile_id", profileId);

    if (error && !isSchemaCompatibilityError(error)) {
      throw new Error(
        `Erro ao limpar club_membership residual do perfil ${profileId}: ${
          error.message || "falha desconhecida"
        }`,
      );
    }
  }
}

export async function deleteUserAvatarStorage(
  admin: SupabaseClient,
  userId: string,
) {
  const avatarPaths = await listStoragePaths(admin, "avatars", "avatars");
  const ownedAvatarPaths = avatarPaths.filter((path) => path.startsWith(`avatars/${userId}.`));
  await removeStoragePaths(admin, "avatars", ownedAvatarPaths);
}

export async function deleteAgeGroupCascade(
  admin: SupabaseClient,
  ageGroupId: string,
  options?: {
    retainClubMembershipProfileIds?: string[];
    /**
     * Salta a limpeza de club_memberships residuais. Usado na eliminacao de
     * conta individual, onde as memberships sao mantidas vivas ate a RPC final
     * (que deriva o clube de auth.uid()) e depois caem por cascata ao apagar a
     * linha de clubs.
     */
    skipClubMembershipCleanup?: boolean;
  },
) {
  const { data: ageGroup, error: ageGroupError } = await admin
    .from("age_groups")
    .select("id, club_id, coordinator_id")
    .eq("id", ageGroupId)
    .maybeSingle();

  if (ageGroupError) {
    throw new Error(
      `Erro ao validar escalão para apagar: ${ageGroupError.message || "falha desconhecida"}`,
    );
  }

  if (!ageGroup?.id) {
    throw new Error("Escalão não encontrado para apagar.");
  }

  const { data: teams, error: teamsError } = await admin
    .from("teams")
    .select("id")
    .eq("age_group_id", ageGroupId);

  if (teamsError) {
    throw new Error(
      `Erro ao carregar equipas do escalão: ${teamsError.message || "falha desconhecida"}`,
    );
  }

  const teamIds = (teams || [])
    .map((team) => (typeof team.id === "string" ? team.id : null))
    .filter((teamId): teamId is string => !!teamId);

  const ageGroupStaffRowsRes = await admin
    .from("age_group_staff")
    .select("profile_id")
    .eq("age_group_id", ageGroupId);

  if (ageGroupStaffRowsRes.error && !isSchemaCompatibilityError(ageGroupStaffRowsRes.error)) {
    throw new Error(
      `Erro ao carregar perfis da equipa técnica: ${
        ageGroupStaffRowsRes.error.message || "falha desconhecida"
      }`,
    );
  }

  const candidateProfileIds = Array.from(
    new Set(
      [
        typeof ageGroup.coordinator_id === "string" ? ageGroup.coordinator_id : null,
        ...((ageGroupStaffRowsRes.data || []) as Array<{ profile_id: string | null }>)
          .map((row) => row.profile_id),
      ].filter((profileId): profileId is string => !!profileId),
    ),
  );

  for (const teamId of teamIds) {
    const { data: sessions, error: sessionsError } = await admin
      .from("training_sessions")
      .select("id")
      .eq("team_id", teamId);

    if (sessionsError && !isSchemaCompatibilityError(sessionsError)) {
      throw new Error(
        `Erro ao carregar treinos para apagar escalão: ${
          sessionsError.message || "falha desconhecida"
        }`,
      );
    }

    for (const session of sessions || []) {
      if (typeof session.id === "string") {
        await deleteTrainingSessionCascade(admin, session.id);
      }
    }

    const { data: games, error: gamesError } = await admin
      .from("games")
      .select("id")
      .eq("team_id", teamId);

    if (gamesError && !isSchemaCompatibilityError(gamesError)) {
      throw new Error(
        `Erro ao carregar jogos para apagar escalão: ${
          gamesError.message || "falha desconhecida"
        }`,
      );
    }

    for (const game of games || []) {
      if (typeof game.id === "string") {
        await deleteGameCascade(admin, game.id);
      }
    }

    const { data: competitions, error: competitionsError } = await admin
      .from("competitions")
      .select("id")
      .eq("team_id", teamId);

    if (competitionsError && !isSchemaCompatibilityError(competitionsError)) {
      throw new Error(
        `Erro ao carregar competições para apagar escalão: ${
          competitionsError.message || "falha desconhecida"
        }`,
      );
    }

    const competitionIds = (competitions || [])
      .map((competition) =>
        typeof competition.id === "string" ? competition.id : null,
      )
      .filter((competitionId): competitionId is string => !!competitionId);

    await optionalDeleteByIn(admin, "matchdays", "competition_id", competitionIds);
    await optionalDeleteByIn(admin, "opponents", "competition_id", competitionIds);
    await optionalDeleteByIn(admin, "competitions", "id", competitionIds);

    await optionalDeleteByEq(admin, "trainings", "team_id", teamId);
    await optionalDeleteByEq(admin, "kit_pieces", "team_id", teamId);
  }

  const { data: players, error: playersError } = await admin
    .from("players")
    .select("id")
    .eq("age_group_id", ageGroupId);

  if (playersError && !isSchemaCompatibilityError(playersError)) {
    throw new Error(
      `Erro ao carregar jogadores para apagar escalão: ${
        playersError.message || "falha desconhecida"
      }`,
    );
  }

  const playerIds = (players || [])
    .map((player) => (typeof player.id === "string" ? player.id : null))
    .filter((playerId): playerId is string => !!playerId);

  await optionalDeleteByIn(admin, "pse_records", "player_id", playerIds);
  await optionalDeleteByIn(admin, "training_attendance", "player_id", playerIds);
  await optionalDeleteByIn(admin, "convocation_players", "player_id", playerIds);
  await optionalDeleteByIn(admin, "game_events", "player_id", playerIds);
  await optionalDeleteByIn(admin, "game_events", "related_player_id", playerIds);
  await optionalDeleteByIn(admin, "game_stats_live", "player_id", playerIds);
  await optionalDeleteByIn(admin, "game_final_stats", "player_id", playerIds);

  await optionalDeleteByEq(admin, "players", "age_group_id", ageGroupId);
  await optionalDeleteByEq(admin, "grounds", "age_group_id", ageGroupId);
  await optionalDeleteByEq(admin, "opponents", "age_group_id", ageGroupId);
  await optionalDeleteByEq(admin, "notifications", "age_group_id", ageGroupId);
  await optionalDeleteByEq(admin, "public_share_tokens", "age_group_id", ageGroupId);
  await optionalDeleteByEq(admin, "beta_invites", "target_age_group_id", ageGroupId);
  await optionalDeleteByEq(admin, "staff_invites", "age_group_id", ageGroupId);
  await optionalDeleteByEq(admin, "teams", "age_group_id", ageGroupId);

  await optionalDeleteByEq(admin, "age_group_staff", "age_group_id", ageGroupId);

  const { error: deleteAgeGroupError } = await admin
    .from("age_groups")
    .delete()
    .eq("id", ageGroupId);

  if (deleteAgeGroupError) {
    throw new Error(
      `Erro ao apagar escalão associado ao utilizador: ${
        deleteAgeGroupError.message || "falha desconhecida"
      }`,
    );
  }

  await removeStoragePrefix(admin, "event-images", ageGroupId);
  await removeStoragePrefix(admin, "club-logos", ageGroupId);
  // Fotos de atletas (PII de menores): path canonico {ageGroupId}/{playerId}.webp.
  // Sem esta limpeza, as fotos ficavam orfas no bucket privado apos apagar o escalao.
  await removeStoragePrefix(admin, "players-photos", ageGroupId);
  if (!options?.skipClubMembershipCleanup) {
    await cleanupClubMembershipsAfterAgeGroupDelete(
      admin,
      typeof ageGroup.club_id === "string" ? ageGroup.club_id : null,
      candidateProfileIds,
      options?.retainClubMembershipProfileIds || [],
    );
  }
}
