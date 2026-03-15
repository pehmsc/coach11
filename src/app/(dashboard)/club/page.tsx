"use client";

import Image from "next/image";
import { useState, useEffect, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ImageIcon, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import {
  isValidManualShortName,
  normalizeManualShortName,
} from "@/lib/football/short-name";
import type {
  AgeGroup,
  KitPiece,
  KitNumber,
  PlayerType,
  PieceType,
} from "@/types/database";

const KIT_NUMBERS: KitNumber[] = [1, 2];
const KIT_LABELS: Record<KitNumber, string> = {
  1: "1.º Kit",
  2: "2.º Kit",
  3: "3.º Kit",
};
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

function normalizePlayerType(value: string | undefined) {
  if (!value) return "";
  return value === "field_player" ? "field" : value;
}

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
  return /^#[0-9a-fA-F]{6}$/.test(normalized)
    ? normalized.toLowerCase()
    : "#cccccc";
}

export default function ClubPage() {
  const supabase = useMemo(() => createClient(), []);
  const logoRef = useRef<HTMLInputElement>(null);
  const kitSaveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ageGroup, setAgeGroup] = useState<AgeGroup | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);

  // Form fields
  const [clubName, setClubName] = useState("");
  const [clubShortName, setClubShortName] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  // Logo
  const [logoUrl, setLogoUrl] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);

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
      const key = `${piece.kit_number}-${normalizePlayerType(piece.player_type)}-${normalizePiece(piece.piece_type)}`;
      if (piece.color_hex) colorMap[key] = piece.color_hex.toLowerCase();
    });
    setKitColors(colorMap);
  }, [kitPieces]);

  async function loadData() {
    setLoading(true);
    const res = await fetch("/api/me/context");
    const payload = await res.json().catch(() => ({}));

    if (!res.ok) {
      toast.error(payload?.error || "Erro ao carregar clube.");
      setLoading(false);
      return;
    }

    const ag = payload?.ageGroup as AgeGroup | null;
    const role = typeof payload?.profile?.role === "string" ? payload.profile.role : "coach";
    const isSuper = payload?.profile?.is_super_coordinator === true;
    const manage = role === "coordinator" || isSuper;
    setCanManage(manage);

    if (!ag) {
      setLoading(false);
      return;
    }

    setAgeGroup(ag);
    setClubName(ag.club_name);
    setClubShortName(normalizeManualShortName(ag.club_short_name, 5) || "");
    setLogoUrl(ag.club_logo_url || "");
    setKitPieces((payload?.kits as KitPiece[]) || []);

    let tid = typeof payload?.teamId === "string" ? payload.teamId : null;
    if (!tid && manage) {
      const { data: newTeam } = await supabase
        .from("teams")
        .insert({
          age_group_id: ag.id,
          name: `${ag.club_name} ${ag.name}`,
          is_competitive: true,
        })
        .select("id")
        .single();
      tid = newTeam?.id ?? null;
    }
    setTeamId(tid);
    setLoading(false);
  }

  async function handleSaveClub(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!ageGroup) return;
    if (!isValidManualShortName(clubShortName, 2, 5)) {
      toast.error("A sigla deve ter entre 2 e 5 caracteres.");
      return;
    }
    setSaving(true);
    const normalizedShort = normalizeManualShortName(clubShortName, 5);
    const { error } = await supabase
      .from("age_groups")
      .update({
        club_name: clubName,
        club_short_name: normalizedShort || null,
      })
      .eq("id", ageGroup.id);

    if (error) {
      toast.error("Erro ao guardar: " + error.message);
    } else {
      setAgeGroup((prev) =>
        prev ? { ...prev, club_name: clubName, club_short_name: normalizedShort || undefined } : prev,
      );
      setIsEditing(false);
      toast.success("Clube atualizado");
    }
    setSaving(false);
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !ageGroup) return;
    setUploadingLogo(true);

    const formData = new FormData();
    formData.set("ageGroupId", ageGroup.id);
    formData.set("file", file);

    const res = await fetch("/api/team/logo", {
      method: "POST",
      body: formData,
      credentials: "include",
    });
    const payload = await res.json().catch(() => ({}));

    if (!res.ok || typeof payload?.url !== "string") {
      toast.error(payload?.error || "Erro ao carregar logo.");
    } else {
      setLogoUrl(payload.url);
      toast.success("Logo atualizado");
    }
    setUploadingLogo(false);
    if (logoRef.current) logoRef.current.value = "";
  }

  function getKitPiece(kitNum: KitNumber, playerType: PlayerType, pieceType: PieceType) {
    const matches = kitPieces.filter(
      (k) =>
        k.kit_number === kitNum &&
        normalizePlayerType(k.player_type) === playerType &&
        samePiece(k.piece_type, pieceType),
    );
    if (matches.length === 0) return undefined;
    return matches.reduce((latest, current) =>
      new Date(current.created_at).getTime() >= new Date(latest.created_at).getTime()
        ? current
        : latest,
    );
  }

  async function handleKitColorChange(
    kitNum: KitNumber,
    playerType: PlayerType,
    pieceType: PieceType,
    colorHex: string,
  ) {
    if (!teamId) return;
    const key = `${kitNum}-${playerType}-${pieceType}`;
    setSavingKit(key);

    const res = await fetch("/api/team/kits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        teamId,
        kitNumber: kitNum,
        playerType,
        pieceType,
        colorHex: normalizeColor(colorHex),
      }),
    });
    const payload = await res.json().catch(() => ({}));

    if (!res.ok || !payload?.piece?.id) {
      toast.error("Erro ao guardar cor do kit.");
    } else {
      const savedPiece = payload.piece as KitPiece;
      setKitPieces((prev) => {
        const filtered = prev.filter(
          (p) =>
            !(
              p.team_id === savedPiece.team_id &&
              p.kit_number === savedPiece.kit_number &&
              normalizePlayerType(p.player_type) === normalizePlayerType(savedPiece.player_type) &&
              samePiece(p.piece_type, savedPiece.piece_type)
            ),
        );
        return [...filtered, savedPiece];
      });
    }
    setSavingKit(null);
  }

  if (loading) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto flex items-center justify-center py-16">
        <Loader2 size={28} className="animate-spin text-slate-400" />
      </div>
    );
  }

  if (!ageGroup) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto">
        <div className="bg-amber-50 text-amber-800 text-sm p-4 rounded-xl border border-amber-200">
          Sem escalão associado. Completa o onboarding primeiro.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Clube</h1>

      {/* Informações do Clube */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Informações do Clube</CardTitle>
              {!isEditing && (
                <p className="text-sm text-slate-500 mt-1">
                  {ageGroup.club_name}
                  {ageGroup.club_short_name ? ` (${ageGroup.club_short_name})` : ""}
                </p>
              )}
            </div>
            {!isEditing && canManage && (
              <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                Editar
              </Button>
            )}
          </div>
        </CardHeader>

        {isEditing && (
          <CardContent>
            <form onSubmit={handleSaveClub} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Nome do Clube *</Label>
                <Input
                  value={clubName}
                  onChange={(e) => setClubName(e.target.value)}
                  placeholder="ex: Sporting CP"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Sigla do Clube</Label>
                <Input
                  value={clubShortName}
                  onChange={(e) =>
                    setClubShortName(normalizeManualShortName(e.target.value, 5) || "")
                  }
                  placeholder="ex: SCP"
                  maxLength={5}
                />
                <p className="text-xs text-slate-400">2 a 5 caracteres</p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="submit"
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                  disabled={saving}
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : "Guardar"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>
                  Cancelar
                </Button>
              </div>
            </form>
          </CardContent>
        )}
      </Card>

      {/* Logo do Clube */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Logo do Clube</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt="Logo"
                width={80}
                height={80}
                className="h-20 w-20 object-contain border border-slate-200 rounded-xl p-2 bg-white"
              />
            ) : (
              <div className="w-20 h-20 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center">
                <ImageIcon size={24} className="text-slate-300" />
              </div>
            )}
            <div>
              <input
                ref={logoRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleLogoUpload}
              />
              {canManage ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => logoRef.current?.click()}
                  disabled={uploadingLogo}
                >
                  {uploadingLogo ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
                  {logoUrl ? "Substituir logo" : "Carregar logo"}
                </Button>
              ) : null}
              <p className="text-xs text-slate-400 mt-1">
                {canManage
                  ? "PNG, JPG, SVG"
                  : "Só o coordenador pode alterar o logótipo."}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Equipamentos / Kits */}
      {teamId && (
        <Card>
          <CardHeader className="pb-0">
            <button
              className="w-full flex items-center justify-between text-left"
              onClick={() => setKitsExpanded(!kitsExpanded)}
            >
              <CardTitle className="text-base">Equipamentos</CardTitle>
              {kitsExpanded ? (
                <ChevronUp size={18} className="text-slate-400" />
              ) : (
                <ChevronDown size={18} className="text-slate-400" />
              )}
            </button>
          </CardHeader>
          {kitsExpanded && (
            <CardContent className="pt-4 space-y-6">
              {KIT_NUMBERS.map((kitNum) => (
                <div key={kitNum} className="space-y-3">
                  <p className="text-sm font-semibold text-slate-700">{KIT_LABELS[kitNum]}</p>
                  {PLAYER_TYPES.map((playerType) => (
                    <div key={playerType} className="space-y-1">
                      <p className="text-xs text-slate-500 font-medium">
                        {PLAYER_TYPE_LABELS[playerType]}
                      </p>
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
                                  disabled={!canManage}
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
                                  className="w-12 h-12 rounded-xl cursor-pointer border-2 border-slate-200 p-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                                  title={PIECE_LABELS[pieceType]}
                                />
                                {isSaving && (
                                  <div className="absolute inset-0 flex items-center justify-center bg-white/70 rounded-xl">
                                    <Loader2 size={12} className="animate-spin text-slate-600" />
                                  </div>
                                )}
                              </div>
                              <span className="text-[10px] text-slate-500">
                                {PIECE_LABELS[pieceType]}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
              {!canManage && (
                <p className="text-xs text-slate-400">
                  Só o coordenador pode alterar os equipamentos.
                </p>
              )}
            </CardContent>
          )}
        </Card>
      )}

      {/* Personalização (placeholder) */}
      <Card className="opacity-60">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-slate-400">Personalização</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-400">
            Cores do clube e domínio personalizado — em breve.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
