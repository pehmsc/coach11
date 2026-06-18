"use client";

import { useState, useCallback, useRef } from "react";
import NextImage from "next/image";
import { Check, Loader2, Pencil, PencilRuler, Upload, X, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CATEGORY_OPTIONS, ORIENTATION_OPTIONS, REGIME_OPTIONS } from "./category-labels";
import type {
  Exercise,
  ExerciseCategory,
  ExerciseDiagram,
  ExerciseOrientation,
  ExerciseRegime,
} from "@/types/database";
import { ExerciseEditor } from "@/components/editor/ExerciseEditor";
import { pngBlobToFile } from "@/lib/editor/export";

export type ExerciseFormValues = {
  name: string;
  category: ExerciseCategory;
  subcategory: string;
  description: string;
  objectives: string;
  success_criteria: string;
  game_format: string;
  duration_minutes: string;
  rest_minutes: string;
  min_players: string;
  max_players: string;
  field_dimensions: string;
  material: string;
  diagram_url: string;
  diagram_json: ExerciseDiagram | null;
  diagram_type: "image" | "editor" | null;
  orientation: string;
  regime: string;
  notes: string;
};

const EMPTY_FORM: ExerciseFormValues = {
  name: "",
  category: "principios_de_jogo",
  subcategory: "",
  description: "",
  objectives: "",
  success_criteria: "",
  game_format: "",
  duration_minutes: "",
  rest_minutes: "",
  min_players: "",
  max_players: "",
  field_dimensions: "",
  material: "",
  diagram_url: "",
  diagram_json: null,
  diagram_type: null,
  orientation: "",
  regime: "",
  notes: "",
};

function exerciseToForm(ex: Exercise): ExerciseFormValues {
  return {
    name: ex.name,
    category: ex.category,
    subcategory: ex.subcategory ?? "",
    description: ex.description ?? "",
    objectives: ex.objectives ?? "",
    success_criteria: ex.success_criteria ?? "",
    game_format: ex.game_format ?? "",
    duration_minutes: ex.duration_minutes?.toString() ?? "",
    rest_minutes: ex.rest_minutes?.toString() ?? "",
    min_players: ex.min_players?.toString() ?? "",
    max_players: ex.max_players?.toString() ?? "",
    field_dimensions: ex.field_dimensions ?? "",
    material: ex.material ?? "",
    diagram_url: ex.diagram_url ?? "",
    diagram_json: ex.diagram_json ?? null,
    diagram_type: ex.diagram_type ?? null,
    orientation: ex.orientation ?? "",
    regime: ex.regime ?? "",
    notes: ex.notes ?? "",
  };
}

type Props = {
  exercise?: Exercise | null;
  prefill?: Partial<ExerciseFormValues>;
  onSubmit: (values: ExerciseFormValues) => Promise<void>;
  onCancel: () => void;
  submitting?: boolean;
};

export function ExerciseForm({ exercise, prefill, onSubmit, onCancel, submitting }: Props) {
  const [values, setValues] = useState<ExerciseFormValues>(
    exercise ? exerciseToForm(exercise) : { ...EMPTY_FORM, ...prefill },
  );
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function set<K extends keyof ExerciseFormValues>(key: K, value: ExerciseFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  const handleUpload = useCallback(
    async (file: File) => {
      if (uploading) return;
      setUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/exercises/upload-image", {
          method: "POST",
          body: formData,
        });
        const json = await res.json();
        if (json.success && json.url) {
          // Upload manual: imagem estática, sem JSON reeditável.
          setValues((prev) => ({
            ...prev,
            diagram_url: json.url,
            diagram_json: null,
            diagram_type: "image",
          }));
        }
      } finally {
        setUploading(false);
      }
    },
    [uploading],
  );

  // Renderiza o PNG do editor, faz upload e guarda o JSON reeditável.
  const handleEditorComplete = useCallback(async (diagram: ExerciseDiagram, png: Blob) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", pngBlobToFile(png, "diagrama.png"));
      const res = await fetch("/api/exercises/upload-image", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (json.success && json.url) {
        setValues((prev) => ({
          ...prev,
          diagram_url: json.url,
          diagram_json: diagram,
          diagram_type: "editor",
        }));
      }
    } finally {
      setUploading(false);
    }
  }, []);

  function removeDiagram() {
    setValues((prev) => ({ ...prev, diagram_url: "", diagram_json: null, diagram_type: null }));
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
      handleUpload(file);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
  }

  function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!values.name.trim() || !values.category) return;
    onSubmit(values);
  }

  const selectClass = "w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500";
  const textareaClass = "w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500";

  return (
    <>
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Informação geral */}
      <fieldset className="space-y-3">
        <legend className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Informação geral</legend>
        <div className="space-y-1">
          <Label>Nome *</Label>
          <Input
            value={values.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Ex: MPB c/ Caixa de Rutura"
            required
          />
        </div>
        <div className="space-y-1">
          <Label>Objetivos Específicos</Label>
          <textarea value={values.objectives} onChange={(e) => set("objectives", e.target.value)} rows={2} className={textareaClass} placeholder="Objetivos específicos do exercício..." />
        </div>
        <div className="space-y-1">
          <Label>Descrição / Organização Metodológica</Label>
          <textarea value={values.description} onChange={(e) => set("description", e.target.value)} rows={3} className={textareaClass} placeholder="Descreve a organização do exercício..." />
        </div>
        <div className="space-y-1">
          <Label>Critério de Sucesso</Label>
          <Input value={values.success_criteria} onChange={(e) => set("success_criteria", e.target.value)} placeholder="Ex: 80% posse de bola na zona de rutura" />
        </div>
      </fieldset>

      {/* Classificação */}
      <fieldset className="space-y-3">
        <legend className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Classificação</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Categoria *</Label>
            <select value={values.category} onChange={(e) => set("category", e.target.value as ExerciseCategory)} className={selectClass}>
              {CATEGORY_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label>Subcategoria</Label>
            <Input value={values.subcategory} onChange={(e) => set("subcategory", e.target.value)} placeholder="Ex: Mobilização articular" />
          </div>
          <div className="space-y-1">
            <Label>Orientação</Label>
            <select value={values.orientation} onChange={(e) => set("orientation", e.target.value as ExerciseOrientation | "")} className={selectClass}>
              <option value="">—</option>
              {ORIENTATION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label>Regime</Label>
            <select value={values.regime} onChange={(e) => set("regime", e.target.value as ExerciseRegime | "")} className={selectClass}>
              <option value="">—</option>
              {REGIME_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
      </fieldset>

      {/* Parâmetros */}
      <fieldset className="space-y-3">
        <legend className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Parâmetros</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label>Duração (min)</Label>
            <Input type="number" min={1} value={values.duration_minutes} onChange={(e) => set("duration_minutes", e.target.value)} placeholder="15" />
          </div>
          <div className="space-y-1">
            <Label>Descanso (min)</Label>
            <Input type="number" min={0} value={values.rest_minutes} onChange={(e) => set("rest_minutes", e.target.value)} placeholder="0" />
          </div>
          <div className="space-y-1">
            <Label>Forma</Label>
            <Input value={values.game_format} onChange={(e) => set("game_format", e.target.value)} placeholder="4x4+3" />
          </div>
          <div className="space-y-1">
            <Label>Mín. Jogadores</Label>
            <Input type="number" min={1} value={values.min_players} onChange={(e) => set("min_players", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Máx. Jogadores</Label>
            <Input type="number" min={1} value={values.max_players} onChange={(e) => set("max_players", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Espaço</Label>
            <Input value={values.field_dimensions} onChange={(e) => set("field_dimensions", e.target.value)} placeholder="30m x 20m" />
          </div>
        </div>
        <div className="space-y-1">
          <Label>Material</Label>
          <Input value={values.material} onChange={(e) => set("material", e.target.value)} placeholder="14 Pinos, 4 Bolas, 8 Coletes" />
        </div>
      </fieldset>

      {/* Diagrama tático */}
      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Diagrama</legend>
        {values.diagram_url ? (
          <div className="relative rounded-lg border border-slate-200 p-2">
            <div className="relative h-48 w-full">
              <NextImage src={values.diagram_url} alt="Diagrama tático" fill className="rounded object-contain" />
            </div>
            <div className="absolute top-1 right-1 flex gap-1">
              {values.diagram_type === "editor" && values.diagram_json && (
                <button
                  type="button"
                  onClick={() => setEditorOpen(true)}
                  className="rounded-full bg-white/90 p-1 text-emerald-600 hover:text-emerald-700"
                  aria-label="Editar diagrama"
                >
                  <Pencil size={16} />
                </button>
              )}
              <button
                type="button"
                onClick={removeDiagram}
                className="rounded-full bg-white/80 p-1 text-slate-500 hover:text-red-500"
                aria-label="Remover diagrama"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-5 transition-colors ${dragOver ? "border-emerald-400 bg-emerald-50" : "border-slate-200 bg-slate-50 hover:border-slate-300"}`}
            >
              {uploading ? (
                <Loader2 size={22} className="animate-spin text-slate-400" />
              ) : (
                <>
                  <ImageIcon size={22} className="text-slate-300" />
                  <span className="text-center text-xs text-slate-400">Adicionar imagem<br />(max 5MB)</span>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => setEditorOpen(true)}
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-emerald-200 bg-emerald-50/50 p-5 text-emerald-700 transition-colors hover:border-emerald-400"
            >
              <PencilRuler size={22} />
              <span className="text-center text-xs font-medium">Abrir editor</span>
            </button>
          </div>
        )}
        <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFileChange} className="hidden" />
      </fieldset>

      {/* Notas */}
      <div className="space-y-1">
        <Label>Notas adicionais</Label>
        <textarea value={values.notes} onChange={(e) => set("notes", e.target.value)} rows={2} className={textareaClass} placeholder="Notas adicionais..." />
      </div>

      <div className="flex gap-2 pt-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-700" disabled={submitting || !values.name.trim()}>
          {submitting ? <Loader2 size={16} className="animate-spin mr-2" /> : <Upload size={16} className="mr-2" />}
          {exercise ? "Guardar" : "Criar Exercício"}
        </Button>
      </div>
    </form>

      <ExerciseEditor
        open={editorOpen}
        title="Diagrama do exercício"
        initialDiagram={values.diagram_type === "editor" ? values.diagram_json : null}
        onClose={() => setEditorOpen(false)}
        busy={uploading}
        exitActions={[
          {
            key: "done",
            label: "Concluir",
            primary: true,
            icon: Check,
            run: async ({ diagram, renderPng }) => {
              const png = await renderPng();
              await handleEditorComplete(diagram, png);
              setEditorOpen(false);
            },
          },
        ]}
      />
    </>
  );
}
