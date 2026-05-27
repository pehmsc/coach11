import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeClient } from "@/lib/stripe/client";
import { getCanonicalAppUrl } from "@/lib/config/canonical-app-url";
import { respondInternalError } from "@/lib/http/respond-internal-error";

export const runtime = "nodejs";

/**
 * POST /api/billing/checkout — cria Stripe Checkout Session para o utilizador
 * autenticado subscrever o plano Individual com trial de 7 dias.
 *
 * Pre-requisitos:
 * - User autenticado
 * - User tem clube com plan_type='individual' e sem subscription activa
 *
 * Resposta:
 * - 200 { url: "https://checkout.stripe.com/..." } -> client redireccciona
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
    }

    const priceId = process.env.STRIPE_PRICE_ID_INDIVIDUAL_MONTHLY;
    if (!priceId) {
      return NextResponse.json(
        { error: "Stripe nao configurado (price_id em falta)." },
        { status: 500 },
      );
    }

    // Resolver clube do utilizador (mesmo padrao do /api/club/route.ts)
    const admin = createAdminClient();
    const { data: membership } = await admin
      .from("club_memberships")
      .select("club_id")
      .eq("profile_id", user.id)
      .limit(1)
      .maybeSingle();

    if (!membership?.club_id) {
      return NextResponse.json(
        {
          error:
            "Sem clube associado. Completa o onboarding primeiro.",
          redirect: "/onboarding",
        },
        { status: 400 },
      );
    }

    const { data: club, error: clubErr } = await admin
      .from("clubs")
      .select(
        "id, name, plan_type, tier, stripe_customer_id, stripe_subscription_id, subscription_status",
      )
      .eq("id", membership.club_id)
      .maybeSingle();

    if (clubErr || !club) {
      return NextResponse.json(
        { error: "Clube nao encontrado." },
        { status: 404 },
      );
    }

    if (club.plan_type !== "individual") {
      return NextResponse.json(
        {
          error:
            "Esta conta e sales-led (Clube). Subscricao Stripe nao se aplica.",
        },
        { status: 400 },
      );
    }

    // Bloquear se ja tem subscricao activa
    if (
      club.subscription_status === "trialing" ||
      club.subscription_status === "active" ||
      club.subscription_status === "past_due"
    ) {
      return NextResponse.json(
        {
          error:
            "Ja tens subscricao activa. Gere-a no Portal do cliente.",
        },
        { status: 409 },
      );
    }

    const stripe = getStripeClient();
    const appUrl = getCanonicalAppUrl();

    // Reutiliza customer_id existente (raro mas possivel: user cancelou e
    // re-subscreveu) para nao criar dois customers Stripe para o mesmo user
    const customerArg = club.stripe_customer_id
      ? { customer: club.stripe_customer_id }
      : { customer_email: user.email ?? undefined };

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
      invoice_creation: undefined,
      locale: "pt",
      allow_promotion_codes: true,
      ...customerArg,
      metadata: {
        coach11_club_id: club.id,
        coach11_user_id: user.id,
      },
      success_url: `${appUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/precos?checkout=cancelled`,
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Stripe nao devolveu URL do Checkout." },
        { status: 502 },
      );
    }

    return NextResponse.json({ success: true, url: session.url });
  } catch (error) {
    return respondInternalError("api.billing.checkout.post", error);
  }
}
