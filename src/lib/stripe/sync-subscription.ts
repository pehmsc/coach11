import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { getStripeClient } from "@/lib/stripe/client";

export interface SyncResult {
  ok: boolean;
  clubId?: string;
  status?: string;
  error?: string;
}

/**
 * Sincroniza o estado da subscricao Stripe para o clube, a partir de um
 * Checkout Session id. Usado no /billing/success como fallback imediato ao
 * webhook (que pode atrasar ou falhar). Idempotente.
 *
 * Valida que a session pertence ao clube esperado (metadata.coach11_club_id).
 */
export async function syncSubscriptionFromSession(
  admin: SupabaseClient,
  sessionId: string,
): Promise<SyncResult> {
  const stripe = getStripeClient();

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription"],
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "session_retrieve_failed",
    };
  }

  const clubId = session.metadata?.coach11_club_id;
  if (!clubId) {
    return { ok: false, error: "missing_club_id_in_metadata" };
  }

  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id ?? null;

  const subscription = session.subscription;
  if (!subscription || typeof subscription === "string") {
    // Subscricao ainda nao expandida/criada — guardar so o customer e sair.
    if (customerId) {
      await admin
        .from("clubs")
        .update({ stripe_customer_id: customerId })
        .eq("id", clubId);
    }
    return { ok: true, clubId, status: "pending" };
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

  const { error: updErr } = await admin
    .from("clubs")
    .update({
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      subscription_status: subscription.status,
      subscription_current_period_end: periodEnd,
      trial_ends_at: trialEnd,
      subscription_cancel_at_period_end: subscription.cancel_at_period_end,
    })
    .eq("id", clubId);

  if (updErr) {
    return { ok: false, clubId, error: updErr.message };
  }

  return { ok: true, clubId, status: subscription.status };
}
