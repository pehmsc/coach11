type BadgeNavigator = Navigator & {
  clearAppBadge?: () => Promise<void>;
  setAppBadge?: (contents?: number) => Promise<void>;
};

function getBadgeNavigator(): BadgeNavigator | null {
  if (typeof window === "undefined") return null;
  return navigator as BadgeNavigator;
}

export function supportsAppBadges() {
  const badgeNavigator = getBadgeNavigator();
  return !!(badgeNavigator?.setAppBadge || badgeNavigator?.clearAppBadge);
}

export async function clearAppBadge() {
  const badgeNavigator = getBadgeNavigator();
  if (!badgeNavigator?.clearAppBadge) return;

  try {
    await badgeNavigator.clearAppBadge();
  } catch {
    // Ignore unsupported or transient platform failures.
  }
}

export async function setAppBadge(count: number) {
  const badgeNavigator = getBadgeNavigator();
  if (!badgeNavigator?.setAppBadge) return;

  if (!Number.isFinite(count) || count <= 0) {
    await clearAppBadge();
    return;
  }

  try {
    await badgeNavigator.setAppBadge(Math.max(0, Math.floor(count)));
  } catch {
    // Ignore unsupported or transient platform failures.
  }
}

export async function syncAppBadge(count: number) {
  if (!supportsAppBadges()) return;

  if (!Number.isFinite(count) || count <= 0) {
    await clearAppBadge();
    return;
  }

  await setAppBadge(count);
}

export const clearBadge = clearAppBadge;
export const setBadge = setAppBadge;
