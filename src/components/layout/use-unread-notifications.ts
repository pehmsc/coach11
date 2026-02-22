"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type NotificationsResponse = {
  success?: boolean;
  unreadCount?: number;
};

export function useUnreadNotifications(profileId?: string | null) {
  const supabase = useMemo(() => createClient(), []);
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshCount = useCallback(async () => {
    if (!profileId) {
      setUnreadCount(0);
      return;
    }

    const res = await fetch("/api/notifications?limit=1", { cache: "no-store" });
    const payload = (await res.json().catch(() => null)) as NotificationsResponse | null;
    if (!res.ok || !payload?.success) return;
    setUnreadCount(payload.unreadCount || 0);
  }, [profileId]);

  useEffect(() => {
    if (!profileId) return;

    const raf = window.requestAnimationFrame(() => {
      void refreshCount();
    });
    const interval = window.setInterval(() => {
      void refreshCount();
    }, 45000);

    const channel = supabase
      .channel(`notifications:${profileId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${profileId}`,
        },
        () => {
          void refreshCount();
        },
      )
      .subscribe();

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [profileId, refreshCount, supabase]);

  return unreadCount;
}
