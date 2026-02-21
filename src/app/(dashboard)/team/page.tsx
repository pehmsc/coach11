"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, ImageIcon, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import type { AgeGroup, KitPiece, KitNumber, PlayerType, PieceType } from "@/types/database";

const FOOTBALL_FORMATS = [
  { value: "5", label: "Futebol 5" },
  { value: "7", label: "Futebol 7" },
  { value: "9", label: "Futebol 9" },
  { value: "11", label: "Futebol 11" },
];

const AGE_GROUPS = [
  "Sub-7", "Sub-8", "Sub-9", "Sub-10", "Sub-11", "Sub-12",
  "Sub-13", "Sub-14", "Sub-15", "Sub-17", "Sub-19", "Sénior",
];

const TACTICAL_SYSTEMS = [
  "4-3-3", "4-4-2", "4-2-3-1", "4-1-4-1", "4-5-1",
  "3-5-2", "3-4-3", "5-3-2", "5-4-1",
  "3-3-1 (Fut7)", "2-3-1 (Fut7)", "3-2-2 (Fut7)",
  "2-2-2 (Fut5)",
];

const KIT_NUMBERS: KitNumber[] = [1, 2];
const KIT_LABELS: Record<KitNumber, string> = { 1: "1.º Kit", 2: "2.º Kit", 3: "3.º Kit" };
const PIECE_TYPES: PieceType[] = ["shirt", "shorts", "socks"];
const PIECE_LABELS: Record<PieceType, string> = {
  shirt: "Camisola",
  shorts: "Calções",
  socks: "Meias",
};
const PLAYER_TYPES: PlayerType[] = ["field", "goalkeeper"];
const PLAYER_TYPE_LABELS: Record<PlayerType, string> = {
  field: "Campo",
  goalkeeper: "Guarda-redes",
};

function normalizePiece(value: string | undefined) {
  if (!value) return "";
  return value === "jersey" ? "shirt" : value;
}

function samePiece(a: string | undefined, b: string) {
  return normalizePiece(a) === normalizePiece(b);
}

function normalizeColor(value: string | null | undefined) {
  if (!value) return "#cccccc";
  const normalized = value.startsWith("#") ? value : `#${value}`;
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized.toLowerCase() : "#cccccc";
}

export default function TeamPage() {
  const supabase = useMemo(() => createClient(), []);
  const logoRef = useRef<HTMLInputElement>(null);
  const kitSaveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [existingAgeGroup, setExistingAgeGroup] = useState<AgeGroup | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [accountRole, setAccountRole] = useState<string>("coordinator");

  // Escalão fields
  const [clubName, setClubName] = useState("");
  const [ageGroupName, setAgeGroupName] = useState("");
  const [footballFormat, setFootballFormat] = useState("");
  const [season, setSeason] = useState("2025/2026");
  const [isEditing, setIsEditing] = useState(false);

  // Logo
  const [logoUrl, setLogoUrl] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Tactical system
  const [tacticalSystem, setTacticalSystem] = useState("");
  const [savingTactical, setSavingTactical] = useState(false);

  // Kits
  const [kitPieces, setKitPieces] = useState<KitPiece[]>([]);
  const [kitColors, setKitColors] = useState<Record<string, string>>({});
  const [savingKit, setSavingKit] = useState<string | null>(null);
  const [kitsExpanded, setKitsExpanded] = useState(false);

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const colorMap: Record<string, string> = {};
    kitPieces.forEach((piece) => {
      const key = `${piece.kit_number}-${piece.player_type}-${normalizePiece(piece.piece_type)}`;
      if (piece.color_hex) colorMap[key] = piece.color_hex.toLowerCase();
    });
    setKitColors(colorMap);
  }, [kitPieces]);

  async function loadData() {
    setLoading(true);
    const res = await fetch("/api/me/context", { cache: "no-store" });
    const payload = await res.json().catch(() => ({}));

    if (!res.ok) {
      toast.error(payload?.error || "Erro ao carregar equipa.");
      setLoading(false);
      return;
    }

    const ag = payload?.ageGroup as AgeGroup | null;
    const incomingRole = typeof payload?.profile?.role === "string" ? payload.profile.role : "coordinator";
    setAccountRole(incomingRole);

    if (!ag) {
      setLoading(false);
      return;
    }

    setExistingAgeGroup(ag);
    setClubName(ag.club_name);
    setAgeGroupName(ag.name);
    setFootballFormat(ag.football_format);
    setSeason(ag.season);
    setLogoUrl(ag.club_logo_url || "");
    setKitPieces((payload?.kits as KitPiece[]) || []);

    let tid = typeof payload?.teamId === "string" ? payload.teamId : null;
    if (!tid && incomingRole === "coordinator") {
      const { data: newTeam } = await supabase
        .from("teams")
        .insert({ age_group_id: ag.id, name: `${ag.club_name} ${ag.name}`, is_competitive: true })
        .select("id, tactical_system")
        .single();
      tid = newTeam?.id ?? null;
    } else if (tid) {
      const { data: team } = await supabase
        .from("teams")
        .select("tactical_system")
        .eq("id", tid)
        .maybeSingle();
      setTacticalSystem(team?.tactical_system || "");
    }
    setTeamId(tid);
    setLoading(false);
  }

  async function handleSaveSetup(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!existingAgeGroup) return;
    setSaving(true);

    const { error } = await supabase
      .from("age_groups")
      .update({ club_name: clubName, name: ageGroupName, football_format: footballFormat, season })
      .eq("id", existingAgeGroup.id);

    if (error) {
      toast.error("Erro ao guardar: " + error.message);
    } else {
      toast.success("Escalão atualizado");
      setExistingAgeGroup((prev) => prev ? { ...prev, club_name: clubName, name: ageGroupName } : prev);
      setIsEditing(false);
    }
    setSaving(false);
  }

  async function handleTacticalSave(system: string) {
    if (!teamId) return;
    setSavingTactical(true);
    const { error } = await supabase
      .from("teams")
      .update({ tactical_system: system || null })
      .eq("id", teamId);
    if (error) {
      toast.error("Erro ao guardar sistema.");
    } else {
      setTacticalSystem(system);
      toast.success("Sistema táctico guardado");
    }
    setSavingTactical(false);
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !existingAgeGroup) return;
    setUploadingLogo(true);

    const formData = new FormData();
    formData.set("ageGroupId", existingAgeGroup.id);
    formData.set("file", file);

    const res = await fetch("/api/team/logo", { method: "POST", body: formData, credentials: "include" });
    const payload = await res.json().catch(() => ({}));

    if (!res.ok || typeof payload?.url !== "string") {
      toast.error(payload?.error || "Erro ao carregar logo.");
    } else {
      setLogoUrl(payload.url);
      setExistingAgeGroup((prev) => prev ? { ...prev, club_logo_url: payload.url } : prev);
      toast.success("Logo atualizado");
    }

    setUploadingLogo(false);
    if (logoRef.current) logoRef.current.value = "";
  }

  function getKitPiece(kitNum: KitNumber, playerType: PlayerType, pieceType: PieceType) {
    const matches = kitPieces.filter(
      (k) => k.kit_number === kitNum && k.player_type === playerType && samePiece(k.piece_type, pieceType),
    );
    if (matches.length === 0) return undefined;
    return matches.reduce((latest, current) =>
      new Date(current.created_at).getTime() >= new Date(latest.created_at).getTime() ? current : latest,
    );
  }

  async function handleKitColorChange(kitNum: KitNumber, playerType: PlayerType, pieceType: PieceType, colorHex: string) {
    if (!teamId) return;
    const key = `${kitNum}-${playerType}-${pieceType}`;
    setSavingKit(key);

    const res = await fetch("/api/team/kits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ teamId, kitNumber: kitNum, playerType, pieceType, colorHex: normalizeColor(colorHex) }),
    });
    const payload = await res.json().catch(() => ({}));

    if (!res.ok || !payload?.piece?.id) {
      toast.error("Erro ao guardar cor do kit.");
    } else {
      const savedPiece = payload.piece as KitPiece;
      setKitPieces((prev) => {
        const filtered = prev.filter(
          (p) => !(p.team_id === savedPiece.team_id && p.kit_number === savedPiece.kit_number &&
            p.player_type === savedPiece.player_type && samePiece(p.piece_type, savedPiece.piece_type)),
        );
        return [...filtered, savedPiece];
      });
    }
    setSavingKit(null);
  }

  if (loading) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto">
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="animate-spin text-slate-400" />
        </div>
      </div>
    );
  }

  if (!existingAgeGroup && accountRole !== "coordinator") {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto">
        <div className="bg-amber-50 text-amber-800 text-sm p-4 rounded-xl border border-amber-200">
          Conta de treinador sem acesso de coordenador. Acede via convite do coordenador.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Equipa</h1>

      {/* Escalão */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Escalão</CardTitle>
              {existingAgeGroup && !isEditing && (
                <p className="text-sm text-slate-500 mt-1">
                  {existingAgeGroup.club_name} · {existingAgeGroup.name} · Futebol {existingAgeGroup.football_format} · {existingAgeGroup.season}
                </p>
              )}
            </div>
            {existingAgeGroup && !isEditing && accountRole === "coordinator" && (
              <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                Editar
              </Button>
            )}
          </div>
        </CardHeader>

        {(!existingAgeGroup || isEditing) && (
          <CardContent>
            <form onSubmit={handleSaveSetup} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Nome do Clube *</Label>
                <Input value={clubName} onChange={(e) => setClubName(e.target.value)} placeholder="ex: Sporting CP" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Escalão *</Label>
                  <Select value={ageGroupName} onValueChange={setAgeGroupName}>
                    <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                    <SelectContent>
                      {AGE_GROUPS.map((ag) => <SelectItem key={ag} value={ag}>{ag}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Modalidade *</Label>
                  <Select value={footballFormat} onValueChange={setFootballFormat}>
                    <SelectTrigger><SelectValue placeholder="Futebol..." /></SelectTrigger>
                    <SelectContent>
                      {FOOTBALL_FORMATS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Época</Label>
                <Input value={season} onChange={(e) => setSeason(e.target.value)} placeholder="2025/2026" />
              </div>
              <div className="flex gap-2">
                <Button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-700" disabled={saving}>
                  {saving ? <Loader2 size={16} className="animate-spin" /> : existingAgeGroup ? "Guardar" : "Criar escalão"}
                </Button>
                {isEditing && (
                  <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>Cancelar</Button>
                )}
              </div>
            </form>
          </CardContent>
        )}
      </Card>

      {/* Logo */}
      {existingAgeGroup && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Logo do Clube</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="w-20 h-20 object-contain border border-slate-200 rounded-xl p-2 bg-white" />
              ) : (
                <div className="w-20 h-20 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center">
                  <ImageIcon size={24} className="text-slate-300" />
                </div>
              )}
              <div>
                <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => logoRef.current?.click()}
                  disabled={uploadingLogo}
                >
                  {uploadingLogo ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
                  {logoUrl ? "Substituir logo" : "Carregar logo"}
                </Button>
                <p className="text-xs text-slate-400 mt-1">PNG, JPG, SVG</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sistema Táctico */}
      {existingAgeGroup && teamId && (
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
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Selecciona sistema..." />
                </SelectTrigger>
                <SelectContent>
                  {TACTICAL_SYSTEMS.map((sys) => (
                    <SelectItem key={sys} value={sys}>{sys}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {savingTactical && <Loader2 size={16} className="animate-spin text-slate-400" />}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Kits */}
      {existingAgeGroup && teamId && (
        <Card>
          <CardHeader className="pb-0">
            <button
              className="w-full flex items-center justify-between text-left"
              onClick={() => setKitsExpanded(!kitsExpanded)}
            >
              <CardTitle className="text-base">Equipamentos</CardTitle>
              {kitsExpanded ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
            </button>
          </CardHeader>
          {kitsExpanded && (
            <CardContent className="pt-4 space-y-6">
              {KIT_NUMBERS.map((kitNum) => (
                <div key={kitNum} className="space-y-3">
                  <p className="text-sm font-semibold text-slate-700">{KIT_LABELS[kitNum]}</p>
                  {PLAYER_TYPES.map((playerType) => (
                    <div key={playerType} className="space-y-1">
                      <p className="text-xs text-slate-500 font-medium">{PLAYER_TYPE_LABELS[playerType]}</p>
                      <div className="flex gap-3 flex-wrap">
                        {PIECE_TYPES.map((pieceType) => {
                          const key = `${kitNum}-${playerType}-${pieceType}`;
                          const piece = getKitPiece(kitNum, playerType, pieceType);
                          const currentColor = kitColors[key] || normalizeColor(piece?.color_hex);
                          const isSaving = savingKit === key;

                          return (
                            <div key={pieceType} className="flex flex-col items-center gap-1">
                              <div className="relative">
                                <input
                                  type="color"
                                  value={currentColor}
                                  onChange={(e) => {
                                    const newColor = e.target.value;
                                    setKitColors((prev) => ({ ...prev, [key]: newColor }));
                                    const existing = kitSaveTimers.current.get(key);
                                    if (existing) clearTimeout(existing);
                                    const timer = setTimeout(() => {
                                      void handleKitColorChange(kitNum, playerType, pieceType, newColor);
                                      kitSaveTimers.current.delete(key);
                                    }, 600);
                                    kitSaveTimers.current.set(key, timer);
                                  }}
                                  onBlur={(e) => {
                                    const existing = kitSaveTimers.current.get(key);
                                    if (existing) {
                                      clearTimeout(existing);
                                      kitSaveTimers.current.delete(key);
                                    }
                                    void handleKitColorChange(kitNum, playerType, pieceType, e.target.value);
                                  }}
                                  className="w-12 h-12 rounded-xl cursor-pointer border-2 border-slate-200 p-0.5"
                                  title={PIECE_LABELS[pieceType]}
                                />
                                {isSaving && (
                                  <div className="absolute inset-0 flex items-center justify-center bg-white/70 rounded-xl">
                                    <Loader2 size={12} className="animate-spin text-slate-600" />
                                  </div>
                                )}
                              </div>
                              <span className="text-[10px] text-slate-500">{PIECE_LABELS[pieceType]}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
