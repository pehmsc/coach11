"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, User, Palette, Bell, Camera } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { pt } from "date-fns/locale";
import type { Profile } from "@/types/database";

type Tab = "account" | "theme" | "notifications";

const ROLE_LABELS: Record<string, string> = {
  coordinator: "Coordenador",
  coach: "Treinador",
  player: "Jogador",
  parent: "Encarregado",
};

export default function SettingsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [activeTab, setActiveTab] = useState<Tab>("account");

  // Profile state
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Edit form
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");

  // Password
  const [sendingReset, setSendingReset] = useState(false);

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
      setLoading(false);
      return;
    }

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

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "account", label: "Conta", icon: <User size={16} /> },
    { id: "theme", label: "Tema", icon: <Palette size={16} /> },
    { id: "notifications", label: "Notificações", icon: <Bell size={16} /> },
  ];

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
                        <img
                          src={profile.avatar_url}
                          alt={profile.full_name}
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
                </CardContent>
              </Card>
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
        <Card>
          <CardContent className="pt-8 pb-8 text-center">
            <Bell size={40} className="text-slate-200 mx-auto mb-3" />
            <p className="font-semibold text-slate-700">Em Aquecimento...</p>
            <p className="text-sm text-slate-400 mt-1">
              Configurações de notificações em breve.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
