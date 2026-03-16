"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  Plus,
  Eye,
  EyeOff,
  ChevronUp,
  ChevronDown,
  X,
  BookOpen,
  Clock,
  Users,
  FileDown,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ExercisePicker } from "@/components/exercises/ExercisePicker";
import { CATEGORY_LABELS } from "@/components/exercises/category-labels";
import type {
  Exercise,
  ExerciseCategory,
  TrainingPhase,
  TrainingPhaseExercise,
  PhaseType,
} from "@/types/database";
import type { TrainingRow } from "./types";

/* ── Label helpers ────────────────────────────────── */

const PHASE_TYPE_LABELS: Record<PhaseType, string> = {
  initial: "Fase Inicial",
  main: "Fase Fundamental",
  final: "Fase Final",
  custom: "Fase Personalizada",
};

const PERIOD_LABELS: Record<string, string> = {
  pre_season: "Pré-Época",
  competitive: "Competitivo",
  transition: "Transição",
};

const FOCUS_LABELS: Record<string, string> = {
  tactical: "Tática",
  technical: "Técnica",
  physical: "Física",
  mixed: "Mista",
};

const INTENSITY_LABELS: Record<string, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  very_high: "Muito Alta",
};

/* ── Types for local state ────────────────────────── */

type PhaseWithExercises = TrainingPhase & {
  exercises: (TrainingPhaseExercise & { exercise?: Exercise | null })[];
};

type Props = {
  trainingId: string;
  session: TrainingRow;
  readOnly?: boolean;
  onExportPdf?: () => void;
};

/* ── Main Component ────────────────────────────── */

export function TrainingUnit({ trainingId, session, readOnly = false, onExportPdf }: Props) {
  const [phases, setPhases] = useState<PhaseWithExercises[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedExercise, setExpandedExercise] = useState<string | null>(null);
  const [pickerPhaseId, setPickerPhaseId] = useState<string | null>(null);

  const loadPhases = useCallback(async () => {
    try {
      const res = await fetch(`/api/trainings/${trainingId}/phases`);
      const json = await res.json();
      if (json.success) {
        setPhases(json.phases ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [trainingId]);

  useEffect(() => {
    loadPhases();
  }, [loadPhases]);

  async function savePhases(nextPhases: PhaseWithExercises[]) {
    setSaving(true);
    try {
      const payload = {
        phases: nextPhases.map((p, pi) => ({
          phase_type: p.phase_type,
          phase_name: p.phase_name ?? null,
          phase_order: pi,
          duration_minutes: p.duration_minutes ?? null,
          notes: p.notes ?? null,
          exercises: p.exercises.map((ex, ei) => ({
            exercise_id: ex.exercise_id ?? null,
            exercise_order: ei,
            custom_name: ex.custom_name ?? null,
            custom_description: ex.custom_description ?? null,
            custom_objectives: ex.custom_objectives ?? null,
            custom_game_format: ex.custom_game_format ?? null,
            custom_duration_minutes: ex.custom_duration_minutes ?? null,
            custom_rest_minutes: ex.custom_rest_minutes ?? null,
            custom_num_players: ex.custom_num_players ?? null,
            custom_field_dimensions: ex.custom_field_dimensions ?? null,
            custom_material: ex.custom_material ?? null,
            custom_diagram_url: ex.custom_diagram_url ?? null,
            planned_time_minutes: ex.planned_time_minutes ?? null,
            repetitions: ex.repetitions ?? 1,
            total_athletes: ex.total_athletes ?? null,
            notes: ex.notes ?? null,
          })),
        })),
      };

      const res = await fetch(`/api/trainings/${trainingId}/phases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();

      if (json.success) {
        toast.success("Unidade de treino guardada.");
        await loadPhases();
      } else {
        toast.error(json.error || "Erro ao guardar.");
      }
    } finally {
      setSaving(false);
    }
  }

  function initDefaultPhases() {
    const defaults: PhaseWithExercises[] = [
      { id: crypto.randomUUID(), training_session_id: trainingId, club_id: "", phase_type: "initial", phase_name: null, phase_order: 0, duration_minutes: null, notes: null, created_at: "", updated_at: "", exercises: [] },
      { id: crypto.randomUUID(), training_session_id: trainingId, club_id: "", phase_type: "main", phase_name: null, phase_order: 1, duration_minutes: null, notes: null, created_at: "", updated_at: "", exercises: [] },
      { id: crypto.randomUUID(), training_session_id: trainingId, club_id: "", phase_type: "final", phase_name: null, phase_order: 2, duration_minutes: null, notes: null, created_at: "", updated_at: "", exercises: [] },
    ];
    savePhases(defaults);
  }

  function handleAddExercise(phaseId: string, exercise: Exercise) {
    setPhases((prev) =>
      prev.map((p) => {
        if (p.id !== phaseId) return p;
        const newEx: TrainingPhaseExercise & { exercise?: Exercise | null } = {
          id: crypto.randomUUID(),
          phase_id: phaseId,
          exercise_id: exercise.id,
          club_id: "",
          exercise_order: p.exercises.length,
          repetitions: 1,
          created_at: "",
          exercise,
        };
        return { ...p, exercises: [...p.exercises, newEx] };
      }),
    );
    setPickerPhaseId(null);
  }

  function handleRemoveExercise(phaseId: string, exerciseIndex: number) {
    setPhases((prev) =>
      prev.map((p) => {
        if (p.id !== phaseId) return p;
        const next = p.exercises.filter((_, i) => i !== exerciseIndex);
        return { ...p, exercises: next };
      }),
    );
  }

  function handleMoveExercise(phaseId: string, index: number, direction: -1 | 1) {
    setPhases((prev) =>
      prev.map((p) => {
        if (p.id !== phaseId) return p;
        const target = index + direction;
        if (target < 0 || target >= p.exercises.length) return p;
        const next = [...p.exercises];
        [next[index], next[target]] = [next[target], next[index]];
        return { ...p, exercises: next };
      }),
    );
  }

  function handleAddCustomPhase() {
    setPhases((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        training_session_id: trainingId,
        club_id: "",
        phase_type: "custom" as PhaseType,
        phase_name: "Nova Fase",
        phase_order: prev.length,
        duration_minutes: null,
        notes: null,
        created_at: "",
        updated_at: "",
        exercises: [],
      },
    ]);
  }

  function handleRemovePhase(index: number) {
    setPhases((prev) => prev.filter((_, i) => i !== index));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={24} className="animate-spin text-slate-400" />
      </div>
    );
  }

  /* ── UT Header ─────────────────── */
  const utHeader = (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-slate-900">Unidade de Treino</h2>
        {onExportPdf && phases.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
            onClick={onExportPdf}
          >
            <FileDown size={14} className="mr-1.5" />
            PDF
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        {session.ut_number != null && (
          <div>
            <span className="text-slate-400">UT</span>{" "}
            <span className="font-medium text-slate-700">{session.ut_number}</span>
          </div>
        )}
        {session.period_type && (
          <div>
            <span className="text-slate-400">Período</span>{" "}
            <span className="font-medium text-slate-700">
              {PERIOD_LABELS[session.period_type] ?? session.period_type}
            </span>
          </div>
        )}
        {session.focus && (
          <div>
            <span className="text-slate-400">Foco</span>{" "}
            <span className="font-medium text-slate-700">
              {FOCUS_LABELS[session.focus] ?? session.focus}
            </span>
          </div>
        )}
        {session.intensity && (
          <div>
            <span className="text-slate-400">Intensidade</span>{" "}
            <span className="font-medium text-slate-700">
              {INTENSITY_LABELS[session.intensity] ?? session.intensity}
            </span>
          </div>
        )}
        {session.objective && (
          <div className="col-span-2">
            <span className="text-slate-400">Objectivo</span>{" "}
            <span className="font-medium text-slate-700">{session.objective}</span>
          </div>
        )}
        {session.complementary_objectives && (
          <div className="col-span-2">
            <span className="text-slate-400">Obj. Complementares</span>{" "}
            <span className="font-medium text-slate-700">{session.complementary_objectives}</span>
          </div>
        )}
        {session.material && (
          <div className="col-span-2">
            <span className="text-slate-400">Material</span>{" "}
            <span className="font-medium text-slate-700">{session.material}</span>
          </div>
        )}
        {session.initial_instruction && (
          <div className="col-span-2">
            <span className="text-slate-400">Instrução Inicial</span>{" "}
            <span className="font-medium text-slate-700">
              {session.initial_instruction}
            </span>
          </div>
        )}
      </div>
    </div>
  );

  /* ── Empty state ─────────────────── */
  if (phases.length === 0) {
    return (
      <div>
        {utHeader}
        {!readOnly && (
          <div className="text-center py-6">
            <BookOpen size={32} className="text-slate-200 mx-auto mb-2" />
            <p className="text-sm text-slate-500 mb-3">Ainda sem fases definidas.</p>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={initDefaultPhases}
            >
              <Plus size={16} className="mr-2" />
              Adicionar UT (3 fases)
            </Button>
          </div>
        )}
      </div>
    );
  }

  /* ── Phases list ─────────────────── */
  return (
    <div>
      {utHeader}

      <div className="space-y-3">
        {phases.map((phase, phaseIdx) => {
          const phaseDuration = phase.exercises.reduce((sum, ex) => {
            const dur = ex.custom_duration_minutes ?? ex.exercise?.duration_minutes ?? 0;
            return sum + dur;
          }, 0);

          return (
            <div key={phase.id} className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
              {/* Phase header */}
              <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-slate-800">
                    {phase.phase_type === "custom"
                      ? phase.phase_name || "Fase Personalizada"
                      : PHASE_TYPE_LABELS[phase.phase_type]}
                  </h3>
                  {phaseDuration > 0 && (
                    <span className="text-[11px] text-slate-400">{phaseDuration} min</span>
                  )}
                </div>
                {!readOnly && phase.phase_type === "custom" && (
                  <button
                    type="button"
                    onClick={() => handleRemovePhase(phaseIdx)}
                    className="p-1 rounded text-slate-400 hover:text-red-500"
                    title="Remover fase"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Exercise list */}
              <div className="divide-y divide-slate-50">
                {phase.exercises.map((phaseEx, exIdx) => {
                  const ex = phaseEx.exercise;
                  const name = phaseEx.custom_name || ex?.name || "Exercício";
                  const duration = phaseEx.custom_duration_minutes ?? ex?.duration_minutes;
                  const objectives = phaseEx.custom_objectives || ex?.objectives;
                  const category = ex?.category;
                  const diagramUrl = phaseEx.custom_diagram_url || ex?.diagram_url;
                  const isExpanded = expandedExercise === phaseEx.id;

                  return (
                    <div key={phaseEx.id}>
                      <div className="flex items-center gap-3 px-4 py-2.5">
                        {/* Thumbnail */}
                        {diagramUrl ? (
                          <img
                            src={diagramUrl}
                            alt=""
                            className="h-10 w-10 flex-shrink-0 rounded object-cover"
                          />
                        ) : (
                          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded bg-slate-100">
                            <BookOpen size={14} className="text-slate-300" />
                          </div>
                        )}

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{name}</p>
                          <div className="flex items-center gap-2 text-[11px] text-slate-400">
                            {category && (
                              <span>
                                {CATEGORY_LABELS[category as ExerciseCategory] ?? category}
                              </span>
                            )}
                            {objectives && (
                              <span className="truncate max-w-[150px]">{objectives}</span>
                            )}
                          </div>
                        </div>

                        {/* Duration */}
                        {duration && (
                          <span className="flex items-center gap-0.5 text-xs text-slate-500 flex-shrink-0">
                            <Clock size={11} /> {duration}&apos;
                          </span>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedExercise(isExpanded ? null : phaseEx.id)
                            }
                            className="p-1 rounded text-slate-400 hover:text-emerald-600"
                            title={isExpanded ? "Fechar detalhes" : "Ver detalhes"}
                          >
                            {isExpanded ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                          {!readOnly && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleMoveExercise(phase.id, exIdx, -1)}
                                disabled={exIdx === 0}
                                className="p-1 rounded text-slate-400 hover:text-slate-700 disabled:opacity-30"
                                title="Mover para cima"
                              >
                                <ChevronUp size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleMoveExercise(phase.id, exIdx, 1)}
                                disabled={exIdx === phase.exercises.length - 1}
                                className="p-1 rounded text-slate-400 hover:text-slate-700 disabled:opacity-30"
                                title="Mover para baixo"
                              >
                                <ChevronDown size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveExercise(phase.id, exIdx)}
                                className="p-1 rounded text-slate-400 hover:text-red-500"
                                title="Remover"
                              >
                                <X size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Expanded details */}
                      {isExpanded && (
                        <ExerciseExpandedDetails phaseEx={phaseEx} exercise={ex} />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Add exercise button */}
              {!readOnly && (
                <div className="px-4 py-2.5 border-t border-slate-50">
                  <button
                    type="button"
                    onClick={() => setPickerPhaseId(phase.id)}
                    className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 hover:text-emerald-700"
                  >
                    <Plus size={14} />
                    Adicionar Exercício
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom actions */}
      {!readOnly && (
        <div className="flex flex-wrap gap-2 mt-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddCustomPhase}
          >
            <Plus size={14} className="mr-1.5" />
            Fase Personalizada
          </Button>
          <Button
            type="button"
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700"
            onClick={() => savePhases(phases)}
            disabled={saving}
          >
            {saving ? (
              <Loader2 size={14} className="animate-spin mr-1.5" />
            ) : null}
            Guardar UT
          </Button>
        </div>
      )}

      {/* Exercise Picker Modal */}
      <ExercisePicker
        open={!!pickerPhaseId}
        onClose={() => setPickerPhaseId(null)}
        onSelect={(exercise) => {
          if (pickerPhaseId) handleAddExercise(pickerPhaseId, exercise);
        }}
      />
    </div>
  );
}

/* ── Expanded Details Sub-Component ────────────── */

function ExerciseExpandedDetails({
  phaseEx,
  exercise,
}: {
  phaseEx: TrainingPhaseExercise;
  exercise?: Exercise | null;
}) {
  const description = phaseEx.custom_description || exercise?.description;
  const objectives = phaseEx.custom_objectives || exercise?.objectives;
  const successCriteria = exercise?.success_criteria;
  const gameFormat = phaseEx.custom_game_format || exercise?.game_format;
  const fieldDimensions = phaseEx.custom_field_dimensions || exercise?.field_dimensions;
  const material = phaseEx.custom_material || exercise?.material;
  const duration = phaseEx.custom_duration_minutes ?? exercise?.duration_minutes;
  const restMinutes = phaseEx.custom_rest_minutes ?? exercise?.rest_minutes;
  const numPlayers = phaseEx.custom_num_players ?? exercise?.min_players;
  const diagramUrl = phaseEx.custom_diagram_url || exercise?.diagram_url;

  return (
    <div className="px-4 pb-3 pt-1 bg-slate-50/50 space-y-2">
      {diagramUrl && (
        <img
          src={diagramUrl}
          alt="Diagrama tático"
          className="w-full max-h-48 rounded-lg object-contain bg-white border border-slate-100"
        />
      )}

      {description && (
        <div>
          <p className="text-[10px] font-semibold uppercase text-slate-400">Descrição</p>
          <p className="text-xs text-slate-700 whitespace-pre-wrap">{description}</p>
        </div>
      )}

      {objectives && (
        <div>
          <p className="text-[10px] font-semibold uppercase text-slate-400">Objetivos</p>
          <p className="text-xs text-slate-700 whitespace-pre-wrap">{objectives}</p>
        </div>
      )}

      {successCriteria && (
        <div>
          <p className="text-[10px] font-semibold uppercase text-slate-400">Critério de Sucesso</p>
          <p className="text-xs text-slate-700">{successCriteria}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {gameFormat && (
          <div>
            <span className="text-slate-400">Forma:</span>{" "}
            <span className="font-medium text-slate-700">{gameFormat}</span>
          </div>
        )}
        {numPlayers != null && (
          <div className="flex items-center gap-0.5">
            <Users size={11} className="text-slate-400" />
            <span className="font-medium text-slate-700">{numPlayers}</span>
          </div>
        )}
        {fieldDimensions && (
          <div>
            <span className="text-slate-400">Espaço:</span>{" "}
            <span className="font-medium text-slate-700">{fieldDimensions}</span>
          </div>
        )}
        {material && (
          <div>
            <span className="text-slate-400">Material:</span>{" "}
            <span className="font-medium text-slate-700">{material}</span>
          </div>
        )}
        {duration != null && (
          <div>
            <span className="text-slate-400">Duração:</span>{" "}
            <span className="font-medium text-slate-700">{duration}&apos;</span>
          </div>
        )}
        {restMinutes != null && restMinutes > 0 && (
          <div>
            <span className="text-slate-400">Descanso:</span>{" "}
            <span className="font-medium text-slate-700">{restMinutes}&apos;</span>
          </div>
        )}
        {phaseEx.repetitions > 1 && (
          <div>
            <span className="text-slate-400">Repetições:</span>{" "}
            <span className="font-medium text-slate-700">{phaseEx.repetitions}</span>
          </div>
        )}
      </div>
    </div>
  );
}
