"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
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
  AGE_GROUP_STAFF_ROLE_LABELS,
  getStaffRoleLabel,
} from "@/lib/team/staff-role";
import {
  PermissionsGrid,
  type PermissionsMap,
  templateToPermissions,
} from "@/components/staff/PermissionsGrid";

const INVITE_ROLE_OPTIONS = [
  { value: "age_group_coordinator", label: "Coordenador de Escalão" },
  ...Object.entries(AGE_GROUP_STAFF_ROLE_LABELS).map(([value, label]) => ({
    value,
    label,
  })),
];

const ROLE_TO_TEMPLATE: Record<
  string,
  "principal" | "adjunto" | "estagiario"
> = {
  head_coach: "principal",
  assistant_coach: "adjunto",
  intern_coach: "estagiario",
  goalkeeper_coach: "adjunto",
  fitness_coach: "adjunto",
};

interface StaffMember {
  id: string;
  profile_id: string;
  role: string;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
}

type FetchState =
  | { status: "loading" }
  | {
      status: "success";
      staff: StaffMember[];
      canManage: boolean;
      isClubCoordinator: boolean;
    };

type Props = {
  ageGroupId: string;
};

export function StaffSection({ ageGroupId }: Props) {
  const supabase = useMemo(() => createClient(), []);

  const [state, setState] = useState<FetchState>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    role: "assistant_coach",
  });
  const [invitePermissions, setInvitePermissions] = useState<PermissionsMap>(
    () => templateToPermissions(ROLE_TO_TEMPLATE["assistant_coach"]),
  );
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const [profileRes, agRes, staffLinkRes, staffLinksRes, ctxRes] =
        await Promise.all([
          supabase
            .from("profiles")
            .select("role, is_super_coordinator")
            .eq("id", user.id)
            .maybeSingle(),
          supabase
            .from("age_groups")
            .select("coordinator_id")
            .eq("id", ageGroupId)
            .maybeSingle(),
          supabase
            .from("age_group_staff")
            .select("role")
            .eq("age_group_id", ageGroupId)
            .eq("profile_id", user.id)
            .maybeSingle(),
          supabase
            .from("age_group_staff")
            .select("id, profile_id, role")
            .eq("age_group_id", ageGroupId),
          fetch("/api/me/context").catch(() => null),
        ]);

      if (cancelled) return;

      const profile = profileRes.data;
      const ag = agRes.data;
      const staffLink = staffLinkRes.data;
      const staffLinks = staffLinksRes.data ?? [];

      const isCoord =
        profile?.role === "coordinator" || profile?.is_super_coordinator;
      const isOwnAg = ag?.coordinator_id === user.id;
      const isPrincipal =
        staffLink?.role === "coach" ||
        staffLink?.role === "age_group_coordinator";
      const canManage =
        isCoord || isOwnAg || isPrincipal || !!profile?.is_super_coordinator;

      let isClubCoordinator = false;
      if (ctxRes?.ok) {
        const ctx = await ctxRes.json().catch(() => ({}));
        if (cancelled) return;
        isClubCoordinator = ctx?.source === "club_coordinator";
      }

      let resolvedStaff: StaffMember[] = [];
      if (staffLinks.length > 0) {
        const profileIds = staffLinks.map((s) => s.profile_id);
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("id, full_name, email, phone, avatar_url")
          .in("id", profileIds);
        if (cancelled) return;
        const profileMap = new Map(
          (profilesData ?? []).map((p) => [p.id, p]),
        );
        resolvedStaff = staffLinks.map((s) => ({
          id: s.id,
          profile_id: s.profile_id,
          role: s.role,
          full_name: profileMap.get(s.profile_id)?.full_name ?? null,
          email: profileMap.get(s.profile_id)?.email ?? null,
          phone: profileMap.get(s.profile_id)?.phone ?? null,
          avatar_url: profileMap.get(s.profile_id)?.avatar_url ?? null,
        }));
      }

      setState({
        status: "success",
        staff: resolvedStaff,
        canManage,
        isClubCoordinator,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [ageGroupId, supabase, reloadKey]);

  async function handleInvite(e: { preventDefault(): void }) {
    e.preventDefault();
    setSending(true);
    const isClubCoordinator =
      state.status === "success" ? state.isClubCoordinator : false;
    const res = await fetch("/api/invite/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: inviteForm.firstName,
        lastName: inviteForm.lastName,
        email: inviteForm.email,
        role: inviteForm.role,
        permissions: Object.entries(invitePermissions).map(([area, perms]) => ({
          area,
          ...perms,
        })),
        ...(isClubCoordinator ? { ageGroupIds: [ageGroupId] } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.success) {
      setShowInvite(false);
      setInviteForm({
        firstName: "",
        lastName: "",
        email: "",
        role: "assistant_coach",
      });
      setInvitePermissions(templateToPermissions(ROLE_TO_TEMPLATE["assistant_coach"]));
      if (data.emailSent) {
        toast.success("Convite enviado.");
      } else {
        toast.warning(data.warning || "Convite criado, mas email não enviado.");
      }
      setReloadKey((k) => k + 1);
    } else {
      toast.error(data.error || "Erro ao enviar convite.");
    }
    setSending(false);
  }

  if (state.status === "loading") {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={24} className="animate-spin text-slate-400" />
      </div>
    );
  }

  const { staff, canManage } = state;

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">{staff.length} membros</p>
          {canManage && (
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => setShowInvite(true)}
            >
              <Plus size={14} className="mr-1" /> Convidar
            </Button>
          )}
        </div>
        {staff.length === 0 ? (
          <Card>
            <CardContent className="pt-8 pb-8 text-center text-slate-400 text-sm">
              Sem staff neste escalão.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {staff.map((s) => (
              <Card key={s.id}>
                <CardContent className="py-3 px-4 flex items-center gap-3">
                  {s.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={s.avatar_url}
                      alt={s.full_name ?? ""}
                      className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600 flex-shrink-0">
                      {s.full_name
                        ? s.full_name
                            .trim()
                            .split(/\s+/)
                            .filter(Boolean)
                            .slice(0, 2)
                            .map((w) => w[0])
                            .join("")
                            .toUpperCase()
                        : "??"}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 truncate">
                      {s.full_name ?? "—"}
                    </p>
                    <p className="text-xs text-slate-400 truncate">
                      {s.email ?? ""}
                    </p>
                    {s.phone && (
                      <p className="text-xs text-slate-400">{s.phone}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
                      {getStaffRoleLabel(s.role)}
                    </span>
                    {s.role === "coach" && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                        RWED auto
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {showInvite && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-4"
          onClick={() => setShowInvite(false)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center p-5 border-b">
              <h3 className="font-bold text-slate-900">Convidar Staff</h3>
              <button onClick={() => setShowInvite(false)}>
                <X size={20} className="text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleInvite} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Nome *</Label>
                  <Input
                    value={inviteForm.firstName}
                    onChange={(e) =>
                      setInviteForm((f) => ({
                        ...f,
                        firstName: e.target.value,
                      }))
                    }
                    placeholder="Nome"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Apelido *</Label>
                  <Input
                    value={inviteForm.lastName}
                    onChange={(e) =>
                      setInviteForm((f) => ({
                        ...f,
                        lastName: e.target.value,
                      }))
                    }
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
                  onChange={(e) =>
                    setInviteForm((f) => ({ ...f, email: e.target.value }))
                  }
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
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INVITE_ROLE_OPTIONS.map(({ value, label }) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
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
              <div className="flex gap-2 pt-1">
                <Button
                  type="submit"
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                  disabled={sending}
                >
                  {sending ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    "Enviar convite"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowInvite(false)}
                >
                  Cancelar
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
