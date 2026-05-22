"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
  teamId?: string | null;
  error?: string;
};

type UnreadNotificationsContextType = {
  unreadNotifications: number;
};

const UnreadNotificationsContext = createContext<UnreadNotificationsContextType>({
  unreadNotifications: 0,
});

const NOTIFICATIONS_INTERVAL_MS = 120_000;

export function UnreadNotificationsProvider({
  profileId,
  children,
}: {
  profileId: string | null;
  children: ReactNode;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const pendingNotificationsRef = useRef(false);

  const fetchNotifications = useCallback(async () => {
    if (!profileId || pendingNotificationsRef.current) return;
    pendingNotificationsRef.current = true;
    try {
      const res = await fetch(
        `/api/notifications?${new URLSearchParams({ limit: "1" })}`,
        { cache: "no-store" },
      );
      const payload = (await res.json().catch(() => null)) as NotificationsResponse | null;
      if (res.status === 401 || res.status === 403 || !res.ok || !payload?.success) {
        if (res.status === 401 || res.status === 403) setUnreadNotifications(0);
        return;
      }
      if (payload.linked === false) {
        setUnreadNotifications(0);
        return;
      }
      setUnreadNotifications(payload.unreadCount || 0);
    } catch (error) {
      console.error("[UnreadNotificationsProvider] notifications fetch:", error);
    } finally {
      pendingNotificationsRef.current = false;
    }
  }, [profileId]);

  // Polling + visibility + focus
  useEffect(() => {
    if (!profileId) return;

    const raf = window.requestAnimationFrame(() => {
      void fetchNotifications();
    });

    const notifsInterval = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void fetchNotifications();
    }, NOTIFICATIONS_INTERVAL_MS);

    const handleFocusRefresh = () => {
      if (document.visibilityState === "visible") {
        void fetchNotifications();
      }
    };
    window.addEventListener("focus", handleFocusRefresh);
    document.addEventListener("visibilitychange", handleFocusRefresh);

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearInterval(notifsInterval);
      window.removeEventListener("focus", handleFocusRefresh);
      document.removeEventListener("visibilitychange", handleFocusRefresh);
    };
  }, [profileId, fetchNotifications]);

  // Realtime: notifications
  useEffect(() => {
    if (!profileId) return;

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
        () => void fetchNotifications(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [profileId, supabase, fetchNotifications]);

  // Patch listener (optimistic updates from other parts of the app)
  useEffect(() => {
    const unsubscribe = subscribeToUnreadCountPatch((detail: UnreadCountPatch) => {
      if (typeof detail.notifications === "number") {
        setUnreadNotifications(Math.max(0, detail.notifications));
      }
    });
    return unsubscribe;
  }, []);

  // Sync PWA badge
  useEffect(() => {
    void syncAppBadge(unreadNotifications);
  }, [unreadNotifications]);

  const value = useMemo(
    () => ({ unreadNotifications }),
    [unreadNotifications],
  );

  return (
    <UnreadNotificationsContext.Provider value={value}>
      {children}
    </UnreadNotificationsContext.Provider>
  );
}

export function useUnreadCounts() {
  return useContext(UnreadNotificationsContext);
}
