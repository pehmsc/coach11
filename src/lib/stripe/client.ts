import "server-only";

import Stripe from "stripe";

/**
 * Singleton Stripe client. Lazily inicializado para evitar quebrar build
 * quando STRIPE_SECRET_KEY nao esta presente (ex: testes locais sem .env).
 *
 * Sempre que precisares de Stripe API: `const stripe = getStripeClient();`
 * Lanca se a env var estiver em falta — pretendido em runtime.
 */
let _stripe: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (_stripe) return _stripe;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY em falta. Configura no Vercel + .env.local.",
    );
  }

  _stripe = new Stripe(key, {
    // Pin to current stable API version (atualizar com cuidado — breaking changes
    // podem afectar webhook payloads)
    apiVersion: "2026-04-22.dahlia",
    typescript: true,
    appInfo: {
      name: "Coach11",
      version: "1.0.0",
    },
  });

  return _stripe;
}

/** Helper para validar webhook signature. Lanca se webhook secret em falta. */
export function constructStripeWebhookEvent(
  payload: string | Buffer,
  signature: string,
): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET em falta.");
  }
  const stripe = getStripeClient();
  return stripe.webhooks.constructEvent(payload, signature, secret);
}
