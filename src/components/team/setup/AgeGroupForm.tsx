"use client";

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
import {
  normalizeManualShortName,
} from "@/lib/football/short-name";
import type { AgeGroup } from "@/components/team/setup/types";
import { FOOTBALL_FORMATS, AGE_GROUPS } from "@/components/team/setup/types";

interface AgeGroupFormProps {
  existingAgeGroup: AgeGroup | null;
  isEditing: boolean;
  setIsEditing: (v: boolean) => void;
  accountRole: string;
  saved: boolean;
  saving: boolean;
  clubName: string;
  setClubName: (v: string) => void;
  clubShortName: string;
  setClubShortName: (v: string) => void;
  ageGroupName: string;
  setAgeGroupName: (v: string) => void;
  footballFormat: string;
  setFootballFormat: (v: string) => void;
  season: string;
  setSeason: (v: string) => void;
  handleSaveSetup: (e: { preventDefault(): void }) => void;
}

export function AgeGroupForm({
  existingAgeGroup,
  isEditing,
  setIsEditing,
  accountRole,
  saved,
  saving,
  clubName,
  setClubName,
  clubShortName,
  setClubShortName,
  ageGroupName,
  setAgeGroupName,
  footballFormat,
  setFootballFormat,
  season,
  setSeason,
  handleSaveSetup,
}: AgeGroupFormProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Escalão</CardTitle>
            {existingAgeGroup && !isEditing && (
              <CardDescription className="mt-1">
                {existingAgeGroup.club_name}
                {existingAgeGroup.club_short_name
                  ? ` (${existingAgeGroup.club_short_name})`
                  : ""}
                {" · "}
                {existingAgeGroup.name} · Futebol {existingAgeGroup.football_format} ·{" "}
                {existingAgeGroup.season}
              </CardDescription>
            )}
          </div>
          {existingAgeGroup && !isEditing && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(true)}
            >
              Editar
            </Button>
          )}
        </div>
      </CardHeader>

      {(!existingAgeGroup || isEditing) && (
        <CardContent>
          {!existingAgeGroup && accountRole !== "coordinator" ? (
            <div className="bg-amber-50 text-amber-800 text-sm p-3 rounded-lg border border-amber-200">
              Conta de treinador sem acesso de coordenador. Esta conta deve ser
              associada a um convite existente.
            </div>
          ) : (
            <>
          {!existingAgeGroup && accountRole === "coordinator" && (
            <div className="bg-blue-50 text-blue-700 text-sm p-3 rounded-lg mb-4 border border-blue-200">
              Cria o teu primeiro escalao para concluir o onboarding beta.
            </div>
          )}
          {saved && (
            <div className="bg-emerald-50 text-emerald-700 text-sm p-3 rounded-lg mb-4 border border-emerald-200">
              ✓ Guardado com sucesso!
            </div>
          )}

          <form onSubmit={handleSaveSetup} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome do Clube *</Label>
              <Input
                value={clubName}
                onChange={(e) => setClubName(e.target.value)}
                placeholder="ex: Os Belenenses"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Sigla do Clube</Label>
              <Input
                value={clubShortName}
                onChange={(e) =>
                  setClubShortName(
                    normalizeManualShortName(e.target.value, 5) || "",
                  )
                }
                placeholder="ex: EFB"
                maxLength={5}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Escalão *</Label>
                <Select value={ageGroupName} onValueChange={setAgeGroupName}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona" />
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
                <Label>Modalidade *</Label>
                <Select
                  value={footballFormat}
                  onValueChange={setFootballFormat}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Futebol..." />
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
            </div>
            <div className="space-y-1.5">
              <Label>Época</Label>
              <Input
                value={season}
                onChange={(e) => setSeason(e.target.value)}
                placeholder="2025/2026"
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="submit"
                className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                disabled={saving}
              >
                {saving
                  ? "A guardar..."
                  : existingAgeGroup
                    ? "Guardar alterações"
                    : "Criar escalão"}
              </Button>
              {isEditing && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditing(false)}
                >
                  Cancelar
                </Button>
              )}
            </div>
          </form>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
