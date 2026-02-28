const WEB_PUSH_FEATURE_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_WEB_PUSH === "true";

export function isWebPushFeatureEnabled() {
  return WEB_PUSH_FEATURE_ENABLED;
}

export function isWebPushSupported() {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

export async function requestWebPushPermissionFromUserAction() {
  if (!WEB_PUSH_FEATURE_ENABLED) {
    return { granted: false as const, reason: "disabled" as const };
  }

  if (!isWebPushSupported()) {
    return { granted: false as const, reason: "unsupported" as const };
  }

  const permission = await Notification.requestPermission();
  return {
    granted: permission === "granted",
    reason: permission,
  };
}

export async function registerPushSubscriptionSkeleton() {
  if (!WEB_PUSH_FEATURE_ENABLED) {
    return { ok: false as const, reason: "disabled" as const };
  }

  if (!isWebPushSupported()) {
    return { ok: false as const, reason: "unsupported" as const };
  }

  throw new Error("WEB_PUSH_REGISTRATION_NOT_IMPLEMENTED");
}
