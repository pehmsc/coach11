import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeClient } from "@/lib/stripe/client";
import { getCanonicalAppUrl } from "@/lib/config/canonical-app-url";
import { respondInternalError } from "@/lib/http/respond-internal-error";

export const runtime = "nodejs";

/**
 * POST /api/billing/portal — cria Stripe Customer Portal Session para o user
 * autenticado gerir a sua subscricao (cancelar, actualizar pagamento, ver recibos).
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

    const admin = createAdminClient();
    const { data: membership } = await admin
      .from("club_memberships")
      .select("club_id")
      .eq("profile_id", user.id)
      .limit(1)
      .maybeSingle();

    if (!membership?.club_id) {
      return NextResponse.json(
        { error: "Sem clube associado." },
        { status: 400 },
      );
    }

    const { data: club, error: clubErr } = await admin
      .from("clubs")
      .select("id, stripe_customer_id")
      .eq("id", membership.club_id)
      .maybeSingle();

    if (clubErr || !club) {
      return NextResponse.json(
        { error: "Clube nao encontrado." },
        { status: 404 },
      );
    }

    if (!club.stripe_customer_id) {
      return NextResponse.json(
        {
          error:
            "Sem subscricao Stripe. Subscreve primeiro em /precos.",
          redirect: "/precos",
        },
        { status: 400 },
      );
    }

    const stripe = getStripeClient();
    const appUrl = getCanonicalAppUrl();

    const session = await stripe.billingPortal.sessions.create({
      customer: club.stripe_customer_id,
      return_url: `${appUrl}/club?tab=subscricao`,
    });

    return NextResponse.json({ success: true, url: session.url });
  } catch (error) {
    return respondInternalError("api.billing.portal.post", error);
  }
}
