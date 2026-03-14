"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  isValidManualShortName,
  normalizeManualShortName,
} from "@/lib/football/short-name";
import type { AgeGroup, KitPiece, KitNumber, PlayerType, PieceType, StaffInvite } from "@/components/team/setup/types";
import {
  normalizePlayerTypeForComparison,
  normalizePieceTypeForComparison,
  samePieceType,
  normalizeColorHex,
  EMPTY_STAFF_FORM,
} from "@/components/team/setup/types";

export function useTeamSetup() {
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
  const [isSuperCoordinator, setIsSuperCoordinator] = useState(false);
  const [deleteAgeGroupModalOpen, setDeleteAgeGroupModalOpen] = useState(false);
  const [deleteAgeGroupConfirmText, setDeleteAgeGroupConfirmText] = useState("");
  const [deletingAgeGroup, setDeletingAgeGroup] = useState(false);

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
      const incomingIsSuper =
        payload?.profile?.is_super_coordinator === true;
      setAccountRole(incomingRole);
      setIsSuperCoordinator(incomingIsSuper);

      if (!ag) {
        setExistingAgeGroup(null);
        setTeamId(null);
        setKitPieces([]);
        setActiveStaffProfileIds([]);
        setStaffInvites([]);
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
    } catch {
      setError("Erro de ligação ao carregar a equipa.");
    } finally {
      setLoading(false);
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

  async function handleDeleteAgeGroup() {
    if (!existingAgeGroup) return;

    if (deleteAgeGroupConfirmText.trim().toUpperCase() !== "APAGAR ESCALAO") {
      setError("Escreve APAGAR ESCALAO para confirmar.");
      return;
    }

    setDeletingAgeGroup(true);
    setError(null);

    try {
      const res = await fetch("/api/me/age-group", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmation: "DELETE_AGE_GROUP",
          ageGroupId: existingAgeGroup.id,
        }),
      });
      const payload = (await res.json().catch(() => null)) as
        | { success?: boolean; error?: string }
        | null;

      if (!res.ok || !payload?.success) {
        setError(payload?.error || "Não foi possível apagar o escalão.");
        setDeletingAgeGroup(false);
        return;
      }

      kitSaveTimers.current.forEach((timer) => clearTimeout(timer));
      kitSaveTimers.current.clear();

      setExistingAgeGroup(null);
      setTeamId(null);
      setLogoUrl("");
      setKitPieces([]);
      setKitColors({});
      setStaffInvites([]);
      setActiveStaffProfileIds([]);
      setShowStaffForm(false);
      setStaffForm(EMPTY_STAFF_FORM);
      setInviteResult(null);
      setKitsExpanded(false);
      setIsEditing(false);
      setDeleteAgeGroupConfirmText("");
      setDeleteAgeGroupModalOpen(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Erro de ligação ao apagar o escalão.");
    } finally {
      setDeletingAgeGroup(false);
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

  return {
    // Refs
    logoRef,
    kitSaveTimers,

    // Core state
    loading,
    saving,
    saved,
    error,
    setError,
    existingAgeGroup,
    teamId,
    accountRole,
    isSuperCoordinator,

    // Age group form
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
    isEditing,
    setIsEditing,

    // Logo
    uploadingLogo,
    logoUrl,
    handleLogoUpload,

    // Kits
    kitPieces,
    kitColors,
    setKitColors,
    savingKit,
    kitsExpanded,
    setKitsExpanded,
    kitStatusMessage,
    getKitPiece,
    handleKitColorChange,

    // Staff
    staffInvites,
    activeStaffProfileIds,
    showStaffForm,
    setShowStaffForm,
    staffForm,
    setStaffForm,
    sendingInvite,
    inviteResult,
    setInviteResult,
    staffInvitesExpanded,
    setStaffInvitesExpanded,
    copiedCode,
    deletingId,
    confirmDeleteId,
    setConfirmDeleteId,
    copyCode,

    // Delete age group
    deleteAgeGroupModalOpen,
    setDeleteAgeGroupModalOpen,
    deleteAgeGroupConfirmText,
    setDeleteAgeGroupConfirmText,
    deletingAgeGroup,

    // Actions
    handleSaveSetup,
    handleDeleteAgeGroup,
    handleSendStaffInvite,
    handleDeleteInvite,
  };
}
