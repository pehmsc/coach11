"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { extractTimeFromDateTime } from "@/lib/events/time";
import { toast } from "sonner";
import type { Game } from "@/types/database";
import type { GameCompetitionOption } from "@/components/games/game-form-fields";
import {
  isValidManualShortName,
  normalizeManualShortName,
} from "@/lib/football/short-name";
import type { OpponentSelectionValue } from "@/components/opponents/OpponentTypeahead";

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
  const [editOpponentSelection, setEditOpponentSelection] =
    useState<OpponentSelectionValue | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editStartTime, setEditStartTime] = useState("00:00");
  const [editEndTime, setEditEndTime] = useState("");
  const [editConcentrationTime, setEditConcentrationTime] = useState("");
  const [editLocation, setEditLocation] = useState("");
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
  // Ficha pós-jogo (Sprint 3)
  const [editTacticalSystem, setEditTacticalSystem] = useState<string>("");
  const [editPositiveAspects, setEditPositiveAspects] = useState<string>("");
  const [editNegativeAspects, setEditNegativeAspects] = useState<string>("");
  const [editAspectsToImprove, setEditAspectsToImprove] = useState<string>("");
  const [editTeamNotes, setEditTeamNotes] = useState<string>("");
  const [editCoachNotes, setEditCoachNotes] = useState<string>("");
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
  // Cross-age picker (PR N): modal alterna entre "club" (atleta de outro
  // escalão do mesmo clube) e "free_text" (externo sem registo). Default
  // "club" porque e o caso mais comum num clube com multiplos escaloes.
  const [externalPlayerMode, setExternalPlayerMode] = useState<
    "club" | "free_text"
  >("club");
  const [crossAgeSelectedAgeGroupId, setCrossAgeSelectedAgeGroupId] = useState<
    string | null
  >(null);
  const [crossAgeSearchQuery, setCrossAgeSearchQuery] = useState("");
  const [crossAgeSelectedPlayerIds, setCrossAgeSelectedPlayerIds] = useState<
    Set<string>
  >(() => new Set());

  function openEditGame() {
    if (!game) return;
    // game.game_datetime e wall-clock literal "YYYY-MM-DDTHH:MM:SS" — extrair
    // partes por slice em vez de parseISO (que aplicaria fuso do runtime).
    const dt = game.game_datetime?.trim() ?? "";
    const datePart = /^(\d{4}-\d{2}-\d{2})/.exec(dt)?.[1] ?? "";
    const timePart = extractTimeFromDateTime(dt) ?? "00:00";
    setEditTitle(game.title ?? "");
    setEditOpponent(game.opponent_name ?? "");
    setEditOpponentShortName(
      normalizeManualShortName(game.opponent_short_name, 5) || "",
    );
    if (game.opponent_id) {
      setEditOpponentSelection({
        id: game.opponent_id,
        name: game.opponent_name ?? "",
        short_name: game.opponent_short_name ?? null,
        logo_url: null,
        tactical_formation: null,
      });
    } else {
      setEditOpponentSelection(null);
    }
    setEditDate(datePart);
    setEditStartTime(timePart);
    setEditEndTime(game.end_time?.slice(0, 5) ?? "");
    setEditConcentrationTime(game.concentration_time?.slice(0, 5) ?? "");
    setEditLocation(game.location ?? "");
    setEditFormattedAddress(game.formatted_address ?? "");
    setEditLatitude(game.latitude ?? null);
    setEditLongitude(game.longitude ?? null);
    setEditOsmPlaceId(game.osm_place_id ?? "");
    setEditLocationSource(game.location_source ?? null);
    setEditNotes(game.notes ?? "");
    setEditImageUrl(game.image_url ?? "");
    setEditCompetitionId(game.competition_id ?? "");
    setEditIsHome(game.is_home ?? true);
    setEditTacticalSystem(game.tactical_system ?? "");
    setEditPositiveAspects(game.positive_aspects ?? "");
    setEditNegativeAspects(game.negative_aspects ?? "");
    setEditAspectsToImprove(game.aspects_to_improve ?? "");
    setEditTeamNotes(game.team_notes ?? "");
    setEditCoachNotes(game.coach_notes ?? "");
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

    // game_datetime e timestamp WITHOUT time zone (hora local PT) — gravar
    // a wall-clock literal sem converter para UTC. Ver src/lib/events/time.ts.
    const gameDatetime = `${editDate}T${editStartTime}:00`;

    const res = await fetch(`/api/games/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: editTitle.trim() || null,
        game_datetime: gameDatetime,
        end_time: editEndTime || null,
        concentration_time: editConcentrationTime || null,
        opponent_id: editOpponentSelection?.id ?? null,
        opponent_name: editOpponent.trim(),
        opponent_short_name: normalizedOpponentShortName || null,
        location: editLocation.trim() || null,
        formatted_address: editFormattedAddress.trim() || null,
        latitude: editLatitude,
        longitude: editLongitude,
        osm_place_id: editOsmPlaceId.trim() || null,
        location_source: editLocationSource,
        notes: editNotes.trim() || null,
        image_url: editImageUrl.trim() || null,
        competition_id: editCompetitionId || null,
        is_home: editIsHome,
        tactical_system: editTacticalSystem.trim() || null,
        positive_aspects: editPositiveAspects.trim() || null,
        negative_aspects: editNegativeAspects.trim() || null,
        aspects_to_improve: editAspectsToImprove.trim() || null,
        team_notes: editTeamNotes.trim() || null,
        coach_notes: editCoachNotes.trim() || null,
      }),
    });
    const payload = (await res.json().catch(() => ({}))) as
      | { game?: Game; error?: string; details?: unknown }
      | Record<string, never>;

    if (!res.ok || !payload?.game) {
      setError(payload?.error || "Erro ao guardar jogo.");
    } else {
      setGame((prev) => (prev ? { ...prev, ...payload.game } : prev));
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
        // setError nao mostra UI no detail page com game presente (so
        // mostra full-page quando game === null). Usar toast.error para
        // feedback visivel imediato, alinhado com o toast.success ja
        // existente neste handler.
        const message =
          (payload as { error?: string })?.error || "Erro ao apagar jogo.";
        toast.error(message);
        return;
      }

      toast.success("Jogo apagado com sucesso.");
      router.replace("/games");
      router.refresh();
    } catch {
      toast.error("Erro de ligação ao apagar jogo.");
    } finally {
      setDeletingGame(false);
      setShowDeleteConfirm(false);
    }
  }

  function resetExternalPlayerForm() {
    setExternalPlayerName("");
    setExternalPlayerNumber("");
    setExternalPlayerPosition("");
    // Reset estado cross-age (default: modo "club")
    setExternalPlayerMode("club");
    setCrossAgeSelectedAgeGroupId(null);
    setCrossAgeSearchQuery("");
    setCrossAgeSelectedPlayerIds(new Set());
  }

  function closeExternalPlayerModal() {
    if (savingExternalPlayer) return;
    setShowExternalPlayerModal(false);
    resetExternalPlayerForm();
  }

  function setEditOpponentFromTypeahead(
    opponent: OpponentSelectionValue | null,
  ) {
    setEditOpponentSelection(opponent);
    if (opponent) {
      setEditOpponent(opponent.name);
      setEditOpponentShortName(
        normalizeManualShortName(opponent.short_name ?? null, 5) || "",
      );
    } else {
      setEditOpponent("");
      setEditOpponentShortName("");
    }
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
    editOpponentSelection,
    setEditOpponentFromTypeahead,
    editDate,
    setEditDate,
    editStartTime,
    setEditStartTime,
    editEndTime,
    setEditEndTime,
    editConcentrationTime,
    setEditConcentrationTime,
    editLocation,
    setEditLocation,
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
    editTacticalSystem,
    setEditTacticalSystem,
    editPositiveAspects,
    setEditPositiveAspects,
    editNegativeAspects,
    setEditNegativeAspects,
    editAspectsToImprove,
    setEditAspectsToImprove,
    editTeamNotes,
    setEditTeamNotes,
    editCoachNotes,
    setEditCoachNotes,
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
    // Cross-age picker (PR N)
    externalPlayerMode,
    setExternalPlayerMode,
    crossAgeSelectedAgeGroupId,
    setCrossAgeSelectedAgeGroupId,
    crossAgeSearchQuery,
    setCrossAgeSearchQuery,
    crossAgeSelectedPlayerIds,
    setCrossAgeSelectedPlayerIds,
  };
}

export type GameEditorState = ReturnType<typeof useGameEditor>;
