"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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
import { Plus, X, Mail, Check, Copy, Users } from "lucide-react";

const FOOTBALL_FORMATS = [
  { value: "5", label: "Futebol 5" },
  { value: "7", label: "Futebol 7" },
  { value: "9", label: "Futebol 9" },
  { value: "11", label: "Futebol 11" },
];

const AGE_GROUPS = [
  "Sub-7",
  "Sub-8",
  "Sub-9",
  "Sub-10",
  "Sub-11",
  "Sub-12",
  "Sub-13",
  "Sub-14",
  "Sub-15",
  "Sub-17",
  "Sub-19",
  "Sénior",
];

const ROLE_OPTIONS = [
  { value: "coach", label: "Treinador Principal" },
  { value: "assistant_coach", label: "Treinador Adjunto" },
  { value: "coordinator", label: "Coordenador" },
];

const ROLE_LABELS: Record<string, string> = {
  coach: "Treinador Principal",
  assistant_coach: "Treinador Adjunto",
  coordinator: "Coordenador",
};

interface StaffInvite {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  invite_code: string;
  accepted_at?: string;
  invite_sent_at: string;
}

const EMPTY_STAFF_FORM = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  role: "assistant_coach",
};

export default function TeamSetupPage() {
  const router = useRouter();
  const supabase = createClient();

  // Escalão
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingAgeGroup, setExistingAgeGroup] = useState<any>(null);
  const [clubName, setClubName] = useState("");
  const [ageGroupName, setAgeGroupName] = useState("");
  const [footballFormat, setFootballFormat] = useState("");
  const [season, setSeason] = useState("2024/2025");
  const [isEditing, setIsEditing] = useState(false);

  // Treinadores convidados
  const [staffInvites, setStaffInvites] = useState<StaffInvite[]>([]);
  const [showStaffForm, setShowStaffForm] = useState(false);
  const [staffForm, setStaffForm] = useState(EMPTY_STAFF_FORM);
  const [sendingInvite, setSendingInvite] = useState(false);
  const [inviteResult, setInviteResult] = useState<{
    code: string;
    emailSent: boolean;
    name: string;
  } | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: ag } = await supabase
      .from("age_groups")
      .select("*")
      .eq("coordinator_id", user.id)
      .single();

    if (ag) {
      setExistingAgeGroup(ag);
      setClubName(ag.club_name);
      setAgeGroupName(ag.name);
      setFootballFormat(ag.football_format);
      setSeason(ag.season);

      // Buscar convites de treinadores
      const { data: invites } = await supabase
        .from("staff_invites")
        .select("*")
        .eq("age_group_id", ag.id)
        .order("created_at", { ascending: false });

      setStaffInvites(invites || []);
    }

    setLoading(false);
  }

  async function handleSaveSetup(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    if (existingAgeGroup) {
      const { error } = await supabase
        .from("age_groups")
        .update({
          club_name: clubName,
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
      setExistingAgeGroup((prev: any) => ({
        ...prev,
        club_name: clubName,
        name: ageGroupName,
      }));
    } else {
      const { data, error } = await supabase
        .from("age_groups")
        .insert({
          coordinator_id: user.id,
          club_name: clubName,
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
    }

    setSaved(true);
    setIsEditing(false);
    setSaving(false);
    setTimeout(() => setSaved(false), 3000);
  }

  async function handleSendStaffInvite(e: React.FormEvent) {
    e.preventDefault();
    setSendingInvite(true);
    setInviteResult(null);

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
      setStaffForm(EMPTY_STAFF_FORM);
      loadData(); // Recarrega a lista
    } else {
      setError(data.error || "Erro ao enviar convite");
    }

    setSendingInvite(false);
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
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

      {/* ── SECÇÃO 1: ESCALÃO ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Escalão</CardTitle>
              {existingAgeGroup && !isEditing && (
                <CardDescription className="mt-1">
                  {existingAgeGroup.club_name} · {existingAgeGroup.name} ·
                  Futebol {existingAgeGroup.football_format} ·{" "}
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
            {error && (
              <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg mb-4 border border-red-200">
                {error}
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
                  placeholder="2024/2025"
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
          </CardContent>
        )}
      </Card>

      {/* ── SECÇÃO 2: EQUIPA TÉCNICA ── */}
      {existingAgeGroup && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users size={16} /> Equipa Técnica
                </CardTitle>
                <CardDescription className="mt-1">
                  Convida treinadores para acederem à plataforma
                </CardDescription>
              </div>
              {!showStaffForm && (
                <Button
                  size="sm"
                  onClick={() => {
                    setShowStaffForm(true);
                    setInviteResult(null);
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  <Plus size={14} className="mr-1" /> Convidar
                </Button>
              )}
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Formulário de convite */}
            {showStaffForm && (
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

                {/* Resultado do convite */}
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

            {/* Lista de convites enviados */}
            {staffInvites.length > 0 ? (
              <div className="space-y-2">
                {staffInvites.map((invite) => (
                  <div
                    key={invite.id}
                    className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100"
                  >
                    <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-slate-500">
                        {invite.first_name[0]}
                        {invite.last_name[0]}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800 text-sm truncate">
                        {invite.first_name} {invite.last_name}
                      </p>
                      <p className="text-xs text-slate-400 truncate">
                        {ROLE_LABELS[invite.role]} · {invite.email}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {invite.accepted_at ? (
                        <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                          Activo
                        </span>
                      ) : (
                        <>
                          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                            Pendente
                          </span>
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
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              !showStaffForm && (
                <p className="text-sm text-slate-400 text-center py-4">
                  Ainda não convidaste nenhum treinador.
                </p>
              )
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
