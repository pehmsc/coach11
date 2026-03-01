"use client";

import { useState, useEffect, useMemo, useRef } from "react";
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
import {
  Plus,
  X,
  Mail,
  Check,
  Copy,
  Users,
  Trash2,
  Loader2,
  ImageIcon,
  Palette,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  isValidManualShortName,
  normalizeManualShortName,
} from "@/lib/football/short-name";
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

const ROLE_OPTIONS = [
  { value: "coach", label: "Treinador Principal" },
  { value: "assistant_coach", label: "Treinador Adjunto" },
];

const ROLE_LABELS: Record<string, string> = {
  coach: "Treinador Principal",
  assistant_coach: "Treinador Adjunto",
  coordinator: "Coordenador",
};

const KIT_NUMBERS: KitNumber[] = [1, 2];
const KIT_LABELS: Record<KitNumber, string> = { 1: "1.º Kit", 2: "2.º Kit", 3: "3.º Kit" };
const PIECE_TYPES: PieceType[] = ["shirt", "shorts", "socks"];
const PIECE_LABELS: Record<PieceType, string> = { shirt: "Camisola", shorts: "Calções", socks: "Meias" };
const PLAYER_TYPES: PlayerType[] = ["field", "goalkeeper"];
const PLAYER_TYPE_LABELS: Record<PlayerType, string> = { field: "Campo", goalkeeper: "Guarda-redes" };

function normalizePlayerTypeForComparison(value: string | undefined) {
  if (!value) return "";
  return value === "field_player" ? "field" : value;
}

function normalizePieceTypeForComparison(value: string | undefined) {
  if (!value) return "";
  return value === "jersey" ? "shirt" : value;
}

function samePieceType(dbPieceType: string | undefined, requestedPieceType: string) {
  if (!dbPieceType) return false;
  return (
    normalizePieceTypeForComparison(dbPieceType) ===
    normalizePieceTypeForComparison(requestedPieceType)
  );
}

interface StaffInvite {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  invite_code: string;
  accepted_at?: string;
  accepted_by?: string;
  invite_sent_at: string;
}

interface PublicShareTokenSummary {
  id: string;
  age_group_id: string;
  expires_at: string | null;
  revoked_at: string | null;
  last_accessed_at: string | null;
  access_count: number;
  created_at: string;
}

const EMPTY_STAFF_FORM = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  role: "assistant_coach",
};

export default function TeamSetupPage() {
  const supabase = useMemo(() => createClient(), []);
  const logoRef = useRef<HTMLInputElement>(null);
  const kitSaveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  // Escalão
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kitStatusMessage, setKitStatusMessage] = useState<string | null>(null);
  const [existingAgeGroup, setExistingAgeGroup] = useState<AgeGroup | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [clubName, setClubName] = useState("");
  const [clubShortName, setClubShortName] = useState("");
  const [ageGroupName, setAgeGroupName] = useState("");
  const [footballFormat, setFootballFormat] = useState("");
  const [season, setSeason] = useState("2025/2026");
  const [isEditing, setIsEditing] = useState(false);

  // Logo
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string>("");

  // Kits
  const [kitPieces, setKitPieces] = useState<KitPiece[]>([]);
  const [kitColors, setKitColors] = useState<Record<string, string>>({});
  const [savingKit, setSavingKit] = useState<string | null>(null);
  const [kitsExpanded, setKitsExpanded] = useState(false);

  // Treinadores convidados
  const [staffInvites, setStaffInvites] = useState<StaffInvite[]>([]);
  const [activeStaffProfileIds, setActiveStaffProfileIds] = useState<string[]>([]);
  const [showStaffForm, setShowStaffForm] = useState(false);
  const [staffForm, setStaffForm] = useState(EMPTY_STAFF_FORM);
  const [sendingInvite, setSendingInvite] = useState(false);
  const [inviteResult, setInviteResult] = useState<{
    code: string;
    emailSent: boolean;
    name: string;
  } | null>(null);
  const [staffInvitesExpanded, setStaffInvitesExpanded] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [accountRole, setAccountRole] = useState<string>("coordinator");
  const [publicShare, setPublicShare] = useState<PublicShareTokenSummary | null>(null);
  const [publicShareUrl, setPublicShareUrl] = useState<string | null>(null);
  const [loadingPublicShare, setLoadingPublicShare] = useState(false);
  const [managingPublicShare, setManagingPublicShare] = useState(false);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync kit colors from kitPieces whenever they change
  useEffect(() => {
    const colorMap: Record<string, string> = {};
    kitPieces.forEach((piece) => {
      const normalizedType = normalizePieceTypeForComparison(piece.piece_type);
      const normalizedPlayerType = normalizePlayerTypeForComparison(piece.player_type);
      const key = `${piece.kit_number}-${normalizedPlayerType}-${normalizedType}`;
      if (piece.color_hex) colorMap[key] = piece.color_hex.toLowerCase();
    });
    setKitColors(colorMap);
  }, [kitPieces]);

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/me/context");
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(payload?.error || "Erro ao carregar contexto da equipa.");
        setLoading(false);
        return;
      }

      const ag = payload?.ageGroup as AgeGroup | null;
      const incomingTeamId =
        typeof payload?.teamId === "string" ? (payload.teamId as string) : null;
      const incomingRole =
        typeof payload?.profile?.role === "string"
          ? (payload.profile.role as string)
          : "coordinator";
      setAccountRole(incomingRole);

      if (!ag) {
        setExistingAgeGroup(null);
        setTeamId(null);
        setKitPieces([]);
        setActiveStaffProfileIds([]);
        setStaffInvites([]);
        setPublicShare(null);
        setPublicShareUrl(null);
        setLoading(false);
        return;
      }

      setExistingAgeGroup(ag);
      setClubName(ag.club_name);
      setClubShortName(normalizeManualShortName(ag.club_short_name, 5) || "");
      setAgeGroupName(ag.name);
      setFootballFormat(ag.football_format);
      setSeason(ag.season);
      setLogoUrl(ag.club_logo_url || "");

      let resolvedTeamId = incomingTeamId;

      // Coordenador sem equipa associada: criar automaticamente.
      if (!resolvedTeamId) {
        const { data: newTeam } = await supabase
          .from("teams")
          .insert({
            age_group_id: ag.id,
            name: `${ag.club_name} ${ag.name}`,
            is_competitive: true,
          })
          .select("id")
          .single();
        resolvedTeamId = newTeam?.id ?? null;
      }

      setTeamId(resolvedTeamId);
      setKitPieces((payload?.kits as KitPiece[]) || []);
      setActiveStaffProfileIds((payload?.activeStaffProfileIds as string[]) || []);
      const nextStaffInvites = (payload?.staffInvites as StaffInvite[]) || [];
      setStaffInvites(nextStaffInvites);
      if (nextStaffInvites.length === 0) {
        setStaffInvitesExpanded(false);
      }
      await loadPublicShare(ag.id);
    } catch {
      setError("Erro de ligação ao carregar a equipa.");
    } finally {
      setLoading(false);
    }
  }

  async function loadPublicShare(ageGroupId: string) {
    setLoadingPublicShare(true);

    try {
      const res = await fetch(
        `/api/public-share?ageGroupId=${encodeURIComponent(ageGroupId)}`,
        { cache: "no-store" },
      );
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        setPublicShare(null);
        return;
      }

      setPublicShare(
        payload?.share ? (payload.share as PublicShareTokenSummary) : null,
      );
    } catch {
      setPublicShare(null);
    } finally {
      setLoadingPublicShare(false);
    }
  }

  async function handleSaveSetup(e: { preventDefault(): void }) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const normalizedClubShortName = normalizeManualShortName(clubShortName, 5);
    if (!isValidManualShortName(clubShortName, 2, 5)) {
      setError("A sigla deve ter entre 2 e 5 caracteres.");
      setSaving(false);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }

    if (!existingAgeGroup && accountRole !== "coordinator") {
      setError("Conta de treinador: não podes criar um novo escalão.");
      setSaving(false);
      return;
    }

    if (existingAgeGroup) {
      const { error } = await supabase
        .from("age_groups")
        .update({
          club_name: clubName,
          club_short_name: normalizedClubShortName || null,
          name: ageGroupName,
          football_format: footballFormat,
          season,
        })
        .eq("id", existingAgeGroup.id);
      if (error) {
        setError("Erro ao guardar.");
        setSaving(false);
        return;
      }
      setExistingAgeGroup((prev) =>
        prev
          ? {
              ...prev,
              club_name: clubName,
              club_short_name: normalizedClubShortName || undefined,
              name: ageGroupName,
            }
          : prev,
      );
    } else {
      const { data, error } = await supabase
        .from("age_groups")
        .insert({
          coordinator_id: user.id,
          club_name: clubName,
          club_short_name: normalizedClubShortName || null,
          name: ageGroupName,
          football_format: footballFormat,
          season,
        })
        .select()
        .single();
      if (error) {
        setError("Erro ao criar escalão.");
        setSaving(false);
        return;
      }
      setExistingAgeGroup(data);

      // Criar equipa padrão associada ao escalão (necessário para convites de staff)
      const { data: newTeam } = await supabase
        .from("teams")
        .insert({
          age_group_id: data.id,
          name: `${clubName} ${ageGroupName}`,
          is_competitive: true,
        })
        .select()
        .single();
      if (newTeam) {
        setTeamId(newTeam.id);
      }
    }

    setSaved(true);
    setIsEditing(false);
    setSaving(false);
    setTimeout(() => setSaved(false), 3000);
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !existingAgeGroup) return;
    setUploadingLogo(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.set("ageGroupId", existingAgeGroup.id);
      formData.set("file", file);

      const res = await fetch("/api/team/logo", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok || typeof payload?.url !== "string") {
        setError(payload?.error || "Erro ao carregar logotipo.");
        return;
      }

      const url = payload.url as string;
      setLogoUrl(url);
      setExistingAgeGroup((prev) => (prev ? { ...prev, club_logo_url: url } : prev));
    } catch {
      setError("Erro ao carregar logotipo.");
    } finally {
      setUploadingLogo(false);
      if (logoRef.current) {
        logoRef.current.value = "";
      }
    }
  }

  function getKitPiece(kitNum: KitNumber, playerType: PlayerType, pieceType: PieceType) {
    const matches = kitPieces.filter(
      (k) =>
        k.kit_number === kitNum &&
        normalizePlayerTypeForComparison(k.player_type) === playerType &&
        samePieceType(k.piece_type, pieceType),
    );
    if (matches.length === 0) return undefined;
    return matches.reduce((latest, current) =>
      new Date(current.created_at).getTime() >= new Date(latest.created_at).getTime()
        ? current
        : latest,
    );
  }

  function normalizeColorHex(value: string | null | undefined) {
    if (!value) return "#cccccc";
    const normalized = value.startsWith("#") ? value : `#${value}`;
    return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized.toLowerCase() : "#cccccc";
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
    setError(null);
    setKitStatusMessage(null);

    const normalizedColor = normalizeColorHex(colorHex);

    try {
      const res = await fetch("/api/team/kits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          teamId,
          kitNumber: kitNum,
          playerType,
          pieceType,
          colorHex: normalizedColor,
        }),
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok || !payload?.piece?.id) {
        setError(payload?.error || "Erro ao guardar a cor do kit.");
        return;
      }

      const savedPiece = payload.piece as KitPiece;
      setKitPieces((prev) => {
        const filtered = prev.filter(
          (piece) =>
            !(
              piece.team_id === savedPiece.team_id &&
              piece.kit_number === savedPiece.kit_number &&
              normalizePlayerTypeForComparison(piece.player_type) ===
                normalizePlayerTypeForComparison(savedPiece.player_type) &&
              samePieceType(piece.piece_type, savedPiece.piece_type)
            ),
        );
        return [...filtered, savedPiece];
      });
      setKitStatusMessage("Cores dos kits guardadas.");
      setTimeout(() => setKitStatusMessage(null), 2000);
    } catch {
      setError("Erro ao guardar a cor do kit.");
    } finally {
      setSavingKit(null);
    }
  }

  async function handleSendStaffInvite(e: { preventDefault(): void }) {
    e.preventDefault();
    if (accountRole !== "coordinator") {
      setError("Apenas o coordenador pode convidar treinadores.");
      return;
    }

    setSendingInvite(true);
    setInviteResult(null);
    setError(null);

    const res = await fetch("/api/invite/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: staffForm.firstName,
        lastName: staffForm.lastName,
        email: staffForm.email,
        phone: staffForm.phone,
        role: staffForm.role,
      }),
    });

    const data = await res.json();

    if (data.success) {
      setInviteResult({
        code: data.inviteCode,
        emailSent: data.emailSent,
        name: staffForm.firstName,
      });
      setStaffInvitesExpanded(true);
      setStaffForm(EMPTY_STAFF_FORM);
      loadData();
    } else {
      setError(data.error || "Erro ao enviar convite");
    }

    setSendingInvite(false);
  }

  async function handleDeleteInvite(invite: StaffInvite) {
    if (accountRole !== "coordinator") {
      setError("Apenas o coordenador pode remover membros da equipa técnica.");
      return;
    }

    setDeletingId(invite.id);
    setConfirmDeleteId(null);
    setError(null);

    try {
      const res = await fetch(`/api/invite/staff/${invite.id}`, {
        method: "DELETE",
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(payload?.error || "Erro ao cancelar convite.");
        return;
      }

      setStaffInvites((prev) => prev.filter((item) => item.id !== invite.id));
    } catch {
      setError("Erro ao cancelar convite.");
    } finally {
      setDeletingId(null);
    }
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  }

  async function handleGeneratePublicShare() {
    if (!existingAgeGroup || accountRole !== "coordinator") {
      setError("Apenas o coordenador pode gerar o link público.");
      return;
    }

    setManagingPublicShare(true);
    setError(null);
    setPublicShareUrl(null);

    try {
      const res = await fetch("/api/public-share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ageGroupId: existingAgeGroup.id }),
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok || payload?.success !== true) {
        setError(payload?.error || "Erro ao gerar link público.");
        return;
      }

      setPublicShare(
        payload?.share ? (payload.share as PublicShareTokenSummary) : null,
      );
      setPublicShareUrl(typeof payload?.url === "string" ? payload.url : null);
    } catch {
      setError("Erro de ligação ao gerar link público.");
    } finally {
      setManagingPublicShare(false);
    }
  }

  async function handleRevokePublicShare() {
    if (!existingAgeGroup || accountRole !== "coordinator") {
      setError("Apenas o coordenador pode revogar o link público.");
      return;
    }

    setManagingPublicShare(true);
    setError(null);

    try {
      const res = await fetch("/api/public-share", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ageGroupId: existingAgeGroup.id }),
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok || payload?.success !== true) {
        setError(payload?.error || "Erro ao revogar link público.");
        return;
      }

      setPublicShare(null);
      setPublicShareUrl(null);
    } catch {
      setError("Erro de ligação ao revogar link público.");
    } finally {
      setManagingPublicShare(false);
    }
  }

  if (loading)
    return (
      <div className="p-4 md:p-8">
        <p className="text-slate-500">A carregar...</p>
      </div>
    );

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Configurações</h1>
      {error && (
        <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg border border-red-200">
          {error}
        </div>
      )}

      {/* ── SECÇÃO 1: ESCALÃO ── */}
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

      {/* ── SECÇÃO 2: LOGOTIPO DO CLUBE ── */}
      {existingAgeGroup && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ImageIcon size={16} /> Logotipo do Clube
            </CardTitle>
            <CardDescription>
              Imagem em PNG ou SVG, fundo transparente recomendado
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="Logo do clube"
                  className="w-20 h-20 object-contain rounded-xl border border-slate-200 bg-white p-1"
                />
              ) : (
                <div className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center bg-slate-50">
                  <ImageIcon size={24} className="text-slate-300" />
                </div>
              )}
              <div className="flex-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => logoRef.current?.click()}
                  disabled={uploadingLogo}
                >
                  {uploadingLogo ? (
                    <>
                      <Loader2 size={14} className="mr-2 animate-spin" />
                      A carregar...
                    </>
                  ) : (
                    <>
                      <ImageIcon size={14} className="mr-2" />
                      {logoUrl ? "Substituir logotipo" : "Carregar logotipo"}
                    </>
                  )}
                </Button>
                <p className="text-xs text-slate-400 mt-1.5">
                  PNG, JPG, WEBP ou SVG · Máx. 5MB
                </p>
              </div>
            </div>
            <input
              ref={logoRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleLogoUpload}
            />
          </CardContent>
        </Card>
      )}

      {/* ── SECÇÃO 3: KITS DA EQUIPA ── */}
      {existingAgeGroup && teamId && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Palette size={16} /> Kits da Equipa
                </CardTitle>
                <CardDescription>
                  Define as cores de cada kit (campo e guarda-redes)
                </CardDescription>
                {kitStatusMessage && (
                  <p className="text-xs text-emerald-600 mt-1">{kitStatusMessage}</p>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setKitsExpanded((v) => !v)}
              >
                {kitsExpanded ? (
                  <>
                    <ChevronUp size={14} className="mr-1" /> Recolher
                  </>
                ) : (
                  <>
                    <ChevronDown size={14} className="mr-1" /> Expandir
                  </>
                )}
              </Button>
            </div>
          </CardHeader>
          {kitsExpanded && (
            <CardContent className="space-y-6">
              {KIT_NUMBERS.map((kitNum) => (
                <div key={kitNum}>
                  <h4 className="text-sm font-semibold text-slate-700 mb-3">
                    {KIT_LABELS[kitNum]}
                  </h4>
                  <div className="space-y-4">
                    {PLAYER_TYPES.map((playerType) => (
                      <div key={playerType}>
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                          {PLAYER_TYPE_LABELS[playerType]}
                        </p>
                        <div className="grid grid-cols-3 gap-3">
                          {PIECE_TYPES.map((pieceType) => {
                            const piece = getKitPiece(kitNum, playerType, pieceType);
                            const key = `${kitNum}-${playerType}-${pieceType}`;
                            const displayColor = kitColors[key] ?? normalizeColorHex(piece?.color_hex);
                            return (
                              <div key={pieceType} className="space-y-1">
                                <Label className="text-xs text-slate-500">
                                  {PIECE_LABELS[pieceType]}
                                </Label>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="color"
                                    value={displayColor}
                                    onChange={(e) => {
                                      const newColor = e.target.value;
                                      setKitColors((prev) => ({ ...prev, [key]: newColor }));
                                      // Debounce: cancel any pending save and schedule a new one
                                      const existing = kitSaveTimers.current.get(key);
                                      if (existing) clearTimeout(existing);
                                      const timer = setTimeout(() => {
                                        void handleKitColorChange(kitNum, playerType, pieceType, newColor);
                                        kitSaveTimers.current.delete(key);
                                      }, 600);
                                      kitSaveTimers.current.set(key, timer);
                                    }}
                                    onBlur={(e) => {
                                      // Cancel debounce and save immediately on blur
                                      const existing = kitSaveTimers.current.get(key);
                                      if (existing) {
                                        clearTimeout(existing);
                                        kitSaveTimers.current.delete(key);
                                      }
                                      void handleKitColorChange(kitNum, playerType, pieceType, e.target.value);
                                    }}
                                    className="w-9 h-9 rounded-lg border border-slate-200 cursor-pointer p-0.5 bg-white"
                                    title={`${KIT_LABELS[kitNum]} · ${PLAYER_TYPE_LABELS[playerType]} · ${PIECE_LABELS[pieceType]}`}
                                  />
                                  <span className="text-xs text-slate-400 font-mono">
                                    {savingKit === key ? (
                                      <Loader2 size={12} className="animate-spin" />
                                    ) : (
                                      displayColor.toUpperCase()
                                    )}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                  {kitNum < 3 && <hr className="mt-4 border-slate-100" />}
                </div>
              ))}
            </CardContent>
          )}
        </Card>
      )}

      {/* ── SECÇÃO 4: LINK PÚBLICO ── */}
      {existingAgeGroup && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">Link Público</CardTitle>
                <CardDescription className="mt-1">
                  Partilha calendario e jogos em modo so leitura com pais e fas.
                </CardDescription>
              </div>
              {accountRole === "coordinator" && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void handleGeneratePublicShare()}
                  disabled={managingPublicShare}
                >
                  {managingPublicShare ? (
                    <Loader2 size={14} className="mr-2 animate-spin" />
                  ) : (
                    <Mail size={14} className="mr-2" />
                  )}
                  {publicShare ? "Gerar novo link" : "Gerar link publico"}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingPublicShare ? (
              <p className="text-sm text-slate-400">A carregar link publico...</p>
            ) : publicShare ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    Activo
                  </span>
                  <span className="text-xs text-slate-500">
                    {publicShare.access_count} acesso{publicShare.access_count !== 1 ? "s" : ""}
                  </span>
                  {publicShare.last_accessed_at && (
                    <span className="text-xs text-slate-500">
                      Ultimo acesso:{" "}
                      {new Date(publicShare.last_accessed_at).toLocaleString("pt-PT")}
                    </span>
                  )}
                </div>
                {publicShareUrl ? (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-500">
                      Copia este URL agora. Por seguranca, ele so volta a aparecer no momento da geracao.
                    </p>
                    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2">
                      <code className="flex-1 truncate text-xs text-slate-700">
                        {publicShareUrl}
                      </code>
                      <button
                        type="button"
                        onClick={() => copyCode(publicShareUrl)}
                        className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100"
                        title="Copiar URL"
                      >
                        {copiedCode === publicShareUrl ? (
                          <Check size={14} className="text-emerald-600" />
                        ) : (
                          <Copy size={14} />
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    Existe um link activo. Se precisares do URL outra vez, gera um novo.
                  </p>
                )}
                {accountRole === "coordinator" && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full border-red-200 text-red-600 hover:bg-red-50"
                    onClick={() => void handleRevokePublicShare()}
                    disabled={managingPublicShare}
                  >
                    Revogar link publico
                  </Button>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4">
                <p className="text-sm text-slate-600">
                  Ainda nao existe link publico para este escalao.
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  O link mostra apenas jogos, calendario e convocatoria sanitizada, sempre em modo so leitura.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── SECÇÃO 5: EQUIPA TÉCNICA ── */}
      {existingAgeGroup && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users size={16} /> Equipa Técnica
                </CardTitle>
                <CardDescription className="mt-1">
                  {accountRole === "coordinator"
                    ? "Convida treinadores para acederem à plataforma"
                    : "Apenas o coordenador pode gerir convites e membros da equipa técnica"}
                </CardDescription>
              </div>
              {accountRole === "coordinator" && !showStaffForm && (
                <Button
                  size="sm"
                  onClick={() => {
                    setShowStaffForm(true);
                    setInviteResult(null);
                    setError(null);
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  <Plus size={14} className="mr-1" /> Convidar
                </Button>
              )}
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {showStaffForm && accountRole === "coordinator" && (
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="font-semibold text-slate-800 text-sm">
                    Novo convite
                  </h4>
                  <button
                    onClick={() => {
                      setShowStaffForm(false);
                      setInviteResult(null);
                    }}
                  >
                    <X size={16} className="text-slate-400" />
                  </button>
                </div>

                {inviteResult && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4">
                    <p className="text-emerald-800 font-semibold text-sm mb-1">
                      {inviteResult.emailSent
                        ? `✓ Email enviado para ${inviteResult.name}!`
                        : `✓ Código gerado para ${inviteResult.name}`}
                    </p>
                    {!inviteResult.emailSent && (
                      <p className="text-emerald-700 text-xs mb-3">
                        O email não foi enviado. Partilha o código manualmente:
                      </p>
                    )}
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-white border border-emerald-200 rounded-lg px-3 py-2 font-mono text-lg font-bold text-slate-800 text-center tracking-widest">
                        {inviteResult.code}
                      </code>
                      <button
                        onClick={() => copyCode(inviteResult.code)}
                        className="p-2 bg-emerald-100 hover:bg-emerald-200 rounded-lg transition-colors"
                      >
                        {copiedCode === inviteResult.code ? (
                          <Check size={16} className="text-emerald-600" />
                        ) : (
                          <Copy size={16} className="text-emerald-600" />
                        )}
                      </button>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setInviteResult(null);
                        setShowStaffForm(true);
                      }}
                      className="mt-3 w-full"
                    >
                      Convidar outro treinador
                    </Button>
                  </div>
                )}

                {!inviteResult && (
                  <form onSubmit={handleSendStaffInvite} className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Primeiro nome *</Label>
                        <Input
                          value={staffForm.firstName}
                          required
                          placeholder="João"
                          onChange={(e) =>
                            setStaffForm((f) => ({
                              ...f,
                              firstName: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Apelido *</Label>
                        <Input
                          value={staffForm.lastName}
                          required
                          placeholder="Silva"
                          onChange={(e) =>
                            setStaffForm((f) => ({
                              ...f,
                              lastName: e.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Email *</Label>
                      <Input
                        type="email"
                        value={staffForm.email}
                        required
                        placeholder="treinador@email.com"
                        onChange={(e) =>
                          setStaffForm((f) => ({ ...f, email: e.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Telemóvel</Label>
                      <Input
                        type="tel"
                        value={staffForm.phone}
                        placeholder="9XX XXX XXX"
                        onChange={(e) =>
                          setStaffForm((f) => ({ ...f, phone: e.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Função *</Label>
                      <Select
                        value={staffForm.role}
                        onValueChange={(v) =>
                          setStaffForm((f) => ({ ...f, role: v }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLE_OPTIONS.map((r) => (
                            <SelectItem key={r.value} value={r.value}>
                              {r.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      type="submit"
                      disabled={sendingInvite}
                      className="w-full bg-emerald-600 hover:bg-emerald-700"
                    >
                      <Mail size={14} className="mr-2" />
                      {sendingInvite
                        ? "A enviar..."
                        : "Enviar convite por email"}
                    </Button>
                  </form>
                )}
              </div>
            )}

            {staffInvites.length > 0 ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setStaffInvitesExpanded((prev) => !prev)}
                  className="w-full flex items-center justify-between gap-3 p-3 text-left hover:bg-slate-100 transition-colors"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      Convites enviados
                    </p>
                    <p className="text-xs text-slate-400">
                      {staffInvites.length} convite{staffInvites.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  {staffInvitesExpanded ? (
                    <ChevronUp size={16} className="text-slate-400" />
                  ) : (
                    <ChevronDown size={16} className="text-slate-400" />
                  )}
                </button>

                {staffInvitesExpanded && (
                  <div className="space-y-2 border-t border-slate-200 p-3">
                    {staffInvites.map((invite) => {
                      const isActiveMember =
                        !!invite.accepted_at &&
                        !!invite.accepted_by &&
                        activeStaffProfileIds.includes(invite.accepted_by);

                      return (
                        <div
                          key={invite.id}
                          className="rounded-xl border border-slate-100 bg-white"
                        >
                          <div className="flex items-center gap-3 p-3">
                            <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                              <span className="text-xs font-bold text-slate-500">
                                {invite.first_name?.[0]}
                                {invite.last_name?.[0]}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-slate-800 text-sm truncate">
                                {invite.first_name} {invite.last_name}
                              </p>
                              <p className="text-xs text-slate-400 truncate">
                                {ROLE_LABELS[invite.role] || invite.role} ·{" "}
                                {invite.email}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              {isActiveMember ? (
                                <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                                  Activo
                                </span>
                              ) : invite.accepted_at ? (
                                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                                  Aceite (pendente)
                                </span>
                              ) : (
                                <>
                                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                                    Pendente
                                  </span>
                                  {accountRole === "coordinator" && (
                                    <button
                                      onClick={() => copyCode(invite.invite_code)}
                                      title="Copiar código"
                                      className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors"
                                    >
                                      {copiedCode === invite.invite_code ? (
                                        <Check size={14} className="text-emerald-500" />
                                      ) : (
                                        <Copy size={14} className="text-slate-400" />
                                      )}
                                    </button>
                                  )}
                                </>
                              )}
                              {accountRole === "coordinator" && (
                                <button
                                  onClick={() =>
                                    setConfirmDeleteId(
                                      confirmDeleteId === invite.id ? null : invite.id,
                                    )
                                  }
                                  disabled={deletingId === invite.id}
                                  title={
                                    invite.accepted_at
                                      ? "Remover membro"
                                      : "Cancelar convite"
                                  }
                                  className="p-1.5 hover:bg-red-50 rounded-lg transition-colors group"
                                >
                                  {deletingId === invite.id ? (
                                    <Loader2
                                      size={14}
                                      className="text-slate-300 animate-spin"
                                    />
                                  ) : (
                                    <Trash2
                                      size={14}
                                      className="text-slate-300 group-hover:text-red-500 transition-colors"
                                    />
                                  )}
                                </button>
                              )}
                            </div>
                          </div>

                          {accountRole === "coordinator" && confirmDeleteId === invite.id && (
                            <div className="px-3 pb-3 flex items-center gap-2">
                              <p className="text-xs text-red-600 flex-1">
                                {invite.accepted_at
                                  ? "Remover este membro da equipa técnica?"
                                  : "Cancelar este convite?"}
                              </p>
                              <button
                                onClick={() => handleDeleteInvite(invite)}
                                className="text-xs font-semibold text-white bg-red-500 hover:bg-red-600 px-3 py-1 rounded-lg transition-colors"
                              >
                                Confirmar
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(null)}
                                className="text-xs font-semibold text-slate-500 hover:text-slate-700 px-2 py-1 rounded-lg transition-colors"
                              >
                                Cancelar
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              !showStaffForm && (
                <p className="text-sm text-slate-400 text-center py-4">
                  {accountRole === "coordinator"
                    ? "Ainda não convidaste nenhum treinador."
                    : "Sem treinadores associados a este escalão."}
                </p>
              )
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
