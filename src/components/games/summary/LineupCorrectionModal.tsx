"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, Lock } from "lucide-react";
import { format, parseISO } from "date-fns";
import { pt } from "date-fns/locale";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type LineupStatus = "starter" | "substitute";

type SquadPlayerRef = {
  id: string;
  first_name: string;
  last_name: string;
  jersey_number: number | null;
};

interface SquadRow {
  id: string;
  player_id: string | null;
  initial_lineup_status: LineupStatus | null;
  external_name: string | null;
  external_jersey_number: number | null;
  players: SquadPlayerRef | SquadPlayerRef[] | null;
}

interface CorrectionLogRow {
  id: string;
  game_squad_id: string | null;
  player_id: string | null;
  old_status: string;
  new_status: string;
  reason: string | null;
  corrected_at: string;
  corrected_by: string | null;
}

interface LineupCorrectionsPayload {
  success?: boolean;
  squad?: SquadRow[];
  corrections?: CorrectionLogRow[];
  error?: string;
}

interface LineupCorrectionModalProps {
  gameId: string;
  open: boolean;
  onClose: () => void;
  onApplied: () => void;
}

function unwrapPlayer(
  ref: SquadRow["players"],
): SquadPlayerRef | null {
  if (!ref) return null;
  if (Array.isArray(ref)) return ref[0] ?? null;
  return ref;
}

function squadRowName(row: SquadRow): string {
  const player = unwrapPlayer(row.players);
  if (player) {
    const jersey = player.jersey_number ? `#${player.jersey_number} ` : "";
    return `${jersey}${player.first_name} ${player.last_name}`.trim();
  }
  if (row.external_name) {
    const jersey = row.external_jersey_number
      ? `#${row.external_jersey_number} `
      : "";
    return `${jersey}${row.external_name} (externo)`.trim();
  }
  return "Jogador desconhecido";
}

export function LineupCorrectionModal({
  gameId,
  open,
  onClose,
  onApplied,
}: LineupCorrectionModalProps) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [squad, setSquad] = useState<SquadRow[]>([]);
  const [history, setHistory] = useState<CorrectionLogRow[]>([]);
  const [draftStatuses, setDraftStatuses] = useState<
    Record<string, LineupStatus>
  >({});
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showFinalConfirm, setShowFinalConfirm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/games/${gameId}/lineup-corrections`, {
        cache: "no-store",
      });
      const payload = (await res.json().catch(() => null)) as
        | LineupCorrectionsPayload
        | null;
      if (!res.ok || !payload?.success) {
        setLoadError(payload?.error || "Erro ao carregar squad.");
        return;
      }
      const rows = (payload.squad ?? []).filter(
        (row): row is SquadRow & { initial_lineup_status: LineupStatus } =>
          row.initial_lineup_status === "starter" ||
          row.initial_lineup_status === "substitute",
      );
      setSquad(rows);
      setHistory(payload.corrections ?? []);
      setDraftStatuses(() => {
        const next: Record<string, LineupStatus> = {};
        rows.forEach((row) => {
          next[row.id] = row.initial_lineup_status as LineupStatus;
        });
        return next;
      });
    } catch {
      setLoadError("Erro de ligação.");
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  useEffect(() => {
    if (!open) return;
    void load();
    setReason("");
    setShowFinalConfirm(false);
  }, [open, load]);

  const dirtyCorrections = useMemo(() => {
    const changes: Array<{
      game_squad_id: string;
      new_status: LineupStatus;
      old_status: LineupStatus;
      name: string;
    }> = [];
    for (const row of squad) {
      const current = row.initial_lineup_status as LineupStatus;
      const draft = draftStatuses[row.id];
      if (draft && draft !== current) {
        changes.push({
          game_squad_id: row.id,
          new_status: draft,
          old_status: current,
          name: squadRowName(row),
        });
      }
    }
    return changes;
  }, [squad, draftStatuses]);

  function toggleStatus(squadId: string) {
    setDraftStatuses((prev) => {
      const current = prev[squadId];
      const next: LineupStatus =
        current === "starter" ? "substitute" : "starter";
      return { ...prev, [squadId]: next };
    });
  }

  const reasonTrimmed = reason.trim();
  const canSubmit =
    !submitting &&
    dirtyCorrections.length > 0 &&
    reasonTrimmed.length >= 5 &&
    reasonTrimmed.length <= 500;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/games/${gameId}/lineup-corrections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          corrections: dirtyCorrections.map((c) => ({
            game_squad_id: c.game_squad_id,
            new_status: c.new_status,
          })),
          reason: reasonTrimmed,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.success) {
        const message =
          (payload as { error?: string } | null)?.error ||
          "Erro ao aplicar correccoes.";
        toast.error(message);
        return;
      }
      const applied =
        (payload?.result as { correctionsApplied?: number } | null)
          ?.correctionsApplied ?? dirtyCorrections.length;
      toast.success(
        applied === 1
          ? "1 correcção aplicada."
          : `${applied} correcções aplicadas.`,
      );
      onApplied();
      onClose();
    } catch {
      toast.error("Erro de ligação ao guardar correcções.");
    } finally {
      setSubmitting(false);
      setShowFinalConfirm(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 md:items-center"
      onClick={() => {
        if (submitting) return;
        onClose();
      }}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 space-y-4">
          <div className="flex items-start gap-2">
            <Lock
              size={20}
              className="mt-0.5 flex-shrink-0 text-amber-600"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-bold text-slate-900">
                Corrigir titulares iniciais
              </h3>
              <p className="mt-1 text-xs text-slate-600">
                Use apenas para corrigir erros de marcação titular/suplente
                após o jogo ter sido finalizado. Cada alteração é registada
                em audit log imutável.
              </p>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8 text-slate-500">
              <Loader2 size={20} className="animate-spin mr-2" />
              A carregar squad...
            </div>
          ) : loadError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {loadError}
            </div>
          ) : squad.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-500">
              Sem jogadores na squad para corrigir.
            </div>
          ) : (
            <>
              <div className="space-y-1.5 max-h-[40vh] overflow-y-auto pr-1">
                {squad.map((row) => {
                  const draft = draftStatuses[row.id];
                  const isStarter = draft === "starter";
                  const isDirty =
                    draft && draft !== row.initial_lineup_status;
                  return (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => toggleStatus(row.id)}
                      disabled={submitting}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                        isDirty
                          ? "border-amber-400 bg-amber-50"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <span className="truncate font-medium text-slate-900">
                        {squadRowName(row)}
                      </span>
                      <span
                        className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                          isStarter
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {isStarter ? "Titular" : "Suplente"}
                        {isDirty ? " *" : ""}
                      </span>
                    </button>
                  );
                })}
              </div>

              {dirtyCorrections.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  <p className="font-semibold mb-1">
                    {dirtyCorrections.length}{" "}
                    {dirtyCorrections.length === 1
                      ? "correcção pendente"
                      : "correcções pendentes"}
                    :
                  </p>
                  <ul className="list-disc list-inside space-y-0.5">
                    {dirtyCorrections.map((c) => (
                      <li key={c.game_squad_id}>
                        {c.name}: {c.old_status === "starter" ? "Titular" : "Suplente"}
                        {" → "}
                        {c.new_status === "starter" ? "Titular" : "Suplente"}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <label
                  htmlFor="reason"
                  className="block text-sm font-medium text-slate-700"
                >
                  Razão da correcção (obrigatória, min. 5 chars)
                </label>
                <textarea
                  id="reason"
                  rows={3}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  disabled={submitting}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="Ex: Jogador X foi anunciado como titular mas não compareceu, esquecemo-nos de actualizar a convocatória antes do apito."
                />
                <p className="mt-1 text-xs text-slate-400">
                  {reasonTrimmed.length}/500
                </p>
              </div>

              {history.length > 0 && (
                <details className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <summary className="cursor-pointer text-xs font-semibold text-slate-700">
                    Histórico de correcções ({history.length})
                  </summary>
                  <ul className="mt-2 space-y-1.5 text-xs text-slate-600">
                    {history.map((h) => (
                      <li
                        key={h.id}
                        className="border-l-2 border-slate-300 pl-2"
                      >
                        <p>
                          {h.old_status === "starter" ? "Titular" : "Suplente"}
                          {" → "}
                          {h.new_status === "starter" ? "Titular" : "Suplente"}
                          {" · "}
                          {format(
                            parseISO(h.corrected_at),
                            "d MMM yyyy HH:mm",
                            { locale: pt },
                          )}
                        </p>
                        {h.reason ? (
                          <p className="italic text-slate-500">
                            &ldquo;{h.reason}&rdquo;
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={onClose}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="flex-1 bg-amber-600 hover:bg-amber-700"
              onClick={() => setShowFinalConfirm(true)}
              disabled={!canSubmit}
            >
              Aplicar correcções
            </Button>
          </div>
        </div>

        {showFinalConfirm && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
            onClick={() => {
              if (submitting) return;
              setShowFinalConfirm(false);
            }}
          >
            <div
              className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl space-y-3"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-2">
                <AlertTriangle
                  size={20}
                  className="mt-0.5 flex-shrink-0 text-amber-600"
                />
                <div>
                  <h4 className="font-bold text-slate-900">
                    Alterar histórico do jogo?
                  </h4>
                  <p className="mt-1 text-xs text-slate-600">
                    Esta acção altera o histórico oficial. Será registada em
                    audit log com o teu nome.
                  </p>
                  <p className="mt-2 text-xs text-slate-600 italic">
                    Razão: &ldquo;{reasonTrimmed}&rdquo;
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowFinalConfirm(false)}
                  disabled={submitting}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  className="flex-1 bg-amber-600 hover:bg-amber-700"
                  onClick={() => void submit()}
                  disabled={submitting}
                >
                  {submitting ? (
                    <>
                      <Loader2 size={14} className="animate-spin mr-1.5" />
                      A guardar...
                    </>
                  ) : (
                    "Confirmar"
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
