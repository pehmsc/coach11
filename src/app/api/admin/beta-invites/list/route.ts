import { NextResponse } from "next/server";
import { getCanonicalAppUrl } from "@/lib/config/canonical-app-url";
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

export async function GET(request: Request) {
  try {
    const access = await getSuperUserAccess();
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const url = new URL(request.url);
    const inviteType = url.searchParams.get("inviteType") || "beta_coordinator";
    const status = url.searchParams.get("status");

    let query = access.admin
      .from("beta_invites")
      .select(
        "id, email, invite_type, target_age_group_id, created_by_profile_id, status, expires_at, accepted_at, revoked_at, metadata, created_at",
      )
      .is("revoked_at", null)
      .order("created_at", { ascending: false })
      .limit(200);

    if (inviteType && inviteType !== "all") {
      query = query.eq("invite_type", inviteType);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { error: "Não foi possível carregar os convites beta." },
        { status: 500 },
      );
    }

    const appUrl = getCanonicalAppUrl();
    const invites = (data || [])
      .map((invite) => ({
        ...invite,
        status: resolveInviteStatus(invite),
        onboardingUrl: `${appUrl}/register?email=${encodeURIComponent(invite.email)}`,
      }))
      .filter((invite) => invite.status !== "revoked")
      .filter((invite) => (status && status !== "all" ? invite.status === status : true));

    return NextResponse.json({
      success: true,
      invites,
    });
  } catch (error) {
    return respondInternalError("api.admin.beta-invites.list.get", error);
  }
}
