import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

type InviteByCode = {
  club_name: string | null;
  age_group_name: string | null;
  role: string;
  status: string | null;
  invited_by_name: string | null;
};

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")?.trim().toUpperCase();

  if (!code || code.length < 4) {
    return NextResponse.json(
      { error: "Código em falta" },
      { status: 400 },
    );
  }

  // RPC SECURITY DEFINER estreita: devolve apenas os campos do ecrã de
  // aceitação (sem dados pessoais do convidado), em qualquer status.
  const supabase = await createClient();
  const { data, error: dbError } = await supabase.rpc(
    "get_staff_invite_by_code",
    { p_code: code },
  );

  if (dbError) {
    console.error("[invite/info] Lookup por código falhou:", dbError.message);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }

  const invite = (data ?? null) as InviteByCode | null;

  if (!invite) {
    return NextResponse.json(
      { error: "Convite não encontrado" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    clubName: invite.club_name ?? null,
    ageGroupName: invite.age_group_name ?? null,
    role: invite.role,
    invitedBy: invite.invited_by_name ?? null,
    status: invite.status,
  });
}
