"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2, Plus, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  applyTransition,
  transitionContent,
  type PendingTransition,
} from "./clock-controls.utils";
import type { MatchPhase, ClockState } from "./types";

interface ClockControlsProps {
  phase: MatchPhase;
  currentMinute: number;
  clockState: ClockState;
  isLivePhase: boolean;
  playersOnField: { length: number };
  startingFirstHalf: boolean;
  kickoffError: string | null;
  kickoffState: { canStart: boolean; reason: string | null };
  adjustClockBySeconds: (delta: number) => void;
  setClockMinute: (targetMinute: number) => void;
  handleStartFirstHalf: () => void;
  pauseClock: () => void;
  startClock: () => void;
  setPhase: (phase: MatchPhase) => void;
}

export function ClockControls({
  phase,
  currentMinute,
  clockState,
  isLivePhase,
  playersOnField,
  startingFirstHalf,
  kickoffError,
  kickoffState,
  adjustClockBySeconds,
  setClockMinute,
  handleStartFirstHalf,
  pauseClock,
  startClock,
  setPhase,
}: ClockControlsProps) {
  const [pendingTransition, setPendingTransition] =
    useState<PendingTransition | null>(null);

  const [minuteInputValue, setMinuteInputValue] = useState<string>(
    String(currentMinute),
  );
  // Sinaliza ao onBlur que deve ignorar o valor pendente (ex: Escape).
  const skipNextBlurRef = useRef(false);

  useEffect(() => {
    setMinuteInputValue(String(currentMinute));
  }, [currentMinute]);

  const dialogContent = pendingTransition
    ? transitionContent(pendingTransition, currentMinute)
    : null;

  return (
    <div className="mb-5 p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-slate-600 flex-1">Minuto de jogo</span>
        <button
          onClick={() => adjustClockBySeconds(-60)}
          className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center"
        >
          <Minus size={14} />
        </button>
        <input
          type="number"
          value={minuteInputValue}
          onChange={(e) => setMinuteInputValue(e.target.value)}
          onBlur={() => {
            if (skipNextBlurRef.current) {
              skipNextBlurRef.current = false;
              setMinuteInputValue(String(currentMinute));
              return;
            }
            const parsed = Number(minuteInputValue);
            if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 200) {
              const intMinute = Math.floor(parsed);
              if (intMinute !== currentMinute) {
                setClockMinute(intMinute);
              }
              setMinuteInputValue(String(intMinute));
            } else {
              setMinuteInputValue(String(currentMinute));
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            } else if (e.key === "Escape") {
              skipNextBlurRef.current = true;
              e.currentTarget.blur();
            }
          }}
          min={0}
          max={200}
          step={1}
          inputMode="numeric"
          aria-label="Minuto de jogo"
          className="w-14 text-center font-bold text-lg text-slate-900 bg-white border border-slate-300 rounded px-1 py-0.5 focus:outline-none focus:ring-2 focus:ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inline-spin-button]:appearance-none"
        />
        <button
          onClick={() => adjustClockBySeconds(60)}
          className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center"
        >
          <Plus size={14} />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {phase === "pre_match" && (
          // Nota: a transição pre_match → first_half NÃO passa pelo
          // ConfirmDialog porque já tem guard via kickoffState.canStart
          // (validação de titulares e dados do jogo). Adicionar dialog
          // aqui seria fricção sem ganho de segurança.
          <div className="space-y-2">
            <Button
              onClick={() => {
                void handleStartFirstHalf();
              }}
              disabled={startingFirstHalf || !kickoffState.canStart}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-500"
            >
              {startingFirstHalf ? (
                <>
                  <Loader2 size={16} className="mr-2 animate-spin" />
                  A iniciar 1ª parte...
                </>
              ) : playersOnField.length === 0 ? (
                "Seleciona pelo menos 1 titular"
              ) : kickoffState.canStart ? (
                `Iniciar 1ª parte (${playersOnField.length} titulares)`
              ) : (
                "Corrige os titulares antes de iniciar"
              )}
            </Button>
            {kickoffError ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {kickoffError}
              </p>
            ) : !kickoffState.canStart && kickoffState.reason ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {kickoffState.reason}
              </p>
            ) : null}
          </div>
        )}
        {phase === "first_half" && (
          <Button
            onClick={() => setPendingTransition("end_first_half")}
            className="w-full bg-amber-600 hover:bg-amber-700"
          >
            Terminar 1ª parte
          </Button>
        )}
        {phase === "halftime" && (
          <Button
            onClick={() => setPendingTransition("start_second_half")}
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            Iniciar 2ª parte
          </Button>
        )}
        {phase === "second_half" && (
          <Button
            onClick={() => setPendingTransition("end_second_half")}
            className="w-full bg-slate-800 hover:bg-slate-700"
          >
            Terminar 2ª parte
          </Button>
        )}
        {/* Nota: review → completed (em FinalizeSection) NÃO passa pelo
            ConfirmDialog porque já tem gate via allRatingsFilled e não
            é uma transição de parte. */}
      </div>

      {isLivePhase && (
        <Button
          variant="outline"
          onClick={() => {
            if (clockState.runningSinceMs) {
              pauseClock();
            } else {
              startClock();
            }
          }}
          className="w-full"
        >
          {clockState.runningSinceMs ? "Pausar relógio (debug)" : "Retomar relógio (debug)"}
        </Button>
      )}

      {phase === "halftime" && (
        <p className="text-xs text-center text-amber-700">
          Intervalo. Retoma o jogo para continuar a registar eventos.
        </p>
      )}
      {phase === "review" && (
        <p className="text-xs text-center text-slate-600">
          Revê os dados, preenche notas e MVP, depois finaliza.
        </p>
      )}

      {pendingTransition && dialogContent && (
        <ConfirmDialog
          open={pendingTransition !== null}
          onOpenChange={(v) => {
            if (!v) setPendingTransition(null);
          }}
          title={dialogContent.title}
          description={dialogContent.description}
          confirmLabel={dialogContent.confirmLabel}
          cancelLabel="Cancelar"
          destructive={dialogContent.destructive}
          onConfirm={() => {
            applyTransition(pendingTransition, {
              pauseClock,
              startClock,
              setPhase,
            });
            setPendingTransition(null);
          }}
        />
      )}
    </div>
  );
}
