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
  Users,
  FileDown,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ExercisePicker } from "@/components/exercises/ExercisePicker";
import { CATEGORY_LABELS, CATEGORY_COLORS } from "@/components/exercises/category-labels";
import type {
  Exercise,
  ExerciseCategory,
  TrainingPhase,
  TrainingPhaseExercise,
  PhaseType,
} from "@/types/database";
import type { TrainingRow } from "./types";

/* ── Helpers ────────────────────────────────── */

const PHASE_TYPE_LABELS: Record<PhaseType, string> = {
  initial: "Fase Inicial",
  main: "Fase Fundamental",
  final: "Fase Final",
  custom: "Fase Personalizada",
};

const PERIOD_LABELS: Record<string, string> = { pre_season: "Pré-Época", competitive: "Competitivo", transition: "Transição" };
const FOCUS_LABELS: Record<string, string> = { tactical: "Tática", technical: "Técnica", physical: "Física", mixed: "Mista" };
const INTENSITY_LABELS: Record<string, string> = { low: "Baixo", medium: "Médio", high: "Alto", very_high: "Muito Alto" };
const FIELD_AREA_LABELS: Record<string, string> = { completo: "Completo", "1/2": "1/2", "1/3": "1/3", "1/4": "1/4" };

function formatTA(minutes: number): string {
  if (minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function getExDuration(ex: TrainingPhaseExercise & { exercise?: Exercise | null }): number {
  return ex.custom_duration_minutes ?? ex.exercise?.duration_minutes ?? 0;
}

function calculateTA(phases: PhaseWithExercises[], phaseIdx: number, exIdx: number): number {
  let total = 0;
  for (let p = 0; p <= phaseIdx; p++) {
    const exercises = phases[p].exercises;
    const limit = p === phaseIdx ? exIdx + 1 : exercises.length;
    for (let e = 0; e < limit; e++) {
      total += getExDuration(exercises[e]);
    }
  }
  return total;
}

/* ── Types ────────────────────────────────── */

type PhaseWithExercises = TrainingPhase & {
  exercises: (TrainingPhaseExercise & { exercise?: Exercise | null })[];
};

type Props = {
  trainingId: string;
  session: TrainingRow;
  readOnly?: boolean;
  onExportPdf?: () => void;
};

/* ── Main Component ────────────────────────── */

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
      if (json.success) setPhases(json.phases ?? []);
    } finally {
      setLoading(false);
    }
  }, [trainingId]);

  useEffect(() => { loadPhases(); }, [loadPhases]);

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
    const mkPhase = (type: PhaseType, order: number): PhaseWithExercises => ({
      id: crypto.randomUUID(), training_session_id: trainingId, club_id: "",
      phase_type: type, phase_name: null, phase_order: order, duration_minutes: null,
      notes: null, created_at: "", updated_at: "", exercises: [],
    });
    savePhases([mkPhase("initial", 0), mkPhase("main", 1), mkPhase("final", 2)]);
  }

  function handleAddExercise(phaseId: string, exercise: Exercise) {
    setPhases((prev) => prev.map((p) => {
      if (p.id !== phaseId) return p;
      const newEx: TrainingPhaseExercise & { exercise?: Exercise | null } = {
        id: crypto.randomUUID(), phase_id: phaseId, exercise_id: exercise.id,
        club_id: "", exercise_order: p.exercises.length, repetitions: 1,
        created_at: "", exercise,
      };
      return { ...p, exercises: [...p.exercises, newEx] };
    }));
    setPickerPhaseId(null);
  }

  function handleRemoveExercise(phaseId: string, index: number) {
    setPhases((prev) => prev.map((p) => p.id !== phaseId ? p : { ...p, exercises: p.exercises.filter((_, i) => i !== index) }));
  }

  function handleMoveExercise(phaseId: string, index: number, direction: -1 | 1) {
    setPhases((prev) => prev.map((p) => {
      if (p.id !== phaseId) return p;
      const target = index + direction;
      if (target < 0 || target >= p.exercises.length) return p;
      const next = [...p.exercises];
      [next[index], next[target]] = [next[target], next[index]];
      return { ...p, exercises: next };
    }));
  }

  function handleAddCustomPhase() {
    setPhases((prev) => [...prev, {
      id: crypto.randomUUID(), training_session_id: trainingId, club_id: "",
      phase_type: "custom" as PhaseType, phase_name: "Nova Fase", phase_order: prev.length,
      duration_minutes: null, notes: null, created_at: "", updated_at: "", exercises: [],
    }]);
  }

  function handleRemovePhase(index: number) {
    setPhases((prev) => prev.filter((_, i) => i !== index));
  }

  if (loading) {
    return <div className="flex items-center justify-center py-8"><Loader2 size={24} className="animate-spin text-slate-400" /></div>;
  }

  /* ── UT Header ── */
  const utHeader = (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-slate-900">Unidade de Treino</h2>
        {onExportPdf && phases.length > 0 && (
          <Button type="button" variant="outline" size="sm" className="border-emerald-200 text-emerald-700 hover:bg-emerald-50" onClick={onExportPdf}>
            <FileDown size={14} className="mr-1.5" />PDF
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        {session.ut_number != null && <Field label="UT" value={session.ut_number} />}
        {session.microcycle_number != null && <Field label="Microciclo" value={session.microcycle_number} />}
        {session.mesocycle_number != null && <Field label="Mesociclo" value={session.mesocycle_number} />}
        <Field label="Período" value={session.period_type ? (PERIOD_LABELS[session.period_type] ?? session.period_type) : null} />
        <Field label="Foco" value={session.focus ? (FOCUS_LABELS[session.focus] ?? session.focus) : null} />
        <Field label="Intensidade" value={session.intensity ? (INTENSITY_LABELS[session.intensity] ?? session.intensity) : null} />
        <Field label="Área de treino" value={session.field_area ? (FIELD_AREA_LABELS[session.field_area] ?? session.field_area) : null} className="col-span-2" />
        <Field label="Objectivo principal" value={session.objective} className="col-span-2" />
        <Field label="Obj. complementares" value={session.complementary_objectives} className="col-span-2" />
        <Field label="Instrução Inicial" value={session.initial_instruction} className="col-span-2" />
        <Field label="Material" value={session.material} className="col-span-2" />
      </div>
    </div>
  );

  /* ── Empty state ── */
  if (phases.length === 0) {
    return (
      <div>
        {utHeader}
        {!readOnly && (
          <div className="text-center py-6">
            <BookOpen size={32} className="text-slate-200 mx-auto mb-2" />
            <p className="text-sm text-slate-500 mb-3">Ainda sem fases definidas.</p>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={initDefaultPhases}>
              <Plus size={16} className="mr-2" />Adicionar UT (3 fases)
            </Button>
          </div>
        )}
      </div>
    );
  }

  /* ── Phases ── */
  return (
    <div>
      {utHeader}

      <div className="space-y-3">
        {phases.map((phase, phaseIdx) => (
          <div key={phase.id} className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            {/* Phase header with TR/TA column labels */}
            <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-800">
                  {phase.phase_type === "custom" ? (phase.phase_name || "Fase Personalizada") : PHASE_TYPE_LABELS[phase.phase_type]}
                </h3>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-semibold text-slate-400 w-8 text-center">TR</span>
                <span className="text-[10px] font-semibold text-slate-400 w-10 text-center">TA</span>
                {!readOnly && phase.phase_type === "custom" && (
                  <button type="button" onClick={() => handleRemovePhase(phaseIdx)} className="p-1 rounded text-slate-400 hover:text-red-500" title="Remover fase">
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Exercises */}
            <div className="divide-y divide-slate-50">
              {phase.exercises.map((phaseEx, exIdx) => {
                const ex = phaseEx.exercise;
                const name = phaseEx.custom_name || ex?.name || "Exercício";
                const duration = phaseEx.custom_duration_minutes ?? ex?.duration_minutes;
                const description = phaseEx.custom_description || ex?.description;
                const category = ex?.category as ExerciseCategory | undefined;
                const diagramUrl = phaseEx.custom_diagram_url || ex?.diagram_url;
                const restMin = phaseEx.custom_rest_minutes ?? ex?.rest_minutes;
                const ta = calculateTA(phases, phaseIdx, exIdx);
                const isExpanded = expandedExercise === phaseEx.id;
                const catColor = category ? CATEGORY_COLORS[category] : null;

                return (
                  <div key={phaseEx.id}>
                    <div className="flex items-start gap-3 px-4 py-2.5">
                      {/* Thumbnail */}
                      {diagramUrl ? (
                        <img src={diagramUrl} alt="" className="h-12 w-12 flex-shrink-0 rounded object-cover mt-0.5" />
                      ) : (
                        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded bg-slate-100 mt-0.5">
                          <BookOpen size={14} className="text-slate-300" />
                        </div>
                      )}

                      {/* Main info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-slate-800 truncate">{name}</p>
                          {duration != null && duration > 0 && (
                            <span className="flex-shrink-0 text-xs text-slate-500">{duration}&apos;</span>
                          )}
                        </div>
                        {description && (
                          <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">{description}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          {category && (
                            <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ${catColor?.bg ?? "bg-slate-100"} ${catColor?.text ?? "text-slate-600"}`}>
                              {CATEGORY_LABELS[category] ?? category}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* TR / TA + actions */}
                      <div className="flex items-center gap-3 flex-shrink-0 mt-1">
                        <span className="text-[11px] text-slate-400 w-8 text-center">
                          {restMin && restMin > 0 ? `${restMin}'` : "—"}
                        </span>
                        <span className="text-[11px] font-medium text-slate-600 w-10 text-center">
                          {formatTA(ta)}
                        </span>
                        <div className="flex items-center gap-0.5">
                          <button type="button" onClick={() => setExpandedExercise(isExpanded ? null : phaseEx.id)} className="p-1 rounded text-slate-400 hover:text-emerald-600" title={isExpanded ? "Fechar" : "Detalhes"}>
                            {isExpanded ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                          {!readOnly && (
                            <>
                              <button type="button" onClick={() => handleMoveExercise(phase.id, exIdx, -1)} disabled={exIdx === 0} className="p-1 rounded text-slate-400 hover:text-slate-700 disabled:opacity-30"><ChevronUp size={14} /></button>
                              <button type="button" onClick={() => handleMoveExercise(phase.id, exIdx, 1)} disabled={exIdx === phase.exercises.length - 1} className="p-1 rounded text-slate-400 hover:text-slate-700 disabled:opacity-30"><ChevronDown size={14} /></button>
                              <button type="button" onClick={() => handleRemoveExercise(phase.id, exIdx)} className="p-1 rounded text-slate-400 hover:text-red-500"><X size={14} /></button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Expanded */}
                    {isExpanded && <ExerciseExpandedDetails phaseEx={phaseEx} exercise={ex} />}
                  </div>
                );
              })}
            </div>

            {/* Add exercise */}
            {!readOnly && (
              <div className="px-4 py-2.5 border-t border-slate-50">
                <button type="button" onClick={() => setPickerPhaseId(phase.id)} className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 hover:text-emerald-700">
                  <Plus size={14} />Adicionar Exercício
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Bottom actions */}
      {!readOnly && (
        <div className="flex flex-wrap gap-2 mt-4">
          <Button type="button" variant="outline" size="sm" onClick={handleAddCustomPhase}>
            <Plus size={14} className="mr-1.5" />Fase Personalizada
          </Button>
          <Button type="button" size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => savePhases(phases)} disabled={saving}>
            {saving && <Loader2 size={14} className="animate-spin mr-1.5" />}
            Guardar UT
          </Button>
        </div>
      )}

      <ExercisePicker
        open={!!pickerPhaseId}
        onClose={() => setPickerPhaseId(null)}
        onSelect={(exercise) => { if (pickerPhaseId) handleAddExercise(pickerPhaseId, exercise); }}
      />
    </div>
  );
}

/* ── Sub-components ── */

function Field({ label, value, className }: { label: string; value: unknown; className?: string }) {
  return (
    <div className={className}>
      <span className="text-slate-400">{label}</span>{" "}
      <span className="font-medium text-slate-700">{value != null && value !== "" ? String(value) : "—"}</span>
    </div>
  );
}

function ExerciseExpandedDetails({ phaseEx, exercise }: { phaseEx: TrainingPhaseExercise; exercise?: Exercise | null }) {
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
        <img src={diagramUrl} alt="Diagrama tático" className="w-full max-h-48 rounded-lg object-contain bg-white border border-slate-100" />
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
        {gameFormat && <div><span className="text-slate-400">Forma:</span> <span className="font-medium text-slate-700">{gameFormat}</span></div>}
        {numPlayers != null && <div className="flex items-center gap-0.5"><Users size={11} className="text-slate-400" /><span className="font-medium text-slate-700">{numPlayers}</span></div>}
        {fieldDimensions && <div><span className="text-slate-400">Espaço:</span> <span className="font-medium text-slate-700">{fieldDimensions}</span></div>}
        {material && <div><span className="text-slate-400">Material:</span> <span className="font-medium text-slate-700">{material}</span></div>}
        {duration != null && <div><span className="text-slate-400">Duração:</span> <span className="font-medium text-slate-700">{duration}&apos;</span></div>}
        {restMinutes != null && restMinutes > 0 && <div><span className="text-slate-400">Descanso:</span> <span className="font-medium text-slate-700">{restMinutes}&apos;</span></div>}
        {phaseEx.repetitions > 1 && <div><span className="text-slate-400">Repetições:</span> <span className="font-medium text-slate-700">{phaseEx.repetitions}</span></div>}
      </div>
      {phaseEx.notes && (
        <div>
          <p className="text-[10px] font-semibold uppercase text-slate-400">Notas</p>
          <p className="text-xs text-slate-700">{phaseEx.notes}</p>
        </div>
      )}
    </div>
  );
}
