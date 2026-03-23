"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Plus,
  Users,
  CalendarDays,
  Swords,
  ChevronRight,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { normalizeManualShortName, isValidManualShortName } from "@/lib/football/short-name";

function StatusBadge({ value }: { value: number }) {
  const isAlert = value > 0;
  return (
    <span
      className={cn(
        "inline-flex h-6 min-w-6 items-center justify-center rounded px-1.5 text-xs font-semibold",
        isAlert ? "bg-red-500/10 text-red-600" : "bg-emerald-500/10 text-emerald-600",
      )}
    >
      {value}
    </span>
  );
}

const FOOTBALL_FORMATS = [
  { value: "5", label: "Futebol 5" },
  { value: "7", label: "Futebol 7" },
  { value: "9", label: "Futebol 9" },
  { value: "11", label: "Futebol 11" },
];

const FORMAT_LABELS: Record<string, string> = {
  "5": "5x5",
  "7": "7x7",
  "9": "9x9",
  "11": "11x11",
};

const AGE_GROUPS = [
  "Sub-7", "Sub-8", "Sub-9", "Sub-10", "Sub-11", "Sub-12",
  "Sub-13", "Sub-14", "Sub-15", "Sub-16", "Sub-17", "Sub-18",
  "Sub-19", "Sub-23", "Sénior",
];

interface TeamStats {
  ageGroupId: string;
  name: string;
  ageLevel?: string;
  clubName: string;
  clubShortName?: string;
  footballFormat: string;
  season: string;
  activePlayers: number;
  archivedPlayers: number;
  scheduledTrainings: number;
  scheduledGames: number;
  unavailablePlayers: number;
  gamesToClose: number;
  trainingsToClose: number;
}

export default function TeamsPage() {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState<TeamStats[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [coordinatorId, setCoordinatorId] = useState<string | null>(null);

  // Add team form
  const [showAddForm, setShowAddForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newClubName, setNewClubName] = useState("");
  const [newClubShortName, setNewClubShortName] = useState("");
  const [newAgeGroupCustomName, setNewAgeGroupCustomName] = useState("");
  const [newAgeLevel, setNewAgeLevel] = useState("");
  const [newFootballFormat, setNewFootballFormat] = useState("11");
  const [newSeason, setNewSeason] = useState("2025/2026");
  // Existing club context (resolved on load; hides club fields for normal users)
  const [existingClubId, setExistingClubId] = useState<string | null>(null);
  const [existingClubName, setExistingClubName] = useState("");
  const [existingClubShortName, setExistingClubShortName] = useState("");
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    void loadTeams();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadTeams() {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_super_coordinator")
      .eq("id", user.id)
      .maybeSingle();

    const isSuperCoord = !!profile?.is_super_coordinator;
    const isCoord = profile?.role === "coordinator" || isSuperCoord;
    setIsSuperAdmin(isSuperCoord);

    if (isCoord) {
      setCoordinatorId(user.id);
    }

    // Fetch age_groups coordinated by user
    const { data: coordAgeGroups } = await supabase
      .from("age_groups")
      .select("id, name, age_level, club_name, club_short_name, club_id, football_format, season")
      .eq("coordinator_id", user.id)
      .order("created_at", { ascending: true });

    // Resolve existing club + determine se o utilizador é club_coordinator
    // (tem entrada em club_memberships) ou apenas age_group_coordinator.
    // Só club_coordinator (e super admin) pode criar novos escalões.
    if (!isSuperCoord && isCoord) {
      const { data: membership } = await supabase
        .from("club_memberships")
        .select("club_id")
        .eq("profile_id", user.id)
        .limit(1)
        .maybeSingle();

      const isClubCoord = !!membership?.club_id;
      setCanCreate(isClubCoord);

      type AgeGroupWithClub = { club_id?: string | null; club_name: string; club_short_name?: string | null };
      const firstGroup = (coordAgeGroups ?? [])[0] as AgeGroupWithClub | undefined;

      if (membership?.club_id) {
        // Fonte primária: club_memberships → clubs
        if (firstGroup && firstGroup.club_id === membership.club_id) {
          // Reutiliza dados denormalizados do age_group (tem club_short_name)
          setExistingClubId(firstGroup.club_id!);
          setExistingClubName(firstGroup.club_name);
          setExistingClubShortName(firstGroup.club_short_name ?? "");
        } else {
          const { data: clubRow } = await supabase
            .from("clubs")
            .select("name")
            .eq("id", membership.club_id)
            .maybeSingle();
          setExistingClubId(membership.club_id);
          setExistingClubName((clubRow as { name?: string } | null)?.name ?? "");
          setExistingClubShortName("");
        }
      } else if (firstGroup?.club_id) {
        // age_group_coordinator sem club_membership: mostra o clube do escalão mas não pode criar
        setExistingClubId(firstGroup.club_id);
        setExistingClubName(firstGroup.club_name);
        setExistingClubShortName(firstGroup.club_short_name ?? "");
      }
    } else if (isSuperCoord) {
      setCanCreate(true);
    }

    // Fetch age_groups where user is staff
    const { data: staffLinks } = await supabase
      .from("age_group_staff")
      .select("age_group_id")
      .eq("profile_id", user.id);

    const staffAgeGroupIds = (staffLinks ?? []).map((s) => s.age_group_id);

    let staffAgeGroups: typeof coordAgeGroups = [];
    if (staffAgeGroupIds.length > 0) {
      const { data } = await supabase
        .from("age_groups")
        .select("id, name, age_level, club_name, club_short_name, club_id, football_format, season")
        .in("id", staffAgeGroupIds);
      staffAgeGroups = data ?? [];
    }

    // Merge, dedup
    const seen = new Set<string>();
    const allAgeGroups = [...(coordAgeGroups ?? [] as typeof staffAgeGroups), ...staffAgeGroups].filter((ag) => {
      if (seen.has(ag.id)) return false;
      seen.add(ag.id);
      return true;
    });

    if (allAgeGroups.length === 0) {
      setTeams([]);
      setLoading(false);
      return;
    }

    const ids = allAgeGroups.map((ag) => ag.id);

    // Fetch stats in parallel
    const [
      activePl,
      archivedPl,
      unavailPl,
      schedTrainings,
      closeTrainings,
      schedGames,
      closeGames,
    ] = await Promise.all([
      supabase
        .from("players")
        .select("age_group_id")
        .in("age_group_id", ids)
        .eq("status", "active"),
      supabase
        .from("players")
        .select("age_group_id")
        .in("age_group_id", ids)
        .eq("status", "archived"),
      supabase
        .from("players")
        .select("age_group_id")
        .in("age_group_id", ids)
        .in("status", ["injured", "suspended"]),
      supabase
        .from("training_sessions")
        .select("age_group_id")
        .in("age_group_id", ids)
        .not("status", "eq", "cancelled"),
      supabase
        .from("training_sessions")
        .select("age_group_id")
        .in("age_group_id", ids)
        .eq("status", "scheduled")
        .lt("session_date", today),
      supabase
        .from("games")
        .select("age_group_id")
        .in("age_group_id", ids),
      supabase
        .from("games")
        .select("age_group_id")
        .in("age_group_id", ids)
        .not("status", "in", '("completed","cancelled")')
        .lt("game_datetime", new Date().toISOString()),
    ]);

    function countById(rows: Array<{ age_group_id: string }> | null, id: string) {
      return (rows ?? []).filter((r) => r.age_group_id === id).length;
    }

    const stats: TeamStats[] = allAgeGroups.map((ag) => ({
      ageGroupId: ag.id,
      name: ag.name,
      ageLevel: (ag as { age_level?: string | null }).age_level ?? undefined,
      clubName: ag.club_name,
      clubShortName: ag.club_short_name ?? undefined,
      footballFormat: ag.football_format,
      season: ag.season,
      activePlayers: countById(activePl.data, ag.id),
      archivedPlayers: countById(archivedPl.data, ag.id),
      scheduledTrainings: countById(schedTrainings.data, ag.id),
      scheduledGames: countById(schedGames.data, ag.id),
      unavailablePlayers: countById(unavailPl.data, ag.id),
      gamesToClose: countById(closeGames.data, ag.id),
      trainingsToClose: countById(closeTrainings.data, ag.id),
    }));

    setTeams(stats);
    setLoading(false);
  }

  async function handleCreateTeam(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!coordinatorId) return;

    const useExistingClub = !!existingClubId && !isSuperAdmin;
    const clubName = useExistingClub ? existingClubName : newClubName.trim();
    const clubShortNameRaw = useExistingClub ? existingClubShortName : newClubShortName.trim();
    const clubId = useExistingClub ? existingClubId : null;

    if (!useExistingClub) {
      if (!clubName) {
        toast.error("Introduz o nome do clube.");
        return;
      }
      if (clubShortNameRaw && !isValidManualShortName(clubShortNameRaw, 2, 5)) {
        toast.error("A sigla deve ter entre 2 e 5 caracteres.");
        return;
      }
    }
    if (!newAgeLevel) {
      toast.error("Seleciona o escalão.");
      return;
    }
    if (!newAgeGroupCustomName.trim()) {
      toast.error("Introduz o nome do escalão.");
      return;
    }

    setCreating(true);

    const normalizedShort = clubShortNameRaw
      ? normalizeManualShortName(clubShortNameRaw, 5)
      : null;

    const { data: ag, error: agError } = await supabase
      .from("age_groups")
      .insert({
        coordinator_id: coordinatorId,
        club_id: clubId,
        club_name: clubName,
        club_short_name: normalizedShort,
        name: newAgeGroupCustomName.trim(),
        age_level: newAgeLevel,
        football_format: newFootballFormat,
        season: newSeason,
      })
      .select("id")
      .single();

    if (agError || !ag) {
      toast.error("Erro ao criar equipa: " + (agError?.message ?? ""));
      setCreating(false);
      return;
    }

    await supabase.from("teams").insert({
      age_group_id: ag.id,
      name: `${clubName} ${newAgeGroupCustomName.trim()}`,
      is_competitive: true,
    });

    toast.success("Equipa criada!");
    setShowAddForm(false);
    setNewClubName("");
    setNewClubShortName("");
    setNewAgeGroupCustomName("");
    setNewAgeLevel("");
    setNewFootballFormat("11");
    setNewSeason("2025/2026");
    setCreating(false);
    void loadTeams();
  }

  if (loading) {
    return (
      <div className="p-4 md:p-8 max-w-3xl mx-auto flex items-center justify-center py-16">
        <Loader2 size={28} className="animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Equipas</h1>
        {canCreate && (
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 gap-1.5"
            onClick={() => setShowAddForm(!showAddForm)}
          >
            {showAddForm ? <X size={15} /> : <Plus size={15} />}
            {showAddForm ? "Cancelar" : "Adicionar equipa"}
          </Button>
        )}
      </div>

      {/* Add team form */}
      {showAddForm && (
        <Card className="border-emerald-200 bg-emerald-50/40">
          <CardContent className="pt-5">
            <h2 className="font-semibold text-slate-800 mb-4">Nova equipa</h2>
            <form onSubmit={handleCreateTeam} className="space-y-4">
              {/* Club section — hidden for normal users who already have a club */}
              {isSuperAdmin || !existingClubId ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5 col-span-2">
                    <Label>Nome do Clube *</Label>
                    <Input
                      value={newClubName}
                      onChange={(e) => setNewClubName(e.target.value)}
                      placeholder="ex: Sporting CP"
                    />
                  </div>
                  <div className="space-y-1.5 col-span-2">
                    <Label>Sigla</Label>
                    <Input
                      value={newClubShortName}
                      onChange={(e) =>
                        setNewClubShortName(normalizeManualShortName(e.target.value, 5) || "")
                      }
                      placeholder="ex: SCP"
                      maxLength={5}
                    />
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  Clube: <span className="font-semibold text-slate-700">{existingClubName}</span>
                </p>
              )}
              {/* Nome do Escalão — first field visible to normal users */}
              <div className="space-y-1.5">
                <Label>Nome do Escalão *</Label>
                <Input
                  value={newAgeGroupCustomName}
                  onChange={(e) => setNewAgeGroupCustomName(e.target.value)}
                  placeholder="Ex: Iniciados B, Sub-12 Azul..."
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Escalão *</Label>
                  <Select value={newAgeLevel} onValueChange={setNewAgeLevel}>
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
                  <Label>Formato *</Label>
                  <Select value={newFootballFormat} onValueChange={setNewFootballFormat}>
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
                <div className="space-y-1.5 col-span-2">
                  <Label>Época</Label>
                  <Input
                    value={newSeason}
                    onChange={(e) => setNewSeason(e.target.value)}
                    placeholder="2025/2026"
                  />
                </div>
              </div>
              <Button
                type="submit"
                className="w-full bg-emerald-600 hover:bg-emerald-700"
                disabled={creating || !newAgeLevel || !newAgeGroupCustomName.trim()}
              >
                {creating ? <Loader2 size={16} className="animate-spin" /> : "Criar equipa"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Teams list */}
      {teams.length === 0 ? (
        <Card>
          <CardContent className="pt-8 pb-8 text-center">
            <p className="text-slate-500 text-sm mb-4">Ainda não tens equipas criadas.</p>
            {canCreate && (
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => setShowAddForm(true)}
              >
                <Plus size={15} className="mr-1.5" />
                Criar primeira equipa
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {teams.map((team) => {
            const warnings: string[] = [];
            if (team.unavailablePlayers > 0)
              warnings.push(
                `${team.unavailablePlayers} atleta${team.unavailablePlayers !== 1 ? "s" : ""} indisponível${team.unavailablePlayers !== 1 ? "is" : ""}`,
              );
            if (team.gamesToClose > 0)
              warnings.push(
                `${team.gamesToClose} jogo${team.gamesToClose !== 1 ? "s" : ""} para fechar`,
              );
            if (team.trainingsToClose > 0)
              warnings.push(
                `${team.trainingsToClose} treino${team.trainingsToClose !== 1 ? "s" : ""} para fechar`,
              );

            return (
              <Card key={team.ageGroupId} className="overflow-hidden hover:shadow-md transition-shadow">
                <CardContent className="p-0">
                  {/* Header */}
                  <div className="px-5 pt-4 pb-3 border-b border-slate-100">
                    <p className="font-bold text-slate-900 text-lg leading-tight">{team.name}</p>
                    <p className="text-sm text-slate-500">
                      {team.ageLevel ?? team.name} · {FORMAT_LABELS[team.footballFormat] ?? team.footballFormat} · {team.season}
                    </p>
                  </div>

                  {/* Stats */}
                  <div className="px-5 py-3 grid grid-cols-3 gap-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <Users size={15} className="text-slate-400 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-slate-400">Atletas</p>
                        <p className="text-sm font-semibold text-slate-800">
                          {team.activePlayers}
                          {team.archivedPlayers > 0 && (
                            <span className="font-normal text-slate-400 text-xs ml-1">
                              ({team.archivedPlayers} arq.)
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <CalendarDays size={15} className="text-slate-400 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-slate-400">Treinos</p>
                        <p className="text-sm font-semibold text-slate-800">{team.scheduledTrainings}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Swords size={15} className="text-slate-400 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-slate-400">Jogos</p>
                        <p className="text-sm font-semibold text-slate-800">{team.scheduledGames}</p>
                      </div>
                    </div>
                  </div>

                  {/* Alertas — sempre visíveis */}
                  <div className="px-5 py-3 space-y-1.5 border-b border-slate-100">
                    {[
                      { label: "Atletas indisponíveis", value: team.unavailablePlayers },
                      { label: "Jogos por fechar", value: team.gamesToClose },
                      { label: "Treinos por fechar", value: team.trainingsToClose },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex items-center justify-between">
                        <span className="text-xs text-slate-500">{label}</span>
                        <StatusBadge value={value} />
                      </div>
                    ))}
                  </div>

                  {/* CTA */}
                  <div className="px-5 py-3 flex justify-end">
                    <Link href={`/teams/${team.ageGroupId}`}>
                      <Button variant="outline" size="sm" className="gap-1.5 text-emerald-700 border-emerald-200 hover:bg-emerald-50">
                        Ver Equipa
                        <ChevronRight size={14} />
                      </Button>
                    </Link>
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
