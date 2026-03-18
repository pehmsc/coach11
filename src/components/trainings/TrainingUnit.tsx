"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
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
  Pencil,
} from "lucide-react";
import { Input } from "@/components/ui/input";
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
const FOCUS_LABELS: Record<string, string> = { tactical: "Tática", technical: "Técnica", physical: "Física", mixed: "Misto" };
const INTENSITY_LABELS: Record<string, string> = { low: "Baixo", medium: "Médio", high: "Alto", very_high: "Muito Alto" };
const FIELD_AREA_LABELS: Record<string, string> = { complete: "Campo Inteiro", half: "Meio Campo", third: "1/3 Campo", quarter: "1/4 Campo" };

const PERIOD_OPTIONS = [
  { value: "", label: "—" },
  { value: "pre_season", label: "Pré-época" },
  { value: "competitive", label: "Competitivo" },
  { value: "transition", label: "Transição" },
];
const FOCUS_OPTIONS = [
  { value: "", label: "—" },
  { value: "tactical", label: "Tática" },
  { value: "technical", label: "Técnica" },
  { value: "physical", label: "Física" },
  { value: "mixed", label: "Misto" },
];
const INTENSITY_OPTIONS = [
  { value: "", label: "—" },
  { value: "low", label: "Baixo" },
  { value: "medium", label: "Médio" },
  { value: "high", label: "Alto" },
  { value: "very_high", label: "Muito Alto" },
];
const FIELD_AREA_OPTIONS = [
  { value: "", label: "—" },
  { value: "complete", label: "Campo Inteiro" },
  { value: "half", label: "Meio Campo" },
  { value: "third", label: "1/3 Campo" },
  { value: "quarter", label: "1/4 Campo" },
];

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

function getExRest(ex: TrainingPhaseExercise & { exercise?: Exercise | null }): number {
  return ex.custom_rest_minutes ?? ex.exercise?.rest_minutes ?? 0;
}

/** TR = Tempo Real = duração + descanso */
function calculateTR(ex: TrainingPhaseExercise & { exercise?: Exercise | null }): number {
  return getExDuration(ex) + getExRest(ex);
}

/** TA = Tempo Acumulado = soma de todos os TRs desde o início da UT */
function calculateTA(phases: PhaseWithExercises[], phaseIdx: number, exIdx: number): number {
  let total = 0;
  for (let p = 0; p <= phaseIdx; p++) {
    const exercises = phases[p].exercises;
    const limit = p === phaseIdx ? exIdx + 1 : exercises.length;
    for (let e = 0; e < limit; e++) {
      total += calculateTR(exercises[e]);
    }
  }
  return total;
}

/* ── Types ────────────────────────────────── */

type PhaseWithExercises = TrainingPhase & {
  exercises: (TrainingPhaseExercise & { exercise?: Exercise | null })[];
};

type HeaderFormState = {
  microcycle_number: string;
  mesocycle_number: string;
  period_type: string;
  focus: string;
  intensity: string;
  field_area: string;
  objective: string;
  complementary_objectives: string;
  initial_instruction: string;
  material: string;
};

type Props = {
  trainingId: string;
  session: TrainingRow;
  readOnly?: boolean;
  onExportPdf?: () => void;
  onSessionSaved?: () => void;
};

/* ── Main Component ────────────────────────── */

export function TrainingUnit({ trainingId, session, readOnly = false, onExportPdf, onSessionSaved }: Props) {
  const [phases, setPhases] = useState<PhaseWithExercises[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedExercise, setExpandedExercise] = useState<string | null>(null);
  const [pickerPhaseId, setPickerPhaseId] = useState<string | null>(null);
  const [editingHeader, setEditingHeader] = useState(false);
  const [savingHeader, setSavingHeader] = useState(false);
  const [headerForm, setHeaderForm] = useState<HeaderFormState>({
    microcycle_number: "", mesocycle_number: "", period_type: "", focus: "",
    intensity: "", field_area: "", objective: "", complementary_objectives: "",
    initial_instruction: "", material: "",
  });

  function openHeaderEdit() {
    setHeaderForm({
      microcycle_number: session.microcycle_number?.toString() ?? "",
      mesocycle_number: session.mesocycle_number?.toString() ?? "",
      period_type: session.period_type ?? "",
      focus: session.focus ?? "",
      intensity: session.intensity ?? "",
      field_area: session.field_area ?? "",
      objective: session.objective ?? "",
      complementary_objectives: session.complementary_objectives ?? "",
      initial_instruction: session.initial_instruction ?? "",
      material: session.material ?? "",
    });
    setEditingHeader(true);
  }

  async function saveHeaderEdit() {
    setSavingHeader(true);
    try {
      const res = await fetch(`/api/trainings/${trainingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          microcycle_number: headerForm.microcycle_number ? parseInt(headerForm.microcycle_number, 10) : null,
          mesocycle_number: headerForm.mesocycle_number ? parseInt(headerForm.mesocycle_number, 10) : null,
          period_type: headerForm.period_type || null,
          focus: headerForm.focus || null,
          intensity: headerForm.intensity || null,
          field_area: headerForm.field_area || null,
          objective: headerForm.objective || null,
          complementary_objectives: headerForm.complementary_objectives || null,
          initial_instruction: headerForm.initial_instruction || null,
          material: headerForm.material || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast.error(json.error || "Erro ao guardar planeamento.");
        return;
      }
      toast.success("Planeamento guardado.");
      setEditingHeader(false);
      onSessionSaved?.();
    } finally {
      setSavingHeader(false);
    }
  }

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
  const selectCls = "w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500";
  const inputCls = "h-8 text-xs";

  const utHeader = (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-slate-900">Unidade de Treino</h2>
        <div className="flex items-center gap-1.5">
          {!readOnly && !editingHeader && (
            <Button type="button" variant="outline" size="sm" onClick={openHeaderEdit}>
              <Pencil size={14} className="mr-1.5" />Editar
            </Button>
          )}
          {editingHeader && (
            <>
              <Button type="button" variant="outline" size="sm" onClick={() => setEditingHeader(false)} disabled={savingHeader}>Cancelar</Button>
              <Button type="button" size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => void saveHeaderEdit()} disabled={savingHeader}>
                {savingHeader ? <Loader2 size={14} className="animate-spin mr-1" /> : null}Guardar
              </Button>
            </>
          )}
          {onExportPdf && phases.length > 0 && !editingHeader && (
            <Button type="button" variant="outline" size="sm" className="border-emerald-200 text-emerald-700 hover:bg-emerald-50" onClick={onExportPdf}>
              <FileDown size={14} className="mr-1.5" />PDF
            </Button>
          )}
        </div>
      </div>

      {editingHeader ? (
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="space-y-1">
            <label className="text-slate-400">Microciclo</label>
            <Input type="number" className={inputCls} value={headerForm.microcycle_number} onChange={(e) => setHeaderForm((f) => ({ ...f, microcycle_number: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <label className="text-slate-400">Mesociclo</label>
            <Input type="number" className={inputCls} value={headerForm.mesocycle_number} onChange={(e) => setHeaderForm((f) => ({ ...f, mesocycle_number: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <label className="text-slate-400">Período</label>
            <select className={selectCls} value={headerForm.period_type} onChange={(e) => setHeaderForm((f) => ({ ...f, period_type: e.target.value }))}>
              {PERIOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-slate-400">Foco</label>
            <select className={selectCls} value={headerForm.focus} onChange={(e) => setHeaderForm((f) => ({ ...f, focus: e.target.value }))}>
              {FOCUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-slate-400">Intensidade</label>
            <select className={selectCls} value={headerForm.intensity} onChange={(e) => setHeaderForm((f) => ({ ...f, intensity: e.target.value }))}>
              {INTENSITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-slate-400">Área de treino</label>
            <select className={selectCls} value={headerForm.field_area} onChange={(e) => setHeaderForm((f) => ({ ...f, field_area: e.target.value }))}>
              {FIELD_AREA_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="space-y-1 col-span-2">
            <label className="text-slate-400">Objectivo principal</label>
            <Input className={inputCls} value={headerForm.objective} onChange={(e) => setHeaderForm((f) => ({ ...f, objective: e.target.value }))} placeholder="Objectivo do treino" />
          </div>
          <div className="space-y-1 col-span-2">
            <label className="text-slate-400">Obj. complementares</label>
            <Input className={inputCls} value={headerForm.complementary_objectives} onChange={(e) => setHeaderForm((f) => ({ ...f, complementary_objectives: e.target.value }))} />
          </div>
          <div className="space-y-1 col-span-2">
            <label className="text-slate-400">Instrução Inicial</label>
            <Input className={inputCls} value={headerForm.initial_instruction} onChange={(e) => setHeaderForm((f) => ({ ...f, initial_instruction: e.target.value }))} placeholder="Ex: Concentração 18:15" />
          </div>
          <div className="space-y-1 col-span-2">
            <label className="text-slate-400">Material</label>
            <Input className={inputCls} value={headerForm.material} onChange={(e) => setHeaderForm((f) => ({ ...f, material: e.target.value }))} placeholder="Ex: 18 bolas, 2 balizas, coletes" />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          {session.ut_number != null && <Field label="UT" value={session.ut_number} />}
          <Field label="Microciclo" value={session.microcycle_number} />
          <Field label="Mesociclo" value={session.mesocycle_number} />
          <Field label="Período" value={session.period_type ? (PERIOD_LABELS[session.period_type] ?? session.period_type) : null} />
          <Field label="Foco" value={session.focus ? (FOCUS_LABELS[session.focus] ?? session.focus) : null} />
          <Field label="Intensidade" value={session.intensity ? (INTENSITY_LABELS[session.intensity] ?? session.intensity) : null} />
          <Field label="Área de treino" value={session.field_area ? (FIELD_AREA_LABELS[session.field_area] ?? session.field_area) : null} className="col-span-2" />
          <Field label="Objectivo principal" value={session.objective} className="col-span-2" />
          <Field label="Obj. complementares" value={session.complementary_objectives} className="col-span-2" />
          <Field label="Instrução Inicial" value={session.initial_instruction} className="col-span-2" />
          <Field label="Material" value={session.material} className="col-span-2" />
        </div>
      )}
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
                <span className="text-[10px] font-semibold text-slate-400 w-8 text-right cursor-help underline decoration-dotted decoration-slate-300" title="Tempo Real (duração + descanso)">TR</span>
                <span className="text-[10px] font-semibold text-slate-400 w-10 text-right cursor-help underline decoration-dotted decoration-slate-300" title="Tempo Acumulado desde o início da UT">TA</span>
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
                const restMin = phaseEx.custom_rest_minutes ?? ex?.rest_minutes ?? 0;
                const tr = calculateTR(phaseEx);
                const ta = calculateTA(phases, phaseIdx, exIdx);
                const isExpanded = expandedExercise === phaseEx.id;
                const catColor = category ? CATEGORY_COLORS[category] : null;

                return (
                  <div key={phaseEx.id}>
                    <div className="flex gap-3 px-4 py-2.5">
                      {/* Thumbnail */}
                      {diagramUrl ? (
                        <Image src={diagramUrl} alt="" width={48} height={48} className="h-12 w-12 flex-shrink-0 rounded object-cover" />
                      ) : (
                        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded bg-slate-100">
                          <BookOpen size={14} className="text-slate-300" />
                        </div>
                      )}

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 leading-snug">{name}</p>
                        {description && (
                          <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">{description}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          {category && (
                            <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ${catColor?.bg ?? "bg-slate-100"} ${catColor?.text ?? "text-slate-600"}`}>
                              {CATEGORY_LABELS[category] ?? category}
                            </span>
                          )}
                          {duration != null && duration > 0 && (
                            <span className="text-[11px] text-slate-500">{duration}&apos;</span>
                          )}
                          {restMin > 0 && (
                            <span className="text-[11px] text-slate-400">+{restMin}&apos; desc.</span>
                          )}
                        </div>
                      </div>

                      {/* Right column: TR/TA + action buttons */}
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <div className="flex gap-3">
                          <span className="text-[11px] text-slate-500 w-8 text-right">{tr > 0 ? `${tr}'` : "—"}</span>
                          <span className="text-[11px] font-medium text-slate-600 w-10 text-right">{formatTA(ta)}</span>
                        </div>
                        <div className="flex items-center gap-0.5 mt-0.5">
                          <button type="button" onClick={() => setExpandedExercise(isExpanded ? null : phaseEx.id)} className="p-1.5 rounded text-slate-400 hover:text-emerald-600" title={isExpanded ? "Fechar detalhes" : "Ver detalhes"}>
                            {isExpanded ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                          {!readOnly && (
                            <>
                              <button type="button" onClick={() => handleMoveExercise(phase.id, exIdx, -1)} disabled={exIdx === 0} className="p-1.5 rounded text-slate-400 hover:text-slate-700 disabled:opacity-30" title="Mover para cima"><ChevronUp size={14} /></button>
                              <button type="button" onClick={() => handleMoveExercise(phase.id, exIdx, 1)} disabled={exIdx === phase.exercises.length - 1} className="p-1.5 rounded text-slate-400 hover:text-slate-700 disabled:opacity-30" title="Mover para baixo"><ChevronDown size={14} /></button>
                              <button type="button" onClick={() => handleRemoveExercise(phase.id, exIdx)} className="p-1.5 rounded text-slate-400 hover:text-red-500" title="Remover exercício"><X size={14} /></button>
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
        <div className="relative h-48 w-full">
          <Image src={diagramUrl} alt="Diagrama tático" fill className="rounded-lg object-contain bg-white border border-slate-100" />
        </div>
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
