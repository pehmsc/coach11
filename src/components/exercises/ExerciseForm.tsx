"use client";

import { useState, useCallback, useRef } from "react";
import { Loader2, Upload, X, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CATEGORY_OPTIONS } from "./category-labels";
import type { Exercise, ExerciseCategory } from "@/types/database";

export type ExerciseFormValues = {
  name: string;
  category: ExerciseCategory;
  description: string;
  objectives: string;
  success_criteria: string;
  game_format: string;
  duration_minutes: string;
  min_players: string;
  max_players: string;
  field_dimensions: string;
  material: string;
  diagram_url: string;
};

const EMPTY_FORM: ExerciseFormValues = {
  name: "",
  category: "technical",
  description: "",
  objectives: "",
  success_criteria: "",
  game_format: "",
  duration_minutes: "",
  min_players: "",
  max_players: "",
  field_dimensions: "",
  material: "",
  diagram_url: "",
};

function exerciseToForm(ex: Exercise): ExerciseFormValues {
  return {
    name: ex.name,
    category: ex.category,
    description: ex.description ?? "",
    objectives: ex.objectives ?? "",
    success_criteria: ex.success_criteria ?? "",
    game_format: ex.game_format ?? "",
    duration_minutes: ex.duration_minutes?.toString() ?? "",
    min_players: ex.min_players?.toString() ?? "",
    max_players: ex.max_players?.toString() ?? "",
    field_dimensions: ex.field_dimensions ?? "",
    material: ex.material ?? "",
    diagram_url: ex.diagram_url ?? "",
  };
}

type Props = {
  exercise?: Exercise | null;
  onSubmit: (values: ExerciseFormValues) => Promise<void>;
  onCancel: () => void;
  submitting?: boolean;
};

export function ExerciseForm({ exercise, onSubmit, onCancel, submitting }: Props) {
  const [values, setValues] = useState<ExerciseFormValues>(
    exercise ? exerciseToForm(exercise) : EMPTY_FORM,
  );
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
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
          set("diagram_url", json.url);
        }
      } finally {
        setUploading(false);
      }
    },
    [uploading],
  );

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

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <Label>Nome *</Label>
          <Input
            value={values.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Ex: MPB c/ Caixa de Rutura"
            required
          />
        </div>

        <div className="space-y-1">
          <Label>Categoria *</Label>
          <select
            value={values.category}
            onChange={(e) => set("category", e.target.value as ExerciseCategory)}
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {CATEGORY_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <Label>Forma / Game Format</Label>
          <Input
            value={values.game_format}
            onChange={(e) => set("game_format", e.target.value)}
            placeholder="Ex: 4x4+3, GR+1x1"
          />
        </div>

        <div className="space-y-1">
          <Label>Duração (min)</Label>
          <Input
            type="number"
            min={1}
            value={values.duration_minutes}
            onChange={(e) => set("duration_minutes", e.target.value)}
            placeholder="15"
          />
        </div>

        <div className="space-y-1">
          <Label>Espaço / Dimensões</Label>
          <Input
            value={values.field_dimensions}
            onChange={(e) => set("field_dimensions", e.target.value)}
            placeholder="Ex: 30m x 20m"
          />
        </div>

        <div className="space-y-1">
          <Label>Nº Mín. Jogadores</Label>
          <Input
            type="number"
            min={1}
            value={values.min_players}
            onChange={(e) => set("min_players", e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <Label>Nº Máx. Jogadores</Label>
          <Input
            type="number"
            min={1}
            value={values.max_players}
            onChange={(e) => set("max_players", e.target.value)}
          />
        </div>

        <div className="space-y-1 sm:col-span-2">
          <Label>Material</Label>
          <Input
            value={values.material}
            onChange={(e) => set("material", e.target.value)}
            placeholder="Ex: 14 Pinos, 4 Bolas, 8 Coletes"
          />
        </div>

        <div className="space-y-1 sm:col-span-2">
          <Label>Descrição / Organização Metodológica</Label>
          <textarea
            value={values.description}
            onChange={(e) => set("description", e.target.value)}
            rows={3}
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            placeholder="Descreve a organização do exercício..."
          />
        </div>

        <div className="space-y-1 sm:col-span-2">
          <Label>Objetivos Específicos</Label>
          <textarea
            value={values.objectives}
            onChange={(e) => set("objectives", e.target.value)}
            rows={2}
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            placeholder="Objetivos específicos do exercício..."
          />
        </div>

        <div className="space-y-1 sm:col-span-2">
          <Label>Critério de Sucesso</Label>
          <Input
            value={values.success_criteria}
            onChange={(e) => set("success_criteria", e.target.value)}
            placeholder="Ex: 80% posse de bola na zona de rutura"
          />
        </div>
      </div>

      {/* Diagrama tático — upload */}
      <div className="space-y-1">
        <Label>Diagrama Tático</Label>
        {values.diagram_url ? (
          <div className="relative rounded-lg border border-slate-200 p-2">
            <img
              src={values.diagram_url}
              alt="Diagrama tático"
              className="mx-auto max-h-48 rounded object-contain"
            />
            <button
              type="button"
              onClick={() => set("diagram_url", "")}
              className="absolute top-1 right-1 rounded-full bg-white/80 p-1 text-slate-500 hover:text-red-500"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 transition-colors ${
              dragOver
                ? "border-emerald-400 bg-emerald-50"
                : "border-slate-200 bg-slate-50 hover:border-slate-300"
            }`}
          >
            {uploading ? (
              <Loader2 size={24} className="animate-spin text-slate-400" />
            ) : (
              <>
                <ImageIcon size={24} className="text-slate-300" />
                <span className="text-xs text-slate-400">
                  Arrasta ou clica para enviar imagem (max 5MB)
                </span>
              </>
            )}
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      <div className="flex gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={onCancel}
        >
          Cancelar
        </Button>
        <Button
          type="submit"
          className="flex-1 bg-emerald-600 hover:bg-emerald-700"
          disabled={submitting || !values.name.trim()}
        >
          {submitting ? (
            <Loader2 size={16} className="animate-spin mr-2" />
          ) : (
            <Upload size={16} className="mr-2" />
          )}
          {exercise ? "Guardar" : "Criar Exercício"}
        </Button>
      </div>
    </form>
  );
}
