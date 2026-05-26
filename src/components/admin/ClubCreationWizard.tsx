"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, Building2, ChevronLeft, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Tier = "standard" | "pro";

const TOTAL_STEPS = 5;

interface FormState {
  tier: Tier;
  name: string;
  slug: string;
  legal_name: string;
  nif: string;
  billing_address: string;
  billing_email: string;
  country: string;
  logo_url: string;
  coordinator_name: string;
  coordinator_email: string;
  coordinator_phone: string;
  expected_age_groups_count: string;
  expected_players_count: string;
  expected_users_count: string;
  operator_notes: string;
}

const EMPTY_FORM: FormState = {
  tier: "standard",
  name: "",
  slug: "",
  legal_name: "",
  nif: "",
  billing_address: "",
  billing_email: "",
  country: "PT",
  logo_url: "",
  coordinator_name: "",
  coordinator_email: "",
  coordinator_phone: "",
  expected_age_groups_count: "",
  expected_players_count: "",
  expected_users_count: "",
  operator_notes: "",
};

const COUNTRY_OPTIONS = [
  { code: "PT", label: "Portugal" },
  { code: "ES", label: "Espanha" },
  { code: "BR", label: "Brasil" },
  { code: "FR", label: "França" },
  { code: "GB", label: "Reino Unido" },
];

function StepBadge({
  index,
  current,
  done,
  label,
}: {
  index: number;
  current: boolean;
  done: boolean;
  label: string;
}) {
  const colorClasses = current
    ? "bg-emerald-600 text-white"
    : done
      ? "bg-emerald-100 text-emerald-700"
      : "bg-slate-200 text-slate-500";
  return (
    <li className="flex items-center gap-1.5">
      <span
        className={`inline-flex size-6 items-center justify-center rounded-full text-[11px] font-bold ${colorClasses}`}
      >
        {index}
      </span>
      <span
        className={`text-xs ${current ? "font-semibold text-slate-900" : done ? "text-slate-700" : "text-slate-500"}`}
      >
        {label}
      </span>
    </li>
  );
}

export function ClubCreationWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError(null);
  }

  const canAdvanceStep = useMemo(() => {
    if (step === 1) return form.tier === "standard" || form.tier === "pro";
    if (step === 2) {
      const slugOk = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(form.slug);
      return (
        form.name.trim().length >= 2 &&
        slugOk &&
        form.nif.trim().length >= 3 &&
        form.billing_address.trim().length >= 3 &&
        form.country.trim().length === 2
      );
    }
    if (step === 3) {
      return (
        form.coordinator_name.trim().length >= 2 &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(form.coordinator_email.trim()) &&
        form.coordinator_phone.trim().length >= 3
      );
    }
    return true;
  }, [step, form]);

  function next() {
    if (!canAdvanceStep) return;
    setStep((s) => Math.min(TOTAL_STEPS, s + 1));
  }
  function prev() {
    setStep((s) => Math.max(1, s - 1));
    setError(null);
  }

  function parseOptionalInt(value: string): number | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(parsed) || parsed < 1) return null;
    return parsed;
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        tier: form.tier,
        name: form.name.trim(),
        slug: form.slug.trim(),
        legal_name: form.legal_name.trim() || null,
        nif: form.nif.trim(),
        billing_address: form.billing_address.trim(),
        billing_email: form.billing_email.trim() || null,
        country: form.country.trim().toUpperCase(),
        logo_url: form.logo_url.trim() || null,
        coordinator_name: form.coordinator_name.trim(),
        coordinator_email: form.coordinator_email.trim(),
        coordinator_phone: form.coordinator_phone.trim(),
        expected_age_groups_count: parseOptionalInt(form.expected_age_groups_count),
        expected_players_count: parseOptionalInt(form.expected_players_count),
        expected_users_count: parseOptionalInt(form.expected_users_count),
        operator_notes: form.operator_notes.trim() || null,
      };

      const res = await fetch("/api/admin/clubs/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = (await res.json().catch(() => null)) as
        | { success?: boolean; club?: { id: string }; error?: string }
        | null;

      if (!res.ok || !json?.club?.id) {
        setError(json?.error || "Nao foi possivel criar o cliente.");
        setSubmitting(false);
        return;
      }

      router.replace(`/admin/clubs/${json.club.id}/snapshot`);
      router.refresh();
    } catch {
      setError("Erro de ligacao. Tenta novamente.");
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/clubs"
          className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"
        >
          <ChevronLeft size={14} aria-hidden="true" />
          Voltar a Clubes
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">Criar novo cliente</h1>
        <p className="mt-1 text-sm text-slate-500">
          Onboarding manual de clube sales-led. Apos criar, vais para o snapshot
          do cliente onde poderas enviar o convite ao coordenador.
        </p>
      </div>

      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <StepBadge index={1} current={step === 1} done={step > 1} label="Tier" />
        <span className="text-slate-300">→</span>
        <StepBadge index={2} current={step === 2} done={step > 2} label="Clube" />
        <span className="text-slate-300">→</span>
        <StepBadge index={3} current={step === 3} done={step > 3} label="Coordenador" />
        <span className="text-slate-300">→</span>
        <StepBadge index={4} current={step === 4} done={step > 4} label="Estimativas" />
        <span className="text-slate-300">→</span>
        <StepBadge index={5} current={step === 5} done={false} label="Confirmar" />
      </ol>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 flex items-start gap-2">
          <AlertCircle size={16} className="mt-0.5 text-red-500 flex-shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      {/* ============== STEP 1 — TIER ============== */}
      {step === 1 ? (
        <section className="rounded-2xl border border-slate-100 bg-white p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Que tipo de cliente?</h2>
            <p className="mt-1 text-sm text-slate-500">
              Individual é criado via website self-service — não está no backoffice.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <TierCard
              tier="standard"
              selected={form.tier === "standard"}
              onSelect={() => patch("tier", "standard")}
              title="Clube · Standard"
              subtitle="Clube pequeno"
              description="≤30 staff, DB partilhada."
              price="€50-100/mês"
              accent="emerald"
            />
            <TierCard
              tier="pro"
              selected={form.tier === "pro"}
              onSelect={() => patch("tier", "pro")}
              title="Clube · Pro"
              subtitle="Clube grande"
              description="DB própria + domínio próprio. Provisioning manual depois."
              price="€200-500/mês"
              accent="purple"
            />
          </div>

          <FooterButtons
            onPrev={null}
            onNext={next}
            nextDisabled={!canAdvanceStep}
          />
        </section>
      ) : null}

      {/* ============== STEP 2 — DADOS DO CLUBE ============== */}
      {step === 2 ? (
        <section className="rounded-2xl border border-slate-100 bg-white p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Dados do clube</h2>
            <p className="mt-1 text-sm text-slate-500">
              Sigla introduzida manualmente. Verificamos unicidade ao submeter.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Field
              label="Nome do clube *"
              value={form.name}
              onChange={(v) => patch("name", v)}
              placeholder="CF Os Belenenses"
            />
            <Field
              label="Sigla * (letras, dígitos, hífens — ex: CFB)"
              value={form.slug}
              onChange={(v) => patch("slug", v)}
              placeholder="CFB"
              mono
            />
            <Field
              label="Razão social (opcional, se diferente)"
              value={form.legal_name}
              onChange={(v) => patch("legal_name", v)}
              placeholder="Clube de Futebol Os Belenenses"
            />
            <Field
              label="NIF *"
              value={form.nif}
              onChange={(v) => patch("nif", v)}
              placeholder="500000000"
            />
            <div className="md:col-span-2">
              <Field
                label="Morada de faturação *"
                value={form.billing_address}
                onChange={(v) => patch("billing_address", v)}
                placeholder="Rua X, 123, 1300-000 Lisboa"
              />
            </div>
            <Field
              label="Email de faturação (opcional)"
              type="email"
              value={form.billing_email}
              onChange={(v) => patch("billing_email", v)}
              placeholder="financeiro@clube.pt"
            />
            <div>
              <Label className="text-xs font-semibold text-slate-700 mb-1 block">
                País *
              </Label>
              <select
                value={form.country}
                onChange={(e) => patch("country", e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {COUNTRY_OPTIONS.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label} ({c.code})
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <Field
                label="Logo URL (opcional)"
                type="url"
                value={form.logo_url}
                onChange={(v) => patch("logo_url", v)}
                placeholder="https://..."
              />
            </div>
          </div>

          <FooterButtons onPrev={prev} onNext={next} nextDisabled={!canAdvanceStep} />
        </section>
      ) : null}

      {/* ============== STEP 3 — COORDENADOR ============== */}
      {step === 3 ? (
        <section className="rounded-2xl border border-slate-100 bg-white p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Coordenador / responsável
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Dados ficam guardados nas notas internas do clube. O convite é
              enviado <strong>depois</strong>, manualmente, a partir do snapshot
              do cliente.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Field
              label="Nome *"
              value={form.coordinator_name}
              onChange={(v) => patch("coordinator_name", v)}
              placeholder="João Mendes"
            />
            <Field
              label="Email *"
              type="email"
              value={form.coordinator_email}
              onChange={(v) => patch("coordinator_email", v)}
              placeholder="jmendes@clube.pt"
            />
            <div className="md:col-span-2">
              <Field
                label="Telefone *"
                type="tel"
                value={form.coordinator_phone}
                onChange={(v) => patch("coordinator_phone", v)}
                placeholder="+351 ..."
              />
            </div>
          </div>

          <FooterButtons onPrev={prev} onNext={next} nextDisabled={!canAdvanceStep} />
        </section>
      ) : null}

      {/* ============== STEP 4 — ESTIMATIVAS ============== */}
      {step === 4 ? (
        <section className="rounded-2xl border border-slate-100 bg-white p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Estimativas</h2>
            <p className="mt-1 text-sm text-slate-500">
              Tudo opcional. Informativo para sizing e pricing.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <Field
              label="Nº escalões previstos"
              type="number"
              value={form.expected_age_groups_count}
              onChange={(v) => patch("expected_age_groups_count", v)}
              placeholder="12"
            />
            <Field
              label="Nº atletas previstos"
              type="number"
              value={form.expected_players_count}
              onChange={(v) => patch("expected_players_count", v)}
              placeholder="450"
            />
            <Field
              label="Nº utilizadores previstos"
              type="number"
              value={form.expected_users_count}
              onChange={(v) => patch("expected_users_count", v)}
              placeholder="140"
            />
          </div>

          <div>
            <Label className="text-xs font-semibold text-slate-700 mb-1 block">
              Notas internas (opcional)
            </Label>
            <textarea
              value={form.operator_notes}
              onChange={(e) => patch("operator_notes", e.target.value)}
              placeholder="Contexto sobre o cliente, condições especiais, próximos passos..."
              rows={3}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <p className="mt-1 text-[10px] text-slate-500">
              Estas notas só ficam visíveis no backoffice (não para o
              coordenador do clube).
            </p>
          </div>

          <FooterButtons onPrev={prev} onNext={next} nextDisabled={false} />
        </section>
      ) : null}

      {/* ============== STEP 5 — CONFIRMAR ============== */}
      {step === 5 ? (
        <section className="rounded-2xl border border-slate-100 bg-white p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Confirmar</h2>
            <p className="mt-1 text-sm text-slate-500">
              Vais criar 1 clube. O coordenador NÃO recebe email automaticamente
              — convite manual a partir do snapshot.
            </p>
          </div>

          <ConfirmReview form={form} />

          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {form.tier === "pro" ? (
              <p>
                <strong>Clube Pro:</strong> após criar, ainda terás de
                provisionar DB própria + DNS + subdomain manualmente. Wizard só
                cria entry na DB partilhada.
              </p>
            ) : (
              <p>
                <strong>Clube Standard:</strong> entry criado na DB partilhada.
                Acesso via coach11.app, white-label via subdirectório.
              </p>
            )}
          </div>

          <FooterButtons
            onPrev={prev}
            onNext={null}
            customAction={
              <Button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={submitting}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {submitting ? (
                  <>
                    <Loader2 size={14} className="mr-1.5 animate-spin" />
                    A criar...
                  </>
                ) : (
                  "Criar cliente"
                )}
              </Button>
            }
          />
        </section>
      ) : null}
    </div>
  );
}

function TierCard({
  selected,
  onSelect,
  title,
  subtitle,
  description,
  price,
  accent,
}: {
  tier: Tier;
  selected: boolean;
  onSelect: () => void;
  title: string;
  subtitle: string;
  description: string;
  price: string;
  accent: "emerald" | "purple";
}) {
  const accentClasses = selected
    ? accent === "emerald"
      ? "border-emerald-500 bg-emerald-50/50 ring-2 ring-emerald-100"
      : "border-purple-500 bg-purple-50/50 ring-2 ring-purple-100"
    : "border-slate-200 bg-white hover:border-slate-300";

  const titleColor = accent === "emerald" ? "text-emerald-700" : "text-purple-700";
  const priceColor = accent === "emerald" ? "text-emerald-700" : "text-purple-700";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`text-left rounded-xl border-2 p-4 transition-colors ${accentClasses}`}
    >
      <p className={`text-xs font-bold uppercase ${titleColor}`}>{title}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{subtitle}</p>
      <p className="mt-1 text-xs text-slate-600">{description}</p>
      <p className={`mt-2 text-[11px] font-semibold ${priceColor}`}>{price}</p>
    </button>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  mono = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  mono?: boolean;
}) {
  return (
    <div>
      <Label className="text-xs font-semibold text-slate-700 mb-1 block">
        {label}
      </Label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={mono ? "font-mono" : undefined}
      />
    </div>
  );
}

function FooterButtons({
  onPrev,
  onNext,
  nextDisabled,
  customAction,
}: {
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  nextDisabled?: boolean;
  customAction?: React.ReactNode;
}) {
  return (
    <div className="flex justify-between pt-2">
      {onPrev ? (
        <Button type="button" variant="outline" onClick={onPrev}>
          ← Anterior
        </Button>
      ) : (
        <span />
      )}
      {customAction ? (
        customAction
      ) : onNext ? (
        <Button
          type="button"
          onClick={onNext}
          disabled={nextDisabled}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          Próximo →
        </Button>
      ) : (
        <span />
      )}
    </div>
  );
}

function ConfirmReview({ form }: { form: FormState }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-3 text-sm">
      <Row label="Tier" value={form.tier === "pro" ? "Clube · Pro" : "Clube · Standard"} />
      <Row label="Nome" value={form.name} />
      <Row label="Sigla" value={<span className="font-mono">{form.slug}</span>} />
      {form.legal_name ? <Row label="Razão social" value={form.legal_name} /> : null}
      <Row label="NIF" value={form.nif} />
      <Row label="País" value={form.country} />
      <Row label="Morada faturação" value={form.billing_address} />
      {form.billing_email ? <Row label="Email faturação" value={form.billing_email} /> : null}
      {form.logo_url ? (
        <Row
          label="Logo"
          value={
            <span className="inline-flex items-center gap-1">
              <Building2 size={12} aria-hidden="true" />
              <span className="truncate max-w-[16rem] inline-block align-bottom">
                {form.logo_url}
              </span>
            </span>
          }
        />
      ) : null}
      <hr className="border-slate-200" />
      <Row label="Coordenador" value={`${form.coordinator_name} · ${form.coordinator_email} · ${form.coordinator_phone}`} />
      {form.expected_age_groups_count ||
      form.expected_players_count ||
      form.expected_users_count ? (
        <>
          <hr className="border-slate-200" />
          {form.expected_age_groups_count ? (
            <Row label="Escalões previstos" value={form.expected_age_groups_count} />
          ) : null}
          {form.expected_players_count ? (
            <Row label="Atletas previstos" value={form.expected_players_count} />
          ) : null}
          {form.expected_users_count ? (
            <Row label="Utilizadores previstos" value={form.expected_users_count} />
          ) : null}
        </>
      ) : null}
      {form.operator_notes ? (
        <>
          <hr className="border-slate-200" />
          <div>
            <p className="text-xs text-slate-500 mb-1">Notas internas</p>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{form.operator_notes}</p>
          </div>
        </>
      ) : null}
      <hr className="border-slate-200" />
      <div className="flex items-center gap-2 text-xs text-slate-600">
        <ShieldCheck size={14} className="text-slate-500" aria-hidden="true" />
        <span>
          Convite ao coordenador: <strong>não envia agora</strong> — manual depois.
        </span>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-xs text-slate-500 flex-shrink-0">{label}</span>
      <span className="text-sm text-slate-900 text-right">{value}</span>
    </div>
  );
}
