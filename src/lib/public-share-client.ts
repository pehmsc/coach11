const PUBLIC_SHARE_STORAGE_KEY = "coach11:public-share-urls";

type StoredPublicShareMap = Record<string, string>;

function readStoredMap(): StoredPublicShareMap {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(PUBLIC_SHARE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([key, value]) => typeof key === "string" && typeof value === "string",
      ),
    );
  } catch {
    return {};
  }
}

function writeStoredMap(next: StoredPublicShareMap) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(PUBLIC_SHARE_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage failures
  }
}

export function getStoredPublicShareUrl(ageGroupId: string) {
  return readStoredMap()[ageGroupId] || null;
}

export function rememberPublicShareUrl(ageGroupId: string, url: string) {
  const current = readStoredMap();
  current[ageGroupId] = url;
  writeStoredMap(current);
}

export function forgetPublicShareUrl(ageGroupId: string) {
  const current = readStoredMap();
  delete current[ageGroupId];
  writeStoredMap(current);
}
