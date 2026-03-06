import type { SupabaseClient } from "@supabase/supabase-js";

type NotificationsDbClient = SupabaseClient;

type InsertNotificationInput = {
  user_id: string | null;
  age_group_id: string;
  team_id: string | null;
  actor_id: string;
  type: string;
  entity_id: string | null;
  title: string;
  body: string | null;
  link_path: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  read_at: string | null;
};

type InsertNotificationRecipientInput = {
  notification_id: string;
  user_id: string;
  read_at: string | null;
  cleared_at: string | null;
  created_at: string;
};

export async function insertNotification(
  db: NotificationsDbClient,
  input: InsertNotificationInput,
) {
  return db
    .from("notifications")
    .insert(input)
    .select("id, created_at")
    .single();
}

export async function insertNotificationRecipients(
  db: NotificationsDbClient,
  rows: InsertNotificationRecipientInput[],
) {
  return db
    .from("notification_recipients")
    .insert(rows);
}

export async function deleteNotificationById(
  db: NotificationsDbClient,
  notificationId: string,
) {
  return db
    .from("notifications")
    .delete()
    .eq("id", notificationId);
}
