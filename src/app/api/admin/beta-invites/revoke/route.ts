import { NextResponse } from "next/server";
import { z } from "zod";
import { getSuperUserAccess } from "@/lib/auth/super-user.server";
import { respondInternalError } from "@/lib/http/respond-internal-error";

export const runtime = "nodejs";

const RevokeInviteSchema = z.object({
  inviteId: z.string().uuid().optional(),
  email: z.string().email().max(254).optional(),
}).refine((value) => !!value.inviteId || !!value.email, {
  message: "É necessário indicar inviteId ou email.",
  path: ["inviteId"],
});

export async function PATCH(request: Request) {
  try {
    const access = await getSuperUserAccess();
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const body = await request.json().catch(() => null);
    const parsed = RevokeInviteSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos.", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const nowIso = new Date().toISOString();
    let query = access.admin
      .from("beta_invites")
      .update({
        status: "revoked",
        revoked_at: nowIso,
      });

    if (parsed.data.inviteId) {
      query = query.eq("id", parsed.data.inviteId);
    } else if (parsed.data.email) {
      query = query.eq("email", parsed.data.email.trim().toLowerCase());
    }

    const { error } = await query;

    if (error) {
      return NextResponse.json(
        { error: "Não foi possível revogar o convite beta." },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return respondInternalError("api.admin.beta-invites.revoke.patch", error);
  }
}
