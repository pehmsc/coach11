"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  subscribeToUnreadCountPatch,
  type UnreadCountPatch,
} from "@/lib/notifications/unread-sync";
import { syncAppBadge } from "@/lib/pwa/badges";

type NotificationsResponse = {
  success?: boolean;
  linked?: boolean;
  unreadCount?: number;
  error?: string;
};

export function useUnreadNotifications(
  profileId?: string | null,
  options?: {
    type?: string;
  },
) {
  const supabase = useMemo(() => createClient(), []);
  const [unreadCount, setUnreadCount] = useState(0);
  const typeFilter = options?.type?.trim() || null;
  const pollingIntervalMs = typeFilter === "message" ? 15000 : 45000;

  const refreshCount = useCallback(async () => {
    if (!profileId) {
      setUnreadCount(0);
      return;
    }

    try {
      const params = new URLSearchParams({ limit: "1" });
      if (typeFilter) {
        params.set("type", typeFilter);
      }

      const res = await fetch(`/api/notifications?${params.toString()}`, {
        cache: "no-store",
      });
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
  }, [profileId, typeFilter]);

  useEffect(() => {
    if (!profileId) return;

    const raf = window.requestAnimationFrame(() => {
      void refreshCount();
    });
    const interval = window.setInterval(() => {
      void refreshCount();
    }, pollingIntervalMs);

    const handleFocusRefresh = () => {
      if (document.visibilityState === "visible") {
        void refreshCount();
      }
    };
    window.addEventListener("focus", handleFocusRefresh);
    document.addEventListener("visibilitychange", handleFocusRefresh);

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
      window.removeEventListener("focus", handleFocusRefresh);
      document.removeEventListener("visibilitychange", handleFocusRefresh);
      void supabase.removeChannel(channel);
    };
  }, [pollingIntervalMs, profileId, refreshCount, supabase]);

  useEffect(() => {
    if (typeFilter) return;
    void syncAppBadge(unreadCount);
  }, [typeFilter, unreadCount]);

  useEffect(() => {
    const unsubscribe = subscribeToUnreadCountPatch((detail: UnreadCountPatch) => {
      const nextCount =
        typeFilter === "message" ? detail.messages : detail.notifications;
      if (typeof nextCount === "number") {
        setUnreadCount(Math.max(0, nextCount));
      }
    });

    return unsubscribe;
  }, [typeFilter]);

  return unreadCount;
}
