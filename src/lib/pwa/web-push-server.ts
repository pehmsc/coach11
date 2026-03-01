import webpush, { type PushSubscription } from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getPushSubscriptionsSchemaHint,
  isPushSubscriptionsSchemaError,
} from "@/lib/pwa/push-subscriptions-schema";

type AdminClient = ReturnType<typeof createAdminClient>;

type PushSubscriptionRow = {
  endpoint: string;
  user_id: string;
  p256dh: string;
  auth: string;
};

export type WebPushPayload = {
  type: string;
  title: string;
  body?: string | null;
  url: string;
  badgeCount?: number | null;
};

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY?.trim() || "";
const VAPID_SUBJECT =
  process.env.VAPID_SUBJECT?.trim() || "mailto:noreply@coach11.app";

let vapidConfigured = false;

function ensureVapidConfigured() {
  if (vapidConfigured) return true;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false;

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  vapidConfigured = true;
  return true;
}

export function isWebPushConfiguredOnServer() {
  return ensureVapidConfigured();
}

async function listActiveSubscriptions(admin: AdminClient, userIds: string[]) {
  if (userIds.length === 0) return [] as PushSubscriptionRow[];

  const { data, error } = await admin
    .from("push_subscriptions")
    .select("endpoint, user_id, p256dh, auth")
    .in("user_id", userIds)
    .is("revoked_at", null);

  if (error) {
    if (isPushSubscriptionsSchemaError(error)) {
      console.warn("[push.schema]", {
        stage: "listActiveSubscriptions",
        hint: getPushSubscriptionsSchemaHint(),
        error,
      });
      return null;
    }
    throw error;
  }

  return (data || []) as PushSubscriptionRow[];
}

async function listUnreadCounts(admin: AdminClient, userIds: string[]) {
  const counts = new Map<string, number>();

  await Promise.all(
    userIds.map(async (userId) => {
      const { count, error } = await admin
        .from("notification_recipients")
        .select("notification_id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("cleared_at", null)
      .is("read_at", null);

      if (error) {
        throw error;
      }

      counts.set(userId, count ?? 0);
    }),
  );

  return counts;
}

async function revokeSubscriptionsByEndpoint(
  admin: AdminClient,
  endpoints: string[],
) {
  if (endpoints.length === 0) return;

  const { error } = await admin
    .from("push_subscriptions")
    .update({
      revoked_at: new Date().toISOString(),
    })
    .in("endpoint", endpoints)
    .is("revoked_at", null);

  if (error) {
    throw error;
  }
}

function toWebPushSubscription(row: PushSubscriptionRow): PushSubscription {
  return {
    endpoint: row.endpoint,
    keys: {
      p256dh: row.p256dh,
      auth: row.auth,
    },
  };
}

export async function sendWebPushToUsers(
  admin: AdminClient,
  userIds: string[],
  payload: Omit<WebPushPayload, "badgeCount">,
) {
  if (!ensureVapidConfigured()) {
    return { attempted: 0, sent: 0, revoked: 0, skipped: true as const };
  }

  const uniqueUserIds = Array.from(
    new Set(userIds.filter((userId) => typeof userId === "string" && userId.length > 0)),
  );
  if (uniqueUserIds.length === 0) {
    return { attempted: 0, sent: 0, revoked: 0, skipped: false as const };
  }

  const [subscriptions, unreadCounts] = await Promise.all([
    listActiveSubscriptions(admin, uniqueUserIds),
    listUnreadCounts(admin, uniqueUserIds),
  ]);

  if (subscriptions === null) {
    return {
      attempted: 0,
      sent: 0,
      revoked: 0,
      skipped: true as const,
      reason: "schema_unavailable" as const,
    };
  }

  if (subscriptions.length === 0) {
    return { attempted: 0, sent: 0, revoked: 0, skipped: false as const };
  }

  const revokedEndpoints = new Set<string>();
  let sent = 0;

  await Promise.allSettled(
    subscriptions.map(async (subscriptionRow) => {
      const subscription = toWebPushSubscription(subscriptionRow);
      const badgeCount = unreadCounts.get(subscriptionRow.user_id) ?? 0;

      try {
        await webpush.sendNotification(
          subscription,
          JSON.stringify({
            ...payload,
            badgeCount,
          }),
          {
            TTL: 60,
            urgency: payload.type === "message" ? "high" : "normal",
          },
        );
        sent += 1;
      } catch (error) {
        const statusCode =
          typeof error === "object" && error && "statusCode" in error
            ? Number((error as { statusCode?: number }).statusCode)
            : null;

        if (statusCode === 404 || statusCode === 410) {
          revokedEndpoints.add(subscriptionRow.endpoint);
          return;
        }

        console.error("[push.send]", {
          endpoint: subscriptionRow.endpoint,
          userId: subscriptionRow.user_id,
          statusCode,
          error,
        });
      }
    }),
  );

  if (revokedEndpoints.size > 0) {
    await revokeSubscriptionsByEndpoint(admin, Array.from(revokedEndpoints));
  }

  return {
    attempted: subscriptions.length,
    sent,
    revoked: revokedEndpoints.size,
    skipped: false as const,
  };
}
