"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ChevronLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import type { AdminClubFull } from "@/app/api/admin/clubs/[id]/route";

interface Props {
  clubId: string;
}

type Tier = "individual" | "standard" | "pro";

interface FormState {
  name: string;
  slug: string;
  tier: Tier;
  legal_name: string;
  nif: string;
  billing_address: string;
  billing_email: string;
  country: string;
  logo_url: string;
  pending_coordinator_name: string;
  pending_coordinator_email: string;
  pending_coordinator_phone: string;
  expected_age_groups_count: string;
  expected_players_count: string;
  expected_users_count: string;
  notes: string;
}

const COUNTRY_OPTIONS = [
  { code: "PT", label: "Portugal" },
  { code: "ES", label: "Espanha" },
  { code: "BR", label: "Brasil" },
  { code: "FR", label: "França" },
  { code: "GB", label: "Reino Unido" },
];

function clubToFormState(club: AdminClubFull): FormState {
  return {
    name: club.name,
    slug: club.slug,
    tier: club.tier,
    legal_name: club.legal_name ?? "",
    nif: club.nif ?? "",
    billing_address: club.billing_address ?? "",
    billing_email: club.billing_email ?? "",
    country: club.country,
    logo_url: club.logo_url ?? "",
    pending_coordinator_name: club.pending_coordinator_name ?? "",
    pending_coordinator_email: club.pending_coordinator_email ?? "",
    pending_coordinator_phone: club.pending_coordinator_phone ?? "",
    expected_age_groups_count:
      club.expected_age_groups_count != null
        ? String(club.expected_age_groups_count)
        : "",
    expected_players_count:
      club.expected_players_count != null
        ? String(club.expected_players_count)
        : "",
    expected_users_count:
      club.expected_users_count != null
        ? String(club.expected_users_count)
        : "",
    notes: club.notes ?? "",
  };
}

function parseOptionalInt(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return null;
  return parsed;
}

export function ClubEditForm({ clubId }: Props) {
  const router = useRouter();
  const [club, setClub] = useState<AdminClubFull | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/clubs/${clubId}`, {
          cache: "no-store",
        });
        const payload = (await res.json().catch(() => null)) as
          | { success?: boolean; club?: AdminClubFull; error?: string }
          | null;
        if (cancelled) return;
        if (!res.ok || !payload?.club) {
          setError(payload?.error || "Erro ao carregar clube.");
          return;
        }
        setClub(payload.club);
        setForm(clubToFormState(payload.club));
      } catch {
        if (!cancelled) setError("Erro de ligacao.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clubId]);

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);

    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        slug: form.slug.trim(),
        tier: form.tier,
        legal_name: form.legal_name.trim() || null,
        nif: form.nif.trim() || null,
        billing_address: form.billing_address.trim() || null,
        billing_email: form.billing_email.trim() || null,
        country: form.country.trim().toUpperCase(),
        logo_url: form.logo_url.trim() || null,
        pending_coordinator_name: form.pending_coordinator_name.trim() || null,
        pending_coordinator_email:
          form.pending_coordinator_email.trim() || null,
        pending_coordinator_phone:
          form.pending_coordinator_phone.trim() || null,
        expected_age_groups_count: parseOptionalInt(
          form.expected_age_groups_count,
        ),
        expected_players_count: parseOptionalInt(form.expected_players_count),
        expected_users_count: parseOptionalInt(form.expected_users_count),
        notes: form.notes.trim() || null,
      };

      const res = await fetch(`/api/admin/clubs/${clubId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await res.json().catch(() => null)) as
        | { success?: boolean; error?: string }
        | null;

      if (!res.ok || !payload?.success) {
        toast.error(payload?.error || "Erro a guardar.");
        setSaving(false);
        return;
      }

      toast.success("Alterações guardadas.");
      router.replace(`/admin/clubs/${clubId}/snapshot`);
      router.refresh();
    } catch {
      toast.error("Erro de ligação.");
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40 rounded" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (error || !club || !form) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
        <div className="flex items-start gap-2">
          <AlertCircle size={20} className="text-red-400 mt-0.5" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-red-900">
              {error || "Clube indisponivel."}
            </p>
            <Link
              href="/admin/clubs"
              className="mt-2 inline-block text-xs font-medium text-red-700 hover:underline"
            >
              Voltar a Clubes
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const slugChanged = form.slug !== club.slug;
  const tierChanged = form.tier !== club.tier;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/clubs/${clubId}/snapshot`}
          className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"
        >
          <ChevronLeft size={14} aria-hidden="true" />
          Voltar ao snapshot
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">
          Editar cliente — {club.name}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Edição total. Mudanças aplicam-se imediatamente. Sigla e tier têm
          implicações descritas abaixo.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Tier */}
        <section className="rounded-2xl border border-slate-100 bg-white p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900">Tier</h2>
          <div className="grid grid-cols-3 gap-2">
            {(["individual", "standard", "pro"] as Tier[]).map((t) => (
              <label
                key={t}
                className={`rounded-lg border-2 p-3 cursor-pointer text-center text-xs font-semibold ${
                  form.tier === t
                    ? t === "individual"
                      ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                      : t === "pro"
                        ? "border-purple-500 bg-purple-50 text-purple-700"
                        : "border-emerald-500 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                <input
                  type="radio"
                  name="tier"
                  className="sr-only"
                  value={t}
                  checked={form.tier === t}
                  onChange={() => patch("tier", t)}
                />
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </label>
            ))}
          </div>
          {tierChanged ? (
            <p className="text-[11px] text-amber-700">
              ⚠ Mudança de tier: {club.tier} → {form.tier}. Para Pro, lembra-te
              de provisionar DB própria + DNS manualmente.
            </p>
          ) : null}
        </section>

        {/* Dados do clube */}
        <section className="rounded-2xl border border-slate-100 bg-white p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900">Dados do clube</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Nome do clube *" value={form.name} onChange={(v) => patch("name", v)} />
            <div>
              <Label className="text-xs font-semibold text-slate-700 mb-1 block">
                Sigla *
              </Label>
              <Input
                value={form.slug}
                onChange={(e) => patch("slug", e.target.value)}
                className="font-mono"
                placeholder="CFB"
              />
              {slugChanged ? (
                <p className="mt-1 text-[11px] text-amber-700">
                  ⚠ Mudança de sigla — referências antigas (badges, etiquetas) podem ficar desactualizadas.
                </p>
              ) : null}
            </div>
            <Field
              label="Razão social"
              value={form.legal_name}
              onChange={(v) => patch("legal_name", v)}
            />
            <Field label="NIF" value={form.nif} onChange={(v) => patch("nif", v)} />
            <div className="md:col-span-2">
              <Field
                label="Morada de faturação"
                value={form.billing_address}
                onChange={(v) => patch("billing_address", v)}
              />
            </div>
            <Field
              label="Email de faturação"
              type="email"
              value={form.billing_email}
              onChange={(v) => patch("billing_email", v)}
            />
            <div>
              <Label className="text-xs font-semibold text-slate-700 mb-1 block">
                País
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
                label="Logo URL"
                type="url"
                value={form.logo_url}
                onChange={(v) => patch("logo_url", v)}
              />
            </div>
          </div>
        </section>

        {/* Coordenador pendente */}
        <section className="rounded-2xl border border-slate-100 bg-white p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Coordenador pendente
            </h2>
            <p className="mt-1 text-[11px] text-slate-500">
              Editar não afecta convites já enviados. Para reenviar com email
              corrigido, salva aqui e depois usa &quot;Reenviar convite&quot; no snapshot.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <Field
              label="Nome"
              value={form.pending_coordinator_name}
              onChange={(v) => patch("pending_coordinator_name", v)}
            />
            <Field
              label="Email"
              type="email"
              value={form.pending_coordinator_email}
              onChange={(v) => patch("pending_coordinator_email", v)}
            />
            <Field
              label="Telefone"
              type="tel"
              value={form.pending_coordinator_phone}
              onChange={(v) => patch("pending_coordinator_phone", v)}
            />
          </div>
        </section>

        {/* Estimativas + notas */}
        <section className="rounded-2xl border border-slate-100 bg-white p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900">
            Estimativas e notas internas
          </h2>
          <div className="grid md:grid-cols-3 gap-4">
            <Field
              label="Escalões previstos"
              type="number"
              value={form.expected_age_groups_count}
              onChange={(v) => patch("expected_age_groups_count", v)}
            />
            <Field
              label="Atletas previstos"
              type="number"
              value={form.expected_players_count}
              onChange={(v) => patch("expected_players_count", v)}
            />
            <Field
              label="Utilizadores previstos"
              type="number"
              value={form.expected_users_count}
              onChange={(v) => patch("expected_users_count", v)}
            />
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-700 mb-1 block">
              Notas internas
            </Label>
            <textarea
              value={form.notes}
              onChange={(e) => patch("notes", e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </section>

        <div className="flex justify-between gap-3">
          <Link href={`/admin/clubs/${clubId}/snapshot`}>
            <Button type="button" variant="outline">
              Cancelar
            </Button>
          </Link>
          <Button
            type="submit"
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {saving ? (
              <>
                <Loader2 size={14} className="mr-1.5 animate-spin" />
                A guardar...
              </>
            ) : (
              "Guardar alterações"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
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
      />
    </div>
  );
}
