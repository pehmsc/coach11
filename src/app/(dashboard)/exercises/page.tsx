"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Search, BookOpen, Clock, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppModal } from "@/components/ui/app-modal";
import { ExerciseForm, type ExerciseFormValues } from "@/components/exercises/ExerciseForm";
import {
  CATEGORY_LABELS,
  CATEGORY_COLORS,
  CATEGORY_OPTIONS,
} from "@/components/exercises/category-labels";
import { createClient } from "@/lib/supabase/client";
import type { Exercise, ExerciseCategory } from "@/types/database";
import { toast } from "sonner";
import { useListStateSync } from "@/hooks/useListStateSync";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

export default function ExercisesPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useListStateSync<string>("q", "");
  const [searchInput, setSearchInput] = useState(search);
  const debouncedSearchInput = useDebouncedValue(searchInput, 300);
  const [categoryFilter, setCategoryFilter] = useListStateSync<ExerciseCategory | "">("cat", "");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [detailExercise, setDetailExercise] = useState<Exercise | null>(null);

  const fetchExercises = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (categoryFilter) params.set("category", categoryFilter);
      if (search.trim()) params.set("search", search.trim());

      const res = await fetch(`/api/exercises?${params.toString()}`);
      const json = await res.json();

      if (json.success) {
        setExercises(json.exercises);
      }
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, search]);

  useEffect(() => {
    if (debouncedSearchInput !== search) {
      setSearch(debouncedSearchInput);
    }
  }, [debouncedSearchInput, search, setSearch]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchExercises();
    }, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [fetchExercises, search]);

  function openCreate() {
    setEditingExercise(null);
    setModalOpen(true);
  }

  function openEdit(ex: Exercise) {
    setEditingExercise(ex);
    setModalOpen(true);
  }

  async function handleSubmit(values: ExerciseFormValues) {
    setSubmitting(true);
    try {
      const payload = {
        name: values.name.trim(),
        category: values.category,
        subcategory: values.subcategory || null,
        description: values.description || null,
        objectives: values.objectives || null,
        success_criteria: values.success_criteria || null,
        game_format: values.game_format || null,
        rest_minutes: values.rest_minutes
          ? parseInt(values.rest_minutes, 10)
          : 0,
        duration_minutes: values.duration_minutes
          ? parseInt(values.duration_minutes, 10)
          : null,
        min_players: values.min_players
          ? parseInt(values.min_players, 10)
          : null,
        max_players: values.max_players
          ? parseInt(values.max_players, 10)
          : null,
        field_dimensions: values.field_dimensions || null,
        material: values.material || null,
        diagram_url: values.diagram_url || null,
        orientation: values.orientation || null,
        regime: values.regime || null,
        notes: values.notes || null,
      };

      const url = editingExercise
        ? `/api/exercises/${editingExercise.id}`
        : "/api/exercises";
      const method = editingExercise ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (json.success) {
        toast.success(
          editingExercise
            ? "Exercício atualizado."
            : "Exercício criado.",
        );
        setModalOpen(false);
        setEditingExercise(null);
        fetchExercises();
        router.refresh();
      } else {
        toast.error(json.error || "Erro ao guardar exercício.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/exercises/${id}`, { method: "DELETE" });
    const json = await res.json();
    if (json.success) {
      toast.success("Exercício apagado.");
      setDetailExercise(null);
      fetchExercises();
      router.refresh();
    } else {
      toast.error(json.error || "Erro ao apagar.");
    }
  }

  if (loading) {
    return (
      <div className="p-4 md:p-8 max-w-4xl mx-auto flex items-center justify-center py-16">
        <Loader2 size={28} className="animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <>
      <div className="p-4 md:p-8 max-w-4xl mx-auto">
        <div className="mb-6 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-slate-900">Exercícios</h1>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700"
            onClick={openCreate}
          >
            <Plus size={16} className="mr-2" />
            Novo Exercício
          </Button>
        </div>

        {/* Filters */}
        <div className="mb-4 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Pesquisar por nome..."
              className="pl-9"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) =>
              setCategoryFilter(e.target.value as ExerciseCategory | "")
            }
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">Todas as categorias</option>
            {CATEGORY_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {/* Grid */}
        {exercises.length === 0 ? (
          <div className="text-center py-16">
            <BookOpen size={40} className="text-slate-200 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">
              {search || categoryFilter
                ? "Nenhum exercício encontrado."
                : "Ainda não tens exercícios."}
            </p>
            {!search && !categoryFilter && (
              <Button
                className="mt-4 bg-emerald-600 hover:bg-emerald-700"
                onClick={openCreate}
              >
                <Plus size={16} className="mr-2" />
                Criar primeiro exercício
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {exercises.map((ex) => (
              <button
                key={ex.id}
                type="button"
                onClick={() => setDetailExercise(ex)}
                className="group relative flex flex-col overflow-hidden rounded-xl border border-slate-100 bg-white text-left shadow-sm transition-shadow hover:shadow-md"
              >
                {ex.diagram_url ? (
                  <div className="relative h-32 w-full overflow-hidden bg-slate-50">
                    <Image
                      src={ex.diagram_url}
                      alt={ex.name}
                      fill
                      className="object-cover transition-transform group-hover:scale-105"
                    />
                  </div>
                ) : (
                  <div className="flex h-32 w-full items-center justify-center bg-slate-50">
                    <BookOpen size={32} className="text-slate-200" />
                  </div>
                )}
                <div className="flex flex-1 flex-col gap-1 p-3">
                  <p className="font-medium text-slate-800 text-sm line-clamp-2">
                    {ex.name}
                  </p>
                  <span className={`inline-flex w-fit rounded-full px-2 py-0.5 text-[11px] font-medium ${CATEGORY_COLORS[ex.category]?.bg ?? "bg-slate-100"} ${CATEGORY_COLORS[ex.category]?.text ?? "text-slate-700"}`}>
                    {CATEGORY_LABELS[ex.category] ?? ex.category}
                  </span>
                  <div className="mt-auto flex items-center gap-3 pt-1 text-[11px] text-slate-400">
                    {ex.duration_minutes && (
                      <span className="flex items-center gap-0.5">
                        <Clock size={11} /> {ex.duration_minutes}&apos;
                      </span>
                    )}
                    {ex.game_format && (
                      <span className="flex items-center gap-0.5">
                        <Users size={11} /> {ex.game_format}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit modal */}
      <AppModal
        open={modalOpen}
        title={editingExercise ? "Editar Exercício" : "Novo Exercício"}
        onClose={() => {
          setModalOpen(false);
          setEditingExercise(null);
        }}
        panelClassName="max-w-lg"
      >
        <ExerciseForm
          exercise={editingExercise}
          onSubmit={handleSubmit}
          onCancel={() => {
            setModalOpen(false);
            setEditingExercise(null);
          }}
          submitting={submitting}
        />
      </AppModal>

      {/* Detail modal */}
      <AppModal
        open={!!detailExercise}
        title={detailExercise?.name ?? "Exercício"}
        onClose={() => setDetailExercise(null)}
        panelClassName="max-w-lg"
      >
        {detailExercise && (
          <ExerciseDetail
            exercise={detailExercise}
            onEdit={() => {
              setDetailExercise(null);
              openEdit(detailExercise);
            }}
            onDelete={() => handleDelete(detailExercise.id)}
          />
        )}
      </AppModal>
    </>
  );
}

function ExerciseDetail({
  exercise,
  onEdit,
  onDelete,
}: {
  exercise: Exercise;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="space-y-4">
      {exercise.diagram_url && (
        <div className="relative h-64 w-full">
          <Image
            src={exercise.diagram_url}
            alt="Diagrama tático"
            fill
            className="rounded-lg object-contain"
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
          {CATEGORY_LABELS[exercise.category] ?? exercise.category}
        </span>
        {exercise.game_format && (
          <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
            {exercise.game_format}
          </span>
        )}
        {exercise.duration_minutes && (
          <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
            {exercise.duration_minutes} min
          </span>
        )}
      </div>

      {exercise.description && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase mb-1">
            Descrição
          </p>
          <p className="text-sm text-slate-700 whitespace-pre-wrap">
            {exercise.description}
          </p>
        </div>
      )}

      {exercise.objectives && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase mb-1">
            Objetivos
          </p>
          <p className="text-sm text-slate-700 whitespace-pre-wrap">
            {exercise.objectives}
          </p>
        </div>
      )}

      {exercise.success_criteria && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase mb-1">
            Critério de Sucesso
          </p>
          <p className="text-sm text-slate-700">{exercise.success_criteria}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 text-sm">
        {exercise.field_dimensions && (
          <div>
            <p className="text-xs text-slate-400">Espaço</p>
            <p className="text-slate-700">{exercise.field_dimensions}</p>
          </div>
        )}
        {exercise.material && (
          <div>
            <p className="text-xs text-slate-400">Material</p>
            <p className="text-slate-700">{exercise.material}</p>
          </div>
        )}
        {exercise.min_players != null && (
          <div>
            <p className="text-xs text-slate-400">Mín. Jogadores</p>
            <p className="text-slate-700">{exercise.min_players}</p>
          </div>
        )}
        {exercise.max_players != null && (
          <div>
            <p className="text-xs text-slate-400">Máx. Jogadores</p>
            <p className="text-slate-700">{exercise.max_players}</p>
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-2 border-t border-slate-100">
        <Button
          variant="outline"
          className="flex-1"
          onClick={onEdit}
        >
          Editar
        </Button>
        {confirmDelete ? (
          <div className="flex flex-1 gap-1">
            <Button
              variant="outline"
              className="flex-1 text-slate-500"
              onClick={() => setConfirmDelete(false)}
            >
              Não
            </Button>
            <Button
              className="flex-1 bg-red-600 hover:bg-red-700 text-white"
              onClick={onDelete}
            >
              Confirmar
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            className="flex-1 text-red-600 hover:bg-red-50"
            onClick={() => setConfirmDelete(true)}
          >
            Apagar
          </Button>
        )}
      </div>
    </div>
  );
}
