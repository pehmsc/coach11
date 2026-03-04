import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolvePublicAccessGate } from "@/lib/public-share";
import { respondInternalError } from "@/lib/http/respond-internal-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = {
  params: Promise<Record<string, string | string[] | undefined>>;
};

const NO_STORE_HEADERS = {
  "cache-control": "no-store, max-age=0, s-maxage=0",
};

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const rawParams = await params;
    const segment =
      typeof rawParams.segment === "string" ? rawParams.segment.trim() : "";

    if (!segment) {
      return NextResponse.json(
        { ok: false, error: "invalid_segment" },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    const admin = createAdminClient();
    const gate = await resolvePublicAccessGate(admin, segment, await headers());

    if (gate.status === 404) {
      return NextResponse.json(
        { ok: false, error: "not_found" },
        { status: 404, headers: NO_STORE_HEADERS },
      );
    }

    if (gate.status === 429) {
      return NextResponse.json(
        { ok: false, error: "rate_limited" },
        { status: 429, headers: NO_STORE_HEADERS },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        access: {
          source: gate.access.source,
          identifier: gate.access.identifier,
          ageGroupId: gate.access.ageGroupId,
        },
      },
      {
        status: 200,
        headers: NO_STORE_HEADERS,
      },
    );
  } catch (error) {
    return respondInternalError("public_gate_get_failed", error);
  }
}
