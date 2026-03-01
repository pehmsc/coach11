import { NextResponse } from "next/server";
import { z } from "zod";
import { isBetaAllowed } from "@/lib/auth/beta-access.server";
import { normalizeEmail } from "@/lib/auth/beta-access";
import { respondInternalError } from "@/lib/http/respond-internal-error";

export const runtime = "nodejs";

const CheckSchema = z.object({
  email: z.string().email().max(254),
});

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = CheckSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Email inválido." }, { status: 400 });
    }

    const email = normalizeEmail(parsed.data.email);
    const access = await isBetaAllowed({ email });

    if (access.reason === "lookup_error") {
      console.error("[beta-access.check] lookup failed", {
        emailLower: email,
        reason: access.reason,
      });
    }

    return NextResponse.json({
      allowed: access.allowed,
      reason: access.reason,
    });
  } catch (error) {
    console.error("[beta-access.check] unexpected failure", {
      message: error instanceof Error ? error.message : String(error),
    });
    return respondInternalError("api.auth.beta-access.check.post", error);
  }
}
