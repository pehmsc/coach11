"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Plus, Search, Trophy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Opponent } from "@/types/database";
import { useReturnTo } from "@/hooks/useReturnTo";

interface OpponentsTabProps {
  ageGroupId: string;
}

interface OpponentRow extends Opponent {
  games_count?: number;
  last_game_at?: string | null;
}

export function OpponentsTab({ ageGroupId }: OpponentsTabProps) {
  const router = useRouter();
  const { saveReturnTo } = useReturnTo("opponents");
  const [opponents, setOpponents] = useState<OpponentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newShortName, setNewShortName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/age-groups/${ageGroupId}/opponents`,
        { cache: "no-store" },
      );
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.success) {
        toast.error(payload?.error || "Erro ao carregar adversarios.");
        return;
      }
      setOpponents(payload.opponents ?? []);
    } catch {
      toast.error("Erro de ligacao.");
    } finally {
      setLoading(false);
    }
  }, [ageGroupId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return opponents;
    return opponents.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        (o.short_name ?? "").toLowerCase().includes(q),
    );
  }, [search, opponents]);

  function hasAnyNotes(o: Opponent): boolean {
    return Boolean(
      o.tactical_formation ||
        o.pontos_fortes ||
        o.pontos_fracos ||
        o.atletas_chave ||
        o.notas_gerais,
    );
  }

  async function createOpponent() {
    setCreateError(null);
    const name = newName.trim();
    if (!name) {
      setCreateError("Nome obrigatorio.");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch(`/api/age-groups/${ageGroupId}/opponents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          short_name: newShortName.trim() || undefined,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.success) {
        const msg = payload?.error || "Erro ao criar adversario.";
        setCreateError(msg);
        return;
      }
      setShowCreate(false);
      setNewName("");
      setNewShortName("");
      router.push(`/teams/${ageGroupId}/opponents/${payload.opponent.id}`);
    } catch {
      setCreateError("Erro de ligacao.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar adversario..."
            className="pl-8"
          />
        </div>
        <Button
          onClick={() => setShowCreate(true)}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          <Plus size={14} className="mr-1.5" />
          Novo adversario
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-slate-500">
          <Loader2 size={20} className="animate-spin mr-2" />
          A carregar...
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center">
          <Trophy size={32} className="mx-auto mb-2 text-slate-300" />
          <p className="text-sm font-medium text-slate-700">
            {search ? "Sem resultados para a pesquisa." : "Sem adversarios ainda."}
          </p>
          {!search && (
            <Button
              onClick={() => setShowCreate(true)}
              variant="outline"
              size="sm"
              className="mt-3"
            >
              <Plus size={14} className="mr-1.5" />
              Criar primeiro adversario
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-100 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Nome</th>
                <th className="px-3 py-2 text-left">Sigla</th>
                <th className="px-3 py-2 text-left">Formacao</th>
                <th className="px-3 py-2 text-left">Notas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((o) => (
                // Linha navegavel: tr relative + Link com after:inset-0 a cobrir a linha
                <tr key={o.id} className="relative hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      {o.logo_url ? (
                        <Image
                          src={o.logo_url}
                          alt=""
                          width={24}
                          height={24}
                          className="h-6 w-6 rounded object-cover"
                          unoptimized
                        />
                      ) : (
                        <div
                          className="flex h-6 w-6 items-center justify-center rounded text-[10px] font-bold text-white"
                          style={{
                            background:
                              "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                          }}
                        >
                          {o.short_name?.slice(0, 2).toUpperCase() ||
                            o.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <Link
                        href={`/teams/${ageGroupId}/opponents/${o.id}`}
                        onClick={saveReturnTo}
                        className="font-medium text-slate-900 after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-emerald-500"
                      >
                        {o.name}
                      </Link>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{o.short_name || "—"}</td>
                  <td className="px-3 py-2 text-slate-600">
                    {o.tactical_formation || "—"}
                  </td>
                  <td className="px-3 py-2">
                    {hasAnyNotes(o) ? (
                      <span className="text-emerald-600 font-bold">✓</span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 md:items-center"
          onClick={() => {
            if (creating) return;
            setShowCreate(false);
            setCreateError(null);
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-slate-900">Novo adversario</h3>

            <div>
              <label className="block text-sm font-medium text-slate-700">
                Nome <span className="text-red-500">*</span>
              </label>
              <Input
                autoFocus
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  setCreateError(null);
                }}
                placeholder="Ex: SL Benfica"
                className="mt-1"
                aria-invalid={!!createError}
              />
              {createError && (
                <p className="mt-1 text-xs text-red-600">{createError}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">
                Sigla (opcional, 2-5 chars)
              </label>
              <Input
                value={newShortName}
                onChange={(e) => setNewShortName(e.target.value)}
                placeholder="Ex: SLB"
                maxLength={5}
                className="mt-1"
              />
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setShowCreate(false);
                  setCreateError(null);
                }}
                disabled={creating}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                onClick={() => void createOpponent()}
                disabled={creating || !newName.trim()}
              >
                {creating ? (
                  <>
                    <Loader2 size={14} className="mr-1.5 animate-spin" />
                    A criar...
                  </>
                ) : (
                  "Criar"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
