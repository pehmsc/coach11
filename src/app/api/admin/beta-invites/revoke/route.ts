import { NextResponse } from "next/server";
import { z } from "zod";
import { getSuperUserAccess } from "@/lib/auth/super-user.server";
import { respondInternalError } from "@/lib/http/respond-internal-error";

export const runtime = "nodejs";

function resolveInviteStatus(invite: {
  status: string;
  revoked_at: string | null;
  accepted_at: string | null;
  expires_at: string | null;
}) {
  if (invite.revoked_at || invite.status === "revoked") return "revoked";
  if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
    return "expired";
  }
  if (invite.accepted_at || invite.status === "accepted") return "accepted";
  return "sent";
}

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
      })
      .is("revoked_at", null);

    if (parsed.data.inviteId) {
      query = query.eq("id", parsed.data.inviteId);
    } else if (parsed.data.email) {
      query = query.eq("email", parsed.data.email.trim().toLowerCase());
    }

    const { data, error } = await query
      .select(
        "id, email, invite_type, target_age_group_id, created_by_profile_id, status, expires_at, accepted_at, revoked_at, metadata, created_at",
      )
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: "Não foi possível revogar o convite beta." },
        { status: 500 },
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "Convite já revogado ou não encontrado." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      invite: {
        ...data,
        status: resolveInviteStatus(data),
      },
    });
  } catch (error) {
    return respondInternalError("api.admin.beta-invites.revoke.patch", error);
  }
}
