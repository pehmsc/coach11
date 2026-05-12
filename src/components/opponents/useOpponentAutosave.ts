"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OpponentUpdate } from "@/lib/validations/opponent";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

interface UseOpponentAutosaveOptions {
  ageGroupId: string;
  opponentId: string;
  debounceMs?: number;
  onSaved?: (next: Record<string, unknown>) => void;
  onError?: (err: string) => void;
}

export function useOpponentAutosave({
  ageGroupId,
  opponentId,
  debounceMs = 1000,
  onSaved,
  onError,
}: UseOpponentAutosaveOptions) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const pendingRef = useRef<Partial<OpponentUpdate>>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    const payload = pendingRef.current;
    pendingRef.current = {};
    if (Object.keys(payload).length === 0) return;

    setStatus("saving");
    setErrorMessage(null);
    try {
      const res = await fetch(
        `/api/age-groups/${ageGroupId}/opponents/${opponentId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.success) {
        const msg = body?.error || "Erro ao guardar.";
        setStatus("error");
        setErrorMessage(msg);
        onError?.(msg);
        return;
      }
      setStatus("saved");
      onSaved?.(payload);
      // Reset to idle after 2s of inactivity
      setTimeout(() => {
        setStatus((s) => (s === "saved" ? "idle" : s));
      }, 2000);
    } catch {
      setStatus("error");
      setErrorMessage("Erro de ligacao.");
      onError?.("Erro de ligacao.");
    }
  }, [ageGroupId, opponentId, onSaved, onError]);

  const schedule = useCallback(
    (patch: Partial<OpponentUpdate>) => {
      pendingRef.current = { ...pendingRef.current, ...patch };
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        void flush();
      }, debounceMs);
    },
    [debounceMs, flush],
  );

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        void flush();
      }
    };
  }, [flush]);

  return { status, errorMessage, schedule, flush };
}
