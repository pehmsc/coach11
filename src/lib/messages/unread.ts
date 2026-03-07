import type { SupabaseClient } from "@supabase/supabase-js";

type TeamMessageReadRow = {
  last_read_at: string | null;
};

type TeamMessageLatestRow = {
  created_at: string | null;
};

async function getTeamMessageReadCursor(
  db: SupabaseClient,
  teamId: string,
  userId: string,
) {
  const { data, error } = await db
    .from("team_message_reads")
    .select("last_read_at")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`team_message_reads_cursor_failed:${error.message}`);
  }

  return (data as TeamMessageReadRow | null)?.last_read_at ?? null;
}

async function getLatestTeamMessageCreatedAt(
  db: SupabaseClient,
  teamId: string,
) {
  const { data, error } = await db
    .from("team_messages")
    .select("created_at")
    .eq("team_id", teamId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`team_messages_latest_failed:${error.message}`);
  }

  return (data as TeamMessageLatestRow | null)?.created_at ?? new Date().toISOString();
}

export async function ensureTeamMessageReadCursor(
  db: SupabaseClient,
  options: {
    teamId: string;
    userId: string;
    fallbackReadAt?: string | null;
  },
) {
  const existingCursor = await getTeamMessageReadCursor(
    db,
    options.teamId,
    options.userId,
  );
  if (existingCursor) {
    return existingCursor;
  }

  const fallbackReadAt =
    options.fallbackReadAt || (await getLatestTeamMessageCreatedAt(db, options.teamId));
  const nowIso = new Date().toISOString();

  const { error } = await db.from("team_message_reads").upsert(
    {
      team_id: options.teamId,
      user_id: options.userId,
      last_read_at: fallbackReadAt,
      updated_at: nowIso,
    },
    { onConflict: "team_id,user_id" },
  );

  if (error) {
    throw new Error(`team_message_reads_cursor_upsert_failed:${error.message}`);
  }

  return fallbackReadAt;
}

export async function markTeamMessagesRead(
  db: SupabaseClient,
  options: {
    teamId: string;
    userId: string;
    readAt?: string | null;
  },
) {
  const readAt =
    options.readAt || (await getLatestTeamMessageCreatedAt(db, options.teamId));
  const nowIso = new Date().toISOString();

  const { error } = await db.from("team_message_reads").upsert(
    {
      team_id: options.teamId,
      user_id: options.userId,
      last_read_at: readAt,
      updated_at: nowIso,
    },
    { onConflict: "team_id,user_id" },
  );

  if (error) {
    throw new Error(`team_message_reads_mark_read_failed:${error.message}`);
  }

  return readAt;
}

export async function countUnreadTeamMessages(
  db: SupabaseClient,
  options: {
    teamId: string;
    userId: string;
  },
) {
  const cursor = await ensureTeamMessageReadCursor(db, {
    teamId: options.teamId,
    userId: options.userId,
  });

  const { count, error } = await db
    .from("team_messages")
    .select("id", { count: "exact", head: true })
    .eq("team_id", options.teamId)
    .neq("sender_id", options.userId)
    .gt("created_at", cursor);

  if (error) {
    throw new Error(`team_messages_unread_count_failed:${error.message}`);
  }

  return count ?? 0;
}
