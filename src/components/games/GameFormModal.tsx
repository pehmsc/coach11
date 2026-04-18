"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NotesEditor } from "@/components/forms/NotesEditor";
import { EventImagePicker } from "@/components/media/EventImagePicker";
import {
  GameFormFields,
  type GameCompetitionOption,
  type SharedGameFormValues,
} from "@/components/games/game-form-fields";
import { EMPTY_LOCATION_FIELDS } from "@/lib/location";
import {
  isValidManualShortName,
  normalizeManualShortName,
} from "@/lib/football/short-name";

type GameFormExtra = SharedGameFormValues & {
  title: string;
  round_number: string;
  notes: string;
  image_url: string;
};

export type GameFormModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ageGroupId: string | null;
  teamId?: string | null;
  initialCompetitionId?: string | null;
  initialValues?: Partial<GameFormExtra>;
  competitionOptions?: GameCompetitionOption[];
  mode?: "create" | "duplicate";
  onSaved?: () => void;
};

const EMPTY_FORM: GameFormExtra = {
  title: "",
  round_number: "",
  opponent_name: "",
  opponent_short_name: "",
  date: "",
  start_time: "15:00",
  end_time: "",
  ...EMPTY_LOCATION_FIELDS,
  is_home: true,
  competition_id: "",
  notes: "",
  image_url: "",
};

export function GameFormModal({
  open,
  onOpenChange,
  ageGroupId,
  teamId,
  initialCompetitionId,
  initialValues,
  competitionOptions = [],
  mode = "create",
  onSaved,
}: GameFormModalProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const defaultDate = format(new Date(), "yyyy-MM-dd");
  const [form, setForm] = useState<GameFormExtra>(() => ({
    ...EMPTY_FORM,
    date: defaultDate,
    competition_id: initialCompetitionId || "",
    ...initialValues,
  }));

  // Reset form when modal opens with new initial values
  function resetForm() {
    setForm({
      ...EMPTY_FORM,
      date: defaultDate,
      competition_id: initialCompetitionId || "",
      ...initialValues,
    });
    setError(null);
  }

  function handleFieldChange(
    field: keyof SharedGameFormValues,
    value: SharedGameFormValues[keyof SharedGameFormValues],
  ) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleClose() {
    if (saving) return;
    onOpenChange(false);
    resetForm();
  }

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!form.opponent_name.trim() || !form.date || !form.start_time) {
      setError("Preenche adversário, data e hora.");
      return;
    }
    if (!isValidManualShortName(form.opponent_short_name, 2, 5)) {
      setError("A sigla do adversário deve ter entre 2 e 5 caracteres.");
      return;
    }

    setSaving(true);
    setError(null);

    const normalizedShortName = normalizeManualShortName(form.opponent_short_name, 5);
    const title = form.round_number
      ? `Jornada ${form.round_number}`
      : form.title.trim() || null;

    const res = await fetch("/api/calendar/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "game",
        ageGroupId: ageGroupId || undefined,
        teamId: teamId || undefined,
        payload: {
          title,
          competition_id: form.competition_id || null,
          opponent_name: form.opponent_name.trim(),
          opponent_short_name: normalizedShortName || null,
          date: form.date,
          start_time: form.start_time,
          end_time: form.end_time || null,
          is_home: form.is_home,
          location: form.location.trim() || null,
          location_address: form.location_address.trim() || null,
          formatted_address: form.formatted_address.trim() || null,
          latitude: form.latitude,
          longitude: form.longitude,
          osm_place_id: form.osm_place_id.trim() || null,
          location_source: form.location_source,
          notes: form.notes.trim() || null,
          image_url: form.image_url.trim() || null,
        },
      }),
    });
    const payload = await res.json().catch(() => null);

    if (!res.ok || !payload?.event?.id) {
      setError(
        (payload as { error?: string } | null)?.error || "Erro ao criar jogo.",
      );
      setSaving(false);
      return;
    }

    setSaving(false);
    onOpenChange(false);
    resetForm();
    onSaved?.();
  }

  if (!open) return null;

  const modalTitle = mode === "duplicate" ? "Duplicar jogo" : "Adicionar jogo";
  const submitLabel = mode === "duplicate" ? "Criar copia" : "Criar jogo";
  const showCompetitionSelect = !initialCompetitionId;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[90] flex items-end justify-center px-4 pt-4 pb-[calc(var(--mobile-footer-height)+env(safe-area-inset-bottom)+0.75rem)] md:items-center md:p-4"
      onClick={handleClose}
    >
      <div
        className="min-w-0 overflow-x-hidden bg-white rounded-2xl w-full max-w-md shadow-xl h-[calc(100dvh-var(--mobile-footer-height)-env(safe-area-inset-bottom)-1rem)] md:h-auto md:max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="font-bold text-slate-900">{modalTitle}</h3>
          <button onClick={handleClose}>
            <X size={20} className="text-slate-400" />
          </button>
        </div>
        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 min-w-0 flex-1 flex-col"
        >
          <div
            className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-5 space-y-3 [overflow-wrap:anywhere]"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {initialCompetitionId ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Jornada</Label>
                  <Input
                    type="number"
                    min="1"
                    value={form.round_number}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, round_number: e.target.value }))
                    }
                    placeholder="ex: 3"
                    className="text-sm h-8"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <Label>Titulo</Label>
                <Input
                  value={form.title}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, title: e.target.value }))
                  }
                  placeholder="ex: Jornada 5, Torneio"
                  className="text-sm"
                />
              </div>
            )}

            <GameFormFields
              values={form}
              onFieldChange={handleFieldChange}
              competitionOptions={competitionOptions}
              showCompetitionSelect={showCompetitionSelect}
            />

            <EventImagePicker
              ageGroupId={ageGroupId}
              value={form.image_url}
              onChange={(value) =>
                setForm((prev) => ({ ...prev, image_url: value }))
              }
              accent="blue"
            />
            <NotesEditor
              value={form.notes}
              onChange={(value) =>
                setForm((prev) => ({ ...prev, notes: value }))
              }
              accent="blue"
              rows={6}
            />

            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
          <div className="flex gap-2 border-t bg-white p-5 pt-3 shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Button
              type="submit"
              disabled={saving}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700"
            >
              {saving ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                submitLabel
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
