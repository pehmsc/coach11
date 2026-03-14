"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Download, RefreshCcw, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { dispatchUnreadCountPatch } from "@/lib/notifications/unread-sync";
import { Button } from "@/components/ui/button";
import { IOSInstallModal } from "@/components/pwa/IOSInstallModal";
import {
  isSessionExpiringSoon,
  waitForSessionPersistence,
} from "@/lib/supabase/browser-session";
import {
  consumeIOSInstallPromptAfterLogin,
  dismissIOSInstallPromptPermanently,
  isIOSInstallDismissed,
} from "@/lib/pwa/install-state";
import { cn } from "@/lib/utils";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
};

type PWAContextValue = {
  canInstall: boolean;
  isIOSInstallFlow: boolean;
  isInstalled: boolean;
  iosModalOpen: boolean;
  updateReady: boolean;
  promptInstall: () => Promise<void>;
  openIOSInstallModal: () => void;
  closeIOSInstallModal: () => void;
  dismissIOSInstallPermanently: () => void;
  applyServiceWorkerUpdate: () => void;
  dismissUpdatePrompt: () => void;
};

const PWAContext = createContext<PWAContextValue | null>(null);

function isStandaloneMode() {
  if (typeof window === "undefined") return false;

  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIOSDevice() {
  if (typeof window === "undefined") return false;

  const platform = window.navigator.platform || "";
  const userAgent = window.navigator.userAgent || "";
  const touchMac =
    platform === "MacIntel" && typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 1;

  return /iPad|iPhone|iPod/.test(platform) || /iPad|iPhone|iPod/.test(userAgent) || touchMac;
}

function isIOSSafari() {
  if (!isIOSDevice() || typeof window === "undefined") return false;

  const userAgent = window.navigator.userAgent || "";
  return /Safari/i.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(userAgent);
}

function canRegisterServiceWorker() {
  if (typeof window === "undefined") return false;
  if (process.env.NODE_ENV !== "production") return false;
  if (!("serviceWorker" in navigator)) return false;

  return (
    window.isSecureContext ||
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  );
}

function isPrivateAppPath(pathname: string | null) {
  if (!pathname) return false;

  return !(
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/invite" ||
    pathname.startsWith("/auth")
  );
}

function UpdateSnackbar({
  open,
  onDismiss,
  onUpdate,
}: {
  open: boolean;
  onDismiss: () => void;
  onUpdate: () => void;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-[calc(var(--mobile-footer-height)+env(safe-area-inset-bottom)+0.75rem)] z-[70] flex justify-center px-4 transition-all duration-200 md:bottom-auto md:left-auto md:right-4 md:top-4 md:inset-x-auto md:w-auto md:px-0",
        open ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
      )}
      aria-hidden={!open}
    >
      <div className={cn("flex w-full max-w-md items-center gap-3 rounded-2xl border border-slate-200 bg-white/98 px-4 py-3 shadow-2xl backdrop-blur", open ? "pointer-events-auto" : "pointer-events-none")}>
        <div className="flex size-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <RefreshCcw size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">Atualização disponível</p>
          <p className="text-xs text-slate-500">
            Existe uma nova versão da app pronta a aplicar.
          </p>
        </div>
        <Button size="sm" className="shrink-0" onClick={onUpdate}>
          Atualizar
        </Button>
        <button
          type="button"
          aria-label="Fechar aviso de atualização"
          className="text-slate-400 transition-colors hover:text-slate-700"
          onClick={onDismiss}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

export function PWAProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(() =>
    typeof window !== "undefined" ? isStandaloneMode() : false,
  );
  const [isIOSInstallFlow] = useState(() =>
    typeof window !== "undefined" ? isIOSSafari() && !isStandaloneMode() : false,
  );
  const [iosInstallDismissed, setIosInstallDismissed] = useState(() =>
    typeof window !== "undefined" ? isIOSInstallDismissed() : false,
  );
  const [iosModalOpen, setIosModalOpen] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const waitingWorkerRef = useRef<ServiceWorker | null>(null);

  useEffect(() => {
    const debugAuth = process.env.NODE_ENV !== "production";
    if (!debugAuth) return;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      console.info("[auth.debug] onAuthStateChange", {
        event,
        hasSession: !!session,
        userId: session?.user?.id || null,
        expiresAt: session?.expires_at || null,
      });
    });

    void supabase.auth.getSession().then(({ data: { session } }) => {
      console.info("[auth.debug] initial session", {
        hasSession: !!session,
        userId: session?.user?.id || null,
        expiresAt: session?.expires_at || null,
      });
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    async function ensureForegroundSession() {
      if (document.visibilityState !== "visible") return;

      const debugAuth = process.env.NODE_ENV !== "production";
      const session = await waitForSessionPersistence(supabase, {
        attempts: 2,
        delayMs: 60,
      });
      if (!session) {
        if (debugAuth) {
          console.warn("[auth.debug] no session on foreground", { pathname });
        }
        return;
      }

      if (!isSessionExpiringSoon(session)) {
        return;
      }

      const { data, error } = await supabase.auth.refreshSession();
      if (debugAuth) {
        console.info("[auth.debug] foreground refresh", {
          pathname,
          refreshed: !!data.session,
          error: error?.message || null,
        });
      }
    }

    document.addEventListener("visibilitychange", ensureForegroundSession);
    window.addEventListener("focus", ensureForegroundSession);

    return () => {
      document.removeEventListener("visibilitychange", ensureForegroundSession);
      window.removeEventListener("focus", ensureForegroundSession);
    };
  }, [pathname, supabase]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    function handleServiceWorkerMessage(event: MessageEvent) {
      const data = event.data as
        | { type?: string; badgeCount?: number; messageBadgeCount?: number }
        | undefined;
      if (data?.type !== "COACH11_PUSH_RECEIVED") return;

      if (typeof data.badgeCount === "number") {
        dispatchUnreadCountPatch({ notifications: data.badgeCount });
      }

      if (typeof data.messageBadgeCount === "number") {
        dispatchUnreadCountPatch({ messages: data.messageBadgeCount });
      }
    }

    navigator.serviceWorker.addEventListener("message", handleServiceWorkerMessage);
    return () => {
      navigator.serviceWorker.removeEventListener("message", handleServiceWorkerMessage);
    };
  }, []);

  useEffect(() => {
    if (!canRegisterServiceWorker()) return;

    let cancelled = false;
    let handleVisibilityChange: (() => void) | null = null;

    function markWaitingWorker(worker: ServiceWorker | null) {
      waitingWorkerRef.current = worker;
      setUpdateReady(!!worker);
    }

    function handleControllerChange() {
      waitingWorkerRef.current = null;
      setUpdateReady(false);
    }

    async function registerServiceWorker() {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });

        if (cancelled) return;

        if (registration.waiting) {
          markWaitingWorker(registration.waiting);
        }

        registration.addEventListener("updatefound", () => {
          const installingWorker = registration.installing;
          if (!installingWorker) return;

          installingWorker.addEventListener("statechange", () => {
            if (
              installingWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              markWaitingWorker(registration.waiting || installingWorker);
            }
          });
        });

        handleVisibilityChange = () => {
          if (document.visibilityState === "visible") {
            void registration.update().catch(() => null);
          }
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);
      } catch (error) {
        console.error("Erro ao registar service worker:", error);
      }
    }

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);
    void registerServiceWorker();

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        handleControllerChange,
      );
      if (handleVisibilityChange) {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
    };
  }, [supabase]);

  useEffect(() => {
    if (!isIOSInstallFlow || iosInstallDismissed || isInstalled) return;
    if (!isPrivateAppPath(pathname)) return;
    if (!consumeIOSInstallPromptAfterLogin()) return;

    const timeoutId = window.setTimeout(() => {
      setIosModalOpen(true);
    }, 350);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [iosInstallDismissed, isIOSInstallFlow, isInstalled, pathname]);

  useEffect(() => {
    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    }

    function handleAppInstalled() {
      setIsInstalled(true);
      setDeferredPrompt(null);
      setIosModalOpen(false);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice.catch(() => null);
      setDeferredPrompt(null);

      if (choice?.outcome === "accepted") {
        setIsInstalled(true);
      }
      return;
    }

    if (isIOSInstallFlow && !iosInstallDismissed) {
      setIosModalOpen(true);
    }
  }, [deferredPrompt, iosInstallDismissed, isIOSInstallFlow]);

  const dismissIOSInstallPermanently = useCallback(() => {
    dismissIOSInstallPromptPermanently();
    setIosInstallDismissed(true);
    setIosModalOpen(false);
  }, []);

  const applyServiceWorkerUpdate = useCallback(async () => {
    if (!canRegisterServiceWorker()) return;

    const registration = await navigator.serviceWorker.getRegistration("/");
    const waitingWorker = waitingWorkerRef.current || registration?.waiting || null;
    if (!waitingWorker) return;

    setUpdateReady(false);
    waitingWorkerRef.current = waitingWorker;

    await new Promise<void>((resolve) => {
      function handleControllerChange() {
        navigator.serviceWorker.removeEventListener(
          "controllerchange",
          handleControllerChange,
        );
        resolve();
      }

      navigator.serviceWorker.addEventListener(
        "controllerchange",
        handleControllerChange,
      );
      waitingWorker.postMessage({ type: "SKIP_WAITING" });
    });

    window.location.reload();
  }, []);

  const dismissUpdatePrompt = useCallback(() => {
    setUpdateReady(false);
  }, []);

  const openIOSInstallModal = useCallback(() => {
    setIosModalOpen(true);
  }, []);

  const closeIOSInstallModal = useCallback(() => {
    setIosModalOpen(false);
  }, []);

  const value = useMemo<PWAContextValue>(() => {
    const canInstall =
      !isInstalled &&
      (!!deferredPrompt || (isIOSInstallFlow && !iosInstallDismissed));

    return {
      canInstall,
      isIOSInstallFlow: isIOSInstallFlow && !iosInstallDismissed && !isInstalled,
      isInstalled,
      iosModalOpen,
      updateReady,
      promptInstall,
      openIOSInstallModal,
      closeIOSInstallModal,
      dismissIOSInstallPermanently,
      applyServiceWorkerUpdate,
      dismissUpdatePrompt,
    };
  }, [
    applyServiceWorkerUpdate,
    closeIOSInstallModal,
    deferredPrompt,
    dismissIOSInstallPermanently,
    dismissUpdatePrompt,
    iosInstallDismissed,
    iosModalOpen,
    isIOSInstallFlow,
    isInstalled,
    openIOSInstallModal,
    promptInstall,
    updateReady,
  ]);

  return (
    <PWAContext.Provider value={value}>
      {children}
      <IOSInstallModal />
      <UpdateSnackbar
        open={updateReady}
        onDismiss={value.dismissUpdatePrompt}
        onUpdate={value.applyServiceWorkerUpdate}
      />
    </PWAContext.Provider>
  );
}

export function usePWA() {
  const context = useContext(PWAContext);
  if (!context) {
    throw new Error("usePWA must be used within PWAProvider");
  }
  return context;
}

export function InstallPromptIcon() {
  return <Download size={16} />;
}
