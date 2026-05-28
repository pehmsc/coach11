import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeClient } from "@/lib/stripe/client";
import { getCanonicalAppUrl } from "@/lib/config/canonical-app-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /billing/start — ponto de entrada do flow de subscricao Individual.
 *
 * Decide o destino baseado no estado do utilizador:
 * - Anonimo                     -> /register?plan=individual&next=/billing/start
 * - Logged sem clube            -> /onboarding?next=/billing/start
 * - Clube sales-led             -> /dashboard (nao usa Stripe self-service)
 * - Sem sub activa              -> cria Checkout Session e redirige
 * - Sub trialing/active/past_due-> /settings?tab=subscription (ja subscrito)
 */
export default async function BillingStartPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/register?plan=individual&next=/billing/start");
  }

  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("club_memberships")
    .select("club_id")
    .eq("profile_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership?.club_id) {
    redirect("/onboarding?next=/billing/start");
  }

  const { data: club } = await admin
    .from("clubs")
    .select(
      "id, name, plan_type, stripe_customer_id, subscription_status",
    )
    .eq("id", membership.club_id)
    .maybeSingle();

  if (!club) {
    redirect("/onboarding?next=/billing/start");
  }

  // Sales-led: nao usa Stripe self-service — manda para o dashboard
  if (club.plan_type !== "individual") {
    redirect("/dashboard");
  }

  // Ja subscrito (qualquer estado activo): manda para a subscricao em settings
  if (
    club.subscription_status === "trialing" ||
    club.subscription_status === "active" ||
    club.subscription_status === "past_due"
  ) {
    redirect("/settings?tab=subscription");
  }

  // Sem subscricao ou em estado incompleto: criar Checkout
  const priceId = process.env.STRIPE_PRICE_ID_INDIVIDUAL_MONTHLY;
  if (!priceId) {
    return (
      <ErrorScreen
        title="Configuração em falta"
        message="STRIPE_PRICE_ID_INDIVIDUAL_MONTHLY não está configurado. Contacta o suporte."
      />
    );
  }

  let url: string | null = null;
  try {
    const stripe = getStripeClient();
    const appUrl = getCanonicalAppUrl();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: 7,
        metadata: {
          coach11_club_id: club.id,
          coach11_user_id: user.id,
        },
      },
      payment_method_collection: "always",
      automatic_tax: { enabled: true },
      tax_id_collection: { enabled: true },
      locale: "pt",
      allow_promotion_codes: true,
      ...(club.stripe_customer_id
        ? { customer: club.stripe_customer_id }
        : { customer_email: user.email ?? undefined }),
      metadata: {
        coach11_club_id: club.id,
        coach11_user_id: user.id,
      },
      success_url: `${appUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/precos?checkout=cancelled`,
    });
    url = session.url;
  } catch (err) {
    return (
      <ErrorScreen
        title="Não foi possível iniciar o checkout"
        message={
          err instanceof Error
            ? err.message
            : "Erro ao contactar o Stripe. Tenta de novo em breve."
        }
      />
    );
  }

  if (!url) {
    return (
      <ErrorScreen
        title="Não foi possível iniciar o checkout"
        message="Stripe não devolveu URL. Tenta de novo em breve."
      />
    );
  }

  redirect(url);
}

function ErrorScreen({ title, message }: { title: string; message: string }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-md rounded-2xl border border-rose-200 bg-white p-6 text-center">
        <h1 className="text-lg font-bold text-rose-700">{title}</h1>
        <p className="mt-2 text-sm text-slate-600">{message}</p>
        <a
          href="/precos"
          className="mt-4 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
        >
          Voltar aos preços
        </a>
      </div>
    </div>
  );
}
