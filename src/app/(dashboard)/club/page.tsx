"use client";

import Image from "next/image";
import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
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
import { Loader2, ImageIcon, ChevronDown, ChevronUp, Plus, Copy, Check, X, Mail, Trash2, Pencil, Send, AlertCircle } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
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
import { ALL_PERMISSION_AREAS } from "@/lib/auth/permissions-shared";
import { PermissionsGrid, type PermissionsMap, templateToPermissions } from "@/components/staff/PermissionsGrid";
import { CoordinatorInvoicesTab } from "@/components/billing/CoordinatorInvoicesTab";

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

const ROLE_TO_TEMPLATE: Record<string, "principal" | "adjunto" | "estagiario"> = {
  head_coach: "principal",
  assistant_coach: "adjunto",
  intern_coach: "estagiario",
  goalkeeper_coach: "adjunto",
  fitness_coach: "adjunto",
  physiotherapist: "estagiario",
  doctor: "estagiario",
  analyst: "estagiario",
  team_manager: "estagiario",
};

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
  age_group_name?: string | null;
};

type StaffInviteStatus = "pending" | "accepted" | "orphan";

type StaffInvite = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  invite_code: string;
  accepted_at?: string | null;
  invite_sent_at: string;
  status: StaffInviteStatus;
  has_live_user: boolean;
  age_group_name?: string | null;
};

type ClubTab = "info" | "members" | "facturacao" | "settings";

export default function ClubPage() {
  const supabase = useMemo(() => createClient(), []);
  const logoRef = useRef<HTMLInputElement>(null);
  const kitSaveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ageGroup, setAgeGroup] = useState<AgeGroup | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [isClubCoordinator, setIsClubCoordinator] = useState(false);
  const [isSuperCoordinator, setIsSuperCoordinator] = useState(false);
  // Treinador individual: a pagina /club apresenta-se como "Equipa" e mostra
  // so a tab Detalhes (nome/sigla/logo/kits). As tabs de clube (equipa tecnica,
  // facturacao, danger zone) nao se aplicam.
  const [isIndividual, setIsIndividual] = useState(false);

  // Tab — inicializar a partir de ?tab= na URL (ex: /club?tab=members)
  const [activeTab, setActiveTab] = useState<ClubTab>(() => {
    const t = searchParams.get("tab");
    if (t === "members" || t === "membros") return "members";
    if (t === "facturacao" || t === "faturacao") return "facturacao";
    if (t === "settings") return "settings";
    return "info";
  });

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
  const [invitesExpanded, setInvitesExpanded] = useState(false);

  // Members tab
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [staffInvites, setStaffInvites] = useState<StaffInvite[]>([]);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteForm, setInviteForm] = useState(EMPTY_INVITE_FORM);
  const [invitePermissions, setInvitePermissions] = useState<PermissionsMap>(() =>
    templateToPermissions(ROLE_TO_TEMPLATE["assistant_coach"]),
  );
  const [clubAgeGroupsForInvite, setClubAgeGroupsForInvite] = useState<{ id: string; name: string }[]>([]);
  const [inviteSelectedAgeGroupIds, setInviteSelectedAgeGroupIds] = useState<Set<string>>(new Set());
  const [sendingInvite, setSendingInvite] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [confirmRemoveMemberId, setConfirmRemoveMemberId] = useState<string | null>(null);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [cancelingInviteId, setCancelingInviteId] = useState<string | null>(null);
  const [resendingInviteId, setResendingInviteId] = useState<string | null>(null);
  const [confirmInviteAction, setConfirmInviteAction] = useState<
    { id: string; action: "revoke" | "clear" } | null
  >(null);

  // Edit member dialog
  const [editingMember, setEditingMember] = useState<StaffMember | null>(null);
  const [editForm, setEditForm] = useState({ fullName: "", phone: "", role: "assistant_coach" });
  const [editPermissions, setEditPermissions] = useState<PermissionsMap>(() =>
    templateToPermissions(ROLE_TO_TEMPLATE["assistant_coach"]),
  );
  const [editAgeGroupIds, setEditAgeGroupIds] = useState<Set<string>>(new Set());
  const [savingEdit, setSavingEdit] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [confirmRemoveInEdit, setConfirmRemoveInEdit] = useState(false);

  // Settings tab — Danger zone
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingClub, setDeletingClub] = useState(false);

  // Dados adicionais do clube (clubs table)
  const [clubMorada, setClubMorada] = useState("");
  const [clubTelefone, setClubTelefone] = useState("");
  const [clubEmailContacto, setClubEmailContacto] = useState("");
  const [clubWebsite, setClubWebsite] = useState("");
  const [clubCorPrimaria, setClubCorPrimaria] = useState("#000000");
  const [clubCorSecundaria, setClubCorSecundaria] = useState("#FFFFFF");
  const [clubDistrito, setClubDistrito] = useState("");
  const [clubAssociacao, setClubAssociacao] = useState("");
  const [isEditingClubDetails, setIsEditingClubDetails] = useState(false);
  const [savingClubDetails, setSavingClubDetails] = useState(false);

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

    // Buscar membros e info do clube em paralelo.
    // Todos os membros do clube (qualquer role) podem ver a lista via /api/club/members.
    // Info do clube (/api/club) e convites pendentes apenas para coordenadores.
    let resolvedLogoFromClub = "";
    const [membersRes, clubInfoRes] = await Promise.all([
      fetch("/api/club/members", { signal }).catch(() => null),
      (isClubCoord || isSuper) ? fetch("/api/club", { signal }).catch(() => null) : Promise.resolve(null),
    ]);

    if (membersRes?.ok) {
      const mp = await membersRes.json().catch(() => ({}));
      const clubMembers = ((mp?.members as StaffMember[]) || []).map((m) => ({
        ...m,
        full_name: m.full_name || "Sem nome",
      }));
      setStaffMembers(
        clubMembers.sort((a, b) => {
          const ap = a.is_coordinator ? 0 : 1;
          const bp = b.is_coordinator ? 0 : 1;
          if (ap !== bp) return ap - bp;
          return (a.full_name || "").localeCompare(b.full_name || "", "pt");
        }),
      );

      // Convites (pendentes, aceites e orfaos) — apenas visiveis para club_coordinator
      if (isClubCoord || isSuper) {
        const rawInvites = (mp?.invites as Array<Record<string, unknown>>) || [];
        setStaffInvites(
          rawInvites.map((inv) => {
            const status =
              inv.status === "accepted" || inv.status === "orphan" ? inv.status : "pending";
            return {
              id: String(inv.id ?? ""),
              first_name: String(inv.first_name ?? ""),
              last_name: String(inv.last_name ?? ""),
              email: String(inv.email ?? ""),
              role: String(inv.role ?? ""),
              invite_code: String(inv.invite_code ?? ""),
              invite_sent_at: String(inv.invite_sent_at ?? inv.created_at ?? ""),
              accepted_at: typeof inv.accepted_at === "string" ? inv.accepted_at : null,
              status: status as StaffInviteStatus,
              has_live_user: inv.has_live_user === true,
              age_group_name: typeof inv.age_group_name === "string" ? inv.age_group_name : null,
            };
          }),
        );
      }
    } else {
      // Fallback: usar staffMembers do contexto se /api/club/members falhar
      const rawMembers = (payload?.staffMembers as StaffMember[]) || [];
      setStaffMembers(
        rawMembers
          .map((m) => ({ ...m, full_name: m.full_name || "Sem nome" }))
          .sort((a, b) => {
            const aPriority = a.is_coordinator ? 0 : 1;
            const bPriority = b.is_coordinator ? 0 : 1;
            if (aPriority !== bPriority) return aPriority - bPriority;
            return (a.full_name || "").localeCompare(b.full_name || "", "pt");
          }),
      );
    }

    if (clubInfoRes?.ok) {
      const cp = await clubInfoRes.json().catch(() => ({}));
      const c = cp?.club;
      if (c) {
        resolvedLogoFromClub = c.logo_url || "";
        setIsIndividual(c.plan_type === "individual");
        if (c.name && !ag) setClubName(c.name);
        if (!ag && c.slug) setClubShortName(c.slug);
        setClubMorada(c.morada || "");
        setClubTelefone(c.telefone || "");
        setClubEmailContacto(c.email_contacto || "");
        setClubWebsite(c.website || "");
        setClubCorPrimaria(c.cor_primaria || "#000000");
        setClubCorSecundaria(c.cor_secundaria || "#FFFFFF");
        setClubDistrito(c.distrito || "");
        setClubAssociacao(c.associacao || "");
      }
    }

    if (!ag) {
      if (resolvedLogoFromClub) setLogoUrl(resolvedLogoFromClub);
      setLoading(false);
      return;
    }

    setAgeGroup(ag);
    setClubName(ag.club_name);
    setClubShortName(normalizeManualShortName(ag.club_short_name, 5) || "");
    setLogoUrl(resolvedLogoFromClub || ag.club_logo_url || "");
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

    // BUG-3: club_coordinator sem escalão guarda directamente em clubs via PATCH
    if (!ageGroup) {
      if (!isClubCoordinator && !isSuperCoordinator) return;
      if (clubShortName && !isValidManualShortName(clubShortName, 2, 5)) {
        toast.error("A sigla deve ter entre 2 e 5 caracteres.");
        return;
      }
      setSaving(true);
      const normalizedShort = normalizeManualShortName(clubShortName, 5);
      const res = await fetch("/api/club", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: clubName || null,
          slug: normalizedShort || null,
        }),
      });
      const patchPayload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(patchPayload?.error || "Erro ao guardar.");
      } else {
        if (normalizedShort) setClubShortName(normalizedShort);
        setIsEditing(false);
        toast.success("Clube atualizado");
      }
      setSaving(false);
      return;
    }

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

  async function handleSaveClubDetails(e: { preventDefault(): void }) {
    e.preventDefault();
    setSavingClubDetails(true);
    const res = await fetch("/api/club", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        morada: clubMorada || null,
        telefone: clubTelefone || null,
        email_contacto: clubEmailContacto || null,
        website: clubWebsite || null,
        cor_primaria: clubCorPrimaria || null,
        cor_secundaria: clubCorSecundaria || null,
        distrito: clubDistrito || null,
        associacao: clubAssociacao || null,
      }),
    });
    const resPayload = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(resPayload?.error || "Erro ao guardar dados do clube.");
    } else {
      setIsEditingClubDetails(false);
      toast.success("Dados do clube actualizados");
    }
    setSavingClubDetails(false);
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isClubCoordinator && !isSuperCoordinator) return;
    setUploadingLogo(true);

    const formData = new FormData();
    formData.set("file", file);

    const res = await fetch("/api/club/logo", {
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

  async function openInviteForm() {
    setShowInviteForm(true);
    if (isClubCoordinator && clubAgeGroupsForInvite.length === 0) {
      const res = await fetch("/api/club/age-groups");
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data.ageGroups)) {
        setClubAgeGroupsForInvite(data.ageGroups as { id: string; name: string }[]);
      }
    }
  }

  async function handleSendInvite(e: { preventDefault(): void }) {
    e.preventDefault();
    setSendingInvite(true);

    const permissionsArray = ALL_PERMISSION_AREAS.map((area) => ({
      area,
      ...invitePermissions[area],
    }));

    const ageGroupIds =
      isClubCoordinator &&
      inviteForm.role !== "club_coordinator" &&
      inviteSelectedAgeGroupIds.size > 0
        ? Array.from(inviteSelectedAgeGroupIds)
        : undefined;

    const res = await fetch("/api/invite/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: inviteForm.firstName,
        lastName: inviteForm.lastName,
        email: inviteForm.email,
        role: inviteForm.role,
        permissions: permissionsArray,
        ...(ageGroupIds ? { ageGroupIds } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.success) {
      setShowInviteForm(false);
      setInviteForm(EMPTY_INVITE_FORM);
      setInviteSelectedAgeGroupIds(new Set());
      setInvitePermissions(templateToPermissions(ROLE_TO_TEMPLATE["assistant_coach"]));
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

  async function handleRemoveMember(memberId: string, profileId: string, onSuccess?: () => void) {
    setRemovingMemberId(memberId);
    setConfirmRemoveMemberId(null);
    const res = await fetch(`/api/club/members/${profileId}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data?.error || "Erro ao remover membro.");
    } else {
      setStaffMembers((prev) => prev.filter((m) => m.id !== memberId));
      toast.success("Membro removido.");
      onSuccess?.();
    }
    setRemovingMemberId(null);
  }

  async function handleDeleteInvite(inviteId: string, action: "revoke" | "clear") {
    setCancelingInviteId(inviteId);
    const res = await fetch(`/api/invite/staff/${inviteId}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data?.error || "Erro ao remover convite.");
    } else {
      setStaffInvites((prev) => prev.filter((inv) => inv.id !== inviteId));
      toast.success(action === "clear" ? "Registo limpo." : "Convite revogado.");
    }
    setCancelingInviteId(null);
    setConfirmInviteAction(null);
  }

  async function handleResendInvite(inviteId: string) {
    setResendingInviteId(inviteId);
    const res = await fetch(`/api/invite/staff/${inviteId}/resend`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data?.error || "Erro ao reenviar convite.");
    } else {
      const nowIso = new Date().toISOString();
      setStaffInvites((prev) =>
        prev.map((inv) => (inv.id === inviteId ? { ...inv, invite_sent_at: nowIso } : inv)),
      );
      toast.success("Email reenviado.");
    }
    setResendingInviteId(null);
  }

  async function handleOpenEdit(member: StaffMember) {
    setEditingMember(member);
    setConfirmRemoveInEdit(false);
    setLoadingEdit(true);
    if (isClubCoordinator && clubAgeGroupsForInvite.length === 0) {
      const agRes = await fetch("/api/club/age-groups");
      const agData = await agRes.json().catch(() => ({}));
      if (agRes.ok && Array.isArray(agData.ageGroups)) {
        setClubAgeGroupsForInvite(agData.ageGroups as { id: string; name: string }[]);
      }
    }
    const res = await fetch(`/api/club/members/${member.profile_id}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setEditForm({
        fullName: data.full_name || "",
        phone: data.phone || "",
        role: data.role || member.role || "assistant_coach",
      });
      setEditAgeGroupIds(new Set<string>(Array.isArray(data.ageGroupIds) ? (data.ageGroupIds as string[]) : []));
      const permsArray = Array.isArray(data.permissions) ? (data.permissions as Array<{ area: string; can_read: boolean; can_write: boolean; can_edit: boolean; can_delete: boolean }>) : [];
      const permsMap = {} as PermissionsMap;
      for (const area of ALL_PERMISSION_AREAS) {
        const p = permsArray.find((x) => x.area === area);
        permsMap[area] = {
          can_read: p?.can_read ?? true,
          can_write: p?.can_write ?? false,
          can_edit: p?.can_edit ?? false,
          can_delete: p?.can_delete ?? false,
        };
      }
      setEditPermissions(permsMap);
    } else {
      toast.error(data?.error || "Erro ao carregar dados do membro.");
      setEditingMember(null);
    }
    setLoadingEdit(false);
  }

  async function handleSaveEdit(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!editingMember) return;
    setSavingEdit(true);
    const permissionsArray = ALL_PERMISSION_AREAS.map((area) => ({
      area,
      ...editPermissions[area],
    }));
    const res = await fetch(`/api/club/members/${editingMember.profile_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: editForm.fullName || undefined,
        phone: editForm.phone || null,
        role: editForm.role,
        ageGroupIds: editAgeGroupIds.size > 0 ? Array.from(editAgeGroupIds) : undefined,
        permissions: permissionsArray,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      toast.success("Membro actualizado.");
      setEditingMember(null);
      void loadData();
    } else {
      toast.error(data?.error || "Erro ao actualizar membro.");
    }
    setSavingEdit(false);
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

  const hasClubAccess = isClubCoordinator || isSuperCoordinator || ageGroup != null;

  if (!hasClubAccess) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto">
        <div className="bg-amber-50 text-amber-800 text-sm p-4 rounded-xl border border-amber-200">
          Sem acesso ao clube. Completa o onboarding primeiro.
        </div>
      </div>
    );
  }

  const canDangerZone = isClubCoordinator || isSuperCoordinator;
  // Individual só vê "Detalhes" (info); as outras tabs nao se aplicam.
  const effectiveTab: ClubTab = isIndividual ? "info" : activeTab;

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">
        {isIndividual ? "Equipa" : "Clube"}
      </h1>

      {/* Tab navigation — escondida para individual (só tem "Detalhes") */}
      {!isIndividual && (
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          {(
            (isClubCoordinator || isSuperCoordinator
              ? ["info", "members", "facturacao", "settings"]
              : ["info", "members", "settings"]) as ClubTab[]
          ).map((tab) => {
            const labels: Record<ClubTab, string> = {
              info: "Informações",
              members: "Membros",
              facturacao: "Facturação",
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
      )}

      {/* ─── Informações tab ─── */}
      {effectiveTab === "info" && (
        <>
          {/* Informações do Clube */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Informações do Clube</CardTitle>
                  {!isEditing && (ageGroup?.club_name || clubName) && (
                    <p className="text-sm text-slate-500 mt-1">
                      {ageGroup?.club_name ?? clubName}
                      {ageGroup?.club_short_name ? ` (${ageGroup.club_short_name})` : ""}
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
                  {(isClubCoordinator || isSuperCoordinator) ? (
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
                    {(isClubCoordinator || isSuperCoordinator)
                      ? "PNG, JPG, WEBP"
                      : "Só o coordenador do clube pode alterar o logótipo."}
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

          {/* Dados adicionais do clube — apenas para club_coordinator e super */}
          {canDangerZone && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Dados de Contacto</CardTitle>
                  {!isEditingClubDetails && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsEditingClubDetails(true)}
                    >
                      Editar
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {isEditingClubDetails ? (
                  <form onSubmit={handleSaveClubDetails} className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Morada</Label>
                        <Input
                          value={clubMorada}
                          onChange={(e) => setClubMorada(e.target.value)}
                          placeholder="Rua, número, código postal"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Distrito</Label>
                        <Input
                          value={clubDistrito}
                          onChange={(e) => setClubDistrito(e.target.value)}
                          placeholder="ex: Lisboa"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Telefone</Label>
                        <Input
                          value={clubTelefone}
                          onChange={(e) => setClubTelefone(e.target.value)}
                          placeholder="+351 21 000 0000"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Email de Contacto</Label>
                        <Input
                          type="email"
                          value={clubEmailContacto}
                          onChange={(e) => setClubEmailContacto(e.target.value)}
                          placeholder="secretaria@clube.pt"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Website</Label>
                        <Input
                          value={clubWebsite}
                          onChange={(e) => setClubWebsite(e.target.value)}
                          placeholder="https://www.clube.pt"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Associação</Label>
                        <Input
                          value={clubAssociacao}
                          onChange={(e) => setClubAssociacao(e.target.value)}
                          placeholder="ex: AF Lisboa"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Cor Primária</Label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={clubCorPrimaria || "#000000"}
                            onChange={(e) => setClubCorPrimaria(e.target.value)}
                            className="w-10 h-10 rounded-lg cursor-pointer border border-slate-200 p-0.5"
                          />
                          <Input
                            value={clubCorPrimaria}
                            onChange={(e) => setClubCorPrimaria(e.target.value)}
                            placeholder="#000000"
                            maxLength={7}
                            className="font-mono"
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Cor Secundária</Label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={clubCorSecundaria || "#FFFFFF"}
                            onChange={(e) => setClubCorSecundaria(e.target.value)}
                            className="w-10 h-10 rounded-lg cursor-pointer border border-slate-200 p-0.5"
                          />
                          <Input
                            value={clubCorSecundaria}
                            onChange={(e) => setClubCorSecundaria(e.target.value)}
                            placeholder="#FFFFFF"
                            maxLength={7}
                            className="font-mono"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button
                        type="submit"
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                        disabled={savingClubDetails}
                      >
                        {savingClubDetails ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          "Guardar"
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsEditingClubDetails(false)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-2 text-sm text-slate-600">
                    {clubMorada && <p><span className="font-medium">Morada:</span> {clubMorada}{clubDistrito ? `, ${clubDistrito}` : ""}</p>}
                    {clubTelefone && <p><span className="font-medium">Telefone:</span> {clubTelefone}</p>}
                    {clubEmailContacto && <p><span className="font-medium">Email:</span> {clubEmailContacto}</p>}
                    {clubWebsite && <p><span className="font-medium">Website:</span> {clubWebsite}</p>}
                    {clubAssociacao && <p><span className="font-medium">Associação:</span> {clubAssociacao}</p>}
                    {(clubCorPrimaria || clubCorSecundaria) && (
                      <div className="flex items-center gap-3 mt-1">
                        <span className="font-medium">Cores:</span>
                        {clubCorPrimaria && (
                          <span
                            className="w-5 h-5 rounded-full border border-slate-200 inline-block"
                            style={{ background: clubCorPrimaria }}
                            title={clubCorPrimaria}
                          />
                        )}
                        {clubCorSecundaria && (
                          <span
                            className="w-5 h-5 rounded-full border border-slate-200 inline-block"
                            style={{ background: clubCorSecundaria }}
                            title={clubCorSecundaria}
                          />
                        )}
                      </div>
                    )}
                    {!clubMorada && !clubTelefone && !clubEmailContacto && !clubWebsite && !clubAssociacao && (
                      <p className="text-slate-400">Sem dados de contacto preenchidos.</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Danger zone — individual apaga a equipa aqui (pre-requisito para
              apagar a conta em /settings). Reusa o modal de eliminacao. */}
          {isIndividual && canDangerZone && (
            <Card className="border-red-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-red-700">Zona de Perigo</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-slate-600">
                  Apaga permanentemente a tua equipa e todos os dados associados:
                  jogadores, treinos, jogos, competições. Esta acção é
                  irreversível e é necessária antes de apagares a conta.
                </p>
                <Button
                  variant="outline"
                  className="border-red-300 text-red-600 hover:bg-red-50"
                  onClick={() => { setDeleteConfirmName(""); setShowDeleteModal(true); }}
                >
                  Apagar equipa
                </Button>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ─── Membros tab ─── */}
      {effectiveTab === "members" && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">
              Membros da equipa técnica do clube.
            </p>
            {canManage && (
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => void openInviteForm()}
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
                    <Avatar className="w-9 h-9 shrink-0">
                      <AvatarImage src={member.avatar_url ?? undefined} alt={member.full_name ?? ""} />
                      <AvatarFallback className="bg-slate-200 text-slate-500 font-bold text-sm">
                        {(member.full_name || "?")[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">
                        {member.full_name || "Sem nome"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {member.is_club_coordinator
                          ? "Coordenador do Clube"
                          : member.is_coordinator
                            ? "Coordenador do Escalão"
                            : getStaffRoleLabel(member.role)}
                        {member.age_group_name && !member.is_club_coordinator
                          ? ` · ${member.age_group_name}`
                          : ""}
                      </p>
                      {member.email && (
                        <p className="text-xs text-slate-400 truncate">{member.email}</p>
                      )}
                    </div>
                    {isClubCoordinator && !member.is_club_coordinator && !confirmRemoveMemberId && (
                      <button
                        onClick={() => void handleOpenEdit(member)}
                        className="p-1.5 hover:bg-slate-100 rounded-lg group shrink-0"
                        title="Editar membro"
                      >
                        <Pencil size={14} className="text-slate-300 group-hover:text-slate-500 transition-colors" />
                      </button>
                    )}
                    {canManage && !member.is_coordinator && (
                      confirmRemoveMemberId === member.id ? (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => void handleRemoveMember(member.id, member.profile_id)}
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

          {/* Convites (pendentes, aceites, orfaos) */}
          {staffInvites.length > 0 && (
            <Card>
              <CardHeader className="pb-0">
                <button
                  className="w-full flex items-center justify-between text-left"
                  onClick={() => setInvitesExpanded((v) => !v)}
                  aria-expanded={invitesExpanded}
                >
                  <CardTitle className="text-base flex items-center gap-2">
                    <Mail size={16} className="text-slate-500" />
                    Convites
                    <span className="text-xs font-normal text-slate-400">({staffInvites.length})</span>
                  </CardTitle>
                  {invitesExpanded ? (
                    <ChevronUp size={18} className="text-slate-400" />
                  ) : (
                    <ChevronDown size={18} className="text-slate-400" />
                  )}
                </button>
              </CardHeader>
              {invitesExpanded && (
                <CardContent className="pt-4 space-y-2">
                {staffInvites.map((invite) => {
                  const isPending = invite.status === "pending";
                  const isOrphan = invite.status === "orphan";
                  const cardClasses = isPending
                    ? "bg-amber-50 border-amber-100"
                    : isOrphan
                      ? "bg-slate-50 border-slate-200"
                      : "bg-emerald-50/60 border-emerald-100";
                  const badge = isPending
                    ? { label: "Pendente", classes: "text-amber-700 bg-amber-100" }
                    : isOrphan
                      ? { label: "Órfão", classes: "text-slate-600 bg-slate-200" }
                      : { label: "Aceite", classes: "text-emerald-700 bg-emerald-100" };
                  const isBusy =
                    cancelingInviteId === invite.id || resendingInviteId === invite.id;
                  return (
                    <div
                      key={invite.id}
                      className={`flex items-center gap-3 p-3 border rounded-xl ${cardClasses}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-slate-800">
                            {invite.first_name} {invite.last_name}
                          </p>
                          <span
                            className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full shrink-0 ${badge.classes}`}
                          >
                            {badge.label}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {getStaffRoleLabel(invite.role)}
                          {invite.age_group_name ? ` · ${invite.age_group_name}` : ""}
                        </p>
                        <p className="text-xs text-slate-400 truncate">{invite.email}</p>
                        {isOrphan && (
                          <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                            <AlertCircle size={11} className="shrink-0" />
                            A conta associada já não existe.
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {isPending && (
                          <button
                            onClick={() => copyCode(invite.invite_code)}
                            className="p-1.5 hover:bg-amber-100 rounded-lg text-amber-600"
                            title="Copiar código"
                          >
                            {copiedCode === invite.invite_code ? (
                              <Check size={14} className="text-emerald-600" />
                            ) : (
                              <Copy size={14} />
                            )}
                          </button>
                        )}
                        {canManage && isPending && (
                          <button
                            onClick={() => void handleResendInvite(invite.id)}
                            disabled={isBusy}
                            className="p-1.5 hover:bg-amber-100 rounded-lg text-amber-700 transition-colors disabled:opacity-50"
                            title="Reenviar email"
                          >
                            {resendingInviteId === invite.id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Send size={14} />
                            )}
                          </button>
                        )}
                        {canManage && (isPending || isOrphan) && (
                          <button
                            onClick={() =>
                              setConfirmInviteAction({
                                id: invite.id,
                                action: isOrphan ? "clear" : "revoke",
                              })
                            }
                            disabled={isBusy}
                            className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 transition-colors disabled:opacity-50"
                            title={isOrphan ? "Limpar registo" : "Revogar convite"}
                          >
                            {cancelingInviteId === invite.id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : isOrphan ? (
                              <Trash2 size={14} />
                            ) : (
                              <X size={14} />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                </CardContent>
              )}
            </Card>
          )}
        </>
      )}

      {/* ─── Facturação tab ─── */}
      {effectiveTab === "facturacao" && (isClubCoordinator || isSuperCoordinator) && (
        <CoordinatorInvoicesTab />
      )}

      {/* ─── Configurações tab ─── */}
      {effectiveTab === "settings" && (
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
            className="bg-white rounded-2xl w-full max-w-md shadow-xl max-h-[calc(100dvh-1rem)] md:max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center p-5 border-b shrink-0">
              <h3 className="font-bold text-slate-900">Convidar Membro</h3>
              <button onClick={() => setShowInviteForm(false)}>
                <X size={20} className="text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleSendInvite} className="flex flex-col min-h-0">
              <div className="p-5 space-y-4 overflow-y-auto flex-1 pb-[max(1.25rem,env(safe-area-inset-bottom))]" style={{ WebkitOverflowScrolling: "touch" }}>
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
                    onValueChange={(v) => {
                      setInviteForm((f) => ({ ...f, role: v }));
                      const tpl = ROLE_TO_TEMPLATE[v];
                      if (tpl) setInvitePermissions(templateToPermissions(tpl));
                    }}
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
                {isClubCoordinator && inviteForm.role !== "club_coordinator" && clubAgeGroupsForInvite.length > 0 && (
                  <div className="space-y-1.5">
                    <Label>Escalões *</Label>
                    <div className="rounded-lg border border-slate-200 p-3 space-y-2 max-h-36 overflow-y-auto">
                      {clubAgeGroupsForInvite.map((ag) => (
                        <label key={ag.id} className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={inviteSelectedAgeGroupIds.has(ag.id)}
                            onChange={(e) => {
                              setInviteSelectedAgeGroupIds((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(ag.id);
                                else next.delete(ag.id);
                                return next;
                              });
                            }}
                            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          <span className="text-sm text-slate-700">{ag.name}</span>
                        </label>
                      ))}
                    </div>
                    {inviteSelectedAgeGroupIds.size === 0 && (
                      <p className="text-xs text-amber-600">Seleciona pelo menos um escalão.</p>
                    )}
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label>Permissões</Label>
                  <div className="rounded-lg border border-slate-100 p-3">
                    <PermissionsGrid
                      permissions={invitePermissions}
                      onChange={setInvitePermissions}
                      showTemplateSelector
                    />
                  </div>
                </div>
              </div>
              <div className="flex gap-2 p-5 pt-3 border-t bg-white shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <Button
                  type="submit"
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                  disabled={sendingInvite || (isClubCoordinator && inviteForm.role !== "club_coordinator" && clubAgeGroupsForInvite.length > 0 && inviteSelectedAgeGroupIds.size === 0)}
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

      {/* ─── Modal: Editar membro ─── */}
      {editingMember && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-4"
          onClick={() => { if (!savingEdit) setEditingMember(null); }}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-md shadow-xl max-h-[calc(100dvh-1rem)] md:max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center p-5 border-b shrink-0">
              <h3 className="font-bold text-slate-900">Editar Membro</h3>
              <button onClick={() => setEditingMember(null)} disabled={savingEdit}>
                <X size={20} className="text-slate-400" />
              </button>
            </div>
            {loadingEdit ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={24} className="animate-spin text-slate-400" />
              </div>
            ) : (
              <form onSubmit={handleSaveEdit} className="flex flex-col min-h-0">
                <div className="p-5 space-y-4 overflow-y-auto flex-1 pb-[max(1.25rem,env(safe-area-inset-bottom))]" style={{ WebkitOverflowScrolling: "touch" }}>
                  <div className="space-y-1.5">
                    <Label>Nome completo</Label>
                    <Input
                      value={editForm.fullName}
                      onChange={(e) => setEditForm((f) => ({ ...f, fullName: e.target.value }))}
                      placeholder="Nome completo"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Telefone</Label>
                    <Input
                      value={editForm.phone}
                      onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                      placeholder="+351 912 345 678"
                      maxLength={30}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Função</Label>
                    <Select
                      value={editForm.role}
                      onValueChange={(v) => {
                        setEditForm((f) => ({ ...f, role: v }));
                        const tpl = ROLE_TO_TEMPLATE[v];
                        if (tpl) setEditPermissions(templateToPermissions(tpl));
                      }}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={AGE_GROUP_COORDINATOR_OPTION.value}>
                          {AGE_GROUP_COORDINATOR_OPTION.label}
                        </SelectItem>
                        {INVITE_ROLE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {clubAgeGroupsForInvite.length > 0 && (
                    <div className="space-y-1.5">
                      <Label>Escalões</Label>
                      <div className="rounded-lg border border-slate-200 p-3 space-y-2 max-h-36 overflow-y-auto">
                        {clubAgeGroupsForInvite.map((ag) => (
                          <label key={ag.id} className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={editAgeGroupIds.has(ag.id)}
                              onChange={(e) => {
                                setEditAgeGroupIds((prev) => {
                                  const next = new Set(prev);
                                  if (e.target.checked) next.add(ag.id);
                                  else next.delete(ag.id);
                                  return next;
                                });
                              }}
                              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                            />
                            <span className="text-sm text-slate-700">{ag.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label>Permissões</Label>
                    <div className="rounded-lg border border-slate-100 p-3">
                      <PermissionsGrid
                        permissions={editPermissions}
                        onChange={setEditPermissions}
                        showTemplateSelector
                      />
                    </div>
                  </div>
                  <div className="pt-2 border-t border-slate-100">
                    {confirmRemoveInEdit ? (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-600 flex-1">Confirmar remoção?</span>
                        <button
                          type="button"
                          onClick={() => void handleRemoveMember(editingMember.id, editingMember.profile_id, () => setEditingMember(null))}
                          disabled={removingMemberId === editingMember.id}
                          className="text-xs font-semibold text-white bg-red-500 hover:bg-red-600 px-3 py-1.5 rounded-lg"
                        >
                          {removingMemberId === editingMember.id ? <Loader2 size={12} className="animate-spin" /> : "Remover"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmRemoveInEdit(false)}
                          className="text-xs text-slate-400 px-2 py-1.5"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmRemoveInEdit(true)}
                        className="text-sm text-red-500 hover:text-red-600"
                      >
                        Remover do clube
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 p-5 pt-3 border-t bg-white shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
                  <Button
                    type="submit"
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                    disabled={savingEdit}
                  >
                    {savingEdit ? <Loader2 size={16} className="animate-spin" /> : "Guardar"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setEditingMember(null)} disabled={savingEdit}>
                    Cancelar
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ─── Modal: Confirmar revogar/limpar convite ─── */}
      {confirmInviteAction && (() => {
        const target = staffInvites.find((inv) => inv.id === confirmInviteAction.id);
        if (!target) return null;
        const isClear = confirmInviteAction.action === "clear";
        const title = isClear ? "Limpar registo do convite" : "Revogar convite";
        const description = isClear
          ? `Vai apagar o registo do convite de ${target.first_name} ${target.last_name}. A conta associada já não existe — isto apenas remove o registo órfão.`
          : `Vai revogar o convite pendente de ${target.first_name} ${target.last_name} (${target.email}). Esta acção não pode ser desfeita.`;
        const confirmLabel = isClear ? "Limpar" : "Revogar";
        return (
          <div
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
            onClick={() => setConfirmInviteAction(null)}
          >
            <div
              className="bg-white rounded-2xl w-full max-w-sm shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 space-y-4">
                <h3 className="font-bold text-slate-900 text-lg">{title}</h3>
                <p className="text-sm text-slate-600">{description}</p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                    disabled={cancelingInviteId === confirmInviteAction.id}
                    onClick={() =>
                      void handleDeleteInvite(confirmInviteAction.id, confirmInviteAction.action)
                    }
                  >
                    {cancelingInviteId === confirmInviteAction.id ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      confirmLabel
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setConfirmInviteAction(null)}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

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
                Esta acção apaga permanentemente todos os escalões, jogadores, jogos, treinos e dados associados ao clube <strong>{ageGroup?.club_name ?? clubName}</strong>.
              </p>
              <p className="text-sm text-slate-600">
                Para confirmar, escreve o nome do clube:
              </p>
              <form onSubmit={handleDeleteClub} className="space-y-3">
                <Input
                  value={deleteConfirmName}
                  onChange={(e) => setDeleteConfirmName(e.target.value)}
                  placeholder={ageGroup?.club_name ?? clubName}
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button
                    type="submit"
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                    disabled={
                      deletingClub ||
                      deleteConfirmName.trim().toLowerCase() !== (ageGroup?.club_name ?? clubName).trim().toLowerCase()
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
