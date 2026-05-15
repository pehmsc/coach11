"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TeamLabel } from "@/types/database";

export type CompetitionFormValues = {
  name: string;
  season: string;
  phase: string;
  team_label: TeamLabel;
  total_rounds: string;
  has_two_legs: boolean;
};

const EMPTY_FORM: CompetitionFormValues = {
  name: "",
  season: "2025/2026",
  phase: "",
  team_label: "A",
  total_rounds: "",
  has_two_legs: false,
};

export type CompetitionFormModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
  footballFormat?: string | null;
  /** Quando preenchido, modo edição; senão modo criação. */
  competitionId?: string | null;
  /** Valores iniciais (modo edit) ou undefined (modo create — usa defaults). */
  initialValues?: Partial<CompetitionFormValues>;
  onSaved?: (competitionId: string) => void;
};

export function CompetitionFormModal({
  open,
  onOpenChange,
  teamId,
  footballFormat = null,
  competitionId = null,
  initialValues,
  onSaved,
}: CompetitionFormModalProps) {
  const supabase = useMemo(() => createClient(), []);
  const isEdit = !!competitionId;
  const [form, setForm] = useState<CompetitionFormValues>(() => ({
    ...EMPTY_FORM,
    ...initialValues,
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset on each open so o form reflecte sempre os initialValues actuais.
  useEffect(() => {
    if (!open) return;
    setForm({ ...EMPTY_FORM, ...initialValues });
    setError(null);
    setSaving(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só queremos correr no toggle de open
  }, [open]);

  function handleClose() {
    if (saving) return;
    onOpenChange(false);
  }

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Preenche o nome da competição.");
      return;
    }
    setSaving(true);
    setError(null);

    const payload = {
      team_id: teamId,
      name: form.name.trim(),
      season: form.season,
      phase: form.phase || null,
      team_label: form.team_label,
      total_rounds: form.total_rounds ? Number.parseInt(form.total_rounds, 10) : null,
      has_two_legs: form.has_two_legs,
    };

    if (isEdit && competitionId) {
      const { error: updateError } = await supabase
        .from("competitions")
        .update(payload)
        .eq("id", competitionId);
      if (updateError) {
        setError("Erro ao guardar: " + updateError.message);
        setSaving(false);
        return;
      }
      setSaving(false);
      onOpenChange(false);
      onSaved?.(competitionId);
      return;
    }

    const { data, error: insertError } = await supabase
      .from("competitions")
      .insert(payload)
      .select("id")
      .single();
    if (insertError) {
      setError("Erro ao criar: " + insertError.message);
      setSaving(false);
      return;
    }
    setSaving(false);
    onOpenChange(false);
    if (data?.id) onSaved?.(data.id);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-4"
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-md shadow-xl max-h-[calc(100dvh-1rem)] md:max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-5 border-b bg-white shrink-0">
          <h3 className="font-bold text-slate-900">
            {isEdit ? "Editar competição" : "Nova competição"}
          </h3>
          <button onClick={handleClose} disabled={saving}>
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="p-5 space-y-4 overflow-y-auto flex-1 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {error && (
            <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg border border-red-200">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Nome da competição *</Label>
            <Input
              value={form.name}
              onChange={(e) =>
                setForm((f) => ({ ...f, name: e.target.value }))
              }
              placeholder="ex: Campeonato Distrital"
              required
            />
          </div>

          {footballFormat && (
            <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800">
              <span className="font-semibold">Modalidade:</span>
              <span>Futebol {footballFormat}</span>
              <span className="text-blue-500 text-xs ml-auto">
                (altera em Configurações → Escalão)
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Equipa</Label>
              <select
                value={form.team_label}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    team_label: (e.target.value as TeamLabel) || "A",
                  }))
                }
                className="w-full rounded-lg border border-slate-200 px-3 py-2 bg-white text-sm text-slate-700"
              >
                <option value="A">Equipa A</option>
                <option value="B">Equipa B</option>
                <option value="C">Equipa C</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Fase / Série</Label>
              <Input
                value={form.phase}
                onChange={(e) =>
                  setForm((f) => ({ ...f, phase: e.target.value }))
                }
                placeholder="ex: Série B"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Época</Label>
              <Input
                value={form.season}
                onChange={(e) =>
                  setForm((f) => ({ ...f, season: e.target.value }))
                }
                placeholder="2025/2026"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Total de jornadas</Label>
            <Input
              type="number"
              min="1"
              value={form.total_rounds}
              onChange={(e) =>
                setForm((f) => ({ ...f, total_rounds: e.target.value }))
              }
              placeholder="ex: 22"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() =>
                setForm((f) => ({ ...f, has_two_legs: !f.has_two_legs }))
              }
              className={`w-10 h-6 rounded-full transition-colors flex-shrink-0 ${
                form.has_two_legs ? "bg-emerald-500" : "bg-slate-200"
              }`}
            >
              <span
                className={`block w-4 h-4 bg-white rounded-full shadow transition-transform mx-1 ${
                  form.has_two_legs ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
            <Label className="cursor-pointer">Jogo em casa e fora</Label>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              type="submit"
              className="flex-1 bg-emerald-600 hover:bg-emerald-700"
              disabled={saving}
            >
              {saving ? (
                <Loader2 size={16} className="animate-spin" />
              ) : isEdit ? (
                "Guardar"
              ) : (
                "Criar competição"
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={saving}
            >
              Cancelar
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
