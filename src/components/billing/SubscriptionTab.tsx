"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  blockedRedirectPath,
  daysUntilTrialEnd,
  hasActiveAccess,
  isReadOnly,
  subscriptionLabel,
  type SubscriptionLike,
  type SubscriptionStatus,
} from "@/lib/stripe/subscription-status";
import { formatShortDate } from "@/lib/billing/invoice-helpers";

interface ClubBilling {
  plan_type: "individual" | "club";
  subscription_status: SubscriptionStatus | null;
  trial_ends_at: string | null;
  subscription_current_period_end: string | null;
  subscription_cancel_at_period_end: boolean;
  stripe_customer_id: string | null;
}

export function SubscriptionTab() {
  const [club, setClub] = useState<ClubBilling | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<"portal" | "checkout" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/me", { cache: "no-store" });
      const json = (await res.json()) as
        | { club: ClubBilling }
        | { error: string };
      if (!res.ok || !("club" in json)) {
        throw new Error("error" in json ? json.error : "Erro a carregar.");
      }
      setClub(json.club);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro a carregar subscrição.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function openPortal() {
    setOpening("portal");
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        throw new Error(json.error || "Erro a abrir portal.");
      }
      window.location.href = json.url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro a abrir portal.");
      setOpening(null);
    }
  }

  function startCheckout() {
    setOpening("checkout");
    window.location.href = "/billing/start";
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="size-6 animate-spin text-emerald-500" />
      </div>
    );
  }

  if (error || !club) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
        <AlertCircle size={16} className="mt-0.5 shrink-0" />
        <span>{error ?? "Sem dados."}</span>
      </div>
    );
  }

  if (club.plan_type === "club") {
    return (
      <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">Plano · Clube</h2>
        <p className="text-sm text-slate-600">
          Este clube tem plano sales-led, gerido manualmente pela equipa
          Coach11. A facturação está disponível na tab{" "}
          <strong>Facturação</strong>.
        </p>
        <p className="text-xs text-slate-500">
          Para mudar de plano ou alterar condições:{" "}
          <a
            href="mailto:billing@coach11.app"
            className="text-emerald-600 hover:underline"
          >
            billing@coach11.app
          </a>
          .
        </p>
      </div>
    );
  }

  // Plano Individual
  const label = subscriptionLabel(club);
  const days = daysUntilTrialEnd(club);
  const status = club.subscription_status;
  const noSubscription = status === null;
  const trialing = status === "trialing";
  const active = status === "active";
  const pastDue = status === "past_due";
  const canceled = status === "canceled";
  const readOnly = isReadOnly(club);
  const accessOk = hasActiveAccess(club);

  const stateBadgeClass = trialing
    ? "bg-emerald-100 text-emerald-700"
    : active
      ? "bg-emerald-100 text-emerald-700"
      : pastDue
        ? "bg-rose-100 text-rose-700"
        : canceled
          ? "bg-slate-200 text-slate-700"
          : "bg-slate-100 text-slate-600";

  return (
    <div className="space-y-4">
      {/* Header card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Plano Individual{" "}
              <span
                className={`ml-1 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${stateBadgeClass}`}
              >
                {label}
              </span>
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              €7,99/mês IVA incluído · 1 equipa
            </p>
          </div>

          {trialing && days != null ? (
            <div className="text-right">
              <p className="text-xs text-slate-500">Trial termina em</p>
              <p className="text-xl font-bold text-emerald-600">
                {days} {days === 1 ? "dia" : "dias"}
              </p>
              {club.trial_ends_at ? (
                <p className="text-xs text-slate-400">
                  {formatShortDate(club.trial_ends_at.slice(0, 10))}
                </p>
              ) : null}
            </div>
          ) : null}

          {active && club.subscription_current_period_end ? (
            <div className="text-right">
              <p className="text-xs text-slate-500">Próxima factura</p>
              <p className="text-base font-bold text-slate-900">
                {formatShortDate(
                  club.subscription_current_period_end.slice(0, 10),
                )}
              </p>
            </div>
          ) : null}
        </div>

        {/* Alerts */}
        {pastDue ? (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            <p className="font-semibold">Pagamento da última factura falhou.</p>
            <p className="mt-1 text-xs">
              {readOnly
                ? "Acesso de escrita suspenso. Actualiza o método de pagamento no Stripe para retomar."
                : "Stripe vai tentar novamente nos próximos dias. Actualiza o método de pagamento para evitar suspensão."}
            </p>
          </div>
        ) : null}

        {canceled && club.subscription_current_period_end ? (
          <div className="mt-4 rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm text-slate-700">
            <p className="font-semibold">Subscrição cancelada.</p>
            <p className="mt-1 text-xs">
              {accessOk
                ? `Continuas com acesso até ${formatShortDate(
                    club.subscription_current_period_end.slice(0, 10),
                  )}. Depois disso o plano será suspenso.`
                : "Acesso terminado. Reactiva para voltar a usar o Coach11."}
            </p>
          </div>
        ) : null}

        {active && club.subscription_cancel_at_period_end ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <p className="font-semibold">Cancelamento agendado.</p>
            <p className="mt-1 text-xs">
              A subscrição termina automaticamente em{" "}
              {club.subscription_current_period_end
                ? formatShortDate(
                    club.subscription_current_period_end.slice(0, 10),
                  )
                : "—"}
              . Podes reactivar no portal Stripe.
            </p>
          </div>
        ) : null}

        {/* Actions */}
        <div className="mt-5 flex flex-wrap gap-2">
          {noSubscription || canceled ? (
            <Button
              type="button"
              onClick={startCheckout}
              disabled={opening === "checkout"}
              className="bg-emerald-600 hover:bg-emerald-500"
            >
              {opening === "checkout" ? (
                <Loader2 size={14} className="mr-1.5 animate-spin" />
              ) : null}
              {noSubscription ? "Subscrever · começar trial" : "Reactivar"}
            </Button>
          ) : null}

          {club.stripe_customer_id ? (
            <Button
              type="button"
              variant="outline"
              onClick={openPortal}
              disabled={opening === "portal"}
            >
              {opening === "portal" ? (
                <Loader2 size={14} className="mr-1.5 animate-spin" />
              ) : (
                <ExternalLink size={14} className="mr-1.5" />
              )}
              Gerir no Stripe
            </Button>
          ) : null}
        </div>

        <p className="mt-4 text-xs text-slate-400">
          Pagamentos processados via Stripe (Irlanda). Recibos enviados
          automaticamente para o teu email. Para questões:{" "}
          <a
            href="mailto:billing@coach11.app"
            className="text-emerald-600 hover:underline"
          >
            billing@coach11.app
          </a>
          .
        </p>
      </div>
    </div>
  );
}
