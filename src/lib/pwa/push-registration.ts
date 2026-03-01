const WEB_PUSH_FEATURE_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_WEB_PUSH === "true";
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || "";

type PushStatusResponse = {
  success?: boolean;
  enabled?: boolean;
  active?: boolean;
  activeCount?: number;
  code?: string;
  error?: string;
};

export type WebPushClientSupport = {
  featureFlagEnabled: boolean;
  hasVapidPublicKey: boolean;
  secureContext: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  isIOSLike: boolean;
  isStandalone: boolean;
  requiresIOSInstall: boolean;
  browserSupported: boolean;
  canSubscribe: boolean;
};

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawData = window.atob(base64);

  return Uint8Array.from(rawData, (char) => char.charCodeAt(0));
}

function detectPushPlatform() {
  if (typeof window === "undefined") return "web";

  const userAgent = window.navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "web";
}

function isStandaloneMode() {
  if (typeof window === "undefined") return false;

  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIOSLikeDevice() {
  if (typeof window === "undefined") return false;

  const platform = window.navigator.platform || "";
  const userAgent = window.navigator.userAgent || "";
  const touchMac =
    platform === "MacIntel" &&
    typeof window.navigator.maxTouchPoints === "number" &&
    window.navigator.maxTouchPoints > 1;

  return /iPad|iPhone|iPod/i.test(platform) || /iPad|iPhone|iPod/i.test(userAgent) || touchMac;
}

function serializeSubscription(subscription: PushSubscription) {
  const json = subscription.toJSON();

  return {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: json.keys?.p256dh || "",
      auth: json.keys?.auth || "",
    },
  };
}

export function isWebPushFeatureEnabled() {
  return WEB_PUSH_FEATURE_ENABLED && VAPID_PUBLIC_KEY.length > 0;
}

export function isWebPushSupported() {
  return getWebPushClientSupport().browserSupported;
}

export function getWebPushClientSupport(): WebPushClientSupport {
  if (typeof window === "undefined") {
    return {
      featureFlagEnabled: WEB_PUSH_FEATURE_ENABLED,
      hasVapidPublicKey: VAPID_PUBLIC_KEY.length > 0,
      secureContext: false,
      hasServiceWorker: false,
      hasPushManager: false,
      hasNotification: false,
      isIOSLike: false,
      isStandalone: false,
      requiresIOSInstall: false,
      browserSupported: false,
      canSubscribe: false,
    };
  }

  const secureContext =
    window.isSecureContext ||
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";
  const hasServiceWorker = "serviceWorker" in navigator;
  const hasPushManager = "PushManager" in window;
  const hasNotification = "Notification" in window;
  const isIOSLike = isIOSLikeDevice();
  const isStandalone = isStandaloneMode();
  const requiresIOSInstall = isIOSLike && !isStandalone;
  const browserSupported =
    secureContext &&
    hasServiceWorker &&
    hasPushManager &&
    hasNotification;
  const canSubscribe =
    WEB_PUSH_FEATURE_ENABLED &&
    VAPID_PUBLIC_KEY.length > 0 &&
    browserSupported &&
    !requiresIOSInstall;

  return {
    featureFlagEnabled: WEB_PUSH_FEATURE_ENABLED,
    hasVapidPublicKey: VAPID_PUBLIC_KEY.length > 0,
    secureContext,
    hasServiceWorker,
    hasPushManager,
    hasNotification,
    isIOSLike,
    isStandalone,
    requiresIOSInstall,
    browserSupported,
    canSubscribe,
  };
}

export async function requestWebPushPermissionFromUserAction() {
  const support = getWebPushClientSupport();

  if (!support.featureFlagEnabled || !support.hasVapidPublicKey) {
    return { granted: false as const, reason: "disabled" as const };
  }

  if (support.requiresIOSInstall) {
    return { granted: false as const, reason: "ios_install_required" as const };
  }

  if (!support.browserSupported) {
    return { granted: false as const, reason: "unsupported" as const };
  }

  const permission = await Notification.requestPermission();
  return {
    granted: permission === "granted",
    reason: permission,
  };
}

export async function getWebPushStatus() {
  const res = await fetch("/api/push/status", {
    cache: "no-store",
  });
  const payload = (await res.json().catch(() => null)) as PushStatusResponse | null;

  if (!res.ok || !payload?.success) {
    return {
      ok: false as const,
      error: payload?.error || "Erro ao carregar estado das notificações push.",
    };
  }

  return {
    ok: true as const,
    enabled: payload.enabled === true,
    active: payload.active === true,
    activeCount: payload.activeCount || 0,
  };
}

export async function registerPushSubscriptionFromUserAction() {
  const support = getWebPushClientSupport();

  if (!support.featureFlagEnabled || !support.hasVapidPublicKey) {
    return { ok: false as const, reason: "disabled" as const };
  }

  if (support.requiresIOSInstall) {
    return { ok: false as const, reason: "ios_install_required" as const };
  }

  if (!support.browserSupported) {
    return { ok: false as const, reason: "unsupported" as const };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false as const, reason: permission };
  }

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      subscription: serializeSubscription(subscription),
      platform: detectPushPlatform(),
      userAgent: navigator.userAgent || "",
    }),
  });

  const payload = (await res.json().catch(() => null)) as
    | { success?: boolean; error?: string; active?: boolean; activeCount?: number }
    | null;

  if (!res.ok || !payload?.success) {
    return {
      ok: false as const,
      reason: payload?.error || "subscribe_failed",
    };
  }

  return {
    ok: true as const,
    endpoint: subscription.endpoint,
    active: payload.active === true,
    activeCount: payload.activeCount || 0,
  };
}

export async function unregisterPushSubscriptionFromUserAction() {
  if (!isWebPushSupported()) {
    return { ok: false as const, reason: "unsupported" as const };
  }

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  const endpoint = subscription?.endpoint || "";

  if (subscription) {
    await subscription.unsubscribe().catch(() => false);
  }

  if (!endpoint) {
    return { ok: true as const, endpoint: null };
  }

  const res = await fetch("/api/push/unsubscribe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ endpoint }),
  });
  const payload = (await res.json().catch(() => null)) as
    | { success?: boolean; error?: string; active?: boolean; activeCount?: number }
    | null;

  if (!res.ok || !payload?.success) {
    return {
      ok: false as const,
      reason: payload?.error || "unsubscribe_failed",
    };
  }

  return {
    ok: true as const,
    endpoint,
    active: payload.active === true,
    activeCount: payload.activeCount || 0,
  };
}
