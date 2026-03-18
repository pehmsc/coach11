"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow, parseISO } from "date-fns";
import { pt } from "date-fns/locale";
import { Bell, CheckCheck, Loader2, Trash2, Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { dispatchUnreadCountPatch } from "@/lib/notifications/unread-sync";

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  created_at: string;
  read_at?: string | null;
  link_path?: string | null;
};

type NotificationsResponse = {
  success?: boolean;
  linked?: boolean;
  currentUserId?: string;
  unreadCount?: number;
  notifications?: NotificationItem[];
  error?: string;
};

const TYPE_LABELS: Record<string, string> = {
  new_game: "Novo jogo",
  new_training: "Novo treino",
  attendance_pending: "Presenças por marcar",
  attendance_closed: "Presenças fechadas",
  convocation_confirmed: "Convocatória confirmada",
  game_live_started: "Jogo em live",
};

function countUnread(items: NotificationItem[]) {
  return items.reduce((acc, item) => acc + (item.read_at ? 0 : 1), 0);
}

export default function NotificationsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [linked, setLinked] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const loadNotifications = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
    }
    try {
      const res = await fetch("/api/notifications?limit=80", { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as NotificationsResponse | null;

      if (!res.ok || !payload) {
        setError(payload?.error || "Erro ao carregar notificações.");
        return;
      }

      if (payload.linked === false) {
        setLinked(false);
        setNotifications([]);
        setUnreadCount(0);
        setCurrentUserId(payload.currentUserId || null);
        dispatchUnreadCountPatch({ notifications: 0 });
        return;
      }

      setLinked(true);
      setError(null);
      setCurrentUserId(payload.currentUserId || null);
      const nextNotifications = Array.isArray(payload.notifications) ? payload.notifications : [];
      setNotifications(nextNotifications);
      setUnreadCount(payload.unreadCount || 0);
      dispatchUnreadCountPatch({ notifications: payload.unreadCount || 0 });
    } catch {
      setError("Erro de ligação ao carregar notificações.");
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const raf = window.requestAnimationFrame(() => {
      void loadNotifications();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [loadNotifications]);

  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase
      .channel(`notifications:list:${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notification_recipients",
          filter: `user_id=eq.${currentUserId}`,
        },
        () => {
          void loadNotifications();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, loadNotifications, supabase]);

  async function updateNotificationReadState(id: string, markAsRead: boolean) {
    setUpdatingId(id);
    const previousNotifications = notifications;
    const nextNotifications = notifications.map((item) =>
      item.id === id
        ? {
            ...item,
            read_at: markAsRead ? item.read_at || new Date().toISOString() : null,
          }
        : item,
    );
    const unreadCounts = countUnread(nextNotifications);
    setNotifications(nextNotifications);
    setUnreadCount(unreadCounts);
    dispatchUnreadCountPatch({ notifications: unreadCounts });

    const res = await fetch(`/api/notifications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: markAsRead ? "mark_read" : "mark_unread" }),
    }).catch(() => null);

    if (!res?.ok) {
      const rollbackCounts = countUnread(previousNotifications);
      setNotifications(previousNotifications);
      setUnreadCount(rollbackCounts);
      dispatchUnreadCountPatch({ notifications: rollbackCounts });
    } else {
      void loadNotifications(false);
    }

    setUpdatingId(null);
  }

  async function deleteNotification(id: string) {
    setDeletingId(id);
    const previousNotifications = notifications;
    const nextNotifications = notifications.filter((item) => item.id !== id);
    const unreadCounts = countUnread(nextNotifications);
    setNotifications(nextNotifications);
    setUnreadCount(unreadCounts);
    dispatchUnreadCountPatch({ notifications: unreadCounts });

    const res = await fetch(`/api/notifications/${id}`, {
      method: "DELETE",
    }).catch(() => null);

    if (!res?.ok) {
      const rollbackCounts = countUnread(previousNotifications);
      setNotifications(previousNotifications);
      setUnreadCount(rollbackCounts);
      dispatchUnreadCountPatch({ notifications: rollbackCounts });
    } else {
      void loadNotifications(false);
    }
    setDeletingId(null);
  }

  async function handleMarkAllRead() {
    setMarkingAll(true);
    const previousNotifications = notifications;
    const nextNotifications = notifications.map((item) => ({
      ...item,
      read_at: item.read_at || new Date().toISOString(),
    }));
    setNotifications(nextNotifications);
    setUnreadCount(0);
    dispatchUnreadCountPatch({ notifications: 0 });

    const res = await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_all_read" }),
    });
    if (!res.ok) {
      const rollbackCounts = countUnread(previousNotifications);
      setNotifications(previousNotifications);
      setUnreadCount(rollbackCounts);
      dispatchUnreadCountPatch({ notifications: rollbackCounts });
    } else {
      void loadNotifications(false);
    }
    setMarkingAll(false);
  }

  async function handleMarkAllUnread() {
    setMarkingAll(true);
    const previousNotifications = notifications;
    const nextNotifications = notifications.map((item) => ({
      ...item,
      read_at: null,
    }));
    const unreadCounts = countUnread(nextNotifications);
    setNotifications(nextNotifications);
    setUnreadCount(unreadCounts);
    dispatchUnreadCountPatch({ notifications: unreadCounts });

    const res = await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_all_unread" }),
    });
    if (!res.ok) {
      const rollbackCounts = countUnread(previousNotifications);
      setNotifications(previousNotifications);
      setUnreadCount(rollbackCounts);
      dispatchUnreadCountPatch({ notifications: rollbackCounts });
    } else {
      void loadNotifications(false);
    }
    setMarkingAll(false);
  }

  async function handleClearAll() {
    setClearingAll(true);
    const previousNotifications = notifications;
    setNotifications([]);
    setUnreadCount(0);
    dispatchUnreadCountPatch({ notifications: 0 });

    const res = await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete_all" }),
    });
    if (!res.ok) {
      const rollbackCounts = countUnread(previousNotifications);
      setNotifications(previousNotifications);
      setUnreadCount(rollbackCounts);
      dispatchUnreadCountPatch({ notifications: rollbackCounts });
    } else {
      void loadNotifications(false);
    }
    setClearingAll(false);
  }

  async function handleOpenNotification(notification: NotificationItem) {
    if (!notification.read_at) {
      await updateNotificationReadState(notification.id, true);
    }
    if (notification.link_path) {
      router.push(notification.link_path);
    }
  }

  if (loading) {
    return (
      <div className="p-4 md:p-8 max-w-3xl mx-auto">
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="animate-spin text-slate-400" />
        </div>
      </div>
    );
  }

  if (!linked) {
    return (
      <div className="p-4 md:p-8 max-w-3xl mx-auto">
        <Card>
          <CardContent className="py-12 text-center">
            <Bell size={40} className="mx-auto text-slate-300 mb-3" />
            <p className="font-semibold text-slate-700">Sem equipa associada</p>
            <p className="text-sm text-slate-500 mt-1">
              Liga-te a um escalão para receber notificações.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-4">
      <Card>
        <CardHeader className="pb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Bell size={16} className="text-slate-500" />
            Notificações
            {unreadCount > 0 ? (
              <span className="text-xs bg-red-500 text-white rounded-full px-2 py-0.5">
                {unreadCount}
              </span>
            ) : null}
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleMarkAllRead()}
              disabled={markingAll || unreadCount === 0}
            >
              {markingAll ? (
                <Loader2 size={14} className="animate-spin mr-1" />
              ) : (
                <CheckCheck size={14} className="mr-1" />
              )}
              Marcar todas como lidas
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleMarkAllUnread()}
              disabled={markingAll || notifications.length === 0}
            >
              <EyeOff size={14} className="mr-1" />
              Marcar todas não lidas
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleClearAll()}
              disabled={clearingAll || notifications.length === 0}
              className="border-red-200 text-red-600 hover:bg-red-50"
            >
              {clearingAll ? (
                <Loader2 size={14} className="animate-spin mr-1" />
              ) : (
                <Trash2 size={14} className="mr-1" />
              )}
              Limpar tudo
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {notifications.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">
              Não tens notificações.
            </p>
          ) : (
            notifications.map((notification) => (
              <div
                key={notification.id}
                className={`w-full text-left rounded-xl border p-3 transition-colors ${
                  notification.read_at
                    ? "border-slate-100 bg-white"
                    : "border-blue-200 bg-blue-50/60 hover:bg-blue-50"
                }`}
              >
                <button
                  onClick={() => void handleOpenNotification(notification)}
                  className="w-full text-left"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">
                      {TYPE_LABELS[notification.type] || "Notificação"}
                    </p>
                    {!notification.read_at ? (
                      <span className="text-[10px] text-blue-700 font-semibold">
                        Nova
                      </span>
                    ) : null}
                  </div>
                  <p className="text-sm font-semibold text-slate-800 mt-0.5">
                    {notification.title}
                  </p>
                  {notification.body ? (
                    <p className="text-xs text-slate-600 mt-0.5">{notification.body}</p>
                  ) : null}
                  <p className="text-[11px] text-slate-400 mt-1.5">
                    {formatDistanceToNow(parseISO(notification.created_at), {
                      locale: pt,
                      addSuffix: true,
                    })}
                  </p>
                </button>
                <div className="flex items-center gap-2 mt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={updatingId === notification.id}
                    onClick={() =>
                      void updateNotificationReadState(
                        notification.id,
                        !notification.read_at,
                      )
                    }
                  >
                    {updatingId === notification.id ? (
                      <Loader2 size={12} className="animate-spin mr-1" />
                    ) : notification.read_at ? (
                      <EyeOff size={12} className="mr-1" />
                    ) : (
                      <Eye size={12} className="mr-1" />
                    )}
                    {notification.read_at ? "Não lida" : "Marcar lida"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs border-red-200 text-red-600 hover:bg-red-50"
                    disabled={deletingId === notification.id}
                    onClick={() => void deleteNotification(notification.id)}
                  >
                    {deletingId === notification.id ? (
                      <Loader2 size={12} className="animate-spin mr-1" />
                    ) : (
                      <Trash2 size={12} className="mr-1" />
                    )}
                    Limpar
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
