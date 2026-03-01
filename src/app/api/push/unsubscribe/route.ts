import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondInternalError } from "@/lib/http/respond-internal-error";

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

    const body = await request.json().catch(() => null);
    const endpoint = normalizeString(body?.endpoint);
    if (!endpoint) {
      return NextResponse.json(
        { error: "Endpoint da subscrição em falta." },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    const { error } = await admin
      .from("push_subscriptions")
      .update({
        revoked_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .eq("endpoint", endpoint)
      .is("revoked_at", null);

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      endpoint,
    });
  } catch (error) {
    return respondInternalError("api.push.unsubscribe.post", error);
  }
}
