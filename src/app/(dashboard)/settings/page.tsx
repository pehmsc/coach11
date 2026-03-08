"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PushNotificationsControl } from "@/components/pwa/PushNotificationsControl";
import { Loader2, User, Palette, Bell, Camera, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { pt } from "date-fns/locale";
import { clearClientCaches } from "@/lib/query/cache-clear";
import type { Profile } from "@/types/database";

type Tab = "account" | "theme" | "notifications";

type ManagedAgeGroup = {
  id: string;
  name?: string | null;
};

const ROLE_LABELS: Record<string, string> = {
  coordinator: "Coordenador",
  coach: "Treinador",
  player: "Jogador",
  parent: "Encarregado",
};

export default function SettingsPage() {
  const supabase = useMemo(() => createClient(), []);
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>("account");

  // Profile state
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [nextEmail, setNextEmail] = useState("");
  const [updatingEmail, setUpdatingEmail] = useState(false);

  // Edit form
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");

  // Password
  const [sendingReset, setSendingReset] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [managedAgeGroups, setManagedAgeGroups] = useState<ManagedAgeGroup[]>([]);

  useEffect(() => {
    void loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadProfile() {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setAuthEmail("");
      setNextEmail("");
      setManagedAgeGroups([]);
      setLoading(false);
      return;
    }

    const resolvedAuthEmail = typeof user.email === "string" ? user.email : "";
    setAuthEmail(resolvedAuthEmail);
    setNextEmail(resolvedAuthEmail);

    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (data) {
      // Fallback: use Google/OAuth avatar from auth metadata if profile has none
      const metaAvatarUrl = (user.user_metadata?.avatar_url as string | undefined) ?? null;
      const resolvedAvatarUrl = (data as Profile).avatar_url || metaAvatarUrl;

      // Sync missing avatar_url to profiles table (once)
      if (!data.avatar_url && metaAvatarUrl) {
        void supabase.from("profiles").update({ avatar_url: metaAvatarUrl }).eq("id", user.id);
      }

      const merged: Profile = { ...(data as Profile), avatar_url: resolvedAvatarUrl ?? undefined };
      setProfile(merged);
      setFullName(data.full_name || "");
      setPhone((data as Profile & { phone?: string }).phone || "");
    }

    try {
      const [contextRes, managedAgeGroupsRes] = await Promise.all([
        fetch("/api/me/context", { cache: "no-store" }),
        fetch("/api/me/age-group", { cache: "no-store" }),
      ]);
      const contextPayload = await contextRes.json().catch(() => ({}));
      const managedAgeGroupsPayload = await managedAgeGroupsRes.json().catch(() => ({}));

      if (contextRes.ok) {
        const isSuper =
          (data as Profile | null)?.is_super_coordinator === true ||
          contextPayload?.profile?.is_super_coordinator === true;

        if (isSuper) {
          setProfile((prev) =>
            prev ? { ...prev, is_super_coordinator: true } : prev,
          );
        }
      }

      if (managedAgeGroupsRes.ok) {
        setManagedAgeGroups(
          Array.isArray(managedAgeGroupsPayload?.managedAgeGroups)
            ? (managedAgeGroupsPayload.managedAgeGroups as ManagedAgeGroup[])
            : [],
        );
      } else {
        setManagedAgeGroups([]);
      }
    } catch {
      setManagedAgeGroups([]);
    }

    setLoading(false);
  }

  async function handleSave(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);

    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName, phone: phone || null })
      .eq("id", profile.id);

    if (error) {
      toast.error("Erro ao guardar: " + error.message);
    } else {
      toast.success("Perfil atualizado");
      setProfile((prev) => prev ? { ...prev, full_name: fullName, phone } : prev);
    }
    setSaving(false);
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    setUploadingAvatar(true);
    const ext = file.name.split(".").pop();
    const path = `avatars/${profile.id}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true });

    if (uploadError) {
      toast.error("Erro ao carregar imagem");
      setUploadingAvatar(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
    const avatarUrl = urlData.publicUrl;

    await supabase.from("profiles").update({ avatar_url: avatarUrl }).eq("id", profile.id);
    setProfile((prev) => prev ? { ...prev, avatar_url: avatarUrl } : prev);
    toast.success("Foto atualizada");
    setUploadingAvatar(false);
  }

  async function handlePasswordReset() {
    if (!profile) return;
    setSendingReset(true);

    const { data: userData } = await supabase.auth.getUser();
    const email = userData.user?.email;
    if (!email) {
      toast.error("Email não encontrado");
      setSendingReset(false);
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback/client`,
    });

    if (error) {
      toast.error("Erro ao enviar email: " + error.message);
    } else {
      toast.success("Email de redefinição enviado para " + email);
    }
    setSendingReset(false);
  }

  function isValidEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  async function handleEmailUpdate(e: { preventDefault(): void }) {
    e.preventDefault();

    const normalizedEmail = nextEmail.trim().toLowerCase();
    if (!normalizedEmail) {
      toast.error("Indica um email válido.");
      return;
    }

    if (!isValidEmail(normalizedEmail)) {
      toast.error("Formato de email inválido.");
      return;
    }

    if (normalizedEmail === authEmail.trim().toLowerCase()) {
      toast.message("O novo email é igual ao atual.");
      return;
    }

    setUpdatingEmail(true);
    const emailRedirectTo = `${window.location.origin}/auth/callback/client?next=${encodeURIComponent("/settings")}`;
    const { error } = await supabase.auth.updateUser(
      { email: normalizedEmail },
      { emailRedirectTo },
    );

    if (error) {
      toast.error("Erro ao alterar email: " + error.message);
    } else {
      toast.success("Pedido de alteração enviado. Confirma o novo email para concluir.");
    }
    setUpdatingEmail(false);
  }

  async function handleDeleteAccount() {
    if (deleteConfirmText.trim().toUpperCase() !== "APAGAR") {
      toast.error("Escreve APAGAR para confirmar.");
      return;
    }

    setDeletingAccount(true);
    try {
      const res = await fetch("/api/me/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "DELETE_ACCOUNT" }),
      });
      const payload = (await res.json().catch(() => null)) as
        | {
            success?: boolean;
            error?: string;
            managedAgeGroups?: ManagedAgeGroup[];
          }
        | null;

      if (!res.ok || !payload?.success) {
        if (Array.isArray(payload?.managedAgeGroups)) {
          setManagedAgeGroups(payload.managedAgeGroups);
        }
        toast.error(payload?.error || "Não foi possível apagar a conta.");
        setDeletingAccount(false);
        return;
      }

      toast.success("Conta apagada com sucesso.");
      await supabase.auth.signOut().catch(() => null);
      clearClientCaches(queryClient);
      window.location.href = "/";
    } catch {
      toast.error("Erro de ligação ao apagar conta.");
      setDeletingAccount(false);
    }
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "account", label: "Conta", icon: <User size={16} /> },
    { id: "theme", label: "Tema", icon: <Palette size={16} /> },
    { id: "notifications", label: "Notificações", icon: <Bell size={16} /> },
  ];
  const hasManagedAgeGroups = managedAgeGroups.length > 0;
  const managedAgeGroupNames = managedAgeGroups
    .map((ageGroup) => ageGroup.name?.trim())
    .filter((value): value is string => !!value);

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Configurações</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-slate-100 p-1 rounded-xl">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Conta */}
      {activeTab === "account" && (
        <div className="space-y-4">
          {loading ? (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={24} className="animate-spin text-slate-400" />
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Perfil</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Avatar */}
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      {profile?.avatar_url ? (
                        <Image
                          src={profile.avatar_url}
                          alt={profile.full_name}
                          width={64}
                          height={64}
                          className="w-16 h-16 rounded-full object-cover border-2 border-slate-200"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-full bg-slate-200 flex items-center justify-center border-2 border-slate-200">
                          <span className="text-2xl font-bold text-slate-500">
                            {profile?.full_name?.[0]?.toUpperCase() || "U"}
                          </span>
                        </div>
                      )}
                      <label className="absolute bottom-0 right-0 bg-emerald-600 rounded-full p-1 cursor-pointer hover:bg-emerald-700 transition-colors">
                        {uploadingAvatar ? (
                          <Loader2 size={12} className="text-white animate-spin" />
                        ) : (
                          <Camera size={12} className="text-white" />
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleAvatarChange}
                          disabled={uploadingAvatar}
                        />
                      </label>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">{profile?.full_name || "—"}</p>
                      <p className="text-sm text-slate-500">
                        {ROLE_LABELS[profile?.role || ""] || profile?.role || "—"}
                      </p>
                    </div>
                  </div>

                  <form onSubmit={handleSave} className="space-y-3">
                    <div className="space-y-1.5">
                      <Label>Nome completo</Label>
                      <Input
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="O teu nome"
                        required
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label>Telefone</Label>
                      <Input
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+351 9XX XXX XXX"
                        type="tel"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label>Função</Label>
                      <Input
                        value={ROLE_LABELS[profile?.role || ""] || profile?.role || "—"}
                        disabled
                        className="bg-slate-50 text-slate-500"
                      />
                    </div>

                    {profile?.created_at && (
                      <div className="space-y-1.5">
                        <Label>Membro desde</Label>
                        <Input
                          value={format(parseISO(profile.created_at), "d 'de' MMMM 'de' yyyy", {
                            locale: pt,
                          })}
                          disabled
                          className="bg-slate-50 text-slate-500"
                        />
                      </div>
                    )}

                    <Button
                      type="submit"
                      className="w-full bg-emerald-600 hover:bg-emerald-700"
                      disabled={saving}
                    >
                      {saving ? <Loader2 size={16} className="animate-spin" /> : "Guardar alterações"}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Email de acesso</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-500 mb-3">
                    O email atual da conta é <strong>{authEmail || "—"}</strong>.
                  </p>
                  <form onSubmit={handleEmailUpdate} className="space-y-3">
                    <div className="space-y-1.5">
                      <Label>Novo email</Label>
                      <Input
                        type="email"
                        value={nextEmail}
                        onChange={(e) => setNextEmail(e.target.value)}
                        placeholder="novo@email.com"
                        required
                      />
                    </div>
                    <Button
                      type="submit"
                      variant="outline"
                      className="w-full"
                      disabled={updatingEmail}
                    >
                      {updatingEmail ? (
                        <Loader2 size={16} className="animate-spin mr-2" />
                      ) : null}
                      Alterar email
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Segurança</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-500 mb-3">
                    Recebe um email para redefinir a tua palavra-passe.
                  </p>
                  <Button
                    variant="outline"
                    onClick={handlePasswordReset}
                    disabled={sendingReset}
                    className="w-full"
                  >
                    {sendingReset ? (
                      <Loader2 size={16} className="animate-spin mr-2" />
                    ) : null}
                    Alterar palavra-passe
                  </Button>
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    {hasManagedAgeGroups ? (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                        <p className="text-sm font-medium text-amber-900">
                          A conta não pode ser apagada enquanto fores coordenador de um escalão.
                        </p>
                        <p className="mt-1 text-sm text-amber-800">
                          Primeiro apaga o escalão em <strong>Equipa</strong>. Isso remove os dados
                          do escalão, equipa técnica, jogadores, jogos, treinos, links públicos e
                          imagens associadas.
                        </p>
                        {managedAgeGroupNames.length > 0 ? (
                          <p className="mt-2 text-xs text-amber-700">
                            Escalão atual: {managedAgeGroupNames.join(", ")}
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500 mb-3">
                        Apagar a tua conta remove o acesso, perfil e ligações pessoais ainda
                        associadas à conta.
                      </p>
                    )}
                    {hasManagedAgeGroups ? (
                      <Button asChild variant="outline" className="mt-3 w-full">
                        <Link href="/team">Ir para Equipa</Link>
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setDeleteConfirmText("");
                          setDeleteModalOpen(true);
                        }}
                        className="w-full border-red-200 text-red-600 hover:bg-red-50"
                      >
                        Apagar conta
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              {profile?.is_super_coordinator && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Admin</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-slate-500">
                      Ferramentas internas movidas para dentro das configurações.
                    </p>
                    <div className="grid gap-2 md:grid-cols-4">
                      <Link
                        href="/admin"
                        className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:border-emerald-300 hover:text-emerald-700"
                      >
                        Admin Home
                      </Link>
                      <Link
                        href="/admin/beta-invites"
                        className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:border-emerald-300 hover:text-emerald-700"
                      >
                        Beta Invites
                      </Link>
                      <Link
                        href="/admin/public-links"
                        className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:border-emerald-300 hover:text-emerald-700"
                      >
                        Public Links
                      </Link>
                      <Link
                        href="/admin/audit-logs"
                        className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:border-emerald-300 hover:text-emerald-700"
                      >
                        Audit Logs
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {/* Tab: Tema */}
      {activeTab === "theme" && (
        <Card>
          <CardContent className="pt-8 pb-8 text-center">
            <Palette size={40} className="text-slate-200 mx-auto mb-3" />
            <p className="font-semibold text-slate-700">Em Aquecimento...</p>
            <p className="text-sm text-slate-400 mt-1">
              Temas personalizados em breve.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Tab: Notificações */}
      {activeTab === "notifications" && (
        <div className="space-y-4">
          <PushNotificationsControl />
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Bell size={16} className="text-slate-500" />
                Notificações internas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-500">
              <p>
                Os alertas internos continuam ativos na app e alimentam os badges de
                Alertas e Mensagens.
              </p>
              <p>
                No iPhone, o Web Push só fica disponível depois de instalares a PWA no
                ecrã principal. No Mac com Safari ou Chrome compatível, podes ativar
                diretamente no browser.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {deleteModalOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-4"
          onClick={() => {
            if (!deletingAccount) setDeleteModalOpen(false);
          }}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-md shadow-xl max-h-[calc(100dvh-1rem)] md:max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <AlertTriangle size={18} className="text-red-500" />
                Confirmar apagamento de conta
              </h3>
              <p className="text-sm text-slate-500 mt-2">
                Esta ação é irreversível. Para confirmar, escreve <strong>APAGAR</strong>.
              </p>
            </div>

            <div className="p-5 space-y-3 overflow-y-auto flex-1">
              <div className="space-y-1.5">
                <Label>Confirmação</Label>
                <Input
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="APAGAR"
                  disabled={deletingAccount}
                />
              </div>
            </div>

            <div className="border-t bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setDeleteModalOpen(false)}
                  disabled={deletingAccount}
                >
                  Cancelar
                </Button>
                <Button
                  className="flex-1 bg-red-600 hover:bg-red-700"
                  onClick={handleDeleteAccount}
                  disabled={deletingAccount}
                >
                  {deletingAccount ? (
                    <Loader2 size={16} className="animate-spin mr-2" />
                  ) : null}
                  Apagar conta
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
