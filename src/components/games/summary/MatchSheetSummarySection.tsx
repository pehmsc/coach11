"use client";

import { useEffect, useState } from "react";
import { ClipboardList, Info, Loader2, Pencil, Save, X } from "lucide-react";
import { toast } from "sonner";
import { TacticalSystemPicker } from "@/components/games/TacticalSystemPicker";
import { Button } from "@/components/ui/button";
import type { Game } from "@/types/database";

interface MatchSheetSummarySectionProps {
  game: Game;
  canEdit: boolean;
  footballFormat: string | null;
  onSaved: () => void;
}

function ReadOnlyField({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
        {value?.trim() ? value : <span className="italic text-slate-400">—</span>}
      </p>
    </div>
  );
}

export function MatchSheetSummarySection({
  game,
  canEdit,
  footballFormat,
  onSaved,
}: MatchSheetSummarySectionProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [tacticalSystem, setTacticalSystem] = useState(game.tactical_system ?? "");
  const [positiveAspects, setPositiveAspects] = useState(
    game.positive_aspects ?? "",
  );
  const [negativeAspects, setNegativeAspects] = useState(
    game.negative_aspects ?? "",
  );
  const [aspectsToImprove, setAspectsToImprove] = useState(
    game.aspects_to_improve ?? "",
  );
  const [teamNotes, setTeamNotes] = useState(game.team_notes ?? "");
  const [coachNotes, setCoachNotes] = useState(game.coach_notes ?? "");

  // Re-sincronizar state local quando o `game` mudar (e.g. apos
  // loadSummary trazer novos valores do servidor depois de um save).
  // Sem isto, o useState so corre na primeira render e o read-only
  // mostraria valores stale ate o utilizador navegar para outra pagina.
  useEffect(() => {
    setTacticalSystem(game.tactical_system ?? "");
    setPositiveAspects(game.positive_aspects ?? "");
    setNegativeAspects(game.negative_aspects ?? "");
    setAspectsToImprove(game.aspects_to_improve ?? "");
    setTeamNotes(game.team_notes ?? "");
    setCoachNotes(game.coach_notes ?? "");
  }, [
    game.id,
    game.tactical_system,
    game.positive_aspects,
    game.negative_aspects,
    game.aspects_to_improve,
    game.team_notes,
    game.coach_notes,
  ]);

  function resetFromGame() {
    setTacticalSystem(game.tactical_system ?? "");
    setPositiveAspects(game.positive_aspects ?? "");
    setNegativeAspects(game.negative_aspects ?? "");
    setAspectsToImprove(game.aspects_to_improve ?? "");
    setTeamNotes(game.team_notes ?? "");
    setCoachNotes(game.coach_notes ?? "");
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/games/${game.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tactical_system: tacticalSystem.trim() || null,
          positive_aspects: positiveAspects.trim() || null,
          negative_aspects: negativeAspects.trim() || null,
          aspects_to_improve: aspectsToImprove.trim() || null,
          team_notes: teamNotes.trim() || null,
          coach_notes: coachNotes.trim() || null,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        const message =
          (payload as { error?: string } | null)?.error ||
          "Erro ao guardar ficha do jogo.";
        toast.error(message);
        return;
      }
      toast.success("Ficha do jogo guardada.");
      setEditing(false);
      onSaved();
    } catch {
      toast.error("Erro de ligação ao guardar ficha do jogo.");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    resetFromGame();
    setEditing(false);
  }

  return (
    <div className="mb-5 rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <ClipboardList size={16} className="text-slate-500 flex-shrink-0" />
          <p className="font-bold text-slate-900 text-sm truncate">
            Ficha do jogo
          </p>
        </div>
        {canEdit && !editing && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setEditing(true)}
          >
            <Pencil size={14} className="mr-1" />
            Editar
          </Button>
        )}
      </div>

      <div className="p-4 space-y-3">
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
          <Info size={14} className="mt-0.5 flex-shrink-0" />
          <p>
            <strong>Conteúdo interno.</strong> Não é visível no link público
            partilhado com atletas e famílias — só ao staff do escalão.
          </p>
        </div>

        {!editing ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <ReadOnlyField
              label="Sistema táctico"
              value={game.tactical_system ?? null}
            />
            <ReadOnlyField
              label="Aspectos positivos"
              value={game.positive_aspects ?? null}
            />
            <ReadOnlyField
              label="Aspectos menos positivos"
              value={game.negative_aspects ?? null}
            />
            <ReadOnlyField
              label="Aspectos a melhorar"
              value={game.aspects_to_improve ?? null}
            />
            <ReadOnlyField
              label="Notas da equipa"
              value={game.team_notes ?? null}
            />
            <ReadOnlyField
              label="Notas privadas do treinador"
              value={game.coach_notes ?? null}
            />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">
                Sistema táctico
              </label>
              <TacticalSystemPicker
                value={tacticalSystem}
                onChange={setTacticalSystem}
                footballFormat={footballFormat}
                disabled={saving}
                accent="emerald"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">
                Aspectos positivos
              </label>
              <textarea
                value={positiveAspects}
                onChange={(e) => setPositiveAspects(e.target.value)}
                disabled={saving}
                rows={3}
                maxLength={2000}
                placeholder="O que funcionou bem neste jogo"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">
                Aspectos menos positivos
              </label>
              <textarea
                value={negativeAspects}
                onChange={(e) => setNegativeAspects(e.target.value)}
                disabled={saving}
                rows={3}
                maxLength={2000}
                placeholder="O que não correu bem"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">
                Aspectos a melhorar
              </label>
              <textarea
                value={aspectsToImprove}
                onChange={(e) => setAspectsToImprove(e.target.value)}
                disabled={saving}
                rows={3}
                maxLength={2000}
                placeholder="O que trabalhar nos próximos treinos"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">
                Notas da equipa
              </label>
              <textarea
                value={teamNotes}
                onChange={(e) => setTeamNotes(e.target.value)}
                disabled={saving}
                rows={3}
                maxLength={2000}
                placeholder="Notas tácticas e operacionais — visíveis ao staff"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">
                Notas privadas do treinador
              </label>
              <textarea
                value={coachNotes}
                onChange={(e) => setCoachNotes(e.target.value)}
                disabled={saving}
                rows={3}
                maxLength={2000}
                placeholder="Notas pessoais sobre o jogo"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700"
              >
                {saving ? (
                  <Loader2 size={14} className="mr-1 animate-spin" />
                ) : (
                  <Save size={14} className="mr-1" />
                )}
                Guardar
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={saving}
              >
                <X size={14} className="mr-1" />
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
