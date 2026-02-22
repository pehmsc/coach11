"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow, parseISO } from "date-fns";
import { pt } from "date-fns/locale";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type NotificationItem = {
  id: string;
  type: "new_game" | "new_training" | "message";
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

const TYPE_LABELS: Record<NotificationItem["type"], string> = {
  new_game: "Novo jogo",
  new_training: "Novo treino",
  message: "Mensagem",
};

export default function NotificationsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  const [linked, setLinked] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/notifications?limit=80", { cache: "no-store" });
    const payload = (await res.json().catch(() => null)) as NotificationsResponse | null;

    if (!res.ok || !payload) {
      setError(payload?.error || "Erro ao carregar notificações.");
      setLoading(false);
      return;
    }

    if (payload.linked === false) {
      setLinked(false);
      setNotifications([]);
      setUnreadCount(0);
      setCurrentUserId(payload.currentUserId || null);
      setLoading(false);
      return;
    }

    setLinked(true);
    setError(null);
    setCurrentUserId(payload.currentUserId || null);
    setNotifications(Array.isArray(payload.notifications) ? payload.notifications : []);
    setUnreadCount(payload.unreadCount || 0);
    setLoading(false);
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
          table: "notifications",
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

  async function markNotificationRead(id: string) {
    await fetch(`/api/notifications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
    }).catch(() => null);
    setNotifications((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, read_at: item.read_at || new Date().toISOString() } : item,
      ),
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }

  async function handleMarkAllRead() {
    setMarkingAll(true);
    const res = await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_all_read" }),
    });
    if (res.ok) {
      setNotifications((prev) =>
        prev.map((item) => ({
          ...item,
          read_at: item.read_at || new Date().toISOString(),
        })),
      );
      setUnreadCount(0);
    }
    setMarkingAll(false);
  }

  async function handleOpenNotification(notification: NotificationItem) {
    if (!notification.read_at) {
      await markNotificationRead(notification.id);
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
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Bell size={16} className="text-slate-500" />
            Notificações
            {unreadCount > 0 ? (
              <span className="text-xs bg-red-500 text-white rounded-full px-2 py-0.5">
                {unreadCount}
              </span>
            ) : null}
          </CardTitle>
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
        </CardHeader>
        <CardContent className="space-y-2">
          {notifications.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">
              Não tens notificações.
            </p>
          ) : (
            notifications.map((notification) => (
              <button
                key={notification.id}
                onClick={() => void handleOpenNotification(notification)}
                className={`w-full text-left rounded-xl border p-3 transition-colors ${
                  notification.read_at
                    ? "border-slate-100 bg-white"
                    : "border-blue-200 bg-blue-50/60 hover:bg-blue-50"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">
                    {TYPE_LABELS[notification.type]}
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
            ))
          )}
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
