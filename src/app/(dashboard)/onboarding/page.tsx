"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Plus, X, Check, ArrowRight, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { normalizeManualShortName, isValidManualShortName } from "@/lib/football/short-name";

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

const INVITE_ROLES = [
  { value: "assistant_coach", label: "Treinador Adjunto" },
  { value: "coach", label: "Treinador Principal" },
];

const CURRENT_SEASON = "2025/2026";

interface PendingInvite {
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  sending?: boolean;
  sent?: boolean;
  error?: string;
}

const TOTAL_STEPS = 3;

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 justify-center mb-8">
      {Array.from({ length: total }).map((_, i) => {
        const step = i + 1;
        const done = step < current;
        const active = step === current;
        return (
          <div key={step} className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                done
                  ? "bg-emerald-500 text-white"
                  : active
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-400"
              }`}
            >
              {done ? <Check size={14} /> : step}
            </div>
            {step < total && (
              <div
                className={`h-0.5 w-8 transition-colors ${
                  done ? "bg-emerald-400" : "bg-slate-200"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [ageGroupId, setAgeGroupId] = useState<string | null>(null);

  // Step 1: Clube
  const [clubName, setClubName] = useState("");
  const [clubShortName, setClubShortName] = useState("");

  // Step 2: Escalão
  const [ageGroupName, setAgeGroupName] = useState("");
  const [footballFormat, setFootballFormat] = useState("11");
  const [season, setSeason] = useState(CURRENT_SEASON);

  // Step 3: Staff
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [newInvite, setNewInvite] = useState<Omit<PendingInvite, "sending" | "sent" | "error">>({
    firstName: "",
    lastName: "",
    email: "",
    role: "assistant_coach",
  });
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [finishingUp, setFinishingUp] = useState(false);

  async function handleStep1(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!clubName.trim()) {
      toast.error("Introduz o nome do clube.");
      return;
    }
    if (!isValidManualShortName(clubShortName, 2, 5)) {
      toast.error("A sigla deve ter entre 2 e 5 caracteres.");
      return;
    }
    setStep(2);
  }

  async function handleStep2(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!ageGroupName.trim()) {
      toast.error("Introduz o nome do escalão.");
      return;
    }
    if (!footballFormat) {
      toast.error("Seleciona o formato de jogo.");
      return;
    }

    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        toast.error("Sessão expirada. Faz login novamente.");
        router.push("/login");
        return;
      }

      // Verify this coordinator doesn't already have an age group
      const { data: existing } = await supabase
        .from("age_groups")
        .select("id")
        .eq("coordinator_id", user.id)
        .limit(1)
        .maybeSingle();

      if (existing) {
        // Already has an age group — skip to dashboard
        router.push("/dashboard");
        return;
      }

      const normalizedShortName = normalizeManualShortName(clubShortName, 5);

      const { data: ag, error: agError } = await supabase
        .from("age_groups")
        .insert({
          coordinator_id: user.id,
          club_name: clubName.trim(),
          club_short_name: normalizedShortName || null,
          name: ageGroupName.trim(),
          football_format: footballFormat,
          season,
        })
        .select()
        .single();

      if (agError || !ag) {
        toast.error("Erro ao criar escalão. Tenta novamente.");
        return;
      }

      setAgeGroupId(ag.id);

      // Criar equipa padrão
      await supabase
        .from("teams")
        .insert({
          age_group_id: ag.id,
          name: `${clubName.trim()} ${ageGroupName.trim()}`,
          is_competitive: true,
        });

      setStep(3);
    } catch {
      toast.error("Erro de ligação. Tenta novamente.");
    } finally {
      setSaving(false);
    }
  }

  function addInviteToList(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!newInvite.firstName.trim() || !newInvite.lastName.trim() || !newInvite.email.trim()) {
      toast.error("Preenche todos os campos do convite.");
      return;
    }
    setInvites((prev) => [...prev, { ...newInvite }]);
    setNewInvite({ firstName: "", lastName: "", email: "", role: "assistant_coach" });
    setShowInviteForm(false);
  }

  function removeInvite(index: number) {
    setInvites((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleFinish(skip = false) {
    setFinishingUp(true);

    if (!skip && invites.length > 0) {
      // Send all invites
      const updated = [...invites];
      for (let i = 0; i < updated.length; i++) {
        const inv = updated[i];
        if (inv.sent) continue;

        updated[i] = { ...inv, sending: true };
        setInvites([...updated]);

        try {
          const res = await fetch("/api/invite/staff", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              firstName: inv.firstName,
              lastName: inv.lastName,
              email: inv.email,
              role: inv.role,
            }),
          });
          const data = await res.json().catch(() => ({}));

          if (res.ok && data.success) {
            updated[i] = { ...inv, sending: false, sent: true };
          } else {
            updated[i] = { ...inv, sending: false, error: data.error || "Erro ao enviar" };
          }
        } catch {
          updated[i] = { ...inv, sending: false, error: "Erro de ligação" };
        }
        setInvites([...updated]);
      }
    }

    setFinishingUp(false);
    router.push("/dashboard");
  }

  return (
    <div className="min-h-dvh bg-slate-50 flex flex-col items-center justify-start p-4 pt-8">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-6">
          <h1 className="text-3xl font-black text-slate-900">
            COACH<span className="text-emerald-500">11</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">Bem-vindo! Vamos configurar o teu escalão.</p>
        </div>

        <StepIndicator current={step} total={TOTAL_STEPS} />

        {/* ─────── STEP 1: CLUBE ─────── */}
        {step === 1 && (
          <Card>
            <CardContent className="pt-6 space-y-5">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Configura o teu clube</h2>
                <p className="text-sm text-slate-500 mt-0.5">Começa por introduzir os dados do clube.</p>
              </div>
              <form onSubmit={handleStep1} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="clubName">Nome do clube *</Label>
                  <Input
                    id="clubName"
                    value={clubName}
                    onChange={(e) => setClubName(e.target.value)}
                    placeholder="ex: Sporting de Lisboa"
                    required
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="clubShortName">Sigla (2–5 letras) *</Label>
                  <Input
                    id="clubShortName"
                    value={clubShortName}
                    onChange={(e) => setClubShortName(e.target.value.toUpperCase())}
                    placeholder="ex: SCP"
                    maxLength={5}
                    required
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full bg-emerald-600 hover:bg-emerald-700 h-12 text-base"
                >
                  Continuar <ArrowRight size={16} className="ml-2" />
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* ─────── STEP 2: ESCALÃO ─────── */}
        {step === 2 && (
          <Card>
            <CardContent className="pt-6 space-y-5">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Cria o primeiro escalão</h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  Clube: <span className="font-semibold text-slate-700">{clubName}</span>
                </p>
              </div>
              <form onSubmit={handleStep2} className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Nome do escalão *</Label>
                  <Select value={ageGroupName} onValueChange={setAgeGroupName}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleciona o escalão" />
                    </SelectTrigger>
                    <SelectContent>
                      {AGE_GROUPS.map((ag) => (
                        <SelectItem key={ag} value={ag}>{ag}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Formato de jogo *</Label>
                  <Select value={footballFormat} onValueChange={setFootballFormat}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FOOTBALL_FORMATS.map((f) => (
                        <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setStep(1)}
                    disabled={saving}
                  >
                    <ArrowLeft size={16} className="mr-2" /> Voltar
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 h-12"
                    disabled={saving}
                  >
                    {saving ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <>Continuar <ArrowRight size={16} className="ml-2" /></>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* ─────── STEP 3: STAFF ─────── */}
        {step === 3 && (
          <Card>
            <CardContent className="pt-6 space-y-5">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Convida a equipa técnica</h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  Opcional — podes convidar treinadores mais tarde.
                </p>
              </div>

              {/* Invited list */}
              {invites.length > 0 && (
                <div className="space-y-2">
                  {invites.map((inv, i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-3 p-3 rounded-xl border ${
                        inv.sent
                          ? "bg-emerald-50 border-emerald-200"
                          : inv.error
                          ? "bg-red-50 border-red-200"
                          : "bg-slate-50 border-slate-200"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800">
                          {inv.firstName} {inv.lastName}
                        </p>
                        <p className="text-xs text-slate-500">
                          {inv.email} ·{" "}
                          {INVITE_ROLES.find((r) => r.value === inv.role)?.label ?? inv.role}
                        </p>
                        {inv.error && (
                          <p className="text-xs text-red-600 mt-0.5">{inv.error}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {inv.sending && <Loader2 size={14} className="animate-spin text-slate-400" />}
                        {inv.sent && <Check size={14} className="text-emerald-600" />}
                        {!inv.sending && !inv.sent && (
                          <button
                            type="button"
                            onClick={() => removeInvite(i)}
                            className="p-1 hover:bg-red-50 rounded text-slate-300 hover:text-red-500"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add invite form */}
              {showInviteForm ? (
                <form onSubmit={addInviteToList} className="space-y-3 p-4 bg-slate-50 rounded-xl border">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Nome</Label>
                      <Input
                        value={newInvite.firstName}
                        onChange={(e) => setNewInvite((p) => ({ ...p, firstName: e.target.value }))}
                        placeholder="Nome"
                        required
                        autoFocus
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Apelido</Label>
                      <Input
                        value={newInvite.lastName}
                        onChange={(e) => setNewInvite((p) => ({ ...p, lastName: e.target.value }))}
                        placeholder="Apelido"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Email</Label>
                    <Input
                      type="email"
                      value={newInvite.email}
                      onChange={(e) => setNewInvite((p) => ({ ...p, email: e.target.value }))}
                      placeholder="email@exemplo.com"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Função</Label>
                    <Select
                      value={newInvite.role}
                      onValueChange={(v) => setNewInvite((p) => ({ ...p, role: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {INVITE_ROLES.map((r) => (
                          <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700">
                      Adicionar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setShowInviteForm(false)}
                    >
                      Cancelar
                    </Button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowInviteForm(true)}
                  className="w-full flex items-center justify-center gap-2 p-3 border-2 border-dashed border-slate-200 rounded-xl text-sm text-slate-500 hover:border-emerald-300 hover:text-emerald-600 transition-colors"
                >
                  <Plus size={16} />
                  Adicionar treinador
                </button>
              )}

              {ageGroupId && (
                <p className="text-xs text-slate-400 text-center">
                  Escalão criado com sucesso. Os convites serão enviados por email.
                </p>
              )}

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => void handleFinish(true)}
                  disabled={finishingUp}
                >
                  Saltar
                </Button>
                <Button
                  type="button"
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 h-12"
                  onClick={() => void handleFinish(false)}
                  disabled={finishingUp}
                >
                  {finishingUp ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <>
                      {invites.length > 0 ? "Enviar e começar" : "Começar"}
                      <ArrowRight size={16} className="ml-2" />
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
