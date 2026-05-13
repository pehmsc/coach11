"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getFormationsForFormat } from "@/lib/formations";
import type { FootballFormat } from "@/types/database";
import type { OpponentSelectionValue } from "@/components/opponents/OpponentTypeahead";

interface OpponentCreateModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (opponent: OpponentSelectionValue) => void;
  ageGroupId: string;
  footballFormat: FootballFormat | string | null;
  defaultName?: string;
}

type CreatedOpponent = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  tactical_formation: string | null;
};

export function OpponentCreateModal({
  open,
  onClose,
  onCreated,
  ageGroupId,
  footballFormat,
  defaultName = "",
}: OpponentCreateModalProps) {
  const [name, setName] = useState(defaultName);
  const [formation, setFormation] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName(defaultName);
      setFormation("");
      setError(null);
      const handle = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(handle);
    }
  }, [open, defaultName]);

  const formationOptions = getFormationsForFormat(
    footballFormat as FootballFormat | null | undefined,
  );

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Nome obrigatório.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const createRes = await fetch(
        `/api/age-groups/${ageGroupId}/opponents`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmed }),
        },
      );
      const createPayload = await createRes.json().catch(() => null);
      if (!createRes.ok || !createPayload?.success) {
        if (createRes.status === 409) {
          setError(
            "Já existe um adversário com este nome neste escalão. Selecciona-o da lista em vez de criar.",
          );
        } else {
          setError(createPayload?.error || "Erro ao criar adversário.");
        }
        inputRef.current?.focus();
        return;
      }

      const created = createPayload.opponent as CreatedOpponent;

      // Patch tactical_formation se foi escolhido
      let finalFormation: string | null = created.tactical_formation ?? null;
      if (formation) {
        const patchRes = await fetch(
          `/api/age-groups/${ageGroupId}/opponents/${created.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tactical_formation: formation }),
          },
        );
        const patchPayload = await patchRes.json().catch(() => null);
        if (patchRes.ok && patchPayload?.success) {
          finalFormation = patchPayload.opponent?.tactical_formation ?? formation;
        }
      }

      onCreated({
        id: created.id,
        name: created.name,
        short_name: created.short_name,
        logo_url: created.logo_url,
        tactical_formation: finalFormation,
        games_count: 0,
        last_game_at: null,
      });
    } catch {
      setError("Erro de ligação.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 md:items-center md:p-4"
      onClick={() => !submitting && onClose()}
    >
      <div
        className="flex w-full max-w-sm flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b p-4">
          <h3 className="font-semibold text-slate-900">Novo adversário</h3>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            aria-label="Fechar"
          >
            <X size={18} className="text-slate-400" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 p-4">
          <div className="space-y-1">
            <Label>Nome *</Label>
            <Input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: Casa Pia"
              maxLength={120}
              required
              disabled={submitting}
            />
          </div>
          {formationOptions.length > 0 && (
            <div className="space-y-1">
              <Label>Formação táctica (opcional)</Label>
              <select
                value={formation}
                onChange={(e) => setFormation(e.target.value)}
                disabled={submitting}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">— Sem formação —</option>
                {formationOptions.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2 pt-2">
            <Button
              type="submit"
              disabled={submitting}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700"
            >
              {submitting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                "Criar e usar"
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={submitting}
            >
              Cancelar
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
