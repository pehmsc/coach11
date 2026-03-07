"use client";

import { useEffect } from "react";
import { useUnreadNotifications } from "@/components/layout/use-unread-notifications";
import { syncAppBadge } from "@/lib/pwa/badges";

export function UnreadBadgeRuntime({
  profileId,
}: {
  profileId?: string | null;
}) {
  const unreadNotificationsCount = useUnreadNotifications(profileId);
  const unreadMessagesCount = useUnreadNotifications(profileId, {
    type: "message",
  });

  useEffect(() => {
    void syncAppBadge(unreadNotificationsCount + unreadMessagesCount);
  }, [unreadMessagesCount, unreadNotificationsCount]);

  return null;
}
