"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import type { Game } from "@/types/database";
import type { GameCompetitionOption } from "@/components/games/game-form-fields";
import {
  isValidManualShortName,
  normalizeManualShortName,
} from "@/lib/football/short-name";

interface UseGameEditorDeps {
  id: string;
  game: Game | null;
  setGame: React.Dispatch<React.SetStateAction<Game | null>>;
  canEditCompleted: boolean;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
}

export function useGameEditor(deps: UseGameEditorDeps) {
  const { id, game, setGame, canEditCompleted, setError } = deps;
  const router = useRouter();

  // Game edit state
  const [editingGame, setEditingGame] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editOpponent, setEditOpponent] = useState("");
  const [editOpponentShortName, setEditOpponentShortName] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editStartTime, setEditStartTime] = useState("00:00");
  const [editEndTime, setEditEndTime] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editLocationAddress, setEditLocationAddress] = useState("");
  const [editFormattedAddress, setEditFormattedAddress] = useState("");
  const [editLatitude, setEditLatitude] = useState<number | null>(null);
  const [editLongitude, setEditLongitude] = useState<number | null>(null);
  const [editOsmPlaceId, setEditOsmPlaceId] = useState("");
  const [editLocationSource, setEditLocationSource] = useState<
    "google" | "osm" | "manual" | null
  >(null);
  const [editNotes, setEditNotes] = useState("");
  const [editImageUrl, setEditImageUrl] = useState("");
  const [editCompetitionId, setEditCompetitionId] = useState("");
  const [editIsHome, setEditIsHome] = useState(true);
  const [competitionOptions, setCompetitionOptions] = useState<GameCompetitionOption[]>([]);
  const [savingGameEdit, setSavingGameEdit] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/competitions").catch(() => null);
      if (!res?.ok) return;
      const payload = await res.json().catch(() => null) as {
        success?: boolean;
        competitions?: Array<{ id?: string; name?: string; season?: string | null; team_label?: string | null; is_active?: boolean }>;
      } | null;
      if (!payload?.success) return;
      setCompetitionOptions(
        (payload.competitions || [])
          .filter((c) => !!c.id)
          .map((c) => ({
            id: c.id as string,
            name: c.name || "Competição",
            season: c.season || null,
            team_label: c.team_label || null,
            inactive: c.is_active === false,
          })),
      );
    })();
  }, []);

  // Delete state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingGame, setDeletingGame] = useState(false);

  // External player state
  const [showExternalPlayerModal, setShowExternalPlayerModal] = useState(false);
  const [externalPlayerName, setExternalPlayerName] = useState("");
  const [externalPlayerNumber, setExternalPlayerNumber] = useState("");
  const [externalPlayerPosition, setExternalPlayerPosition] = useState("");
  const [savingExternalPlayer, setSavingExternalPlayer] = useState(false);

  function openEditGame() {
    if (!game) return;
    const parsedGameDate = game.game_datetime ? parseISO(game.game_datetime) : null;
    setEditTitle(game.title ?? "");
    setEditOpponent(game.opponent_name ?? "");
    setEditOpponentShortName(
      normalizeManualShortName(game.opponent_short_name, 5) || "",
    );
    setEditDate(parsedGameDate ? format(parsedGameDate, "yyyy-MM-dd") : "");
    setEditStartTime(parsedGameDate ? format(parsedGameDate, "HH:mm") : "00:00");
    setEditEndTime(game.end_time?.slice(0, 5) ?? "");
    setEditLocation(game.location ?? "");
    setEditLocationAddress(game.location_address ?? "");
    setEditFormattedAddress(game.formatted_address ?? "");
    setEditLatitude(game.latitude ?? null);
    setEditLongitude(game.longitude ?? null);
    setEditOsmPlaceId(game.osm_place_id ?? "");
    setEditLocationSource(game.location_source ?? null);
    setEditNotes(game.notes ?? "");
    setEditImageUrl(game.image_url ?? "");
    setEditCompetitionId(game.competition_id ?? "");
    setEditIsHome(game.is_home ?? true);
    setEditingGame(true);
  }

  async function handleSaveGameEdit(e: { preventDefault(): void }) {
    e.preventDefault();
    setSavingGameEdit(true);
    setError(null);
    if (!editDate || !editStartTime) {
      setError("Preenche data e hora de início.");
      setSavingGameEdit(false);
      return;
    }
    if (!isValidManualShortName(editOpponentShortName, 2, 5)) {
      setError("A sigla do adversário deve ter entre 2 e 5 caracteres.");
      setSavingGameEdit(false);
      return;
    }
    const normalizedOpponentShortName = normalizeManualShortName(
      editOpponentShortName,
      5,
    );

    const res = await fetch("/api/calendar/events", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        type: "game",
        ageGroupId: game?.age_group_id ?? null,
        teamId: game?.team_id ?? null,
        payload: {
          title: editTitle.trim() || null,
          date: editDate,
          start_time: editStartTime,
          end_time: editEndTime || null,
          opponent_name: editOpponent.trim(),
          opponent_short_name: normalizedOpponentShortName || null,
          location: editLocation.trim() || null,
          location_address: editLocationAddress.trim() || null,
          formatted_address: editFormattedAddress.trim() || null,
          latitude: editLatitude,
          longitude: editLongitude,
          osm_place_id: editOsmPlaceId.trim() || null,
          location_source: editLocationSource,
          notes: editNotes.trim() || null,
          image_url: editImageUrl.trim() || null,
          competition_id: editCompetitionId || null,
          is_home: editIsHome,
        },
      }),
    });
    const payload = (await res.json().catch(() => ({}))) as
      | { event?: Game; error?: string }
      | Record<string, never>;

    if (!res.ok || !payload?.event) {
      setError(payload?.error || "Erro ao guardar jogo.");
    } else {
      setGame((prev) => (prev ? { ...prev, ...payload.event } : prev));
      setEditingGame(false);
      router.refresh();
    }
    setSavingGameEdit(false);
  }

  async function handleDeleteGame() {
    if (!game || !canEditCompleted) return;
    setDeletingGame(true);
    setError(null);

    try {
      const res = await fetch(`/api/games/${game.id}`, {
        method: "DELETE",
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok || !payload?.success) {
        setError(payload?.error || "Erro ao apagar jogo.");
        return;
      }

      toast.success("Jogo apagado com sucesso.");
      router.replace("/games");
      router.refresh();
    } catch {
      setError("Erro de ligação ao apagar jogo.");
    } finally {
      setDeletingGame(false);
      setShowDeleteConfirm(false);
    }
  }

  function resetExternalPlayerForm() {
    setExternalPlayerName("");
    setExternalPlayerNumber("");
    setExternalPlayerPosition("");
  }

  function closeExternalPlayerModal() {
    if (savingExternalPlayer) return;
    setShowExternalPlayerModal(false);
    resetExternalPlayerForm();
  }

  return {
    // Game edit
    editingGame,
    setEditingGame,
    editTitle,
    setEditTitle,
    editOpponent,
    setEditOpponent,
    editOpponentShortName,
    setEditOpponentShortName,
    editDate,
    setEditDate,
    editStartTime,
    setEditStartTime,
    editEndTime,
    setEditEndTime,
    editLocation,
    setEditLocation,
    editLocationAddress,
    setEditLocationAddress,
    editFormattedAddress,
    setEditFormattedAddress,
    editLatitude,
    setEditLatitude,
    editLongitude,
    setEditLongitude,
    editOsmPlaceId,
    setEditOsmPlaceId,
    editLocationSource,
    setEditLocationSource,
    editNotes,
    setEditNotes,
    editImageUrl,
    setEditImageUrl,
    editCompetitionId,
    setEditCompetitionId,
    editIsHome,
    setEditIsHome,
    competitionOptions,
    savingGameEdit,
    openEditGame,
    handleSaveGameEdit,
    // Delete
    showDeleteConfirm,
    setShowDeleteConfirm,
    deletingGame,
    handleDeleteGame,
    // External player
    showExternalPlayerModal,
    setShowExternalPlayerModal,
    externalPlayerName,
    setExternalPlayerName,
    externalPlayerNumber,
    setExternalPlayerNumber,
    externalPlayerPosition,
    setExternalPlayerPosition,
    savingExternalPlayer,
    setSavingExternalPlayer,
    closeExternalPlayerModal,
    resetExternalPlayerForm,
  };
}

export type GameEditorState = ReturnType<typeof useGameEditor>;
