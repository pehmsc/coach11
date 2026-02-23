import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { deleteGameCascade, deleteTrainingSessionCascade } from "@/lib/events/delete-cascade";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import { NextResponse } from "next/server";

type DeleteAccountPayload = {
  confirmation?: string;
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

function isSchemaCompatibilityError(error: unknown) {
  return isRelationMissing(error) || isMissingColumn(error);
}

async function optionalDeleteByEq(
  admin: ReturnType<typeof createAdminClient>,
  table: string,
  column: string,
  value: string,
) {
  const { error } = await admin.from(table).delete().eq(column, value);
  if (!error) return;
  if (isSchemaCompatibilityError(error)) return;
  throw new Error(`Erro ao limpar ${table}.${column}: ${error.message || "falha desconhecida"}`);
}

async function optionalDeleteByIn(
  admin: ReturnType<typeof createAdminClient>,
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

async function optionalUpdateByEq(
  admin: ReturnType<typeof createAdminClient>,
  table: string,
  column: string,
  value: string,
  patch: Record<string, unknown>,
) {
  const { error } = await admin.from(table).update(patch).eq(column, value);
  if (!error) return;
  if (isSchemaCompatibilityError(error)) return;
  throw new Error(
    `Erro ao atualizar ${table}.${column} antes de apagar conta: ${
      error.message || "falha desconhecida"
    }`,
  );
}

async function reassignManagedAgeGroups(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
) {
  const { data: managedAgeGroups, error } = await admin
    .from("age_groups")
    .select("id, name")
    .eq("coordinator_id", userId);

  if (error) {
    throw new Error(`Erro ao validar escalões coordenados: ${error.message || "falha desconhecida"}`);
  }

  for (const ageGroup of managedAgeGroups || []) {
    const { data: teams, error: teamsError } = await admin
      .from("teams")
      .select("id")
      .eq("age_group_id", ageGroup.id);

    if (teamsError) {
      throw new Error(
        `Erro ao validar equipas do escalão ${ageGroup.name}: ${
          teamsError.message || "falha desconhecida"
        }`,
      );
    }

    const teamIds = (teams || [])
      .map((team) => (typeof team.id === "string" ? team.id : null))
      .filter((teamId): teamId is string => !!teamId);

    let replacementProfileId: string | null = null;

    if (teamIds.length > 0) {
      const { data: replacement, error: replacementError } = await admin
        .from("team_staff")
        .select("profile_id")
        .in("team_id", teamIds)
        .neq("profile_id", userId)
        .limit(1)
        .maybeSingle();

      if (replacementError && !isSchemaCompatibilityError(replacementError)) {
        throw new Error(
          `Erro ao encontrar substituto para coordenação do escalão ${
            ageGroup.name
          }: ${replacementError.message || "falha desconhecida"}`,
        );
      }

      replacementProfileId =
        typeof replacement?.profile_id === "string" ? replacement.profile_id : null;
    }

    if (!replacementProfileId) {
      await deleteManagedAgeGroupData(admin, ageGroup.id);
      continue;
    }

    const { error: updateAgeGroupError } = await admin
      .from("age_groups")
      .update({ coordinator_id: replacementProfileId })
      .eq("id", ageGroup.id);

    if (updateAgeGroupError) {
      throw new Error(
        `Erro ao transferir coordenação do escalão ${ageGroup.name}: ${
          updateAgeGroupError.message || "falha desconhecida"
        }`,
      );
    }

    // Mantém role coerente após transferência.
    await optionalUpdateByEq(admin, "profiles", "id", replacementProfileId, {
      role: "coordinator",
    });
  }

  return;
}

async function deleteManagedAgeGroupData(
  admin: ReturnType<typeof createAdminClient>,
  ageGroupId: string,
) {
  const { data: teams, error: teamsError } = await admin
    .from("teams")
    .select("id")
    .eq("age_group_id", ageGroupId);

  if (teamsError) {
    throw new Error(`Erro ao carregar equipas do escalão: ${teamsError.message || "falha desconhecida"}`);
  }

  const teamIds = (teams || [])
    .map((team) => (typeof team.id === "string" ? team.id : null))
    .filter((teamId): teamId is string => !!teamId);

  for (const teamId of teamIds) {
    const { data: sessions, error: sessionsError } = await admin
      .from("training_sessions")
      .select("id")
      .eq("team_id", teamId);
    if (sessionsError && !isSchemaCompatibilityError(sessionsError)) {
      throw new Error(
        `Erro ao carregar treinos para apagar escalão: ${sessionsError.message || "falha desconhecida"}`,
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
        `Erro ao carregar jogos para apagar escalão: ${gamesError.message || "falha desconhecida"}`,
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
    await optionalDeleteByEq(admin, "team_staff", "team_id", teamId);
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
  await optionalDeleteByIn(admin, "attendance_records", "player_id", playerIds);
  await optionalDeleteByIn(admin, "convocation_players", "player_id", playerIds);
  await optionalDeleteByIn(admin, "game_events", "player_id", playerIds);
  await optionalDeleteByIn(admin, "game_events", "related_player_id", playerIds);
  await optionalDeleteByIn(admin, "game_stats_live", "player_id", playerIds);
  await optionalDeleteByIn(admin, "game_final_stats", "player_id", playerIds);

  await optionalDeleteByEq(admin, "players", "age_group_id", ageGroupId);
  await optionalDeleteByEq(admin, "staff_invites", "age_group_id", ageGroupId);
  await optionalDeleteByEq(admin, "teams", "age_group_id", ageGroupId);

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
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as DeleteAccountPayload | null;
    if (body?.confirmation !== "DELETE_ACCOUNT") {
      return NextResponse.json(
        { error: "Confirmação inválida para apagar conta." },
        { status: 400 },
      );
    }

    const admin = createAdminClient();

    await reassignManagedAgeGroups(admin, user.id);

    await optionalDeleteByEq(admin, "team_staff", "profile_id", user.id);
    await optionalDeleteByEq(admin, "staff_invites", "profile_id", user.id);
    await optionalDeleteByEq(admin, "staff_invites", "invited_by", user.id);
    await optionalDeleteByEq(admin, "staff_invites", "accepted_by", user.id);

    await optionalUpdateByEq(admin, "players", "profile_id", user.id, { profile_id: null });
    await optionalUpdateByEq(admin, "training_attendance", "marked_by", user.id, {
      marked_by: null,
    });
    await optionalUpdateByEq(admin, "attendance_records", "marked_by", user.id, {
      marked_by: null,
    });
    await optionalUpdateByEq(admin, "grounds", "created_by", user.id, { created_by: null });
    await optionalUpdateByEq(admin, "game_live_checkpoints", "updated_by", user.id, {
      updated_by: null,
    });

    const { error: deleteProfileError } = await admin
      .from("profiles")
      .delete()
      .eq("id", user.id);

    if (deleteProfileError) {
      return respondInternalError("api.me.account.delete.profile", deleteProfileError);
    }

    const { error: deleteAuthUserError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteAuthUserError) {
      return respondInternalError("api.me.account.delete.auth-user", deleteAuthUserError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return respondInternalError("api.me.account.delete", error);
  }
}
