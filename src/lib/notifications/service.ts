import type { SupabaseClient } from "@supabase/supabase-js";
import { getTeamMemberProfileIds } from "@/lib/team/members";

export type AppNotificationType = "new_game" | "new_training" | "message";

export type CreateTeamNotificationInput = {
  teamId: string;
  actorId: string;
  type: AppNotificationType;
  entityId?: string | null;
  title: string;
  body?: string | null;
  linkPath?: string | null;
  ageGroupId?: string | null;
  excludeActor?: boolean;
};

export type CreateUserNotificationsInput = {
  recipientIds: string[];
  actorId: string;
  type: AppNotificationType;
  ageGroupId: string;
  teamId?: string | null;
  entityId?: string | null;
  title: string;
  body?: string | null;
  linkPath?: string | null;
  excludeActor?: boolean;
};

export async function createNotificationsForTeam(
  admin: SupabaseClient,
  input: CreateTeamNotificationInput,
) {
  const teamMembership = await getTeamMemberProfileIds(admin, input.teamId);
  const ageGroupId = input.ageGroupId ?? teamMembership.ageGroupId;
  if (!ageGroupId) return { inserted: 0 };

  const recipients = (teamMembership.memberIds || []).filter((memberId) =>
    input.excludeActor === false ? true : memberId !== input.actorId,
  );

  if (recipients.length === 0) {
    return { inserted: 0 };
  }

  const rows = recipients.map((userId) => ({
    user_id: userId,
    age_group_id: ageGroupId,
    team_id: input.teamId,
    actor_id: input.actorId,
    type: input.type,
    entity_id: input.entityId ?? null,
    title: input.title,
    body: input.body ?? null,
    link_path: input.linkPath ?? null,
  }));

  const { error } = await admin.from("notifications").insert(rows);
  if (error) {
    throw new Error(`Erro ao gerar notificações: ${error.message}`);
  }

  return { inserted: rows.length };
}

export async function createNotificationsForUsers(
  admin: SupabaseClient,
  input: CreateUserNotificationsInput,
) {
  const uniqueRecipientIds = Array.from(
    new Set(
      (input.recipientIds || []).filter((recipientId) =>
        input.excludeActor === false ? true : recipientId !== input.actorId,
      ),
    ),
  );

  if (uniqueRecipientIds.length === 0) {
    return { inserted: 0 };
  }

  const rows = uniqueRecipientIds.map((userId) => ({
    user_id: userId,
    age_group_id: input.ageGroupId,
    team_id: input.teamId ?? null,
    actor_id: input.actorId,
    type: input.type,
    entity_id: input.entityId ?? null,
    title: input.title,
    body: input.body ?? null,
    link_path: input.linkPath ?? null,
  }));

  const { error } = await admin.from("notifications").insert(rows);
  if (error) {
    throw new Error(`Erro ao gerar notificações direcionadas: ${error.message}`);
  }

  return { inserted: rows.length };
}
