"use client";

import { useParams } from "next/navigation";
import { LiveErrorState, LiveLoadingState, LiveLockedState } from "@/components/games/live/LiveScreenStates";
import { LiveScoreboardCard } from "@/components/games/live/LiveScoreboardCard";
import { StickyBackLink } from "@/components/navigation/StickyBackLink";
import { Breadcrumb } from "@/components/navigation/Breadcrumb";
import { useGameLiveController } from "@/lib/hooks/useGameLiveController";
import { useLiveGameState } from "@/lib/hooks/useLiveGameState";
import { useAgeGroupMeta } from "@/hooks/useAgeGroupName";
import { formatClock } from "@/components/games/live/utils";
import { PreMatchLineup } from "@/components/games/live/PreMatchLineup";
import { ClockControls } from "@/components/games/live/ClockControls";
import { EventButtons } from "@/components/games/live/EventButtons";
import { EventsLog } from "@/components/games/live/EventsLog";
import { ReviewPanel } from "@/components/games/live/ReviewPanel";
import { FinalizeSection } from "@/components/games/live/FinalizeSection";
import { EventModal } from "@/components/games/live/EventModal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export default function LiveGamePage() {
  const { id } = useParams<{ id: string }>();

  const state = useLiveGameState(id);
  const ageGroupMeta = useAgeGroupMeta(state.game?.age_group_id ?? null);

  const {
    liveUnlocked,
    matchMetaLabel,
    homeShortName,
    awayShortName,
    ourTeamShortName,
    opponentTeamShortName,
  } = useGameLiveController({
    game: state.game,
    now: new Date(state.nowMs),
    homeClubName: state.homeClubName,
    homeClubShortName: state.homeClubShortName,
  });

  // ── Loading / error states ──

  if (state.loading) {
    return <LiveLoadingState />;
  }

  if (state.error || !state.game) {
    return <LiveErrorState message={state.error || "Erro ao carregar jogo."} />;
  }

  if (state.game.status === "completed") {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto">
        <p className="text-sm text-slate-600">A redirecionar para o sumário do jogo...</p>
      </div>
    );
  }

  if (!state.isFinalized && !liveUnlocked) {
    return <LiveLockedState backHref={`/games/${id}`} />;
  }

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto pb-24">
      <StickyBackLink
        href={`/games/${id}`}
        label="Voltar ao jogo"
        wrapperClassName="-mx-4 mb-4 bg-slate-50/95 px-4 py-2 md:-mx-8 md:px-8"
      >
        <Breadcrumb
          items={[
            { label: "Jogos", href: "/games" },
            {
              label: state.game.opponent_name
                ? `vs ${state.game.opponent_name}`
                : "Jogo",
              href: `/games/${id}`,
            },
            { label: "Live" },
          ]}
        />
      </StickyBackLink>

      <LiveScoreboardCard
        matchMetaLabel={matchMetaLabel}
        homeShortName={homeShortName}
        awayShortName={awayShortName}
        scoreHome={state.score.home}
        scoreAway={state.score.away}
        clockSeconds={state.clockSeconds}
        currentMinute={state.currentMinute}
        isFinalized={state.isFinalized}
        formatClock={formatClock}
      />

      {/* ── PRE-MATCH: Lineup selection ── */}
      {state.phase === "pre_match" && state.convocatedPlayers.length > 0 && (
        <PreMatchLineup
          convocatedPlayers={state.convocatedPlayers}
          playersOnField={state.playersOnField}
          playersAvailableToEnter={state.playersAvailableToEnter}
          hasExternalConvocatedPlayers={state.hasExternalConvocatedPlayers}
          savingLineup={state.savingLineup}
          startingFirstHalf={state.startingFirstHalf}
          toggleLineup={state.toggleLineup}
        />
      )}

      {/* ── Clock + Phase controls ── */}
      {!state.isFinalized && (
        <ClockControls
          phase={state.phase}
          currentMinute={state.currentMinute}
          clockState={state.clockState}
          isLivePhase={state.isLivePhase}
          playersOnField={state.playersOnField}
          startingFirstHalf={state.startingFirstHalf}
          kickoffError={state.kickoffError}
          kickoffState={state.kickoffState}
          adjustClockBySeconds={state.adjustClockBySeconds}
          setClockMinute={state.setClockMinute}
          handleStartFirstHalf={state.handleStartFirstHalf}
          pauseClock={state.pauseClock}
          startClock={state.startClock}
          setPhase={state.setPhase}
        />
      )}

      {/* ── Event buttons ── */}
      {!state.isFinalized && (
        <EventButtons
          canRegisterEvents={state.canRegisterEvents}
          canRegisterSubstitutionOrCard={state.canRegisterSubstitutionOrCard}
          openModal={state.openModal}
        />
      )}

      {/* ── Events log ── */}
      <EventsLog
        displayEvents={state.displayEvents}
        convocatedPlayers={state.convocatedPlayers}
        isFinalized={state.isFinalized}
        deleteEvent={state.deleteEvent}
      />

      {/* ── REVIEW: Ratings + MVP ── */}
      {state.phase === "review" && (
        <ReviewPanel
          playersWhoNeedPersistentStats={state.playersWhoNeedPersistentStats}
          playerRatings={state.playerRatings}
          mvpPlayerId={state.mvpPlayerId}
          computedMinutes={state.computedMinutes}
          concededGoalsByPlayer={state.concededGoalsByPlayer}
          setPlayerRatings={state.setPlayerRatings}
          setMvpPlayerId={state.setMvpPlayerId}
          footballFormat={ageGroupMeta.football_format ?? null}
          liveTacticalSystem={state.liveTacticalSystem}
          livePositiveAspects={state.livePositiveAspects}
          liveNegativeAspects={state.liveNegativeAspects}
          liveAspectsToImprove={state.liveAspectsToImprove}
          liveTeamNotes={state.liveTeamNotes}
          liveCoachNotes={state.liveCoachNotes}
          setLiveTacticalSystem={state.setLiveTacticalSystem}
          setLivePositiveAspects={state.setLivePositiveAspects}
          setLiveNegativeAspects={state.setLiveNegativeAspects}
          setLiveAspectsToImprove={state.setLiveAspectsToImprove}
          setLiveTeamNotes={state.setLiveTeamNotes}
          setLiveCoachNotes={state.setLiveCoachNotes}
        />
      )}

      {/* ── Finalize / Export ── */}
      <FinalizeSection
        phase={state.phase}
        isFinalized={state.isFinalized}
        finalizing={state.finalizing}
        exportingPDF={state.exportingPDF}
        allRatingsFilled={state.allRatingsFilled}
        score={state.score}
        playersWhoNeedPersistentStats={state.playersWhoNeedPersistentStats}
        playerRatings={state.playerRatings}
        finalizeGame={state.finalizeGame}
        handleExportPDF={state.handleExportPDF}
      />

      {/* ── EVENT MODAL ── */}
      <EventModal
        modalType={state.modalType}
        goalTeamSide={state.goalTeamSide}
        goalKind={state.goalKind}
        goalStep={state.goalStep}
        selectedScorerID={state.selectedScorerID}
        selectedAssistID={state.selectedAssistID}
        selectedSubOutId={state.selectedSubOutId}
        selectedSubInId={state.selectedSubInId}
        savingEvent={state.savingEvent}
        convocatedPlayers={state.convocatedPlayers}
        playersOnField={state.playersOnField}
        playersOnBench={state.playersOnBench}
        suspendedBenchPlayers={state.suspendedBenchPlayers}
        yellowCardsByPlayer={state.yellowCardsByPlayer}
        ourTeamShortName={ourTeamShortName}
        opponentTeamShortName={opponentTeamShortName}
        getPlayerAvailability={state.getPlayerAvailability}
        setGoalTeamSide={state.setGoalTeamSide}
        setGoalKind={state.setGoalKind}
        setGoalStep={state.setGoalStep}
        setSelectedScorerID={state.setSelectedScorerID}
        setSelectedAssistID={state.setSelectedAssistID}
        setSelectedSubOutId={state.setSelectedSubOutId}
        setSelectedSubInId={state.setSelectedSubInId}
        closeModal={state.closeModal}
        confirmGoal={state.confirmGoal}
        confirmCard={state.confirmCard}
        confirmSubstitution={state.confirmSubstitution}
      />

      {/* Confirmação ao apagar 1º amarelo que dispararia cascata
          (2º amarelo + red_card auto). */}
      <ConfirmDialog
        open={state.cascadeDeleteIds !== null}
        onOpenChange={(open) => {
          if (!open) state.cancelCascadeDelete();
        }}
        title="Apagar cartão amarelo?"
        description="Esta acção também vai apagar o 2.º cartão amarelo e o cartão vermelho automático. O jogador volta a estar disponível. Continuar?"
        confirmLabel="Apagar tudo"
        cancelLabel="Cancelar"
        destructive
        onConfirm={() => void state.confirmCascadeDelete()}
      />
    </div>
  );
}
