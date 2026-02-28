"use client";

import { useState, useEffect } from "react";
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
import type { Player, AgeGroup, PlayerStatus } from "@/types/database";

const POSITIONS = ["GR", "DD", "DC", "DE", "MD", "MC", "ME", "AV", "EE", "ED"];

const POSITION_ORDER: Record<string, number> = {
  GR: 1,
  DD: 2,
  DC: 3,
  DE: 4,
  MD: 5,
  MC: 6,
  ME: 7,
  AV: 8,
  EE: 9,
  ED: 10,
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

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => chars[b % chars.length])
    .join("");
}

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [ageGroup, setAgeGroup] = useState<AgeGroup | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingPlayerId, setDeletingPlayerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [form, setForm] = useState(EMPTY_FORM);

  async function loadData() {
    setLoading(true);
    setLoadError(null);
    const res = await fetch("/api/players", { cache: "no-store" });
    const payload = (await res.json().catch(() => null)) as
      | { success?: boolean; ageGroup?: AgeGroup; players?: Player[]; error?: string }
      | null;

    if (!res.ok || !payload?.success) {
      setAgeGroup(null);
      setPlayers([]);
      setLoadError(payload?.error || "Erro ao carregar plantel.");
      setLoading(false);
      return;
    }

    setAgeGroup(payload.ageGroup || null);
    setPlayers(payload.players || []);
    setLoadError(null);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, []);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
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
    setSaving(true);
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

    if (editingPlayer) {
      const res = await fetch(`/api/players/${editingPlayer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.player) {
        setError("Erro ao guardar.");
        setSaving(false);
        return;
      }
      setPlayers((prev) =>
        prev.map((p) => (p.id === editingPlayer.id ? (data.player as Player) : p)),
      );
    } else {
      const res = await fetch("/api/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          age_group_id: ageGroup.id,
          status: "active",
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.player) {
        setError("Erro ao adicionar.");
        setSaving(false);
        return;
      }
      setPlayers((prev) => [...prev, data.player as Player]);
    }

    closeForm();
    setSaving(false);
  }

  async function updateStatus(playerId: string, status: PlayerStatus) {
    const res = await fetch(`/api/players/${playerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) return;
    setPlayers((prev) =>
      prev.map((p) => (p.id === playerId ? { ...p, status } : p)),
    );
  }

  async function handleDeletePlayer(player: Player) {
    const confirmed = window.confirm(
      `Apagar ${player.first_name} ${player.last_name} do plantel? Esta ação remove também os registos associados ao atleta.`,
    );
    if (!confirmed) return;

    setDeletingPlayerId(player.id);
    setError(null);

    const res = await fetch(`/api/players/${player.id}`, {
      method: "DELETE",
    });
    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.success) {
      const message = data?.error || "Erro ao apagar atleta.";
      setError(message);
      toast.error("Erro ao apagar atleta", {
        description: message,
      });
      setDeletingPlayerId(null);
      return;
    }

    setPlayers((prev) => prev.filter((p) => p.id !== player.id));
    setDeletingPlayerId(null);
    closeForm();
    toast.success("Atleta apagado", {
      description: `${player.first_name} ${player.last_name} foi removido do plantel.`,
    });
  }

  async function sendInvite(
    player: Player,
    method: "email" | "phone" | "code",
  ) {
    if (method === "email" && player.email) {
      setSaving(true);
      const res = await fetch("/api/invite/player", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: player.id }),
      });
      const data = await res.json();
      setSaving(false);

      if (data.success) {
        if (data.emailSent) {
          toast.success(`Email enviado para ${player.first_name}!`, {
            description: `Código: ${data.inviteCode}`,
          });
        } else {
          toast.warning(`Email não enviado`, {
            description: `Partilha o código manualmente: ${data.inviteCode}`,
          });
        }
        loadData();
      } else {
        toast.error("Erro ao gerar convite", {
          description: data.error || "Erro desconhecido",
        });
      }
    } else {
      // Convite por código (sem email) — gerado com crypto.getRandomValues
      const inviteCode = generateInviteCode();
      await fetch(`/api/players/${player.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invite_code: inviteCode,
          invite_method: method,
          invite_sent_at: new Date().toISOString(),
        }),
      });
      toast.success(`Código gerado para ${player.first_name}`, {
        description: `Código: ${inviteCode}`,
      });
      loadData();
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

  if (loading)
    return (
      <div className="p-4 md:p-8">
        <p className="text-slate-500">A carregar...</p>
      </div>
    );
  if (!ageGroup)
    return (
      <div className="p-4 md:p-8 text-center py-16">
        <p className="text-slate-500">
          {loadError || "Configura o escalão primeiro."}
        </p>
      </div>
    );

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-900">Plantel</h1>
          <p className="text-slate-500 text-sm truncate">
            {ageGroup.club_name} · {ageGroup.name} · {players.length} atletas
          </p>
        </div>
        <Button
          onClick={openAdd}
          className="bg-emerald-600 hover:bg-emerald-700 flex-shrink-0"
          size="sm"
        >
          <Plus size={16} className="mr-1" /> Atleta
        </Button>
      </div>

      {/* Ordenação */}
      <div className="flex items-center gap-1.5 mb-4 overflow-x-auto pb-1">
        <span className="text-xs text-slate-400 flex-shrink-0 mr-1">
          Ordenar:
        </span>
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

      {/* Formulário */}
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

                  {/* Convite */}
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
                      {deletingPlayerId === editingPlayer.id ? "A apagar..." : "Apagar"}
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
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-slate-500">
                        {player.first_name[0]}
                        {player.last_name[0]}
                      </span>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
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
                    </div>

                    {/* Estado */}
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

                    {/* Editar */}
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
    </div>
  );
}
