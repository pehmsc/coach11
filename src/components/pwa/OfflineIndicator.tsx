"use client";

import { WifiOff, CloudUpload } from "lucide-react";
import {
  useOnlineStatus,
  usePendingSyncCount,
  useAutoReplayOnReconnect,
} from "@/lib/pwa/network-status";
import { cn } from "@/lib/utils";

/**
 * Floating indicator that shows:
 *  - When the device is offline (red banner)
 *  - When there are pending sync entries waiting to upload (amber badge)
 */
export function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  const pendingCount = usePendingSyncCount();
  useAutoReplayOnReconnect();

  const showOffline = !isOnline;
  const showPending = isOnline && pendingCount > 0;
  const visible = showOffline || showPending;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-hidden={!visible}
      className={cn(
        "pointer-events-none fixed left-1/2 top-[calc(env(safe-area-inset-top)+0.5rem)] z-[80] -translate-x-1/2 transition-all duration-300",
        visible
          ? "translate-y-0 opacity-100"
          : "-translate-y-4 opacity-0",
      )}
    >
      {showOffline && (
        <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-4 py-2 shadow-lg">
          <WifiOff size={16} className="shrink-0 text-red-600" />
          <span className="text-sm font-medium text-red-800">
            Sem ligação à internet
          </span>
          {pendingCount > 0 && (
            <span className="ml-1 inline-flex size-5 items-center justify-center rounded-full bg-red-600 text-[11px] font-bold text-white">
              {pendingCount > 99 ? "99+" : pendingCount}
            </span>
          )}
        </div>
      )}

      {showPending && (
        <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 shadow-lg">
          <CloudUpload size={16} className="shrink-0 animate-pulse text-amber-600" />
          <span className="text-sm font-medium text-amber-800">
            A sincronizar {pendingCount} {pendingCount === 1 ? "alteração" : "alterações"}…
          </span>
        </div>
      )}
    </div>
  );
}
