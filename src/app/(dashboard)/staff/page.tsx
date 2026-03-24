"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect } from "react";
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
import {
  Loader2,
  Plus,
  X,
  Copy,
  Check,
  Users,
  Mail,
  Trash2,
  Pencil,
  ChevronDown,
  ChevronUp,
  Shield,
} from "lucide-react";
import {
  ALL_PERMISSION_AREAS,
  type PermissionArea,
  type AreaPermissions,
  type PermissionTemplateKey,
} from "@/lib/auth/permissions-shared";
import { PermissionsGrid, type PermissionsMap, templateToPermissions } from "@/components/staff/PermissionsGrid";
import { toast } from "sonner";
import {
  AGE_GROUP_STAFF_ROLE_LABELS,
  getStaffRoleLabel,
  normalizeAgeGroupStaffRole,
} from "@/lib/team/staff-role";

const CLUB_COORDINATOR_OPTION = { value: "club_coordinator", label: "Coordenador de Clube" };
const AGE_GROUP_COORDINATOR_OPTION = { value: "age_group_coordinator", label: "Coordenador de Escalão" };

const INVITE_ROLE_OPTIONS = Object.entries(AGE_GROUP_STAFF_ROLE_LABELS).map(
  ([value, label]) => ({ value, label }),
);

const STAFF_ROLE_OPTIONS = INVITE_ROLE_OPTIONS;

interface StaffMember {
  id: string; // age_group_staff.id
  profile_id: string;
  role: string;
  full_name: string;
  is_coordinator?: boolean;
  is_club_coordinator?: boolean;
  email?: string;
  phone?: string;
  avatar_url?: string;
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

type TechnicalStaffUsage = {
  coordinatorIsSuperCoordinator: boolean;
  limit: number | null;
  limitEnforced: boolean;
  activeTechnicalStaffCount: number;
  pendingTechnicalInviteCount: number;
  totalUsed: number;
  remainingSlots: number | null;
  overLimit: boolean;
};

const ROLE_TO_TEMPLATE: Record<string, PermissionTemplateKey> = {
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

const EMPTY_FORM = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  role: "assistant_coach",
};

const EMPTY_EDIT_FORM = {
  role: "assistant_coach",
  email: "",
  phone: "",
};

export default function StaffPage() {
  const [loading, setLoading] = useState(true);
  const [canManageStaff, setCanManageStaff] = useState(false);
  const [isClubCoordinator, setIsClubCoordinator] = useState(false);

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [invites, setInvites] = useState<StaffInvite[]>([]);
  const [activeStaffProfileIds, setActiveStaffProfileIds] = useState<string[]>([]);
  const [invitesExpanded, setInvitesExpanded] = useState(false);
  const [technicalStaffUsage, setTechnicalStaffUsage] = useState<TechnicalStaffUsage | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [invitePermissions, setInvitePermissions] = useState<PermissionsMap>(() =>
    templateToPermissions(ROLE_TO_TEMPLATE["assistant_coach"]),
  );
  const [sending, setSending] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ code: string; emailSent: boolean; name: string } | null>(null);

  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [deletingInviteId, setDeletingInviteId] = useState<string | null>(null);
  const [confirmDeleteInviteId, setConfirmDeleteInviteId] = useState<string | null>(null);
  const [editingMember, setEditingMember] = useState<StaffMember | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM);
  const [savingEdit, setSavingEdit] = useState(false);

  // Permissions modal state
  const [managingPermissionsFor, setManagingPermissionsFor] = useState<StaffMember | null>(null);
  const [loadingPermissions, setLoadingPermissions] = useState(false);
  const [permissions, setPermissions] = useState<Record<PermissionArea, AreaPermissions> | null>(null);
  const [savingPermissions, setSavingPermissions] = useState(false);

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    setLoading(true);

    const contextRes = await fetch("/api/me/context");

    const ctx = await contextRes.json().catch(() => ({}));
    if (!contextRes.ok) {
      toast.error(ctx?.error || "Erro ao carregar equipa técnica.");
      setLoading(false);
      return;
    }

    setCanManageStaff(ctx?.canManageStaff === true);
    setIsClubCoordinator(ctx?.source === "club_coordinator");
    setTechnicalStaffUsage(
      ctx?.technicalStaffUsage &&
        typeof ctx.technicalStaffUsage === "object"
        ? (ctx.technicalStaffUsage as TechnicalStaffUsage)
        : null,
    );

    // Invites from context
    const nextInvites = (ctx?.staffInvites as StaffInvite[]) || [];
    setInvites(nextInvites);
    if (nextInvites.length === 0) {
      setInvitesExpanded(false);
    }
    setActiveStaffProfileIds(
      Array.isArray(ctx?.activeStaffProfileIds)
        ? (ctx.activeStaffProfileIds as string[])
        : [],
    );

    type CtxStaffMember = {
      id: string;
      profile_id: string;
      role: string;
      is_coordinator?: boolean;
      is_club_coordinator?: boolean;
      full_name: string | null;
      email: string | null;
      phone: string | null;
      avatar_url: string | null;
    };
    const rawMembers = (ctx?.staffMembers as CtxStaffMember[]) || [];
    const members: StaffMember[] = rawMembers.map((s) => ({
      id: s.id,
      profile_id: s.profile_id,
      role: s.role || "staff",
      full_name: s.full_name || "Sem nome",
      is_coordinator: s.is_coordinator === true,
      is_club_coordinator: s.is_club_coordinator === true,
      email: s.email || undefined,
      phone: s.phone || undefined,
      avatar_url: s.avatar_url || undefined,
    }));
    members.sort((a, b) => {
      const aPriority = a.is_coordinator ? 0 : 1;
      const bPriority = b.is_coordinator ? 0 : 1;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return a.full_name.localeCompare(b.full_name, "pt");
    });
    setStaff(members);

    setLoading(false);
  }

  async function handleSendInvite(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!canManageStaff) {
      toast.error("Apenas o coordenador pode enviar convites.");
      return;
    }
    setSending(true);
    setInviteResult(null);

    const permissionsArray = ALL_PERMISSION_AREAS.map((area) => ({
      area,
      ...invitePermissions[area],
    }));

    const res = await fetch("/api/invite/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone,
        role: form.role,
        permissions: permissionsArray,
      }),
    });
    const data = await res.json().catch(() => ({}));

    if (data.success) {
      setInviteResult({ code: data.inviteCode, emailSent: data.emailSent, name: form.firstName });
      setForm(EMPTY_FORM);
      setInvitePermissions(templateToPermissions(ROLE_TO_TEMPLATE["assistant_coach"]));
      setShowForm(false);
      setInvitesExpanded(true);
      if (data.emailSent) {
        toast.success("Convite enviado.");
      } else {
        toast.warning(data.warning || "Convite criado, mas email não enviado.");
      }
      void loadData();
    } else {
      toast.error(data.error || "Erro ao enviar convite");
    }
    setSending(false);
  }

  async function handleRemoveStaff(staffId: string) {
    if (!canManageStaff) {
      toast.error("Apenas o coordenador pode gerir a equipa técnica.");
      return;
    }
    setRemovingId(staffId);
    setConfirmRemoveId(null);

    const res = await fetch(`/api/staff/${staffId}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data?.error || "Erro ao remover membro.");
    } else {
      setStaff((prev) => prev.filter((s) => s.id !== staffId));
      toast.success("Membro removido da equipa");
    }
    setRemovingId(null);
  }

  function openEditMember(member: StaffMember) {
    if (!canManageStaff || member.is_coordinator) return;
    const normalizedRole = normalizeAgeGroupStaffRole(member.role) || "assistant_coach";
    setEditingMember(member);
    setEditForm({
      role: normalizedRole,
      email: member.email || "",
      phone: member.phone || "",
    });
  }

  function closeEditMember() {
    setEditingMember(null);
    setEditForm(EMPTY_EDIT_FORM);
  }

  async function handleSaveMember(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!editingMember || !canManageStaff) return;

    setSavingEdit(true);
    try {
      const res = await fetch(`/api/staff/${editingMember.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: editForm.role,
          email: editForm.email,
          phone: editForm.phone,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.staffMember) {
        toast.error(data?.error || "Erro ao atualizar membro.");
        return;
      }

      const updated = data.staffMember as StaffMember;
      setStaff((prev) =>
        prev.map((member) =>
          member.id === updated.id
            ? {
                ...member,
                role: updated.role,
                email: updated.email,
                phone: updated.phone,
              }
            : member,
        ),
      );

      if (data.authEmailSync === "provider_managed" && data.authEmailSyncMessage) {
        toast.warning(data.authEmailSyncMessage);
      } else if (data.authEmailSync === "failed") {
        toast.warning(
          data.authEmailSyncMessage ||
            "Email de contacto atualizado, mas sem sincronização no Auth.",
        );
      } else {
        toast.success("Membro atualizado.");
      }

      closeEditMember();
    } catch {
      toast.error("Erro de ligação ao atualizar membro.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDeleteInvite(inviteId: string) {
    setDeletingInviteId(inviteId);
    setConfirmDeleteInviteId(null);

    const res = await fetch(`/api/invite/staff/${inviteId}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      toast.error(data?.error || "Erro ao cancelar convite.");
    } else {
      setInvites((prev) => prev.filter((i) => i.id !== inviteId));
      toast.success("Convite cancelado");
    }
    setDeletingInviteId(null);
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code).catch(() => null);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  }

  async function openPermissionsModal(member: StaffMember) {
    setManagingPermissionsFor(member);
    setPermissions(null);
    setLoadingPermissions(true);

    try {
      const res = await fetch(`/api/permissions/${member.id}`);
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data) {
        toast.error(data?.error || "Erro ao carregar permissões.");
        setManagingPermissionsFor(null);
        return;
      }

      // Build a complete permissions map
      const permMap: Record<PermissionArea, AreaPermissions> = {} as Record<PermissionArea, AreaPermissions>;
      const defaultPerm: AreaPermissions = { can_read: true, can_write: false, can_edit: false, can_delete: false };

      for (const area of ALL_PERMISSION_AREAS) {
        const existing = (data.permissions as Array<{ area: string } & AreaPermissions>)
          ?.find((p) => p.area === area);
        permMap[area] = existing
          ? { can_read: existing.can_read, can_write: existing.can_write, can_edit: existing.can_edit, can_delete: existing.can_delete }
          : { ...defaultPerm };
      }

      setPermissions(permMap);
    } catch {
      toast.error("Erro de ligação ao carregar permissões.");
      setManagingPermissionsFor(null);
    } finally {
      setLoadingPermissions(false);
    }
  }

  function closePermissionsModal() {
    setManagingPermissionsFor(null);
    setPermissions(null);
  }

  async function handleSavePermissions(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!managingPermissionsFor || !permissions) return;

    setSavingPermissions(true);
    try {
      const permArray = ALL_PERMISSION_AREAS.map((area) => ({
        area,
        ...permissions[area],
      }));

      const res = await fetch(`/api/permissions/${managingPermissionsFor.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: permArray }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(data?.error || "Erro ao guardar permissões.");
        return;
      }

      toast.success("Permissões guardadas.");
      closePermissionsModal();
    } catch {
      toast.error("Erro de ligação ao guardar permissões.");
    } finally {
      setSavingPermissions(false);
    }
  }

  async function copyContact(value: string, label: "email" | "telefone") {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label === "email" ? "Email" : "Telefone"} copiado.`);
    } catch {
      toast.error(`Não foi possível copiar o ${label}.`);
    }
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

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-6">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 transition-colors mb-2"
      >
        ← Voltar
      </Link>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Equipa Técnica</h1>
        {canManageStaff && (
          <Button
            onClick={() => { setShowForm(true); setInviteResult(null); }}
            className="bg-emerald-600 hover:bg-emerald-700"
            size="sm"
          >
            <Plus size={16} className="mr-1" /> Convidar
          </Button>
        )}
      </div>


      {/* Membros activos */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users size={16} className="text-slate-500" />
            Membros actuais
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {staff.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">Sem membros na equipa técnica.</p>
          ) : (
            staff.map((member) => (
              <div key={member.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                {member.avatar_url ? (
                  <Image
                    src={member.avatar_url}
                    alt={member.full_name}
                    width={36}
                    height={36}
                    className="h-9 w-9 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 font-bold text-sm">
                    {member.full_name[0]?.toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{member.full_name}</p>
                  <p className="text-xs text-slate-500">
                    {member.is_club_coordinator
                      ? "Coordenador do Clube"
                      : member.is_coordinator
                        ? "Coordenador do Escalão"
                        : getStaffRoleLabel(member.role)}
                  </p>
                  {(member.email || member.phone) && (
                    <div className="mt-1 flex flex-wrap gap-2 text-xs">
                      {member.email ? (
                        <button
                          type="button"
                          onClick={() => void copyContact(member.email!, "email")}
                          className="rounded-full bg-white px-2 py-0.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                        >
                          {member.email}
                        </button>
                      ) : null}
                      {member.phone ? (
                        <button
                          type="button"
                          onClick={() => void copyContact(member.phone!, "telefone")}
                          className="rounded-full bg-white px-2 py-0.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                        >
                          {member.phone}
                        </button>
                      ) : null}
                    </div>
                  )}
                </div>
                {canManageStaff && !member.is_coordinator && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => void openPermissionsModal(member)}
                      className="p-1.5 hover:bg-violet-50 rounded-lg group"
                      title="Gerir permissões"
                    >
                      <Shield
                        size={14}
                        className="text-slate-300 group-hover:text-violet-500 transition-colors"
                      />
                    </button>
                    <button
                      onClick={() => openEditMember(member)}
                      className="p-1.5 hover:bg-blue-50 rounded-lg group"
                      title="Editar membro"
                    >
                      <Pencil
                        size={14}
                        className="text-slate-300 group-hover:text-blue-500 transition-colors"
                      />
                    </button>
                    {confirmRemoveId === member.id ? (
                      <>
                        <button
                          onClick={() => void handleRemoveStaff(member.id)}
                          disabled={removingId === member.id}
                          className="text-xs font-semibold text-white bg-red-500 hover:bg-red-600 px-2 py-1 rounded-lg"
                        >
                          {removingId === member.id ? <Loader2 size={12} className="animate-spin" /> : "Remover"}
                        </button>
                        <button onClick={() => setConfirmRemoveId(null)} className="text-xs text-slate-400 px-2 py-1">
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setConfirmRemoveId(member.id)}
                        className="p-1.5 hover:bg-red-50 rounded-lg group"
                        title="Remover da equipa"
                      >
                        <Trash2 size={14} className="text-slate-300 group-hover:text-red-500 transition-colors" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Convites pendentes */}
      {canManageStaff && invites.filter((inv) => !inv.accepted_at || !activeStaffProfileIds.includes(inv.accepted_by ?? "")).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <button
              type="button"
              onClick={() => setInvitesExpanded((prev) => !prev)}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Mail size={16} className="text-slate-500" />
                  Convites enviados
                </CardTitle>
                <p className="text-xs text-slate-400 mt-1">
                  {invites.filter((inv) => !inv.accepted_at || !activeStaffProfileIds.includes(inv.accepted_by ?? "")).length} convite{invites.filter((inv) => !inv.accepted_at || !activeStaffProfileIds.includes(inv.accepted_by ?? "")).length !== 1 ? "s" : ""} pendente{invites.filter((inv) => !inv.accepted_at || !activeStaffProfileIds.includes(inv.accepted_by ?? "")).length !== 1 ? "s" : ""}
                </p>
              </div>
              {invitesExpanded ? (
                <ChevronUp size={16} className="text-slate-400" />
              ) : (
                <ChevronDown size={16} className="text-slate-400" />
              )}
            </button>
          </CardHeader>
          {invitesExpanded && (
            <CardContent className="space-y-2">
              {invites.filter((inv) => !inv.accepted_at || !activeStaffProfileIds.includes(inv.accepted_by ?? "")).map((invite) => (
                (() => {
                  const isActiveMember =
                    !!invite.accepted_at &&
                    !!invite.accepted_by &&
                    activeStaffProfileIds.includes(invite.accepted_by);

                  const statusBadge = isActiveMember ? (
                    <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                      Activo
                    </span>
                  ) : invite.accepted_at ? (
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                      Aceite (pendente)
                    </span>
                  ) : (
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                      Pendente
                    </span>
                  );

                  return (
                    <div
                      key={invite.id}
                      className={`flex items-center gap-3 p-3 border rounded-xl ${
                        isActiveMember
                          ? "bg-emerald-50 border-emerald-100"
                          : "bg-amber-50 border-amber-100"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800">
                          {invite.first_name} {invite.last_name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {invite.email} · {getStaffRoleLabel(invite.role)}
                        </p>
                        <div className="mt-1">{statusBadge}</div>
                      </div>
                      <div className="flex items-center gap-1">
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
                        {canManageStaff &&
                          (confirmDeleteInviteId === invite.id ? (
                            <>
                              <button
                                onClick={() => void handleDeleteInvite(invite.id)}
                                disabled={deletingInviteId === invite.id}
                                className="text-xs font-semibold text-white bg-red-500 hover:bg-red-600 px-2 py-1 rounded-lg"
                              >
                                {deletingInviteId === invite.id ? (
                                  <Loader2 size={12} className="animate-spin" />
                                ) : invite.accepted_at ? (
                                  "Remover"
                                ) : (
                                  "Cancelar"
                                )}
                              </button>
                              <button
                                onClick={() => setConfirmDeleteInviteId(null)}
                                className="text-xs text-slate-400 px-1.5 py-1"
                              >
                                Não
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => setConfirmDeleteInviteId(invite.id)}
                              className="p-1.5 hover:bg-red-50 rounded-lg group"
                              title={invite.accepted_at ? "Remover membro" : "Cancelar convite"}
                            >
                              <X
                                size={14}
                                className="text-slate-300 group-hover:text-red-500 transition-colors"
                              />
                            </button>
                          ))}
                      </div>
                    </div>
                  );
                })()
              ))}
            </CardContent>
          )}
        </Card>
      )}

      {/* Resultado de convite */}
      {inviteResult && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-2">
          <p className="text-sm font-semibold text-emerald-800">
            Convite enviado para {inviteResult.name}!
          </p>
          {!inviteResult.emailSent && (
            <p className="text-xs text-emerald-700">Email não enviado. Partilha o código manualmente:</p>
          )}
          <div className="flex items-center gap-2 bg-white rounded-lg p-2 border border-emerald-200">
            <code className="flex-1 text-sm font-mono text-slate-800">{inviteResult.code}</code>
            <button
              onClick={() => copyCode(inviteResult.code)}
              className="p-1.5 hover:bg-emerald-100 rounded text-emerald-600"
            >
              {copiedCode === inviteResult.code ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
            </button>
          </div>
          <button
            onClick={() => setInviteResult(null)}
            className="text-xs text-emerald-600 underline"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Modal: Novo convite */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl max-h-[calc(100dvh-1rem)] md:max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center p-5 border-b shrink-0">
              <h3 className="font-bold text-slate-900">Convidar Treinador</h3>
              <button onClick={() => setShowForm(false)}><X size={20} className="text-slate-400" /></button>
            </div>
            <form onSubmit={handleSendInvite} className="flex flex-col min-h-0">
              <div
                className="p-5 space-y-4 overflow-y-auto flex-1 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
                style={{ WebkitOverflowScrolling: "touch" }}
              >
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Nome *</Label>
                    <Input value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} placeholder="Nome" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Apelido *</Label>
                    <Input value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} placeholder="Apelido" required />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Email *</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="email@exemplo.com" required />
                </div>
                <div className="space-y-1.5">
                  <Label>Função *</Label>
                  <Select
                    value={form.role}
                    onValueChange={(v) => {
                      setForm((f) => ({ ...f, role: v }));
                      const tplKey = ROLE_TO_TEMPLATE[v];
                      if (tplKey) setInvitePermissions(templateToPermissions(tplKey));
                    }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {isClubCoordinator && (
                        <SelectItem key={CLUB_COORDINATOR_OPTION.value} value={CLUB_COORDINATOR_OPTION.value}>
                          {CLUB_COORDINATOR_OPTION.label}
                        </SelectItem>
                      )}
                      <SelectItem key={AGE_GROUP_COORDINATOR_OPTION.value} value={AGE_GROUP_COORDINATOR_OPTION.value}>
                        {AGE_GROUP_COORDINATOR_OPTION.label}
                      </SelectItem>
                      {INVITE_ROLE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
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
                <Button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-700" disabled={sending}>
                  {sending ? <Loader2 size={16} className="animate-spin" /> : "Enviar convite"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Gerir Permissões */}
      {managingPermissionsFor && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-4"
          onClick={closePermissionsModal}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-lg shadow-xl max-h-[calc(100dvh-1rem)] md:max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center p-5 border-b shrink-0">
              <div>
                <h3 className="font-bold text-slate-900">Permissões</h3>
                <p className="text-xs text-slate-400 mt-0.5">{managingPermissionsFor.full_name}</p>
              </div>
              <button onClick={closePermissionsModal}>
                <X size={20} className="text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleSavePermissions} className="flex flex-col min-h-0">
              <div
                className="p-5 overflow-y-auto flex-1 space-y-4"
                style={{ WebkitOverflowScrolling: "touch" }}
              >
                {loadingPermissions ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 size={24} className="animate-spin text-slate-400" />
                  </div>
                ) : permissions ? (
                  <PermissionsGrid
                    permissions={permissions}
                    onChange={setPermissions}
                    showTemplateSelector
                  />
                ) : null}
              </div>

              {!loadingPermissions && permissions && (
                <div className="flex gap-2 p-5 pt-3 border-t bg-white shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
                  <Button
                    type="submit"
                    className="flex-1 bg-violet-600 hover:bg-violet-700"
                    disabled={savingPermissions || !permissions}
                  >
                    {savingPermissions ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      "Guardar permissões"
                    )}
                  </Button>
                  <Button type="button" variant="outline" onClick={closePermissionsModal}>
                    Cancelar
                  </Button>
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {/* Modal: Editar membro */}
      {editingMember && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-4"
          onClick={closeEditMember}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-md shadow-xl max-h-[calc(100dvh-1rem)] md:max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center p-5 border-b shrink-0">
              <h3 className="font-bold text-slate-900">Editar membro</h3>
              <button onClick={closeEditMember}>
                <X size={20} className="text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleSaveMember} className="flex flex-col min-h-0">
              <div
                className="p-5 space-y-4 overflow-y-auto flex-1 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
                style={{ WebkitOverflowScrolling: "touch" }}
              >
                <div className="space-y-1.5">
                  <Label>Nome</Label>
                  <Input value={editingMember.full_name} disabled />
                </div>
                <div className="space-y-1.5">
                  <Label>Cargo *</Label>
                  <Select
                    value={editForm.role}
                    onValueChange={(value) =>
                      setEditForm((prev) => ({ ...prev, role: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STAFF_ROLE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={editForm.email}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, email: e.target.value }))
                    }
                    placeholder="email@exemplo.com"
                  />
                  <p className="text-[11px] text-slate-400">
                    Em contas Google, o email de login pode continuar gerido pelo fornecedor.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>Telemóvel</Label>
                  <Input
                    type="tel"
                    value={editForm.phone}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, phone: e.target.value }))
                    }
                    placeholder="9XX XXX XXX"
                  />
                </div>
              </div>
              <div className="flex gap-2 p-5 pt-3 border-t bg-white shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <Button
                  type="submit"
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                  disabled={savingEdit}
                >
                  {savingEdit ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    "Guardar alterações"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeEditMember}
                  disabled={savingEdit}
                >
                  Cancelar
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
