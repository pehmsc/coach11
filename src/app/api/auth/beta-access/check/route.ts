import { NextResponse } from "next/server";
import { z } from "zod";
import { isBetaAllowed, normalizeEmail } from "@/lib/auth/beta-access";
import { respondInternalError } from "@/lib/http/respond-internal-error";

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

    return NextResponse.json({
      allowed: access.allowed,
      reason: access.reason,
    });
  } catch (error) {
    return respondInternalError("api.auth.beta-access.check.post", error);
  }
}
