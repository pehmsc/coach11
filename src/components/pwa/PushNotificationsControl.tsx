"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, Loader2, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePWA } from "@/components/pwa/PWAProvider";
import {
  getWebPushClientSupport,
  getWebPushStatus,
  isWebPushFeatureEnabled,
  isWebPushSupported,
  registerPushSubscriptionFromUserAction,
  unregisterPushSubscriptionFromUserAction,
} from "@/lib/pwa/push-registration";
import { cn } from "@/lib/utils";

type PushNotificationsControlProps = {
  compact?: boolean;
  className?: string;
};

function getNotificationPermission(): NotificationPermission | null {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return null;
  }

  return window.Notification.permission;
}

function isDeniedPermission() {
  return getNotificationPermission() === "denied";
}

export function PushNotificationsControl({
  compact = false,
  className,
}: PushNotificationsControlProps) {
  const { isIOSInstallFlow, isInstalled, openIOSInstallModal } = usePWA();
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [active, setActive] = useState(false);
  const [activeCount, setActiveCount] = useState(0);
  const [serverEnabled, setServerEnabled] = useState(false);

  const support = getWebPushClientSupport();
  const clientSupported = support.browserSupported && isWebPushSupported();
  const featureEnabled = support.featureFlagEnabled && support.hasVapidPublicKey && isWebPushFeatureEnabled();
  const needsIOSInstall = support.requiresIOSInstall || (isIOSInstallFlow && !isInstalled);
  const blockedByPermission = isDeniedPermission();

  const loadStatus = useCallback(async () => {
    setLoading(true);
    const result = await getWebPushStatus();
    if (!result.ok) {
      setServerEnabled(false);
      setActive(false);
      setActiveCount(0);
      setLoading(false);
      return;
    }

    setServerEnabled(result.enabled);
    setActive(result.active);
    setActiveCount(result.activeCount);
    setLoading(false);
  }, []);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      void loadStatus();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [loadStatus]);

  async function handleEnable() {
    if (needsIOSInstall) {
      openIOSInstallModal();
      return;
    }

    if (!clientSupported) {
      toast.error("Este dispositivo/browser não suporta Web Push.");
      return;
    }

    setWorking(true);
    const result = await registerPushSubscriptionFromUserAction().catch((error) => ({
      ok: false as const,
      reason: error instanceof Error ? error.message : "subscribe_failed",
    }));

    if (!result.ok) {
      if (result.reason === "denied") {
        toast.error("Permissão de notificações recusada.");
      } else if (result.reason === "ios_install_required") {
        openIOSInstallModal();
        toast.message("No iPhone, instala a app no ecrã principal para ativar notificações.");
      } else if (result.reason === "default") {
        toast.message("Permissão de notificações não concedida.");
      } else {
        toast.error(
          result.reason || "Não foi possível ativar notificações push.",
        );
      }
      setWorking(false);
      await loadStatus();
      return;
    }

    setServerEnabled(true);
    setActive(true);
    setActiveCount(result.activeCount || Math.max(activeCount, 1));
    toast.success("Notificações push ativadas.");
    setWorking(false);
    await loadStatus();
  }

  async function handleDisable() {
    setWorking(true);
    const result = await unregisterPushSubscriptionFromUserAction().catch((error) => ({
      ok: false as const,
      reason: error instanceof Error ? error.message : "unsubscribe_failed",
    }));

    if (!result.ok) {
      toast.error(
        result.reason || "Não foi possível desativar notificações push.",
      );
      setWorking(false);
      await loadStatus();
      return;
    }

    setActive(result.active === true);
    setActiveCount(result.activeCount || 0);
    toast.success("Notificações push desativadas.");
    setWorking(false);
    await loadStatus();
  }

  const disabledReason = !featureEnabled
    ? "Notificações push indisponíveis nesta versão da app."
    : needsIOSInstall
      ? "No iPhone, instala a app no ecrã principal para ativar Web Push."
      : !support.secureContext
        ? "As notificações push exigem HTTPS ou localhost."
        : !support.hasServiceWorker
          ? "Este browser não suporta service workers para Web Push."
          : !support.hasPushManager
            ? "Este browser não suporta Push API."
            : !support.hasNotification
              ? "Este browser não suporta notificações Web."
              : !clientSupported
                ? "Este browser não suporta Web Push."
                : blockedByPermission
                  ? "A permissão foi bloqueada no browser. Reativa-a nas definições do sistema/browser."
                  : support.isIOSLike
                    ? "Recebe alertas mesmo com a app fechada, depois de instalada."
                    : "Recebe alertas no Mac mesmo fora da app.";

  const debugChecks = process.env.NODE_ENV !== "production"
    ? [
        { label: "secureContext", ok: support.secureContext },
        { label: "serviceWorker", ok: support.hasServiceWorker },
        { label: "PushManager", ok: support.hasPushManager },
        { label: "Notification", ok: support.hasNotification },
        { label: "featureFlag", ok: support.featureFlagEnabled },
        { label: "vapidKey", ok: support.hasVapidPublicKey },
        { label: "standalone", ok: support.isStandalone },
        { label: "requiresIOSInstall", ok: !support.requiresIOSInstall },
      ]
    : [];

  if (compact) {
    return (
      <div className={cn("space-y-2", className)}>
        <Button
          type="button"
          variant="ghost"
          onClick={() => void (active ? handleDisable() : handleEnable())}
          disabled={working || loading || (!active && (blockedByPermission || !featureEnabled))}
          className="w-full justify-start rounded-xl px-3 py-3 text-left text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
        >
          {working ? (
            <Loader2 size={16} className="animate-spin" />
          ) : active ? (
            <Bell size={16} />
          ) : (
            <BellOff size={16} />
          )}
          <span className="flex-1">
            {active ? "Desativar notificações push" : "Ativar notificações push"}
          </span>
        </Button>
        <p className="px-3 text-[11px] text-slate-500">
          {loading ? "A verificar notificações push..." : disabledReason}
        </p>
        {debugChecks.length > 0 ? (
          <p className="px-3 text-[10px] text-slate-600">
            {debugChecks.map((entry) => `${entry.label}:${entry.ok ? "ok" : "fail"}`).join(" · ")}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Smartphone size={16} className="text-slate-500" />
          Web Push
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-900">
            {active ? "Notificações push ativas" : "Notificações push desligadas"}
          </p>
          <p className="mt-1 text-sm text-slate-500">{disabledReason}</p>
          <p className="mt-3 text-xs text-slate-500">
            Dispositivos ativos: <span className="font-semibold text-slate-700">{activeCount}</span>
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Estado do servidor:{" "}
            <span className="font-semibold text-slate-700">
              {serverEnabled ? "configurado" : "desligado"}
            </span>
          </p>
          {debugChecks.length > 0 ? (
            <div className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-[11px] text-slate-600">
              {debugChecks.map((entry) => `${entry.label}:${entry.ok ? "ok" : "fail"}`).join(" · ")}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => void (active ? handleDisable() : handleEnable())}
            disabled={working || loading || (!active && (blockedByPermission || !featureEnabled))}
            className={active ? "bg-slate-900 text-white hover:bg-slate-800" : ""}
          >
            {working ? <Loader2 size={16} className="animate-spin" /> : active ? <BellOff size={16} /> : <Bell size={16} />}
            {active ? "Desativar" : "Ativar notificações"}
          </Button>
          {needsIOSInstall ? (
            <Button
              type="button"
              variant="outline"
              onClick={openIOSInstallModal}
            >
              Ver passos iPhone
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
