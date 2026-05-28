import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncSubscriptionFromSession } from "@/lib/stripe/sync-subscription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /billing/success — landing apos Stripe Checkout completar.
 *
 * Faz sync IMEDIATO da subscricao via Stripe API (fallback ao webhook, que
 * pode atrasar ou falhar). Garante que o clube tem subscription_status antes
 * de o utilizador chegar ao dashboard — evita o loop do guard.
 */
export default async function BillingSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;

  let synced = false;
  if (session_id) {
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const admin = createAdminClient();
        const result = await syncSubscriptionFromSession(admin, session_id);
        synced = result.ok && !!result.status && result.status !== "pending";
      }
    } catch {
      // Soft-fail: o webhook acabara por sincronizar; nao bloqueamos a UI
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-md rounded-2xl border border-emerald-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-3xl text-emerald-600">
          ✓
        </div>
        <h1 className="text-xl font-bold">Trial activado!</h1>
        <p className="mt-2 text-sm text-slate-600">
          Tens 7 dias para experimentar o Coach11 — usa à vontade. Cobramos
          €7,99/mês após o trial. Cancela a qualquer momento até lá sem
          pagares nada.
        </p>
        <p className="mt-3 text-xs text-slate-400">
          O recibo será enviado por email pelo Stripe.
        </p>

        <div className="mt-6 flex flex-col gap-2">
          <Link
            href="/dashboard"
            className="rounded-xl bg-emerald-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-emerald-400"
          >
            Ir para o dashboard
          </Link>
          <Link
            href="/settings?tab=subscription"
            className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm hover:bg-slate-50"
          >
            Ver subscrição
          </Link>
        </div>

        {!synced && session_id ? (
          <p className="mt-4 text-xs text-amber-600">
            A subscrição está a ser confirmada. Se o dashboard não abrir,
            aguarda alguns segundos e recarrega.
          </p>
        ) : null}
      </div>
    </div>
  );
}
