import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")?.trim().toUpperCase();

  if (!code || code.length < 4) {
    return NextResponse.json(
      { error: "Código em falta" },
      { status: 400 },
    );
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (error) {
    console.error("[invite/info] Admin client falhou:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }

  const { data: invite, error: dbError } = await admin
    .from("staff_invites")
    .select("role, age_group_id, invited_by, status")
    .eq("invite_code", code)
    .maybeSingle();

  if (dbError || !invite) {
    return NextResponse.json(
      { error: "Convite não encontrado" },
      { status: 404 },
    );
  }

  // Buscar info do escalão e de quem convidou em paralelo
  const [ageGroupRes, inviterRes] = await Promise.all([
    invite.age_group_id
      ? admin
          .from("age_groups")
          .select("name, club_name")
          .eq("id", invite.age_group_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    invite.invited_by
      ? admin
          .from("profiles")
          .select("full_name")
          .eq("id", invite.invited_by)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  return NextResponse.json({
    clubName: ageGroupRes.data?.club_name ?? null,
    ageGroupName: ageGroupRes.data?.name ?? null,
    role: invite.role,
    invitedBy: inviterRes.data?.full_name ?? null,
    status: invite.status,
  });
}
