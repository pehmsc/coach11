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
  unreadMessages: number;
};

const UnreadNotificationsContext = createContext<UnreadNotificationsContextType>({
  unreadNotifications: 0,
  unreadMessages: 0,
});

const NOTIFICATIONS_INTERVAL_MS = 120_000;
const MESSAGES_INTERVAL_MS = 60_000;

/**
 * Provider único para contagens de notificações e mensagens não lidas.
 * Substitui 6 instâncias separadas do hook useUnreadNotifications
 * (Sidebar ×2, MobileFooterNav ×2, UnreadBadgeRuntime ×2)
 * por uma única instância com polling, realtime, e dedup.
 */
export function UnreadNotificationsProvider({
  profileId,
  children,
}: {
  profileId: string | null;
  children: ReactNode;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [messageTeamId, setMessageTeamId] = useState<string | null>(null);
  const pendingNotificationsRef = useRef(false);
  const pendingMessagesRef = useRef(false);

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

  const fetchMessages = useCallback(async () => {
    if (!profileId || pendingMessagesRef.current) return;
    pendingMessagesRef.current = true;
    try {
      const res = await fetch("/api/messages/unread", { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as NotificationsResponse | null;
      if (res.status === 401 || res.status === 403 || !res.ok || !payload?.success) {
        if (res.status === 401 || res.status === 403) {
          setUnreadMessages(0);
          setMessageTeamId(null);
        }
        return;
      }
      if (payload.linked === false) {
        setUnreadMessages(0);
        setMessageTeamId(payload.teamId || null);
        return;
      }
      setMessageTeamId(payload.teamId || null);
      setUnreadMessages(payload.unreadCount || 0);
    } catch (error) {
      console.error("[UnreadNotificationsProvider] messages fetch:", error);
    } finally {
      pendingMessagesRef.current = false;
    }
  }, [profileId]);

  // Polling + visibility + focus
  useEffect(() => {
    if (!profileId) return;

    const raf = window.requestAnimationFrame(() => {
      void fetchNotifications();
      void fetchMessages();
    });

    const notifsInterval = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void fetchNotifications();
    }, NOTIFICATIONS_INTERVAL_MS);

    const msgsInterval = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void fetchMessages();
    }, MESSAGES_INTERVAL_MS);

    const handleFocusRefresh = () => {
      if (document.visibilityState === "visible") {
        void fetchNotifications();
        void fetchMessages();
      }
    };
    window.addEventListener("focus", handleFocusRefresh);
    document.addEventListener("visibilitychange", handleFocusRefresh);

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearInterval(notifsInterval);
      window.clearInterval(msgsInterval);
      window.removeEventListener("focus", handleFocusRefresh);
      document.removeEventListener("visibilitychange", handleFocusRefresh);
    };
  }, [profileId, fetchNotifications, fetchMessages]);

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

  // Realtime: messages (depends on messageTeamId)
  useEffect(() => {
    if (!profileId || !messageTeamId) return;

    const channel = supabase
      .channel(`messages:badge:${profileId}:${messageTeamId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "team_messages",
          filter: `team_id=eq.${messageTeamId}`,
        },
        () => void fetchMessages(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "team_message_reads",
          filter: `user_id=eq.${profileId}`,
        },
        () => void fetchMessages(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [profileId, messageTeamId, supabase, fetchMessages]);

  // Patch listener (optimistic updates from other parts of the app)
  useEffect(() => {
    const unsubscribe = subscribeToUnreadCountPatch((detail: UnreadCountPatch) => {
      if (typeof detail.notifications === "number") {
        setUnreadNotifications(Math.max(0, detail.notifications));
      }
      if (typeof detail.messages === "number") {
        setUnreadMessages(Math.max(0, detail.messages));
      }
    });
    return unsubscribe;
  }, []);

  // Sync PWA badge
  useEffect(() => {
    void syncAppBadge(unreadNotifications + unreadMessages);
  }, [unreadNotifications, unreadMessages]);

  const value = useMemo(
    () => ({ unreadNotifications, unreadMessages }),
    [unreadNotifications, unreadMessages],
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
