"use client";

import Image from "next/image";
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
import { Loader2, ImageIcon, ChevronDown, ChevronUp, Plus, Copy, Check, X, Mail, Trash2 } from "lucide-react";
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
import { AGE_GROUP_STAFF_ROLE_LABELS, getStaffRoleLabel } from "@/lib/team/staff-role";

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

const CLUB_COORDINATOR_OPTION = { value: "club_coordinator", label: "Coordenador de Clube" };
const AGE_GROUP_COORDINATOR_OPTION = { value: "age_group_coordinator", label: "Coordenador de Escalão" };
const INVITE_ROLE_OPTIONS = Object.entries(AGE_GROUP_STAFF_ROLE_LABELS).map(
  ([value, label]) => ({ value, label }),
);

const EMPTY_INVITE_FORM = {
  firstName: "",
  lastName: "",
  email: "",
  role: "assistant_coach",
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

type StaffMember = {
  id: string;
  profile_id: string;
  role: string;
  full_name: string | null;
  is_coordinator?: boolean;
  is_club_coordinator?: boolean;
  email?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
};

type StaffInvite = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  invite_code: string;
  accepted_at?: string;
  invite_sent_at: string;
};

type ClubTab = "info" | "members" | "settings";

export default function ClubPage() {
  const supabase = useMemo(() => createClient(), []);
  const logoRef = useRef<HTMLInputElement>(null);
  const kitSaveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ageGroup, setAgeGroup] = useState<AgeGroup | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [isClubCoordinator, setIsClubCoordinator] = useState(false);
  const [isSuperCoordinator, setIsSuperCoordinator] = useState(false);
  const [activeTab, setActiveTab] = useState<ClubTab>("info");

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

  // Members tab
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [staffInvites, setStaffInvites] = useState<StaffInvite[]>([]);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteForm, setInviteForm] = useState(EMPTY_INVITE_FORM);
  const [sendingInvite, setSendingInvite] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [confirmRemoveMemberId, setConfirmRemoveMemberId] = useState<string | null>(null);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);

  // Settings tab — Danger zone
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingClub, setDeletingClub] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void loadData(controller.signal);
    return () => controller.abort();
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

  async function loadData(signal?: AbortSignal) {
    setLoading(true);
    const res = await fetch("/api/me/context", { signal });
    const payload = await res.json().catch(() => ({}));

    if (!res.ok) {
      toast.error(payload?.error || "Erro ao carregar clube.");
      setLoading(false);
      return;
    }

    const ag = payload?.ageGroup as AgeGroup | null;
    const role = typeof payload?.profile?.role === "string" ? payload.profile.role : "coach";
    const isSuper = payload?.profile?.is_super_coordinator === true;
    const source = typeof payload?.source === "string" ? payload.source : null;
    const isClubCoord = source === "club_coordinator";
    const manage = role === "coordinator" || isSuper;
    setCanManage(manage);
    setIsClubCoordinator(isClubCoord);
    setIsSuperCoordinator(isSuper);

    const rawMembers = (payload?.staffMembers as StaffMember[]) || [];
    setStaffMembers(
      rawMembers
        .map((m) => ({
          ...m,
          full_name: m.full_name || "Sem nome",
        }))
        .sort((a, b) => {
          const aPriority = a.is_coordinator ? 0 : 1;
          const bPriority = b.is_coordinator ? 0 : 1;
          if (aPriority !== bPriority) return aPriority - bPriority;
          return (a.full_name || "").localeCompare(b.full_name || "", "pt");
        }),
    );

    const rawInvites = (payload?.staffInvites as Array<Record<string, unknown>>) || [];
    setStaffInvites(
      rawInvites
        .filter((inv) => !inv.accepted_at)
        .map((inv) => ({
          id: String(inv.id ?? ""),
          first_name: String(inv.first_name ?? ""),
          last_name: String(inv.last_name ?? ""),
          email: String(inv.email ?? ""),
          role: String(inv.role ?? ""),
          invite_code: String(inv.invite_code ?? ""),
          accepted_at: inv.accepted_at ? String(inv.accepted_at) : undefined,
          invite_sent_at: String(inv.created_at ?? ""),
        })),
    );

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

  async function handleSendInvite(e: { preventDefault(): void }) {
    e.preventDefault();
    setSendingInvite(true);
    const res = await fetch("/api/invite/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: inviteForm.firstName,
        lastName: inviteForm.lastName,
        email: inviteForm.email,
        role: inviteForm.role,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.success) {
      setShowInviteForm(false);
      setInviteForm(EMPTY_INVITE_FORM);
      if (data.emailSent) {
        toast.success("Convite enviado.");
      } else {
        toast.warning(data.warning || "Convite criado, mas email não enviado.");
      }
      void loadData();
    } else {
      toast.error(data.error || "Erro ao enviar convite.");
    }
    setSendingInvite(false);
  }

  async function handleRemoveMember(staffId: string) {
    setRemovingMemberId(staffId);
    setConfirmRemoveMemberId(null);
    const res = await fetch(`/api/staff/${staffId}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data?.error || "Erro ao remover membro.");
    } else {
      setStaffMembers((prev) => prev.filter((m) => m.id !== staffId));
      toast.success("Membro removido.");
    }
    setRemovingMemberId(null);
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code).catch(() => null);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  }

  async function handleDeleteClub(e: { preventDefault(): void }) {
    e.preventDefault();
    setDeletingClub(true);
    const res = await fetch("/api/club", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: deleteConfirmName }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data?.error || "Erro ao apagar dados do clube.");
      setDeletingClub(false);
      return;
    }
    toast.success("Todos os dados do clube foram apagados.");
    setShowDeleteModal(false);
    // Redirect to dashboard — page data is now stale
    window.location.href = "/dashboard";
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

  const canDangerZone = isClubCoordinator || isSuperCoordinator;

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Clube</h1>

      {/* Tab navigation */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
        {(["info", "members", "settings"] as ClubTab[]).map((tab) => {
          const labels: Record<ClubTab, string> = {
            info: "Informações",
            members: "Membros",
            settings: "Configurações",
          };
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeTab === tab
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {labels[tab]}
            </button>
          );
        })}
      </div>

      {/* ─── Informações tab ─── */}
      {activeTab === "info" && (
        <>
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
        </>
      )}

      {/* ─── Membros tab ─── */}
      {activeTab === "members" && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">
              Membros da equipa técnica deste escalão.
            </p>
            {canManage && (
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => setShowInviteForm(true)}
              >
                <Plus size={15} className="mr-1" /> Convidar
              </Button>
            )}
          </div>

          {/* Lista de membros */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Membros actuais</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {staffMembers.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">Sem membros na equipa técnica.</p>
              ) : (
                staffMembers.map((member) => (
                  <div key={member.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                    <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 font-bold text-sm shrink-0">
                      {(member.full_name || "?")[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">
                        {member.full_name || "Sem nome"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {getStaffRoleLabel(member.role)}
                        {member.is_club_coordinator
                          ? " · Coordenador do Clube"
                          : member.is_coordinator
                            ? " · Coordenador do escalão"
                            : ""}
                      </p>
                      {member.email && (
                        <p className="text-xs text-slate-400 truncate">{member.email}</p>
                      )}
                    </div>
                    {canManage && !member.is_coordinator && (
                      confirmRemoveMemberId === member.id ? (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => void handleRemoveMember(member.id)}
                            disabled={removingMemberId === member.id}
                            className="text-xs font-semibold text-white bg-red-500 hover:bg-red-600 px-2 py-1 rounded-lg"
                          >
                            {removingMemberId === member.id ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              "Remover"
                            )}
                          </button>
                          <button
                            onClick={() => setConfirmRemoveMemberId(null)}
                            className="text-xs text-slate-400 px-1.5 py-1"
                          >
                            Não
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmRemoveMemberId(member.id)}
                          className="p-1.5 hover:bg-red-50 rounded-lg group shrink-0"
                          title="Remover da equipa"
                        >
                          <Trash2 size={14} className="text-slate-300 group-hover:text-red-500 transition-colors" />
                        </button>
                      )
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Convites pendentes */}
          {staffInvites.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Mail size={16} className="text-slate-500" />
                  Convites pendentes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {staffInvites.map((invite) => (
                  <div key={invite.id} className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-100 rounded-xl">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800">
                        {invite.first_name} {invite.last_name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {invite.email} · {getStaffRoleLabel(invite.role)}
                      </p>
                    </div>
                    <button
                      onClick={() => copyCode(invite.invite_code)}
                      className="p-1.5 hover:bg-amber-100 rounded-lg text-amber-600 shrink-0"
                      title="Copiar código"
                    >
                      {copiedCode === invite.invite_code ? (
                        <Check size={14} className="text-emerald-600" />
                      ) : (
                        <Copy size={14} />
                      )}
                    </button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ─── Configurações tab ─── */}
      {activeTab === "settings" && (
        <>
          {canDangerZone ? (
            <Card className="border-red-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-red-700">Zona de Perigo</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-slate-600">
                  Apaga permanentemente todos os dados do clube: escalões, jogadores, treinos, jogos, competições e equipa técnica. Esta acção é irreversível.
                </p>
                <Button
                  variant="outline"
                  className="border-red-300 text-red-600 hover:bg-red-50"
                  onClick={() => { setDeleteConfirmName(""); setShowDeleteModal(true); }}
                >
                  Apagar todos os dados do clube
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="opacity-60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-slate-400">Configurações avançadas</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-400">
                  Apenas o coordenador de clube tem acesso a estas configurações.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ─── Modal: Convidar membro ─── */}
      {showInviteForm && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-4"
          onClick={() => setShowInviteForm(false)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center p-5 border-b">
              <h3 className="font-bold text-slate-900">Convidar Membro</h3>
              <button onClick={() => setShowInviteForm(false)}>
                <X size={20} className="text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleSendInvite} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Nome *</Label>
                  <Input
                    value={inviteForm.firstName}
                    onChange={(e) => setInviteForm((f) => ({ ...f, firstName: e.target.value }))}
                    placeholder="Nome"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Apelido *</Label>
                  <Input
                    value={inviteForm.lastName}
                    onChange={(e) => setInviteForm((f) => ({ ...f, lastName: e.target.value }))}
                    placeholder="Apelido"
                    required
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="email@exemplo.com"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Função *</Label>
                <Select
                  value={inviteForm.role}
                  onValueChange={(v) => setInviteForm((f) => ({ ...f, role: v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {isClubCoordinator && (
                      <SelectItem value={CLUB_COORDINATOR_OPTION.value}>
                        {CLUB_COORDINATOR_OPTION.label}
                      </SelectItem>
                    )}
                    <SelectItem value={AGE_GROUP_COORDINATOR_OPTION.value}>
                      {AGE_GROUP_COORDINATOR_OPTION.label}
                    </SelectItem>
                    {INVITE_ROLE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  type="submit"
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                  disabled={sendingInvite}
                >
                  {sendingInvite ? <Loader2 size={16} className="animate-spin" /> : "Enviar convite"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowInviteForm(false)}>
                  Cancelar
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Modal: Confirmar apagar clube ─── */}
      {showDeleteModal && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={() => setShowDeleteModal(false)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-sm shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 space-y-4">
              <h3 className="font-bold text-slate-900 text-lg">Apagar todos os dados do clube</h3>
              <p className="text-sm text-slate-600">
                Esta acção apaga permanentemente todos os escalões, jogadores, jogos, treinos e dados associados ao clube <strong>{ageGroup.club_name}</strong>.
              </p>
              <p className="text-sm text-slate-600">
                Para confirmar, escreve o nome do clube:
              </p>
              <form onSubmit={handleDeleteClub} className="space-y-3">
                <Input
                  value={deleteConfirmName}
                  onChange={(e) => setDeleteConfirmName(e.target.value)}
                  placeholder={ageGroup.club_name}
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button
                    type="submit"
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                    disabled={
                      deletingClub ||
                      deleteConfirmName.trim().toLowerCase() !== ageGroup.club_name.trim().toLowerCase()
                    }
                  >
                    {deletingClub ? <Loader2 size={16} className="animate-spin" /> : "Apagar tudo"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setShowDeleteModal(false)}>
                    Cancelar
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
