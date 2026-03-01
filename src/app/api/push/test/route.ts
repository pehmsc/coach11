import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import { isWebPushConfiguredOnServer, sendWebPushToUsers } from "@/lib/pwa/web-push-server";

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  try {
    const secret = process.env.PUSH_TEST_SECRET?.trim() || "";
    const providedSecret =
      normalizeString(request.headers.get("x-push-test-secret")) ||
      normalizeString(request.headers.get("x-cron-secret"));

    if (!secret || providedSecret !== secret) {
      return NextResponse.json({ error: "Sem autorização." }, { status: 403 });
    }

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
    const title = normalizeString(body?.title) || "Teste Coach11";
    const bodyText =
      normalizeString(body?.body) || "Esta é uma notificação de teste enviada pela app.";
    const url = normalizeString(body?.url) || "/notifications";
    const type = normalizeString(body?.type) || "message";

    const admin = createAdminClient();
    const result = await sendWebPushToUsers(admin, [user.id], {
      type,
      title,
      body: bodyText,
      url: url.startsWith("/") ? url : "/notifications",
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    return respondInternalError("api.push.test.post", error);
  }
}
