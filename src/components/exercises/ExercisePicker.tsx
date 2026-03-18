"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { Loader2, Search, BookOpen, Clock, Users, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AppModal } from "@/components/ui/app-modal";
import {
  CATEGORY_LABELS,
  CATEGORY_OPTIONS,
} from "./category-labels";
import type { Exercise, ExerciseCategory } from "@/types/database";

type Props = {
  open: boolean;
  onClose: () => void;
  onSelect: (exercise: Exercise) => void;
  selectedId?: string | null;
};

export function ExercisePicker({ open, onClose, onSelect, selectedId }: Props) {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<ExerciseCategory | "">("");

  const fetchExercises = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (category) params.set("category", category);
      if (search.trim()) params.set("search", search.trim());

      const res = await fetch(`/api/exercises?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setExercises(json.exercises);
      }
    } finally {
      setLoading(false);
    }
  }, [category, search]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      fetchExercises();
    }, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [open, fetchExercises, search]);

  return (
    <AppModal
      open={open}
      title="Selecionar Exercício"
      onClose={onClose}
      panelClassName="max-w-md"
    >
      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar..."
              className="pl-8 text-sm"
            />
          </div>
          <select
            value={category}
            onChange={(e) =>
              setCategory(e.target.value as ExerciseCategory | "")
            }
            className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">Todas</option>
            {CATEGORY_OPTIONS.map(([val, label]) => (
              <option key={val} value={val}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 size={24} className="animate-spin text-slate-400" />
          </div>
        ) : exercises.length === 0 ? (
          <div className="text-center py-8">
            <BookOpen size={28} className="text-slate-200 mx-auto mb-2" />
            <p className="text-xs text-slate-400">Nenhum exercício encontrado.</p>
          </div>
        ) : (
          <div className="max-h-80 space-y-1 overflow-y-auto">
            {exercises.map((ex) => {
              const isSelected = ex.id === selectedId;
              return (
                <button
                  key={ex.id}
                  type="button"
                  onClick={() => onSelect(ex)}
                  className={`flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition-colors ${
                    isSelected
                      ? "border-emerald-300 bg-emerald-50"
                      : "border-slate-100 hover:bg-slate-50"
                  }`}
                >
                  {ex.diagram_url ? (
                    <Image
                      src={ex.diagram_url}
                      alt=""
                      width={48}
                      height={48}
                      className="h-12 w-12 flex-shrink-0 rounded object-cover"
                    />
                  ) : (
                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded bg-slate-100">
                      <BookOpen size={16} className="text-slate-300" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 truncate">
                      {ex.name}
                    </p>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                      <span>{CATEGORY_LABELS[ex.category] ?? ex.category}</span>
                      {ex.duration_minutes && (
                        <span className="flex items-center gap-0.5">
                          <Clock size={10} /> {ex.duration_minutes}&apos;
                        </span>
                      )}
                      {ex.game_format && (
                        <span className="flex items-center gap-0.5">
                          <Users size={10} /> {ex.game_format}
                        </span>
                      )}
                    </div>
                  </div>
                  {isSelected && (
                    <Check size={16} className="flex-shrink-0 text-emerald-600" />
                  )}
                </button>
              );
            })}
          </div>
        )}

        <Button
          variant="outline"
          className="w-full"
          onClick={onClose}
        >
          Fechar
        </Button>
      </div>
    </AppModal>
  );
}
