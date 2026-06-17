"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FOOTBALL_FORMATS, AGE_GROUPS } from "@/components/team/setup/types";

const CURRENT_SEASON = "2025/2026";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chamado apos criar com sucesso (alem do router.refresh interno). */
  onCreated?: () => void;
}

/**
 * Modal de criacao de escalao in-place. Nao navega (imune a intermitencia do
 * cookie/proxy do plano). Delega no helper canonico POST /api/age-groups, que
 * deriva o club_id do dono e aplica o entitlement do plano.
 */
export function AgeGroupCreateModal({ open, onOpenChange, onCreated }: Props) {
  const router = useRouter();

  const [name, setName] = useState("");
  const [ageLevel, setAgeLevel] = useState("");
  const [footballFormat, setFootballFormat] = useState("11");
  const [season, setSeason] = useState(CURRENT_SEASON);
  const [creating, setCreating] = useState(false);

  async function handleCreate(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Introduz o nome do escalão.");
      return;
    }
    if (!ageLevel) {
      toast.error("Seleciona o escalão.");
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/age-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          ageLevel,
          footballFormat,
          season: season.trim() || CURRENT_SEASON,
        }),
      });
      const payload = (await res.json().catch(() => null)) as
        | { success?: boolean; error?: string }
        | null;

      if (!res.ok || !payload?.success) {
        toast.error(payload?.error || "Não foi possível criar o escalão.");
        setCreating(false);
        return;
      }

      toast.success("Escalão criado!");
      onOpenChange(false);
      onCreated?.();
      // Recarrega o contexto (AgeGroupProvider) para a pagina team-scoped
      // passar a funcionar sem refresh manual.
      router.refresh();
    } catch {
      toast.error("Erro de ligação. Tenta novamente.");
      setCreating(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 md:items-center"
      onClick={() => {
        if (!creating) onOpenChange(false);
      }}
    >
      <div
        className="flex max-h-[calc(100dvh-1rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-xl md:max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b p-5">
          <h3 className="font-bold text-slate-900">Criar escalão</h3>
          <p className="mt-1 text-sm text-slate-500">
            Define o escalão para começares a gerir plantel, treinos e jogos.
          </p>
        </div>

        <form onSubmit={handleCreate} className="flex-1 space-y-4 overflow-y-auto p-5">
          <div className="space-y-1.5">
            <Label>Nome do escalão *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Iniciados B, Sub-13 Azul..."
              autoFocus
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Escalão *</Label>
            <Select value={ageLevel} onValueChange={setAgeLevel}>
              <SelectTrigger>
                <SelectValue placeholder="Seleciona o escalão" />
              </SelectTrigger>
              <SelectContent>
                {AGE_GROUPS.map((ag) => (
                  <SelectItem key={ag} value={ag}>
                    {ag}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Formato de jogo *</Label>
            <Select value={footballFormat} onValueChange={setFootballFormat}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FOOTBALL_FORMATS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Época</Label>
            <Input
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              placeholder="2025/2026"
            />
          </div>
        </form>

        <div className="border-t bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
              disabled={creating}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="flex-1 bg-emerald-600 hover:bg-emerald-700"
              onClick={() => void handleCreate({ preventDefault() {} })}
              disabled={creating}
            >
              {creating ? <Loader2 size={16} className="mr-2 animate-spin" /> : null}
              Criar escalão
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
