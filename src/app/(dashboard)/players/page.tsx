"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
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
  const supabase = useMemo(() => createClient(), []);
  const [players, setPlayers] = useState<Player[]>([]);
  const [ageGroup, setAgeGroup] = useState<AgeGroup | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [form, setForm] = useState(EMPTY_FORM);
  const [openStatusId, setOpenStatusId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    function handleClick() {
      setOpenStatusId(null);
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  // openStatusId kept for future dropdown; suppress lint warning
  void openStatusId;

  async function loadData() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data: ag } = await supabase
      .from("age_groups")
      .select("*")
      .eq("coordinator_id", user.id)
      .single();
    if (ag) {
      setAgeGroup(ag);
      const { data } = await supabase
        .from("players")
        .select("*")
        .eq("age_group_id", ag.id);
      setPlayers(data || []);
    }
    setLoading(false);
  }

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
      const { data, error } = await supabase
        .from("players")
        .update(payload)
        .eq("id", editingPlayer.id)
        .select()
        .single();
      if (error) {
        setError("Erro ao guardar.");
        setSaving(false);
        return;
      }
      setPlayers((prev) =>
        prev.map((p) => (p.id === editingPlayer.id ? data : p)),
      );
    } else {
      const { data, error } = await supabase
        .from("players")
        .insert({ ...payload, age_group_id: ageGroup.id, status: "active" })
        .select()
        .single();
      if (error) {
        setError("Erro ao adicionar.");
        setSaving(false);
        return;
      }
      setPlayers((prev) => [...prev, data]);
    }

    closeForm();
    setSaving(false);
  }

  async function updateStatus(playerId: string, status: PlayerStatus) {
    await supabase.from("players").update({ status }).eq("id", playerId);
    setPlayers((prev) =>
      prev.map((p) => (p.id === playerId ? { ...p, status } : p)),
    );
    setOpenStatusId(null);
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
      await supabase
        .from("players")
        .update({
          invite_code: inviteCode,
          invite_method: method,
          invite_sent_at: new Date().toISOString(),
        })
        .eq("id", player.id);
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
        <p className="text-slate-500">Configura o escalão primeiro.</p>
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
        <Card className="mb-6 border-emerald-200">
          <CardContent className="pt-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold">
                {editingPlayer
                  ? `Editar — ${editingPlayer.first_name} ${editingPlayer.last_name}`
                  : "Novo Atleta"}
              </h3>
              <button onClick={closeForm}>
                <X size={18} className="text-slate-400 hover:text-slate-600" />
              </button>
            </div>
            {error && (
              <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md mb-4">
                {error}
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
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
              <div className="flex gap-3 pt-2">
                <Button
                  type="submit"
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                  disabled={saving}
                >
                  {saving
                    ? "A guardar..."
                    : editingPlayer
                      ? "Guardar alterações"
                      : "Adicionar"}
                </Button>
                <Button type="button" variant="outline" onClick={closeForm}>
                  Cancelar
                </Button>
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
            </form>
          </CardContent>
        </Card>
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
