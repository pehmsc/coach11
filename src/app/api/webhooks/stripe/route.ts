import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { constructStripeWebhookEvent } from "@/lib/stripe/client";
import { respondInternalError } from "@/lib/http/respond-internal-error";

export const runtime = "nodejs";

/**
 * POST /api/webhooks/stripe — handler de eventos Stripe.
 *
 * - Valida assinatura via STRIPE_WEBHOOK_SECRET
 * - Idempotente: regista cada event.id em stripe_webhook_events; duplicados
 *   respondem 200 OK sem re-processar
 * - Devolve sempre 200 OK em condicoes recuperaveis para evitar retries
 *   indesejados; usa 4xx/5xx so quando vale a pena reentregar
 *
 * Eventos tratados:
 * - checkout.session.completed
 * - customer.subscription.created / updated / deleted
 * - invoice.paid
 * - invoice.payment_failed
 */
export async function POST(request: Request) {
  try {
    const signature = request.headers.get("stripe-signature");
    if (!signature) {
      return NextResponse.json(
        { error: "stripe-signature header em falta." },
        { status: 400 },
      );
    }

    const payload = await request.text();
    let event: Stripe.Event;
    try {
      event = constructStripeWebhookEvent(payload, signature);
    } catch (err) {
      return NextResponse.json(
        {
          error: `Assinatura invalida: ${
            err instanceof Error ? err.message : "desconhecido"
          }`,
        },
        { status: 400 },
      );
    }

    const admin = createAdminClient();

    // Idempotencia: evita processar o mesmo event 2x
    const { data: existing } = await admin
      .from("stripe_webhook_events")
      .select("id")
      .eq("id", event.id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ received: true, duplicate: true });
    }

    // Marcar como processado ANTES da logica para garantir idempotencia mesmo
    // que a logica falhe a meio. Se falhar, Sentry alerta mas Stripe nao reenvia.
    await admin.from("stripe_webhook_events").insert({
      id: event.id,
      type: event.type,
      api_version: event.api_version,
      payload: event as unknown as Record<string, unknown>,
    });

    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(
          admin,
          event.data.object as Stripe.Checkout.Session,
        );
        break;

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncSubscription(
          admin,
          event.data.object as Stripe.Subscription,
        );
        break;

      case "invoice.payment_failed":
      case "invoice.paid":
        // Stripe ja muda o subscription.status em paralelo — a sync acontece
        // via customer.subscription.updated. Aqui so logamos.
        break;

      default:
        // Outros eventos: aceitar e ignorar (idempotencia registada)
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    return respondInternalError("api.webhooks.stripe.post", error);
  }
}

type AdminClient = ReturnType<typeof createAdminClient>;

async function handleCheckoutCompleted(
  admin: AdminClient,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const clubId = session.metadata?.coach11_club_id;
  if (!clubId) {
    console.warn("[stripe-webhook] checkout.session.completed sem club_id");
    return;
  }

  const updates: Record<string, unknown> = {};
  if (typeof session.customer === "string") {
    updates.stripe_customer_id = session.customer;
  }
  if (typeof session.subscription === "string") {
    updates.stripe_subscription_id = session.subscription;
  }

  if (Object.keys(updates).length === 0) return;

  await admin.from("clubs").update(updates).eq("id", clubId);
}

async function syncSubscription(
  admin: AdminClient,
  subscription: Stripe.Subscription,
): Promise<void> {
  // Encontrar clube via customer_id ou subscription_id
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  // Procura primeiro por subscription_id (mais especifico); fallback para customer_id
  let clubId: string | null = null;
  const { data: bySub } = await admin
    .from("clubs")
    .select("id")
    .eq("stripe_subscription_id", subscription.id)
    .maybeSingle();
  if (bySub) clubId = bySub.id;

  if (!clubId) {
    const { data: byCustomer } = await admin
      .from("clubs")
      .select("id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    if (byCustomer) clubId = byCustomer.id;
  }

  if (!clubId) {
    console.warn(
      `[stripe-webhook] subscription sync sem clube: sub=${subscription.id}`,
    );
    return;
  }

  const periodEndRaw =
    "current_period_end" in subscription
      ? (subscription as unknown as { current_period_end: number | null })
          .current_period_end
      : null;
  const periodEnd = periodEndRaw
    ? new Date(periodEndRaw * 1000).toISOString()
    : null;
  const trialEnd = subscription.trial_end
    ? new Date(subscription.trial_end * 1000).toISOString()
    : null;

  await admin
    .from("clubs")
    .update({
      stripe_subscription_id: subscription.id,
      stripe_customer_id: customerId,
      subscription_status: subscription.status,
      subscription_current_period_end: periodEnd,
      trial_ends_at: trialEnd,
      subscription_cancel_at_period_end: subscription.cancel_at_period_end,
    })
    .eq("id", clubId);
}
