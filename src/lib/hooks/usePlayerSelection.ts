"use client";

import { useEffect, useMemo, useState } from "react";
import type { Player } from "@/types/database";
import type { Tab } from "@/components/statistics/types";

export function usePlayerSelection(
  players: Player[],
  activeTab: Tab,
  sortedAttendanceIds: string[],
  sortedGameStatsIds: string[],
) {
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const validIds = new Set(players.map((player) => player.id));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs selection with player list changes
    setSelectedPlayerIds((previous) => {
      const next = new Set(
        Array.from(previous).filter((playerId) => validIds.has(playerId)),
      );
      const unchanged =
        next.size === previous.size &&
        Array.from(next).every((playerId) => previous.has(playerId));
      if (unchanged) return previous;
      return next;
    });
  }, [players]);

  const currentTabPlayerIds = useMemo(
    () =>
      activeTab === "attendance"
        ? sortedAttendanceIds
        : sortedGameStatsIds,
    [activeTab, sortedAttendanceIds, sortedGameStatsIds],
  );

  const currentTabSelectedCount = useMemo(
    () =>
      currentTabPlayerIds.filter((playerId) => selectedPlayerIds.has(playerId)).length,
    [currentTabPlayerIds, selectedPlayerIds],
  );

  const allCurrentTabSelected =
    currentTabPlayerIds.length > 0 &&
    currentTabSelectedCount === currentTabPlayerIds.length;

  function toggleSelectedPlayer(playerId: string) {
    setSelectedPlayerIds((previous) => {
      const next = new Set(previous);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  }

  function toggleSelectAllCurrentTab() {
    setSelectedPlayerIds((previous) => {
      const next = new Set(previous);
      if (allCurrentTabSelected) {
        currentTabPlayerIds.forEach((playerId) => next.delete(playerId));
      } else {
        currentTabPlayerIds.forEach((playerId) => next.add(playerId));
      }
      return next;
    });
  }

  function clearSelectedPlayers() {
    setSelectedPlayerIds(new Set());
  }

  return {
    selectedPlayerIds,
    currentTabPlayerIds,
    allCurrentTabSelected,
    toggleSelectedPlayer,
    toggleSelectAllCurrentTab,
    clearSelectedPlayers,
  };
}
