"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import type {
  ClockState,
  MatchPhase,
} from "@/components/games/live/types";
import {
  computeClockSecondsAt,
  isRunningPhase,
  persistClock,
  clampToValidMatchMinute,
} from "@/components/games/live/utils";

interface UseLiveClockArgs {
  id: string;
  phase: MatchPhase;
}

export interface UseLiveClockReturn {
  // State
  clockState: ClockState;
  nowMs: number;
  clockHydrated: boolean;
  // Computed
  clockSeconds: number;
  currentMinute: number;
  // Actions
  pauseClock: () => void;
  startClock: () => void;
  adjustClockBySeconds: (deltaSeconds: number) => void;
  setClockMinute: (targetMinute: number) => void;
  // Setters (para uso pelo orchestrator durante loadData; encapsulado em PR Z6)
  setClockState: Dispatch<SetStateAction<ClockState>>;
  setNowMs: Dispatch<SetStateAction<number>>;
  setClockHydrated: Dispatch<SetStateAction<boolean>>;
  // Marca que o backend checkpoint table não existe (caller chama isto se
  // o /live/checkpoint endpoint devolver `missingTable: true` durante o
  // load inicial).
  disableBackendCheckpoint: () => void;
}

export function useLiveClock({ id, phase }: UseLiveClockArgs): UseLiveClockReturn {
  const [clockState, setClockState] = useState<ClockState>({
    baseSeconds: 0,
    runningSinceMs: null,
  });
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [clockHydrated, setClockHydrated] = useState(false);

  const checkpointBackendEnabledRef = useRef(true);
  const lastCheckpointFingerprintRef = useRef<string | null>(null);

  const clockSeconds = useMemo(
    () => computeClockSecondsAt(clockState, nowMs),
    [clockState, nowMs],
  );
  const elapsedMinutes = Math.floor(clockSeconds / 60);
  const currentMinute = elapsedMinutes + 1;

  const pauseClock = useCallback(() => {
    const now = Date.now();
    setNowMs(now);
    setClockState((prev) => {
      if (!prev.runningSinceMs) return prev;
      const extra = Math.max(0, Math.floor((now - prev.runningSinceMs) / 1000));
      return {
        baseSeconds: prev.baseSeconds + extra,
        runningSinceMs: null,
      };
    });
  }, []);

  const startClock = useCallback(() => {
    const now = Date.now();
    setNowMs(now);
    setClockState((prev) => {
      if (prev.runningSinceMs) return prev;
      return {
        baseSeconds: prev.baseSeconds,
        runningSinceMs: now,
      };
    });
  }, []);

  const adjustClockBySeconds = useCallback((deltaSeconds: number) => {
    const now = Date.now();
    setNowMs(now);
    setClockState((prev) => {
      const current = computeClockSecondsAt(prev, now);
      const next = Math.max(0, current + deltaSeconds);
      return {
        baseSeconds: next,
        runningSinceMs: prev.runningSinceMs ? now : null,
      };
    });
  }, []);

  const setClockMinute = useCallback((targetMinute: number) => {
    const clamped = clampToValidMatchMinute(targetMinute);
    if (clamped === null) return;
    const now = Date.now();
    setNowMs(now);
    setClockState((prev) => {
      // currentMinute = floor(seconds / 60) + 1 → seconds = (minute - 1) * 60
      const targetSeconds = Math.max(0, (clamped - 1) * 60);
      return {
        baseSeconds: targetSeconds,
        runningSinceMs: prev.runningSinceMs ? now : null,
      };
    });
  }, []);

  const disableBackendCheckpoint = useCallback(() => {
    checkpointBackendEnabledRef.current = false;
  }, []);

  const persistCheckpointToBackend = useCallback(
    async (
      snapshot: { phase: MatchPhase; baseSeconds: number; runningSinceMs: number | null },
      options?: { keepalive?: boolean },
    ) => {
      if (!checkpointBackendEnabledRef.current) return;
      try {
        const res = await fetch(`/api/games/${id}/live/checkpoint`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(snapshot),
          cache: "no-store",
          keepalive: options?.keepalive,
        });
        const payload = await res.json().catch(() => null);
        if (payload?.missingTable === true) {
          checkpointBackendEnabledRef.current = false;
        }
      } catch {
        // Ignore transient backend failures. Local checkpoint stays active.
      }
    },
    [id],
  );

  useEffect(() => {
    if (!isRunningPhase(phase) || !clockState.runningSinceMs) return;
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [phase, clockState.runningSinceMs]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncNow = () => setNowMs(Date.now());
    const onVisibility = () => {
      if (!document.hidden) syncNow();
    };

    window.addEventListener("focus", syncNow);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("focus", syncNow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    if (!clockHydrated) return;
    persistClock(id, {
      version: 1,
      phase,
      baseSeconds: clockState.baseSeconds,
      runningSinceMs: clockState.runningSinceMs,
      savedAt: Date.now(),
    });
  }, [id, phase, clockState.baseSeconds, clockState.runningSinceMs, clockHydrated]);

  useEffect(() => {
    if (!clockHydrated || !checkpointBackendEnabledRef.current) return;
    const fingerprint = `${phase}|${clockState.baseSeconds}|${clockState.runningSinceMs ?? "null"}`;
    if (lastCheckpointFingerprintRef.current === fingerprint) return;
    lastCheckpointFingerprintRef.current = fingerprint;
    void persistCheckpointToBackend({
      phase,
      baseSeconds: clockState.baseSeconds,
      runningSinceMs: clockState.runningSinceMs,
    });
  }, [
    phase,
    clockState.baseSeconds,
    clockState.runningSinceMs,
    clockHydrated,
    persistCheckpointToBackend,
  ]);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !clockHydrated ||
      !checkpointBackendEnabledRef.current
    ) {
      return;
    }

    const flushOnPageHide = () => {
      void persistCheckpointToBackend(
        {
          phase,
          baseSeconds: clockState.baseSeconds,
          runningSinceMs: clockState.runningSinceMs,
        },
        { keepalive: true },
      );
    };

    window.addEventListener("pagehide", flushOnPageHide);
    return () => window.removeEventListener("pagehide", flushOnPageHide);
  }, [
    phase,
    clockState.baseSeconds,
    clockState.runningSinceMs,
    clockHydrated,
    persistCheckpointToBackend,
  ]);

  return {
    clockState,
    nowMs,
    clockHydrated,
    clockSeconds,
    currentMinute,
    pauseClock,
    startClock,
    adjustClockBySeconds,
    setClockMinute,
    setClockState,
    setNowMs,
    setClockHydrated,
    disableBackendCheckpoint,
  };
}
