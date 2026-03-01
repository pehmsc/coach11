export type UnreadCountPatch = {
  notifications?: number;
  messages?: number;
};

const UNREAD_COUNTS_EVENT = "coach11:unread-counts";

export function dispatchUnreadCountPatch(detail: UnreadCountPatch) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent<UnreadCountPatch>(UNREAD_COUNTS_EVENT, {
      detail,
    }),
  );
}

export function subscribeToUnreadCountPatch(
  callback: (detail: UnreadCountPatch) => void,
) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<UnreadCountPatch>;
    callback(customEvent.detail || {});
  };

  window.addEventListener(UNREAD_COUNTS_EVENT, handler as EventListener);
  return () => {
    window.removeEventListener(UNREAD_COUNTS_EVENT, handler as EventListener);
  };
}
