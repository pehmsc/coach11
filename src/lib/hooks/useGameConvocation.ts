"use client";

import { type MutableRefObject, useRef } from "react";
import { toast } from "sonner";
import type { Game } from "@/types/database";
import type { PlayerWithStatus } from "@/components/games/detail/types";

interface UseGameConvocationDeps {
  id: string;
  game: Game | null;
  players: PlayerWithStatus[];
  setPlayers: React.Dispatch<React.SetStateAction<PlayerWithStatus[]>>;
  lineupStatuses: Record<string, "on_field" | "substitute">;
  setLineupStatuses: React.Dispatch<
    React.SetStateAction<Record<string, "on_field" | "substitute">>
  >;
  footballFormat: string | null;
  saving: string | null;
  setSaving: React.Dispatch<React.SetStateAction<string | null>>;
  savingLineupPlayer: string | null;
  setSavingLineupPlayer: React.Dispatch<React.SetStateAction<string | null>>;
  setSavingTactical: React.Dispatch<React.SetStateAction<boolean>>;
  tacticalSystem: string | null;
  setTacticalSystem: React.Dispatch<React.SetStateAction<string | null>>;
  confirmingConvocation: boolean;
  setConfirmingConvocation: React.Dispatch<React.SetStateAction<boolean>>;
  setConvocationStatus: React.Dispatch<
    React.SetStateAction<"draft" | "confirmed" | "closed">
  >;
  setIsEditingConfirmedConvocation: React.Dispatch<
    React.SetStateAction<boolean>
  >;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  confirmConvocationLockRef: MutableRefObject<boolean>;
  buildConvocationPayload: (
    base: Record<string, unknown>,
  ) => Record<string, unknown> | null;
  markConvocationDirty: () => void;
}

export function useGameConvocation(deps: UseGameConvocationDeps) {
  const {
    id,
    game,
    players,
    setPlayers,
    lineupStatuses,
    setLineupStatuses,
    footballFormat,
    setSaving,
    setSavingLineupPlayer,
    setSavingTactical,
    tacticalSystem,
    setTacticalSystem,
    setConfirmingConvocation,
    setConvocationStatus,
    setIsEditingConfirmedConvocation,
    setError,
    confirmConvocationLockRef,
    buildConvocationPayload,
    markConvocationDirty,
  } = deps;

  // Ref mirrors lineupStatuses but updates synchronously within the same
  // event-loop tick. This prevents the stale-closure guard bug where two
  // rapid toggles (demote A + promote B) both read the pre-render snapshot
  // and the second toggle is wrongly blocked by the starters-limit guard.
  const lineupRef = useRef(lineupStatuses);
  lineupRef.current = lineupStatuses;

  async function handleTacticalChange(formation: string) {
    const previousFormation = tacticalSystem;
    const payload = buildConvocationPayload({ tacticalSystem: formation });
    if (!payload) {
      setTacticalSystem(previousFormation ?? null);
      return;
    }

    setSavingTactical(true);
    setError(null);
    setTacticalSystem(formation || null);

    try {
      const res = await fetch(`/api/games/${id}/convocation/tactical`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setTacticalSystem(previousFormation ?? null);
        setError(
          (payload as { error?: string })?.error ||
            "Erro ao guardar sistema táctico.",
        );
      }
    } catch {
      setTacticalSystem(previousFormation ?? null);
      setError("Erro de ligação ao guardar sistema táctico.");
    } finally {
      setSavingTactical(false);
    }
  }

  async function handleLineupToggle(playerId: string) {
    const targetPlayer = players.find((player) => player.id === playerId) ?? null;
    const isExternalPlayer = targetPlayer?.isExternal === true;
    const externalConvocationId = targetPlayer?.externalConvocationId ?? null;
    const current = lineupRef.current[playerId];
    const newStatus: "on_field" | "substitute" =
      current === "on_field" ? "substitute" : "on_field";

    // Guard: don't exceed the format's starter count.
    // Uses lineupRef (synchronously up-to-date) instead of lineupStatuses
    // (stale until next React render) to avoid blocking a valid swap when
    // the user demotes A then immediately promotes B.
    if (newStatus === "on_field" && footballFormat) {
      const format = parseInt(footballFormat);
      const currentStarters = Object.values(lineupRef.current).filter(
        (s) => s === "on_field",
      ).length;
      if (currentStarters >= format) {
        toast.error(`Futebol ${footballFormat} só tem ${format} titulares`);
        return;
      }
    }

    // Update ref synchronously so the next toggle (if clicked before React
    // re-renders) sees the correct count.
    lineupRef.current = { ...lineupRef.current, [playerId]: newStatus };

    setSavingLineupPlayer(playerId);
    setError(null);
    setLineupStatuses((prev) => ({ ...prev, [playerId]: newStatus }));

    function rollback() {
      const restored = current ?? "substitute";
      lineupRef.current = { ...lineupRef.current, [playerId]: restored };
      setLineupStatuses((prev) => ({ ...prev, [playerId]: restored }));
    }

    const payload = buildConvocationPayload({
      playerId,
      lineupStatus: newStatus,
    });
    if (!payload) {
      rollback();
      setSavingLineupPlayer(null);
      return;
    }

    if (isExternalPlayer && !externalConvocationId) {
      rollback();
      setSavingLineupPlayer(null);
      setError("Jogador externo inválido para atualizar lineup.");
      return;
    }

    try {
      const endpoint = isExternalPlayer
        ? `/api/games/${id}/convocation/external/lineup`
        : `/api/games/${id}/convocation/lineup`;
      const requestBody = isExternalPlayer
        ? {
            ...payload,
            externalConvocationId,
            playerId: undefined,
          }
        : payload;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      if (!res.ok) {
        const errPayload = await res.json().catch(() => ({}));
        rollback();
        setError(
          (errPayload as { error?: string })?.error || "Erro ao guardar lineup.",
        );
      } else {
        markConvocationDirty();
      }
    } catch {
      rollback();
      setError("Erro de ligação ao guardar lineup.");
    } finally {
      setSavingLineupPlayer(null);
    }
  }

  async function togglePlayer(player: PlayerWithStatus) {
    if (player.isBlocked) return;
    setSaving(player.id);
    setError(null);

    if (player.isExternal && player.externalConvocationId) {
      const payload = buildConvocationPayload({
        externalConvocationId: player.externalConvocationId,
      });
      if (!payload) {
        setSaving(null);
        return;
      }

      try {
        const res = await fetch(`/api/games/${id}/convocation/external/remove`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const responseBody = await res.json().catch(() => ({}));

        if (!res.ok || responseBody?.success !== true) {
          setError(
            responseBody?.error ||
              "Erro ao remover jogador externo da convocatória.",
          );
        } else {
          setPlayers((prev) => prev.filter((entry) => entry.id !== player.id));
          setLineupStatuses((prev) => {
            const next = { ...prev };
            delete next[player.id];
            return next;
          });
          markConvocationDirty();
        }
      } catch {
        setError("Erro de ligação ao remover jogador externo.");
      } finally {
        setSaving(null);
      }

      return;
    }

    const payload = buildConvocationPayload({ playerId: player.id });
    if (!payload) {
      setSaving(null);
      return;
    }

    try {
      const res = await fetch(`/api/games/${id}/convocation/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const responseBody = await res.json().catch(() => ({}));

      if (!res.ok || typeof responseBody?.isConvocated !== "boolean") {
        setError(responseBody?.error || "Erro ao atualizar convocatória.");
      } else {
        markConvocationDirty();
        const newIsConvocated = responseBody.isConvocated as boolean;
        setPlayers((prev) =>
          prev.map((p) =>
            p.id === player.id ? { ...p, isConvocated: newIsConvocated } : p,
          ),
        );
        void autoAssignLineup(player.id, newIsConvocated);
      }
    } catch {
      setError("Erro de ligação ao atualizar convocatória.");
    } finally {
      setSaving(null);
    }
  }

  async function handleConfirmConvocation() {
    if (confirmConvocationLockRef.current) {
      return;
    }

    setConfirmingConvocation(true);
    confirmConvocationLockRef.current = true;
    setError(null);

    const payload = buildConvocationPayload({});
    if (!payload) {
      setConfirmingConvocation(false);
      confirmConvocationLockRef.current = false;
      return;
    }

    try {
      const res = await fetch(`/api/games/${id}/convocation/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const responseBody = await res.json().catch(() => ({}));

      if (!res.ok || responseBody?.status !== "confirmed") {
        setError(responseBody?.error || "Erro ao guardar convocatória.");
        return;
      }

      setConvocationStatus("confirmed");
      setIsEditingConfirmedConvocation(false);
      toast.success(
        game?.status === "completed"
          ? "Correção da convocatória guardada."
          : "Convocatória guardada.",
      );
    } catch {
      setError("Erro de ligação ao guardar convocatória.");
    } finally {
      setConfirmingConvocation(false);
      confirmConvocationLockRef.current = false;
    }
  }

  // Auto-assign lineup when player is convocated: fills starters up to format number
  async function autoAssignLineup(playerId: string, isConvocated: boolean) {
    if (!isConvocated) {
      // Remove from lineup — sync ref first
      const refCopy = { ...lineupRef.current };
      delete refCopy[playerId];
      lineupRef.current = refCopy;
      setLineupStatuses((prev) => {
        const next = { ...prev };
        delete next[playerId];
        return next;
      });
      const payload = buildConvocationPayload({
        playerId,
        lineupStatus: "substitute",
      });
      if (payload) {
        await fetch(`/api/games/${id}/convocation/lineup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }).catch(() => null);
      }
      return;
    }

    const format = footballFormat ? parseInt(footballFormat) : 0;
    const currentStarters = Object.values(lineupRef.current).filter(
      (s) => s === "on_field",
    ).length;
    const newStatus: "on_field" | "substitute" =
      currentStarters < format ? "on_field" : "substitute";

    lineupRef.current = { ...lineupRef.current, [playerId]: newStatus };
    setLineupStatuses((prev) => ({ ...prev, [playerId]: newStatus }));
    const nextPayload = buildConvocationPayload({ playerId, lineupStatus: newStatus });
    if (nextPayload) {
      await fetch(`/api/games/${id}/convocation/lineup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextPayload),
      }).catch(() => null);
    }
  }

  async function handleAddExternalPlayer(
    e: { preventDefault(): void },
    externalPlayerName: string,
    externalPlayerNumber: string,
    externalPlayerPosition: string,
    setSavingExternalPlayer: React.Dispatch<React.SetStateAction<boolean>>,
    setShowExternalPlayerModal: React.Dispatch<React.SetStateAction<boolean>>,
    resetExternalPlayerForm: () => void,
  ) {
    e.preventDefault();
    setSavingExternalPlayer(true);
    setError(null);

    const numberValue = Number(externalPlayerNumber);
    if (!Number.isInteger(numberValue) || numberValue < 0 || numberValue > 99) {
      setError("O número do jogador deve ser um inteiro entre 0 e 99.");
      setSavingExternalPlayer(false);
      return;
    }

    const payload = buildConvocationPayload({
      name: externalPlayerName.trim(),
      number: numberValue,
      position: externalPlayerPosition.trim(),
    });
    if (!payload) {
      setSavingExternalPlayer(false);
      return;
    }

    try {
      const res = await fetch(`/api/games/${id}/convocation/external`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const responseBody = await res.json().catch(() => ({}));

      if (!res.ok || !responseBody?.player?.id) {
        setError(
          responseBody?.error ||
            "Erro ao adicionar jogador externo à convocatória.",
        );
        setSavingExternalPlayer(false);
        return;
      }

      const externalPlayerId = `external:${responseBody.player.id}`;
      const insertedPlayer: PlayerWithStatus = {
        id: externalPlayerId,
        age_group_id: game?.age_group_id ?? "",
        first_name: String(responseBody.player.name || "Jogador externo"),
        last_name: "",
        preferred_position:
          typeof responseBody.player.position === "string"
            ? responseBody.player.position
            : undefined,
        jersey_number:
          typeof responseBody.player.jersey_number === "number"
            ? responseBody.player.jersey_number
            : undefined,
        status: "active",
        created_at:
          typeof responseBody.player.created_at === "string"
            ? responseBody.player.created_at
            : new Date().toISOString(),
        isConvocated: true,
        isBlocked: false,
        isExternal: true,
        externalConvocationId: responseBody.player.id,
        sameDayConflictLabel: null,
        sameDayInfoLabel: null,
      };

      setPlayers((prev) => [...prev, insertedPlayer]);
      setLineupStatuses((prev) => ({
        ...prev,
        [externalPlayerId]:
          responseBody.player.lineup_status === "on_field"
            ? "on_field"
            : "substitute",
      }));
      markConvocationDirty();
      setShowExternalPlayerModal(false);
      resetExternalPlayerForm();
    } catch {
      setError("Erro de ligação ao adicionar jogador externo.");
    } finally {
      setSavingExternalPlayer(false);
    }
  }

  return {
    handleTacticalChange,
    handleLineupToggle,
    togglePlayer,
    handleConfirmConvocation,
    handleAddExternalPlayer,
  };
}
