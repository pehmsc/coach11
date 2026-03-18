"use client";

import { useEffect, useMemo, useState } from "react";
import { addDays, addWeeks, format, parseISO } from "date-fns";
import { pt } from "date-fns/locale";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AppModal } from "@/components/ui/app-modal";
import { Button } from "@/components/ui/button";
import type { TrainingRow } from "@/components/trainings/types";
import {
  formatUtLabel,
  getWeekStartDate,
  toIsoDate,
} from "@/lib/trainings/ut-numbering";

type DuplicateWeekDialogProps = {
  open: boolean;
  sessions: TrainingRow[];
  ageGroupId: string | null;
  nextUtNumber: number;
  onClose: () => void;
  onSuccess: () => Promise<void> | void;
};

type WeekOption = {
  weekStartDate: string;
  count: number;
  firstSessionDate: string;
  lastSessionDate: string;
  label: string;
};

function formatShortDate(date: Date) {
  return format(date, "d MMM", { locale: pt });
}

function getSessionWeekStartDate(session: TrainingRow) {
  if (session.week_start_date) {
    return session.week_start_date;
  }

  return toIsoDate(getWeekStartDate(parseISO(session.session_date)));
}

function buildWeekOptions(sessions: TrainingRow[]): WeekOption[] {
  const groupedWeeks = new Map<
    string,
    {
      count: number;
      firstSessionDate: string;
      lastSessionDate: string;
    }
  >();

  for (const session of sessions) {
    const weekStartDate = getSessionWeekStartDate(session);
    const current = groupedWeeks.get(weekStartDate);

    if (!current) {
      groupedWeeks.set(weekStartDate, {
        count: 1,
        firstSessionDate: session.session_date,
        lastSessionDate: session.session_date,
      });
      continue;
    }

    current.count += 1;
    if (session.session_date < current.firstSessionDate) {
      current.firstSessionDate = session.session_date;
    }
    if (session.session_date > current.lastSessionDate) {
      current.lastSessionDate = session.session_date;
    }
  }

  return Array.from(groupedWeeks.entries())
    .map(([weekStartDate, value]) => {
      const weekStart = parseISO(weekStartDate);
      const weekEnd = addDays(weekStart, 6);

      return {
        weekStartDate,
        count: value.count,
        firstSessionDate: value.firstSessionDate,
        lastSessionDate: value.lastSessionDate,
        label: `Sem. ${formatShortDate(weekStart)} - ${formatShortDate(weekEnd)} (${value.count} treino${value.count !== 1 ? "s" : ""})`,
      };
    })
    .sort((left, right) => right.weekStartDate.localeCompare(left.weekStartDate));
}

export function DuplicateWeekDialog({
  open,
  sessions,
  ageGroupId,
  nextUtNumber,
  onClose,
  onSuccess,
}: DuplicateWeekDialogProps) {
  const weekOptions = useMemo(() => buildWeekOptions(sessions), [sessions]);
  const [sourceWeekStartDate, setSourceWeekStartDate] = useState("");
  const [numberOfWeeks, setNumberOfWeeks] = useState("4");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    setSourceWeekStartDate((currentValue) => currentValue || weekOptions[0]?.weekStartDate || "");
    setNumberOfWeeks("4");
    setError(null);
  }, [open, weekOptions]);

  const selectedWeek = weekOptions.find((option) => option.weekStartDate === sourceWeekStartDate) || null;
  const parsedNumberOfWeeks = Number(numberOfWeeks);
  const isNumberOfWeeksValid =
    Number.isInteger(parsedNumberOfWeeks) &&
    parsedNumberOfWeeks >= 1 &&
    parsedNumberOfWeeks <= 20;

  const preview = useMemo(() => {
    if (!selectedWeek || !isNumberOfWeeksValid) {
      return null;
    }

    const created = selectedWeek.count * parsedNumberOfWeeks;
    if (created === 0) {
      return null;
    }

    const firstDate = addWeeks(parseISO(selectedWeek.firstSessionDate), 1);
    const lastDate = addWeeks(parseISO(selectedWeek.lastSessionDate), parsedNumberOfWeeks);
    const utFrom = formatUtLabel(nextUtNumber);
    const utTo = formatUtLabel(nextUtNumber + created - 1);

    return {
      created,
      text: `Vai criar ${created} treinos (${utFrom} a ${utTo}) de ${format(firstDate, "d 'de' MMMM", { locale: pt })} a ${format(lastDate, "d 'de' MMMM", { locale: pt })}.`,
    };
  }, [isNumberOfWeeksValid, nextUtNumber, parsedNumberOfWeeks, selectedWeek]);

  async function handleDuplicate() {
    if (!ageGroupId) {
      setError("Sem escalão selecionado para duplicar treinos.");
      return;
    }

    if (!selectedWeek) {
      setError("Escolhe uma semana fonte.");
      return;
    }

    if (!isNumberOfWeeksValid) {
      setError("Escolhe entre 1 e 20 semanas.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/trainings/duplicate-week", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceWeekStartDate: selectedWeek.weekStartDate,
          numberOfWeeks: parsedNumberOfWeeks,
          ageGroupId,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | {
            success?: boolean;
            created?: number;
            error?: string;
          }
        | null;

      if (!response.ok || !payload?.success) {
        setError(payload?.error || "Não foi possível duplicar a semana.");
        return;
      }

      toast.success(
        `${payload.created || 0} treino${payload?.created === 1 ? "" : "s"} criado${payload?.created === 1 ? "" : "s"} com sucesso.`,
      );
      await onSuccess();
      onClose();
    } catch {
      setError("Erro de ligação ao duplicar a semana.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppModal
      open={open}
      onClose={() => {
        if (submitting) return;
        onClose();
      }}
      title="Duplicar semana"
      panelClassName="max-w-lg"
    >
      <div className="space-y-4">
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">Semana fonte</label>
          <select
            value={sourceWeekStartDate}
            onChange={(event) => setSourceWeekStartDate(event.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            disabled={submitting || weekOptions.length === 0}
          >
            {weekOptions.map((option) => (
              <option key={option.weekStartDate} value={option.weekStartDate}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">Quantas semanas</label>
          <input
            type="number"
            min={1}
            max={20}
            step={1}
            inputMode="numeric"
            value={numberOfWeeks}
            onChange={(event) => setNumberOfWeeks(event.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            disabled={submitting}
          />
        </div>

        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
            Preview
          </p>
          <p className="mt-1 text-sm text-emerald-900">
            {preview?.text || "Escolhe a semana e o número de semanas para ver a previsão."}
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <Button
            type="button"
            className="flex-1 bg-emerald-600 hover:bg-emerald-700"
            disabled={submitting || !selectedWeek || !isNumberOfWeeksValid}
            onClick={() => void handleDuplicate()}
          >
            {submitting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              "Duplicar"
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={onClose}
          >
            Cancelar
          </Button>
        </div>
      </div>
    </AppModal>
  );
}
