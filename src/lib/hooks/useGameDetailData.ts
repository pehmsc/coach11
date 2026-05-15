"use client";

import { useEffect, useRef, useState } from "react";
import type { Game } from "@/types/database";
import {
  EMPTY_KIT_SELECTION,
  type KitPieceRow,
  type KitSelection,
  type PlayerWithStatus,
} from "@/components/games/detail/types";

export function useGameDetailData(id: string, correctionMode: boolean) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [confirmingConvocation, setConfirmingConvocation] = useState(false);
  const [convocationStatus, setConvocationStatus] = useState<
    "draft" | "published"
  >("draft");
  const [isEditingConfirmedConvocation, setIsEditingConfirmedConvocation] =
    useState(false);
  const [now, setNow] = useState(() => new Date());
  const [game, setGame] = useState<Game | null>(null);
  const [players, setPlayers] = useState<PlayerWithStatus[]>([]);
  const [teamKits, setTeamKits] = useState<KitPieceRow[]>([]);
  const [kitSelection, setKitSelection] =
    useState<KitSelection>(EMPTY_KIT_SELECTION);
  const [kitDraftSelection, setKitDraftSelection] =
    useState<KitSelection>(EMPTY_KIT_SELECTION);
  const [kitEditorOpen, setKitEditorOpen] = useState(false);
  const [savingKitSelection, setSavingKitSelection] = useState(false);
  const [footballFormat, setFootballFormat] = useState<string | null>(null);
  const [tacticalSystem, setTacticalSystem] = useState<string | null>(null);
  const [lineupStatuses, setLineupStatuses] = useState<
    Record<string, "on_field" | "substitute">
  >({});
  const [canEditCompleted, setCanEditCompleted] = useState(false);
  const [livePhase, setLivePhase] = useState<
    "first_half" | "second_half" | null
  >(null);
  const [savingTactical, setSavingTactical] = useState(false);
  const [savingLineupPlayer, setSavingLineupPlayer] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [correctionReason, setCorrectionReason] = useState("");
  const confirmConvocationLockRef = useRef(false);

  useEffect(() => {
    if (id) loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, correctionMode]);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(interval);
  }, []);

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/games/${id}/convocation`, {
        cache: "no-store",
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok || !payload?.game) {
        setGame(null);
        setPlayers([]);
        setTeamKits([]);
        setKitSelection(EMPTY_KIT_SELECTION);
        setConvocationStatus("draft");
        setIsEditingConfirmedConvocation(false);
        setLivePhase(null);
        setCanEditCompleted(false);
        setError(payload?.error || "Erro ao carregar jogo.");
        return;
      }

      const coordinatorCanEdit = payload?.isCoordinator === true;
      setCanEditCompleted(coordinatorCanEdit);

      const loadedGame = payload.game as Game;
      setGame(loadedGame);

      setConvocationStatus(
        payload.convocationStatus === "published" ? "published" : "draft",
      );
      setIsEditingConfirmedConvocation(false);

      const sortedPlayers = (
        Array.isArray(payload.players) ? [...payload.players] : []
      ).sort(
        (a: PlayerWithStatus, b: PlayerWithStatus) =>
          a.first_name.localeCompare(b.first_name, "pt", {
            sensitivity: "base",
          }) ||
          a.last_name.localeCompare(b.last_name, "pt", { sensitivity: "base" }),
      );
      setPlayers(sortedPlayers as PlayerWithStatus[]);
      setTeamKits(
        (Array.isArray(payload.kits) ? payload.kits : []) as KitPieceRow[],
      );
      const loadedKitSelection: KitSelection = {
        ...EMPTY_KIT_SELECTION,
        ...(typeof payload.kitSelection === "object" && payload.kitSelection
          ? (payload.kitSelection as Partial<KitSelection>)
          : {}),
      };
      setKitSelection(loadedKitSelection);
      setKitDraftSelection(loadedKitSelection);
      setKitEditorOpen(false);
      setFootballFormat(
        typeof payload.footballFormat === "string"
          ? payload.footballFormat
          : null,
      );
      setTacticalSystem(
        typeof payload.tacticalSystem === "string"
          ? payload.tacticalSystem
          : null,
      );
      const rawLineup =
        typeof payload.lineupStatuses === "object" && payload.lineupStatuses
          ? (payload.lineupStatuses as Record<string, string>)
          : {};
      const normalizedLineup: Record<string, "on_field" | "substitute"> = {};
      for (const [pid, status] of Object.entries(rawLineup)) {
        if (status === "on_field" || status === "substitute") {
          normalizedLineup[pid] = status;
        }
      }
      setLineupStatuses(normalizedLineup);
      const checkpointPhase =
        typeof payload?.liveCheckpoint?.phase === "string"
          ? payload.liveCheckpoint.phase
          : null;
      if (
        checkpointPhase === "first_half" ||
        checkpointPhase === "second_half"
      ) {
        setLivePhase(checkpointPhase);
      } else {
        setLivePhase(null);
      }
    } catch {
      setGame(null);
      setPlayers([]);
      setTeamKits([]);
      setKitSelection(EMPTY_KIT_SELECTION);
      setConvocationStatus("draft");
      setIsEditingConfirmedConvocation(false);
      setLivePhase(null);
      setCanEditCompleted(false);
      setError("Erro de ligação ao carregar jogo.");
    } finally {
      setLoading(false);
    }
  }

  function getCorrectionReasonForRequest() {
    if (game?.status !== "completed") return null;

    const normalizedReason = correctionReason.trim();
    if (!normalizedReason) {
      setError("Indica o motivo da correção antes de editar a convocatória.");
      return null;
    }

    return normalizedReason;
  }

  function buildConvocationPayload(base: Record<string, unknown>) {
    const normalizedReason = getCorrectionReasonForRequest();
    if (game?.status === "completed" && !normalizedReason) {
      return null;
    }

    return normalizedReason
      ? { ...base, correctionReason: normalizedReason }
      : base;
  }

  function markConvocationDirty() {
    setConvocationStatus("draft");
    setIsEditingConfirmedConvocation(false);
  }

  return {
    loading,
    saving,
    setSaving,
    confirmingConvocation,
    setConfirmingConvocation,
    convocationStatus,
    setConvocationStatus,
    isEditingConfirmedConvocation,
    setIsEditingConfirmedConvocation,
    now,
    game,
    setGame,
    players,
    setPlayers,
    teamKits,
    kitSelection,
    setKitSelection,
    kitDraftSelection,
    setKitDraftSelection,
    kitEditorOpen,
    setKitEditorOpen,
    savingKitSelection,
    setSavingKitSelection,
    footballFormat,
    tacticalSystem,
    setTacticalSystem,
    lineupStatuses,
    setLineupStatuses,
    canEditCompleted,
    livePhase,
    savingTactical,
    setSavingTactical,
    savingLineupPlayer,
    setSavingLineupPlayer,
    error,
    setError,
    correctionReason,
    setCorrectionReason,
    confirmConvocationLockRef,
    buildConvocationPayload,
    markConvocationDirty,
  };
}
