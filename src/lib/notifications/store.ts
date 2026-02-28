import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

const RECIPIENT_UPDATE_BATCH_SIZE = 500;

type NotificationInboxRow = {
  id: string;
  user_id: string;
  team_id: string | null;
  age_group_id: string | null;
  actor_id: string | null;
  type: string;
  entity_id: string | null;
  title: string | null;
  body: string | null;
  link_path: string | null;
  created_at: string;
  read_at: string | null;
  cleared_at: string | null;
  payload: Record<string, unknown> | null;
};

export type NotificationListItem = {
  id: string;
  team_id: string | null;
  age_group_id: string | null;
  actor_id: string | null;
  type: string;
  entity_id: string | null;
  title: string;
  body: string | null;
  link_path: string | null;
  created_at: string;
  read_at: string | null;
};

type ScopedNotificationFilter = {
  userId: string;
  type?: string | null;
  onlyRead?: boolean;
  onlyUnread?: boolean;
  includeCleared?: boolean;
};

export type BulkNotificationAction = "mark_read" | "mark_unread" | "clear";

function normalizeLinkPath(row: NotificationInboxRow) {
  if (row.link_path && row.link_path.startsWith("/")) {
    return row.link_path;
  }
  if (row.type === "new_game" && row.entity_id) return `/games/${row.entity_id}`;
  if (row.type === "new_training") return "/calendar";
  return "/messages";
}

function mapNotificationRow(row: NotificationInboxRow): NotificationListItem {
  return {
    id: row.id,
    team_id: row.team_id,
    age_group_id: row.age_group_id,
    actor_id: row.actor_id,
    type: row.type,
    entity_id: row.entity_id,
    title: row.title || "Notificação",
    body: row.body ?? null,
    link_path: normalizeLinkPath(row),
    created_at: row.created_at,
    read_at: row.read_at,
  };
}

async function fetchScopedNotificationIds(
  admin: AdminClient,
  filter: ScopedNotificationFilter,
) {
  let query = admin
    .from("notification_inbox")
    .select("id")
    .eq("user_id", filter.userId);

  if (filter.includeCleared !== true) {
    query = query.is("cleared_at", null);
  }
  if (filter.type) {
    query = query.eq("type", filter.type);
  }
  if (filter.onlyRead) {
    query = query.not("read_at", "is", null);
  }
  if (filter.onlyUnread) {
    query = query.is("read_at", null);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  return ((data || []) as Array<{ id: string | null }>)
    .map((row) => row.id)
    .filter((value): value is string => typeof value === "string");
}

async function updateRecipientsInBatches(
  admin: AdminClient,
  userId: string,
  ids: string[],
  values: {
    read_at?: string | null;
    cleared_at?: string | null;
  },
) {
  let updated = 0;

  for (let index = 0; index < ids.length; index += RECIPIENT_UPDATE_BATCH_SIZE) {
    const batch = ids.slice(index, index + RECIPIENT_UPDATE_BATCH_SIZE);
    const { data, error } = await admin
      .from("notification_recipients")
      .update(values)
      .eq("user_id", userId)
      .in("notification_id", batch)
      .select("notification_id");

    if (error) {
      throw error;
    }

    updated += ((data || []) as Array<{ notification_id: string }>).length;
  }

  return updated;
}

export async function listUserNotifications(
  admin: AdminClient,
  options: {
    userId: string;
    limit: number;
    unreadOnly?: boolean;
  },
) {
  let listQuery = admin
    .from("notification_inbox")
    .select(
      "id, user_id, team_id, age_group_id, actor_id, type, entity_id, title, body, link_path, created_at, read_at, cleared_at, payload",
    )
    .eq("user_id", options.userId)
    .is("cleared_at", null)
    .order("created_at", { ascending: false })
    .limit(options.limit);

  let unreadQuery = admin
    .from("notification_inbox")
    .select("id", { count: "exact", head: true })
    .eq("user_id", options.userId)
    .is("cleared_at", null);

  if (options.unreadOnly) {
    listQuery = listQuery.is("read_at", null);
  }

  unreadQuery = unreadQuery.is("read_at", null);

  const [{ data: rows, error: listError }, unreadRes] = await Promise.all([
    listQuery,
    unreadQuery,
  ]);

  if (listError) {
    throw listError;
  }

  return {
    notifications: ((rows || []) as NotificationInboxRow[]).map(mapNotificationRow),
    unreadCount: unreadRes.count ?? 0,
  };
}

export async function getUserNotification(
  admin: AdminClient,
  options: {
    userId: string;
    notificationId: string;
    includeCleared?: boolean;
  },
) {
  let query = admin
    .from("notification_inbox")
    .select(
      "id, user_id, team_id, age_group_id, actor_id, type, entity_id, title, body, link_path, created_at, read_at, cleared_at, payload",
    )
    .eq("id", options.notificationId)
    .eq("user_id", options.userId);

  if (options.includeCleared !== true) {
    query = query.is("cleared_at", null);
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    throw error;
  }

  return data ? mapNotificationRow(data as NotificationInboxRow) : null;
}

export async function setNotificationReadState(
  admin: AdminClient,
  options: {
    userId: string;
    notificationId: string;
    readAt: string | null;
  },
) {
  const { data, error } = await admin
    .from("notification_recipients")
    .update({ read_at: options.readAt })
    .eq("user_id", options.userId)
    .eq("notification_id", options.notificationId)
    .is("cleared_at", null)
    .select("notification_id")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.notification_id ?? null;
}

export async function clearNotificationForUser(
  admin: AdminClient,
  options: {
    userId: string;
    notificationId: string;
    clearedAt: string;
  },
) {
  const { data, error } = await admin
    .from("notification_recipients")
    .update({ cleared_at: options.clearedAt })
    .eq("user_id", options.userId)
    .eq("notification_id", options.notificationId)
    .is("cleared_at", null)
    .select("notification_id")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.notification_id ?? null;
}

export async function bulkApplyNotificationAction(
  admin: AdminClient,
  options: {
    userId: string;
    type?: string | null;
    onlyRead?: boolean;
    onlyUnread?: boolean;
    action: BulkNotificationAction;
    nowIso?: string;
  },
) {
  const ids = await fetchScopedNotificationIds(admin, {
    userId: options.userId,
    type: options.type,
    onlyRead: options.onlyRead,
    onlyUnread: options.onlyUnread,
    includeCleared: false,
  });

  if (ids.length === 0) {
    return 0;
  }

  const nowIso = options.nowIso || new Date().toISOString();

  if (options.action === "clear") {
    return updateRecipientsInBatches(admin, options.userId, ids, {
      cleared_at: nowIso,
    });
  }

  return updateRecipientsInBatches(admin, options.userId, ids, {
    read_at: options.action === "mark_read" ? nowIso : null,
  });
}
