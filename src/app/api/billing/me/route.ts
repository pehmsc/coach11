import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import type { SubscriptionStatus } from "@/lib/stripe/subscription-status";

export const runtime = "nodejs";

interface ClubBillingResponse {
  plan_type: "individual" | "club";
  subscription_status: SubscriptionStatus | null;
  trial_ends_at: string | null;
  subscription_current_period_end: string | null;
  subscription_cancel_at_period_end: boolean;
  stripe_customer_id: string | null;
}

/**
 * GET /api/billing/me — devolve o estado de subscricao do clube do utilizador.
 * Usado pela tab "Subscricao" em /club para renderizar UI.
 */
export async function GET() {
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
        { status: 404 },
      );
    }

    const { data: club, error: clubErr } = await admin
      .from("clubs")
      .select(
        "plan_type, subscription_status, trial_ends_at, subscription_current_period_end, subscription_cancel_at_period_end, stripe_customer_id",
      )
      .eq("id", membership.club_id)
      .maybeSingle();

    if (clubErr || !club) {
      return NextResponse.json(
        { error: "Clube nao encontrado." },
        { status: 404 },
      );
    }

    const response: ClubBillingResponse = {
      plan_type: club.plan_type === "individual" ? "individual" : "club",
      subscription_status:
        (club.subscription_status as SubscriptionStatus | null) ?? null,
      trial_ends_at: club.trial_ends_at,
      subscription_current_period_end: club.subscription_current_period_end,
      subscription_cancel_at_period_end:
        club.subscription_cancel_at_period_end ?? false,
      stripe_customer_id: club.stripe_customer_id,
    };

    return NextResponse.json({ success: true, club: response });
  } catch (error) {
    return respondInternalError("api.billing.me.get", error);
  }
}
