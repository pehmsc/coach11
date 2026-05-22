import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { respondInternalError } from "@/lib/http/respond-internal-error";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const admin = createAdminClient();

    // Qualquer membro do clube pode listar os escalões
    const { data: membership } = await admin
      .from("club_memberships")
      .select("club_id")
      .eq("profile_id", user.id)
      .limit(1)
      .maybeSingle();

    if (!membership?.club_id) {
      return NextResponse.json({ error: "Sem acesso ao clube." }, { status: 403 });
    }

    const { data: ageGroups, error } = await admin
      .from("age_groups")
      .select("id, name, football_format")
      .eq("club_id", membership.club_id)
      .order("name");

    if (error) {
      return NextResponse.json({ error: "Erro ao carregar escalões." }, { status: 500 });
    }

    return NextResponse.json({ ageGroups: ageGroups ?? [] });
  } catch (error) {
    return respondInternalError("api.club.age-groups.get", error);
  }
}
