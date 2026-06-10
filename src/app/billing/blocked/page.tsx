import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasActiveAccess } from "@/lib/stripe/subscription-status";
import {
  formatPurgeDateLisbon,
  purgeDaysLeft,
} from "@/components/billing/PurgeCountdownBanner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /billing/blocked — pagina apresentada quando o utilizador tem subscricao
 * em estado canceled/unpaid/past_due (fora do grace) e tenta usar a app.
 *
 * Acoes oferecidas:
 * - Reactivar subscricao -> /billing/start (cria novo checkout)
 * - Gerir pagamento     -> /api/billing/portal (Stripe Customer Portal)
 * - Exportar dados      -> futuro (RGPD)
 */
export default async function BillingBlockedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/billing/blocked");

  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("club_memberships")
    .select("club_id")
    .eq("profile_id", user.id)
    .limit(1)
    .maybeSingle();

  const { data: club } = membership?.club_id
    ? await admin
        .from("clubs")
        .select(
          "id, name, plan_type, subscription_status, subscription_current_period_end, trial_ends_at, subscription_cancel_at_period_end, data_purge_scheduled_at",
        )
        .eq("id", membership.club_id)
        .maybeSingle()
    : { data: null };

  // Se tem acesso, nao devia estar aqui
  if (club && hasActiveAccess({ ...club })) {
    redirect("/dashboard");
  }

  const status = club?.subscription_status ?? null;
  const periodEnd = club?.subscription_current_period_end ?? null;
  const purgeScheduledAt =
    typeof club?.data_purge_scheduled_at === "string"
      ? club.data_purge_scheduled_at
      : null;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-md rounded-2xl border border-amber-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-bold text-slate-900">
          Subscrição inactiva
        </h1>

        <Description status={status} periodEnd={periodEnd} />

        {purgeScheduledAt && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3"
          >
            <p className="text-sm font-semibold text-red-700">
              Os teus dados serão eliminados a{" "}
              {formatPurgeDateLisbon(purgeScheduledAt)}
              {purgeDaysLeft(purgeScheduledAt, new Date()) > 0
                ? ` — faltam ${purgeDaysLeft(purgeScheduledAt, new Date())} dias`
                : ""}
              .
            </p>
            <p className="mt-1 text-xs text-red-600">
              Reactiva a subscrição antes dessa data para manter plantel,
              treinos, jogos e estatísticas. Depois, a eliminação é
              definitiva (RGPD).
            </p>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-2">
          <Link
            href="/billing/start"
            className="rounded-xl bg-emerald-500 px-6 py-2.5 text-center text-sm font-semibold text-white hover:bg-emerald-400"
          >
            Reactivar subscrição
          </Link>
          <form action="/api/billing/portal" method="POST">
            <button
              type="submit"
              className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm hover:bg-slate-50"
            >
              Gerir pagamento no Stripe
            </button>
          </form>
        </div>

        <p className="mt-4 text-xs text-slate-400">
          Os teus dados ficam guardados durante 60 dias após o fim da
          subscrição. Para questões: <a className="text-emerald-600" href="mailto:billing@coach11.app">billing@coach11.app</a>.
        </p>
      </div>
    </div>
  );
}

function Description({
  status,
  periodEnd,
}: {
  status: string | null;
  periodEnd: string | null;
}) {
  const periodEndLabel = periodEnd
    ? new Intl.DateTimeFormat("pt-PT", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(new Date(periodEnd))
    : null;

  if (status === "canceled") {
    return (
      <p className="mt-2 text-sm text-slate-600">
        A tua subscrição foi cancelada
        {periodEndLabel ? ` em ${periodEndLabel}` : ""}. Reactiva-a para
        voltar a usar o Coach11.
      </p>
    );
  }
  if (status === "past_due" || status === "unpaid") {
    return (
      <p className="mt-2 text-sm text-slate-600">
        O pagamento da tua última factura não foi recebido. Actualiza o
        método de pagamento no portal Stripe para retomar o acesso.
      </p>
    );
  }
  if (status === "incomplete" || status === "incomplete_expired") {
    return (
      <p className="mt-2 text-sm text-slate-600">
        O checkout não foi completado. Tenta de novo — não há cobrança antes
        do fim do trial.
      </p>
    );
  }
  return (
    <p className="mt-2 text-sm text-slate-600">
      O acesso à tua conta está temporariamente suspenso. Reactiva a
      subscrição para continuar.
    </p>
  );
}
