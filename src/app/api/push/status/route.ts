import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import { isWebPushConfiguredOnServer } from "@/lib/pwa/web-push-server";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const admin = createAdminClient();
    const { count, error } = await admin
      .from("push_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("revoked_at", null);

    if (error) {
      throw error;
    }

    return NextResponse.json(
      {
        success: true,
        enabled: isWebPushConfiguredOnServer(),
        active: (count ?? 0) > 0,
        activeCount: count ?? 0,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    return respondInternalError("api.push.status.get", error);
  }
}
