"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { differenceInMinutes, format, parseISO, subMinutes } from "date-fns";
import { pt } from "date-fns/locale";
import { AlertCircle } from "lucide-react";
import { StickyBackLink } from "@/components/navigation/StickyBackLink";
import { resolveLocationLabel } from "@/lib/location";
import { getConvocationEditorState } from "@/lib/games/convocation-editor";
import { LocationMapPreview } from "@/components/maps/LocationMapPreview";
import { Skeleton } from "@/components/ui/skeleton";
import { useGameDetailData } from "@/lib/hooks/useGameDetailData";
import { useGameConvocation } from "@/lib/hooks/useGameConvocation";
import { useKitEditor } from "@/lib/hooks/useKitEditor";
import { useGameEditor } from "@/lib/hooks/useGameEditor";
import { GameHeader } from "@/components/games/detail/GameHeader";
import { GameEditModal } from "@/components/games/detail/GameEditModal";
import { ExternalPlayerModal } from "@/components/games/detail/ExternalPlayerModal";
import { DeleteGameModal } from "@/components/games/detail/DeleteGameModal";
import { KitEditorSection } from "@/components/games/detail/KitEditorSection";
import { ConvocationSection } from "@/components/games/detail/ConvocationSection";
import { CorrectionBanner } from "@/components/games/detail/CorrectionBanner";
import { LiveButtonSection } from "@/components/games/detail/LiveButtonSection";
import { CompletedResult } from "@/components/games/detail/CompletedResult";
import { ConfirmConvocationBar } from "@/components/games/detail/ConfirmConvocationBar";

export default function GameDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const correctionMode = searchParams.get("correction") === "1";

  const data = useGameDetailData(id, correctionMode);
  const {
    loading, saving, confirmingConvocation, convocationStatus,
    isEditingConfirmedConvocation, setIsEditingConfirmedConvocation,
    now, game, players, teamKits,
    kitSelection, setKitSelection, kitDraftSelection, setKitDraftSelection,
    kitEditorOpen, setKitEditorOpen, savingKitSelection, setSavingKitSelection,
    footballFormat, tacticalSystem, lineupStatuses,
    canEditCompleted, livePhase, savingTactical, savingLineupPlayer,
    error, setError, correctionReason, setCorrectionReason,
    buildConvocationPayload, markConvocationDirty,
  } = data;

  const convocation = useGameConvocation({
    id, game, players, setPlayers: data.setPlayers,
    lineupStatuses, setLineupStatuses: data.setLineupStatuses,
    footballFormat, saving, setSaving: data.setSaving,
    savingLineupPlayer, setSavingLineupPlayer: data.setSavingLineupPlayer,
    setSavingTactical: data.setSavingTactical, tacticalSystem,
    setTacticalSystem: data.setTacticalSystem, confirmingConvocation,
    setConfirmingConvocation: data.setConfirmingConvocation,
    setConvocationStatus: data.setConvocationStatus,
    setIsEditingConfirmedConvocation, setError,
    confirmConvocationLockRef: data.confirmConvocationLockRef,
    buildConvocationPayload, markConvocationDirty,
  });

  const kit = useKitEditor({
    id, teamKits, kitSelection, setKitSelection,
    kitDraftSelection, setKitDraftSelection,
    kitEditorOpen, setKitEditorOpen,
    savingKitSelection, setSavingKitSelection,
    setError, buildConvocationPayload,
  });

  const editor = useGameEditor({
    id, game, setGame: data.setGame, canEditCompleted, setError,
  });

  const convocatedCount = players.filter((p) => p.isConvocated).length;

  if (loading) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-10 w-full rounded-xl" />
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (error && !game) {
    return (
      <div className="p-4 md:p-8 text-center py-16">
        <AlertCircle size={40} className="text-red-400 mx-auto mb-3" />
        <p className="text-slate-700 font-semibold">{error}</p>
        <div className="mt-4 flex justify-center">
          <StickyBackLink
            href="/games"
            label="Voltar aos jogos"
            sticky={false}
            wrapperClassName="bg-transparent px-0 py-0"
          />
        </div>
      </div>
    );
  }

  if (!game) return null;

  const gameDate = game.game_datetime
    ? format(parseISO(game.game_datetime), "EEEE, d 'de' MMMM · HH:mm", { locale: pt })
    : "—";
  const isCompetition = !!game.competition_id;
  const gameDateTime = game.game_datetime ? parseISO(game.game_datetime) : null;
  const liveUnlockAt = gameDateTime ? subMinutes(gameDateTime, 10) : null;
  const canStartLive = !liveUnlockAt || now >= liveUnlockAt;
  const isLiveInProgress = livePhase === "first_half" || livePhase === "second_half";
  const minutesUntilLive = liveUnlockAt ? Math.max(0, differenceInMinutes(liveUnlockAt, now)) : 0;

  const ces = getConvocationEditorState({
    gameStatus: game.status, convocationStatus,
    isEditingConfirmed: isEditingConfirmedConvocation, canEditCompleted,
    correctionMode, correctionReason,
    hasPlayers: convocatedCount > 0, confirming: confirmingConvocation,
  });
  const canEditConvocationContent = ces.canEditContent && !isLiveInProgress;
  const canEditKit = ces.baseEditable && !isLiveInProgress;
  const canConfirmConvocation = ces.canConfirm && !isLiveInProgress;
  const gameLocationLabel = resolveLocationLabel(game.location, game.formatted_address, game.location_address);

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto">
      <StickyBackLink
        href="/games"
        label="Voltar aos jogos"
        wrapperClassName="-mx-4 mb-4 bg-slate-50/95 px-4 py-2 md:-mx-8 md:px-8"
      />

      <GameHeader
        game={game}
        gameDate={gameDate}
        gameLocationLabel={gameLocationLabel}
        canEditCompleted={canEditCompleted}
        onEdit={editor.openEditGame}
        onDelete={() => editor.setShowDeleteConfirm(true)}
      />

      {(game.location || game.location_address || game.formatted_address ||
        (game.latitude != null && game.longitude != null)) && (
        <LocationMapPreview
          location={game.location}
          locationAddress={game.location_address}
          formattedAddress={game.formatted_address}
          latitude={game.latitude}
          longitude={game.longitude}
          accent="blue"
          label="Localização do jogo"
          resolveFallback
          showDirectionsButton={false}
          className="mb-5"
        />
      )}

      {game.status === "completed" && correctionMode && canEditCompleted && (
        <CorrectionBanner
          gameId={id}
          correctionReason={correctionReason}
          setCorrectionReason={setCorrectionReason}
        />
      )}

      {editor.editingGame && <GameEditModal game={game} error={error} editor={editor} />}

      {editor.showExternalPlayerModal && (
        <ExternalPlayerModal
          editor={editor}
          onSubmit={(e) =>
            void convocation.handleAddExternalPlayer(
              e, editor.externalPlayerName, editor.externalPlayerNumber,
              editor.externalPlayerPosition, editor.setSavingExternalPlayer,
              editor.setShowExternalPlayerModal, editor.resetExternalPlayerForm,
            )
          }
        />
      )}

      {editor.showDeleteConfirm && (
        <DeleteGameModal
          deletingGame={editor.deletingGame}
          onDelete={() => void editor.handleDeleteGame()}
          onClose={() => editor.setShowDeleteConfirm(false)}
        />
      )}

      {game.status !== "completed" && game.status !== "cancelled" && (
        <LiveButtonSection
          canStartLive={canStartLive}
          isLiveInProgress={isLiveInProgress}
          minutesUntilLive={minutesUntilLive}
          onNavigate={() => router.push(`/games/${id}/live`)}
        />
      )}

      {game.status === "completed" && (
        <CompletedResult game={game} onViewSummary={() => router.push(`/games/${id}/summary`)} />
      )}

      <KitEditorSection
        kitEditorOpen={kitEditorOpen}
        kitSelection={kitSelection}
        kitDraftSelection={kitDraftSelection}
        kitById={kit.kitById}
        savingKitSelection={savingKitSelection}
        hasKitDraftChanges={kit.hasKitDraftChanges}
        canEditKit={canEditKit}
        onOpenEditor={() => { setKitDraftSelection(kitSelection); setKitEditorOpen(true); }}
        onCloseEditor={kit.closeKitEditor}
        onDraftChange={kit.handleKitDraftChange}
        onSave={() => void kit.saveKitSelection()}
        getKitOptions={kit.getKitOptions}
      />

      <div className={!ces.isConfirmed ? "pb-28 md:pb-0" : ""}>
        <ConvocationSection
          players={players}
          lineupStatuses={lineupStatuses}
          footballFormat={footballFormat}
          tacticalSystem={tacticalSystem}
          saving={saving}
          savingLineupPlayer={savingLineupPlayer}
          savingTactical={savingTactical}
          convocatedCount={convocatedCount}
          effectiveConvocationStatus={ces.effectiveStatus}
          isEditingConfirmedConvocation={isEditingConfirmedConvocation}
          canEditConvocationContent={canEditConvocationContent}
          canReopenConfirmedConvocation={ces.canReopenConfirmed && !isLiveInProgress}
          convocationEditable={ces.baseEditable}
          isCompetition={isCompetition}
          error={error}
          onTogglePlayer={convocation.togglePlayer}
          onToggleLineup={(playerId) => void convocation.handleLineupToggle(playerId)}
          onTacticalChange={(f) => void convocation.handleTacticalChange(f)}
          onReopenConvocation={() => { setError(null); setIsEditingConfirmedConvocation(true); }}
          onShowExternalPlayerModal={() => editor.setShowExternalPlayerModal(true)}
        />

        {!ces.isConfirmed && (
          <ConfirmConvocationBar
            confirmingConvocation={confirmingConvocation}
            canConfirmConvocation={canConfirmConvocation}
            isCompleted={game.status === "completed"}
            onConfirm={convocation.handleConfirmConvocation}
          />
        )}
      </div>
    </div>
  );
}
