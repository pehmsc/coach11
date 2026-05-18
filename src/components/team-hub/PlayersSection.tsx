"use client";

import Link from "next/link";
import { useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  X,
  UserCircle,
  Pencil,
  Trash2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Mail,
  Phone,
} from "lucide-react";
import { ApiFetchError, apiFetch } from "@/lib/http/apiFetch";
import { queryKeys } from "@/lib/query/keys";
import type { Player, AgeGroup, PlayerStatus } from "@/types/database";
import { useListStateSync } from "@/hooks/useListStateSync";
import { useReturnTo } from "@/hooks/useReturnTo";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";
import { useAgeGroup } from "@/contexts/AgeGroupContext";

const POSITIONS = ["GR", "DD", "DC", "DE", "MD", "MC", "MO", "ME", "AV", "EE", "ED", "SA"];

const POSITION_ORDER: Record<string, number> = {
  GR: 1, DD: 2, DC: 3, DE: 4, MD: 5, MC: 6, MO: 7, ME: 8, AV: 9, EE: 10, ED: 11, SA: 12,
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  active: { label: "Activo", color: "bg-emerald-100 text-emerald-700" },
  injured: { label: "Lesionado", color: "bg-orange-100 text-orange-700" },
  suspended: { label: "Suspenso", color: "bg-red-100 text-red-700" },
  inactive: { label: "Indisponível", color: "bg-slate-100 text-slate-500" },
};

type SortKey = "name" | "jersey" | "age" | "position";
type SortDir = "asc" | "desc";

const EMPTY_FORM = {
  firstName: "",
  lastName: "",
  position: "",
  birthDate: "",
  phone: "",
  email: "",
  jerseyNumber: "",
};

type PlayersApiPayload = {
  success?: boolean;
  ageGroup?: AgeGroup | null;
  players?: Player[];
  error?: string;
};

type PlayerApiPayload = {
  success?: boolean;
  player?: Player;
  error?: string;
};

type PlayerDeletePayload = {
  success?: boolean;
  error?: string;
};

type PlayerInvitePayload = {
  success?: boolean;
  emailSent?: boolean;
  inviteCode?: string;
  warning?: string;
  error?: string;
};

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => chars[b % chars.length])
    .join("");
}

type Props = {
  /** Quando definido, filtra players para este ageGroupId. Null = lista global. */
  ageGroupId: string | null;
  /** Chave para useReturnTo/useScrollRestoration. Permite isolamento entre rotas. */
  returnToKey?: string;
  /** Mostra o header com nome do escalão + contagem. Default true. */
  showHeader?: boolean;
};

export function PlayersSection({
  ageGroupId,
  returnToKey = "players",
  showHeader = true,
}: Props) {
  const queryClient = useQueryClient();
  const { saveReturnTo } = useReturnTo(returnToKey);
  useScrollRestoration(returnToKey);
  // Prop ageGroupId vem da URL (sub-rota /teams/[id]/players).
  // Quando null/undefined, segue a escolha do <ScopeToggle> via AgeGroupContext.
  const { selectedAgeGroupId: contextAgeGroupId } = useAgeGroup();
  const effectiveAgeGroupId = ageGroupId ?? contextAgeGroupId;

  const [showForm, setShowForm] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [deletingPlayerId, setDeletingPlayerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useListStateSync<SortKey>("sortBy", "name");
  const [sortDir, setSortDir] = useListStateSync<SortDir>("sortDir", "asc");
  const [form, setForm] = useState(EMPTY_FORM);

  const playersQuery = useQuery({
    queryKey: queryKeys.players(effectiveAgeGroupId),
    queryFn: () =>
      apiFetch<PlayersApiPayload>(
        effectiveAgeGroupId
          ? `/api/players?ageGroupId=${effectiveAgeGroupId}`
          : "/api/players",
      ),
    placeholderData: keepPreviousData,
  });

  const ageGroup = playersQuery.data?.ageGroup ?? null;
  const players = playersQuery.data?.players ?? [];
  const loadError =
    playersQuery.error instanceof ApiFetchError
      ? playersQuery.error.message
      : null;

  function updatePlayersCache(updater: (current: Player[]) => Player[]) {
    queryClient.setQueryData<PlayersApiPayload>(
      queryKeys.players(effectiveAgeGroupId),
      (previous) => {
        if (!previous) return previous;
        const currentPlayers = Array.isArray(previous.players)
          ? previous.players
          : [];
        return {
          ...previous,
          players: updater(currentPlayers),
        };
      },
    );
  }

  const savePlayerMutation = useMutation({
    mutationFn: async ({
      playerId,
      payload,
    }: {
      playerId: string | null;
      payload: Record<string, unknown>;
    }) => {
      if (playerId) {
        return apiFetch<PlayerApiPayload>(`/api/players/${playerId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      return apiFetch<PlayerApiPayload>("/api/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          age_group_id: ageGroup?.id,
          status: "active",
        }),
      });
    },
    onSuccess: (data, variables) => {
      if (!data?.player) return;
      if (variables.playerId) {
        updatePlayersCache((current) =>
          current.map((player) =>
            player.id === variables.playerId ? (data.player as Player) : player,
          ),
        );
      } else {
        updatePlayersCache((current) => [...current, data.player as Player]);
      }
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({
      playerId,
      status,
    }: {
      playerId: string;
      status: PlayerStatus;
    }) =>
      apiFetch<PlayerApiPayload>(`/api/players/${playerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }),
    onMutate: async ({ playerId, status }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.players() });
      const previous = queryClient.getQueryData<PlayersApiPayload>(queryKeys.players());
      updatePlayersCache((current) =>
        current.map((player) =>
          player.id === playerId ? { ...player, status } : player,
        ),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.players(), context.previous);
      }
    },
    onSuccess: (data, variables) => {
      if (!data?.player) return;
      updatePlayersCache((current) =>
        current.map((player) =>
          player.id === variables.playerId ? (data.player as Player) : player,
        ),
      );
    },
  });

  const deletePlayerMutation = useMutation({
    mutationFn: (playerId: string) =>
      apiFetch<PlayerDeletePayload>(`/api/players/${playerId}`, {
        method: "DELETE",
      }),
    onSuccess: (_payload, playerId) => {
      updatePlayersCache((current) =>
        current.filter((player) => player.id !== playerId),
      );
    },
  });

  const invitePlayerMutation = useMutation({
    mutationFn: async ({
      player,
      method,
    }: {
      player: Player;
      method: "email" | "phone" | "code";
    }) => {
      if (method === "email" && player.email) {
        const payload = await apiFetch<PlayerInvitePayload>("/api/invite/player", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerId: player.id }),
        });
        return { type: "email" as const, payload };
      }

      const inviteCode = generateInviteCode();
      const payload = await apiFetch<PlayerApiPayload>(
        `/api/players/${player.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            invite_code: inviteCode,
            invite_method: method,
            invite_sent_at: new Date().toISOString(),
          }),
        },
      );

      return { type: "manual" as const, payload, inviteCode };
    },
  });

  const saving = savePlayerMutation.isPending || invitePlayerMutation.isPending;

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function openAdd() {
    setEditingPlayer(null);
    setForm(EMPTY_FORM);
    setError(null);
    setShowForm(true);
  }

  function openEdit(player: Player) {
    setEditingPlayer(player);
    setForm({
      firstName: player.first_name,
      lastName: player.last_name,
      position: player.preferred_position || "",
      birthDate: player.birth_date || "",
      phone: player.phone || "",
      email: player.email || "",
      jerseyNumber: player.jersey_number?.toString() || "",
    });
    setError(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingPlayer(null);
    setForm(EMPTY_FORM);
    setError(null);
  }

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!ageGroup) return;
    setError(null);

    const payload = {
      first_name: form.firstName,
      last_name: form.lastName,
      preferred_position: form.position || null,
      birth_date: form.birthDate || null,
      phone: form.phone || null,
      email: form.email || null,
      jersey_number: form.jerseyNumber ? parseInt(form.jerseyNumber) : null,
    };

    try {
      await savePlayerMutation.mutateAsync({
        playerId: editingPlayer?.id ?? null,
        payload,
      });
      closeForm();
    } catch (mutationError) {
      const message =
        mutationError instanceof ApiFetchError
          ? mutationError.message
          : editingPlayer
            ? "Erro ao guardar."
            : "Erro ao adicionar.";
      setError(message);
    }
  }

  function updateStatus(playerId: string, status: PlayerStatus) {
    updateStatusMutation.mutate({ playerId, status });
  }

  async function handleDeletePlayer(player: Player) {
    const confirmed = window.confirm(
      `Apagar ${player.first_name} ${player.last_name} do plantel? Esta ação remove também os registos associados ao atleta.`,
    );
    if (!confirmed) return;

    setDeletingPlayerId(player.id);
    setError(null);

    try {
      await deletePlayerMutation.mutateAsync(player.id);
      closeForm();
      toast.success("Atleta apagado", {
        description: `${player.first_name} ${player.last_name} foi removido do plantel.`,
      });
    } catch (deleteError) {
      const message =
        deleteError instanceof ApiFetchError
          ? deleteError.message
          : "Erro ao apagar atleta.";
      setError(message);
      toast.error("Erro ao apagar atleta", { description: message });
    } finally {
      setDeletingPlayerId(null);
    }
  }

  async function sendInvite(
    player: Player,
    method: "email" | "phone" | "code",
  ) {
    try {
      const result = await invitePlayerMutation.mutateAsync({ player, method });

      if (result.type === "email") {
        if (result.payload.success) {
          if (result.payload.emailSent) {
            toast.success(`Email enviado para ${player.first_name}!`, {
              description: `Código: ${result.payload.inviteCode}`,
            });
          } else {
            toast.warning("Email não enviado", {
              description: `Partilha o código manualmente: ${result.payload.inviteCode}`,
            });
          }
          await queryClient.invalidateQueries({ queryKey: queryKeys.players() });
          return;
        }
        toast.error("Erro ao gerar convite", {
          description: result.payload.error || "Erro desconhecido",
        });
        return;
      }

      if (result.payload.player) {
        updatePlayersCache((current) =>
          current.map((entry) =>
            entry.id === player.id ? (result.payload.player as Player) : entry,
          ),
        );
      } else {
        await queryClient.invalidateQueries({ queryKey: queryKeys.players() });
      }

      toast.success(`Código gerado para ${player.first_name}`, {
        description: `Código: ${result.inviteCode}`,
      });
    } catch (inviteError) {
      const message =
        inviteError instanceof ApiFetchError
          ? inviteError.message
          : "Erro desconhecido ao gerar convite.";
      toast.error("Erro ao gerar convite", { description: message });
    }
  }

  const sorted = [...players].sort((a, b) => {
    let result = 0;
    if (sortKey === "name") {
      result = a.first_name.localeCompare(b.first_name);
    } else if (sortKey === "jersey") {
      result = (a.jersey_number || 99) - (b.jersey_number || 99);
    } else if (sortKey === "age") {
      result = (a.birth_date || "9999").localeCompare(b.birth_date || "9999");
    } else if (sortKey === "position") {
      const pa = POSITION_ORDER[a.preferred_position || ""] || 99;
      const pb = POSITION_ORDER[b.preferred_position || ""] || 99;
      result = pa - pb;
    }
    return sortDir === "asc" ? result : -result;
  });

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ArrowUpDown size={10} className="opacity-40" />;
    return sortDir === "asc" ? <ArrowUp size={10} /> : <ArrowDown size={10} />;
  };

  if (playersQuery.isPending && !playersQuery.data) {
    return <p className="text-slate-500 text-sm">A carregar...</p>;
  }

  if (!ageGroup) {
    return (
      <p className="text-slate-500 text-sm py-8 text-center">
        {loadError || "Configura o escalão primeiro."}
      </p>
    );
  }

  return (
    <>
      {showHeader && (
        <div className="flex items-start justify-between mb-4 gap-3">
          <p className="text-slate-500 text-sm truncate min-w-0">
            {ageGroup.club_name} · {ageGroup.name} · {players.length} atletas
          </p>
          <Button
            onClick={openAdd}
            className="bg-emerald-600 hover:bg-emerald-700 flex-shrink-0"
            size="sm"
          >
            <Plus size={16} className="mr-1" /> Atleta
          </Button>
        </div>
      )}

      {/* Ordenação */}
      <div className="flex items-center gap-1.5 mb-4 overflow-x-auto pb-1">
        <span className="text-xs text-slate-400 flex-shrink-0 mr-1">Ordenar:</span>
        {(
          [
            { key: "name", label: "Nome" },
            { key: "jersey", label: "Camisola" },
            { key: "age", label: "Idade" },
            { key: "position", label: "Posição" },
          ] as { key: SortKey; label: string }[]
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => toggleSort(key)}
            className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              sortKey === key
                ? "bg-emerald-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {label}
            <SortIcon k={key} />
          </button>
        ))}
      </div>

      {/* Formulário modal */}
      {showForm && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-4"
          onClick={closeForm}
        >
          <Card
            className="w-full max-w-xl border-emerald-200 max-h-[calc(100dvh-1rem)] md:max-h-[92vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <CardContent className="pt-6 flex flex-col min-h-0">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold">
                  {editingPlayer
                    ? `Editar — ${editingPlayer.first_name} ${editingPlayer.last_name}`
                    : "Novo Atleta"}
                </h3>
                <button type="button" onClick={closeForm}>
                  <X size={18} className="text-slate-400 hover:text-slate-600" />
                </button>
              </div>
              {error && (
                <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md mb-4">
                  {error}
                </div>
              )}
              <form onSubmit={handleSubmit} className="flex flex-col min-h-0">
                <div
                  className="space-y-4 overflow-y-auto flex-1 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
                  style={{ WebkitOverflowScrolling: "touch" }}
                >
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Primeiro nome *</Label>
                      <Input
                        value={form.firstName}
                        required
                        onChange={(e) =>
                          setForm((f) => ({ ...f, firstName: e.target.value }))
                        }
                        placeholder="João"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Apelido *</Label>
                      <Input
                        value={form.lastName}
                        required
                        onChange={(e) =>
                          setForm((f) => ({ ...f, lastName: e.target.value }))
                        }
                        placeholder="Silva"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Posição</Label>
                      <Select
                        value={form.position}
                        onValueChange={(v) =>
                          setForm((f) => ({ ...f, position: v }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Posição" />
                        </SelectTrigger>
                        <SelectContent>
                          {POSITIONS.map((p) => (
                            <SelectItem key={p} value={p}>
                              {p}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Nº Camisola</Label>
                      <Input
                        type="number"
                        value={form.jerseyNumber}
                        min={1}
                        max={99}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, jerseyNumber: e.target.value }))
                        }
                        placeholder="ex: 10"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Data de Nascimento</Label>
                    <Input
                      type="date"
                      value={form.birthDate}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, birthDate: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Telemóvel</Label>
                    <Input
                      type="tel"
                      value={form.phone}
                      placeholder="9XX XXX XXX"
                      onChange={(e) =>
                        setForm((f) => ({ ...f, phone: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={form.email}
                      placeholder="jogador@email.com"
                      onChange={(e) =>
                        setForm((f) => ({ ...f, email: e.target.value }))
                      }
                    />
                  </div>

                  {editingPlayer && !editingPlayer.invite_sent_at && (
                    <div className="border-t pt-4 mt-2">
                      <p className="text-sm text-slate-500 mb-3">
                        Convidar atleta para criar perfil na app:
                      </p>
                      <div className="flex gap-2">
                        {editingPlayer.email && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => sendInvite(editingPlayer, "email")}
                            className="flex-1"
                          >
                            <Mail size={14} className="mr-1" /> Email
                          </Button>
                        )}
                        {editingPlayer.phone && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => sendInvite(editingPlayer, "phone")}
                            className="flex-1"
                          >
                            <Phone size={14} className="mr-1" /> Telemóvel
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => sendInvite(editingPlayer, "code")}
                          className="flex-1"
                        >
                          Gerar código
                        </Button>
                      </div>
                    </div>
                  )}
                  {editingPlayer?.invite_sent_at && (
                    <p className="text-xs text-emerald-600 text-center pt-2">
                      ✓ Convite enviado · Código: {editingPlayer.invite_code}
                    </p>
                  )}
                </div>

                <div className="flex gap-3 pt-3 mt-3 border-t bg-white shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
                  {editingPlayer && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleDeletePlayer(editingPlayer)}
                      disabled={saving || deletingPlayerId === editingPlayer.id}
                      className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                    >
                      <Trash2 size={14} className="mr-1" />
                      {deletingPlayerId === editingPlayer.id
                        ? "A apagar..."
                        : "Apagar"}
                    </Button>
                  )}
                  <Button
                    type="submit"
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                    disabled={saving || deletingPlayerId === editingPlayer?.id}
                  >
                    {saving
                      ? "A guardar..."
                      : editingPlayer
                        ? "Guardar alterações"
                        : "Adicionar"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={closeForm}
                    disabled={deletingPlayerId === editingPlayer?.id}
                  >
                    Cancelar
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Lista */}
      {sorted.length === 0 ? (
        <div className="text-center py-16">
          <UserCircle className="mx-auto mb-4 text-slate-300" size={48} />
          <p className="text-slate-500">
            Ainda não há atletas. Adiciona o primeiro!
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((player) => {
            const sc = STATUS_CONFIG[player.status] || STATUS_CONFIG.active;
            const statusCycle: Record<PlayerStatus, PlayerStatus> = {
              active: "injured",
              injured: "inactive",
              inactive: "suspended",
              suspended: "active",
            };

            return (
              <Card
                key={player.id}
                className="hover:shadow-sm transition-shadow"
              >
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-slate-500">
                        {player.first_name[0]}
                        {player.last_name[0]}
                      </span>
                    </div>

                    <Link
                      href={
                        ageGroupId
                          ? `/teams/${ageGroupId}/players/${player.id}`
                          : `/players/${player.id}`
                      }
                      onClick={() => saveReturnTo()}
                      className="flex-1 min-w-0 -my-1 -ml-1 rounded-md py-1 pl-1 hover:bg-slate-50 transition-colors"
                    >
                      <p className="font-semibold text-slate-900 truncate">
                        {player.first_name} {player.last_name}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {player.preferred_position && (
                          <span className="text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                            {player.preferred_position}
                          </span>
                        )}
                        {player.jersey_number && (
                          <span className="text-xs text-slate-400">
                            #{player.jersey_number}
                          </span>
                        )}
                      </div>
                    </Link>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        updateStatus(
                          player.id,
                          statusCycle[player.status] || "active",
                        );
                      }}
                      title="Toca para mudar estado"
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all hover:opacity-80 active:scale-95 ${sc.color}`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          player.status === "active"
                            ? "bg-emerald-500"
                            : player.status === "injured"
                              ? "bg-orange-500"
                              : player.status === "suspended"
                                ? "bg-red-500"
                                : "bg-slate-400"
                        }`}
                      />
                      {sc.label}
                    </button>

                    <button
                      onClick={() => openEdit(player)}
                      className="text-slate-400 hover:text-emerald-600 transition-colors p-1 flex-shrink-0"
                    >
                      <Pencil size={16} />
                    </button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

