import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import {
  getPushSubscriptionsSchemaHint,
  isPushSubscriptionsSchemaError,
} from "@/lib/pwa/push-subscriptions-schema";

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

    const { error } = await supabase
      .from("push_subscriptions")
      .update({
        revoked_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .eq("endpoint", endpoint)
      .is("revoked_at", null);

    if (error) {
      if (isPushSubscriptionsSchemaError(error)) {
        return NextResponse.json(
          {
            error: getPushSubscriptionsSchemaHint(),
            code: "push_schema_unavailable",
          },
          { status: 503 },
        );
      }
      throw error;
    }

    const { count, error: countError } = await supabase
      .from("push_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("revoked_at", null);

    if (countError) {
      if (isPushSubscriptionsSchemaError(countError)) {
        return NextResponse.json({
          success: true,
          endpoint,
          active: false,
          activeCount: 0,
        });
      }
      throw countError;
    }

    return NextResponse.json({
      success: true,
      endpoint,
      active: (count ?? 0) > 0,
      activeCount: count ?? 0,
    });
  } catch (error) {
    return respondInternalError("api.push.unsubscribe.post", error);
  }
}
