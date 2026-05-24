"use client";

import { Check, ArrowLeftRight, Loader2 } from "lucide-react";
import { AppModal } from "@/components/ui/app-modal";
import { Button } from "@/components/ui/button";
import type { LivePlayer, ModalType, PlayerAvailability } from "./types";
import { EVENT_LABELS } from "./types";
import { sortPlayersByName, getAvailabilityBadgeClasses } from "./utils";
import { sortPlayersByFieldStatus } from "@/lib/games/sort-players-by-field-status";
import { YellowCardWarningBadge } from "./YellowCardWarningBadge";

interface EventModalProps {
  modalType: ModalType | null;
  goalTeamSide: "ours" | "opponent" | null;
  goalKind: "goal" | "own_goal" | null;
  goalStep: "scorer" | "assist";
  selectedScorerID: string | null;
  selectedAssistID: string | null;
  selectedSubOutId: string | null;
  selectedSubInId: string | null;
  savingEvent: boolean;
  convocatedPlayers: LivePlayer[];
  playersOnField: LivePlayer[];
  playersOnBench: LivePlayer[];
  suspendedBenchPlayers: LivePlayer[];
  yellowCardsByPlayer: Map<string, number>;
  ourTeamShortName: string;
  opponentTeamShortName: string;
  getPlayerAvailability: (playerId: string | null | undefined) => PlayerAvailability;
  setGoalTeamSide: (side: "ours" | "opponent" | null) => void;
  setGoalKind: (kind: "goal" | "own_goal" | null) => void;
  setGoalStep: (step: "scorer" | "assist") => void;
  setSelectedScorerID: (id: string | null) => void;
  setSelectedAssistID: (id: ((prev: string | null) => string | null) | string | null) => void;
  setSelectedSubOutId: (id: string | null) => void;
  setSelectedSubInId: (id: string | null) => void;
  closeModal: () => void;
  confirmGoal: () => void;
  confirmCard: (eventType: "yellow_card" | "red_card") => void;
  confirmSubstitution: () => void;
}

export function EventModal({
  modalType,
  goalTeamSide,
  goalKind,
  goalStep,
  selectedScorerID,
  selectedAssistID,
  selectedSubOutId,
  selectedSubInId,
  savingEvent,
  convocatedPlayers,
  playersOnField,
  playersOnBench,
  suspendedBenchPlayers,
  yellowCardsByPlayer,
  ourTeamShortName,
  opponentTeamShortName,
  getPlayerAvailability,
  setGoalTeamSide,
  setGoalKind,
  setGoalStep,
  setSelectedScorerID,
  setSelectedAssistID,
  setSelectedSubOutId,
  setSelectedSubInId,
  closeModal,
  confirmGoal,
  confirmCard,
  confirmSubstitution,
}: EventModalProps) {
  if (!modalType) return null;

  // Set de IDs de jogadores expulsos (derivado de suspendedBenchPlayers).
  // Usado por sortPlayersByFieldStatus para empurrar expulsos para o final.
  const sentOffPlayerIds = new Set(suspendedBenchPlayers.map((p) => p.id));

  return (
    <AppModal
      open={Boolean(modalType)}
      onClose={closeModal}
      title={
        <>
          {modalType === "substitution"
            ? "🔄 Substituição"
            : modalType === "goal"
              ? "⚽ Golo"
              : modalType === "penalty_goal"
                ? "🥅 Penálti"
                : EVENT_LABELS[modalType] ?? modalType}
          {modalType === "goal" &&
          goalTeamSide === "ours" &&
          goalKind === "goal" &&
          goalStep === "assist"
            ? " — Assistência?"
            : ""}
        </>
      }
      closeLabel="Fechar modal de evento"
      bodyClassName="space-y-3"
    >
      {/* SUBSTITUTION */}
      {modalType === "substitution" && (
        <>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
              Sai (em campo)
            </p>
            {playersOnField.length === 0 ? (
              <p className="text-xs text-slate-400">Nenhum jogador em campo.</p>
            ) : (
              playersOnField.map((p) => {
                const availability = getPlayerAvailability(p.id);
                const isDisabled =
                  !availability.selectable || availability.label !== "Em campo";
                const isSelected = selectedSubOutId === p.id;

                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedSubOutId(p.id)}
                    disabled={isDisabled}
                    className={`w-full flex items-center gap-3 p-2.5 rounded-xl mb-1 text-left transition-colors ${
                      isSelected
                        ? "bg-red-50 border-2 border-red-300"
                        : "bg-slate-50 border border-slate-100"
                    } ${isDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <span className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {p.jersey_number || "—"}
                    </span>
                    <span className="text-sm font-medium">
                      {p.first_name} {p.last_name}
                    </span>
                    {p.preferred_position && (
                      <span className="inline-flex items-center rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 flex-shrink-0">
                        {p.preferred_position}
                      </span>
                    )}
                    <YellowCardWarningBadge count={yellowCardsByPlayer.get(p.id)} />
                    <span
                      className={`ml-auto inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${getAvailabilityBadgeClasses(availability.label)}`}
                    >
                      {availability.label}
                    </span>
                    {isSelected && (
                      <ArrowLeftRight size={14} className="text-red-500" />
                    )}
                  </button>
                );
              })
            )}
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
              Entra (banco)
            </p>
            {playersOnBench.length === 0 ? (
              <p className="text-xs text-slate-400">Nenhum jogador no banco.</p>
            ) : (
              playersOnBench.map((p) => {
                const availability = getPlayerAvailability(p.id);
                const isDisabled =
                  !availability.selectable || availability.label !== "Banco";
                const isSelected = selectedSubInId === p.id;

                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedSubInId(p.id)}
                    disabled={isDisabled}
                    className={`w-full flex items-center gap-3 p-2.5 rounded-xl mb-1 text-left transition-colors ${
                      isSelected
                        ? "bg-emerald-50 border-2 border-emerald-300"
                        : "bg-slate-50 border border-slate-100"
                    } ${isDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <span className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {p.jersey_number || "—"}
                    </span>
                    <span className="text-sm font-medium">
                      {p.first_name} {p.last_name}
                    </span>
                    {p.preferred_position && (
                      <span className="inline-flex items-center rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 flex-shrink-0">
                        {p.preferred_position}
                      </span>
                    )}
                    <YellowCardWarningBadge count={yellowCardsByPlayer.get(p.id)} />
                    <span
                      className={`ml-auto inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${getAvailabilityBadgeClasses(availability.label)}`}
                    >
                      {availability.label}
                    </span>
                    {isSelected && (
                      <Check size={14} className="text-emerald-500" />
                    )}
                  </button>
                );
              })
            )}
            {suspendedBenchPlayers.length > 0 && (
              <p className="text-xs text-red-600 mt-1">
                {suspendedBenchPlayers.length} jogador(es) expulso(s) no banco não podem
                entrar.
              </p>
            )}
          </div>
          <Button
            onClick={() => void confirmSubstitution()}
            disabled={savingEvent || !selectedSubInId || !selectedSubOutId}
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            {savingEvent ? <Loader2 size={16} className="animate-spin" /> : "Confirmar substituição"}
          </Button>
        </>
      )}

      {/* GOAL (unified flow) */}
      {modalType === "goal" && (
        <>
          {!goalTeamSide && (
            <>
              <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
                Quem marcou?
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={() => {
                    setGoalTeamSide("ours");
                    setGoalKind(null);
                    setGoalStep("scorer");
                    setSelectedScorerID(null);
                    setSelectedAssistID(null);
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  {ourTeamShortName}
                </Button>
                <Button
                  onClick={() => {
                    setGoalTeamSide("opponent");
                    setGoalKind(null);
                    setGoalStep("scorer");
                    setSelectedScorerID(null);
                    setSelectedAssistID(null);
                  }}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {opponentTeamShortName}
                </Button>
              </div>
            </>
          )}

          {goalTeamSide && !goalKind && (
            <>
              <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
                Tipo de golo
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={() => {
                    setGoalKind("goal");
                    if (goalTeamSide === "opponent") {
                      const firstOnField = playersOnField[0] ?? null;
                      const preferredGoalkeeper =
                        playersOnField.find((player) =>
                          /gr|gk|guarda/i.test(player.preferred_position ?? ""),
                        ) ?? firstOnField;
                      setSelectedScorerID(preferredGoalkeeper?.id ?? null);
                    } else {
                      setSelectedScorerID(null);
                    }
                  }}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  Golo
                </Button>
                <Button
                  onClick={() => {
                    setGoalKind("own_goal");
                    setSelectedScorerID(null);
                    setSelectedAssistID(null);
                  }}
                  className="bg-slate-700 hover:bg-slate-800"
                >
                  Autogolo
                </Button>
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setGoalTeamSide(null);
                  setGoalKind(null);
                }}
              >
                ← Voltar
              </Button>
            </>
          )}

          {goalTeamSide === "ours" && goalKind === "goal" && (
            <>
              {goalStep === "scorer" && (
                <>
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
                    Marcador
                  </p>
                  {sortPlayersByFieldStatus(convocatedPlayers, sentOffPlayerIds).map((player) => {
                    const availability = getPlayerAvailability(player.id);
                    const isDisabled = !availability.selectable;
                    const isSelected = selectedScorerID === player.id;

                    return (
                      <button
                        key={player.id}
                        onClick={() => setSelectedScorerID(player.id)}
                        disabled={isDisabled}
                        className={`w-full flex items-center gap-3 p-2.5 rounded-xl mb-1 text-left transition-colors ${
                          isSelected
                            ? "bg-emerald-50 border-2 border-emerald-300"
                            : "bg-slate-50 border border-slate-100"
                        } ${isDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
                      >
                        <span className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold flex-shrink-0">
                          {player.jersey_number || "—"}
                        </span>
                        <span className="text-sm font-medium truncate">
                          {player.first_name} {player.last_name}
                        </span>
                        {player.preferred_position && (
                          <span className="inline-flex items-center rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 flex-shrink-0">
                            {player.preferred_position}
                          </span>
                        )}
                        <YellowCardWarningBadge count={yellowCardsByPlayer.get(player.id)} />
                        <span
                          className={`ml-auto inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${getAvailabilityBadgeClasses(availability.label)}`}
                        >
                          {availability.label}
                        </span>
                        {isSelected && (
                          <Check size={14} className="text-emerald-500" />
                        )}
                      </button>
                    );
                  })}
                  <div className="flex gap-2 pt-1">
                    <Button
                      onClick={() => setGoalStep("assist")}
                      disabled={!selectedScorerID}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                    >
                      Seguinte →
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setGoalKind(null);
                        setGoalStep("scorer");
                        setSelectedScorerID(null);
                      }}
                    >
                      ← Voltar
                    </Button>
                  </div>
                </>
              )}

              {goalStep === "assist" && (
                <>
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
                    Assistência (opcional)
                  </p>
                  {sortPlayersByFieldStatus(
                    convocatedPlayers.filter((player) => player.id !== selectedScorerID),
                    sentOffPlayerIds,
                  ).map((player) => {
                    const availability = getPlayerAvailability(player.id);
                    const isDisabled = !availability.selectable;
                    const isSelected = selectedAssistID === player.id;

                    return (
                      <button
                        key={player.id}
                        onClick={() =>
                          setSelectedAssistID((prev: string | null) =>
                            prev === player.id ? null : player.id,
                          )
                        }
                        disabled={isDisabled}
                        className={`w-full flex items-center gap-3 p-2.5 rounded-xl mb-1 text-left transition-colors ${
                          isSelected
                            ? "bg-blue-50 border-2 border-blue-300"
                            : "bg-slate-50 border border-slate-100"
                        } ${isDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
                      >
                        <span className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold flex-shrink-0">
                          {player.jersey_number || "—"}
                        </span>
                        <span className="text-sm font-medium truncate">
                          {player.first_name} {player.last_name}
                        </span>
                        {player.preferred_position && (
                          <span className="inline-flex items-center rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 flex-shrink-0">
                            {player.preferred_position}
                          </span>
                        )}
                        <YellowCardWarningBadge count={yellowCardsByPlayer.get(player.id)} />
                        <span
                          className={`ml-auto inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${getAvailabilityBadgeClasses(availability.label)}`}
                        >
                          {availability.label}
                        </span>
                        {isSelected && (
                          <Check size={14} className="text-blue-500" />
                        )}
                      </button>
                    );
                  })}
                  <div className="flex gap-2 pt-1">
                    <Button
                      onClick={() => void confirmGoal()}
                      disabled={savingEvent}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                    >
                      {savingEvent ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        "Confirmar golo"
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setGoalStep("scorer")}
                    >
                      ← Voltar
                    </Button>
                  </div>
                </>
              )}
            </>
          )}

          {goalTeamSide === "ours" && goalKind === "own_goal" && (
            <>
              <p className="text-sm text-slate-600">
                Vai ser registado autogolo do adversário a nosso favor.
              </p>
              <div className="flex gap-2 pt-1">
                <Button
                  onClick={() => void confirmGoal()}
                  disabled={savingEvent}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                >
                  {savingEvent ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    "Confirmar autogolo"
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setGoalKind(null);
                  }}
                >
                  ← Voltar
                </Button>
              </div>
            </>
          )}

          {goalTeamSide === "opponent" && goalKind === "goal" && (
            <>
              <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
                Jogador associado ao golo sofrido (opcional)
              </p>
              {(playersOnField.length > 0
                ? playersOnField
                : sortPlayersByName(convocatedPlayers)
              ).map((player) => {
                const availability = getPlayerAvailability(player.id);
                const isDisabled = !availability.selectable;
                const isSelected = selectedScorerID === player.id;

                return (
                  <button
                    key={player.id}
                    onClick={() =>
                      setSelectedScorerID(
                        selectedScorerID === player.id ? null : player.id,
                      )
                    }
                    disabled={isDisabled}
                    className={`w-full flex items-center gap-3 p-2.5 rounded-xl mb-1 text-left transition-colors ${
                      isSelected
                        ? "bg-rose-50 border-2 border-rose-300"
                        : "bg-slate-50 border border-slate-100"
                    } ${isDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <span className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {player.jersey_number || "—"}
                    </span>
                    <span className="text-sm font-medium truncate">
                      {player.first_name} {player.last_name}
                    </span>
                    {player.preferred_position && (
                      <span className="inline-flex items-center rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 flex-shrink-0">
                        {player.preferred_position}
                      </span>
                    )}
                    <YellowCardWarningBadge count={yellowCardsByPlayer.get(player.id)} />
                    <span
                      className={`ml-auto inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${getAvailabilityBadgeClasses(availability.label)}`}
                    >
                      {availability.label}
                    </span>
                    {isSelected && (
                      <Check size={14} className="text-rose-500" />
                    )}
                  </button>
                );
              })}
              <div className="flex gap-2 pt-1">
                <Button
                  onClick={() => void confirmGoal()}
                  disabled={savingEvent}
                  className="flex-1 bg-red-600 hover:bg-red-700"
                >
                  {savingEvent ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    "Confirmar golo adversário"
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setGoalKind(null);
                    setSelectedScorerID(null);
                  }}
                >
                  ← Voltar
                </Button>
              </div>
            </>
          )}

          {goalTeamSide === "opponent" && goalKind === "own_goal" && (
            <>
              <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
                Jogador que marcou autogolo
              </p>
              {sortPlayersByFieldStatus(convocatedPlayers, sentOffPlayerIds).map((player) => {
                const availability = getPlayerAvailability(player.id);
                const isDisabled = !availability.selectable;
                const isSelected = selectedScorerID === player.id;

                return (
                  <button
                    key={player.id}
                    onClick={() => setSelectedScorerID(player.id)}
                    disabled={isDisabled}
                    className={`w-full flex items-center gap-3 p-2.5 rounded-xl mb-1 text-left transition-colors ${
                      isSelected
                        ? "bg-red-50 border-2 border-red-300"
                        : "bg-slate-50 border border-slate-100"
                    } ${isDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <span className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {player.jersey_number || "—"}
                    </span>
                    <span className="text-sm font-medium truncate">
                      {player.first_name} {player.last_name}
                    </span>
                    {player.preferred_position && (
                      <span className="inline-flex items-center rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 flex-shrink-0">
                        {player.preferred_position}
                      </span>
                    )}
                    <YellowCardWarningBadge count={yellowCardsByPlayer.get(player.id)} />
                    <span
                      className={`ml-auto inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${getAvailabilityBadgeClasses(availability.label)}`}
                    >
                      {availability.label}
                    </span>
                    {isSelected && (
                      <Check size={14} className="text-red-500" />
                    )}
                  </button>
                );
              })}
              <div className="flex gap-2 pt-1">
                <Button
                  onClick={() => void confirmGoal()}
                  disabled={savingEvent || !selectedScorerID}
                  className="flex-1 bg-red-600 hover:bg-red-700"
                >
                  {savingEvent ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    "Confirmar autogolo"
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setGoalKind(null);
                    setSelectedScorerID(null);
                  }}
                >
                  ← Voltar
                </Button>
              </div>
            </>
          )}
        </>
      )}

      {/* PENALTY GOAL (golo sem assistência) */}
      {modalType === "penalty_goal" && (
        <>
          {!goalTeamSide && (
            <>
              <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
                Quem marcou o penálti?
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={() => {
                    setGoalTeamSide("ours");
                    setSelectedScorerID(null);
                    setSelectedAssistID(null);
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  {ourTeamShortName}
                </Button>
                <Button
                  onClick={() => {
                    setGoalTeamSide("opponent");
                    const firstOnField = playersOnField[0] ?? null;
                    const preferredGoalkeeper =
                      playersOnField.find((player) =>
                        /gr|gk|guarda/i.test(player.preferred_position ?? ""),
                      ) ?? firstOnField;
                    setSelectedScorerID(preferredGoalkeeper?.id ?? null);
                    setSelectedAssistID(null);
                  }}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {opponentTeamShortName}
                </Button>
              </div>
            </>
          )}

          {goalTeamSide === "ours" && (
            <>
              <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
                Marcador
              </p>
              {sortPlayersByFieldStatus(convocatedPlayers, sentOffPlayerIds).map((player) => {
                const availability = getPlayerAvailability(player.id);
                const isDisabled = !availability.selectable;
                const isSelected = selectedScorerID === player.id;

                return (
                  <button
                    key={player.id}
                    onClick={() => setSelectedScorerID(player.id)}
                    disabled={isDisabled}
                    className={`w-full flex items-center gap-3 p-2.5 rounded-xl mb-1 text-left transition-colors ${
                      isSelected
                        ? "bg-emerald-50 border-2 border-emerald-300"
                        : "bg-slate-50 border border-slate-100"
                    } ${isDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <span className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {player.jersey_number || "—"}
                    </span>
                    <span className="text-sm font-medium truncate">
                      {player.first_name} {player.last_name}
                    </span>
                    {player.preferred_position && (
                      <span className="inline-flex items-center rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 flex-shrink-0">
                        {player.preferred_position}
                      </span>
                    )}
                    <YellowCardWarningBadge count={yellowCardsByPlayer.get(player.id)} />
                    <span
                      className={`ml-auto inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${getAvailabilityBadgeClasses(availability.label)}`}
                    >
                      {availability.label}
                    </span>
                    {isSelected && (
                      <Check size={14} className="text-emerald-500" />
                    )}
                  </button>
                );
              })}
              <div className="flex gap-2 pt-1">
                <Button
                  onClick={() => void confirmGoal()}
                  disabled={savingEvent || !selectedScorerID}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                >
                  {savingEvent ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    "Confirmar penálti"
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setGoalTeamSide(null);
                    setSelectedScorerID(null);
                  }}
                >
                  ← Voltar
                </Button>
              </div>
            </>
          )}

          {goalTeamSide === "opponent" && (
            <>
              <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
                Jogador associado ao penálti sofrido (opcional)
              </p>
              {(playersOnField.length > 0
                ? playersOnField
                : sortPlayersByName(convocatedPlayers)
              ).map((player) => {
                const availability = getPlayerAvailability(player.id);
                const isDisabled = !availability.selectable;
                const isSelected = selectedScorerID === player.id;

                return (
                  <button
                    key={player.id}
                    onClick={() =>
                      setSelectedScorerID(
                        selectedScorerID === player.id ? null : player.id,
                      )
                    }
                    disabled={isDisabled}
                    className={`w-full flex items-center gap-3 p-2.5 rounded-xl mb-1 text-left transition-colors ${
                      isSelected
                        ? "bg-rose-50 border-2 border-rose-300"
                        : "bg-slate-50 border border-slate-100"
                    } ${isDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <span className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {player.jersey_number || "—"}
                    </span>
                    <span className="text-sm font-medium truncate">
                      {player.first_name} {player.last_name}
                    </span>
                    {player.preferred_position && (
                      <span className="inline-flex items-center rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 flex-shrink-0">
                        {player.preferred_position}
                      </span>
                    )}
                    <YellowCardWarningBadge count={yellowCardsByPlayer.get(player.id)} />
                    <span
                      className={`ml-auto inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${getAvailabilityBadgeClasses(availability.label)}`}
                    >
                      {availability.label}
                    </span>
                    {isSelected && (
                      <Check size={14} className="text-rose-500" />
                    )}
                  </button>
                );
              })}
              <div className="flex gap-2 pt-1">
                <Button
                  onClick={() => void confirmGoal()}
                  disabled={savingEvent}
                  className="flex-1 bg-red-600 hover:bg-red-700"
                >
                  {savingEvent ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    "Confirmar penálti adversário"
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setGoalTeamSide(null);
                    setSelectedScorerID(null);
                  }}
                >
                  ← Voltar
                </Button>
              </div>
            </>
          )}
        </>
      )}

      {/* YELLOW / RED CARD */}
      {(modalType === "yellow_card" || modalType === "red_card") && (
        <>
          <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
            Jogador
          </p>
          {sortPlayersByFieldStatus(convocatedPlayers, sentOffPlayerIds).map((p) => {
            const availability = getPlayerAvailability(p.id);
            const isDisabled = !availability.selectable;
            const isSelected = selectedScorerID === p.id;

            return (
              <button
                key={p.id}
                onClick={() => setSelectedScorerID(p.id)}
                disabled={isDisabled}
                className={`w-full flex items-center gap-3 p-2.5 rounded-xl mb-1 text-left transition-colors ${
                  isSelected
                    ? "bg-emerald-50 border-2 border-emerald-300"
                    : "bg-slate-50 border border-slate-100"
                } ${isDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <span className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold flex-shrink-0">
                  {p.jersey_number || "—"}
                </span>
                <span className="text-sm font-medium truncate">
                  {p.first_name} {p.last_name}
                </span>
                {p.preferred_position && (
                  <span className="inline-flex items-center rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 flex-shrink-0">
                    {p.preferred_position}
                  </span>
                )}
                <YellowCardWarningBadge count={yellowCardsByPlayer.get(p.id)} />
                <span
                  className={`ml-auto inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${getAvailabilityBadgeClasses(availability.label)}`}
                >
                  {availability.label}
                </span>
                {isSelected && (
                  <Check size={14} className="text-emerald-500" />
                )}
              </button>
            );
          })}
          <div className="flex gap-2 pt-2">
            <Button
              onClick={() => void confirmCard(modalType)}
              disabled={savingEvent || !selectedScorerID}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700"
            >
              {savingEvent ? <Loader2 size={16} className="animate-spin" /> : "Confirmar"}
            </Button>
            <Button variant="outline" onClick={closeModal}>
              Cancelar
            </Button>
          </div>
        </>
      )}
    </AppModal>
  );
}
