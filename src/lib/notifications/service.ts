import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWebPushToUsers } from "@/lib/pwa/web-push-server";
import { getTeamMemberProfileIds } from "@/lib/team/members";
import {
  deleteNotificationById,
  insertNotification,
  insertNotificationRecipients,
} from "@/lib/repositories/notifications.repository";

type AdminClient = ReturnType<typeof createAdminClient>;

export type AppNotificationType =
  | "new_game"
  | "new_training"
  | "attendance_pending"
  | "attendance_closed"
  | "convocation_confirmed"
  | "game_live_started";

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

function buildNotificationPayload(
  input: Pick<
    CreateTeamNotificationInput | CreateUserNotificationsInput,
    "type" | "title" | "body" | "linkPath" | "entityId"
  >,
) {
  return {
    type: input.type,
    title: input.title,
    ...(input.body ? { body: input.body } : {}),
    ...(input.linkPath ? { link_path: input.linkPath } : {}),
    ...(input.entityId ? { entity_id: input.entityId } : {}),
  };
}

function resolvePushUrl(
  input: Pick<
    CreateTeamNotificationInput | CreateUserNotificationsInput,
    "type" | "entityId" | "linkPath"
  >,
) {
  if (input.linkPath && input.linkPath.startsWith("/")) {
    return input.linkPath;
  }
  if (input.type === "new_game" && input.entityId) {
    return `/games/${input.entityId}`;
  }
  if (input.type === "new_training") {
    return "/calendar";
  }
  if (input.type === "attendance_pending" || input.type === "attendance_closed") {
    return "/attendance";
  }
  if (input.type === "game_live_started" && input.entityId) {
    return `/games/${input.entityId}/live`;
  }
  if (input.type === "convocation_confirmed" && input.entityId) {
    return `/games/${input.entityId}`;
  }
  return "/notifications";
}

async function findExistingNotificationId(
  admin: AdminClient,
  input: {
    ageGroupId: string;
    teamId?: string | null;
    type: AppNotificationType;
    entityId?: string | null;
  },
) {
  let query = admin
    .from("notifications")
    .select("id")
    .eq("age_group_id", input.ageGroupId)
    .eq("type", input.type);

  if (input.teamId) {
    query = query.eq("team_id", input.teamId);
  } else {
    query = query.is("team_id", null);
  }

  if (input.entityId) {
    query = query.eq("entity_id", input.entityId);
  } else {
    query = query.is("entity_id", null);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.id ?? null;
}

async function insertNotificationBroadcast(
  admin: AdminClient,
  input: {
    ageGroupId: string;
    teamId?: string | null;
    actorId: string;
    type: AppNotificationType;
    entityId?: string | null;
    title: string;
    body?: string | null;
    linkPath?: string | null;
  },
  recipientIds: string[],
) {
  const createdAt = new Date().toISOString();
  const { data: notification, error: notificationError } = await insertNotification(
    admin,
    {
      user_id: null,
      age_group_id: input.ageGroupId,
      team_id: input.teamId ?? null,
      actor_id: input.actorId,
      type: input.type,
      entity_id: input.entityId ?? null,
      title: input.title,
      body: input.body ?? null,
      link_path: input.linkPath ?? null,
      payload: buildNotificationPayload(input),
      created_at: createdAt,
      read_at: null,
    },
  );

  if (notificationError || !notification?.id) {
    throw new Error(
      `Erro ao criar notificação base: ${
        notificationError?.message || "INSERT_NOTIFICATION_EMPTY_RESULT"
      }`,
    );
  }

  const rows = recipientIds.map((userId) => ({
    notification_id: notification.id,
    user_id: userId,
    read_at: null,
    cleared_at: null,
    created_at: notification.created_at || createdAt,
  }));

  const { error: recipientsError } = await insertNotificationRecipients(admin, rows);

  if (recipientsError) {
    await deleteNotificationById(admin, notification.id);
    throw new Error(`Erro ao criar recipients da notificação: ${recipientsError.message}`);
  }

  try {
    const pushResult = await sendWebPushToUsers(admin, recipientIds, {
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      url: resolvePushUrl(input),
    });
    console.info("[notifications.push]", {
      type: input.type,
      notificationId: notification.id,
      recipients: recipientIds.length,
      attempted: pushResult.attempted,
      sent: pushResult.sent,
      revoked: pushResult.revoked,
      skipped: pushResult.skipped,
      reason: "reason" in pushResult ? pushResult.reason : null,
    });
  } catch (pushError) {
    console.error("[notifications.push]", {
      type: input.type,
      notificationId: notification.id,
      pushError,
    });
  }

  return { inserted: rows.length, notificationId: notification.id };
}

export async function createNotificationsForTeam(
  _: SupabaseClient,
  input: CreateTeamNotificationInput,
) {
  const admin = createAdminClient();
  const teamMembership = await getTeamMemberProfileIds(admin, input.teamId);
  const ageGroupId = input.ageGroupId ?? teamMembership.ageGroupId;
  if (!ageGroupId) return { inserted: 0 };

  const recipients = (teamMembership.memberIds || []).filter((memberId) =>
    input.excludeActor === false ? true : memberId !== input.actorId,
  );

  if (recipients.length === 0) {
    return { inserted: 0 };
  }

  return insertNotificationBroadcast(
    admin,
    {
      ageGroupId,
      teamId: input.teamId,
      actorId: input.actorId,
      type: input.type,
      entityId: input.entityId ?? null,
      title: input.title,
      body: input.body ?? null,
      linkPath: input.linkPath ?? null,
    },
    recipients,
  );
}

export async function createNotificationForTeamOnce(
  _: SupabaseClient,
  input: CreateTeamNotificationInput,
) {
  const admin = createAdminClient();
  const teamMembership = await getTeamMemberProfileIds(admin, input.teamId);
  const ageGroupId = input.ageGroupId ?? teamMembership.ageGroupId;
  if (!ageGroupId) return { inserted: 0, notificationId: null };

  const existingNotificationId = await findExistingNotificationId(admin, {
    ageGroupId,
    teamId: input.teamId,
    type: input.type,
    entityId: input.entityId ?? null,
  });

  if (existingNotificationId) {
    return { inserted: 0, notificationId: existingNotificationId };
  }

  const recipients = (teamMembership.memberIds || []).filter((memberId) =>
    input.excludeActor === false ? true : memberId !== input.actorId,
  );

  if (recipients.length === 0) {
    return { inserted: 0, notificationId: null };
  }

  return insertNotificationBroadcast(
    admin,
    {
      ageGroupId,
      teamId: input.teamId,
      actorId: input.actorId,
      type: input.type,
      entityId: input.entityId ?? null,
      title: input.title,
      body: input.body ?? null,
      linkPath: input.linkPath ?? null,
    },
    recipients,
  );
}

export async function createNotificationsForUsers(
  _: SupabaseClient,
  input: CreateUserNotificationsInput,
) {
  const admin = createAdminClient();
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

  return insertNotificationBroadcast(
    admin,
    {
      ageGroupId: input.ageGroupId,
      teamId: input.teamId ?? null,
      actorId: input.actorId,
      type: input.type,
      entityId: input.entityId ?? null,
      title: input.title,
      body: input.body ?? null,
      linkPath: input.linkPath ?? null,
    },
    uniqueRecipientIds,
  );
}
