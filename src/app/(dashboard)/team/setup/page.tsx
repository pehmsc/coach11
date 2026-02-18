"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const FOOTBALL_FORMATS = [
  { value: "5", label: "Futebol 5" },
  { value: "7", label: "Futebol 7" },
  { value: "9", label: "Futebol 9" },
  { value: "11", label: "Futebol 11" },
];

const AGE_GROUPS = [
  "Sub-7",
  "Sub-8",
  "Sub-9",
  "Sub-10",
  "Sub-11",
  "Sub-12",
  "Sub-13",
  "Sub-14",
  "Sub-15",
  "Sub-17",
  "Sub-19",
  "Sénior",
];

const TACTICAL_SYSTEMS: Record<string, string[]> = {
  "7": ["3-3", "2-3-1", "3-2-1", "2-1-2-1"],
  "9": ["3-3-2", "4-3-1", "3-2-3", "4-2-2"],
  "11": ["4-3-3", "4-4-2", "3-5-2", "4-2-3-1", "3-4-3"],
  "5": ["2-2", "1-2-1", "2-1-1"],
};

export default function TeamSetupPage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [existingAgeGroup, setExistingAgeGroup] = useState<any>(null);

  // Campos do formulário
  const [clubName, setClubName] = useState("");
  const [ageGroupName, setAgeGroupName] = useState("");
  const [footballFormat, setFootballFormat] = useState("");
  const [season, setSeason] = useState("2024/2025");
  const [teams, setTeams] = useState([
    { name: "Equipa A", is_competitive: true, tactical_system: "" },
    { name: "Equipa B", is_competitive: true, tactical_system: "" },
    { name: "Equipa C", is_competitive: true, tactical_system: "" },
  ]);

  useEffect(() => {
    loadExistingSetup();
  }, []);

  async function loadExistingSetup() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("age_groups")
      .select("*, teams(*)")
      .eq("coordinator_id", user.id)
      .single();

    if (data) {
      setExistingAgeGroup(data);
      setClubName(data.club_name);
      setAgeGroupName(data.name);
      setFootballFormat(data.football_format);
      setSeason(data.season);
    }
  }

  function updateTeam(index: number, field: string, value: any) {
    setTeams((prev) =>
      prev.map((t, i) => (i === index ? { ...t, [field]: value } : t)),
    );
  }

  function addTeam() {
    const letters = ["A", "B", "C", "D", "E", "F"];
    const nextLetter = letters[teams.length] || String(teams.length + 1);
    setTeams((prev) => [
      ...prev,
      {
        name: `Equipa ${nextLetter}`,
        is_competitive: true,
        tactical_system: "",
      },
    ]);
  }

  function removeTeam(index: number) {
    if (teams.length <= 1) return;
    setTeams((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    try {
      let ageGroupId: string;

      if (existingAgeGroup) {
        // Actualizar escalão existente
        const { error } = await supabase
          .from("age_groups")
          .update({
            club_name: clubName,
            name: ageGroupName,
            football_format: footballFormat,
            season,
          })
          .eq("id", existingAgeGroup.id);

        if (error) throw error;
        ageGroupId = existingAgeGroup.id;
      } else {
        // Criar novo escalão
        const { data, error } = await supabase
          .from("age_groups")
          .insert({
            coordinator_id: user.id,
            club_name: clubName,
            name: ageGroupName,
            football_format: footballFormat,
            season,
          })
          .select()
          .single();

        if (error) throw error;
        ageGroupId = data.id;
      }

      // Criar equipas (apenas se é novo escalão)
      if (!existingAgeGroup) {
        for (const team of teams) {
          const { error } = await supabase.from("teams").insert({
            age_group_id: ageGroupId,
            name: team.name,
            is_competitive: team.is_competitive,
            tactical_system: team.tactical_system || null,
          });

          if (error) throw error;
        }
      }

      setSuccess(true);
      setTimeout(() => {
        router.push("/dashboard");
      }, 1500);
    } catch (err: any) {
      setError("Erro ao guardar. Tenta novamente.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const availableSystems = TACTICAL_SYSTEMS[footballFormat] || [];

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-2">
        {existingAgeGroup ? "Editar Escalão" : "Configurar Escalão"}
      </h1>
      <p className="text-slate-500 mb-8">
        Define as informações base do teu escalão e equipas.
      </p>

      {success && (
        <div className="bg-emerald-50 text-emerald-700 p-4 rounded-lg mb-6 border border-emerald-200">
          ✓ Guardado com sucesso! A redirecionar...
        </div>
      )}

      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-lg mb-6 border border-red-200">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Informações do clube */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Informações do Clube</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="clubName">Nome do Clube *</Label>
              <Input
                id="clubName"
                value={clubName}
                onChange={(e) => setClubName(e.target.value)}
                placeholder="ex: Os Belenenses"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ageGroup">Escalão *</Label>
              <Select
                value={ageGroupName}
                onValueChange={setAgeGroupName}
                required
              >
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

            <div className="space-y-2">
              <Label htmlFor="format">Modalidade *</Label>
              <Select
                value={footballFormat}
                onValueChange={setFootballFormat}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Futebol de..." />
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

            <div className="space-y-2">
              <Label htmlFor="season">Época</Label>
              <Input
                id="season"
                value={season}
                onChange={(e) => setSeason(e.target.value)}
                placeholder="2024/2025"
              />
            </div>
          </CardContent>
        </Card>

        {/* Equipas — só mostrar se é novo escalão */}
        {!existingAgeGroup && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Equipas</CardTitle>
              <CardDescription>
                Define as equipas do teu escalão. Podes adicionar mais depois.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {teams.map((team, index) => (
                <div
                  key={index}
                  className="flex gap-3 items-start p-3 bg-slate-50 rounded-lg"
                >
                  <div className="flex-1 space-y-3">
                    <Input
                      value={team.name}
                      onChange={(e) =>
                        updateTeam(index, "name", e.target.value)
                      }
                      placeholder="Nome da equipa"
                    />
                    {availableSystems.length > 0 && (
                      <Select
                        value={team.tactical_system}
                        onValueChange={(v) =>
                          updateTeam(index, "tactical_system", v)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Sistema tático (opcional)" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableSystems.map((s) => (
                            <SelectItem key={s} value={s}>
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <label className="flex items-center gap-2 text-sm text-slate-600">
                      <input
                        type="checkbox"
                        checked={team.is_competitive}
                        onChange={(e) =>
                          updateTeam(index, "is_competitive", e.target.checked)
                        }
                        className="rounded"
                      />
                      Equipa competitiva
                    </label>
                  </div>
                  {teams.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeTeam(index)}
                      className="text-red-400 hover:text-red-600 text-sm mt-2"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}

              <button
                type="button"
                onClick={addTeam}
                className="text-emerald-600 text-sm font-medium hover:underline"
              >
                + Adicionar equipa
              </button>
            </CardContent>
          </Card>
        )}

        <Button
          type="submit"
          className="w-full bg-emerald-600 hover:bg-emerald-700"
          disabled={loading}
        >
          {loading ? "A guardar..." : "Guardar"}
        </Button>
      </form>
    </div>
  );
}
