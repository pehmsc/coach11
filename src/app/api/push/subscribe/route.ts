import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import { isWebPushConfiguredOnServer } from "@/lib/pwa/web-push-server";

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    if (!isWebPushConfiguredOnServer()) {
      return NextResponse.json(
        { error: "Web Push não configurado no servidor." },
        { status: 503 },
      );
    }

    const body = await request.json().catch(() => null);
    const endpoint = normalizeString(body?.subscription?.endpoint);
    const p256dh = normalizeString(body?.subscription?.keys?.p256dh);
    const auth = normalizeString(body?.subscription?.keys?.auth);
    const platform = normalizeString(body?.platform);
    const userAgent =
      normalizeString(body?.userAgent) || normalizeString(request.headers.get("user-agent"));

    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json(
        { error: "Subscrição push inválida." },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    const nowIso = new Date().toISOString();
    const { error } = await admin
      .from("push_subscriptions")
      .upsert(
        {
          user_id: user.id,
          endpoint,
          p256dh,
          auth,
          user_agent: userAgent || null,
          platform: platform || null,
          revoked_at: null,
          last_seen_at: nowIso,
        },
        {
          onConflict: "endpoint",
        },
      );

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      endpoint,
    });
  } catch (error) {
    return respondInternalError("api.push.subscribe.post", error);
  }
}
