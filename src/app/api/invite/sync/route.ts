import { createClient } from "@/lib/supabase/server";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import { NextResponse } from "next/server";
import { TECHNICAL_STAFF_LIMIT_ERROR_MESSAGE } from "@/lib/team/technical-staff-limit";

type StaffInviteRow = {
  id: string;
  invite_code: string;
  age_group_id: string;
  role: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  accepted_at: string | null;
  accepted_by: string | null;
};

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    let invite: StaffInviteRow | null = null;

    if (user.email) {
      const latestByEmail = await supabase
        .from("staff_invites")
        .select(
          "id, invite_code, age_group_id, role, email, first_name, last_name, accepted_at, accepted_by",
        )
        .ilike("email", user.email)
        .order("accepted_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!latestByEmail.error && latestByEmail.data) {
        invite = latestByEmail.data as StaffInviteRow;
      }
    }

    if (!invite) {
      const acceptedByUser = await supabase
        .from("staff_invites")
        .select(
          "id, invite_code, age_group_id, role, email, first_name, last_name, accepted_at, accepted_by",
        )
        .eq("accepted_by", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!acceptedByUser.error && acceptedByUser.data) {
        invite = acceptedByUser.data as StaffInviteRow;
      }
    }

    if (!invite) {
      const { data: existingStaff, error: existingStaffError } = await supabase
        .from("age_group_staff")
        .select("id")
        .eq("profile_id", user.id)
        .limit(1)
        .maybeSingle();

      if (existingStaffError) {
        return respondInternalError(
          "api.invite.sync.post.lookup_age_group_staff",
          existingStaffError,
        );
      }

      if (existingStaff) {
        return NextResponse.json({
          success: true,
          linked: true,
          source: "age_group_staff",
        });
      }

      return NextResponse.json({ success: true, linked: false });
    }

    const inviteEmail =
      typeof invite.email === "string" ? invite.email.trim().toLowerCase() : null;
    const userEmail = user.email?.trim().toLowerCase() ?? null;
    if (inviteEmail && userEmail && inviteEmail !== userEmail) {
      return NextResponse.json(
        { error: "O convite encontrado pertence a outro email." },
        { status: 403 },
      );
    }

    const rpcResult = await supabase.rpc("rpc_redeem_staff_invite_auth", {
      p_invite_code: invite.invite_code,
      p_user_email: user.email ?? null,
    });

    if (rpcResult.error) {
      return respondInternalError("api.invite.sync.post.rpc_redeem", rpcResult.error);
    }

    const result =
      rpcResult.data && typeof rpcResult.data === "object"
        ? (rpcResult.data as {
            ok?: boolean;
            error_code?: string;
            already_linked?: boolean;
          })
        : null;

    if (!result?.ok) {
      switch (result?.error_code) {
        case "invite_not_found":
        case "invalid_code":
          return NextResponse.json({ success: true, linked: false });
        case "email_mismatch":
          return NextResponse.json(
            { error: "O convite encontrado pertence a outro email." },
            { status: 403 },
          );
        case "cross_club_forbidden":
        case "cross_age_group_forbidden":
          return NextResponse.json(
            { error: "Esta conta já está associada a outro escalão." },
            { status: 403 },
          );
        case "age_group_not_found":
          return NextResponse.json(
            { error: "Escalão do convite não encontrado." },
            { status: 422 },
          );
        case "technical_staff_limit_reached":
          return NextResponse.json(
            {
              error: `${TECHNICAL_STAFF_LIMIT_ERROR_MESSAGE} O coordenador precisa de libertar a vaga antes de aceitar este convite.`,
            },
            { status: 409 },
          );
        default:
          return NextResponse.json(
            { error: "Não foi possível associar à equipa técnica." },
            { status: 500 },
          );
      }
    }

    if (result.already_linked) {
      const { data: staffLink, error: staffLinkError } = await supabase
        .from("age_group_staff")
        .select("id")
        .eq("profile_id", user.id)
        .limit(1)
        .maybeSingle();

      if (staffLinkError) {
        return respondInternalError("api.invite.sync.post.verify_staff_link", staffLinkError);
      }

      if (!staffLink) {
        return NextResponse.json(
          { error: "Não foi possível associar à equipa técnica." },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({ success: true, linked: true, source: "invite_sync" });
  } catch (error) {
    console.error("Erro ao sincronizar convite:", error);
    return respondInternalError("api.invite.sync.post", error);
  }
}
