"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { syncAppBadge } from "@/lib/pwa/badges";

type NotificationsResponse = {
  success?: boolean;
  linked?: boolean;
  unreadCount?: number;
  error?: string;
};

export function useUnreadNotifications(profileId?: string | null) {
  const supabase = useMemo(() => createClient(), []);
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshCount = useCallback(async () => {
    if (!profileId) {
      setUnreadCount(0);
      return;
    }

    try {
      const res = await fetch("/api/notifications?limit=1", { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as NotificationsResponse | null;

      if (res.status === 401 || res.status === 403) {
        setUnreadCount(0);
        return;
      }

      if (!res.ok || !payload?.success) {
        console.error("Erro ao atualizar badge de notificações.", {
          status: res.status,
          error: payload?.error,
        });
        return;
      }

      if (payload.linked === false) {
        setUnreadCount(0);
        return;
      }

      setUnreadCount(payload.unreadCount || 0);
    } catch (error) {
      console.error("Erro de rede ao atualizar badge de notificações.", error);
    }
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
          table: "notification_recipients",
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

  useEffect(() => {
    void syncAppBadge(unreadCount);
  }, [unreadCount]);

  return unreadCount;
}
