"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users, Plus, X, UserCircle } from "lucide-react";
import type { Player, AgeGroup } from "@/types/database";

const POSITIONS = ["GR", "DD", "DC", "DE", "MD", "MC", "ME", "AV", "PE", "PD"];

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  injured: "bg-orange-100 text-orange-700",
  suspended: "bg-red-100 text-red-700",
  inactive: "bg-slate-100 text-slate-500",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Ativo",
  injured: "Lesionado",
  suspended: "Suspenso",
  inactive: "Inativo",
};

export default function PlayersPage() {
  const supabase = createClient();
  const [players, setPlayers] = useState<Player[]>([]);
  const [ageGroup, setAgeGroup] = useState<AgeGroup | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Formulário de novo atleta
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [position, setPosition] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [jerseyNumber, setJerseyNumber] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    // Buscar escalão
    const { data: ag } = await supabase
      .from("age_groups")
      .select("*")
      .eq("coordinator_id", user.id)
      .single();

    if (ag) {
      setAgeGroup(ag);
      // Buscar atletas do escalão
      const { data: playersData } = await supabase
        .from("players")
        .select("*")
        .eq("age_group_id", ag.id)
        .order("last_name");

      setPlayers(playersData || []);
    }

    setLoading(false);
  }

  function resetForm() {
    setFirstName("");
    setLastName("");
    setPosition("");
    setBirthDate("");
    setPhone("");
    setEmail("");
    setJerseyNumber("");
    setError(null);
  }

  async function handleAddPlayer(e: React.FormEvent) {
    e.preventDefault();
    if (!ageGroup) return;

    setSaving(true);
    setError(null);

    const { data, error } = await supabase
      .from("players")
      .insert({
        age_group_id: ageGroup.id,
        first_name: firstName,
        last_name: lastName,
        preferred_position: position || null,
        birth_date: birthDate || null,
        phone: phone || null,
        email: email || null,
        jersey_number: jerseyNumber ? parseInt(jerseyNumber) : null,
        status: "active",
      })
      .select()
      .single();

    if (error) {
      setError("Erro ao adicionar atleta.");
      setSaving(false);
      return;
    }

    setPlayers((prev) =>
      [...prev, data].sort((a, b) => a.last_name.localeCompare(b.last_name)),
    );
    resetForm();
    setShowForm(false);
    setSaving(false);
  }

  async function updatePlayerStatus(playerId: string, status: string) {
    await supabase.from("players").update({ status }).eq("id", playerId);

    setPlayers((prev) =>
      prev.map((p) =>
        p.id === playerId ? { ...p, status: status as any } : p,
      ),
    );
  }

  if (loading) {
    return (
      <div className="p-4 md:p-8">
        <p className="text-slate-500">A carregar...</p>
      </div>
    );
  }

  if (!ageGroup) {
    return (
      <div className="p-4 md:p-8 text-center">
        <Users className="mx-auto mb-4 text-slate-300" size={48} />
        <h2 className="font-semibold text-slate-700 mb-2">
          Sem escalão configurado
        </h2>
        <p className="text-slate-500 text-sm">
          Primeiro configura o teu escalão em Configurações.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Plantel</h1>
          <p className="text-slate-500 text-sm">
            {ageGroup.club_name} · {ageGroup.name} · {players.length} atletas
          </p>
        </div>
        <Button
          onClick={() => setShowForm(true)}
          className="bg-emerald-600 hover:bg-emerald-700"
          size="sm"
        >
          <Plus size={16} className="mr-1" />
          Atleta
        </Button>
      </div>

      {/* Formulário de novo atleta */}
      {showForm && (
        <Card className="mb-6 border-emerald-200">
          <CardContent className="pt-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold">Novo Atleta</h3>
              <button
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
              >
                <X size={18} className="text-slate-400 hover:text-slate-600" />
              </button>
            </div>

            {error && (
              <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md mb-4">
                {error}
              </div>
            )}

            <form onSubmit={handleAddPlayer} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="firstName">Primeiro nome *</Label>
                  <Input
                    id="firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="João"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="lastName">Apelido *</Label>
                  <Input
                    id="lastName"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Silva"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Posição</Label>
                  <Select value={position} onValueChange={setPosition}>
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
                  <Label htmlFor="jersey">Nº Camisola</Label>
                  <Input
                    id="jersey"
                    type="number"
                    value={jerseyNumber}
                    onChange={(e) => setJerseyNumber(e.target.value)}
                    placeholder="ex: 10"
                    min={1}
                    max={99}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="birthDate">Data de Nascimento</Label>
                <Input
                  id="birthDate"
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="phone">Telemóvel</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="9XX XXX XXX"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jogador@email.com"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  type="submit"
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                  disabled={saving}
                >
                  {saving ? "A guardar..." : "Adicionar Atleta"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowForm(false);
                    resetForm();
                  }}
                >
                  Cancelar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Lista de atletas */}
      {players.length === 0 ? (
        <div className="text-center py-12">
          <UserCircle className="mx-auto mb-4 text-slate-300" size={48} />
          <p className="text-slate-500">
            Ainda não há atletas. Adiciona o primeiro!
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {players.map((player) => (
            <Card key={player.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-3">
                  {/* Avatar placeholder */}
                  <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-semibold text-slate-500">
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
                        <span className="text-xs text-slate-500">
                          #{player.jersey_number}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Estado */}
                  <Select
                    value={player.status}
                    onValueChange={(v) => updatePlayerStatus(player.id, v)}
                  >
                    <SelectTrigger className="w-28 h-7 text-xs border-0 p-1">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[player.status]}`}
                      >
                        {STATUS_LABELS[player.status]}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_LABELS).map(([value, label]) => (
                        <SelectItem
                          key={value}
                          value={value}
                          className="text-sm"
                        >
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
