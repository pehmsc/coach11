"use client";

import { useMemo } from "react";
import {
  type KitPieceRow,
  type KitSelection,
  type UI_PIECE_TYPES,
  samePieceType,
  samePlayerType,
  normalizePlayerTypeForKitKey,
  normalizePieceTypeForKitKey,
} from "@/components/games/detail/types";

interface UseKitEditorDeps {
  id: string;
  teamKits: KitPieceRow[];
  kitSelection: KitSelection;
  setKitSelection: React.Dispatch<React.SetStateAction<KitSelection>>;
  kitDraftSelection: KitSelection;
  setKitDraftSelection: React.Dispatch<React.SetStateAction<KitSelection>>;
  kitEditorOpen: boolean;
  setKitEditorOpen: React.Dispatch<React.SetStateAction<boolean>>;
  savingKitSelection: boolean;
  setSavingKitSelection: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  buildConvocationPayload: (
    base: Record<string, unknown>,
  ) => Record<string, unknown> | null;
}

export function useKitEditor(deps: UseKitEditorDeps) {
  const {
    id,
    teamKits,
    kitSelection,
    setKitSelection,
    kitDraftSelection,
    setKitDraftSelection,
    setKitEditorOpen,
    setSavingKitSelection,
    setError,
    buildConvocationPayload,
  } = deps;

  const kitById = useMemo(
    () => new Map(teamKits.map((piece) => [piece.id, piece])),
    [teamKits],
  );

  const hasKitDraftChanges = useMemo(
    () => JSON.stringify(kitDraftSelection) !== JSON.stringify(kitSelection),
    [kitDraftSelection, kitSelection],
  );

  function getKitOptions(
    playerType: "field" | "goalkeeper",
    pieceType: (typeof UI_PIECE_TYPES)[number],
    preferredId?: string | null,
  ) {
    const filtered = teamKits.filter(
      (piece) =>
        samePlayerType(piece.player_type, playerType) &&
        samePieceType(piece.piece_type, pieceType),
    );

    const seenIds = new Set<string>();
    const uniqueByKey = new Map<string, KitPieceRow>();

    for (const piece of filtered) {
      if (seenIds.has(piece.id)) continue;
      seenIds.add(piece.id);

      const key = `${normalizePlayerTypeForKitKey(piece.player_type)}:${normalizePieceTypeForKitKey(piece.piece_type)}:${piece.kit_number}`;
      const existing = uniqueByKey.get(key);

      if (!existing) {
        uniqueByKey.set(key, piece);
        continue;
      }

      // Se houver peças duplicadas para o mesmo kit/pedaço, prefere a já selecionada.
      const shouldPreferCurrent =
        typeof preferredId === "string" &&
        preferredId.length > 0 &&
        piece.id === preferredId &&
        existing.id !== preferredId;

      if (shouldPreferCurrent) {
        uniqueByKey.set(key, piece);
      }
    }

    return Array.from(uniqueByKey.values()).sort((a, b) => {
      if (a.kit_number !== b.kit_number) return a.kit_number - b.kit_number;
      return a.id.localeCompare(b.id);
    });
  }

  function handleKitDraftChange(field: keyof KitSelection, value: string) {
    const normalizedValue = value === "__none__" ? null : value;
    setKitDraftSelection((prev) => ({
      ...prev,
      [field]: normalizedValue,
    }));
  }

  function closeKitEditor() {
    setKitDraftSelection(kitSelection);
    setKitEditorOpen(false);
  }

  async function saveKitSelection() {
    const nextSelection = { ...kitDraftSelection };
    setSavingKitSelection(true);
    setError(null);

    try {
      const requestBody = buildConvocationPayload(nextSelection);
      if (!requestBody) {
        setSavingKitSelection(false);
        return;
      }

      const res = await fetch(`/api/games/${id}/convocation/kits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const responseBody = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(
          responseBody?.error || "Erro ao guardar equipamentos da convocatória.",
        );
        return;
      }

      const responseSelection =
        typeof responseBody?.kitSelection === "object" && responseBody.kitSelection
          ? (responseBody.kitSelection as Partial<KitSelection>)
          : null;

      const savedSelection: KitSelection = {
        ...nextSelection,
        ...(responseSelection || {}),
      };

      setKitSelection(savedSelection);
      setKitDraftSelection(savedSelection);
      setKitEditorOpen(false);
    } catch {
      setError("Erro de ligação ao guardar equipamentos da convocatória.");
    } finally {
      setSavingKitSelection(false);
    }
  }

  return {
    kitById,
    hasKitDraftChanges,
    getKitOptions,
    handleKitDraftChange,
    closeKitEditor,
    saveKitSelection,
  };
}
