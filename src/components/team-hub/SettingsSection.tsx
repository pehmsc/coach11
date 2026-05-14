"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Loader2,
  Pencil,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PublicSharePanel } from "@/components/team/PublicSharePanel";
import type { AgeGroup, FootballFormat } from "@/types/database";

const TACTICAL_SYSTEMS = [
  "4-3-3", "4-4-2", "4-2-3-1", "4-1-4-1", "4-5-1",
  "3-5-2", "3-4-3", "5-3-2", "5-4-1",
  "3-2-3 (Fut9)", "3-3-2 (Fut9)", "3-4-1 (Fut9)", "2-5-1 (Fut9)", "2-4-2 (Fut9)", "4-3-1 (Fut9)",
  "1-4-1 (Fut7)", "2-3-1 (Fut7)", "3-1-2 (Fut7)",
];

const AGE_GROUPS = [
  "Sub-7", "Sub-8", "Sub-9", "Sub-10", "Sub-11", "Sub-12",
  "Sub-13", "Sub-14", "Sub-15", "Sub-16", "Sub-17", "Sub-18",
  "Sub-19", "Sub-23", "Sénior",
];

const FOOTBALL_FORMATS = [
  { value: "5", label: "5x5 (Futebol 5)" },
  { value: "7", label: "7x7 (Futebol 7)" },
  { value: "9", label: "9x9 (Futebol 9)" },
  { value: "11", label: "11x11 (Futebol 11)" },
];

const FORMAT_LABELS: Record<string, string> = {
  "5": "5x5", "7": "7x7", "9": "9x9", "11": "11x11",
};

type LoadedState = {
  ageGroup: AgeGroup;
  canManage: boolean;
  activePlayersCount: number;
  staffCount: number;
};

type FetchState =
  | { status: "loading" }
  | { status: "not-found" }
  | ({ status: "success" } & LoadedState);

type Props = {
  ageGroupId: string;
};

export function SettingsSection({ ageGroupId }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [state, setState] = useState<FetchState>({ status: "loading" });

  const [tacticalSystem, setTacticalSystem] = useState("");
  const [savingTactical, setSavingTactical] = useState(false);

  const [editingInfo, setEditingInfo] = useState(false);
  const [editName, setEditName] = useState("");
  const [editAgeLevel, setEditAgeLevel] = useState("");
  const [editFormat, setEditFormat] = useState("11");
  const [editSeason, setEditSeason] = useState("");
  const [savingInfo, setSavingInfo] = useState(false);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const [profileRes, agRes, staffLinkRes, playersCountRes, staffCountRes] =
        await Promise.all([
          supabase
            .from("profiles")
            .select("role, is_super_coordinator")
            .eq("id", user.id)
            .maybeSingle(),
          supabase
            .from("age_groups")
            .select("*")
            .eq("id", ageGroupId)
            .maybeSingle(),
          supabase
            .from("age_group_staff")
            .select("role")
            .eq("age_group_id", ageGroupId)
            .eq("profile_id", user.id)
            .maybeSingle(),
          supabase
            .from("players")
            .select("id", { count: "exact", head: true })
            .eq("age_group_id", ageGroupId)
            .eq("status", "active"),
          supabase
            .from("age_group_staff")
            .select("id", { count: "exact", head: true })
            .eq("age_group_id", ageGroupId),
        ]);

      if (cancelled) return;

      const ag = agRes.data;
      if (!ag) {
        setState({ status: "not-found" });
        return;
      }

      const ageGroupData = ag as AgeGroup;
      const profile = profileRes.data;
      const staffLink = staffLinkRes.data;
      const isCoord =
        profile?.role === "coordinator" || profile?.is_super_coordinator;
      const isOwnAg = ag.coordinator_id === user.id;
      const isPrincipal =
        staffLink?.role === "coach" ||
        staffLink?.role === "age_group_coordinator";
      const canManage =
        isCoord || isOwnAg || isPrincipal || !!profile?.is_super_coordinator;

      setTacticalSystem(ag.tactical_system || "");
      setEditName(ag.name ?? "");
      setEditAgeLevel(ag.age_level ?? ag.name ?? "");
      setEditFormat(ag.football_format ?? "11");
      setEditSeason(ag.season ?? "");

      setState({
        status: "success",
        ageGroup: ageGroupData,
        canManage,
        activePlayersCount: playersCountRes.count ?? 0,
        staffCount: staffCountRes.count ?? 0,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [ageGroupId, supabase]);

  async function handleTacticalSave(system: string) {
    if (state.status !== "success" || !state.canManage) return;
    setSavingTactical(true);
    const { error } = await supabase
      .from("age_groups")
      .update({ tactical_system: system || null })
      .eq("id", state.ageGroup.id);
    if (error) toast.error("Erro ao guardar sistema.");
    else {
      setTacticalSystem(system);
      toast.success("Sistema táctico guardado");
    }
    setSavingTactical(false);
  }

  async function handleSaveInfo(e: { preventDefault(): void }) {
    e.preventDefault();
    if (state.status !== "success") return;
    const currentAg = state.ageGroup;
    setSavingInfo(true);
    const { error } = await supabase
      .from("age_groups")
      .update({
        name: editName.trim() || currentAg.name,
        age_level: editAgeLevel.trim() || null,
        football_format: editFormat as FootballFormat,
        season: editSeason.trim() || currentAg.season,
      })
      .eq("id", currentAg.id);
    if (error) {
      toast.error("Erro ao guardar: " + error.message);
    } else {
      setState((prev) =>
        prev.status === "success"
          ? {
              ...prev,
              ageGroup: {
                ...prev.ageGroup,
                name: editName.trim() || prev.ageGroup.name,
                age_level: editAgeLevel.trim() || null,
                football_format:
                  (editFormat as FootballFormat) ||
                  prev.ageGroup.football_format,
                season: editSeason.trim() || prev.ageGroup.season,
              },
            }
          : prev,
      );
      setEditingInfo(false);
      toast.success("Informações da equipa guardadas");
    }
    setSavingInfo(false);
  }

  async function handleDeleteAgeGroup() {
    if (state.status !== "success") return;
    if (deleteConfirmText.trim().toUpperCase() !== "APAGAR ESCALAO") {
      toast.error("Escreve APAGAR ESCALAO para confirmar.");
      return;
    }
    setDeleting(true);
    const res = await fetch("/api/me/age-group", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        confirmation: "DELETE_AGE_GROUP",
        ageGroupId: state.ageGroup.id,
      }),
    });
    const payload = (await res.json().catch(() => null)) as
      | { success?: boolean; error?: string }
      | null;
    if (!res.ok || !payload?.success) {
      toast.error(payload?.error || "Não foi possível apagar o escalão.");
      setDeleting(false);
      return;
    }
    toast.success("Escalão apagado com sucesso.");
    router.push("/teams");
  }

  if (state.status === "loading") {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={24} className="animate-spin text-slate-400" />
      </div>
    );
  }

  if (state.status === "not-found") {
    return (
      <div className="bg-amber-50 text-amber-800 text-sm p-4 rounded-xl border border-amber-200">
        Escalão não encontrado.
      </div>
    );
  }

  const { ageGroup, canManage, activePlayersCount, staffCount } = state;
  const displayAgeLevel = ageGroup.age_level ?? ageGroup.name;
  const displayName = ageGroup.name;
  const formatLabel =
    FORMAT_LABELS[ageGroup.football_format] ?? `F${ageGroup.football_format}`;

  return (
    <>
      <div className="space-y-5">
        {/* Informações da equipa */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Informações da equipa</CardTitle>
              {!editingInfo && canManage && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditName(ageGroup.name);
                    setEditAgeLevel(ageGroup.age_level ?? ageGroup.name);
                    setEditFormat(ageGroup.football_format);
                    setEditSeason(ageGroup.season);
                    setEditingInfo(true);
                  }}
                >
                  <Pencil size={13} className="mr-1" />
                  Editar
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!editingInfo ? (
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                {[
                  ["Nome da equipa", displayName],
                  ["Escalão / Idade", displayAgeLevel],
                  ["Modalidade", formatLabel],
                  ["Época", ageGroup.season],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-xs text-slate-400">{label}</p>
                    <p className="font-medium text-slate-800 mt-0.5">{value}</p>
                  </div>
                ))}
              </div>
            ) : (
              <form onSubmit={handleSaveInfo} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5 col-span-2">
                    <Label>Nome da equipa *</Label>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="ex: Infantis A"
                      required
                    />
                    <p className="text-xs text-slate-400">
                      Nome que o clube dá a esta equipa
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Escalão / Faixa etária</Label>
                    <Select
                      value={editAgeLevel}
                      onValueChange={setEditAgeLevel}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona..." />
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
                    <Select value={editFormat} onValueChange={setEditFormat}>
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
                      value={editSeason}
                      onChange={(e) => setEditSeason(e.target.value)}
                      placeholder="2025/2026"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="submit"
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                    disabled={savingInfo}
                  >
                    {savingInfo ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      "Guardar"
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditingInfo(false)}
                    disabled={savingInfo}
                  >
                    Cancelar
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        {/* Sistema Táctico */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Sistema Táctico</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 items-center">
              <Select
                value={tacticalSystem}
                onValueChange={(val) => {
                  setTacticalSystem(val);
                  void handleTacticalSave(val);
                }}
                disabled={!canManage}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Selecciona sistema..." />
                </SelectTrigger>
                <SelectContent>
                  {TACTICAL_SYSTEMS.map((sys) => (
                    <SelectItem key={sys} value={sys}>
                      {sys}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {savingTactical && (
                <Loader2 size={16} className="animate-spin text-slate-400" />
              )}
            </div>
            {!canManage && (
              <p className="mt-2 text-xs text-slate-400">
                Só o coordenador ou treinador principal podem alterar.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Link Público */}
        <PublicSharePanel ageGroupId={ageGroupId} canManage={canManage} />

        {/* Zona de Perigo */}
        {canManage && ageGroup.coordinator_id && (
          <Card className="border-red-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-red-700">
                Zona de perigo
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-slate-600">
                Apagar o escalão remove toda a informação associada: atletas (
                {activePlayersCount}), staff ({staffCount}), jogos, treinos,
                convocatórias, links públicos e imagens. Esta acção é
                irreversível.
              </p>
              <Button
                variant="outline"
                className="w-full border-red-200 text-red-600 hover:bg-red-50"
                onClick={() => {
                  setDeleteConfirmText("");
                  setDeleteModalOpen(true);
                }}
              >
                <Trash2 size={16} className="mr-2" />
                Apagar escalão
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Modal de confirmação — apagar */}
      {deleteModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 md:items-center"
          onClick={() => {
            if (!deleting) setDeleteModalOpen(false);
          }}
        >
          <div
            className="flex max-h-[calc(100dvh-1rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b p-5">
              <h3 className="flex items-center gap-2 font-bold text-slate-900">
                <AlertTriangle size={18} className="text-red-500" />
                Confirmar apagamento do escalão
              </h3>
              <p className="mt-2 text-sm text-slate-500">
                Esta acção é irreversível. Escreve{" "}
                <strong>APAGAR ESCALAO</strong> para confirmar.
              </p>
            </div>
            <div className="p-5 space-y-3">
              <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-900">
                <p className="font-medium">
                  {ageGroup.club_name} · {displayName}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Confirmação</Label>
                <Input
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="APAGAR ESCALAO"
                  disabled={deleting}
                />
              </div>
            </div>
            <div className="border-t bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setDeleteModalOpen(false)}
                  disabled={deleting}
                >
                  Cancelar
                </Button>
                <Button
                  className="flex-1 bg-red-600 hover:bg-red-700"
                  onClick={() => void handleDeleteAgeGroup()}
                  disabled={deleting}
                >
                  {deleting ? (
                    <Loader2 size={16} className="mr-2 animate-spin" />
                  ) : null}
                  Apagar escalão
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
