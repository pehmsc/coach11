"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
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
  Mail,
  Phone,
} from "lucide-react";
import type { Player, AgeGroup } from "@/types/database";

const POSITIONS = ["GR", "DD", "DC", "DE", "MD", "MC", "ME", "AV", "EE", "ED"];

const POSITION_GROUP: Record<string, string> = {
  GR: "GR",
  DD: "DEF",
  DC: "DEF",
  DE: "DEF",
  MD: "MED",
  MC: "MED",
  ME: "MED",
  AV: "AVA",
  EE: "AVA",
  ED: "AVA",
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  active: { label: "Activo", color: "bg-emerald-100 text-emerald-700" },
  injured: { label: "Lesionado", color: "bg-orange-100 text-orange-700" },
  suspended: { label: "Suspenso", color: "bg-red-100 text-red-700" },
  inactive: { label: "Indisponível", color: "bg-slate-100 text-slate-500" },
};

type SortKey = "name" | "jersey" | "age" | "position";

const EMPTY_FORM = {
  firstName: "",
  lastName: "",
  position: "",
  birthDate: "",
  phone: "",
  email: "",
  jerseyNumber: "",
};

export default function PlayersPage() {
  const supabase = createClient();
  const [players, setPlayers] = useState<Player[]>([]);
  const [ageGroup, setAgeGroup] = useState<AgeGroup | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    loadData();
  }, []);

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
        .eq("age_group_id", ag.id)
        .order("first_name");
      setPlayers(data || []);
    }
    setLoading(false);
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

  async function handleSubmit(e: React.FormEvent) {
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

  async function updateStatus(playerId: string, status: string) {
    await supabase.from("players").update({ status }).eq("id", playerId);
    setPlayers((prev) =>
      prev.map((p) =>
        p.id === playerId ? { ...p, status: status as any } : p,
      ),
    );
  }

  async function sendInvite(player: Player, method: "email" | "phone") {
    const inviteCode = Math.random()
      .toString(36)
      .substring(2, 10)
      .toUpperCase();
    await supabase
      .from("players")
      .update({
        invite_code: inviteCode,
        invite_method: method,
        invite_sent_at: new Date().toISOString(),
      })
      .eq("id", player.id);
    alert(
      `Código de convite gerado: ${inviteCode}\nPartilha este código com ${player.first_name}.`,
    );
    loadData();
  }

  const sorted = [...players].sort((a, b) => {
    if (sortKey === "name") return a.first_name.localeCompare(b.first_name);
    if (sortKey === "jersey")
      return (a.jersey_number || 99) - (b.jersey_number || 99);
    if (sortKey === "age")
      return (a.birth_date || "").localeCompare(b.birth_date || "");
    if (sortKey === "position") {
      const ga = POSITION_GROUP[a.preferred_position || ""] || "ZZZ";
      const gb = POSITION_GROUP[b.preferred_position || ""] || "ZZZ";
      return ga.localeCompare(gb);
    }
    return 0;
  });

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
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
        <ArrowUpDown size={14} className="text-slate-400 flex-shrink-0" />
        {(["name", "jersey", "age", "position"] as SortKey[]).map((key) => (
          <button
            key={key}
            onClick={() => setSortKey(key)}
            className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              sortKey === key
                ? "bg-emerald-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {
              {
                name: "Nome",
                jersey: "Camisola",
                age: "Idade",
                position: "Posição",
              }[key]
            }
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

              {/* Convite — só ao editar */}
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
                      onClick={() => sendInvite(editingPlayer, "phone")}
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
            const sc = STATUS_CONFIG[player.status];
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

                    {/* Estado dropdown */}
                    <Select
                      value={player.status}
                      onValueChange={(v) => updateStatus(player.id, v)}
                    >
                      <SelectTrigger className="w-32 h-8 border-0 p-0 focus:ring-0">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${sc.color}`}
                        >
                          {sc.label}
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(STATUS_CONFIG).map(([val, cfg]) => (
                          <SelectItem key={val} value={val}>
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}
                            >
                              {cfg.label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Editar */}
                    <button
                      onClick={() => openEdit(player)}
                      className="text-slate-400 hover:text-emerald-600 transition-colors p-1"
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
